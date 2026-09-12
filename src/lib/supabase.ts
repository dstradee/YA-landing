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

  function createChain(isSingle = false): any {
    const builder: any = {
      then(onfulfilled: (value: any) => any, onrejected?: (reason: any) => any) {
        const result = {
          data: isSingle ? null : [],
          error: null,
          count: 0,
          status: 200,
          statusText: 'OK',
        };
        return Promise.resolve(result).then(onfulfilled, onrejected);
      },
      catch(onrejected: (reason: any) => any) {
        return Promise.resolve({ data: isSingle ? null : [], error: null }).catch(onrejected);
      },
      finally(onfinally: () => void) {
        return Promise.resolve().finally(onfinally);
      },
      select: () => builder,
      insert: async (rows: Array<{ email?: string; [key: string]: unknown }> | { email?: string; [key: string]: unknown }) => {
        const list = Array.isArray(rows) ? rows : [rows];
        for (const row of list) {
          if (row?.email) {
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
        return builder;
      },
      update: () => builder,
      upsert: () => builder,
      delete: () => builder,
      eq: () => builder,
      neq: () => builder,
      gt: () => builder,
      gte: () => builder,
      lt: () => builder,
      lte: () => builder,
      like: () => builder,
      ilike: () => builder,
      is: () => builder,
      in: () => builder,
      contains: () => builder,
      containedBy: () => builder,
      range: () => builder,
      order: () => builder,
      limit: () => builder,
      filter: () => builder,
      match: () => builder,
      single: () => createChain(true),
      maybeSingle: () => createChain(true),
    };

    return new Proxy(builder, {
      get(target, prop) {
        if (prop in target) {
          return target[prop];
        }
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return target[prop];
        }
        return (..._args: any[]) => builder;
      },
    });
  }

  const channelObj: any = {
    on: () => channelObj,
    subscribe: (callback?: (status: string) => void) => {
      if (typeof callback === 'function') callback('SUBSCRIBED');
      return channelObj;
    },
    unsubscribe: () => Promise.resolve('ok'),
  };

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
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    },
    from: (_table: string) => createChain(false),
    channel: () => channelObj,
    removeChannel: () => Promise.resolve('ok'),
    removeAllChannels: () => Promise.resolve([]),
    rpc: () => Promise.resolve({ data: null, error: null }),
  } as unknown as SupabaseClient;
}

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createMockSupabaseClient();

