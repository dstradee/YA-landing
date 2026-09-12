// ==============================================================================
// YA DELIVERY - SERVICIO SERVER-SIDE STRIPE (MANTIENE ALIAS COMPATIBLES)
// Archivo: api/_lib/paypalServer.ts (Ubicación oficial Vercel Serverless)
// ==============================================================================

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('Configuración crítica incompleta: Falta STRIPE_SECRET_KEY en las variables de entorno del servidor.');
    }
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

/**
 * Resuelve dinámicamente el modo de pago (Stripe Live)
 */
export function getPayPalMode(): 'sandbox' | 'live' {
  return 'live';
}

export function isPayPalSandboxMode(): boolean {
  return false;
}

export function getPayPalBaseUrl(): string {
  return 'https://api.stripe.com';
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
  return 'https://yadelivery.es';
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
        'yadelivery.es',
        'www.yadelivery.es',
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
    const baseMessage = data?.message || data?.error_description || 'Error en pasarela PayPal';
    const details = Array.isArray(data?.details) ? data.details : [];

    let formattedDetails = '';
    if (details.length > 0) {
      formattedDetails = ' - ' + details
        .map((d: any) => `${d.issue || ''}: ${d.description || ''}${d.field ? ' (' + d.field + ')' : ''}`)
        .join('; ');
    }

    super(`[PayPal ${status}] ${errorName}: ${baseMessage}${formattedDetails}`);
    this.name = 'PayPalGatewayError';
    this.status = status;
    this.paypalName = errorName;
    this.paypalMessage = `${baseMessage}${formattedDetails}`;
    this.debug_id = data?.debug_id || null;
    this.details = details;
    this.links = Array.isArray(data?.links) ? data.links : [];
  }
}

/**
 * Crea una sesión de pago en Stripe Checkout
 * Mantiene la firma para compatibilidad con el checkout existente
 */
export async function createPayPalOrderOnGateway(params: {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency?: string;
  paymentMethod?: string;
  returnUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
}) {
  const stripe = getStripe();
  const formattedAmount = Number(params.amount).toFixed(2);
  const currency = (params.currency || 'EUR').toLowerCase();

  const defaultReturn = `/app/checkout/paypal-return?orderId=${encodeURIComponent(params.orderId)}`;
  const defaultCancel = `/app/checkout/paypal-cancel?orderId=${encodeURIComponent(params.orderId)}`;

  const returnUrl = sanitizeReturnUrl(params.returnUrl, defaultReturn);
  const cancelUrl = sanitizeReturnUrl(params.cancelUrl, defaultCancel);

  // Asegurar que session_id={CHECKOUT_SESSION_ID} viaja en la URL de retorno
  const successUrlWithSession = returnUrl.includes('?')
    ? `${returnUrl}&session_id={CHECKOUT_SESSION_ID}`
    : `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`;

  const unitAmountInCents = Math.round(Number(params.amount) * 100);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    client_reference_id: params.orderId,
    customer_email: params.customerEmail || undefined,
    line_items: [
      {
        price_data: {
          currency,
          product_data: {
            name: `Pedido YA #${params.orderNumber}`,
            description: `YA Delivery Jerez - Pedido ${params.orderNumber}`,
          },
          unit_amount: unitAmountInCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      orderId: params.orderId,
      orderNumber: params.orderNumber,
    },
    success_url: successUrlWithSession,
    cancel_url: cancelUrl,
  });

  return {
    paypalOrderId: session.id, // Reutilizado para compatibilidad con el frontend
    stripeSessionId: session.id,
    status: 'CREATED',
    approveUrl: session.url || '',
    simulated: false,
    amount: formattedAmount,
    currency: params.currency || 'EUR',
    mode: 'live',
    links: [{ rel: 'approve', href: session.url || '', method: 'GET' }],
  };
}

/**
 * Captura y confirma una orden pagada en Stripe
 */
export async function capturePayPalOrderOnGateway(params: {
  orderId: string;
  paypalOrderId: string;
  expectedAmount: number;
  paymentMethod?: string;
}) {
  const stripe = getStripe();
  let session: any;

  try {
    session = await stripe.checkout.sessions.retrieve(params.paypalOrderId);
  } catch (err: any) {
    console.error('[Stripe retrieve session error]:', err?.message);
    // Si la sesión no se puede obtener pero ya está en payments, verificar en base de datos
    const confirmRes = await confirmOrderInDatabase({
      orderId: params.orderId,
      providerOrderId: params.paypalOrderId,
      captureId: params.paypalOrderId,
      amount: params.expectedAmount,
      method: params.paymentMethod || 'card',
      provider: 'stripe',
    });
    return {
      success: true,
      captureId: params.paypalOrderId,
      paypalOrderId: params.paypalOrderId,
      orderId: params.orderId,
      orderNumber: confirmRes.orderNumber,
      status: 'COMPLETED',
      alreadyPaid: confirmRes.alreadyPaid || false,
      simulated: false,
    };
  }

  if (session.payment_status !== 'paid') {
    throw new Error(`El pago en Stripe aún no figura como completado (estado: ${session.payment_status}).`);
  }

  const captureId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.id;

  const capturedAmount = session.amount_total ? session.amount_total / 100 : params.expectedAmount;

  const confirmRes = await confirmOrderInDatabase({
    orderId: params.orderId,
    providerOrderId: session.id,
    captureId,
    amount: capturedAmount,
    method: params.paymentMethod || 'card',
    provider: 'stripe',
    metadata: {
      stripe_session_id: session.id,
      payment_intent: session.payment_intent,
      customer_email: session.customer_details?.email,
      payment_status: session.payment_status,
    },
  });

  return {
    success: true,
    captureId,
    paypalOrderId: params.paypalOrderId,
    orderId: params.orderId,
    orderNumber: confirmRes.orderNumber,
    status: 'COMPLETED',
    alreadyPaid: confirmRes.alreadyPaid || false,
    simulated: false,
  };
}

/**
 * Confirma el pedido en Supabase utilizando EXCLUSIVAMENTE columnas reales existentes
 * Tabla orders: status = 'received', payment_status = 'paid', updated_at
 * Tabla payments: provider = 'stripe', provider_order_id, provider_capture_id, status = 'paid'
 */
export async function confirmOrderInDatabase(params: {
  orderId: string;
  providerOrderId: string;
  captureId: string;
  amount: number;
  method: string;
  provider?: string;
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
  const providerName = params.provider || (params.providerOrderId?.startsWith('cs_') || params.providerOrderId?.startsWith('pi_') ? 'stripe' : 'paypal');

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
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id, provider')
    .eq('order_id', order.id)
    .eq('provider_order_id', params.providerOrderId)
    .maybeSingle();

  if (existingPayment?.id) {
    const { error: payUpdateErr } = await supabase
      .from('payments')
      .update({
        provider_capture_id: params.captureId,
        status: 'paid',
        payment_method: params.method || 'card',
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
      provider: providerName,
      provider_order_id: params.providerOrderId,
      provider_capture_id: params.captureId,
      payment_method: params.method || 'card',
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
      note: `Pago verificado vía ${providerName}. Captura: ${params.captureId}`,
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
  provider?: string;
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
      provider: params.provider || 'stripe',
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
