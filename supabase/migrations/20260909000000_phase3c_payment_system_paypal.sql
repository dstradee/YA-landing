-- ==============================================================================
-- YA DELIVERY - MIGRACIÓN FASE 3C: SISTEMA REAL DE PAGOS (PAYPAL SANDBOX)
-- Archivo: supabase/migrations/20260909000000_phase3c_payment_system_paypal.sql
-- ==============================================================================

-- 1. ACTUALIZAR ENUMS (payment_method_type y payment_status_type)
-- Añadimos 'paypal' a los métodos de pago si aún no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e 
        JOIN pg_type t ON t.oid = e.enumtypid 
        WHERE t.typname = 'payment_method_type' AND e.enumlabel = 'paypal'
    ) THEN
        ALTER TYPE public.payment_method_type ADD VALUE 'paypal';
    END IF;
END $$;

-- Añadimos 'cancelled' a los estados de pago si aún no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e 
        JOIN pg_type t ON t.oid = e.enumtypid 
        WHERE t.typname = 'payment_status_type' AND e.enumlabel = 'cancelled'
    ) THEN
        ALTER TYPE public.payment_status_type ADD VALUE 'cancelled';
    END IF;
END $$;

-- 2. AMPLIAR TABLA public.orders CON CAMPOS DE CONTROL DE PAGO
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT 'paypal',
ADD COLUMN IF NOT EXISTS payment_order_id TEXT,
ADD COLUMN IF NOT EXISTS payment_capture_id TEXT,
ADD COLUMN IF NOT EXISTS payment_reference TEXT,
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_metadata JSONB DEFAULT '{}'::jsonb;

-- Índices de consulta rápida en orders
CREATE INDEX IF NOT EXISTS idx_orders_payment_order_id ON public.orders(payment_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_capture_id ON public.orders(payment_capture_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);

-- 3. CREAR TABLA DEDICADA DE TRANSACCIONES / INTENTOS DE PAGO (public.payments)
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'paypal',
    provider_order_id TEXT NOT NULL,
    provider_capture_id TEXT,
    payment_method TEXT NOT NULL DEFAULT 'paypal',
    status public.payment_status_type NOT NULL DEFAULT 'pending',
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'EUR',
    raw_payload JSONB DEFAULT '{}'::jsonb,
    error_detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Índices en public.payments
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_order_id ON public.payments(provider, provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- 4. POLÍTICAS ROW LEVEL SECURITY (RLS) PARA public.payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Los usuarios autenticados pueden ver sus propios pagos
DROP POLICY IF EXISTS "payments_customer_read" ON public.payments;
CREATE POLICY "payments_customer_read" ON public.payments
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.orders o 
            WHERE o.id = payments.order_id AND o.user_id = auth.uid()
        )
    );

-- Los administradores pueden ver todos los pagos
DROP POLICY IF EXISTS "payments_admin_all" ON public.payments;
CREATE POLICY "payments_admin_all" ON public.payments
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5. RPC ATÓMICA DE CONFIRMACIÓN DE PAGO (public.confirm_order_payment)
-- Esta función es el guardián de backend: verifica importe, evita adulteraciones,
-- garantiza idempotencia y marca el pedido como pagado.
CREATE OR REPLACE FUNCTION public.confirm_order_payment(
    p_order_id UUID,
    p_provider_order_id TEXT,
    p_capture_id TEXT,
    p_amount NUMERIC,
    p_method TEXT DEFAULT 'paypal',
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_payment_id UUID;
    v_method_enum public.payment_method_type;
BEGIN
    -- 1. Buscar pedido
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Pedido no encontrado en YA Delivery.'
        );
    END IF;

    -- 2. Validar importe contra la base de datos (Anti-Tampering)
    -- Permitimos diferencia de centavos mínima por redondeo si fuese necesario, pero debe coincidir
    IF ABS(v_order.total - p_amount) > 0.01 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Discrepancia de importe detectada. Esperado: %s €, Recibido: %s €', v_order.total, p_amount)
        );
    END IF;

    -- 3. Idempotencia: Si ya estaba marcado como paid, devolver éxito sin duplicar
    IF v_order.payment_status = 'paid' THEN
        RETURN jsonb_build_object(
            'success', true,
            'order_id', v_order.id,
            'order_number', v_order.order_number,
            'status', 'paid',
            'already_paid', true,
            'message', 'El pedido ya había sido confirmado previamente.'
        );
    END IF;

    -- 4. Determinar método de pago enum válido
    BEGIN
        v_method_enum := p_method::public.payment_method_type;
    EXCEPTION WHEN OTHERS THEN
        v_method_enum := 'paypal';
    END;

    -- 5. Actualizar registro del pedido en public.orders
    -- Transición atómica de payment_pending -> received y payment_status -> paid
    UPDATE public.orders
    SET status = 'received',
        payment_status = 'paid',
        payment_provider = 'paypal',
        payment_order_id = p_provider_order_id,
        payment_capture_id = p_capture_id,
        payment_reference = COALESCE(p_capture_id, p_provider_order_id),
        payment_method = v_method_enum,
        paid_at = timezone('utc'::text, now()),
        payment_metadata = p_metadata,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id;

    -- 6. Insertar o actualizar registro en public.payments
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
        raw_payload,
        updated_at
    ) VALUES (
        p_order_id,
        v_order.user_id,
        'paypal',
        p_provider_order_id,
        p_capture_id,
        p_method,
        'paid',
        p_amount,
        'EUR',
        p_metadata,
        timezone('utc'::text, now())
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'status', 'paid',
        'paid_at', timezone('utc'::text, now()),
        'capture_id', p_capture_id
    );
END;
$$;

-- 6. RPC DE REGISTRO DE FALLO O CANCELACIÓN DE PAGO (public.fail_order_payment)
CREATE OR REPLACE FUNCTION public.fail_order_payment(
    p_order_id UUID,
    p_provider_order_id TEXT,
    p_reason TEXT,
    p_status TEXT DEFAULT 'failed'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_status_enum public.payment_status_type;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pedido no encontrado.');
    END IF;

    IF v_order.payment_status = 'paid' THEN
        -- No alterar un pedido ya pagado
        RETURN jsonb_build_object('success', false, 'error', 'El pedido ya está confirmado como pagado.');
    END IF;

    IF p_status = 'cancelled' THEN
        v_status_enum := 'cancelled';
    ELSE
        v_status_enum := 'failed';
    END IF;

    -- Actualizar estado de pago en el pedido
    UPDATE public.orders
    SET payment_status = v_status_enum,
        payment_metadata = jsonb_build_object(
            'last_error', p_reason,
            'failed_at', timezone('utc'::text, now())
        ),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id;

    -- Registrar en tabla de pagos
    INSERT INTO public.payments (
        order_id,
        user_id,
        provider,
        provider_order_id,
        payment_method,
        status,
        amount,
        currency,
        error_detail,
        updated_at
    ) VALUES (
        p_order_id,
        v_order.user_id,
        'paypal',
        COALESCE(p_provider_order_id, 'UNKNOWN'),
        'paypal',
        v_status_enum,
        v_order.total,
        'EUR',
        p_reason,
        timezone('utc'::text, now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'payment_status', v_status_enum
    );
END;
$$;
