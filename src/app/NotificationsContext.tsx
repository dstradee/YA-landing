// ==============================================================================
// YA DELIVERY - CONTEXTO GLOBAL DE NOTIFICACIONES (FASE 8)
// Archivo: src/app/NotificationsContext.tsx
// ==============================================================================

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useAuth } from '../lib/auth';
import type { DbNotification } from '../types/app';
import {
  fetchUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeToUserNotifications,
} from '../lib/notifications';

interface NotificationsContextValue {
  notifications: DbNotification[];
  unreadCount: number;
  totalCount: number;
  loading: boolean;
  activeToast: DbNotification | null;
  dismissToast: () => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  isPreferencesOpen: boolean;
  setIsPreferencesOpen: (open: boolean) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeToast, setActiveToast] = useState<DbNotification | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState<boolean>(false);

  const loadNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setTotalCount(0);
      return;
    }

    setLoading(true);
    const res = await fetchUserNotifications(40, 0);
    if (res.data) {
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unread_count);
      setTotalCount(res.data.total_count);
    }
    setLoading(false);
  }, [user]);

  // Cargar notificaciones cuando el usuario se autentica
  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Suscripción Realtime a nuevas notificaciones
  useEffect(() => {
    if (!user?.id) return;

    const unsubscribe = subscribeToUserNotifications(user.id, (newNotif) => {
      // Agregar al inicio evitando duplicados
      setNotifications((prev) => {
        if (prev.some((n) => n.id === newNotif.id)) return prev;
        return [newNotif, ...prev];
      });

      // Incrementar contador no leídas
      setUnreadCount((prev) => prev + 1);
      setTotalCount((prev) => prev + 1);

      // Mostrar toast emergente en pantalla durante 5 segundos
      setActiveToast(newNotif);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.id]);

  // Auto-dismiss del toast después de 5 segundos
  useEffect(() => {
    if (!activeToast) return;
    const timer = setTimeout(() => {
      setActiveToast(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [activeToast]);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
  }, []);

  const handleMarkAsRead = useCallback(async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    await markNotificationRead(id);
  }, []);

  const handleMarkAllAsRead = useCallback(async () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true, read_at: new Date().toISOString() }))
    );
    setUnreadCount(0);

    await markAllNotificationsRead();
  }, []);

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        totalCount,
        loading,
        activeToast,
        dismissToast,
        markAsRead: handleMarkAsRead,
        markAllAsRead: handleMarkAllAsRead,
        refresh: loadNotifications,
        isDrawerOpen,
        setIsDrawerOpen,
        isPreferencesOpen,
        setIsPreferencesOpen,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}
