import { supabase, isSupabaseConfigured } from './supabase';
import type { DbStockMovement, InventorySummary, StockMovementType } from '../types/app';

export type StockAdjustmentParams = {
  productId: string;
  type: StockMovementType;
  quantity: number;
  reason?: string;
  newStock?: number;
};

export type AdjustmentResult = {
  success: boolean;
  movement_id?: string;
  product_id?: string;
  product_name?: string;
  previous_stock?: number;
  new_stock?: number;
  delta?: number;
  movement_type?: StockMovementType;
  reason?: string;
  error?: string;
};

/**
 * Realiza un ajuste seguro y atómico de stock mediante la RPC PostgreSQL admin_adjust_stock.
 */
export async function adminAdjustStock(
  params: StockAdjustmentParams
): Promise<AdjustmentResult> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_adjust_stock', {
      p_product_id: params.productId,
      p_type: params.type,
      p_quantity: params.quantity,
      p_reason: params.reason || null,
      p_new_stock: params.newStock !== undefined ? params.newStock : null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    // Disparar evento para que el catálogo y paneles se refresquen
    window.dispatchEvent(new CustomEvent('ya-inventory-updated'));

    return {
      success: true,
      movement_id: data?.movement_id,
      product_id: data?.product_id,
      product_name: data?.product_name,
      previous_stock: data?.previous_stock,
      new_stock: data?.new_stock,
      delta: data?.delta,
      movement_type: data?.movement_type,
      reason: data?.reason,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al ajustar el stock.',
    };
  }
}

/**
 * Consulta el historial auditable de movimientos de stock con datos de producto y pedido asociados.
 */
export async function fetchStockMovements(params?: {
  productId?: string;
  type?: string;
  limit?: number;
}): Promise<{ data: DbStockMovement[] | null; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { data: [], error: null };
  }

  try {
    const { data, error } = await supabase.rpc('admin_fetch_stock_movements', {
      p_product_id: params?.productId || null,
      p_type: params?.type || null,
      p_limit: params?.limit || 100,
    });

    if (error) {
      // Fallback a SELECT directo si la RPC fallara por permisos o versión de BD
      const query = supabase
        .from('stock_movements')
        .select(`
          id,
          product_id,
          movement_type,
          quantity,
          previous_stock,
          new_stock,
          order_id,
          reason,
          created_by,
          created_at,
          products (name, slug),
          orders (order_number)
        `)
        .order('created_at', { ascending: false })
        .limit(params?.limit || 100);

      if (params?.productId) query.eq('product_id', params.productId);
      if (params?.type) query.eq('movement_type', params.type);

      const { data: fallbackData, error: fallbackError } = await query;
      if (fallbackError) {
        return { data: null, error: fallbackError.message };
      }

      const mapped: DbStockMovement[] = (fallbackData || []).map((row: any) => ({
        id: row.id,
        product_id: row.product_id,
        movement_type: row.movement_type,
        quantity: row.quantity,
        previous_stock: row.previous_stock,
        new_stock: row.new_stock,
        order_id: row.order_id,
        reason: row.reason,
        created_by: row.created_by,
        created_at: row.created_at,
        product_name: row.products?.name,
        product_slug: row.products?.slug,
        order_number: row.orders?.order_number,
      }));

      return { data: mapped, error: null };
    }

    return { data: (data as DbStockMovement[]) || [], error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Error al cargar los movimientos de inventario.',
    };
  }
}

/**
 * Obtiene el resumen de KPI y valoración financiera del inventario.
 */
export async function fetchInventorySummary(): Promise<{
  data: InventorySummary | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return {
      data: {
        total_products: 0,
        in_stock_products: 0,
        low_stock_products: 0,
        out_of_stock_products: 0,
        on_demand_products: 0,
        total_units_in_stock: 0,
        total_retail_value: 0,
        total_cost_value: 0,
        estimated_gross_profit: 0,
      },
      error: null,
    };
  }

  try {
    const { data, error } = await supabase.rpc('admin_get_inventory_summary');
    if (error) {
      return { data: null, error: error.message };
    }
    return { data: data as InventorySummary, error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Error al obtener el resumen de inventario.',
    };
  }
}
