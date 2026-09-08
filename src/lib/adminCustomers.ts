import { supabase, isSupabaseConfigured } from './supabase';
import type {
  AdminCustomerListItem,
  DbProfile,
  DbOrder,
  DbAddress,
} from '../types/app';

export async function adminFetchCustomers(filters?: {
  search?: string;
}): Promise<{ data: AdminCustomerListItem[]; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { data: [], error: 'Supabase no está configurado.' };
  }

  try {
    // 1. Obtener todos los perfiles de clientes
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profilesError) {
      return { data: [], error: profilesError.message };
    }

    const profiles = (profilesData || []) as DbProfile[];

    // 2. Obtener resumen de pedidos para correlacionar número de pedidos y gasto
    const { data: ordersData } = await supabase
      .from('orders')
      .select('user_id, total, created_at');

    const customerStats = new Map<string, { count: number; totalSpent: number; lastOrderAt: string | null }>();
    if (ordersData) {
      for (const order of ordersData) {
        if (!order.user_id) continue;
        const current = customerStats.get(order.user_id) || { count: 0, totalSpent: 0, lastOrderAt: null };
        current.count += 1;
        current.totalSpent += Number(order.total) || 0;
        if (!current.lastOrderAt || new Date(order.created_at) > new Date(current.lastOrderAt)) {
          current.lastOrderAt = order.created_at;
        }
        customerStats.set(order.user_id, current);
      }
    }

    let result: AdminCustomerListItem[] = profiles.map((p) => {
      const stats = customerStats.get(p.id) || { count: 0, totalSpent: 0, lastOrderAt: null };
      return {
        ...p,
        ordersCount: stats.count,
        totalSpent: Math.round(stats.totalSpent * 100) / 100,
        lastOrderAt: stats.lastOrderAt,
      };
    });

    if (filters?.search && filters.search.trim() !== '') {
      const q = filters.search.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          (c.phone && c.phone.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q))
      );
    }

    return { data: result, error: null };
  } catch (err: unknown) {
    return {
      data: [],
      error: err instanceof Error ? err.message : 'Error inesperado al consultar clientes.',
    };
  }
}

export type AdminCustomerDetailResult = {
  customer: DbProfile;
  orders: DbOrder[];
  addresses: DbAddress[];
  summary: {
    totalOrders: number;
    totalSpent: number;
    averageOrder: number;
    firstOrderAt: string | null;
    lastOrderAt: string | null;
  };
};

export async function adminFetchCustomerDetail(
  customerId: string
): Promise<{ data: AdminCustomerDetailResult | null; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { data: null, error: 'Supabase no está configurado.' };
  }

  try {
    // 1. Obtener perfil
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', customerId)
      .maybeSingle();

    if (profileError) {
      return { data: null, error: profileError.message };
    }
    if (!profileData) {
      return { data: null, error: 'Cliente no encontrado.' };
    }

    const customer = profileData as DbProfile;

    // 2. Obtener pedidos del cliente
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', customerId)
      .order('created_at', { ascending: false });

    if (ordersError) {
      return { data: null, error: ordersError.message };
    }

    const orders = (ordersData || []) as DbOrder[];

    // 3. Obtener direcciones del cliente
    const { data: addressesData, error: addressesError } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', customerId)
      .order('created_at', { ascending: false });

    if (addressesError) {
      return { data: null, error: addressesError.message };
    }

    const addresses = (addressesData || []) as DbAddress[];

    // 4. Calcular métricas del cliente
    let totalSpent = 0;
    for (const ord of orders) {
      totalSpent += Number(ord.total) || 0;
    }

    const totalOrders = orders.length;
    const averageOrder = totalOrders > 0 ? Math.round((totalSpent / totalOrders) * 100) / 100 : 0;
    const lastOrderAt = orders.length > 0 ? orders[0].created_at : null;
    const firstOrderAt = orders.length > 0 ? orders[orders.length - 1].created_at : null;

    return {
      data: {
        customer,
        orders,
        addresses,
        summary: {
          totalOrders,
          totalSpent: Math.round(totalSpent * 100) / 100,
          averageOrder,
          firstOrderAt,
          lastOrderAt,
        },
      },
      error: null,
    };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Error inesperado al obtener detalle del cliente.',
    };
  }
}
