-- ==============================================================================
-- YA DELIVERY - MIGRACIÓN YA JUNTOS PERSISTENTE Y REGLAS DEFINITIVAS
-- Archivo: supabase/migrations/20260916000000_ya_juntos_persistence_and_rules.sql
-- ==============================================================================

-- 1. Asegurar que un usuario solo pueda tener UN grupo activo/abierto como creador o participante activo
-- Función para obtener el grupo activo de un usuario
CREATE OR REPLACE FUNCTION public.get_user_active_ya_juntos_group(
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_group RECORD;
    v_part RECORD;
BEGIN
    v_user_id := COALESCE(p_user_id, auth.uid());
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('has_active_group', false, 'group', null);
    END IF;

    -- Buscar grupo activo (status 'open' o 'payment_pending' y no expirado) donde el usuario sea participante activo
    SELECT g.*, p.role as my_role, p.status as my_part_status
    INTO v_group
    FROM public.ya_juntos_groups g
    JOIN public.ya_juntos_participants p ON p.group_id = g.id
    WHERE p.user_id = v_user_id
      AND p.status = 'active'
      AND g.status IN ('open', 'payment_pending')
      AND g.expires_at > timezone('utc'::text, now())
    ORDER BY g.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('has_active_group', false, 'group', null);
    END IF;

    RETURN jsonb_build_object(
        'has_active_group', true,
        'group', jsonb_build_object(
            'id', v_group.id,
            'code', v_group.code,
            'title', v_group.title,
            'status', v_group.status,
            'role', v_group.my_role,
            'is_creator', (v_group.creator_id = v_user_id),
            'payment_mode', v_group.payment_mode,
            'subtotal', v_group.subtotal,
            'delivery_fee', v_group.delivery_fee,
            'total', v_group.total
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_active_ya_juntos_group TO authenticated, anon;


-- 2. Actualizar CREATE_YA_JUNTOS_GROUP con validación estricta de grupo único activo
CREATE OR REPLACE FUNCTION public.create_ya_juntos_group(
    p_title TEXT DEFAULT 'Pedido en grupo YA',
    p_payment_mode TEXT DEFAULT 'split_by_items'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user_profile RECORD;
    v_code TEXT;
    v_group_id UUID;
    v_chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    v_mode public.ya_juntos_payment_mode;
    v_attempt INT := 0;
    v_existing_group RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión para crear un grupo de YA Juntos.';
    END IF;

    SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_user_id;

    -- REGLA: NO PERMITIR SEGUNDO YA JUNTOS ACTIVO POR USUARIO
    -- Comprobar si ya tiene un grupo activo (como creador o participante activo)
    SELECT g.id, g.code, g.title, g.status INTO v_existing_group
    FROM public.ya_juntos_groups g
    JOIN public.ya_juntos_participants p ON p.group_id = g.id
    WHERE p.user_id = v_user_id
      AND p.status = 'active'
      AND g.status IN ('open', 'payment_pending')
      AND g.expires_at > timezone('utc'::text, now())
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Ya tienes un grupo de YA Juntos activo (' || v_existing_group.code || '). Debes completarlo o abandonarlo antes de crear uno nuevo.',
            'existing_code', v_existing_group.code,
            'existing_group_id', v_existing_group.id
        );
    END IF;

    -- Validar modo de pago
    BEGIN
        v_mode := p_payment_mode::public.ya_juntos_payment_mode;
    EXCEPTION WHEN OTHERS THEN
        v_mode := 'split_by_items';
    END;

    -- Generar código alfanumérico único
    LOOP
        v_attempt := v_attempt + 1;
        v_code := '';
        FOR i IN 1..6 LOOP
            v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
        END LOOP;

        IF NOT EXISTS (SELECT 1 FROM public.ya_juntos_groups WHERE code = v_code) THEN
            EXIT;
        END IF;

        IF v_attempt > 20 THEN
            RAISE EXCEPTION 'No se pudo generar un código único para el grupo. Inténtalo de nuevo.';
        END IF;
    END LOOP;

    -- Crear grupo
    INSERT INTO public.ya_juntos_groups (
        code,
        creator_id,
        title,
        status,
        payment_mode,
        single_payer_user_id,
        subtotal,
        delivery_fee,
        total,
        amount_paid
    ) VALUES (
        v_code,
        v_user_id,
        COALESCE(NULLIF(trim(p_title), ''), 'Pedido en grupo YA'),
        'open',
        v_mode,
        CASE WHEN v_mode = 'single_payer' THEN v_user_id ELSE NULL END,
        0.00,
        2.90,
        2.90,
        0.00
    ) RETURNING id INTO v_group_id;

    -- Añadir al creador como primer participante con rol 'creator'
    INSERT INTO public.ya_juntos_participants (
        group_id,
        user_id,
        display_name,
        role,
        status,
        allocated_amount,
        paid_amount,
        payment_status
    ) VALUES (
        v_group_id,
        v_user_id,
        COALESCE(v_user_profile.full_name, 'Organizador'),
        'creator',
        'active',
        2.90,
        0.00,
        'pending'
    );

    RETURN jsonb_build_object(
        'success', true,
        'group_id', v_group_id,
        'code', v_code,
        'title', p_title,
        'payment_mode', v_mode
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_ya_juntos_group TO authenticated;


-- 3. REGLA DEFINITIVA: EL CREADOR O CUALQUIER PARTICIPANTE PUEDE SALIR
-- Si sale el creador:
-- - Se eliminan SOLO sus productos (ya_juntos_items where added_by_user_id = v_user_id)
-- - NO se eliminan los productos de los demás participantes
-- - NO se elimina el grupo si todavía quedan otros participantes activos (se transfiere el rol 'creator' al miembro más antiguo)
-- - Si no queda NINGÚN participante activo, se cancela/elimina el grupo
CREATE OR REPLACE FUNCTION public.leave_ya_juntos_group(
    p_group_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_group RECORD;
    v_part RECORD;
    v_remaining_active_count INT := 0;
    v_next_creator RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No autorizado.';
    END IF;

    SELECT * INTO v_group FROM public.ya_juntos_groups WHERE id = p_group_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Grupo no encontrado.';
    END IF;

    IF v_group.status != 'open' THEN
        RAISE EXCEPTION 'No puedes abandonar un grupo que ya ha iniciado el pago.';
    END IF;

    SELECT * INTO v_part 
    FROM public.ya_juntos_participants 
    WHERE group_id = p_group_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', true, 'message', 'Ya no perteneces a este grupo.');
    END IF;

    -- 1. Eliminar SOLO los productos añadidos por este usuario
    DELETE FROM public.ya_juntos_items 
    WHERE group_id = p_group_id AND added_by_user_id = v_user_id;

    -- 2. Eliminar al participante del grupo
    DELETE FROM public.ya_juntos_participants WHERE id = v_part.id;

    -- 3. Contar participantes restantes activos
    SELECT COUNT(*) INTO v_remaining_active_count
    FROM public.ya_juntos_participants
    WHERE group_id = p_group_id AND status = 'active';

    IF v_remaining_active_count = 0 THEN
        -- Si ya no queda NADIE en el grupo, cancelar/marcar grupo como cancelado
        UPDATE public.ya_juntos_groups
        SET status = 'cancelled',
            updated_at = timezone('utc'::text, now())
        WHERE id = p_group_id;

        RETURN jsonb_build_object(
            'success', true,
            'group_closed', true,
            'message', 'Has salido del grupo. Al no quedar participantes, el grupo ha sido cerrado.'
        );
    ELSE
        -- Si era el creador quien salió, transferir rol de creador/organizador al participante más antiguo
        IF v_group.creator_id = v_user_id OR v_part.role = 'creator' THEN
            SELECT * INTO v_next_creator
            FROM public.ya_juntos_participants
            WHERE group_id = p_group_id AND status = 'active'
            ORDER BY joined_at ASC
            LIMIT 1;

            IF FOUND THEN
                UPDATE public.ya_juntos_participants
                SET role = 'creator', updated_at = timezone('utc'::text, now())
                WHERE id = v_next_creator.id;

                UPDATE public.ya_juntos_groups
                SET creator_id = v_next_creator.user_id,
                    single_payer_user_id = CASE WHEN payment_mode = 'single_payer' THEN v_next_creator.user_id ELSE single_payer_user_id END,
                    updated_at = timezone('utc'::text, now())
                WHERE id = p_group_id;

                -- Notificar al nuevo organizador
                PERFORM public.create_system_notification(
                    p_user_id := v_next_creator.user_id,
                    p_type := 'ya_juntos_joined',
                    p_title := 'Ahora eres el organizador de ' || v_group.title,
                    p_message := 'El organizador anterior ha salido del grupo. Has pasado a ser el nuevo organizador del pedido compartido.',
                    p_idempotency_key := 'juntos_new_creator_' || p_group_id || '_' || v_next_creator.user_id,
                    p_link := '/app/juntos/' || v_group.code
                );
            END IF;
        END IF;

        -- 4. Recalcular importes del grupo con los items y participantes restantes
        PERFORM public.recalculate_ya_juntos_group(p_group_id);

        RETURN jsonb_build_object(
            'success', true,
            'group_closed', false,
            'remaining_participants', v_remaining_active_count,
            'message', 'Has salido del grupo correctamente. Tus productos han sido retirados y el grupo sigue activo con los demás participantes.'
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_ya_juntos_group TO authenticated;
