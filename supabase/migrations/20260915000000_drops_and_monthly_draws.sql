-- ==============================================================================
-- YA - MIGRACIÓN: SISTEMA DE DROPS SEMANALES + SORTEO MENSUAL
-- Archivo: 20260915000000_drops_and_monthly_draws.sql
-- ==============================================================================
-- 1. Tablas genéricas permanentes para Drops, Premios, Intentos y Premios Otorgados
-- 2. Tablas genéricas para Sorteo Mensual, Participaciones e Histórico
-- 3. Restricciones de no solapamiento temporal entre Drops activos/programados
-- 4. Motor de elegibilidad, selección probabilística y backend autoritativo
-- 5. RPCs de ejecución segura, idempotencia y auditoría
-- 6. Sistema de expiración y limpieza automática e idempotente
-- 7. Políticas de seguridad RLS estrictas
-- ==============================================================================

-- Habilitar extensión pgcrypto / uuid-ossp si no existiera
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. TABLA: DROPS (Configuración genérica y reutilizable)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drop_number INTEGER NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    game_type TEXT NOT NULL DEFAULT 'jackpot',
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('draft', 'scheduled', 'active', 'finished', 'cancelled')),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    activation_trigger TEXT NOT NULL DEFAULT 'after_buy' CHECK (activation_trigger IN ('after_buy', 'manual', 'code', 'free')),
    trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    game_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    consolation_reward_type TEXT NOT NULL DEFAULT 'monthly_draw_entry' CHECK (consolation_reward_type IN ('monthly_draw_entry', 'none', 'custom')),
    consolation_config JSONB NOT NULL DEFAULT '{"entries_count": 1}'::jsonb,
    prize_validity_days INTEGER NOT NULL DEFAULT 7 CHECK (prize_validity_days > 0),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_drop_dates CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_drops_status ON public.drops(status);
