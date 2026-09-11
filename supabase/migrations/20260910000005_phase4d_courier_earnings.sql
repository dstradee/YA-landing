-- ==============================================================================
-- YA - MIGRACIÓN: FASE 4D — CÁLCULO Y GESTIÓN DE GANANCIAS DE REPARTIDORES
-- Archivo: supabase/migrations/20260910000005_phase4d_courier_earnings.sql
-- ==============================================================================
-- 1. Actualización atómica de courier_update_order_status para congelar courier_payout_total al marcar delivered
-- 2. Backfill seguro de courier_payout_total en pedidos históricos ya entregados con comisión
-- 3. RPC: courier_get_earnings_summary() para repartidores (blindada por auth.uid())
-- 4. RPC: admin_get_courier_earnings(p_courier_id UUID) para administradores
-- ==============================================================================

-- 1. BACKFILL SEGURO PARA PEDIDOS ENTREGADOS PREVIOS CON COMISIÓN
UPDATE public.orders
SET courier_payout_total = ROUND(
    (COALESCE(subtotal, 0) * COALESCE(courier_commission_percent, 0) / 100.0) +
    COALESCE(courier_fixed_fee, 0),
    2
)
WHERE courier_payout_total IS NULL
  AND courier_id IS NOT NULL
  AND (courier_commission_percent IS NOT NULL OR courier_fixed_fee IS NOT NULL);

-- 2. ACTUALIZACIÓN DE RPC: courier_update_order_status
-- Congela y guarda courier_payout_total de forma atómica en cuanto el pedido pasa a delivered
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

        -- Cálculo congelado exacto de ganancia: (subtotal * commission_percent / 100) + fixed_fee
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

    ELSE
        RAISE EXCEPTION 'Acción de reparto no válida: %', p_action;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'new_status', v_new_status,
        'action', p_action,
        'delivered_at', CASE WHEN v_new_status = 'delivered' THEN v_now ELSE v_order.delivered_at END,
        'courier_payout_total', v_calculated_payout
    );
END;
$$;

-- 3. RPC: courier_get_earnings_summary
-- Permite al repartidor autenticado obtener su resumen de ganancias con seguridad estricta
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
                'today', jsonb_build_object('earnings', 0, 'count', 0, 'avg', 0),
                'this_week', jsonb_build_object('earnings', 0, 'count', 0, 'avg', 0),
                'this_month', jsonb_build_object('earnings', 0, 'count', 0, 'avg', 0),
                'all_time', jsonb_build_object('earnings', 0, 'count', 0, 'avg', 0),
                'orders', '[]'::jsonb
            );
        END IF;
    END IF;

    -- Intervalos temporales basados en UTC/servidor
    v_today_start := date_trunc('day', timezone('utc', now()));
    v_week_start  := date_trunc('week', timezone('utc', now()));
    v_month_start := date_trunc('month', timezone('utc', now()));

    -- Métricas de pedidos entregados
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

    -- Listado detallado de pedidos entregados con desglose individual
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
            'count', v_today_count,
            'avg', CASE WHEN v_today_count > 0 THEN ROUND(v_today_earnings / v_today_count, 2) ELSE 0 END
        ),
        'this_week', jsonb_build_object(
            'earnings', v_week_earnings,
            'count', v_week_count,
            'avg', CASE WHEN v_week_count > 0 THEN ROUND(v_week_earnings / v_week_count, 2) ELSE 0 END
        ),
        'this_month', jsonb_build_object(
            'earnings', v_month_earnings,
            'count', v_month_count,
            'avg', CASE WHEN v_month_count > 0 THEN ROUND(v_month_earnings / v_month_count, 2) ELSE 0 END
        ),
        'all_time', jsonb_build_object(
            'earnings', v_total_earnings,
            'count', v_total_count,
            'avg', CASE WHEN v_total_count > 0 THEN ROUND(v_total_earnings / v_total_count, 2) ELSE 0 END
        ),
        'orders', v_orders
    );
END;
$$;

