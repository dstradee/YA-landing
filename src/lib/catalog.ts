import { supabase, isSupabaseConfigured } from './supabase';
import { categories as fallbackCategories, products as fallbackProducts } from '../data/products';
import type { DbCategory, DbProduct, Product, CategorySlug } from '../types/app';

// ==============================================================================
// ADAPTADORES & HELPERS
// Convierte DbCategory y DbProduct de Supabase al modelo amigable del frontend
// ==============================================================================

export type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
  sort_order: number;
  active: boolean;
};

export function adaptCategory(db: DbCategory): CatalogCategory {
  return {
    id: db.id,
    name: db.name,
    slug: db.slug,
    icon: db.icon || '✦',
    description: db.description || '',
    sort_order: db.sort_order ?? 0,
    active: db.active,
  };
}

export function adaptProduct(db: DbProduct, categorySlugMap?: Map<string, string>): Product {
  const categorySlug = (categorySlugMap?.get(db.category_id) || 'mas') as CategorySlug;
  return {
    id: db.id,
    slug: db.slug,
    name: db.name,
    price: Number(db.price),
    estimatedCost: db.estimated_cost ? Number(db.estimated_cost) : Number(db.price) * 0.6,
    category: categorySlug,
    image: db.image || '📦',
    description: db.description || '',
    active: db.active,
    inStock: db.stock_mode === 'in_stock' && (db.stock_quantity === undefined || db.stock_quantity > 0),
    internalInstructions: db.internal_courier_notes || '',
  };
}

// Fallback helpers
function getFallbackCategories(): CatalogCategory[] {
  return fallbackCategories.map((c, i) => ({
    id: c.slug,
    name: c.name,
    slug: c.slug,
    icon: c.icon,
    description: c.description,
    sort_order: i + 1,
    active: true,
  }));
}

// ==============================================================================
// CLIENT ACCESS API (Pública / Cliente)
// Solo campos públicos, segura, con fallback a productos mock si Supabase está vacío
// ==============================================================================

export async function fetchActiveCategories(): Promise<CatalogCategory[]> {
  if (!isSupabaseConfigured) {
    return getFallbackCategories();
  }

  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, slug, description, icon, image, sort_order, active, created_at, updated_at')
      .eq('active', true)
      .order('sort_order', { ascending: true });

    if (error || !data || data.length === 0) {
      return getFallbackCategories();
    }

    return (data as DbCategory[]).map(adaptCategory);
  } catch {
    return getFallbackCategories();
  }
}

export async function fetchActiveProducts(): Promise<Product[]> {
  if (!isSupabaseConfigured) {
    return fallbackProducts;
  }

  try {
    // 1. Obtener mapa categoría ID -> Slug
    const { data: catData } = await supabase
      .from('categories')
      .select('id, slug');

    const catMap = new Map<string, string>();
    if (catData) {
      catData.forEach((c: { id: string; slug: string }) => catMap.set(c.id, c.slug));
    }

    // 2. Obtener productos activos (excluyendo notas internas y costes para el cliente)
    const { data, error } = await supabase
      .from('products')
      .select('id, category_id, name, slug, description, image, price, active, stock_mode, stock_quantity, created_at, updated_at')
      .eq('active', true);

    if (error || !data || data.length === 0) {
      return fallbackProducts;
    }

    return (data as DbProduct[]).map((p) => adaptProduct(p, catMap));
  } catch {
    return fallbackProducts;
  }
}

export async function fetchProductById(idOrSlug: string): Promise<Product | null> {
  // Intentar fallback si no está configurado
  if (!isSupabaseConfigured) {
    return fallbackProducts.find((p) => p.id === idOrSlug || p.slug === idOrSlug) || null;
  }

  try {
    const { data: catData } = await supabase.from('categories').select('id, slug');
    const catMap = new Map<string, string>();
    if (catData) {
      catData.forEach((c: { id: string; slug: string }) => catMap.set(c.id, c.slug));
    }

    // Buscar por ID o por slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

    let query = supabase
      .from('products')
      .select('id, category_id, name, slug, description, image, price, active, stock_mode, stock_quantity, created_at, updated_at')
      .eq('active', true);

    if (isUuid) {
      query = query.eq('id', idOrSlug);
    } else {
      query = query.eq('slug', idOrSlug);
    }

    const { data, error } = await query.maybeSingle();

    if (error || !data) {
      // Fallback a mock si no se encuentra en DB
      return fallbackProducts.find((p) => p.id === idOrSlug || p.slug === idOrSlug) || null;
    }

    return adaptProduct(data as DbProduct, catMap);
  } catch {
    return fallbackProducts.find((p) => p.id === idOrSlug || p.slug === idOrSlug) || null;
  }
}