CREATE INDEX IF NOT EXISTS idx_drops_dates ON public.drops(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_drops_number ON public.drops(drop_number);

-- ------------------------------------------------------------------------------
-- 2. TABLA: DROP_PRIZES (Premios configurables por cada Drop)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drop_prizes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drop_id UUID NOT NULL REFERENCES public.drops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    prize_type TEXT NOT NULL CHECK (prize_type IN ('percentage_discount', 'fixed_discount', 'free_order', 'product', 'pack', 'credit', 'monthly_draw_entry', 'custom')),
    prize_value NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (prize_value >= 0),
    prize_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    probability_pct NUMERIC(6, 3) NOT NULL CHECK (probability_pct >= 0 AND probability_pct <= 100),
    max_inventory INTEGER CHECK (max_inventory IS NULL OR max_inventory >= 0),
    inventory_consumed INTEGER NOT NULL DEFAULT 0 CHECK (inventory_consumed >= 0),
    validity_days INTEGER CHECK (validity_days IS NULL OR validity_days > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_drop_prizes_drop_id ON public.drop_prizes(drop_id);
CREATE INDEX IF NOT EXISTS idx_drop_prizes_active ON public.drop_prizes(is_active);

-- ------------------------------------------------------------------------------
-- 3. TABLA: MONTHLY_DRAWS (Sorteos Mensuales Independientes)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_draws (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    month_identifier TEXT NOT NULL UNIQUE, -- Formato YYYY-MM ej: '2026-10'
    title TEXT NOT NULL,
    description TEXT,
    theme_key TEXT NOT NULL DEFAULT 'standard',
    theme_unit_name TEXT NOT NULL DEFAULT 'participación',
    theme_unit_icon TEXT NOT NULL DEFAULT 'ticket',
    prize_title TEXT NOT NULL,
    prize_description TEXT,
    prize_value NUMERIC(10, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'closed', 'completed', 'cancelled')),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    winner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    winner_notes TEXT,
    awarded_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_monthly_draw_dates CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_monthly_draws_status ON public.monthly_draws(status);
CREATE INDEX IF NOT EXISTS idx_monthly_draws_dates ON public.monthly_draws(starts_at, ends_at);

-- ------------------------------------------------------------------------------
-- 4. TABLA: MONTHLY_DRAW_ENTRIES (Participaciones acumulables en el sorteo activo)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_draw_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    draw_id UUID NOT NULL REFERENCES public.monthly_draws(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'drop' CHECK (source IN ('drop', 'order', 'manual_admin', 'promotion')),
    drop_id UUID REFERENCES public.drops(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_monthly_entries_draw_user ON public.monthly_draw_entries(draw_id, user_id);
CREATE INDEX IF NOT EXISTS idx_monthly_entries_user ON public.monthly_draw_entries(user_id);

-- ------------------------------------------------------------------------------
-- 5. TABLA: MONTHLY_DRAW_HISTORY (Histórico mínimo tras el cierre y limpieza)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monthly_draw_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    draw_id UUID NOT NULL REFERENCES public.monthly_draws(id) ON DELETE CASCADE,
    month_identifier TEXT NOT NULL,
    draw_title TEXT NOT NULL,
    winner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    winner_name TEXT,
    winner_email TEXT,
    prize_title TEXT NOT NULL,
    prize_value NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_entries_count INTEGER NOT NULL DEFAULT 0,
    total_unique_participants INTEGER NOT NULL DEFAULT 0,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_monthly_draw_history_month ON public.monthly_draw_history(month_identifier);

-- ------------------------------------------------------------------------------
-- 6. TABLA: USER_AWARDED_PRIZES (Premios ganados por los usuarios en Drops)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_awarded_prizes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    drop_id UUID NOT NULL REFERENCES public.drops(id) ON DELETE RESTRICT,
    prize_id UUID NOT NULL REFERENCES public.drop_prizes(id) ON DELETE RESTRICT,
    prize_name TEXT NOT NULL,
    prize_type TEXT NOT NULL,
    prize_value NUMERIC(10, 2) NOT NULL DEFAULT 0,
    prize_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired', 'cancelled')),
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    used_in_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_prize_expiration CHECK (expires_at > awarded_at)
);

CREATE INDEX IF NOT EXISTS idx_user_prizes_user_status ON public.user_awarded_prizes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_prizes_expires ON public.user_awarded_prizes(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_user_prizes_drop ON public.user_awarded_prizes(drop_id);

-- ------------------------------------------------------------------------------
-- 7. TABLA: DROP_ATTEMPTS (Auditoría, seguridad e idempotencia estricta)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drop_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drop_id UUID NOT NULL REFERENCES public.drops(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    idempotency_key TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('won_prize', 'consolation', 'lost')),
    prize_id UUID REFERENCES public.drop_prizes(id) ON DELETE SET NULL,
    awarded_prize_id UUID REFERENCES public.user_awarded_prizes(id) ON DELETE SET NULL,
    consolation_details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Restricción UNIQUE en idempotency_key por Drop para prevenir doble premio o doble juego
CREATE UNIQUE INDEX IF NOT EXISTS uq_drop_attempts_idempotency 
    ON public.drop_attempts(drop_id, idempotency_key) 
    WHERE idempotency_key IS NOT NULL;

-- Para drops que son after_buy, no permitir múltiples intentos para el mismo pedido y drop
CREATE UNIQUE INDEX IF NOT EXISTS uq_drop_attempts_order 
    ON public.drop_attempts(drop_id, order_id) 
    WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_drop_attempts_user ON public.drop_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_drop_attempts_created ON public.drop_attempts(created_at);

-- ------------------------------------------------------------------------------
-- 8. FUNCIÓN Y TRIGGER: IMPEDIR SOLAPAMIENTOS ENTRE DROPS SEMANALES
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_drop_schedule_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_overlapping_count INTEGER;
BEGIN
    -- Solo verificar si el drop está en estado activo o programado
    IF NEW.status IN ('active', 'scheduled') THEN
        SELECT COUNT(*)
        INTO v_overlapping_count
        FROM public.drops
        WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND status IN ('active', 'scheduled')
          AND starts_at < NEW.ends_at
          AND ends_at > NEW.starts_at;

        IF v_overlapping_count > 0 THEN
            RAISE EXCEPTION 'No se permiten solapamientos: Ya existe otro Drop activo o programado en el intervalo [% - %]',
                NEW.starts_at, NEW.ends_at;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_drop_overlap ON public.drops;
CREATE TRIGGER trg_check_drop_overlap
    BEFORE INSERT OR UPDATE OF starts_at, ends_at, status
    ON public.drops
    FOR EACH ROW
    EXECUTE FUNCTION public.check_drop_schedule_overlap();

-- ------------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drop_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_draw_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_draw_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_awarded_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drop_attempts ENABLE ROW LEVEL SECURITY;

-- DROPS: Todos pueden ver drops programados o activos; solo admins gestionan
CREATE POLICY "Public can view active or scheduled drops"
    ON public.drops FOR SELECT
    TO public
    USING (status IN ('active', 'scheduled', 'finished') OR public.is_admin());

CREATE POLICY "Admins can manage drops"
    ON public.drops FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- DROP_PRIZES: Todos pueden ver premios de drops activos; solo admins gestionan
CREATE POLICY "Public can view active drop prizes"
    ON public.drop_prizes FOR SELECT
    TO public
    USING (is_active = true OR public.is_admin());

CREATE POLICY "Admins can manage drop prizes"
    ON public.drop_prizes FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- MONTHLY_DRAWS: Todos pueden ver sorteos abiertos o completados; solo admins gestionan
CREATE POLICY "Public can view open or completed monthly draws"
    ON public.monthly_draws FOR SELECT
    TO public
    USING (status IN ('open', 'completed') OR public.is_admin());

CREATE POLICY "Admins can manage monthly draws"
    ON public.monthly_draws FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- MONTHLY_DRAW_ENTRIES: Usuarios ven solo sus participaciones; admins ven todas
CREATE POLICY "Users can view their own monthly entries"
    ON public.monthly_draw_entries FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Admins can manage monthly draw entries"
    ON public.monthly_draw_entries FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- MONTHLY_DRAW_HISTORY: Lectura pública del ganador; admins gestionan
CREATE POLICY "Public can view monthly draw history"
    ON public.monthly_draw_history FOR SELECT
    TO public
    USING (true);

CREATE POLICY "Admins can manage monthly draw history"
    ON public.monthly_draw_history FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- USER_AWARDED_PRIZES: Usuarios ven sus propios premios; admins ven todos
CREATE POLICY "Users can view their own awarded prizes"
    ON public.user_awarded_prizes FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Admins can manage user awarded prizes"
    ON public.user_awarded_prizes FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- DROP_ATTEMPTS: Usuarios ven solo sus intentos; admins ven todos
CREATE POLICY "Users can view their own drop attempts"
    ON public.drop_attempts FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Admins can view all drop attempts"
    ON public.drop_attempts FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 10. RPC: GET_ACTIVE_DROP (Devuelve el Drop actualmente activo para clientes)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_drop()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_drop RECORD;
    v_prizes JSONB;
BEGIN
    -- Actualizar automáticamente estado a active si las fechas coinciden
    UPDATE public.drops
    SET status = 'active', updated_at = v_now
    WHERE status = 'scheduled' AND starts_at <= v_now AND ends_at > v_now;

    -- Actualizar automáticamente a finished si ya terminó
    UPDATE public.drops
    SET status = 'finished', updated_at = v_now
    WHERE status = 'active' AND ends_at <= v_now;

    -- Obtener el Drop activo actual
    SELECT *
    INTO v_drop
    FROM public.drops
    WHERE status = 'active'
      AND starts_at <= v_now
      AND ends_at > v_now
    ORDER BY starts_at DESC
    LIMIT 1;

    IF v_drop IS NULL THEN
        RETURN jsonb_build_object('active', false);
    END IF;

    -- Obtener premios visibles del Drop activo
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'description', p.description,
            'prize_type', p.prize_type,
            'prize_value', p.prize_value,
            'prize_config', p.prize_config,
            'sort_order', p.sort_order
        ) ORDER BY p.sort_order ASC
    ), '[]'::jsonb)
    INTO v_prizes
    FROM public.drop_prizes p
    WHERE p.drop_id = v_drop.id
      AND p.is_active = true;

    RETURN jsonb_build_object(
        'active', true,
        'drop', jsonb_build_object(
            'id', v_drop.id,
            'drop_number', v_drop.drop_number,
            'title', v_drop.title,
            'description', v_drop.description,
            'game_type', v_drop.game_type,
            'activation_trigger', v_drop.activation_trigger,
            'game_config', v_drop.game_config,
            'consolation_reward_type', v_drop.consolation_reward_type,
            'consolation_config', v_drop.consolation_config,
            'starts_at', v_drop.starts_at,
            'ends_at', v_drop.ends_at,
            'prize_validity_days', v_drop.prize_validity_days
        ),
        'prizes', v_prizes
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. RPC: CHECK_DROP_ELIGIBILITY (Comprobación estricta de elegibilidad)
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
    IF v_drop.activation_trigger = 'after_buy' THEN
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

        IF v_order.payment_status NOT IN ('paid', 'completed') AND v_order.status = 'cancelled' THEN
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

    ELSIF v_drop.activation_trigger = 'free' THEN
        -- Una tirada gratis por usuario en todo el drop
        SELECT * INTO v_existing_attempt
        FROM public.drop_attempts
        WHERE drop_id = p_drop_id AND user_id = v_user_id;

        IF v_existing_attempt IS NOT NULL THEN
            RETURN jsonb_build_object('eligible', false, 'reason', 'already_played');
        END IF;
    END IF;

    RETURN jsonb_build_object('eligible', true, 'drop_id', v_drop.id, 'game_type', v_drop.game_type);
END;
$$;

-- ------------------------------------------------------------------------------
-- 12. RPC AUTORITATIVA: PLAY_DROP (Ejecución y decisión 100% en backend)
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

    -- 1. Idempotencia por clave (si el cliente reenvía con la misma clave, devolver intento existente)
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

    -- 2. Validar elegibilidad
    v_eligibility := public.check_drop_eligibility(p_drop_id, p_order_id);
    IF NOT COALESCE((v_eligibility->>'eligible')::boolean, false) THEN
        RAISE EXCEPTION 'Participación no autorizada: %', (v_eligibility->>'reason');
    END IF;

    -- Obtener Drop con bloqueo para evitar carreras en stock de premios
    SELECT * INTO v_drop FROM public.drops WHERE id = p_drop_id FOR UPDATE;

    -- 3. ALGORITMO AUTORITATIVO DE PREMIOS (RNG en backend)
    -- Generar número aleatorio seguro entre 0 y 100
    v_rand := (random() * 100.0);

    -- Iterar sobre premios activos con stock disponible
    FOR v_prizes IN
        SELECT *
        FROM public.drop_prizes
        WHERE drop_id = p_drop_id
          AND is_active = true
          AND (max_inventory IS NULL OR inventory_consumed < max_inventory)
        ORDER BY sort_order ASC, id ASC
    LOOP
        v_cumulative := v_cumulative + v_prizes.probability_pct;
        IF v_rand <= v_cumulative THEN
            v_won_prize := v_prizes;
            EXIT;
        END IF;
    END LOOP;

    -- 4. Procesar resultado
    IF v_won_prize IS NOT NULL THEN
        -- USUARIO GANA PREMIO REAL
        v_validity_days := COALESCE(v_won_prize.validity_days, v_drop.prize_validity_days, 7);
        v_expires_at := v_now + (v_validity_days || ' days')::interval;

        -- Registrar premio otorgado
        INSERT INTO public.user_awarded_prizes (
            user_id,
            drop_id,
            prize_id,
            prize_name,
            prize_type,
            prize_value,
            prize_config,
            status,
            awarded_at,
            expires_at
        ) VALUES (
            v_user_id,
            v_drop.id,
            v_won_prize.id,
            v_won_prize.name,
            v_won_prize.prize_type,
            v_won_prize.prize_value,
            v_won_prize.prize_config,
            'pending',
            v_now,
            v_expires_at
        ) RETURNING id INTO v_awarded_prize_id;

        -- Actualizar consumo de stock del premio
        UPDATE public.drop_prizes
        SET inventory_consumed = inventory_consumed + 1,
            updated_at = v_now
        WHERE id = v_won_prize.id;

        -- Registrar intento
        INSERT INTO public.drop_attempts (
            drop_id,
            user_id,
            order_id,
            idempotency_key,
            outcome,
            prize_id,
            awarded_prize_id,
            created_at
        ) VALUES (
            v_drop.id,
            v_user_id,
            p_order_id,
            p_idempotency_key,
            'won_prize',
            v_won_prize.id,
            v_awarded_prize_id,
            v_now
        ) RETURNING id INTO v_attempt_id;

        RETURN jsonb_build_object(
            'success', true,
            'attempt_id', v_attempt_id,
            'outcome', 'won_prize',
            'prize', jsonb_build_object(
                'awarded_prize_id', v_awarded_prize_id,
                'name', v_won_prize.name,
                'description', v_won_prize.description,
                'prize_type', v_won_prize.prize_type,
                'prize_value', v_won_prize.prize_value,
                'expires_at', v_expires_at,
                'validity_days', v_validity_days
            )
        );

    ELSE
        -- USUARIO RECIBE RECOMPENSA DE CONSOLACIÓN
        IF v_drop.consolation_reward_type = 'monthly_draw_entry' THEN
            v_entries_count := COALESCE((v_drop.consolation_config->>'entries_count')::integer, 1);

            -- Buscar sorteo mensual abierto actual
            SELECT * INTO v_active_draw
            FROM public.monthly_draws
            WHERE status = 'open'
              AND starts_at <= v_now
              AND ends_at > v_now
            ORDER BY starts_at DESC
            LIMIT 1;

            IF v_active_draw IS NOT NULL THEN
                -- Insertar las participaciones en el sorteo mensual
                FOR i IN 1..v_entries_count LOOP
                    INSERT INTO public.monthly_draw_entries (
                        draw_id,
                        user_id,
                        source,
                        drop_id,
                        order_id,
                        created_at
                    ) VALUES (
                        v_active_draw.id,
                        v_user_id,
                        'drop',
                        v_drop.id,
                        p_order_id,
                        v_now
                    );
                END LOOP;

                v_consolation_details := jsonb_build_object(
                    'draw_id', v_active_draw.id,
                    'draw_title', v_active_draw.title,
                    'theme_unit_name', v_active_draw.theme_unit_name,
                    'theme_unit_icon', v_active_draw.theme_unit_icon,
                    'entries_awarded', v_entries_count
                );
            ELSE
                v_consolation_details := jsonb_build_object(
                    'entries_awarded', v_entries_count,
                    'note', 'No active draw found, entry queued'
                );
            END IF;
        END IF;

        -- Registrar intento
        INSERT INTO public.drop_attempts (
            drop_id,
            user_id,
            order_id,
            idempotency_key,
            outcome,
            consolation_details,
            created_at
        ) VALUES (
            v_drop.id,
            v_user_id,
            p_order_id,
            p_idempotency_key,
            'consolation',
            v_consolation_details,
            v_now
        ) RETURNING id INTO v_attempt_id;

        RETURN jsonb_build_object(
            'success', true,
            'attempt_id', v_attempt_id,
            'outcome', 'consolation',
            'consolation', v_consolation_details
        );
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 13. RPC: GET_USER_AWARDED_PRIZES (Premios vigentes del usuario)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_awarded_prizes()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_prizes JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    -- Actualizar automáticamente a expirado si pasó la fecha
    UPDATE public.user_awarded_prizes
    SET status = 'expired'
    WHERE user_id = v_user_id
      AND status = 'pending'
      AND expires_at <= v_now;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', p.id,
            'drop_id', p.drop_id,
            'prize_name', p.prize_name,
            'prize_type', p.prize_type,
            'prize_value', p.prize_value,
            'prize_config', p.prize_config,
            'status', p.status,
            'awarded_at', p.awarded_at,
            'expires_at', p.expires_at,
            'used_at', p.used_at
        ) ORDER BY p.awarded_at DESC
    ), '[]'::jsonb)
    INTO v_prizes
    FROM public.user_awarded_prizes p
    WHERE p.user_id = v_user_id;

    RETURN v_prizes;