-- 4. RPC: admin_get_courier_earnings
-- Permite al administrador consultar ganancias globales o por repartidor
CREATE OR REPLACE FUNCTION public.admin_get_courier_earnings(
    p_courier_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN;
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
    v_orders JSONB := '[]'::jsonb;
    v_couriers_breakdown JSONB := '[]'::jsonb;
BEGIN
    SELECT public.is_admin() INTO v_is_admin;
    IF NOT COALESCE(v_is_admin, false) THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    v_today_start := date_trunc('day', timezone('utc', now()));
    v_week_start  := date_trunc('week', timezone('utc', now()));
    v_month_start := date_trunc('month', timezone('utc', now()));

    IF p_courier_id IS NOT NULL THEN
        -- Consulta para un repartidor específico
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
        WHERE o.courier_id = p_courier_id
          AND o.status = 'delivered';

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
        WHERE o.courier_id = p_courier_id
          AND o.status = 'delivered';

    ELSE
        -- Consulta global de todos los repartidores
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
        WHERE o.courier_id IS NOT NULL
          AND o.status = 'delivered';

        -- Desglose por repartidor
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'courier_id', c.id,
                    'full_name', COALESCE(p.full_name, 'Repartidor sin nombre'),
                    'email', p.email,
                    'active', c.active,
                    'available', c.available,
                    'total_delivered', COUNT(o.id) FILTER (WHERE o.status = 'delivered'),
                    'today_earnings', COALESCE(SUM(
                        CASE WHEN o.status = 'delivered' AND COALESCE(o.delivered_at, o.updated_at) >= v_today_start THEN
                            COALESCE(o.courier_payout_total,
                                ROUND((COALESCE(o.subtotal, 0) * COALESCE(o.courier_commission_percent, 0) / 100.0) + COALESCE(o.courier_fixed_fee, 0), 2)
                            )
                        ELSE 0 END
                    ), 0),
                    'total_earnings', COALESCE(SUM(
                        CASE WHEN o.status = 'delivered' THEN
                            COALESCE(o.courier_payout_total,
                                ROUND((COALESCE(o.subtotal, 0) * COALESCE(o.courier_commission_percent, 0) / 100.0) + COALESCE(o.courier_fixed_fee, 0), 2)
                            )
                        ELSE 0 END
                    ), 0)
                )
            ),
            '[]'::jsonb
        ) INTO v_couriers_breakdown
        FROM public.couriers c
        LEFT JOIN public.profiles p ON p.id = c.profile_id
        LEFT JOIN public.orders o ON o.courier_id = c.id
        GROUP BY c.id, p.full_name, p.email, c.active, c.available;
    END IF;

    RETURN jsonb_build_object(
        'today', jsonb_build_object(
            'earnings', v_today_earnings,
            'count', v_today_count,
            'avg', CASE WHEN v_today_count > 0 THEN ROUND(v_today_earnings / v_today_count, 2) ELSE 0 END
        ),
        'this_week', jsonb_build_object(
            'earnings', v_week_earnings,
            'count', v_week_count,
            'avg', CASE WHEN v_week_count > 0 THEN ROUND(v_week_earnings / v_week_count, 2) ELSE 0 END
        ),
        'this_month', jsonb_build_object(
            'earnings', v_month_earnings,
            'count', v_month_count,
            'avg', CASE WHEN v_month_count > 0 THEN ROUND(v_month_earnings / v_month_count, 2) ELSE 0 END
        ),
        'all_time', jsonb_build_object(
            'earnings', v_total_earnings,
            'count', v_total_count,
            'avg', CASE WHEN v_total_count > 0 THEN ROUND(v_total_earnings / v_total_count, 2) ELSE 0 END
        ),
        'orders', v_orders,
        'couriers', v_couriers_breakdown
    );
END;
$$;

-- Permisos de ejecución
REVOKE ALL ON FUNCTION public.courier_get_earnings_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.courier_get_earnings_summary() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_get_courier_earnings(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_courier_earnings(UUID) TO authenticated;
