-- ==============================================================================
-- YA DELIVERY - FASE 7: INCIDENTS / INCIDENCIAS
-- Archivo: supabase/migrations/20260911000009_phase7_incidents_system.sql
-- ==============================================================================
-- Arquitectura Operativa de Incidencias:
-- 1. ENUMs: incident_type, incident_severity, incident_status, incident_origin
-- 2. Secuencia incident_number_seq para códigos legibles (INC-1001, INC-1002, ...)
-- 3. Tabla principal public.incidents (vinculada a orders y opcionalmente a order_items)
--    - Protege notas internas (sensible admin-only)
--    - Permite asignación de repartidor, origen, revisión de reembolso (Fase 12)
--    - Respeta pedidos de prueba (is_test = true)
-- 4. Tabla inmutable append-only public.incident_audit_logs
-- 5. Políticas RLS estrictas (Admin con control total, Courier restringido a sus pedidos sin notas internas)
-- 6. RPCs seguras con bloqueo por fila (FOR UPDATE) para control de concurrencia:
--    - admin_create_incident
--    - admin_update_incident_status (con soporte atómico opcional para merma de stock en Fase 5)
--    - admin_update_incident
--    - admin_fetch_incidents
--    - admin_get_incidents_summary
--    - courier_report_incident (repartidor reporta problemas de entrega sin acceso a notas internas)
--    - courier_fetch_order_incidents
-- 7. Trigger ante cancelación de pedido (registra evento en auditoría de incidencias abiertas)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ENUMS Y TIPOS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_type') THEN
        CREATE TYPE public.incident_type AS ENUM (
            'product_unavailable',  -- Producto no disponible / no encontrado en comercios
            'partial_order',        -- Pedido incompleto / entrega parcial
            'wrong_product',        -- Producto equivocado
            'damaged_product',      -- Producto dañado o roto
            'missing_product',      -- Producto faltante en la bolsa
            'preparation_issue',    -- Incidencia durante la preparación en almacén
            'delivery_issue',       -- Problema durante el transporte o reparto
            'customer_unavailable', -- Cliente no responde / ausente en dirección
            'address_issue',        -- Dirección errónea o inaccesible
            'delay',                -- Retraso operativo significativo
            'returned_order',       -- Pedido devuelto a origen
            'other'                 -- Otra incidencia no clasificada
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_severity') THEN
        CREATE TYPE public.incident_severity AS ENUM (
            'low',       -- Baja (informativa, sin impacto crítico en entrega)
            'medium',    -- Media (requiere atención pero no detiene el pedido)
            'high',      -- Alta (afecta significativamente al cliente o producto)
            'critical'   -- Crítica (bloquea la entrega o requiere intervención inmediata)
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_status') THEN
        CREATE TYPE public.incident_status AS ENUM (
            'open',           -- Incidencia reportada y pendiente de gestión
            'investigating',  -- En investigación / gestión activa con cliente o repartidor
            'resolved',       -- Resuelta satisfactoriamente
            'cancelled'       -- Cancelada / descartada (falsa alarma o resuelta por otro canal)
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_origin') THEN
        CREATE TYPE public.incident_origin AS ENUM (
            'admin',    -- Creada por un administrador desde el panel
            'courier',  -- Reportada por el repartidor asignado en ruta
            'system'    -- Generada automáticamente por el sistema
        );
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. SECUENCIA PARA NÚMEROS DE INCIDENCIA
-- ------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.incident_number_seq START WITH 1001;
GRANT USAGE, SELECT ON SEQUENCE public.incident_number_seq TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. TABLA PRINCIPAL: public.incidents
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_number TEXT NOT NULL UNIQUE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    type public.incident_type NOT NULL,
    severity public.incident_severity NOT NULL DEFAULT 'medium',
    status public.incident_status NOT NULL DEFAULT 'open',
    title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
    description TEXT NOT NULL CHECK (char_length(trim(description)) > 0),
    internal_notes TEXT,
    origin public.incident_origin NOT NULL DEFAULT 'admin',
    is_test BOOLEAN NOT NULL DEFAULT false,
    requires_refund_review BOOLEAN NOT NULL DEFAULT false,
    courier_id UUID REFERENCES public.couriers(id) ON DELETE SET NULL,
    reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Índices optimizados
CREATE INDEX IF NOT EXISTS idx_incidents_order_id ON public.incidents(order_id);
CREATE INDEX IF NOT EXISTS idx_incidents_order_item_id ON public.incidents(order_item_id);
CREATE INDEX IF NOT EXISTS idx_incidents_product_id ON public.incidents(product_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON public.incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_type ON public.incidents(type);
CREATE INDEX IF NOT EXISTS idx_incidents_courier_id ON public.incidents(courier_id);
CREATE INDEX IF NOT EXISTS idx_incidents_is_test ON public.incidents(is_test);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON public.incidents(created_at DESC);

-- ------------------------------------------------------------------------------
-- 4. TABLA INMUTABLE DE AUDITORÍA: public.incident_audit_logs
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incident_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    previous_status public.incident_status,
    new_status public.incident_status,
    previous_severity public.incident_severity,
    new_severity public.incident_severity,
    notes TEXT,
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_incident_audit_incident_id ON public.incident_audit_logs(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_audit_order_id ON public.incident_audit_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_incident_audit_created_at ON public.incident_audit_logs(created_at DESC);

-- Trigger de inmutabilidad en auditoría: Prohíbe UPDATE y DELETE
CREATE OR REPLACE FUNCTION public.trg_prevent_incident_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'La tabla incident_audit_logs es inmutable (append-only). No se permiten modificaciones ni eliminaciones.';
END;
$$;

DROP TRIGGER IF EXISTS trg_incident_audit_immutable ON public.incident_audit_logs;
CREATE TRIGGER trg_incident_audit_immutable
BEFORE UPDATE OR DELETE ON public.incident_audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.trg_prevent_incident_audit_mutation();

-- ------------------------------------------------------------------------------
-- 5. POLÍTICAS RLS (Row Level Security)
-- ------------------------------------------------------------------------------
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_audit_logs ENABLE ROW LEVEL SECURITY;

-- ADMIN POLICIES
DROP POLICY IF EXISTS "Admins have full access to incidents" ON public.incidents;
CREATE POLICY "Admins have full access to incidents"
    ON public.incidents
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins have read access to incident audit logs" ON public.incident_audit_logs;
CREATE POLICY "Admins have read access to incident audit logs"
    ON public.incident_audit_logs FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated can insert incident audit logs" ON public.incident_audit_logs;
CREATE POLICY "Authenticated can insert incident audit logs"
    ON public.incident_audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

-- COURIER POLICIES (Solo lectura de incidentes en sus pedidos asignados)
DROP POLICY IF EXISTS "Couriers can view incidents for assigned orders" ON public.incidents;
CREATE POLICY "Couriers can view incidents for assigned orders"
    ON public.incidents FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            JOIN public.couriers c ON o.courier_id = c.id
            WHERE o.id = public.incidents.order_id
              AND c.profile_id = auth.uid()
        )
        OR reported_by = auth.uid()
    );

-- CUSTOMER POLICIES (Solo lectura restringida de incidencias de sus propios pedidos)
DROP POLICY IF EXISTS "Customers can view incidents for own orders" ON public.incidents;
CREATE POLICY "Customers can view incidents for own orders"
    ON public.incidents FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = public.incidents.order_id
              AND o.user_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- 6. RPC: admin_create_incident
-- Crea una incidencia de forma atómica con validación, numeración y log de auditoría
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_incident(
    p_order_id UUID,
    p_type public.incident_type,
    p_severity public.incident_severity,
    p_title TEXT,
    p_description TEXT,
    p_order_item_id UUID DEFAULT NULL,
    p_product_id UUID DEFAULT NULL,
    p_internal_notes TEXT DEFAULT NULL,
    p_requires_refund_review BOOLEAN DEFAULT false,
    p_courier_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_incident_number TEXT;
    v_incident_id UUID;
    v_product_id UUID := p_product_id;
    v_new_incident RECORD;
BEGIN
    -- 1. Validar permisos de administrador
    IF NOT COALESCE(public.is_admin(), false) THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren privilegios de administrador.';
    END IF;

    -- 2. Validar que el pedido exista
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pedido con ID % no existe.', p_order_id;
    END IF;

    -- 3. Si se especificó order_item_id pero no product_id, autocompletar product_id
    IF p_order_item_id IS NOT NULL AND v_product_id IS NULL THEN
        SELECT product_id INTO v_product_id FROM public.order_items WHERE id = p_order_item_id;
    END IF;

    -- 4. Generar número de incidencia único
    v_incident_number := 'INC-' || LPAD(nextval('public.incident_number_seq')::TEXT, 4, '0');

    -- 5. Insertar incidencia
    INSERT INTO public.incidents (
        incident_number,
        order_id,
        order_item_id,
        product_id,
        type,
        severity,
        status,
        title,
        description,
        internal_notes,
        origin,
        is_test,
        requires_refund_review,
        courier_id,
        reported_by,
        created_at,
        updated_at
    ) VALUES (
        v_incident_number,
        p_order_id,
        p_order_item_id,
        v_product_id,
        p_type,
        p_severity,
        'open',
        trim(p_title),
        trim(p_description),
        p_internal_notes,
        'admin',
        v_order.is_test,
        p_requires_refund_review,
        COALESCE(p_courier_id, v_order.courier_id),
        auth.uid(),
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
    )
    RETURNING * INTO v_new_incident;

    -- 6. Insertar registro de auditoría
    INSERT INTO public.incident_audit_logs (
        incident_id,
        order_id,
        action,
        new_status,
        new_severity,
        notes,
        changed_by,
        created_at
    ) VALUES (
        v_new_incident.id,
        p_order_id,
        'created',
        'open',
        p_severity,
        'Incidencia creada por administración.',
        auth.uid(),
        timezone('utc'::text, now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'incident', row_to_json(v_new_incident)
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. RPC: admin_update_incident_status
-- Actualiza estado con bloqueo de fila (FOR UPDATE) e integración atómica con inventario (Fase 5)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_incident_status(
    p_incident_id UUID,
    p_status public.incident_status,
    p_resolution_notes TEXT DEFAULT NULL,
    p_internal_notes TEXT DEFAULT NULL,
    p_record_stock_loss BOOLEAN DEFAULT false,
    p_loss_product_id UUID DEFAULT NULL,
    p_loss_quantity INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_incident RECORD;
    v_prev_status public.incident_status;
    v_resolved_at TIMESTAMPTZ;
    v_resolved_by UUID;
    v_prod RECORD;
    v_prev_stock INT;
    v_new_stock INT;
    v_loss_qty INT;
    v_movement_id UUID;
    v_updated_rec RECORD;
BEGIN
    -- 1. Validar autorización de administrador
    IF NOT COALESCE(public.is_admin(), false) THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren privilegios de administrador.';
    END IF;

    -- 2. Bloqueo por fila para evitar carreras concurrentes
    SELECT * INTO v_incident
    FROM public.incidents
    WHERE id = p_incident_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Incidencia no encontrada con ID %', p_incident_id;
    END IF;

    v_prev_status := v_incident.status;

    -- 3. Validar resolución
    IF p_status = 'resolved' THEN
        v_resolved_at := timezone('utc'::text, now());
        v_resolved_by := auth.uid();
    ELSIF v_prev_status = 'resolved' AND p_status != 'resolved' THEN
        -- Reabrir incidencia
        v_resolved_at := NULL;
        v_resolved_by := NULL;
    ELSE
        v_resolved_at := v_incident.resolved_at;
        v_resolved_by := v_incident.resolved_by;
    END IF;

    -- 4. Integración con Inventario (Fase 5): Si se solicita registrar merma física de stock
    IF p_record_stock_loss IS TRUE AND p_loss_quantity IS NOT NULL AND p_loss_quantity > 0 THEN
        IF p_loss_product_id IS NULL THEN
            p_loss_product_id := v_incident.product_id;
        END IF;

        IF p_loss_product_id IS NOT NULL THEN
            v_loss_qty := p_loss_quantity;

            -- Bloqueo atómico del producto
            SELECT id, name, stock_quantity INTO v_prod
            FROM public.products
            WHERE id = p_loss_product_id
            FOR UPDATE;

            IF FOUND THEN
                v_prev_stock := v_prod.stock_quantity;
                v_new_stock := GREATEST(0, v_prev_stock - v_loss_qty);

                -- Descontar stock en products
                UPDATE public.products
                SET
                    stock_quantity = v_new_stock,
                    updated_at = timezone('utc'::text, now())
                WHERE id = p_loss_product_id;

                -- Registrar movimiento oficial en public.stock_movements (Fase 5)
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
                    p_loss_product_id,
                    'loss',
                    -v_loss_qty,
                    v_prev_stock,
                    v_new_stock,
                    v_incident.order_id,
                    'Merma por resolución de incidencia ' || v_incident.incident_number || ': ' || COALESCE(p_resolution_notes, 'Producto dañado/perdido'),
                    auth.uid(),
                    timezone('utc'::text, now())
                )
                RETURNING id INTO v_movement_id;
            END IF;
        END IF;
    END IF;

    -- 5. Actualizar la incidencia
    UPDATE public.incidents
    SET
        status = p_status,
        resolution_notes = COALESCE(p_resolution_notes, resolution_notes),
        internal_notes = COALESCE(p_internal_notes, internal_notes),
        resolved_at = v_resolved_at,
        resolved_by = v_resolved_by,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_incident_id
    RETURNING * INTO v_updated_rec;

    -- 6. Insertar registro de auditoría
    INSERT INTO public.incident_audit_logs (
        incident_id,
        order_id,
        action,
        previous_status,
        new_status,
        notes,
        changed_by,
        created_at
    ) VALUES (
        p_incident_id,
        v_incident.order_id,
        'status_changed',
        v_prev_status,
        p_status,
        COALESCE(p_resolution_notes, 'Cambio de estado a ' || p_status::TEXT),
        auth.uid(),
        timezone('utc'::text, now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'incident', row_to_json(v_updated_rec)
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. RPC: admin_update_incident
-- Modificación de severidad, notas internas y bandera de revisión de reembolso
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_incident(
    p_incident_id UUID,
    p_severity public.incident_severity DEFAULT NULL,
    p_internal_notes TEXT DEFAULT NULL,
    p_requires_refund_review BOOLEAN DEFAULT NULL,
    p_title TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_audit_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_incident RECORD;
    v_prev_severity public.incident_severity;
    v_updated_rec RECORD;
BEGIN
    IF NOT COALESCE(public.is_admin(), false) THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren privilegios de administrador.';
    END IF;

    SELECT * INTO v_incident
    FROM public.incidents
    WHERE id = p_incident_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Incidencia con ID % no encontrada.', p_incident_id;
    END IF;

    v_prev_severity := v_incident.severity;

    UPDATE public.incidents
    SET
        severity = COALESCE(p_severity, severity),
        internal_notes = COALESCE(p_internal_notes, internal_notes),
        requires_refund_review = COALESCE(p_requires_refund_review, requires_refund_review),
        title = COALESCE(p_title, title),
        description = COALESCE(p_description, description),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_incident_id
    RETURNING * INTO v_updated_rec;

    INSERT INTO public.incident_audit_logs (
        incident_id,
        order_id,
        action,
        previous_severity,
        new_severity,
        notes,
        changed_by,
        created_at
    ) VALUES (
        p_incident_id,
        v_incident.order_id,
        'details_updated',
        v_prev_severity,
        v_updated_rec.severity,
        COALESCE(p_audit_note, 'Actualización de detalles de la incidencia.'),
        auth.uid(),
        timezone('utc'::text, now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'incident', row_to_json(v_updated_rec)
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. RPC: courier_report_incident
-- Permite a un repartidor asignado reportar incidencias operativas de forma segura
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.courier_report_incident(
    p_order_id UUID,
    p_type public.incident_type,
    p_title TEXT,
    p_description TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_courier RECORD;
    v_order RECORD;
    v_incident_number TEXT;
    v_severity public.incident_severity := 'medium';
    v_new_incident RECORD;
BEGIN
    -- 1. Validar que el usuario autenticado sea repartidor activo
    SELECT * INTO v_courier
    FROM public.couriers
    WHERE profile_id = auth.uid() AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Acceso denegado: debes ser un repartidor activo para reportar incidencias.';
    END IF;

    -- 2. Validar que el pedido esté asignado a este repartidor
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id AND courier_id = v_courier.id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pedido % no está asignado a tu cuenta de repartidor.', p_order_id;
    END IF;

    -- 3. Tipos permitidos para reporte desde ruta
    IF p_type NOT IN ('delivery_issue', 'customer_unavailable', 'address_issue', 'delay', 'damaged_product', 'other') THEN
        RAISE EXCEPTION 'Tipo de incidencia no permitido para reporte en ruta.';
    END IF;

    -- Ajuste automático de severidad según tipo
    IF p_type IN ('customer_unavailable', 'address_issue', 'damaged_product') THEN
        v_severity := 'high';
    END IF;

    -- 4. Generar número de incidencia
    v_incident_number := 'INC-' || LPAD(nextval('public.incident_number_seq')::TEXT, 4, '0');

    -- 5. Insertar incidencia (internal_notes es estrictamente NULL)
    INSERT INTO public.incidents (
        incident_number,
        order_id,
        type,
        severity,
        status,
        title,
        description,
        internal_notes,
        origin,
        is_test,
        courier_id,
        reported_by,
        created_at,
        updated_at
    ) VALUES (
        v_incident_number,
        p_order_id,
        p_type,
        v_severity,
        'open',
        trim(p_title),
        trim(p_description),
        NULL,
        'courier',
        v_order.is_test,
        v_courier.id,
        auth.uid(),
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
    )
    RETURNING * INTO v_new_incident;

    -- 6. Insertar registro de auditoría
    INSERT INTO public.incident_audit_logs (
        incident_id,
        order_id,
        action,
        new_status,
        new_severity,
        notes,
        changed_by,
        created_at
    ) VALUES (
        v_new_incident.id,
        p_order_id,
        'reported_by_courier',
        'open',
        v_severity,
        'Reportada desde la ruta por repartidor.',
        auth.uid(),
        timezone('utc'::text, now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'incident_number', v_new_incident.incident_number,
        'message', 'Incidencia reportada exitosamente al equipo de operaciones.'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 10. RPC: courier_fetch_order_incidents
-- Permite al repartidor consultar incidencias de su pedido sin exponer internal_notes
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.courier_fetch_order_incidents(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_courier RECORD;
    v_incidents JSONB;
BEGIN
    SELECT * INTO v_courier
    FROM public.couriers
    WHERE profile_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Acceso denegado.';
    END IF;

    -- Verificar asignación
    IF NOT EXISTS (
        SELECT 1 FROM public.orders
        WHERE id = p_order_id AND courier_id = v_courier.id
    ) THEN
        RAISE EXCEPTION 'El pedido no está asignado a tu cuenta.';
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', i.id,
                'incident_number', i.incident_number,
                'order_id', i.order_id,
                'type', i.type,
                'severity', i.severity,
                'status', i.status,
                'title', i.title,
                'description', i.description,
                'origin', i.origin,
                'resolution_notes', i.resolution_notes,
                'resolved_at', i.resolved_at,
                'created_at', i.created_at
            ) ORDER BY i.created_at DESC
        ), '[]'::jsonb
    ) INTO v_incidents
    FROM public.incidents i
    WHERE i.order_id = p_order_id;

    RETURN jsonb_build_object('success', true, 'incidents', v_incidents);
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. RPC: admin_get_incidents_summary
-- Retorna métricas clave para el panel operativo y alertas de dashboard
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_incidents_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_open_count INT := 0;
    v_investigating_count INT := 0;
    v_resolved_today_count INT := 0;
    v_critical_count INT := 0;
    v_affected_orders_count INT := 0;
    v_requires_refund_review_count INT := 0;
BEGIN
    IF NOT COALESCE(public.is_admin(), false) THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    SELECT
        COUNT(*) FILTER (WHERE status = 'open'),
        COUNT(*) FILTER (WHERE status = 'investigating'),
        COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at >= date_trunc('day', timezone('utc'::text, now()))),
        COUNT(*) FILTER (WHERE status IN ('open', 'investigating') AND severity IN ('high', 'critical')),
        COUNT(DISTINCT order_id) FILTER (WHERE status IN ('open', 'investigating')),
        COUNT(*) FILTER (WHERE requires_refund_review = true AND status != 'cancelled')
    INTO
        v_open_count,
        v_investigating_count,
        v_resolved_today_count,
        v_critical_count,
        v_affected_orders_count,
        v_requires_refund_review_count
    FROM public.incidents;

    RETURN jsonb_build_object(
        'success', true,
        'open_count', COALESCE(v_open_count, 0),
        'investigating_count', COALESCE(v_investigating_count, 0),
        'resolved_today_count', COALESCE(v_resolved_today_count, 0),
        'critical_count', COALESCE(v_critical_count, 0),
        'affected_orders_count', COALESCE(v_affected_orders_count, 0),
        'requires_refund_review_count', COALESCE(v_requires_refund_review_count, 0)
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 12. RPC: admin_fetch_incidents
-- Listado enriquecido con filtrado operativo, búsqueda y paginación
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_fetch_incidents(
    p_status TEXT DEFAULT NULL,
    p_severity TEXT DEFAULT NULL,
    p_type TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_order_id UUID DEFAULT NULL,
    p_include_test BOOLEAN DEFAULT true,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_incidents JSONB;
    v_total INT := 0;
BEGIN
    IF NOT COALESCE(public.is_admin(), false) THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    -- Conteo total con filtros
    SELECT COUNT(*) INTO v_total
    FROM public.incidents i
    JOIN public.orders o ON o.id = i.order_id
    LEFT JOIN public.profiles c_prof ON c_prof.id = o.user_id
    WHERE (p_status IS NULL OR p_status = 'all' OR i.status::TEXT = p_status)
      AND (p_severity IS NULL OR p_severity = 'all' OR i.severity::TEXT = p_severity)
      AND (p_type IS NULL OR p_type = 'all' OR i.type::TEXT = p_type)
      AND (p_order_id IS NULL OR i.order_id = p_order_id)
      AND (p_include_test IS TRUE OR i.is_test IS FALSE)
      AND (
          p_search IS NULL OR p_search = '' OR
          i.incident_number ILIKE '%' || p_search || '%' OR
          o.order_number ILIKE '%' || p_search || '%' OR
          i.title ILIKE '%' || p_search || '%' OR
          i.description ILIKE '%' || p_search || '%' OR
          c_prof.full_name ILIKE '%' || p_search || '%'
      );

    -- Obtención de registros enriquecidos
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', i.id,
                'incident_number', i.incident_number,
                'order_id', i.order_id,
                'order_number', o.order_number,
                'order_status', o.status,
                'order_total', o.total,
                'order_is_test', o.is_test,
                'order_created_at', o.created_at,
                'customer_name', COALESCE(c_prof.full_name, 'Cliente'),
                'customer_phone', c_prof.phone,
                'order_item_id', i.order_item_id,
                'product_id', i.product_id,
                'product_name', COALESCE(p.name, oi.product_name),
                'type', i.type,
                'severity', i.severity,
                'status', i.status,
                'title', i.title,
                'description', i.description,
                'internal_notes', i.internal_notes,
                'origin', i.origin,
                'is_test', i.is_test,
                'requires_refund_review', i.requires_refund_review,
                'courier_id', i.courier_id,
                'courier_name', cour_prof.full_name,
                'reported_by', i.reported_by,
                'reported_by_name', rep_prof.full_name,
                'resolved_by', i.resolved_by,
                'resolved_by_name', res_prof.full_name,
                'resolution_notes', i.resolution_notes,
                'resolved_at', i.resolved_at,
                'created_at', i.created_at,
                'updated_at', i.updated_at
            ) ORDER BY i.created_at DESC
        ), '[]'::jsonb
    ) INTO v_incidents
    FROM (
        SELECT i.*
        FROM public.incidents i
        JOIN public.orders o ON o.id = i.order_id
        LEFT JOIN public.profiles c_prof ON c_prof.id = o.user_id
        WHERE (p_status IS NULL OR p_status = 'all' OR i.status::TEXT = p_status)
          AND (p_severity IS NULL OR p_severity = 'all' OR i.severity::TEXT = p_severity)
          AND (p_type IS NULL OR p_type = 'all' OR i.type::TEXT = p_type)
          AND (p_order_id IS NULL OR i.order_id = p_order_id)
          AND (p_include_test IS TRUE OR i.is_test IS FALSE)
          AND (
              p_search IS NULL OR p_search = '' OR
              i.incident_number ILIKE '%' || p_search || '%' OR
              o.order_number ILIKE '%' || p_search || '%' OR
              i.title ILIKE '%' || p_search || '%' OR
              i.description ILIKE '%' || p_search || '%' OR
              c_prof.full_name ILIKE '%' || p_search || '%'
          )
        ORDER BY
            CASE i.severity
                WHEN 'critical' THEN 1
                WHEN 'high' THEN 2
                WHEN 'medium' THEN 3
                WHEN 'low' THEN 4
            END,
            i.created_at DESC
        LIMIT p_limit
        OFFSET p_offset
    ) i
    JOIN public.orders o ON o.id = i.order_id
    LEFT JOIN public.profiles c_prof ON c_prof.id = o.user_id
    LEFT JOIN public.order_items oi ON oi.id = i.order_item_id
    LEFT JOIN public.products p ON p.id = i.product_id
    LEFT JOIN public.couriers cour ON cour.id = i.courier_id
    LEFT JOIN public.profiles cour_prof ON cour_prof.id = cour.profile_id
    LEFT JOIN public.profiles rep_prof ON rep_prof.id = i.reported_by
    LEFT JOIN public.profiles res_prof ON res_prof.id = i.resolved_by;

    RETURN jsonb_build_object(
        'success', true,
        'total', v_total,
        'incidents', v_incidents
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 13. RPC: admin_fetch_incident_audit_logs
-- Obtiene el historial inmutable de cambios de una incidencia
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_fetch_incident_audit_logs(
    p_incident_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_logs JSONB;
BEGIN
    IF NOT COALESCE(public.is_admin(), false) THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', l.id,
                'incident_id', l.incident_id,
                'order_id', l.order_id,
                'action', l.action,
                'previous_status', l.previous_status,
                'new_status', l.new_status,
                'previous_severity', l.previous_severity,
                'new_severity', l.new_severity,
                'notes', l.notes,
                'changed_by', l.changed_by,
                'changed_by_name', p.full_name,
                'created_at', l.created_at
            ) ORDER BY l.created_at DESC
        ), '[]'::jsonb
    ) INTO v_logs
    FROM public.incident_audit_logs l
    LEFT JOIN public.profiles p ON p.id = l.changed_by
    WHERE l.incident_id = p_incident_id;

    RETURN jsonb_build_object('success', true, 'logs', v_logs);
END;
$$;

-- ------------------------------------------------------------------------------
-- 14. TRIGGER ANTE CANCELACIÓN DE PEDIDO
-- Registra evento en la auditoría si un pedido con incidencias abiertas es cancelado
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_order_cancelled_handle_incidents()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled') THEN
        INSERT INTO public.incident_audit_logs (
            incident_id,
            order_id,
            action,
            notes,
            changed_by,
            created_at
        )
        SELECT
            id,
            order_id,
            'order_cancelled',
            'El pedido asociado fue cancelado en el sistema.',
            auth.uid(),
            timezone('utc'::text, now())
        FROM public.incidents
        WHERE order_id = NEW.id AND status IN ('open', 'investigating');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_cancelled_handle_incidents ON public.orders;
CREATE TRIGGER trg_order_cancelled_handle_incidents
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.on_order_cancelled_handle_incidents();

-- ------------------------------------------------------------------------------
-- 15. PERMISOS DE EJECUCIÓN
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_create_incident FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_incident_status FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_incident FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_incidents_summary FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_fetch_incidents FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_fetch_incident_audit_logs FROM PUBLIC;
REVOKE ALL ON FUNCTION public.courier_report_incident FROM PUBLIC;
REVOKE ALL ON FUNCTION public.courier_fetch_order_incidents FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_create_incident TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_incident_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_incident TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_incidents_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_incidents TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_incident_audit_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.courier_report_incident TO authenticated;
GRANT EXECUTE ON FUNCTION public.courier_fetch_order_incidents TO authenticated;
