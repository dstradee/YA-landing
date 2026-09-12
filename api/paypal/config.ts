// ==============================================================================
// VERCEL SERVERLESS FUNCTION: /api/paypal/config
// Devuelve la configuración pública y disponibilidad de métodos de pago (Stripe)
// ==============================================================================

import type { VercelRequest, VercelResponse } from '../_lib/types.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const hasRealCredentials = Boolean(process.env.STRIPE_SECRET_KEY);
    const publishableKey = process.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

    return res.status(200).json({
      clientId: publishableKey,
      environment: 'live',
      currency: 'EUR',
      isSandbox: false,
      hasRealCredentials,
      enabledMethods: {
        paypal: false,
        card: true,
        googlepay: true,
        applepay: true,
        bizum: false,
      },
      bizumNotice:
        'Los pagos se procesan de forma 100% segura mediante Stripe (Tarjeta, Apple Pay, Google Pay).',
    });
  } catch (err: any) {
    console.error('Error en /api/paypal/config:', err);
    return res.status(500).json({
      error: err?.message || 'Error interno al obtener configuración de la pasarela',
      environment: 'live',
      isSandbox: false,
    });
  }
}
