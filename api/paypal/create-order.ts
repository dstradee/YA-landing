// ==============================================================================
// VERCEL SERVERLESS FUNCTION: /api/paypal/create-order
// Crea una orden en PayPal v2 vinculada a un pedido verificado de Supabase
// ==============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createPayPalOrderOnGateway,
  getSupabaseServerClient,
  verifyUserOwnsOrder,
} from '../../src/lib/paypalServer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { orderId, paymentMethod, returnUrl, cancelUrl } = req.body || {};

    if (!orderId) {
      return res.status(400).json({ error: 'Falta el identificador del pedido (orderId).' });
    }

    const supabase = getSupabaseServerClient();

    // 1. Consultar pedido en Supabase para obtener el estado e importe autoritativo del backend
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, order_number, total, status, payment_status, user_id')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr) {
      return res.status(500).json({ error: `Error al consultar pedido en Supabase: ${orderErr.message}` });
    }

    if (!order) {
      return res.status(404).json({ error: 'El pedido no existe en la base de datos de YA.' });
    }

    // 2. Control estricto de estado del pedido: debe ser payment_pending y pending
    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'Este pedido ya figura como pagado previamente.' });
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'El pedido fue cancelado y no admite nuevos pagos.' });
    }

    if (order.status !== 'payment_pending' || order.payment_status !== 'pending') {
      return res.status(400).json({
        error: `El pedido no está pendiente de pago (estado actual: ${order.status}, pago: ${order.payment_status}).`,
      });
    }

    // 3. Autorización de usuario: Validar que el token pertenezca al usuario propietario
    if (order.user_id) {
      const authCheck = await verifyUserOwnsOrder(req.headers.authorization, order.user_id);
      if (!authCheck.authorized) {
        return res.status(403).json({
          error: authCheck.error || 'No tienes autorización para operar sobre este pedido ajeno.',
        });
      }
    }

    // 4. Importe autoritativo e inalterable desde la base de datos (Anti-tampering)
    const authoritativeAmount = Number(order.total);
    const authoritativeOrderNumber = order.order_number;

    if (authoritativeAmount <= 0) {
      return res.status(400).json({ error: 'El importe del pedido no es válido.' });
    }

    // 5. Crear la orden en PayPal Orders v2 API
    const result = await createPayPalOrderOnGateway({
      orderId: order.id,
      orderNumber: authoritativeOrderNumber,
      amount: authoritativeAmount,
      currency: 'EUR',
      paymentMethod: paymentMethod || 'paypal',
      returnUrl,
      cancelUrl,
    });

    // 6. Persistir el intento de pago e ID de orden PayPal en public.payments (esquema real)
    if (result?.paypalOrderId) {
      await supabase
        .from('payments')
        .insert({
          order_id: order.id,
          user_id: order.user_id,
          provider: 'paypal',
          provider_order_id: result.paypalOrderId,
          payment_method: paymentMethod || 'paypal',
          status: 'pending',
          amount: authoritativeAmount,
          currency: 'EUR',
          raw_payload: { paypal_order_id: result.paypalOrderId },
        });
    }

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('Error en /api/paypal/create-order:', err);
    return res.status(500).json({
      error: err?.message || 'Error interno al crear la orden de pago en PayPal.',
    });
  }
}
