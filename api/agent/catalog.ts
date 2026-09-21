import type { ProductVariant, StockMode } from '../../src/types/app.ts';
import { getSupabaseServerClient } from '../_lib/paypalServer.ts';
import { getOptimizedImageUrl, uploadImageToCloudinary } from '../../src/lib/cloudinary.ts';

const STOCK_MODES: StockMode[] = ['in_stock', 'out_of_stock', 'on_demand'];

export class AgentValidationError extends Error {
  status = 400;
}

export class AgentServiceError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function text(value: unknown, field: string, required = false): string | undefined {
  if (value === undefined || value === null) {
    if (required) throw new AgentValidationError(field + ' es obligatorio.');
    return undefined;
  }
  if (typeof value !== 'string') throw new AgentValidationError(field + ' debe ser texto.');
  const result = value.trim();
  if (required && !result) throw new AgentValidationError(field + ' es obligatorio.');
  return result;
}

function numberValue(
  value: unknown,
  field: string,
  options: { integer?: boolean; min?: number } = {}
): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AgentValidationError(field + ' debe ser un número válido.');
  }
  if (options.integer && !Number.isInteger(value)) {
    throw new AgentValidationError(field + ' debe ser un número entero.');
  }
  if (options.min !== undefined && value < options.min) {
    throw new AgentValidationError(field + ' no puede ser menor que ' + options.min + '.');
  }
  return value;
}

function booleanValue(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new AgentValidationError(field + ' debe ser booleano.');
  return value;
}

function stringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new AgentValidationError(field + ' debe ser un array de textos.');
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function variantsValue(value: unknown): ProductVariant[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value)) throw new AgentValidationError('variants debe ser un array.');

  return value.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new AgentValidationError('variants[' + index + '] debe ser un objeto.');
    }
    const v = raw as Record<string, unknown>;
    const id = text(v.id, 'variants[' + index + '].id', true)!;
    const name = text(v.name, 'variants[' + index + '].name', true)!;
    const price = numberValue(v.price, 'variants[' + index + '].price', { min: 0 });
    const stock = numberValue(v.stock, 'variants[' + index + '].stock', { integer: true, min: 0 });
    const active = booleanValue(v.active, 'variants[' + index + '].active');
    const image = v.image === null ? null : text(v.image, 'variants[' + index + '].image');
    const sku = v.sku === null ? null : text(v.sku, 'variants[' + index + '].sku');

    if (price === undefined || stock === undefined || active === undefined) {
      throw new AgentValidationError('Cada variante requiere id, name, price, stock y active.');
    }

    return { id, name, price, stock, active, image, sku };
  });
}

const PRODUCT_FIELDS = new Set([
  'name', 'description', 'category_id', 'image', 'images', 'price', 'estimated_cost',
  'active', 'stock_mode', 'stock_quantity', 'min_stock', 'internal_courier_notes',
  'suggested_purchase_locations', 'has_variants', 'variants_title', 'variants'
]);

function productPayload(body: unknown, mode: 'create' | 'patch') {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AgentValidationError('El body debe ser un objeto JSON.');
  }

  const input = body as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!PRODUCT_FIELDS.has(key)) {
      throw new AgentValidationError('Campo no permitido: ' + key + '.');
    }
  }

  const categoryId = text(input.category_id, 'category_id', mode === 'create');
  if (categoryId && !isUuid(categoryId)) {
    throw new AgentValidationError('category_id debe ser un UUID válido.');
  }

  const stockMode = input.stock_mode === undefined || input.stock_mode === null
    ? undefined
    : text(input.stock_mode, 'stock_mode');

  if (stockMode && !STOCK_MODES.includes(stockMode as StockMode)) {
    throw new AgentValidationError('stock_mode no es válido.');
  }

  const price = numberValue(input.price, 'price', { min: 0 });
  if (mode === 'create' && price === undefined) {
    throw new AgentValidationError('price es obligatorio.');
  }

  return {
    name: text(input.name, 'name', mode === 'create'),
    description: text(input.description, 'description'),
    category_id: categoryId,
    image: text(input.image, 'image'),
    images: stringArray(input.images, 'images'),
    price,
    estimated_cost: numberValue(input.estimated_cost, 'estimated_cost', { min: 0 }),
    active: booleanValue(input.active, 'active'),
    stock_mode: stockMode as StockMode | undefined,
    stock_quantity: numberValue(input.stock_quantity, 'stock_quantity', { integer: true, min: 0 }),
    min_stock: numberValue(input.min_stock, 'min_stock', { integer: true, min: 0 }),
    internal_courier_notes: text(input.internal_courier_notes, 'internal_courier_notes'),
    suggested_purchase_locations: text(input.suggested_purchase_locations, 'suggested_purchase_locations'),
    has_variants: booleanValue(input.has_variants, 'has_variants'),
    variants_title: input.variants_title === null ? null : text(input.variants_title, 'variants_title'),
    variants: variantsValue(input.variants)
  };
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[\s\W-]+/g, '-').replace(/^-+|-+$/g, '');
}

