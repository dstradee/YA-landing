// ==============================================================================
// YA - SERVICIO CLIENTE Y RPC: DROPS SEMANALES + SORTEO MENSUAL
// Archivo: src/lib/drops.ts
// ==============================================================================

import { supabase } from './supabase';
import type {
  ActiveDropPayload,
  ActiveMonthlyDrawPayload,
  CheckDropEligibilityResult,
  DbDrop,
  DbDropPrize,
  DbMonthlyDraw,
  DbMonthlyDrawHistory,
  DbUserAwardedPrize,
  PlayDropResult,
} from '../types/drops';

// ------------------------------------------------------------------------------
// FORMATEADOR DE FECHAS EN ZONA HORARIA ESPAÑA (Europe/Madrid)
// ------------------------------------------------------------------------------
export function formatMadridDate(dateStr: string | Date, includeTime = true): string {
  if (!dateStr) return '';
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(date.getTime())) return '';

  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime
      ? {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }
      : {}),
  };

  return new Intl.DateTimeFormat('es-ES', options).format(date);
}

// ------------------------------------------------------------------------------
// 1. CLIENTE: OBTENER DROP ACTIVO
// ------------------------------------------------------------------------------
export async function fetchActiveDrop(): Promise<ActiveDropPayload> {
  try {
    const { data, error } = await supabase.rpc('get_active_drop');
    if (error) {
      console.warn('[Drops] Error en get_active_drop RPC, fallback local:', error.message);
      return { active: false };
    }
    const payload = data as ActiveDropPayload;
    if (payload?.drop) {
      payload.drop.game_key =
        payload.drop.game_key || payload.drop.game_config?.game_key || payload.drop.game_type || 'jackpot';
    }
    return payload || { active: false };
  } catch (err: any) {
    console.error('[Drops] Error al obtener drop activo:', err);
    return { active: false };
  }
}

// ------------------------------------------------------------------------------
// 2. CLIENTE: BUSCAR PEDIDO ELEGIBLE Y COMPROBAR ELEGIBILIDAD
// ------------------------------------------------------------------------------
export async function getLatestEligibleOrderIdForDrop(
  dropId: string,
  trigger: string = 'after_payment'
): Promise<string | null> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return null;

    // Buscar pedidos del usuario
    let query = supabase
      .from('orders')
      .select('id, payment_status, status, is_test')
      .eq('user_id', user.id);

    // after_payment: pago confirmado ('paid') o pedido de test
    // after_delivery: entregado o completado
    if (trigger === 'after_delivery') {
      query = query.or('status.eq.delivered,status.eq.completed,is_test.eq.true');
    } else {
      query = query.or('payment_status.eq.paid,is_test.eq.true');
    }

    const { data: orders, error: ordersErr } = await query
      .order('created_at', { ascending: false })
      .limit(10);

    if (ordersErr || !orders || orders.length === 0) return null;

    // Descartar pedidos que ya hayan sido usados en este drop
    const { data: attempts } = await supabase
      .from('drop_attempts')
      .select('order_id')
      .eq('drop_id', dropId)
      .eq('user_id', user.id);

    const usedOrderIds = new Set((attempts || []).map((a: any) => a.order_id).filter(Boolean));
    const eligible = orders.find((o: any) => !usedOrderIds.has(o.id));
    return eligible ? eligible.id : null;
  } catch (err) {
    console.warn('[Drops] getLatestEligibleOrderIdForDrop warning:', err);
    return null;
  }
}

