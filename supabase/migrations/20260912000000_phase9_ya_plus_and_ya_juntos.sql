-- ==============================================================================
-- YA DELIVERY - MIGRACIÓN FASE 9: YA+ (SUSCRIPCIONES) + YA JUNTOS (PEDIDOS COMPARTIDOS)
-- Archivo: supabase/migrations/20260912000000_phase9_ya_plus_and_ya_juntos.sql
-- ==============================================================================
-- 1. ENUMS Y EXTENSIONES DE NOTIFICACIONES
-- 2. TABLAS YA+ (ya_plus_plans, user_subscriptions)
-- 3. TABLAS YA JUNTOS (ya_juntos_groups, ya_juntos_participants, ya_juntos_items)
-- 4. RPCS YA+ (create_subscription_intent, confirm_subscription_payment, cancel_user_subscription)
-- 5. RPCS YA JUNTOS (create_ya_juntos_group, join_ya_juntos_group, leave_ya_juntos_group,
--                    add_item_to_ya_juntos, remove_item_from_ya_juntos, recalculate_ya_juntos_group,
--                    confirm_ya_juntos_order, confirm_juntos_partial_payment, confirm_juntos_full_payment)
-- 6. POLÍTICAS RLS Y REALTIME
-- ==============================================================================

-- 1. EXTENSIÓN DE ENUMS DE NOTIFICACIONES (Idempotente)
DO $$ BEGIN
    ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'ya_plus_subscribed';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'ya_plus_cancelled';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'ya_juntos_invite';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'ya_juntos_joined';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'ya_juntos_ready_to_pay';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'ya_juntos_payment_received';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'ya_juntos_fully_paid';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Tipos para YA+