async function uniqueSlug(name: string, excludeId?: string): Promise<string> {
  const supabase = getSupabaseServerClient();
  const base = slugify(name) || 'producto';

  for (let suffix = 0; suffix <= 1000; suffix += 1) {
    const candidate = suffix === 0 ? base : base + '-' + (suffix + 1);
    let query = supabase.from('products').select('id').eq('slug', candidate).limit(1);
    if (excludeId) query = query.neq('id', excludeId);
    const { data, error } = await query;
    if (error) throw new AgentServiceError('No se pudo comprobar la unicidad del slug.');
    if (!data || data.length === 0) return candidate;
  }

  throw new AgentServiceError('No se pudo generar un slug único.');
}

async function ensureCategory(categoryId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, active')
    .eq('id', categoryId)
    .maybeSingle();

  if (error) throw new AgentServiceError('No se pudo validar la categoría.');
  if (!data) throw new AgentValidationError('La categoría indicada no existe.');
  return data;
}

function safeImage(url: string | undefined): string | null | undefined {
  return url === undefined ? undefined : (url ? getOptimizedImageUrl(url) : null);
}

export async function listProducts(params: {
  query?: string;
  categoryId?: string;
  active?: boolean;
  stockMode?: StockMode;
  limit: number;
  offset: number;
}) {
  const supabase = getSupabaseServerClient();
  let query = supabase.from('products').select('*', { count: 'exact' }).order('created_at', { ascending: false });

  if (params.query) {
    const safeQuery = params.query.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ _-]/g, ' ').trim();
    if (safeQuery) query = query.ilike('name', '%' + safeQuery + '%');
  }
  if (params.categoryId) {
    if (!isUuid(params.categoryId)) throw new AgentValidationError('category_id debe ser un UUID válido.');
    query = query.eq('category_id', params.categoryId);
  }
  if (params.active !== undefined) query = query.eq('active', params.active);
  if (params.stockMode) {
    if (!STOCK_MODES.includes(params.stockMode)) throw new AgentValidationError('stock_mode no es válido.');
    query = query.eq('stock_mode', params.stockMode);
  }

  query = query.range(params.offset, params.offset + params.limit - 1);
  const { data, error, count } = await query;
  if (error) throw new AgentServiceError('No se pudieron obtener los productos.');
  return { items: data ?? [], total: count ?? 0, limit: params.limit, offset: params.offset };
}

export async function getProduct(idOrSlug: string) {
  const supabase = getSupabaseServerClient();
  const column = isUuid(idOrSlug) ? 'id' : 'slug';
  const { data, error } = await supabase.from('products').select('*').eq(column, idOrSlug).maybeSingle();

  if (error) throw new AgentServiceError('No se pudo obtener el producto.');
  if (!data) throw new AgentServiceError('Producto no encontrado.', 404);
  return data;
}

export async function createProduct(body: unknown) {
  const payload = productPayload(body, 'create');
  const category = await ensureCategory(payload.category_id!);
  const slug = await uniqueSlug(payload.name!);

  const product = {
    category_id: payload.category_id,
    name: payload.name,
    slug,
    description: payload.description ?? null,
    image: safeImage(payload.image),
    images: payload.images?.map((url) => getOptimizedImageUrl(url)) ?? [],
    price: payload.price,
    estimated_cost: payload.estimated_cost ?? null,
    active: false,
    stock_mode: payload.stock_mode ?? 'in_stock',
    stock_quantity: payload.stock_quantity ?? 0,
    min_stock: payload.min_stock ?? 5,
    internal_courier_notes: payload.internal_courier_notes ?? null,
    suggested_purchase_locations: payload.suggested_purchase_locations ?? null,
    has_variants: payload.has_variants ?? false,
    variants_title: payload.variants_title ?? null,
    variants: payload.variants ?? null
  };

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('products').insert(product).select('*').single();
  if (error) throw new AgentServiceError('No se pudo crear el producto.');

  console.log('[YA Agent]', JSON.stringify({ action: 'product.create', productId: data.id, categoryId: category.id }));
  return data;
}

