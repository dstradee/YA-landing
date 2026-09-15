CREATE OR REPLACE FUNCTION public.create_order(
    p_address_id UUID,
    p_items JSONB,
    p_notes TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'card',
    p_user_awarded_prize_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_address_snapshot JSONB;
    v_zone_id UUID;
    v_delivery_fee NUMERIC(10, 2) := 2.90;
    v_subtotal NUMERIC(10, 2) := 0;
    v_total NUMERIC(10, 2) := 0;
    v_order_number TEXT;
    v_order_id UUID;
    v_valid_payment_method public.payment_method_type;

    -- Configuración comercial
    v_min_order_enabled BOOLEAN := true;
    v_min_order_amount NUMERIC(10, 2) := 10.00;
    v_free_shipping_enabled BOOLEAN := true;
    v_free_shipping_threshold NUMERIC(10, 2) := 30.00;
    v_standard_delivery_fee NUMERIC(10, 2) := 2.90;

    -- Variables para iterar items
    v_item JSONB;
    v_is_pack BOOLEAN := false;
    v_item_ref TEXT;
    v_item_qty INT;
    v_line_unit_price NUMERIC(10, 2);
    v_line_subtotal NUMERIC(10, 2);
    v_line_discount NUMERIC(10, 2) := 0;
    v_total_discounts NUMERIC(10, 2) := 0;

    -- Variables de producto
    v_prod_id UUID;
    v_prod_name TEXT;
    v_prod_price NUMERIC(10, 2);
    v_prod_active BOOLEAN;
    v_prod_stock_mode public.stock_mode_type;
    v_prod_stock_qty INT;
    v_prod_cat_id UUID;

    -- Variables de pack
    v_pack_id UUID;
    v_pack_name TEXT;
    v_pack_price NUMERIC(10, 2);
    v_pack_type public.pack_type_enum;
    v_pack_active BOOLEAN;
    v_pack_snapshot JSONB;
    v_pack_sub_item RECORD;
    v_pack_group RECORD;
    v_selection JSONB;
    v_chosen_option_count INT;
    v_chosen_opt_prod_id UUID;
    v_chosen_opt_prod RECORD;
    v_chosen_pack_items JSONB;

    -- Descuentos aplicables
    v_spec_disc RECORD;
    v_cat_disc RECORD;

    -- Promoción automática
    v_promo RECORD;
    v_best_promo_id UUID := NULL;
    v_best_promo_code TEXT := NULL;
    v_best_promo_discount NUMERIC(10, 2) := 0.00;
    v_calculated_promo_val NUMERIC(10, 2) := 0.00;

    -- Buffer de items validados a insertar
    v_order_items_to_insert JSONB := '[]'::JSONB;
BEGIN
    -- 1. Validar autenticación
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión para crear un pedido.';
    END IF;

    -- 2. Validar que la dirección existe y pertenece al usuario autenticado
    SELECT
        jsonb_build_object(
            'name', a.name,
            'phone', a.phone,
            'street', a.street,
            'number', a.number,
            'floor', a.floor_door,
            'postalCode', a.postal_code,
            'city', a.city,
            'notes', a.notes
        )
    INTO v_address_snapshot
    FROM public.addresses a
    WHERE a.id = p_address_id
      AND a.user_id = v_user_id;

    IF v_address_snapshot IS NULL THEN
        RAISE EXCEPTION 'La dirección seleccionada no es válida o no pertenece a tu cuenta.';
    END IF;

    -- 3. Cargar configuración comercial
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
    ELSE
        -- Fallback a delivery_zones
        SELECT id, delivery_fee INTO v_zone_id, v_delivery_fee
        FROM public.delivery_zones
        WHERE active = true
        ORDER BY created_at ASC
        LIMIT 1;

        IF v_delivery_fee IS NULL THEN
            v_delivery_fee := 2.90;
        END IF;
    END IF;

    -- 4. Validar método de pago admitido
    BEGIN
        v_valid_payment_method := p_payment_method::public.payment_method_type;
    EXCEPTION WHEN OTHERS THEN
        v_valid_payment_method := 'card'::public.payment_method_type;
    END;

    -- 5. Validar que la lista de items no esté vacía
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito está vacío. Añade productos o packs antes de pedir.';
    END IF;

    -- 6. Iterar y validar cada item de forma segura (sin confiar en precios de cliente)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_is_pack := COALESCE((v_item->>'is_pack')::BOOLEAN, false) OR (v_item->>'pack_id' IS NOT NULL);
        v_item_qty := COALESCE((v_item->>'quantity')::INT, 0);

        IF v_item_qty <= 0 THEN
            RAISE EXCEPTION 'La cantidad de cada elemento debe ser mayor a 0.';
        END IF;

        IF v_is_pack THEN
            -- ==========================================================
            -- ITEM ES UN PACK (TIPO A CERRADO O TIPO B CONFIGURABLE)
            -- ==========================================================
            v_item_ref := COALESCE(v_item->>'pack_id', v_item->>'product_id');
            IF v_item_ref IS NULL OR v_item_ref = '' THEN
                RAISE EXCEPTION 'Identificador de pack no válido en el carrito.';
            END IF;

            -- Buscar pack por UUID o slug
            v_pack_id := NULL;
            IF v_item_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                SELECT id, name, price, pack_type, active
                INTO v_pack_id, v_pack_name, v_pack_price, v_pack_type, v_pack_active
                FROM public.packs
                WHERE id = v_item_ref::UUID;
            END IF;

            IF v_pack_id IS NULL THEN
                SELECT id, name, price, pack_type, active
                INTO v_pack_id, v_pack_name, v_pack_price, v_pack_type, v_pack_active
                FROM public.packs
                WHERE slug = v_item_ref;
            END IF;

            IF v_pack_id IS NULL THEN
                RAISE EXCEPTION 'El pack solicitado ("%") no existe en el catálogo.', v_item_ref;
            END IF;

            IF v_pack_active IS NOT TRUE THEN
                RAISE EXCEPTION 'El pack "%" no está disponible temporalmente.', v_pack_name;
            END IF;

            v_chosen_pack_items := '[]'::JSONB;

            IF v_pack_type = 'fixed' THEN
                -- Validar composición de Pack Cerrado y stock real de cada producto componente
                FOR v_pack_sub_item IN
                    SELECT pi.quantity, p.id, p.name, p.active, p.stock_mode, p.stock_quantity
                    FROM public.pack_items pi
                    JOIN public.products p ON p.id = pi.product_id
                    WHERE pi.pack_id = v_pack_id
                LOOP
                    IF v_pack_sub_item.active IS NOT TRUE THEN
                        RAISE EXCEPTION 'El pack "%" no está disponible porque el producto "%" está inactivo.', v_pack_name, v_pack_sub_item.name;
                    END IF;

                    IF v_pack_sub_item.stock_mode = 'out_of_stock' THEN
                        RAISE EXCEPTION 'El pack "%" no está disponible porque el producto "%" está agotado.', v_pack_name, v_pack_sub_item.name;
                    END IF;

                    IF v_pack_sub_item.stock_mode = 'in_stock' AND v_pack_sub_item.stock_quantity < (v_pack_sub_item.quantity * v_item_qty) THEN
                        RAISE EXCEPTION 'El producto "%" del pack "%" no tiene stock suficiente.', v_pack_sub_item.name, v_pack_name;
                    END IF;

                    v_chosen_pack_items := v_chosen_pack_items || jsonb_build_object(
                        'product_id', v_pack_sub_item.id,
                        'product_name', v_pack_sub_item.name,
                        'quantity', v_pack_sub_item.quantity
                    );
                END LOOP;
            ELSE
                -- Validar Pack Configurable: grupos, cantidades mín/máx y opciones elegidas
                FOR v_pack_group IN
                    SELECT id, name, min_select, max_select
                    FROM public.pack_groups
                    WHERE pack_id = v_pack_id
                    ORDER BY sort_order ASC
                LOOP
                    -- Contar cuántas opciones envió el cliente para este grupo
                    v_chosen_option_count := 0;
                    FOR v_selection IN
                        SELECT * FROM jsonb_array_elements(COALESCE(v_item->'selections', '[]'::JSONB))
                    LOOP
                        IF (v_selection->>'groupId' = v_pack_group.id::TEXT) OR (v_selection->>'group_id' = v_pack_group.id::TEXT) THEN
                            v_chosen_option_count := v_chosen_option_count + 1;
                            v_chosen_opt_prod_id := (COALESCE(v_selection->>'productId', v_selection->>'product_id'))::UUID;

                            -- Verificar que el producto pertenece a este grupo
                            IF NOT EXISTS (
                                SELECT 1 FROM public.pack_group_options pgo
                                WHERE pgo.group_id = v_pack_group.id AND pgo.product_id = v_chosen_opt_prod_id
                            ) THEN
                                RAISE EXCEPTION 'Opción no válida para el grupo "%" en el pack "%".', v_pack_group.name, v_pack_name;
                            END IF;

                            -- Verificar stock del producto de la opción
                            SELECT id, name, active, stock_mode, stock_quantity
                            INTO v_chosen_opt_prod
                            FROM public.products
                            WHERE id = v_chosen_opt_prod_id;

                            IF v_chosen_opt_prod.active IS NOT TRUE OR v_chosen_opt_prod.stock_mode = 'out_of_stock' THEN
                                RAISE EXCEPTION 'La opción "%" seleccionada para el pack "%" está agotada.', v_chosen_opt_prod.name, v_pack_name;
                            END IF;

                            v_chosen_pack_items := v_chosen_pack_items || jsonb_build_object(
                                'group_id', v_pack_group.id,
                                'group_name', v_pack_group.name,
                                'product_id', v_chosen_opt_prod.id,
                                'product_name', v_chosen_opt_prod.name
                            );
                        END IF;
                    END LOOP;

                    IF v_chosen_option_count < v_pack_group.min_select THEN
                        RAISE EXCEPTION 'Debes seleccionar al menos % opción/es en "%" para el pack "%".', v_pack_group.min_select, v_pack_group.name, v_pack_name;
                    END IF;

                    IF v_chosen_option_count > v_pack_group.max_select THEN
                        RAISE EXCEPTION 'No puedes seleccionar más de % opción/es en "%" para el pack "%".', v_pack_group.max_select, v_pack_group.name, v_pack_name;
                    END IF;
                END LOOP;
            END IF;

            v_line_unit_price := v_pack_price;
            v_line_subtotal := round(v_pack_price * v_item_qty, 2);
            v_subtotal := v_subtotal + v_line_subtotal;

            v_pack_snapshot := jsonb_build_object(
                'pack_id', v_pack_id,
                'pack_name', v_pack_name,
                'pack_type', v_pack_type,
                'unit_price', v_pack_price,
                'items', v_chosen_pack_items
            );

            v_order_items_to_insert := v_order_items_to_insert || jsonb_build_object(
                'is_pack', true,
                'pack_id', v_pack_id,
                'product_id', NULL,
                'product_name', '[PACK] ' || v_pack_name,
                'unit_price', v_pack_price,
                'quantity', v_item_qty,
                'subtotal', v_line_subtotal,
                'discount_applied', 0.00,
                'pack_snapshot', v_pack_snapshot
            );
        ELSE
            -- ==========================================================
            -- ITEM ES UN PRODUCTO INDIVIDUAL
            -- ==========================================================
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

            -- EVALUACIÓN DETERMINISTA DE DESCUENTOS:
            -- Prioridad 1: Descuento específico de producto
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
                -- Prioridad 2: Descuento de categoría si no hay específico de producto
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

    -- 7. Comprobar Pedido Mínimo si está activo
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


    -- 9.5. Aplicar premio Drops V2 si existe
    DECLARE
        v_prize RECORD;
    BEGIN
        IF p_user_awarded_prize_id IS NOT NULL THEN
            SELECT * INTO v_prize
            FROM public.user_awarded_prizes
            WHERE id = p_user_awarded_prize_id
              AND user_id = v_user_id
              AND status = 'pending'
              AND expires_at >= now();
            
            IF v_prize.id IS NOT NULL THEN
                IF v_prize.prize_type = 'percentage_discount' THEN
                    v_best_promo_discount := GREATEST(v_best_promo_discount, round(v_subtotal * (v_prize.prize_value / 100.0), 2));
                ELSIF v_prize.prize_type = 'fixed_discount' THEN
                    v_best_promo_discount := GREATEST(v_best_promo_discount, v_prize.prize_value);
                ELSIF v_prize.prize_type = 'free_order' THEN
                    IF v_prize.prize_value > 0 AND v_subtotal > v_prize.prize_value THEN
                        v_best_promo_discount := GREATEST(v_best_promo_discount, v_prize.prize_value);
                    ELSE
                        v_best_promo_discount := GREATEST(v_best_promo_discount, v_subtotal);
                        v_delivery_fee := 0.00;
                    END IF;
                ELSIF v_prize.prize_type = 'free_shipping' THEN
                    v_delivery_fee := 0.00;
                END IF;
            END IF;
        END IF;
    END;

    -- 10. Calcular total seguro
    v_total := round(GREATEST(0.00, v_subtotal - v_best_promo_discount) + v_delivery_fee, 2);

    -- 11. Generar número de pedido secuencial único
    v_order_number := 'YA-' || nextval('public.order_number_seq')::TEXT;

    -- 12. Insertar pedido en orders de forma atómica
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
        'received',
        v_subtotal,
        v_delivery_fee,
        v_total,
        v_total_discounts,
        v_best_promo_id,
        v_best_promo_code,
        v_best_promo_discount,
        v_valid_payment_method,
        'pending',
        NULLIF(trim(p_notes), ''),
        v_address_snapshot
    )
    RETURNING id INTO v_order_id;

    -- 13. Insertar líneas en order_items
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


    -- 13.5 Marcar premio como usado
    IF p_user_awarded_prize_id IS NOT NULL THEN
        UPDATE public.user_awarded_prizes
        SET status = 'used',
            used_at = now(),
            used_in_order_id = v_order_id
        WHERE id = p_user_awarded_prize_id
          AND user_id = v_user_id
          AND status = 'pending';
    END IF;

    -- 14. Devolver resultado detallado
    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'total', v_total,
        'discount_total', v_total_discounts,
        'promotion_discount', v_best_promo_discount,
        'promotion_code', v_best_promo_code
    );
END;
$$;

-- Permisos RPC
