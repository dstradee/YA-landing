-- ==============================================================================
-- YA - MIGRACIÓN: Función RPC atómica para creación y validación de pedidos reales
-- Archivo: 20260908000002_create_order_rpc.sql
-- ==============================================================================

-- 1. Secuencia para números de pedido legibles y únicos (ej: YA-1001, YA-1002...)
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1001;
GRANT USAGE, SELECT ON SEQUENCE public.order_number_seq TO authenticated;

-- 2. Asegurar que los productos del catálogo inicial existan en public.products
-- (idempotente: respeta productos ya existentes mediante ON CONFLICT slug DO NOTHING)
INSERT INTO public.products (category_id, name, slug, description, image, price, estimated_cost, active, stock_mode, stock_quantity)
SELECT c.id, p.name, p.slug, p.description, p.image, p.price, p.estimated_cost, true, 'in_stock', 100
FROM (
    VALUES
        ('energeticas', 'Red Bull 250 ml', 'red-bull', 'El clásico para aguantar el ritmo.', '⚡', 2.45, 1.42),
        ('energeticas', 'Monster Energy 500 ml', 'monster-energy', 'Energía grande para noches largas.', '🟢', 3.15, 1.83),
        ('bebidas', 'Coca-Cola 2 L', 'coca-cola', 'La de siempre, bien fría.', '🥤', 3.20, 1.86),
        ('bebidas', 'Coca-Cola Zero 2 L', 'coca-cola-zero', 'Todo el sabor, cero azúcar.', '◼', 3.20, 1.86),
        ('bebidas', 'Fanta Naranja 2 L', 'fanta-naranja', 'Naranja y burbujas.', '🍊', 2.95, 1.71),
        ('bebidas', 'Aquarius Limón 1.5 L', 'aquarius-limon', 'Refrescante y ligero.', '🍋', 2.80, 1.62),
        ('bebidas', 'Agua mineral 1.5 L', 'agua-mineral', 'Agua fresca, sin vueltas.', '💧', 1.25, 0.73),
        ('snacks', 'Lays Campesinas', 'lays-campesinas', 'Patatas crujientes de siempre.', '🥔', 2.65, 1.54),
        ('snacks', 'Doritos Tex-Mex', 'doritos-tex-mex', 'Sabor intenso para compartir.', '🔺', 2.85, 1.65),
        ('snacks', 'Pringles Original', 'pringles-original', 'Un tubo, cero migas.', '🥫', 2.95, 1.71),
        ('dulces', 'KitKat 4 fingers', 'kitkat', 'Haz una pausa.', '🍫', 1.75, 1.02),
        ('dulces', 'Oreo Original', 'oreo', 'Galletas para abrir y no parar.', '🍪', 2.60, 1.51),
        ('dulces', 'Mix de gominolas', 'mix-gominolas', 'Una mezcla para todos.', '🍬', 2.40, 1.39),
        ('hielo', 'Bolsa de hielo 2 kg', 'bolsa-hielo', 'Hielo de verdad para tus bebidas.', '🧊', 3.50, 2.03),
        ('comida', 'Pizza individual barbacoa', 'pizza-barbacoa', 'Una pizza individual lista para calentar.', '🍕', 6.90, 4.00),
        ('comida', 'Ramen picante', 'ramen-picante', 'Rápido, caliente y con carácter.', '🍜', 2.55, 1.48),
        ('mas', 'Pilas AA x4', 'pilas-aa', 'Para cuando el mando decide morir.', '🔋', 4.20, 2.44)
) AS p(category_slug, name, slug, description, image, price, estimated_cost)
JOIN public.categories c ON c.slug = p.category_slug
ON CONFLICT (slug) DO NOTHING;

