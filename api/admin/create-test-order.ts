// ==============================================================================
// YA DELIVERY - ENDPOINT OFICIAL: CREACIÓN DE PEDIDO DE PRUEBA / ADMIN (0 €)
// Archivo: api/admin/create-test-order.ts (Vercel Serverless & Production)
// ==============================================================================

import type { IncomingMessage, ServerResponse } from 'http';
import { getSupabaseServerClient } from '../_lib/paypalServer.js';

interface RequestLike extends IncomingMessage {
  body?: any;
  query?: Record<string, any>;
  headers: Record<string, string | string[] | undefined>;
}

interface ResponseLike extends ServerResponse {
  status: (code: number) => ResponseLike;
  json: (data: any) => void;
}

function sendResponse(res: ResponseLike, status: number, data: any) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function parseJsonBody(req: RequestLike): Promise<any> {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }
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

export default async function handler(req: RequestLike, res: ResponseLike) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendResponse(res, 405, { error: 'Método no permitido. Utiliza POST.' });
  }

  try {
    const supabase = getSupabaseServerClient();

    // 1. Extraer token de autenticación
    const authHeader = (req.headers.authorization || req.headers.Authorization) as string | undefined;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      return sendResponse(res, 401, { error: 'No autorizado. Se requiere token de sesión.' });
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return sendResponse(res, 401, { error: 'Sesión inválida o expirada.' });
    }

    const userId = userData.user.id;

    // 2. Verificar rol admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name, phone')
      .eq('id', userId)
      .maybeSingle();

    if (profile?.role !== 'admin') {
      return sendResponse(res, 403, {
        error: 'Acceso denegado: solo administradores pueden crear pedidos de prueba gratuitos.',
      });
    }

    const body = await parseJsonBody(req);
    const { addressId, lines = [], notes, idempotencyKey } = body;

    if (!lines || lines.length === 0) {
      return sendResponse(res, 400, { error: 'El pedido de prueba debe contener al menos un artículo.' });
    }

    // 3. Soporte de IDEMPOTENCIA estricta:
    // Si se envía un idempotencyKey, comprobar si ya existe un pago con ese key
    if (idempotencyKey) {
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('id, order_id, status, amount, provider_capture_id')
        .eq('idempotency_key', idempotencyKey)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingPayment && existingPayment.order_id) {
        const { data: existingOrder } = await supabase
          .from('orders')
          .select('*')
          .eq('id', existingPayment.order_id)
          .maybeSingle();

        if (existingOrder) {
          return sendResponse(res, 200, {
            success: true,
            order_id: existingOrder.id,
            order_number: existingOrder.order_number,
            total: 0,
            nominal_subtotal: existingOrder.subtotal,
            status: existingOrder.status,
            is_test: true,
            idempotent_replay: true,
          });
        }
      }
    }

    // 4. Limpieza proactiva de capturas legacy con 'ADMIN-FREE-CAPTURE' constante
    await supabase
      .from('payments')
      .update({ provider_capture_id: `ADMIN-CAPTURE-${Date.now()}` })
      .eq('provider', 'admin_test')
      .eq('provider_capture_id', 'ADMIN-FREE-CAPTURE');

    // 5. Resolver dirección de entrega
    let addressSnapshot: any = null;
    let zoneId: string | null = null;

    if (addressId) {
      const { data: addr } = await supabase
        .from('addresses')
        .select('*')
        .eq('id', addressId)
        .maybeSingle();
      if (addr) {
        addressSnapshot = {
          name: addr.name || profile?.full_name || 'Admin YA',
          phone: addr.phone || profile?.phone || '600000000',
          street: addr.street,
          number: addr.number,
          floor_door: addr.floor_door,
          city: addr.city,
          postal_code: addr.postal_code,
          notes: addr.notes,
        };
      }
    }

    if (!addressSnapshot) {
      const { data: defaultAddr } = await supabase
        .from('addresses')
        .select('*')
        .eq('user_id', userId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (defaultAddr) {
        addressSnapshot = {
          name: defaultAddr.name || profile?.full_name || 'Admin YA',
          phone: defaultAddr.phone || profile?.phone || '600000000',
          street: defaultAddr.street,
          number: defaultAddr.number,
          floor_door: defaultAddr.floor_door,
          city: defaultAddr.city,
          postal_code: defaultAddr.postal_code,
          notes: defaultAddr.notes,
        };
      } else {
        addressSnapshot = {
          name: profile?.full_name || 'Administrador YA',
          phone: profile?.phone || '600000000',
          street: 'C/ Test Central',
          number: '1',
          city: 'Jerez de la Frontera',
          postal_code: '11402',
        };
      }
    }

    const { data: zone } = await supabase
      .from('delivery_zones')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    zoneId = zone?.id || null;

    // 6. Calcular productos y subtotales
    let nominalSubtotal = 0;
    const orderItemsToInsert: any[] = [];
    const sourcingQueue: any[] = [];

    for (const line of lines) {
      const isPack = Boolean(line.isPack || line.is_pack);
      const quantity = Math.max(1, Number(line.quantity) || 1);
      const refId = line.productId || line.product_id;

      if (isPack) {
        let packQuery = supabase.from('packs').select('*').eq('active', true);
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(refId);
        if (isUuid) {
          packQuery = packQuery.eq('id', refId);
        } else {
          packQuery = packQuery.eq('slug', refId);
        }
        const { data: pack } = await packQuery.maybeSingle();

        if (!pack) {
          return sendResponse(res, 400, { error: `Pack de prueba no encontrado o inactivo: ${refId}` });
        }

        const basePrice = Number(pack.price ?? pack.base_price ?? 0);
        let supplements = 0;
        const selections = line.selections || line.pack_selections || [];

        for (const sel of selections) {
          const sup = Number(sel.price_supplement ?? sel.priceSupplement ?? 0);
          const selQty = Math.max(1, Number(sel.quantity) || 1);
          supplements += sup * selQty;
        }

        const unitPrice = basePrice + supplements;
        const lineTotal = unitPrice * quantity;
        nominalSubtotal += lineTotal;

        orderItemsToInsert.push({
          is_pack: true,
          pack_id: pack.id,
          product_id: null,
          product_name: pack.name,
          unit_price: unitPrice,
          quantity,
          subtotal: lineTotal,
          pack_snapshot: {
            pack_id: pack.id,
            pack_name: pack.name,
            pack_type: pack.pack_type,
            base_price: basePrice,
            total_supplements: supplements,
            selections,
          },
        });
      } else {
        let prodQuery = supabase.from('products').select('*').eq('active', true);
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(refId);
        if (isUuid) {
          prodQuery = prodQuery.eq('id', refId);
        } else {
          prodQuery = prodQuery.eq('slug', refId);
        }
        const { data: prod } = await prodQuery.maybeSingle();

        if (!prod) {
          return sendResponse(res, 400, { error: `Producto de prueba no encontrado o inactivo: ${refId}` });
        }

        const unitPrice = Number(prod.price) || 0;
        const lineTotal = unitPrice * quantity;
        nominalSubtotal += lineTotal;

        orderItemsToInsert.push({
          is_pack: false,
          pack_id: null,
          product_id: prod.id,
          product_name: prod.name,
          unit_price: unitPrice,
          quantity,
          subtotal: lineTotal,
          pack_snapshot: null,
        });

        if (prod.stock_mode === 'on_demand') {
          sourcingQueue.push({
            product_id: prod.id,
            product_name: prod.name,
            quantity,
          });
        }
      }
    }

    // 7. Generar identificador de pedido único
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const orderNumber = `TEST-${dateStr}-${randomSuffix}`;

    // 8. Crear pedido en public.orders
    const { data: newOrder, error: orderErr } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        user_id: userId,
        status: 'received',
        subtotal: nominalSubtotal,
        delivery_fee: 0.0,
        discount_total: nominalSubtotal,
        total: 0.0,
        payment_method: 'test_order',
        payment_status: 'paid',
        delivery_address_snapshot: addressSnapshot,
        address_id: addressId || null,
        notes: notes || 'Pedido de prueba Admin (0 €)',
        delivery_zone_id: zoneId,
        is_test: true,
      })
      .select()
      .single();

    if (orderErr || !newOrder) {
      console.error('[Admin Test Order] Error al insertar pedido:', orderErr);
      return sendResponse(res, 500, { error: 'No se pudo crear el pedido en la base de datos: ' + orderErr?.message });
    }

    const orderId = newOrder.id;

    // 9. Insertar líneas de pedido en public.order_items
    const itemsWithOrderId = orderItemsToInsert.map((item) => ({
      ...item,
      order_id: orderId,
    }));

    const { data: insertedItems, error: itemsErr } = await supabase
      .from('order_items')
      .insert(itemsWithOrderId)
      .select('id, product_id');

    if (itemsErr) {
      console.error('[Admin Test Order] Error al insertar order_items:', itemsErr);
    }

    // 10. Abastecimiento si procede
    if (sourcingQueue.length > 0 && insertedItems) {
      for (const sItem of sourcingQueue) {
        const matchingItem = insertedItems.find((i) => i.product_id === sItem.product_id);
        await supabase.from('sourcing_items').insert({
          order_id: orderId,
          order_item_id: matchingItem?.id || null,
          product_id: sItem.product_id,
          product_name: sItem.product_name,
          quantity: sItem.quantity,
          status: 'pending',
          is_test: true,
          notes: 'Abastecimiento de prueba generado automáticamente',
        });
      }
    }

    // 11. REGISTRAR PAGO EN public.payments CON CAPTURE_ID ÚNICO POR PEDIDO
    // Provider capture ID garantizado único: 'ADMIN-CAPTURE-' + orderId
    const captureId = `ADMIN-CAPTURE-${orderId}`;
    const providerOrderId = `ADMIN-TEST-${orderId}`;

    const { data: existingPay } = await supabase
      .from('payments')
      .select('id')
      .eq('order_id', orderId)
      .maybeSingle();

    let paymentRecord: any = null;
    if (existingPay) {
      const { data: updatedPay, error: payErr } = await supabase
        .from('payments')
        .update({
          provider: 'admin_test',
          provider_order_id: providerOrderId,
          provider_capture_id: captureId,
          payment_method: 'test_order',
          status: 'paid',
          amount: 0.0,
          currency: 'EUR',
          idempotency_key: idempotencyKey || `admin_test_${orderId}`,
        })
        .eq('id', existingPay.id)
        .select()
        .single();

      if (payErr) {
        console.error('[Admin Test Order] Error al actualizar pago existente:', payErr);
        return sendResponse(res, 500, { error: 'Error al actualizar pago de prueba: ' + payErr.message });
      }
      paymentRecord = updatedPay;
    } else {
      const { data: insertedPay, error: payErr } = await supabase
        .from('payments')
        .insert({
          order_id: orderId,
          user_id: userId,
          provider: 'admin_test',
          provider_order_id: providerOrderId,
          provider_capture_id: captureId,
          payment_method: 'test_order',
          status: 'paid',
          amount: 0.0,
          currency: 'EUR',
          idempotency_key: idempotencyKey || `admin_test_${orderId}`,
          raw_payload: {
            mode: 'admin_test_free',
            created_by: userId,
            nominal_subtotal: nominalSubtotal,
            is_test: true,
          },
        })
        .select()
        .single();

      if (payErr) {
        console.error('[Admin Test Order] Error al insertar pago:', payErr);
        return sendResponse(res, 500, { error: 'Error al registrar el pago de prueba: ' + payErr.message });
      }
      paymentRecord = insertedPay;
    }

    return sendResponse(res, 200, {
      success: true,
      order_id: orderId,
      order_number: orderNumber,
      total: 0.0,
      nominal_subtotal: nominalSubtotal,
      status: 'received',
      is_test: true,
      payment_id: paymentRecord?.id,
      items_count: lines.length,
    });
  } catch (err: any) {
    console.error('[Admin Test Order] Error inesperado:', err);
    return sendResponse(res, 500, { error: err.message || 'Error inesperado al procesar pedido de prueba.' });
  }
}
