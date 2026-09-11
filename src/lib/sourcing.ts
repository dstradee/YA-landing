import { supabase, isSupabaseConfigured } from './supabase';
import type {
  DbSourcingItem,
  SourcingStatus,
  SourcingSummary,
} from '../types/app';

export interface SourcingFilters {
  status?: string;
  orderId?: string;
  isTest?: boolean;
  search?: string;
}

/**
 * Obtiene la lista de artículos bajo demanda que requieren o tienen abastecimiento.
 * Utiliza la RPC segura 'admin_fetch_sourcing_items' con fallback directo a Supabase.
 */
export async function adminFetchSourcingItems(
  filters?: SourcingFilters
): Promise<{ data: DbSourcingItem[]; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { data: [], error: 'Supabase no está configurado.' };
  }

  try {
    // 1. Intentar RPC optimizada
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'admin_fetch_sourcing_items',
      {
        p_status: filters?.status && filters.status !== 'all' ? filters.status : null,
        p_order_id: filters?.orderId || null,
        p_is_test: typeof filters?.isTest === 'boolean' ? filters.isTest : null,
      }
    );

    let items: DbSourcingItem[] = [];

    if (!rpcError && Array.isArray(rpcData)) {
      items = rpcData as DbSourcingItem[];
    } else {
      // 2. Fallback con join directo mediante Supabase Client
      let query = supabase
        .from('sourcing_items')
        .select(`
          id,
          order_id,
          order_item_id,
          product_id,
          product_name,
          quantity,
          status,
          is_test,
          supplier_name,
          supplier_reference,
          source_cost,
          notes,
          managed_by,
          created_at,
          updated_at,
          sourced_at,
          orders (
            order_number,
            status,
            created_at,
            notes,
            delivery_address_snapshot
          ),
          products (
            slug,
            image,
            price,
            estimated_cost,
            suggested_purchase_locations,
            internal_courier_notes
          )
        `)
        .order('created_at', { ascending: true });

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.orderId) {
        query = query.eq('order_id', filters.orderId);
      }
      if (typeof filters?.isTest === 'boolean') {
        query = query.eq('is_test', filters.isTest);
      }

      const { data: fallbackData, error: fallbackError } = await query;
      if (fallbackError) {
        return { data: [], error: fallbackError.message };
      }

      items = (fallbackData || []).map((row: any) => ({
        id: row.id,
        order_id: row.order_id,
        order_item_id: row.order_item_id,
        product_id: row.product_id,
        product_name: row.product_name,
        quantity: row.quantity,
        status: row.status,
        is_test: !!row.is_test,
        supplier_name: row.supplier_name,
        supplier_reference: row.supplier_reference,
        source_cost: row.source_cost ? Number(row.source_cost) : null,
        notes: row.notes,
        managed_by: row.managed_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
        sourced_at: row.sourced_at,
        order_number: row.orders?.order_number,
        order_status: row.orders?.status,
        order_created_at: row.orders?.created_at,
        order_notes: row.orders?.notes,
        delivery_address: row.orders?.delivery_address_snapshot,
        product_slug: row.products?.slug,
        product_image: row.products?.image,
        product_price: row.products?.price ? Number(row.products.price) : undefined,
        product_estimated_cost: row.products?.estimated_cost ? Number(row.products.estimated_cost) : null,
        suggested_purchase_locations: row.products?.suggested_purchase_locations,
        internal_courier_notes: row.products?.internal_courier_notes,
      }));
    }

    // Filtro en memoria por búsqueda si existe
    if (filters?.search && filters.search.trim() !== '') {
      const q = filters.search.toLowerCase().trim();
      items = items.filter(
        (item) =>
          item.product_name.toLowerCase().includes(q) ||
          (item.order_number && item.order_number.toLowerCase().includes(q)) ||
          (item.supplier_name && item.supplier_name.toLowerCase().includes(q)) ||
          (item.suggested_purchase_locations &&
            item.suggested_purchase_locations.toLowerCase().includes(q))
      );
    }

    return { data: items, error: null };
  } catch (err: unknown) {
    return {
      data: [],
      error: err instanceof Error ? err.message : 'Error inesperado al consultar abastecimiento.',
    };
  }
}

