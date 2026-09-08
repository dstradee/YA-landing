// ==============================================================================
// YA - GESTIÓN DE DESCUENTOS (PHASE 3B)
// Archivo: src/lib/adminDiscounts.ts
// ==============================================================================

import { supabase, isSupabaseConfigured } from './supabase';
import type { DbDiscount } from '../types/app';

const STORAGE_KEY = 'ya_discounts_local';

const INITIAL_LOCAL_DISCOUNTS: DbDiscount[] = [
  {
    id: 'disc-redbull-promo',
    name: 'Oferta Nocturna Red Bull',
    description: 'Descuento del 15% en lata Red Bull 250ml',
    scope: 'product',
    product_id: 'red-bull',
    category_id: null,
    discount_type: 'percentage',
    discount_value: 15,
    active: true,
    starts_at: null,
    expires_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    product_name: 'Red Bull 250 ml',
  },
  {
    id: 'disc-snacks-promo',
    name: 'Hora del Picoteo - Snacks 10%',
    description: '10% de descuento en todos los snacks y patatas',
    scope: 'category',
    product_id: null,
    category_id: 'snacks',
    discount_type: 'percentage',
    discount_value: 10,
    active: true,
    starts_at: null,
    expires_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    category_name: 'Snacks',
  },
];

function getStoredLocalDiscounts(): DbDiscount[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data);
  } catch {
    // Ignore
  }
  return INITIAL_LOCAL_DISCOUNTS;
}

function saveStoredLocalDiscounts(items: DbDiscount[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore
  }
}

/**
 * Obtiene todos los descuentos, enriqueciendo con nombres de producto y categoría
 */
export async function fetchDiscounts(): Promise<DbDiscount[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('discounts')
        .select(`
          *,
          product:products(id, name),
          category:categories(id, name)
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((d: any) => ({
          id: d.id,
          name: d.name,
          description: d.description,
          scope: d.scope,
          product_id: d.product_id,
          category_id: d.category_id,
          discount_type: d.discount_type,
          discount_value: Number(d.discount_value),
          active: Boolean(d.active),
          starts_at: d.starts_at,
          expires_at: d.expires_at,
          created_at: d.created_at,
          updated_at: d.updated_at,
          product_name: d.product?.name,
          category_name: d.category?.name,
        }));
      }
    } catch {
      // Fallback local
    }
  }

  return getStoredLocalDiscounts();
}

/**
 * Obtiene únicamente descuentos activos para aplicar en frontend
 */
export async function fetchActiveDiscounts(): Promise<DbDiscount[]> {
  const all = await fetchDiscounts();
  const now = new Date();
  return all.filter((d) => {
    if (!d.active) return false;
    if (d.starts_at && new Date(d.starts_at) > now) return false;
    if (d.expires_at && new Date(d.expires_at) < now) return false;
    return true;
  });
}

/**
 * Crea un nuevo descuento (Admin)
 */
export async function createDiscount(
  discount: Omit<DbDiscount, 'id' | 'created_at' | 'updated_at'>
): Promise<{ success: boolean; data?: DbDiscount; error?: string }> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('discounts')
        .insert({
          name: discount.name,
          description: discount.description,
          scope: discount.scope,
          product_id: discount.scope === 'product' ? discount.product_id : null,
          category_id: discount.scope === 'category' ? discount.category_id : null,
          discount_type: discount.discount_type,
          discount_value: Number(discount.discount_value),
          active: discount.active,
          starts_at: discount.starts_at || null,
          expires_at: discount.expires_at || null,
        })
        .select()
        .single();

      if (!error && data) {
        return { success: true, data };
      }
      if (error) {
        return { success: false, error: error.message };
      }
    } catch (err: any) {
      console.warn('Error guardando en Supabase, guardando en local:', err);
    }
  }

  // Local fallback
  const items = getStoredLocalDiscounts();
  const newDisc: DbDiscount = {
    ...discount,
    id: 'disc-' + Date.now(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  items.unshift(newDisc);
  saveStoredLocalDiscounts(items);
  return { success: true, data: newDisc };
}

/**
 * Actualiza un descuento existente (Admin)
 */
export async function updateDiscount(
  id: string,
  updates: Partial<DbDiscount>
): Promise<{ success: boolean; data?: DbDiscount; error?: string }> {
  if (isSupabaseConfigured) {
    try {
      const payload: any = { ...updates, updated_at: new Date().toISOString() };
      delete payload.product_name;
      delete payload.category_name;
      delete payload.product;
      delete payload.category;

      const { data, error } = await supabase
        .from('discounts')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (!error && data) {
        return { success: true, data };
      }
    } catch {
      // Fallback
    }
  }

  const items = getStoredLocalDiscounts();
  const idx = items.findIndex((d) => d.id === id);
  if (idx !== -1) {
    items[idx] = { ...items[idx], ...updates, updated_at: new Date().toISOString() };
    saveStoredLocalDiscounts(items);
    return { success: true, data: items[idx] };
  }

  return { success: false, error: 'Descuento no encontrado' };
}

/**
 * Conmuta rápido el estado activo/inactivo (Admin)
 */
export async function toggleDiscountActive(id: string, active: boolean) {
  return updateDiscount(id, { active });
}

/**
 * Elimina un descuento (Admin)
 */
export async function deleteDiscount(id: string): Promise<{ success: boolean; error?: string }> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('discounts').delete().eq('id', id);
      if (!error) return { success: true };
    } catch {
      // Fallback
    }
  }

  const items = getStoredLocalDiscounts().filter((d) => d.id !== id);
  saveStoredLocalDiscounts(items);
  return { success: true };
}
