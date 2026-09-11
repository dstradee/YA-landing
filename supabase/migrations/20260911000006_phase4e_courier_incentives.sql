-- ==============================================================================
-- YA - MIGRACIÓN: FASE 4E — INCENTIVOS Y RECOMPENSAS PARA REPARTIDORES
-- Archivo: supabase/migrations/20260911000006_phase4e_courier_incentives.sql
-- ==============================================================================
-- 1. Tablas:
--    - public.courier_incentives (definición de objetivos y bonificaciones)
--    - public.courier_incentive_rewards (recompensas conseguidas y congeladas)
-- 2. Restricciones de idempotencia:
--    - UNIQUE (courier_id, incentive_id) en courier_incentive_rewards
-- 3. Funciones server-side de evaluación y entrega de bonus:
--    - check_and_award_courier_incentives(p_courier_id, p_order_id)
-- 4. Triggers para evaluación automática en tiempo real al pasar pedido a 'delivered'
-- 5. RPCs:
--    - courier_get_incentives_overview() (repartidor autenticado)
--    - courier_get_earnings_summary() (actualizado con separación 4D/4E)
--    - admin_get_incentives_overview(p_incentive_id) (administrador)
--    - admin_manage_incentive(...) (administrador CRUD seguro)
-- ==============================================================================

-- 1. TABLA: COURIER_INCENTIVES
CREATE TABLE IF NOT EXISTS public.courier_incentives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    incentive_type TEXT NOT NULL DEFAULT 'delivery_count',
    target_deliveries INTEGER NOT NULL,
    bonus_amount NUMERIC(10, 2) NOT NULL,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_target_deliveries CHECK (target_deliveries >= 1),
    CONSTRAINT chk_bonus_amount CHECK (bonus_amount > 0),
    CONSTRAINT chk_incentive_type CHECK (incentive_type IN ('delivery_count')),
    CONSTRAINT chk_incentive_dates CHECK (end_at IS NULL OR start_at IS NULL OR end_at >= start_at)
);

CREATE INDEX IF NOT EXISTS idx_courier_incentives_active ON public.courier_incentives(active);
CREATE INDEX IF NOT EXISTS idx_courier_incentives_type ON public.courier_incentives(incentive_type);

