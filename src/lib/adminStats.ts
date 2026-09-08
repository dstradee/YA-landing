import { supabase, isSupabaseConfigured } from './supabase';
import type { AdminDashboardStats, AdminOrderListItem, OrderStatus } from '../types/app';

export async function adminFetchDashboardStats(): Promise<{
  stats: AdminDashboardStats | null;
  recentOrders: AdminOrderListItem[];
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return {
      stats: null,
      recentOrders: [],
      error: 'Supabase no está configurado en el entorno.',
    };
  }

  try {
    // 1. Obtener pedidos con datos necesarios para las métricas
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_number, user_id, address_id, delivery_zone_id, courier_id, status, subtotal, delivery_fee, total, payment_method, payment_status, notes, delivery_address_snapshot, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (ordersError) {
      return { stats: null, recentOrders: [], error: ordersError.message };
    }

    const orders = ordersData || [];

    // 2. Obtener items por pedido para contar artículos
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

    // 3. Obtener perfiles de clientes para los pedidos recientes
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

    // 4. Calcular métricas de pedidos y ventas
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    let totalRevenue = 0;
    let todayRevenue = 0;
    let todayOrders = 0;
    let pendingOrders = 0;
    let preparingOrders = 0;
    let deliveringOrders = 0;
    let deliveredOrders = 0;

    for (const order of orders) {
      const orderTotal = Number(order.total) || 0;
      totalRevenue += orderTotal;

      const orderTime = new Date(order.created_at).getTime();
      if (orderTime >= startOfToday) {
        todayOrders++;
        todayRevenue += orderTotal;
      }

      const st = order.status as OrderStatus;
      if (st === 'received') pendingOrders++;
      else if (st === 'preparing' || st === 'sourcing' || st === 'prepared') preparingOrders++;
      else if (st === 'delivering') deliveringOrders++;
      else if (st === 'delivered') deliveredOrders++;
    }

    // 5. Total de clientes registrados (role = 'customer')
    const { count: customersCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'customer');

    // 6. Catálogo: productos activos e inactivos
    const { count: activeProductsCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);

    const { count: inactiveProductsCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('active', false);

    // 7. Catálogo: categorías activas
    const { count: activeCategoriesCount } = await supabase
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);

    const stats: AdminDashboardStats = {
      totalOrders: orders.length,
      todayOrders,
      pendingOrders,
      preparingOrders,
      deliveringOrders,
      deliveredOrders,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      todayRevenue: Math.round(todayRevenue * 100) / 100,
      totalCustomers: customersCount || 0,
      activeProducts: activeProductsCount || 0,
      inactiveProducts: inactiveProductsCount || 0,
      activeCategories: activeCategoriesCount || 0,
    };

    // 8. Construir lista de pedidos recientes (máximo 6 para el dashboard)
    const recentOrders: AdminOrderListItem[] = orders.slice(0, 6).map((order) => {
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
        status: order.status as OrderStatus,
        subtotal: Number(order.subtotal) || 0,
        delivery_fee: Number(order.delivery_fee) || 0,
        total: Number(order.total) || 0,
        payment_method: order.payment_method,
        payment_status: order.payment_status,
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

    return { stats, recentOrders, error: null };
  } catch (err: unknown) {
    return {
      stats: null,
      recentOrders: [],
      error: err instanceof Error ? err.message : 'Error inesperado al cargar métricas de administración.',
    };
  }
}
