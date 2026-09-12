// ==============================================================================
// YA - GESTIÓN DE PACKS (PHASE 3B)
// Archivo: src/lib/adminPacks.ts
// ==============================================================================

import { supabase, isSupabaseConfigured } from './supabase';
import type { DbPack, PackWithDetails } from '../types/app';

const STORAGE_KEY = 'ya_packs_local';

// Semillas iniciales locales para desarrollo/offline
const INITIAL_LOCAL_PACKS: PackWithDetails[] = [
  {
    id: 'pack-noche-jerez',
    name: 'PACK NOCHE',
    slug: 'pack-noche',
    description: 'El combo definitivo para aguantar toda la noche en Jerez: 2 Red Bull, 1 Doritos Tex-Mex, 1 Coca-Cola 2L y 1 Bolsa de hielo 2kg.',
    image: '🌙',
    pack_type: 'fixed',
    price: 14.9,
    reference_price: 17.65,
    active: true,
    sort_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    items: [
      {
        id: 'pi-1',
        pack_id: 'pack-noche-jerez',
        product_id: 'red-bull',
        quantity: 2,
        sort_order: 1,
        created_at: new Date().toISOString(),
      },
      {
        id: 'pi-2',
        pack_id: 'pack-noche-jerez',
        product_id: 'doritos-tex-mex',
        quantity: 1,
        sort_order: 2,
        created_at: new Date().toISOString(),
      },
      {
        id: 'pi-3',
        pack_id: 'pack-noche-jerez',
        product_id: 'coca-cola',
        quantity: 1,
        sort_order: 3,
        created_at: new Date().toISOString(),
      },
      {
        id: 'pi-4',
        pack_id: 'pack-noche-jerez',
        product_id: 'bolsa-hielo',
        quantity: 1,
        sort_order: 4,
        created_at: new Date().toISOString(),
      },
    ],
  },
  {
    id: 'pack-mix-configurable',
    name: 'PACK MIX YA',
    slug: 'pack-mix-ya',
    description: 'Configura tu combinación favorita: elige 1 energética, 1 snack salado y 1 dulce con un precio cerrado especial.',
    image: '⚡',
    pack_type: 'configurable',
    price: 13.5,
    reference_price: 15.8,
    active: true,
    sort_order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    groups: [
      {
        id: 'group-energetica',
        pack_id: 'pack-mix-configurable',
        name: 'Elige tu energética',
        description: 'Selecciona 1 bebida energética (250ml / 500ml)',
        min_select: 1,
        max_select: 1,
        sort_order: 1,
        created_at: new Date().toISOString(),
        options: [
          {
            id: 'opt-rb',
            group_id: 'group-energetica',
            product_id: 'red-bull',
            default_selected: true,
            sort_order: 1,
            created_at: new Date().toISOString(),
          },
          {
            id: 'opt-monster',
            group_id: 'group-energetica',
            product_id: 'monster-energy',
            default_selected: false,
            sort_order: 2,
            created_at: new Date().toISOString(),
          },
        ],
      },
      {
        id: 'group-snack',
        pack_id: 'pack-mix-configurable',
        name: 'Elige tu snack',
        description: 'Selecciona 1 snack salado para picar',
        min_select: 1,
        max_select: 1,
        sort_order: 2,
        created_at: new Date().toISOString(),
        options: [
          {
            id: 'opt-doritos',
            group_id: 'group-snack',
            product_id: 'doritos-tex-mex',
            default_selected: true,
            sort_order: 1,
            created_at: new Date().toISOString(),
          },
          {
            id: 'opt-lays',
            group_id: 'group-snack',
            product_id: 'lays-campesinas',
            default_selected: false,
            sort_order: 2,
            created_at: new Date().toISOString(),
          },
          {
            id: 'opt-pringles',
            group_id: 'group-snack',
            product_id: 'pringles-original',
            default_selected: false,
            sort_order: 3,
            created_at: new Date().toISOString(),
          },
        ],
      },
      {
        id: 'group-dulce',
        pack_id: 'pack-mix-configurable',
        name: 'Elige tu dulce',
        description: 'Selecciona 1 dulce o chocolate',
        min_select: 1,
        max_select: 1,
        sort_order: 3,
        created_at: new Date().toISOString(),
        options: [
          {
            id: 'opt-kitkat',
            group_id: 'group-dulce',
            product_id: 'kitkat',
            default_selected: true,
            sort_order: 1,
            created_at: new Date().toISOString(),
          },
          {
            id: 'opt-oreo',
            group_id: 'group-dulce',
            product_id: 'oreo',
            default_selected: false,
            sort_order: 2,
            created_at: new Date().toISOString(),
          },
        ],
      },
    ],
  },
];

