-- ==============================================================================
-- YA - MIGRACIÓN: Corrección de captura de teléfono y sincronización de perfiles
-- Archivo: 20260908000001_fix_auth_phone_and_profiles.sql
-- ==============================================================================

-- 1. Actualizar la función handle_new_user() para capturar 'phone' robustamente
-- y garantizar que role SIEMPRE sea 'customer' (sin elevación de privilegios posible).
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
    -- Extraer el nombre de la metadata enviada durante el registro
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        'Usuario YA'
    );

    -- Extraer el teléfono de raw_user_meta_data ('phone' o 'phone_number') o del campo nativo NEW.phone
    v_phone := COALESCE(
        NEW.raw_user_meta_data->>'phone',
        NEW.raw_user_meta_data->>'phone_number',
        NEW.phone
    );

    -- Insertar en profiles.
    -- SEGURIDAD: role siempre es 'customer'.
    -- Si el registro ya existe (conflicto de id), actualiza nombre y teléfono si estaba nulo, SIN alterar role.
    INSERT INTO public.profiles (id, full_name, phone, role)
    VALUES (
        NEW.id,
        v_full_name,
        v_phone,
        'customer'
    )
    ON CONFLICT (id) DO UPDATE
    SET
        full_name = EXCLUDED.full_name,
        phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
        updated_at = timezone('utc'::text, now());

    RETURN NEW;
END;
$$;

-- 2. Asegurar que el trigger esté asignado a auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. MIGRACIÓN DE DATOS EXISTENTES (BACKFILL SEGURO Y NO DESTRUCTIVO):
-- Copia el teléfono desde auth.users.raw_user_meta_data a public.profiles
-- para todos los usuarios ya creados (como la cuenta de prueba) que tengan phone = NULL.
UPDATE public.profiles p
SET
    phone = COALESCE(
        u.raw_user_meta_data->>'phone',
        u.raw_user_meta_data->>'phone_number',
        u.phone
    ),
    updated_at = timezone('utc'::text, now())
FROM auth.users u
WHERE p.id = u.id
  AND p.phone IS NULL
  AND (
      u.raw_user_meta_data->>'phone' IS NOT NULL
      OR u.raw_user_meta_data->>'phone_number' IS NOT NULL
      OR u.phone IS NOT NULL
  );