export async function updateProduct(id: string, body: unknown) {
  if (!isUuid(id)) throw new AgentValidationError('El id del producto debe ser un UUID válido.');

  const payload = productPayload(body, 'patch');
  const existing = await getProduct(id);
  const update: Record<string, unknown> = {};

  if (payload.name !== undefined) update.name = payload.name;
  if (payload.description !== undefined) update.description = payload.description;
  if (payload.category_id !== undefined) {
    await ensureCategory(payload.category_id);
    update.category_id = payload.category_id;
  }
  if (payload.image !== undefined) update.image = safeImage(payload.image);
  if (payload.images !== undefined) update.images = payload.images.map((url) => getOptimizedImageUrl(url));
  if (payload.price !== undefined) update.price = payload.price;
  if (payload.estimated_cost !== undefined) update.estimated_cost = payload.estimated_cost;
  if (payload.active !== undefined) update.active = payload.active;
  if (payload.stock_mode !== undefined) update.stock_mode = payload.stock_mode;
  if (payload.stock_quantity !== undefined) update.stock_quantity = payload.stock_quantity;
  if (payload.min_stock !== undefined) update.min_stock = payload.min_stock;
  if (payload.internal_courier_notes !== undefined) update.internal_courier_notes = payload.internal_courier_notes;
  if (payload.suggested_purchase_locations !== undefined) update.suggested_purchase_locations = payload.suggested_purchase_locations;
  if (payload.has_variants !== undefined) update.has_variants = payload.has_variants;
  if (payload.variants_title !== undefined) update.variants_title = payload.variants_title;
  if (payload.variants !== undefined) update.variants = payload.variants;

  if (Object.keys(update).length === 0) {
    throw new AgentValidationError('No se enviaron campos para actualizar.');
  }

  if (payload.name !== undefined && payload.name !== existing.name) {
    update.slug = await uniqueSlug(payload.name, id);
  }

  update.updated_at = new Date().toISOString();

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('products').update(update).eq('id', id).select('*').single();
  if (error) throw new AgentServiceError('No se pudo actualizar el producto.');

  console.log('[YA Agent]', JSON.stringify({
    action: 'product.update',
    productId: id,
    fields: Object.keys(update).filter((field) => field !== 'updated_at')
  }));
  return data;
}

