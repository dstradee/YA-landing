import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  typeof supabaseUrl === 'string' &&
  supabaseUrl.startsWith('http')
);

function createMockSupabaseClient(): SupabaseClient {
  const localStore = new Set<string>();
  try {
    const saved = localStorage.getItem('ya_mock_waitlist');
    if (saved) {
      JSON.parse(saved).forEach((email: string) => localStore.add(email.toLowerCase()));
    }
  } catch {
    // Ignore localStorage errors
  }

  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: () =>
        Promise.resolve({
          data: { user: null, session: null },
          error: { message: 'Supabase no está configurado', name: 'AuthError', status: 500 },
        }),
      signUp: () =>
        Promise.resolve({
          data: { user: null, session: null },
          error: { message: 'Supabase no está configurado', name: 'AuthError', status: 500 },
        }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from: (table: string) => ({
      insert: async (rows: Array<{ email?: string; [key: string]: unknown }>) => {
        if (table === 'waitlist') {
          for (const row of rows) {
            if (row.email) {
              const normalized = row.email.trim().toLowerCase();
              if (localStore.has(normalized)) {
                return { data: null, error: { code: '23505', message: 'Unique violation' } };
              }
              localStore.add(normalized);
            }
          }
          try {
            localStorage.setItem('ya_mock_waitlist', JSON.stringify(Array.from(localStore)));
          } catch {
            // Ignore
          }
        }
        return { data: rows, error: null };
      },
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  } as unknown as SupabaseClient;
}

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createMockSupabaseClient();