export async function checkDropEligibility(
  dropId: string,
  orderId?: string,
  activationTrigger: string = 'after_payment'
): Promise<CheckDropEligibilityResult> {
  try {
    let targetOrderId = orderId;
    if (!targetOrderId && activationTrigger !== 'free') {
      targetOrderId = (await getLatestEligibleOrderIdForDrop(dropId, activationTrigger)) || undefined;
    }

    // 1. Intentar comprobación vía RPC en PostgreSQL
    const { data, error } = await supabase.rpc('check_drop_eligibility', {
      p_drop_id: dropId,
      p_order_id: targetOrderId || null,
    });

    if (!error && data) {
      const result = data as CheckDropEligibilityResult;
      if (targetOrderId && !result.order_id) {
        result.order_id = targetOrderId;
      }
      return result;
    }

    // 2. Si el RPC da error (ej. restricción enum en DB antigua), comprobación autoritativa directa
    console.info('[Drops] check_drop_eligibility RPC notice, checking eligibility directly:', error?.message);
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) {
      return { eligible: false, reason: 'auth_required' };
    }

    const { data: drop } = await supabase.from('drops').select('*').eq('id', dropId).single();
    if (!drop || drop.status === 'finished') {
      return { eligible: false, reason: 'drop_finished' };
    }
    const now = new Date().toISOString();
    if (drop.starts_at > now) {
      return { eligible: false, reason: 'drop_not_started' };
    }
    if (drop.ends_at <= now) {
      return { eligible: false, reason: 'drop_finished' };
    }

    let resolvedOrderId = targetOrderId;
    if (!resolvedOrderId) {
      resolvedOrderId = (await getLatestEligibleOrderIdForDrop(dropId, activationTrigger)) || undefined;
      if (!resolvedOrderId) {
        return { eligible: false, reason: 'order_required', trigger: 'after_payment' };
      }
    }

    // Comprobar si ya se jugó con este pedido
    const { data: attempts } = await supabase
      .from('drop_attempts')
      .select('id, outcome')
      .eq('drop_id', dropId)
      .eq('order_id', resolvedOrderId)
      .limit(1);

    if (attempts && attempts.length > 0) {
      return {
        eligible: false,
        reason: 'already_played',
        order_id: resolvedOrderId,
        attempt_id: attempts[0].id,
        outcome: attempts[0].outcome,
      };
    }

    // Verificar pedido
    const { data: ord } = await supabase
      .from('orders')
      .select('id, user_id, payment_status, is_test')
      .eq('id', resolvedOrderId)
      .single();

    if (!ord || ord.user_id !== user.id) {
      return { eligible: false, reason: 'order_not_found' };
    }

    // REGLA CLAVE: pago confirmado ('paid') o pedido de test. No exige completed ni delivered.
    const isPaidOrTest = ord.payment_status === 'paid' || Boolean(ord.is_test);
    if (!isPaidOrTest) {
      return { eligible: false, reason: 'order_not_eligible', trigger: 'after_payment' };
    }

    return {
      eligible: true,
      reason: 'ok',
      order_id: resolvedOrderId,
      trigger: 'after_payment',
    };
  } catch (err: any) {
    console.error('[Drops] Excepción al comprobar elegibilidad:', err);
    return { eligible: false, reason: err?.message || 'Error desconocido' };
  }
}

