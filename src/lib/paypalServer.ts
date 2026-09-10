// ==============================================================================
// YA DELIVERY - SERVICIO SERVER-SIDE PAYPAL SANDBOX & LIVE / PRODUCCIÓN (PHASE 3C.3)
// Archivo: src/lib/paypalServer.ts
// ==============================================================================

import { createClient } from '@supabase/supabase-js';

// Determinación del entorno Sandbox vs Live / Producción
const rawMode = (
  process.env.PAYPAL_MODE ||
  process.env.PAYPAL_ENVIRONMENT ||
  'sandbox'
).trim().toLowerCase();

export const isPayPalSandbox = rawMode !== 'live' && rawMode !== 'production';
export const PAYPAL_MODE = isPayPalSandbox ? 'sandbox' : 'live';

export const PAYPAL_BASE_URL = isPayPalSandbox
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

/**
 * Resuelve las credenciales server-side correspondientes al entorno activo
 * Prioriza variables específicas del entorno y admite las genéricas.
 * NUNCA se exponen al cliente ni se envían al frontend.
 */
export function getPayPalCredentials() {
  const clientId =
    (isPayPalSandbox
      ? process.env.PAYPAL_SANDBOX_CLIENT_ID
      : process.env.PAYPAL_LIVE_CLIENT_ID) ||
    process.env.PAYPAL_CLIENT_ID ||
    '';

  const clientSecret =
    (isPayPalSandbox
      ? process.env.PAYPAL_SANDBOX_CLIENT_SECRET
      : process.env.PAYPAL_LIVE_CLIENT_SECRET) ||
    process.env.PAYPAL_CLIENT_SECRET ||
    '';

  const webhookId =
    (isPayPalSandbox
      ? process.env.PAYPAL_SANDBOX_WEBHOOK_ID
      : process.env.PAYPAL_LIVE_WEBHOOK_ID) ||
    process.env.PAYPAL_WEBHOOK_ID ||
    '';

  return { clientId, clientSecret, webhookId };
}

/**
 * Resuelve la URL base canónica de la aplicación YA Delivery
 * sin dependencias accidentales de localhost en entornos productivos
 */
export function getBaseAppUrl(): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/+$/, '')}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/+$/, '')}`;
  }
  return 'https://ya-delivery.es';
}

/**
 * Sanea y valida las URLs de retorno y cancelación para evitar open redirects
 */
export function sanitizeReturnUrl(url: string | undefined, defaultPath: string): string {
  const baseUrl = getBaseAppUrl();
  if (!url) {
    return `${baseUrl}${defaultPath}`;
  }
  try {
    const parsed = new URL(url);
    if (!isPayPalSandbox) {
      const allowedHosts = [
        'ya-delivery.es',
        'www.ya-delivery.es',
        new URL(baseUrl).host,
      ];
      if (process.env.VERCEL_URL) {
        try {
          allowedHosts.push(new URL(`https://${process.env.VERCEL_URL}`).host);
        } catch {
          // ignore
        }
      }
      if (!allowedHosts.includes(parsed.host)) {
        return `${baseUrl}${defaultPath}`;
      }
    }
    return url;
  } catch {
    return `${baseUrl}${defaultPath}`;
  }
}

// Supabase server client:
// Prioridad: SUPABASE_SECRET_KEY -> SUPABASE_SERVICE_ROLE_KEY -> ERROR EXPLÍCITO
// NUNCA utilizar la clave pública (publishable/anon) en operaciones de servidor.
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

export function getSupabaseServerClient() {
  if (!SUPABASE_URL) {
    throw new Error(
      'Configuración crítica de backend incompleta: Falta SUPABASE_URL (o VITE_SUPABASE_URL) en el servidor.'
    );
  }

  if (!SUPABASE_KEY) {
    throw new Error(
      'Configuración crítica de backend incompleta: Se requiere SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY) para operaciones administrativas seguras en el servidor. La clave pública (anon/publishable) no está permitida.'
    );
  }

  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * Verifica que el token de sesión de Supabase corresponda al propietario del pedido
 */
export async function verifyUserOwnsOrder(
  authHeader: string | undefined,
  orderUserId: string | null
): Promise<{ authorized: boolean; userId?: string; error?: string }> {
  if (!orderUserId) {
    return { authorized: false, error: 'El pedido no tiene un usuario propietario asignado.' };
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      authorized: false,
      error: 'Autenticación requerida. Debes enviar el token de sesión en la cabecera Authorization.',
    };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    return { authorized: false, error: 'Sesión de Supabase inválida o expirada.' };
  }

  if (data.user.id !== orderUserId) {
    return { authorized: false, error: 'No tienes autorización para operar sobre este pedido ajeno.' };
  }

  return { authorized: true, userId: data.user.id };
}

