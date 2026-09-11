import { supabase, isSupabaseConfigured } from './supabase';
import type {
  AdminIncentivesOverview,
  AdminIncentiveListItem,
  AdminCourierIncentiveProgress,
  CourierRewardHistoryItem,
} from '../types/app';

export interface AdminIncentiveInput {
  name: string;
  description?: string | null;
  target_deliveries: number;
  bonus_amount: number;
  start_at?: string | null;
  end_at?: string | null;
  active?: boolean;
}

/**
 * FASE 4E: Consulta el resumen administrativo completo de incentivos:
 * - Lista de incentivos con totales de recompensas y bonus pagados
 * - Matriz de progreso de todos los repartidores
 * - Historial global de recompensas concedidas
 */
export async function adminFetchIncentivesOverview(
  incentiveId?: string
): Promise<{ data: AdminIncentivesOverview | null; error: string | null }> {
  const fallbackData: AdminIncentivesOverview = {
    incentives: [],
    couriers_progress: [],
    rewards: [],
    summary: {
      total_incentives: 0,
      active_incentives: 0,
      total_rewards: 0,
      total_bonus_amount: 0,
    },
  };

  if (!isSupabaseConfigured) {
    return { data: fallbackData, error: 'Supabase no está configurado.' };
  }

  try {
    // 1. Intentar llamar a la RPC dedicada admin_get_incentives_overview
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'admin_get_incentives_overview',
      { p_incentive_id: incentiveId || null }
    );

    if (!rpcError && rpcData && typeof rpcData === 'object') {
      const incentives: AdminIncentiveListItem[] = (rpcData.incentives || []).map((inc: any) => ({
        id: inc.id,
        name: inc.name,
        description: inc.description || null,
        active: Boolean(inc.active),
        incentive_type: inc.incentive_type || 'delivery_count',
        target_deliveries: Number(inc.target_deliveries || 1),
        bonus_amount: Number(inc.bonus_amount || 0),
        start_at: inc.start_at || null,
        end_at: inc.end_at || null,
        created_at: inc.created_at,
        updated_at: inc.updated_at,
        total_rewards: Number(inc.total_rewards || 0),
        total_bonus_paid: Number(inc.total_bonus_paid || 0),
      }));

      const couriers_progress: AdminCourierIncentiveProgress[] = (rpcData.couriers_progress || []).map(
        (cp: any) => ({
          courier_id: cp.courier_id,
          profile_id: cp.profile_id,
          full_name: cp.full_name || 'Repartidor sin nombre',
          email: cp.email || null,
          phone: cp.phone || null,
          active: Boolean(cp.active),
          available: Boolean(cp.available),
          incentive_id: cp.incentive_id,
          incentive_name: cp.incentive_name,
          target_deliveries: Number(cp.target_deliveries || 1),
          bonus_amount: Number(cp.bonus_amount || 0),
          deliveries_count: Number(cp.deliveries_count || 0),
          progress_percent: Number(cp.progress_percent || 0),
          is_achieved: Boolean(cp.is_achieved),
          reward: cp.reward
            ? {
                id: cp.reward.id,
                bonus_amount: Number(cp.reward.bonus_amount || 0),
                achieved_at: cp.reward.achieved_at,
                status: cp.reward.status || 'earned',
              }
            : null,
        })
      );

      const rewards: CourierRewardHistoryItem[] = (rpcData.rewards || []).map((r: any) => ({
        id: r.id,
        incentive_id: r.incentive_id,
        incentive_name: r.incentive_name || 'Incentivo',
        target_deliveries: Number(r.target_deliveries || 0),
        deliveries_count: Number(r.deliveries_count || 0),
        bonus_amount: Number(r.bonus_amount || 0),
        status: r.status || 'earned',
        achieved_at: r.achieved_at,
        created_at: r.created_at || r.achieved_at,
        courier_id: r.courier_id,
        courier_name: r.courier_name || 'Repartidor',
        courier_email: r.courier_email || null,
      }));

      const summary = rpcData.summary || {};

      return {
        data: {
          incentives,
          couriers_progress,
          rewards,
          summary: {
            total_incentives: Number(summary.total_incentives || incentives.length),
            active_incentives: Number(
              summary.active_incentives || incentives.filter((i) => i.active).length
            ),
            total_rewards: Number(summary.total_rewards || rewards.length),
            total_bonus_amount: Number(summary.total_bonus_amount || 0),
          },
        },
        error: null,
      };
    }

    // 2. Fallback resiliente en cliente con RLS
    const { data: rawIncentives, error: incError } = await supabase
      .from('courier_incentives')
      .select('*')
      .order('created_at', { ascending: false });

    if (incError) {
      if (incError.code === '42P01') {
        return {
          data: fallbackData,
          error: 'Las tablas de la Fase 4E no existen todavía en Supabase. Aplica la migración 20260911000006.',
        };
      }
      return { data: fallbackData, error: incError.message };
    }

    const { data: rawRewards } = await supabase
      .from('courier_incentive_rewards')
      .select('*, courier_incentives(name, target_deliveries), couriers(id, profile_id)')
      .order('achieved_at', { ascending: false });

    // Perfiles para nombres de repartidores
    const { data: rawProfiles } = await supabase.from('profiles').select('id, full_name, email');
    const profileMap = new Map<string, { full_name: string; email: string }>();
    if (rawProfiles) {
      for (const p of rawProfiles) {
        profileMap.set(p.id, { full_name: p.full_name || 'Repartidor', email: p.email || '' });
      }
    }

    const rewardsList: CourierRewardHistoryItem[] = [];
    let totalBonusSum = 0;

    if (rawRewards) {
      for (const r of rawRewards) {
        const prof = r.couriers?.profile_id ? profileMap.get(r.couriers.profile_id) : null;
        const bAmount = Number(r.bonus_amount || 0);
        if (r.status !== 'cancelled') totalBonusSum += bAmount;

        rewardsList.push({
          id: r.id,
          incentive_id: r.incentive_id,
          incentive_name: r.courier_incentives?.name || 'Incentivo',
          target_deliveries: Number(r.courier_incentives?.target_deliveries || r.deliveries_count),
          deliveries_count: Number(r.deliveries_count || 0),
          bonus_amount: bAmount,
          status: r.status || 'earned',
          achieved_at: r.achieved_at,
          created_at: r.created_at,
          courier_id: r.courier_id,
          courier_name: prof?.full_name || 'Repartidor',
          courier_email: prof?.email || null,
        });
      }
    }

    const incentivesList: AdminIncentiveListItem[] = (rawIncentives || []).map((inc: any) => {
      const incRewards = rewardsList.filter((r) => r.incentive_id === inc.id && r.status !== 'cancelled');
      const paidSum = incRewards.reduce((acc, curr) => acc + curr.bonus_amount, 0);

      return {
        id: inc.id,
        name: inc.name,
        description: inc.description || null,
        active: Boolean(inc.active),
        incentive_type: inc.incentive_type || 'delivery_count',
        target_deliveries: Number(inc.target_deliveries || 1),
        bonus_amount: Number(inc.bonus_amount || 0),
        start_at: inc.start_at || null,
        end_at: inc.end_at || null,
        created_at: inc.created_at,
        updated_at: inc.updated_at,
        total_rewards: incRewards.length,
        total_bonus_paid: Math.round(paidSum * 100) / 100,
      };
    });

    return {
      data: {
        incentives: incentivesList,
        couriers_progress: [],
        rewards: rewardsList,
        summary: {
          total_incentives: incentivesList.length,
          active_incentives: incentivesList.filter((i) => i.active).length,
          total_rewards: rewardsList.length,
          total_bonus_amount: Math.round(totalBonusSum * 100) / 100,
        },
      },
      error: null,
    };
  } catch (err: unknown) {
    return {
      data: fallbackData,
      error: err instanceof Error ? err.message : 'Error inesperado al consultar incentivos.',
    };
  }
}