-- 2. TABLA: COURIER_INCENTIVE_REWARDS
-- Registra las recompensas conseguidas por los repartidores.
-- El importe de bonus_amount queda congelado en el momento de la consecución.
CREATE TABLE IF NOT EXISTS public.courier_incentive_rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incentive_id UUID NOT NULL REFERENCES public.courier_incentives(id) ON DELETE RESTRICT,
    courier_id UUID NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
    trigger_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    achieved_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deliveries_count INTEGER NOT NULL CHECK (deliveries_count >= 1),
    bonus_amount NUMERIC(10, 2) NOT NULL CHECK (bonus_amount > 0),
    status TEXT NOT NULL DEFAULT 'earned' CHECK (status IN ('earned', 'pending', 'paid', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_courier_incentive_reward UNIQUE (courier_id, incentive_id)
);

CREATE INDEX IF NOT EXISTS idx_rewards_courier ON public.courier_incentive_rewards(courier_id);
CREATE INDEX IF NOT EXISTS idx_rewards_incentive ON public.courier_incentive_rewards(incentive_id);
CREATE INDEX IF NOT EXISTS idx_rewards_achieved_at ON public.courier_incentive_rewards(achieved_at);
CREATE INDEX IF NOT EXISTS idx_rewards_status ON public.courier_incentive_rewards(status);

-- 3. POLÍTICAS DE SEGURIDAD (RLS)
ALTER TABLE public.courier_incentives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_incentive_rewards ENABLE ROW LEVEL SECURITY;

-- courier_incentives
DROP POLICY IF EXISTS "Authenticated can view incentives" ON public.courier_incentives;
CREATE POLICY "Authenticated can view incentives"
    ON public.courier_incentives FOR SELECT
    TO authenticated
    USING (active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admin can manage incentives" ON public.courier_incentives;
CREATE POLICY "Admin can manage incentives"
    ON public.courier_incentives FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- courier_incentive_rewards
DROP POLICY IF EXISTS "Couriers can view own rewards" ON public.courier_incentive_rewards;
CREATE POLICY "Couriers can view own rewards"
    ON public.courier_incentive_rewards FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.couriers c
            WHERE c.id = courier_incentive_rewards.courier_id
              AND c.profile_id = auth.uid()
        )
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "Admin can manage rewards" ON public.courier_incentive_rewards;
CREATE POLICY "Admin can manage rewards"
    ON public.courier_incentive_rewards FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 4. FUNCIÓN INTERNA: EVALUACIÓN Y CONCESIÓN IDEMPOTENTE DE INCENTIVOS
CREATE OR REPLACE FUNCTION public.check_and_award_courier_incentives(
    p_courier_id UUID,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inc RECORD;
    v_count INTEGER := 0;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_new_rewards_count INTEGER := 0;
    v_awarded_list JSONB := '[]'::jsonb;
BEGIN
    IF p_courier_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ID de repartidor no proporcionado.');
    END IF;

    -- Iterar sobre todos los incentivos activos actualmente vigentes
    FOR v_inc IN
        SELECT *
        FROM public.courier_incentives
        WHERE active = true
          AND (start_at IS NULL OR v_now >= start_at)
          AND (end_at IS NULL OR v_now <= end_at)
        ORDER BY target_deliveries ASC
    LOOP
        -- 1. Verificar si este repartidor ya consiguió este incentivo (Idempotencia)
        IF NOT EXISTS (
            SELECT 1
            FROM public.courier_incentive_rewards
            WHERE courier_id = p_courier_id
              AND incentive_id = v_inc.id
        ) THEN
            -- 2. Contabilizar pedidos válidos entregados por este repartidor dentro del periodo del incentivo
            -- REGLA: orders.status = 'delivered', tanto reales como is_test = true cuentan
            SELECT COUNT(*) INTO v_count
            FROM public.orders o
            WHERE o.courier_id = p_courier_id
              AND o.status = 'delivered'
              AND (v_inc.start_at IS NULL OR COALESCE(o.delivered_at, o.updated_at) >= v_inc.start_at)
              AND (v_inc.end_at IS NULL OR COALESCE(o.delivered_at, o.updated_at) <= v_inc.end_at);

            -- 3. Si alcanza el objetivo, conceder y congelar el bonus
            IF v_count >= v_inc.target_deliveries THEN
                INSERT INTO public.courier_incentive_rewards (
                    incentive_id,
                    courier_id,
                    trigger_order_id,
                    achieved_at,
                    deliveries_count,
                    bonus_amount,
                    status
                ) VALUES (
                    v_inc.id,
                    p_courier_id,
                    p_order_id,
                    v_now,
                    v_count,
                    v_inc.bonus_amount, -- congelado permanentemente
                    'earned'
                )
                ON CONFLICT (courier_id, incentive_id) DO NOTHING;

                IF FOUND THEN
                    v_new_rewards_count := v_new_rewards_count + 1;
                    v_awarded_list := v_awarded_list || jsonb_build_object(
                        'incentive_id', v_inc.id,
                        'name', v_inc.name,
                        'bonus_amount', v_inc.bonus_amount,
                        'target_deliveries', v_inc.target_deliveries
                    );
                END IF;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'courier_id', p_courier_id,
        'new_rewards_awarded', v_new_rewards_count,
        'awarded', v_awarded_list
    );
END;
$$;

-- 5. TRIGGER SOBRE PUBLIC.ORDERS AL PASAR A DELIVERED
CREATE OR REPLACE FUNCTION public.trg_order_delivered_check_incentives()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') AND NEW.courier_id IS NOT NULL THEN
        PERFORM public.check_and_award_courier_incentives(NEW.courier_id, NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_incentives_on_order_delivered ON public.orders;
CREATE TRIGGER trg_check_incentives_on_order_delivered
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_order_delivered_check_incentives();

-- 6. ACTUALIZAR COURIER_UPDATE_ORDER_STATUS PARA INTEGRAR INCENTIVOS DE MANERA ATÓMICA
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
    v_calculated_payout NUMERIC(10, 2) := NULL;
    v_incentive_eval JSONB := '{}'::jsonb;
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
        v_new_status := 'delivering';

        UPDATE public.orders
        SET
            status = v_new_status,
            courier_accepted_at = COALESCE(courier_accepted_at, v_now),
            updated_at = v_now
        WHERE id = p_order_id;

    ELSIF p_action = 'delivered' THEN
        v_new_status := 'delivered';

        -- Cálculo congelado exacto de ganancia: (subtotal * commission_percent / 100) + fixed_fee (Fase 4D)
        IF v_order.courier_commission_percent IS NOT NULL OR v_order.courier_fixed_fee IS NOT NULL THEN
            v_calculated_payout := ROUND(
                (COALESCE(v_order.subtotal, 0) * COALESCE(v_order.courier_commission_percent, 0) / 100.0) +
                COALESCE(v_order.courier_fixed_fee, 0),
                2
            );
        END IF;

        UPDATE public.orders
        SET
            status = v_new_status,
            delivered_at = v_now,
            courier_payout_total = COALESCE(v_calculated_payout, courier_payout_total),
            updated_at = v_now
        WHERE id = p_order_id;

        -- FASE 4E: Evaluar incentivos inmediatamente al completar la entrega
        v_incentive_eval := public.check_and_award_courier_incentives(v_courier.id, p_order_id);

    ELSE
        RAISE EXCEPTION 'Acción de reparto no válida: %', p_action;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'new_status', v_new_status,
        'action', p_action,
        'delivered_at', CASE WHEN v_new_status = 'delivered' THEN v_now ELSE v_order.delivered_at END,
        'courier_payout_total', v_calculated_payout,
        'incentive_eval', v_incentive_eval
    );
END;
$$;

-- 7. RPC: courier_get_incentives_overview()
-- Permite al repartidor consultar sus incentivos activos, progreso exacto y recompensas conseguidas
CREATE OR REPLACE FUNCTION public.courier_get_incentives_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_courier RECORD;
    v_incentives JSONB := '[]'::jsonb;
    v_rewards JSONB := '[]'::jsonb;
    v_total_bonuses_earned NUMERIC(10, 2) := 0;
    v_total_bonuses_count INTEGER := 0;
    v_today_bonuses NUMERIC(10, 2) := 0;
    v_week_bonuses NUMERIC(10, 2) := 0;
    v_month_bonuses NUMERIC(10, 2) := 0;
    v_today_start TIMESTAMPTZ;
    v_week_start TIMESTAMPTZ;
    v_month_start TIMESTAMPTZ;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autenticado.';
    END IF;

    SELECT id, profile_id, active INTO v_courier
    FROM public.couriers
    WHERE profile_id = v_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'incentives', '[]'::jsonb,
            'rewards', '[]'::jsonb,
            'summary', jsonb_build_object('total_count', 0, 'total_earned', 0, 'today_earned', 0, 'week_earned', 0, 'month_earned', 0)
        );
    END IF;

    -- Evaluar de forma idempotente para asegurar que cualquier entrega reciente esté procesada
    PERFORM public.check_and_award_courier_incentives(v_courier.id);

    v_today_start := date_trunc('day', v_now);
    v_week_start  := date_trunc('week', v_now);
    v_month_start := date_trunc('month', v_now);

    -- 1. Obtener incentivos con progreso para este repartidor
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', inc.id,
                'name', inc.name,
                'description', inc.description,
                'incentive_type', inc.incentive_type,
                'target_deliveries', inc.target_deliveries,
                'bonus_amount', inc.bonus_amount,
                'active', inc.active,
                'start_at', inc.start_at,
                'end_at', inc.end_at,
                'is_expired', (inc.end_at IS NOT NULL AND v_now > inc.end_at),
                'is_future', (inc.start_at IS NOT NULL AND v_now < inc.start_at),
                'current_deliveries', COALESCE(o_stats.delivered_count, 0),
                'remaining_deliveries', GREATEST(inc.target_deliveries - COALESCE(o_stats.delivered_count, 0), 0),
                'progress_percent', LEAST(
                    ROUND((COALESCE(o_stats.delivered_count, 0)::NUMERIC / inc.target_deliveries::NUMERIC) * 100.0, 1),
                    100.0
                ),
                'is_achieved', (rew.id IS NOT NULL),
                'achieved_reward', CASE WHEN rew.id IS NOT NULL THEN jsonb_build_object(
                    'id', rew.id,
                    'bonus_amount', rew.bonus_amount,
                    'achieved_at', rew.achieved_at,
                    'status', rew.status,
                    'deliveries_count', rew.deliveries_count
                ) ELSE NULL END,
                'status_badge', CASE
                    WHEN rew.id IS NOT NULL THEN 'achieved'
                    WHEN inc.end_at IS NOT NULL AND v_now > inc.end_at THEN 'expired'
                    WHEN inc.start_at IS NOT NULL AND v_now < inc.start_at THEN 'upcoming'
                    ELSE 'in_progress'
                END
            ) ORDER BY
                CASE WHEN rew.id IS NOT NULL THEN 1 ELSE 0 END ASC,
                inc.target_deliveries ASC,
                inc.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_incentives
    FROM public.courier_incentives inc
    LEFT JOIN public.courier_incentive_rewards rew
        ON rew.incentive_id = inc.id AND rew.courier_id = v_courier.id
    LEFT JOIN LATERAL (
        SELECT COUNT(*) as delivered_count
        FROM public.orders o
        WHERE o.courier_id = v_courier.id
          AND o.status = 'delivered'
          AND (inc.start_at IS NULL OR COALESCE(o.delivered_at, o.updated_at) >= inc.start_at)
          AND (inc.end_at IS NULL OR COALESCE(o.delivered_at, o.updated_at) <= inc.end_at)
    ) o_stats ON true
    WHERE inc.active = true OR rew.id IS NOT NULL;

    -- 2. Historial de recompensas conseguidas por este repartidor
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', r.id,
                'incentive_id', r.incentive_id,
                'incentive_name', inc.name,
                'target_deliveries', inc.target_deliveries,
                'deliveries_count', r.deliveries_count,
                'bonus_amount', r.bonus_amount,
                'status', r.status,
                'achieved_at', r.achieved_at,
                'created_at', r.created_at,
                'trigger_order_id', r.trigger_order_id
            ) ORDER BY r.achieved_at DESC
        ),
        '[]'::jsonb
    ) INTO v_rewards
    FROM public.courier_incentive_rewards r
    JOIN public.courier_incentives inc ON inc.id = r.incentive_id
    WHERE r.courier_id = v_courier.id;

    -- 3. Métricas acumuladas de bonus
    SELECT
        COALESCE(SUM(r.bonus_amount), 0),
        COUNT(*),
        COALESCE(SUM(CASE WHEN r.achieved_at >= v_today_start THEN r.bonus_amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN r.achieved_at >= v_week_start THEN r.bonus_amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN r.achieved_at >= v_month_start THEN r.bonus_amount ELSE 0 END), 0)
    INTO
        v_total_bonuses_earned,
        v_total_bonuses_count,
        v_today_bonuses,
        v_week_bonuses,
        v_month_bonuses
    FROM public.courier_incentive_rewards r
    WHERE r.courier_id = v_courier.id
      AND r.status <> 'cancelled';

    RETURN jsonb_build_object(
        'incentives', v_incentives,
        'rewards', v_rewards,
        'summary', jsonb_build_object(
            'total_count', v_total_bonuses_count,
            'total_earned', v_total_bonuses_earned,
            'today_earned', v_today_bonuses,
            'week_earned', v_week_bonuses,
            'month_earned', v_month_bonuses
        )
    );
