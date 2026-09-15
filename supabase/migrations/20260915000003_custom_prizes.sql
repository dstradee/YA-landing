CREATE OR REPLACE FUNCTION public.save_awarded_prize_custom_data(
    p_awarded_prize_id UUID,
    p_custom_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    UPDATE public.user_awarded_prizes
    SET prize_config = p_custom_data
    WHERE id = p_awarded_prize_id
      AND user_id = v_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
