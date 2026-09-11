// ==============================================================================
// YA DELIVERY - PÁGINA DEL CENTRO DE NOTIFICACIONES (FASE 8)
// Archivo: src/app/NotificationsPage.tsx
// ==============================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  ArrowLeft,
  CheckCheck,
  Sliders,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { useNotifications } from './NotificationsContext';
import { formatNotificationTime } from '../lib/notifications';
import {
  getNotificationVisuals,
  NotificationPreferencesModal,
} from '../components/notifications/NotificationComponents';
import type { DbNotification } from '../types/app';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    totalCount,
    loading,
    markAsRead,
    markAllAsRead,
    refresh,
    setIsPreferencesOpen,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');

  const filtered = notifications.filter((n) => (activeTab === 'unread' ? !n.read : true));

  const handleNotificationClick = async (notif: DbNotification) => {
    if (!notif.read) {
      await markAsRead(notif.id);
    }
    if (notif.link) {
      navigate(notif.link);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#0F0F0F]/90 backdrop-blur-md border-b border-zinc-800 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            id="btn-notifications-back"
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-black uppercase tracking-tight text-white flex items-center gap-2">
              Centro de Notificaciones
              {unreadCount > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#B6FF00] text-black font-bold">
                  {unreadCount}
                </span>
              )}
            </h1>
            <p className="text-xs text-zinc-400 font-mono">Tus avisos en tiempo real</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-open-notifications-page-prefs"
            onClick={() => setIsPreferencesOpen(true)}
            className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Ajustes de avisos"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Controles de filtro y acción de lectura */}
        <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'all'
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Todas ({totalCount})
            </button>
            <button
              onClick={() => setActiveTab('unread')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'unread'
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              No leídas ({unreadCount})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-[#B6FF00] font-mono px-2 py-1 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Marcar todas</span>
              </button>
            )}
            <button
              onClick={() => refresh()}
              title="Refrescar"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#B6FF00]' : ''}`} />
            </button>
          </div>
        </div>

        {/* Listado */}
        {loading && notifications.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-zinc-500 gap-2 font-mono text-xs">
            <RefreshCw className="w-6 h-6 animate-spin text-[#B6FF00]" />
            <span>Cargando notificaciones...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 px-4 rounded-2xl border border-zinc-800/80 bg-[#121212] flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 mb-3">
              <Bell className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-zinc-200 mb-1">Sin notificaciones</h3>
            <p className="text-xs text-zinc-500 max-w-sm">
              {activeTab === 'unread'
                ? 'No tienes ninguna notificación pendiente de leer en este momento.'
                : 'No tienes notificaciones registradas.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((notif) => {
              const visuals = getNotificationVisuals(notif.type);
              const IconComp = visuals.icon;

              return (
                <div
                  key={notif.id}
                  id={`notification-page-item-${notif.id}`}
                  onClick={() => handleNotificationClick(notif)}
                  className={`group p-4 rounded-2xl border transition-all cursor-pointer ${
                    notif.read
                      ? 'bg-[#121212]/80 border-zinc-800/60 text-zinc-400 hover:bg-[#161616] hover:border-zinc-700'
                      : 'bg-[#161616] border-zinc-700 text-white hover:border-[#B6FF00]/60 hover:bg-[#1a1a1a] shadow-md'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center ${visuals.color}`}
                    >
                      <IconComp className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-mono uppercase font-bold tracking-wider text-zinc-400">
                          {visuals.label}
                        </span>
                        <div className="flex items-center gap-2">
                          {notif.is_test && (
                            <span className="text-[9px] px-2 py-0.5 rounded bg-zinc-800 text-amber-400 border border-amber-400/30 font-mono font-bold">
                              TEST
                            </span>
                          )}
                          <span className="text-xs text-zinc-500 font-mono">
                            {formatNotificationTime(notif.created_at)}
                          </span>
                        </div>
                      </div>

                      <h4
                        className={`text-sm font-bold leading-snug mb-1 ${
                          notif.read ? 'text-zinc-300' : 'text-white'
                        }`}
                      >
                        {notif.title}
                      </h4>
                      <p className="text-xs leading-relaxed text-zinc-400">{notif.message}</p>

                      {notif.link && (
                        <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-mono text-[#B6FF00] group-hover:underline">
                          <span>Ver en el pedido</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>

                    {!notif.read && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#B6FF00] shrink-0 mt-1.5 shadow-[0_0_8px_#B6FF00]" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <NotificationPreferencesModal />
    </div>
  );
}
