// ==============================================================================
// YA DELIVERY - CLIENTE DE PAGOS PAYPAL (PHASE 3C.3: SANDBOX + LIVE)
// Archivo: src/lib/paypalClient.ts
// ==============================================================================

export type PayPalConfig = {
  clientId: string;
  environment: 'sandbox' | 'live' | 'production';
  currency: string;
  isSandbox: boolean;
  hasRealCredentials: boolean;
  enabledMethods: {
    paypal: boolean;
    card: boolean;
    googlepay: boolean;
    applepay: boolean;
    bizum: boolean;
  };
  bizumNotice: string;
  error?: string;
};

export type DevicePaymentSupport = {
  applePayAvailable: boolean;
  googlePayAvailable: boolean;
  cardsAvailable: boolean;
  bizumAvailable: boolean;
  bizumMessage: string;
};

/**
 * Consulta la configuración de PayPal del servidor
 * El Client ID público se obtiene de /api/paypal/config sin exponer secretos
 */
export async function fetchPayPalConfig(): Promise<PayPalConfig> {
  try {
    const res = await fetch('/api/paypal/config');
    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok) {
        return data as PayPalConfig;
      } else {
        console.error('Error devuelto por /api/paypal/config:', data);
      }
    } else {
      const errorText = await res.text();
      console.error(`Respuesta no-JSON de /api/paypal/config (${res.status}):`, errorText.slice(0, 300));
    }
  } catch (e) {
    console.warn('Error al consultar configuración de PayPal desde backend:', e);
  }

  // En producción, no forzar sandbox si el backend tuvo un problema momentáneo
  const isProductionHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'yadelivery.es' ||
      window.location.hostname === 'www.yadelivery.es' ||
      window.location.hostname === 'ya-delivery.es' ||
      window.location.hostname === 'www.ya-delivery.es' ||
      window.location.hostname.includes('vercel.app'));

  return {
    clientId: '',
    environment: isProductionHost ? 'live' : 'sandbox',
    currency: 'EUR',
    isSandbox: !isProductionHost,
    hasRealCredentials: false,
    enabledMethods: {
      paypal: true,
      card: true,
      googlepay: false,
      applepay: false,
      bizum: false,
    },
    bizumNotice:
      'Bizum no es una pasarela procesada por PayPal. Los pagos se procesan de forma segura e inmediata con PayPal o Tarjeta.',
  };
}

/**
 * Comprueba compatibilidad nativa del dispositivo/navegador para métodos alternativos
 */
export function checkDevicePaymentSupport(): DevicePaymentSupport {
  let applePay = false;
  try {
    if (typeof window !== 'undefined' && (window as any).ApplePaySession) {
      applePay = (window as any).ApplePaySession.canMakePayments();
    }
  } catch {
    applePay = false;
  }

  let googlePay = false;
  try {
    if (typeof window !== 'undefined') {
      const isChromium = !!(window as any).chrome;
      const isAndroid = /Android/i.test(navigator.userAgent);
      googlePay = isChromium || isAndroid;
    }
  } catch {
    googlePay = false;
  }

  return {
    applePayAvailable: applePay,
    googlePayAvailable: googlePay,
    cardsAvailable: true, // Tarjetas siempre disponibles vía PayPal
    bizumAvailable: false, // Oficialmente no soportado por PayPal en España
    bizumMessage:
      'Bizum no está integrado en la pasarela de PayPal. Puedes pagar de forma segura e inmediata con Tarjeta o con tu cuenta de PayPal.',
  };
}

/**
 * Solicita al servidor crear una orden de pago en PayPal con autorización de usuario
 */
export async function requestCreatePayPalOrder(params: {
  orderId: string;
  paymentMethod?: string;
  amount?: number;
  token?: string;
  returnUrl?: string;
  cancelUrl?: string;
}): Promise<{
  success: boolean;
  paypalOrderId: string;
  orderNumber?: string;
  amount?: number;
  currency?: string;
  approveUrl?: string;
  links?: Array<{ href: string; rel: string; method: string }>;
  isSimulated?: boolean;
  error?: string;
}> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (params.token) {
    headers['Authorization'] = `Bearer ${params.token}`;
  }

  const res = await fetch('/api/paypal/create-order', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      orderId: params.orderId,
      paymentMethod: params.paymentMethod || 'paypal',
      amount: params.amount,
      returnUrl: params.returnUrl,
      cancelUrl: params.cancelUrl,
    }),
  });

  const responseText = await res.text();
  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      `El servidor de pagos devolvió una respuesta inesperada (${res.status}): ${responseText.slice(0, 180)}`
    );
  }

  if (!res.ok) {
    throw new Error(data.error || 'Error al iniciar la pasarela de PayPal');
  }

  return data;
}

/**
 * Solicita al servidor capturar los fondos y confirmar el pedido en la base de datos
 */
export async function requestCapturePayPalOrder(params: {
  orderId: string;
  paypalOrderId?: string;
  paymentMethod?: string;
  amount?: number;
  token?: string;
}): Promise<{
  success: boolean;
  orderId: string;
  orderNumber?: string;
  captureId?: string;
  status: string;
  amount?: number;
  currency?: string;
  isSimulated?: boolean;
  alreadyPaid?: boolean;
  error?: string;
}> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (params.token) {
    headers['Authorization'] = `Bearer ${params.token}`;
  }

  const res = await fetch('/api/paypal/capture-order', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      orderId: params.orderId,
      paypalOrderId: params.paypalOrderId,
      paymentMethod: params.paymentMethod || 'paypal',
      amount: params.amount,
    }),
  });

  const responseText = await res.text();
  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      `El servidor de pagos devolvió una respuesta inesperada (${res.status}): ${responseText.slice(0, 180)}`
    );
  }

  if (!res.ok) {
    let errorMsg = data.error || data.message || 'No se pudo capturar el pago en PayPal.';
    if (Array.isArray(data.details) && data.details.length > 0) {
      const detailsText = data.details
        .map((d: any) => `${d.issue || 'ISSUE'}: ${d.description || ''}${d.field ? ` (${d.field})` : ''}`)
        .filter(Boolean)
        .join(' | ');
      if (detailsText && !errorMsg.includes(detailsText)) {
        errorMsg = `${errorMsg} [Detalles: ${detailsText}]`;
      }
    }
    if (data.debug_id && !errorMsg.includes(data.debug_id)) {
      errorMsg = `${errorMsg} (debug_id: ${data.debug_id})`;
    }
    const err = new Error(errorMsg) as any;
    err.name = data.name;
    err.debug_id = data.debug_id;
    err.details = data.details;
    err.links = data.links;
    throw err;
  }

  return data;
}
