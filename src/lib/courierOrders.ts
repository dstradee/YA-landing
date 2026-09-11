import { supabase, isSupabaseConfigured } from './supabase';
import type {
  DbCourier,
  DbOrder,
  DbOrderItem,
  DbProfile,
  CourierOrderListItem,
  CourierOrderDetail,
  CourierDaySummary,
  CourierOrderEarningsCalculation,
  CourierEarningsSummary,
  CourierDeliveredOrderEarningsItem,
  Address,
} from '../types/app';

/**
 * Obtiene el perfil de repartidor y usuario del usuario actualmente autenticado
 */
export async function courierFetchCurrentProfile(): Promise<{
  courier: DbCourier | null;
  profile: DbProfile | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return { courier: null, profile: null, error: 'Supabase no está configurado.' };
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { courier: null, profile: null, error: 'No hay sesión activa.' };
    }

    // 1. Obtener perfil
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profileData) {
      return { courier: null, profile: null, error: profileError?.message || 'Perfil no encontrado.' };
    }

    // 2. Obtener registro de couriers
    const { data: courierData, error: courierError } = await supabase
      .from('couriers')
      .select('*')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (courierError) {
      return { courier: null, profile: profileData as DbProfile, error: courierError.message };
    }

    if (!courierData) {
      return {
        courier: null,
        profile: profileData as DbProfile,
        error: 'Tu usuario no está registrado como repartidor en YA.',
      };
    }

    const courier: DbCourier = {
      id: courierData.id,
      profile_id: courierData.profile_id,
      vehicle_type: courierData.vehicle_type || null,
      active: Boolean(courierData.active),
      available: Boolean(courierData.available ?? false),
      commission_percent: Number(courierData.commission_percent ?? 0),
      fixed_fee: Number(courierData.fixed_fee ?? 0),
      notes: courierData.notes || null,
      created_at: courierData.created_at,
      updated_at: courierData.updated_at,
    };

    return { courier, profile: profileData as DbProfile, error: null };
  } catch (err: unknown) {
    return {
      courier: null,
      profile: null,
      error: err instanceof Error ? err.message : 'Error inesperado al cargar datos del repartidor.',
    };
  }
}

/**
 * Cambia la disponibilidad operativa del repartidor autenticado.
 * Regla de negocio: Si active === false, NO puede ponerse disponible.
 */
export async function courierSetAvailability(
  newAvailable: boolean
): Promise<{ success: boolean; available: boolean; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { success: false, available: false, error: 'Supabase no está configurado.' };
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, available: false, error: 'No hay sesión de usuario activa.' };
    }

    // 1. Intentar primero RPC transaccional
    const { data: rpcData, error: rpcError } = await supabase.rpc('courier_set_availability', {
      p_available: newAvailable,
    });

    if (!rpcError && rpcData?.success) {
      return { success: true, available: Boolean(rpcData.available), error: null };
    }

    if (rpcError && rpcError.code !== 'PGRST202' && !rpcError.message.includes('not found')) {
      // Error de negocio arrojado por la RPC (por ejemplo cuenta inactiva)
      return { success: false, available: false, error: rpcError.message };
    }

    // 2. Fallback con verificación directa en cliente
    const { data: courierRecord, error: fetchError } = await supabase
      .from('couriers')
      .select('id, active')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (fetchError || !courierRecord) {
      return { success: false, available: false, error: 'Perfil de repartidor no encontrado.' };
    }

    if (!courierRecord.active && newAvailable) {
      return {
        success: false,
        available: false,
        error: 'Tu cuenta de repartidor está desactivada por administración. No puedes ponerte disponible.',
      };
    }

    const { data: updated, error: updateError } = await supabase
      .from('couriers')
      .update({
        available: newAvailable,
        updated_at: new Date().toISOString(),
      })
      .eq('profile_id', user.id)
      .select('available')
      .single();

    if (updateError) {
      return { success: false, available: false, error: updateError.message };
    }

    return { success: true, available: Boolean(updated?.available), error: null };
  } catch (err: unknown) {
    return {
      success: false,
      available: false,
      error: err instanceof Error ? err.message : 'Error al cambiar la disponibilidad.',
    };
  }
}

