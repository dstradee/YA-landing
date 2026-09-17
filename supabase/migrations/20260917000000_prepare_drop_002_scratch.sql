-- ==============================================================================
-- YA - MIGRACIÓN: PREPARACIÓN DROP 002 — RASCA Y GANA
-- Archivo: 20260917000000_prepare_drop_002_scratch.sql
-- ==============================================================================
-- 1. DROP 002 programado para activarse automáticamente al finalizar el DROP 001
-- 2. game_key: 'scratch', trigger: 'after_payment'
-- 3. 3 Categorías de premio configurables:
--    - Premio Principal (3x YA): Pedido Gratis hasta 20 € (sort_order 1)
--    - Premio Secundario (✦ · ✦ · 🥤): 25 % Dto. en próximo pedido (sort_order 2)
--    - Premio de Consolación: +1 Participación Sorteo Mensual (consolation_config)
-- 4. Idempotente y seguro para reejecución
-- ==============================================================================

DO $$
DECLARE
    v_drop_id UUID;
BEGIN
    -- 1. Verificar si ya existe DROP 002
    SELECT id INTO v_drop_id FROM public.drops WHERE drop_number = 2;

    IF v_drop_id IS NULL THEN
        INSERT INTO public.drops (
            drop_number,
            title,
            description,
            game_type,
            game_key,
            status,
            starts_at,
            ends_at,
            activation_trigger,
            trigger_config,
            game_config,
            consolation_reward_type,
            consolation_config,
            prize_validity_days
        ) VALUES (
            2,
            'DROP 002 — RASCA Y GANA',
            'Rasca tu billete digital exclusivo tras realizar tu pedido. ¡Descubre premios directos o participaciones para el Sorteo Mensual!',
            'scratch',
            'scratch',
            'scheduled',
            '2026-09-21T13:07:00+00:00',
            '2026-09-28T13:07:00+00:00',
            'after_payment',
            '{}'::jsonb,
            '{"game_key": "scratch"}'::jsonb,
            'monthly_draw_entry',
            '{"entries_count": 1}'::jsonb,
            7
        )
        RETURNING id INTO v_drop_id;
    END IF;

    -- 2. Insertar Premios activos para DROP 002 si no existen aún
    IF NOT EXISTS (SELECT 1 FROM public.drop_prizes WHERE drop_id = v_drop_id AND sort_order = 1) THEN
        INSERT INTO public.drop_prizes (
            drop_id,
            name,
            description,
            prize_type,
            prize_value,
            prize_config,
            probability_pct,
            max_inventory,
            inventory_consumed,
            validity_days,
            is_active,
            sort_order
        ) VALUES (
            v_drop_id,
            'Pedido Gratis hasta 20 €',
            'Premio Principal (3x YA): Tu próximo pedido en YA Delivery es 100% gratis hasta 20 €.',
            'free_order',
            20.00,
            '{}'::jsonb,
            5.000,
            100,
            0,
            7,
            true,
            1
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.drop_prizes WHERE drop_id = v_drop_id AND sort_order = 2) THEN
        INSERT INTO public.drop_prizes (
            drop_id,
            name,
            description,
            prize_type,
            prize_value,
            prize_config,
            probability_pct,
            max_inventory,
            inventory_consumed,
            validity_days,
            is_active,
            sort_order
        ) VALUES (
            v_drop_id,
            '25 % Dto. en tu próximo pedido',
            'Premio Secundario (✦ · ✦ · 🥤): Ahorra un 25% directo en tu siguiente pedido.',
            'percentage_discount',
            25.00,
            '{}'::jsonb,
            20.000,
            500,
            0,
            7,
            true,
            2
        );
    END IF;
END $$;
