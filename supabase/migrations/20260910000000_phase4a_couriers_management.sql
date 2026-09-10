-- ==============================================================================
-- YA - MIGRACIÓN: FASE 4A — GESTIÓN DE REPARTIDORES
-- Archivo: supabase/migrations/20260910000000_phase4a_couriers_management.sql
-- ==============================================================================
-- 1. Ampliación de la tabla public.couriers:
--    - available: disponibilidad operativa del repartidor (activo != disponible)
--    - commission_percent: porcentaje individual de comisión por pedido
--    - fixed_fee: tarifa fija individual por pedido
--    - notes: anotaciones internas del administrador
-- 2. Preparación histórica en public.orders para 4C/4D:
--    - courier_commission_percent, courier_fixed_fee, courier_payout_total, courier_assigned_at
-- 3. Políticas RLS actualizadas para administración segura de repartidores
-- 4. RPCs seguras para asignación y actualización de repartidores
-- ==============================================================================

-- 1. COLUMNAS EN PUBLIC.COURIERS
ALTER TABLE public.couriers ADD COLUMN IF NOT EXISTS available BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.couriers ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.couriers ADD COLUMN IF NOT EXISTS fixed_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.couriers ADD COLUMN IF NOT EXISTS notes TEXT;

DO $$ BEGIN
    ALTER TABLE public.couriers ADD CONSTRAINT chk_courier_commission CHECK (commission_percent >= 0 AND commission_percent <= 100);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE public.couriers ADD CONSTRAINT chk_courier_fixed_fee CHECK (fixed_fee >= 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_couriers_active ON public.couriers(active);
CREATE INDEX IF NOT EXISTS idx_couriers_available ON public.couriers(available);
CREATE INDEX IF NOT EXISTS idx_couriers_profile ON public.couriers(profile_id);

-- 2. ARQUITECTURA HISTÓRICA EN PUBLIC.ORDERS (PREPARACIÓN PARA FASES 4C Y 4D)
-- Permite que al asignar un pedido se guarde la instantánea de comisión exacta de ese momento,
-- sin depender de cambios futuros en la configuración del perfil del repartidor.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_commission_percent NUMERIC(5, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_fixed_fee NUMERIC(10, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_payout_total NUMERIC(10, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_assigned_at TIMESTAMPTZ;

-- 3. POLÍTICAS DE SEGURIDAD (RLS)
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Couriers can view own record" ON public.couriers;
CREATE POLICY "Couriers can view own record"
    ON public.couriers FOR SELECT
    TO authenticated
    USING (auth.uid() = profile_id OR public.is_admin());

DROP POLICY IF EXISTS "Only admin can manage couriers" ON public.couriers;
CREATE POLICY "Only admin can manage couriers"
    ON public.couriers FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Permitir a administradores actualizar el rol de profiles a 'courier'
DROP POLICY IF EXISTS "Admin can update profiles" ON public.profiles;
CREATE POLICY "Admin can update profiles"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 4. FUNCIÓN RPC: admin_assign_courier
-- Asigna un usuario existente como repartidor, establece su remuneración y actualiza su rol a 'courier'
CREATE OR REPLACE FUNCTION public.admin_assign_courier(
    p_profile_id UUID,
    p_commission_percent NUMERIC,
    p_fixed_fee NUMERIC,
    p_active BOOLEAN DEFAULT true,
    p_available BOOLEAN DEFAULT false,
    p_vehicle_type TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_profile RECORD;
    v_courier RECORD;
BEGIN
    -- Validar que el usuario invocador sea admin
    SELECT public.is_admin() INTO v_is_admin;
    IF NOT COALESCE(v_is_admin, false) THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    -- Validar parámetros de remuneración
    IF p_commission_percent < 0 OR p_commission_percent > 100 THEN
        RAISE EXCEPTION 'La comisión porcentual debe estar comprendida entre 0 y 100.';
    END IF;

    IF p_fixed_fee < 0 THEN
        RAISE EXCEPTION 'La tarifa fija no puede ser negativa.';
    END IF;

    -- Comprobar que el usuario existe en profiles
    SELECT id, full_name, email, phone, role INTO v_profile
    FROM public.profiles
    WHERE id = p_profile_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El usuario indicado no existe en los perfiles de YA.';
    END IF;

    -- Insertar o actualizar registro de repartidor
    INSERT INTO public.couriers (
        profile_id,
        active,
        available,
        commission_percent,
        fixed_fee,
        vehicle_type,
        notes,
        created_at,
        updated_at
    )
    VALUES (
        p_profile_id,
        COALESCE(p_active, true),
        COALESCE(p_available, false),
        COALESCE(p_commission_percent, 0.00),
        COALESCE(p_fixed_fee, 0.00),
        p_vehicle_type,
        p_notes,
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
    )
    ON CONFLICT (profile_id) DO UPDATE
    SET
        active = EXCLUDED.active,
        available = EXCLUDED.available,
        commission_percent = EXCLUDED.commission_percent,
        fixed_fee = EXCLUDED.fixed_fee,
        vehicle_type = COALESCE(EXCLUDED.vehicle_type, public.couriers.vehicle_type),
        notes = COALESCE(EXCLUDED.notes, public.couriers.notes),
        updated_at = timezone('utc'::text, now())
    RETURNING * INTO v_courier;

    -- Si el rol del perfil era customer, promocionar a courier
    IF v_profile.role = 'customer' THEN
        UPDATE public.profiles
        SET role = 'courier', updated_at = timezone('utc'::text, now())
        WHERE id = p_profile_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'courier_id', v_courier.id,
        'profile_id', v_courier.profile_id,
        'active', v_courier.active,
        'available', v_courier.available,
        'commission_percent', v_courier.commission_percent,
        'fixed_fee', v_courier.fixed_fee,
        'full_name', v_profile.full_name,
        'email', v_profile.email
    );
END;
$$;

-- 5. FUNCIÓN RPC: admin_update_courier
-- Actualiza la configuración operativa y remuneración de un repartidor existente
CREATE OR REPLACE FUNCTION public.admin_update_courier(
    p_courier_id UUID,
    p_commission_percent NUMERIC,
    p_fixed_fee NUMERIC,
    p_active BOOLEAN,
    p_available BOOLEAN,
    p_vehicle_type TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_courier RECORD;
BEGIN
    SELECT public.is_admin() INTO v_is_admin;
    IF NOT COALESCE(v_is_admin, false) THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    IF p_commission_percent < 0 OR p_commission_percent > 100 THEN
        RAISE EXCEPTION 'La comisión porcentual debe estar comprendida entre 0 y 100.';
    END IF;

    IF p_fixed_fee < 0 THEN
        RAISE EXCEPTION 'La tarifa fija no puede ser negativa.';
    END IF;

    UPDATE public.couriers
    SET
        commission_percent = p_commission_percent,
        fixed_fee = p_fixed_fee,
        active = p_active,
        available = p_available,
        vehicle_type = p_vehicle_type,
        notes = p_notes,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_courier_id
    RETURNING * INTO v_courier;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Repartidor no encontrado con ID %', p_courier_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'courier_id', v_courier.id,
        'active', v_courier.active,
        'available', v_courier.available,
        'commission_percent', v_courier.commission_percent,
        'fixed_fee', v_courier.fixed_fee
    );
END;
$$;
