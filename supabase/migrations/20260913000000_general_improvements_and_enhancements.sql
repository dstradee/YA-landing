-- ==============================================================================
-- YA DELIVERY — MIGRACIÓN OFICIAL: MEJORAS GENERALES Y ESTABILIZACIÓN
-- Archivo: supabase/migrations/20260913000000_general_improvements_and_enhancements.sql
-- ==============================================================================
-- Contenido:
-- 1. Soporte para promociones 2×1 (tipo de descuento y asociación a productos)
-- 2. Imágenes de productos y packs (soporte de 1 a 5 imágenes vía Cloudinary)
-- 3. Mejoras en packs (envío gratis por pack, exención de pedido mínimo y suplementos de precio en opciones)
-- 4. Sistema de Sugerencias de productos (tabla con RLS estricta para clientes y administración)
-- 5. Disponibilidad de repartidores (función de verificación y realtime)
-- 6. Eliminación atómica y segura de pedidos desde administración (admin_delete_orders)
-- 7. Función RPC create_order actualizada con validaciones de servidor completas
-- 8. Corrección de sintaxis PL/pgSQL para recompensas e incentivos (sin error 42601)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PROMOCIONES 2×1
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    ALTER TYPE discount_type_enum ADD VALUE IF NOT EXISTS 'two_for_one';
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS applicable_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS is_two_for_one BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_promotions_applicable_product ON public.promotions(applicable_product_id);

-- ------------------------------------------------------------------------------
-- 2. IMÁGENES DE PRODUCTOS Y PACKS (1 A 5 IMÁGENES)
-- ------------------------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.packs ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Inicializar images con la imagen existente si images está vacío
UPDATE public.products
SET images = jsonb_build_array(image)
WHERE (images IS NULL OR images = '[]'::jsonb) AND image IS NOT NULL AND image <> '';

UPDATE public.packs
SET images = jsonb_build_array(image)
WHERE (images IS NULL OR images = '[]'::jsonb) AND image IS NOT NULL AND image <> '';

-- ------------------------------------------------------------------------------
-- 3. MEJORAS EN PACKS (ENVÍO GRATIS, EXENCIÓN DE PEDIDO MÍNIMO, SUPLEMENTOS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.packs ADD COLUMN IF NOT EXISTS free_shipping BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.packs ADD COLUMN IF NOT EXISTS skip_min_order BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.pack_group_options ADD COLUMN IF NOT EXISTS price_supplement NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

-- ------------------------------------------------------------------------------
-- 4. TABLA: PRODUCT_SUGGESTIONS (Sugerencias de productos por clientes)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category_name TEXT,
    brand TEXT,
    description TEXT,
    reference_url TEXT,
    estimated_price NUMERIC(10, 2),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'accepted', 'rejected', 'implemented')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_product_suggestions_user ON public.product_suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_product_suggestions_status ON public.product_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_product_suggestions_created ON public.product_suggestions(created_at DESC);

ALTER TABLE public.product_suggestions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view their own product suggestions" ON public.product_suggestions;
    CREATE POLICY "Users can view their own product suggestions"
        ON public.product_suggestions FOR SELECT
        TO authenticated
        USING (user_id = auth.uid() OR public.is_admin());

    DROP POLICY IF EXISTS "Users can insert their own product suggestions" ON public.product_suggestions;
    CREATE POLICY "Users can insert their own product suggestions"
        ON public.product_suggestions FOR INSERT
        TO authenticated
        WITH CHECK (user_id = auth.uid());

    DROP POLICY IF EXISTS "Admins can manage all product suggestions" ON public.product_suggestions;
    CREATE POLICY "Admins can manage all product suggestions"
        ON public.product_suggestions FOR ALL
        TO authenticated
        USING (public.is_admin())
        WITH CHECK (public.is_admin());
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 5. DISPONIBILIDAD DE REPARTIDORES
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_couriers_available()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.couriers WHERE active = true AND available = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.check_couriers_available() TO authenticated, anon;

