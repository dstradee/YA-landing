// ==============================================================================
// YA - GESTIÓN DE SUGERENCIAS DE PRODUCTOS (ADMIN Y CLIENTE)
// Archivo: src/lib/adminSuggestions.ts
// ==============================================================================

import { supabase, isSupabaseConfigured } from './supabase';
import type { DbProductSuggestion, ProductSuggestionStatus } from '../types/app';

const STORAGE_KEY = 'ya_product_suggestions_local';

const INITIAL_LOCAL_SUGGESTIONS: DbProductSuggestion[] = [
  {
    id: 'sugg-1',
    user_id: 'user-sample-1',
    name: 'Monster Mango Loco 500ml',
    category_name: 'Bebidas Energéticas',
    brand: 'Monster Energy',
    description: 'Es el sabor más pedido y se agota rápido en supermercados. Imprescindible para las noches.',
    reference_url: 'https://www.monsterenergy.com/products/monster-energy/mango-loco',
    estimated_price: 2.10,
    status: 'pending',
    admin_notes: null,
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    user_email: 'cliente1@ejemplo.com',
    user_name: 'Marcos Gómez',
  },
  {
    id: 'sugg-2',
    user_id: 'user-sample-2',
    name: 'Hielo Picado Cocktail 2kg',
    category_name: 'Hielo & Congelados',
    brand: 'Hielos Jerez',
    description: 'Para cubatas y copas en fiestas viene mucho mejor que los cubos gigantes.',
    reference_url: null,
    estimated_price: 2.50,
    status: 'reviewing',
    admin_notes: 'Consultar con proveedor de congelados si tienen stock continuo los fines de semana.',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    user_email: 'maria.lucas@ejemplo.com',
    user_name: 'María Lucas',
  },
  {
    id: 'sugg-3',
    user_id: 'user-sample-3',
    name: 'Papel de liar OCB Negro Doble',
    category_name: 'Accesorios & Tabaco',
    brand: 'OCB',
    description: 'Petición frecuente cuando se acaban de madrugada.',
    reference_url: null,
    estimated_price: 1.80,
    status: 'accepted',
    admin_notes: 'Aprobado para añadir al catálogo en próxima reposición.',
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    user_email: 'jorge.navarro@ejemplo.com',
    user_name: 'Jorge Navarro',
  },
];

function getStoredLocalSuggestions(): DbProductSuggestion[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore
  }
  return INITIAL_LOCAL_SUGGESTIONS;
}

function saveStoredLocalSuggestions(items: DbProductSuggestion[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore
  }
}

/**
 * Obtiene todas las sugerencias con filtrado (Admin)
 */
export async function fetchProductSuggestions(filters?: {
  status?: ProductSuggestionStatus | 'all';
  query?: string;
}): Promise<{ data: DbProductSuggestion[]; error: string | null }> {
  if (isSupabaseConfigured) {
    try {
      let query = supabase
        .from('product_suggestions')
        .select(`
          *,
          user:user_id(id, email, raw_user_meta_data)
        `)
        .order('created_at', { ascending: false });

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      if (filters?.query && filters.query.trim()) {
        query = query.ilike('name', `%${filters.query.trim()}%`);
      }

      const { data, error } = await query;

      if (!error && data) {
        const mapped: DbProductSuggestion[] = data.map((item: any) => ({
          id: item.id,
          user_id: item.user_id,
          name: item.name,
          category_name: item.category_name,
          brand: item.brand,
          description: item.description,
          reference_url: item.reference_url,
          estimated_price: item.estimated_price ? Number(item.estimated_price) : null,
          status: item.status as ProductSuggestionStatus,
          admin_notes: item.admin_notes,
          created_at: item.created_at,
          updated_at: item.updated_at,
          user_email: item.user?.email || null,
          user_name: item.user?.raw_user_meta_data?.full_name || item.user?.email?.split('@')[0] || 'Usuario YA',
        }));
        return { data: mapped, error: null };
      }
      if (error) {
        console.warn('Supabase product_suggestions query returned error, falling back:', error.message);
      }
    } catch (err: any) {
      console.warn('Error fetching suggestions from Supabase:', err);
    }
  }

  // Fallback local
  let list = getStoredLocalSuggestions();
  if (filters?.status && filters.status !== 'all') {
    list = list.filter((s) => s.status === filters.status);
  }
  if (filters?.query && filters.query.trim()) {
    const q = filters.query.toLowerCase().trim();
    list = list.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.brand && s.brand.toLowerCase().includes(q)) ||
      (s.category_name && s.category_name.toLowerCase().includes(q))
    );
  }

  return { data: list, error: null };
}