/**
 * Resumen de pedidos del día para el repartidor autenticado
 */
export async function courierFetchDaySummary(courierId: string): Promise<{
  summary: CourierDaySummary;
  error: string | null;
}> {
  const fallback: CourierDaySummary = {
    assignedPending: 0,
    inProgress: 0,
    deliveredToday: 0,
    totalDelivered: 0,
  };

  if (!isSupabaseConfigured || !courierId) {
    return { summary: fallback, error: null };
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, status, created_at, updated_at, delivered_at')
      .eq('courier_id', courierId);

    if (error) {
      // Si la columna delivered_at no existe aún en la BD remota, reintentar sin ella
      if (error.message.includes('delivered_at')) {
        const { data: fallbackData } = await supabase
          .from('orders')
          .select('id, status, created_at, updated_at')
          .eq('courier_id', courierId);

        return processSummaryRows(fallbackData || []);
      }
      return { summary: fallback, error: error.message };
    }

    return processSummaryRows(data || []);
  } catch (err: unknown) {
    return {
      summary: fallback,
      error: err instanceof Error ? err.message : 'Error calculando resumen.',
    };
  }
}

function processSummaryRows(rows: any[]): { summary: CourierDaySummary; error: null } {
  const today = new Date().toISOString().slice(0, 10);
  let assignedPending = 0;
  let inProgress = 0;
  let deliveredToday = 0;
  let totalDelivered = 0;

  for (const row of rows) {
    const status = row.status;
    if (status === 'delivering') {
      inProgress++;
    } else if (status === 'delivered') {
      totalDelivered++;
      const deliveredDate = (row.delivered_at || row.updated_at || '').slice(0, 10);
      if (deliveredDate === today) {
        deliveredToday++;
      }
    } else if (['received', 'preparing', 'sourcing', 'prepared'].includes(status)) {
      assignedPending++;
    }
  }

  return {
    summary: {
      assignedPending,
      inProgress,
      deliveredToday,
      totalDelivered,
    },
    error: null,
  };
}

/**
 * Obtiene los pedidos asignados al repartidor autenticado
 */
export async function courierFetchOrders(params: {
  courierId: string;
  filter?: 'active' | 'delivered' | 'all';
}): Promise<{ orders: CourierOrderListItem[]; error: string | null }> {
  if (!isSupabaseConfigured || !params.courierId) {
    return { orders: [], error: null };
  }

  try {
    let query = supabase
      .from('orders')
      .select('*')
      .eq('courier_id', params.courierId);

    if (params.filter === 'active') {
      query = query.in('status', ['received', 'preparing', 'sourcing', 'prepared', 'delivering']);
    } else if (params.filter === 'delivered') {
      query = query.eq('status', 'delivered');
    }

    query = query.order('created_at', { ascending: false });

    const { data: ordersData, error: ordersError } = await query;
    if (ordersError) {
      return { orders: [], error: ordersError.message };
    }

    const orders = (ordersData || []) as DbOrder[];
    if (orders.length === 0) {
      return { orders: [], error: null };
    }

    const orderIds = orders.map((o) => o.id);

    // Obtener recuento de items
    const { data: itemsData } = await supabase
      .from('order_items')
      .select('order_id, quantity')
      .in('order_id', orderIds);

    const itemsCountMap = new Map<string, number>();
    if (itemsData) {
      for (const item of itemsData) {
        const cur = itemsCountMap.get(item.order_id) || 0;
        itemsCountMap.set(item.order_id, cur + (item.quantity || 1));
      }
    }

    // Obtener perfiles de clientes si hace falta para el nombre o teléfono
    const userIds = Array.from(new Set(orders.map((o) => o.user_id).filter(Boolean))) as string[];
    const profileMap = new Map<string, { full_name: string; phone: string | null }>();

    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', userIds);

      if (profilesData) {
        for (const p of profilesData) {
          profileMap.set(p.id, p);
        }
      }
    }

    const result: CourierOrderListItem[] = orders.map((order) => {
      const snapshot = order.delivery_address_snapshot as Address | null;
      const profile = order.user_id ? profileMap.get(order.user_id) : null;
      const customerName = snapshot?.name || profile?.full_name || 'Cliente YA';
      const customerPhone = snapshot?.phone || profile?.phone || null;

      return {
        ...order,
        itemsCount: itemsCountMap.get(order.id) || 0,
        customerName,
        customerPhone,
        deliveryAddress: snapshot || null,
      };
    });

    return { orders: result, error: null };
  } catch (err: unknown) {
    return {
      orders: [],
      error: err instanceof Error ? err.message : 'Error al obtener pedidos del repartidor.',
    };
  }
}

