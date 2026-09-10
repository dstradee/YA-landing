// ==============================================================================
// YA DELIVERY - CLIENTE DE PAGOS PAYPAL SANDBOX (PHASE 3C.1)
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
    if (res.ok) {
      return (await res.json()) as PayPalConfig;
    }
  } catch (e) {
    console.warn('Error al consultar configuración de PayPal desde backend:', e);
  }

  // Fallback seguro sin depender de variables locales VITE_
  return {
    clientId: '',
    environment: 'sandbox',
    currency: 'EUR',
    isSandbox: true,
    hasRealCredentials: false,
    enabledMethods: {
      paypal: true,
      card: true,
      googlepay: false,
      applepay: false,
      bizum: false,
    },
    bizumNotice:
      'Bizum no es una pasarela procesada por PayPal. En esta fase Sandbox de YA Delivery, los pagos se procesan de forma segura e inmediata con PayPal o Tarjeta.',
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

  const data = await res.json();
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
  paypalOrderId: string;
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

  const data = await res.json();
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