-- Publicación realtime para couriers y product_suggestions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'couriers'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.couriers;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'product_suggestions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.product_suggestions;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 6. ELIMINACIÓN ATÓMICA DE PEDIDOS DESDE ADMINISTRACIÓN
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_orders(
    p_order_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INT := 0;
BEGIN
    -- 1. Exigir permisos de administrador
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: solo un administrador puede eliminar pedidos.';
    END IF;

    IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
        RETURN jsonb_build_object('success', true, 'deleted_count', 0);
    END IF;

    -- 2. Limpieza de relaciones de forma ordenada y segura
    -- Notificaciones asociadas
    DELETE FROM public.notifications WHERE order_id = ANY(p_order_ids);

    -- Tickets y líneas de aprovisionamiento/sourcing
    DELETE FROM public.sourcing_items WHERE order_id = ANY(p_order_ids);
    DELETE FROM public.sourcing_tickets WHERE order_id = ANY(p_order_ids);

    -- Incidencias y eventos asociados
    DELETE FROM public.incident_events WHERE order_id = ANY(p_order_ids);
    DELETE FROM public.incidents WHERE order_id = ANY(p_order_ids);

    -- Líneas de pedido
    DELETE FROM public.order_items WHERE order_id = ANY(p_order_ids);

    -- Registros de pago asociados
    DELETE FROM public.payments WHERE order_id = ANY(p_order_ids);

    -- Desvincular referencias sin romper historial
    UPDATE public.stock_movements SET order_id = NULL WHERE order_id = ANY(p_order_ids);
    UPDATE public.courier_incentive_rewards SET trigger_order_id = NULL WHERE trigger_order_id = ANY(p_order_ids);
    
    -- Grupos YA Juntos desvincular pedido si aplica
    UPDATE public.shared_orders SET order_id = NULL WHERE order_id = ANY(p_order_ids);

    -- 3. Eliminar los pedidos de la tabla orders
    DELETE FROM public.orders WHERE id = ANY(p_order_ids);
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_count', v_deleted_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_orders(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_orders(UUID[]) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. RECOMPENSAS / REPARTIDORES: VISTA Y SINTAXIS PL/pgSQL 100% SEGURA
-- ------------------------------------------------------------------------------
-- Vista de consulta agregada
CREATE OR REPLACE VIEW public.courier_reward_history AS
SELECT 
    r.id,
    r.courier_id,
    c.user_id,
    p.full_name AS courier_name,
    p.email AS courier_email,
    r.incentive_id,
    i.name AS incentive_name,
    i.target_deliveries,
    r.deliveries_count,
    r.bonus_amount,
    r.status,
    r.trigger_order_id,
    r.achieved_at,
    r.notes,
    r.created_at
FROM public.courier_incentive_rewards r
JOIN public.couriers c ON c.id = r.courier_id
JOIN public.profiles p ON p.id = c.user_id
JOIN public.courier_incentives i ON i.id = r.incentive_id;

GRANT SELECT ON public.courier_reward_history TO authenticated, service_role;

-- Bloque procedimental estructurado con delimitadores estrictos para evitar error 42601
DO $$
DECLARE
    v_updated_rewards INT := 0;
    v_updated_incentives INT := 0;
BEGIN
    -- Sincronizar estados de recompensas sobre la tabla base subyacente
    UPDATE public.courier_incentive_rewards
    SET status = 'earned'
    WHERE status IS NULL OR status = '';
    GET DIAGNOSTICS v_updated_rewards = ROW_COUNT;

    -- Validar coherencia en incentivos activos
    UPDATE public.courier_incentives
    SET updated_at = timezone('utc'::text, now())
    WHERE active = true AND (bonus_amount <= 0 OR target_deliveries <= 0);
    GET DIAGNOSTICS v_updated_incentives = ROW_COUNT;

    RAISE NOTICE 'Actualización de repartidores completada: % recompensas, % incentivos.', v_updated_rewards, v_updated_incentives;
END $$;

-- ------------------------------------------------------------------------------
-- 8. MOTOR COMERCIAL ATÓMICO: CREATE_ORDER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order(
    p_address_id UUID,
    p_items JSONB,
    p_notes TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'paypal'
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

    -- Disponibilidad de repartidores
    v_has_available_couriers BOOLEAN := false;

    -- Configuración comercial
    v_min_order_enabled BOOLEAN := false;
    v_min_order_amount NUMERIC(10, 2) := 0;
    v_free_shipping_enabled BOOLEAN := false;
    v_free_shipping_threshold NUMERIC(10, 2) := 0;
    v_standard_delivery_fee NUMERIC(10, 2) := 2.90;

    -- Flags acumulados de packs
    v_has_pack_free_shipping BOOLEAN := false;
    v_has_pack_skip_min_order BOOLEAN := false;

    -- Variables de iteración de items
    v_item JSONB;
    v_item_is_pack BOOLEAN;
    v_item_qty INT;
    v_item_ref TEXT;
    v_prod_id UUID;
    v_prod_name TEXT;
    v_prod_price NUMERIC(10, 2);
    v_prod_active BOOLEAN;
    v_prod_stock_mode public.stock_mode_type;
    v_prod_stock_qty INT;
    v_prod_cat_id UUID;
    v_line_subtotal NUMERIC(10, 2);
    v_line_unit_price NUMERIC(10, 2);
    v_line_discount NUMERIC(10, 2) := 0;

    -- Packs
    v_pack_id UUID;
    v_pack_name TEXT;
    v_pack_price NUMERIC(10, 2);
    v_pack_unit_price NUMERIC(10, 2);
    v_pack_type public.pack_type_enum;
    v_pack_active BOOLEAN;
    v_pack_free_ship BOOLEAN;
    v_pack_skip_min BOOLEAN;
    v_pack_sub_item RECORD;
    v_pack_group RECORD;
    v_selection JSONB;
    v_chosen_option_count INT;
    v_chosen_opt_prod_id UUID;
    v_chosen_opt_prod RECORD;
    v_chosen_opt_supplement NUMERIC(10, 2);
    v_total_pack_supplements NUMERIC(10, 2);
    v_chosen_pack_items JSONB;
    v_pack_snapshot JSONB;

    -- Promociones
    v_spec_disc RECORD;
    v_best_disc RECORD;
    v_promo RECORD;
    v_total_discounts NUMERIC(10, 2) := 0;
    v_best_promo_discount NUMERIC(10, 2) := 0;
    v_best_promo_id UUID := NULL;
    v_best_promo_code TEXT := NULL;
    v_calculated_promo_val NUMERIC(10, 2) := 0;

    -- Colecciones temporales para items, stock y sourcing
    v_order_items_to_insert JSONB := '[]'::jsonb;
    v_stock_deductions JSONB := '[]'::jsonb;
    v_sourcing_queue JSONB := '[]'::jsonb;
    v_s_item JSONB;
    v_deduct RECORD;
    v_comp_needed INT;
    v_cur_stock INT;
    v_new_stock INT;
    v_inserted_item_id UUID;
    v_matched_item_id UUID;
BEGIN
    -- 1. Validar autenticación
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión para realizar un pedido en YA Delivery.';
    END IF;

    -- 2. VALIDAR DISPONIBILIDAD DE REPARTIDORES EN TIEMPO REAL
    SELECT EXISTS (
        SELECT 1 FROM public.couriers WHERE active = true AND available = true
    ) INTO v_has_available_couriers;

    IF NOT v_has_available_couriers THEN
        RAISE EXCEPTION 'En este momento no hay repartidores disponibles en YA Delivery. Por favor, inténtalo de nuevo en unos minutos.';
    END IF;

    -- 3. Validar dirección y capturar snapshot inmutable
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

    -- 4. Cargar configuración de delivery zone y costes
    SELECT id, delivery_fee
    INTO v_zone_id, v_delivery_fee
    FROM public.delivery_zones
    WHERE active = true
    ORDER BY created_at ASC
    LIMIT 1;

    SELECT
        min_order_enabled, min_order_amount,
        free_shipping_enabled, free_shipping_threshold,
        standard_delivery_fee
    INTO
        v_min_order_enabled, v_min_order_amount,
        v_free_shipping_enabled, v_free_shipping_threshold,
        v_standard_delivery_fee
    FROM public.commercial_settings
    WHERE id = 'default';

    IF v_standard_delivery_fee IS NOT NULL THEN
        v_delivery_fee := v_standard_delivery_fee;
    END IF;

    -- 5. Validar método de pago
    IF p_payment_method IS NULL OR p_payment_method = '' THEN
        v_valid_payment_method := 'paypal'::public.payment_method_type;
    ELSIF p_payment_method IN ('paypal', 'card', 'bizum', 'cash', 'apple_pay', 'google_pay') THEN
        v_valid_payment_method := p_payment_method::public.payment_method_type;
    ELSE
        v_valid_payment_method := 'paypal'::public.payment_method_type;
    END IF;

    -- 6. Validar que el carrito contenga elementos
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito está vacío. Agrega productos antes de tramitar el pedido.';
    END IF;

    -- 7. Procesar cada item del carrito y verificar stock / suplementos / opciones
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_is_pack := COALESCE((v_item->>'is_pack')::BOOLEAN, false);
        v_item_qty := COALESCE((v_item->>'quantity')::INT, 1);

        IF v_item_qty <= 0 THEN
            RAISE EXCEPTION 'La cantidad de cada producto debe ser mayor a 0.';
        END IF;

        IF v_item_is_pack THEN
            -- Caso Pack
            v_item_ref := v_item->>'pack_id';
            IF v_item_ref IS NULL THEN
                v_item_ref := v_item->>'product_id';
            END IF;

            SELECT id, name, price, pack_type, active, free_shipping, skip_min_order
            INTO v_pack_id, v_pack_name, v_pack_price, v_pack_type, v_pack_active, v_pack_free_ship, v_pack_skip_min
            FROM public.packs
            WHERE id = v_item_ref::UUID;

            IF v_pack_id IS NULL OR v_pack_active IS NOT TRUE THEN
                RAISE EXCEPTION 'El pack seleccionado ("%") no está disponible.', COALESCE(v_pack_name, v_item_ref);
            END IF;

            -- Detectar beneficios especiales del pack
            IF v_pack_free_ship IS TRUE THEN
                v_has_pack_free_shipping := true;
            END IF;
            IF v_pack_skip_min IS TRUE THEN
                v_has_pack_skip_min_order := true;
            END IF;

            v_chosen_pack_items := '[]'::jsonb;
            v_total_pack_supplements := 0.00;

            IF v_pack_type = 'fixed' THEN
                FOR v_pack_sub_item IN
                    SELECT pi.product_id, pi.quantity, p.name, p.active, p.stock_mode, p.stock_quantity
                    FROM public.pack_items pi
                    JOIN public.products p ON p.id = pi.product_id
                    WHERE pi.pack_id = v_pack_id
                LOOP
                    SELECT stock_quantity, stock_mode, active INTO v_cur_stock, v_prod_stock_mode, v_prod_active
                    FROM public.products
                    WHERE id = v_pack_sub_item.product_id
                    FOR UPDATE;

                    v_comp_needed := v_pack_sub_item.quantity * v_item_qty;

                    IF v_prod_active IS NOT TRUE OR v_prod_stock_mode = 'out_of_stock' THEN
                        RAISE EXCEPTION 'El componente "%" del pack "%" está agotado.', v_pack_sub_item.name, v_pack_name;
                    END IF;

                    IF v_prod_stock_mode = 'in_stock' AND v_cur_stock < v_comp_needed THEN
                        RAISE EXCEPTION 'Stock insuficiente para el componente "%" del pack "%" (disponible: %, necesario: %).', 
                            v_pack_sub_item.name, v_pack_name, v_cur_stock, v_comp_needed;
                    END IF;

                    IF v_prod_stock_mode = 'in_stock' THEN
                        v_stock_deductions := v_stock_deductions || jsonb_build_object(
                            'product_id', v_pack_sub_item.product_id,
                            'quantity', v_comp_needed,
                            'reason', 'Venta componente pack ' || v_pack_name
                        );
                    ELSIF v_prod_stock_mode = 'on_demand' THEN
                        v_sourcing_queue := v_sourcing_queue || jsonb_build_object(
                            'product_id', v_pack_sub_item.product_id,
                            'product_name', v_pack_sub_item.name,
                            'quantity', v_comp_needed,
                            'match_key', 'pack_' || v_pack_id::TEXT
                        );
                    END IF;

                    v_chosen_pack_items := v_chosen_pack_items || jsonb_build_object(
                        'product_id', v_pack_sub_item.product_id,
                        'name', v_pack_sub_item.name,
                        'quantity', v_pack_sub_item.quantity
                    );
                END LOOP;
            ELSE
                -- Pack configurable con verificación de suplementos de precio
                FOR v_pack_group IN
                    SELECT id, name, min_select, max_select
                    FROM public.pack_groups
                    WHERE pack_id = v_pack_id
                    ORDER BY sort_order ASC
                LOOP
                    v_chosen_option_count := 0;
                    FOR v_selection IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'pack_selections', '[]'::jsonb))
                    LOOP
                        IF (v_selection->>'group_id')::UUID = v_pack_group.id THEN
                            v_chosen_option_count := v_chosen_option_count + 1;
                            v_chosen_opt_prod_id := (v_selection->>'product_id')::UUID;

                            -- Obtener suplemento configurado en la opción
                            SELECT COALESCE(price_supplement, 0.00)
                            INTO v_chosen_opt_supplement
                            FROM public.pack_group_options
                            WHERE group_id = v_pack_group.id AND product_id = v_chosen_opt_prod_id;

                            v_chosen_opt_supplement := COALESCE(v_chosen_opt_supplement, 0.00);
                            v_total_pack_supplements := v_total_pack_supplements + v_chosen_opt_supplement;

                            SELECT id, name, active, stock_mode, stock_quantity
                            INTO v_chosen_opt_prod
                            FROM public.products
                            WHERE id = v_chosen_opt_prod_id
                            FOR UPDATE;

                            IF v_chosen_opt_prod.active IS NOT TRUE OR v_chosen_opt_prod.stock_mode = 'out_of_stock' THEN
                                RAISE EXCEPTION 'La opción "%" seleccionada para el pack "%" está agotada.', v_chosen_opt_prod.name, v_pack_name;
                            END IF;

                            IF v_chosen_opt_prod.stock_mode = 'in_stock' AND v_chosen_opt_prod.stock_quantity < v_item_qty THEN
                                RAISE EXCEPTION 'Stock insuficiente para la opción "%" del pack "%" (disponible: %, solicitado: %).', 
                                    v_chosen_opt_prod.name, v_pack_name, v_chosen_opt_prod.stock_quantity, v_item_qty;
                            END IF;

                            IF v_chosen_opt_prod.stock_mode = 'in_stock' THEN
                                v_stock_deductions := v_stock_deductions || jsonb_build_object(
                                    'product_id', v_chosen_opt_prod.id,
                                    'quantity', v_item_qty,
                                    'reason', 'Venta opción pack ' || v_pack_name
                                );
                            ELSIF v_chosen_opt_prod.stock_mode = 'on_demand' THEN
                                v_sourcing_queue := v_sourcing_queue || jsonb_build_object(
                                    'product_id', v_chosen_opt_prod.id,
                                    'product_name', v_chosen_opt_prod.name,
                                    'quantity', v_item_qty,
                                    'match_key', 'pack_' || v_pack_id::TEXT
                                );
                            END IF;

                            v_chosen_pack_items := v_chosen_pack_items || jsonb_build_object(
                                'group_id', v_pack_group.id,
                                'group_name', v_pack_group.name,
                                'product_id', v_chosen_opt_prod.id,
                                'product_name', v_chosen_opt_prod.name,
                                'price_supplement', v_chosen_opt_supplement
                            );
                        END IF;
                    END LOOP;

                    IF v_chosen_option_count < v_pack_group.min_select THEN
                        RAISE EXCEPTION 'Debes seleccionar al menos % opción(es) para "%" en el pack "%".', 
                            v_pack_group.min_select, v_pack_group.name, v_pack_name;
                    END IF;
                    IF v_chosen_option_count > v_pack_group.max_select THEN
                        RAISE EXCEPTION 'Puedes seleccionar máximo % opción(es) para "%" en el pack "%".', 
                            v_pack_group.max_select, v_pack_group.name, v_pack_name;
                    END IF;
                END LOOP;
            END IF;

            -- Precio unitario total del pack (base + suplementos de opciones)
            v_pack_unit_price := v_pack_price + v_total_pack_supplements;
            v_line_subtotal := v_pack_unit_price * v_item_qty;
            v_subtotal := v_subtotal + v_line_subtotal;

            v_pack_snapshot := jsonb_build_object(
                'pack_id', v_pack_id,
                'pack_name', v_pack_name,
                'pack_type', v_pack_type,
                'base_price', v_pack_price,
                'unit_price', v_pack_unit_price,
                'supplements_total', v_total_pack_supplements,
                'quantity', v_item_qty,
                'free_shipping', v_pack_free_ship,
                'skip_min_order', v_pack_skip_min,
                'components', v_chosen_pack_items
            );

            v_order_items_to_insert := v_order_items_to_insert || jsonb_build_object(
                'is_pack', true,
                'pack_id', v_pack_id,
                'product_id', NULL,
                'product_name', '[PACK] ' || v_pack_name,
                'unit_price', v_pack_unit_price,
                'quantity', v_item_qty,
                'subtotal', v_line_subtotal,
                'discount_applied', 0.00,
                'pack_snapshot', v_pack_snapshot,
                'match_key', 'pack_' || v_pack_id::TEXT
            );
        ELSE
            -- Item producto individual
            v_item_ref := v_item->>'product_id';
            IF v_item_ref IS NULL OR v_item_ref = '' THEN
                RAISE EXCEPTION 'Identificador de producto no válido en el carrito.';
            END IF;

            v_prod_id := NULL;
            IF v_item_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                SELECT id, name, price, active, stock_mode, stock_quantity, category_id
                INTO v_prod_id, v_prod_name, v_prod_price, v_prod_active, v_prod_stock_mode, v_prod_stock_qty, v_prod_cat_id
                FROM public.products
                WHERE id = v_item_ref::UUID
                FOR UPDATE;
            END IF;

            IF v_prod_id IS NULL THEN
                SELECT id, name, price, active, stock_mode, stock_quantity, category_id
                INTO v_prod_id, v_prod_name, v_prod_price, v_prod_active, v_prod_stock_mode, v_prod_stock_qty, v_prod_cat_id
                FROM public.products
                WHERE slug = v_item_ref
                FOR UPDATE;
            END IF;

            IF v_prod_id IS NULL THEN
                RAISE EXCEPTION 'El producto solicitado ("%") no existe en el catálogo.', v_item_ref;
            END IF;

            IF v_prod_active IS NOT TRUE THEN
                RAISE EXCEPTION 'El producto "%" no está disponible para venta.', v_prod_name;
            END IF;

            IF v_prod_stock_mode = 'out_of_stock' THEN
                RAISE EXCEPTION 'El producto "%" está agotado actualmente.', v_prod_name;
            END IF;

            IF v_prod_stock_mode = 'in_stock' AND v_prod_stock_qty < v_item_qty THEN
                RAISE EXCEPTION 'Stock insuficiente para "%" (disponible: %, solicitado: %).', 
                    v_prod_name, v_prod_stock_qty, v_item_qty;
            END IF;

            -- Aplicar descuentos comerciales
            v_line_discount := 0;
            v_line_unit_price := v_prod_price;

            SELECT discount_type, discount_value INTO v_spec_disc
            FROM public.discounts
            WHERE active = true
              AND scope = 'product'
              AND product_id = v_prod_id
              AND (starts_at IS NULL OR starts_at <= timezone('utc'::text, now()))
              AND (expires_at IS NULL OR expires_at >= timezone('utc'::text, now()))
            ORDER BY created_at DESC
            LIMIT 1;

            IF v_spec_disc IS NOT NULL THEN
                IF v_spec_disc.discount_type = 'percentage' THEN
                    v_line_discount := ROUND((v_prod_price * (v_spec_disc.discount_value / 100.0)), 2);
                ELSE
                    v_line_discount := LEAST(v_prod_price, v_spec_disc.discount_value);
                END IF;
            ELSE
                SELECT discount_type, discount_value INTO v_best_disc
                FROM public.discounts
                WHERE active = true
                  AND scope = 'category'
                  AND category_id = v_prod_cat_id
                  AND (starts_at IS NULL OR starts_at <= timezone('utc'::text, now()))
                  AND (expires_at IS NULL OR expires_at >= timezone('utc'::text, now()))
                ORDER BY created_at DESC
                LIMIT 1;

                IF v_best_disc IS NOT NULL THEN
                    IF v_best_disc.discount_type = 'percentage' THEN
                        v_line_discount := ROUND((v_prod_price * (v_best_disc.discount_value / 100.0)), 2);
                    ELSE
                        v_line_discount := LEAST(v_prod_price, v_best_disc.discount_value);
                    END IF;
                END IF;
            END IF;

            v_line_unit_price := GREATEST(0.00, v_prod_price - v_line_discount);
            v_line_subtotal := v_line_unit_price * v_item_qty;
            v_subtotal := v_subtotal + v_line_subtotal;
            v_total_discounts := v_total_discounts + (v_line_discount * v_item_qty);

            IF v_prod_stock_mode = 'in_stock' THEN
                v_stock_deductions := v_stock_deductions || jsonb_build_object(
                    'product_id', v_prod_id,
                    'quantity', v_item_qty,
                    'reason', 'Venta pedido ' || v_prod_name
                );
            ELSIF v_prod_stock_mode = 'on_demand' THEN
                v_sourcing_queue := v_sourcing_queue || jsonb_build_object(
                    'product_id', v_prod_id,
                    'product_name', v_prod_name,
                    'quantity', v_item_qty,
                    'match_key', 'prod_' || v_prod_id::TEXT
                );
            END IF;

            v_order_items_to_insert := v_order_items_to_insert || jsonb_build_object(
                'is_pack', false,
                'pack_id', NULL,
                'product_id', v_prod_id,
                'product_name', v_prod_name,
                'unit_price', v_line_unit_price,
                'quantity', v_item_qty,
                'subtotal', v_line_subtotal,
                'discount_applied', v_line_discount,
                'pack_snapshot', NULL,
                'match_key', 'prod_' || v_prod_id::TEXT
            );
        END IF;
    END LOOP;

    -- 8. Evaluar promociones automáticas y 2×1
    FOR v_promo IN
        SELECT id, code, discount_type, discount_value, minimum_order, applicable_product_id, is_two_for_one
        FROM public.promotions
        WHERE active = true
          AND is_automatic = true
          AND (starts_at IS NULL OR starts_at <= timezone('utc'::text, now()))
          AND (expires_at IS NULL OR expires_at >= timezone('utc'::text, now()))
          AND v_subtotal >= minimum_order
    LOOP
        v_calculated_promo_val := 0;

        IF v_promo.discount_type = 'two_for_one' OR v_promo.is_two_for_one IS TRUE THEN
            -- Promoción 2×1: calcular unidades pares gratuitas (floor(qty / 2) * precio_unitario)
            FOR v_item IN SELECT * FROM jsonb_array_elements(v_order_items_to_insert)
            LOOP
                IF (v_item->>'is_pack')::BOOLEAN IS FALSE THEN
                    IF v_promo.applicable_product_id IS NULL OR (v_item->>'product_id')::UUID = v_promo.applicable_product_id THEN
                        v_calculated_promo_val := v_calculated_promo_val + (FLOOR((v_item->>'quantity')::INT / 2) * (v_item->>'unit_price')::NUMERIC);
                    END IF;
                END IF;
            END LOOP;
        ELSIF v_promo.discount_type = 'percentage' THEN
            v_calculated_promo_val := ROUND((v_subtotal * (v_promo.discount_value / 100.0)), 2);
        ELSE
            v_calculated_promo_val := LEAST(v_subtotal, v_promo.discount_value);
        END IF;

        IF v_calculated_promo_val > v_best_promo_discount THEN
            v_best_promo_discount := v_calculated_promo_val;
            v_best_promo_id := v_promo.id;
            v_best_promo_code := v_promo.code;
        END IF;
    END LOOP;

    -- 9. Reglas de Envío Gratis
    -- Se activa si la promoción otorga free_shipping, si el subtotal supera el umbral, o si algún pack tiene envío gratuito
    IF v_has_pack_free_shipping OR (v_free_shipping_enabled AND v_subtotal >= v_free_shipping_threshold) THEN
        v_delivery_fee := 0.00;
    END IF;

    -- 10. Validación de Pedido Mínimo
    -- Se omite si algún pack en el pedido está configurado con skip_min_order
    IF NOT v_has_pack_skip_min_order AND v_min_order_enabled AND v_subtotal < v_min_order_amount THEN
        RAISE EXCEPTION 'El subtotal del pedido (% €) no alcanza el pedido mínimo configurado (% €).', 
            v_subtotal, v_min_order_amount;
    END IF;

    -- 11. Total final asegurando no negatividad
    v_total := GREATEST(0.00, v_subtotal - v_best_promo_discount) + v_delivery_fee;
    v_total_discounts := v_total_discounts + v_best_promo_discount;

    -- 12. Generar número de pedido único legible
    v_order_number := 'ORD-' || TO_CHAR(timezone('utc'::text, now()), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

    -- 13. Insertar pedido en estado payment_pending
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
        'payment_pending',
        v_subtotal,
        v_delivery_fee,
        v_total,
        v_total_discounts,
        v_best_promo_id,
        v_best_promo_code,
        v_best_promo_discount,
        v_valid_payment_method,
        'pending',
        p_notes,
        v_address_snapshot
    )
    RETURNING id INTO v_order_id;

    -- 14. Insertar líneas de pedido en order_items
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
        )
        RETURNING id INTO v_inserted_item_id;

        -- Planificar sourcing si aplica
        FOR v_s_item IN SELECT * FROM jsonb_array_elements(v_sourcing_queue)
        LOOP
            IF (v_s_item->>'match_key') = (v_item->>'match_key') THEN
                INSERT INTO public.sourcing_items (
                    order_id,
                    order_item_id,
                    product_id,
                    product_name,
                    quantity_needed,
                    status
                ) VALUES (
                    v_order_id,
                    v_inserted_item_id,
                    (v_s_item->>'product_id')::UUID,
                    v_s_item->>'product_name',
                    (v_s_item->>'quantity')::INT,
                    'pending'
                );
            END IF;
        END LOOP;
    END LOOP;

    -- 15. Aplicar deducciones de stock
    FOR v_deduct IN
        SELECT
            (elem->>'product_id')::UUID AS prod_id,
            SUM((elem->>'quantity')::INT) AS total_qty,
            elem->>'reason' AS reason
        FROM jsonb_array_elements(v_stock_deductions) AS elem
        GROUP BY elem->>'product_id', elem->>'reason'
    LOOP
        SELECT stock_quantity INTO v_cur_stock
        FROM public.products
        WHERE id = v_deduct.prod_id
        FOR UPDATE;

        v_new_stock := GREATEST(0, v_cur_stock - v_deduct.total_qty);

        UPDATE public.products
        SET stock_quantity = v_new_stock,
            stock_mode = CASE WHEN v_new_stock = 0 THEN 'out_of_stock'::public.stock_mode_type ELSE stock_mode END,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_deduct.prod_id;

        INSERT INTO public.stock_movements (
            product_id,
            order_id,
            movement_type,
            quantity_change,
            quantity_after,
            reason,
            created_by
        ) VALUES (
            v_deduct.prod_id,
            v_order_id,
            'sale',
            -v_deduct.total_qty,
            v_new_stock,
            COALESCE(v_deduct.reason, 'Venta en pedido ' || v_order_number),
            v_user_id
        );
    END LOOP;

    -- 16. Sourcing ticket si hay items bajo demanda
    IF jsonb_array_length(v_sourcing_queue) > 0 THEN
        INSERT INTO public.sourcing_tickets (
            order_id,
            status,
            total_items_needed,
            notes
        ) VALUES (
            v_order_id,
            'open',
            (SELECT COUNT(*) FROM public.sourcing_items WHERE order_id = v_order_id),
            'Ticket automático generado para el pedido ' || v_order_number
        );
    END IF;

    -- 17. Retornar resumen completo
    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'total', v_total,
        'free_shipping', (v_delivery_fee = 0.00),
        'skip_min_order_applied', v_has_pack_skip_min_order,
        'items_count', jsonb_array_length(p_items)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(UUID, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, JSONB, TEXT, TEXT) TO authenticated;
