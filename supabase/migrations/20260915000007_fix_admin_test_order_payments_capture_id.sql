-- ==============================================================================
-- YA DELIVERY - MIGRACIÓN: CORRECCIÓN DE PROVIDER_CAPTURE_ID EN PEDIDOS DE PRUEBA
-- Archivo: supabase/migrations/20260915000007_fix_admin_test_order_payments_capture_id.sql
-- 
-- MOTIVO:
-- El índice único 'idx_payments_provider_capture_uniq' sobre (provider, provider_capture_id)
-- rechazaba la creación de pedidos de prueba de admin a partir del segundo intento porque
-- 'provider_capture_id' estaba fijado como la constante literal 'ADMIN-FREE-CAPTURE'.
--
-- SOLUCIÓN:
-- 1. Actualizar registros históricos con 'ADMIN-FREE-CAPTURE' para que usen 'ADMIN-CAPTURE-' || order_id
-- 2. Actualizar la función 'create_admin_test_order' para generar 'ADMIN-CAPTURE-' || v_order_id
--    y garantizar idempotencia con ON CONFLICT (provider, provider_capture_id) DO UPDATE.
-- 3. Mantener INTACTO el índice 'idx_payments_provider_capture_uniq' y todas las reglas de pagos reales.
-- ==============================================================================

-- 1. Migrar registros históricos de prueba que tuvieran el capture_id constante
UPDATE public.payments
SET provider_capture_id = 'ADMIN-CAPTURE-' || order_id::text,
    updated_at = timezone('utc'::text, now())
WHERE provider = 'admin_test'
  AND (provider_capture_id = 'ADMIN-FREE-CAPTURE' OR provider_capture_id IS NULL);

