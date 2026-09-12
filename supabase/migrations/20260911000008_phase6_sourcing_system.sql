-- ==============================================================================
-- YA DELIVERY - FASE 6: SOURCING / ABASTECIMIENTO
-- Archivo: supabase/migrations/20260911000008_phase6_sourcing_system.sql
-- ==============================================================================
-- Arquitectura de Abastecimiento Operativo:
-- 1. ENUM sourcing_status ('pending', 'sourcing', 'sourced', 'unavailable', 'cancelled')
-- 2. Tabla independiente public.sourcing_items (aislamiento de seguridad vs order_items)
--    - Protege notas internas, costes reales y proveedores frente a clientes/repartidores
--    - Permite desagregación exacta de componentes bajo demanda en packs y productos individuales
--    - Constraint UNIQUE para idempotencia y prevención matemática de duplicados
-- 3. Tabla de auditoría inmutable public.sourcing_audit_logs
-- 4. Políticas RLS estrictas (exclusivo para Administradores de YA)
-- 5. Trigger de cancelación de pedido (cancela tareas de sourcing huérfanas)
-- 6. RPCs seguras para actualización, consulta y métricas de abastecimiento
-- 7. Actualización de public.create_order y create_admin_test_order para registrar sourcing
-- 8. Blindaje en public.admin_update_order_status contra transiciones inconsistentes
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ENUM DE ESTADOS DE SOURCING
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sourcing_status') THEN
        CREATE TYPE public.sourcing_status AS ENUM (
            'pending',       -- Abastecimiento detectado y pendiente de inicio
            'sourcing',      -- En ruta de compra / adquisición activa en Jerez
            'sourced',       -- Conseguido y disponible físicamente para empaquetado
            'unavailable',   -- No encontrado / agotado en comercios locales
            'cancelled'      -- Cancelado (por anulación de pedido o descarte)
        );
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. TABLA PRINCIPAL: public.sourcing_items
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sourcing_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES public.order_items(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    status public.sourcing_status NOT NULL DEFAULT 'pending',
    is_test BOOLEAN NOT NULL DEFAULT false,
    supplier_name TEXT,
    supplier_reference TEXT,
    source_cost NUMERIC(10, 2) CHECK (source_cost >= 0),
    notes TEXT,
    managed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    sourced_at TIMESTAMPTZ
);

