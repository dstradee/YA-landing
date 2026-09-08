-- ==============================================================================
-- YA - MIGRACIÓN: FASE 3B — MOTOR COMERCIAL + PACKS
-- Archivo: 20260908000004_phase3b_commercial_engine_and_packs.sql
-- ==============================================================================
-- Contenido:
-- 1. Configuración comercial global (pedido mínimo, envío gratis, tarifa estándar)
-- 2. Sistema de Descuentos (por producto y por categoría, con prioridad determinista)
-- 3. Ampliación de Promociones (soporte para promociones automáticas por importe mínimo)
-- 4. Modelo relacional de Packs (Pack cerrado y Pack configurable)
-- 5. Adaptación histórica en orders y order_items (soporte de packs, snapshots y descuentos)
-- 6. Función RPC atómica create_order actualizada con validación total en servidor
-- 7. Políticas RLS seguras y semillas iniciales idempotentes
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLA: COMMERCIAL_SETTINGS (Configuración comercial centralizada)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commercial_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    min_order_enabled BOOLEAN NOT NULL DEFAULT true,
    min_order_amount NUMERIC(10, 2) NOT NULL DEFAULT 10.00 CHECK (min_order_amount >= 0),
    free_shipping_enabled BOOLEAN NOT NULL DEFAULT true,
    free_shipping_threshold NUMERIC(10, 2) NOT NULL DEFAULT 30.00 CHECK (free_shipping_threshold >= 0),
    standard_delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 2.90 CHECK (standard_delivery_fee >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Fila por defecto garantizada
INSERT INTO public.commercial_settings (
    id, min_order_enabled, min_order_amount, free_shipping_enabled, free_shipping_threshold, standard_delivery_fee
) VALUES (
    'default', true, 10.00, true, 30.00, 2.90
) ON CONFLICT (id) DO NOTHING;

-- RLS para commercial_settings
ALTER TABLE public.commercial_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Public can view commercial settings" ON public.commercial_settings;
    CREATE POLICY "Public can view commercial settings"
        ON public.commercial_settings FOR SELECT
        TO public
        USING (true);
EXCEPTION WHEN OTHERS THEN null;
END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Admins can update commercial settings" ON public.commercial_settings;
    CREATE POLICY "Admins can update commercial settings"
        ON public.commercial_settings FOR ALL
        TO authenticated
        USING (public.is_admin())
        WITH CHECK (public.is_admin());
EXCEPTION WHEN OTHERS THEN null;
END $$;

-- ------------------------------------------------------------------------------
-- 2. TABLA: DISCOUNTS (Descuentos por Producto y Categoría)
-- ------------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE discount_scope_type AS ENUM ('product', 'category');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.discounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    scope discount_scope_type NOT NULL, -- 'product' o 'category'
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
    discount_type discount_type_enum NOT NULL DEFAULT 'percentage', -- 'percentage' o 'fixed'
    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
    active BOOLEAN NOT NULL DEFAULT true,
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_discount_target CHECK (
        (scope = 'product' AND product_id IS NOT NULL AND category_id IS NULL) OR
        (scope = 'category' AND category_id IS NOT NULL AND product_id IS NULL)
    ),
    CONSTRAINT chk_discount_dates CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_discounts_scope ON public.discounts(scope);
CREATE INDEX IF NOT EXISTS idx_discounts_product ON public.discounts(product_id);
CREATE INDEX IF NOT EXISTS idx_discounts_category ON public.discounts(category_id);
CREATE INDEX IF NOT EXISTS idx_discounts_active ON public.discounts(active);

-- RLS para discounts
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Public can view active discounts" ON public.discounts;
    CREATE POLICY "Public can view active discounts"
        ON public.discounts FOR SELECT
        TO public
        USING (active = true);
EXCEPTION WHEN OTHERS THEN null;
END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Admins can manage all discounts" ON public.discounts;
    CREATE POLICY "Admins can manage all discounts"
        ON public.discounts FOR ALL
        TO authenticated
        USING (public.is_admin())
        WITH CHECK (public.is_admin());
EXCEPTION WHEN OTHERS THEN null;
END $$;

-- ------------------------------------------------------------------------------
-- 3. AMPLIACIÓN DE LA TABLA PROMOTIONS
-- ------------------------------------------------------------------------------
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS is_automatic BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

-- Sincronizar name con code para registros que carezcan de él
UPDATE public.promotions SET name = code WHERE name IS NULL OR name = '';

-- RLS para promotions
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Public can view active promotions" ON public.promotions;
    CREATE POLICY "Public can view active promotions"
        ON public.promotions FOR SELECT
        TO public
        USING (active = true);
EXCEPTION WHEN OTHERS THEN null;
END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Admins can manage all promotions" ON public.promotions;
    CREATE POLICY "Admins can manage all promotions"
        ON public.promotions FOR ALL
        TO authenticated
        USING (public.is_admin())
        WITH CHECK (public.is_admin());
EXCEPTION WHEN OTHERS THEN null;
END $$;

-- ------------------------------------------------------------------------------
-- 4. TABLAS PARA PACKS (CERRADOS Y CONFIGURABLES)
-- ------------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE pack_type_enum AS ENUM ('fixed', 'configurable');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tabla principal de packs
CREATE TABLE IF NOT EXISTS public.packs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    image TEXT,
    pack_type pack_type_enum NOT NULL DEFAULT 'fixed',
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    reference_price NUMERIC(10, 2) CHECK (reference_price >= 0),
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_packs_slug ON public.packs(slug);
CREATE INDEX IF NOT EXISTS idx_packs_active ON public.packs(active);
CREATE INDEX IF NOT EXISTS idx_packs_sort_order ON public.packs(sort_order);

-- Contenido de pack cerrado (TIPO A)
CREATE TABLE IF NOT EXISTS public.pack_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pack_id UUID NOT NULL REFERENCES public.packs(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_pack_item_product UNIQUE (pack_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_pack_items_pack ON public.pack_items(pack_id);
CREATE INDEX IF NOT EXISTS idx_pack_items_product ON public.pack_items(product_id);

-- Grupos de selección de pack configurable (TIPO B)
CREATE TABLE IF NOT EXISTS public.pack_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pack_id UUID NOT NULL REFERENCES public.packs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    min_select INT NOT NULL DEFAULT 1 CHECK (min_select >= 0),
    max_select INT NOT NULL DEFAULT 1 CHECK (max_select >= min_select),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_pack_groups_pack ON public.pack_groups(pack_id);

-- Opciones dentro de cada grupo de selección
CREATE TABLE IF NOT EXISTS public.pack_group_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES public.pack_groups(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    default_selected BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_pack_group_option_product UNIQUE (group_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_pack_group_options_group ON public.pack_group_options(group_id);
CREATE INDEX IF NOT EXISTS idx_pack_group_options_product ON public.pack_group_options(product_id);

-- RLS para Packs y componentes
ALTER TABLE public.packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_group_options ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Public can view active packs" ON public.packs;
    CREATE POLICY "Public can view active packs" ON public.packs
        FOR SELECT TO public USING (active = true);

    DROP POLICY IF EXISTS "Admins can manage packs" ON public.packs;
    CREATE POLICY "Admins can manage packs" ON public.packs
        FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

    DROP POLICY IF EXISTS "Public can view pack items" ON public.pack_items;
    CREATE POLICY "Public can view pack items" ON public.pack_items
        FOR SELECT TO public USING (true);

    DROP POLICY IF EXISTS "Admins can manage pack items" ON public.pack_items;
    CREATE POLICY "Admins can manage pack items" ON public.pack_items
        FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

    DROP POLICY IF EXISTS "Public can view pack groups" ON public.pack_groups;
    CREATE POLICY "Public can view pack groups" ON public.pack_groups
        FOR SELECT TO public USING (true);

    DROP POLICY IF EXISTS "Admins can manage pack groups" ON public.pack_groups;
    CREATE POLICY "Admins can manage pack groups" ON public.pack_groups
        FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

    DROP POLICY IF EXISTS "Public can view pack group options" ON public.pack_group_options;
    CREATE POLICY "Public can view pack group options" ON public.pack_group_options
        FOR SELECT TO public USING (true);

    DROP POLICY IF EXISTS "Admins can manage pack group options" ON public.pack_group_options;
    CREATE POLICY "Admins can manage pack group options" ON public.pack_group_options
        FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN OTHERS THEN null;
END $$;

-- ------------------------------------------------------------------------------
-- 5. EXTENSIÓN HISTÓRICA EN ORDERS Y ORDER_ITEMS
-- ------------------------------------------------------------------------------
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS is_pack BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS pack_id UUID REFERENCES public.packs(id) ON DELETE SET NULL;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS pack_snapshot JSONB;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS discount_applied NUMERIC(10, 2) DEFAULT 0.00;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_total NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promotion_id UUID REFERENCES public.promotions(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promotion_code TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promotion_discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

-- ------------------------------------------------------------------------------
-- 6. RPC: CREATE_ORDER ACTUALIZADA CON MOTOR COMERCIAL COMPLETO Y PACKS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order(
    p_address_id UUID,
    p_items JSONB,
    p_notes TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'card'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_address_snapshot JSONB;
    v_zone_id UUID;
    v_delivery_fee NUMERIC(10, 2) := 2.90;
    v_subtotal NUMERIC(10, 2) := 0;
    v_total NUMERIC(10, 2) := 0;
    v_order_number TEXT;
    v_order_id UUID;
    v_valid_payment_method public.payment_method_type;

    -- Configuración comercial
    v_min_order_enabled BOOLEAN := true;
    v_min_order_amount NUMERIC(10, 2) := 10.00;
    v_free_shipping_enabled BOOLEAN := true;
    v_free_shipping_threshold NUMERIC(10, 2) := 30.00;
    v_standard_delivery_fee NUMERIC(10, 2) := 2.90;

    -- Variables para iterar items
    v_item JSONB;
    v_is_pack BOOLEAN := false;
    v_item_ref TEXT;
    v_item_qty INT;
    v_line_unit_price NUMERIC(10, 2);
    v_line_subtotal NUMERIC(10, 2);
    v_line_discount NUMERIC(10, 2) := 0;
    v_total_discounts NUMERIC(10, 2) := 0;

    -- Variables de producto
    v_prod_id UUID;
    v_prod_name TEXT;
    v_prod_price NUMERIC(10, 2);
    v_prod_active BOOLEAN;
    v_prod_stock_mode public.stock_mode_type;
    v_prod_stock_qty INT;
    v_prod_cat_id UUID;

    -- Variables de pack
    v_pack_id UUID;
    v_pack_name TEXT;
    v_pack_price NUMERIC(10, 2);
    v_pack_type public.pack_type_enum;
    v_pack_active BOOLEAN;
    v_pack_snapshot JSONB;
    v_pack_sub_item RECORD;
    v_pack_group RECORD;
    v_selection JSONB;
    v_chosen_option_count INT;
    v_chosen_opt_prod_id UUID;
    v_chosen_opt_prod RECORD;
    v_chosen_pack_items JSONB;

    -- Descuentos aplicables
    v_spec_disc RECORD;
    v_cat_disc RECORD;

    -- Promoción automática
    v_promo RECORD;
    v_best_promo_id UUID := NULL;
    v_best_promo_code TEXT := NULL;
    v_best_promo_discount NUMERIC(10, 2) := 0.00;
    v_calculated_promo_val NUMERIC(10, 2) := 0.00;

    -- Buffer de items validados a insertar
    v_order_items_to_insert JSONB := '[]'::JSONB;
BEGIN
    -- 1. Validar autenticación
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión para crear un pedido.';
    END IF;

    -- 2. Validar que la dirección existe y pertenece al usuario autenticado
    SELECT
        jsonb_build_object(
            'name', a.name,
            'phone', a.phone,
            'street', a.street,
            'number', a.number,
            'floor', a.floor_door,
            'postalCode', a.postal_code,
            'city', a.city,
            'notes', a.notes
        )
    INTO v_address_snapshot
    FROM public.addresses a
    WHERE a.id = p_address_id
      AND a.user_id = v_user_id;

    IF v_address_snapshot IS NULL THEN
        RAISE EXCEPTION 'La dirección seleccionada no es válida o no pertenece a tu cuenta.';
    END IF;

    -- 3. Cargar configuración comercial
    SELECT
        min_order_enabled,
        min_order_amount,
        free_shipping_enabled,
        free_shipping_threshold,
        standard_delivery_fee
    INTO
        v_min_order_enabled,
        v_min_order_amount,
        v_free_shipping_enabled,
        v_free_shipping_threshold,
        v_standard_delivery_fee
    FROM public.commercial_settings
    WHERE id = 'default';

    IF v_standard_delivery_fee IS NOT NULL THEN
        v_delivery_fee := v_standard_delivery_fee;
    ELSE
        -- Fallback a delivery_zones
        SELECT id, delivery_fee INTO v_zone_id, v_delivery_fee
        FROM public.delivery_zones
        WHERE active = true
        ORDER BY created_at ASC
        LIMIT 1;

        IF v_delivery_fee IS NULL THEN
            v_delivery_fee := 2.90;
        END IF;
    END IF;

    -- 4. Validar método de pago admitido
    BEGIN
        v_valid_payment_method := p_payment_method::public.payment_method_type;
    EXCEPTION WHEN OTHERS THEN
        v_valid_payment_method := 'card'::public.payment_method_type;
    END;

    -- 5. Validar que la lista de items no esté vacía
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito está vacío. Añade productos o packs antes de pedir.';
    END IF;

    -- 6. Iterar y validar cada item de forma segura (sin confiar en precios de cliente)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_is_pack := COALESCE((v_item->>'is_pack')::BOOLEAN, false) OR (v_item->>'pack_id' IS NOT NULL);
        v_item_qty := COALESCE((v_item->>'quantity')::INT, 0);

        IF v_item_qty <= 0 THEN
            RAISE EXCEPTION 'La cantidad de cada elemento debe ser mayor a 0.';
        END IF;

        IF v_is_pack THEN
            -- ==========================================================
            -- ITEM ES UN PACK (TIPO A CERRADO O TIPO B CONFIGURABLE)
            -- ==========================================================
            v_item_ref := COALESCE(v_item->>'pack_id', v_item->>'product_id');
            IF v_item_ref IS NULL OR v_item_ref = '' THEN
                RAISE EXCEPTION 'Identificador de pack no válido en el carrito.';
            END IF;

            -- Buscar pack por UUID o slug
            v_pack_id := NULL;
            IF v_item_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                SELECT id, name, price, pack_type, active
                INTO v_pack_id, v_pack_name, v_pack_price, v_pack_type, v_pack_active
                FROM public.packs
                WHERE id = v_item_ref::UUID;
            END IF;

            IF v_pack_id IS NULL THEN
                SELECT id, name, price, pack_type, active
                INTO v_pack_id, v_pack_name, v_pack_price, v_pack_type, v_pack_active
                FROM public.packs
                WHERE slug = v_item_ref;
            END IF;

            IF v_pack_id IS NULL THEN
                RAISE EXCEPTION 'El pack solicitado ("%") no existe en el catálogo.', v_item_ref;
            END IF;

            IF v_pack_active IS NOT TRUE THEN
                RAISE EXCEPTION 'El pack "%" no está disponible temporalmente.', v_pack_name;
            END IF;

            v_chosen_pack_items := '[]'::JSONB;

            IF v_pack_type = 'fixed' THEN
                -- Validar composición de Pack Cerrado y stock real de cada producto componente
                FOR v_pack_sub_item IN
                    SELECT pi.quantity, p.id, p.name, p.active, p.stock_mode, p.stock_quantity
                    FROM public.pack_items pi
                    JOIN public.products p ON p.id = pi.product_id
                    WHERE pi.pack_id = v_pack_id
                LOOP
                    IF v_pack_sub_item.active IS NOT TRUE THEN
                        RAISE EXCEPTION 'El pack "%" no está disponible porque el producto "%" está inactivo.', v_pack_name, v_pack_sub_item.name;
                    END IF;

                    IF v_pack_sub_item.stock_mode = 'out_of_stock' THEN
                        RAISE EXCEPTION 'El pack "%" no está disponible porque el producto "%" está agotado.', v_pack_name, v_pack_sub_item.name;
                    END IF;

                    IF v_pack_sub_item.stock_mode = 'in_stock' AND v_pack_sub_item.stock_quantity < (v_pack_sub_item.quantity * v_item_qty) THEN
                        RAISE EXCEPTION 'El producto "%" del pack "%" no tiene stock suficiente.', v_pack_sub_item.name, v_pack_name;
                    END IF;

                    v_chosen_pack_items := v_chosen_pack_items || jsonb_build_object(
                        'product_id', v_pack_sub_item.id,
                        'product_name', v_pack_sub_item.name,
                        'quantity', v_pack_sub_item.quantity
                    );
                END LOOP;
            ELSE
                -- Validar Pack Configurable: grupos, cantidades mín/máx y opciones elegidas
                FOR v_pack_group IN
                    SELECT id, name, min_select, max_select
                    FROM public.pack_groups
                    WHERE pack_id = v_pack_id
                    ORDER BY sort_order ASC
                LOOP
                    -- Contar cuántas opciones envió el cliente para este grupo
                    v_chosen_option_count := 0;
                    FOR v_selection IN
                        SELECT * FROM jsonb_array_elements(COALESCE(v_item->'selections', '[]'::JSONB))
                    LOOP
                        IF (v_selection->>'groupId' = v_pack_group.id::TEXT) OR (v_selection->>'group_id' = v_pack_group.id::TEXT) THEN
                            v_chosen_option_count := v_chosen_option_count + 1;
                            v_chosen_opt_prod_id := (COALESCE(v_selection->>'productId', v_selection->>'product_id'))::UUID;

                            -- Verificar que el producto pertenece a este grupo
                            IF NOT EXISTS (
                                SELECT 1 FROM public.pack_group_options pgo
                                WHERE pgo.group_id = v_pack_group.id AND pgo.product_id = v_chosen_opt_prod_id
                            ) THEN
                                RAISE EXCEPTION 'Opción no válida para el grupo "%" en el pack "%".', v_pack_group.name, v_pack_name;
                            END IF;

                            -- Verificar stock del producto de la opción
                            SELECT id, name, active, stock_mode, stock_quantity
                            INTO v_chosen_opt_prod
                            FROM public.products
                            WHERE id = v_chosen_opt_prod_id;

                            IF v_chosen_opt_prod.active IS NOT TRUE OR v_chosen_opt_prod.stock_mode = 'out_of_stock' THEN
                                RAISE EXCEPTION 'La opción "%" seleccionada para el pack "%" está agotada.', v_chosen_opt_prod.name, v_pack_name;
                            END IF;

                            v_chosen_pack_items := v_chosen_pack_items || jsonb_build_object(
                                'group_id', v_pack_group.id,
                                'group_name', v_pack_group.name,
                                'product_id', v_chosen_opt_prod.id,
                                'product_name', v_chosen_opt_prod.name
                            );
                        END IF;
                    END LOOP;

                    IF v_chosen_option_count < v_pack_group.min_select THEN
                        RAISE EXCEPTION 'Debes seleccionar al menos % opción/es en "%" para el pack "%".', v_pack_group.min_select, v_pack_group.name, v_pack_name;
                    END IF;

                    IF v_chosen_option_count > v_pack_group.max_select THEN
                        RAISE EXCEPTION 'No puedes seleccionar más de % opción/es en "%" para el pack "%".', v_pack_group.max_select, v_pack_group.name, v_pack_name;
                    END IF;
                END LOOP;
            END IF;

            v_line_unit_price := v_pack_price;
            v_line_subtotal := round(v_pack_price * v_item_qty, 2);
            v_subtotal := v_subtotal + v_line_subtotal;

            v_pack_snapshot := jsonb_build_object(
                'pack_id', v_pack_id,
                'pack_name', v_pack_name,
                'pack_type', v_pack_type,
                'unit_price', v_pack_price,
                'items', v_chosen_pack_items
            );

            v_order_items_to_insert := v_order_items_to_insert || jsonb_build_object(
                'is_pack', true,
                'pack_id', v_pack_id,
                'product_id', NULL,
                'product_name', '[PACK] ' || v_pack_name,
                'unit_price', v_pack_price,
                'quantity', v_item_qty,
                'subtotal', v_line_subtotal,
                'discount_applied', 0.00,
                'pack_snapshot', v_pack_snapshot
            );
        ELSE
            -- ==========================================================
            -- ITEM ES UN PRODUCTO INDIVIDUAL
            -- ==========================================================
            v_item_ref := v_item->>'product_id';
            IF v_item_ref IS NULL OR v_item_ref = '' THEN
                RAISE EXCEPTION 'Identificador de producto no válido en el carrito.';
            END IF;

            v_prod_id := NULL;
            IF v_item_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                SELECT id, name, price, active, stock_mode, stock_quantity, category_id
                INTO v_prod_id, v_prod_name, v_prod_price, v_prod_active, v_prod_stock_mode, v_prod_stock_qty, v_prod_cat_id
                FROM public.products
                WHERE id = v_item_ref::UUID;
            END IF;

            IF v_prod_id IS NULL THEN
                SELECT id, name, price, active, stock_mode, stock_quantity, category_id
                INTO v_prod_id, v_prod_name, v_prod_price, v_prod_active, v_prod_stock_mode, v_prod_stock_qty, v_prod_cat_id
                FROM public.products
                WHERE slug = v_item_ref;
            END IF;

            IF v_prod_id IS NULL THEN
                RAISE EXCEPTION 'El producto solicitado ("%") ya no existe en el catálogo.', v_item_ref;
            END IF;

            IF v_prod_active IS NOT TRUE THEN
                RAISE EXCEPTION 'El producto "%" no está disponible temporalmente.', v_prod_name;
            END IF;

            IF v_prod_stock_mode = 'out_of_stock' THEN
                RAISE EXCEPTION 'El producto "%" está agotado.', v_prod_name;
            END IF;

            IF v_prod_stock_mode = 'in_stock' AND v_prod_stock_qty < v_item_qty THEN
                RAISE EXCEPTION 'No hay stock suficiente para "%" (disponibles: %).', v_prod_name, v_prod_stock_qty;
            END IF;

            -- EVALUACIÓN DETERMINISTA DE DESCUENTOS:
            -- Prioridad 1: Descuento específico de producto
            v_line_unit_price := v_prod_price;
            v_line_discount := 0.00;

            SELECT * INTO v_spec_disc
            FROM public.discounts
            WHERE scope = 'product'
              AND product_id = v_prod_id
              AND active = true
              AND (starts_at IS NULL OR starts_at <= now())
              AND (expires_at IS NULL OR expires_at >= now())
            ORDER BY created_at DESC
            LIMIT 1;

            IF v_spec_disc.id IS NOT NULL THEN
                IF v_spec_disc.discount_type = 'percentage' THEN
                    v_line_discount := round(v_prod_price * (v_spec_disc.discount_value / 100.0), 2);
                ELSE
                    v_line_discount := LEAST(v_prod_price, v_spec_disc.discount_value);
                END IF;
            ELSE
                -- Prioridad 2: Descuento de categoría si no hay específico de producto
                SELECT * INTO v_cat_disc
                FROM public.discounts
                WHERE scope = 'category'
                  AND category_id = v_prod_cat_id
                  AND active = true
                  AND (starts_at IS NULL OR starts_at <= now())
                  AND (expires_at IS NULL OR expires_at >= now())
                ORDER BY created_at DESC
                LIMIT 1;

                IF v_cat_disc.id IS NOT NULL THEN
                    IF v_cat_disc.discount_type = 'percentage' THEN
                        v_line_discount := round(v_prod_price * (v_cat_disc.discount_value / 100.0), 2);
                    ELSE
                        v_line_discount := LEAST(v_prod_price, v_cat_disc.discount_value);
                    END IF;
                END IF;
            END IF;

            v_line_unit_price := GREATEST(0.00, v_prod_price - v_line_discount);
            v_line_subtotal := round(v_line_unit_price * v_item_qty, 2);
            v_subtotal := v_subtotal + v_line_subtotal;
            v_total_discounts := v_total_discounts + round(v_line_discount * v_item_qty, 2);

            v_order_items_to_insert := v_order_items_to_insert || jsonb_build_object(
                'is_pack', false,
                'pack_id', NULL,
                'product_id', v_prod_id,
                'product_name', v_prod_name,
                'unit_price', v_line_unit_price,
                'quantity', v_item_qty,
                'subtotal', v_line_subtotal,
                'discount_applied', v_line_discount,
                'pack_snapshot', NULL
            );
        END IF;
    END LOOP;

    -- 7. Comprobar Pedido Mínimo si está activo
    IF v_min_order_enabled AND v_subtotal < v_min_order_amount THEN
        RAISE EXCEPTION 'El pedido mínimo es de % €.', to_char(v_min_order_amount, 'FM999990.00');
    END IF;

    -- 8. Aplicar Promoción Automática por importe mínimo
    FOR v_promo IN
        SELECT id, code, discount_type, discount_value, minimum_order
        FROM public.promotions
        WHERE active = true
          AND is_automatic = true
          AND (starts_at IS NULL OR starts_at <= now())
          AND (expires_at IS NULL OR expires_at >= now())
          AND minimum_order <= v_subtotal
        ORDER BY minimum_order DESC, created_at DESC
    LOOP
        IF v_promo.discount_type = 'percentage' THEN
            v_calculated_promo_val := round(v_subtotal * (v_promo.discount_value / 100.0), 2);
        ELSE
            v_calculated_promo_val := LEAST(v_subtotal, v_promo.discount_value);
        END IF;

        IF v_calculated_promo_val > v_best_promo_discount THEN
            v_best_promo_discount := v_calculated_promo_val;
            v_best_promo_id := v_promo.id;
            v_best_promo_code := v_promo.code;
        END IF;
    END LOOP;

    -- 9. Comprobar Regla de Envío Gratis
    IF v_free_shipping_enabled AND v_subtotal >= v_free_shipping_threshold THEN
        v_delivery_fee := 0.00;
    END IF;

    -- 10. Calcular total seguro
    v_total := round(GREATEST(0.00, v_subtotal - v_best_promo_discount) + v_delivery_fee, 2);

    -- 11. Generar número de pedido secuencial único
    v_order_number := 'YA-' || nextval('public.order_number_seq')::TEXT;

    -- 12. Insertar pedido en orders de forma atómica
    INSERT INTO public.orders (
        order_number,
        user_id,
        address_id,
        delivery_zone_id,
        status,
        subtotal,
        delivery_fee,
        total,
        discount_total,
        promotion_id,
        promotion_code,
        promotion_discount,
        payment_method,
        payment_status,
        notes,
        delivery_address_snapshot
    ) VALUES (
        v_order_number,
        v_user_id,
        p_address_id,
        v_zone_id,
        'received',
        v_subtotal,
        v_delivery_fee,
        v_total,
        v_total_discounts,
        v_best_promo_id,
        v_best_promo_code,
        v_best_promo_discount,
        v_valid_payment_method,
        'pending',
        NULLIF(trim(p_notes), ''),
        v_address_snapshot
    )
    RETURNING id INTO v_order_id;

    -- 13. Insertar líneas en order_items
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_order_items_to_insert)
    LOOP
        INSERT INTO public.order_items (
            order_id,
            product_id,
            product_name,
            unit_price,
            quantity,
            subtotal,
            is_pack,
            pack_id,
            discount_applied,
            pack_snapshot
        ) VALUES (
            v_order_id,
            CASE WHEN (v_item->>'product_id') IS NOT NULL THEN (v_item->>'product_id')::UUID ELSE NULL END,
            v_item->>'product_name',
            (v_item->>'unit_price')::NUMERIC,
            (v_item->>'quantity')::INT,
            (v_item->>'subtotal')::NUMERIC,
            COALESCE((v_item->>'is_pack')::BOOLEAN, false),
            CASE WHEN (v_item->>'pack_id') IS NOT NULL THEN (v_item->>'pack_id')::UUID ELSE NULL END,
            COALESCE((v_item->>'discount_applied')::NUMERIC, 0.00),
            v_item->'pack_snapshot'
        );
    END LOOP;

    -- 14. Devolver resultado detallado
    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'total', v_total,
        'discount_total', v_total_discounts,
        'promotion_discount', v_best_promo_discount,
        'promotion_code', v_best_promo_code
    );
END;
$$;

-- Permisos RPC
REVOKE ALL ON FUNCTION public.create_order(UUID, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, JSONB, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. RPC: ADMIN ACTUALIZAR CONFIGURACIÓN COMERCIAL
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_commercial_settings(
    p_min_order_enabled BOOLEAN,
    p_min_order_amount NUMERIC(10, 2),
    p_free_shipping_enabled BOOLEAN,
    p_free_shipping_threshold NUMERIC(10, 2),
    p_standard_delivery_fee NUMERIC(10, 2)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_updated RECORD;
BEGIN
    SELECT public.is_admin() INTO v_is_admin;
    IF NOT COALESCE(v_is_admin, false) THEN
        RAISE EXCEPTION 'Acceso denegado: solo administradores pueden actualizar la configuración comercial.';
    END IF;

    UPDATE public.commercial_settings
    SET
        min_order_enabled = p_min_order_enabled,
        min_order_amount = p_min_order_amount,
        free_shipping_enabled = p_free_shipping_enabled,
        free_shipping_threshold = p_free_shipping_threshold,
        standard_delivery_fee = p_standard_delivery_fee,
        updated_at = timezone('utc'::text, now())
    WHERE id = 'default'
    RETURNING * INTO v_updated;

    RETURN jsonb_build_object(
        'success', true,
        'settings', row_to_json(v_updated)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_commercial_settings(BOOLEAN, NUMERIC, BOOLEAN, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_commercial_settings(BOOLEAN, NUMERIC, BOOLEAN, NUMERIC, NUMERIC) TO authenticated;

-- ------------------------------------------------------------------------------
-- 8. SEMILLAS INICIALES (IDEMPOTENTES) PARA PRUEBAS Y DEMOSTRACIÓN
-- ------------------------------------------------------------------------------
-- A. Semilla de Pack Cerrado: "PACK NOCHE" (2x Red Bull, 1x Doritos, 1x Coca-Cola 2L, 1x Hielo)
DO $$
DECLARE
    v_pack_noche_id UUID;
    v_prod_redbull UUID;
    v_prod_doritos UUID;
    v_prod_coca UUID;
    v_prod_hielo UUID;
BEGIN
    INSERT INTO public.packs (name, slug, description, image, pack_type, price, reference_price, active, sort_order)
    VALUES (
        'PACK NOCHE',
        'pack-noche',
        'El combo definitivo para aguantar toda la noche en Jerez: 2 Red Bull, 1 Doritos Tex-Mex, 1 Coca-Cola 2L y 1 Bolsa de hielo 2kg.',
        '🌙',
        'fixed',
        14.90,
        17.65,
        true,
        1
    )
    ON CONFLICT (slug) DO UPDATE
    SET price = EXCLUDED.price, reference_price = EXCLUDED.reference_price
    RETURNING id INTO v_pack_noche_id;

    SELECT id INTO v_prod_redbull FROM public.products WHERE slug = 'red-bull' LIMIT 1;
    SELECT id INTO v_prod_doritos FROM public.products WHERE slug = 'doritos-tex-mex' LIMIT 1;
    SELECT id INTO v_prod_coca FROM public.products WHERE slug = 'coca-cola' LIMIT 1;
    SELECT id INTO v_prod_hielo FROM public.products WHERE slug = 'bolsa-hielo' LIMIT 1;

    IF v_pack_noche_id IS NOT NULL AND v_prod_redbull IS NOT NULL THEN
        INSERT INTO public.pack_items (pack_id, product_id, quantity, sort_order)
        VALUES (v_pack_noche_id, v_prod_redbull, 2, 1)
        ON CONFLICT (pack_id, product_id) DO NOTHING;
    END IF;

    IF v_pack_noche_id IS NOT NULL AND v_prod_doritos IS NOT NULL THEN
        INSERT INTO public.pack_items (pack_id, product_id, quantity, sort_order)
        VALUES (v_pack_noche_id, v_prod_doritos, 1, 2)
        ON CONFLICT (pack_id, product_id) DO NOTHING;
    END IF;

    IF v_pack_noche_id IS NOT NULL AND v_prod_coca IS NOT NULL THEN
        INSERT INTO public.pack_items (pack_id, product_id, quantity, sort_order)
        VALUES (v_pack_noche_id, v_prod_coca, 1, 3)
        ON CONFLICT (pack_id, product_id) DO NOTHING;
    END IF;

    IF v_pack_noche_id IS NOT NULL AND v_prod_hielo IS NOT NULL THEN
        INSERT INTO public.pack_items (pack_id, product_id, quantity, sort_order)
        VALUES (v_pack_noche_id, v_prod_hielo, 1, 4)
        ON CONFLICT (pack_id, product_id) DO NOTHING;
    END IF;
END $$;

-- B. Semilla de Pack Configurable: "PACK PERSONALIZABLE YA"
DO $$
DECLARE
    v_pack_custom_id UUID;
    v_group_drink UUID;
    v_group_snack UUID;
    v_group_sweet UUID;
    v_p_redbull UUID;
    v_p_monster UUID;
    v_p_doritos UUID;
    v_p_lays UUID;
    v_p_pringles UUID;
    v_p_kitkat UUID;
    v_p_oreo UUID;
BEGIN
    INSERT INTO public.packs (name, slug, description, image, pack_type, price, reference_price, active, sort_order)
    VALUES (
        'PACK MIX YA',
        'pack-mix-ya',
        'Configura tu combinación favorita: elige 1 energética, 1 snack salado y 1 dulce.',
        '⚡',
        'configurable',
        13.50,
        15.80,
        true,
        2
    )
    ON CONFLICT (slug) DO UPDATE
    SET price = EXCLUDED.price, reference_price = EXCLUDED.reference_price
    RETURNING id INTO v_pack_custom_id;

    IF v_pack_custom_id IS NOT NULL THEN
        -- Grupo 1: Energética
        INSERT INTO public.pack_groups (pack_id, name, description, min_select, max_select, sort_order)
        VALUES (v_pack_custom_id, 'Elige tu energética', 'Selecciona 1 bebida energética', 1, 1, 1)
        RETURNING id INTO v_group_drink;

        -- Grupo 2: Snack
        INSERT INTO public.pack_groups (pack_id, name, description, min_select, max_select, sort_order)
        VALUES (v_pack_custom_id, 'Elige tu snack', 'Selecciona 1 snack salado', 1, 1, 2)
        RETURNING id INTO v_group_snack;

        -- Grupo 3: Dulce
        INSERT INTO public.pack_groups (pack_id, name, description, min_select, max_select, sort_order)
        VALUES (v_pack_custom_id, 'Elige tu dulce', 'Selecciona 1 dulce o chocolate', 1, 1, 3)
        RETURNING id INTO v_group_sweet;

        -- Opciones Grupo 1
        SELECT id INTO v_p_redbull FROM public.products WHERE slug = 'red-bull' LIMIT 1;
        SELECT id INTO v_p_monster FROM public.products WHERE slug = 'monster-energy' LIMIT 1;
        IF v_group_drink IS NOT NULL AND v_p_redbull IS NOT NULL THEN
            INSERT INTO public.pack_group_options (group_id, product_id, default_selected, sort_order)
            VALUES (v_group_drink, v_p_redbull, true, 1) ON CONFLICT DO NOTHING;
        END IF;
        IF v_group_drink IS NOT NULL AND v_p_monster IS NOT NULL THEN
            INSERT INTO public.pack_group_options (group_id, product_id, default_selected, sort_order)
            VALUES (v_group_drink, v_p_monster, false, 2) ON CONFLICT DO NOTHING;
        END IF;

        -- Opciones Grupo 2
        SELECT id INTO v_p_doritos FROM public.products WHERE slug = 'doritos-tex-mex' LIMIT 1;
        SELECT id INTO v_p_lays FROM public.products WHERE slug = 'lays-campesinas' LIMIT 1;
        SELECT id INTO v_p_pringles FROM public.products WHERE slug = 'pringles-original' LIMIT 1;
        IF v_group_snack IS NOT NULL AND v_p_doritos IS NOT NULL THEN
            INSERT INTO public.pack_group_options (group_id, product_id, default_selected, sort_order)
            VALUES (v_group_snack, v_p_doritos, true, 1) ON CONFLICT DO NOTHING;
        END IF;
        IF v_group_snack IS NOT NULL AND v_p_lays IS NOT NULL THEN
            INSERT INTO public.pack_group_options (group_id, product_id, default_selected, sort_order)
            VALUES (v_group_snack, v_p_lays, false, 2) ON CONFLICT DO NOTHING;
        END IF;
        IF v_group_snack IS NOT NULL AND v_p_pringles IS NOT NULL THEN
            INSERT INTO public.pack_group_options (group_id, product_id, default_selected, sort_order)
            VALUES (v_group_snack, v_p_pringles, false, 3) ON CONFLICT DO NOTHING;
        END IF;

        -- Opciones Grupo 3
        SELECT id INTO v_p_kitkat FROM public.products WHERE slug = 'kitkat' LIMIT 1;
        SELECT id INTO v_p_oreo FROM public.products WHERE slug = 'oreo' LIMIT 1;
        IF v_group_sweet IS NOT NULL AND v_p_kitkat IS NOT NULL THEN
            INSERT INTO public.pack_group_options (group_id, product_id, default_selected, sort_order)
            VALUES (v_group_sweet, v_p_kitkat, true, 1) ON CONFLICT DO NOTHING;
        END IF;
        IF v_group_sweet IS NOT NULL AND v_p_oreo IS NOT NULL THEN
            INSERT INTO public.pack_group_options (group_id, product_id, default_selected, sort_order)
            VALUES (v_group_sweet, v_p_oreo, false, 2) ON CONFLICT DO NOTHING;
        END IF;
    END IF;
END $$;

-- C. Semilla de Promoción: 10% dto en pedidos >= 30 €
INSERT INTO public.promotions (
    name, code, description, discount_type, discount_value, minimum_order, active, is_automatic, sort_order
) VALUES (
    '10% Descuento Automático',
    'PROMO10',
    '10% de descuento directo en compras a partir de 30 €',
    'percentage',
    10.00,
    30.00,
    true,
    true,
    1
) ON CONFLICT (code) DO NOTHING;
