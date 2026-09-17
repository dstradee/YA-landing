// ==============================================================================
// YA DELIVERY - ENDPOINT DE PRUEBA TELEGRAM PARA ADMINISTRADORES
// Archivo: api/admin/test-telegram.ts (Vercel Serverless & Node)
// Protegido con autenticación Supabase y rol 'admin'.
// ==============================================================================

import type { IncomingMessage, ServerResponse } from 'http';
import { getSupabaseServerClient } from '../_lib/paypalServer.js';
import { sendTelegramAdminTestMessage } from '../_lib/telegram.js';

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

export default async function handler(req: RequestLike, res: ResponseLike) {
  // Acepta POST o GET de prueba autenticada
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'POST, GET');
    return sendResponse(res, 405, { error: 'Método no permitido. Utiliza POST o GET.' });
  }

  try {
    const supabase = getSupabaseServerClient();

    // 1. Extraer y validar token de sesión en header Authorization
    const authHeader = (req.headers.authorization || req.headers.Authorization) as string | undefined;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      return sendResponse(res, 401, {
        error: 'No autorizado. Se requiere token Bearer de sesión administrativa.',
      });
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return sendResponse(res, 401, {
        error: 'Sesión inválida o expirada. Inicia sesión nuevamente como administrador.',
      });
    }

    const userId = userData.user.id;

    // 2. Verificar estrictamente que el usuario tenga rol 'admin'
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', userId)
      .maybeSingle();

    if (profile?.role !== 'admin') {
      return sendResponse(res, 403, {
        error: 'Acceso denegado: solo usuarios con rol "admin" pueden ejecutar pruebas de Telegram.',
      });
    }

    // 3. Verificar que las credenciales de entorno existan
    const hasToken = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
    const hasChatId = Boolean(process.env.TELEGRAM_CHAT_ID?.trim());

    if (!hasToken || !hasChatId) {
      return sendResponse(res, 400, {
        error: 'Faltan variables de entorno requeridas en el servidor (TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID).',
        configured: {
          TELEGRAM_BOT_TOKEN: hasToken,
          TELEGRAM_CHAT_ID: hasChatId,
        },
      });
    }

    // 4. Enviar mensaje de prueba a Telegram
    const result = await sendTelegramAdminTestMessage();

    if (!result.success) {
      return sendResponse(res, 502, {
        error: `Fallo al enviar mensaje a Telegram: ${result.error}`,
      });
    }

    return sendResponse(res, 200, {
      success: true,
      message: 'Mensaje de prueba enviado correctamente a Telegram.',
      recipientChatId: process.env.TELEGRAM_CHAT_ID?.trim(),
      telegramResponse: result.details,
    });
  } catch (err: any) {
    console.error('[test-telegram] Error interno:', err);
    return sendResponse(res, 500, {
      error: err?.message || 'Error interno del servidor procesando la prueba de Telegram.',
    });
  }
}
