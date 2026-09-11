// ==============================================================================
// YA DELIVERY - SERVICIO CLIENTE YA+ (MEMBRESÍAS Y BENEFICIOS)
// Archivo: src/lib/yaPlus.ts
// ==============================================================================

import { supabase, isSupabaseConfigured } from './supabase';
import type {
  DbYaPlusPlan,
  DbUserSubscription,
  UserActiveSubscriptionInfo,
  YaPlusBenefits,
} from '../types/app';

// Mock plans por defecto si Supabase no está conectado
export const DEFAULT_MOCK_PLANS: DbYaPlusPlan[] = [
  {
    id: 'plan-plus-mensual',
    name: 'YA+ Mensual',
    slug: 'ya-plus-mensual',
    description: 'Envíos gratis ilimitados en todos tus pedidos, promociones exclusivas y acceso prioritario.',
    price: 4.99,
    currency: 'EUR',
    periodicity: 'monthly',
    active: true,
    sort_order: 1,
    color: '#B6FF00',
    icon: 'Zap',
    badge_text: 'MÁS POPULAR',
    promotional_text: '¡Amortízalo en solo 2 pedidos al mes!',
    benefits: {
      free_shipping: true,
      free_shipping_min_order: 0,
      order_discount_percent: 5,
      early_access: true,
    },
    conditions: 'Renovación mensual automática. Cancela en cualquier momento sin penalización manteniendo tus ventajas hasta el final del periodo.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'plan-plus-anual',
    name: 'YA+ Anual',
    slug: 'ya-plus-anual',
    description: 'El pase definitivo para los que piden de verdad en Jerez. 12 meses al precio de 9.',
    price: 44.90,
    currency: 'EUR',
    periodicity: 'yearly',
    active: true,
    sort_order: 2,
    color: '#FFFFFF',
    icon: 'Sparkles',
    badge_text: 'MEJOR VALOR',
    promotional_text: 'Ahorra más de 15 € al año en envíos.',
    benefits: {
      free_shipping: true,
      free_shipping_min_order: 0,
      order_discount_percent: 10,
      early_access: true,
    },
    conditions: 'Facturación anual única de 44,90 €. Cancela cuando quieras.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const LOCAL_STORAGE_ACTIVE_SUB_KEY = 'ya_active_subscription_v1';
const LOCAL_STORAGE_CUSTOM_PLANS_KEY = 'ya_custom_plans_v1';

// Helper local storage plans
function getLocalPlans(): DbYaPlusPlan[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CUSTOM_PLANS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return DEFAULT_MOCK_PLANS;
}

function saveLocalPlans(plans: DbYaPlusPlan[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_CUSTOM_PLANS_KEY, JSON.stringify(plans));
  } catch {
    // ignore
  }
}

// ==============================================================================
// 1. OBTENCIÓN DE PLANES ACTIVOS (CLIENTE)
// ==============================================================================

export async function fetchYaPlusPlans(): Promise<DbYaPlusPlan[]> {
  if (!isSupabaseConfigured) {
    return getLocalPlans().filter((p) => p.active);
  }

  try {
    const { data, error } = await supabase
      .from('ya_plus_plans')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true });

    if (error || !data || data.length === 0) {
      return getLocalPlans().filter((p) => p.active);
    }

    return data as DbYaPlusPlan[];
  } catch {
    return getLocalPlans().filter((p) => p.active);
  }
}

// ==============================================================================
// 2. CONSULTAR SUSCRIPCIÓN ACTIVA DE USUARIO
// ==============================================================================

