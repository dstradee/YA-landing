// ==============================================================================
// VERCEL SERVERLESS FUNCTION: /api/paypal/webhook
// Webhook asíncrono e idempotente para eventos de PayPal Sandbox
// URL configurada: https://ya-landing-nine.vercel.app/api/paypal/webhook
// ==============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  verifyPayPalWebhookSignature,
  confirmOrderInDatabase,
  failOrderInDatabase,
  getSupabaseServerClient,
} from '../../src/lib/paypalServer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const webhookEvent = req.body;

    if (!webhookEvent || !webhookEvent.event_type) {
      return res.status(400).json({ error: 'Cuerpo de webhook inválido o vacío.' });
    }

    // 1. Extracción y validación estricta de encabezados de firma de PayPal
    const authAlgo = (req.headers['paypal-auth-algo'] as string) || '';
    const certUrl = (req.headers['paypal-cert-url'] as string) || '';
    const transmissionId = (req.headers['paypal-transmission-id'] as string) || '';
    const transmissionSig = (req.headers['paypal-transmission-sig'] as string) || '';
    const transmissionTime = (req.headers['paypal-transmission-time'] as string) || '';

    if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
      console.warn('⚠️ Webhook de PayPal rechazado: faltan cabeceras criptográficas de autenticación.');
      return res.status(400).json({
        error: 'Cabeceras de verificación criptográfica de PayPal ausentes.',
      });
    }

    // 2. Verificación criptográfica oficial contra el endpoint de PayPal usando PAYPAL_WEBHOOK_ID
    const isVerified = await verifyPayPalWebhookSignature({
      authAlgo,
      certUrl,
      transmissionId,
      transmissionSig,
      transmissionTime,
      webhookEvent,
    });

    if (!isVerified) {
      console.warn('⚠️ Webhook de PayPal rechazado: firma criptográfica inválida.');
      return res.status(400).json({ error: 'Firma criptográfica de webhook inválida.' });
    }

    const eventType = webhookEvent.event_type;
    const resource = webhookEvent.resource || {};

    console.log(`🔔 Webhook PayPal verificado recibido: ${eventType} (ID: ${webhookEvent.id})`);

    // 3. Procesamiento de eventos autoritativos
    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        const captureId = resource.id;
        const capturedAmount = Number(resource.amount?.value || 0);
        const capturedCurrency = resource.amount?.currency_code || 'EUR';

        // Verificación estricta de divisa autorizada
        if (capturedCurrency !== 'EUR') {
          console.warn(`⚠️ Webhook ignorado: divisa no permitida ${capturedCurrency}. Se requiere EUR.`);
          return res.status(400).json({ error: 'Divisa no válida. Se requiere EUR.' });
        }

        // custom_id contiene el UUID del pedido en Supabase
        let orderId = resource.custom_id || resource.supplementary_data?.related_ids?.order_id;
        const providerOrderId = resource.supplementary_data?.related_ids?.order_id || captureId;

        // Validar pedido y anti-tampering de importe
        try {
          const supabase = getSupabaseServerClient();

          // Si orderId no vino en custom_id, buscar por provider_order_id en public.payments
          if (!orderId && providerOrderId) {
            const { data: matchedPayment } = await supabase
              .from('payments')
              .select('order_id')
              .eq('provider_order_id', providerOrderId)
              .maybeSingle();

            if (matchedPayment?.order_id) {
              orderId = matchedPayment.order_id;
            }
          }

          if (orderId) {
            const { data: order } = await supabase
              .from('orders')
              .select('id, total, status, payment_status')
              .eq('id', orderId)
              .maybeSingle();

            if (order) {
              // Si ya estaba pagado, idempotencia
              if (order.payment_status === 'paid') {
                console.log(`ℹ️ Pedido ${orderId} ya figuraba como pagado.`);
                break;
              }

              // Anti-tampering de importe
              if (Math.abs(Number(order.total) - capturedAmount) > 0.01) {
                console.error(
                  `⚠️ Discrepancia en webhook: pedido ${order.total} € vs capturado ${capturedAmount} €`
                );
                await failOrderInDatabase({
                  orderId,
                  providerOrderId,
                  reason: `Discrepancia de importe en webhook: esperado ${order.total} €, recibido ${capturedAmount} €`,
                  status: 'failed',
                });
                break;
              }

              // Confirmación atómica e inscripción de pago
              await confirmOrderInDatabase({
                orderId,
                providerOrderId,
                captureId,
                amount: capturedAmount,
                method: 'paypal',
                metadata: {
                  webhook_event_id: webhookEvent.id,
                  event_type: eventType,
                  transmission_id: transmissionId,
                  received_at: new Date().toISOString(),
                },
              });

              console.log(`✅ Pedido ${orderId} confirmado y pasado a recibido vía webhook PAYMENT.CAPTURE.COMPLETED`);
            }
          }
        } catch (dbErr) {
          console.error('Error al procesar pedido en DB desde webhook:', dbErr);
        }
        break;
      }

      case 'PAYMENT.CAPTURE.DENIED': {
        const orderId = resource.custom_id;
        if (orderId) {
          await failOrderInDatabase({
            orderId,
            providerOrderId: resource.id,
            reason: 'Pago denegado por la pasarela de PayPal (PAYMENT.CAPTURE.DENIED)',
            status: 'failed',
          });
        }
        break;
      }

      case 'CHECKOUT.ORDER.CANCELLED': {
        const orderId = resource.purchase_units?.[0]?.custom_id || resource.id;
        if (orderId) {
          await failOrderInDatabase({
            orderId,
            providerOrderId: resource.id,
            reason: 'Sesión de PayPal cancelada por el usuario',
            status: 'cancelled',
          });
        }
        break;
      }

      default:
        // Otros eventos informativos reconocidos por PayPal
        break;
    }

    // Responder siempre 200 OK con confirmación
    return res.status(200).json({ received: true, event: eventType });
  } catch (err: any) {
    console.error('Excepción al procesar webhook de PayPal:', err);
    return res.status(500).json({ error: err.message || 'Error en webhook' });
  }
}