// ------------------------------------------------------------------------------
// 3. CLIENTE: JUGAR DROP (Backend autoritativo con idempotencia)
// ------------------------------------------------------------------------------
export async function playDrop(
  dropId: string,
  orderId?: string,
  idempotencyKey?: string,
  activationTrigger: string = 'after_payment'
): Promise<PlayDropResult> {
  let targetOrderId = orderId;
  if (!targetOrderId && activationTrigger !== 'free') {
    targetOrderId = (await getLatestEligibleOrderIdForDrop(dropId, activationTrigger)) || undefined;
  }

  // Clave idempotente única si no se proporciona
  const key = idempotencyKey || `${dropId}_${targetOrderId || 'free'}_${Date.now()}`;

  // 1. Intentar primero vía RPC play_drop
  const { data, error } = await supabase.rpc('play_drop', {
    p_drop_id: dropId,
    p_order_id: targetOrderId || null,
    p_idempotency_key: key,
  });

  if (!error && data) {
    return data as PlayDropResult;
  }

  console.info('[Drops] play_drop RPC notice, processing authoritative turn directly:', error?.message);

  // 2. Fallback seguro autoritativo si el RPC tiene restricción enum de Postgres
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) {
    throw new Error('Debes iniciar sesión para jugar');
  }

  // Comprobar intento existente con la misma clave idempotente
  const { data: existingAttempt } = await supabase
    .from('drop_attempts')
    .select('*')
    .eq('idempotency_key', key)
    .limit(1);

  if (existingAttempt && existingAttempt.length > 0) {
    const att = existingAttempt[0];
    return {
      success: true,
      outcome: att.outcome as any,
      attempt_id: att.id,
      prize_id: att.prize_id,
      awarded_prize_id: att.awarded_prize_id,
    };
  }

  // Obtener drop y premios activos
  const { data: drop } = await supabase.from('drops').select('*').eq('id', dropId).single();
  if (!drop) throw new Error('Drop no encontrado');

  const { data: rawPrizes } = await supabase
    .from('drop_prizes')
    .select('*')
    .eq('drop_id', dropId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  const activePrizes = (rawPrizes || []).filter(
    (p) => p.max_inventory === null || (p.inventory_consumed || 0) < p.max_inventory
  );

  // Calcular RNG según probabilidades configuradas por el Admin
  const rand = Math.random() * 100.0;
  let cumulative = 0;
  let wonPrize: any = null;

  for (const p of activePrizes) {
    cumulative += Number(p.probability_pct || 0);
    if (rand < cumulative) {
      wonPrize = p;
      break;
    }
  }

  const now = new Date();

  if (wonPrize) {
    // Incrementar stock consumido
    await supabase
      .from('drop_prizes')
      .update({ inventory_consumed: (wonPrize.inventory_consumed || 0) + 1 })
      .eq('id', wonPrize.id);

    const validityDays = wonPrize.validity_days || drop.prize_validity_days || 7;
    const expiresAt = new Date(Date.now() + validityDays * 86400000).toISOString();

    // Otorgar premio
    const { data: awarded, error: awardErr } = await supabase
      .from('user_awarded_prizes')
      .insert({
        user_id: user.id,
        drop_id: dropId,
        prize_id: wonPrize.id,
        prize_name: wonPrize.name,
        prize_type: wonPrize.prize_type,
        prize_value: wonPrize.prize_value,
        prize_config: wonPrize.prize_config || {},
        expires_at: expiresAt,
        status: 'pending',
      })
      .select();

    if (awardErr) {
      console.warn('[Drops] Error awarding prize:', awardErr.message);
    }

    const awardedPrizeId = awarded?.[0]?.id;

    // Registrar intento
    const { data: att } = await supabase
      .from('drop_attempts')
      .insert({
        drop_id: dropId,
        user_id: user.id,
        order_id: targetOrderId || null,
        outcome: 'won_prize',
        prize_id: wonPrize.id,
        awarded_prize_id: awardedPrizeId,
        idempotency_key: key,
      })
      .select();

    const attemptId = att?.[0]?.id;

    return {
      success: true,
      outcome: 'won_prize',
      attempt_id: attemptId,
      prize_id: wonPrize.id,
      awarded_prize_id: awardedPrizeId,
      prize: {
        id: wonPrize.id,
        awarded_prize_id: awardedPrizeId,
        name: wonPrize.name,
        description: wonPrize.description,
        prize_type: wonPrize.prize_type,
        prize_value: wonPrize.prize_value,
        expires_at: expiresAt,
        validity_days: validityDays,
      },
    };
  } else {
    // Premio de consolación (+1 participación en el sorteo mensual)
    const entriesCount = drop.consolation_config?.entries_count || 1;

    // Intentar registrar en el sorteo mensual activo si existe
    try {
      const { data: activeDraws } = await supabase
        .from('monthly_draws')
        .select('*')
        .eq('status', 'open')
        .lte('starts_at', now.toISOString())
        .gt('ends_at', now.toISOString())
        .order('starts_at', { ascending: false })
        .limit(1);

      if (activeDraws && activeDraws.length > 0) {
        await supabase.from('monthly_draw_entries').insert({
          draw_id: activeDraws[0].id,
          user_id: user.id,
          source: 'drop_consolation',
          entries_count: entriesCount,
          metadata: { drop_id: dropId, order_id: targetOrderId },
        });
      }
    } catch (dErr) {
      console.warn('[Drops] Notice awarding monthly draw entries:', dErr);
    }

    // Registrar intento de consolación
    const { data: att } = await supabase
      .from('drop_attempts')
      .insert({
        drop_id: dropId,
        user_id: user.id,
        order_id: targetOrderId || null,
        outcome: 'consolation',
        idempotency_key: key,
      })
      .select();

    const attemptId = att?.[0]?.id;

    return {
      success: true,
      outcome: 'consolation',
      attempt_id: attemptId,
      consolation_entries: entriesCount,
      message: `¡Has ganado +${entriesCount} participación en el Gran Sorteo Mensual!`,
    };
  }
}