END;
$$;

-- 8. ACTUALIZAR COURIER_GET_EARNINGS_SUMMARY (INTEGRACIÓN 4D + 4E CON SEPARACIÓN ESTRICTA)
CREATE OR REPLACE FUNCTION public.courier_get_earnings_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_courier RECORD;
    v_today_start TIMESTAMPTZ;
    v_week_start TIMESTAMPTZ;
    v_month_start TIMESTAMPTZ;
    v_today_earnings NUMERIC(10, 2) := 0;
    v_today_count INTEGER := 0;
    v_week_earnings NUMERIC(10, 2) := 0;
    v_week_count INTEGER := 0;
    v_month_earnings NUMERIC(10, 2) := 0;
    v_month_count INTEGER := 0;
    v_total_earnings NUMERIC(10, 2) := 0;
    v_total_count INTEGER := 0;
    v_today_bonus NUMERIC(10, 2) := 0;
    v_week_bonus NUMERIC(10, 2) := 0;
    v_month_bonus NUMERIC(10, 2) := 0;
    v_total_bonus NUMERIC(10, 2) := 0;
    v_total_bonus_count INTEGER := 0;
    v_orders JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acceso no autenticado.';
    END IF;

    SELECT id INTO v_courier
    FROM public.couriers
    WHERE profile_id = v_user_id;

    IF NOT FOUND THEN
        IF NOT public.is_admin() THEN
            RETURN jsonb_build_object(
                'today', jsonb_build_object('earnings', 0, 'bonus_earnings', 0, 'total_payout', 0, 'count', 0, 'avg', 0),
                'this_week', jsonb_build_object('earnings', 0, 'bonus_earnings', 0, 'total_payout', 0, 'count', 0, 'avg', 0),
                'this_month', jsonb_build_object('earnings', 0, 'bonus_earnings', 0, 'total_payout', 0, 'count', 0, 'avg', 0),
                'all_time', jsonb_build_object('earnings', 0, 'bonus_earnings', 0, 'total_payout', 0, 'count', 0, 'avg', 0),
                'orders', '[]'::jsonb
            );
        END IF;
    END IF;

    -- Intervalos temporales basados en UTC/servidor
    v_today_start := date_trunc('day', timezone('utc', now()));
    v_week_start  := date_trunc('week', timezone('utc', now()));
    v_month_start := date_trunc('month', timezone('utc', now()));

    -- 1. Métricas de pedidos entregados (FASE 4D)
    SELECT
        COALESCE(SUM(
            CASE WHEN COALESCE(o.delivered_at, o.updated_at) >= v_today_start THEN
                COALESCE(o.courier_payout_total,
                    ROUND((COALESCE(o.subtotal, 0) * COALESCE(o.courier_commission_percent, 0) / 100.0) + COALESCE(o.courier_fixed_fee, 0), 2)
                )
            ELSE 0 END
        ), 0),
        COUNT(*) FILTER (WHERE COALESCE(o.delivered_at, o.updated_at) >= v_today_start),

        COALESCE(SUM(
            CASE WHEN COALESCE(o.delivered_at, o.updated_at) >= v_week_start THEN
                COALESCE(o.courier_payout_total,
                    ROUND((COALESCE(o.subtotal, 0) * COALESCE(o.courier_commission_percent, 0) / 100.0) + COALESCE(o.courier_fixed_fee, 0), 2)
                )
            ELSE 0 END
        ), 0),
        COUNT(*) FILTER (WHERE COALESCE(o.delivered_at, o.updated_at) >= v_week_start),

        COALESCE(SUM(
            CASE WHEN COALESCE(o.delivered_at, o.updated_at) >= v_month_start THEN
                COALESCE(o.courier_payout_total,
                    ROUND((COALESCE(o.subtotal, 0) * COALESCE(o.courier_commission_percent, 0) / 100.0) + COALESCE(o.courier_fixed_fee, 0), 2)
                )
            ELSE 0 END
        ), 0),
        COUNT(*) FILTER (WHERE COALESCE(o.delivered_at, o.updated_at) >= v_month_start),

        COALESCE(SUM(
            COALESCE(o.courier_payout_total,
                ROUND((COALESCE(o.subtotal, 0) * COALESCE(o.courier_commission_percent, 0) / 100.0) + COALESCE(o.courier_fixed_fee, 0), 2)
            )
        ), 0),
        COUNT(*)
    INTO
        v_today_earnings, v_today_count,
        v_week_earnings, v_week_count,
        v_month_earnings, v_month_count,
        v_total_earnings, v_total_count
    FROM public.orders o
    WHERE o.courier_id = v_courier.id
      AND o.status = 'delivered';

    -- 2. Métricas de bonus e incentivos (FASE 4E)
    SELECT
        COALESCE(SUM(CASE WHEN r.achieved_at >= v_today_start THEN r.bonus_amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN r.achieved_at >= v_week_start THEN r.bonus_amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN r.achieved_at >= v_month_start THEN r.bonus_amount ELSE 0 END), 0),
        COALESCE(SUM(r.bonus_amount), 0),
        COUNT(*)
    INTO
        v_today_bonus,
        v_week_bonus,
        v_month_bonus,
        v_total_bonus,
        v_total_bonus_count
    FROM public.courier_incentive_rewards r
    WHERE r.courier_id = v_courier.id
      AND r.status <> 'cancelled';

    -- 3. Lista de pedidos entregados con desglose financiero exacto
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', o.id,
                'order_number', o.order_number,
                'subtotal', o.subtotal,
                'delivery_fee', o.delivery_fee,
                'total', o.total,
                'payment_method', o.payment_method,
                'is_test', COALESCE(o.is_test, false),
                'commission_percent', o.courier_commission_percent,
                'fixed_fee', o.courier_fixed_fee,
                'payout_total', COALESCE(o.courier_payout_total,
                    CASE WHEN o.courier_commission_percent IS NOT NULL OR o.courier_fixed_fee IS NOT NULL THEN
                        ROUND((COALESCE(o.subtotal, 0) * COALESCE(o.courier_commission_percent, 0) / 100.0) + COALESCE(o.courier_fixed_fee, 0), 2)
                    ELSE 0 END
                ),
                'has_commission_configured', (o.courier_commission_percent IS NOT NULL OR o.courier_fixed_fee IS NOT NULL),
                'delivered_at', COALESCE(o.delivered_at, o.updated_at),
                'created_at', o.created_at,
                'delivery_address_snapshot', o.delivery_address_snapshot
            ) ORDER BY COALESCE(o.delivered_at, o.updated_at) DESC
        ),
        '[]'::jsonb
    ) INTO v_orders
    FROM public.orders o
    WHERE o.courier_id = v_courier.id
      AND o.status = 'delivered';

    RETURN jsonb_build_object(
        'today', jsonb_build_object(
            'earnings', v_today_earnings,
            'bonus_earnings', v_today_bonus,
            'total_payout', (v_today_earnings + v_today_bonus),
            'count', v_today_count,
            'avg', CASE WHEN v_today_count > 0 THEN ROUND(v_today_earnings / v_today_count, 2) ELSE 0 END
        ),
        'this_week', jsonb_build_object(
            'earnings', v_week_earnings,
            'bonus_earnings', v_week_bonus,
            'total_payout', (v_week_earnings + v_week_bonus),
            'count', v_week_count,
            'avg', CASE WHEN v_week_count > 0 THEN ROUND(v_week_earnings / v_week_count, 2) ELSE 0 END
        ),
        'this_month', jsonb_build_object(
            'earnings', v_month_earnings,
            'bonus_earnings', v_month_bonus,
            'total_payout', (v_month_earnings + v_month_bonus),
            'count', v_month_count,
            'avg', CASE WHEN v_month_count > 0 THEN ROUND(v_month_earnings / v_month_count, 2) ELSE 0 END
        ),
        'all_time', jsonb_build_object(
            'earnings', v_total_earnings,
            'bonus_earnings', v_total_bonus,
            'total_payout', (v_total_earnings + v_total_bonus),
            'count', v_total_count,
            'avg', CASE WHEN v_total_count > 0 THEN ROUND(v_total_earnings / v_total_count, 2) ELSE 0 END
        ),
        'orders', v_orders
    );
