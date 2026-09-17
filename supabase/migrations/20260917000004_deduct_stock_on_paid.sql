-- ==============================================================================
-- YA DELIVERY - MIGRACIÓN: DEDUCCIÓN DE STOCK EXCLUSIVAMENTE TRAS PAGO CONFIRMADO
-- Y VALIDACIÓN / DEDUCCIÓN REAL DE PREMIOS DROPS EN CHECKOUT
-- Archivo: supabase/migrations/20260917000004_deduct_stock_on_paid.sql
-- ==============================================================================

-- 1. FUNCIÓN IDEMPOTENTE Y ATÓMICA PARA DEDUCIR STOCK TRAS PAGO
CREATE OR REPLACE FUNCTION public.deduct_stock_for_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_cur_stock INT;
    v_new_stock INT;
    v_has_variants BOOLEAN;
    v_variants JSONB;
    v_updated_variants JSONB;
    v_var_obj JSONB;
    v_pack_items JSONB;
    v_comp JSONB;
    v_comp_id UUID;
    v_comp_qty INT;
    v_comp_stock INT;
    v_comp_new_stock INT;
    v_comp_stock_mode public.stock_mode_type;
    v_deductions_count INT := 0;
BEGIN
    IF p_order_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ID de pedido no proporcionado');
    END IF;

    -- Obtener pedido
    SELECT id, order_number, user_id, payment_status, is_test
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id;

    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pedido no encontrado');
    END IF;

    -- Comprobación estricta de idempotencia: Si ya hay movimientos de tipo 'sale' para este pedido, no volver a deducir
    IF EXISTS (
        SELECT 1 FROM public.stock_movements
        WHERE order_id = p_order_id AND movement_type = 'sale'
    ) THEN
        RETURN jsonb_build_object('success', true, 'already_deducted', true);
    END IF;

    -- Iterar sobre los artículos del pedido
    FOR v_item IN
        SELECT oi.*, p.stock_mode, p.has_variants, p.variants
        FROM public.order_items oi
        LEFT JOIN public.products p ON p.id = oi.product_id
        WHERE oi.order_id = p_order_id
    LOOP
        IF v_item.is_pack IS TRUE OR v_item.pack_id IS NOT NULL THEN
            -- ============================================================
            -- ARTÍCULO ES UN PACK: deducir stock de cada componente
            -- ============================================================
            v_pack_items := NULL;
            IF v_item.pack_snapshot IS NOT NULL AND v_item.pack_snapshot->'items' IS NOT NULL THEN
                v_pack_items := v_item.pack_snapshot->'items';
            END IF;

            IF v_pack_items IS NOT NULL AND jsonb_array_length(v_pack_items) > 0 THEN
                FOR v_comp IN SELECT * FROM jsonb_array_elements(v_pack_items)
                LOOP
                    v_comp_id := (v_comp->>'product_id')::UUID;
                    v_comp_qty := COALESCE((v_comp->>'quantity')::INT, 1) * v_item.quantity;

                    IF v_comp_id IS NOT NULL THEN
                        SELECT stock_quantity, stock_mode
                        INTO v_comp_stock, v_comp_stock_mode
                        FROM public.products
                        WHERE id = v_comp_id
                        FOR UPDATE;

                        IF FOUND THEN
                            v_comp_new_stock := GREATEST(0, COALESCE(v_comp_stock, 0) - v_comp_qty);

                            UPDATE public.products
                            SET stock_quantity = v_comp_new_stock,
                                stock_mode = CASE
                                    WHEN v_comp_new_stock = 0 AND stock_mode = 'in_stock' THEN 'out_of_stock'::public.stock_mode_type
                                    ELSE stock_mode
                                END,
                                updated_at = timezone('utc'::text, now())
                            WHERE id = v_comp_id;

                            INSERT INTO public.stock_movements (
                                product_id,
                                movement_type,
                                quantity,
                                previous_stock,
                                new_stock,
                                order_id,
                                reason,
                                created_by
                            ) VALUES (
                                v_comp_id,
                                'sale'::public.stock_movement_type,
                                -v_comp_qty,
                                v_comp_stock,
                                v_comp_new_stock,
                                p_order_id,
                                'Venta componente de pack en pedido #' || v_order.order_number,
                                v_order.user_id
                            );

                            v_deductions_count := v_deductions_count + 1;
                        END IF;
                    END IF;
                END LOOP;
            END IF;
        ELSE
            -- ============================================================
            -- ARTÍCULO ES UN PRODUCTO INDIVIDUAL
            -- ============================================================
            IF v_item.product_id IS NOT NULL THEN
                SELECT stock_quantity, stock_mode, has_variants, variants
                INTO v_cur_stock, v_comp_stock_mode, v_has_variants, v_variants
                FROM public.products
                WHERE id = v_item.product_id
                FOR UPDATE;

                IF FOUND THEN
                    v_new_stock := GREATEST(0, COALESCE(v_cur_stock, 0) - v_item.quantity);

                    -- Si tiene variantes, actualizar el stock de la variante coincidente si procede
                    v_updated_variants := v_variants;
                    IF v_has_variants IS TRUE AND v_variants IS NOT NULL AND jsonb_typeof(v_variants) = 'array' THEN
                        v_updated_variants := '[]'::jsonb;
                        FOR v_var_obj IN SELECT * FROM jsonb_array_elements(v_variants)
                        LOOP
                            IF position(lower(v_var_obj->>'name') IN lower(v_item.product_name)) > 0 THEN
                                v_updated_variants := v_updated_variants || jsonb_build_object(
                                    'id', v_var_obj->>'id',
                                    'name', v_var_obj->>'name',
                                    'price', (v_var_obj->>'price')::NUMERIC,
                                    'stock', GREATEST(0, COALESCE((v_var_obj->>'stock')::INT, 0) - v_item.quantity),
                                    'active', (v_var_obj->>'active')::BOOLEAN,
                                    'image', v_var_obj->>'image'
                                );
                            ELSE
                                v_updated_variants := v_updated_variants || v_var_obj;
                            END IF;
                        END LOOP;
                    END IF;

                    UPDATE public.products
                    SET stock_quantity = v_new_stock,
                        variants = COALESCE(v_updated_variants, variants),
                        stock_mode = CASE
                            WHEN v_new_stock = 0 AND stock_mode = 'in_stock' THEN 'out_of_stock'::public.stock_mode_type
                            ELSE stock_mode
                        END,
                        updated_at = timezone('utc'::text, now())
                    WHERE id = v_item.product_id;

                    INSERT INTO public.stock_movements (
                        product_id,
                        movement_type,
                        quantity,
                        previous_stock,
                        new_stock,
                        order_id,
                        reason,
                        created_by
                    ) VALUES (
                        v_item.product_id,
                        'sale'::public.stock_movement_type,
                        -v_item.quantity,
                        v_cur_stock,
                        v_new_stock,
                        p_order_id,
                        'Venta confirmada por pago en pedido #' || v_order.order_number,
                        v_order.user_id
                    );

                    v_deductions_count := v_deductions_count + 1;
                END IF;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'deductions_count', v_deductions_count
    );
