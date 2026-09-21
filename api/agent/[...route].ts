import type { VercelRequest, VercelResponse } from '../_lib/types.ts';
import { requireAgentAuth } from './auth.ts';
import {
  AgentServiceError,
  AgentValidationError,
  adjustStock,
  batchProducts,
  createProduct,
  getProduct,
  listCategories,
  listProducts,
  updateProduct,
  uploadMedia
} from './catalog.ts';

function parts(req: VercelRequest): string[] {
  const value = req.query?.route;
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value) return value.split('/').filter(Boolean);
  return [];
}

function queryString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function queryBoolean(value: string | string[] | undefined, field: string): boolean | undefined {
  const raw = queryString(value);
  if (raw === undefined) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new AgentValidationError(field + ' debe ser true o false.');
}

function queryInteger(
  value: string | string[] | undefined,
  field: string,
  fallback: number,
  min: number,
  max?: number
): number {
  const raw = queryString(value);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    throw new AgentValidationError(field + ' no tiene un valor válido.');
  }
  return parsed;
}

function sendError(res: VercelResponse, error: unknown) {
  if (error instanceof AgentValidationError) {
    return res.status(error.status).json({ error: error.message });
  }

  if (error instanceof AgentServiceError) {
    return res.status(error.status).json({ error: error.message });
  }

  console.error('[YA Agent] unhandled error', JSON.stringify({
    name: error instanceof Error ? error.name : 'UnknownError'
  }));
  return res.status(500).json({ error: 'Internal Server Error' });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAgentAuth(req, res)) return;

  const route = parts(req);

  try {
    if (route[0] === 'products' && route.length === 1) {
      if (req.method === 'GET') {
        const data = await listProducts({
          query: queryString(req.query.q),
          categoryId: queryString(req.query.category_id),
          active: queryBoolean(req.query.active, 'active'),
          stockMode: queryString(req.query.stock_mode) as any,
          limit: queryInteger(req.query.limit, 'limit', 50, 1, 100),
          offset: queryInteger(req.query.offset, 'offset', 0, 0)
        });
        return res.status(200).json({ success: true, ...data });
      }

      if (req.method === 'POST') {
        const data = await createProduct(req.body);
        return res.status(201).json({ success: true, product: data });
      }

      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (route[0] === 'products' && route[1] === 'batch' && route.length === 2) {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
      const data = await batchProducts(req.body);
      return res.status(200).json({ success: true, ...data });
    }

    if (route[0] === 'products' && route[1] && route[2] === 'stock' && route.length === 3) {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
      const data = await adjustStock(route[1], req.body);
      return res.status(200).json({ success: true, product: data });
    }

    if (route[0] === 'products' && route[1] && route.length === 2) {
      if (req.method === 'GET') {
        const data = await getProduct(route[1]);
        return res.status(200).json({ success: true, product: data });
      }

      if (req.method === 'PATCH') {
        const data = await updateProduct(route[1], req.body);
        return res.status(200).json({ success: true, product: data });
      }

      if (req.method === 'DELETE') {
        return res.status(405).json({ error: 'Method Not Allowed' });
      }

      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (route[0] === 'categories' && route.length === 1) {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
      const data = await listCategories();
      return res.status(200).json({ success: true, categories: data });
    }

    if (route[0] === 'media' && route[1] === 'upload' && route.length === 2) {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
      const data = await uploadMedia(req.body);
      return res.status(200).json({ success: true, ...data });
    }

    return res.status(404).json({ error: 'Not Found' });
  } catch (error) {
    return sendError(res, error);
  }
}
