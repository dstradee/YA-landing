-- ==============================================================================
-- YA - MIGRACIÓN: CORRECCIÓN DE TRIGGER DE SOLAPAMIENTO DE DROPS
-- Archivo: 20260917000001_fix_drop_schedule_overlap.sql
-- ==============================================================================
-- Corrige el error en UPDATE donde el Drop que se está editando se detectaba
-- a sí mismo como solapamiento.
-- Excluye explícitamente el propio ID del Drop (OLD.id / NEW.id) de la verificación:
--   WHERE id <> p_drop_id
--     AND starts_at < p_ends_at
--     AND ends_at > p_starts_at
--     AND status IN ('scheduled', 'active')
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.check_drop_schedule_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_overlapping_count INTEGER;
    v_check_id UUID;
BEGIN
    -- Solo verificar si el drop está en estado activo o programado
    IF NEW.status IN ('active', 'scheduled') THEN
        IF TG_OP = 'UPDATE' THEN
            v_check_id := COALESCE(OLD.id, NEW.id);
        ELSE
            v_check_id := NEW.id;
        END IF;

        SELECT COUNT(*)
        INTO v_overlapping_count
        FROM public.drops
        WHERE (v_check_id IS NULL OR id <> v_check_id)
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
