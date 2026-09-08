-- ==============================================================================
-- YA - MIGRACIÓN: FASE 3A — ADMIN CORE
-- Archivo: 20260908000003_phase3a_admin_core.sql
-- ==============================================================================
-- 1. Añade columna email a public.profiles para facilitar gestión en Admin
-- 2. Actualiza trigger handle_new_user para sincronizar email
-- 3. Backfill seguro de email para perfiles existentes
-- 4. RPC admin_update_order_status para cambio de estado restringido y seguro
-- ==============================================================================

-- 1. COLUMNA EMAIL EN PROFILES
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 2. ACTUALIZACIÓN DEL TRIGGER HANDLE_NEW_USER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_full_name TEXT;
    v_phone TEXT;
BEGIN
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        'Usuario YA'
    );

    v_phone := COALESCE(
        NEW.raw_user_meta_data->>'phone',
        NEW.raw_user_meta_data->>'phone_number',
        NEW.phone
    );

    INSERT INTO public.profiles (id, full_name, phone, role, email)
    VALUES (
        NEW.id,
        v_full_name,
        v_phone,
        'customer',
        NEW.email
    )
    ON CONFLICT (id) DO UPDATE
    SET
        full_name = EXCLUDED.full_name,
        phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
        email = COALESCE(public.profiles.email, EXCLUDED.email),
        updated_at = timezone('utc'::text, now());

    RETURN NEW;
END;
$$;

-- 3. BACKFILL DE EMAIL PARA USUARIOS YA REGISTRADOS
UPDATE public.profiles p
SET
    email = u.email,
    updated_at = timezone('utc'::text, now())
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');

-- 4. FUNCIÓN RPC SEGURA: admin_update_order_status
-- Permite únicamente a usuarios con rol 'admin' actualizar el estado de un pedido.
-- Previene que el cliente pueda modificar campos no autorizados (precios, dirección, etc.).
CREATE OR REPLACE FUNCTION public.admin_update_order_status(
    p_order_id UUID,
    p_status order_status
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_updated_order RECORD;
BEGIN
    -- 1. Validar autorización de administrador
    SELECT public.is_admin() INTO v_is_admin;
    IF NOT COALESCE(v_is_admin, false) THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador para cambiar el estado del pedido.';
    END IF;

    -- 2. Actualizar estrictamente solo el campo status y updated_at
    UPDATE public.orders
    SET
        status = p_status,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id
    RETURNING id, order_number, status, updated_at INTO v_updated_order;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado con ID %', p_order_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_updated_order.id,
        'order_number', v_updated_order.order_number,
        'new_status', v_updated_order.status,
        'updated_at', v_updated_order.updated_at
    );
END;
$$;

-- 5. ASIGNACIÓN DE PERMISOS PARA LA RPC
REVOKE EXECUTE ON FUNCTION public.admin_update_order_status(UUID, order_status) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_order_status(UUID, order_status) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(UUID, order_status) TO authenticated;