export async function fetchUserActiveSubscription(userId?: string): Promise<UserActiveSubscriptionInfo> {
  const fallbackInactive: UserActiveSubscriptionInfo = { has_active_subscription: false };

  if (!userId) {
    return fallbackInactive;
  }

  // Comprobar local storage primero si no hay supabase
  if (!isSupabaseConfigured) {
    try {
      const raw = localStorage.getItem(`${LOCAL_STORAGE_ACTIVE_SUB_KEY}_${userId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as UserActiveSubscriptionInfo;
        if (parsed.current_period_end && new Date(parsed.current_period_end) > new Date()) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return fallbackInactive;
  }

  try {
    // 1. Intentar RPC get_user_active_subscription
    const { data, error } = await supabase.rpc('get_user_active_subscription', {
      p_user_id: userId,
    });

    if (!error && data && typeof data === 'object' && 'has_active_subscription' in data) {
      return data as UserActiveSubscriptionInfo;
    }

    // 2. Fallback consulta directa a user_subscriptions
    const { data: subData, error: subError } = await supabase
      .from('user_subscriptions')
      .select('*, ya_plus_plans(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gt('current_period_end', new Date().toISOString())
      .order('current_period_end', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError || !subData) {
      return fallbackInactive;
    }

    const plan = subData.ya_plus_plans || subData.plan_snapshot;

    return {
      has_active_subscription: true,
      subscription_id: subData.id,
      plan_id: subData.plan_id,
      plan_name: plan?.name || 'YA+',
      plan_slug: plan?.slug || 'ya-plus',
      plan_color: plan?.color || '#B6FF00',
      benefits: plan?.benefits as YaPlusBenefits,
      started_at: subData.started_at,
      current_period_end: subData.current_period_end,
      cancel_at_period_end: subData.cancel_at_period_end,
      price: Number(subData.price),
      currency: subData.currency || 'EUR',
    };
  } catch (err) {
    console.warn('Error al consultar suscripción activa:', err);
    return fallbackInactive;
  }
}

// ==============================================================================
// 3. CREAR INTENCIÓN DE SUSCRIPCIÓN
// ==============================================================================

export async function createSubscriptionIntent(planId: string): Promise<{
  success: boolean;
  subscriptionId?: string;
  planName?: string;
  price?: number;
  currency?: string;
  error?: string;
}> {
  if (!isSupabaseConfigured) {
    // Mock local
    const plans = getLocalPlans();
    const plan = plans.find((p) => p.id === planId || p.slug === planId) || plans[0];
    const mockSubId = `mock-sub-${Date.now()}`;

    return {
      success: true,
      subscriptionId: mockSubId,
      planName: plan.name,
      price: plan.price,
      currency: plan.currency,
    };
  }

  try {
    const { data, error } = await supabase.rpc('create_subscription_intent', {
      p_plan_id: planId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'No se pudo iniciar la suscripción.' };
    }

    return {
      success: true,
      subscriptionId: data.subscription_id,
      planName: data.plan_name,
      price: Number(data.price),
      currency: data.currency,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al conectar con el servidor.';
    return { success: false, error: msg };
  }
}

// ==============================================================================
// 4. CANCELAR SUSCRIPCIÓN (A FIN DE PERIODO)
// ==============================================================================

export async function cancelUserSubscription(subscriptionId: string, userId?: string): Promise<{
  success: boolean;
  currentPeriodEnd?: string;
  error?: string;
}> {
  if (!isSupabaseConfigured) {
    if (userId) {
      try {
        const raw = localStorage.getItem(`${LOCAL_STORAGE_ACTIVE_SUB_KEY}_${userId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          parsed.cancel_at_period_end = true;
          localStorage.setItem(`${LOCAL_STORAGE_ACTIVE_SUB_KEY}_${userId}`, JSON.stringify(parsed));
          return { success: true, currentPeriodEnd: parsed.current_period_end };
        }
      } catch {
        // ignore
      }
    }
    return { success: true };
  }

  try {
    const { data, error } = await supabase.rpc('cancel_user_subscription', {
      p_subscription_id: subscriptionId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      currentPeriodEnd: data?.current_period_end,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al cancelar la suscripción.';
    return { success: false, error: msg };
  }
}

// ==============================================================================
// 5. MOCK SIMULACIÓN DE PAGO LOCAL PARA YA+
// ==============================================================================

export function simulateLocalSubscriptionActivation(
  userId: string,
  plan: DbYaPlusPlan
): UserActiveSubscriptionInfo {
  const now = new Date();
  const periodEnd = new Date();
  if (plan.periodicity === 'yearly') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  const subInfo: UserActiveSubscriptionInfo = {
    has_active_subscription: true,
    subscription_id: `sub-${Date.now()}`,
    plan_id: plan.id,
    plan_name: plan.name,
    plan_slug: plan.slug,
    plan_color: plan.color,
    benefits: plan.benefits,
    started_at: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    cancel_at_period_end: false,
    price: plan.price,
    currency: plan.currency,
  };

  try {
    localStorage.setItem(`${LOCAL_STORAGE_ACTIVE_SUB_KEY}_${userId}`, JSON.stringify(subInfo));
  } catch {
    // ignore
  }

  return subInfo;
}

// ==============================================================================
// 6. FUNCIONES ADMINISTRATIVAS DE PLANES Y SUSCRIPTORES
// ==============================================================================

export async function adminFetchAllPlans(): Promise<{ plans: DbYaPlusPlan[]; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { plans: getLocalPlans(), error: null };
  }

  try {
    const { data, error } = await supabase
      .from('ya_plus_plans')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      return { plans: getLocalPlans(), error: error.message };
    }

    return { plans: data as DbYaPlusPlan[], error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al cargar planes.';
    return { plans: getLocalPlans(), error: msg };
  }
}

export async function adminSavePlan(
  plan: Partial<DbYaPlusPlan> & { name: string; slug: string; price: number }
): Promise<{ success: boolean; plan?: DbYaPlusPlan; error?: string }> {
  if (!isSupabaseConfigured) {
    const plans = getLocalPlans();
    if (plan.id) {
      const idx = plans.findIndex((p) => p.id === plan.id);
      if (idx !== -1) {
        plans[idx] = { ...plans[idx], ...plan, updated_at: new Date().toISOString() } as DbYaPlusPlan;
      }
    } else {
      const newPlan: DbYaPlusPlan = {
        id: `plan-${Date.now()}`,
        name: plan.name,
        slug: plan.slug,
        description: plan.description || '',
        price: Number(plan.price),
        currency: 'EUR',
        periodicity: plan.periodicity || 'monthly',
        active: plan.active !== undefined ? plan.active : true,
        sort_order: plan.sort_order || plans.length + 1,
        color: plan.color || '#B6FF00',
        icon: plan.icon || 'Sparkles',
        badge_text: plan.badge_text || null,
        promotional_text: plan.promotional_text || null,
        benefits: plan.benefits || { free_shipping: true },
        conditions: plan.conditions || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      plans.push(newPlan);
    }
    saveLocalPlans(plans);
    return { success: true };
  }

  try {
    if (plan.id) {
      const { data, error } = await supabase
        .from('ya_plus_plans')
        .update({
          name: plan.name,
          slug: plan.slug,
          description: plan.description,
          price: plan.price,
          periodicity: plan.periodicity,
          active: plan.active,
          sort_order: plan.sort_order,
          color: plan.color,
          icon: plan.icon,
          badge_text: plan.badge_text,
          promotional_text: plan.promotional_text,
          benefits: plan.benefits,
          conditions: plan.conditions,
          updated_at: new Date().toISOString(),
        })
        .eq('id', plan.id)
        .select('*')
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, plan: data as DbYaPlusPlan };
    } else {
      const { data, error } = await supabase
        .from('ya_plus_plans')
        .insert({
          name: plan.name,
          slug: plan.slug,
          description: plan.description || '',
          price: plan.price,
          currency: 'EUR',
          periodicity: plan.periodicity || 'monthly',
          active: plan.active !== undefined ? plan.active : true,
          sort_order: plan.sort_order || 1,
          color: plan.color || '#B6FF00',
          icon: plan.icon || 'Sparkles',
          badge_text: plan.badge_text,
          promotional_text: plan.promotional_text,
          benefits: plan.benefits || { free_shipping: true },
          conditions: plan.conditions,
        })
        .select('*')
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, plan: data as DbYaPlusPlan };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al guardar el plan.';
    return { success: false, error: msg };
  }
}

export async function adminDeletePlan(planId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    const plans = getLocalPlans().filter((p) => p.id !== planId);
    saveLocalPlans(plans);
    return { success: true };
  }

  try {
    const { error } = await supabase.from('ya_plus_plans').delete().eq('id', planId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al eliminar el plan.';
    return { success: false, error: msg };
  }
}

export async function adminFetchSubscriptions(): Promise<{
  subscriptions: DbUserSubscription[];
  activeCount: number;
  monthlyRevenue: number;
  error?: string;
}> {
  if (!isSupabaseConfigured) {
    return {
      subscriptions: [],
      activeCount: 1,
      monthlyRevenue: 4.99,
    };
  }

  try {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('*, profiles(full_name), ya_plus_plans(name, slug, periodicity)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return { subscriptions: [], activeCount: 0, monthlyRevenue: 0, error: error.message };
    }

    const subs = (data || []).map((s: any) => ({
      ...s,
      user_name: s.profiles?.full_name || 'Usuario',
      plan: s.ya_plus_plans,
    })) as DbUserSubscription[];

    const activeCount = subs.filter((s) => s.status === 'active').length;
    const monthlyRevenue = subs
      .filter((s) => s.status === 'active')
      .reduce((sum, s) => {
        const val = Number(s.price);
        return sum + (s.plan?.periodicity === 'yearly' ? val / 12 : val);
      }, 0);

    return {
      subscriptions: subs,
      activeCount,
      monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al cargar suscriptores.';
    return { subscriptions: [], activeCount: 0, monthlyRevenue: 0, error: msg };
  }
}