function getStoredLocalPacks(): PackWithDetails[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data);
  } catch {
    // Ignore
  }
  return INITIAL_LOCAL_PACKS;
}

function saveStoredLocalPacks(items: PackWithDetails[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore
  }
}

/**
 * Obtiene todos los packs con su detalle relacional completo
 */
export async function fetchPacks(): Promise<PackWithDetails[]> {
  if (isSupabaseConfigured) {
    try {
      const { data: packsData, error: packsError } = await supabase
        .from('packs')
        .select(`
          *,
          items:pack_items(
            *,
            product:products(*)
          ),
          groups:pack_groups(
            *,
            options:pack_group_options(
              *,
              product:products(*)
            )
          )
        `)
        .order('sort_order', { ascending: true });

      if (!packsError && packsData) {
        return packsData.map((p: any) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          description: p.description,
          image: p.image,
          pack_type: p.pack_type,
          price: Number(p.price),
          reference_price: p.reference_price ? Number(p.reference_price) : null,
          active: Boolean(p.active),
          sort_order: p.sort_order ?? 0,
          created_at: p.created_at,
          updated_at: p.updated_at,
          items: p.items || [],
          groups: p.groups || [],
        }));
      }
    } catch {
      // Fallback
    }
  }

  return getStoredLocalPacks();
}

/**
 * Obtiene packs activos para catálogo público
 */
export async function fetchActivePacks(): Promise<PackWithDetails[]> {
  const all = await fetchPacks();
  return all.filter((p) => p.active);
}

/**
 * Obtiene un pack por slug
 */
export async function fetchPackBySlug(slug: string): Promise<PackWithDetails | null> {
  const all = await fetchPacks();
  return all.find((p) => p.slug === slug || p.id === slug) || null;
}

/**
 * Crea un nuevo pack con su estructura relacional (Admin)
 */
