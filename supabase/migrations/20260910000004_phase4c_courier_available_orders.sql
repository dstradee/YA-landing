-- ==============================================================================
-- YA DELIVERY - FASE 4C: PEDIDOS DISPONIBLES Y ASIGNACIÓN ATÓMICA DE REPARTIDORES
-- Archivo: supabase/migrations/20260910000004_phase4c_courier_available_orders.sql
-- ==============================================================================
-- 1. Políticas RLS para que repartidores activos y disponibles puedan consultar
--    pedidos no asignados (courier_id IS NULL) que estén pagados y recibidos.
-- 2. RPC: courier_get_available_orders()
--    Consulta segura de pedidos disponibles para repartidores en guardia.
-- 3. RPC: courier_accept_order(p_order_id UUID)
--    Asignación atómica con SELECT ... FOR UPDATE (impide doble asignación concurrente).
-- ==============================================================================

-- 1. POLÍTICA RLS: Pedidos disponibles en public.orders
DROP POLICY IF EXISTS "Couriers can view available unassigned orders" ON public.orders;
CREATE POLICY "Couriers can view available unassigned orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING (
        courier_id IS NULL
        AND status = 'received'
        AND payment_status = 'paid'
        AND (
            public.is_admin()
            OR EXISTS (
                SELECT 1 FROM public.couriers c
                WHERE c.profile_id = auth.uid()
                AND c.active = true
                AND c.available = true
            )
        )
    );

-- 2. POLÍTICA RLS: Items de pedidos disponibles en public.order_items
DROP POLICY IF EXISTS "Couriers can view available order items" ON public.order_items;
CREATE POLICY "Couriers can view available order items"
    ON public.order_items FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = public.order_items.order_id
            AND o.courier_id IS NULL
            AND o.status = 'received'
            AND o.payment_status = 'paid'
            AND (
                public.is_admin()
                OR EXISTS (
                    SELECT 1 FROM public.couriers c
                    WHERE c.profile_id = auth.uid()
                    AND c.active = true
                    AND c.available = true
                )
            )
        )
    );

-- 3. POLÍTICA RLS: Direcciones de entrega de pedidos disponibles en public.addresses
DROP POLICY IF EXISTS "Couriers can view available order addresses" ON public.addresses;
CREATE POLICY "Couriers can view available order addresses"
    ON public.addresses FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.address_id = public.addresses.id
            AND o.courier_id IS NULL
            AND o.status = 'received'
            AND o.payment_status = 'paid'
            AND (
                public.is_admin()
                OR EXISTS (
                    SELECT 1 FROM public.couriers c
                    WHERE c.profile_id = auth.uid()
                    AND c.active = true
                    AND c.available = true
                )
            )
        )
    );

-- 4. RPC: courier_get_available_orders
-- Permite a repartidores activos y disponibles obtener la lista de pedidos pendientes de asignación.
CREATE OR REPLACE FUNCTION public.courier_get_available_orders()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_courier RECORD;
    v_orders JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autenticado.';
    END IF;

    -- Comprobar si es admin o repartidor activo y disponible
    SELECT id, active, available INTO v_courier
    FROM public.couriers
    WHERE profile_id = v_user_id;

    IF NOT FOUND THEN
        IF NOT public.is_admin() THEN
            RETURN '[]'::jsonb;
        END IF;
    ELSE
        -- Si es repartidor pero está inactivo o fuera de servicio, no ve pedidos disponibles
        IF (NOT v_courier.active OR NOT v_courier.available) AND NOT public.is_admin() THEN
            RETURN '[]'::jsonb;
        END IF;
    END IF;

    -- Obtener pedidos pendientes de asignación
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', o.id,
                'order_number', o.order_number,
                'user_id', o.user_id,
                'address_id', o.address_id,
                'delivery_zone_id', o.delivery_zone_id,
                'status', o.status,
                'subtotal', o.subtotal,
                'delivery_fee', o.delivery_fee,
                'total', o.total,
                'discount_total', o.discount_total,
                'payment_method', o.payment_method,
                'payment_status', o.payment_status,
                'is_test', COALESCE(o.is_test, false),
                'notes', o.notes,
                'delivery_address_snapshot', o.delivery_address_snapshot,
                'created_at', o.created_at,
                'items_count', (
                    SELECT COALESCE(SUM(oi.quantity), 0)
                    FROM public.order_items oi
                    WHERE oi.order_id = o.id
                )
            ) ORDER BY o.created_at ASC
        ),
        '[]'::jsonb
    ) INTO v_orders
    FROM public.orders o
    WHERE o.courier_id IS NULL
      AND o.status = 'received'
      AND o.payment_status = 'paid';

    RETURN v_orders;
END;
$$;

-- 5. RPC: courier_accept_order (ATÓMICA Y SEGURA)
-- Bloquea la fila del pedido con FOR UPDATE para impedir doble aceptación concurrente.
CREATE OR REPLACE FUNCTION public.courier_accept_order(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_courier RECORD;
    v_order RECORD;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. Identidad estricta desde auth.uid()
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autenticado.';
    END IF;

    -- 2. Validar que el usuario es un repartidor activo y disponible
    SELECT id, profile_id, active, available, commission_percent, fixed_fee
    INTO v_courier
    FROM public.couriers
    WHERE profile_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontró tu perfil de repartidor en YA.';
    END IF;

    IF NOT v_courier.active THEN
        RAISE EXCEPTION 'Tu cuenta de repartidor está inactiva. No puedes aceptar pedidos.';
    END IF;

    IF NOT v_courier.available THEN
        RAISE EXCEPTION 'Debes ponerte disponible (en guardia) antes de poder aceptar pedidos.';
    END IF;

    -- 3. BLOQUEO ATÓMICO: Si dos repartidores intentan aceptar simultáneamente,
    -- uno adquiere el bloqueo primero y el otro esperará aquí.
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pedido no existe o ya no está disponible.';
    END IF;

    -- 4. Verificar si ya fue tomado por otro repartidor
    IF v_order.courier_id IS NOT NULL THEN
        RAISE EXCEPTION 'Este pedido ya ha sido aceptado por otro repartidor.';
    END IF;

    -- 5. Validar estado y pago
    IF v_order.status <> 'received' THEN
        RAISE EXCEPTION 'El pedido ya no está en estado recibido (estado actual: %).', v_order.status;
    END IF;

    IF v_order.payment_status <> 'paid' THEN
        RAISE EXCEPTION 'El pedido no tiene el pago confirmado y no puede ser asignado.';
    END IF;

    -- 6. ASIGNACIÓN ATÓMICA
    UPDATE public.orders
    SET
        courier_id = v_courier.id,
        courier_assigned_at = v_now,
        courier_accepted_at = v_now,
        courier_commission_percent = COALESCE(courier_commission_percent, v_courier.commission_percent),
        courier_fixed_fee = COALESCE(courier_fixed_fee, v_courier.fixed_fee),
        status = 'preparing'::public.order_status,
        updated_at = v_now
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'order_number', v_order.order_number,
        'courier_id', v_courier.id,
        'status', 'preparing',
        'accepted_at', v_now
    );
END;
$$;

-- Permisos de ejecución
REVOKE ALL ON FUNCTION public.courier_get_available_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.courier_get_available_orders() TO authenticated;

REVOKE ALL ON FUNCTION public.courier_accept_order(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.courier_accept_order(UUID) TO authenticated;
