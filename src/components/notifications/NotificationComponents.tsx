// ==============================================================================
// YA DELIVERY - COMPONENTES DEL CENTRO DE NOTIFICACIONES (FASE 8)
// Archivo: src/components/notifications/NotificationComponents.tsx
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  CheckCircle,
  AlertTriangle,
  Package,
  Bike,
  Tag,
  Info,
  Sliders,
  X,
  ExternalLink,
  Clock,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { useNotifications } from '../../app/NotificationsContext';
import { formatNotificationTime, getNotificationPreferences, updateNotificationPreferences } from '../../lib/notifications';
import type { DbNotification, DbNotificationPreferences, NotificationType } from '../../types/app';

/**
 * Retorna icono y colores correspondientes según el tipo de notificación
 */
export function getNotificationVisuals(type: NotificationType) {
  switch (type) {
    case 'order_received':
    case 'payment_confirmed':
      return {
        icon: Package,
        color: 'text-[#B6FF00] bg-[#B6FF00]/10 border-[#B6FF00]/30',
        label: 'Pedido',
      };
    case 'order_preparing':
    case 'order_prepared':
      return {
        icon: Clock,
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
        label: 'Preparación',
      };
    case 'order_sourcing':
    case 'admin_sourcing_needed':
      return {
        icon: RefreshCw,
        color: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
        label: 'Abastecimiento',
      };
    case 'order_delivering':
    case 'courier_order_assigned':
    case 'courier_order_available':
      return {
        icon: Bike,
        color: 'text-[#B6FF00] bg-[#B6FF00]/10 border-[#B6FF00]/30',
        label: 'Reparto',
      };
    case 'order_delivered':
      return {
        icon: CheckCircle,
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
        label: 'Entregado',
      };
    case 'order_cancelled':
    case 'order_incident':
    case 'admin_critical_incident':
    case 'courier_incident_alert':
      return {
        icon: AlertTriangle,
        color: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
        label: 'Incidencia',
      };
    case 'promotion':
      return {
        icon: Tag,
        color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
        label: 'Promoción',
      };
    case 'admin_new_order':
      return {
        icon: Package,
        color: 'text-[#B6FF00] bg-[#B6FF00]/10 border-[#B6FF00]/30',
        label: 'Nuevo Pedido',
      };
    default:
      return {
        icon: Info,
        color: 'text-zinc-300 bg-zinc-800 border-zinc-700',
        label: 'Aviso',
      };
  }
}

/**
 * BOTÓN CAMPANA DE NOTIFICACIONES (Encabezados / Barras de navegación)
 */
