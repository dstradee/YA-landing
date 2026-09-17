// ==============================================================================
// YA DELIVERY - CONTEXTO GLOBAL DE YA JUNTOS (PERSISTENCIA Y TIENDA INTEGRADA)
// Archivo: src/app/YaJuntosContext.tsx
// ==============================================================================

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { YaJuntosGroupWithDetails, CartPackSelection } from '../types/app';
import { useAuth } from '../lib/auth';
import {
  fetchUserActiveGroup,
  fetchYaJuntosGroupByCode,
  addItemToYaJuntos,
  leaveYaJuntosGroup,
  getStoredActiveJuntosCode,
  setStoredActiveJuntosCode,
} from '../lib/yaJuntos';

interface YaJuntosContextType {
  activeGroup: YaJuntosGroupWithDetails | null;
  activeCode: string | null;
  hasActiveGroup: boolean;
  isCreator: boolean;
  loading: boolean;
  refreshActiveGroup: () => Promise<void>;
  setActiveGroupCode: (code: string | null) => void;
  addItemToActiveGroup: (
    productId: string,
    quantity?: number,
    isPack?: boolean,
    packId?: string,
    selections?: CartPackSelection[]
  ) => Promise<{ success: boolean; error?: string }>;
  leaveActiveGroup: () => Promise<{ success: boolean; groupClosed?: boolean; error?: string }>;
}

const YaJuntosContext = createContext<YaJuntosContextType | undefined>(undefined);

export function YaJuntosProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [activeGroup, setActiveGroup] = useState<YaJuntosGroupWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  // Cargar grupo activo persistente
  const refreshActiveGroup = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchUserActiveGroup(user?.id);
      if (res.group && ['open', 'payment_pending'].includes(res.group.status)) {
        setActiveGroup(res.group);
      } else {
        setActiveGroup(null);
        // Si el grupo ya expiró o no existe, verificar si el storedCode es válido
        const storedCode = getStoredActiveJuntosCode();
        if (storedCode) {
          const check = await fetchYaJuntosGroupByCode(storedCode, user?.id);
          if (check.group && ['open', 'payment_pending'].includes(check.group.status)) {
            setActiveGroup(check.group);
          } else {
            setStoredActiveJuntosCode(null);
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refreshActiveGroup();
  }, [refreshActiveGroup]);

  // Establecer código activo de forma explícita
  const setActiveGroupCode = useCallback(
    async (code: string | null) => {
      setStoredActiveJuntosCode(code);
      if (code) {
        const fetched = await fetchYaJuntosGroupByCode(code, user?.id);
        if (fetched.group) {
          setActiveGroup(fetched.group);
        } else {
          setActiveGroup(null);
        }
      } else {
        setActiveGroup(null);
      }
    },
    [user?.id]
  );

  // Añadir producto o pack al grupo activo de forma atómica
  const addItemToActiveGroup = useCallback(
    async (
      productId: string,
      quantity = 1,
      isPack = false,
      packId?: string,
      selections?: CartPackSelection[]
    ) => {
      if (!activeGroup) {
        return { success: false, error: 'No hay ningún grupo de YA Juntos activo.' };
      }

      if (activeGroup.status !== 'open') {
        return {
          success: false,
          error: 'El carrito compartido está cerrado porque se ha iniciado el proceso de cobro.',
        };
      }

      const res = await addItemToYaJuntos({
        groupId: activeGroup.id,
        code: activeGroup.code,
        productId,
        quantity,
        isPack,
        packId,
        selections,
        user: user ? { id: user.id, name: user.email?.split('@')[0] || 'Tú' } : null,
      });

      if (res.success) {
        // Refrescar estado del grupo tras añadir
        const updated = await fetchYaJuntosGroupByCode(activeGroup.code, user?.id);
        if (updated.group) {
          setActiveGroup(updated.group);
        }
      }

      return res;
    },
    [activeGroup, user]
  );

  // Salir del grupo activo (creador o participante)
  const leaveActiveGroup = useCallback(async () => {
    if (!activeGroup) {
      return { success: true };
    }

    const currentUserId = user?.id || activeGroup.participants[0]?.user_id || 'mock-user-1';
    const res = await leaveYaJuntosGroup(activeGroup.id, activeGroup.code, currentUserId);

    if (res.success) {
      setActiveGroup(null);
      setStoredActiveJuntosCode(null);
    }

    return res;
  }, [activeGroup, user]);

  const value = useMemo<YaJuntosContextType>(() => {
    const isCreator = Boolean(
      activeGroup &&
        user &&
        (activeGroup.creator_id === user.id ||
          activeGroup.participants.find((p) => p.user_id === user.id)?.role === 'creator')
    );

    return {
      activeGroup,
      activeCode: activeGroup ? activeGroup.code : getStoredActiveJuntosCode(),
      hasActiveGroup: Boolean(activeGroup && ['open', 'payment_pending'].includes(activeGroup.status)),
      isCreator,
      loading,
      refreshActiveGroup,
      setActiveGroupCode,
      addItemToActiveGroup,
      leaveActiveGroup,
    };
  }, [
    activeGroup,
    user,
    loading,
    refreshActiveGroup,
    setActiveGroupCode,
    addItemToActiveGroup,
    leaveActiveGroup,
  ]);

  return <YaJuntosContext.Provider value={value}>{children}</YaJuntosContext.Provider>;
}

export function useYaJuntos() {
  const context = useContext(YaJuntosContext);
  if (!context) {
    throw new Error('useYaJuntos debe ser utilizado dentro de un YaJuntosProvider');
  }
  return context;
}
