import { supabase, isSupabaseConfigured } from './supabase';
import type {
  AdminOrderListItem,
  AdminOrderDetail,
  DbOrder,
  DbOrderItem,
  DbProfile,
  OrderStatus,
} from '../types/app';

export async function adminFetchOrders(filters?: {
  status?: string;
  search?: string;
  sortAsc?: boolean;
}): Promise<{ data: AdminOrderListItem[]; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { data: [], error: 'Supabase no está configurado.' };
  }

  try {
    let query = supabase
      .from('orders')
      .select('id, order_number, user_id, address_id, delivery_zone_id, courier_id, status, subtotal, delivery_fee, total, payment_method, payment_status, is_test, notes, delivery_address_snapshot, created_at, updated_at');

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    query = query.order('created_at', { ascending: !!filters?.sortAsc });

    const { data: ordersData, error: ordersError } = await query;
    if (ordersError) {
      return { data: [], error: ordersError.message };
    }

    const orders = (ordersData || []) as DbOrder[];

    // Obtener items por pedido para contar artículos
    const { data: itemsData } = await supabase
      .from('order_items')
      .select('order_id, quantity');

    const itemsCountMap = new Map<string, number>();
    if (itemsData) {
      for (const item of itemsData) {
        const current = itemsCountMap.get(item.order_id) || 0;
        itemsCountMap.set(item.order_id, current + (item.quantity || 1));
      }
    }

    // Obtener perfiles de clientes
    const userIds = Array.from(new Set(orders.map((o) => o.user_id).filter(Boolean))) as string[];
    const profileMap = new Map<string, { full_name: string; phone: string | null; email?: string | null }>();

    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, phone, email')
        .in('id', userIds);

      if (profilesData) {
        for (const p of profilesData) {
          profileMap.set(p.id, p);
        }
      }
    }

    let result: AdminOrderListItem[] = orders.map((order) => {
      const snapshot = order.delivery_address_snapshot as { name?: string; phone?: string } | null;
      const profile = order.user_id ? profileMap.get(order.user_id) : null;
      const customerName = snapshot?.name || profile?.full_name || 'Cliente YA';
      const customerPhone = snapshot?.phone || profile?.phone || null;
      const customerEmail = profile?.email || null;

      return {
        id: order.id,
        order_number: order.order_number,
        user_id: order.user_id,
        address_id: order.address_id,
        delivery_zone_id: order.delivery_zone_id,
        courier_id: order.courier_id,
        status: order.status,
        subtotal: Number(order.subtotal) || 0,
        delivery_fee: Number(order.delivery_fee) || 0,
        total: Number(order.total) || 0,
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        is_test: !!order.is_test,
        notes: order.notes,
        delivery_address_snapshot: order.delivery_address_snapshot,
        created_at: order.created_at,
        updated_at: order.updated_at,
        itemsCount: itemsCountMap.get(order.id) || 0,
        customerName,
        customerPhone,
        customerEmail,
      };
    });

    // Filtro por búsqueda de texto (número de pedido, nombre, teléfono o email)
    if (filters?.search && filters.search.trim() !== '') {
      const searchLower = filters.search.toLowerCase().trim();
      result = result.filter(
        (o) =>
          o.order_number.toLowerCase().includes(searchLower) ||
          o.customerName.toLowerCase().includes(searchLower) ||
          (o.customerPhone && o.customerPhone.toLowerCase().includes(searchLower)) ||
          (o.customerEmail && o.customerEmail.toLowerCase().includes(searchLower))
      );
    }

    return { data: result, error: null };
  } catch (err: unknown) {
    return {
      data: [],
      error: err instanceof Error ? err.message : 'Error inesperado al consultar pedidos de administración.',
    };
  }
}

