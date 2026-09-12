// ==============================================================================
// VERCEL SERVERLESS FUNCTION: /api/stripe/webhook
// Webhook asíncrono e idempotente para confirmación de pagos de Stripe LIVE
// ==============================================================================

import type { VercelRequest, VercelResponse } from '../_lib/types';
import { getStripe, confirmOrderInDatabase } from '../_lib/paypalServer';
import type { IncomingMessage } from 'http';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('⚠️ STRIPE_WEBHOOK_SECRET no está configurada en las variables de entorno.');
    return res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET is not configured on server' });
  }

  const sig = req.headers['stripe-signature'];
  if (!sig || typeof sig !== 'string') {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let rawBody: Buffer;
  try {
    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body;
    } else if (typeof req.body === 'string') {
      rawBody = Buffer.from(req.body);
    } else if (req.body && Object.keys(req.body).length > 0) {
      rawBody = Buffer.from(JSON.stringify(req.body));
    } else {
      rawBody = await getRawBody(req);
    }
  } catch (err: any) {
    console.error('Error al leer el cuerpo de la petición webhook:', err);
    return res.status(400).json({ error: 'Could not read request body' });
  }

  const stripe = getStripe();
  let event: any;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error('⚠️ Error verificando firma del webhook de Stripe:', err.message);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  console.log(`🔔 Webhook Stripe verificado recibido: ${event.type} (ID: ${event.id})`);

  try {
    // 1. Sesión de Checkout completada
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      if (session.payment_status === 'paid') {
        const orderId = session.metadata?.orderId || session.client_reference_id;
        const captureId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.id;
        const amount = session.amount_total ? session.amount_total / 100 : 0;

        if (orderId) {
          await confirmOrderInDatabase({
            orderId,
            providerOrderId: session.id,
            captureId,
            amount,
            method: 'card',
            provider: 'stripe',
            metadata: {
              stripe_session_id: session.id,
              payment_intent: session.payment_intent,
              customer_email: session.customer_details?.email,
              webhook_event_id: event.id,
            },
          });
        }
      }
    }

    // 2. Payment Intent exitoso (cobro confirmado)
    else if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const orderId = paymentIntent.metadata?.orderId;
      const amount = paymentIntent.amount_received ? paymentIntent.amount_received / 100 : 0;

      if (orderId) {
        await confirmOrderInDatabase({
          orderId,
          providerOrderId: paymentIntent.id,
          captureId: paymentIntent.id,
          amount,
          method: 'card',
          provider: 'stripe',
          metadata: {
            payment_intent: paymentIntent.id,
            webhook_event_id: event.id,
          },
        });
      }
    }

    // 3. Fallo en el pago
    else if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object;
      const orderId = paymentIntent.metadata?.orderId;
      const failureMessage = paymentIntent.last_payment_error?.message || 'Fallo en el pago con tarjeta';

      if (orderId) {
        console.warn(`⚠️ Pago fallido para pedido ${orderId}: ${failureMessage}`);
      }
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('Error procesando webhook de Stripe:', err);
    return res.status(500).json({ error: err?.message || 'Error processing webhook event' });
  }
}
