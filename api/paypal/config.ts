// ==============================================================================
// VERCEL SERVERLESS FUNCTION: /api/paypal/config
// Devuelve la configuración pública y disponibilidad de métodos de pago
// ==============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  isPayPalSandbox,
  PAYPAL_MODE,
  getPayPalCredentials,
} from '../../src/lib/paypalServer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Se expone ÚNICAMENTE el Client ID público del entorno activo
  // NUNCA se expone PAYPAL_CLIENT_SECRET, tokens ni webhooks al cliente
  const { clientId, clientSecret } = getPayPalCredentials();
  const hasRealCredentials = Boolean(clientId && clientSecret);

  return res.status(200).json({
    clientId,
    environment: PAYPAL_MODE,
    currency: 'EUR',
    isSandbox: isPayPalSandbox,
    hasRealCredentials,
    enabledMethods: {
      paypal: true,
      card: true,
      googlepay: false,
      applepay: false,
      bizum: false,
    },
    bizumNotice:
      'Bizum no es una pasarela procesada por PayPal. Los pagos se procesan de forma segura e inmediata con PayPal o Tarjeta.',
  });
}
