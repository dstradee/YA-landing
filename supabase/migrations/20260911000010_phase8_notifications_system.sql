-- ==============================================================================
-- YA DELIVERY - MIGRACIÓN FASE 8: SISTEMA DE NOTIFICACIONES
-- Archivo: supabase/migrations/20260911000010_phase8_notifications_system.sql
-- ==============================================================================
-- 1. Enums: notification_type y notification_channel
-- 2. Tabla: public.notifications (Con clave de idempotencia única)
-- 3. Tabla: public.notification_preferences (Preferencias de usuario con avisos críticos blindados)
-- 4. Función de creación segura e idempotente: public.create_system_notification
-- 5. Triggers automáticos en orders, incidents y sourcing_items
-- 6. RPCs seguras de cliente:
--    - user_fetch_notifications
--    - user_mark_notification_read
--    - user_mark_all_notifications_read
--    - user_get_notification_preferences
--    - user_update_notification_preferences
-- 7. Políticas de Seguridad RLS estrictas
-- 8. Configuración de Supabase Realtime (public.notifications y public.orders)
-- ==============================================================================

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE public.notification_type AS ENUM (
        'order_received',
        'payment_confirmed',
        'order_preparing',
        'order_sourcing',
        'order_prepared',
        'order_delivering',
        'order_delivered',
        'order_cancelled',
        'courier_order_available',
        'courier_order_assigned',
        'courier_incident_alert',
        'order_incident',
        'admin_new_order',
        'admin_critical_incident',
        'admin_sourcing_needed',
        'promotion',
        'system_alert'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.notification_channel AS ENUM (
        'in_app',
        'email',
        'push',
        'sms',
        'whatsapp'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABLA: PUBLIC.NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    incident_id UUID REFERENCES public.incidents(id) ON DELETE SET NULL,
    type public.notification_type NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    channel public.notification_channel NOT NULL DEFAULT 'in_app',
    read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    is_test BOOLEAN NOT NULL DEFAULT false,
    idempotency_key TEXT NOT NULL UNIQUE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_order_id ON public.notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_idempotency_key ON public.notifications(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_notifications_is_test ON public.notifications(is_test);

-- 3. TABLA: PUBLIC.NOTIFICATION_PREFERENCES
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    order_updates BOOLEAN NOT NULL DEFAULT true,
    important_alerts BOOLEAN NOT NULL DEFAULT true, -- Aviso crítico operativo: NUNCA desactivable
    promotions BOOLEAN NOT NULL DEFAULT true,
    email_enabled BOOLEAN NOT NULL DEFAULT false,
    push_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. FUNCIÓN INTERNA DE CREACIÓN SEGURA E IDEMPOTENTE
CREATE OR REPLACE FUNCTION public.create_system_notification(
    p_user_id UUID,
    p_type public.notification_type,
    p_title TEXT,
    p_message TEXT,
    p_idempotency_key TEXT,
    p_order_id UUID DEFAULT NULL,
    p_incident_id UUID DEFAULT NULL,
    p_link TEXT DEFAULT NULL,
    p_is_test BOOLEAN DEFAULT false,
    p_data JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pref RECORD;
    v_notification_id UUID;
    v_is_critical BOOLEAN;
BEGIN
    IF p_user_id IS NULL OR p_idempotency_key IS NULL THEN
        RETURN NULL;
    END IF;

    -- Determinar si la notificación es crítica (no desactivable por el usuario)
    v_is_critical := p_type IN (
        'order_cancelled',
        'order_incident',
        'admin_critical_incident',
        'courier_incident_alert',
        'system_alert'
    );

    -- Consultar preferencias del usuario si no es de naturaleza crítica
    IF NOT v_is_critical THEN
        SELECT * INTO v_pref FROM public.notification_preferences WHERE user_id = p_user_id;
        IF FOUND THEN
            -- Si es tipo promoción y tiene promociones desactivadas, omitir
            IF p_type = 'promotion' AND NOT COALESCE(v_pref.promotions, true) THEN
                RETURN NULL;
            END IF;
            -- Si es actualización de pedido y tiene order_updates desactivado, omitir
            IF p_type IN ('order_received', 'payment_confirmed', 'order_preparing', 'order_sourcing', 'order_prepared', 'order_delivering', 'order_delivered')
               AND NOT COALESCE(v_pref.order_updates, true) THEN
                RETURN NULL;
            END IF;
        END IF;
    END IF;

    -- Inserción idempotente protegida con ON CONFLICT DO NOTHING
    INSERT INTO public.notifications (
        user_id,
        order_id,
        incident_id,
        type,
        title,
        message,
        link,
        channel,
        read,
        is_test,
        idempotency_key,
        data,
        created_at
    ) VALUES (
        p_user_id,
        p_order_id,
        p_incident_id,
        p_type,
        p_title,
        p_message,
        p_link,
        'in_app',
        false,
        p_is_test,
        p_idempotency_key,
        COALESCE(p_data, '{}'::jsonb),
        timezone('utc'::text, now())
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
END;
$$;

-- 5. TRIGGERS AUTOMÁTICOS EN PUBLIC.ORDERS
CREATE OR REPLACE FUNCTION public.trg_order_notifications_handler()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin RECORD;
    v_courier RECORD;
    v_is_status_changed BOOLEAN;
    v_is_courier_assigned BOOLEAN;
    v_order_is_test BOOLEAN;
BEGIN
    v_order_is_test := COALESCE(NEW.is_test, false);

    -- 1. DETECTAR SI ES INSERT DE UN PEDIDO RECIBIDO DIRECTAMENTE
    IF TG_OP = 'INSERT' THEN
        -- Si el pedido nace en estado 'received' (ej: prueba gratuita o pago directo)
        IF NEW.status = 'received' THEN
            -- Notificar al cliente
            IF NEW.user_id IS NOT NULL THEN
                PERFORM public.create_system_notification(
                    p_user_id => NEW.user_id,
                    p_type => 'order_received',
                    p_title => format('Hemos recibido tu pedido · #%s', NEW.order_number),
                    p_message => 'Tu pedido ha sido recibido correctamente. En breve empezaremos a prepararlo.',
                    p_idempotency_key => format('order:%s:status:received:%s', NEW.id, NEW.user_id),
                    p_order_id => NEW.id,
                    p_link => format('/app/pedido/%s', NEW.id),
                    p_is_test => v_order_is_test,
                    p_data => jsonb_build_object('order_number', NEW.order_number, 'status', NEW.status)
                );
            END IF;

            -- Notificar a administradores autorizados
            FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' LOOP
                PERFORM public.create_system_notification(
                    p_user_id => v_admin.id,
                    p_type => 'admin_new_order',
                    p_title => format('Nuevo pedido · #%s', NEW.order_number),
                    p_message => format('Se ha recibido un nuevo pedido (#%s) por un total de %s €.', NEW.order_number, NEW.total),
                    p_idempotency_key => format('order:%s:admin_new_order:%s', NEW.id, v_admin.id),
                    p_order_id => NEW.id,
                    p_link => format('/admin/pedidos/%s', NEW.id),
                    p_is_test => v_order_is_test,
                    p_data => jsonb_build_object('order_number', NEW.order_number, 'total', NEW.total)
                );
            END LOOP;
        END IF;

        RETURN NEW;
    END IF;

    -- 2. DETECTAR ACTUALIZACIONES EN PUBLIC.ORDERS
    IF TG_OP = 'UPDATE' THEN
        v_is_status_changed := (OLD.status IS DISTINCT FROM NEW.status);
        v_is_courier_assigned := (OLD.courier_id IS DISTINCT FROM NEW.courier_id AND NEW.courier_id IS NOT NULL);

        -- A. Asignación de repartidor
        IF v_is_courier_assigned THEN
            SELECT c.id, c.profile_id INTO v_courier
            FROM public.couriers c
            WHERE c.id = NEW.courier_id;

            IF v_courier.profile_id IS NOT NULL THEN
                -- Notificar al repartidor
                PERFORM public.create_system_notification(
                    p_user_id => v_courier.profile_id,
                    p_type => 'courier_order_assigned',
                    p_title => format('Pedido asignado · #%s', NEW.order_number),
                    p_message => format('Se te ha asignado el pedido #%s para entrega en Jerez.', NEW.order_number),
                    p_idempotency_key => format('order:%s:courier_assigned:%s', NEW.id, v_courier.profile_id),
                    p_order_id => NEW.id,
                    p_link => format('/courier/orders/%s', NEW.id),
                    p_is_test => v_order_is_test,
                    p_data => jsonb_build_object('order_number', NEW.order_number)
                );

                -- Notificar al cliente que ya tiene repartidor
                IF NEW.user_id IS NOT NULL THEN
                    PERFORM public.create_system_notification(
                        p_user_id => NEW.user_id,
                        p_type => 'order_preparing',
                        p_title => format('Repartidor asignado · #%s', NEW.order_number),
                        p_message => 'Un repartidor YA ha sido asignado a tu pedido.',
                        p_idempotency_key => format('order:%s:courier_assigned_client:%s', NEW.id, NEW.user_id),
                        p_order_id => NEW.id,
                        p_link => format('/app/pedido/%s', NEW.id),
                        p_is_test => v_order_is_test,
                        p_data => jsonb_build_object('order_number', NEW.order_number)
                    );
                END IF;
            END IF;
        END IF;

        -- B. Transición de estado del pedido
        IF v_is_status_changed THEN
            CASE NEW.status
                WHEN 'received' THEN
                    -- Si venía de payment_pending y se confirmó el pago por el servidor
                    IF OLD.status = 'payment_pending' AND NEW.payment_status = 'paid' THEN
                        IF NEW.user_id IS NOT NULL THEN
                            PERFORM public.create_system_notification(
                                p_user_id => NEW.user_id,
                                p_type => 'payment_confirmed',
                                p_title => format('Pago confirmado · #%s', NEW.order_number),
                                p_message => 'Tu pago ha sido confirmado. Hemos recibido tu pedido y comenzaremos su gestión.',
                                p_idempotency_key => format('order:%s:payment_confirmed:%s', NEW.id, NEW.user_id),
                                p_order_id => NEW.id,
                                p_link => format('/app/pedido/%s', NEW.id),
                                p_is_test => v_order_is_test,
                                p_data => jsonb_build_object('order_number', NEW.order_number)
                            );
                        END IF;
                    ELSE
                        IF NEW.user_id IS NOT NULL THEN
                            PERFORM public.create_system_notification(
                                p_user_id => NEW.user_id,
                                p_type => 'order_received',
                                p_title => format('Hemos recibido tu pedido · #%s', NEW.order_number),
                                p_message => 'Tu pedido ha sido recibido correctamente.',
                                p_idempotency_key => format('order:%s:status:received:%s', NEW.id, NEW.user_id),
                                p_order_id => NEW.id,
                                p_link => format('/app/pedido/%s', NEW.id),
                                p_is_test => v_order_is_test,
                                p_data => jsonb_build_object('order_number', NEW.order_number)
                            );
                        END IF;
                    END IF;

                    -- Notificar a administradores
                    FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' LOOP
                        PERFORM public.create_system_notification(
                            p_user_id => v_admin.id,
                            p_type => 'admin_new_order',
                            p_title => format('Nuevo pedido · #%s', NEW.order_number),
                            p_message => format('Se ha recibido el pedido #%s por un importe de %s €.', NEW.order_number, NEW.total),
                            p_idempotency_key => format('order:%s:admin_new_order:%s', NEW.id, v_admin.id),
                            p_order_id => NEW.id,
                            p_link => format('/admin/pedidos/%s', NEW.id),
                            p_is_test => v_order_is_test,
                            p_data => jsonb_build_object('order_number', NEW.order_number, 'total', NEW.total)
                        );
                    END LOOP;

                WHEN 'preparing' THEN
                    IF NEW.user_id IS NOT NULL THEN
                        PERFORM public.create_system_notification(
                            p_user_id => NEW.user_id,
                            p_type => 'order_preparing',
                            p_title => format('Estamos preparando tu pedido · #%s', NEW.order_number),
                            p_message => 'Estamos preparando los artículos de tu entrega.',
                            p_idempotency_key => format('order:%s:status:preparing:%s', NEW.id, NEW.user_id),
                            p_order_id => NEW.id,
                            p_link => format('/app/pedido/%s', NEW.id),
                            p_is_test => v_order_is_test,
                            p_data => jsonb_build_object('order_number', NEW.order_number)
                        );
                    END IF;

                    -- Si no tiene courier asignado, avisar a repartidores disponibles
                    IF NEW.courier_id IS NULL THEN
                        FOR v_courier IN SELECT profile_id FROM public.couriers WHERE active = true AND available = true LOOP
                            PERFORM public.create_system_notification(
                                p_user_id => v_courier.profile_id,
                                p_type => 'courier_order_available',
                                p_title => format('Nuevo pedido disponible · #%s', NEW.order_number),
                                p_message => 'Hay un pedido disponible para entrega en Jerez.',
                                p_idempotency_key => format('order:%s:courier_avail:%s', NEW.id, v_courier.profile_id),
                                p_order_id => NEW.id,
                                p_link => '/courier/available',
                                p_is_test => v_order_is_test,
                                p_data => jsonb_build_object('order_number', NEW.order_number)
                            );
                        END LOOP;
                    END IF;

                WHEN 'sourcing' THEN
                    -- AVISO DE SOURCING AL CLIENTE: ESTRICTAMENTE SIN DATOS INTERNOS, PROVEEDORES NI COSTES
                    IF NEW.user_id IS NOT NULL THEN
                        PERFORM public.create_system_notification(
                            p_user_id => NEW.user_id,
                            p_type => 'order_sourcing',
                            p_title => format('Consiguiendo tus productos · #%s', NEW.order_number),
                            p_message => 'Estamos consiguiendo un producto de tu pedido para entregártelo cuanto antes.',
                            p_idempotency_key => format('order:%s:status:sourcing:%s', NEW.id, NEW.user_id),
                            p_order_id => NEW.id,
                            p_link => format('/app/pedido/%s', NEW.id),
                            p_is_test => v_order_is_test,
                            p_data => jsonb_build_object('order_number', NEW.order_number)
                        );
                    END IF;

                WHEN 'prepared' THEN
                    IF NEW.user_id IS NOT NULL THEN
                        PERFORM public.create_system_notification(
                            p_user_id => NEW.user_id,
                            p_type => 'order_prepared',
                            p_title => format('Tu pedido está listo · #%s', NEW.order_number),
                            p_message => 'Tu pedido ya está preparado y listo para salir.',
                            p_idempotency_key => format('order:%s:status:prepared:%s', NEW.id, NEW.user_id),
                            p_order_id => NEW.id,
                            p_link => format('/app/pedido/%s', NEW.id),
                            p_is_test => v_order_is_test,
                            p_data => jsonb_build_object('order_number', NEW.order_number)
                        );
                    END IF;

                WHEN 'delivering' THEN
                    IF NEW.user_id IS NOT NULL THEN
                        PERFORM public.create_system_notification(
                            p_user_id => NEW.user_id,
                            p_type => 'order_delivering',
                            p_title => format('Tu pedido está en camino · #%s', NEW.order_number),
                            p_message => 'El repartidor YA está de camino con tu entrega.',
                            p_idempotency_key => format('order:%s:status:delivering:%s', NEW.id, NEW.user_id),
                            p_order_id => NEW.id,
                            p_link => format('/app/pedido/%s', NEW.id),
                            p_is_test => v_order_is_test,
                            p_data => jsonb_build_object('order_number', NEW.order_number)
                        );
                    END IF;

                WHEN 'delivered' THEN
                    IF NEW.user_id IS NOT NULL THEN
                        PERFORM public.create_system_notification(
                            p_user_id => NEW.user_id,
                            p_type => 'order_delivered',
                            p_title => format('¡Pedido entregado! · #%s', NEW.order_number),
                            p_message => 'Tu pedido ha sido entregado. ¡Gracias por confiar en YA!',
                            p_idempotency_key => format('order:%s:status:delivered:%s', NEW.id, NEW.user_id),
                            p_order_id => NEW.id,
                            p_link => format('/app/pedido/%s', NEW.id),
                            p_is_test => v_order_is_test,
                            p_data => jsonb_build_object('order_number', NEW.order_number)
                        );
                    END IF;

                    -- Notificar al repartidor que completó la entrega
                    IF NEW.courier_id IS NOT NULL THEN
                        SELECT profile_id INTO v_courier FROM public.couriers WHERE id = NEW.courier_id;
                        IF v_courier.profile_id IS NOT NULL THEN
                            PERFORM public.create_system_notification(
                                p_user_id => v_courier.profile_id,
                                p_type => 'order_delivered',
                                p_title => format('Entrega finalizada · #%s', NEW.order_number),
                                p_message => format('Has completado la entrega del pedido #%s.', NEW.order_number),
                                p_idempotency_key => format('order:%s:delivered_courier:%s', NEW.id, v_courier.profile_id),
                                p_order_id => NEW.id,
                                p_link => format('/courier/orders/%s', NEW.id),
                                p_is_test => v_order_is_test,
                                p_data => jsonb_build_object('order_number', NEW.order_number)
                            );
                        END IF;
                    END IF;

                WHEN 'cancelled' THEN
                    -- Notificación crítica de cancelación al cliente (no desactivable)
                    IF NEW.user_id IS NOT NULL THEN
                        PERFORM public.create_system_notification(
                            p_user_id => NEW.user_id,
                            p_type => 'order_cancelled',
                            p_title => format('Pedido cancelado · #%s', NEW.order_number),
                            p_message => format('Tu pedido #%s ha sido cancelado.', NEW.order_number),
                            p_idempotency_key => format('order:%s:status:cancelled:%s', NEW.id, NEW.user_id),
                            p_order_id => NEW.id,
                            p_link => format('/app/pedido/%s', NEW.id),
                            p_is_test => v_order_is_test,
                            p_data => jsonb_build_object('order_number', NEW.order_number)
                        );
                    END IF;

                    -- Si había repartidor asignado, notificarle la cancelación
                    IF NEW.courier_id IS NOT NULL THEN
                        SELECT profile_id INTO v_courier FROM public.couriers WHERE id = NEW.courier_id;
                        IF v_courier.profile_id IS NOT NULL THEN
                            PERFORM public.create_system_notification(
                                p_user_id => v_courier.profile_id,
                                p_type => 'order_cancelled',
                                p_title => format('Pedido cancelado · #%s', NEW.order_number),
                                p_message => format('El pedido #%s que tenías asignado ha sido cancelado.', NEW.order_number),
                                p_idempotency_key => format('order:%s:cancelled_courier:%s', NEW.id, v_courier.profile_id),
                                p_order_id => NEW.id,
                                p_link => '/courier',
                                p_is_test => v_order_is_test,
                                p_data => jsonb_build_object('order_number', NEW.order_number)
                            );
                        END IF;
                    END IF;

                ELSE
                    NULL;
            END CASE;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_notifications ON public.orders;
CREATE TRIGGER trg_order_notifications
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_order_notifications_handler();

-- 6. TRIGGERS AUTOMÁTICOS EN PUBLIC.INCIDENTS (FASE 7)
CREATE OR REPLACE FUNCTION public.trg_incident_notifications_handler()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_admin RECORD;
    v_courier RECORD;
    v_is_test BOOLEAN;
BEGIN
    v_is_test := COALESCE(NEW.is_test, false);

    SELECT id, order_number, user_id, courier_id INTO v_order
    FROM public.orders
    WHERE id = NEW.order_id;

    IF TG_OP = 'INSERT' THEN
        -- 1. Si la incidencia la abrió courier o admin, avisar al cliente (sin exponer datos internos ni notas)
        IF NEW.origin IN ('courier', 'admin') AND v_order.user_id IS NOT NULL THEN
            PERFORM public.create_system_notification(
                p_user_id => v_order.user_id,
                p_type => 'order_incident',
                p_title => format('Incidencia en tu pedido · #%s', v_order.order_number),
                p_message => 'Se ha detectado una incidencia con tu pedido. Nuestro equipo está gestionándola para resolverla cuanto antes.',
                p_idempotency_key => format('incident:%s:created_client:%s', NEW.id, v_order.user_id),
                p_order_id => v_order.id,
                p_incident_id => NEW.id,
                p_link => format('/app/pedido/%s', v_order.id),
                p_is_test => v_is_test,
                p_data => jsonb_build_object('order_number', v_order.order_number, 'incident_number', NEW.incident_number)
            );
        END IF;

        -- 2. Si es severidad crítica o alta, avisar a todos los administradores
        IF NEW.severity IN ('critical', 'high') THEN
            FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' LOOP
                PERFORM public.create_system_notification(
                    p_user_id => v_admin.id,
                    p_type => 'admin_critical_incident',
                    p_title => format('Alerta: Incidencia %s · %s', UPPER(NEW.severity::text), NEW.incident_number),
                    p_message => format('Incidencia %s en pedido #%s: %s', NEW.severity, v_order.order_number, NEW.title),
                    p_idempotency_key => format('incident:%s:admin_alert:%s', NEW.id, v_admin.id),
                    p_order_id => v_order.id,
                    p_incident_id => NEW.id,
                    p_link => '/admin/incidencias',
                    p_is_test => v_is_test,
                    p_data => jsonb_build_object('order_number', v_order.order_number, 'severity', NEW.severity)
                );
            END LOOP;
        END IF;

        -- 3. Si el pedido tiene courier asignado y el incidente no lo reportó él mismo, notificarle
        IF v_order.courier_id IS NOT NULL AND NEW.origin <> 'courier' THEN
            SELECT profile_id INTO v_courier FROM public.couriers WHERE id = v_order.courier_id;
            IF v_courier.profile_id IS NOT NULL THEN
                PERFORM public.create_system_notification(
                    p_user_id => v_courier.profile_id,
                    p_type => 'courier_incident_alert',
                    p_title => format('Incidencia en pedido asignado · #%s', v_order.order_number),
                    p_message => format('Se ha registrado una incidencia en tu pedido #%s: %s.', v_order.order_number, NEW.title),
                    p_idempotency_key => format('incident:%s:courier_alert:%s', NEW.id, v_courier.profile_id),
                    p_order_id => v_order.id,
                    p_incident_id => NEW.id,
                    p_link => format('/courier/orders/%s', v_order.id),
                    p_is_test => v_is_test,
                    p_data => jsonb_build_object('order_number', v_order.order_number)
                );
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Cuando la incidencia pasa a resolved
        IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'resolved' THEN
            -- Avisar al cliente
            IF v_order.user_id IS NOT NULL THEN
                PERFORM public.create_system_notification(
                    p_user_id => v_order.user_id,
                    p_type => 'order_incident',
                    p_title => format('Incidencia resuelta · #%s', v_order.order_number),
                    p_message => format('La incidencia con tu pedido #%s ha sido resuelta.', v_order.order_number),
                    p_idempotency_key => format('incident:%s:resolved_client:%s', NEW.id, v_order.user_id),
                    p_order_id => v_order.id,
                    p_incident_id => NEW.id,
                    p_link => format('/app/pedido/%s', v_order.id),
                    p_is_test => v_is_test,
                    p_data => jsonb_build_object('order_number', v_order.order_number)
                );
            END IF;

            -- Avisar al repartidor si lo tiene
            IF v_order.courier_id IS NOT NULL THEN
                SELECT profile_id INTO v_courier FROM public.couriers WHERE id = v_order.courier_id;
                IF v_courier.profile_id IS NOT NULL THEN
                    PERFORM public.create_system_notification(
                        p_user_id => v_courier.profile_id,
                        p_type => 'courier_incident_alert',
                        p_title => format('Incidencia resuelta · #%s', v_order.order_number),
                        p_message => format('La incidencia en el pedido asignado #%s ha sido resuelta.', v_order.order_number),
                        p_idempotency_key => format('incident:%s:resolved_courier:%s', NEW.id, v_courier.profile_id),
                        p_order_id => v_order.id,
                        p_incident_id => NEW.id,
                        p_link => format('/courier/orders/%s', v_order.id),
                        p_is_test => v_is_test,
                        p_data => jsonb_build_object('order_number', v_order.order_number)
                    );
                END IF;
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incident_notifications ON public.incidents;
CREATE TRIGGER trg_incident_notifications
AFTER INSERT OR UPDATE ON public.incidents
FOR EACH ROW
EXECUTE FUNCTION public.trg_incident_notifications_handler();

-- 7. TRIGGERS AUTOMÁTICOS EN PUBLIC.SOURCING_ITEMS (FASE 6)
CREATE OR REPLACE FUNCTION public.trg_sourcing_notifications_handler()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_admin RECORD;
    v_is_test BOOLEAN;
BEGIN
    v_is_test := COALESCE(NEW.is_test, false);

    SELECT id, order_number, user_id INTO v_order
    FROM public.orders
    WHERE id = NEW.order_id;

    -- Si el artículo pasa a 'failed', alertar operativamente a los administradores
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'failed' THEN
        FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' LOOP
            PERFORM public.create_system_notification(
                p_user_id => v_admin.id,
                p_type => 'admin_sourcing_needed',
                p_title => format('Abastecimiento fallido · Pedido #%s', v_order.order_number),
                p_message => format('No se pudo abastecer un producto para el pedido #%s. Requiere atención en panel.', v_order.order_number),
                p_idempotency_key => format('sourcing:%s:failed_admin:%s', NEW.id, v_admin.id),
                p_order_id => v_order.id,
                p_link => '/admin/abastecimiento',
                p_is_test => v_is_test,
                p_data => jsonb_build_object('order_number', v_order.order_number, 'sourcing_item_id', NEW.id)
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sourcing_notifications ON public.sourcing_items;
CREATE TRIGGER trg_sourcing_notifications
AFTER UPDATE ON public.sourcing_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_sourcing_notifications_handler();

-- 8. RPCS SEGURAS PARA CONSUMO DEL CLIENTE / REPARTIDOR / ADMIN
-- A. Obtener notificaciones paginadas del usuario actual con contador de no leídas
CREATE OR REPLACE FUNCTION public.user_fetch_notifications(
    p_limit INT DEFAULT 30,
    p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_unread_count INT;
    v_total_count INT;
    v_notifications JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    -- Conteo no leídas
    SELECT COUNT(*) INTO v_unread_count
    FROM public.notifications
    WHERE user_id = v_user_id AND read = false;

    -- Conteo total
    SELECT COUNT(*) INTO v_total_count
    FROM public.notifications
    WHERE user_id = v_user_id;

    -- Listado paginado
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', n.id,
                'type', n.type,
                'title', n.title,
                'message', n.message,
                'link', n.link,
                'channel', n.channel,
                'read', n.read,
                'read_at', n.read_at,
                'is_test', n.is_test,
                'order_id', n.order_id,
                'incident_id', n.incident_id,
                'data', n.data,
                'created_at', n.created_at
            ) ORDER BY n.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_notifications
    FROM (
        SELECT *
        FROM public.notifications
        WHERE user_id = v_user_id
        ORDER BY created_at DESC
        LIMIT LEAST(GREATEST(p_limit, 1), 100)
        OFFSET GREATEST(p_offset, 0)
    ) n;

    RETURN jsonb_build_object(
        'success', true,
        'notifications', v_notifications,
        'unread_count', v_unread_count,
        'total_count', v_total_count
    );
END;
$$;

-- B. Marcar una notificación como leída
CREATE OR REPLACE FUNCTION public.user_mark_notification_read(
    p_notification_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_updated_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    UPDATE public.notifications
    SET read = true,
        read_at = timezone('utc'::text, now())
    WHERE id = p_notification_id
      AND user_id = v_user_id
    RETURNING id INTO v_updated_id;

    IF v_updated_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Notificación no encontrada o no pertenece al usuario autenticado.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'notification_id', v_updated_id
    );
END;
$$;

-- C. Marcar todas las notificaciones como leídas
CREATE OR REPLACE FUNCTION public.user_mark_all_notifications_read()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_count INT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    WITH updated AS (
        UPDATE public.notifications
        SET read = true,
            read_at = timezone('utc'::text, now())
        WHERE user_id = v_user_id
          AND read = false
        RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM updated;

    RETURN jsonb_build_object(
        'success', true,
        'updated_count', v_count
    );
END;
$$;

-- D. Obtener preferencias de notificación
CREATE OR REPLACE FUNCTION public.user_get_notification_preferences()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_pref RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    SELECT * INTO v_pref FROM public.notification_preferences WHERE user_id = v_user_id;

    IF NOT FOUND THEN
        INSERT INTO public.notification_preferences (user_id)
        VALUES (v_user_id)
        RETURNING * INTO v_pref;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'preferences', jsonb_build_object(
            'order_updates', v_pref.order_updates,
            'important_alerts', true, -- Siempre protegido
            'promotions', v_pref.promotions,
            'email_enabled', v_pref.email_enabled,
            'push_enabled', v_pref.push_enabled,
            'updated_at', v_pref.updated_at
        )
    );
END;
$$;

-- E. Actualizar preferencias de notificación del usuario
CREATE OR REPLACE FUNCTION public.user_update_notification_preferences(
    p_order_updates BOOLEAN DEFAULT true,
    p_promotions BOOLEAN DEFAULT true,
    p_email_enabled BOOLEAN DEFAULT false,
    p_push_enabled BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_pref RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    INSERT INTO public.notification_preferences (
        user_id,
        order_updates,
        important_alerts,
        promotions,
        email_enabled,
        push_enabled,
        updated_at
    ) VALUES (
        v_user_id,
        COALESCE(p_order_updates, true),
        true,
        COALESCE(p_promotions, true),
        COALESCE(p_email_enabled, false),
        COALESCE(p_push_enabled, false),
        timezone('utc'::text, now())
    )
    ON CONFLICT (user_id) DO UPDATE
    SET order_updates = COALESCE(p_order_updates, notification_preferences.order_updates),
        important_alerts = true, -- Garantiza que avisos críticos NUNCA se silencien
        promotions = COALESCE(p_promotions, notification_preferences.promotions),
        email_enabled = COALESCE(p_email_enabled, notification_preferences.email_enabled),
        push_enabled = COALESCE(p_push_enabled, notification_preferences.push_enabled),
        updated_at = timezone('utc'::text, now())
    RETURNING * INTO v_pref;

    RETURN jsonb_build_object(
        'success', true,
        'preferences', jsonb_build_object(
            'order_updates', v_pref.order_updates,
            'important_alerts', true,
            'promotions', v_pref.promotions,
            'email_enabled', v_pref.email_enabled,
            'push_enabled', v_pref.push_enabled,
            'updated_at', v_pref.updated_at
        )
    );
END;
$$;

-- 9. PERMISOS ROW LEVEL SECURITY (RLS)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Notifications RLS
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can insert notifications" ON public.notifications;
CREATE POLICY "Admins can insert notifications"
    ON public.notifications FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin() OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
    ON public.notifications FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

-- Preferences RLS
DROP POLICY IF EXISTS "Users can manage own preferences" ON public.notification_preferences;
CREATE POLICY "Users can manage own preferences"
    ON public.notification_preferences FOR ALL
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- Permisos de ejecución en RPCs
REVOKE ALL ON FUNCTION public.user_fetch_notifications(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_fetch_notifications(INT, INT) TO authenticated;

REVOKE ALL ON FUNCTION public.user_mark_notification_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_mark_notification_read(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.user_mark_all_notifications_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_mark_all_notifications_read() TO authenticated;

REVOKE ALL ON FUNCTION public.user_get_notification_preferences() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_get_notification_preferences() TO authenticated;

REVOKE ALL ON FUNCTION public.user_update_notification_preferences(BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_update_notification_preferences(BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- 10. CONFIGURACIÓN DE SUPABASE REALTIME
-- Habilitar réplica completa para soporte fiable de sockets
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- Agregar a publicación supabase_realtime de forma segura e idempotente
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
