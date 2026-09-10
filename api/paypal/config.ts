// ==============================================================================
// VERCEL SERVERLESS FUNCTION: /api/paypal/config
// Devuelve la configuración pública y disponibilidad de métodos de pago
// ==============================================================================

import type { VercelRequest, VercelResponse } from '../_lib/types.ts';
import {
  getPayPalMode,
  isPayPalSandboxMode,
  getPayPalCredentials,
} from '../_lib/paypalServer.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const isSandbox = isPayPalSandboxMode();
    const mode = getPayPalMode();
    const { clientId, clientSecret } = getPayPalCredentials();
    const hasRealCredentials = Boolean(clientId && clientSecret);

    return res.status(200).json({
      clientId,
      environment: mode,
      currency: 'EUR',
      isSandbox,
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
  } catch (err: any) {
    console.error('Error en /api/paypal/config:', err);
    return res.status(500).json({
      error: err?.message || 'Error interno al obtener configuración de PayPal',
      environment: getPayPalMode(),
      isSandbox: isPayPalSandboxMode(),
    });
  }
}
