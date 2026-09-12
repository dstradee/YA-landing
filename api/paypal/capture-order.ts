// ==============================================================================
// VERCEL SERVERLESS FUNCTION: /api/paypal/capture-order
// Captura los fondos de una orden autorizada en PayPal y actualiza el pedido en Supabase
// ==============================================================================

import type { VercelRequest, VercelResponse } from '../_lib/types.ts';
import {
  capturePayPalOrderOnGateway,
  getSupabaseServerClient,
  verifyUserOwnsOrder,
} from '../_lib/paypalServer.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { orderId, paymentMethod } = req.body || {};
    let paypalOrderId = req.body?.paypalOrderId;

    if (!orderId && !paypalOrderId) {
      return res.status(400).json({
        error: 'Faltan parámetros requeridos (se requiere orderId o paypalOrderId).',
      });
    }

    const supabase = getSupabaseServerClient();

    // 1. Obtener pedido actual por UUID, por order_number (ej. YA-1013), o a través de paypalOrderId
    let order: any = null;

    if (orderId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
      const query = supabase
        .from('orders')
        .select('id, order_number, total, status, payment_status, user_id');

      const { data: foundOrder, error: orderErr } = await (isUuid
        ? query.eq('id', orderId)
        : query.eq('order_number', orderId)
      ).maybeSingle();

      if (orderErr) {
        return res.status(500).json({ error: `Error en base de datos: ${orderErr.message}` });
      }
      order = foundOrder;
    }

    // Si no se encontró por ID directo, buscar a través del registro en public.payments
    if (!order && paypalOrderId) {
      const { data: paymentRecord } = await supabase
        .from('payments')
        .select('order_id')
        .eq('provider_order_id', paypalOrderId)
        .in('provider', ['stripe', 'paypal'])
        .maybeSingle();

      if (paymentRecord?.order_id) {
        const { data: foundOrderByPay } = await supabase
          .from('orders')
          .select('id, order_number, total, status, payment_status, user_id')
          .eq('id', paymentRecord.order_id)
          .maybeSingle();
        order = foundOrderByPay;
      }
    }

    if (!order) {
      return res.status(404).json({ error: 'El pedido no existe en la base de datos de YA.' });
    }

    // 2. Idempotencia: Si el pedido ya figura como pagado y recibido, responder éxito inmediato
    if (order.payment_status === 'paid' && order.status === 'received') {
      return res.status(200).json({
        success: true,
        orderId: order.id,
        orderNumber: order.order_number,
        status: 'received',
        paymentStatus: 'paid',
        alreadyPaid: true,
        message: 'El pedido ya estaba confirmado como pagado previamente.',
      });
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({
        error: 'El pedido fue cancelado y no puede capturarse.',
      });
    }

    // 3. Verificación de vinculación de orden: Validar contra public.payments (esquema real)
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

    if (!paypalOrderId) {
      return res.status(400).json({
        error: 'No se encontró la orden de pago asociada a este pedido para confirmar el cobro.',
      });
    }

    if (existingPayment?.provider_order_id && paypalOrderId && existingPayment.provider_order_id !== paypalOrderId) {
      return res.status(400).json({
        error: `Discrepancia de seguridad: El pedido está vinculado a la orden ${existingPayment.provider_order_id} y se solicitó capturar ${paypalOrderId}.`,
      });
    }

    // 4. Si el pago ya fue marcado como 'paid' en public.payments, sincronizar orders inmediatamente
    if (existingPayment?.status === 'paid' && existingPayment?.provider_capture_id) {
      const nowIso = new Date().toISOString();
      await supabase
        .from('orders')
        .update({
          status: 'received',
          payment_status: 'paid',
          updated_at: nowIso,
        })
        .eq('id', order.id);

      return res.status(200).json({
        success: true,
        orderId: order.id,
        orderNumber: order.order_number,
        status: 'received',
        paymentStatus: 'paid',
        captureId: existingPayment.provider_capture_id,
        alreadyPaid: true,
      });
    }

    // 5. Autorización de usuario: Validar que el token de la petición coincida con el dueño del pedido (si se envía Authorization)
    if (order.user_id && req.headers.authorization) {
      const authCheck = await verifyUserOwnsOrder(req.headers.authorization, order.user_id);
      if (!authCheck.authorized) {
        return res.status(403).json({
          error: authCheck.error || 'No tienes permisos para capturar el pago de este pedido ajeno.',
        });
      }
    }

    // 6. Importe autoritativo e inalterable desde la base de datos
    const authoritativeAmount = Number(order.total);

    // 7. Capturar fondos o reconciliar en la pasarela PayPal v2 API con validación de importe
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
      error: err?.message || 'No se pudo capturar el pago en la pasarela.',
      name: err?.paypalName || err?.name || 'PaymentCaptureError',
      message: err?.paypalMessage || err?.message || 'Error en validación de la pasarela de pago',
      debug_id: err?.debug_id || null,
      details: err?.details || [],
      links: err?.links || [],
    });
  }
}
