-- ==============================================================================
-- YA - MIGRACIÓN: PREPARACIÓN DROP 004 — EL TRILE
-- Archivo: 20260917000003_prepare_drop_004_trile.sql
-- ==============================================================================
-- 1. DROP 004 programado para activarse inmediatamente tras DROP 003:
--    - starts_at: '2026-10-05T13:07:00+00:00'
--    - ends_at: '2026-10-12T13:07:00+00:00'
-- 2. game_key: 'trile', trigger: 'after_payment'
-- 3. Mecánica:
--    - 10% PREMIO GORDO -> Premio físico configurable (Sudadera Exclusiva YA Oversize Trile)
--    - 20% DESCUENTO -> Descuento 25% directo en próximo pedido
--    - 70% PARTICIPACIONES -> +2 participaciones para el Gran Sorteo Mensual (consolation_config: entries_count = 2)
-- 4. Idempotente y seguro para reejecución
-- ==============================================================================

DO $$
DECLARE
    v_drop_id UUID;
BEGIN
    -- 1. Verificar si ya existe DROP 004
    SELECT id INTO v_drop_id FROM public.drops WHERE drop_number = 4;

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
            4,
            'DROP 004 — EL TRILE',
            '3 cartas boca abajo: elige una, descubre las tres. Consigue el Premio Gordo, un descuento directo en tu próximo pedido o participaciones para el Gran Sorteo Mensual.',
            'trile',
            'trile',
            'scheduled',
            '2026-10-05T13:07:00+00:00',
            '2026-10-12T13:07:00+00:00',
            'after_payment',
            '{}'::jsonb,
            '{"game_key": "trile", "activation_trigger": "after_payment"}'::jsonb,
            'monthly_draw_entry',
            '{"entries_count": 2}'::jsonb,
            14
        )
        RETURNING id INTO v_drop_id;
    ELSE
        -- Actualizar configuración para asegurar total concordancia
        UPDATE public.drops
        SET title = 'DROP 004 — EL TRILE',
            description = '3 cartas boca abajo: elige una, descubre las tres. Consigue el Premio Gordo, un descuento directo en tu próximo pedido o participaciones para el Gran Sorteo Mensual.',
            game_type = 'trile',
            game_key = 'trile',
            starts_at = '2026-10-05T13:07:00+00:00',
            ends_at = '2026-10-12T13:07:00+00:00',
            activation_trigger = 'after_payment',
            game_config = '{"game_key": "trile", "activation_trigger": "after_payment"}'::jsonb,
            consolation_reward_type = 'monthly_draw_entry',
            consolation_config = '{"entries_count": 2}'::jsonb,
            prize_validity_days = 14
        WHERE id = v_drop_id;
    END IF;

    -- 2. Insertar Premio Gordo (10%) para DROP 004 si no existe aún
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
            'Sudadera Exclusiva YA — Oversize Trile',
            'Premio Gordo oficial Drop 004: Sudadera con capucha bordada YA Neo-Brutalist edición especial Trile.',
            'custom',
            45.00,
            '{"form_fields": ["Nombre y Apellidos", "Teléfono de Contacto", "Dirección Completa de Envío", "Talla (S, M, L, XL)"]}'::jsonb,
            10.000,
            30,
            0,
            14,
            true,
            1
        );
    END IF;

    -- 3. Insertar Premio Secundario Descuento (20%) para DROP 004 si no existe aún
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
            '25% Descuento en tu próximo pedido',
            'Premio Secundario Drop 004: 25% de descuento directo en tu próximo pedido en YA.',
            'percentage_discount',
            25.00,
            '{"discount_pct": 25}'::jsonb,
            20.000,
            500,
            0,
            7,
            true,
            2
        );
    END IF;

    RAISE NOTICE 'Drop 004 (El Trile) preparado exitosamente con id: %', v_drop_id;
END $$;
