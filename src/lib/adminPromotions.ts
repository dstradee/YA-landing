// ==============================================================================
// YA - GESTIÓN DE PROMOCIONES (PHASE 3B)
// Archivo: src/lib/adminPromotions.ts
// ==============================================================================

import { supabase, isSupabaseConfigured } from './supabase';
import type { DbPromotion } from '../types/app';

const STORAGE_KEY = 'ya_promotions_local';

const INITIAL_LOCAL_PROMOTIONS: DbPromotion[] = [
  {
    id: 'promo-10-descuento',
    name: '10% Descuento Automático',
    code: 'PROMO10',
    description: '10% de descuento directo en compras a partir de 30 €',
    discount_type: 'percentage',
    discount_value: 10,
    minimum_order: 30.0,
    active: true,
    is_automatic: true,
    sort_order: 1,
    starts_at: null,
    expires_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'promo-5-fijo',
    name: '5 € Menos en tu Gran Pedido',
    code: 'PROMO5EUROS',
    description: '5 € de descuento directo en pedidos superiores a 40 €',
    discount_type: 'fixed',
    discount_value: 5,
    minimum_order: 40.0,
    active: true,
    is_automatic: true,
    sort_order: 2,
    starts_at: null,
    expires_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

function getStoredLocalPromotions(): DbPromotion[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data);
  } catch {
    // Ignore
  }
  return INITIAL_LOCAL_PROMOTIONS;
}

function saveStoredLocalPromotions(items: DbPromotion[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore
  }
}

/**
 * Obtiene todas las promociones (Admin)
 */
export async function fetchPromotions(): Promise<DbPromotion[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('promotions')
        .select('*')
        .order('minimum_order', { ascending: false });

      if (!error && data) {
        return data.map((p: any) => ({
          id: p.id,
          name: p.name || p.code,
          code: p.code,
          description: p.description,
          discount_type: p.discount_type,
          discount_value: Number(p.discount_value),
          minimum_order: Number(p.minimum_order),
          active: Boolean(p.active),
          is_automatic: p.is_automatic ?? true,
          sort_order: p.sort_order ?? 0,
          starts_at: p.starts_at,
          expires_at: p.expires_at,
          applicable_product_id: p.applicable_product_id || null,
          is_two_for_one: Boolean(p.is_two_for_one || p.discount_type === 'two_for_one'),
          created_at: p.created_at,
          updated_at: p.updated_at,
        }));
      }
    } catch {
      // Fallback local
    }
  }

  return getStoredLocalPromotions();
}

/**
 * Obtiene promociones activas para el motor de cálculo comercial
 */
export async function fetchActivePromotions(): Promise<DbPromotion[]> {
  const all = await fetchPromotions();
  const now = new Date();
  return all.filter((p) => {
    if (!p.active) return false;
    if (p.starts_at && new Date(p.starts_at) > now) return false;
    if (p.expires_at && new Date(p.expires_at) < now) return false;
    return true;
  });
}

/**
 * Crea una nueva promoción (Admin)
 */
export async function createPromotion(
  promo: Omit<DbPromotion, 'id' | 'created_at' | 'updated_at'>
): Promise<{ success: boolean; data?: DbPromotion; error?: string }> {
  if (isSupabaseConfigured) {
    try {
      const payload: any = {
        name: promo.name || promo.code,
        code: promo.code.trim().toUpperCase(),
        description: promo.description,
        discount_type: promo.discount_type,
        discount_value: Number(promo.discount_value),
        minimum_order: Number(promo.minimum_order),
        active: promo.active,
        is_automatic: promo.is_automatic ?? true,
        sort_order: promo.sort_order ?? 0,
        starts_at: promo.starts_at || null,
        expires_at: promo.expires_at || null,
        applicable_product_id: promo.applicable_product_id || null,
        is_two_for_one: Boolean(promo.is_two_for_one || promo.discount_type === 'two_for_one'),
      };

      const { data, error } = await supabase
        .from('promotions')
        .insert(payload)
        .select()
        .single();

      if (!error && data) {
        return { success: true, data };
      }
      if (error) {
        return { success: false, error: error.message };
      }
    } catch (err: any) {
      console.warn('Error en Supabase promotions, guardando en local:', err);
    }
  }

  // Local fallback
  const items = getStoredLocalPromotions();
  const newPromo: DbPromotion = {
    ...promo,
    code: promo.code.trim().toUpperCase(),
    id: 'promo-' + Date.now(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  items.unshift(newPromo);
  saveStoredLocalPromotions(items);
  return { success: true, data: newPromo };
}

/**
 * Actualiza una promoción existente (Admin)
 */
export async function updatePromotion(
  id: string,
  updates: Partial<DbPromotion>
): Promise<{ success: boolean; data?: DbPromotion; error?: string }> {
  if (isSupabaseConfigured) {
    try {
      const payload: any = { ...updates, updated_at: new Date().toISOString() };
      if (payload.code) payload.code = payload.code.trim().toUpperCase();

      const { data, error } = await supabase
        .from('promotions')
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

  const items = getStoredLocalPromotions();
  const idx = items.findIndex((p) => p.id === id);
  if (idx !== -1) {
    items[idx] = { ...items[idx], ...updates, updated_at: new Date().toISOString() };
    saveStoredLocalPromotions(items);
    return { success: true, data: items[idx] };
  }

  return { success: false, error: 'Promoción no encontrada' };
}

/**
 * Conmuta rápido el estado activo/inactivo (Admin)
 */
export async function togglePromotionActive(id: string, active: boolean) {
  return updatePromotion(id, { active });
}

/**
 * Elimina una promoción (Admin)
 */
export async function deletePromotion(id: string): Promise<{ success: boolean; error?: string }> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('promotions').delete().eq('id', id);
      if (!error) return { success: true };
    } catch {
      // Fallback
    }
  }

  const items = getStoredLocalPromotions().filter((p) => p.id !== id);
  saveStoredLocalPromotions(items);
  return { success: true };
}