END;
$$;

-- 9. RPC: admin_get_incentives_overview(p_incentive_id UUID DEFAULT NULL)
-- Vista administrativa completa: incentivos, progreso por repartidor y recompensas conseguidas
CREATE OR REPLACE FUNCTION public.admin_get_incentives_overview(
    p_incentive_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_incentives JSONB := '[]'::jsonb;
    v_rewards JSONB := '[]'::jsonb;
    v_couriers_progress JSONB := '[]'::jsonb;
    v_total_incentives INTEGER := 0;
    v_active_incentives INTEGER := 0;
    v_total_rewards_count INTEGER := 0;
    v_total_bonus_amount NUMERIC(10, 2) := 0;
BEGIN
    SELECT public.is_admin() INTO v_is_admin;
    IF NOT COALESCE(v_is_admin, false) THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    -- 1. Listado de incentivos con contadores agregados
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', inc.id,
                'name', inc.name,
                'description', inc.description,
                'active', inc.active,
                'incentive_type', inc.incentive_type,
                'target_deliveries', inc.target_deliveries,
                'bonus_amount', inc.bonus_amount,
                'start_at', inc.start_at,
                'end_at', inc.end_at,
                'created_at', inc.created_at,
                'updated_at', inc.updated_at,
                'total_rewards', COALESCE(r_stats.reward_count, 0),
                'total_bonus_paid', COALESCE(r_stats.bonus_sum, 0)
            ) ORDER BY inc.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_incentives
    FROM public.courier_incentives inc
    LEFT JOIN LATERAL (
        SELECT COUNT(*) as reward_count, SUM(bonus_amount) as bonus_sum
        FROM public.courier_incentive_rewards rew
        WHERE rew.incentive_id = inc.id
          AND rew.status <> 'cancelled'
    ) r_stats ON true
    WHERE p_incentive_id IS NULL OR inc.id = p_incentive_id;

    -- 2. Progreso por repartidor para cada incentivo (o el seleccionado)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'courier_id', c.id,
                'profile_id', c.profile_id,
                'full_name', COALESCE(p.full_name, 'Repartidor sin nombre'),
                'email', p.email,
                'phone', p.phone,
                'active', c.active,
                'available', c.available,
                'incentive_id', inc.id,
                'incentive_name', inc.name,
                'target_deliveries', inc.target_deliveries,
                'bonus_amount', inc.bonus_amount,
                'deliveries_count', COALESCE(o_stats.delivered_count, 0),
                'progress_percent', LEAST(
                    ROUND((COALESCE(o_stats.delivered_count, 0)::NUMERIC / inc.target_deliveries::NUMERIC) * 100.0, 1),
                    100.0
                ),
                'is_achieved', (rew.id IS NOT NULL),
                'reward', CASE WHEN rew.id IS NOT NULL THEN jsonb_build_object(
                    'id', rew.id,
                    'bonus_amount', rew.bonus_amount,
                    'achieved_at', rew.achieved_at,
                    'status', rew.status
                ) ELSE NULL END
            ) ORDER BY inc.name ASC, COALESCE(o_stats.delivered_count, 0) DESC
        ),
        '[]'::jsonb
    ) INTO v_couriers_progress
    FROM public.courier_incentives inc
    CROSS JOIN public.couriers c
    LEFT JOIN public.profiles p ON p.id = c.profile_id
    LEFT JOIN public.courier_incentive_rewards rew
        ON rew.incentive_id = inc.id AND rew.courier_id = c.id
    LEFT JOIN LATERAL (
        SELECT COUNT(*) as delivered_count
        FROM public.orders o
        WHERE o.courier_id = c.id
          AND o.status = 'delivered'
          AND (inc.start_at IS NULL OR COALESCE(o.delivered_at, o.updated_at) >= inc.start_at)
          AND (inc.end_at IS NULL OR COALESCE(o.delivered_at, o.updated_at) <= inc.end_at)
    ) o_stats ON true
    WHERE inc.active = true
      AND (p_incentive_id IS NULL OR inc.id = p_incentive_id);

    -- 3. Historial de recompensas conseguidas global
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', r.id,
                'incentive_id', r.incentive_id,
                'incentive_name', inc.name,
                'courier_id', r.courier_id,
                'courier_name', COALESCE(p.full_name, 'Repartidor sin nombre'),
                'courier_email', p.email,
                'target_deliveries', inc.target_deliveries,
                'deliveries_count', r.deliveries_count,
                'bonus_amount', r.bonus_amount,
                'status', r.status,
                'achieved_at', r.achieved_at,
                'created_at', r.created_at
            ) ORDER BY r.achieved_at DESC
        ),
        '[]'::jsonb
    ) INTO v_rewards
    FROM public.courier_incentive_rewards r
    JOIN public.courier_incentives inc ON inc.id = r.incentive_id
    JOIN public.couriers c ON c.id = r.courier_id
    LEFT JOIN public.profiles p ON p.id = c.profile_id
    WHERE (p_incentive_id IS NULL OR r.incentive_id = p_incentive_id);

    -- 4. Totales globales
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE active = true)
    INTO v_total_incentives, v_active_incentives
    FROM public.courier_incentives;

    SELECT
        COUNT(*),
        COALESCE(SUM(bonus_amount), 0)
    INTO v_total_rewards_count, v_total_bonus_amount
    FROM public.courier_incentive_rewards
    WHERE status <> 'cancelled';

    RETURN jsonb_build_object(
        'incentives', v_incentives,
        'couriers_progress', v_couriers_progress,
        'rewards', v_rewards,
        'summary', jsonb_build_object(
            'total_incentives', v_total_incentives,
            'active_incentives', v_active_incentives,
            'total_rewards', v_total_rewards_count,
            'total_bonus_amount', v_total_bonus_amount
        )
    );
