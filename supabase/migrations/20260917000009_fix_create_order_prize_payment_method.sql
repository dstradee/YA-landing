-- ==============================================================================
-- YA DELIVERY - MIGRACIÓN: CORRECCIÓN PAYMENT_METHOD EN PEDIDOS 100% PREMIO DROPS
-- Archivo: supabase/migrations/20260917000009_fix_create_order_prize_payment_method.sql
-- ==============================================================================

-- Corrige la inserción en public.payments para pedidos con total = 0.00 cubiertos por premio:
-- 1. Utiliza el enum válido v_valid_payment_method ('card', 'paypal', etc.) en vez del literal inexistente 'prize'.
-- 2. Proporciona provider_order_id ('DROPS-' || v_order_id::text).
-- 3. Mantiene la corrección de payment_pending:
--    - Pedido > 0 €  -> status = 'payment_pending', payment_status = 'pending'
--    - Pedido = 0 €  -> status = 'received',        payment_status = 'paid'
-- 4. Mantiene la única firma canónica de 5 parámetros:
--    public.create_order(uuid, jsonb, text, public.payment_method_type, uuid)

CREATE OR REPLACE FUNCTION public.create_order(
    p_address_id UUID,
    p_items JSONB,
    p_notes TEXT DEFAULT NULL,
    p_payment_method public.payment_method_type DEFAULT 'card'::public.payment_method_type,
    p_user_awarded_prize_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_address_rec RECORD;
    v_address_snapshot JSONB;
    v_zone_id UUID;
    v_delivery_fee NUMERIC(10, 2) := 0.00;
    v_standard_delivery_fee NUMERIC(10, 2);
    v_min_order_amount NUMERIC(10, 2) := 0.00;
    v_min_order_enabled BOOLEAN := false;
    v_free_shipping_threshold NUMERIC(10, 2) := 0.00;
    v_free_shipping_enabled BOOLEAN := false;
    v_subtotal NUMERIC(10, 2) := 0.00;
    v_total NUMERIC(10, 2) := 0.00;
    v_total_discounts NUMERIC(10, 2) := 0.00;
    v_order_number TEXT;
    v_order_id UUID;
    
    v_item JSONB;
    v_item_is_pack BOOLEAN;
    v_item_qty INT;
    v_item_ref TEXT;
    v_prod_id UUID;
    v_prod_name TEXT;
    v_prod_price NUMERIC(10, 2);
    v_prod_active BOOLEAN;
    v_prod_stock_mode public.stock_mode_type;
    v_prod_stock_qty INT;
    v_prod_cat_id UUID;
    
    v_line_discount NUMERIC(10, 2) := 0.00;
    v_line_unit_price NUMERIC(10, 2) := 0.00;
    v_line_subtotal NUMERIC(10, 2) := 0.00;
    v_spec_disc RECORD;
    v_cat_disc RECORD;
    
    v_pack_id UUID;
    v_pack_name TEXT;
    v_pack_price NUMERIC(10, 2);
    v_pack_type public.pack_type_enum;
    v_pack_active BOOLEAN;
    v_pack_snapshot JSONB;
    v_pack_sub_item RECORD;
    v_pack_group RECORD;
    v_selection JSONB;
    v_selection_qty INT;
    v_chosen_opt_prod_id UUID;
    v_chosen_opt_prod RECORD;
    v_chosen_opt_supplement NUMERIC(10, 2);
    v_chosen_option_count INT;
    v_chosen_pack_items JSONB;
    v_comp_needed INT;
    v_total_pack_supplements NUMERIC(10, 2);
    
    v_promo RECORD;
    v_calculated_promo_val NUMERIC(10, 2) := 0.00;
    v_best_promo_discount NUMERIC(10, 2) := 0.00;
    v_best_promo_id UUID := NULL;
    v_best_promo_code TEXT := NULL;
    
    v_prize RECORD;
    v_prize_name TEXT := NULL;
    v_prize_discount NUMERIC(10, 2) := 0.00;
    
    v_initial_status public.order_status;
    v_initial_payment_status public.payment_status_type;
    v_valid_payment_method public.payment_method_type;
    
    v_order_items_to_insert JSONB := '[]'::jsonb;
BEGIN
    -- 1. Validar autenticación
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    -- Validar método de pago
    v_valid_payment_method := COALESCE(p_payment_method, 'card'::public.payment_method_type);

    -- 2. Validar que existan artículos
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito no contiene artículos válidos para tramitar el pedido.';
    END IF;

    -- 3. Validar y obtener dirección del usuario
    IF p_address_id IS NULL THEN
        RAISE EXCEPTION 'Debes seleccionar una dirección de entrega.';
    END IF;

    SELECT a.*, p.full_name as profile_name, p.phone as profile_phone
    INTO v_address_rec
    FROM public.addresses a
    LEFT JOIN public.profiles p ON p.id = a.user_id
    WHERE a.id = p_address_id AND a.user_id = v_user_id;

    IF v_address_rec.id IS NULL THEN
        RAISE EXCEPTION 'La dirección seleccionada no es válida o no te pertenece.';
    END IF;

    v_address_snapshot := jsonb_build_object(
        'id', v_address_rec.id,
        'user_id', v_user_id,
        'name', COALESCE(v_address_rec.name, v_address_rec.profile_name, 'Cliente Jerez'),
        'phone', COALESCE(v_address_rec.phone, v_address_rec.profile_phone, ''),
        'street', v_address_rec.street,
        'number', v_address_rec.number,
        'floor_door', v_address_rec.floor_door,
        'postal_code', v_address_rec.postal_code,
        'city', v_address_rec.city,
        'notes', v_address_rec.notes
    );

    -- 4. Obtener zona de entrega activa
    SELECT id, delivery_fee
    INTO v_zone_id, v_delivery_fee
    FROM public.delivery_zones
    WHERE active = true
    ORDER BY created_at ASC
    LIMIT 1;

    -- 5. Cargar ajustes comerciales reales desde public.commercial_settings
    SELECT
        min_order_enabled,
        min_order_amount,
        free_shipping_enabled,
        free_shipping_threshold,
        standard_delivery_fee
    INTO
        v_min_order_enabled,
        v_min_order_amount,
        v_free_shipping_enabled,
        v_free_shipping_threshold,
        v_standard_delivery_fee
    FROM public.commercial_settings
    WHERE id = 'default';

    IF v_standard_delivery_fee IS NOT NULL THEN
        v_delivery_fee := v_standard_delivery_fee;
    END IF;

    -- 6. Procesar items del carrito
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_is_pack := COALESCE((v_item->>'is_pack')::BOOLEAN, false);
        v_item_qty := COALESCE((v_item->>'quantity')::INT, 1);

        IF v_item_qty <= 0 THEN
            RAISE EXCEPTION 'La cantidad de cada artículo debe ser mayor que cero.';
        END IF;

        IF v_item_is_pack THEN
            -- Procesar PACK
            v_item_ref := COALESCE(v_item->>'pack_id', v_item->>'product_id');
            IF v_item_ref IS NULL OR v_item_ref = '' THEN
                RAISE EXCEPTION 'Identificador de pack no válido.';
            END IF;

            SELECT id, name, price, pack_type, active
            INTO v_pack_id, v_pack_name, v_pack_price, v_pack_type, v_pack_active
            FROM public.packs
            WHERE id = v_item_ref::UUID;

            IF v_pack_id IS NULL THEN
                RAISE EXCEPTION 'El pack solicitado ("%") no existe en el catálogo.', v_item_ref;
            END IF;

            IF v_pack_active IS NOT TRUE THEN
                RAISE EXCEPTION 'El pack "%" no está activo actualmente.', v_pack_name;
            END IF;

            v_chosen_pack_items := '[]'::jsonb;
            v_total_pack_supplements := 0.00;

            IF v_pack_type = 'fixed' THEN
                FOR v_pack_sub_item IN
                    SELECT pi.product_id, pi.quantity, p.name, p.active, p.stock_mode, p.stock_quantity
                    FROM public.pack_items pi
                    JOIN public.products p ON p.id = pi.product_id
                    WHERE pi.pack_id = v_pack_id
                LOOP
                    v_comp_needed := v_pack_sub_item.quantity * v_item_qty;
                    IF v_pack_sub_item.active IS NOT TRUE THEN
                        RAISE EXCEPTION 'El componente "%" del pack "%" no está disponible.', v_pack_sub_item.name, v_pack_name;
                    END IF;
                    IF v_pack_sub_item.stock_mode = 'out_of_stock' THEN
                        RAISE EXCEPTION 'El componente "%" del pack "%" está agotado.', v_pack_sub_item.name, v_pack_name;
                    END IF;
                    IF v_pack_sub_item.stock_mode = 'in_stock' AND v_pack_sub_item.stock_quantity < v_comp_needed THEN
                        RAISE EXCEPTION 'Stock insuficiente para el componente "%" del pack "%". Disponibles: %, necesarios: %.',
                            v_pack_sub_item.name, v_pack_name, v_pack_sub_item.stock_quantity, v_comp_needed;
                    END IF;

                    v_chosen_pack_items := v_chosen_pack_items || jsonb_build_object(
                        'product_id', v_pack_sub_item.product_id,
                        'name', v_pack_sub_item.name,
                        'quantity', v_pack_sub_item.quantity,
                        'price_supplement', 0.00
                    );
                END LOOP;
            ELSE
                -- Pack configurable
                FOR v_pack_group IN
                    SELECT * FROM public.pack_groups WHERE pack_id = v_pack_id ORDER BY position ASC
                LOOP
                    v_chosen_option_count := 0;
                    FOR v_selection IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'selections', v_item->'pack_selections', '[]'::jsonb))
                    LOOP
                        IF (v_selection->>'group_id')::UUID = v_pack_group.id THEN
                            v_selection_qty := COALESCE((v_selection->>'quantity')::INT, 1);
                            v_chosen_option_count := v_chosen_option_count + v_selection_qty;
                            v_chosen_opt_prod_id := (v_selection->>'product_id')::UUID;

                            SELECT id, name, active, stock_mode, stock_quantity
                            INTO v_chosen_opt_prod
                            FROM public.products
                            WHERE id = v_chosen_opt_prod_id;

                            IF v_chosen_opt_prod.id IS NULL OR v_chosen_opt_prod.active IS NOT TRUE THEN
                                RAISE EXCEPTION 'Opción no disponible en el grupo "%".', v_pack_group.name;
                            END IF;

                            v_comp_needed := v_selection_qty * v_item_qty;
                            IF v_chosen_opt_prod.stock_mode = 'out_of_stock' THEN
                                RAISE EXCEPTION 'El producto "%" en el pack "%" está agotado.', v_chosen_opt_prod.name, v_pack_name;
                            END IF;
                            IF v_chosen_opt_prod.stock_mode = 'in_stock' AND v_chosen_opt_prod.stock_quantity < v_comp_needed THEN
                                RAISE EXCEPTION 'Stock insuficiente para "%" en el pack "%". Disponibles: %, necesarios: %.',
                                    v_chosen_opt_prod.name, v_pack_name, v_chosen_opt_prod.stock_quantity, v_comp_needed;
                            END IF;

                            SELECT COALESCE(price_supplement, 0.00) INTO v_chosen_opt_supplement
                            FROM public.pack_group_options
                            WHERE group_id = v_pack_group.id AND product_id = v_chosen_opt_prod_id;

                            v_total_pack_supplements := v_total_pack_supplements + (COALESCE(v_chosen_opt_supplement, 0.00) * v_selection_qty);

                            v_chosen_pack_items := v_chosen_pack_items || jsonb_build_object(
                                'group_id', v_pack_group.id,
                                'group_name', v_pack_group.name,
                                'product_id', v_chosen_opt_prod.id,
                                'name', v_chosen_opt_prod.name,
                                'quantity', v_selection_qty,
                                'price_supplement', COALESCE(v_chosen_opt_supplement, 0.00)
                            );
                        END IF;
                    END LOOP;

                    IF v_chosen_option_count < v_pack_group.min_select THEN
                        RAISE EXCEPTION 'Debes seleccionar al menos % opción(es) en el grupo "%".', v_pack_group.min_select, v_pack_group.name;
                    END IF;
                    IF v_chosen_option_count > v_pack_group.max_select THEN
                        RAISE EXCEPTION 'Has superado el máximo permitido de opciones (%) en el grupo "%".', v_pack_group.max_select, v_pack_group.name;
                    END IF;
                END LOOP;
            END IF;

            v_line_unit_price := v_pack_price + v_total_pack_supplements;
            v_line_subtotal := round(v_line_unit_price * v_item_qty, 2);
            v_subtotal := v_subtotal + v_line_subtotal;

            v_pack_snapshot := jsonb_build_object(
                'pack_id', v_pack_id,
                'pack_name', v_pack_name,
                'pack_type', v_pack_type,
                'base_price', v_pack_price,
                'unit_price', v_line_unit_price,
                'supplements', v_total_pack_supplements,
                'items', v_chosen_pack_items
            );

            v_order_items_to_insert := v_order_items_to_insert || jsonb_build_object(
                'is_pack', true,
                'pack_id', v_pack_id,
                'product_id', NULL,
                'product_name', '[PACK] ' || v_pack_name,
                'unit_price', v_line_unit_price,
                'quantity', v_item_qty,
                'subtotal', v_line_subtotal,
                'discount_applied', 0.00,
                'pack_snapshot', v_pack_snapshot
            );
        ELSE
            -- Procesar PRODUCTO INDIVIDUAL
            v_item_ref := v_item->>'product_id';
            IF v_item_ref IS NULL OR v_item_ref = '' THEN
                RAISE EXCEPTION 'Identificador de producto no válido en el carrito.';
            END IF;

            v_prod_id := NULL;
            IF v_item_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                SELECT id, name, price, active, stock_mode, stock_quantity, category_id
                INTO v_prod_id, v_prod_name, v_prod_price, v_prod_active, v_prod_stock_mode, v_prod_stock_qty, v_prod_cat_id
                FROM public.products
                WHERE id = v_item_ref::UUID;
            END IF;

            IF v_prod_id IS NULL THEN
                SELECT id, name, price, active, stock_mode, stock_quantity, category_id
                INTO v_prod_id, v_prod_name, v_prod_price, v_prod_active, v_prod_stock_mode, v_prod_stock_qty, v_prod_cat_id
                FROM public.products
                WHERE slug = v_item_ref;
            END IF;

            IF v_prod_id IS NULL THEN
                RAISE EXCEPTION 'El producto solicitado ("%") ya no existe en el catálogo.', v_item_ref;
            END IF;

            IF v_prod_active IS NOT TRUE THEN
                RAISE EXCEPTION 'El producto "%" no está disponible temporalmente.', v_prod_name;
            END IF;

            IF v_prod_stock_mode = 'out_of_stock' THEN
                RAISE EXCEPTION 'El producto "%" está agotado.', v_prod_name;
            END IF;

            IF v_prod_stock_mode = 'in_stock' AND v_prod_stock_qty < v_item_qty THEN
                RAISE EXCEPTION 'No hay stock suficiente para "%" (disponibles: %).', v_prod_name, v_prod_stock_qty;
            END IF;

            -- Descuentos comerciales
            v_line_unit_price := v_prod_price;
            v_line_discount := 0.00;

            SELECT * INTO v_spec_disc
            FROM public.discounts
            WHERE scope = 'product'
              AND product_id = v_prod_id
              AND active = true
              AND (starts_at IS NULL OR starts_at <= now())
              AND (expires_at IS NULL OR expires_at >= now())
            ORDER BY created_at DESC
            LIMIT 1;

            IF v_spec_disc.id IS NOT NULL THEN
                IF v_spec_disc.discount_type = 'percentage' THEN
                    v_line_discount := round(v_prod_price * (v_spec_disc.discount_value / 100.0), 2);
                ELSE
                    v_line_discount := LEAST(v_prod_price, v_spec_disc.discount_value);
                END IF;
            ELSE
                SELECT * INTO v_cat_disc
                FROM public.discounts
                WHERE scope = 'category'
                  AND category_id = v_prod_cat_id
                  AND active = true
                  AND (starts_at IS NULL OR starts_at <= now())
                  AND (expires_at IS NULL OR expires_at >= now())
                ORDER BY created_at DESC
                LIMIT 1;

                IF v_cat_disc.id IS NOT NULL THEN
                    IF v_cat_disc.discount_type = 'percentage' THEN
                        v_line_discount := round(v_prod_price * (v_cat_disc.discount_value / 100.0), 2);
                    ELSE
                        v_line_discount := LEAST(v_prod_price, v_cat_disc.discount_value);
                    END IF;
                END IF;
            END IF;

            v_line_unit_price := GREATEST(0.00, v_prod_price - v_line_discount);
            v_line_subtotal := round(v_line_unit_price * v_item_qty, 2);
            v_subtotal := v_subtotal + v_line_subtotal;
            v_total_discounts := v_total_discounts + round(v_line_discount * v_item_qty, 2);

            v_order_items_to_insert := v_order_items_to_insert || jsonb_build_object(
                'is_pack', false,
                'pack_id', NULL,
                'product_id', v_prod_id,
                'product_name', v_prod_name,
                'unit_price', v_line_unit_price,
                'quantity', v_item_qty,
                'subtotal', v_line_subtotal,
                'discount_applied', v_line_discount,
                'pack_snapshot', NULL
            );
        END IF;
    END LOOP;

    -- 7. Comprobar Pedido Mínimo
    IF v_min_order_enabled AND v_subtotal < v_min_order_amount THEN
        RAISE EXCEPTION 'El pedido mínimo es de % €.', to_char(v_min_order_amount, 'FM999990.00');
    END IF;

    -- 8. Aplicar Promoción Automática por importe mínimo
    FOR v_promo IN
        SELECT id, code, discount_type, discount_value, minimum_order
        FROM public.promotions
        WHERE active = true
          AND is_automatic = true
          AND (starts_at IS NULL OR starts_at <= now())
          AND (expires_at IS NULL OR expires_at >= now())
          AND minimum_order <= v_subtotal
        ORDER BY minimum_order DESC, created_at DESC
    LOOP
        IF v_promo.discount_type = 'percentage' THEN
            v_calculated_promo_val := round(v_subtotal * (v_promo.discount_value / 100.0), 2);
        ELSE
            v_calculated_promo_val := LEAST(v_subtotal, v_promo.discount_value);
        END IF;

        IF v_calculated_promo_val > v_best_promo_discount THEN
            v_best_promo_discount := v_calculated_promo_val;
            v_best_promo_id := v_promo.id;
            v_best_promo_code := v_promo.code;
        END IF;
    END LOOP;

    -- 9. Comprobar Regla de Envío Gratis
    IF v_free_shipping_enabled AND v_subtotal >= v_free_shipping_threshold THEN
        v_delivery_fee := 0.00;
    END IF;

    -- 10. Aplicar premio Drops V2 si se especificó
    v_prize_discount := 0.00;
    IF p_user_awarded_prize_id IS NOT NULL THEN
        SELECT * INTO v_prize
        FROM public.user_awarded_prizes
        WHERE id = p_user_awarded_prize_id
          AND user_id = v_user_id
          AND status = 'pending'
          AND expires_at >= now();

        IF v_prize.id IS NOT NULL THEN
            v_prize_name := v_prize.prize_name;
            IF v_prize.prize_type = 'percentage_discount' THEN
                v_prize_discount := round(GREATEST(0.00, v_subtotal - v_best_promo_discount) * (v_prize.prize_value / 100.0), 2);
            ELSIF v_prize.prize_type = 'fixed_discount' THEN
                v_prize_discount := LEAST(GREATEST(0.00, v_subtotal - v_best_promo_discount), v_prize.prize_value);
            ELSIF v_prize.prize_type = 'free_order' THEN
                IF v_prize.prize_value > 0 AND v_subtotal > v_prize.prize_value THEN
                    v_prize_discount := v_prize.prize_value;
                ELSE
                    v_prize_discount := GREATEST(0.00, v_subtotal - v_best_promo_discount);
                    v_delivery_fee := 0.00;
                END IF;
            ELSIF v_prize.prize_type = 'free_shipping' THEN
                v_delivery_fee := 0.00;
            END IF;
        END IF;
    END IF;

    -- 11. Calcular total seguro tras promociones y premio
    v_total := round(GREATEST(0.00, v_subtotal - v_best_promo_discount - v_prize_discount) + v_delivery_fee, 2);

    -- Determinar estado inicial del pedido según si quedó cubierto al 100%
    IF v_total = 0.00 THEN
        v_initial_status := 'received'::public.order_status;
        v_initial_payment_status := 'paid'::public.payment_status_type;
    ELSE
        v_initial_status := 'payment_pending'::public.order_status;
        v_initial_payment_status := 'pending'::public.payment_status_type;
    END IF;

    -- 12. Generar número de pedido secuencial único
    v_order_number := 'YA-' || nextval('public.order_number_seq')::TEXT;

    -- 13. Insertar pedido en public.orders
    INSERT INTO public.orders (
        order_number,
        user_id,
        address_id,
        delivery_zone_id,
        status,
        subtotal,
        delivery_fee,
        total,
        discount_total,
        promotion_id,
        promotion_code,
        promotion_discount,
        payment_method,
        payment_status,
        notes,
        delivery_address_snapshot
    ) VALUES (
        v_order_number,
        v_user_id,
        p_address_id,
        v_zone_id,
        v_initial_status,
        v_subtotal,
        v_delivery_fee,
        v_total,
        v_total_discounts + v_prize_discount,
        v_best_promo_id,
        v_best_promo_code,
        v_best_promo_discount + v_prize_discount,
        v_valid_payment_method,
        v_initial_payment_status,
        NULLIF(trim(p_notes), ''),
        v_address_snapshot
    )
    RETURNING id INTO v_order_id;

    -- 14. Insertar líneas en order_items
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_order_items_to_insert)
    LOOP
        INSERT INTO public.order_items (
            order_id,
            product_id,
            product_name,
            unit_price,
            quantity,
            subtotal,
            is_pack,
            pack_id,
            discount_applied,
            pack_snapshot
        ) VALUES (
            v_order_id,
            CASE WHEN (v_item->>'product_id') IS NOT NULL THEN (v_item->>'product_id')::UUID ELSE NULL END,
            v_item->>'product_name',
            (v_item->>'unit_price')::NUMERIC,
            (v_item->>'quantity')::INT,
            (v_item->>'subtotal')::NUMERIC,
            COALESCE((v_item->>'is_pack')::BOOLEAN, false),
            CASE WHEN (v_item->>'pack_id') IS NOT NULL THEN (v_item->>'pack_id')::UUID ELSE NULL END,
            COALESCE((v_item->>'discount_applied')::NUMERIC, 0.00),
            v_item->'pack_snapshot'
        );
    END LOOP;

    -- 15. Marcar premio como usado
    IF p_user_awarded_prize_id IS NOT NULL AND v_prize_name IS NOT NULL THEN
        UPDATE public.user_awarded_prizes
        SET status = 'used',
            used_at = now(),
            used_in_order_id = v_order_id
        WHERE id = p_user_awarded_prize_id
          AND user_id = v_user_id;
    END IF;

    -- 16. Si el pedido es 100% gratuito por el premio, registrar pago y deducir stock de inmediato
    IF v_total = 0.00 THEN
        INSERT INTO public.payments (
            order_id,
            user_id,
            provider,
            provider_order_id,
            payment_method,
            status,
            amount,
            currency,
            raw_payload
        ) VALUES (
            v_order_id,
            v_user_id,
            'drops_prize',
            'DROPS-' || v_order_id::text,
            v_valid_payment_method,
            'paid',
            0.00,
            'EUR',
            jsonb_build_object(
                'prize_id', p_user_awarded_prize_id,
                'prize_name', COALESCE(v_prize_name, 'Premio Drops 100%'),
                'deducted_subtotal', v_subtotal
            )
        );

        -- Deducir stock para este pedido pagado
        PERFORM public.deduct_stock_for_order(v_order_id);
    END IF;

    -- 17. Devolver resultado completo
    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'total', v_total,
        'discount_total', v_total_discounts + v_prize_discount,
        'promotion_discount', v_best_promo_discount + v_prize_discount,
        'promotion_code', COALESCE(v_best_promo_code, v_prize_name),
        'prize_discount', v_prize_discount,
        'is_fully_paid', (v_total = 0.00)
    );
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.create_order(UUID, JSONB, TEXT, public.payment_method_type, UUID) TO authenticated, service_role, anon;

-- Notificar recarga del esquema
NOTIFY pgrst, 'reload schema';