/**
 * Obtiene el detalle de un pedido asignado al repartidor
 */
export async function courierFetchOrderDetail(params: {
  orderId: string;
  courierId: string;
}): Promise<{ order: CourierOrderDetail | null; error: string | null }> {
  if (!isSupabaseConfigured || !params.orderId) {
    return { order: null, error: 'Identificador de pedido no proporcionado.' };
  }

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.orderId);

    let query = supabase.from('orders').select('*');
    if (isUuid) {
      query = query.eq('id', params.orderId);
    } else {
      query = query.eq('order_number', params.orderId);
    }

    const { data: orderData, error: orderError } = await query.maybeSingle();

    if (orderError) {
      return { order: null, error: orderError.message };
    }

    if (!orderData) {
      return { order: null, error: 'Pedido no encontrado.' };
    }

    const order = orderData as DbOrder;

    // Validación de seguridad de asignación:
    // Si no es el repartidor asignado, no puede ver el pedido
    if (order.courier_id !== params.courierId) {
      return {
        order: null,
        error: 'Acceso denegado: Este pedido no está asignado a tu cuenta de repartidor.',
      };
    }

    // Obtener items del pedido
    const { data: itemsData, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', order.id)
      .order('created_at', { ascending: true });

    if (itemsError) {
      return { order: null, error: itemsError.message };
    }

    // Obtener cliente
    let customerName = 'Cliente YA';
    let customerPhone: string | null = null;

    const snapshot = order.delivery_address_snapshot as Address | null;
    if (snapshot?.name) {
      customerName = snapshot.name;
      customerPhone = snapshot.phone || null;
    } else if (order.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', order.user_id)
        .maybeSingle();

      if (profile) {
        customerName = profile.full_name;
        customerPhone = profile.phone;
      }
    }

    const detail: CourierOrderDetail = {
      ...order,
      customerName,
      customerPhone,
      deliveryAddress: snapshot || null,
      items: (itemsData || []) as DbOrderItem[],
    };

    return { order: detail, error: null };
  } catch (err: unknown) {
    return {
      order: null,
      error: err instanceof Error ? err.message : 'Error inesperado al cargar el detalle.',
    };
  }
}

/**
 * Transición de estado del pedido por el repartidor con validación estricta de backend
 */