/**
 * Actualiza el estado de abastecimiento de un artículo bajo demanda.
 * Valida server-side la transición de estado, registra log de auditoría y audita inventario si es conseguido.
 */
export async function adminUpdateSourcingItem(params: {
  sourcingItemId: string;
  status: SourcingStatus;
  notes?: string;
  supplierName?: string;
  sourceCost?: number;
}): Promise<{ success: boolean; allSourcedForOrder?: boolean; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_update_sourcing_item_status', {
      p_sourcing_item_id: params.sourcingItemId,
      p_status: params.status,
      p_notes: params.notes || null,
      p_supplier_name: params.supplierName || null,
      p_source_cost: typeof params.sourceCost === 'number' ? params.sourceCost : null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    // Notificar al sistema para refresco en tiempo real
    try {
      window.dispatchEvent(new CustomEvent('ya-sourcing-updated'));
    } catch {}

    return {
      success: true,
      allSourcedForOrder: data?.all_sourced_for_order,
      error: null,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al actualizar abastecimiento.',
    };
  }
}

/**
 * Obtiene el resumen de métricas clave de abastecimiento (pendientes, en compra, etc.)
 */
export async function adminGetSourcingSummary(): Promise<{
  data: SourcingSummary | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return { data: null, error: 'Supabase no está configurado.' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_get_sourcing_summary');
    if (error) {
      // Fallback simple
      const { data: rows, error: countError } = await supabase
        .from('sourcing_items')
        .select('status, order_id, sourced_at');

      if (countError) {
        return { data: null, error: countError.message };
      }

      const pending = rows?.filter((r) => r.status === 'pending').length || 0;
      const sourcing = rows?.filter((r) => r.status === 'sourcing').length || 0;
      const unavailable = rows?.filter((r) => r.status === 'unavailable').length || 0;
      const sourcedToday = rows?.filter((r) => {
        if (r.status !== 'sourced' || !r.sourced_at) return false;
        const d = new Date(r.sourced_at);
        const today = new Date();
        return (
          d.getDate() === today.getDate() &&
          d.getMonth() === today.getMonth() &&
          d.getFullYear() === today.getFullYear()
        );
      }).length || 0;

      const activeOrders = new Set(
        rows
          ?.filter((r) => r.status === 'pending' || r.status === 'sourcing')
          .map((r) => r.order_id)
      );

      return {
        data: {
          pending_count: pending,
          sourcing_count: sourcing,
          sourced_today_count: sourcedToday,
          unavailable_count: unavailable,
          orders_pending_sourcing: activeOrders.size,
        },
        error: null,
      };
    }

    return {
      data: {
        pending_count: Number(data.pending_count) || 0,
        sourcing_count: Number(data.sourcing_count) || 0,
        sourced_today_count: Number(data.sourced_today_count) || 0,
        unavailable_count: Number(data.unavailable_count) || 0,
        orders_pending_sourcing: Number(data.orders_pending_sourcing) || 0,
      },
      error: null,
    };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Error al obtener resumen de abastecimiento.',
    };
  }
}

/**
 * Suscribe a eventos en tiempo real sobre la tabla public.sourcing_items
 */
export function adminSubscribeToSourcing(onChange: () => void): () => void {
  if (!isSupabaseConfigured || typeof supabase.channel !== 'function') {
    return () => {};
  }

  try {
    const channel = supabase
      .channel('admin-sourcing-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sourcing_items' },
        () => onChange()
      )
      .subscribe();

    const handleCustom = () => onChange();
    window.addEventListener('ya-sourcing-updated', handleCustom);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('ya-sourcing-updated', handleCustom);
    };
  } catch {
    return () => {};
  }
}
