// ==============================================================================
// YA DELIVERY - DEV SERVER MIDDLEWARE PARA APIS DE PAYPAL
// Permite que /api/paypal/* funcione tanto en Vite dev local como en Vercel
// ==============================================================================

import type { IncomingMessage, ServerResponse } from 'http';
import {
  createPayPalOrderOnGateway,
  capturePayPalOrderOnGateway,
  getSupabaseServerClient,
  confirmOrderInDatabase,
  verifyPayPalWebhookSignature,
  isPayPalSandbox,
} from './paypalServer';

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: string | Buffer) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: any) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export async function handlePayPalDevRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
) {
  const url = req.url?.split('?')[0];

  if (!url?.startsWith('/api/paypal/') && !url?.startsWith('/api/stripe/')) {
    return next();
  }

  try {
    // 1. /api/paypal/config
    if (url === '/api/paypal/config' && req.method === 'GET') {
      const hasRealCredentials = Boolean(process.env.STRIPE_SECRET_KEY);
      const publishableKey = process.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

      return sendJson(res, 200, {
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
    }

    // 2. /api/paypal/create-order
    if (url === '/api/paypal/create-order' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { orderId, paymentMethod, returnUrl, cancelUrl } = body;

      if (!orderId) {
        return sendJson(res, 400, { error: 'Falta orderId' });
      }

      const supabase = getSupabaseServerClient();
      let orderTotal = Number(body.amount || 10.0);
      let orderNumber = `YA-${Date.now().toString().slice(-4)}`;
      let orderUserId: string | null = null;

      if (supabase) {
        const { data: order, error: orderErr } = await supabase
          .from('orders')
          .select('id, order_number, total, status, payment_status, user_id')
          .eq('id', orderId)
          .maybeSingle();

        if (orderErr) {
          return sendJson(res, 500, { error: orderErr.message });
        }
        if (!order) {
          return sendJson(res, 404, { error: 'El pedido no existe en YA.' });
        }
        if (order.payment_status === 'paid') {
          return sendJson(res, 400, { error: 'Este pedido ya está pagado.' });
        }
        if (order.status !== 'payment_pending' || order.payment_status !== 'pending') {
          return sendJson(res, 400, {
            error: `El pedido no está pendiente de pago (estado: ${order.status}, pago: ${order.payment_status}).`,
          });
        }

        orderTotal = Number(order.total);
        orderNumber = order.order_number;
        orderUserId = order.user_id;
      }

      const result = await createPayPalOrderOnGateway({
        orderId,
        orderNumber,
        amount: orderTotal,
        currency: 'EUR',
        paymentMethod,
        returnUrl,
        cancelUrl,
      });

      if (supabase && result?.paypalOrderId) {
        await supabase
          .from('payments')
          .insert({
            order_id: orderId,
            user_id: orderUserId,
            provider: 'stripe',
            provider_order_id: result.paypalOrderId,
            payment_method: paymentMethod || 'card',
            status: 'pending',
            amount: orderTotal,
            currency: 'EUR',
            raw_payload: { stripe_session_id: result.paypalOrderId },
          });
      }

      return sendJson(res, 200, result);
    }

    // 3. /api/paypal/capture-order
    if (url === '/api/paypal/capture-order' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      let { orderId, paymentMethod } = body;
      let paypalOrderId = body.paypalOrderId;

      if (!orderId && !paypalOrderId) {
        return sendJson(res, 400, {
          error: 'Falta el parámetro requerido orderId o paypalOrderId.',
        });
      }

      const supabase = getSupabaseServerClient();
      let expectedAmount = Number(body.amount || 10.0);

      if (supabase) {
        const isUuid = orderId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
        let orderQuery = supabase
          .from('orders')
          .select('id, total, status, payment_status, order_number, user_id');

        let { data: order, error: orderErr } = await (isUuid
          ? orderQuery.eq('id', orderId)
          : orderId ? orderQuery.eq('order_number', orderId) : orderQuery.eq('id', '00000000-0000-0000-0000-000000000000')
        ).maybeSingle();

        if (!order && paypalOrderId) {
          const { data: payRec } = await supabase
            .from('payments')
            .select('order_id')
            .eq('provider_order_id', paypalOrderId)
            .in('provider', ['stripe', 'paypal'])
            .maybeSingle();

          if (payRec?.order_id) {
            const { data: foundByPay } = await supabase
              .from('orders')
              .select('id, total, status, payment_status, order_number, user_id')
              .eq('id', payRec.order_id)
              .maybeSingle();
            order = foundByPay;
          }
        }

        if (orderErr) {
          return sendJson(res, 500, { error: orderErr.message });
        }
        if (!order) {
          return sendJson(res, 404, { error: 'El pedido no existe en YA.' });
        }

        orderId = order.id;

        if (order.payment_status === 'paid' && order.status === 'received') {
          return sendJson(res, 200, {
            success: true,
            orderId: order.id,
            orderNumber: order.order_number,
            status: 'received',
            paymentStatus: 'paid',
            alreadyPaid: true,
            message: 'El pedido ya estaba confirmado como pagado.',
          });
        }

        // Relación: comprobar que la orden coincide si ya fue registrada en payments
        const { data: existingPayment } = await supabase
          .from('payments')
          .select('id, provider_order_id, provider_capture_id, status')
          .eq('order_id', order.id)
          .in('provider', ['stripe', 'paypal'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!paypalOrderId && existingPayment?.provider_order_id) {
          paypalOrderId = existingPayment.provider_order_id;
        }

        if (existingPayment?.status === 'paid' && existingPayment?.provider_capture_id) {
          await supabase
            .from('orders')
            .update({
              status: 'received',
              payment_status: 'paid',
              updated_at: new Date().toISOString(),
            })
            .eq('id', order.id);

          return sendJson(res, 200, {
            success: true,
            orderId: order.id,
            orderNumber: order.order_number,
            status: 'received',
            paymentStatus: 'paid',
            captureId: existingPayment.provider_capture_id,
            alreadyPaid: true,
          });
        }

        if (existingPayment?.provider_order_id && paypalOrderId && existingPayment.provider_order_id !== paypalOrderId) {
          return sendJson(res, 400, {
            error: 'Inconsistencia de seguridad: el identificador de orden no coincide con el registrado para este pedido.',
          });
        }

        expectedAmount = Number(order.total);
      }

      if (!paypalOrderId) {
        return sendJson(res, 400, {
          error: 'Falta el identificador de orden de pago (paypalOrderId).',
        });
      }

      try {
        const captureResult = await capturePayPalOrderOnGateway({
          orderId,
          paypalOrderId,
          expectedAmount,
          paymentMethod,
        });

        return sendJson(res, 200, captureResult);
      } catch (captureErr: any) {
        console.error('Error capturando orden en dev middleware:', captureErr);
        const httpStatus = typeof captureErr?.status === 'number' && captureErr.status >= 400 && captureErr.status < 600 ? captureErr.status : 422;
        return sendJson(res, httpStatus, {
          error: captureErr?.message || 'No se pudo capturar el pago en la pasarela.',
          name: captureErr?.paypalName || captureErr?.name || 'PaymentCaptureError',
          message: captureErr?.paypalMessage || captureErr?.message || 'Error en validación de pago',
          debug_id: captureErr?.debug_id || null,
          details: captureErr?.details || [],
          links: captureErr?.links || [],
        });
      }
    }

    // 4. /api/paypal/webhook
    if (url === '/api/paypal/webhook' && req.method === 'POST') {
      const webhookEvent = await parseJsonBody(req);
      if (!webhookEvent?.event_type) {
        return sendJson(res, 400, { error: 'Evento inválido' });
      }

      // Validación criptográfica estricta de firma de webhook PayPal
      const authAlgo = String(req.headers['paypal-auth-algo'] || '');
      const certUrl = String(req.headers['paypal-cert-url'] || '');
      const transmissionId = String(req.headers['paypal-transmission-id'] || '');
      const transmissionSig = String(req.headers['paypal-transmission-sig'] || '');
      const transmissionTime = String(req.headers['paypal-transmission-time'] || '');

      const isSignatureProvided = Boolean(
        authAlgo && certUrl && transmissionId && transmissionSig && transmissionTime
      );

      if (isSignatureProvided) {
        const isVerified = await verifyPayPalWebhookSignature({
          authAlgo,
          certUrl,
          transmissionId,
          transmissionSig,
          transmissionTime,
          webhookEvent,
        });

        if (!isVerified) {
          console.error('Firma de webhook de PayPal INVÁLIDA o rechazada por la pasarela.');
          return sendJson(res, 401, { error: 'Firma criptográfica de webhook PayPal no válida.' });
        }
      } else if (!isPayPalSandbox) {
        return sendJson(res, 400, {
          error: 'Faltan encabezados de verificación criptográfica de PayPal.',
        });
      }

      const eventType = webhookEvent.event_type;
      const resource = webhookEvent.resource || {};
      const captureId = resource.id;

      // Obtener el orderId del pedido YA desde custom_id
      let orderId = resource.custom_id || resource.supplementary_data?.related_ids?.order_id;
      const paypalOrderId = resource.supplementary_data?.related_ids?.order_id || captureId;

      if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
        const capturedAmount = Number(resource.amount?.value || 0);
        const capturedCurrency = resource.amount?.currency_code || 'EUR';

        // Verificación estricta de divisa
        if (capturedCurrency !== 'EUR') {
          console.warn(`Webhook ignorado: divisa no permitida ${capturedCurrency}`);
          return sendJson(res, 400, { error: 'Divisa no válida. Se requiere EUR.' });
        }

        const supabase = getSupabaseServerClient();
        if (supabase) {
          if (!orderId && paypalOrderId) {
            const { data: matchedPayment } = await supabase
              .from('payments')
              .select('order_id')
              .eq('provider_order_id', paypalOrderId)
              .maybeSingle();

            if (matchedPayment?.order_id) {
              orderId = matchedPayment.order_id;
            }
          }

          if (orderId) {
            const { data: dbOrder } = await supabase
              .from('orders')
              .select('id, total, status, payment_status')
              .eq('id', orderId)
              .maybeSingle();

            if (dbOrder) {
              if (dbOrder.payment_status === 'paid') {
                return sendJson(res, 200, { received: true, alreadyPaid: true });
              }

              if (Math.abs(Number(dbOrder.total) - capturedAmount) > 0.01) {
                console.error(
                  `Discrepancia de monto en webhook: esperado ${dbOrder.total}, recibido ${capturedAmount}`
                );
                return sendJson(res, 400, { error: 'Discrepancia de importe en captura.' });
              }

              await confirmOrderInDatabase({
                orderId,
                providerOrderId: paypalOrderId,
                captureId,
                amount: capturedAmount,
                method: 'paypal',
                metadata: {
                  webhook: true,
                  event_type: eventType,
                  event_id: webhookEvent.id,
                  verified: isSignatureProvided,
                },
              });
            }
          }
        }
      }

      return sendJson(res, 200, { received: true, event: eventType });
    }

    return next();
  } catch (err: any) {
    console.error('Error procesando petición en dev server PayPal:', err);
    return sendJson(res, 500, { error: err?.message || 'Error en middleware de PayPal' });
  }
}
