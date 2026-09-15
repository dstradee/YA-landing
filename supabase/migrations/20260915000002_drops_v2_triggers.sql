ALTER TABLE public.drops DROP CONSTRAINT IF EXISTS drops_activation_trigger_check;
ALTER TABLE public.drops ADD CONSTRAINT drops_activation_trigger_check CHECK (activation_trigger IN ('after_payment', 'after_delivery', 'manual', 'code', 'free', 'after_buy'));

-- Re-create the check function with after_payment and after_delivery logic
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
    v_existing_attempt RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'authentication_required');
    END IF;

    -- Obtener Drop
    SELECT * INTO v_drop FROM public.drops WHERE id = p_drop_id;
    IF v_drop IS NULL THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'drop_not_found');
    END IF;

    -- Comprobar estado y fechas
    IF v_drop.starts_at > v_now THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'drop_not_started');
    END IF;

    IF v_drop.ends_at <= v_now OR v_drop.status = 'finished' THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'drop_finished');
    END IF;

    -- Comprobaciones según activation_trigger
    IF v_drop.activation_trigger IN ('after_payment', 'after_buy') THEN
        IF p_order_id IS NULL THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'order_required');
        END IF;

        -- Comprobar pedido
        SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
        IF v_order IS NULL THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'order_not_found');
        END IF;

        IF v_order.user_id <> v_user_id THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'order_ownership_mismatch');
        END IF;

        IF v_order.payment_status NOT IN ('paid', 'completed') AND NOT (v_order.is_test = true) THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'order_not_eligible');
        END IF;

        -- Comprobar si ya se consumió el intento para este pedido
        SELECT * INTO v_existing_attempt 
        FROM public.drop_attempts 
        WHERE drop_id = p_drop_id AND order_id = p_order_id;

        IF v_existing_attempt IS NOT NULL THEN
            RETURN jsonb_build_object(
                'eligible', false,
                'reason', 'already_played',
                'attempt_id', v_existing_attempt.id,
                'outcome', v_existing_attempt.outcome
            );
        END IF;
    ELSIF v_drop.activation_trigger = 'after_delivery' THEN
        IF p_order_id IS NULL THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'order_required');
        END IF;

        SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
        IF v_order IS NULL THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'order_not_found');
        END IF;

        IF v_order.user_id <> v_user_id THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'order_ownership_mismatch');
        END IF;

        IF v_order.status NOT IN ('delivered', 'completed') AND NOT (v_order.is_test = true) THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'order_not_eligible_for_delivery');
        END IF;

        SELECT * INTO v_existing_attempt 
        FROM public.drop_attempts 
        WHERE drop_id = p_drop_id AND order_id = p_order_id;

        IF v_existing_attempt IS NOT NULL THEN
            RETURN jsonb_build_object(
                'eligible', false,
                'reason', 'already_played',
                'attempt_id', v_existing_attempt.id,
                'outcome', v_existing_attempt.outcome
            );
        END IF;

    ELSIF v_drop.activation_trigger = 'free' THEN
        -- Una tirada gratis por usuario en todo el drop
        SELECT * INTO v_existing_attempt
        FROM public.drop_attempts
        WHERE drop_id = p_drop_id AND user_id = v_user_id;

        IF v_existing_attempt IS NOT NULL THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'already_played');
        END IF;
    END IF;

    RETURN jsonb_build_object('eligible', true, 'reason', 'ok');
END;
$$;
