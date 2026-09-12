-- ==============================================================================
-- FIX: Reemplazar cualquier referencia errónea a order_sourcing_items por sourcing_items
-- Garantiza consistencia total en create_admin_test_order y la cola de abastecimiento
-- ==============================================================================

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
    v_profile_rec RECORD;
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

    -- Resolver dirección
    IF p_address_id IS NOT NULL THEN
        SELECT a.*, p.full_name as profile_name, p.phone as profile_phone
        INTO v_address_rec
        FROM public.addresses a
        LEFT JOIN public.profiles p ON p.id = a.user_id
        WHERE a.id = p_address_id;
    END IF;

    IF v_address_rec.id IS NULL THEN
        SELECT a.*, p.full_name as profile_name, p.phone as profile_phone
        INTO v_address_rec
        FROM public.addresses a
        LEFT JOIN public.profiles p ON p.id = a.user_id
        WHERE a.user_id = v_user_id
        ORDER BY a.is_default DESC, a.created_at DESC
        LIMIT 1;
    END IF;

    IF v_address_rec.id IS NOT NULL THEN
        v_address_snapshot := jsonb_build_object(
            'name', COALESCE(v_address_rec.name, v_address_rec.profile_name, 'Admin YA'),
            'phone', COALESCE(v_address_rec.phone, v_address_rec.profile_phone, '600000000'),
            'street', v_address_rec.street,
            'number', v_address_rec.number,
            'floor', v_address_rec.floor_door,
            'floor_door', v_address_rec.floor_door,
            'postalCode', v_address_rec.postal_code,
            'postal_code', v_address_rec.postal_code,
            'city', v_address_rec.city,
            'notes', v_address_rec.notes
        );
    ELSE
        SELECT * INTO v_profile_rec FROM public.profiles WHERE id = v_user_id;
        v_address_snapshot := jsonb_build_object(
            'name', COALESCE(v_profile_rec.full_name, 'Admin YA'),
            'phone', COALESCE(v_profile_rec.phone, '600000000'),
            'street', 'Calle Larga',
            'number', '1',
            'floor', '1º Centro',
            'floor_door', '1º Centro',
            'postalCode', '11403',
            'postal_code', '11403',
            'city', 'Jerez de la Frontera',
            'notes', 'Dirección de prueba generada automáticamente por panel admin'
        );
    END IF;

    SELECT id INTO v_zone_id FROM public.delivery_zones WHERE active = true LIMIT 1;

    -- Procesar items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_is_pack := COALESCE((v_item->>'is_pack')::BOOLEAN, false);
        v_item_qty := COALESCE((v_item->>'quantity')::INT, 1);

        IF v_item_is_pack THEN
            v_item_ref := COALESCE(v_item->>'pack_id', v_item->>'product_id');
            SELECT id, name, price, pack_type INTO v_pack_id, v_pack_name, v_pack_price, v_pack_type
            FROM public.packs WHERE id = v_item_ref::UUID;

            v_chosen_pack_items := '[]'::jsonb;
            v_total_pack_supplements := 0.00;

            IF v_pack_type = 'fixed' THEN
                -- Detectar componentes on_demand en pack fijo
                FOR v_pack_sub_item IN
                    SELECT pi.product_id, pi.quantity, p.name, p.stock_mode
                    FROM public.pack_items pi
                    JOIN public.products p ON p.id = pi.product_id
                    WHERE pi.pack_id = v_pack_id
                LOOP
                    IF v_pack_sub_item.stock_mode = 'on_demand' THEN
                        v_sourcing_queue := v_sourcing_queue || jsonb_build_object(
                            'product_id', v_pack_sub_item.product_id,
                            'product_name', v_pack_sub_item.name,
                            'quantity', v_pack_sub_item.quantity * v_item_qty,
                            'match_key', 'pack_' || v_pack_id::TEXT
                        );
                    END IF;
                    v_chosen_pack_items := v_chosen_pack_items || jsonb_build_object(
                        'product_id', v_pack_sub_item.product_id,
                        'name', v_pack_sub_item.name,
                        'quantity', v_pack_sub_item.quantity
                    );
                END LOOP;
                v_pack_unit_price := COALESCE(v_pack_price, 0.00);
            ELSE
                -- Pack configurable: procesar opciones y suplementos por unidad
                FOR v_pack_group IN
                    SELECT id, name, min_select, max_select
                    FROM public.pack_groups
                    WHERE pack_id = v_pack_id
                    ORDER BY sort_order ASC
                LOOP
                    v_chosen_option_count := 0;
                    FOR v_selection IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'pack_selections', v_item->'selections', '[]'::jsonb))
                    LOOP
                        IF (COALESCE(v_selection->>'group_id', v_selection->>'groupId'))::UUID = v_pack_group.id THEN
                            v_selection_qty := COALESCE((v_selection->>'quantity')::INT, 1);
                            IF v_selection_qty <= 0 THEN
                                v_selection_qty := 1;
                            END IF;
                            v_chosen_option_count := v_chosen_option_count + v_selection_qty;
                            v_chosen_opt_prod_id := (COALESCE(v_selection->>'product_id', v_selection->>'productId'))::UUID;

                            SELECT COALESCE(price_supplement, 0.00)
                            INTO v_chosen_opt_supplement
                            FROM public.pack_group_options
                            WHERE group_id = v_pack_group.id AND product_id = v_chosen_opt_prod_id;

                            v_chosen_opt_supplement := COALESCE(v_chosen_opt_supplement, 0.00);
                            v_total_pack_supplements := v_total_pack_supplements + (v_chosen_opt_supplement * v_selection_qty);

                            SELECT id, name, stock_mode INTO v_chosen_opt_prod
                            FROM public.products WHERE id = v_chosen_opt_prod_id;

                            IF v_chosen_opt_prod.stock_mode = 'on_demand' THEN
                                v_sourcing_queue := v_sourcing_queue || jsonb_build_object(
                                    'product_id', v_chosen_opt_prod.id,
                                    'product_name', v_chosen_opt_prod.name,
                                    'quantity', v_selection_qty * v_item_qty,
                                    'match_key', 'pack_' || v_pack_id::TEXT
                                );
                            END IF;

                            v_chosen_pack_items := v_chosen_pack_items || jsonb_build_object(
                                'group_id', v_pack_group.id,
                                'group_name', v_pack_group.name,
                                'product_id', v_chosen_opt_prod.id,
                                'product_name', v_chosen_opt_prod.name,
                                'quantity', v_selection_qty,
                                'price_supplement', v_chosen_opt_supplement,
                                'total_supplement', (v_chosen_opt_supplement * v_selection_qty)
                            );
                        END IF;
                    END LOOP;
                END LOOP;
                v_pack_unit_price := COALESCE(v_pack_price, 0.00) + v_total_pack_supplements;
            END IF;

            v_line_subtotal := v_pack_unit_price * v_item_qty;
            v_subtotal := v_subtotal + v_line_subtotal;

            v_pack_snapshot := jsonb_build_object(
                'pack_id', v_pack_id,
                'pack_name', v_pack_name,
                'pack_type', v_pack_type,
                'base_price', v_pack_price,
                'unit_price', v_pack_unit_price,
                'supplements_total', v_total_pack_supplements,
                'quantity', v_item_qty,
                'components', v_chosen_pack_items
            );

            v_order_items_to_insert := v_order_items_to_insert || jsonb_build_object(
                'is_pack', true,
                'pack_id', v_pack_id,
                'product_id', NULL,
                'product_name', '[PACK] ' || COALESCE(v_pack_name, 'Pack'),
                'unit_price', v_pack_unit_price,
                'quantity', v_item_qty,
                'subtotal', v_line_subtotal,
                'pack_snapshot', v_pack_snapshot,
                'match_key', 'pack_' || v_pack_id::TEXT
            );
        ELSE
            v_item_ref := v_item->>'product_id';
            v_prod_id := NULL;
            IF v_item_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                SELECT id, name, price, stock_mode INTO v_prod_id, v_prod_name, v_prod_price, v_prod_stock_mode
                FROM public.products WHERE id = v_item_ref::UUID;
            END IF;
            IF v_prod_id IS NULL THEN
                SELECT id, name, price, stock_mode INTO v_prod_id, v_prod_name, v_prod_price, v_prod_stock_mode
                FROM public.products WHERE slug = v_item_ref;
            END IF;

            IF v_prod_id IS NOT NULL THEN
                v_line_subtotal := v_prod_price * v_item_qty;
                v_subtotal := v_subtotal + v_line_subtotal;

                v_order_items_to_insert := v_order_items_to_insert || jsonb_build_object(
                    'is_pack', false,
                    'pack_id', NULL,
                    'product_id', v_prod_id,
                    'product_name', v_prod_name,
                    'unit_price', v_prod_price,
                    'quantity', v_item_qty,
                    'subtotal', v_line_subtotal,
                    'pack_snapshot', NULL,
                    'match_key', 'prod_' || v_prod_id::TEXT
                );

                IF v_prod_stock_mode = 'on_demand' THEN
                    v_sourcing_queue := v_sourcing_queue || jsonb_build_object(
                        'product_id', v_prod_id,
                        'product_name', v_prod_name,
                        'quantity', v_item_qty,
                        'match_key', 'prod_' || v_prod_id::TEXT
                    );
                END IF;
            END IF;
        END IF;
    END LOOP;

    -- Generar número de pedido seguro mediante gen_random_uuid()
    v_order_number := 'TEST-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 4));

    -- Insertar pedido de prueba
    INSERT INTO public.orders (
        order_number,
        user_id,
        address_id,
        delivery_zone_id,
        status,
        subtotal,
        delivery_fee,
        total,
        payment_method,
        payment_status,
        is_test,
        notes,
        delivery_address_snapshot
    ) VALUES (
        v_order_number,
        v_user_id,
        v_address_rec.id,
        v_zone_id,
        'received'::public.order_status,
        v_subtotal,
        0.00,
        0.00,
        'test_order'::public.payment_method_type,
        'paid'::public.payment_status_type,
        true,
        COALESCE(p_notes, 'Pedido de prueba interno (Admin Core)'),
        v_address_snapshot
    )
    RETURNING id INTO v_order_id;

    -- Insertar order_items y sourcing items vinculados a public.sourcing_items
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
            (v_item->>'product_id')::UUID,
            v_item->>'product_name',
            (v_item->>'unit_price')::NUMERIC(10, 2),
            (v_item->>'quantity')::INT,
            (v_item->>'subtotal')::NUMERIC(10, 2),
            (v_item->>'is_pack')::BOOLEAN,
            (v_item->>'pack_id')::UUID,
            v_item->'pack_snapshot'
        )
        RETURNING id INTO v_inserted_item_id;

        -- Vincular con cola de sourcing si aplica
        IF jsonb_array_length(v_sourcing_queue) > 0 THEN
            FOR v_s_item IN SELECT * FROM jsonb_array_elements(v_sourcing_queue)
            LOOP
                IF v_s_item->>'match_key' = v_item->>'match_key' THEN
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

    -- Registrar pago simbólico en payments
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
        'ADMIN-TEST-' || v_order_id,
        'ADMIN-FREE-CAPTURE',
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