-- 2. Actualizar la función create_admin_test_order
CREATE OR REPLACE FUNCTION public.create_admin_test_order(
    p_address_id UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_notes TEXT DEFAULT NULL
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
    v_order_number TEXT;
    v_order_id UUID;
    
    -- Variables para items y subtotales
    v_subtotal NUMERIC(10, 2) := 0.00;
    v_item JSONB;
    v_item_is_pack BOOLEAN;
    v_item_qty INT;
    v_item_ref TEXT;
    v_prod_id UUID;
    v_prod_name TEXT;
    v_prod_price NUMERIC(10, 2);
    v_line_subtotal NUMERIC(10, 2);
    
    -- Variables para packs
    v_pack_id UUID;
    v_pack_name TEXT;
    v_pack_price NUMERIC(10, 2);
    v_pack_unit_price NUMERIC(10, 2);
    v_pack_type public.pack_type_enum;
    v_pack_snapshot JSONB;
    v_pack_group RECORD;
    v_selection JSONB;
    v_selection_qty INT;
    v_chosen_option_count INT;
    v_chosen_opt_prod_id UUID;
    v_chosen_opt_prod RECORD;
    v_chosen_opt_supplement NUMERIC(10, 2);
    v_total_pack_supplements NUMERIC(10, 2);
    v_chosen_pack_items JSONB;
    
    -- Lista de items a insertar y sourcing
    v_order_items_to_insert JSONB := '[]'::jsonb;
    v_sourcing_queue JSONB := '[]'::jsonb;
    v_s_item JSONB;
    v_inserted_item_id UUID;
    v_valid_payment_method public.payment_method_type;
    v_prod_stock_mode public.stock_mode_type;
    v_pack_sub_item RECORD;
BEGIN
    -- 1. SEGURIDAD ESTRICTA: Solo admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: solo usuarios con rol de administrador pueden crear pedidos de prueba gratuitos.';
    END IF;

    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito de prueba no contiene artículos.';
    END IF;

    -- Resolver dirección de forma segura sin error de registro no asignado
    IF p_address_id IS NOT NULL THEN
        SELECT a.*, p.full_name as profile_name, p.phone as profile_phone
        INTO v_address_rec
        FROM public.addresses a
        LEFT JOIN public.profiles p ON p.id = a.user_id
        WHERE a.id = p_address_id;
    ELSE
        SELECT a.*, p.full_name as profile_name, p.phone as profile_phone
        INTO v_address_rec
        FROM public.addresses a
        LEFT JOIN public.profiles p ON p.id = a.user_id
        WHERE a.user_id = v_user_id
        ORDER BY a.is_default DESC, a.created_at DESC
        LIMIT 1;
    END IF;

    IF v_address_rec IS NOT NULL AND v_address_rec.id IS NOT NULL THEN
        v_address_snapshot := jsonb_build_object(
            'name', COALESCE(v_address_rec.name, v_address_rec.profile_name, 'Admin YA'),
            'phone', COALESCE(v_address_rec.phone, v_address_rec.profile_phone, '600000000'),
            'street', v_address_rec.street,
            'number', v_address_rec.number,
            'floor_door', v_address_rec.floor_door,
            'city', v_address_rec.city,
            'postal_code', v_address_rec.postal_code,
            'notes', v_address_rec.notes
        );
    ELSE
        v_address_snapshot := jsonb_build_object(
            'name', 'Administrador YA',
            'phone', '600000000',
            'street', 'C/ Test Central',
            'number', '1',
            'city', 'Jerez de la Frontera',
            'postal_code', '11402'
        );
    END IF;

    -- Obtener zona de entrega
    SELECT id INTO v_zone_id FROM public.delivery_zones WHERE is_active = true LIMIT 1;

    -- Generar número de pedido único TEST-YYYYMMDD-XXXX
    v_order_number := 'TEST-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(gen_random_uuid()::text from 1 for 4));

    -- Iterar items del carrito de prueba
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_is_pack := COALESCE((v_item->>'is_pack')::BOOLEAN, false);
        v_item_qty := Math_Max_Int(1, COALESCE((v_item->>'quantity')::INT, 1));
        v_item_ref := v_item->>'product_id';

        IF v_item_is_pack THEN
            -- Manejo de Pack
            SELECT id, name, COALESCE(price, 0), pack_type, active
            INTO v_pack_id, v_pack_name, v_pack_price, v_pack_type
            FROM public.packs
            WHERE (id::text = v_item_ref OR slug = v_item_ref) AND active = true;

            IF v_pack_id IS NULL THEN
                RAISE EXCEPTION 'El pack de prueba % no existe o está inactivo.', v_item_ref;
            END IF;

            v_total_pack_supplements := 0.00;
            v_chosen_pack_items := '[]'::jsonb;

            IF v_item ? 'pack_selections' AND jsonb_array_length(v_item->'pack_selections') > 0 THEN
                FOR v_selection IN SELECT * FROM jsonb_array_elements(v_item->'pack_selections')
                LOOP
                    v_chosen_opt_prod_id := NULL;
                    IF v_selection ? 'product_id' AND (v_selection->>'product_id') IS NOT NULL THEN
                        BEGIN
                            v_chosen_opt_prod_id := (v_selection->>'product_id')::UUID;
                        EXCEPTION WHEN OTHERS THEN
                            v_chosen_opt_prod_id := NULL;
                        END;
                    END IF;

                    IF v_chosen_opt_prod_id IS NOT NULL THEN
                        SELECT id, name, price, stock_mode, active
                        INTO v_chosen_opt_prod
                        FROM public.products
                        WHERE id = v_chosen_opt_prod_id;

                        IF v_chosen_opt_prod.id IS NOT NULL THEN
                            v_chosen_opt_supplement := COALESCE((v_selection->>'price_supplement')::NUMERIC, 0.00);
                            v_selection_qty := Math_Max_Int(1, COALESCE((v_selection->>'quantity')::INT, 1));
                            v_total_pack_supplements := v_total_pack_supplements + (v_chosen_opt_supplement * v_selection_qty);

                            v_chosen_pack_items := v_chosen_pack_items || jsonb_build_object(
                                'product_id', v_chosen_opt_prod.id,
                                'product_name', v_chosen_opt_prod.name,
                                'quantity', v_selection_qty,
                                'price_supplement', v_chosen_opt_supplement,
                                'stock_mode', v_chosen_opt_prod.stock_mode
                            );

                            -- Abastecimiento para pack
                            IF v_chosen_opt_prod.stock_mode = 'on_demand' THEN
                                v_sourcing_queue := v_sourcing_queue || jsonb_build_object(
                                    'product_id', v_chosen_opt_prod.id,
                                    'product_name', v_chosen_opt_prod.name,
                                    'quantity', v_selection_qty * v_item_qty,
                                    'is_pack', true,
                                    'pack_id', v_pack_id,
                                    'pack_name', v_pack_name
                                );
                            END IF;
                        END IF;
                    END IF;
                END LOOP;
            END IF;

            v_pack_unit_price := v_pack_price + v_total_pack_supplements;
            v_line_subtotal := v_pack_unit_price * v_item_qty;
            v_subtotal := v_subtotal + v_line_subtotal;

            v_pack_snapshot := jsonb_build_object(
                'pack_id', v_pack_id,
                'pack_name', v_pack_name,
                'pack_type', v_pack_type,
                'base_price', v_pack_price,
                'total_supplements', v_total_pack_supplements,
                'selected_items', v_chosen_pack_items
            );

            v_order_items_to_insert := v_order_items_to_insert || jsonb_build_object(
                'is_pack', true,
                'pack_id', v_pack_id,
                'product_id', NULL,
                'product_name', v_pack_name,
                'unit_price', v_pack_unit_price,
                'quantity', v_item_qty,
                'line_total', v_line_subtotal,
                'pack_snapshot', v_pack_snapshot,
                'pack_items', v_chosen_pack_items
            );
        ELSE
            -- Manejo de Producto Simple
            BEGIN
                v_prod_id := v_item_ref::UUID;
                SELECT id, name, price, stock_mode, active
                INTO v_prod_id, v_prod_name, v_prod_price, v_prod_stock_mode
                FROM public.products
                WHERE id = v_prod_id AND active = true;
            EXCEPTION WHEN OTHERS THEN
                SELECT id, name, price, stock_mode, active
                INTO v_prod_id, v_prod_name, v_prod_price, v_prod_stock_mode
                FROM public.products
                WHERE slug = v_item_ref AND active = true;
            END IF;

            IF v_prod_id IS NULL THEN
                RAISE EXCEPTION 'El producto de prueba % no existe o está inactivo.', v_item_ref;
            END IF;

            v_line_subtotal := v_prod_price * v_item_qty;
            v_subtotal := v_subtotal + v_line_subtotal;

            v_order_items_to_insert := v_order_items_to_insert || jsonb_build_object(
                'is_pack', false,
                'pack_id', NULL,
                'product_id', v_prod_id,
                'product_name', v_prod_name,
                'unit_price', v_prod_price,
                'quantity', v_item_qty,
                'line_total', v_line_subtotal,
                'pack_snapshot', NULL,
                'pack_items', '[]'::jsonb
            );

            -- Abastecimiento bajo demanda
            IF v_prod_stock_mode = 'on_demand' THEN
                v_sourcing_queue := v_sourcing_queue || jsonb_build_object(
                    'product_id', v_prod_id,
                    'product_name', v_prod_name,
                    'quantity', v_item_qty,
                    'is_pack', false,
                    'pack_id', NULL,
                    'pack_name', NULL
                );
            END IF;
        END IF;
    END LOOP;

    -- Validar método de pago para test_order
    v_valid_payment_method := 'test_order'::public.payment_method_type;

    -- 2. INSERTAR PEDIDO
    INSERT INTO public.orders (
        order_number,
        user_id,
        status,
        subtotal,
        delivery_fee,
        discount_total,
        total,
        payment_method,
        payment_status,
        delivery_address_snapshot,
        address_id,
        notes,
        delivery_zone_id,
        is_test,
        created_at,
        updated_at
    ) VALUES (
        v_order_number,
        v_user_id,
        'received',
        v_subtotal,
        0.00,
        v_subtotal,
        0.00,
        v_valid_payment_method,
        'paid',
        v_address_snapshot,
        CASE WHEN v_address_rec IS NOT NULL THEN v_address_rec.id ELSE NULL END,
        COALESCE(p_notes, 'Pedido de prueba Admin (0 €)'),
        v_zone_id,
        true,
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
    ) RETURNING id INTO v_order_id;

    -- 3. INSERTAR LÍNEAS DE PEDIDO
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
            pack_snapshot
        ) VALUES (
            v_order_id,
            CASE WHEN (v_item->>'product_id') IS NOT NULL THEN (v_item->>'product_id')::UUID ELSE NULL END,
            v_item->>'product_name',
            (v_item->>'unit_price')::NUMERIC,
            (v_item->>'quantity')::INT,
            (v_item->>'line_total')::NUMERIC,
            (v_item->>'is_pack')::BOOLEAN,
            CASE WHEN (v_item->>'pack_id') IS NOT NULL THEN (v_item->>'pack_id')::UUID ELSE NULL END,
            v_item->'pack_snapshot'
        ) RETURNING id INTO v_inserted_item_id;

        -- Abastecimiento por línea
        IF jsonb_array_length(v_sourcing_queue) > 0 THEN
            FOR v_s_item IN SELECT * FROM jsonb_array_elements(v_sourcing_queue)
            LOOP
                IF (v_s_item->>'product_id')::UUID = (v_item->>'product_id')::UUID 
                   OR ((v_item->>'is_pack')::BOOLEAN AND (v_s_item->>'pack_id')::UUID = (v_item->>'pack_id')::UUID) THEN
                    INSERT INTO public.sourcing_items (
                        order_id,
                        order_item_id,
                        product_id,
                        product_name,
                        quantity,
                        status,
                        is_test,
                        notes,
                        created_at,
                        updated_at
                    ) VALUES (
                        v_order_id,
                        v_inserted_item_id,
                        (v_s_item->>'product_id')::UUID,
                        v_s_item->>'product_name',
                        (v_s_item->>'quantity')::INT,
                        'pending'::public.sourcing_status,
                        true,
                        'Abastecimiento de prueba generado automáticamente',
                        timezone('utc'::text, now()),
                        timezone('utc'::text, now())
                    )
                    ON CONFLICT (order_id, product_id, COALESCE(order_item_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    -- 4. REGISTRAR PAGO SIMBÓLICO EN PAYMENTS
    -- El provider_capture_id es ÚNICO por pedido ('ADMIN-CAPTURE-' || v_order_id)
    -- Se comprueba existencia previa para garantizar IDEMPOTENCIA total sin violar idx_payments_provider_capture_uniq
    IF NOT EXISTS (SELECT 1 FROM public.payments WHERE order_id = v_order_id) THEN
        INSERT INTO public.payments (
            order_id,
            user_id,
            provider,
            provider_order_id,
            provider_capture_id,
            payment_method,
            status,
            amount,
            currency,
            raw_payload
        ) VALUES (
            v_order_id,
            v_user_id,
            'admin_test',
            'ADMIN-TEST-' || v_order_id::text,
            'ADMIN-CAPTURE-' || v_order_id::text,
            'test_order',
            'paid',
            0.00,
            'EUR',
            jsonb_build_object(
                'mode', 'admin_test_free',
                'created_by', v_user_id,
                'nominal_subtotal', v_subtotal,
                'is_test', true
            )
        );
    ELSE
        UPDATE public.payments
        SET status = 'paid',
            provider_capture_id = 'ADMIN-CAPTURE-' || v_order_id::text,
            updated_at = timezone('utc'::text, now())
        WHERE order_id = v_order_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'total', 0.00,
        'nominal_subtotal', v_subtotal,
        'status', 'received',
        'is_test', true,
        'has_sourcing', (jsonb_array_length(v_sourcing_queue) > 0),
        'items_count', jsonb_array_length(p_items)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_test_order(UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_admin_test_order(UUID, JSONB, TEXT) TO authenticated;
