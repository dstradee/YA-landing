-- ==============================================================================
-- YA DELIVERY — MIGRACIÓN FASE 3C.1: FLUJO payment_pending, IDEMPOTENCIA Y SEGURIDAD OPERATIVA
-- Archivo: supabase/migrations/20260909000001_phase3c1_payment_pending_transition.sql
-- ==============================================================================
-- INSTRUCCIONES DE EJECUCIÓN MANUAL EN SUPABASE SQL EDITOR:
-- 1. Ejecutar la SECCIÓN A (ALTER TYPE) en una consulta INDEPENDIENTE.
--    PostgreSQL prohíbe ejecutar 'ALTER TYPE ... ADD VALUE' dentro de bloques de transacción.
-- 2. Ejecutar la SECCIÓN B (Índices únicos de idempotencia) a continuación.
-- 3. Ejecutar la SECCIÓN C (Funciones RPC y Reglas) a continuación.
-- ==============================================================================

-- ==============================================================================
-- SECCIÓN A: ENUMS REALES DEL ESQUEMA (Ejecutar en consulta independiente sin BEGIN...COMMIT)
-- ==============================================================================

-- 1. Enum real de orders.status: public.order_status
-- Añade 'payment_pending' antes de 'received' solo si no existe
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'payment_pending' BEFORE 'received';

-- 2. Enum real de orders.payment_method: public.payment_method_type
-- Añade 'paypal' a métodos de pago solo si no existe
ALTER TYPE public.payment_method_type ADD VALUE IF NOT EXISTS 'paypal';

-- NOTA: El enum real de orders.payment_status es public.payment_status_type ('pending', 'authorized', 'paid', 'failed', 'refunded').
-- Conforme a las directrices de seguridad, NO se añade 'cancelled' a payment_status_type.
-- Para cancelaciones sin pago se utiliza orders.status = 'cancelled' manteniendo payment_status = 'pending'.


-- ==============================================================================
-- SECCIÓN B: ÍNDICES DE IDEMPOTENCIA REAL PARA public.payments Y public.orders
-- ==============================================================================

-- 1. Evitar que un mismo Capture ID de PayPal pueda registrarse dos veces o asociarse a dos pedidos
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_capture_uniq 
ON public.payments (provider, provider_capture_id) 
WHERE provider_capture_id IS NOT NULL AND provider_capture_id <> '';

-- 2. Garantizar que un pedido solo tenga una transacción marcada como 'paid'
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order_paid_uniq
ON public.payments (order_id)
WHERE status = 'paid';


