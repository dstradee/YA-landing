// ==============================================================================
// VERCEL SERVERLESS FUNCTION: /api/paypal/config
// Devuelve la configuración pública y disponibilidad de métodos de pago
// ==============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Se expone únicamente el Client ID público del servidor (PAYPAL_CLIENT_ID)
  // NUNCA se expone PAYPAL_CLIENT_SECRET ni tokens privados
  const clientId = process.env.PAYPAL_CLIENT_ID || '';
  const environment = (
    process.env.PAYPAL_MODE ||
    process.env.PAYPAL_ENVIRONMENT ||
    'sandbox'
  ).toLowerCase();

  const hasRealCredentials = Boolean(
    process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET
  );

  return res.status(200).json({
    clientId,
    environment,
    currency: 'EUR',
    isSandbox: environment === 'sandbox',
    hasRealCredentials,
    enabledMethods: {
      paypal: true,
      card: true,
      googlepay: false, // Fase 3C.1: deshabilitado en esta fase
      applepay: false,  // Fase 3C.1: deshabilitado en esta fase
      bizum: false,     // Oficialmente no soportado por PayPal para comercios en España
    },
    bizumNotice:
      'Bizum no es una pasarela procesada por PayPal. En esta fase Sandbox de YA Delivery, los pagos se procesan de forma segura e inmediata con PayPal o Tarjeta.',
  });
}
