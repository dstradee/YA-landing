// ==============================================================================
// YA DELIVERY - SERVICIO DE NOTIFICACIONES TELEGRAM (ADMINISTRADOR)
// Archivo: api/_lib/telegram.ts (Server-side exclusivo)
// ==============================================================================

import { getBaseAppUrl, getSupabaseServerClient } from './paypalServer.js';

// Cache en memoria para prevenir notificaciones duplicadas en carreras concurrentes
const notifiedOrderIds = new Set<string>();

export interface SendTelegramOrderNotificationParams {
  orderId: string;
  orderNumber?: string;
  total: number;
  paymentMethod?: string;
  userId?: string | null;
  deliveryAddressSnapshot?: any;
  isTest?: boolean;
}

/**
 * Mapeo descriptivo para métodos de pago
 */
function formatPaymentMethod(method?: string): string {
  const m = (method || '').toLowerCase().trim();
  if (m === 'card' || m === 'tarjeta' || m === 'stripe') return 'Tarjeta';
  if (m === 'paypal') return 'PayPal';
  if (m === 'cash' || m === 'efectivo') return 'Efectivo';
  if (m === 'bizum') return 'Bizum';
  return method ? method.charAt(0).toUpperCase() + method.slice(1) : 'Tarjeta';
}

/**
 * Formatea un importe a moneda española (ej: 24,50 €)
 */
function formatCurrency(amount: number): string {
  const num = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `${num.toFixed(2).replace('.', ',')} €`;
}

/**
 * Envía un mensaje a través de la Telegram Bot API
 */
async function callTelegramSendMessage(payload: {
  text: string;
  reply_markup?: {
    inline_keyboard: Array<Array<{ text: string; url: string }>>;
  };
}): Promise<{ ok: boolean; description?: string; result?: any }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!token || !chatId) {
    console.warn(
      '⚠️ [Telegram] Notificación omitida: TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no están configurados en las variables de entorno del servidor.'
    );
    return { ok: false, description: 'Credenciales de Telegram no configuradas' };
  }

  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: payload.text,
      reply_markup: payload.reply_markup,
    }),
  });

  const data = (await res.json()) as { ok: boolean; description?: string; result?: any };
  return data;
}

/**
 * Envía la notificación de nuevo pedido real pagado al Telegram del Administrador.
 * Es idempotente y no bloqueante (nunca interrumpe el pedido si Telegram falla).
 */
export async function sendTelegramOrderNotification(
  params: SendTelegramOrderNotificationParams
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  try {
    // 1. Omitir pedidos de prueba explícitos para no generar falsas alertas de entrega real
    if (params.isTest) {
      return { success: true, skipped: true };
    }

    // 2. Idempotencia local en memoria
    if (notifiedOrderIds.has(params.orderId)) {
      return { success: true, skipped: true };
    }

    const supabase = getSupabaseServerClient();

    // 3. Idempotencia persistente: verificar si ya fue notificado en public.payments
    const { data: existingPayments } = await supabase
      .from('payments')
      .select('raw_payload')
      .eq('order_id', params.orderId)
      .limit(5);

    const alreadyNotified = (existingPayments || []).some(
      (p: any) => p.raw_payload && p.raw_payload.telegram_notified === true
    );

    if (alreadyNotified) {
      notifiedOrderIds.add(params.orderId);
      return { success: true, skipped: true };
    }

    // 4. Resolver nombre del cliente
    let customerName = 'Cliente YA';
    if (params.deliveryAddressSnapshot && typeof params.deliveryAddressSnapshot === 'object') {
      if (params.deliveryAddressSnapshot.name) {
        customerName = params.deliveryAddressSnapshot.name.trim();
      }
    }

    if (customerName === 'Cliente YA' && params.userId) {
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', params.userId)
          .maybeSingle();

        if (prof?.full_name?.trim()) {
          customerName = prof.full_name.trim();
        }
      } catch {
        // Fallback a Cliente YA
      }
    }

    // 5. Construir enlace de administración directo
    const baseUrl = getBaseAppUrl();
    const adminOrderUrl = `${baseUrl}/admin/pedidos/${params.orderId}`;
    const formattedOrderNumber = (params.orderNumber || params.orderId).replace(/^#/, '');

    // 6. Formatear mensaje exacto solicitado por el usuario
    const messageText = [
      '🟢 NUEVO PEDIDO YA',
      '',
      `Pedido: #${formattedOrderNumber}`,
      `Cliente: ${customerName}`,
      `Total: ${formatCurrency(params.total)}`,
      `Pago: ${formatPaymentMethod(params.paymentMethod)}`,
    ].join('\n');

    // 7. Enviar a Telegram Bot API con botón en línea "ABRIR PEDIDO"
    const tgResult = await callTelegramSendMessage({
      text: messageText,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'ABRIR PEDIDO',
              url: adminOrderUrl,
            },
          ],
        ],
      },
    });

    if (!tgResult.ok) {
      console.error('⚠️ [Telegram] Error devuelto por Telegram API:', tgResult.description);
      return { success: false, error: tgResult.description };
    }

    // 8. Marcar como notificado para garantizar idempotencia futura
    notifiedOrderIds.add(params.orderId);

    // Guardar flag de notificación en el registro de pago más reciente
    try {
      const { data: latestPayment } = await supabase
        .from('payments')
        .select('id, raw_payload')
        .eq('order_id', params.orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestPayment?.id) {
        const updatedPayload = {
          ...(latestPayment.raw_payload || {}),
          telegram_notified: true,
          telegram_notified_at: new Date().toISOString(),
        };

        await supabase
          .from('payments')
          .update({ raw_payload: updatedPayload })
          .eq('id', latestPayment.id);
      }
    } catch {
      // No crítico si el update falla
    }

    console.log(`✅ [Telegram] Notificación enviada para pedido #${formattedOrderNumber}`);
    return { success: true };
  } catch (err: any) {
    console.error('⚠️ [Telegram] Excepción no bloqueante al enviar notificación:', err?.message || err);
    return { success: false, error: err?.message };
  }
}

/**
 * Envía el mensaje de prueba solicitado por el administrador para validar credenciales.
 */
export async function sendTelegramAdminTestMessage(): Promise<{
  success: boolean;
  error?: string;
  details?: any;
}> {
  const testMessage = ['🟢 YA TELEGRAM OK', '', 'Las credenciales funcionan correctamente.'].join('\n');

  const tgResult = await callTelegramSendMessage({
    text: testMessage,
  });

  if (!tgResult.ok) {
    return {
      success: false,
      error: tgResult.description || 'Error al comunicarse con Telegram Bot API.',
    };
  }

  return {
    success: true,
    details: tgResult.result,
  };
}
