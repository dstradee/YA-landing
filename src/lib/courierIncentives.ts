import { supabase, isSupabaseConfigured } from './supabase';
import type {
  CourierIncentivesOverview,
  CourierIncentiveWithProgress,
  CourierRewardHistoryItem,
  DbCourierIncentive,
} from '../types/app';

/**
 * FASE 4E: Obtiene el panorama completo de incentivos para el repartidor autenticado.
 * - Incentivos activos y futuros con cálculo server-side de entregas válidas
 * - Recompensas conseguidas con importes de bonus congelados
 * - Métricas de bonificación acumuladas
 */
export async function courierFetchIncentivesOverview(): Promise<{
  data: CourierIncentivesOverview | null;
  error: string | null;
}> {
  const fallbackData: CourierIncentivesOverview = {
    incentives: [],
    rewards: [],
    summary: {
      total_count: 0,
      total_earned: 0,
      today_earned: 0,
      week_earned: 0,
      month_earned: 0,
    },
  };

  if (!isSupabaseConfigured) {
    return { data: fallbackData, error: 'Supabase no está configurado.' };
  }

  try {
    // 1. Intentar llamar a la RPC dedicada courier_get_incentives_overview
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'courier_get_incentives_overview'
    );

    if (!rpcError && rpcData && typeof rpcData === 'object') {
      const incentives: CourierIncentiveWithProgress[] = (rpcData.incentives || []).map((inc: any) => ({
        id: inc.id,
        name: inc.name,
        description: inc.description || null,
        incentive_type: inc.incentive_type || 'delivery_count',
        target_deliveries: Number(inc.target_deliveries || 1),
        bonus_amount: Number(inc.bonus_amount || 0),
        active: Boolean(inc.active),
        start_at: inc.start_at || null,
        end_at: inc.end_at || null,
        is_expired: Boolean(inc.is_expired),
        is_future: Boolean(inc.is_future),
        current_deliveries: Number(inc.current_deliveries || 0),
        remaining_deliveries: Number(inc.remaining_deliveries || 0),
        progress_percent: Number(inc.progress_percent || 0),
        is_achieved: Boolean(inc.is_achieved),
        achieved_reward: inc.achieved_reward
          ? {
              id: inc.achieved_reward.id,
              bonus_amount: Number(inc.achieved_reward.bonus_amount || 0),
              achieved_at: inc.achieved_reward.achieved_at,
              status: inc.achieved_reward.status || 'earned',
              deliveries_count: Number(inc.achieved_reward.deliveries_count || 0),
            }
          : null,
        status_badge: inc.status_badge || (inc.is_achieved ? 'achieved' : 'in_progress'),
      }));

      const rewards: CourierRewardHistoryItem[] = (rpcData.rewards || []).map((r: any) => ({
        id: r.id,
        incentive_id: r.incentive_id,
        incentive_name: r.incentive_name || 'Incentivo de Reparto',
        target_deliveries: Number(r.target_deliveries || 0),
        deliveries_count: Number(r.deliveries_count || 0),
        bonus_amount: Number(r.bonus_amount || 0),
        status: r.status || 'earned',
        achieved_at: r.achieved_at,
        created_at: r.created_at || r.achieved_at,
        trigger_order_id: r.trigger_order_id || null,
      }));

      const summary = rpcData.summary || {};

      return {
        data: {
          incentives,
          rewards,
          summary: {
            total_count: Number(summary.total_count || rewards.length),
            total_earned: Number(summary.total_earned || 0),
            today_earned: Number(summary.today_earned || 0),
            week_earned: Number(summary.week_earned || 0),
            month_earned: Number(summary.month_earned || 0),
          },
        },
        error: null,
      };
    }

    // 2. Fallback resiliente usando consultas directas con RLS sobre tablas
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { data: fallbackData, error: 'No hay sesión de usuario activa.' };
    }

    const { data: courierRec } = await supabase
      .from('couriers')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!courierRec) {
      return { data: fallbackData, error: 'No se encontró tu perfil de repartidor.' };
    }

    const courierId = courierRec.id;

    // Obtener incentivos activos
    const { data: rawIncentives, error: incError } = await supabase
      .from('courier_incentives')
      .select('*')
      .order('target_deliveries', { ascending: true });

    if (incError) {
      // Si la tabla aún no existe porque la migración no se ha ejecutado
      if (incError.code === '42P01') {
        return {
          data: fallbackData,
          error: 'Las tablas de la Fase 4E aún no han sido migradas en la base de datos de Supabase.',
        };
      }
      return { data: fallbackData, error: incError.message };
    }

    // Obtener recompensas históricas del repartidor
    const { data: rawRewards } = await supabase
      .from('courier_incentive_rewards')
      .select('*, courier_incentives(name, target_deliveries)')
      .eq('courier_id', courierId)
      .order('achieved_at', { ascending: false });

    const rewardsMap = new Map<string, any>();
    const parsedRewards: CourierRewardHistoryItem[] = [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = (now.getDay() + 6) % 7;
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalEarned = 0;
    let todayEarned = 0;
    let weekEarned = 0;
    let monthEarned = 0;

    if (rawRewards) {
      for (const r of rawRewards) {
        rewardsMap.set(r.incentive_id, r);
        const bonus = Number(r.bonus_amount || 0);
        const achievedDate = new Date(r.achieved_at);

        if (r.status !== 'cancelled') {
          totalEarned += bonus;
          if (achievedDate >= todayStart) todayEarned += bonus;
          if (achievedDate >= weekStart) weekEarned += bonus;
          if (achievedDate >= monthStart) monthEarned += bonus;
        }

        parsedRewards.push({
          id: r.id,
          incentive_id: r.incentive_id,
          incentive_name: r.courier_incentives?.name || 'Incentivo de Reparto',
          target_deliveries: Number(r.courier_incentives?.target_deliveries || r.deliveries_count),
          deliveries_count: Number(r.deliveries_count || 0),
          bonus_amount: bonus,
          status: r.status || 'earned',
          achieved_at: r.achieved_at,
          created_at: r.created_at,
          trigger_order_id: r.trigger_order_id || null,
        });
      }
    }

    // Obtener todos los pedidos entregados del repartidor
    const { data: deliveredOrders } = await supabase
      .from('orders')
      .select('id, status, delivered_at, updated_at')
      .eq('courier_id', courierId)
      .eq('status', 'delivered');

    const orders = deliveredOrders || [];

    const parsedIncentives: CourierIncentiveWithProgress[] = (rawIncentives || []).map((inc: DbCourierIncentive) => {
      const reward = rewardsMap.get(inc.id);
      const isAchieved = Boolean(reward);

      let deliveriesCount = 0;
      const startAt = inc.start_at ? new Date(inc.start_at) : null;
      const endAt = inc.end_at ? new Date(inc.end_at) : null;

      for (const o of orders) {
        const orderDate = new Date(o.delivered_at || o.updated_at);
        if (startAt && orderDate < startAt) continue;
        if (endAt && orderDate > endAt) continue;
        deliveriesCount++;
      }

      const isExpired = Boolean(endAt && now > endAt);
      const isFuture = Boolean(startAt && now < startAt);
      const target = Number(inc.target_deliveries || 1);
      const progressPercent = Math.min(100, Math.round((deliveriesCount / target) * 100));
      const remaining = Math.max(0, target - deliveriesCount);

      let statusBadge: 'achieved' | 'in_progress' | 'expired' | 'upcoming' = 'in_progress';
      if (isAchieved) statusBadge = 'achieved';
      else if (isExpired) statusBadge = 'expired';
      else if (isFuture) statusBadge = 'upcoming';

      return {
        id: inc.id,
        name: inc.name,
        description: inc.description || null,
        incentive_type: inc.incentive_type || 'delivery_count',
        target_deliveries: target,
        bonus_amount: Number(inc.bonus_amount || 0),
        active: Boolean(inc.active),
        start_at: inc.start_at || null,
        end_at: inc.end_at || null,
        is_expired: isExpired,
        is_future: isFuture,
        current_deliveries: deliveriesCount,
        remaining_deliveries: remaining,
        progress_percent: progressPercent,
        is_achieved: isAchieved,
        achieved_reward: reward
          ? {
              id: reward.id,
              bonus_amount: Number(reward.bonus_amount || 0),
              achieved_at: reward.achieved_at,
              status: reward.status || 'earned',
              deliveries_count: Number(reward.deliveries_count || 0),
            }
          : null,
        status_badge: statusBadge,
      };
    });

    return {
      data: {
        incentives: parsedIncentives,
        rewards: parsedRewards,
        summary: {
          total_count: parsedRewards.length,
          total_earned: Math.round(totalEarned * 100) / 100,
          today_earned: Math.round(todayEarned * 100) / 100,
          week_earned: Math.round(weekEarned * 100) / 100,
          month_earned: Math.round(monthEarned * 100) / 100,
        },
      },
      error: null,
    };
  } catch (err: unknown) {
    return {
      data: fallbackData,
      error: err instanceof Error ? err.message : 'Error inesperado al cargar incentivos del repartidor.',
    };
  }
}
