// ==============================================================================
// YA DELIVERY - SERVER-SIDE API: MODO PRUEBA DE DROPS (EXCLUSIVO ADMIN)
// Archivo: api/admin/test-play-drop.ts
// ==============================================================================
// Permite al Administrador simular y probar la experiencia de juego real de
// cualquier Drop (Jackpot, Rasca y Gana, etc.) sin consumir intentos, sin
// alterar stock de premios, sin crear pedidos ni modificar datos de producción.
// ==============================================================================

import type { IncomingMessage, ServerResponse } from 'http';
import { getSupabaseServerClient } from '../_lib/paypalServer.js';

interface RequestLike extends IncomingMessage {
  body?: any;
  query?: Record<string, any>;
  headers: Record<string, string | string[] | undefined>;
}

interface ResponseLike extends ServerResponse {
  status: (code: number) => ResponseLike;
  json: (data: any) => void;
}

function sendResponse(res: ResponseLike, status: number, data: any) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function parseJsonBody(req: RequestLike): Promise<any> {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: string | Buffer) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendResponse(res, 405, { error: 'Método no permitido. Utiliza POST.' });
  }

  try {
    const supabase = getSupabaseServerClient();

    // 1. Extraer y verificar token de autenticación
    const authHeader = (req.headers.authorization || req.headers.Authorization) as string | undefined;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      return sendResponse(res, 401, { error: 'No autorizado. Se requiere token de sesión de administrador.' });
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return sendResponse(res, 401, { error: 'Sesión inválida o expirada.' });
    }

    const userId = userData.user.id;

    // 2. Verificar rol Admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (profile?.role !== 'admin') {
      return sendResponse(res, 403, {
        error: 'Acceso denegado: solo usuarios con rol administrador pueden probar Drops.',
      });
    }

    // 3. Obtener dropId
    const body = await parseJsonBody(req);
    const dropId = body.dropId || body.p_drop_id || req.query?.dropId;

    if (!dropId) {
      return sendResponse(res, 400, { error: 'Parámetro requerido faltante: dropId.' });
    }

    // 4. Obtener información del Drop (sin importar status, fechas o trigger)
    const { data: drop, error: dropErr } = await supabase
      .from('drops')
      .select('*')
      .eq('id', dropId)
      .single();

    if (dropErr || !drop) {
      return sendResponse(res, 404, { error: 'Drop no encontrado.' });
    }

    // 5. Obtener premios activos del Drop
    const { data: rawPrizes, error: prizesErr } = await supabase
      .from('drop_prizes')
      .select('*')
      .eq('drop_id', dropId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (prizesErr) {
      return sendResponse(res, 500, { error: `Error al cargar premios del Drop: ${prizesErr.message}` });
    }

    if (!rawPrizes || rawPrizes.length === 0) {
      return sendResponse(res, 400, {
        error: 'El Drop no tiene premios activos configurados. Añade al menos un premio para poder probar el juego.',
      });
    }

    // 6. Simulación autoritativa utilizando la configuración real de probabilidades
    // Filtramos premios con probabilidad > 0
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

    // 7. Respuesta estructurada identificada inequívocamente como modo prueba
    // AISLAMIENTO TOTAL: NO se crea registro en drop_attempts, user_awarded_prizes,
    // monthly_draw_entries ni se descuenta inventario real.
    const result = {
      success: true,
      is_test_mode: true,
      outcome: wonPrize ? 'won_prize' : 'consolation_reward',
      attempt_id: `test_sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      prize_id: wonPrize?.id || null,
      prize: wonPrize
        ? {
            id: wonPrize.id,
            name: wonPrize.name,
            description: wonPrize.description,
            prize_type: wonPrize.prize_type,
            prize_value: Number(wonPrize.prize_value || 0),
            prize_config: wonPrize.prize_config || {},
            validity_days: validityDays,
            expires_at: expiresAt,
          }
        : undefined,
      consolation_type: drop.consolation_reward_type || 'monthly_draw_entry',
      consolation_config: drop.consolation_config || { entries_count: 1 },
      metadata: {
        simulated_at: new Date().toISOString(),
        rand_value: Number(rand.toFixed(4)),
        total_prizes_tested: activePrizes.length,
        game_key: drop.game_key || drop.game_type || 'jackpot',
      },
    };

    return sendResponse(res, 200, result);
  } catch (err: any) {
    console.error('[API test-play-drop] Error:', err);
    return sendResponse(res, 500, { error: err.message || 'Error interno al simular el juego del Drop.' });
  }
}
