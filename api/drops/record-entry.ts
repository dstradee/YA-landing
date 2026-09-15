// ==============================================================================
// YA DELIVERY - SERVER-SIDE RPC / HANDLER PARA REGISTRAR ENTRADA DE SORTEO MENSUAL
// Archivo: api/drops/record-entry.ts
// ==============================================================================

import { getSupabaseServerClient } from '../_lib/paypalServer.js';

interface RequestBody {
  drawId?: string;
  userId?: string;
  dropId?: string;
  orderId?: string;
  entriesCount?: number;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido. Utilice POST.' });
  }

  try {
    const body: RequestBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { drawId, userId, dropId, orderId, entriesCount = 1 } = body;

    if (!drawId || !userId) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos: drawId y userId.' });
    }

    const supabase = getSupabaseServerClient();

    // Comprobar que el sorteo existe
    const { data: draw, error: drawErr } = await supabase
      .from('monthly_draws')
      .select('id, title, status')
      .eq('id', drawId)
      .single();

    if (drawErr || !draw) {
      return res.status(404).json({ error: 'Sorteo mensual no encontrado.' });
    }

    const count = Math.max(1, Math.min(10, Number(entriesCount) || 1));
    const entries = Array.from({ length: count }, () => ({
      draw_id: drawId,
      user_id: userId,
      source: 'drop',
      drop_id: dropId || null,
      order_id: orderId || null,
    }));

    const { error: insertErr } = await supabase
      .from('monthly_draw_entries')
      .insert(entries);

    if (insertErr) {
      console.error('[Drops API] Error insertando participación:', insertErr);
      return res.status(500).json({ error: insertErr.message });
    }

    // Obtener recuentos actualizados
    const { count: userTotal } = await supabase
      .from('monthly_draw_entries')
      .select('*', { count: 'exact', head: true })
      .eq('draw_id', drawId)
      .eq('user_id', userId);

    const { count: globalTotal } = await supabase
      .from('monthly_draw_entries')
      .select('*', { count: 'exact', head: true })
      .eq('draw_id', drawId);

    return res.status(200).json({
      success: true,
      draw_id: drawId,
      draw_title: draw.title,
      entries_awarded: count,
      user_entries_count: userTotal || count,
      total_entries_count: globalTotal || count,
    });
  } catch (err: any) {
    console.error('[Drops API] Excepción al registrar participación:', err);
    return res.status(500).json({ error: err.message || 'Error interno del servidor.' });
  }
}