/**
 * Actualiza el estado y notas internas de una sugerencia (Admin)
 */
export async function updateSuggestionStatus(
  id: string,
  status: ProductSuggestionStatus,
  adminNotes?: string
): Promise<{ success: boolean; error: string | null }> {
  if (isSupabaseConfigured) {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (adminNotes !== undefined) {
        updateData.admin_notes = adminNotes;
      }

      const { error } = await supabase
        .from('product_suggestions')
        .update(updateData)
        .eq('id', id);

      if (!error) return { success: true, error: null };
      return { success: false, error: error.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // Local fallback
  const items = getStoredLocalSuggestions();
  const idx = items.findIndex((s) => s.id === id);
  if (idx !== -1) {
    items[idx] = {
      ...items[idx],
      status,
      admin_notes: adminNotes !== undefined ? adminNotes : items[idx].admin_notes,
      updated_at: new Date().toISOString(),
    };
    saveStoredLocalSuggestions(items);
    return { success: true, error: null };
  }

  return { success: false, error: 'Sugerencia no encontrada' };
}

/**
 * Actualiza solo las notas internas del administrador
 */
export async function updateSuggestionAdminNotes(
  id: string,
  adminNotes: string
): Promise<{ success: boolean; error: string | null }> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('product_suggestions')
        .update({ admin_notes: adminNotes, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (!error) return { success: true, error: null };
      return { success: false, error: error.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  const items = getStoredLocalSuggestions();
  const idx = items.findIndex((s) => s.id === id);
  if (idx !== -1) {
    items[idx] = {
      ...items[idx],
      admin_notes: adminNotes,
      updated_at: new Date().toISOString(),
    };
    saveStoredLocalSuggestions(items);
    return { success: true, error: null };
  }

  return { success: false, error: 'Sugerencia no encontrada' };
}

/**
 * Envío de sugerencia por parte de un usuario cliente
 */
export async function createProductSuggestion(params: {
  userId?: string;
  name: string;
  categoryName?: string;
  brand?: string;
  description?: string;
  referenceUrl?: string;
  estimatedPrice?: number;
}): Promise<{ success: boolean; error: string | null; id?: string }> {
  if (isSupabaseConfigured) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const actualUserId = params.userId || authData.user?.id;

      if (!actualUserId) {
        return { success: false, error: 'Debes iniciar sesión para enviar una sugerencia' };
      }

      const { data, error } = await supabase
        .from('product_suggestions')
        .insert({
          user_id: actualUserId,
          name: params.name.trim(),
          category_name: params.categoryName?.trim() || null,
          brand: params.brand?.trim() || null,
          description: params.description?.trim() || null,
          reference_url: params.referenceUrl?.trim() || null,
          estimated_price: params.estimatedPrice ? Number(params.estimatedPrice) : null,
          status: 'pending',
        })
        .select()
        .single();

      if (!error && data) {
        return { success: true, error: null, id: data.id };
      }
      if (error) {
        return { success: false, error: error.message };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // Fallback local
  const items = getStoredLocalSuggestions();
  const newSugg: DbProductSuggestion = {
    id: 'sugg-' + Date.now(),
    user_id: params.userId || 'user-local',
    name: params.name.trim(),
    category_name: params.categoryName || null,
    brand: params.brand || null,
    description: params.description || null,
    reference_url: params.referenceUrl || null,
    estimated_price: params.estimatedPrice || null,
    status: 'pending',
    admin_notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_name: 'Tú',
  };
  items.unshift(newSugg);
  saveStoredLocalSuggestions(items);
  return { success: true, error: null, id: newSugg.id };
}
