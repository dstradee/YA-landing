// ==============================================================================
// YA - GESTIÓN DE CONFIGURACIÓN COMERCIAL (PHASE 3B)
// Archivo: src/lib/commercialSettings.ts
// ==============================================================================

import { supabase, isSupabaseConfigured } from './supabase';
import type { DbCommercialSettings } from '../types/app';
import { DEFAULT_COMMERCIAL_SETTINGS } from './pricing';

const STORAGE_KEY = 'ya_commercial_settings_local';

/**
 * Obtiene la configuración comercial activa desde Supabase o fallback local
 */
export async function getCommercialSettings(): Promise<DbCommercialSettings> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('commercial_settings')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

      if (!error && data) {
        const settings: DbCommercialSettings = {
          id: data.id,
          min_order_enabled: Boolean(data.min_order_enabled),
          min_order_amount: Number(data.min_order_amount),
          free_shipping_enabled: Boolean(data.free_shipping_enabled),
          free_shipping_threshold: Number(data.free_shipping_threshold),
          standard_delivery_fee: Number(data.standard_delivery_fee),
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
        // Cachear localmente
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch {
          // Ignore
        }
        return settings;
      }
    } catch {
      // Usar fallback
    }
  }

  // Fallback a localStorage o default
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_COMMERCIAL_SETTINGS, ...JSON.parse(saved) };
    }
  } catch {
    // Ignore
  }

  return DEFAULT_COMMERCIAL_SETTINGS;
}

/**
 * Actualiza la configuración comercial (solo rol admin en Supabase)
 */
export async function updateCommercialSettings(
  settings: Partial<DbCommercialSettings>
): Promise<{ success: boolean; data?: DbCommercialSettings; error?: string }> {
  const payload = {
    min_order_enabled: settings.min_order_enabled ?? true,
    min_order_amount: Number(settings.min_order_amount ?? 10.0),
    free_shipping_enabled: settings.free_shipping_enabled ?? true,
    free_shipping_threshold: Number(settings.free_shipping_threshold ?? 30.0),
    standard_delivery_fee: Number(settings.standard_delivery_fee ?? 2.9),
  };

  if (isSupabaseConfigured) {
    try {
      // 1. Intentar RPC seguro admin_update_commercial_settings
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'admin_update_commercial_settings',
        {
          p_min_order_enabled: payload.min_order_enabled,
          p_min_order_amount: payload.min_order_amount,
          p_free_shipping_enabled: payload.free_shipping_enabled,
          p_free_shipping_threshold: payload.free_shipping_threshold,
          p_standard_delivery_fee: payload.standard_delivery_fee,
        }
      );

      if (!rpcError && rpcData?.success) {
        const updated = rpcData.settings as DbCommercialSettings;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return { success: true, data: updated };
      }

      // 2. Fallback a UPDATE directo sobre la tabla (protegido por RLS)
      const { data, error } = await supabase
        .from('commercial_settings')
        .update(payload)
        .eq('id', 'default')
        .select()
        .single();

      if (!error && data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return { success: true, data };
      }
    } catch (err: any) {
      console.warn('Error en Supabase commercial_settings, guardando en local:', err);
    }
  }

  // Guardado local (mock o contingencia)
  const current = await getCommercialSettings();
  const updated: DbCommercialSettings = {
    ...current,
    ...payload,
    updated_at: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return { success: true, data: updated };
}
