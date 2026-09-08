-- ==============================================================================
-- MIGRACIÓN DE ESQUEMA SUPABASE — YA PLATAFORMA DE DELIVERY (JEREZ)
-- Fase: Arquitectura de Base de Datos Real
-- Nota: Idempotente (IF NOT EXISTS), preserva 'waitlist' intacta y aplica RLS
-- ==============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS Y TIPOS
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('customer', 'admin', 'courier');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status AS ENUM (
        'received',
        'preparing',
        'sourcing',
        'prepared',
        'delivering',
        'delivered',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method_type AS ENUM (
        'card',
        'apple_pay',
        'google_pay',
        'bizum',
        'cash'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status_type AS ENUM (
        'pending',
        'authorized',
        'paid',
        'failed',
        'refunded'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE stock_mode_type AS ENUM ('in_stock', 'out_of_stock', 'on_demand');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE discount_type_enum AS ENUM ('fixed', 'percentage');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. TABLA: PROFILES (Extiende auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT,
    role user_role NOT NULL DEFAULT 'customer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 4. TABLA: CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT,
    image TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_active ON public.categories(active);

-- 5. TABLA: PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    image TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    estimated_cost NUMERIC(10, 2) CHECK (estimated_cost >= 0),
    active BOOLEAN NOT NULL DEFAULT true,
    stock_mode stock_mode_type NOT NULL DEFAULT 'in_stock',
    stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    internal_courier_notes TEXT,
    suggested_purchase_locations TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(active);

-- 6. TABLA: ADDRESSES
CREATE TABLE IF NOT EXISTS public.addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    street TEXT NOT NULL,
    number TEXT NOT NULL,
    floor_door TEXT,
    postal_code TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT 'Jerez de la Frontera',
    notes TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON public.addresses(user_id);

-- 7. TABLA: DELIVERY_ZONES
CREATE TABLE IF NOT EXISTS public.delivery_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT 'Jerez de la Frontera',
    active BOOLEAN NOT NULL DEFAULT true,
    delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 2.90 CHECK (delivery_fee >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. TABLA: SCHEDULES
CREATE TABLE IF NOT EXISTS public.schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Domingo, 1=Lunes, ...
    opening_time TIME NOT NULL,
    closing_time TIME NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_day_schedule UNIQUE (day_of_week, opening_time, closing_time)
);

-- 9. TABLA: PROMOTIONS
CREATE TABLE IF NOT EXISTS public.promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    discount_type discount_type_enum NOT NULL DEFAULT 'fixed',
    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
    minimum_order NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (minimum_order >= 0),
    active BOOLEAN NOT NULL DEFAULT true,
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_promo_dates CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_promotions_code ON public.promotions(code);

-- 10. TABLA: COURIERS
CREATE TABLE IF NOT EXISTS public.couriers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    vehicle_type TEXT,
    active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_couriers_profile ON public.couriers(profile_id);

-- 11. TABLA: ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number TEXT NOT NULL UNIQUE, -- Ej: YA-1042
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    address_id UUID REFERENCES public.addresses(id) ON DELETE SET NULL,
    delivery_zone_id UUID REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
    courier_id UUID REFERENCES public.couriers(id) ON DELETE SET NULL,
    status order_status NOT NULL DEFAULT 'received',
    subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
    delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 2.90 CHECK (delivery_fee >= 0),
    total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
    payment_method payment_method_type NOT NULL DEFAULT 'card',
    payment_status payment_status_type NOT NULL DEFAULT 'pending',
    notes TEXT,
    -- Instantánea opcional de dirección al momento de compra para pedidos históricos
    delivery_address_snapshot JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);

-- 12. TABLA: ORDER_ITEMS (Snapshots de precio y nombre)
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);

-- ==============================================================================
-- 13. VISTA PÚBLICA DE PRODUCTOS (Protege campos internos de clientes)
-- ==============================================================================
CREATE OR REPLACE VIEW public.public_products AS
SELECT
    id,
    category_id,
    name,
    slug,
    description,
    image,
    price,
    active,
    stock_mode,
    (stock_mode = 'in_stock') AS in_stock,
    created_at,
    updated_at
FROM public.products
WHERE active = true;

-- ==============================================================================
-- 14. FUNCIONES AUXILIARES DE SEGURIDAD (SECURITY DEFINER)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_courier()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('courier', 'admin')
    );
$$;

-- Trigger automático para crear perfil al registrarse un usuario en auth.users
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 15. ROW LEVEL SECURITY (RLS)
-- ==============================================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

-- 15.1 POLÍTICAS: PROFILES
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 15.2 POLÍTICAS: CATEGORIES
DROP POLICY IF EXISTS "Public can view active categories" ON public.categories;
CREATE POLICY "Public can view active categories"
    ON public.categories FOR SELECT
    TO anon, authenticated
    USING (active = true OR public.is_admin());

DROP POLICY IF EXISTS "Only admin can modify categories" ON public.categories;
CREATE POLICY "Only admin can modify categories"
    ON public.categories FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 15.3 POLÍTICAS: PRODUCTS
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
CREATE POLICY "Public can view active products"
    ON public.products FOR SELECT
    TO anon, authenticated
    USING (active = true OR public.is_admin() OR public.is_courier());

DROP POLICY IF EXISTS "Only admin can modify products" ON public.products;
CREATE POLICY "Only admin can modify products"
    ON public.products FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 15.4 POLÍTICAS: ADDRESSES
DROP POLICY IF EXISTS "Users can view own addresses" ON public.addresses;
CREATE POLICY "Users can view own addresses"
    ON public.addresses FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can insert own addresses" ON public.addresses;
CREATE POLICY "Users can insert own addresses"
    ON public.addresses FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own addresses" ON public.addresses;
CREATE POLICY "Users can update own addresses"
    ON public.addresses FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own addresses" ON public.addresses;
CREATE POLICY "Users can delete own addresses"
    ON public.addresses FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- 15.5 POLÍTICAS: ORDERS
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING (
        auth.uid() = user_id
        OR public.is_admin()
        OR (public.is_courier() AND courier_id IN (SELECT id FROM public.couriers WHERE profile_id = auth.uid()))
    );

DROP POLICY IF EXISTS "Users can insert own orders" ON public.orders;
CREATE POLICY "Users can insert own orders"
    ON public.orders FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins and assigned couriers can update orders" ON public.orders;
CREATE POLICY "Admins and assigned couriers can update orders"
    ON public.orders FOR UPDATE
    TO authenticated
    USING (
        public.is_admin()
        OR (public.is_courier() AND courier_id IN (SELECT id FROM public.couriers WHERE profile_id = auth.uid()))
    );

-- 15.6 POLÍTICAS: ORDER_ITEMS
DROP POLICY IF EXISTS "Users can view own order items" ON public.order_items;
CREATE POLICY "Users can view own order items"
    ON public.order_items FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = public.order_items.order_id
            AND (
                o.user_id = auth.uid()
                OR public.is_admin()
                OR (public.is_courier() AND o.courier_id IN (SELECT id FROM public.couriers WHERE profile_id = auth.uid()))
            )
        )
    );