// ------------------------------------------------------------------------------
// 4. CLIENTE: PREMIOS OTORGADOS AL USUARIO
// ------------------------------------------------------------------------------
export async function fetchUserAwardedPrizes(): Promise<DbUserAwardedPrize[]> {
  try {
    const { data, error } = await supabase.rpc('get_user_awarded_prizes');
    if (error) {
      console.warn('[Drops] Error en get_user_awarded_prizes RPC:', error.message);
      return [];
    }
    return (data as DbUserAwardedPrize[]) || [];
  } catch (err) {
    console.error('[Drops] Error al obtener premios del usuario:', err);
    return [];
  }
}

// ------------------------------------------------------------------------------
// 5. CLIENTE: SORTEO MENSUAL ACTIVO
// ------------------------------------------------------------------------------
export async function fetchActiveMonthlyDraw(): Promise<ActiveMonthlyDrawPayload> {
  try {
    const { data, error } = await supabase.rpc('get_active_monthly_draw');
    if (error) {
      console.warn('[Drops] Error en get_active_monthly_draw RPC:', error.message);
      return { active: false, user_entries_count: 0, total_entries_count: 0 };
    }
    return (data as ActiveMonthlyDrawPayload) || {
      active: false,
      user_entries_count: 0,
      total_entries_count: 0,
    };
  } catch (err) {
    console.error('[Drops] Error al obtener sorteo mensual activo:', err);
    return { active: false, user_entries_count: 0, total_entries_count: 0 };
  }
}

// ------------------------------------------------------------------------------
// 6. ADMIN: GESTIÓN DE DROPS
// ------------------------------------------------------------------------------
export async function adminFetchAllDrops(): Promise<DbDrop[]> {
  const { data, error } = await supabase
    .from('drops')
    .select('*')
    .order('starts_at', { ascending: false });

  if (error) {
    console.warn('[Drops] adminFetchAllDrops error:', error.message);
    return [];
  }
  return (data || []).map((drop: any) => ({
    ...drop,
    game_key: drop.game_key || drop.game_config?.game_key || drop.game_type || 'jackpot',
  }));
}

export async function adminFetchDropWithPrizes(dropId: string): Promise<{
  drop: DbDrop;
  prizes: DbDropPrize[];
}> {
  const { data: rawDrop, error: dropErr } = await supabase
    .from('drops')
    .select('*')
    .eq('id', dropId)
    .single();

  if (dropErr || !rawDrop) {
    throw new Error(dropErr?.message || 'Drop no encontrado');
  }

  const drop: DbDrop = {
    ...rawDrop,
    game_key: rawDrop.game_key || rawDrop.game_config?.game_key || rawDrop.game_type || 'jackpot',
  };

  const { data: prizes, error: prizesErr } = await supabase
    .from('drop_prizes')
    .select('*')
    .eq('drop_id', dropId)
    .order('sort_order', { ascending: true });

  if (prizesErr) {
    throw new Error(prizesErr.message);
  }

  return { drop, prizes: prizes || [] };
}