-- ==============================================================================
-- SECCIÓN C: FUNCIONES Y PROCEDIMIENTOS DE CONTROL ATÓMICO (RPCs)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RPC: create_order (Inicializa estrictamente en payment_pending y pending)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order(
    p_address_id UUID,
    p_items JSONB,
    p_notes TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'paypal'
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
    v_best_item_discount NUMERIC(10, 2) := 0;
    v_calculated_discount NUMERIC(10, 2) := 0;

    -- Promociones de orden
    v_promo RECORD;
    v_best_promo_discount NUMERIC(10, 2) := 0;
    v_best_promo_id UUID := NULL;
    v_best_promo_code TEXT := NULL;
    v_calculated_promo_val NUMERIC(10, 2) := 0;

    -- Colección temporal para items validados
    v_order_items_to_insert JSONB := '[]'::jsonb;
BEGIN
    -- 1. Validar autenticación
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión para realizar un pedido en YA Delivery.';
    END IF;

    -- 2. Validar dirección y capturar snapshot inmutable
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

    -- 3. Cargar configuración de delivery zone y costes
    SELECT id, delivery_fee
    INTO v_zone_id, v_delivery_fee
    FROM public.delivery_zones
    WHERE active = true
    ORDER BY created_at ASC
    LIMIT 1;

    SELECT
        min_order_enabled, min_order_amount,
        free_shipping_enabled, free_shipping_threshold,
        standard_delivery_fee
    INTO
        v_min_order_enabled, v_min_order_amount,
        v_free_shipping_enabled, v_free_shipping_threshold,
        v_standard_delivery_fee
    FROM public.commercial_settings
    WHERE id = 'default';

    IF v_standard_delivery_fee IS NOT NULL THEN
        v_delivery_fee := v_standard_delivery_fee;
    ELSIF v_delivery_fee IS NULL THEN
        v_delivery_fee := 2.90;
    END IF;

    -- 4. Validar método de pago (operativamente solo 'paypal' o 'card')
    BEGIN
        v_valid_payment_method := p_payment_method::public.payment_method_type;
    EXCEPTION WHEN OTHERS THEN
        v_valid_payment_method := 'paypal'::public.payment_method_type;
    END;

    IF v_valid_payment_method NOT IN ('paypal'::public.payment_method_type, 'card'::public.payment_method_type) THEN
        RAISE EXCEPTION 'Método de pago no operativo en YA Delivery. Selecciona PayPal o Tarjeta.';
    END IF;

    -- 5. Validar que el carrito no esté vacío
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito está vacío. Añade productos antes de tramitar el pedido.';
    END IF;

    -- 6. Procesar cada item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_is_pack := COALESCE((v_item->>'is_pack')::BOOLEAN, false);
        v_item_qty := COALESCE((v_item->>'quantity')::INT, 0);

        IF v_item_qty <= 0 THEN
            RAISE EXCEPTION 'La cantidad de cada producto debe ser mayor a 0.';
        END IF;

        IF v_is_pack THEN
            v_item_ref := v_item->>'pack_id';
            IF v_item_ref IS NULL OR v_item_ref = '' THEN
                RAISE EXCEPTION 'Identificador de pack no válido en el pedido.';
            END IF;

            SELECT id, name, price, pack_type, active
            INTO v_pack_id, v_pack_name, v_pack_price, v_pack_type, v_pack_active
            FROM public.packs
            WHERE id = v_item_ref::UUID;

            IF v_pack_id IS NULL OR v_pack_active IS NOT TRUE THEN
                RAISE EXCEPTION 'El pack seleccionado ("%") no está disponible.', COALESCE(v_pack_name, v_item_ref);
            END IF;

            v_chosen_pack_items := '[]'::jsonb;

            IF v_pack_type = 'fixed' THEN
                FOR v_pack_sub_item IN
                    SELECT pi.product_id, pi.quantity, p.name, p.active, p.stock_mode, p.stock_quantity
                    FROM public.pack_items pi
                    JOIN public.products p ON p.id = pi.product_id
                    WHERE pi.pack_id = v_pack_id
                LOOP
                    IF v_pack_sub_item.active IS NOT TRUE OR v_pack_sub_item.stock_mode = 'out_of_stock' THEN
                        RAISE EXCEPTION 'Uno de los productos del pack ("%") está agotado.', v_pack_sub_item.name;
                    END IF;
                    v_chosen_pack_items := v_chosen_pack_items || jsonb_build_object(
                        'product_id', v_pack_sub_item.product_id,
                        'name', v_pack_sub_item.name,
                        'quantity', v_pack_sub_item.quantity
                    );
                END LOOP;
            ELSE
                FOR v_pack_group IN
                    SELECT id, name, min_select, max_select
                    FROM public.pack_groups
                    WHERE pack_id = v_pack_id
                    ORDER BY sort_order ASC
                LOOP
                    v_chosen_option_count := 0;
                    FOR v_selection IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'pack_selections', '[]'::jsonb))
                    LOOP
                        IF (v_selection->>'group_id')::UUID = v_pack_group.id THEN
                            v_chosen_option_count := v_chosen_option_count + 1;
                            v_chosen_opt_prod_id := (v_selection->>'product_id')::UUID;

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
            -- Item producto individual
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
                RAISE EXCEPTION 'El producto solicitado ("%") no existe en el catálogo.', v_item_ref;
            END IF;

            IF v_prod_active IS NOT TRUE THEN
                RAISE EXCEPTION 'El producto "%" no está disponible temporalmente.', v_prod_name;
            END IF;

            IF v_prod_stock_mode = 'out_of_stock' THEN
                RAISE EXCEPTION 'El producto "%" está agotado actualmente.', v_prod_name;
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

    -- 7. Comprobar pedido mínimo comercial
    IF v_min_order_enabled AND v_subtotal < v_min_order_amount THEN
        RAISE EXCEPTION 'El subtotal del pedido (% €) no alcanza el pedido mínimo configurado (% €).', v_subtotal, v_min_order_amount;
    END IF;

    -- 8. Comprobar promociones de pedido global
    FOR v_promo IN
        SELECT id, code, discount_type, discount_value
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

    -- 9. Comprobar regla de envío gratis
    IF v_free_shipping_enabled AND v_subtotal >= v_free_shipping_threshold THEN
        v_delivery_fee := 0.00;
    END IF;

    -- 10. Calcular total seguro
    v_total := round(GREATEST(0.00, v_subtotal - v_best_promo_discount) + v_delivery_fee, 2);

    -- 11. Generar número de pedido secuencial único
    v_order_number := 'YA-' || nextval('public.order_number_seq')::TEXT;

    -- 12. INSERTAR PEDIDO ESTRICTAMENTE EN ESTADO 'payment_pending' Y payment_status 'pending'
    -- Ningún pedido puede nacer directamente en 'received' desde el checkout
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
        payment_provider,
        notes,
        delivery_address_snapshot
    ) VALUES (
        v_order_number,
        v_user_id,
        p_address_id,
        v_zone_id,
        'payment_pending'::public.order_status,
        v_subtotal,
        v_delivery_fee,
        v_total,
        v_total_discounts,
        v_best_promo_id,
        v_best_promo_code,
        v_best_promo_discount,
        v_valid_payment_method,
        'pending'::public.payment_status_type,
        'paypal',
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

    -- 14. Devolver resultado
    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'status', 'payment_pending',
        'payment_status', 'pending',
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'total', v_total,
        'discount_total', v_total_discounts,
        'promotion_discount', v_best_promo_discount,
        'promotion_code', v_best_promo_code
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(UUID, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, JSONB, TEXT, TEXT) TO authenticated;


-- ------------------------------------------------------------------------------
-- 2. RPC: confirm_order_payment (Idempotencia real, verificación de estado y anti-tampering)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_order_payment(
    p_order_id UUID,
    p_provider_order_id TEXT,
    p_capture_id TEXT,
    p_amount NUMERIC,
    p_method TEXT DEFAULT 'paypal',
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_method_enum public.payment_method_type;
    v_existing_payment RECORD;
BEGIN
    -- 1. Bloqueo de fila para atomicidad
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Pedido no encontrado en YA Delivery.'
        );
    END IF;

    -- 2. IDEMPOTENCIA ESTRICTA: Si el pedido ya fue marcado como pagado
    IF v_order.payment_status = 'paid' THEN
        -- Verificar si ya existe una transacción registrada en public.payments para este capture o PayPal order
        IF EXISTS (
            SELECT 1 FROM public.payments 
            WHERE order_id = p_order_id 
              AND (provider_capture_id = p_capture_id OR provider_order_id = p_provider_order_id)
        ) THEN
            RETURN jsonb_build_object(
                'success', true,
                'order_id', v_order.id,
                'order_number', v_order.order_number,
                'status', v_order.status,
                'already_paid', true,
                'message', 'El pedido ya había sido confirmado previamente con este identificador de transacción.'
            );
        ELSE
            RETURN jsonb_build_object(
                'success', true,
                'order_id', v_order.id,
                'order_number', v_order.order_number,
                'status', v_order.status,
                'already_paid', true,
                'message', 'El pedido ya figura como pagado.'
            );
        END IF;
    END IF;

    -- 3. VALIDACIÓN ESTRICTA DEL ESTADO DEL PEDIDO:
    -- Solo pedidos en (status = 'payment_pending' Y payment_status = 'pending') pueden recibir pago.
    IF v_order.status <> 'payment_pending' OR v_order.payment_status <> 'pending' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Transición no permitida: El pedido no está en estado pendiente de pago (Estado: %s, Pago: %s).', v_order.status, v_order.payment_status)
        );
    END IF;

    -- 4. ANTI-TAMPERING: Validación estricta de importe contra base de datos (margen 1 céntimo)
    IF ABS(v_order.total - p_amount) > 0.01 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Discrepancia de importe detectada. Esperado: %s €, Recibido: %s €', v_order.total, p_amount)
        );
    END IF;

    -- 5. Validar enum de método de pago (operativamente solo 'paypal' o 'card')
    BEGIN
        v_method_enum := p_method::public.payment_method_type;
    EXCEPTION WHEN OTHERS THEN
        v_method_enum := 'paypal'::public.payment_method_type;
    END;

    IF v_method_enum NOT IN ('paypal'::public.payment_method_type, 'card'::public.payment_method_type) THEN
        v_method_enum := 'paypal'::public.payment_method_type;
    END IF;

    -- 6. Transición atómica en public.orders según el esquema REAL:
    -- orders.status: payment_pending -> received
    -- orders.payment_status: pending -> paid
    UPDATE public.orders
    SET status = 'received'::public.order_status,
        payment_status = 'paid'::public.payment_status_type,
        payment_method = v_method_enum,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id;

    -- 7. Registro seguro en public.payments (donde realmente vive la referencia de la pasarela):
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
        p_order_id,
        v_order.user_id,
        'paypal',
        p_provider_order_id,
        p_capture_id,
        p_method,
        'paid'::public.payment_status_type,
        p_amount,
        'EUR',
        p_metadata,
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'status', 'received',
        'payment_status', 'paid',
        'paid_at', timezone('utc'::text, now()),
        'capture_id', p_capture_id
    );