export async function courierUpdateOrderStatus(params: {
  orderId: string;
  courierId: string;
  action: 'accept' | 'delivering' | 'delivered';
}): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  try {
    // 1. Intentar RPC segura de PostgreSQL primero
    const { data: rpcData, error: rpcError } = await supabase.rpc('courier_update_order_status', {
      p_order_id: params.orderId,
      p_action: params.action,
    });

    if (!rpcError && rpcData?.success) {
      return { success: true, error: null };
    }

    if (rpcError && rpcError.code !== 'PGRST202' && !rpcError.message.includes('not found')) {
      return { success: false, error: rpcError.message };
    }

    // 2. Fallback directo con comprobaciones de seguridad estrictas
    // Verificar que el pedido existe y pertenece a este courier
    const { data: orderData, error: orderFetchError } = await supabase
      .from('orders')
      .select('id, courier_id, status, payment_status')
      .eq('id', params.orderId)
      .maybeSingle();

    if (orderFetchError || !orderData) {
      return { success: false, error: 'Pedido no encontrado.' };
    }

    if (orderData.courier_id !== params.courierId) {
      return {
        success: false,
        error: 'Acceso denegado: este pedido no está asignado a tu cuenta.',
      };
    }

    // Comprobación de pago
    if (orderData.payment_status === 'pending' || orderData.status === 'payment_pending') {
      return {
        success: false,
        error: 'Este pedido tiene el pago pendiente. No puede tramitarse hasta que se confirme el pago.',
      };
    }

    if (orderData.status === 'delivered') {
      return { success: false, error: 'El pedido ya fue marcado como entregado anteriormente.' };
    }

    if (orderData.status === 'cancelled') {
      return { success: false, error: 'El pedido está cancelado y no puede procesarse.' };
    }

    const now = new Date().toISOString();
    let updates: Record<string, any> = { updated_at: now };

    if (params.action === 'accept') {
      // Si está en received, pasa a preparing; si ya estaba preparado, se mantiene
      updates.status = orderData.status === 'received' ? 'preparing' : orderData.status;
      updates.courier_accepted_at = now;
    } else if (params.action === 'delivering') {
      updates.status = 'delivering';
    } else if (params.action === 'delivered') {
      updates.status = 'delivered';
      updates.delivered_at = now;
    } else {
      return { success: false, error: 'Acción no reconocida.' };
    }

    // Intentar actualización completa
    let updateResult = await supabase
      .from('orders')
      .update(updates)
      .eq('id', params.orderId)
      .eq('courier_id', params.courierId);

    // Si falla porque delivered_at o courier_accepted_at aún no existen en el esquema remoto
    if (updateResult.error && (updateResult.error.message.includes('delivered_at') || updateResult.error.message.includes('courier_accepted_at'))) {
      delete updates.delivered_at;
      delete updates.courier_accepted_at;
      updateResult = await supabase
        .from('orders')
        .update(updates)
        .eq('id', params.orderId)
        .eq('courier_id', params.courierId);
    }

    if (updateResult.error) {
      return { success: false, error: updateResult.error.message };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al actualizar el pedido.',
    };
  }
}

/**
 * Obtiene los pedidos disponibles (status = 'received', payment_status = 'paid', courier_id IS NULL)
 * Solo para repartidores autenticados activos y disponibles.
 */
export async function courierFetchAvailableOrders(): Promise<{
  orders: CourierOrderListItem[];
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return { orders: [], error: null };
  }

  try {
    // 1. Intentar RPC segura de PostgreSQL primero
    const { data: rpcData, error: rpcError } = await supabase.rpc('courier_get_available_orders');

    if (!rpcError && Array.isArray(rpcData)) {
      const orders: CourierOrderListItem[] = rpcData.map((raw: any) => {
        const snapshot = raw.delivery_address_snapshot as Address | null;
        return {
          ...raw,
          itemsCount: Number(raw.items_count || 0),
          customerName: snapshot?.name || 'Cliente YA',
          customerPhone: snapshot?.phone || null,
          deliveryAddress: snapshot || null,
        };
      });
      return { orders, error: null };
    }

    // 2. Fallback con consulta directa
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .is('courier_id', null)
      .eq('status', 'received')
      .eq('payment_status', 'paid')
      .order('created_at', { ascending: true });

    if (ordersError) {
      return { orders: [], error: ordersError.message };
    }

    const orders = (ordersData || []) as DbOrder[];
    if (orders.length === 0) {
      return { orders: [], error: null };
    }

    const orderIds = orders.map((o) => o.id);

    // Items count
    const { data: itemsData } = await supabase
      .from('order_items')
      .select('order_id, quantity')
      .in('order_id', orderIds);

    const itemsCountMap = new Map<string, number>();
    if (itemsData) {
      for (const item of itemsData) {
        const cur = itemsCountMap.get(item.order_id) || 0;
        itemsCountMap.set(item.order_id, cur + (item.quantity || 1));
      }
    }

    const result: CourierOrderListItem[] = orders.map((order) => {
      const snapshot = order.delivery_address_snapshot as Address | null;
      return {
        ...order,
        itemsCount: itemsCountMap.get(order.id) || 0,
        customerName: snapshot?.name || 'Cliente YA',
        customerPhone: snapshot?.phone || null,
        deliveryAddress: snapshot || null,
      };
    });

    return { orders: result, error: null };
  } catch (err: unknown) {
    return {
      orders: [],
      error: err instanceof Error ? err.message : 'Error al consultar pedidos disponibles.',
    };
  }
}

