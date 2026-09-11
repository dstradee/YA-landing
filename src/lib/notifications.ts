// ==============================================================================
// YA DELIVERY - CLIENTE DE NOTIFICACIONES (FASE 8)
// Archivo: src/lib/notifications.ts
// ==============================================================================

import { supabase, isSupabaseConfigured } from './supabase';
import type {
  DbNotification,
  DbNotificationPreferences,
  NotificationsFetchResult,
} from '../types/app';

/**
 * Obtener notificaciones del usuario autenticado (paginadas con contador de no leídas)
 */
export async function fetchUserNotifications(
  limit: number = 30,
  offset: number = 0
): Promise<{ data: NotificationsFetchResult | null; error: string | null }> {
  if (!isSupabaseConfigured) {
    return {
      data: {
        notifications: [],
        unread_count: 0,
        total_count: 0,
      },
      error: null,
    };
  }

  try {
    const { data, error } = await supabase.rpc('user_fetch_notifications', {
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      // Fallback a consulta directa sobre public.notifications respetando RLS
      const {
        data: directData,
        error: directErr,
        count: totalCount,
      } = await supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (directErr) {
        return { data: null, error: directErr.message };
      }

      const { count: unreadCount } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('read', false);

      return {
        data: {
          notifications: (directData || []) as DbNotification[],
          unread_count: unreadCount || 0,
          total_count: totalCount || 0,
        },
        error: null,
      };
    }

    const payload = data as {
      success: boolean;
      notifications: DbNotification[];
      unread_count: number;
      total_count: number;
    };

    return {
      data: {
        notifications: payload.notifications || [],
        unread_count: payload.unread_count || 0,
        total_count: payload.total_count || 0,
      },
      error: null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al cargar notificaciones.';
    return { data: null, error: msg };
  }
}

/**
 * Marcar una notificación individual como leída
 */
export async function markNotificationRead(
  notificationId: string
): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured || !notificationId) {
    return { success: false, error: 'Configuración o ID no válidos' };
  }

  try {
    const { data, error } = await supabase.rpc('user_mark_notification_read', {
      p_notification_id: notificationId,
    });

    if (error) {
      // Fallback directo a UPDATE respetando RLS
      const { error: directErr } = await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (directErr) {
        return { success: false, error: directErr.message };
      }
      return { success: true, error: null };
    }

    const payload = data as { success?: boolean; error?: string };
    if (payload && payload.success === false) {
      return { success: false, error: payload.error || 'Error al marcar como leída.' };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al actualizar estado de notificación.';
    return { success: false, error: msg };
  }
}

/**
 * Marcar todas las notificaciones pendientes como leídas
 */
export async function markAllNotificationsRead(): Promise<{
  success: boolean;
  updatedCount?: number;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase no configurado' };
  }

  try {
    const { data, error } = await supabase.rpc('user_mark_all_notifications_read');

    if (error) {
      // Fallback directo respetando RLS
      const { error: directErr } = await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('read', false);

      if (directErr) {
        return { success: false, error: directErr.message };
      }
      return { success: true, error: null };
    }

    const payload = data as { success?: boolean; updated_count?: number };
    return {
      success: true,
      updatedCount: payload?.updated_count ?? 0,
      error: null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al marcar todas como leídas.';
    return { success: false, error: msg };
  }
}

/**
 * Consultar preferencias de notificación del usuario actual
 */
export async function getNotificationPreferences(): Promise<{
  preferences: DbNotificationPreferences | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return { preferences: null, error: 'Supabase no configurado' };
  }

  try {
    const { data, error } = await supabase.rpc('user_get_notification_preferences');

    if (error) {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user?.id) return { preferences: null, error: 'Usuario no autenticado' };

      const { data: directData, error: directErr } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.user.id)
        .maybeSingle();

      if (directErr) {
        return { preferences: null, error: directErr.message };
      }

      if (!directData) {
        return {
          preferences: {
            user_id: user.user.id,
            order_updates: true,
            important_alerts: true,
            promotions: true,
            email_enabled: false,
            push_enabled: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          error: null,
        };
      }

      return { preferences: directData as DbNotificationPreferences, error: null };
    }

    const payload = data as {
      success: boolean;
      preferences: DbNotificationPreferences;
    };

    return { preferences: payload.preferences, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al consultar preferencias.';
    return { preferences: null, error: msg };
  }
}

/**
 * Actualizar preferencias de notificación del usuario
 */
export async function updateNotificationPreferences(params: {
  order_updates?: boolean;
  promotions?: boolean;
  email_enabled?: boolean;
  push_enabled?: boolean;
}): Promise<{ preferences: DbNotificationPreferences | null; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { preferences: null, error: 'Supabase no configurado' };
  }

  try {
    const { data, error } = await supabase.rpc('user_update_notification_preferences', {
      p_order_updates: params.order_updates ?? true,
      p_promotions: params.promotions ?? true,
      p_email_enabled: params.email_enabled ?? false,
      p_push_enabled: params.push_enabled ?? false,
    });

    if (error) {
      return { preferences: null, error: error.message };
    }

    const payload = data as {
      success: boolean;
      preferences: DbNotificationPreferences;
    };

    return { preferences: payload.preferences, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al guardar preferencias.';
    return { preferences: null, error: msg };
  }
}

/**
 * Suscribirse en tiempo real a las notificaciones dirigidas al usuario actual
 */
export function subscribeToUserNotifications(
  userId: string,
  onNotification: (notification: DbNotification) => void
): () => void {
  if (!isSupabaseConfigured || !userId || typeof supabase.channel !== 'function') {
    return () => {};
  }

  try {
    const channelName = `user-notifications-${userId.slice(0, 8)}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new) {
            onNotification(payload.new as DbNotification);
          }
        }
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
 * Helper de tiempo relativo para notificaciones
 */
export function formatNotificationTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) {
      return 'Ahora';
    }
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
      return `Hace ${diffMinutes}m`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `Hace ${diffHours}h`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) {
      return 'Ayer';
    }
    if (diffDays < 7) {
      return `Hace ${diffDays}d`;
    }
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}