END;
$$;

-- 2. DISPARADOR (TRIGGER) PARA DEDUCIR STOCK INMEDIATAMENTE AL PASAR EL PEDIDO A 'paid'
CREATE OR REPLACE FUNCTION public.trg_fn_order_paid_deduct_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.payment_status = 'paid' AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM 'paid') THEN
        PERFORM public.deduct_stock_for_order(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_paid_deduct_stock ON public.orders;
CREATE TRIGGER trg_order_paid_deduct_stock
AFTER UPDATE OF payment_status ON public.orders
FOR EACH ROW
WHEN (NEW.payment_status = 'paid' AND (OLD.payment_status IS DISTINCT FROM 'paid'))
EXECUTE FUNCTION public.trg_fn_order_paid_deduct_stock();

DROP TRIGGER IF EXISTS trg_order_insert_paid_deduct_stock ON public.orders;
CREATE TRIGGER trg_order_insert_paid_deduct_stock
AFTER INSERT ON public.orders
FOR EACH ROW
WHEN (NEW.payment_status = 'paid')
EXECUTE FUNCTION public.trg_fn_order_paid_deduct_stock();


-- 3. ACTUALIZACIÓN DEL RPC CREATE_ORDER:
-- - Valida stock pero NO descuenta hasta que el pedido esté pagado
-- - Aplica de forma real y segura el descuento del premio Drops V2
-- - Si el total es 0 € (pedido gratis), se marca de inmediato como 'paid' y deduce el stock
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
    SELECT id, delivery_fee, min_order_amount
    INTO v_zone_id, v_delivery_fee, v_min_order_amount
    FROM public.delivery_zones
    WHERE active = true
    LIMIT 1;

    IF v_zone_id IS NULL THEN
        v_delivery_fee := 1.99;
        v_min_order_amount := 5.00;
    END IF;

    -- 5. Cargar ajustes comerciales
    SELECT
        COALESCE((SELECT value::numeric FROM public.app_settings WHERE key = 'min_order_amount'), v_min_order_amount),
        COALESCE((SELECT value::boolean FROM public.app_settings WHERE key = 'min_order_enabled'), true),
        COALESCE((SELECT value::numeric FROM public.app_settings WHERE key = 'free_shipping_threshold'), 20.00),
        COALESCE((SELECT value::boolean FROM public.app_settings WHERE key = 'free_shipping_enabled'), true)
    INTO v_min_order_amount, v_min_order_enabled, v_free_shipping_threshold, v_free_shipping_enabled;

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
        v_initial_status := 'received'::public.order_status;
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
    IF p_user_awarded_prize_id IS NOT NULL AND v_prize.id IS NOT NULL THEN
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
            payment_method,
            status,
            amount,
            currency,
            raw_payload
        ) VALUES (
            v_order_id,
            v_user_id,
            'drops_prize',
            'prize',
            'paid',
            0.00,
            'EUR',
            jsonb_build_object(
                'prize_id', p_user_awarded_prize_id,
                'prize_name', COALESCE(v_prize.prize_name, 'Premio Drops 100%'),
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
        'promotion_code', COALESCE(v_best_promo_code, v_prize.prize_name),
        'prize_discount', v_prize_discount,
        'is_fully_paid', (v_total = 0.00)
    );
END;
$$;

-- Sobrecarga compatible de 4 parámetros para llamadas legacy
CREATE OR REPLACE FUNCTION public.create_order(
    p_address_id UUID,
    p_items JSONB,
    p_notes TEXT DEFAULT NULL,
    p_payment_method public.payment_method_type DEFAULT 'card'::public.payment_method_type
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.create_order(p_address_id, p_items, p_notes, p_payment_method, NULL);
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.deduct_stock_for_order(UUID) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, JSONB, TEXT, public.payment_method_type, UUID) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, JSONB, TEXT, public.payment_method_type) TO authenticated, service_role, anon;

-- Notificar recarga del esquema
NOTIFY pgrst, 'reload schema';
