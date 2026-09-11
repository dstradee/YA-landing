-- ==============================================================================
-- YA DELIVERY — MIGRACIÓN FASE 5: SISTEMA DE INVENTARIO REAL Y SEGURO
-- Archivo: supabase/migrations/20260911000007_phase5_inventory_system.sql
-- ==============================================================================
-- OBJETIVO:
-- 1. Única fuente de verdad para el stock en PostgreSQL (public.products).
-- 2. Historial auditable completo en public.stock_movements (entradas, ventas, ajustes, mermas, cancelaciones).
-- 3. Control atómico de concurrencia con FOR UPDATE en creación de pedidos (create_order).
-- 4. Soporte para umbral de alerta de stock mínimo (min_stock) y cálculo de márgenes (estimated_cost).
-- 5. Restauración automática e idempotente de stock ante cancelaciones (trg_order_cancelled_restore_stock).
-- 6. RPCs administrativas seguras para ajuste manual y consulta de historial.
-- 7. Integridad absoluta con FASE 4D (ganancias) y FASE 4E (incentivos).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIÓN DE TABLA public.products: min_stock
-- ------------------------------------------------------------------------------
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS min_stock INT NOT NULL DEFAULT 5 CHECK (min_stock >= 0);

CREATE INDEX IF NOT EXISTS idx_products_stock_qty ON public.products(stock_quantity);
CREATE INDEX IF NOT EXISTS idx_products_stock_mode ON public.products(stock_mode);