-- Índices para consultas operativas eficientes
CREATE INDEX IF NOT EXISTS idx_sourcing_items_order_id ON public.sourcing_items(order_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_items_product_id ON public.sourcing_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_items_status ON public.sourcing_items(status);
CREATE INDEX IF NOT EXISTS idx_sourcing_items_is_test ON public.sourcing_items(is_test);
CREATE INDEX IF NOT EXISTS idx_sourcing_items_created_at ON public.sourcing_items(created_at DESC);

-- Índice Único para garantizar idempotencia estricta frente a doble clic, retry o webhooks
CREATE UNIQUE INDEX IF NOT EXISTS uq_sourcing_item_order_prod_item 
ON public.sourcing_items(order_id, product_id, COALESCE(order_item_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ------------------------------------------------------------------------------
-- 3. TABLA DE AUDITORÍA: public.sourcing_audit_logs
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sourcing_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sourcing_item_id UUID NOT NULL REFERENCES public.sourcing_items(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    previous_status public.sourcing_status,
    new_status public.sourcing_status NOT NULL,
    supplier_name TEXT,
    source_cost NUMERIC(10, 2),
    notes TEXT,
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_sourcing_audit_item_id ON public.sourcing_audit_logs(sourcing_item_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_audit_order_id ON public.sourcing_audit_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_audit_created_at ON public.sourcing_audit_logs(created_at DESC);

-- ------------------------------------------------------------------------------
-- 4. SEGURIDAD Y POLÍTICAS RLS (ADMIN-ONLY)
-- Clientes y repartidores NO tienen acceso a las notas, costes ni estados internos
-- ------------------------------------------------------------------------------
ALTER TABLE public.sourcing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view sourcing items" ON public.sourcing_items;
CREATE POLICY "Admins can view sourcing items"
    ON public.sourcing_items FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert sourcing items" ON public.sourcing_items;
CREATE POLICY "Admins can insert sourcing items"
    ON public.sourcing_items FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update sourcing items" ON public.sourcing_items;
CREATE POLICY "Admins can update sourcing items"
    ON public.sourcing_items FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete sourcing items" ON public.sourcing_items;
CREATE POLICY "Admins can delete sourcing items"
    ON public.sourcing_items FOR DELETE
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can view sourcing audit logs" ON public.sourcing_audit_logs;
CREATE POLICY "Admins can view sourcing audit logs"
    ON public.sourcing_audit_logs FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert sourcing audit logs" ON public.sourcing_audit_logs;
CREATE POLICY "Admins can insert sourcing audit logs"
    ON public.sourcing_audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 5. TRIGGER DE CANCELACIÓN DE PEDIDOS (AUTO-CIERRE DE SOURCING)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_order_cancelled_cancel_sourcing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' THEN
        -- Cancelar tareas activas de sourcing
        UPDATE public.sourcing_items
        SET status = 'cancelled',
            notes = COALESCE(notes || ' | ', '') || 'Cancelado automáticamente por anulación del pedido',
            updated_at = timezone('utc'::text, now())
        WHERE order_id = NEW.id
          AND status IN ('pending', 'sourcing');

        -- Registrar en historial de auditoría
        INSERT INTO public.sourcing_audit_logs (
            sourcing_item_id,
            order_id,
            previous_status,
            new_status,
            notes,
            changed_by,
            created_at
        )
        SELECT 
            id,
            order_id,
            'pending',
            'cancelled',
            'Cancelado automáticamente al anular el pedido',
            auth.uid(),
            timezone('utc'::text, now())
        FROM public.sourcing_items
        WHERE order_id = NEW.id AND status = 'cancelled' AND updated_at >= timezone('utc'::text, now()) - INTERVAL '2 seconds';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_cancelled_cancel_sourcing ON public.orders;
CREATE TRIGGER trg_order_cancelled_cancel_sourcing
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.on_order_cancelled_cancel_sourcing();

-- ------------------------------------------------------------------------------
-- 6. RPC: admin_update_sourcing_item_status
-- Actualiza de forma atómica y validada el estado de un artículo en abastecimiento
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_sourcing_item_status(
    p_sourcing_item_id UUID,
    p_status public.sourcing_status,
    p_notes TEXT DEFAULT NULL,
    p_supplier_name TEXT DEFAULT NULL,
    p_source_cost NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_item RECORD;
    v_order RECORD;
    v_prod RECORD;
    v_prev_status public.sourcing_status;
    v_new_sourced_at TIMESTAMPTZ := NULL;
    v_all_sourced BOOLEAN := false;
BEGIN
    -- 1. Validar permisos de administrador
    SELECT public.is_admin() INTO v_is_admin;
    IF NOT COALESCE(v_is_admin, false) THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador para gestionar el abastecimiento.';
    END IF;

    -- 2. Cargar item con bloqueo
    SELECT * INTO v_item
    FROM public.sourcing_items
    WHERE id = p_sourcing_item_id
    FOR UPDATE;

    IF v_item.id IS NULL THEN
        RAISE EXCEPTION 'Artículo de abastecimiento no encontrado con ID %', p_sourcing_item_id;
    END IF;

    v_prev_status := v_item.status;

    -- 3. Validar transiciones legales
    IF v_prev_status = 'cancelled' THEN
        RAISE EXCEPTION 'No se puede modificar un artículo cuyo abastecimiento ya ha sido cancelado.';
    END IF;

    IF v_prev_status = 'sourced' AND p_status IN ('pending', 'sourcing') THEN
        RAISE EXCEPTION 'No se puede devolver a pendiente o en curso un artículo que ya ha sido conseguido físicamente.';
    END IF;

    IF p_status = 'sourced' THEN
        v_new_sourced_at := timezone('utc'::text, now());
    ELSE
        v_new_sourced_at := v_item.sourced_at;
    END IF;

    -- 4. Cargar datos del pedido
    SELECT id, order_number, is_test, status INTO v_order
    FROM public.orders
    WHERE id = v_item.order_id;

    -- 5. Actualizar el registro de sourcing
    UPDATE public.sourcing_items
    SET
        status = p_status,
        supplier_name = COALESCE(NULLIF(trim(p_supplier_name), ''), supplier_name),
        source_cost = COALESCE(p_source_cost, source_cost),
        notes = CASE 
            WHEN p_notes IS NOT NULL AND trim(p_notes) <> '' THEN trim(p_notes)
            ELSE notes
        END,
        managed_by = auth.uid(),
        updated_at = timezone('utc'::text, now()),
        sourced_at = v_new_sourced_at
    WHERE id = p_sourcing_item_id;

    -- 6. Integración con Fase 5 (Inventario) al conseguir producto:
    -- Si el producto es conseguido y entra físicamente, se audita en public.stock_movements
    IF p_status = 'sourced' AND v_prev_status <> 'sourced' AND NOT COALESCE(v_item.is_test, false) THEN
        SELECT stock_quantity INTO v_prod
        FROM public.products
        WHERE id = v_item.product_id;

        INSERT INTO public.stock_movements (
            product_id,
            movement_type,
            quantity,
            previous_stock,
            new_stock,
            order_id,
            reason,
            created_by,
            created_at
        ) VALUES (
            v_item.product_id,
            'entry',
            v_item.quantity,
            COALESCE(v_prod.stock_quantity, 0),
            COALESCE(v_prod.stock_quantity, 0), -- Consumo inmediato para satisfacer la orden
            v_item.order_id,
            'Abastecimiento completado para pedido #' || v_order.order_number || 
                CASE WHEN p_supplier_name IS NOT NULL AND trim(p_supplier_name) <> '' THEN ' (' || trim(p_supplier_name) || ')' ELSE '' END,
            auth.uid(),
            timezone('utc'::text, now())
        );
    END IF;

    -- 7. Registrar en log de auditoría
    INSERT INTO public.sourcing_audit_logs (
        sourcing_item_id,
        order_id,
        previous_status,
        new_status,
        supplier_name,
        source_cost,
        notes,
        changed_by,
        created_at
    ) VALUES (
        p_sourcing_item_id,
        v_item.order_id,
        v_prev_status,
        p_status,
        COALESCE(p_supplier_name, v_item.supplier_name),
        COALESCE(p_source_cost, v_item.source_cost),
        p_notes,
        auth.uid(),
        timezone('utc'::text, now())
    );

    -- 8. Evaluar si todos los items del pedido ya están conseguidos
    SELECT NOT EXISTS (
        SELECT 1 FROM public.sourcing_items 
        WHERE order_id = v_item.order_id 
          AND status IN ('pending', 'sourcing', 'unavailable')
    ) INTO v_all_sourced;

    RETURN jsonb_build_object(
        'success', true,
        'sourcing_item_id', p_sourcing_item_id,
        'order_id', v_item.order_id,
        'order_number', v_order.order_number,
        'previous_status', v_prev_status,
        'new_status', p_status,
        'all_sourced_for_order', v_all_sourced,
        'updated_at', timezone('utc'::text, now())
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. RPC: admin_fetch_sourcing_items
-- Consulta avanzada de tareas de abastecimiento con metadatos de producto y pedido
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_fetch_sourcing_items(
    p_status TEXT DEFAULT NULL,
    p_order_id UUID DEFAULT NULL,
    p_is_test BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_results JSONB;
BEGIN
    SELECT public.is_admin() INTO v_is_admin;
    IF NOT COALESCE(v_is_admin, false) THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', si.id,
            'order_id', si.order_id,
            'order_item_id', si.order_item_id,
            'product_id', si.product_id,
            'product_name', si.product_name,
            'quantity', si.quantity,
            'status', si.status,
            'is_test', si.is_test,
            'supplier_name', si.supplier_name,
            'supplier_reference', si.supplier_reference,
            'source_cost', si.source_cost,
            'notes', si.notes,
            'managed_by', si.managed_by,
            'created_at', si.created_at,
            'updated_at', si.updated_at,
            'sourced_at', si.sourced_at,
            'order_number', o.order_number,
            'order_status', o.status,
            'order_created_at', o.created_at,
            'order_notes', o.notes,
            'delivery_address', o.delivery_address_snapshot,
            'product_slug', p.slug,
            'product_image', p.image,
            'product_price', p.price,
            'product_estimated_cost', p.estimated_cost,
            'suggested_purchase_locations', p.suggested_purchase_locations,
            'internal_courier_notes', p.internal_courier_notes
        ) ORDER BY si.created_at ASC
    ), '[]'::jsonb)
    INTO v_results
    FROM public.sourcing_items si
    JOIN public.orders o ON o.id = si.order_id
    JOIN public.products p ON p.id = si.product_id
    WHERE (p_status IS NULL OR p_status = 'all' OR si.status::TEXT = p_status)
      AND (p_order_id IS NULL OR si.order_id = p_order_id)
      AND (p_is_test IS NULL OR si.is_test = p_is_test);

    RETURN v_results;
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. RPC: admin_get_sourcing_summary
-- Resumen numérico para tarjetas KPI y alertas operativas en el panel de control
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_sourcing_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_pending INT;
    v_sourcing INT;
    v_sourced_today INT;
    v_unavailable INT;
    v_orders_pending_sourcing INT;
BEGIN
    SELECT public.is_admin() INTO v_is_admin;
    IF NOT COALESCE(v_is_admin, false) THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    SELECT COUNT(*) INTO v_pending
    FROM public.sourcing_items
    WHERE status = 'pending';

    SELECT COUNT(*) INTO v_sourcing
    FROM public.sourcing_items
    WHERE status = 'sourcing';

    SELECT COUNT(*) INTO v_sourced_today
    FROM public.sourcing_items
    WHERE status = 'sourced'
      AND sourced_at >= date_trunc('day', timezone('utc'::text, now()));

    SELECT COUNT(*) INTO v_unavailable
    FROM public.sourcing_items
    WHERE status = 'unavailable';

    SELECT COUNT(DISTINCT order_id) INTO v_orders_pending_sourcing
    FROM public.sourcing_items
    WHERE status IN ('pending', 'sourcing');

    RETURN jsonb_build_object(
        'pending_count', v_pending,
        'sourcing_count', v_sourcing,
        'sourced_today_count', v_sourced_today,
        'unavailable_count', v_unavailable,
        'orders_pending_sourcing', v_orders_pending_sourcing
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. ACTUALIZACIÓN DE public.admin_update_order_status CON VALIDACIÓN DE SOURCING
-- Bloquea que un pedido pase a 'prepared' o 'delivering' si tiene productos pendientes
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_order_status(
    p_order_id UUID,
    p_status order_status
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_updated_order RECORD;
    v_pending_sourcing_count INT;
BEGIN
    -- 1. Validar autorización de administrador
    SELECT public.is_admin() INTO v_is_admin;
    IF NOT COALESCE(v_is_admin, false) THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador para cambiar el estado del pedido.';
    END IF;

    -- 2. Validación de abastecimiento (Fase 6):
    -- Si el pedido se intenta marcar como 'prepared', 'delivering' o 'delivered',
    -- no debe tener artículos con sourcing en estado 'pending' o 'sourcing'.
    IF p_status IN ('prepared', 'delivering', 'delivered') THEN
        SELECT COUNT(*) INTO v_pending_sourcing_count
        FROM public.sourcing_items
        WHERE order_id = p_order_id
          AND status IN ('pending', 'sourcing');

        IF v_pending_sourcing_count > 0 THEN
            RAISE EXCEPTION 'No se puede marcar el pedido como "%": tiene % artículo(s) con abastecimiento pendiente de conseguir.',
                p_status, v_pending_sourcing_count;
        END IF;
    END IF;

    -- 3. Actualizar estrictamente solo el campo status y updated_at
    UPDATE public.orders
    SET
        status = p_status,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id
    RETURNING id, order_number, status, updated_at INTO v_updated_order;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado con ID %', p_order_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_updated_order.id,
        'order_number', v_updated_order.order_number,
        'new_status', v_updated_order.status,
        'updated_at', v_updated_order.updated_at
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 10. ACTUALIZACIÓN ATÓMICA DE public.create_order CON GENERACIÓN DE SOURCING
-- Identifica productos 'on_demand' (individuales y componentes de packs)
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
    v_min_order_enabled BOOLEAN := false;
    v_min_order_amount NUMERIC(10, 2) := 0;
    v_free_shipping_enabled BOOLEAN := false;
    v_free_shipping_threshold NUMERIC(10, 2) := 0;
    v_standard_delivery_fee NUMERIC(10, 2) := 2.90;

    -- Variables de iteración de items
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
    v_line_subtotal NUMERIC(10, 2);
    v_line_unit_price NUMERIC(10, 2);
    v_line_discount NUMERIC(10, 2) := 0;

    -- Packs
    v_pack_id UUID;
    v_pack_name TEXT;
    v_pack_price NUMERIC(10, 2);
    v_pack_type public.pack_type_enum;
    v_pack_active BOOLEAN;
    v_pack_sub_item RECORD;
    v_pack_group RECORD;
    v_selection JSONB;
    v_chosen_option_count INT;
    v_chosen_opt_prod_id UUID;
    v_chosen_opt_prod RECORD;
    v_chosen_pack_items JSONB;
    v_pack_snapshot JSONB;

    -- Descuentos comerciales y promociones
    v_spec_disc RECORD;
    v_best_disc RECORD;
    v_promo RECORD;
    v_total_discounts NUMERIC(10, 2) := 0;
    v_best_promo_discount NUMERIC(10, 2) := 0;
    v_best_promo_id UUID := NULL;
    v_best_promo_code TEXT := NULL;
    v_calculated_promo_val NUMERIC(10, 2) := 0;

    -- Colecciones temporales para items, stock y sourcing
    v_order_items_to_insert JSONB := '[]'::jsonb;
    v_stock_deductions JSONB := '[]'::jsonb;
    v_sourcing_queue JSONB := '[]'::jsonb;
    v_s_item JSONB;
    v_deduct RECORD;
    v_comp_needed INT;
    v_cur_stock INT;
    v_new_stock INT;
    v_inserted_item_id UUID;
    v_matched_item_id UUID;
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
    END IF;

    -- 4. Validar método de pago
    IF p_payment_method IS NULL OR p_payment_method = '' THEN
        v_valid_payment_method := 'paypal'::public.payment_method_type;
    ELSIF p_payment_method IN ('paypal', 'card', 'bizum', 'cash', 'apple_pay', 'google_pay') THEN
        v_valid_payment_method := p_payment_method::public.payment_method_type;
    ELSE
        v_valid_payment_method := 'paypal'::public.payment_method_type;
    END IF;

    -- 5. Validar que el carrito contenga elementos
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito está vacío. Agrega productos antes de tramitar el pedido.';
    END IF;

    -- 6. Procesar cada item del carrito y verificar stock / planificar sourcing
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_is_pack := COALESCE((v_item->>'is_pack')::BOOLEAN, false);
        v_item_qty := COALESCE((v_item->>'quantity')::INT, 1);

        IF v_item_qty <= 0 THEN
            RAISE EXCEPTION 'La cantidad de cada producto debe ser mayor a 0.';
        END IF;

        IF v_item_is_pack THEN
            -- Caso Pack
            v_item_ref := v_item->>'pack_id';
            IF v_item_ref IS NULL THEN
                v_item_ref := v_item->>'product_id';
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
                    -- Bloquear producto del pack para verificación estricta de stock
                    SELECT stock_quantity, stock_mode, active INTO v_cur_stock, v_prod_stock_mode, v_prod_active
                    FROM public.products
                    WHERE id = v_pack_sub_item.product_id
                    FOR UPDATE;

                    v_comp_needed := v_pack_sub_item.quantity * v_item_qty;

                    IF v_prod_active IS NOT TRUE OR v_prod_stock_mode = 'out_of_stock' THEN
                        RAISE EXCEPTION 'El componente "%" del pack "%" está agotado.', v_pack_sub_item.name, v_pack_name;
                    END IF;

                    IF v_prod_stock_mode = 'in_stock' AND v_cur_stock < v_comp_needed THEN
                        RAISE EXCEPTION 'Stock insuficiente para el componente "%" del pack "%" (disponible: %, necesario: %).', 
                            v_pack_sub_item.name, v_pack_name, v_cur_stock, v_comp_needed;
                    END IF;

                    -- Planificar deducción de stock si es in_stock
                    IF v_prod_stock_mode = 'in_stock' THEN
                        v_stock_deductions := v_stock_deductions || jsonb_build_object(
                            'product_id', v_pack_sub_item.product_id,
                            'quantity', v_comp_needed,
                            'reason', 'Venta componente pack ' || v_pack_name
                        );
                    ELSIF v_prod_stock_mode = 'on_demand' THEN
                        -- Planificar tarea de sourcing para componente bajo demanda
                        v_sourcing_queue := v_sourcing_queue || jsonb_build_object(
                            'product_id', v_pack_sub_item.product_id,
                            'product_name', v_pack_sub_item.name,
                            'quantity', v_comp_needed,
                            'match_key', 'pack_' || v_pack_id::TEXT
                        );
                    END IF;

                    v_chosen_pack_items := v_chosen_pack_items || jsonb_build_object(
                        'product_id', v_pack_sub_item.product_id,
                        'name', v_pack_sub_item.name,
                        'quantity', v_pack_sub_item.quantity
                    );
                END LOOP;
            ELSE
                -- Pack configurable
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

                            -- Bloquear producto seleccionado
                            SELECT id, name, active, stock_mode, stock_quantity
                            INTO v_chosen_opt_prod
                            FROM public.products
                            WHERE id = v_chosen_opt_prod_id
                            FOR UPDATE;

                            IF v_chosen_opt_prod.active IS NOT TRUE OR v_chosen_opt_prod.stock_mode = 'out_of_stock' THEN
                                RAISE EXCEPTION 'La opción "%" seleccionada para el pack "%" está agotada.', v_chosen_opt_prod.name, v_pack_name;
                            END IF;

                            IF v_chosen_opt_prod.stock_mode = 'in_stock' AND v_chosen_opt_prod.stock_quantity < v_item_qty THEN
                                RAISE EXCEPTION 'Stock insuficiente para la opción "%" del pack "%" (disponible: %, solicitado: %).', 
                                    v_chosen_opt_prod.name, v_pack_name, v_chosen_opt_prod.stock_quantity, v_item_qty;
                            END IF;

                            -- Planificar deducción o sourcing
                            IF v_chosen_opt_prod.stock_mode = 'in_stock' THEN
                                v_stock_deductions := v_stock_deductions || jsonb_build_object(
                                    'product_id', v_chosen_opt_prod.id,
                                    'quantity', v_item_qty,
                                    'reason', 'Venta opción pack ' || v_pack_name
                                );
                            ELSIF v_chosen_opt_prod.stock_mode = 'on_demand' THEN
                                v_sourcing_queue := v_sourcing_queue || jsonb_build_object(
                                    'product_id', v_chosen_opt_prod.id,
                                    'product_name', v_chosen_opt_prod.name,
                                    'quantity', v_item_qty,
                                    'match_key', 'pack_' || v_pack_id::TEXT
                                );
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
                        RAISE EXCEPTION 'Debes seleccionar al menos % opción(es) para "%" en el pack "%".', 
                            v_pack_group.min_select, v_pack_group.name, v_pack_name;
                    END IF;
                    IF v_chosen_option_count > v_pack_group.max_select THEN
                        RAISE EXCEPTION 'Puedes seleccionar máximo % opción(es) para "%" en el pack "%".', 
                            v_pack_group.max_select, v_pack_group.name, v_pack_name;
                    END IF;
                END LOOP;
            END IF;

            v_line_subtotal := v_pack_price * v_item_qty;
            v_subtotal := v_subtotal + v_line_subtotal;

            v_pack_snapshot := jsonb_build_object(
                'pack_id', v_pack_id,
                'pack_name', v_pack_name,
                'pack_type', v_pack_type,
                'pack_price', v_pack_price,
                'quantity', v_item_qty,
                'components', v_chosen_pack_items
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
                'pack_snapshot', v_pack_snapshot,
                'match_key', 'pack_' || v_pack_id::TEXT
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
                WHERE id = v_item_ref::UUID
                FOR UPDATE;
            END IF;

            IF v_prod_id IS NULL THEN
                SELECT id, name, price, active, stock_mode, stock_quantity, category_id
                INTO v_prod_id, v_prod_name, v_prod_price, v_prod_active, v_prod_stock_mode, v_prod_stock_qty, v_prod_cat_id
                FROM public.products
                WHERE slug = v_item_ref
                FOR UPDATE;
            END IF;

            IF v_prod_id IS NULL THEN
                RAISE EXCEPTION 'El producto solicitado ("%") no existe en el catálogo.', v_item_ref;
            END IF;

            IF v_prod_active IS NOT TRUE THEN
                RAISE EXCEPTION 'El producto "%" no está disponible temporalmente.', v_prod_name;
            END IF;

            -- Validación estricta de stock
            IF v_prod_stock_mode = 'out_of_stock' OR (v_prod_stock_mode = 'in_stock' AND v_prod_stock_qty <= 0) THEN
                RAISE EXCEPTION 'El producto "%" está agotado actualmente.', v_prod_name;
            END IF;

            IF v_prod_stock_mode = 'in_stock' AND v_prod_stock_qty < v_item_qty THEN
                RAISE EXCEPTION 'No hay suficiente stock disponible para "%" (disponible: %, solicitado: %).', 
                    v_prod_name, v_prod_stock_qty, v_item_qty;
            END IF;

            -- Planificar deducción o sourcing
            IF v_prod_stock_mode = 'in_stock' THEN
                v_stock_deductions := v_stock_deductions || jsonb_build_object(
                    'product_id', v_prod_id,
                    'quantity', v_item_qty,
                    'reason', 'Venta producto individual'
                );
            ELSIF v_prod_stock_mode = 'on_demand' THEN
                -- Planificar tarea de sourcing para producto bajo demanda individual
                v_sourcing_queue := v_sourcing_queue || jsonb_build_object(
                    'product_id', v_prod_id,
                    'product_name', v_prod_name,
                    'quantity', v_item_qty,
                    'match_key', 'prod_' || v_prod_id::TEXT
                );
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
                v_best_disc := v_spec_disc;
            ELSE
                SELECT * INTO v_best_disc
                FROM public.discounts
                WHERE scope = 'category'
                  AND category_id = v_prod_cat_id
                  AND active = true
                  AND (starts_at IS NULL OR starts_at <= now())
                  AND (expires_at IS NULL OR expires_at >= now())
                ORDER BY created_at DESC
                LIMIT 1;
            END IF;

            IF v_best_disc.id IS NOT NULL THEN
                IF v_best_disc.type = 'percentage' THEN
                    v_line_discount := ROUND((v_line_unit_price * (v_best_disc.value / 100.0)), 2);
                ELSIF v_best_disc.type = 'fixed' THEN
                    v_line_discount := LEAST(v_line_unit_price, v_best_disc.value);
                END IF;
                v_line_unit_price := GREATEST(0.00, v_line_unit_price - v_line_discount);
            END IF;

            v_line_subtotal := v_line_unit_price * v_item_qty;
            v_subtotal := v_subtotal + v_line_subtotal;
            v_total_discounts := v_total_discounts + (v_line_discount * v_item_qty);

            v_order_items_to_insert := v_order_items_to_insert || jsonb_build_object(
                'is_pack', false,
                'pack_id', NULL,
                'product_id', v_prod_id,
                'product_name', v_prod_name,
                'unit_price', v_line_unit_price,
                'quantity', v_item_qty,
                'subtotal', v_line_subtotal,
                'discount_applied', (v_line_discount * v_item_qty),
                'pack_snapshot', NULL,
                'match_key', 'prod_' || v_prod_id::TEXT
            );
        END IF;
    END LOOP;

    -- 7. Validar pedido mínimo comercial
    IF v_min_order_enabled AND v_subtotal < v_min_order_amount THEN
        RAISE EXCEPTION 'El subtotal del pedido (%.2f €) es inferior al pedido mínimo comercial (%.2f €).', 
            v_subtotal, v_min_order_amount;
    END IF;

    -- 8. Evaluar envío gratis por threshold
    IF v_free_shipping_enabled AND v_subtotal >= v_free_shipping_threshold THEN
        v_delivery_fee := 0.00;
    END IF;

    -- 9. Evaluar mejor promoción automática global
    FOR v_promo IN
        SELECT *
        FROM public.promotions
        WHERE active = true
          AND (starts_at IS NULL OR starts_at <= now())
          AND (expires_at IS NULL OR expires_at >= now())
          AND (usage_limit IS NULL OR usage_count < usage_limit)
          AND (min_subtotal IS NULL OR v_subtotal >= min_subtotal)
        ORDER BY created_at DESC
    LOOP
        IF v_promo.type = 'percentage' THEN
            v_calculated_promo_val := ROUND((v_subtotal * (v_promo.value / 100.0)), 2);
        ELSIF v_promo.type = 'fixed' THEN
            v_calculated_promo_val := LEAST(v_subtotal, v_promo.value);
        ELSIF v_promo.type = 'free_shipping' THEN
            v_calculated_promo_val := v_delivery_fee;
        END IF;

        IF v_calculated_promo_val > v_best_promo_discount THEN
            v_best_promo_discount := v_calculated_promo_val;
            v_best_promo_id := v_promo.id;
            v_best_promo_code := v_promo.code;
        END IF;
    END LOOP;

    IF v_best_promo_id IS NOT NULL THEN
        IF (SELECT type FROM public.promotions WHERE id = v_best_promo_id) = 'free_shipping' THEN
            v_delivery_fee := 0.00;
            v_best_promo_discount := 0.00;
        END IF;
        UPDATE public.promotions
        SET usage_count = usage_count + 1,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_best_promo_id;
    END IF;

    -- 10. Cálculo de total final
    v_total := GREATEST(0.00, v_subtotal + v_delivery_fee - v_best_promo_discount);

    -- 11. Generar número de pedido YA
    v_order_number := 'YA-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 4));

    -- 12. Insertar pedido en orders
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

    -- 13. Insertar líneas en order_items y mapear claves para sourcing
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
        )
        RETURNING id INTO v_inserted_item_id;

        -- Si la cola de sourcing tiene items para esta línea, vincular el order_item_id
        IF jsonb_array_length(v_sourcing_queue) > 0 THEN
            FOR v_s_item IN SELECT * FROM jsonb_array_elements(v_sourcing_queue)
            LOOP
                IF (v_s_item->>'match_key') = (v_item->>'match_key') THEN
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
                        false,
                        'Abastecimiento requerido automáticamente para producto bajo demanda',
                        timezone('utc'::text, now()),
                        timezone('utc'::text, now())
                    )
                    ON CONFLICT (order_id, product_id, COALESCE(order_item_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    -- 14. DEDUCCIÓN ATÓMICA DE STOCK Y REGISTRO EN public.stock_movements (solo in_stock)
    FOR v_deduct IN 
        SELECT 
            (d->>'product_id')::UUID AS prod_id,
            SUM((d->>'quantity')::INT)::INT AS total_deduct_qty,
            MAX(d->>'reason') AS reason_text
        FROM jsonb_array_elements(v_stock_deductions) d
        GROUP BY (d->>'product_id')::UUID
    LOOP
        -- Obtener stock actual bajo bloqueo
        SELECT stock_quantity INTO v_cur_stock
        FROM public.products
        WHERE id = v_deduct.prod_id
        FOR UPDATE;

        v_new_stock := GREATEST(0, v_cur_stock - v_deduct.total_deduct_qty);

        -- Actualizar producto
        UPDATE public.products
        SET stock_quantity = v_new_stock,
            stock_mode = CASE 
                WHEN v_new_stock = 0 AND stock_mode = 'in_stock' THEN 'out_of_stock'
                ELSE stock_mode 
            END,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_deduct.prod_id;

        -- Registrar movimiento inmutable de venta
        INSERT INTO public.stock_movements (
            product_id,
            movement_type,
            quantity,
            previous_stock,
            new_stock,
            order_id,
            reason,
            created_by,
            created_at
        ) VALUES (
            v_deduct.prod_id,
            'sale',
            -v_deduct.total_deduct_qty,
            v_cur_stock,
            v_new_stock,
            v_order_id,
            v_deduct.reason_text,
            v_user_id,
            timezone('utc'::text, now())
        );
    END LOOP;

    -- 15. Devolver payload de confirmación
    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'total', v_total,
        'discount_total', v_total_discounts,
        'promotion_discount', v_best_promo_discount,
        'promotion_code', v_best_promo_code,
        'status', 'payment_pending',
        'has_sourcing', (jsonb_array_length(v_sourcing_queue) > 0),
        'sourcing_items_count', jsonb_array_length(v_sourcing_queue)
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. ACTUALIZACIÓN DE create_admin_test_order CON SOURCING (is_test = true)
-- ------------------------------------------------------------------------------
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
    v_pack_type public.pack_type_enum;
    v_pack_snapshot JSONB;
    
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

            v_line_subtotal := COALESCE(v_pack_price, 0.00) * v_item_qty;
            v_subtotal := v_subtotal + v_line_subtotal;

            v_pack_snapshot := jsonb_build_object(
                'pack_id', v_pack_id,
                'pack_name', v_pack_name,
                'pack_type', v_pack_type,
                'pack_price', v_pack_price,
                'quantity', v_item_qty
            );

            v_order_items_to_insert := v_order_items_to_insert || jsonb_build_object(
                'is_pack', true,
                'pack_id', v_pack_id,
                'product_id', NULL,
                'product_name', '[PACK] ' || COALESCE(v_pack_name, 'Pack'),
                'unit_price', COALESCE(v_pack_price, 0.00),
                'quantity', v_item_qty,
                'subtotal', v_line_subtotal,
                'pack_snapshot', v_pack_snapshot,
                'match_key', 'pack_' || v_pack_id::TEXT
            );

            -- Detectar componentes on_demand en pack
            FOR v_pack_sub_item IN
                SELECT pi.product_id, pi.quantity, p.name, p.stock_mode
                FROM public.pack_items pi
                JOIN public.products p ON p.id = pi.product_id
                WHERE pi.pack_id = v_pack_id AND p.stock_mode = 'on_demand'
            LOOP
                v_sourcing_queue := v_sourcing_queue || jsonb_build_object(
                    'product_id', v_pack_sub_item.product_id,
                    'product_name', v_pack_sub_item.name,
                    'quantity', v_pack_sub_item.quantity * v_item_qty,
                    'match_key', 'pack_' || v_pack_id::TEXT
                );
            END LOOP;
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

    -- Insertar order_items y sourcing items vinculados
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
            (v_item->>'subtotal')::NUMERIC,
            COALESCE((v_item->>'is_pack')::BOOLEAN, false),
            CASE WHEN (v_item->>'pack_id') IS NOT NULL THEN (v_item->>'pack_id')::UUID ELSE NULL END,
            v_item->'pack_snapshot'
        )
        RETURNING id INTO v_inserted_item_id;

        IF jsonb_array_length(v_sourcing_queue) > 0 THEN
            FOR v_s_item IN SELECT * FROM jsonb_array_elements(v_sourcing_queue)
            LOOP
                IF (v_s_item->>'match_key') = (v_item->>'match_key') THEN
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
        'sourcing_items_count', jsonb_array_length(v_sourcing_queue)
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 12. PERMISOS DE EJECUCIÓN RPC
-- ------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.admin_update_sourcing_item_status(UUID, public.sourcing_status, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_sourcing_items(TEXT, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_sourcing_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(UUID, order_status) TO authenticated;
