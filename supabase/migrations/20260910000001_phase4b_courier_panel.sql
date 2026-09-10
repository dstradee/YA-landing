-- ==============================================================================
-- YA - MIGRACIÓN: FASE 4B — PANEL DEL REPARTIDOR
-- Archivo: supabase/migrations/20260910000001_phase4b_courier_panel.sql
-- ==============================================================================
-- 1. Ampliación de la tabla public.orders:
--    - delivered_at: marca de tiempo exacta de entrega por el repartidor
--    - courier_accepted_at: marca de tiempo cuando el repartidor acepta el pedido
-- 2. Políticas RLS para couriers en addresses y couriers
-- 3. Funciones RPC seguras con validación estricta de auth.uid() y rol:
--    - courier_set_availability(p_available BOOLEAN)
--    - courier_update_order_status(p_order_id UUID, p_action TEXT)
-- ==============================================================================

-- 1. COLUMNAS DE FECHA/HORA EN PUBLIC.ORDERS
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_accepted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_delivered_at ON public.orders(delivered_at);
CREATE INDEX IF NOT EXISTS idx_orders_courier_id ON public.orders(courier_id);

-- 2. ACTUALIZACIÓN DE POLÍTICAS RLS EN PUBLIC.COURIERS
-- Permite que un repartidor autenticado y activo actualice su propio estado de disponibilidad
DROP POLICY IF EXISTS "Couriers can update own availability" ON public.couriers;
CREATE POLICY "Couriers can update own availability"
    ON public.couriers FOR UPDATE
    TO authenticated
    USING (auth.uid() = profile_id AND active = true)
    WITH CHECK (auth.uid() = profile_id AND active = true);

-- 3. ACTUALIZACIÓN DE POLÍTICAS RLS EN PUBLIC.ADDRESSES
-- Permite que los repartidores asignados a un pedido consulten la dirección de entrega del pedido
DROP POLICY IF EXISTS "Couriers can view assigned order addresses" ON public.addresses;
CREATE POLICY "Couriers can view assigned order addresses"
    ON public.addresses FOR SELECT
    TO authenticated
    USING (
        auth.uid() = user_id
        OR public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.orders o
            JOIN public.couriers c ON o.courier_id = c.id
            WHERE o.address_id = public.addresses.id
            AND c.profile_id = auth.uid()
        )
    );

-- 4. RPC: courier_set_availability
-- Permite a un repartidor activo cambiar su estado de guardia/disponibilidad.
-- Rechaza la solicitud si el repartidor está inactivo (active = false).
CREATE OR REPLACE FUNCTION public.courier_set_availability(
    p_available BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_courier RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autenticado.';
    END IF;

    -- Obtener registro del repartidor correspondiente al usuario
    SELECT id, profile_id, active, available, vehicle_type INTO v_courier
    FROM public.couriers
    WHERE profile_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe un perfil de repartidor para este usuario.';
    END IF;

    -- Regla de negocio estricta: Si está inactivo, NO puede ponerse disponible
    IF NOT v_courier.active AND p_available THEN
        RAISE EXCEPTION 'Tu cuenta de repartidor está inactiva. No puedes ponerte disponible hasta que un administrador la reactive.';
    END IF;

    UPDATE public.couriers
    SET
        available = p_available,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_courier.id
    RETURNING * INTO v_courier;

    RETURN jsonb_build_object(
        'success', true,
        'courier_id', v_courier.id,
        'available', v_courier.available,
        'active', v_courier.active
    );
END;
$$;

-- 5. RPC: courier_update_order_status
-- Permite al repartidor asignar transiciones válidas a SUS PROPIOS pedidos.
-- Acciones permitidas:
--  - 'accept': Acepta el pedido asignado (de received -> preparing/prepared)
--  - 'delivering': Marca como recogido / en camino
--  - 'delivered': Marca como entregado y registra delivered_at
CREATE OR REPLACE FUNCTION public.courier_update_order_status(
    p_order_id UUID,
    p_action TEXT
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
    v_new_status public.order_status;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autenticado.';
    END IF;

    -- Obtener repartidor autenticado
    SELECT id, profile_id, active INTO v_courier
    FROM public.couriers
    WHERE profile_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontró tu perfil de repartidor.';
    END IF;

    IF NOT v_courier.active THEN
        RAISE EXCEPTION 'Tu cuenta de repartidor está inactiva. No puedes gestionar pedidos.';
    END IF;

    -- Obtener pedido y verificar que pertenece a este repartidor
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado.';
    END IF;

    -- Protección contra manipulación: Debe estar asignado a este repartidor
    IF v_order.courier_id IS NULL OR v_order.courier_id <> v_courier.id THEN
        RAISE EXCEPTION 'Acceso denegado: este pedido no está asignado a tu cuenta de repartidor.';
    END IF;

    -- Regla de pago: Pedido con pago pendiente no puede avanzar en reparto
    IF v_order.status = 'payment_pending' OR v_order.payment_status = 'pending' THEN
        RAISE EXCEPTION 'Este pedido tiene el pago pendiente. No puede tramitarse hasta que se confirme el pago.';
    END IF;

    -- Si ya está entregado o cancelado, rechazar
    IF v_order.status = 'delivered' THEN
        RAISE EXCEPTION 'El pedido ya fue marcado como entregado anteriormente.';
    END IF;

    IF v_order.status = 'cancelled' THEN
        RAISE EXCEPTION 'El pedido está cancelado y no puede ser procesado.';
    END IF;

    -- Ejecutar acción según transición válida
    IF p_action = 'accept' THEN
        -- Si está en 'received', avanza a 'preparing' o mantiene 'prepared'
        IF v_order.status = 'received' THEN
            v_new_status := 'preparing';
        ELSE
            v_new_status := v_order.status;
        END IF;

        UPDATE public.orders
        SET
            status = v_new_status,
            courier_accepted_at = COALESCE(courier_accepted_at, v_now),
            updated_at = v_now
        WHERE id = p_order_id;

    ELSIF p_action = 'delivering' OR p_action = 'pickup' THEN
        -- Marca como recogido / en camino
        v_new_status := 'delivering';

        UPDATE public.orders
        SET
            status = v_new_status,
            courier_accepted_at = COALESCE(courier_accepted_at, v_now),
            updated_at = v_now
        WHERE id = p_order_id;

    ELSIF p_action = 'delivered' THEN
        -- Marca como entregado
        v_new_status := 'delivered';

        UPDATE public.orders
        SET
            status = v_new_status,
            delivered_at = v_now,
            updated_at = v_now
        WHERE id = p_order_id;

    ELSE
        RAISE EXCEPTION 'Acción de reparto no válida: %', p_action;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'new_status', v_new_status,
        'action', p_action,
        'delivered_at', CASE WHEN v_new_status = 'delivered' THEN v_now ELSE v_order.delivered_at END
    );
END;
$$;
