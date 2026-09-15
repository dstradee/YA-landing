-- ==============================================================================
-- YA - MIGRACIÓN CRÍTICA: CORRECCIÓN DE game_key, sourcing_status Y after_payment
-- Fecha: 2026-09-15
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CORRECCIÓN SOURCING: trg_sourcing_notifications_handler
-- El enum sourcing_status es ('pending', 'sourcing', 'sourced', 'unavailable', 'cancelled').
-- No contiene 'failed'. El trigger anterior evaluaba NEW.status = 'failed', lo que
-- provocaba: invalid input value for enum sourcing_status: "failed"
-- Se corrige para evaluar 'unavailable' con cast seguro a texto.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sourcing_notifications_handler()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_admin RECORD;
    v_is_test BOOLEAN;
BEGIN
    v_is_test := COALESCE(NEW.is_test, false);

    SELECT id, order_number, user_id INTO v_order
    FROM public.orders
    WHERE id = NEW.order_id;

    -- Si el artículo pasa a 'unavailable', alertar operativamente a los administradores
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status::text = 'unavailable' THEN
        FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' LOOP
            PERFORM public.create_system_notification(
                p_user_id => v_admin.id,
                p_type => 'admin_sourcing_needed',
                p_title => format('Abastecimiento no disponible · Pedido #%s', COALESCE(v_order.order_number, 'N/A')),
                p_message => format('No se pudo abastecer un producto para el pedido #%s. Requiere atención en panel.', COALESCE(v_order.order_number, 'N/A')),
                p_idempotency_key => format('sourcing:%s:unavailable_admin:%s', NEW.id, v_admin.id),
                p_order_id => v_order.id,
                p_link => '/admin/abastecimiento',
                p_is_test => v_is_test,
                p_data => jsonb_build_object('order_number', v_order.order_number, 'sourcing_item_id', NEW.id)
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. CORRECCIÓN DROPS: COLUMNA game_key EN public.drops
-- Añadir game_key como columna física sincronizada con game_type para satisfacer
-- tanto la API PostgREST como la arquitectura técnica de identificador de juego.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'drops'
          AND column_name = 'game_key'
    ) THEN
        ALTER TABLE public.drops ADD COLUMN game_key TEXT;
        UPDATE public.drops SET game_key = COALESCE(game_type, 'jackpot') WHERE game_key IS NULL;
    END IF;
END $$;

-- Mantener game_key y game_type bidireccionalmente sincronizados
CREATE OR REPLACE FUNCTION public.sync_drop_game_identifiers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.game_key IS NOT NULL AND (NEW.game_type IS NULL OR NEW.game_type = '') THEN
        NEW.game_type := NEW.game_key;
    ELSIF NEW.game_type IS NOT NULL AND (NEW.game_key IS NULL OR NEW.game_key = '') THEN
        NEW.game_key := NEW.game_type;
    ELSIF NEW.game_key IS NOT NULL AND NEW.game_type IS NOT NULL AND NEW.game_key <> NEW.game_type THEN
        -- Dar prioridad a game_key si viene informado explícitamente
        NEW.game_type := NEW.game_key;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_drop_game_identifiers ON public.drops;
CREATE TRIGGER trg_sync_drop_game_identifiers
BEFORE INSERT OR UPDATE ON public.drops
FOR EACH ROW
EXECUTE FUNCTION public.sync_drop_game_identifiers();