/**
 * Crea un nuevo incentivo con validaciones server-side de objetivo y bonus
 */
export async function adminCreateIncentive(
  input: AdminIncentiveInput
): Promise<{ success: boolean; data?: any; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  // Validaciones del frontend previas al backend
  if (!input.name || !input.name.trim()) {
    return { success: false, error: 'El nombre del incentivo es obligatorio.' };
  }
  if (!input.target_deliveries || input.target_deliveries < 1) {
    return { success: false, error: 'El objetivo debe ser al menos 1 entrega.' };
  }
  if (!input.bonus_amount || input.bonus_amount <= 0) {
    return { success: false, error: 'La bonificación debe ser superior a 0 €.' };
  }
  if (input.start_at && input.end_at && new Date(input.end_at) < new Date(input.start_at)) {
    return { success: false, error: 'La fecha de fin no puede ser anterior a la de inicio.' };
  }

  try {
    // 1. Intentar llamar a admin_manage_incentive
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_manage_incentive', {
      p_action: 'create',
      p_name: input.name.trim(),
      p_description: input.description?.trim() || null,
      p_target_deliveries: Math.floor(input.target_deliveries),
      p_bonus_amount: Number(input.bonus_amount),
      p_start_at: input.start_at || null,
      p_end_at: input.end_at || null,
      p_active: input.active ?? true,
    });

    if (!rpcError && rpcData?.success) {
      return { success: true, data: rpcData.incentive, error: null };
    }

    // 2. Fallback con inserción directa
    const { data: insertData, error: insertError } = await supabase
      .from('courier_incentives')
      .insert({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        target_deliveries: Math.floor(input.target_deliveries),
        bonus_amount: Number(input.bonus_amount),
        start_at: input.start_at || null,
        end_at: input.end_at || null,
        active: input.active ?? true,
        incentive_type: 'delivery_count',
      })
      .select()
      .single();

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    return { success: true, data: insertData, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al crear incentivo.',
    };
  }
}

