// ==============================================================================
// VERCEL SERVERLESS FUNCTION: /api/paypal/capture-order
// Captura los fondos de una orden autorizada en PayPal y actualiza el pedido en Supabase
// ==============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  capturePayPalOrderOnGateway,
  getSupabaseServerClient,
  verifyUserOwnsOrder,
} from '../../src/lib/paypalServer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { orderId, paypalOrderId, paymentMethod } = req.body || {};

    if (!orderId || !paypalOrderId) {
      return res.status(400).json({
        error: 'Faltan parámetros requeridos (orderId y paypalOrderId son obligatorios).',
      });
    }

    const supabase = getSupabaseServerClient();

    // 1. Obtener importe y estado actual del pedido en la base de datos
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, order_number, total, status, payment_status, user_id')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr) {
      return res.status(500).json({ error: `Error en base de datos: ${orderErr.message}` });
    }

    if (!order) {
      return res.status(404).json({ error: 'El pedido no existe en la base de datos de YA.' });
    }

    // 2. Idempotencia: Si el pedido ya figura como pagado, responder éxito inmediato sin alterar datos
    if (order.payment_status === 'paid') {
      return res.status(200).json({
        success: true,
        orderId: order.id,
        orderNumber: order.order_number,
        status: 'paid',
        alreadyPaid: true,
        message: 'El pedido ya estaba confirmado como pagado previamente.',
      });
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({
        error: 'El pedido fue cancelado y no puede capturarse.',
      });
    }

    // 3. Control estricto de estado: Solo se permite captura si está en payment_pending y pending
    if (order.status !== 'payment_pending' || order.payment_status !== 'pending') {
      return res.status(400).json({
        error: `El pedido no está en estado pendiente de pago (estado: ${order.status}, pago: ${order.payment_status}).`,
      });
    }

    // 4. Verificación de vinculación de orden PayPal: Validar contra public.payments (esquema real)
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('provider_order_id')
      .eq('order_id', order.id)
      .eq('provider', 'paypal')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!paypalOrderId && existingPayment?.provider_order_id) {
      paypalOrderId = existingPayment.provider_order_id;
    }

    if (existingPayment?.provider_order_id && paypalOrderId && existingPayment.provider_order_id !== paypalOrderId) {
      return res.status(400).json({
        error: `Discrepancia de seguridad: El pedido está vinculado a la orden PayPal ${existingPayment.provider_order_id} y se solicitó capturar ${paypalOrderId}.`,
      });
    }

    // 5. Autorización de usuario: Validar que el token de la petición coincida con el dueño del pedido
    if (order.user_id) {
      const authCheck = await verifyUserOwnsOrder(req.headers.authorization, order.user_id);
      if (!authCheck.authorized) {
        return res.status(403).json({
          error: authCheck.error || 'No tienes permisos para capturar el pago de este pedido ajeno.',
        });
      }
    }

    // 6. Importe autoritativo e inalterable desde la base de datos
    const authoritativeAmount = Number(order.total);

    // 7. Capturar fondos en la pasarela PayPal v2 API con validación de importe
    const captureResult = await capturePayPalOrderOnGateway({
      orderId: order.id,
      paypalOrderId,
      expectedAmount: authoritativeAmount,
      paymentMethod: paymentMethod || 'paypal',
    });

    return res.status(200).json(captureResult);
  } catch (err: any) {
    console.error('Error capturando orden en /api/paypal/capture-order:', err);
    const httpStatus = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 422;
    return res.status(httpStatus).json({
      error: err?.message || 'No se pudo capturar el pago en PayPal.',
      name: err?.paypalName || err?.name || 'PayPalCaptureError',
      message: err?.paypalMessage || err?.message || 'Error en validación de PayPal',
      debug_id: err?.debug_id || null,
      details: err?.details || [],
      links: err?.links || [],
    });
  }
}