export async function createPack(params: {
  pack: Omit<DbPack, 'id' | 'created_at' | 'updated_at'>;
  items?: { product_id: string; quantity: number; sort_order?: number }[];
  groups?: {
    name: string;
    description?: string;
    min_select: number;
    max_select: number;
    sort_order?: number;
    options: { product_id: string; default_selected?: boolean; sort_order?: number; price_supplement?: number }[];
  }[];
}): Promise<{ success: boolean; data?: PackWithDetails; error?: string }> {
  const { pack, items = [], groups = [] } = params;

  if (isSupabaseConfigured) {
    try {
      // 1. Insertar pack
      const { data: newPack, error: packErr } = await supabase
        .from('packs')
        .insert({
          name: pack.name,
          slug: pack.slug,
          description: pack.description,
          image: pack.image,
          images: pack.images || (pack.image ? [pack.image] : []),
          pack_type: pack.pack_type,
          price: Number(pack.price),
          reference_price: pack.reference_price ? Number(pack.reference_price) : null,
          active: pack.active,
          sort_order: pack.sort_order ?? 0,
          free_shipping: Boolean(pack.free_shipping),
          skip_min_order: Boolean(pack.skip_min_order),
        })
        .select()
        .single();

      if (packErr) {
        return { success: false, error: packErr.message };
      }

      const packId = newPack.id;

      // 2. Si es pack cerrado, insertar pack_items
      if (pack.pack_type === 'fixed' && items.length > 0) {
        const itemRows = items.map((it, idx) => ({
          pack_id: packId,
          product_id: it.product_id,
          quantity: it.quantity,
          sort_order: it.sort_order ?? idx + 1,
        }));
        await supabase.from('pack_items').insert(itemRows);
      }

      // 3. Si es pack configurable, insertar pack_groups y pack_group_options
      if (pack.pack_type === 'configurable' && groups.length > 0) {
        for (let gIdx = 0; gIdx < groups.length; gIdx++) {
          const grp = groups[gIdx];
          const { data: newGrp, error: grpErr } = await supabase
            .from('pack_groups')
            .insert({
              pack_id: packId,
              name: grp.name,
              description: grp.description || null,
              min_select: grp.min_select,
              max_select: grp.max_select,
              sort_order: grp.sort_order ?? gIdx + 1,
            })
            .select()
            .single();

          if (!grpErr && newGrp && grp.options.length > 0) {
            const optRows = grp.options.map((opt, oIdx) => ({
              group_id: newGrp.id,
              product_id: opt.product_id,
              default_selected: Boolean(opt.default_selected),
              sort_order: opt.sort_order ?? oIdx + 1,
              price_supplement: Number(opt.price_supplement || 0),
            }));
            await supabase.from('pack_group_options').insert(optRows);
          }
        }
      }

      const refreshed = await fetchPackBySlug(newPack.slug);
      if (refreshed) return { success: true, data: refreshed };
    } catch (err: any) {
      console.warn('Error creando pack en Supabase, guardando en local:', err);
    }
  }

  // Local fallback
  const localPacks = getStoredLocalPacks();
  const packId = 'pack-' + Date.now();
  const newPackObj: PackWithDetails = {
    ...pack,
    id: packId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    items:
      pack.pack_type === 'fixed'
        ? items.map((it, i) => ({
            id: `pi-${packId}-${i}`,
            pack_id: packId,
            product_id: it.product_id,
            quantity: it.quantity,
            sort_order: it.sort_order ?? i + 1,
            created_at: new Date().toISOString(),
          }))
        : [],
    groups:
      pack.pack_type === 'configurable'
        ? groups.map((g, gIdx) => ({
            id: `pg-${packId}-${gIdx}`,
            pack_id: packId,
            name: g.name,
            description: g.description || null,
            min_select: g.min_select,
            max_select: g.max_select,
            sort_order: g.sort_order ?? gIdx + 1,
            created_at: new Date().toISOString(),
            options: g.options.map((opt, oIdx) => ({
              id: `pgo-${packId}-${gIdx}-${oIdx}`,
              group_id: `pg-${packId}-${gIdx}`,
              product_id: opt.product_id,
              default_selected: Boolean(opt.default_selected),
              sort_order: opt.sort_order ?? oIdx + 1,
              price_supplement: Number(opt.price_supplement || 0),
              created_at: new Date().toISOString(),
            })),
          }))
        : [],
  };

  localPacks.unshift(newPackObj);
  saveStoredLocalPacks(localPacks);
  return { success: true, data: newPackObj };
}

/**
 * Actualiza un pack existente y su estructura (Admin)
 */