/**
 * Acepta de forma atómica un pedido disponible para el repartidor autenticado.
 * Utiliza SELECT ... FOR UPDATE en PostgreSQL para evitar doble asignación concurrente.
 */
export async function courierAcceptOrder(
  orderId: string
): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured || !orderId) {
    return { success: false, error: 'Identificador de pedido no proporcionado.' };
  }

  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('courier_accept_order', {
      p_order_id: orderId,
    });

    if (rpcError) {
      return { success: false, error: rpcError.message };
    }

    if (rpcData && rpcData.success) {
      return { success: true, error: null };
    }

    return { success: false, error: 'No se pudo aceptar el pedido.' };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al aceptar el pedido.',
    };
  }
}

/**
 * Suscripción en tiempo real a los pedidos para el panel del repartidor.
 * Escucha cambios en la tabla 'orders' para refrescar pedidos disponibles y asignados.
 */
export function courierSubscribeToOrders(
  courierId: string,
  onChange: () => void
): () => void {
  if (!isSupabaseConfigured || !courierId || typeof supabase.channel !== 'function') {
    return () => {};
  }

  try {
    const channel = supabase
      .channel(`courier-feed-${courierId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => {
          onChange();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  } catch {
    return () => {};
  }
}

/**
 * FASE 4D: Calcula de forma atómica y pura la ganancia de un pedido asignado a repartidor.
 * Fórmula: Ganancia = (subtotal * commission_percent / 100) + fixed_fee
 * Utiliza los valores congelados en el pedido (courier_commission_percent, courier_fixed_fee).
 */
export function calculateCourierOrderEarnings(order: {
  subtotal?: number | null;
  courier_commission_percent?: number | null;
  courier_fixed_fee?: number | null;
  courier_payout_total?: number | null;
  status?: string | null;
}): CourierOrderEarningsCalculation {
  const isDelivered = order.status === 'delivered';
  const commPercent = order.courier_commission_percent != null ? Number(order.courier_commission_percent) : null;
  const fixedFee = order.courier_fixed_fee != null ? Number(order.courier_fixed_fee) : null;
  const subtotal = Number(order.subtotal || 0);

  const hasCommissionConfigured = commPercent !== null || fixedFee !== null;

  if (!hasCommissionConfigured) {
    return {
      earnings: 0,
      hasCommissionConfigured: false,
      commissionPercent: 0,
      fixedFee: 0,
      commissionAmount: 0,
      fixedFeeAmount: 0,
      formulaText: 'No calculada (sin comisión configurada)',
    };
  }

  const safePercent = commPercent ?? 0;
  const safeFixed = fixedFee ?? 0;
  const commissionAmount = Math.round((subtotal * (safePercent / 100)) * 100) / 100;
  const fixedFeeAmount = Math.round(safeFixed * 100) / 100;
  const computedTotal = Math.round((commissionAmount + fixedFeeAmount) * 100) / 100;

  // Si está entregado y tiene courier_payout_total explícito, respetamos el congelado; si no, el computado
  const finalEarnings = order.courier_payout_total != null ? Number(order.courier_payout_total) : computedTotal;

  const formulaText = `${subtotal.toFixed(2)} € × ${safePercent}% (${commissionAmount.toFixed(2)} €) + ${fixedFeeAmount.toFixed(2)} € fijo = ${computedTotal.toFixed(2)} €`;

  return {
    earnings: isDelivered ? finalEarnings : computedTotal,
    hasCommissionConfigured: true,
    commissionPercent: safePercent,
    fixedFee: safeFixed,
    commissionAmount,
    fixedFeeAmount,
    formulaText,
  };
}

/**
 * FASE 4D: Obtiene el resumen de ganancias del repartidor autenticado.
 * Primero intenta llamar a la RPC segura courier_get_earnings_summary()
 * y utiliza fallback protegido por RLS sobre public.orders.
 */
export async function courierFetchEarningsSummary(courierId: string): Promise<{
  summary: CourierEarningsSummary;
  orders: CourierDeliveredOrderEarningsItem[];
  error: string | null;
}> {
  const fallbackSummary: CourierEarningsSummary = {
    today: { earnings: 0, deliveredCount: 0, avgPerDelivery: 0 },
    thisWeek: { earnings: 0, deliveredCount: 0, avgPerDelivery: 0 },
    thisMonth: { earnings: 0, deliveredCount: 0, avgPerDelivery: 0 },
    allTime: { earnings: 0, deliveredCount: 0, avgPerDelivery: 0 },
  };

  if (!isSupabaseConfigured || !courierId) {
    return { summary: fallbackSummary, orders: [], error: null };
  }

  try {
    // 1. Intentar llamar al RPC seguro courier_get_earnings_summary
    const { data: rpcData, error: rpcError } = await supabase.rpc('courier_get_earnings_summary');

    if (!rpcError && rpcData && typeof rpcData === 'object' && rpcData.today) {
      const today = rpcData.today || { earnings: 0, count: 0, avg: 0 };
      const thisWeek = rpcData.this_week || { earnings: 0, count: 0, avg: 0 };
      const thisMonth = rpcData.this_month || { earnings: 0, count: 0, avg: 0 };
      const allTime = rpcData.all_time || { earnings: 0, count: 0, avg: 0 };

      const parsedOrders: CourierDeliveredOrderEarningsItem[] = (rpcData.orders || []).map((o: any) => {
        const calc = calculateCourierOrderEarnings({
          subtotal: o.subtotal,
          courier_commission_percent: o.commission_percent,
          courier_fixed_fee: o.fixed_fee,
          courier_payout_total: o.payout_total,
          status: 'delivered',
        });

        const snapshot = o.delivery_address_snapshot as Address | null;
        return {
          id: o.id,
          orderNumber: o.order_number,
          subtotal: Number(o.subtotal || 0),
          deliveryFee: Number(o.delivery_fee || 0),
          total: Number(o.total || 0),
          paymentMethod: o.payment_method || 'card',
          isTest: Boolean(o.is_test),
          commissionPercent: o.commission_percent != null ? Number(o.commission_percent) : null,
          fixedFee: o.fixed_fee != null ? Number(o.fixed_fee) : null,
          payoutTotal: calc.earnings,
          hasCommissionConfigured: calc.hasCommissionConfigured,
          deliveredAt: o.delivered_at,
          createdAt: o.created_at,
          customerName: snapshot?.name || 'Cliente YA',
          customerPhone: snapshot?.phone || null,
          deliveryAddress: snapshot || null,
          calculation: calc,
        };
      });

      return {
        summary: {
          today: {
            earnings: Number(today.earnings || 0),
            deliveredCount: Number(today.count || 0),
            avgPerDelivery: Number(today.avg || 0),
          },
          thisWeek: {
            earnings: Number(thisWeek.earnings || 0),
            deliveredCount: Number(thisWeek.count || 0),
            avgPerDelivery: Number(thisWeek.avg || 0),
          },
          thisMonth: {
            earnings: Number(thisMonth.earnings || 0),
            deliveredCount: Number(thisMonth.count || 0),
            avgPerDelivery: Number(thisMonth.avg || 0),
          },
          allTime: {
            earnings: Number(allTime.earnings || 0),
            deliveredCount: Number(allTime.count || 0),
            avgPerDelivery: Number(allTime.avg || 0),
          },
        },
        orders: parsedOrders,
        error: null,
      };
    }

    // 2. Fallback resiliente: consultar directamente public.orders con RLS
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('courier_id', courierId)
      .eq('status', 'delivered')
      .order('delivered_at', { ascending: false });

    if (ordersError) {
      return { summary: fallbackSummary, orders: [], error: ordersError.message };
    }

    const orders = (ordersData || []) as DbOrder[];
    const now = new Date();

    // Rango hoy (desde 00:00:00 local)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    // Rango esta semana (desde lunes 00:00:00)
    const dayOfWeek = (now.getDay() + 6) % 7; // 0 para lunes, 6 para domingo
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0, 0);

    // Rango este mes (desde el 1 del mes 00:00:00)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    let todayEarnings = 0;
    let todayCount = 0;
    let weekEarnings = 0;
    let weekCount = 0;
    let monthEarnings = 0;
    let monthCount = 0;
    let allTimeEarnings = 0;
    let allTimeCount = orders.length;

    const parsedOrders: CourierDeliveredOrderEarningsItem[] = orders.map((order) => {
      const calc = calculateCourierOrderEarnings(order);
      const deliveryDate = new Date(order.delivered_at || order.updated_at || order.created_at);

      if (deliveryDate >= todayStart) {
        todayEarnings += calc.earnings;
        todayCount++;
      }
      if (deliveryDate >= weekStart) {
        weekEarnings += calc.earnings;
        weekCount++;
      }
      if (deliveryDate >= monthStart) {
        monthEarnings += calc.earnings;
        monthCount++;
      }
      allTimeEarnings += calc.earnings;

      const snapshot = order.delivery_address_snapshot as Address | null;
      return {
        id: order.id,
        orderNumber: order.order_number,
        subtotal: Number(order.subtotal || 0),
        deliveryFee: Number(order.delivery_fee || 0),
        total: Number(order.total || 0),
        paymentMethod: order.payment_method || 'card',
        isTest: Boolean(order.is_test),
        commissionPercent: order.courier_commission_percent != null ? Number(order.courier_commission_percent) : null,
        fixedFee: order.courier_fixed_fee != null ? Number(order.courier_fixed_fee) : null,
        payoutTotal: calc.earnings,
        hasCommissionConfigured: calc.hasCommissionConfigured,
        deliveredAt: order.delivered_at || order.updated_at,
        createdAt: order.created_at,
        customerName: snapshot?.name || 'Cliente YA',
        customerPhone: snapshot?.phone || null,
        deliveryAddress: snapshot || null,
        calculation: calc,
      };
    });

    const round = (val: number) => Math.round(val * 100) / 100;

    return {
      summary: {
        today: {
          earnings: round(todayEarnings),
          deliveredCount: todayCount,
          avgPerDelivery: todayCount > 0 ? round(todayEarnings / todayCount) : 0,
        },
        thisWeek: {
          earnings: round(weekEarnings),
          deliveredCount: weekCount,
          avgPerDelivery: weekCount > 0 ? round(weekEarnings / weekCount) : 0,
        },
        thisMonth: {
          earnings: round(monthEarnings),
          deliveredCount: monthCount,
          avgPerDelivery: monthCount > 0 ? round(monthEarnings / monthCount) : 0,
        },
        allTime: {
          earnings: round(allTimeEarnings),
          deliveredCount: allTimeCount,
          avgPerDelivery: allTimeCount > 0 ? round(allTimeEarnings / allTimeCount) : 0,
        },
      },
      orders: parsedOrders,
      error: null,
    };
  } catch (err: unknown) {
    return {
      summary: fallbackSummary,
      orders: [],
      error: err instanceof Error ? err.message : 'Error inesperado al consultar ganancias del repartidor.',
    };
  }
}