-- 3. Función RPC atómica para crear pedidos con validación estricta de precios
-- y transaccionalidad total (orders + order_items)
CREATE OR REPLACE FUNCTION public.create_order(
    p_address_id UUID,
    p_items JSONB,
    p_notes TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'card'
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

    -- Variables para iterar items
    v_item JSONB;
    v_item_ref TEXT;
    v_item_qty INT;
    v_prod_id UUID;
    v_prod_name TEXT;
    v_prod_price NUMERIC(10, 2);
    v_prod_active BOOLEAN;
    v_prod_stock_mode public.stock_mode_type;
    v_line_subtotal NUMERIC(10, 2);
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

    -- 3. Validar zona de entrega activa y obtener tarifa real
    SELECT id, delivery_fee
    INTO v_zone_id, v_delivery_fee
    FROM public.delivery_zones
    WHERE active = true
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_delivery_fee IS NULL THEN
        v_delivery_fee := 2.90;
    END IF;

    -- 4. Validar método de pago admitido
    BEGIN
        v_valid_payment_method := p_payment_method::public.payment_method_type;
    EXCEPTION WHEN OTHERS THEN
        v_valid_payment_method := 'card'::public.payment_method_type;
    END;

    -- 5. Validar que la lista de productos no esté vacía
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito está vacío. Añade productos antes de pedir.';
    END IF;

    -- 6. Validar cada producto contra public.products de forma segura (sin confiar en el cliente)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_ref := v_item->>'product_id';
        v_item_qty := COALESCE((v_item->>'quantity')::INT, 0);

        IF v_item_ref IS NULL OR v_item_ref = '' THEN
            RAISE EXCEPTION 'Identificador de producto no válido en el carrito.';
        END IF;

        IF v_item_qty <= 0 THEN
            RAISE EXCEPTION 'La cantidad de cada producto debe ser mayor a 0.';
        END IF;

        -- Buscar producto en base de datos: probar por UUID o por slug
        v_prod_id := NULL;
        IF v_item_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            SELECT id, name, price, active, stock_mode
            INTO v_prod_id, v_prod_name, v_prod_price, v_prod_active, v_prod_stock_mode
            FROM public.products
            WHERE id = v_item_ref::UUID;
        END IF;

        IF v_prod_id IS NULL THEN
            SELECT id, name, price, active, stock_mode
            INTO v_prod_id, v_prod_name, v_prod_price, v_prod_active, v_prod_stock_mode
            FROM public.products
            WHERE slug = v_item_ref;
        END IF;

        -- Comprobaciones de existencia y disponibilidad
        IF v_prod_id IS NULL THEN
            RAISE EXCEPTION 'El producto solicitado ("%") ya no existe en el catálogo.', v_item_ref;
        END IF;

        IF v_prod_active IS NOT TRUE THEN
            RAISE EXCEPTION 'El producto "%" no está disponible temporalmente.', v_prod_name;
        END IF;

        IF v_prod_stock_mode = 'out_of_stock' THEN
            RAISE EXCEPTION 'El producto "%" está agotado.', v_prod_name;
        END IF;

        -- Calcular subtotal de línea usando SIEMPRE el precio real de la base de datos
        v_line_subtotal := round(v_prod_price * v_item_qty, 2);
        v_subtotal := v_subtotal + v_line_subtotal;

        -- Acumular datos validados para la inserción
        v_order_items_to_insert := v_order_items_to_insert || jsonb_build_object(
            'product_id', v_prod_id,
            'product_name', v_prod_name,
            'unit_price', v_prod_price,
            'quantity', v_item_qty,
            'subtotal', v_line_subtotal
        );
    END LOOP;

    IF v_subtotal <= 0 THEN
        RAISE EXCEPTION 'El subtotal del pedido no puede ser cero o negativo.';
    END IF;

    -- 7. Calcular total seguro
    v_total := round(v_subtotal + v_delivery_fee, 2);

    -- 8. Generar número de pedido único y legible
    v_order_number := 'YA-' || nextval('public.order_number_seq')::TEXT;

    -- 9. Insertar el pedido en orders (atómico)
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
        v_valid_payment_method,
        'pending',
        NULLIF(trim(p_notes), ''),
        v_address_snapshot
    )
    RETURNING id INTO v_order_id;

    -- 10. Insertar las líneas validadas en order_items
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_order_items_to_insert)
    LOOP
        INSERT INTO public.order_items (
            order_id,
            product_id,
            product_name,
            unit_price,
            quantity,
            subtotal
        ) VALUES (
            v_order_id,
            (v_item->>'product_id')::UUID,
            v_item->>'product_name',
            (v_item->>'unit_price')::NUMERIC,
            (v_item->>'quantity')::INT,
            (v_item->>'subtotal')::NUMERIC
        );
    END LOOP;

    -- 11. Devolver respuesta con información del pedido creado
    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'total', v_total
    );
END;
$$;

-- 4. Permisos de ejecución de la RPC
REVOKE ALL ON FUNCTION public.create_order(UUID, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, JSONB, TEXT, TEXT) TO authenticated;