DROP POLICY IF EXISTS "Users can insert own order items" ON public.order_items;
CREATE POLICY "Users can insert own order items"
    ON public.order_items FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = public.order_items.order_id
            AND o.user_id = auth.uid()
        )
    );

-- 15.7 POLÍTICAS: COURIERS
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

-- 15.8 POLÍTICAS: DELIVERY_ZONES
DROP POLICY IF EXISTS "Public can view active delivery zones" ON public.delivery_zones;
CREATE POLICY "Public can view active delivery zones"
    ON public.delivery_zones FOR SELECT
    TO anon, authenticated
    USING (active = true OR public.is_admin());

DROP POLICY IF EXISTS "Only admin can manage delivery zones" ON public.delivery_zones;
CREATE POLICY "Only admin can manage delivery zones"
    ON public.delivery_zones FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 15.9 POLÍTICAS: SCHEDULES
DROP POLICY IF EXISTS "Public can view active schedules" ON public.schedules;
CREATE POLICY "Public can view active schedules"
    ON public.schedules FOR SELECT
    TO anon, authenticated
    USING (active = true OR public.is_admin());

DROP POLICY IF EXISTS "Only admin can manage schedules" ON public.schedules;
CREATE POLICY "Only admin can manage schedules"
    ON public.schedules FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 15.10 POLÍTICAS: PROMOTIONS
DROP POLICY IF EXISTS "Public can validate active promotions by code" ON public.promotions;
CREATE POLICY "Public can validate active promotions by code"
    ON public.promotions FOR SELECT
    TO anon, authenticated
    USING (
        active = true
        AND (starts_at IS NULL OR starts_at <= now())
        AND (expires_at IS NULL OR expires_at >= now())
    );

DROP POLICY IF EXISTS "Only admin can manage promotions" ON public.promotions;
CREATE POLICY "Only admin can manage promotions"
    ON public.promotions FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ==============================================================================
-- 16. DATOS INICIALES (SEED DATA)
-- ==============================================================================

-- 16.1 Categorías Iniciales
INSERT INTO public.categories (slug, name, icon, description, sort_order, active)
VALUES
    ('energeticas', 'Energéticas', '⚡', 'Un empujón para seguir.', 1, true),
    ('bebidas', 'Bebidas', '🥤', 'Frías, ahora mismo.', 2, true),
    ('snacks', 'Snacks', '🥔', 'Para picar sin pensar.', 3, true),
    ('dulces', 'Dulces', '🍫', 'El toque dulce.', 4, true),
    ('hielo', 'Hielo', '🧊', 'Que no se caliente la noche.', 5, true),
    ('comida', 'Comida', '🍕', 'Soluciones con hambre.', 6, true),
    ('mas', 'Más', '✦', 'Lo que te salva el momento.', 7, true)
ON CONFLICT (slug) DO UPDATE
SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    active = EXCLUDED.active;

-- 16.2 Zona de Entrega Inicial: Jerez de la Frontera (excluyendo Guadalcacín)
INSERT INTO public.delivery_zones (name, city, active, delivery_fee, notes)
SELECT
    'Jerez Centro y Casco Urbano',
    'Jerez de la Frontera',
    true,
    2.90,
    'Cobertura inicial en el casco urbano de Jerez de la Frontera. Excluye pedanías y Guadalcacín.'
WHERE NOT EXISTS (
    SELECT 1 FROM public.delivery_zones WHERE name = 'Jerez Centro y Casco Urbano'
);

-- 16.3 Horarios Iniciales (Enfoque nocturno y de fin de semana para Jerez)
-- 0=Domingo, 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado
INSERT INTO public.schedules (day_of_week, opening_time, closing_time, active)
VALUES
    (0, '19:00:00', '03:00:00', true), -- Domingo
    (1, '20:00:00', '02:00:00', true), -- Lunes
    (2, '20:00:00', '02:00:00', true), -- Martes
    (3, '20:00:00', '02:00:00', true), -- Miércoles
    (4, '20:00:00', '03:00:00', true), -- Jueves
    (5, '19:00:00', '05:00:00', true), -- Viernes
    (6, '19:00:00', '05:00:00', true)  -- Sábado
ON CONFLICT (day_of_week, opening_time, closing_time) DO NOTHING;