-- ------------------------------------------------------------------------------
-- 2. TIPO ENUM Y TABLA DE MOVIMIENTOS: public.stock_movements
-- ------------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE public.stock_movement_type AS ENUM (
        'entry',        -- Entrada de mercancía / compra a proveedor
        'sale',         -- Salida por venta en pedido
        'cancellation', -- Devolución / restauración por pedido cancelado
        'adjustment',   -- Ajuste manual por recuento físico
        'loss',         -- Merma / rotura / producto caducado
        'test_order'    -- Pedido de prueba admin
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    movement_type public.stock_movement_type NOT NULL,
    quantity INT NOT NULL, -- Positivo para entradas y devoluciones, negativo para ventas y pérdidas
    previous_stock INT NOT NULL CHECK (previous_stock >= 0),
    new_stock INT NOT NULL CHECK (new_stock >= 0),
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    reason TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order ON public.stock_movements(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON public.stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at DESC);

-- ------------------------------------------------------------------------------
-- 3. POLÍTICAS RLS PARA public.stock_movements
-- ------------------------------------------------------------------------------
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all stock movements" ON public.stock_movements;
CREATE POLICY "Admins can view all stock movements"
ON public.stock_movements
FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert stock movements" ON public.stock_movements;
CREATE POLICY "Admins can insert stock movements"
ON public.stock_movements
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 4. RPC ATÓMICA DE AJUSTE MANUAL DE INVENTARIO (Solo Administradores)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_adjust_stock(
    p_product_id UUID,
    p_type TEXT,
    p_quantity INT,
    p_reason TEXT DEFAULT NULL,
    p_new_stock INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_product RECORD;
    v_type_enum public.stock_movement_type;
    v_prev_stock INT;
    v_calc_new_stock INT;
    v_delta INT;
    v_movement_id UUID;
    v_admin_id UUID;
BEGIN
    -- 1. Seguridad: Verificar rol admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: solo administradores pueden ajustar el stock.';
    END IF;

    v_admin_id := auth.uid();

    -- 2. Validar tipo de movimiento
    BEGIN
        v_type_enum := p_type::public.stock_movement_type;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Tipo de movimiento de stock no válido: %', p_type;
    END;

    -- 3. Bloquear fila del producto para concurrencia atómica
    SELECT * INTO v_product
    FROM public.products
    WHERE id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Producto no encontrado (ID: %)', p_product_id;
    END IF;

    v_prev_stock := v_product.stock_quantity;

    -- 4. Calcular nuevo stock según tipo
    IF v_type_enum = 'adjustment' THEN
        IF p_new_stock IS NOT NULL THEN
            IF p_new_stock < 0 THEN
                RAISE EXCEPTION 'El stock no puede ser negativo.';
            END IF;
            v_calc_new_stock := p_new_stock;
            v_delta := v_calc_new_stock - v_prev_stock;
        ELSE
            v_delta := p_quantity;
            v_calc_new_stock := v_prev_stock + v_delta;
            IF v_calc_new_stock < 0 THEN
                RAISE EXCEPTION 'El ajuste resultaría en un stock negativo (% unidades).', v_calc_new_stock;
            END IF;
        END IF;
    ELSIF v_type_enum = 'entry' THEN
        IF p_quantity <= 0 THEN
            RAISE EXCEPTION 'La cantidad de entrada debe ser superior a 0.';
        END IF;
        v_delta := p_quantity;
        v_calc_new_stock := v_prev_stock + v_delta;
    ELSIF v_type_enum = 'loss' THEN
        IF p_quantity <= 0 THEN
            RAISE EXCEPTION 'La cantidad de merma/pérdida debe ser superior a 0.';
        END IF;
        IF p_quantity > v_prev_stock THEN
            RAISE EXCEPTION 'La merma (% u.) no puede ser superior al stock actual (% u.).', p_quantity, v_prev_stock;
        END IF;
        v_delta := -p_quantity;
        v_calc_new_stock := v_prev_stock - p_quantity;
    ELSE
        -- Otros tipos
        v_delta := p_quantity;
        v_calc_new_stock := v_prev_stock + v_delta;
        IF v_calc_new_stock < 0 THEN
            RAISE EXCEPTION 'La operación resultaría en stock negativo.';
        END IF;
    END IF;

    -- 5. Actualizar producto en public.products
    UPDATE public.products
    SET stock_quantity = v_calc_new_stock,
        stock_mode = CASE 
            WHEN v_calc_new_stock = 0 AND stock_mode = 'in_stock' THEN 'out_of_stock'
            WHEN v_calc_new_stock > 0 AND stock_mode = 'out_of_stock' THEN 'in_stock'
            ELSE stock_mode
        END,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_product_id;

    -- 6. Insertar registro inmutable en public.stock_movements
    INSERT INTO public.stock_movements (
        product_id,
        movement_type,
        quantity,
        previous_stock,
        new_stock,
        order_id,
        reason,
        created_by,
        created_at
    ) VALUES (
        p_product_id,
        v_type_enum,
        v_delta,
        v_prev_stock,
        v_calc_new_stock,
        NULL,
        COALESCE(NULLIF(trim(p_reason), ''), 'Ajuste manual administrativo'),
        v_admin_id,
        timezone('utc'::text, now())
    )
    RETURNING id INTO v_movement_id;

    RETURN jsonb_build_object(
        'success', true,
        'movement_id', v_movement_id,
        'product_id', p_product_id,
        'product_name', v_product.name,
        'previous_stock', v_prev_stock,
        'new_stock', v_calc_new_stock,
        'delta', v_delta,
        'movement_type', v_type_enum,
        'reason', p_reason
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_stock(UUID, TEXT, INT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_stock(UUID, TEXT, INT, TEXT, INT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. RPC PARA CONSULTA DE MOVIMIENTOS CON DETALLE (Solo Administradores)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_fetch_stock_movements(
    p_product_id UUID DEFAULT NULL,
    p_type TEXT DEFAULT NULL,
    p_limit INT DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    product_id UUID,
    product_name TEXT,
    product_slug TEXT,
    movement_type public.stock_movement_type,
    quantity INT,
    previous_stock INT,
    new_stock INT,
    order_id UUID,
    order_number TEXT,
    reason TEXT,
    created_by UUID,
    creator_email TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: solo administradores pueden consultar el historial de inventario.';
    END IF;

    RETURN QUERY
    SELECT 
        sm.id,
        sm.product_id,
        p.name AS product_name,
        p.slug AS product_slug,
        sm.movement_type,
        sm.quantity,
        sm.previous_stock,
        sm.new_stock,
        sm.order_id,
        o.order_number,
        sm.reason,
        sm.created_by,
        u.email::TEXT AS creator_email,
        sm.created_at
    FROM public.stock_movements sm
    JOIN public.products p ON p.id = sm.product_id
    LEFT JOIN public.orders o ON o.id = sm.order_id
    LEFT JOIN auth.users u ON u.id = sm.created_by
    WHERE (p_product_id IS NULL OR sm.product_id = p_product_id)
      AND (p_type IS NULL OR sm.movement_type::TEXT = p_type)
    ORDER BY sm.created_at DESC
    LIMIT LEAST(p_limit, 500);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_fetch_stock_movements(UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_fetch_stock_movements(UUID, TEXT, INT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. RPC: RESUMEN Y VALORACIÓN DEL INVENTARIO (Solo Administradores)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_inventory_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_products INT := 0;
    v_in_stock_count INT := 0;
    v_low_stock_count INT := 0;
    v_out_of_stock_count INT := 0;
    v_on_demand_count INT := 0;
    v_total_units INT := 0;
    v_total_retail_value NUMERIC(12, 2) := 0.00;
    v_total_cost_value NUMERIC(12, 2) := 0.00;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: solo administradores pueden ver el resumen de inventario.';
    END IF;

    SELECT 
        COUNT(*)::INT,
        COUNT(CASE WHEN active = true AND stock_mode = 'in_stock' AND stock_quantity > min_stock THEN 1 END)::INT,
        COUNT(CASE WHEN active = true AND stock_mode = 'in_stock' AND stock_quantity > 0 AND stock_quantity <= min_stock THEN 1 END)::INT,
        COUNT(CASE WHEN active = true AND (stock_mode = 'out_of_stock' OR (stock_mode = 'in_stock' AND stock_quantity = 0)) THEN 1 END)::INT,
        COUNT(CASE WHEN active = true AND stock_mode = 'on_demand' THEN 1 END)::INT,
        COALESCE(SUM(CASE WHEN stock_mode = 'in_stock' THEN stock_quantity ELSE 0 END), 0)::INT,
        COALESCE(SUM(CASE WHEN stock_mode = 'in_stock' THEN stock_quantity * price ELSE 0 END), 0.00)::NUMERIC(12, 2),
        COALESCE(SUM(CASE WHEN stock_mode = 'in_stock' THEN stock_quantity * COALESCE(estimated_cost, price * 0.6) ELSE 0 END), 0.00)::NUMERIC(12, 2)
    INTO 
        v_total_products,
        v_in_stock_count,
        v_low_stock_count,
        v_out_of_stock_count,
        v_on_demand_count,
        v_total_units,
        v_total_retail_value,
        v_total_cost_value
    FROM public.products
    WHERE active = true;

    RETURN jsonb_build_object(
        'total_products', v_total_products,
        'in_stock_products', v_in_stock_count,
        'low_stock_products', v_low_stock_count,
        'out_of_stock_products', v_out_of_stock_count,
        'on_demand_products', v_on_demand_count,
        'total_units_in_stock', v_total_units,
        'total_retail_value', v_total_retail_value,
        'total_cost_value', v_total_cost_value,
        'estimated_gross_profit', ROUND(v_total_retail_value - v_total_cost_value, 2)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_inventory_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_inventory_summary() TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. TRIGGER: RESTAURACIÓN AUTOMÁTICA DE STOCK AL CANCELAR PEDIDOS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_order_cancelled_restore_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sale_rec RECORD;
    v_cur_stock INT;
    v_restored_stock INT;
BEGIN
    -- Solo actuar en transición hacia 'cancelled'
    IF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' THEN
        -- Comprobar si ya se restauró previamente para evitar cualquier duplicación
        IF NOT EXISTS (
            SELECT 1 FROM public.stock_movements 
            WHERE order_id = NEW.id AND movement_type = 'cancellation'
        ) THEN
            -- Iterar sobre cada movimiento de venta asociado a este pedido
            FOR v_sale_rec IN
                SELECT sm.id, sm.product_id, ABS(sm.quantity) as restore_qty
                FROM public.stock_movements sm
                WHERE sm.order_id = NEW.id 
                  AND sm.movement_type = 'sale'
            LOOP
                -- Bloquear fila del producto
                SELECT stock_quantity INTO v_cur_stock
                FROM public.products
                WHERE id = v_sale_rec.product_id
                FOR UPDATE;

                IF FOUND THEN
                    v_restored_stock := v_cur_stock + v_sale_rec.restore_qty;

                    -- Actualizar producto
                    UPDATE public.products
                    SET stock_quantity = v_restored_stock,
                        stock_mode = CASE 
                            WHEN stock_mode = 'out_of_stock' THEN 'in_stock' 
                            ELSE stock_mode 
                        END,
                        updated_at = timezone('utc'::text, now())
                    WHERE id = v_sale_rec.product_id;

                    -- Registrar movimiento de cancelación auditado
                    INSERT INTO public.stock_movements (
                        product_id,
                        movement_type,
                        quantity,
                        previous_stock,
                        new_stock,
                        order_id,
                        reason,
                        created_by,
                        created_at
                    ) VALUES (
                        v_sale_rec.product_id,
                        'cancellation',
                        v_sale_rec.restore_qty,
                        v_cur_stock,
                        v_restored_stock,
                        NEW.id,
                        'Restauración de stock por pedido cancelado (' || NEW.order_number || ')',
                        auth.uid(),
                        timezone('utc'::text, now())
                    );
                END IF;
            END LOOP;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_cancelled_restore_stock ON public.orders;
CREATE TRIGGER trg_order_cancelled_restore_stock
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.on_order_cancelled_restore_stock();

-- ------------------------------------------------------------------------------
-- 8. ACTUALIZACIÓN ATÓMICA DE public.create_order CON VALIDACIÓN Y DEDUCCIÓN DE STOCK
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
    v_best_item_discount NUMERIC(10, 2) := 0;
    v_calculated_discount NUMERIC(10, 2) := 0;

    -- Promociones de orden
    v_promo RECORD;
    v_best_promo_discount NUMERIC(10, 2) := 0;
    v_best_promo_id UUID := NULL;
    v_best_promo_code TEXT := NULL;
    v_calculated_promo_val NUMERIC(10, 2) := 0;

    -- Colecciones temporales para items y deducciones de stock
    v_order_items_to_insert JSONB := '[]'::jsonb;
    v_stock_deductions JSONB := '[]'::jsonb;
    v_deduct RECORD;
    v_comp_needed INT;
    v_cur_stock INT;
    v_new_stock INT;
BEGIN
    -- 1. Validar autenticación
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión para realizar un pedido en YA Delivery.';
    END IF;

    -- 2. Validar dirección y capturar snapshot inmutable
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

    -- 3. Cargar configuración de delivery zone y costes
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
    ELSIF v_delivery_fee IS NULL THEN
        v_delivery_fee := 2.90;
    END IF;

    -- 4. Validar método de pago (operativamente solo 'paypal' o 'card')
    BEGIN
        v_valid_payment_method := p_payment_method::public.payment_method_type;
    EXCEPTION WHEN OTHERS THEN
        v_valid_payment_method := 'paypal'::public.payment_method_type;
    END;

    IF v_valid_payment_method NOT IN ('paypal'::public.payment_method_type, 'card'::public.payment_method_type) THEN
        RAISE EXCEPTION 'Método de pago no operativo en YA Delivery. Selecciona PayPal o Tarjeta.';
    END IF;

    -- 5. Validar que el carrito no esté vacío
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El carrito está vacío. Añade productos antes de tramitar el pedido.';
    END IF;

    -- 6. Procesar cada item con bloqueo atómico FOR UPDATE para garantizar stock real
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_is_pack := COALESCE((v_item->>'is_pack')::BOOLEAN, false);
        v_item_qty := COALESCE((v_item->>'quantity')::INT, 0);

        IF v_item_qty <= 0 THEN
            RAISE EXCEPTION 'La cantidad de cada producto debe ser mayor a 0.';
        END IF;

        IF v_is_pack THEN
            v_item_ref := v_item->>'pack_id';
            IF v_item_ref IS NULL OR v_item_ref = '' THEN
                RAISE EXCEPTION 'Identificador de pack no válido en el pedido.';
            END IF;

            SELECT id, name, price, pack_type, active
            INTO v_pack_id, v_pack_name, v_pack_price, v_pack_type, v_pack_active
            FROM public.packs
            WHERE id = v_item_ref::UUID;

            IF v_pack_id IS NULL OR v_pack_active IS NOT TRUE THEN
                RAISE EXCEPTION 'El pack seleccionado ("%") no está disponible.', COALESCE(v_pack_name, v_item_ref);
            END IF;

            v_chosen_pack_items := '[]'::jsonb;

            IF v_pack_type = 'fixed' THEN
                FOR v_pack_sub_item IN
                    SELECT pi.product_id, pi.quantity, p.name, p.active, p.stock_mode, p.stock_quantity
                    FROM public.pack_items pi
                    JOIN public.products p ON p.id = pi.product_id
                    WHERE pi.pack_id = v_pack_id
                LOOP
                    -- Bloquear producto del pack para verificación estricta de stock
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

                    -- Planificar deducción de stock
                    IF v_prod_stock_mode = 'in_stock' THEN
                        v_stock_deductions := v_stock_deductions || jsonb_build_object(
                            'product_id', v_pack_sub_item.product_id,
                            'quantity', v_comp_needed,
                            'reason', 'Venta componente pack ' || v_pack_name
                        );
                    END IF;

                    v_chosen_pack_items := v_chosen_pack_items || jsonb_build_object(
                        'product_id', v_pack_sub_item.product_id,
                        'name', v_pack_sub_item.name,
                        'quantity', v_pack_sub_item.quantity
                    );
                END LOOP;
            ELSE
                -- Pack configurable
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

                            -- Bloquear producto seleccionado
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

                            -- Planificar deducción
                            IF v_chosen_opt_prod.stock_mode = 'in_stock' THEN
                                v_stock_deductions := v_stock_deductions || jsonb_build_object(
                                    'product_id', v_chosen_opt_prod.id,
                                    'quantity', v_item_qty,
                                    'reason', 'Venta opción seleccionada en pack ' || v_pack_name
                                );
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
                RAISE EXCEPTION 'El producto "%" no está disponible temporalmente.', v_prod_name;
            END IF;

            -- Validación estricta de stock
            IF v_prod_stock_mode = 'out_of_stock' OR (v_prod_stock_mode = 'in_stock' AND v_prod_stock_qty <= 0) THEN
                RAISE EXCEPTION 'El producto "%" está agotado actualmente.', v_prod_name;
            END IF;

            IF v_prod_stock_mode = 'in_stock' AND v_prod_stock_qty < v_item_qty THEN
                RAISE EXCEPTION 'No hay suficiente stock disponible para "%" (disponible: %, solicitado: %).', 
                    v_prod_name, v_prod_stock_qty, v_item_qty;
            END IF;

            -- Planificar deducción de stock
            IF v_prod_stock_mode = 'in_stock' THEN
                v_stock_deductions := v_stock_deductions || jsonb_build_object(
                    'product_id', v_prod_id,
                    'quantity', v_item_qty,
                    'reason', 'Venta producto individual'
                );
            END IF;

            -- Descuentos comerciales
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

    -- 7. Comprobar pedido mínimo comercial
    IF v_min_order_enabled AND v_subtotal < v_min_order_amount THEN
        RAISE EXCEPTION 'El subtotal del pedido (% €) no alcanza el pedido mínimo configurado (% €).', v_subtotal, v_min_order_amount;
    END IF;

    -- 8. Comprobar promociones de pedido global
    FOR v_promo IN
        SELECT id, code, discount_type, discount_value
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

    -- 9. Comprobar regla de envío gratis
    IF v_free_shipping_enabled AND v_subtotal >= v_free_shipping_threshold THEN
        v_delivery_fee := 0.00;
    END IF;

    -- 10. Calcular total seguro
    v_total := round(GREATEST(0.00, v_subtotal - v_best_promo_discount) + v_delivery_fee, 2);

    -- 11. Generar número de pedido secuencial único
    v_order_number := 'YA-' || nextval('public.order_number_seq')::TEXT;

    -- 12. INSERTAR PEDIDO EN ESTADO 'payment_pending' Y payment_status 'pending'
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
        payment_provider,
        notes,
        delivery_address_snapshot
    ) VALUES (
        v_order_number,
        v_user_id,
        p_address_id,
        v_zone_id,
        'payment_pending'::public.order_status,
        v_subtotal,
        v_delivery_fee,
        v_total,
        v_total_discounts,
        v_best_promo_id,
        v_best_promo_code,
        v_best_promo_discount,
        v_valid_payment_method,
        'pending'::public.payment_status_type,
        'paypal',
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

    -- 14. DEDUCCIÓN ATÓMICA DE STOCK Y REGISTRO EN public.stock_movements
    FOR v_deduct IN 
        SELECT 
            (d->>'product_id')::UUID AS prod_id,
            SUM((d->>'quantity')::INT)::INT AS total_deduct_qty,
            MAX(d->>'reason') AS reason_text
        FROM jsonb_array_elements(v_stock_deductions) d
        GROUP BY (d->>'product_id')::UUID
    LOOP
        -- Obtener stock actual bajo bloqueo
        SELECT stock_quantity INTO v_cur_stock
        FROM public.products
        WHERE id = v_deduct.prod_id
        FOR UPDATE;

        v_new_stock := GREATEST(0, v_cur_stock - v_deduct.total_deduct_qty);

        -- Actualizar producto
        UPDATE public.products
        SET stock_quantity = v_new_stock,
            stock_mode = CASE 
                WHEN v_new_stock = 0 AND stock_mode = 'in_stock' THEN 'out_of_stock'
                ELSE stock_mode 
            END,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_deduct.prod_id;

        -- Registrar movimiento inmutable de venta
        INSERT INTO public.stock_movements (
            product_id,
            movement_type,
            quantity,
            previous_stock,
            new_stock,
            order_id,
            reason,
            created_by,
            created_at
        ) VALUES (
            v_deduct.prod_id,
            'sale',
            -v_deduct.total_deduct_qty,
            v_cur_stock,
            v_new_stock,
            v_order_id,
            'Venta en pedido ' || v_order_number || ' (' || v_deduct.reason_text || ')',
            v_user_id,
            timezone('utc'::text, now())
        );
    END LOOP;

    -- 15. Devolver resultado
    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'status', 'payment_pending',
        'payment_status', 'pending',
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'total', v_total,
        'discount_total', v_total_discounts,
        'promotion_discount', v_best_promo_discount,
        'promotion_code', v_best_promo_code
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(UUID, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, JSONB, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 9. INICIALIZAR MOVIMIENTOS HISTÓRICOS INICIALES (Si stock_movements está vacía)
-- ------------------------------------------------------------------------------
INSERT INTO public.stock_movements (
    product_id,
    movement_type,
    quantity,
    previous_stock,
    new_stock,
    reason,
    created_at
)
SELECT 
    p.id,
    'entry'::public.stock_movement_type,
    p.stock_quantity,
    0,
    p.stock_quantity,
    'Inventario inicial del catálogo de YA Delivery',
    p.created_at
FROM public.products p
WHERE NOT EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id)
  AND p.stock_quantity > 0;
