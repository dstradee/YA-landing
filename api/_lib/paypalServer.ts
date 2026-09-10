// ==============================================================================
// YA DELIVERY - SERVICIO SERVER-SIDE PAYPAL SANDBOX & LIVE (PHASE 3C.3)
// Archivo: api/_lib/paypalServer.ts (Ubicación oficial Vercel Serverless)
// ==============================================================================

import { createClient } from '@supabase/supabase-js';

/**
 * Resuelve dinámicamente el modo de PayPal ('sandbox' o 'live')
 * Evaluado en tiempo de ejecución para responder inmediatamente a cambios en Vercel
 */
export function getPayPalMode(): 'sandbox' | 'live' {
  const rawMode = (
    process.env.PAYPAL_MODE ||
    process.env.PAYPAL_ENVIRONMENT ||
    'sandbox'
  ).trim().toLowerCase();

  return rawMode === 'live' || rawMode === 'production' ? 'live' : 'sandbox';
}

export function isPayPalSandboxMode(): boolean {
  return getPayPalMode() === 'sandbox';
}

export function getPayPalBaseUrl(): string {
  return isPayPalSandboxMode()
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

/**
 * Resuelve las credenciales server-side correspondientes al entorno activo
 * Prioriza variables específicas del entorno y admite las genéricas.
 * NUNCA se exponen al cliente ni se envían al frontend.
 */
export function getPayPalCredentials() {
  const isSandbox = isPayPalSandboxMode();

  const clientId =
    (isSandbox
      ? process.env.PAYPAL_SANDBOX_CLIENT_ID
      : process.env.PAYPAL_LIVE_CLIENT_ID) ||
    process.env.PAYPAL_CLIENT_ID ||
    '';

  const clientSecret =
    (isSandbox
      ? process.env.PAYPAL_SANDBOX_CLIENT_SECRET
      : process.env.PAYPAL_LIVE_CLIENT_SECRET) ||
    process.env.PAYPAL_CLIENT_SECRET ||
    '';

  const webhookId =
    (isSandbox
      ? process.env.PAYPAL_SANDBOX_WEBHOOK_ID
      : process.env.PAYPAL_LIVE_WEBHOOK_ID) ||
    process.env.PAYPAL_WEBHOOK_ID ||
    '';

  return { clientId, clientSecret, webhookId };
}

/**
 * Resuelve la URL base canónica de la aplicación YA Delivery
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
    if (!isPayPalSandboxMode()) {
      const allowedHosts = [
        'ya-delivery.es',
        'www.ya-delivery.es',
        'ya-landing-nine.vercel.app',
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

/**
 * Supabase server client administrativo con service_role
 */
export function getSupabaseServerClient() {
  const SUPABASE_URL =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    '';

  const SUPABASE_KEY =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    '';

  if (!SUPABASE_URL) {
    throw new Error(
      'Configuración crítica de backend incompleta: Falta SUPABASE_URL (o VITE_SUPABASE_URL) en el servidor de Vercel.'
    );
  }

  if (!SUPABASE_KEY) {
    throw new Error(
      'Configuración crítica de backend incompleta: Se requiere SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY) en Vercel. La clave pública (anon) no está permitida para operaciones de pago.'
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
  const mode = getPayPalMode();
  const baseUrl = getPayPalBaseUrl();
  const isSandbox = isPayPalSandboxMode();

  if (!clientId || !clientSecret) {
    throw new Error(
      `Faltan credenciales de PayPal (${isSandbox ? 'PAYPAL_CLIENT_ID / PAYPAL_SANDBOX_CLIENT_ID' : 'PAYPAL_CLIENT_ID / PAYPAL_LIVE_CLIENT_ID'}) en las variables de entorno de Vercel.`
    );
  }

  const now = Date.now();
  if (
    cachedToken &&
    cachedToken.mode === mode &&
    cachedToken.clientId === clientId &&
    cachedToken.expiresAt > now + 60000
  ) {
    return cachedToken.token;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error al autenticar con PayPal ${mode} (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    mode,
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

  constructor(status: number, data: any) {
    const errorName = data?.name || 'PayPalError';
    const message = data?.message || data?.error_description || 'Error en pasarela PayPal';
    super(`[PayPal ${status}] ${errorName}: ${message}`);
    this.name = 'PayPalGatewayError';
    this.status = status;
    this.paypalName = errorName;
    this.paypalMessage = message;
    this.debug_id = data?.debug_id || null;
    this.details = Array.isArray(data?.details) ? data.details : [];
    this.links = Array.isArray(data?.links) ? data.links : [];
  }
}

/**
 * Crea una orden en PayPal v2 Orders API
 */
export async function createPayPalOrderOnGateway(params: {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency?: string;
  paymentMethod?: string;
  returnUrl?: string;
  cancelUrl?: string;
}) {
  const { clientId, clientSecret } = getPayPalCredentials();
  const isSandbox = isPayPalSandboxMode();
  const mode = getPayPalMode();
  const baseUrl = getPayPalBaseUrl();

  const formattedAmount = Number(params.amount).toFixed(2);
  const currency = params.currency || 'EUR';

  // Saneamiento de URLs de retorno
  const returnUrl = sanitizeReturnUrl(
    params.returnUrl,
    `/app/checkout/paypal-return?orderId=${params.orderId}&mode=${mode}`
  );
  const cancelUrl = sanitizeReturnUrl(
    params.cancelUrl,
    `/app/checkout/paypal-cancel?orderId=${params.orderId}&mode=${mode}`
  );

  // MODO TEST SIMULADO EXCLUSIVAMENTE EN DESARROLLO LOCAL SANDBOX (sin credenciales)
  if (isSandbox && (!clientId || !clientSecret)) {
    const simulatedId = `SANDBOX_ORDER_${Date.now()}_${params.orderNumber.replace(/[^a-zA-Z0-9]/g, '')}`;
    return {
      paypalOrderId: simulatedId,
      status: 'CREATED',
      approveUrl: `${returnUrl}&simulated=true&token=${simulatedId}`,
      simulated: true,
      amount: formattedAmount,
      currency,
      mode: 'sandbox_simulated',
    };
  }

  if (!clientId || !clientSecret) {
    throw new Error('Faltan credenciales de PayPal (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET) en Vercel.');
  }

  const token = await getPayPalAccessToken();

  const payload: any = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: params.orderId,
        custom_id: params.orderId,
        invoice_id: `YA-${params.orderNumber}-${Date.now().toString().slice(-4)}`,
        description: `YA Delivery Jerez - Pedido ${params.orderNumber}${isSandbox ? ' [SANDBOX]' : ''}`,
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
      user_action: 'PAY_NOW',
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  };

  const res = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new PayPalGatewayError(res.status, data);
  }

  const approveLink = data.links?.find((l: any) => l.rel === 'approve')?.href;

  return {
    paypalOrderId: data.id,
    status: data.status,
    approveUrl: approveLink || '',
    simulated: false,
    amount: formattedAmount,
    currency,
    mode,
    links: data.links,
  };
}

/**
 * Captura una orden aprobada en PayPal
 */
export async function capturePayPalOrderOnGateway(params: {
  orderId: string;
  paypalOrderId: string;
  expectedAmount: number;
  paymentMethod?: string;
}) {
  const { clientId, clientSecret } = getPayPalCredentials();
  const isSandbox = isPayPalSandboxMode();
  const isSimulatedId = params.paypalOrderId.startsWith('SANDBOX_ORDER_');
  const baseUrl = getPayPalBaseUrl();

  if (!isSandbox && isSimulatedId) {
    throw new Error('Operación no permitida: Los identificadores simulados están estrictamente bloqueados en Live.');
  }

  // Modo simulado local
  if (isSandbox && (isSimulatedId || !clientId || !clientSecret)) {
    const simulatedCaptureId = `SANDBOX_CAP_${Date.now()}`;
    await confirmOrderInDatabase({
      orderId: params.orderId,
      providerOrderId: params.paypalOrderId,
      captureId: simulatedCaptureId,
      amount: params.expectedAmount,
      method: params.paymentMethod || 'paypal',
      metadata: { mode: 'sandbox_simulated' },
    });

    return {
      success: true,
      captureId: simulatedCaptureId,
      paypalOrderId: params.paypalOrderId,
      orderId: params.orderId,
      status: 'COMPLETED',
      simulated: true,
    };
  }

  const token = await getPayPalAccessToken();

  let captureId = '';
  let capturedAmount = params.expectedAmount;
  let finalStatus = 'COMPLETED';
  let payerInfo: any = null;

  const res = await fetch(`${baseUrl}/v2/checkout/orders/${params.paypalOrderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
  });

  const data = await res.json();

  if (res.ok) {
    const captureObj = data.purchase_units?.[0]?.payments?.captures?.[0];
    captureId = captureObj?.id || data.id;
    capturedAmount = Number(captureObj?.amount?.value || params.expectedAmount);
    finalStatus = data.status || 'COMPLETED';
    payerInfo = data.payer;
  } else {
    // Si la captura directa devuelve error (por ejemplo, ORDER_ALREADY_CAPTURED porque ya se cobró):
    console.warn(`[PayPal Capture] POST capture devolvió ${res.status}:`, JSON.stringify(data));

    // Consultar el estado real de la orden en PayPal Orders v2 API para reconciliar
    const orderCheckRes = await fetch(`${baseUrl}/v2/checkout/orders/${params.paypalOrderId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (orderCheckRes.ok) {
      const orderCheckData = await orderCheckRes.json();
      console.log(`[PayPal Check] Estado actual de orden ${params.paypalOrderId} en PayPal:`, orderCheckData.status);

      if (orderCheckData.status === 'COMPLETED') {
        // La transacción ya fue cobrada y completada en PayPal
        const captureObj = orderCheckData.purchase_units?.[0]?.payments?.captures?.[0];
        captureId = captureObj?.id || params.paypalOrderId;
        capturedAmount = Number(captureObj?.amount?.value || params.expectedAmount);
        finalStatus = 'COMPLETED';
        payerInfo = orderCheckData.payer;
      } else {
        throw new PayPalGatewayError(res.status, data);
      }
    } else {
      throw new PayPalGatewayError(res.status, data);
    }
  }

  // Anti-tampering estricto de importe
  if (Math.abs(capturedAmount - params.expectedAmount) > 0.01) {
    await failOrderInDatabase({
      orderId: params.orderId,
      providerOrderId: params.paypalOrderId,
      reason: `Discrepancia en importe capturado: esperado ${params.expectedAmount} €, recibido ${capturedAmount} €`,
      status: 'failed',
    });
    throw new Error(`Discrepancia de importe en la pasarela.`);
  }

  const confirmRes = await confirmOrderInDatabase({
    orderId: params.orderId,
    providerOrderId: params.paypalOrderId,
    captureId,
    amount: capturedAmount,
    method: params.paymentMethod || 'paypal',
    metadata: {
      paypal_status: finalStatus,
      capture_id: captureId,
      payer: payerInfo,
    },
  });

  return {
    success: true,
    captureId,
    paypalOrderId: params.paypalOrderId,
    orderId: params.orderId,
    orderNumber: confirmRes.orderNumber,
    status: finalStatus,
    alreadyPaid: confirmRes.alreadyPaid || false,
    simulated: false,
  };
}

/**
 * Confirma el pedido en Supabase utilizando EXCLUSIVAMENTE columnas reales existentes
 * Tabla orders: status = 'received', payment_status = 'paid', updated_at
 * Tabla payments: provider = 'paypal', provider_order_id, provider_capture_id, status = 'paid'
 */
export async function confirmOrderInDatabase(params: {
  orderId: string;
  providerOrderId: string;
  captureId: string;
  amount: number;
  method: string;
  metadata?: any;
}): Promise<{
  success: boolean;
  orderId: string;
  orderNumber?: string;
  status: string;
  paymentStatus: string;
  captureId: string;
  alreadyPaid?: boolean;
}> {
  const supabase = getSupabaseServerClient();

  // 1. Obtener pedido actual por UUID o por order_number (ej. YA-1013)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.orderId);
  let orderQuery = supabase
    .from('orders')
    .select('id, user_id, order_number, total, status, payment_status');

  if (isUuid) {
    orderQuery = orderQuery.eq('id', params.orderId);
  } else {
    orderQuery = orderQuery.eq('order_number', params.orderId);
  }

  const { data: order, error: orderErr } = await orderQuery.maybeSingle();

  if (orderErr || !order) {
    throw new Error(`Pedido no encontrado para confirmar: ${orderErr?.message || params.orderId}`);
  }

  if (order.payment_status === 'paid' && order.status === 'received') {
    return {
      success: true,
      alreadyPaid: true,
      orderId: order.id,
      orderNumber: order.order_number,
      status: 'received',
      paymentStatus: 'paid',
      captureId: params.captureId,
    };
  }

  const nowIso = new Date().toISOString();

  // 2. Registrar o actualizar en public.payments usando columnas REALES
  // provider = 'paypal', provider_order_id, provider_capture_id, status = 'paid'
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id')
    .eq('order_id', order.id)
    .eq('provider_order_id', params.providerOrderId)
    .maybeSingle();

  if (existingPayment?.id) {
    const { error: payUpdateErr } = await supabase
      .from('payments')
      .update({
        provider_capture_id: params.captureId,
        status: 'paid',
        payment_method: params.method || 'paypal',
        amount: params.amount,
        raw_payload: params.metadata || {},
        updated_at: nowIso,
      })
      .eq('id', existingPayment.id);

    if (payUpdateErr) {
      console.error('[confirmOrderInDatabase] Error actualizando payments:', payUpdateErr);
    }
  } else {
    const { error: payInsertErr } = await supabase.from('payments').insert({
      order_id: order.id,
      user_id: order.user_id,
      provider: 'paypal',
      provider_order_id: params.providerOrderId,
      provider_capture_id: params.captureId,
      payment_method: params.method || 'paypal',
      status: 'paid',
      amount: params.amount,
      currency: 'EUR',
      raw_payload: params.metadata || {},
      updated_at: nowIso,
    });

    if (payInsertErr) {
      console.error('[confirmOrderInDatabase] Error insertando en payments:', payInsertErr);
    }
  }

  // 3. Transicionar pedido en public.orders usando ÚNICAMENTE columnas reales
  // status: 'received'
  // payment_status: 'paid'
  // updated_at: nowIso
  const { error: orderUpdateErr } = await supabase
    .from('orders')
    .update({
      status: 'received',
      payment_status: 'paid',
      updated_at: nowIso,
    })
    .eq('id', order.id);

  if (orderUpdateErr) {
    console.error('[confirmOrderInDatabase] Error actualizando orders:', orderUpdateErr);
    throw new Error(`Error en base de datos al actualizar pedido: ${orderUpdateErr.message}`);
  }

  // 4. Registro opcional de auditoría en order_status_history
  try {
    await supabase.from('order_status_history').insert({
      order_id: order.id,
      from_status: order.status || 'payment_pending',
      to_status: 'received',
      actor_type: 'system',
      note: `Pago verificado vía PayPal. Captura: ${params.captureId}`,
    });
  } catch {
    // Si la tabla no existe o falla por RLS, no impedir la confirmación
  }

  return {
    success: true,
    orderId: order.id,
    orderNumber: order.order_number,
    status: 'received',
    paymentStatus: 'paid',
    captureId: params.captureId,
  };
}

/**
 * Marca el pedido como fallido o cancelado usando columnas reales
 */
export async function failOrderInDatabase(params: {
  orderId: string;
  providerOrderId?: string;
  reason: string;
  status: 'failed' | 'cancelled';
}) {
  const supabase = getSupabaseServerClient();
  const nowIso = new Date().toISOString();

  await supabase
    .from('orders')
    .update({
      payment_status: params.status === 'cancelled' ? 'pending' : 'failed',
      status: params.status === 'cancelled' ? 'payment_pending' : 'cancelled',
      updated_at: nowIso,
    })
    .eq('id', params.orderId);

  if (params.providerOrderId) {
    await supabase.from('payments').insert({
      order_id: params.orderId,
      provider: 'paypal',
      provider_order_id: params.providerOrderId,
      status: params.status === 'cancelled' ? 'pending' : 'failed',
      error_detail: params.reason,
      updated_at: nowIso,
    });
  }
}

/**
 * Verifica la firma criptográfica de un Webhook de PayPal
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
  const baseUrl = getPayPalBaseUrl();

  if (!webhookId) {
    console.warn('PAYPAL_WEBHOOK_ID no configurado en servidor.');
    return false;
  }

  const token = await getPayPalAccessToken();

  const verificationPayload = {
    auth_algo: params.authAlgo,
    cert_url: params.certUrl,
    transmission_id: params.transmissionId,
    transmission_sig: params.transmissionSig,
    transmission_time: params.transmissionTime,
    webhook_id: webhookId,
    webhook_event: params.webhookEvent,
  };

  const res = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(verificationPayload),
  });

  if (!res.ok) {
    return false;
  }

  const data = (await res.json()) as { verification_status: string };
  return data.verification_status === 'SUCCESS';
}