export async function updatePack(
  id: string,
  params: {
    pack: Partial<DbPack>;
    items?: { product_id: string; quantity: number; sort_order?: number }[];
    groups?: {
      name: string;
      description?: string;
      min_select: number;
      max_select: number;
      sort_order?: number;
      options: { product_id: string; default_selected?: boolean; sort_order?: number; price_supplement?: number }[];
    }[];
  }
): Promise<{ success: boolean; data?: PackWithDetails; error?: string }> {
  const { pack, items, groups } = params;

  if (isSupabaseConfigured) {
    try {
      const payload: any = { ...pack, updated_at: new Date().toISOString() };
      delete payload.id;
      delete payload.created_at;

      const { error: updErr } = await supabase.from('packs').update(payload).eq('id', id);
      if (updErr) return { success: false, error: updErr.message };

      if (items !== undefined) {
        await supabase.from('pack_items').delete().eq('pack_id', id);
        if (items.length > 0) {
          const itemRows = items.map((it, idx) => ({
            pack_id: id,
            product_id: it.product_id,
            quantity: it.quantity,
            sort_order: it.sort_order ?? idx + 1,
          }));
          await supabase.from('pack_items').insert(itemRows);
        }
      }

      if (groups !== undefined) {
        await supabase.from('pack_groups').delete().eq('pack_id', id);
        for (let gIdx = 0; gIdx < groups.length; gIdx++) {
          const grp = groups[gIdx];
          const { data: newGrp } = await supabase
            .from('pack_groups')
            .insert({
              pack_id: id,
              name: grp.name,
              description: grp.description || null,
              min_select: grp.min_select,
              max_select: grp.max_select,
              sort_order: grp.sort_order ?? gIdx + 1,
            })
            .select()
            .single();

          if (newGrp && grp.options.length > 0) {
            const optRows = grp.options.map((opt, oIdx) => ({
              group_id: newGrp.id,
              product_id: opt.product_id,
              default_selected: Boolean(opt.default_selected),
              sort_order: opt.sort_order ?? oIdx + 1,
              price_supplement: Number(opt.price_supplement || 0),
            }));
            await supabase.from('pack_group_options').insert(optRows);
          }
        }
      }

      const refreshed = await fetchPackBySlug(id);
      if (refreshed) return { success: true, data: refreshed };
    } catch {
      // Fallback
    }
  }

  const localPacks = getStoredLocalPacks();
  const idx = localPacks.findIndex((p) => p.id === id);
  if (idx !== -1) {
    const existing = localPacks[idx];
    const updated: PackWithDetails = {
      ...existing,
      ...pack,
      updated_at: new Date().toISOString(),
    };

    if (items !== undefined) {
      updated.items = items.map((it, i) => ({
        id: `pi-${id}-${i}`,
        pack_id: id,
        product_id: it.product_id,
        quantity: it.quantity,
        sort_order: it.sort_order ?? i + 1,
        created_at: new Date().toISOString(),
      }));
    }

    if (groups !== undefined) {
      updated.groups = groups.map((g, gIdx) => ({
        id: `pg-${id}-${gIdx}`,
        pack_id: id,
        name: g.name,
        description: g.description || null,
        min_select: g.min_select,
        max_select: g.max_select,
        sort_order: g.sort_order ?? gIdx + 1,
        created_at: new Date().toISOString(),
        options: g.options.map((opt, oIdx) => ({
          id: `pgo-${id}-${gIdx}-${oIdx}`,
          group_id: `pg-${id}-${gIdx}`,
          product_id: opt.product_id,
          default_selected: Boolean(opt.default_selected),
          sort_order: opt.sort_order ?? oIdx + 1,
          created_at: new Date().toISOString(),
        })),
      }));
    }

    localPacks[idx] = updated;
    saveStoredLocalPacks(localPacks);
    return { success: true, data: updated };
  }

  return { success: false, error: 'Pack no encontrado' };
}

/**
 * Conmuta rápido el estado activo/inactivo del pack
 */
export async function togglePackActive(id: string, active: boolean) {
  return updatePack(id, { pack: { active } });
}

/**
 * Elimina un pack (o lo desactiva si tiene pedidos históricos)
 */
export async function deletePack(id: string): Promise<{ success: boolean; error?: string }> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('packs').delete().eq('id', id);
      if (!error) return { success: true };
      if (error.code === '23503') {
        // Tiene referencias en pedidos -> desactivar en vez de romper la integridad referencial
        await supabase.from('packs').update({ active: false }).eq('id', id);
        return {
          success: true,
          error: 'El pack tiene pedidos asociados. Se ha desactivado en lugar de borrarlo para preservar el histórico.',
        };
      }
    } catch {
      // Fallback
    }
  }

  const localPacks = getStoredLocalPacks().filter((p) => p.id !== id);
  saveStoredLocalPacks(localPacks);
  return { success: true };
}