export async function adjustStock(id: string, body: unknown) {
  if (!isUuid(id)) throw new AgentValidationError('El id del producto debe ser un UUID válido.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AgentValidationError('El body debe ser un objeto JSON.');
  }

  const input = body as Record<string, unknown>;
  const allowed = new Set(['type', 'quantity', 'reason', 'new_stock', 'mode']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new AgentValidationError('Campo no permitido: ' + key + '.');
  }

  const type = text(input.type, 'type');
  const quantity = numberValue(input.quantity, 'quantity', { integer: true });
  const reason = text(input.reason, 'reason');
  const newStock = numberValue(input.new_stock, 'new_stock', { integer: true, min: 0 });
  const mode = text(input.mode, 'mode');

  if (!type || !['entry', 'adjustment', 'loss'].includes(type)) {
    throw new AgentValidationError('type debe ser entry, adjustment o loss.');
  }
  if (type === 'entry' && (!quantity || quantity <= 0)) {
    throw new AgentValidationError('quantity debe ser mayor que 0 para entry.');
  }
  if (type === 'loss' && (!quantity || quantity <= 0)) {
    throw new AgentValidationError('quantity debe ser mayor que 0 para loss.');
  }
  if (type === 'adjustment' && quantity === undefined && newStock === undefined) {
    throw new AgentValidationError('adjustment requiere quantity o new_stock.');
  }
  if (mode && !STOCK_MODES.includes(mode as StockMode)) {
    throw new AgentValidationError('mode no es válido.');
  }

  const current = await getProduct(id);
  let nextStock = current.stock_quantity;
  let delta = 0;

  if (type === 'entry') {
    delta = quantity!;
    nextStock += delta;
  } else if (type === 'loss') {
    delta = -quantity!;
    nextStock += delta;
  } else {
    nextStock = newStock !== undefined ? newStock : nextStock + quantity!;
    delta = nextStock - current.stock_quantity;
  }

  if (nextStock < 0) throw new AgentValidationError('El stock no puede ser negativo.');

  let nextMode: StockMode = (mode as StockMode | undefined) ?? current.stock_mode;
  if (!mode && current.stock_mode === 'in_stock' && nextStock === 0) nextMode = 'out_of_stock';
  if (!mode && current.stock_mode === 'out_of_stock' && nextStock > 0) nextMode = 'in_stock';

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('products')
    .update({
      stock_quantity: nextStock,
      stock_mode: nextMode,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new AgentServiceError('No se pudo actualizar el stock.');

  const movementType = type;
  const { error: movementError } = await supabase.from('stock_movements').insert({
    product_id: id,
    movement_type: movementType,
    quantity: delta,
    previous_stock: current.stock_quantity,
    new_stock: nextStock,
    reason: reason || 'Ajuste desde YA Agent'
  });

  if (movementError) {
    console.warn('[YA Agent] stock movement insert failed', JSON.stringify({ productId: id }));
  }

  console.log('[YA Agent]', JSON.stringify({
    action: 'product.stock',
    productId: id,
    movementType,
    delta,
    newStock: nextStock,
    mode: nextMode
  }));
  return data;
}

export async function listCategories() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, description, icon, image, sort_order, active')
    .order('sort_order', { ascending: true });

  if (error) throw new AgentServiceError('No se pudieron obtener las categorías.');
  return data ?? [];
}

function isBlockedRemoteHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal') return true;
  if (host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true;
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const match = host.match(/^172\.(\d{1,3})\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  return false;
}

export async function uploadMedia(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AgentValidationError('El body debe ser un objeto JSON.');
  }

  const input = body as Record<string, unknown>;
  const allowed = new Set(['source_url', 'file_base64', 'mime_type', 'folder']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new AgentValidationError('Campo no permitido: ' + key + '.');
  }

  const sourceUrl = text(input.source_url, 'source_url');
  const base64 = text(input.file_base64, 'file_base64');
  const mimeType = text(input.mime_type, 'mime_type') || 'image/jpeg';
  const folder = text(input.folder, 'folder') || 'ya_delivery';

  if ((!sourceUrl && !base64) || (sourceUrl && base64)) {
    throw new AgentValidationError('Debes enviar exactamente una fuente de imagen.');
  }
  if (!/^image\/[a-z0-9.+-]+$/i.test(mimeType)) {
    throw new AgentValidationError('mime_type no es un tipo de imagen válido.');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(folder)) {
    throw new AgentValidationError('folder contiene caracteres no permitidos.');
  }

  let file: File;

  if (sourceUrl) {
    let parsed: URL;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      throw new AgentValidationError('source_url no es una URL válida.');
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedRemoteHost(parsed.hostname)) {
      throw new AgentValidationError('source_url no es una fuente permitida.');
    }

    const response = await fetch(parsed.toString());
    if (!response.ok) throw new AgentServiceError('No se pudo descargar la imagen externa.', 422);

    const contentType = response.headers.get('content-type') || mimeType;
    if (!contentType.toLowerCase().startsWith('image/')) {
      throw new AgentValidationError('La URL externa no devuelve una imagen.');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 5 * 1024 * 1024) {
      throw new AgentValidationError('La imagen supera el límite de 5 MB.');
    }

    const extension = contentType.split('/')[1]?.split(';')[0] || 'jpg';
    file = new File([buffer], 'agent-upload.' + extension, { type: contentType });
  } else {
    const compact = base64!.replace(/^data:image\/[^;]+;base64,/i, '').replace(/\s/g, '');
    if (!compact || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
      throw new AgentValidationError('file_base64 no es válido.');
    }

    const buffer = Buffer.from(compact, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      throw new AgentValidationError('La imagen supera el límite de 5 MB.');
    }

    const extension = mimeType.split('/')[1].replace(/[^a-z0-9]/gi, '') || 'jpg';
    file = new File([buffer], 'agent-upload.' + extension, { type: mimeType });
  }

  const result = await uploadImageToCloudinary(file, folder);
  if (!result.url) throw new AgentServiceError('Cloudinary no pudo subir la imagen.', 502);

  console.log('[YA Agent]', JSON.stringify({ action: 'media.upload', source: sourceUrl ? 'url' : 'base64', folder }));
  return { url: getOptimizedImageUrl(result.url) };
}

export async function batchProducts(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AgentValidationError('El body debe ser un objeto JSON.');
  }

  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'items')) {
    throw new AgentValidationError('Solo se permite el campo items.');
  }
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 100) {
    throw new AgentValidationError('items debe contener entre 1 y 100 elementos.');
  }

  const results: Array<Record<string, unknown>> = [];

  for (let index = 0; index < input.items.length; index += 1) {
    try {
      const item = input.items[index];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new AgentValidationError('Cada item debe ser un objeto.');
      }

      const record = item as Record<string, unknown>;
      if (record.id !== undefined) {
        if (typeof record.id !== 'string' || !isUuid(record.id)) {
          throw new AgentValidationError('id debe ser un UUID válido.');
        }
        const patch = { ...record };
        delete patch.id;
        results.push({ index, success: true, product: await updateProduct(record.id, patch) });
      } else {
        results.push({ index, success: true, product: await createProduct(record) });
      }
    } catch (error) {
      results.push({
        index,
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }

  console.log('[YA Agent]', JSON.stringify({
    action: 'product.batch',
    count: input.items.length,
    succeeded: results.filter((item) => item.success).length
  }));
  return { results };
}
