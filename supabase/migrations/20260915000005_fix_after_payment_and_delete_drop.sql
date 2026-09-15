-- YA - MIGRACIÓN CRÍTICA: CORRECCIÓN AFTER_PAYMENT Y ELIMINAR DROP
-- 1. Actualizar check_drop_eligibility para after_payment sin exigir 'completed' ni romper enum payment_status_type
-- 2. Actualizar admin_delete_drop para permitir eliminar drops activos y en cascada
-- 3. Asegurar activation_trigger = 'after_payment' para DROP 001

-- ------------------------------------------------------------------------------
-- 1. CORRECCIÓN DE check_drop_eligibility
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_drop_eligibility(
    p_drop_id UUID,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_drop RECORD;
    v_order RECORD;
    v_resolved_order_id UUID := p_order_id;
    v_existing_attempt RECORD;
BEGIN
    -- 1. Validar autenticación
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'auth_required');
    END IF;

    -- Obtener Drop
    SELECT * INTO v_drop FROM public.drops WHERE id = p_drop_id;
    IF v_drop IS NULL THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'drop_not_found');
    END IF;

    -- 2. Comprobar fechas y estado del Drop
    IF v_drop.starts_at > v_now THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'drop_not_started');
    END IF;

    IF v_drop.ends_at <= v_now OR v_drop.status = 'finished' THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'drop_finished');
    END IF;

    -- 3. Comprobaciones según activation_trigger
    IF v_drop.activation_trigger IN ('after_payment', 'after_buy') THEN
        -- Si no se suministró order_id, buscar el pedido más reciente con pago confirmado que no haya usado este Drop
        IF v_resolved_order_id IS NULL THEN
            SELECT o.id INTO v_resolved_order_id
            FROM public.orders o
            WHERE o.user_id = v_user_id
              AND (o.payment_status = 'paid' OR o.is_test = true)
              AND NOT EXISTS (
                  SELECT 1 FROM public.drop_attempts da 
                  WHERE da.drop_id = p_drop_id AND da.order_id = o.id
              )
            ORDER BY o.created_at DESC
            LIMIT 1;
        END IF;

        IF v_resolved_order_id IS NULL THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'order_required', 'trigger', 'after_payment');
        END IF;

        -- Comprobar pedido resuelto
        SELECT * INTO v_order FROM public.orders WHERE id = v_resolved_order_id;
        IF v_order IS NULL THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'order_not_found');
        END IF;

        IF v_order.user_id <> v_user_id THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'order_ownership_mismatch');
        END IF;

        -- REGLA CLAVE after_payment: pago confirmado ('paid') o pedido de prueba admin (0 €)
        -- No exige completed, delivered ni pasarela externa real
        IF v_order.payment_status <> 'paid' AND NOT (COALESCE(v_order.is_test, false) = true) THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'order_not_eligible', 'trigger', 'after_payment');
        END IF;

        -- Comprobar si ya se consumió la tirada para este pedido
        SELECT * INTO v_existing_attempt 
        FROM public.drop_attempts 
        WHERE drop_id = p_drop_id AND order_id = v_resolved_order_id;

        IF v_existing_attempt IS NOT NULL THEN
            RETURN jsonb_build_object(
                'eligible', false,
                'reason', 'already_played',
                'order_id', v_resolved_order_id,
                'attempt_id', v_existing_attempt.id,
                'outcome', v_existing_attempt.outcome
            );
        END IF;

        RETURN jsonb_build_object(
            'eligible', true, 
            'reason', 'ok', 
            'order_id', v_resolved_order_id,
            'trigger', 'after_payment'
        );

    ELSIF v_drop.activation_trigger = 'after_delivery' THEN
        IF v_resolved_order_id IS NULL THEN
            SELECT o.id INTO v_resolved_order_id
            FROM public.orders o
            WHERE o.user_id = v_user_id
              AND (o.status IN ('delivered', 'completed') OR o.is_test = true)
              AND NOT EXISTS (
                  SELECT 1 FROM public.drop_attempts da 
                  WHERE da.drop_id = p_drop_id AND da.order_id = o.id
              )
            ORDER BY o.created_at DESC
            LIMIT 1;
        END IF;

        IF v_resolved_order_id IS NULL THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'order_required', 'trigger', 'after_delivery');
        END IF;

        SELECT * INTO v_order FROM public.orders WHERE id = v_resolved_order_id;
        IF v_order IS NULL THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'order_not_found');
        END IF;

        IF v_order.user_id <> v_user_id THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'order_ownership_mismatch');
        END IF;

        IF v_order.status NOT IN ('delivered', 'completed') AND NOT (COALESCE(v_order.is_test, false) = true) THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'order_not_eligible', 'trigger', 'after_delivery');
        END IF;

        SELECT * INTO v_existing_attempt 
        FROM public.drop_attempts 
        WHERE drop_id = p_drop_id AND order_id = v_resolved_order_id;

        IF v_existing_attempt IS NOT NULL THEN
            RETURN jsonb_build_object(
                'eligible', false,
                'reason', 'already_played',
                'order_id', v_resolved_order_id,
                'attempt_id', v_existing_attempt.id,
                'outcome', v_existing_attempt.outcome
            );
        END IF;

        RETURN jsonb_build_object(
            'eligible', true, 
            'reason', 'ok', 
            'order_id', v_resolved_order_id,
            'trigger', 'after_delivery'
        );

    ELSIF v_drop.activation_trigger = 'free' THEN
        SELECT * INTO v_existing_attempt 
        FROM public.drop_attempts 
        WHERE drop_id = p_drop_id AND user_id = v_user_id;

        IF v_existing_attempt IS NOT NULL THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'already_played_free');
        END IF;

        RETURN jsonb_build_object('eligible', true, 'reason', 'ok', 'trigger', 'free');

    ELSE
        RETURN jsonb_build_object('eligible', true, 'reason', 'ok', 'trigger', v_drop.activation_trigger);
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. CORRECCIÓN DE admin_delete_drop
-- Elimina correctamente el Drop seleccionado y sus datos dependientes (attempts, prizes, awarded)
-- Funciona con drops activos y con el DROP 001 de prueba
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_drop(p_drop_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_drop RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    SELECT * INTO v_drop FROM public.drops WHERE id = p_drop_id;
    IF v_drop IS NULL THEN
        RETURN jsonb_build_object('success', true, 'deleted_drop_id', p_drop_id, 'message', 'Drop ya no existe.');
    END IF;

    -- Eliminar datos dependientes en orden referencial:
    -- 1. Intentos de drops vinculados
    DELETE FROM public.drop_attempts WHERE drop_id = p_drop_id;
    
    -- 2. Premios otorgados a usuarios por este drop
    DELETE FROM public.user_awarded_prizes WHERE drop_id = p_drop_id;
    
    -- 3. Premios del catálogo del drop
    DELETE FROM public.drop_prizes WHERE drop_id = p_drop_id;
    
    -- 4. El registro del drop en sí
    DELETE FROM public.drops WHERE id = p_drop_id;

    RETURN jsonb_build_object('success', true, 'deleted_drop_id', p_drop_id);
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Actualizar constraint y asegurar activation_trigger = 'after_payment' para DROP 001
-- ------------------------------------------------------------------------------
ALTER TABLE public.drops DROP CONSTRAINT IF EXISTS drops_activation_trigger_check;
ALTER TABLE public.drops ADD CONSTRAINT drops_activation_trigger_check 
    CHECK (activation_trigger IN ('after_payment', 'after_delivery', 'after_buy', 'manual', 'code', 'free'));

UPDATE public.drops 
SET activation_trigger = 'after_payment'
WHERE drop_number = 1 OR title ILIKE '%DROP 001%';