END;
$$;

-- SEGURIDAD CRÍTICA BACKEND:
-- confirm_order_payment es de uso exclusivo para el backend autenticado con service_role
-- Queda terminantemente denegada a usuarios públicos (anon) y autenticados (authenticated)
REVOKE ALL ON FUNCTION public.confirm_order_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_order_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_order_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, JSONB) TO service_role;


-- ------------------------------------------------------------------------------
-- 3. RPC: admin_update_order_status (Bloqueo de pedidos pendientes de pago)
-- ------------------------------------------------------------------------------
-- El parámetro p_status utiliza el enum oficial public.order_status
CREATE OR REPLACE FUNCTION public.admin_update_order_status(
    p_order_id UUID,
    p_status public.order_status
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_current_order RECORD;
    v_updated_order RECORD;
BEGIN
    -- 1. Validar autorización de administrador
    SELECT public.is_admin() INTO v_is_admin;
    IF NOT COALESCE(v_is_admin, false) THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador para cambiar el estado del pedido.';
    END IF;

    -- 2. Consultar el pedido actual
    SELECT id, status, payment_status INTO v_current_order
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado con ID %', p_order_id;
    END IF;

    -- 3. BLOQUEO DE SEGURIDAD OPERATIVA:
    -- Un pedido en 'payment_pending' o con 'payment_status = pending'
    -- NO puede pasar a preparación ('preparing'), compra ('sourcing'), preparado ('prepared') ni reparto ('delivering').
    -- Únicamente se permite anulación ('cancelled') si el cliente desiste o se descarta.
    IF (v_current_order.status = 'payment_pending' OR v_current_order.payment_status = 'pending')
       AND p_status NOT IN ('payment_pending'::public.order_status, 'cancelled'::public.order_status) THEN
        RAISE EXCEPTION 'BLOQUEO OPERATIVO YA: Este pedido está PENDIENTE DE PAGO (no ha sido capturado). No puede pasar a preparación, compra ni reparto hasta que el pago sea confirmado.';
    END IF;

    -- 4. Actualizar estado
    UPDATE public.orders
    SET
        status = p_status,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id
    RETURNING id, order_number, status, updated_at INTO v_updated_order;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_updated_order.id,
        'order_number', v_updated_order.order_number,
        'new_status', v_updated_order.status,
        'updated_at', v_updated_order.updated_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_order_status(UUID, public.order_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(UUID, public.order_status) TO authenticated;