// Cache de token OAuth PayPal por entorno
let cachedToken: { mode: string; clientId: string; token: string; expiresAt: number } | null = null;

/**
 * Obtiene el access_token de PayPal mediante OAuth2 Client Credentials
 */
export async function getPayPalAccessToken(): Promise<string> {
  const { clientId, clientSecret } = getPayPalCredentials();

  if (!clientId || !clientSecret) {
    throw new Error(
      `Faltan credenciales de PayPal (${isPayPalSandbox ? 'PAYPAL_CLIENT_ID / PAYPAL_SANDBOX_CLIENT_ID' : 'PAYPAL_CLIENT_ID / PAYPAL_LIVE_CLIENT_ID'}) en las variables de entorno del servidor.`
    );
  }

  const now = Date.now();
  if (
    cachedToken &&
    cachedToken.mode === PAYPAL_MODE &&
    cachedToken.clientId === clientId &&
    cachedToken.expiresAt > now + 60000
  ) {
    return cachedToken.token;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error al autenticar con PayPal ${PAYPAL_MODE} (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    mode: PAYPAL_MODE,
    clientId,
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return data.access_token;
}

export class PayPalGatewayError extends Error {
  public status: number;
  public paypalName: string;
  public paypalMessage: string;
  public debug_id?: string | null;
  public details?: any[];
  public links?: any[];

  constructor(params: {
    status: number;
    name: string;
    message: string;
    debug_id?: string | null;
    details?: any[];
    links?: any[];
    formattedMessage: string;
  }) {
    super(params.formattedMessage);
    this.name = 'PayPalGatewayError';
    this.status = params.status;
    this.paypalName = params.name;
    this.paypalMessage = params.message;
    this.debug_id = params.debug_id || null;
    this.details = params.details || [];
    this.links = params.links || [];
  }
}

export type CreatePayPalOrderParams = {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency?: string;
  paymentMethod?: string;
  returnUrl?: string;
  cancelUrl?: string;
};

export type CreatePayPalOrderResponse = {
  success: boolean;
  paypalOrderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  approveUrl?: string;
  links?: Array<{ href: string; rel: string; method: string }>;
  isSimulated?: boolean;
  error?: string;
};

/**
 * Consulta el estado actual de una orden en PayPal v2 API (para inspección y diagnóstico)
 */
export async function getPayPalOrderDetails(paypalOrderId: string): Promise<{
  id: string;
  status: string;
  intent?: string;
  purchase_units?: any[];
  links?: Array<{ href: string; rel: string; method: string }>;
  raw?: any;
} | null> {
  if (paypalOrderId.startsWith('SANDBOX_ORDER_')) {
    return null;
  }
  try {
    const accessToken = await getPayPalAccessToken();
    const res = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${paypalOrderId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      console.warn(`[PayPal Pre-Check] No se pudo obtener detalle previo (${res.status}) para orden ${paypalOrderId}`);
      return null;
    }

    const data = (await res.json()) as any;
    return {
      id: data.id,
      status: data.status,
      intent: data.intent,
      purchase_units: data.purchase_units,
      links: data.links,
      raw: data,
    };
  } catch (err) {
    console.warn(`[PayPal Pre-Check] Excepción al consultar orden PayPal ${paypalOrderId}:`, err);
    return null;
  }
}

/**
 * Crea una orden en PayPal v2 API para el checkout
 */
export async function createPayPalOrderOnGateway(
  params: CreatePayPalOrderParams
): Promise<CreatePayPalOrderResponse> {
  const currency = params.currency || 'EUR';
  const formattedAmount = Number(params.amount).toFixed(2);
  const { clientId, clientSecret } = getPayPalCredentials();

  // Protección de producción: en Live/Producción NUNCA se permiten simulaciones ni bypass
  if (!isPayPalSandbox) {
    if (!clientId || !clientSecret) {
      throw new Error(
        'Configuración de pasarela incompleta: Faltan credenciales oficiales de PayPal Live (PAYPAL_CLIENT_ID / PAYPAL_LIVE_CLIENT_ID) en entorno de producción.'
      );
    }
  } else {
    // MODO TEST SIMULADO (EXCLUSIVAMENTE EN SANDBOX si aún no se han inyectado credenciales)
    if (!clientId || !clientSecret) {
      const simulatedId = `SANDBOX_ORDER_${Date.now()}_${params.orderNumber.replace(/[^a-zA-Z0-9]/g, '')}`;
      return {
        success: true,
        paypalOrderId: simulatedId,
        orderNumber: params.orderNumber,
        amount: Number(formattedAmount),
        currency,
        isSimulated: true,
      };
    }
  }

  // MODO SANDBOX O LIVE OFICIAL CON CREDENCIALES DE PAYPAL
  const accessToken = await getPayPalAccessToken();

  const returnUrl = sanitizeReturnUrl(
    params.returnUrl,
    `/app/checkout/paypal-return?orderId=${encodeURIComponent(params.orderId)}`
  );
  const cancelUrl = sanitizeReturnUrl(
    params.cancelUrl,
    `/app/checkout/paypal-cancel?orderId=${encodeURIComponent(params.orderId)}`
  );

  const payload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: params.orderId,
        custom_id: params.orderId,
        invoice_id: params.orderNumber,
        description: `YA Delivery Jerez - Pedido ${params.orderNumber}${isPayPalSandbox ? ' [SANDBOX]' : ''}`,
        amount: {
          currency_code: currency,
          value: formattedAmount,
        },
      },
    ],
    application_context: {
      brand_name: 'YA Delivery Jerez',
      locale: 'es-ES',
      landing_page: 'NO_PREFERENCE',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'PAY_NOW',
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  };

  const res = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error en PayPal Orders API (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as {
    id: string;
    status: string;
    links?: Array<{ href: string; rel: string; method: string }>;
  };

  const approveUrl = data.links?.find((l) => l.rel === 'approve')?.href;

  return {
    success: true,
    paypalOrderId: data.id,
    orderNumber: params.orderNumber,
    amount: Number(formattedAmount),
    currency,
    approveUrl,
    links: data.links,
    isSimulated: false,
  };
}

export type CapturePayPalOrderParams = {
  orderId: string;
  paypalOrderId: string;
  expectedAmount: number;
  paymentMethod?: string;
};

export type CapturePayPalOrderResponse = {
  success: boolean;
  orderId: string;
  orderNumber?: string;
  captureId: string;
  status: 'paid' | 'failed';
  amount: number;
  currency: string;
  isSimulated?: boolean;
  error?: string;
};

/**
 * Captura los fondos de una orden aprobada en PayPal y valida importe exacto
 */
export async function capturePayPalOrderOnGateway(
  params: CapturePayPalOrderParams
): Promise<CapturePayPalOrderResponse> {
  const isSimulatedId = params.paypalOrderId.startsWith('SANDBOX_ORDER_');
  const { clientId, clientSecret } = getPayPalCredentials();

  // SEGURIDAD DE PRODUCCIÓN: Bloqueo estricto de cualquier identificador o bypass simulado
  if (!isPayPalSandbox) {
    if (isSimulatedId) {
      throw new Error(
        'Operación no permitida: Los identificadores simulados están estrictamente bloqueados fuera de Sandbox.'
      );
    }
    if (!clientId || !clientSecret) {
      throw new Error(
        'Configuración de pasarela incompleta: Faltan credenciales oficiales de PayPal Live en el servidor de producción.'
      );
    }
  }

  // MODO TEST SIMULADO DE SEGURIDAD (SOLO EN MODO SANDBOX)
  if (isPayPalSandbox && (isSimulatedId || !clientId || !clientSecret)) {
    const simulatedCaptureId = `SANDBOX_CAP_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Confirmar en Supabase mediante RPC o update
    await confirmOrderInDatabase({
      orderId: params.orderId,
      providerOrderId: params.paypalOrderId,
      captureId: simulatedCaptureId,
      amount: params.expectedAmount,
      method: params.paymentMethod || 'paypal',
      metadata: {
        gateway: 'paypal',
        mode: 'sandbox_simulated',
        captured_at: new Date().toISOString(),
      },
    });

    return {
      success: true,
      orderId: params.orderId,
      captureId: simulatedCaptureId,
      status: 'paid',
      amount: params.expectedAmount,
      currency: 'EUR',
      isSimulated: true,
    };
  }

  // DIAGNÓSTICO E INSPECCIÓN PREVIA EN PAYPAL
  const orderDetails = await getPayPalOrderDetails(params.paypalOrderId);
  if (orderDetails) {
    console.log(
      `[PayPal Pre-Capture Diagnostic] Orden: ${params.paypalOrderId}, Estado PayPal: ${orderDetails.status}, Intent: ${orderDetails.intent}`
    );

    // Caso de recuperación idempotente: Si la orden ya figura como COMPLETED en PayPal
    if (orderDetails.status === 'COMPLETED') {
      const existingCapture = orderDetails.purchase_units?.[0]?.payments?.captures?.[0];
      const existingCaptureId = existingCapture?.id || orderDetails.id;
      const existingCaptureStatus = existingCapture?.status || orderDetails.status;
      const existingAmount = Number(existingCapture?.amount?.value || 0);

      if (existingCaptureStatus === 'COMPLETED' && Math.abs(existingAmount - params.expectedAmount) <= 0.01) {
        console.log(
          `[PayPal Idempotency] La orden ${params.paypalOrderId} ya estaba capturada (COMPLETED) en PayPal con ID ${existingCaptureId}. Confirmando pedido...`
        );

        await confirmOrderInDatabase({
          orderId: params.orderId,
          providerOrderId: params.paypalOrderId,
          captureId: existingCaptureId,
          amount: existingAmount,
          method: params.paymentMethod || 'paypal',
          metadata: {
            gateway: 'paypal',
            mode: PAYPAL_MODE,
            raw_status: existingCaptureStatus,
            raw_id: orderDetails.id,
            idempotent_recovery: true,
            captured_at: new Date().toISOString(),
          },
        });

        return {
          success: true,
          orderId: params.orderId,
          captureId: existingCaptureId,
          status: 'paid',
          amount: existingAmount,
          currency: 'EUR',
          isSimulated: false,
        };
      }
    }
  }

  // MODO SANDBOX REAL DE PAYPAL: CAPTURA ESTÁNDAR DE ORDERS V2 API
  const accessToken = await getPayPalAccessToken();

  const res = await fetch(
    `${PAYPAL_BASE_URL}/v2/checkout/orders/${params.paypalOrderId}/capture`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({}),
    }
  );

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as any;
    const paypalName = errorData?.name || 'UNPROCESSABLE_ENTITY';
    const paypalMessage = errorData?.message || 'Error en validación de PayPal';
    const debugId = errorData?.debug_id || null;
    const details = Array.isArray(errorData?.details) ? errorData.details : [];
    const links = Array.isArray(errorData?.links) ? errorData.links : [];

    // Formatear detalles claros para diagnóstico sin exponer secretos ni tokens
    const detailsSummary = details
      .map((d: any) => `${d.issue || 'ISSUE'}: ${d.description || ''}${d.field ? ` (campo: ${d.field})` : ''}`)
      .filter(Boolean)
      .join(' | ');

    const diagnosticErrorMsg = `Rechazo de captura en PayPal (${res.status} ${paypalName}): ${
      detailsSummary || paypalMessage
    }${debugId ? ` [debug_id: ${debugId}]` : ''}`;

    // Registrar diagnóstico seguro en el log del servidor
    console.error('DIAGNÓSTICO PAYPAL CAPTURE (Detalle Real):', {
      httpStatus: res.status,
      name: paypalName,
      message: paypalMessage,
      debug_id: debugId,
      details,
      links,
      paypalOrderId: params.paypalOrderId,
      orderId: params.orderId,
    });

    // Registrar fallo en base de datos (NUNCA marcar como pagado)
    await failOrderInDatabase({
      orderId: params.orderId,
      providerOrderId: params.paypalOrderId,
      reason: diagnosticErrorMsg,
      status: 'failed',
      metadata: {
        paypal_error: {
          status: res.status,
          name: paypalName,
          message: paypalMessage,
          debug_id: debugId,
          details,
          links,
        },
      },
    });

    throw new PayPalGatewayError({
      status: res.status,
      name: paypalName,
      message: paypalMessage,
      debug_id: debugId,
      details,
      links,
      formattedMessage: diagnosticErrorMsg,
    });
  }

  const data = (await res.json()) as any;

  // Validación de estado de captura y monto
  const captureUnit = data.purchase_units?.[0]?.payments?.captures?.[0];
  const captureStatus = captureUnit?.status || data.status;
  const capturedAmount = Number(captureUnit?.amount?.value || 0);
  const capturedCurrency = captureUnit?.amount?.currency_code || 'EUR';
  const captureId = captureUnit?.id || data.id;

  // Verificación de relación PayPal: comprobar que la orden de PayPal pertenece a este pedido YA
  const paypalCustomId = data.purchase_units?.[0]?.custom_id || data.purchase_units?.[0]?.reference_id;
  if (paypalCustomId && paypalCustomId !== params.orderId) {
    throw new Error(
      `Discrepancia de seguridad: La orden de PayPal está vinculada a otro pedido (${paypalCustomId}).`
    );
  }

  // Verificación estricta de divisa oficial
  if (capturedCurrency !== 'EUR') {
    const errorMsg = `Divisa no permitida: Se requiere EUR y la operación reportó ${capturedCurrency}.`;
    await failOrderInDatabase({
      orderId: params.orderId,
      providerOrderId: params.paypalOrderId,
      reason: errorMsg,
      status: 'failed',
    });
    throw new Error(errorMsg);
  }

  // REQUISITO ESTRICTO: Solo si PayPal devuelve una captura realmente completada (status === "COMPLETED")
  if (captureStatus !== 'COMPLETED') {
    const errorMsg = `La captura no se completó exitosamente (Estado: ${captureStatus}). Se requiere status === 'COMPLETED'.`;
    await failOrderInDatabase({
      orderId: params.orderId,
      providerOrderId: params.paypalOrderId,
      reason: errorMsg,
      status: 'failed',
      metadata: {
        paypal_order_status: data.status,
        paypal_capture_status: captureStatus,
      },
    });
    throw new Error(errorMsg);
  }

  // Anti-tampering: el importe capturado debe coincidir con el del pedido
  if (Math.abs(capturedAmount - params.expectedAmount) > 0.01) {
    const errorMsg = `Discrepancia de importe entre el pedido (${params.expectedAmount} €) y PayPal (${capturedAmount} €).`;
    await failOrderInDatabase({
      orderId: params.orderId,
      providerOrderId: params.paypalOrderId,
      reason: errorMsg,
      status: 'failed',
    });
    throw new Error(errorMsg);
  }

  // Confirmación persistente y atómica en base de datos:
  // Solo se ejecuta aquí: payment_status = paid, orders.status = received, y provider_capture_id en payments
  await confirmOrderInDatabase({
    orderId: params.orderId,
    providerOrderId: params.paypalOrderId,
    captureId,
    amount: capturedAmount,
    method: params.paymentMethod || 'paypal',
    metadata: {
      gateway: 'paypal',
      mode: PAYPAL_MODE,
      raw_status: captureStatus,
      raw_id: data.id,
      captured_at: new Date().toISOString(),
    },
  });

  return {
    success: true,
    orderId: params.orderId,
    captureId,
    status: 'paid',
    amount: capturedAmount,
    currency: capturedCurrency,
    isSimulated: false,
  };
}

/**
 * Actualiza el pedido como pagado y recibido de forma atómica en Supabase
 * Transición: payment_pending -> received, payment_status -> paid
 */
export async function confirmOrderInDatabase(params: {
  orderId: string;
  providerOrderId: string;
  captureId: string;
  amount: number;
  method: string;
  metadata?: any;
}): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return;
  }

  // 1. Intentar llamar a la RPC dedicada e idempotente confirm_order_payment
  const { data: rpcRes, error: rpcErr } = await supabase.rpc('confirm_order_payment', {
    p_order_id: params.orderId,
    p_provider_order_id: params.providerOrderId,
    p_capture_id: params.captureId,
    p_amount: params.amount,
    p_method: params.method || 'paypal',
    p_metadata: params.metadata || {},
  });

  if (!rpcErr && rpcRes?.success) {
    return;
  }

  if (rpcErr) {
    console.warn('Aviso RPC confirm_order_payment:', rpcErr.message);
  }

  // Fallback directo sobre public.orders y public.payments:
  // Transición obligatoria a status = 'received' y payment_status = 'paid'
  const now = new Date().toISOString();
  await supabase
    .from('orders')
    .update({
      status: 'received',
      payment_status: 'paid',
      updated_at: now,
    })
    .eq('id', params.orderId);

  // Registro en la tabla de pagos (esquema real de YA Delivery)
  try {
    await supabase.from('payments').insert({
      order_id: params.orderId,
      provider: 'paypal',
      provider_order_id: params.providerOrderId,
      provider_capture_id: params.captureId,
      payment_method: params.method || 'paypal',
      status: 'paid',
      amount: params.amount,
      currency: 'EUR',
      raw_payload: params.metadata || {},
      created_at: now,
      updated_at: now,
    });
  } catch (paymentInsertErr) {
    console.warn('Registro en tabla payments:', paymentInsertErr);
  }
}

/**
 * Registra un fallo o cancelación de pago en Supabase
 */
export async function failOrderInDatabase(params: {
  orderId: string;
  providerOrderId?: string;
  reason: string;
  status: 'failed' | 'cancelled';
  metadata?: any;
}): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return;
  }

  const { error: rpcErr } = await supabase.rpc('fail_order_payment', {
    p_order_id: params.orderId,
    p_provider_order_id: params.providerOrderId || 'UNKNOWN',
    p_reason: params.reason,
    p_status: params.status,
  });

  if (!rpcErr) {
    return;
  }

  const now = new Date().toISOString();

  // Fallback si la RPC no existe aún: actualiza solo payment_status en orders (garantizando que NUNCA se marca como pagado)
  await supabase
    .from('orders')
    .update({
      payment_status: params.status,
      updated_at: now,
    })
    .eq('id', params.orderId)
    .neq('payment_status', 'paid');

  // Registrar el fallo en la tabla payments con detalle completo seguro
  try {
    await supabase.from('payments').insert({
      order_id: params.orderId,
      provider: 'paypal',
      provider_order_id: params.providerOrderId || 'UNKNOWN',
      status: params.status,
      amount: 0,
      currency: 'EUR',
      error_detail: params.reason,
      raw_payload: params.metadata || {},
      created_at: now,
      updated_at: now,
    });
  } catch (paymentErr) {
    console.warn('Registro de fallo en payments:', paymentErr);
  }
}

/**
 * Verificación oficial criptográfica de firma de webhooks de PayPal
 */
export async function verifyPayPalWebhookSignature(params: {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
  webhookEvent: any;
}): Promise<boolean> {
  const { webhookId } = getPayPalCredentials();

  if (!webhookId) {
    console.error(`PAYPAL_WEBHOOK_ID no está configurado en el entorno del servidor (${PAYPAL_MODE}).`);
    return false;
  }

  if (
    !params.authAlgo ||
    !params.certUrl ||
    !params.transmissionId ||
    !params.transmissionSig ||
    !params.transmissionTime ||
    !params.webhookEvent
  ) {
    console.warn('Firma de webhook de PayPal incompleta: faltan encabezados obligatorios.');
    return false;
  }

  try {
    const accessToken = await getPayPalAccessToken();

    const verificationPayload = {
      auth_algo: params.authAlgo,
      cert_url: params.certUrl,
      transmission_id: params.transmissionId,
      transmission_sig: params.transmissionSig,
      transmission_time: params.transmissionTime,
      webhook_id: webhookId,
      webhook_event: params.webhookEvent,
    };

    const res = await fetch(`${PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(verificationPayload),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`Verificación de firma de webhook PayPal rechazada (${res.status}):`, errBody);
      return false;
    }

    const data = (await res.json()) as { verification_status: string };
    return data.verification_status === 'SUCCESS';
  } catch (err) {
    console.error('Excepción al verificar firma de webhook de PayPal:', err);
    return false;
  }
}
