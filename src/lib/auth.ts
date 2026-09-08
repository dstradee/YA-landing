import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import type { DbProfile, UserRole } from '../types/app';

export type AuthState = {
  user: { id: string; email?: string } | null;
  profile: DbProfile | null;
  role: UserRole | null;
  isAdmin: boolean;
  loading: boolean;
};

export function useAuth(): AuthState {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<DbProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase.auth) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function checkUser() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          if (isMounted) {
            setUser(null);
            setProfile(null);
            setRole(null);
            setLoading(false);
          }
          return;
        }

        const currentUser = { id: session.user.id, email: session.user.email };
        if (isMounted) setUser(currentUser);

        // Fetch profile
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        if (isMounted) {
          if (prof) {
            setProfile(prof as DbProfile);
            setRole(prof.role as UserRole);
          } else {
            // Usuario autenticado sin perfil aún
            setRole('customer');
          }
          setLoading(false);
        }
      } catch {
        if (isMounted) setLoading(false);
      }
    }

    checkUser();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setUser(null);
        setProfile(null);
        setRole(null);
        setLoading(false);
        return;
      }

      setUser({ id: session.user.id, email: session.user.email });
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      if (prof) {
        setProfile(prof as DbProfile);
        setRole(prof.role as UserRole);
      } else {
        setRole('customer');
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      listener?.subscription.unsubscribe();
    };
  }, []);

  return {
    user,
    profile,
    role,
    isAdmin: role === 'admin',
    loading,
  };
}