/**
 * Actualiza los parámetros de un incentivo existente
 */
export async function adminUpdateIncentive(
  id: string,
  input: Partial<AdminIncentiveInput>
): Promise<{ success: boolean; data?: any; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  if (input.target_deliveries !== undefined && input.target_deliveries < 1) {
    return { success: false, error: 'El objetivo debe ser al menos 1 entrega.' };
  }
  if (input.bonus_amount !== undefined && input.bonus_amount <= 0) {
    return { success: false, error: 'La bonificación debe ser superior a 0 €.' };
  }
  if (input.start_at && input.end_at && new Date(input.end_at) < new Date(input.start_at)) {
    return { success: false, error: 'La fecha de fin no puede ser anterior a la de inicio.' };
  }

  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_manage_incentive', {
      p_action: 'update',
      p_id: id,
      p_name: input.name ? input.name.trim() : null,
      p_description: input.description !== undefined ? input.description?.trim() || null : null,
      p_target_deliveries: input.target_deliveries ? Math.floor(input.target_deliveries) : null,
      p_bonus_amount: input.bonus_amount !== undefined ? Number(input.bonus_amount) : null,
      p_start_at: input.start_at !== undefined ? input.start_at : null,
      p_end_at: input.end_at !== undefined ? input.end_at : null,
      p_active: input.active !== undefined ? input.active : null,
    });

    if (!rpcError && rpcData?.success) {
      return { success: true, data: rpcData.incentive, error: null };
    }

    // Fallback directo
    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) updatePayload.name = input.name.trim();
    if (input.description !== undefined) updatePayload.description = input.description?.trim() || null;
    if (input.target_deliveries !== undefined) updatePayload.target_deliveries = Math.floor(input.target_deliveries);
    if (input.bonus_amount !== undefined) updatePayload.bonus_amount = Number(input.bonus_amount);
    if (input.start_at !== undefined) updatePayload.start_at = input.start_at;
    if (input.end_at !== undefined) updatePayload.end_at = input.end_at;
    if (input.active !== undefined) updatePayload.active = input.active;

    const { data: updateData, error: updateError } = await supabase
      .from('courier_incentives')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true, data: updateData, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al actualizar incentivo.',
    };
  }
}

/**
 * Conmuta el estado activo / inactivo de un incentivo
 */
export async function adminToggleIncentiveActive(
  id: string,
  currentActive: boolean
): Promise<{ success: boolean; active?: boolean; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_manage_incentive', {
      p_action: 'toggle_active',
      p_id: id,
    });

    if (!rpcError && rpcData?.success) {
      return { success: true, active: rpcData.active, error: null };
    }

    // Fallback
    const newActive = !currentActive;
    const { error: updateError } = await supabase
      .from('courier_incentives')
      .update({ active: newActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true, active: newActive, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al cambiar estado.',
    };
  }
}

/**
 * Elimina de forma segura un incentivo:
 * Si ya tiene recompensas históricas, NO lo borra físicamente; lo desactiva para proteger el histórico financiero.
 */
export async function adminDeleteIncentive(
  id: string
): Promise<{ success: boolean; action?: 'deleted' | 'deactivated'; message?: string; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_manage_incentive', {
      p_action: 'delete',
      p_id: id,
    });

    if (!rpcError && rpcData?.success) {
      return {
        success: true,
        action: rpcData.action,
        message: rpcData.message,
        error: null,
      };
    }

    // Fallback: verificar si tiene recompensas asociadas
    const { count } = await supabase
      .from('courier_incentive_rewards')
      .select('*', { count: 'exact', head: true })
      .eq('incentive_id', id);

    if (count && count > 0) {
      // Desactivar para salvaguardar histórico
      const { error: deactError } = await supabase
        .from('courier_incentives')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (deactError) {
        return { success: false, error: deactError.message };
      }

      return {
        success: true,
        action: 'deactivated',
        message: `El incentivo tiene ${count} recompensas históricas. Ha sido desactivado para conservar la integridad del histórico.`,
        error: null,
      };
    }

    // Si no tiene recompensas, borrado físico
    const { error: delError } = await supabase.from('courier_incentives').delete().eq('id', id);
    if (delError) {
      return { success: false, error: delError.message };
    }

    return {
      success: true,
      action: 'deleted',
      message: 'Incentivo eliminado correctamente.',
      error: null,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al eliminar incentivo.',
    };
  }
}