export function NotificationBell({
  className = '',
  buttonId = 'btn-notification-bell',
}: {
  className?: string;
  buttonId?: string;
}) {
  const { unreadCount, setIsDrawerOpen } = useNotifications();

  return (
    <button
      id={buttonId}
      onClick={() => setIsDrawerOpen(true)}
      aria-label="Notificaciones"
      className={`relative p-2.5 rounded-xl border border-zinc-800 bg-[#121212] hover:bg-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-all active:scale-95 cursor-pointer ${className}`}
    >
      <Bell className="w-5 h-5" />
      {unreadCount > 0 && (
        <span
          id="badge-notification-unread-count"
          className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1.5 flex items-center justify-center text-[10px] font-black tracking-tight text-black bg-[#B6FF00] rounded-full border border-black shadow-lg animate-pulse"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

/**
 * PANEL LATERAL / DRAWER DEL CENTRO DE NOTIFICACIONES
 */
export function NotificationDrawer() {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    totalCount,
    loading,
    isDrawerOpen,
    setIsDrawerOpen,
    markAsRead,
    markAllAsRead,
    refresh,
    setIsPreferencesOpen,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');

  if (!isDrawerOpen) return null;

  const filtered = notifications.filter((n) => (activeTab === 'unread' ? !n.read : true));

  const handleNotificationClick = async (notif: DbNotification) => {
    if (!notif.read) {
      await markAsRead(notif.id);
    }
    if (notif.link) {
      setIsDrawerOpen(false);
      navigate(notif.link);
    }
  };

  return (
    <div
      id="drawer-notifications-backdrop"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex justify-end animate-fadeIn"
      onClick={() => setIsDrawerOpen(false)}
    >
      <div
        id="drawer-notifications-panel"
        className="w-full max-w-md h-full bg-[#0D0D0D] border-l border-zinc-800 flex flex-col shadow-2xl text-white overflow-hidden animate-slideLeft"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Drawer */}
        <div className="p-4 border-b border-zinc-800 bg-[#141414] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#B6FF00]/10 border border-[#B6FF00]/30 flex items-center justify-center text-[#B6FF00]">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-tight text-white flex items-center gap-2">
                Notificaciones
                {unreadCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#B6FF00] text-black font-bold">
                    {unreadCount} nuevas
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-zinc-400 font-mono">Actualizaciones de tus entregas</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              id="btn-notification-preferences"
              onClick={() => setIsPreferencesOpen(true)}
              title="Ajustes de notificaciones"
              className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <Sliders className="w-4 h-4" />
            </button>
            <button
              id="btn-close-notification-drawer"
              onClick={() => setIsDrawerOpen(false)}
              className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Acciones Rápidas y Pestañas */}
        <div className="px-4 py-2.5 bg-[#121212] border-b border-zinc-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
            <button
              id="tab-notifications-all"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                activeTab === 'all'
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Todas ({totalCount})
            </button>
            <button
              id="tab-notifications-unread"
              onClick={() => setActiveTab('unread')}
              className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                activeTab === 'unread'
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              No leídas ({unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              id="btn-mark-all-read"
              onClick={markAllAllReadClick}
              className="flex items-center gap-1.5 text-zinc-400 hover:text-[#B6FF00] transition-colors font-mono text-[11px]"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Marcar leídas
            </button>
          )}
        </div>

        {/* Listado de Notificaciones */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-900 p-3 space-y-2">
          {loading && notifications.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-zinc-500 gap-2 font-mono text-xs">
              <RefreshCw className="w-5 h-5 animate-spin text-[#B6FF00]" />
              <span>Cargando notificaciones...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 px-4 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 mb-3">
                <Bell className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-zinc-300 mb-1">Todo al día</p>
              <p className="text-xs text-zinc-500 max-w-xs">
                {activeTab === 'unread'
                  ? 'No tienes notificaciones pendientes por leer.'
                  : 'No has recibido ninguna notificación todavía.'}
              </p>
            </div>
          ) : (
            filtered.map((notif) => {
              const visuals = getNotificationVisuals(notif.type);
              const IconComp = visuals.icon;

              return (
                <div
                  key={notif.id}
                  id={`notification-item-${notif.id}`}
                  onClick={() => handleNotificationClick(notif)}
                  className={`group relative p-3.5 rounded-xl border transition-all cursor-pointer ${
                    notif.read
                      ? 'bg-[#111111]/70 border-zinc-900/90 text-zinc-400 hover:bg-[#161616] hover:border-zinc-800'
                      : 'bg-[#161616] border-zinc-800 text-white hover:border-[#B6FF00]/50 hover:bg-[#1a1a1a] shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Icono con distintivo de estado */}
                    <div
                      className={`w-9 h-9 shrink-0 rounded-xl border flex items-center justify-center ${visuals.color}`}
                    >
                      <IconComp className="w-4 h-4" />
                    </div>

                    {/* Contenido */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-zinc-400">
                          {visuals.label}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {notif.is_test && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-amber-400 border border-amber-400/30 font-mono font-bold">
                              TEST
                            </span>
                          )}
                          <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                            {formatNotificationTime(notif.created_at)}
                          </span>
                        </div>
                      </div>

                      <h4
                        className={`text-xs font-bold leading-snug mb-1 ${
                          notif.read ? 'text-zinc-300' : 'text-white'
                        }`}
                      >
                        {notif.title}
                      </h4>
                      <p className="text-[12px] leading-relaxed text-zinc-400 line-clamp-2">
                        {notif.message}
                      </p>

                      {notif.link && (
                        <div className="mt-2 flex items-center gap-1 text-[11px] font-mono text-[#B6FF00] group-hover:underline">
                          <span>Ver detalles</span>
                          <ExternalLink className="w-3 h-3" />
                        </div>
                      )}
                    </div>

                    {/* Indicador visual de no leído */}
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-[#B6FF00] shrink-0 mt-1 shadow-[0_0_8px_#B6FF00]" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800 bg-[#121212] flex items-center justify-between text-xs text-zinc-500 font-mono">
          <span>YA Jerez · Notificaciones en vivo</span>
          <button
            id="btn-refresh-notifications"
            onClick={refresh}
            className="hover:text-white flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Refrescar
          </button>
        </div>
      </div>
    </div>
  );

  async function markAllAllReadClick(e: React.MouseEvent) {
    e.stopPropagation();
    await markAllAsRead();
  }
}

/**
 * TOAST FLOTANTE IN-APP
 * Aparece en tiempo real al llegar una nueva notificación
 */
export function NotificationToast() {
  const navigate = useNavigate();
  const { activeToast, dismissToast, markAsRead } = useNotifications();

  if (!activeToast) return null;

  const visuals = getNotificationVisuals(activeToast.type);
  const IconComp = visuals.icon;

  const handleClick = async () => {
    await markAsRead(activeToast.id);
    dismissToast();
    if (activeToast.link) {
      navigate(activeToast.link);
    }
  };

  return (
    <div
      id="notification-floating-toast"
      className="fixed top-4 right-4 z-50 max-w-sm w-full bg-[#121212] border-2 border-[#B6FF00] text-white p-3.5 rounded-2xl shadow-2xl animate-bounceIn flex items-start gap-3"
      onClick={handleClick}
    >
      <div className={`w-9 h-9 shrink-0 rounded-xl border flex items-center justify-center ${visuals.color}`}>
        <IconComp className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0 cursor-pointer">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className="text-[10px] font-mono font-bold uppercase text-[#B6FF00]">
            {visuals.label}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono">Ahora</span>
        </div>
        <h5 className="text-xs font-bold leading-tight truncate text-white">{activeToast.title}</h5>
        <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">{activeToast.message}</p>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          dismissToast();
        }}
        className="text-zinc-500 hover:text-white p-1 rounded-md transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/**
 * MODAL DE PREFERENCIAS DE NOTIFICACIONES (FASE 8 - REGLA DE NO DESACTIVACIÓN CRÍTICA)
 */
export function NotificationPreferencesModal() {
  const { isPreferencesOpen, setIsPreferencesOpen } = useNotifications();
  const [prefs, setPrefs] = useState<DbNotificationPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!isPreferencesOpen) return;
    setLoading(true);
    getNotificationPreferences().then((res) => {
      if (res.preferences) {
        setPrefs(res.preferences);
      }
      setLoading(false);
    });
  }, [isPreferencesOpen]);

  if (!isPreferencesOpen) return null;

  const handleSave = async () => {
    if (!prefs) return;
    setSaving(true);
    const res = await updateNotificationPreferences({
      order_updates: prefs.order_updates,
      promotions: prefs.promotions,
      email_enabled: prefs.email_enabled,
      push_enabled: prefs.push_enabled,
    });
    setSaving(false);
    if (res.preferences) {
      setPrefs(res.preferences);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setIsPreferencesOpen(false);
      }, 1200);
    }
  };

  return (
    <div
      id="modal-notification-preferences-backdrop"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
      onClick={() => setIsPreferencesOpen(false)}
    >
      <div
        id="modal-notification-preferences-dialog"
        className="w-full max-w-md bg-[#121212] border border-zinc-800 rounded-2xl p-6 text-white shadow-2xl animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#B6FF00]/10 border border-[#B6FF00]/30 flex items-center justify-center text-[#B6FF00]">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-tight">Ajustes de avisos</h3>
              <p className="text-xs text-zinc-400">Personaliza tus notificaciones en YA</p>
            </div>
          </div>
          <button
            onClick={() => setIsPreferencesOpen(false)}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading || !prefs ? (
          <div className="py-12 text-center text-zinc-500 font-mono text-xs flex flex-col items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-[#B6FF00]" />
            <span>Cargando tus preferencias...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Opción 1: Actualizaciones de pedidos */}
            <div className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-[#181818] border border-zinc-800">
              <div className="flex-1">
                <span className="text-sm font-bold block text-white">Estado de pedidos</span>
                <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                  Avisos cuando tu pedido está siendo preparado, empaquetado o en camino.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={prefs.order_updates}
                  onChange={(e) => setPrefs({ ...prefs, order_updates: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#B6FF00] peer-checked:after:bg-black"></div>
              </label>
            </div>

            {/* Opción 2: Avisos críticos del sistema (BLINDADO Y NO DESACTIVABLE) */}
            <div className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-[#181818] border border-zinc-800/80">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">Avisos críticos del sistema</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    OBLIGATORIO
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                  Cancelaciones, problemas con el pago o incidencias importantes. No pueden
                  desactivarse por seguridad de la entrega.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-not-allowed mt-1 opacity-70">
                <input type="checkbox" checked={true} disabled className="sr-only peer" />
                <div className="w-11 h-6 bg-[#B6FF00] rounded-full peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-black after:border after:rounded-full after:h-5 after:w-5"></div>
              </label>
            </div>

            {/* Opción 3: Promociones y novedades */}
            <div className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-[#181818] border border-zinc-800">
              <div className="flex-1">
                <span className="text-sm font-bold block text-white">Promociones y ofertas</span>
                <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                  Descuentos exclusivos, cupones y novedades en Jerez.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={prefs.promotions}
                  onChange={(e) => setPrefs({ ...prefs, promotions: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#B6FF00] peer-checked:after:bg-black"></div>
              </label>
            </div>

            {/* Botón de Guardado */}
            <div className="pt-2">
              <button
                id="btn-save-notification-preferences"
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3 px-4 rounded-xl bg-[#B6FF00] text-black font-black uppercase text-xs tracking-wider hover:bg-[#a6eb00] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Guardando...
                  </>
                ) : saveSuccess ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    ¡Preferencias guardadas!
                  </>
                ) : (
                  'Guardar preferencias'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
