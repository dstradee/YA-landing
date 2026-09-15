-- ==============================================================================
-- 20260915000008_fix_drop_prizes_deduplication.sql
-- Función para sincronizar de forma atómica e idempotente los premios de un Drop
-- Previene duplicación de registros, realiza UPDATE por ID o nombre,
-- y preserva la integridad referencial de los premios otorgados a usuarios.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_sync_drop_prizes(
    p_drop_id UUID,
    p_prizes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prize JSONB;
    v_prize_id UUID;
    v_name TEXT;
    v_description TEXT;
    v_prize_type TEXT;
    v_prize_value NUMERIC;
    v_prize_config JSONB;
    v_prob NUMERIC;
    v_max_inv INT;
    v_validity INT;
    v_active BOOLEAN;
    v_sort_order INT := 1;
    v_total_prob NUMERIC := 0;
    v_handled_ids UUID[] := '{}';
    v_existing RECORD;
BEGIN
    -- 1. Validar que el drop existe
    IF NOT EXISTS (SELECT 1 FROM public.drops WHERE id = p_drop_id) THEN
        RAISE EXCEPTION 'Drop con ID % no existe.', p_drop_id;
    END IF;

    -- 2. Validar suma de probabilidades de premios activos
    FOR v_prize IN SELECT * FROM jsonb_array_elements(p_prizes)
    LOOP
        v_active := COALESCE((v_prize->>'is_active')::BOOLEAN, true);
        v_prob := COALESCE((v_prize->>'probability_pct')::NUMERIC, 0);
        IF v_active THEN
            v_total_prob := v_total_prob + v_prob;
        END IF;
    END LOOP;

    IF v_total_prob > 100 THEN
        RAISE EXCEPTION 'La suma de probabilidades (%) supera el 100%%', v_total_prob;
    END IF;

    -- 3. Procesar cada premio: UPDATE si existe por ID o por nombre; INSERT si es nuevo
    FOR v_prize IN SELECT * FROM jsonb_array_elements(p_prizes)
    LOOP
        v_prize_id := NULL;
        IF v_prize->>'id' IS NOT NULL AND v_prize->>'id' <> '' THEN
            BEGIN
                v_prize_id := (v_prize->>'id')::UUID;
            EXCEPTION WHEN OTHERS THEN
                v_prize_id := NULL;
            END;
        END IF;

        v_name := TRIM(COALESCE(v_prize->>'name', 'Premio'));
        v_description := NULLIF(TRIM(COALESCE(v_prize->>'description', '')), '');
        v_prize_type := COALESCE(v_prize->>'prize_type', 'percentage_discount');
        v_prize_value := COALESCE((v_prize->>'prize_value')::NUMERIC, 0);
        v_prize_config := COALESCE(v_prize->'prize_config', '{}'::JSONB);
        v_prob := COALESCE((v_prize->>'probability_pct')::NUMERIC, 0);
        v_max_inv := NULLIF(v_prize->>'max_inventory', '')::INT;
        v_validity := COALESCE(NULLIF(v_prize->>'validity_days', '')::INT, 7);
        v_active := COALESCE((v_prize->>'is_active')::BOOLEAN, true);

        -- Si no hay ID o no existe en este drop, buscar coincidencia por nombre normalizado
        IF v_prize_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.drop_prizes WHERE id = v_prize_id AND drop_id = p_drop_id) THEN
            SELECT id INTO v_prize_id
            FROM public.drop_prizes
            WHERE drop_id = p_drop_id
              AND LOWER(TRIM(name)) = LOWER(v_name)
              AND id != ALL(v_handled_ids)
            ORDER BY inventory_consumed DESC, created_at ASC
            LIMIT 1;
        END IF;

        IF v_prize_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.drop_prizes WHERE id = v_prize_id) THEN
            -- UPDATE del premio existente
            UPDATE public.drop_prizes
            SET name = v_name,
                description = v_description,
                prize_type = v_prize_type,
                prize_value = v_prize_value,
                prize_config = v_prize_config,
                probability_pct = v_prob,
                max_inventory = v_max_inv,
                validity_days = v_validity,
                is_active = v_active,
                sort_order = v_sort_order,
                updated_at = timezone('utc'::text, now())
            WHERE id = v_prize_id;

            v_handled_ids := array_append(v_handled_ids, v_prize_id);
        ELSE
            -- INSERT de nuevo premio
            INSERT INTO public.drop_prizes (
                drop_id,
                name,
                description,
                prize_type,
                prize_value,
                prize_config,
                probability_pct,
                max_inventory,
                validity_days,
                is_active,
                sort_order
            ) VALUES (
                p_drop_id,
                v_name,
                v_description,
                v_prize_type,
                v_prize_value,
                v_prize_config,
                v_prob,
                v_max_inv,
                v_validity,
                v_active,
                v_sort_order
            ) RETURNING id INTO v_prize_id;

            v_handled_ids := array_append(v_handled_ids, v_prize_id);
        END IF;

        v_sort_order := v_sort_order + 1;
    END LOOP;

    -- 4. Limpiar duplicados o huérfanos que ya no forman parte de la configuración
    FOR v_existing IN
        SELECT id FROM public.drop_prizes
        WHERE drop_id = p_drop_id AND id != ALL(v_handled_ids)
    LOOP
        IF EXISTS (SELECT 1 FROM public.user_awarded_prizes WHERE prize_id = v_existing.id) THEN
            UPDATE public.drop_prizes
            SET is_active = false,
                probability_pct = 0,
                updated_at = timezone('utc'::text, now())
            WHERE id = v_existing.id;
        ELSE
            DELETE FROM public.drop_prizes WHERE id = v_existing.id;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'drop_id', p_drop_id,
        'prizes_count', array_length(v_handled_ids, 1),
        'direct_probability', v_total_prob,
        'consolation_probability', GREATEST(0, 100 - v_total_prob)
    );
END;
$$;
