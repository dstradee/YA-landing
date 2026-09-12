// ==============================================================================
// YA - GESTIÓN DE SUGERENCIAS DE PRODUCTOS POR CLIENTES (FASE 10)
// Archivo: src/lib/suggestions.ts
// ==============================================================================

import { supabase, isSupabaseConfigured } from './supabase';
import type { ProductSuggestion, SuggestionStatus } from '../types/app';

const LOCAL_STORAGE_SUGGESTIONS_KEY = 'ya_local_product_suggestions';

function getLocalSuggestions(): ProductSuggestion[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SUGGESTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalSuggestions(list: ProductSuggestion[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_SUGGESTIONS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

/**
 * Crea una nueva sugerencia de producto por parte del cliente
 */
export async function createProductSuggestion(payload: {
  userId: string;
  title: string;
  brand?: string;
  categoryHint?: string;
  description?: string;
  estimatedPrice?: number;
  referenceUrl?: string;
}): Promise<{ suggestion: ProductSuggestion | null; error: string | null }> {
  if (!isSupabaseConfigured) {
    const newSug: ProductSuggestion = {
      id: 'sug-' + Math.random().toString(36).substring(2, 9),
      user_id: payload.userId,
      title: payload.title,
      brand: payload.brand || null,
      category_hint: payload.categoryHint || null,
      description: payload.description || null,
      estimated_price: payload.estimatedPrice || null,
      reference_url: payload.referenceUrl || null,
      status: 'pending',
      admin_notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const list = getLocalSuggestions();
    list.unshift(newSug);
    saveLocalSuggestions(list);
    return { suggestion: newSug, error: null };
  }

  try {
    const { data, error } = await supabase
      .from('product_suggestions')
      .insert({
        user_id: payload.userId,
        title: payload.title,
        brand: payload.brand || null,
        category_hint: payload.categoryHint || null,
        description: payload.description || null,
        estimated_price: payload.estimatedPrice || null,
        reference_url: payload.referenceUrl || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return { suggestion: data as ProductSuggestion, error: null };
  } catch (err: any) {
    return { suggestion: null, error: err?.message || 'Error al enviar sugerencia' };
  }
}

/**
 * Consulta las sugerencias creadas por el cliente actual
 */
export async function fetchMySuggestions(
  userId: string
): Promise<{ suggestions: ProductSuggestion[]; error: string | null }> {
  if (!isSupabaseConfigured) {
    const list = getLocalSuggestions().filter((s) => s.user_id === userId);
    return { suggestions: list, error: null };
  }

  try {
    const { data, error } = await supabase
      .from('product_suggestions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { suggestions: (data as ProductSuggestion[]) || [], error: null };
  } catch (err: any) {
    return { suggestions: [], error: err?.message || 'Error al cargar sugerencias' };
  }
}

/**
 * Consulta todas las sugerencias para el panel de administración
 */
export async function adminFetchAllSuggestions(
  statusFilter?: SuggestionStatus | 'all'
): Promise<{ suggestions: ProductSuggestion[]; error: string | null }> {
  if (!isSupabaseConfigured) {
    let list = getLocalSuggestions();
    if (statusFilter && statusFilter !== 'all') {
      list = list.filter((s) => s.status === statusFilter);
    }
    return { suggestions: list, error: null };
  }

  try {
    let query = supabase
      .from('product_suggestions')
      .select(`
        *,
        profile:profiles(id, full_name, email, phone)
      `)
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) throw error;

    const formatted: ProductSuggestion[] = (data || []).map((row: any) => ({
      ...row,
      user_name: row.profile?.full_name || 'Cliente YA',
      user_email: row.profile?.email || null,
    }));

    return { suggestions: formatted, error: null };
  } catch (err: any) {
    return { suggestions: [], error: err?.message || 'Error al cargar sugerencias de catálogo' };
  }
}

/**
 * Actualiza el estado y notas internas de una sugerencia desde administración
 */
export async function adminUpdateSuggestion(
  id: string,
  status: SuggestionStatus,
  adminNotes?: string | null
): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured) {
    const list = getLocalSuggestions();
    const idx = list.findIndex((s) => s.id === id);
    if (idx !== -1) {
      list[idx].status = status;
      if (adminNotes !== undefined) list[idx].admin_notes = adminNotes;
      list[idx].updated_at = new Date().toISOString();
      saveLocalSuggestions(list);
    }
    return { success: true, error: null };
  }

  try {
    const { error } = await supabase
      .from('product_suggestions')
      .update({
        status,
        admin_notes: adminNotes !== undefined ? adminNotes : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al actualizar sugerencia' };
  }
}

/**
 * Elimina una sugerencia de producto
 */
export async function adminDeleteSuggestion(
  id: string
): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured) {
    let list = getLocalSuggestions();
    list = list.filter((s) => s.id !== id);
    saveLocalSuggestions(list);
    return { success: true, error: null };
  }

  try {
    const { error } = await supabase.from('product_suggestions').delete().eq('id', id);
    if (error) throw error;
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al eliminar sugerencia' };
  }
}