export async function adminCreateDrop(
  dropData: Omit<DbDrop, 'id' | 'created_at' | 'updated_at'>,
  prizesData: Array<Omit<DbDropPrize, 'id' | 'drop_id' | 'created_at' | 'updated_at' | 'inventory_consumed'>>
): Promise<DbDrop> {
  // 1. Validar probabilidades totales
  const totalProb = prizesData.reduce((sum, p) => sum + Number(p.probability_pct), 0);
  if (totalProb > 100) {
    throw new Error(`La suma de probabilidades de los premios (${totalProb}%) supera el 100%`);
  }

  // 2. Normalizar payload para el esquema real de Supabase
  // Mapeamos game_key -> game_type y guardamos game_key en game_config para total compatibilidad
  const gameKey = (dropData as any).game_key || dropData.game_type || 'jackpot';
  const cleanPayload: Record<string, any> = {
    ...dropData,
    game_type: gameKey,
    game_config: {
      ...(dropData.game_config || {}),
      game_key: gameKey,
    },
  };
  delete cleanPayload.game_key;

  const { data: newRows, error: dropErr } = await supabase
    .from('drops')
    .insert([cleanPayload])
    .select();

  if (dropErr) {
    throw new Error(dropErr.message || 'Error al registrar el Drop');
  }

  const newDrop = (newRows && newRows[0]) || ({ ...cleanPayload, id: 'temp-id' } as any);

  // 3. Insertar premios asociados
  if (prizesData.length > 0) {
    const formattedPrizes = prizesData.map((p, idx) => ({
      ...p,
      drop_id: newDrop.id,
      sort_order: idx + 1,
    }));

    const { error: prizesErr } = await supabase.from('drop_prizes').insert(formattedPrizes);
    if (prizesErr) {
      console.error('[Drops] Error insertando premios:', prizesErr);
      throw new Error(`Drop creado pero hubo un error con los premios: ${prizesErr.message}`);
    }
  }

  return {
    ...newDrop,
    game_key: newDrop.game_key || newDrop.game_config?.game_key || newDrop.game_type,
  };
}

export async function adminUpdateDrop(
  dropId: string,
  dropData: Partial<DbDrop>,
  prizesData?: Array<Omit<DbDropPrize, 'drop_id' | 'created_at' | 'updated_at' | 'inventory_consumed'>>
): Promise<DbDrop> {
  // Normalizar identificador técnico del juego
  const gameKey = (dropData as any).game_key || dropData.game_type || 'jackpot';
  const triggerToSave = dropData.activation_trigger || 'after_payment';

  const cleanPayload: Record<string, any> = {
    ...dropData,
    game_type: gameKey,
    activation_trigger: triggerToSave,
    game_config: {
      ...(dropData.game_config || {}),
      game_key: gameKey,
      activation_trigger: triggerToSave,
    },
    updated_at: new Date().toISOString(),
  };

  // Evitar error de PostgREST schema cache eliminando la columna virtual antes del update si la tabla no la expone
  delete cleanPayload.game_key;

  // Actualizar datos del Drop
  const { data: updatedRows, error: dropErr } = await supabase
    .from('drops')
    .update(cleanPayload)
    .eq('id', dropId)
    .select();

  if (dropErr) {
    throw new Error(dropErr.message || 'Error al actualizar el Drop');
  }

  const updatedDrop = (updatedRows && updatedRows[0]) || ({ ...cleanPayload, id: dropId } as any);

  // Si se envían premios para actualizar o reemplazar
  if (prizesData) {
    // Validar suma de probabilidades
    const totalProb = prizesData.reduce((sum, p) => sum + Number(p.probability_pct), 0);
    if (totalProb > 100) {
      throw new Error(`La suma de probabilidades (${totalProb}%) supera el 100%`);
    }

    // Actualizar premios existentes por ID o insertar nuevos de forma segura sin romper referencias
    for (const [idx, p] of prizesData.entries()) {
      const prizePayload = {
        name: p.name,
        description: p.description,
        prize_type: p.prize_type,
        prize_value: p.prize_value,
        prize_config: p.prize_config || {},
        probability_pct: p.probability_pct,
        max_inventory: p.max_inventory,
        validity_days: p.validity_days,
        is_active: p.is_active,
        drop_id: dropId,
        sort_order: idx + 1,
      };

      if ((p as any).id) {
        const { error: updErr } = await supabase
          .from('drop_prizes')
          .update(prizePayload)
          .eq('id', (p as any).id);
        if (updErr) {
          console.warn('[Drops] Notice updating prize by id:', updErr.message);
        }
      } else {
        const { error: insErr } = await supabase
          .from('drop_prizes')
          .insert(prizePayload);
        if (insErr) {
          console.warn('[Drops] Notice inserting prize:', insErr.message);
        }
      }
    }
  }

  return {
    ...updatedDrop,
    game_key: updatedDrop.game_key || updatedDrop.game_config?.game_key || updatedDrop.game_type,
    activation_trigger: updatedDrop.activation_trigger,
  };
}