export async function adminFetchOrderById(
  idOrNumber: string
): Promise<{ order: AdminOrderDetail | null; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { order: null, error: 'Supabase no está configurado.' };
  }

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idOrNumber);

    let query = supabase.from('orders').select('*');
    if (isUuid) {
      query = query.eq('id', idOrNumber);
    } else {
      query = query.eq('order_number', idOrNumber);
    }

    const { data: orderData, error: orderError } = await query.maybeSingle();
    if (orderError) {
      return { order: null, error: orderError.message };
    }
    if (!orderData) {
      return { order: null, error: 'Pedido no encontrado en la base de datos.' };
    }

    const order = orderData as DbOrder;

    // Obtener items del pedido
    const { data: itemsData, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', order.id)
      .order('created_at', { ascending: true });

    if (itemsError) {
      return { order: null, error: itemsError.message };
    }

    // Obtener perfil del cliente si existe user_id
    let customer: DbProfile | null = null;
    if (order.user_id) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', order.user_id)
        .maybeSingle();

      if (profileData) {
        customer = profileData as DbProfile;
      }
    }

    // Obtener transacciones registradas en la tabla payments
    const { data: paymentsData } = await supabase
      .from('payments')
      .select('*')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false });

    const detail: AdminOrderDetail = {
      ...order,
      subtotal: Number(order.subtotal) || 0,
      delivery_fee: Number(order.delivery_fee) || 0,
      total: Number(order.total) || 0,
      customer,
      items: (itemsData || []) as DbOrderItem[],
      payments: (paymentsData || []) as any[],
    };

    return { order: detail, error: null };
  } catch (err: unknown) {
    return {
      order: null,
      error: err instanceof Error ? err.message : 'Error inesperado al cargar el detalle del pedido.',
    };
  }
}

/**
 * Actualiza el estado de un pedido garantizando que SOLO el campo status y updated_at
 * son modificados (nunca campos arbitrarios ni precios).
 * Intenta primero la RPC `admin_update_order_status` y como fallback ejecuta el update con RLS.
 */
export async function adminUpdateOrderStatus(
  orderId: string,
  newStatus: OrderStatus
): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  try {
    // 1. Intentar RPC segura
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_update_order_status', {
      p_order_id: orderId,
      p_status: newStatus,
    });

    if (!rpcError && rpcData) {
      return { success: true, error: null };
    }

    // Si la función aún no fue creada en Supabase (o código 42883 / PGRST202), ejecutamos el update directo
    // que está protegido por la política RLS "Admins and assigned couriers can update orders"
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    if (newStatus === 'cancelled') {
      try {
        window.dispatchEvent(new CustomEvent('ya-inventory-updated'));
      } catch {}
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'No se pudo actualizar el estado del pedido.',
    };
  }
}

export function adminSubscribeToOrders(onChange: () => void): () => void {
  if (!isSupabaseConfigured || typeof supabase.channel !== 'function') {
    return () => {};
  }

  try {
    const channel = supabase
      .channel('admin-orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => onChange()
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
 * Elimina uno o más pedidos de forma segura mediante la RPC admin_delete_orders
 * que desvincula / limpia pagos, entregas, items e incidencias sin violar integridad referencial.
 */
export async function adminDeleteOrders(
  orderIds: string[]
): Promise<{ success: boolean; count?: number; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase no está configurado.' };
  }
  if (!orderIds || orderIds.length === 0) {
    return { success: false, error: 'No se seleccionaron pedidos para eliminar.' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_delete_orders', {
      p_order_ids: orderIds,
    });

    if (!error) {
      return { success: true, count: typeof data === 'number' ? data : orderIds.length, error: null };
    }

    // Si la RPC no está instalada o falla, intentar borrado directo con RLS de admin
    const { error: delError } = await supabase
      .from('orders')
      .delete()
      .in('id', orderIds);

    if (!delError) {
      return { success: true, count: orderIds.length, error: null };
    }
    return { success: false, error: error.message || delError.message };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al eliminar pedidos.',
    };
  }
}