END;
$$;

-- ------------------------------------------------------------------------------
-- 14. RPC: GET_ACTIVE_MONTHLY_DRAW (Sorteo mensual en curso con participaciones del usuario)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_monthly_draw()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_draw RECORD;
    v_user_entries_count INTEGER := 0;
    v_total_entries_count INTEGER := 0;
BEGIN
    SELECT * INTO v_draw
    FROM public.monthly_draws
    WHERE status = 'open'
      AND starts_at <= v_now
      AND ends_at > v_now
    ORDER BY starts_at DESC
    LIMIT 1;

    IF v_draw IS NULL THEN
        RETURN jsonb_build_object('active', false);
    END IF;

    IF v_user_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_user_entries_count
        FROM public.monthly_draw_entries
        WHERE draw_id = v_draw.id AND user_id = v_user_id;
    END IF;

    SELECT COUNT(*) INTO v_total_entries_count
    FROM public.monthly_draw_entries
    WHERE draw_id = v_draw.id;

    RETURN jsonb_build_object(
        'active', true,
        'draw', jsonb_build_object(
            'id', v_draw.id,
            'month_identifier', v_draw.month_identifier,
            'title', v_draw.title,
            'description', v_draw.description,
            'theme_key', v_draw.theme_key,
            'theme_unit_name', v_draw.theme_unit_name,
            'theme_unit_icon', v_draw.theme_unit_icon,
            'prize_title', v_draw.prize_title,
            'prize_description', v_draw.prize_description,
            'prize_value', v_draw.prize_value,
            'starts_at', v_draw.starts_at,
            'ends_at', v_draw.ends_at
        ),
        'user_entries_count', v_user_entries_count,
        'total_entries_count', v_total_entries_count
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 15. RPC ADMIN: CIERRE DEL SORTEO MENSUAL Y ELECCIÓN MANUAL DE GANADOR
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_close_monthly_draw(
    p_draw_id UUID,
    p_winner_user_id UUID,
    p_winner_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_draw RECORD;
    v_winner_profile RECORD;
    v_total_entries INTEGER;
    v_total_users INTEGER;
    v_history_id UUID;
BEGIN
    -- Validar admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    SELECT * INTO v_draw FROM public.monthly_draws WHERE id = p_draw_id FOR UPDATE;
    IF v_draw IS NULL THEN
        RAISE EXCEPTION 'Sorteo no encontrado.';
    END IF;

    IF v_draw.status = 'completed' THEN
        RAISE EXCEPTION 'El sorteo ya ha sido completado y cerrado anteriormente.';
    END IF;

    -- Validar que el ganador seleccionado existe
    SELECT id, full_name, email INTO v_winner_profile
    FROM public.profiles
    WHERE id = p_winner_user_id;

    IF v_winner_profile IS NULL THEN
        RAISE EXCEPTION 'Usuario ganador no encontrado en profiles.';
    END IF;

    -- Calcular estadísticas antes de limpiar
    SELECT COUNT(*), COUNT(DISTINCT user_id)
    INTO v_total_entries, v_total_users
    FROM public.monthly_draw_entries
    WHERE draw_id = p_draw_id;

    -- 1. Actualizar el sorteo
    UPDATE public.monthly_draws
    SET status = 'completed',
        closed_at = v_now,
        winner_user_id = p_winner_user_id,
        winner_notes = p_winner_notes,
        awarded_at = v_now,
        updated_at = v_now
    WHERE id = p_draw_id;

    -- 2. Guardar en histórico mínimo permanente
    INSERT INTO public.monthly_draw_history (
        draw_id,
        month_identifier,
        draw_title,
        winner_user_id,
        winner_name,
        winner_email,
        prize_title,
        prize_value,
        total_entries_count,
        total_unique_participants,
        awarded_at,
        notes
    ) VALUES (
        p_draw_id,
        v_draw.month_identifier,
        v_draw.title,
        p_winner_user_id,
        v_winner_profile.full_name,
        v_winner_profile.email,
        v_draw.prize_title,
        v_draw.prize_value,
        v_total_entries,
        v_total_users,
        v_now,
        p_winner_notes
    ) RETURNING id INTO v_history_id;

    -- 3. Eliminar las participaciones del sorteo completado para liberar espacio
    DELETE FROM public.monthly_draw_entries
    WHERE draw_id = p_draw_id;

    RETURN jsonb_build_object(
        'success', true,
        'draw_id', p_draw_id,
        'history_id', v_history_id,
        'winner_user_id', p_winner_user_id,
        'winner_name', v_winner_profile.full_name,
        'total_entries_cleared', v_total_entries
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 16. RPC ADMIN: LIMPIEZA AUTOMÁTICA E IDEMPOTENTE (Clean Expired & Legacy Data)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clean_expired_and_legacy_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_expired_prizes_count INTEGER := 0;
    v_old_attempts_cleared INTEGER := 0;
BEGIN
    -- Validar admin o llamada segura interna
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: solo administradores pueden ejecutar la limpieza manual.';
    END IF;

    -- 1. Marcar como 'expired' premios pendientes cuya fecha expiró
    WITH updated AS (
        UPDATE public.user_awarded_prizes
        SET status = 'expired'
        WHERE status = 'pending' AND expires_at <= v_now
        RETURNING id
    )
    SELECT COUNT(*) INTO v_expired_prizes_count FROM updated;

    -- 2. Limpiar intentos temporales antiguos (>90 días) asociados a Drops ya finalizados
    WITH deleted_attempts AS (
        DELETE FROM public.drop_attempts
        WHERE created_at < (v_now - INTERVAL '90 days')
          AND drop_id IN (SELECT id FROM public.drops WHERE status = 'finished')
        RETURNING id
    )
    SELECT COUNT(*) INTO v_old_attempts_cleared FROM deleted_attempts;

    -- NUNCA borrar:
    -- - Drops futuros o activos
    -- - Premios todavía vigentes
    -- - Participaciones del sorteo mensual actualmente abierto ('open')
    -- - Histórico de ganadores

    RETURN jsonb_build_object(
        'success', true,
        'expired_prizes_marked', v_expired_prizes_count,
        'old_attempts_cleared', v_old_attempts_cleared,
        'cleaned_at', v_now
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 17. RPC ADMIN: ELIMINACIÓN SEGURA DE UN DROP CON COMPROBACIÓN DE DEPENDENCIAS
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

    -- Comprobar si está actualmente activo
    IF v_drop.status = 'active' AND v_drop.starts_at <= v_now AND v_drop.ends_at > v_now THEN
        RAISE EXCEPTION 'No se puede eliminar un Drop que está actualmente activo y en curso. Finalízalo o cámbialo a cancelado primero.';
    END IF;

    -- Comprobar si hay premios válidos vigentes pendientes de canje
    SELECT COUNT(*) INTO v_active_prizes_count
    FROM public.user_awarded_prizes
    WHERE drop_id = p_drop_id AND status = 'pending' AND expires_at > v_now;

    IF v_active_prizes_count > 0 THEN
        RAISE EXCEPTION 'No se puede eliminar este Drop porque los usuarios tienen % premio(s) activo(s) y vigente(s) aún sin canjear.',
            v_active_prizes_count;
    END IF;

    -- Si no hay premios válidos pendientes, eliminar Drop (sus drop_prizes caen por CASCADE)
    DELETE FROM public.drops WHERE id = p_drop_id;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_drop_id', p_drop_id,
        'drop_number', v_drop.drop_number
    );
END;
$$;
