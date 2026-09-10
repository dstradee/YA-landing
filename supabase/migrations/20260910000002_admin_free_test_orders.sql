-- ==============================================================================
-- FASE: PEDIDOS DE PRUEBA GRATIS PARA ADMINISTRADORES
-- Permite a usuarios con rol 'admin' crear pedidos de prueba con total 0 €
-- directamente pagados/completados para testing operativo sin pasar por PayPal.
-- ==============================================================================

-- 1. Añadir valor 'test_order' al enum de métodos de pago si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e 
        JOIN pg_type t ON t.oid = e.enumtypid 
        WHERE t.typname = 'payment_method_type' AND e.enumlabel = 'test_order'
    ) THEN
        ALTER TYPE public.payment_method_type ADD VALUE 'test_order';
    END IF;
END $$;

-- 2. Añadir columna is_test a la tabla public.orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_is_test ON public.orders(is_test);

-- 3. RPC SEGURA DE CREACIÓN DE PEDIDO DE PRUEBA (SOLO ADMINS)
-- Comprueba en el motor de base de datos que auth.uid() tiene rol 'admin'.
-- Rechaza inmediatamente a cualquier usuario no administrador.
CREATE OR REPLACE FUNCTION public.create_admin_test_order(
    p_address_id UUID,
    p_items JSONB,
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
    v_pack_type public.pack_type_enum;
    v_pack_snapshot JSONB;
    v_pack_group RECORD;
    v_selection JSONB;
    v_chosen_pack_items JSONB;
    v_chosen_option_count INT;
    v_chosen_opt_prod_id UUID;
    v_chosen_opt_prod RECORD;
    
    -- Lista de items a insertar
    v_order_items_to_insert JSONB := '[]'::jsonb;
    v_inserted_item JSONB;
    v_valid_payment_method public.payment_method_type;
BEGIN
    -- 1. SEGURIDAD ESTRICTA: Verificar que el usuario autenticado es realmente admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: solo usuarios con rol de administrador pueden crear pedidos de prueba gratuitos.';
    END IF;

    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    -- 2. Validar que el array de items no esté vacío
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito de prueba no contiene artículos.';
    END IF;

    -- 3. Resolver dirección de entrega
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
        SELECT full_name, phone INTO v_profile_rec FROM public.profiles WHERE id = v_user_id;
        v_address_snapshot := jsonb_build_object(
            'name', COALESCE(v_profile_rec.full_name, 'Administrador YA (Prueba)'),
            'phone', COALESCE(v_profile_rec.phone, '600000000'),
            'street', 'Calle Larga',
            'number', '1',
            'floor', '1º A',
            'floor_door', '1º A',
            'postalCode', '11401',
            'postal_code', '11401',
            'city', 'Jerez de la Frontera',
            'notes', 'Dirección de prueba de administración'
        );
    END IF;

    -- 4. Resolver zona de entrega
    SELECT id INTO v_zone_id
    FROM public.delivery_zones
    WHERE active = true
    ORDER BY created_at ASC
    LIMIT 1;

    -- 5. Procesar items y packs
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_qty := COALESCE((v_item->>'quantity')::INT, 1);
        IF v_item_qty <= 0 THEN
            RAISE EXCEPTION 'La cantidad de cada producto debe ser mayor a 0.';
        END IF;

        v_item_is_pack := COALESCE((v_item->>'is_pack')::BOOLEAN, false);

        IF v_item_is_pack THEN
            v_item_ref := v_item->>'pack_id';
            IF v_item_ref IS NULL OR v_item_ref = '' THEN
                v_item_ref := v_item->>'product_id';
            END IF;

            v_pack_id := NULL;
            IF v_item_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                SELECT id, name, price, pack_type
                INTO v_pack_id, v_pack_name, v_pack_price, v_pack_type
                FROM public.packs
                WHERE id = v_item_ref::UUID;
            END IF;

            IF v_pack_id IS NULL THEN
                SELECT id, name, price, pack_type
                INTO v_pack_id, v_pack_name, v_pack_price, v_pack_type
                FROM public.packs
                WHERE slug = v_item_ref;
            END IF;

            IF v_pack_id IS NULL THEN
                RAISE EXCEPTION 'El pack "%" no existe en el catálogo.', v_item_ref;
            END IF;

            v_line_subtotal := round(v_pack_price * v_item_qty, 2);
            v_subtotal := v_subtotal + v_line_subtotal;

            v_pack_snapshot := jsonb_build_object(
                'pack_id', v_pack_id,
                'pack_name', v_pack_name,
                'pack_type', v_pack_type,
                'unit_price', v_pack_price
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
            v_item_ref := v_item->>'product_id';
            IF v_item_ref IS NULL OR v_item_ref = '' THEN
                RAISE EXCEPTION 'Identificador de producto no válido en el carrito.';
            END IF;

            v_prod_id := NULL;
            IF v_item_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                SELECT id, name, price
                INTO v_prod_id, v_prod_name, v_prod_price
                FROM public.products
                WHERE id = v_item_ref::UUID;
            END IF;

            IF v_prod_id IS NULL THEN
                SELECT id, name, price
                INTO v_prod_id, v_prod_name, v_prod_price
                FROM public.products
                WHERE slug = v_item_ref;
            END IF;

            IF v_prod_id IS NULL THEN
                RAISE EXCEPTION 'El producto solicitado ("%") no existe en el catálogo.', v_item_ref;
            END IF;

            v_line_subtotal := round(v_prod_price * v_item_qty, 2);
            v_subtotal := v_subtotal + v_line_subtotal;

            v_order_items_to_insert := v_order_items_to_insert || jsonb_build_object(
                'is_pack', false,
                'pack_id', NULL,
                'product_id', v_prod_id,
                'product_name', v_prod_name,
                'unit_price', v_prod_price,
                'quantity', v_item_qty,
                'subtotal', v_line_subtotal,
                'discount_applied', 0.00,
                'pack_snapshot', NULL
            );
        END IF;
    END LOOP;

    -- 6. Generar número de pedido secuencial único
    v_order_number := 'YA-' || nextval('public.order_number_seq')::TEXT;

    -- Determinar método de pago seguro (test_order o card)
    BEGIN
        v_valid_payment_method := 'test_order'::public.payment_method_type;
    EXCEPTION WHEN OTHERS THEN
        v_valid_payment_method := 'card'::public.payment_method_type;
    END;

    -- 7. INSERTAR PEDIDO DE PRUEBA EN public.orders:
    -- Solo columnas reales existentes en orders:
    -- - Estado inicial: 'received'
    -- - Estado de pago: 'paid'
    -- - Total: 0.00 €
    -- - is_test: true
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
        v_subtotal,
        v_valid_payment_method,
        'paid'::public.payment_status_type,
        true,
        NULLIF(trim(p_notes), ''),
        v_address_snapshot
    )
    RETURNING id INTO v_order_id;

    -- 8. Insertar items del pedido
    FOR v_inserted_item IN SELECT * FROM jsonb_array_elements(v_order_items_to_insert)
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
            NULLIF(v_inserted_item->>'product_id', '')::UUID,
            v_inserted_item->>'product_name',
            (v_inserted_item->>'unit_price')::NUMERIC,
            (v_inserted_item->>'quantity')::INT,
            (v_inserted_item->>'subtotal')::NUMERIC,
            COALESCE((v_inserted_item->>'is_pack')::BOOLEAN, false),
            NULLIF(v_inserted_item->>'pack_id', '')::UUID,
            COALESCE((v_inserted_item->>'discount_applied')::NUMERIC, 0.00),
            v_inserted_item->'pack_snapshot'
        );
    END LOOP;

    -- 9. Registrar transacción de pago en public.payments (0.00 € / status: paid)
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
        raw_payload,
        created_at,
        updated_at
    ) VALUES (
        v_order_id,
        v_user_id,
        'admin_test',
        'TEST-ORD-' || v_order_number,
        'TEST-CAP-' || v_order_number,
        'test_order',
        'paid'::public.payment_status_type,
        0.00,
        'EUR',
        jsonb_build_object(
            'is_test', true,
            'admin_id', v_user_id,
            'order_number', v_order_number,
            'reason', 'admin_free_test_order'
        ),
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
    );

    -- 10. Retornar confirmación completa
    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'status', 'received',
        'payment_status', 'paid',
        'is_test', true,
        'subtotal', v_subtotal,
        'total', 0.00
    );
END;
$$;

-- 4. Permisos: SOLO usuarios autenticados (la RPC internamente valida public.is_admin())
REVOKE ALL ON FUNCTION public.create_admin_test_order(UUID, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_admin_test_order(UUID, JSONB, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_admin_test_order(UUID, JSONB, TEXT) TO authenticated;
