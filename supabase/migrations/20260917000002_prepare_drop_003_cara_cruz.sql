-- ==============================================================================
-- YA - MIGRACIÓN: PREPARACIÓN DROP 003 — EL CARA O CRUZ
-- Archivo: 20260917000002_prepare_drop_003_cara_cruz.sql
-- ==============================================================================
-- 1. DROP 003 programado para activarse inmediatamente tras DROP 002:
--    - starts_at: '2026-09-28T13:07:00+00:00'
--    - ends_at: '2026-10-05T13:07:00+00:00'
-- 2. game_key: 'cara_cruz', trigger: 'after_payment'
-- 3. Mecánica:
--    - 10% GANADOR -> Premio físico configurable (Gorra Exclusiva YA Edición Limitada)
--    - 90% PERDEDOR -> +2 participaciones para el Gran Sorteo Mensual (consolation_config: entries_count = 2)
-- 4. Idempotente y seguro para reejecución
-- ==============================================================================

DO $$
DECLARE
    v_drop_id UUID;
BEGIN
    -- 1. Verificar si ya existe DROP 003
    SELECT id INTO v_drop_id FROM public.drops WHERE drop_number = 3;

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
            3,
            'DROP 003 — EL CARA O CRUZ',
            'Elige cara o cruz y haz girar la moneda exclusiva de YA. Si aciertas te llevas el premio físico exclusivo; si no, ganas +2 participaciones para el Gran Sorteo Mensual.',
            'cara_cruz',
            'cara_cruz',
            'scheduled',
            '2026-09-28T13:07:00+00:00',
            '2026-10-05T13:07:00+00:00',
            'after_payment',
            '{}'::jsonb,
            '{"game_key": "cara_cruz", "activation_trigger": "after_payment"}'::jsonb,
            'monthly_draw_entry',
            '{"entries_count": 2}'::jsonb,
            7
        )
        RETURNING id INTO v_drop_id;
    ELSE
        -- Actualizar configuración para asegurar total concordancia
        UPDATE public.drops
        SET title = 'DROP 003 — EL CARA O CRUZ',
            description = 'Elige cara o cruz y haz girar la moneda exclusiva de YA. Si aciertas te llevas el premio físico exclusivo; si no, ganas +2 participaciones para el Gran Sorteo Mensual.',
            game_type = 'cara_cruz',
            game_key = 'cara_cruz',
            starts_at = '2026-09-28T13:07:00+00:00',
            ends_at = '2026-10-05T13:07:00+00:00',
            activation_trigger = 'after_payment',
            game_config = '{"game_key": "cara_cruz", "activation_trigger": "after_payment"}'::jsonb,
            consolation_reward_type = 'monthly_draw_entry',
            consolation_config = '{"entries_count": 2}'::jsonb,
            prize_validity_days = 7
        WHERE id = v_drop_id;
    END IF;

    -- 2. Insertar Premio físico oficial para DROP 003 si no existe aún
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
            'Gorra Exclusiva YA — Edición Limitada',
            'Premio físico oficial Drop 003: Gorra bordada YA Neo-Brutalist de alta calidad. Te contactaremos para el envío directo a tu dirección.',
            'custom',
            30.00,
            '{"form_fields": ["Nombre y Apellidos", "Teléfono de Contacto", "Dirección Completa de Envío", "Talla / Observaciones"]}'::jsonb,
            10.000,
            50,
            0,
            14,
            true,
            1
        );
    END IF;
END $$;