END;
$$;

-- 10. RPC: admin_manage_incentive(...)
-- Gestión CRUD completa y segura de incentivos para el panel de administración
CREATE OR REPLACE FUNCTION public.admin_manage_incentive(
    p_action TEXT,
    p_id UUID DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_target_deliveries INTEGER DEFAULT NULL,
    p_bonus_amount NUMERIC DEFAULT NULL,
    p_start_at TIMESTAMPTZ DEFAULT NULL,
    p_end_at TIMESTAMPTZ DEFAULT NULL,
    p_active BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_incentive RECORD;
    v_rewards_count INTEGER := 0;
BEGIN
    SELECT public.is_admin() INTO v_is_admin;
    IF NOT COALESCE(v_is_admin, false) THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    IF p_action = 'create' THEN
        -- Validaciones
        IF p_name IS NULL OR trim(p_name) = '' THEN
            RAISE EXCEPTION 'El nombre del incentivo es obligatorio.';
        END IF;

        IF p_target_deliveries IS NULL OR p_target_deliveries < 1 THEN
            RAISE EXCEPTION 'El objetivo de entregas debe ser como mínimo 1.';
        END IF;

        IF p_bonus_amount IS NULL OR p_bonus_amount <= 0 THEN
            RAISE EXCEPTION 'El importe de la bonificación debe ser superior a 0 €.';
        END IF;

        IF p_start_at IS NOT NULL AND p_end_at IS NOT NULL AND p_end_at < p_start_at THEN
            RAISE EXCEPTION 'La fecha de fin no puede ser anterior a la fecha de inicio.';
        END IF;

        INSERT INTO public.courier_incentives (
            name,
            description,
            active,
            incentive_type,
            target_deliveries,
            bonus_amount,
            start_at,
            end_at,
            created_at,
            updated_at
        ) VALUES (
            trim(p_name),
            trim(p_description),
            COALESCE(p_active, true),
            'delivery_count',
            p_target_deliveries,
            p_bonus_amount,
            p_start_at,
            p_end_at,
            v_now,
            v_now
        )
        RETURNING * INTO v_incentive;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'created',
            'incentive', jsonb_build_object(
                'id', v_incentive.id,
                'name', v_incentive.name,
                'target_deliveries', v_incentive.target_deliveries,
                'bonus_amount', v_incentive.bonus_amount
            )
        );

    ELSIF p_action = 'update' THEN
        IF p_id IS NULL THEN
            RAISE EXCEPTION 'ID de incentivo no proporcionado.';
        END IF;

        IF p_name IS NOT NULL AND trim(p_name) = '' THEN
            RAISE EXCEPTION 'El nombre del incentivo no puede estar vacío.';
        END IF;

        IF p_target_deliveries IS NOT NULL AND p_target_deliveries < 1 THEN
            RAISE EXCEPTION 'El objetivo de entregas debe ser como mínimo 1.';
        END IF;

        IF p_bonus_amount IS NOT NULL AND p_bonus_amount <= 0 THEN
            RAISE EXCEPTION 'El importe de la bonificación debe ser superior a 0 €.';
        END IF;

        IF p_start_at IS NOT NULL AND p_end_at IS NOT NULL AND p_end_at < p_start_at THEN
            RAISE EXCEPTION 'La fecha de fin no puede ser anterior a la fecha de inicio.';
        END IF;

        UPDATE public.courier_incentives
        SET
            name = COALESCE(trim(p_name), name),
            description = CASE WHEN p_description IS NOT NULL THEN trim(p_description) ELSE description END,
            target_deliveries = COALESCE(p_target_deliveries, target_deliveries),
            bonus_amount = COALESCE(p_bonus_amount, bonus_amount),
            start_at = p_start_at,
            end_at = p_end_at,
            active = COALESCE(p_active, active),
            updated_at = v_now
        WHERE id = p_id
        RETURNING * INTO v_incentive;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Incentivo no encontrado.';
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'updated',
            'incentive', jsonb_build_object(
                'id', v_incentive.id,
                'name', v_incentive.name,
                'target_deliveries', v_incentive.target_deliveries,
                'bonus_amount', v_incentive.bonus_amount
            )
        );

    ELSIF p_action = 'toggle_active' THEN
        IF p_id IS NULL THEN
            RAISE EXCEPTION 'ID de incentivo no proporcionado.';
        END IF;

        UPDATE public.courier_incentives
        SET
            active = NOT active,
            updated_at = v_now
        WHERE id = p_id
        RETURNING * INTO v_incentive;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Incentivo no encontrado.';
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'toggle_active',
            'active', v_incentive.active
        );

    ELSIF p_action = 'delete' THEN
        IF p_id IS NULL THEN
            RAISE EXCEPTION 'ID de incentivo no proporcionado.';
        END IF;

        -- REGLA: No eliminar físicamente incentivos con recompensas históricas
        SELECT COUNT(*) INTO v_rewards_count
        FROM public.courier_incentive_rewards
        WHERE incentive_id = p_id;

        IF v_rewards_count > 0 THEN
            UPDATE public.courier_incentives
            SET active = false, updated_at = v_now
            WHERE id = p_id;

            RETURN jsonb_build_object(
                'success', true,
                'action', 'deactivated',
                'message', 'El incentivo tiene recompensas históricas asociadas (' || v_rewards_count || '). Ha sido desactivado para proteger el histórico financiero.'
            );
        ELSE
            DELETE FROM public.courier_incentives WHERE id = p_id;
            RETURN jsonb_build_object(
                'success', true,
                'action', 'deleted',
                'message', 'Incentivo eliminado correctamente.'
            );
        END IF;

    ELSE
        RAISE EXCEPTION 'Acción no válida: %', p_action;
    END IF;
END;
$$;

-- Permisos de ejecución
REVOKE ALL ON FUNCTION public.check_and_award_courier_incentives(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_award_courier_incentives(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.courier_get_incentives_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.courier_get_incentives_overview() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_get_incentives_overview(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_incentives_overview(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_manage_incentive(TEXT, UUID, TEXT, TEXT, INTEGER, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_manage_incentive(TEXT, UUID, TEXT, TEXT, INTEGER, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO authenticated;
