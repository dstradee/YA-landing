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
// ESTADO TEMPORAL REAL DE UN DROP (ZONA HORARIA ESPAÑA / UTC)
// ------------------------------------------------------------------------------
export function getDropTimingStatus(drop: {
  starts_at: string;
  ends_at: string;
  status: string;
}): 'active' | 'scheduled' | 'finished' | 'draft' | 'cancelled' {
  if (drop.status === 'draft' || drop.status === 'cancelled') {
    return drop.status as any;
  }
  const now = Date.now();
  const start = new Date(drop.starts_at).getTime();
  const end = new Date(drop.ends_at).getTime();
  if (now < start) return 'scheduled';
  if (now >= start && now < end) return 'active';
  return 'finished';
}

// ------------------------------------------------------------------------------
// 1. CLIENTE: OBTENER DROP ACTIVO (Activación automática por fechas)
// ------------------------------------------------------------------------------
export async function fetchActiveDrop(): Promise<ActiveDropPayload> {
  try {
    const nowMs = Date.now();

    // 1. Intentar primero con la función RPC de base de datos
    let payload: ActiveDropPayload = { active: false };
    const { data, error } = await supabase.rpc('get_active_drop');
    if (!error && data && (data as any).active) {
      payload = data as ActiveDropPayload;
    }

    // 2. Si el RPC no detectó o dio error, evaluar autoritativamente por fechas en tabla drops
    if (!payload?.active || !payload?.drop) {
      const { data: allDrops } = await supabase
        .from('drops')
        .select('*')
        .neq('status', 'draft')
        .neq('status', 'cancelled')
        .order('starts_at', { ascending: true });

      if (allDrops && allDrops.length > 0) {
        // Encontrar el Drop que cae dentro del rango de fechas en este instante
        const currentDrop = allDrops.find((d) => {
          const s = new Date(d.starts_at).getTime();
          const e = new Date(d.ends_at).getTime();
          return nowMs >= s && nowMs < e;
        });

        if (currentDrop) {
          // Sincronizar estado en BD si estaba como 'scheduled'
          if (currentDrop.status !== 'active') {
            supabase.from('drops').update({ status: 'active' }).eq('id', currentDrop.id).then();
            currentDrop.status = 'active';
          }

          // Cargar premios activos
          const { data: prizes } = await supabase
            .from('drop_prizes')
            .select('*')
            .eq('drop_id', currentDrop.id)
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

          payload = {
            active: true,
            drop: {
              ...currentDrop,
              game_key:
                currentDrop.game_key ||
                currentDrop.game_config?.game_key ||
                currentDrop.game_type ||
                'jackpot',
            },
            prizes: (prizes || []).map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              prize_type: p.prize_type,
              prize_value: p.prize_value,
              prize_config: p.prize_config || {},
              sort_order: p.sort_order,
            })),
          };
        } else {
          // No hay ninguno activo ahora: encontrar el PRÓXIMO programado
          const upcoming = allDrops.find((d) => new Date(d.starts_at).getTime() > nowMs);
          if (upcoming) {
            payload = {
              active: false,
              nextDrop: {
                id: upcoming.id,
                drop_number: upcoming.drop_number,
                title: upcoming.title,
                description: upcoming.description,
                game_type: upcoming.game_type,
                starts_at: upcoming.starts_at,
                ends_at: upcoming.ends_at,
              },
            };
          }
        }
      }
    }

    if (payload?.drop) {
      payload.drop.game_key =
        payload.drop.game_key ||
        payload.drop.game_config?.game_key ||
        payload.drop.game_type ||
        'jackpot';
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
    let awardedDraw: any = null;

    // 1. Obtener sorteo mensual activo en la base de datos
    try {
      const { data: activeDraws } = await supabase
        .from('monthly_draws')
        .select('*')
        .in('status', ['open', 'active'])
        .order('starts_at', { ascending: false })
        .limit(1);

      if (activeDraws && activeDraws.length > 0) {
        awardedDraw = activeDraws[0];

        // Guardar vía API server-side garantizada
        try {
          await fetch('/api/drops/record-entry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              drawId: awardedDraw.id,
              userId: user.id,
              dropId,
              orderId: targetOrderId,
              entriesCount,
            }),
          });
        } catch (apiErr) {
          console.warn('[Drops] Server API entry record notice:', apiErr);
        }

        // Guardar directamente en monthly_draw_entries (source: 'drop')
        const entriesToInsert = Array.from({ length: entriesCount }, () => ({
          draw_id: awardedDraw.id,
          user_id: user.id,
          source: 'drop',
          drop_id: dropId,
          order_id: targetOrderId || null,
        }));

        await supabase.from('monthly_draw_entries').insert(entriesToInsert);
      }
    } catch (dErr) {
      console.warn('[Drops] Notice awarding monthly draw entries:', dErr);
    }

    // 2. Registrar intento de consolación en drop_attempts
    const { data: att } = await supabase
      .from('drop_attempts')
      .insert({
        drop_id: dropId,
        user_id: user.id,
        order_id: targetOrderId || null,
        outcome: 'consolation',
        consolation_details: awardedDraw
          ? {
              draw_id: awardedDraw.id,
              draw_title: awardedDraw.title,
              entries_awarded: entriesCount,
            }
          : { entries_awarded: entriesCount },
        idempotency_key: key,
      })
      .select();

    const attemptId = att?.[0]?.id;

    return {
      success: true,
      outcome: 'consolation',
      attempt_id: attemptId,
      consolation_entries: entriesCount,
      consolation: awardedDraw
        ? {
            draw_id: awardedDraw.id,
            draw_title: awardedDraw.title,
            theme_unit_name: awardedDraw.theme_unit_name || 'participación',
            theme_unit_icon: awardedDraw.theme_unit_icon || 'ticket',
            entries_awarded: entriesCount,
          }
        : {
            entries_awarded: entriesCount,
          },
      message: awardedDraw
        ? `¡Has ganado +${entriesCount} participación en el Gran Sorteo Mensual (${awardedDraw.title})!`
        : `¡Has ganado +${entriesCount} participación en el Gran Sorteo Mensual!`,
    };
  }
}