// ==============================================================================
// REALTIME PREPARATION
// Permite suscribirse a cambios de la base de datos sin recargar la página
// ==============================================================================

export type CatalogUnsubscribe = () => void;

export function subscribeToCatalogChanges(onChange: () => void): CatalogUnsubscribe {
  if (!isSupabaseConfigured || typeof supabase.channel !== 'function') {
    return () => {};
  }

  try {
    const channel = supabase
      .channel('catalog-realtime-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => onChange()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        () => onChange()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  } catch {
    return () => {};
  }
}

// ==============================================================================
// ADMIN API (Operaciones de Administración para Categorías y Productos)
// ==============================================================================

export type AdminCategoryWithCount = DbCategory & {
  product_count: number;
};

export async function adminFetchCategories(): Promise<{ data: AdminCategoryWithCount[] | null; error: string | null }> {
  try {
    const { data: cats, error: catError } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (catError) {
      return { data: null, error: catError.message };
    }

    // Contar productos asociados
    const { data: prods, error: prodError } = await supabase
      .from('products')
      .select('category_id');

    const counts = new Map<string, number>();
    if (!prodError && prods) {
      prods.forEach((p: { category_id: string }) => {
        counts.set(p.category_id, (counts.get(p.category_id) || 0) + 1);
      });
    }

    const enriched = (cats as DbCategory[]).map((c) => ({
      ...c,
      product_count: counts.get(c.id) || 0,
    }));

    return { data: enriched, error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Error desconocido al cargar categorías' };
  }
}

export async function adminCreateCategory(cat: {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  sort_order?: number;
  active: boolean;
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('categories')
      .insert([cat]);

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error al crear categoría' };
  }
}

export async function adminUpdateCategory(
  id: string,
  cat: Partial<DbCategory>
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('categories')
      .update({ ...cat, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error al actualizar categoría' };
  }
}

export async function adminDeleteCategory(id: string): Promise<{ success: boolean; error: string | null }> {
  try {
    // 1. Verificar productos asociados
    const { count, error: countErr } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id);

    if (countErr) return { success: false, error: countErr.message };

    if (count && count > 0) {
      return {
        success: false,
        error: `No se puede eliminar: Esta categoría tiene ${count} producto(s) asociado(s). Desactiva la categoría o mueve/elimina los productos primero.`,
      };
    }

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error al eliminar categoría' };
  }
}

export type AdminProductItem = DbProduct & {
  category_name?: string;
};

export async function adminFetchProducts(): Promise<{ data: AdminProductItem[] | null; error: string | null }> {
  try {
    const { data: prods, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (prodErr) return { data: null, error: prodErr.message };

    const { data: cats } = await supabase.from('categories').select('id, name');
    const catMap = new Map<string, string>();
    if (cats) cats.forEach((c: { id: string; name: string }) => catMap.set(c.id, c.name));

    const enriched = (prods as DbProduct[]).map((p) => ({
      ...p,
      category_name: catMap.get(p.category_id) || 'Sin categoría',
    }));

    return { data: enriched, error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Error al cargar productos' };
  }
}

export async function adminCreateProduct(prod: {
  category_id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  price: number;
  estimated_cost?: number;
  active: boolean;
  stock_mode: 'in_stock' | 'out_of_stock' | 'on_demand';
  stock_quantity?: number;
  internal_courier_notes?: string;
  suggested_purchase_locations?: string;
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('products')
      .insert([prod]);

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error al crear producto' };
  }
}

export async function adminUpdateProduct(
  id: string,
  prod: Partial<DbProduct>
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('products')
      .update({ ...prod, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error al actualizar producto' };
  }
}

export async function adminDeleteProduct(id: string): Promise<{ success: boolean; error: string | null }> {
  try {
    // Para no romper órdenes históricas que referencien este producto, comprobamos order_items
    const { count, error: countErr } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', id);

    if (countErr) return { success: false, error: countErr.message };

    if (count && count > 0) {
      // Si tiene pedidos, procedemos a desactivarlo con aviso seguro
      const { error: deactErr } = await supabase
        .from('products')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (deactErr) return { success: false, error: deactErr.message };
      return {
        success: true,
        error: 'El producto ha sido desactivado en lugar de borrado para preservar el historial de pedidos anteriores.',
      };
    }

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Error al eliminar producto' };
  }
}
