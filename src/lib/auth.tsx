import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import type { DbProfile, UserRole } from '../types/app';

export interface AuthContextType {
  user: User | null;
  profile: DbProfile | null;
  role: UserRole | null;
  isAdmin: boolean;
  isCourier: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    phone?: string
  ) => Promise<{ success: boolean; error?: string; requiresEmailConfirmation?: boolean }>;
  signOut: () => Promise<{ success: boolean; error?: string }>;
  updateProfile: (data: {
    full_name?: string;
    phone?: string | null;
  }) => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<DbProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Carga reactiva del perfil del usuario autenticado
  const fetchProfile = useCallback(async (userId: string): Promise<DbProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.warn('Error al obtener perfil de usuario:', error.message);
        return null;
      }

      if (data) {
        return data as DbProfile;
      }

      // Si el usuario se acaba de registrar, el trigger on_auth_user_created puede tardar unos ms
      await new Promise((resolve) => setTimeout(resolve, 400));
      const { data: retryData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      return (retryData as DbProfile) || null;
    } catch (err) {
      console.warn('Fallo al conectar con profiles:', err);
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setRole(null);
      return;
    }
    const prof = await fetchProfile(user.id);
    if (prof) {
      setProfile(prof);
      setRole(prof.role as UserRole);
    }
  }, [user, fetchProfile]);

  // Inicialización de la sesión y escucha de cambios de autenticación
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      if (!isSupabaseConfigured) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (session?.user) {
          setUser(session.user);
          const prof = await fetchProfile(session.user.id);
          if (isMounted) {
            if (prof) {
              setProfile(prof);
              setRole(prof.role as UserRole);
            } else {
              setProfile(null);
              setRole('customer');
            }
          }
        } else {
          setUser(null);
          setProfile(null);
          setRole(null);
        }
      } catch (err) {
        console.error('Error inicializando sesión:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initSession();

    // Escucha permanente de Supabase Auth
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event: string, session: Session | null) => {
        if (!isMounted) return;

        if (session?.user) {
          setUser(session.user);
          const prof = await fetchProfile(session.user.id);
          if (isMounted) {
            if (prof) {
              setProfile(prof);
              setRole(prof.role as UserRole);
            } else {
              setProfile(null);
              setRole('customer');
            }
            setLoading(false);
          }
        } else {
          setUser(null);
          setProfile(null);
          setRole(null);
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // Login con contraseña
  const signIn = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase no está configurado.' };
      }

      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !password) {
        return { success: false, error: 'Por favor, introduce tu email y contraseña.' };
      }

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) {
          let friendlyMessage = error.message;
          const lower = error.message.toLowerCase();
          if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
            friendlyMessage = 'El correo electrónico o la contraseña son incorrectos.';
          } else if (lower.includes('email not confirmed')) {
            friendlyMessage = 'Debes confirmar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada.';
          } else if (lower.includes('too many requests')) {
            friendlyMessage = 'Demasiados intentos fallidos. Por favor, espera unos minutos e inténtalo de nuevo.';
          }
          return { success: false, error: friendlyMessage };
        }

        if (data.user) {
          setUser(data.user);
          const prof = await fetchProfile(data.user.id);
          if (prof) {
            setProfile(prof);
            setRole(prof.role as UserRole);
          } else {
            setRole('customer');
          }
        }

        return { success: true };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error inesperado al iniciar sesión.';
        return { success: false, error: message };
      }
    },
    [fetchProfile]
  );

  // Registro real
  // IMPORTANTE: El frontend NUNCA envía ni permite elegir 'role'.
  // El trigger on_auth_user_created en PostgreSQL asigna siempre role = 'customer'.
  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      phone?: string
    ): Promise<{ success: boolean; error?: string; requiresEmailConfirmation?: boolean }> => {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Supabase no está configurado.' };
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanName = fullName.trim();
      const cleanPhone = phone && phone.trim() ? phone.trim() : null;

      if (!cleanEmail || !cleanName || !password) {
        return { success: false, error: 'Por favor, completa todos los campos obligatorios.' };
      }

      if (password.length < 6) {
        return { success: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
      }

      try {
        // Redirección segura para que Supabase Auth nunca apunte a localhost en emails de confirmación
        const redirectUrl =
          typeof window !== 'undefined' && window.location.origin
            ? `${window.location.origin}/app`
            : 'https://landing-nine.vercel.app/app';

        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: cleanName,
              phone: cleanPhone,
              phone_number: cleanPhone,
            },
            emailRedirectTo: redirectUrl,
          },
        });

        if (error) {
          let friendlyMessage = error.message;
          const lower = error.message.toLowerCase();
          if (lower.includes('already registered') || lower.includes('user already exists')) {
            friendlyMessage = 'Ya existe una cuenta con este correo electrónico. Por favor, inicia sesión.';
          } else if (lower.includes('password') && lower.includes('at least')) {
            friendlyMessage = 'La contraseña debe tener al menos 6 caracteres.';
          } else if (lower.includes('invalid email') || lower.includes('email format')) {
            friendlyMessage = 'El correo electrónico no tiene un formato válido.';
          } else if (lower.includes('weak_password')) {
            friendlyMessage = 'La contraseña es demasiado débil. Intenta combinar letras y números.';
          }
          return { success: false, error: friendlyMessage };
        }

        const requiresEmailConfirmation = !data.session;
        if (data.user && data.session) {
          setUser(data.user);
          const prof = await fetchProfile(data.user.id);
          if (prof) {
            setProfile(prof);
            setRole(prof.role as UserRole);
          } else {
            setRole('customer');
          }
        }

        return { success: true, requiresEmailConfirmation };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error inesperado al registrar la cuenta.';
        return { success: false, error: message };
      }
    },
    [fetchProfile]
  );

  // Logout real
  const signOut = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
      setUser(null);
      setProfile(null);
      setRole(null);
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cerrar sesión.';
      return { success: false, error: message };
    }
  }, []);

  // Actualización de perfil
  // SEGURIDAD ESTRICTA:
  // Solo se permite actualizar 'full_name' y 'phone'.
  // NUNCA se permite actualizar 'id' ni 'role'.
  const updateProfile = useCallback(
    async (data: {
      full_name?: string;
      phone?: string | null;
    }): Promise<{ success: boolean; error?: string }> => {
      if (!user) {
        return { success: false, error: 'No hay ninguna sesión activa.' };
      }

      const updates: { full_name?: string; phone?: string | null; updated_at: string } = {
        updated_at: new Date().toISOString(),
      };

      if (typeof data.full_name === 'string') {
        const trimmed = data.full_name.trim();
        if (!trimmed) {
          return { success: false, error: 'El nombre completo no puede estar vacío.' };
        }
        updates.full_name = trimmed;
      }

      if (data.phone !== undefined) {
        updates.phone = data.phone ? data.phone.trim() : null;
      }

      try {
        const { data: updated, error } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', user.id)
          .select('*')
          .single();

        if (error) {
          return { success: false, error: error.message };
        }

        if (updated) {
          setProfile(updated as DbProfile);
        }

        return { success: true };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error al actualizar datos del perfil.';
        return { success: false, error: message };
      }
    },
    [user]
  );

  const value: AuthContextType = {
    user,
    profile,
    role,
    isAdmin: role === 'admin',
    isCourier: role === 'courier' || role === 'admin',
    loading,
    signIn,
    signUp,
    signOut,
    updateProfile,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe utilizarse dentro de un <AuthProvider>');
  }
  return context;
}