/**
 * ==============================================================================
 * 3b. MODO PRUEBA DE ADMIN (SIMULACIÓN AUTORITATIVA 100% AISLADA DE PRODUCCIÓN)
 * ==============================================================================
 * Permite a los administradores probar cualquier Drop en vivo con la mecánica
 * y probabilidades reales del juego configurado, sin:
 * - consumir intentos de usuarios
 * - crear pedidos ni modificarlos
 * - descontar stock de premios (inventory_consumed)
 * - registrar premios en user_awarded_prizes
 * - otorgar participaciones reales al sorteo mensual
 * - alterar estadísticas ni cerrar Drops
 */
export async function adminTestPlayDrop(dropId: string): Promise<PlayDropResult> {
  const { data: authData } = await supabase.auth.getSession();
  const token = authData?.session?.access_token;

  if (!token) {
    throw new Error('Debes iniciar sesión con una cuenta de Administrador para probar el Drop.');
  }

  // 1. Intentar primero a través del endpoint seguro server-side
  try {
    const res = await fetch('/api/admin/test-play-drop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ dropId }),
    });

    if (res.ok) {
      const result = await res.json();
      return result as PlayDropResult;
    }

    const errJson = await res.json().catch(() => ({}));
    if (errJson?.error) {
      throw new Error(errJson.error);
    }
  } catch (apiErr: any) {
    // Si es un error de validación explícito (p.ej. sin premios o no admin), relanzarlo
    if (
      apiErr.message?.includes('premios') ||
      apiErr.message?.includes('rol') ||
      apiErr.message?.includes('denegado') ||
      apiErr.message?.includes('encontrado')
    ) {
      throw apiErr;
    }
    console.info('[Drops] Fallback seguro a simulación de prueba en cliente:', apiErr.message);
  }

  // 2. Fallback de simulación en cliente validando rol admin
  const { data: authUser } = await supabase.auth.getUser();
  if (!authUser?.user) {
    throw new Error('Debes iniciar sesión con rol de Administrador.');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authUser.user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    throw new Error('Acceso denegado: solo los Administradores pueden probar Drops.');
  }

  const { data: drop, error: dropErr } = await supabase
    .from('drops')
    .select('*')
    .eq('id', dropId)
    .single();

  if (dropErr || !drop) {
    throw new Error('Drop no encontrado en la base de datos.');
  }

  const { data: rawPrizes, error: prizesErr } = await supabase
    .from('drop_prizes')
    .select('*')
    .eq('drop_id', dropId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (prizesErr) {
    throw new Error(`Error al cargar premios del Drop: ${prizesErr.message}`);
  }

  if (!rawPrizes || rawPrizes.length === 0) {
    throw new Error('El Drop no tiene premios activos configurados. Añade al menos un premio para poder probarlo.');
  }

  const activePrizes = rawPrizes.filter((p) => Number(p.probability_pct || 0) > 0);
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

  const validityDays = wonPrize?.validity_days || drop.prize_validity_days || 7;
  const expiresAt = new Date(Date.now() + validityDays * 86400000).toISOString();

  // Aislamiento absoluto: no escribir en ninguna tabla de producción
  return {
    success: true,
    is_test_mode: true,
    outcome: wonPrize ? 'won_prize' : 'consolation',
    attempt_id: `test_sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    prize_id: wonPrize?.id,
    prize: wonPrize
      ? {
          id: wonPrize.id,
          awarded_prize_id: `test_award_${Date.now()}`,
          name: wonPrize.name,
          description: wonPrize.description,
          prize_type: wonPrize.prize_type,
          prize_value: Number(wonPrize.prize_value || 0),
          validity_days: validityDays,
          expires_at: expiresAt,
        }
      : undefined,
    consolation_entries: drop.consolation_config?.entries_count || 1,
    consolation: {
      draw_title: 'Sorteo Mensual Activo (Simulación de Prueba)',
      entries_awarded: drop.consolation_config?.entries_count || 1,
      note: 'Simulación de prueba: no se ha sumado ninguna participación real.',
    },
    message: wonPrize
      ? `[MODO PRUEBA] Simulación de premio ganado: ${wonPrize.name}`
      : `[MODO PRUEBA] Simulación de consolación: +${drop.consolation_config?.entries_count || 1} participación simulada.`,
  };
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
// 5. CLIENTE: SORTEO MENSUAL ACTIVO (Recuento autoritativo en tiempo real)
// ------------------------------------------------------------------------------
export async function fetchActiveMonthlyDraw(): Promise<ActiveMonthlyDrawPayload> {
  try {
    // 1. Intentar primero con la función RPC existente
    let payload: ActiveMonthlyDrawPayload = {
      active: false,
      user_entries_count: 0,
      total_entries_count: 0,
    };

    const { data: rpcData, error: rpcError } = await supabase.rpc('get_active_monthly_draw');
    if (!rpcError && rpcData && (rpcData as any).active) {
      payload = rpcData as ActiveMonthlyDrawPayload;
    }

    // 2. Si el RPC dio false o falló, buscar directamente en tabla monthly_draws
    if (!payload?.active || !payload?.draw) {
      const nowIso = new Date().toISOString();
      // Priorizar el sorteo abierto dentro del rango de fechas
      const { data: openDraws } = await supabase
        .from('monthly_draws')
        .select('*')
        .in('status', ['open', 'active'])
        .lte('starts_at', nowIso)
        .gt('ends_at', nowIso)
        .order('starts_at', { ascending: false })
        .limit(1);

      let fallbackDraw = openDraws?.[0];

      // Si ninguno coincide exactamente con fecha, tomar cualquier sorteo abierto
      if (!fallbackDraw) {
        const { data: anyOpen } = await supabase
          .from('monthly_draws')
          .select('*')
          .in('status', ['open', 'active'])
          .order('starts_at', { ascending: false })
          .limit(1);
        fallbackDraw = anyOpen?.[0];
      }

      if (fallbackDraw) {
        payload = {
          active: true,
          draw: {
            id: fallbackDraw.id,
            month_identifier: fallbackDraw.month_identifier,
            title: fallbackDraw.title,
            description: fallbackDraw.description,
            theme_key: fallbackDraw.theme_key,
            theme_unit_name: fallbackDraw.theme_unit_name,
            theme_unit_icon: fallbackDraw.theme_unit_icon,
            prize_title: fallbackDraw.prize_title,
            prize_description: fallbackDraw.prize_description,
            prize_value: fallbackDraw.prize_value,
            starts_at: fallbackDraw.starts_at,
            ends_at: fallbackDraw.ends_at,
          },
          user_entries_count: 0,
          total_entries_count: 0,
        };
      }
    }

    // 3. RECUENTO EXACTO AUTORITATIVO DE PARTICIPACIONES
    if (payload?.draw?.id) {
      const drawId = payload.draw.id;

      // Recuento global de boletos
      const { count: totalCount } = await supabase
        .from('monthly_draw_entries')
        .select('*', { count: 'exact', head: true })
        .eq('draw_id', drawId);

      payload.total_entries_count = totalCount ?? 0;

      // Recuento de participaciones del usuario actual autenticado
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id;
      if (currentUserId) {
        const { count: userCount } = await supabase
          .from('monthly_draw_entries')
          .select('*', { count: 'exact', head: true })
          .eq('draw_id', drawId)
          .eq('user_id', currentUserId);

        payload.user_entries_count = userCount ?? 0;
      }
    }

    return payload;
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

  const drops = (data || []).map((drop: any) => {
    // Calcular timing status en tiempo real
    const timingStatus = getDropTimingStatus(drop);

    // Si hay discrepancia entre timing y estado en BD (ej. terminó o empezó), actualizar en segundo plano
    if (drop.status !== 'draft' && drop.status !== 'cancelled') {
      if (timingStatus === 'active' && drop.status !== 'active') {
        supabase.from('drops').update({ status: 'active' }).eq('id', drop.id).then();
        drop.status = 'active';
      } else if (timingStatus === 'finished' && drop.status !== 'finished') {
        supabase.from('drops').update({ status: 'finished' }).eq('id', drop.id).then();
        drop.status = 'finished';
      }
    }

    return {
      ...drop,
      game_key: drop.game_key || drop.game_config?.game_key || drop.game_type || 'jackpot',
    };
  });

  return drops;
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

  const { data: rawPrizes, error: prizesErr } = await supabase
    .from('drop_prizes')
    .select('*')
    .eq('drop_id', dropId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (prizesErr) {
    throw new Error(prizesErr.message);
  }

  // Deduplicación defensiva en lectura para asegurar que cada premio tenga una única entrada
  const seenIdentities = new Map<string, DbDropPrize>();
  for (const raw of rawPrizes || []) {
    const p: DbDropPrize = {
      ...raw,
      prize_type:
        raw.prize_config?.subtype === 'free_shipping' ? 'free_shipping' : raw.prize_type,
    };
    const key = `${p.name.trim().toLowerCase()}::${p.prize_type}`;
    if (!seenIdentities.has(key)) {
      seenIdentities.set(key, p);
    } else {
      // Priorizar el que tenga consumo de inventario registrado
      const existing = seenIdentities.get(key)!;
      if ((p.inventory_consumed || 0) > (existing.inventory_consumed || 0)) {
        seenIdentities.set(key, p);
      }
    }
  }

  const prizes = Array.from(seenIdentities.values());

  const totalProb = prizes.reduce(
    (sum, p) => sum + (p.is_active ? Number(p.probability_pct || 0) : 0),
    0
  );
  console.log(`Premios directos: ${totalProb}%`);
  console.log(`Consolación: ${Math.max(0, 100 - totalProb)}%`);

  return { drop, prizes };
}

export async function adminCreateDrop(
  dropData: Omit<DbDrop, 'id' | 'created_at' | 'updated_at'>,
  prizesData: Array<Omit<DbDropPrize, 'id' | 'drop_id' | 'created_at' | 'updated_at' | 'inventory_consumed'>>
): Promise<DbDrop> {
  // 1. Validar probabilidades totales (solo premios activos)
  const activePrizes = prizesData.filter((p) => p.is_active !== false);
  const totalProb = activePrizes.reduce((sum, p) => sum + Number(p.probability_pct || 0), 0);
  if (totalProb > 100) {
    throw new Error(`La suma de probabilidades de los premios (${totalProb}%) supera el 100%`);
  }

  console.log(`Premios directos: ${totalProb}%`);
  console.log(`Consolación: ${Math.max(0, 100 - totalProb)}%`);

  // 2. Validar solapamientos de fechas con otros Drops activos o programados
  const createStartsAt = dropData.starts_at;
  const createEndsAt = dropData.ends_at;
  const createStatus = dropData.status;

  if (createStartsAt && createEndsAt && ['scheduled', 'active'].includes(createStatus)) {
    const { data: overlappingDrops } = await supabase
      .from('drops')
      .select('id, title, drop_number, starts_at, ends_at, status')
      .in('status', ['scheduled', 'active'])
      .lt('starts_at', createEndsAt)
      .gt('ends_at', createStartsAt);

    if (overlappingDrops && overlappingDrops.length > 0) {
      const conflict = overlappingDrops[0];
      throw new Error(
        `No se permiten solapamientos: Ya existe otro Drop ("${conflict.title}" - DROP #${conflict.drop_number}) activo o programado en el intervalo [${createStartsAt} - ${createEndsAt}].`
      );
    }
  }

  // 3. Normalizar payload para el esquema real de Supabase
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

  // 4. Insertar premios asociados
  if (prizesData.length > 0) {
    const formattedPrizes = prizesData.map((p, idx) => {
      const isShipping = (p.prize_type as string) === 'free_shipping';
      return {
        ...p,
        name: p.name.trim(),
        description: p.description ? p.description.trim() : null,
        prize_type: isShipping ? 'custom' : p.prize_type,
        prize_config: isShipping
          ? { ...(p.prize_config || {}), subtype: 'free_shipping' }
          : p.prize_config || {},
        drop_id: newDrop.id,
        sort_order: idx + 1,
      };
    });

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

  // Validar solapamientos excluyendo explícitamente el propio ID del Drop
  // WHERE id <> p_drop_id AND starts_at < p_ends_at AND ends_at > p_starts_at AND status IN ('scheduled', 'active')
  const updateStartsAt = cleanPayload.starts_at;
  const updateEndsAt = cleanPayload.ends_at;
  const updateStatus = cleanPayload.status;

  if (updateStartsAt && updateEndsAt && ['scheduled', 'active'].includes(updateStatus)) {
    const { data: overlappingDrops } = await supabase
      .from('drops')
      .select('id, title, drop_number, starts_at, ends_at, status')
      .neq('id', dropId)
      .in('status', ['scheduled', 'active'])
      .lt('starts_at', updateEndsAt)
      .gt('ends_at', updateStartsAt);

    if (overlappingDrops && overlappingDrops.length > 0) {
      const conflict = overlappingDrops[0];
      throw new Error(
        `No se permiten solapamientos: Ya existe otro Drop ("${conflict.title}" - DROP #${conflict.drop_number}) activo o programado en el intervalo [${updateStartsAt} - ${updateEndsAt}].`
      );
    }
  }

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
    // Validar suma de probabilidades (solo activos)
    const activePrizes = prizesData.filter((p) => p.is_active !== false);
    const totalProb = activePrizes.reduce((sum, p) => sum + Number(p.probability_pct || 0), 0);
    if (totalProb > 100) {
      throw new Error(`La suma de probabilidades (${totalProb}%) supera el 100%`);
    }

    console.log(`Premios directos: ${totalProb}%`);
    console.log(`Consolación: ${Math.max(0, 100 - totalProb)}%`);

    // 1. Obtener los premios actualmente en base de datos para este Drop
    const { data: rawDbPrizes, error: fetchErr } = await supabase
      .from('drop_prizes')
      .select('*')
      .eq('drop_id', dropId);

    if (fetchErr) {
      console.warn('[Drops] Error consultando premios existentes:', fetchErr.message);
    }

    const unmatchedExisting = [...(rawDbPrizes || [])];

    // 2. Procesar cada premio: UPDATE si ya existe (por ID o por identidad), INSERT si es nuevo
    for (const [idx, p] of prizesData.entries()) {
      const isShipping = (p.prize_type as string) === 'free_shipping';
      const actualType = isShipping ? 'custom' : p.prize_type;
      const actualConfig = isShipping
        ? { ...((p as any).prize_config || {}), subtype: 'free_shipping' }
        : ((p as any).prize_config || {});

      const prizePayload: Record<string, any> = {
        name: p.name.trim(),
        description: p.description ? p.description.trim() : null,
        prize_type: actualType,
        prize_value: Number(p.prize_value) || 0,
        prize_config: actualConfig,
        probability_pct: Number(p.probability_pct) || 0,
        max_inventory:
          p.max_inventory != null && (p.max_inventory as any) !== ''
            ? Number(p.max_inventory)
            : null,
        validity_days:
          p.validity_days != null && (p.validity_days as any) !== ''
            ? Number(p.validity_days)
            : null,
        is_active: p.is_active !== false,
        drop_id: dropId,
        sort_order: idx + 1,
        updated_at: new Date().toISOString(),
      };

      let matchedExistingId: string | null = null;

      // A. Coincidencia por ID explícito enviado desde el formulario
      if ((p as any).id) {
        const foundIdx = unmatchedExisting.findIndex((e) => e.id === (p as any).id);
        if (foundIdx !== -1) {
          matchedExistingId = unmatchedExisting[foundIdx].id;
          unmatchedExisting.splice(foundIdx, 1);
        }
      }

      // B. Si no se especificó ID o no se encontró, buscar coincidencia por nombre y tipo de premio
      if (!matchedExistingId) {
        const normName = p.name.trim().toLowerCase();
        let foundIdx = unmatchedExisting.findIndex(
          (e) => e.name.trim().toLowerCase() === normName && e.prize_type === p.prize_type
        );
        // Si no coincide exactamente por tipo, buscar solo por nombre normalizado
        if (foundIdx === -1) {
          foundIdx = unmatchedExisting.findIndex(
            (e) => e.name.trim().toLowerCase() === normName
          );
        }

        if (foundIdx !== -1) {
          matchedExistingId = unmatchedExisting[foundIdx].id;
          unmatchedExisting.splice(foundIdx, 1);
        }
      }

      // C. UPDATE del premio existente o INSERT de premio nuevo
      if (matchedExistingId) {
        const { error: updErr } = await supabase
          .from('drop_prizes')
          .update(prizePayload)
          .eq('id', matchedExistingId);

        if (updErr) {
          console.error('[Drops] Error actualizando premio existente:', updErr.message);
          throw new Error(`Error actualizando premio "${p.name}": ${updErr.message}`);
        }
      } else {
        const { error: insErr } = await supabase
          .from('drop_prizes')
          .insert([prizePayload]);

        if (insErr) {
          console.error('[Drops] Error insertando nuevo premio:', insErr.message);
          throw new Error(`Error registrando nuevo premio "${p.name}": ${insErr.message}`);
        }
      }
    }

    // 3. Limpiar duplicados o premios desvinculados que no estaban en prizesData
    for (const orphan of unmatchedExisting) {
      // Verificar si algún usuario ya tiene este premio otorgado
      const { count, error: countErr } = await supabase
        .from('user_awarded_prizes')
        .select('id', { count: 'exact', head: true })
        .eq('prize_id', orphan.id);

      if (!countErr && count && count > 0) {
        // Preservar la fila para integridad referencial histórica, pero desactivar y fijar probabilidad a 0
        await supabase
          .from('drop_prizes')
          .update({
            is_active: false,
            probability_pct: 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', orphan.id);
      } else {
        // Duplicado o premio descartado sin usuarios asignados: eliminar de forma segura
        await supabase
          .from('drop_prizes')
          .delete()
          .eq('id', orphan.id);
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

export async function adminUpdateMonthlyDraw(
  drawId: string,
  drawData: Partial<Omit<DbMonthlyDraw, 'id' | 'created_at' | 'updated_at'>>
): Promise<DbMonthlyDraw> {
  const updatePayload: Record<string, any> = {
    ...drawData,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('monthly_draws')
    .update(updatePayload)
    .eq('id', drawId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Error al actualizar el sorteo mensual');
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