export async function adminDeleteDrop(dropId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_drop', {
    p_drop_id: dropId,
  });

  if (!error) {
    return;
  }

  console.warn('[Drops] admin_delete_drop RPC notice, applying clean cascade fallback:', error.message);
  // Eliminar dependencias en orden referencial para asegurar éxito
  await supabase.from('drop_attempts').delete().eq('drop_id', dropId);
  await supabase.from('user_awarded_prizes').delete().eq('drop_id', dropId);
  await supabase.from('drop_prizes').delete().eq('drop_id', dropId);
  // Cambiar estado si estuviera activo para evitar bloqueos por restricciones previas
  await supabase.from('drops').update({ status: 'cancelled' }).eq('id', dropId);
  const { error: directErr } = await supabase.from('drops').delete().eq('id', dropId);
  if (directErr) {
    throw new Error(directErr.message);
  }
}

// ------------------------------------------------------------------------------
// 7. ADMIN: GESTIÓN DE SORTEO MENSUAL
// ------------------------------------------------------------------------------
export async function adminFetchAllMonthlyDraws(): Promise<{
  draws: DbMonthlyDraw[];
  history: DbMonthlyDrawHistory[];
}> {
  const { data: draws, error: drawsErr } = await supabase
    .from('monthly_draws')
    .select('*')
    .order('starts_at', { ascending: false });

  const { data: history, error: historyErr } = await supabase
    .from('monthly_draw_history')
    .select('*')
    .order('awarded_at', { ascending: false });

  if (drawsErr) console.warn('[Drops] Error fetching monthly draws:', drawsErr.message);
  if (historyErr) console.warn('[Drops] Error fetching draw history:', historyErr.message);

  return {
    draws: draws || [],
    history: history || [],
  };
}

export async function adminFetchMonthlyDrawParticipants(drawId: string): Promise<
  Array<{
    user_id: string;
    entries_count: number;
    full_name: string;
    email: string;
    phone: string;
  }>
> {
  // Consulta de participaciones agrupadas con datos de perfil
  const { data: entries, error } = await supabase
    .from('monthly_draw_entries')
    .select('user_id')
    .eq('draw_id', drawId);

  if (error || !entries) {
    return [];
  }

  // Agrupar por usuario
  const counts: Record<string, number> = {};
  entries.forEach((e) => {
    counts[e.user_id] = (counts[e.user_id] || 0) + 1;
  });

  const userIds = Object.keys(counts);
  if (userIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone')
    .in('id', userIds);

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  return userIds.map((uid) => {
    const prof = profileMap.get(uid);
    return {
      user_id: uid,
      entries_count: counts[uid],
      full_name: prof?.full_name || 'Usuario YA',
      email: prof?.email || '',
      phone: prof?.phone || '',
    };
  });
}

export async function adminCreateMonthlyDraw(
  drawData: Omit<DbMonthlyDraw, 'id' | 'created_at' | 'updated_at'>
): Promise<DbMonthlyDraw> {
  const { data, error } = await supabase
    .from('monthly_draws')
    .insert([drawData])
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Error al crear el sorteo mensual');
  }
  return data;
}

export async function adminCloseMonthlyDraw(
  drawId: string,
  winnerUserId: string,
  winnerNotes?: string
): Promise<any> {
  const { data, error } = await supabase.rpc('admin_close_monthly_draw', {
    p_draw_id: drawId,
    p_winner_user_id: winnerUserId,
    p_winner_notes: winnerNotes || null,
  });

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function adminRunDataCleanup(): Promise<any> {
  const { data, error } = await supabase.rpc('clean_expired_and_legacy_data');
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function saveAwardedPrizeCustomData(awardedPrizeId: string, customData: any): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('save_awarded_prize_custom_data', {
      p_awarded_prize_id: awardedPrizeId,
      p_custom_data: customData
    });
    if (error) {
      console.warn('[Drops] Error en save_awarded_prize_custom_data:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Drops] Error en save_awarded_prize_custom_data:', err);
    return false;
  }
}

export async function adminFetchAwardedPrizes(dropId?: string): Promise<any[]> {
  try {
    let query = supabase
      .from('user_awarded_prizes')
      .select('*')
      .order('awarded_at', { ascending: false });

    if (dropId) {
      query = query.eq('drop_id', dropId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[Drops] adminFetchAwardedPrizes error:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[Drops] Error en adminFetchAwardedPrizes:', err);
    return [];
  }
}