-- ------------------------------------------------------------------------------
-- 3. DROPS DESPUÉS DEL PEDIDO: check_drop_eligibility
-- Lógica estricta y configurable por Drop:
-- * after_payment / after_buy: Pago confirmado = disponible inmediatamente.
--   NO exige completed ni delivered.
-- * after_delivery: Espera a que el pedido tenga status in ('delivered', 'completed').
-- Si no se envía p_order_id, busca automáticamente el pedido pagado más reciente.
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
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'authentication_required');
    END IF;

    -- 1. Obtener Drop
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
              AND (o.payment_status IN ('paid', 'completed') OR o.is_test = true)
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

        -- REGLA CLAVE: Solo requiere pago confirmado ('paid' o 'completed') o pedido de test
        -- NO exige entregado ni completado
        IF v_order.payment_status NOT IN ('paid', 'completed') AND NOT (COALESCE(v_order.is_test, false) = true) THEN
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
        -- Si no se suministró order_id, buscar el pedido más reciente entregado que no haya usado este Drop
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

        -- REGLA CLAVE after_delivery: Requiere que el pedido esté entregado ('delivered' o 'completed')
        IF v_order.status NOT IN ('delivered', 'completed') AND NOT (COALESCE(v_order.is_test, false) = true) THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'order_not_eligible_for_delivery', 'trigger', 'after_delivery');
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
            RETURN jsonb_build_object('eligible', false, 'reason', 'already_played');
        END IF;

        RETURN jsonb_build_object('eligible', true, 'reason', 'ok', 'trigger', 'free');
    END IF;

    RETURN jsonb_build_object('eligible', true, 'reason', 'ok');
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. ACTUALIZACIÓN AUTORITATIVA DE play_drop
-- Resuelve v_resolved_order_id automáticamente si es NULL y el trigger es after_payment
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.play_drop(
    p_drop_id UUID,
    p_order_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
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
    v_eligibility JSONB;
    v_order_id_to_use UUID := p_order_id;
    v_existing_attempt RECORD;
    v_prizes RECORD;
    v_rand NUMERIC;
    v_cumulative NUMERIC := 0;
    v_won_prize RECORD := NULL;
    v_awarded_prize_id UUID := NULL;
    v_attempt_id UUID;
    v_active_draw RECORD;
    v_consolation_details JSONB := '{}'::jsonb;
    v_validity_days INTEGER;
    v_expires_at TIMESTAMPTZ;
    v_entries_count INTEGER := 1;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    -- 1. Validar elegibilidad
    v_eligibility := public.check_drop_eligibility(p_drop_id, p_order_id);
    IF NOT COALESCE((v_eligibility->>'eligible')::boolean, false) THEN
        RAISE EXCEPTION 'Participación no autorizada: %', (v_eligibility->>'reason');
    END IF;

    -- Si check_drop_eligibility resolvió un order_id automáticamente, usarlo
    IF v_order_id_to_use IS NULL AND (v_eligibility->>'order_id') IS NOT NULL THEN
        v_order_id_to_use := (v_eligibility->>'order_id')::UUID;
    END IF;

    -- 2. Idempotencia por clave
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing_attempt
        FROM public.drop_attempts
        WHERE drop_id = p_drop_id AND idempotency_key = p_idempotency_key;

        IF v_existing_attempt IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_processed', true,
                'attempt_id', v_existing_attempt.id,
                'outcome', v_existing_attempt.outcome,
                'prize_id', v_existing_attempt.prize_id,
                'awarded_prize_id', v_existing_attempt.awarded_prize_id,
                'consolation_details', v_existing_attempt.consolation_details
            );
        END IF;
    END IF;

    -- Obtener Drop con bloqueo para evitar carreras en stock de premios
    SELECT * INTO v_drop FROM public.drops WHERE id = p_drop_id FOR UPDATE;

    -- 3. ALGORITMO AUTORITATIVO DE PREMIOS (RNG en backend)
    v_rand := (random() * 100.0);

    FOR v_prizes IN
        SELECT *
        FROM public.drop_prizes
        WHERE drop_id = p_drop_id
          AND is_active = true
          AND (max_inventory IS NULL OR inventory_consumed < max_inventory)
        ORDER BY sort_order ASC, id ASC
    LOOP
        v_cumulative := v_cumulative + v_prizes.probability_pct;
        IF v_rand < v_cumulative THEN
            v_won_prize := v_prizes;
            EXIT;
        END IF;
    END LOOP;

    -- 4. Procesar resultado
    IF v_won_prize IS NOT NULL THEN
        UPDATE public.drop_prizes
        SET inventory_consumed = inventory_consumed + 1,
            updated_at = v_now
        WHERE id = v_won_prize.id;

        v_validity_days := COALESCE(v_won_prize.validity_days, v_drop.prize_validity_days, 7);
        v_expires_at := v_now + (v_validity_days || ' days')::INTERVAL;

        INSERT INTO public.user_awarded_prizes (
            user_id,
            drop_id,
            prize_id,
            prize_snapshot,
            status,
            expires_at,
            created_at
        ) VALUES (
            v_user_id,
            p_drop_id,
            v_won_prize.id,
            jsonb_build_object(
                'id', v_won_prize.id,
                'name', v_won_prize.name,
                'description', v_won_prize.description,
                'prize_type', v_won_prize.prize_type,
                'prize_value', v_won_prize.prize_value,
                'prize_config', v_won_prize.prize_config,
                'probability_pct', v_won_prize.probability_pct
            ),
            'pending',
            v_expires_at,
            v_now
        )
        RETURNING id INTO v_awarded_prize_id;

        INSERT INTO public.drop_attempts (
            drop_id,
            user_id,
            order_id,
            outcome,
            prize_id,
            awarded_prize_id,
            idempotency_key,
            created_at
        ) VALUES (
            p_drop_id,
            v_user_id,
            v_order_id_to_use,
            'won_prize',
            v_won_prize.id,
            v_awarded_prize_id,
            p_idempotency_key,
            v_now
        )
        RETURNING id INTO v_attempt_id;

        RETURN jsonb_build_object(
            'success', true,
            'outcome', 'won_prize',
            'attempt_id', v_attempt_id,
            'prize_id', v_won_prize.id,
            'awarded_prize_id', v_awarded_prize_id,
            'prize', jsonb_build_object(
                'id', v_won_prize.id,
                'name', v_won_prize.name,
                'description', v_won_prize.description,
                'prize_type', v_won_prize.prize_type,
                'prize_value', v_won_prize.prize_value,
                'expires_at', v_expires_at
            )
        );
    ELSE
        -- Premio de consolación: Participaciones en el Gran Sorteo Mensual
        v_entries_count := COALESCE((v_drop.consolation_config->>'entries_count')::integer, 1);

        SELECT * INTO v_active_draw
        FROM public.monthly_draws
        WHERE status = 'open' AND starts_at <= v_now AND ends_at > v_now
        ORDER BY starts_at DESC
        LIMIT 1;

        IF v_active_draw IS NOT NULL THEN
            INSERT INTO public.monthly_draw_entries (
                draw_id,
                user_id,
                source,
                entries_count,
                metadata,
                created_at
            ) VALUES (
                v_active_draw.id,
                v_user_id,
                'drop_consolation',
                v_entries_count,
                jsonb_build_object('drop_id', p_drop_id, 'order_id', v_order_id_to_use),
                v_now
            );

            v_consolation_details := jsonb_build_object(
                'type', 'monthly_draw_entry',
                'draw_id', v_active_draw.id,
                'draw_title', v_active_draw.title,
                'entries_awarded', v_entries_count
            );
        ELSE
            v_consolation_details := jsonb_build_object(
                'type', 'monthly_draw_entry',
                'entries_awarded', v_entries_count,
                'note', 'Registrado para el próximo sorteo mensual disponible'
            );
        END IF;

        INSERT INTO public.drop_attempts (
            drop_id,
            user_id,
            order_id,
            outcome,
            consolation_details,
            idempotency_key,
            created_at
        ) VALUES (
            p_drop_id,
            v_user_id,
            v_order_id_to_use,
            'consolation',
            v_consolation_details,
            p_idempotency_key,
            v_now
        )
        RETURNING id INTO v_attempt_id;

        RETURN jsonb_build_object(
            'success', true,
            'outcome', 'consolation',
            'attempt_id', v_attempt_id,
            'consolation_details', v_consolation_details
        );
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. RPC ADMIN: admin_delete_drop
-- Asegura que se puedan eliminar Drops de prueba o cancelados
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_drop(p_drop_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_drop RECORD;
    v_active_prizes_count INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    SELECT * INTO v_drop FROM public.drops WHERE id = p_drop_id;
    IF v_drop IS NULL THEN
        RAISE EXCEPTION 'Drop no encontrado.';
    END IF;

    -- Comprobar si está actualmente activo y en curso
    IF v_drop.status = 'active' AND v_drop.starts_at <= v_now AND v_drop.ends_at > v_now THEN
        RAISE EXCEPTION 'No se puede eliminar un Drop activo en curso. Finalízalo o cámbialo a cancelado primero.';
    END IF;

    -- Comprobar si hay premios válidos vigentes pendientes de canje
    SELECT COUNT(*) INTO v_active_prizes_count
    FROM public.user_awarded_prizes
    WHERE drop_id = p_drop_id AND status = 'pending' AND expires_at > v_now;

    IF v_active_prizes_count > 0 THEN
        RAISE EXCEPTION 'No se puede eliminar el Drop: existen % premio(s) vigentes pendientes de canje por clientes.', v_active_prizes_count;
    END IF;

    -- Eliminar intentos, premios y drop
    DELETE FROM public.drop_attempts WHERE drop_id = p_drop_id;
    DELETE FROM public.drop_prizes WHERE drop_id = p_drop_id;
    DELETE FROM public.drops WHERE id = p_drop_id;

    RETURN jsonb_build_object('success', true, 'deleted_drop_id', p_drop_id);
END;
$$;