DO $$ BEGIN
    CREATE TYPE public.ya_plus_plan_periodicity AS ENUM (
        'monthly',
        'yearly',
        'quarterly',
        'weekly'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.ya_plus_subscription_status AS ENUM (
        'pending',
        'active',
        'cancelled',
        'expired',
        'payment_failed'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Tipos para YA Juntos
DO $$ BEGIN
    CREATE TYPE public.ya_juntos_status AS ENUM (
        'open',
        'confirmed',
        'payment_pending',
        'fully_paid',
        'cancelled',
        'expired'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.ya_juntos_payment_mode AS ENUM (
        'single_payer',
        'split_equal',
        'split_by_items'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.ya_juntos_participant_role AS ENUM (
        'creator',
        'member'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.ya_juntos_participant_status AS ENUM (
        'active',
        'left'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.ya_juntos_participant_payment_status AS ENUM (
        'pending',
        'paid'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;


-- ==============================================================================
-- 2. TABLAS YA+ (SUSCRIPCIONES)
-- ==============================================================================

-- 2.1 Planes configurables desde el panel de administración
CREATE TABLE IF NOT EXISTS public.ya_plus_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    currency TEXT NOT NULL DEFAULT 'EUR',
    periodicity public.ya_plus_plan_periodicity NOT NULL DEFAULT 'monthly',
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 1,
    color TEXT NOT NULL DEFAULT '#B6FF00',
    icon TEXT NOT NULL DEFAULT 'Sparkles',
    badge_text TEXT DEFAULT NULL,
    promotional_text TEXT DEFAULT NULL,
    benefits JSONB NOT NULL DEFAULT '{}'::jsonb,
    conditions TEXT DEFAULT NULL,
    starts_at TIMESTAMPTZ DEFAULT NULL,
    expires_at TIMESTAMPTZ DEFAULT NULL,
    is_test BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ya_plus_plans_active ON public.ya_plus_plans(active, sort_order);
CREATE INDEX IF NOT EXISTS idx_ya_plus_plans_slug ON public.ya_plus_plans(slug);

-- 2.2 Suscripciones de usuario
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.ya_plus_plans(id) ON DELETE RESTRICT,
    plan_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    status public.ya_plus_subscription_status NOT NULL DEFAULT 'pending',
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    currency TEXT NOT NULL DEFAULT 'EUR',
    started_at TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
    payment_reference TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON public.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON public.user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_current_period ON public.user_subscriptions(current_period_end);

-- Solo una suscripción activa o pendiente por usuario a la vez
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_active_sub 
ON public.user_subscriptions (user_id) 
WHERE status IN ('active', 'pending');


-- ==============================================================================
-- 3. TABLAS YA JUNTOS (PEDIDOS COMPARTIDOS)
-- ==============================================================================

-- 3.1 Grupos de pedido compartido
CREATE TABLE IF NOT EXISTS public.ya_juntos_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Pedido en grupo YA',
    status public.ya_juntos_status NOT NULL DEFAULT 'open',
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    payment_mode public.ya_juntos_payment_mode NOT NULL DEFAULT 'split_by_items',
    single_payer_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    delivery_address_id UUID REFERENCES public.addresses(id) ON DELETE SET NULL,
    delivery_address_snapshot JSONB DEFAULT NULL,
    delivery_zone_id UUID REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 2.90 CHECK (delivery_fee >= 0),
    discount_total NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount_total >= 0),
    total NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total >= 0),
    amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
    notes TEXT DEFAULT NULL,
    frozen_at TIMESTAMPTZ DEFAULT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '24 hours'),
    is_test BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ya_juntos_groups_code ON public.ya_juntos_groups(code);
CREATE INDEX IF NOT EXISTS idx_ya_juntos_groups_creator ON public.ya_juntos_groups(creator_id);
CREATE INDEX IF NOT EXISTS idx_ya_juntos_groups_status ON public.ya_juntos_groups(status);
CREATE INDEX IF NOT EXISTS idx_ya_juntos_groups_order ON public.ya_juntos_groups(order_id);

-- 3.2 Participantes del grupo
CREATE TABLE IF NOT EXISTS public.ya_juntos_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES public.ya_juntos_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    role public.ya_juntos_participant_role NOT NULL DEFAULT 'member',
    status public.ya_juntos_participant_status NOT NULL DEFAULT 'active',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    allocated_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (allocated_amount >= 0),
    paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    payment_status public.ya_juntos_participant_payment_status NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMPTZ DEFAULT NULL,
    payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_juntos_group_user UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ya_juntos_participants_group ON public.ya_juntos_participants(group_id);
CREATE INDEX IF NOT EXISTS idx_ya_juntos_participants_user ON public.ya_juntos_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_ya_juntos_participants_payment ON public.ya_juntos_participants(payment_status);

-- 3.3 Líneas de producto añadidas por cada participante al grupo
CREATE TABLE IF NOT EXISTS public.ya_juntos_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES public.ya_juntos_groups(id) ON DELETE CASCADE,
    added_by_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    is_pack BOOLEAN NOT NULL DEFAULT false,
    pack_id UUID REFERENCES public.packs(id) ON DELETE SET NULL,
    selections JSONB NOT NULL DEFAULT '[]'::jsonb,
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    discounted_unit_price NUMERIC(10, 2) NOT NULL CHECK (discounted_unit_price >= 0),
    line_subtotal NUMERIC(10, 2) NOT NULL CHECK (line_subtotal >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ya_juntos_items_group ON public.ya_juntos_items(group_id);
CREATE INDEX IF NOT EXISTS idx_ya_juntos_items_user ON public.ya_juntos_items(added_by_user_id);


-- ==============================================================================
-- 4. RPCS PARA YA+ (SUSCRIPCIONES)
-- ==============================================================================

-- 4.1 Crear intención de suscripción (o retomar pendiente)
CREATE OR REPLACE FUNCTION public.create_subscription_intent(
    p_plan_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_plan RECORD;
    v_existing_sub RECORD;
    v_sub_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión para suscribirte a YA+.';
    END IF;

    -- Validar que el plan existe y está activo
    SELECT * INTO v_plan FROM public.ya_plus_plans WHERE id = p_plan_id AND active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El plan seleccionado no existe o ya no está disponible.';
    END IF;

    -- Comprobar si ya tiene una suscripción activa
    SELECT * INTO v_existing_sub 
    FROM public.user_subscriptions 
    WHERE user_id = v_user_id AND status = 'active';

    IF FOUND THEN
        IF v_existing_sub.current_period_end > now() THEN
            RAISE EXCEPTION 'Ya cuentas con una suscripción activa a YA+ hasta el %.', to_char(v_existing_sub.current_period_end, 'DD/MM/YYYY');
        END IF;
    END IF;

    -- Limpiar suscripciones 'pending' anteriores del usuario
    DELETE FROM public.user_subscriptions 
    WHERE user_id = v_user_id AND status = 'pending';

    -- Crear nueva suscripción pendiente con congelación de precio y snapshot del plan
    INSERT INTO public.user_subscriptions (
        user_id,
        plan_id,
        plan_snapshot,
        status,
        price,
        currency,
        cancel_at_period_end,
        metadata
    ) VALUES (
        v_user_id,
        v_plan.id,
        jsonb_build_object(
            'id', v_plan.id,
            'name', v_plan.name,
            'slug', v_plan.slug,
            'periodicity', v_plan.periodicity,
            'price', v_plan.price,
            'benefits', v_plan.benefits
        ),
        'pending',
        v_plan.price,
        v_plan.currency,
        false,
        jsonb_build_object('created_from', 'rpc')
    ) RETURNING id INTO v_sub_id;

    RETURN jsonb_build_object(
        'success', true,
        'subscription_id', v_sub_id,
        'plan_name', v_plan.name,
        'price', v_plan.price,
        'currency', v_plan.currency,
        'periodicity', v_plan.periodicity
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_subscription_intent TO authenticated;


-- 4.2 Confirmar pago de suscripción (Atómico, idempotente y server-side)
CREATE OR REPLACE FUNCTION public.confirm_subscription_payment(
    p_subscription_id UUID,
    p_provider_order_id TEXT,
    p_capture_id TEXT,
    p_amount NUMERIC(10, 2),
    p_method TEXT DEFAULT 'paypal',
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub RECORD;
    v_plan RECORD;
    v_interval INTERVAL;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_period_end TIMESTAMPTZ;
    v_payment_id UUID;
BEGIN
    -- Bloquear registro para evitar concurrencia
    SELECT * INTO v_sub 
    FROM public.user_subscriptions 
    WHERE id = p_subscription_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Suscripción no encontrada.';
    END IF;

    -- Idempotencia: si ya está activa con el mismo capture_id
    IF v_sub.status = 'active' THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_active', true,
            'subscription_id', v_sub.id,
            'current_period_end', v_sub.current_period_end
        );
    END IF;

    -- Validar plan
    SELECT * INTO v_plan FROM public.ya_plus_plans WHERE id = v_sub.plan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plan no encontrado.';
    END IF;

    -- Anti-tampering de precio
    IF ABS(p_amount - v_sub.price) > 0.01 THEN
        RAISE EXCEPTION 'Discrepancia en el importe de suscripción: esperado % €, recibido % €', v_sub.price, p_amount;
    END IF;

    -- Calcular periodo según periodicidad
    CASE v_plan.periodicity
        WHEN 'yearly' THEN
            v_interval := INTERVAL '1 year';
        WHEN 'quarterly' THEN
            v_interval := INTERVAL '3 months';
        WHEN 'weekly' THEN
            v_interval := INTERVAL '1 week';
        ELSE
            v_interval := INTERVAL '1 month';
    END CASE;

    v_period_end := v_now + v_interval;

    -- Registrar pago en public.payments
    INSERT INTO public.payments (
        user_id,
        provider,
        provider_order_id,
        provider_capture_id,
        payment_method,
        status,
        amount,
        currency,
        raw_payload
    ) VALUES (
        v_sub.user_id,
        'paypal',
        p_provider_order_id,
        p_capture_id,
        COALESCE(p_method, 'paypal'),
        'paid',
        p_amount,
        v_sub.currency,
        p_metadata || jsonb_build_object('subscription_id', v_sub.id)
    ) RETURNING id INTO v_payment_id;

    -- Activar suscripción
    UPDATE public.user_subscriptions
    SET status = 'active',
        started_at = COALESCE(started_at, v_now),
        current_period_start = v_now,
        current_period_end = v_period_end,
        payment_id = v_payment_id,
        payment_reference = p_capture_id,
        cancel_at_period_end = false,
        updated_at = v_now
    WHERE id = v_sub.id;

    -- Notificación automática de bienvenida a YA+
    PERFORM public.create_system_notification(
        p_user_id := v_sub.user_id,
        p_type := 'ya_plus_subscribed',
        p_title := '¡Bienvenido a YA+!',
        p_message := 'Tu suscripción al plan ' || v_plan.name || ' está activa hasta el ' || to_char(v_period_end, 'DD/MM/YYYY') || '. Disfruta de tus envíos gratis y ventajas exclusivas.',
        p_idempotency_key := 'sub_active_' || v_sub.id || '_' || p_capture_id,
        p_link := '/app/perfil'
    );

    RETURN jsonb_build_object(
        'success', true,
        'subscription_id', v_sub.id,
        'status', 'active',
        'current_period_start', v_now,
        'current_period_end', v_period_end,
        'plan_name', v_plan.name
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_subscription_payment TO service_role, authenticated;


-- 4.3 Cancelar suscripción a fin de periodo
CREATE OR REPLACE FUNCTION public.cancel_user_subscription(
    p_subscription_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_sub RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No autorizado.';
    END IF;

    SELECT * INTO v_sub 
    FROM public.user_subscriptions 
    WHERE id = p_subscription_id AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Suscripción no encontrada o no pertenece a tu cuenta.';
    END IF;

    IF v_sub.status != 'active' THEN
        RAISE EXCEPTION 'Solo puedes cancelar una suscripción activa.';
    END IF;

    UPDATE public.user_subscriptions
    SET cancel_at_period_end = true,
        cancelled_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = v_sub.id;

    -- Notificación informativa
    PERFORM public.create_system_notification(
        p_user_id := v_user_id,
        p_type := 'ya_plus_cancelled',
        p_title := 'Suscripción YA+ cancelada',
        p_message := 'Tu suscripción no se renovará, pero mantendrás tus ventajas activas hasta el ' || to_char(v_sub.current_period_end, 'DD/MM/YYYY') || '.',
        p_idempotency_key := 'sub_cancel_' || v_sub.id || '_' || to_char(now(), 'YYYYMMDDHH24MISS'),
        p_link := '/app/perfil'
    );

    RETURN jsonb_build_object(
        'success', true,
        'subscription_id', v_sub.id,
        'cancel_at_period_end', true,
        'current_period_end', v_sub.current_period_end
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_user_subscription TO authenticated;


-- 4.4 Consultar suscripción activa del usuario (con beneficios resueltos)
CREATE OR REPLACE FUNCTION public.get_user_active_subscription(
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_user_id UUID;
    v_sub RECORD;
    v_plan RECORD;
    v_is_active BOOLEAN;
BEGIN
    v_target_user_id := COALESCE(p_user_id, auth.uid());
    IF v_target_user_id IS NULL THEN
        RETURN jsonb_build_object('has_active_subscription', false);
    END IF;

    SELECT s.*, p.name as plan_name, p.slug as plan_slug, p.benefits as plan_benefits, p.color as plan_color
    INTO v_sub
    FROM public.user_subscriptions s
    JOIN public.ya_plus_plans p ON p.id = s.plan_id
    WHERE s.user_id = v_target_user_id
      AND s.status = 'active'
      AND s.current_period_end > timezone('utc'::text, now())
    ORDER BY s.current_period_end DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'has_active_subscription', false
        );
    END IF;

    RETURN jsonb_build_object(
        'has_active_subscription', true,
        'subscription_id', v_sub.id,
        'plan_id', v_sub.plan_id,
        'plan_name', v_sub.plan_name,
        'plan_slug', v_sub.plan_slug,
        'plan_color', v_sub.plan_color,
        'benefits', v_sub.plan_benefits,
        'started_at', v_sub.started_at,
        'current_period_end', v_sub.current_period_end,
        'cancel_at_period_end', v_sub.cancel_at_period_end,
        'price', v_sub.price,
        'currency', v_sub.currency
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_active_subscription TO authenticated, anon;


-- ==============================================================================
-- 5. RPCS PARA YA JUNTOS (PEDIDOS COMPARTIDOS TIPO TRICOUNT)
-- ==============================================================================

-- 5.1 Crear grupo compartido (Genera código unívoco de 6 caracteres no predecible)
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
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión para crear un grupo de YA Juntos.';
    END IF;

    SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_user_id;

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


-- 5.2 Unirse a un grupo mediante código
CREATE OR REPLACE FUNCTION public.join_ya_juntos_group(
    p_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user_profile RECORD;
    v_group RECORD;
    v_clean_code TEXT;
    v_participant RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión para unirte a un grupo de YA Juntos.';
    END IF;

    v_clean_code := upper(trim(p_code));

    SELECT * INTO v_group 
    FROM public.ya_juntos_groups 
    WHERE code = v_clean_code;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontró ningún grupo con el código %.', v_clean_code;
    END IF;

    IF v_group.status != 'open' THEN
        RAISE EXCEPTION 'Este grupo ya está cerrado o en fase de pago (estado: %).', v_group.status;
    END IF;

    IF v_group.expires_at < timezone('utc'::text, now()) THEN
        RAISE EXCEPTION 'Este grupo ha expirado.';
    END IF;

    SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_user_id;

    -- Si ya es participante
    SELECT * INTO v_participant 
    FROM public.ya_juntos_participants 
    WHERE group_id = v_group.id AND user_id = v_user_id;

    IF FOUND THEN
        IF v_participant.status = 'left' THEN
            -- Reactivar
            UPDATE public.ya_juntos_participants 
            SET status = 'active', updated_at = now() 
            WHERE id = v_participant.id;
        END IF;
    ELSE
        -- Insertar nuevo miembro
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
            v_group.id,
            v_user_id,
            COALESCE(v_user_profile.full_name, 'Participante'),
            'member',
            'active',
            0.00,
            0.00,
            'pending'
        );

        -- Notificar al creador que un nuevo amigo se ha unido
        PERFORM public.create_system_notification(
            p_user_id := v_group.creator_id,
            p_type := 'ya_juntos_joined',
            p_title := 'Nuevo participante en tu grupo',
            p_message := COALESCE(v_user_profile.full_name, 'Alguien') || ' se ha unido a tu pedido compartido.',
            p_idempotency_key := 'juntos_join_' || v_group.id || '_' || v_user_id,
            p_link := '/app/juntos/' || v_group.code
        );
    END IF;

    -- Recalcular importes del grupo
    PERFORM public.recalculate_ya_juntos_group(v_group.id);

    RETURN jsonb_build_object(
        'success', true,
        'group_id', v_group.id,
        'code', v_group.code,
        'title', v_group.title,
        'payment_mode', v_group.payment_mode
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_ya_juntos_group TO authenticated;


-- 5.3 Abandonar un grupo
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
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No autorizado.';
    END IF;

    SELECT * INTO v_group FROM public.ya_juntos_groups WHERE id = p_group_id;
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
        RETURN jsonb_build_object('success', true);
    END IF;

    IF v_part.role = 'creator' THEN
        RAISE EXCEPTION 'El creador no puede abandonar el grupo. Puedes cancelarlo en su lugar.';
    END IF;

    -- Eliminar líneas añadidas por el usuario
    DELETE FROM public.ya_juntos_items 
    WHERE group_id = p_group_id AND added_by_user_id = v_user_id;

    -- Marcar participante como left o eliminar
    DELETE FROM public.ya_juntos_participants WHERE id = v_part.id;

    -- Recalcular importes
    PERFORM public.recalculate_ya_juntos_group(p_group_id);

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_ya_juntos_group TO authenticated;


-- 5.4 Añadir producto o pack a YA Juntos
CREATE OR REPLACE FUNCTION public.add_item_to_ya_juntos(
    p_group_id UUID,
    p_product_id UUID,
    p_quantity INT DEFAULT 1,
    p_is_pack BOOLEAN DEFAULT false,
    p_pack_id UUID DEFAULT NULL,
    p_selections JSONB DEFAULT '[]'::jsonb
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
    v_prod RECORD;
    v_pack RECORD;
    v_unit_price NUMERIC(10, 2);
    v_line_subtotal NUMERIC(10, 2);
    v_item_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión.';
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'La cantidad debe ser mayor a 0.';
    END IF;

    SELECT * INTO v_group FROM public.ya_juntos_groups WHERE id = p_group_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Grupo no encontrado.';
    END IF;

    IF v_group.status != 'open' THEN
        RAISE EXCEPTION 'El pedido compartido ya no está abierto para añadir más productos.';
    END IF;

    -- Verificar que el usuario pertenece al grupo
    SELECT * INTO v_part 
    FROM public.ya_juntos_participants 
    WHERE group_id = p_group_id AND user_id = v_user_id AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Debes unirte primero al grupo para añadir productos.';
    END IF;

    -- Obtener precio real autoritativo de base de datos
    IF p_is_pack AND p_pack_id IS NOT NULL THEN
        SELECT * INTO v_pack FROM public.packs WHERE id = p_pack_id AND active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'El pack seleccionado no existe o está inactivo.';
        END IF;
        v_unit_price := v_pack.price;
    ELSE
        SELECT * INTO v_prod FROM public.products WHERE id = p_product_id AND active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'El producto seleccionado no existe o está inactivo.';
        END IF;
        v_unit_price := v_prod.price;
    END IF;

    v_line_subtotal := round((v_unit_price * p_quantity)::numeric, 2);

    -- Insertar línea
    INSERT INTO public.ya_juntos_items (
        group_id,
        added_by_user_id,
        product_id,
        quantity,
        is_pack,
        pack_id,
        selections,
        unit_price,
        discounted_unit_price,
        line_subtotal
    ) VALUES (
        p_group_id,
        v_user_id,
        p_product_id,
        p_quantity,
        COALESCE(p_is_pack, false),
        p_pack_id,
        COALESCE(p_selections, '[]'::jsonb),
        v_unit_price,
        v_unit_price,
        v_line_subtotal
    ) RETURNING id INTO v_item_id;

    -- Recalcular grupo atómicamente
    PERFORM public.recalculate_ya_juntos_group(p_group_id);

    RETURN jsonb_build_object(
        'success', true,
        'item_id', v_item_id,
        'unit_price', v_unit_price,
        'line_subtotal', v_line_subtotal
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_item_to_ya_juntos TO authenticated;


-- 5.5 Eliminar línea de YA Juntos (solo autor de la línea o creador del grupo)
CREATE OR REPLACE FUNCTION public.remove_item_from_ya_juntos(
    p_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_item RECORD;
    v_group RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No autorizado.';
    END IF;

    SELECT * INTO v_item FROM public.ya_juntos_items WHERE id = p_item_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Línea no encontrada.';
    END IF;

    SELECT * INTO v_group FROM public.ya_juntos_groups WHERE id = v_item.group_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Grupo no encontrado.';
    END IF;

    IF v_group.status != 'open' THEN
        RAISE EXCEPTION 'El grupo está cerrado para modificaciones.';
    END IF;

    IF v_item.added_by_user_id != v_user_id AND v_group.creator_id != v_user_id THEN
        RAISE EXCEPTION 'Solo el creador o quien añadió este producto puede eliminarlo.';
    END IF;

    DELETE FROM public.ya_juntos_items WHERE id = p_item_id;

    -- Recalcular
    PERFORM public.recalculate_ya_juntos_group(v_group.id);

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_item_from_ya_juntos TO authenticated;


-- 5.6 Recálculo atómico de importes y reparto exacto al céntimo (Algoritmo Tricount)
CREATE OR REPLACE FUNCTION public.recalculate_ya_juntos_group(
    p_group_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_group RECORD;
    v_items_subtotal NUMERIC(10, 2) := 0.00;
    v_delivery_fee NUMERIC(10, 2) := 2.90;
    v_total NUMERIC(10, 2) := 0.00;
    v_active_count INT := 0;
    v_creator_has_ya_plus BOOLEAN := false;
    v_plus_sub JSONB;

    -- Variables para reparto exacto
    v_part RECORD;
    v_part_items_subtotal NUMERIC(10, 2);
    v_part_fee_share NUMERIC(10, 2);
    v_fee_cents INT;
    v_base_cents_per_part INT;
    v_remainder_cents INT;
    v_index INT := 0;
    v_allocated NUMERIC(10, 2);
    v_sum_allocated NUMERIC(10, 2) := 0.00;
BEGIN
    SELECT * INTO v_group FROM public.ya_juntos_groups WHERE id = p_group_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Grupo no encontrado.');
    END IF;

    -- 1. Calcular subtotal de items
    SELECT COALESCE(SUM(line_subtotal), 0.00) 
    INTO v_items_subtotal
    FROM public.ya_juntos_items 
    WHERE group_id = p_group_id;

    -- 2. Tarifa de envío estándar
    v_delivery_fee := 2.90;

    -- Comprobar si el creador del grupo tiene YA+ con envío gratis
    v_plus_sub := public.get_user_active_subscription(v_group.creator_id);
    IF (v_plus_sub->>'has_active_subscription')::boolean = true THEN
        IF (v_plus_sub->'benefits'->>'free_shipping')::boolean = true THEN
            v_delivery_fee := 0.00;
            v_creator_has_ya_plus := true;
        END IF;
    END IF;

    -- Si subtotal alcanza 30€, envío gratis automático comercial
    IF v_items_subtotal >= 30.00 THEN
        v_delivery_fee := 0.00;
    END IF;

    v_total := round((v_items_subtotal + v_delivery_fee)::numeric, 2);

    -- 3. Contar participantes activos
    SELECT COUNT(*) INTO v_active_count 
    FROM public.ya_juntos_participants 
    WHERE group_id = p_group_id AND status = 'active';

    IF v_active_count = 0 THEN
        v_active_count := 1;
    END IF;

    -- 4. Reparto según payment_mode
    IF v_group.payment_mode = 'single_payer' THEN
        -- Modo A: Un solo pagador asume el 100%
        UPDATE public.ya_juntos_participants
        SET allocated_amount = CASE 
                WHEN user_id = COALESCE(v_group.single_payer_user_id, v_group.creator_id) THEN v_total 
                ELSE 0.00 
            END,
            updated_at = now()
        WHERE group_id = p_group_id AND status = 'active';

    ELSIF v_group.payment_mode = 'split_equal' THEN
        -- Modo B1: Dividir total en partes iguales con residuo de céntimos exacto
        v_fee_cents := round(v_total * 100)::int;
        v_base_cents_per_part := v_fee_cents / v_active_count;
        v_remainder_cents := v_fee_cents % v_active_count;

        v_index := 0;
        FOR v_part IN 
            SELECT id FROM public.ya_juntos_participants 
            WHERE group_id = p_group_id AND status = 'active' 
            ORDER BY joined_at ASC 
        LOOP
            v_index := v_index + 1;
            -- Si quedan céntimos de residuo, se distribuyen uno por uno a los primeros participantes
            IF v_index <= v_remainder_cents THEN
                v_allocated := round(((v_base_cents_per_part + 1)::numeric / 100.0), 2);
            ELSE
                v_allocated := round((v_base_cents_per_part::numeric / 100.0), 2);
            END IF;

            UPDATE public.ya_juntos_participants 
            SET allocated_amount = v_allocated, updated_at = now() 
            WHERE id = v_part.id;

            v_sum_allocated := v_sum_allocated + v_allocated;
        END LOOP;

    ELSE
        -- Modo B2 ('split_by_items'): Cada uno paga exactamente sus items + su cuota equitativa de envío
        -- Reparto de los céntimos del envío entre participantes
        v_fee_cents := round(v_delivery_fee * 100)::int;
        v_base_cents_per_part := v_fee_cents / v_active_count;
        v_remainder_cents := v_fee_cents % v_active_count;

        v_index := 0;
        FOR v_part IN 
            SELECT p.id, p.user_id, COALESCE(SUM(i.line_subtotal), 0.00) as my_subtotal
            FROM public.ya_juntos_participants p
            LEFT JOIN public.ya_juntos_items i ON i.group_id = p.group_id AND i.added_by_user_id = p.user_id
            WHERE p.group_id = p_group_id AND p.status = 'active'
            GROUP BY p.id, p.user_id, p.joined_at
            ORDER BY p.joined_at ASC
        LOOP
            v_index := v_index + 1;
            IF v_index <= v_remainder_cents THEN
                v_part_fee_share := round(((v_base_cents_per_part + 1)::numeric / 100.0), 2);
            ELSE
                v_part_fee_share := round((v_base_cents_per_part::numeric / 100.0), 2);
            END IF;

            v_allocated := round((v_part.my_subtotal + v_part_fee_share)::numeric, 2);

            UPDATE public.ya_juntos_participants 
            SET allocated_amount = v_allocated, updated_at = now() 
            WHERE id = v_part.id;

            v_sum_allocated := v_sum_allocated + v_allocated;
        END LOOP;
    END IF;

    -- Actualizar cabecera del grupo
    UPDATE public.ya_juntos_groups
    SET subtotal = v_items_subtotal,
        delivery_fee = v_delivery_fee,
        total = v_total,
        updated_at = now()
    WHERE id = p_group_id;

    RETURN jsonb_build_object(
        'success', true,
        'group_id', p_group_id,
        'subtotal', v_items_subtotal,
        'delivery_fee', v_delivery_fee,
        'total', v_total,
        'creator_has_ya_plus', v_creator_has_ya_plus
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_ya_juntos_group TO authenticated, service_role;


-- 5.7 Confirmar pedido compartido y pasar a fase de cobro (Atómico)
CREATE OR REPLACE FUNCTION public.confirm_ya_juntos_order(
    p_group_id UUID,
    p_address_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_group RECORD;
    v_address_snapshot JSONB;
    v_order_number TEXT;
    v_order_id UUID;
    v_item RECORD;
    v_part RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No autorizado.';
    END IF;

    SELECT * INTO v_group FROM public.ya_juntos_groups WHERE id = p_group_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Grupo no encontrado.';
    END IF;

    IF v_group.creator_id != v_user_id THEN
        RAISE EXCEPTION 'Solo el organizador del grupo puede cerrar el carrito e iniciar el cobro.';
    END IF;

    IF v_group.status != 'open' THEN
        RAISE EXCEPTION 'El grupo ya ha sido confirmado previamente (estado: %).', v_group.status;
    END IF;

    -- Validar que haya al menos 1 producto
    IF NOT EXISTS (SELECT 1 FROM public.ya_juntos_items WHERE group_id = p_group_id) THEN
        RAISE EXCEPTION 'El carrito compartido está vacío. Añade productos antes de continuar.';
    END IF;

    -- Recalcular para asegurar importes frescos y exactos
    PERFORM public.recalculate_ya_juntos_group(p_group_id);
    SELECT * INTO v_group FROM public.ya_juntos_groups WHERE id = p_group_id;

    -- Snapshot de la dirección de entrega
    SELECT jsonb_build_object(
        'name', a.name,
        'phone', a.phone,
        'street', a.street,
        'number', a.number,
        'floor', a.floor_door,
        'postalCode', a.postal_code,
        'city', a.city,
        'notes', a.notes
    ) INTO v_address_snapshot
    FROM public.addresses a
    WHERE a.id = p_address_id AND a.user_id = v_user_id;

    IF v_address_snapshot IS NULL THEN
        RAISE EXCEPTION 'Dirección de entrega inválida o no pertenece a tu cuenta.';
    END IF;

    -- Generar número de pedido unívoco
    v_order_number := 'YA-' || nextval('public.order_number_seq')::text;

    -- Crear pedido real en public.orders con estado payment_pending
    INSERT INTO public.orders (
        user_id,
        order_number,
        address_id,
        address_snapshot,
        status,
        payment_status,
        payment_method,
        subtotal,
        delivery_fee,
        discount_total,
        total,
        notes
    ) VALUES (
        v_group.creator_id,
        v_order_number,
        p_address_id,
        v_address_snapshot,
        'payment_pending',
        'pending',
        'paypal',
        v_group.subtotal,
        v_group.delivery_fee,
        0.00,
        v_group.total,
        COALESCE(p_notes, v_group.notes, 'Pedido compartido YA Juntos [' || v_group.code || ']')
    ) RETURNING id INTO v_order_id;

    -- Migrar items a order_items
    FOR v_item IN 
        SELECT * FROM public.ya_juntos_items WHERE group_id = p_group_id 
    LOOP
        INSERT INTO public.order_items (
            order_id,
            product_id,
            quantity,
            unit_price,
            discounted_unit_price,
            subtotal,
            is_pack,
            pack_id,
            pack_snapshot
        ) VALUES (
            v_order_id,
            v_item.product_id,
            v_item.quantity,
            v_item.unit_price,
            v_item.discounted_unit_price,
            v_item.line_subtotal,
            v_item.is_pack,
            v_item.pack_id,
            CASE WHEN v_item.is_pack THEN v_item.selections ELSE NULL END
        );
    END LOOP;

    -- Actualizar grupo a fase payment_pending y congelar
    UPDATE public.ya_juntos_groups
    SET status = 'payment_pending',
        order_id = v_order_id,
        delivery_address_id = p_address_id,
        delivery_address_snapshot = v_address_snapshot,
        frozen_at = timezone('utc'::text, now()),
        notes = p_notes,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_group_id;

    -- Notificar a todos los participantes que el pedido está listo para pagar
    FOR v_part IN 
        SELECT * FROM public.ya_juntos_participants 
        WHERE group_id = p_group_id AND status = 'active' 
    LOOP
        PERFORM public.create_system_notification(
            p_user_id := v_part.user_id,
            p_type := 'ya_juntos_ready_to_pay',
            p_title := '¡Listo para pagar! Pedido ' || v_order_number,
            p_message := 'El organizador ha cerrado el pedido ' || v_group.title || '. Tu parte a pagar es de ' || v_part.allocated_amount || ' €.',
            p_idempotency_key := 'juntos_ready_' || p_group_id || '_' || v_part.user_id,
            p_link := '/app/juntos/' || v_group.code
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'group_id', p_group_id,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'total', v_group.total,
        'status', 'payment_pending'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_ya_juntos_order TO authenticated;


-- 5.8 Confirmar pago parcial de participante en YA Juntos (Atómico, concurrente y blindado)
CREATE OR REPLACE FUNCTION public.confirm_juntos_partial_payment(
    p_participant_id UUID,
    p_provider_order_id TEXT,
    p_capture_id TEXT,
    p_amount NUMERIC(10, 2),
    p_method TEXT DEFAULT 'paypal',
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_part RECORD;
    v_group RECORD;
    v_order RECORD;
    v_payment_id UUID;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_new_amount_paid NUMERIC(10, 2);
    v_all_paid BOOLEAN := false;
    v_p RECORD;
BEGIN
    -- Bloqueo pesimista del participante
    SELECT * INTO v_part 
    FROM public.ya_juntos_participants 
    WHERE id = p_participant_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Participante no encontrado.';
    END IF;

    -- Bloqueo pesimista del grupo
    SELECT * INTO v_group 
    FROM public.ya_juntos_groups 
    WHERE id = v_part.group_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Grupo no encontrado.';
    END IF;

    -- Idempotencia: Si este participante ya está pagado con este capture_id
    IF v_part.payment_status = 'paid' THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_paid', true,
            'participant_id', v_part.id,
            'group_id', v_group.id,
            'fully_paid', (v_group.status = 'fully_paid')
        );
    END IF;

    -- Anti-tampering: validar importe
    IF ABS(p_amount - v_part.allocated_amount) > 0.01 THEN
        RAISE EXCEPTION 'Discrepancia en importe del participante: asignado % €, recibido % €', v_part.allocated_amount, p_amount;
    END IF;

    -- Registrar pago en payments
    INSERT INTO public.payments (
        order_id,
        user_id,
        provider,
        provider_order_id,
        provider_capture_id,
        payment_method,
        status,
        amount,
        currency,
        raw_payload
    ) VALUES (
        v_group.order_id,
        v_part.user_id,
        'paypal',
        p_provider_order_id,
        p_capture_id,
        COALESCE(p_method, 'paypal'),
        'paid',
        p_amount,
        'EUR',
        p_metadata || jsonb_build_object(
            'juntos_group_id', v_group.id,
            'juntos_participant_id', v_part.id
        )
    ) RETURNING id INTO v_payment_id;

    -- Actualizar participante a 'paid'
    UPDATE public.ya_juntos_participants
    SET payment_status = 'paid',
        paid_amount = p_amount,
        paid_at = v_now,
        payment_id = v_payment_id,
        updated_at = v_now
    WHERE id = v_part.id;

    -- Incrementar amount_paid del grupo
    v_new_amount_paid := round((v_group.amount_paid + p_amount)::numeric, 2);

    -- Comprobar si todos los participantes activos han pagado
    v_all_paid := NOT EXISTS (
        SELECT 1 FROM public.ya_juntos_participants 
        WHERE group_id = v_group.id 
          AND status = 'active' 
          AND allocated_amount > 0.00 
          AND payment_status != 'paid'
    );

    IF v_all_paid AND v_new_amount_paid >= v_group.total - 0.01 THEN
        -- TODOS HAN PAGADO: TRANSICIONAR GRUPO Y PEDIDO A FULLY_PAID / RECEIVED
        UPDATE public.ya_juntos_groups
        SET status = 'fully_paid',
            amount_paid = v_new_amount_paid,
            updated_at = v_now
        WHERE id = v_group.id;

        -- Actualizar pedido principal en public.orders
        IF v_group.order_id IS NOT NULL THEN
            UPDATE public.orders
            SET status = 'received',
                payment_status = 'paid',
                updated_at = v_now
            WHERE id = v_group.order_id;
        END IF;

        -- Notificar a todos los miembros del grupo que el pedido está 100% pagado y en cocina
        FOR v_p IN 
            SELECT user_id FROM public.ya_juntos_participants 
            WHERE group_id = v_group.id AND status = 'active'
        LOOP
            PERFORM public.create_system_notification(
                p_user_id := v_p.user_id,
                p_type := 'ya_juntos_fully_paid',
                p_title := '¡Todos han pagado! Pedido en marcha',
                p_message := 'El pedido compartido ' || v_group.title || ' se ha pagado al 100% y ya está siendo preparado.',
                p_idempotency_key := 'juntos_full_paid_' || v_group.id,
                p_order_id := v_group.order_id,
                p_link := '/app/pedido/' || COALESCE(v_group.order_id::text, '')
            );
        END LOOP;

    ELSE
        -- Pago parcial completado, pero quedan otros participantes por pagar
        UPDATE public.ya_juntos_groups
        SET amount_paid = v_new_amount_paid,
            updated_at = v_now
        WHERE id = v_group.id;

        -- Notificar al creador del grupo sobre el pago recibido
        IF v_part.user_id != v_group.creator_id THEN
            PERFORM public.create_system_notification(
                p_user_id := v_group.creator_id,
                p_type := 'ya_juntos_payment_received',
                p_title := 'Pago recibido en tu grupo',
                p_message := v_part.display_name || ' ha pagado su parte (' || p_amount || ' €).',
                p_idempotency_key := 'juntos_part_paid_' || p_participant_id || '_' || p_capture_id,
                p_link := '/app/juntos/' || v_group.code
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'participant_id', v_part.id,
        'group_id', v_group.id,
        'amount_paid', p_amount,
        'group_total_paid', v_new_amount_paid,
        'group_total', v_group.total,
        'fully_paid', v_all_paid
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_juntos_partial_payment TO service_role, authenticated;


-- 5.9 Confirmar pago total de YA Juntos (Modo A: Single Payer)
CREATE OR REPLACE FUNCTION public.confirm_juntos_full_payment(
    p_group_id UUID,
    p_provider_order_id TEXT,
    p_capture_id TEXT,
    p_amount NUMERIC(10, 2),
    p_method TEXT DEFAULT 'paypal',
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_group RECORD;
    v_payer_id UUID;
    v_payment_id UUID;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_p RECORD;
BEGIN
    SELECT * INTO v_group 
    FROM public.ya_juntos_groups 
    WHERE id = p_group_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Grupo no encontrado.';
    END IF;

    IF v_group.status = 'fully_paid' THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_paid', true,
            'group_id', v_group.id
        );
    END IF;

    -- Validar importe total
    IF ABS(p_amount - v_group.total) > 0.01 THEN
        RAISE EXCEPTION 'Discrepancia en el importe total: esperado % €, recibido % €', v_group.total, p_amount;
    END IF;

    v_payer_id := COALESCE(v_group.single_payer_user_id, v_group.creator_id);

    -- Registrar pago en payments
    INSERT INTO public.payments (
        order_id,
        user_id,
        provider,
        provider_order_id,
        provider_capture_id,
        payment_method,
        status,
        amount,
        currency,
        raw_payload
    ) VALUES (
        v_group.order_id,
        v_payer_id,
        'paypal',
        p_provider_order_id,
        p_capture_id,
        COALESCE(p_method, 'paypal'),
        'paid',
        p_amount,
        'EUR',
        p_metadata || jsonb_build_object('juntos_group_id', v_group.id, 'mode', 'single_payer')
    ) RETURNING id INTO v_payment_id;

    -- Marcar todos los participantes como pagados
    UPDATE public.ya_juntos_participants
    SET payment_status = 'paid',
        paid_amount = allocated_amount,
        paid_at = v_now,
        updated_at = v_now
    WHERE group_id = v_group.id AND status = 'active';

    -- Actualizar grupo a fully_paid
    UPDATE public.ya_juntos_groups
    SET status = 'fully_paid',
        amount_paid = p_amount,
        updated_at = v_now
    WHERE id = v_group.id;

    -- Actualizar pedido en public.orders
    IF v_group.order_id IS NOT NULL THEN
        UPDATE public.orders
        SET status = 'received',
            payment_status = 'paid',
            updated_at = v_now
        WHERE id = v_group.order_id;
    END IF;

    -- Notificar a todos los miembros
    FOR v_p IN 
        SELECT user_id FROM public.ya_juntos_participants 
        WHERE group_id = v_group.id AND status = 'active'
    LOOP
        PERFORM public.create_system_notification(
            p_user_id := v_p.user_id,
            p_type := 'ya_juntos_fully_paid',
            p_title := '¡Pedido pagado y en marcha!',
            p_message := 'El pedido compartido ' || v_group.title || ' se ha pagado en su totalidad y ya está en preparación.',
            p_idempotency_key := 'juntos_full_paid_' || v_group.id,
            p_order_id := v_group.order_id,
            p_link := '/app/pedido/' || COALESCE(v_group.order_id::text, '')
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'group_id', v_group.id,
        'order_id', v_group.order_id,
        'status', 'fully_paid'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_juntos_full_payment TO service_role, authenticated;


-- ==============================================================================
-- 6. DATOS INICIALES (PLANES YA+ POR DEFECTO)
-- ==============================================================================

INSERT INTO public.ya_plus_plans (
    name,
    slug,
    description,
    price,
    currency,
    periodicity,
    active,
    sort_order,
    color,
    badge_text,
    promotional_text,
    benefits,
    conditions
) VALUES 
(
    'YA+ Mensual',
    'ya-plus-mensual',
    'Envíos gratis ilimitados en todos tus pedidos, promociones exclusivas y acceso prioritario.',
    4.99,
    'EUR',
    'monthly',
    true,
    1,
    '#B6FF00',
    'MÁS POPULAR',
    '¡Amortízalo en solo 2 pedidos al mes!',
    jsonb_build_object(
        'free_shipping', true,
        'free_shipping_min_order', 0.00,
        'order_discount_percent', 5.0,
        'early_access', true
    ),
    'Renovación mensual automática. Cancela en cualquier momento sin penalización manteniendo tus ventajas hasta el final del periodo.'
),
(
    'YA+ Anual',
    'ya-plus-anual',
    'El pase definitivo para los que piden de verdad. 12 meses al precio de 9.',
    44.90,
    'EUR',
    'yearly',
    true,
    2,
    '#FFFFFF',
    'MEJOR VALOR',
    'Ahorra más de 15 € al año en envíos.',
    jsonb_build_object(
        'free_shipping', true,
        'free_shipping_min_order', 0.00,
        'order_discount_percent', 10.0,
        'early_access', true
    ),
    'Facturación anual única de 44,90 €. Cancela cuando quieras.'
)
ON CONFLICT (slug) DO NOTHING;


-- ==============================================================================
-- 7. SEGURIDAD RLS
-- ==============================================================================

ALTER TABLE public.ya_plus_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ya_juntos_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ya_juntos_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ya_juntos_items ENABLE ROW LEVEL SECURITY;

-- 7.1 ya_plus_plans
CREATE POLICY "ya_plus_plans_select_active" ON public.ya_plus_plans
    FOR SELECT TO public
    USING (active = true OR public.is_admin());

CREATE POLICY "ya_plus_plans_admin_all" ON public.ya_plus_plans
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 7.2 user_subscriptions
CREATE POLICY "user_subscriptions_select_own" ON public.user_subscriptions
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "user_subscriptions_admin_all" ON public.user_subscriptions
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 7.3 ya_juntos_groups
CREATE POLICY "ya_juntos_groups_select" ON public.ya_juntos_groups
    FOR SELECT TO public
    USING (true); -- Permitido consultar por código o ser participante

CREATE POLICY "ya_juntos_groups_insert" ON public.ya_juntos_groups
    FOR INSERT TO authenticated
    WITH CHECK (creator_id = auth.uid());

CREATE POLICY "ya_juntos_groups_update" ON public.ya_juntos_groups
    FOR UPDATE TO authenticated
    USING (creator_id = auth.uid() OR public.is_admin())
    WITH CHECK (creator_id = auth.uid() OR public.is_admin());

-- 7.4 ya_juntos_participants
CREATE POLICY "ya_juntos_participants_select" ON public.ya_juntos_participants
    FOR SELECT TO public
    USING (true);

CREATE POLICY "ya_juntos_participants_modify_admin" ON public.ya_juntos_participants
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR public.is_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- 7.5 ya_juntos_items
CREATE POLICY "ya_juntos_items_select" ON public.ya_juntos_items
    FOR SELECT TO public
    USING (true);

CREATE POLICY "ya_juntos_items_insert" ON public.ya_juntos_items
    FOR INSERT TO authenticated
    WITH CHECK (added_by_user_id = auth.uid());

CREATE POLICY "ya_juntos_items_delete" ON public.ya_juntos_items
    FOR DELETE TO authenticated
    USING (added_by_user_id = auth.uid() OR public.is_admin());


-- ==============================================================================
-- 8. SUPABASE REALTIME
-- ==============================================================================
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ya_juntos_groups;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ya_juntos_participants;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ya_juntos_items;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_subscriptions;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
