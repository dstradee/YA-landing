// ==============================================================================
// YA DELIVERY - SERVICIO CLIENTE YA JUNTOS (PEDIDOS COMPARTIDOS TIPO TRICOUNT)
// Archivo: src/lib/yaJuntos.ts
// ==============================================================================

import { supabase, isSupabaseConfigured } from './supabase';
import type {
  DbYaJuntosGroup,
  DbYaJuntosParticipant,
  DbYaJuntosItem,
  YaJuntosGroupWithDetails,
  YaJuntosPaymentMode,
  CartPackSelection,
} from '../types/app';
import { round2 } from './pricing';
import { products } from '../data/products';

const LOCAL_STORAGE_JUNTOS_KEY = 'ya_juntos_groups_v1';

// Helper local mock storage
function getLocalGroups(): Record<string, YaJuntosGroupWithDetails> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_JUNTOS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

function saveLocalGroup(group: YaJuntosGroupWithDetails) {
  try {
    const all = getLocalGroups();
    all[group.code] = group;
    localStorage.setItem(LOCAL_STORAGE_JUNTOS_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

// ==============================================================================
// 1. CREAR GRUPO COMPARTIDO
// ==============================================================================

export async function createYaJuntosGroup(params: {
  title?: string;
  paymentMode?: YaJuntosPaymentMode;
  user?: { id: string; name?: string; email?: string } | null;
}): Promise<{ success: boolean; group?: YaJuntosGroupWithDetails; error?: string }> {
  const title = params.title?.trim() || 'Pedido en grupo YA';
  const paymentMode = params.paymentMode || 'split_by_items';

  if (!isSupabaseConfigured) {
    const randomChars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
    }

    const userId = params.user?.id || 'mock-user-1';
    const userName = params.user?.name || 'Organizador';

    const newGroup: YaJuntosGroupWithDetails = {
      id: `group-${Date.now()}`,
      code,
      creator_id: userId,
      title,
      status: 'open',
      order_id: null,
      payment_mode: paymentMode,
      single_payer_user_id: paymentMode === 'single_payer' ? userId : null,
      delivery_address_id: null,
      delivery_address_snapshot: null,
      delivery_zone_id: null,
      subtotal: 0,
      delivery_fee: 2.90,
      discount_total: 0,
      total: 2.90,
      amount_paid: 0,
      notes: null,
      frozen_at: null,
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      is_test: false,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      participants: [
        {
          id: `part-${Date.now()}`,
          group_id: `group-${Date.now()}`,
          user_id: userId,
          display_name: userName,
          role: 'creator',
          status: 'active',
          joined_at: new Date().toISOString(),
          allocated_amount: 2.90,
          paid_amount: 0,
          payment_status: 'pending',
          paid_at: null,
          payment_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      items: [],
      is_creator: true,
    };

    saveLocalGroup(newGroup);
    return { success: true, group: newGroup };
  }

  try {
    const { data, error } = await supabase.rpc('create_ya_juntos_group', {
      p_title: title,
      p_payment_mode: paymentMode,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: 'No se pudo crear el grupo compartido.' };
    }

    const fetched = await fetchYaJuntosGroupByCode(data.code, params.user?.id);
    return { success: true, group: fetched.group || undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al crear el grupo.';
    return { success: false, error: msg };
  }
}

// ==============================================================================
// 2. CONSULTAR GRUPO POR CÓDIGO (CON PARTICIPANTES E ITEMS)
// ==============================================================================

export async function fetchYaJuntosGroupByCode(
  code: string,
  currentUserId?: string
): Promise<{ group: YaJuntosGroupWithDetails | null; error: string | null }> {
  const cleanCode = code.trim().toUpperCase();

  if (!isSupabaseConfigured) {
    const all = getLocalGroups();
    const found = all[cleanCode];
    if (!found) {
      return { group: null, error: `No se encontró ningún grupo con el código ${cleanCode}.` };
    }

    // Set dynamic properties
    found.is_creator = currentUserId ? found.creator_id === currentUserId : true;
    found.current_user_participant = currentUserId
      ? found.participants.find((p) => p.user_id === currentUserId && p.status === 'active') || null
      : found.participants[0] || null;

    return { group: found, error: null };
  }

  try {
    // 1. Obtener grupo
    const { data: groupData, error: groupError } = await supabase
      .from('ya_juntos_groups')
      .select('*')
      .eq('code', cleanCode)
      .maybeSingle();

    if (groupError || !groupData) {
      return { group: null, error: `No se encontró ningún grupo con el código ${cleanCode}.` };
    }

    // 2. Obtener participantes
    const { data: participantsData } = await supabase
      .from('ya_juntos_participants')
      .select('*')
      .eq('group_id', groupData.id)
      .order('joined_at', { ascending: true });

    // 3. Obtener items con join a productos y perfiles
    const { data: itemsData } = await supabase
      .from('ya_juntos_items')
      .select('*, products(name, image), profiles(full_name)')
      .eq('group_id', groupData.id)
      .order('created_at', { ascending: true });

    const participants = (participantsData || []) as DbYaJuntosParticipant[];
    const items = (itemsData || []).map((i: any) => ({
      ...i,
      product_name: i.products?.name || 'Producto',
      product_image: i.products?.image || '🛒',
      added_by_name: i.profiles?.full_name || 'Participante',
    })) as DbYaJuntosItem[];

    const is_creator = Boolean(currentUserId && groupData.creator_id === currentUserId);
    const current_user_participant = currentUserId
      ? participants.find((p) => p.user_id === currentUserId && p.status === 'active') || null
      : null;

    const groupWithDetails: YaJuntosGroupWithDetails = {
      ...(groupData as DbYaJuntosGroup),
      participants,
      items,
      is_creator,
      current_user_participant,
    };

    return { group: groupWithDetails, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al cargar el grupo compartido.';
    return { group: null, error: msg };
  }
}

// ==============================================================================
// 3. UNIRSE A GRUPO POR CÓDIGO
// ==============================================================================

export async function joinYaJuntosGroup(params: {
  code: string;
  user?: { id: string; name?: string; email?: string } | null;
}): Promise<{ success: boolean; group?: YaJuntosGroupWithDetails; error?: string }> {
  const cleanCode = params.code.trim().toUpperCase();

  if (!isSupabaseConfigured) {
    const all = getLocalGroups();
    const group = all[cleanCode];
    if (!group) {
      return { success: false, error: `No se encontró ningún grupo con el código ${cleanCode}.` };
    }

    if (group.status !== 'open') {
      return { success: false, error: 'Este grupo ya ha cerrado el carrito o iniciado el cobro.' };
    }

    const userId = params.user?.id || `user-guest-${Date.now()}`;
    const userName = params.user?.name || `Amigo ${group.participants.length + 1}`;

    const existingPart = group.participants.find((p) => p.user_id === userId);
    if (!existingPart) {
      group.participants.push({
        id: `part-${Date.now()}`,
        group_id: group.id,
        user_id: userId,
        display_name: userName,
        role: 'member',
        status: 'active',
        joined_at: new Date().toISOString(),
        allocated_amount: 0,
        paid_amount: 0,
        payment_status: 'pending',
        paid_at: null,
        payment_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      recalculateLocalGroup(group);
      saveLocalGroup(group);
    }

    return { success: true, group };
  }

  try {
    const { error } = await supabase.rpc('join_ya_juntos_group', {
      p_code: cleanCode,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const fetched = await fetchYaJuntosGroupByCode(cleanCode, params.user?.id);
    return { success: true, group: fetched.group || undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al unirte al grupo.';
    return { success: false, error: msg };
  }
}

// ==============================================================================
// 4. ABANDONAR GRUPO
// ==============================================================================

export async function leaveYaJuntosGroup(
  groupId: string,
  code: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    const all = getLocalGroups();
    const group = all[code];
    if (group) {
      group.participants = group.participants.filter((p) => p.user_id !== userId);
      group.items = group.items.filter((i) => i.added_by_user_id !== userId);
      recalculateLocalGroup(group);
      saveLocalGroup(group);
    }
    return { success: true };
  }

  try {
    const { error } = await supabase.rpc('leave_ya_juntos_group', {
      p_group_id: groupId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al abandonar el grupo.';
    return { success: false, error: msg };
  }
}

// ==============================================================================
// 5. AÑADIR PRODUCTO AL GRUPO
// ==============================================================================

export async function addItemToYaJuntos(params: {
  groupId: string;
  code: string;
  productId: string;
  quantity?: number;
  isPack?: boolean;
  packId?: string;
  selections?: CartPackSelection[];
  user?: { id: string; name?: string } | null;
}): Promise<{ success: boolean; error?: string }> {
  const qty = Math.max(1, params.quantity || 1);

  if (!isSupabaseConfigured) {
    const all = getLocalGroups();
    const group = all[params.code];
    if (!group) return { success: false, error: 'Grupo no encontrado.' };

    if (group.status !== 'open') {
      return { success: false, error: 'El grupo ya está cerrado para añadir productos.' };
    }

    const prod = products.find((p) => p.id === params.productId || p.slug === params.productId);
    const unitPrice = prod ? prod.price : 2.50;
    const lineSubtotal = round2(unitPrice * qty);

    const userId = params.user?.id || group.participants[0]?.user_id || 'mock-user-1';
    const userName = params.user?.name || group.participants.find((p) => p.user_id === userId)?.display_name || 'Participante';

    // Check if user already has this product in group
    const existing = group.items.find(
      (i) => i.product_id === params.productId && i.added_by_user_id === userId && !params.isPack
    );

    if (existing) {
      existing.quantity += qty;
      existing.line_subtotal = round2(existing.unit_price * existing.quantity);
    } else {
      group.items.push({
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        group_id: group.id,
        added_by_user_id: userId,
        product_id: params.productId,
        quantity: qty,
        is_pack: Boolean(params.isPack),
        pack_id: params.packId || null,
        selections: params.selections || [],
        unit_price: unitPrice,
        discounted_unit_price: unitPrice,
        line_subtotal: lineSubtotal,
        product_name: prod?.name || 'Producto YA',
        product_image: prod?.image || '🛒',
        added_by_name: userName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    recalculateLocalGroup(group);
    saveLocalGroup(group);
    return { success: true };
  }

  try {
    const { error } = await supabase.rpc('add_item_to_ya_juntos', {
      p_group_id: params.groupId,
      p_product_id: params.productId,
      p_quantity: qty,
      p_is_pack: Boolean(params.isPack),
      p_pack_id: params.packId || null,
      p_selections: params.selections || [],
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al añadir producto al pedido compartido.';
    return { success: false, error: msg };
  }
}

// ==============================================================================
// 6. ELIMINAR PRODUCTO DEL GRUPO
// ==============================================================================

export async function removeItemFromYaJuntos(params: {
  itemId: string;
  code: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    const all = getLocalGroups();
    const group = all[params.code];
    if (group) {
      group.items = group.items.filter((i) => i.id !== params.itemId);
      recalculateLocalGroup(group);
      saveLocalGroup(group);
    }
    return { success: true };
  }

  try {
    const { error } = await supabase.rpc('remove_item_from_ya_juntos', {
      p_item_id: params.itemId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al eliminar producto del grupo.';
    return { success: false, error: msg };
  }
}

// ==============================================================================
// 7. CONFIRMAR PEDIDO COMPARTIDO E INICIAR FASE DE PAGO
// ==============================================================================

export async function confirmYaJuntosOrder(params: {
  groupId: string;
  code: string;
  addressId: string;
  notes?: string;
}): Promise<{ success: boolean; orderId?: string; orderNumber?: string; error?: string }> {
  if (!isSupabaseConfigured) {
    const all = getLocalGroups();
    const group = all[params.code];
    if (!group) return { success: false, error: 'Grupo no encontrado.' };

    if (group.items.length === 0) {
      return { success: false, error: 'El carrito compartido está vacío.' };
    }

    group.status = 'payment_pending';
    group.frozen_at = new Date().toISOString();
    group.order_id = `ord-mock-${Date.now()}`;
    group.order_number = `YA-${Math.floor(1000 + Math.random() * 9000)}`;
    recalculateLocalGroup(group);
    saveLocalGroup(group);

    return {
      success: true,
      orderId: group.order_id,
      orderNumber: group.order_number,
    };
  }

  try {
    const { data, error } = await supabase.rpc('confirm_ya_juntos_order', {
      p_group_id: params.groupId,
      p_address_id: params.addressId,
      p_notes: params.notes || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      orderId: data?.order_id,
      orderNumber: data?.order_number,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al cerrar el carrito e iniciar el cobro.';
    return { success: false, error: msg };
  }
}

// ==============================================================================
// 8. SIMULAR / CONFIRMAR PAGO LOCAL (PARA DEV Y SANDBOX)
// ==============================================================================

export async function simulateJuntosLocalPayment(params: {
  code: string;
  participantId?: string;
  isFullPayment?: boolean;
}): Promise<{ success: boolean; fullyPaid: boolean; error?: string }> {
  const all = getLocalGroups();
  const group = all[params.code];
  if (!group) return { success: false, fullyPaid: false, error: 'Grupo no encontrado.' };

  if (params.isFullPayment) {
    group.amount_paid = group.total;
    group.status = 'fully_paid';
    group.participants.forEach((p) => {
      p.payment_status = 'paid';
      p.paid_amount = p.allocated_amount;
      p.paid_at = new Date().toISOString();
    });
    saveLocalGroup(group);
    return { success: true, fullyPaid: true };
  }

  if (params.participantId) {
    const part = group.participants.find((p) => p.id === params.participantId);
    if (part) {
      part.payment_status = 'paid';
      part.paid_amount = part.allocated_amount;
      part.paid_at = new Date().toISOString();
      group.amount_paid = round2(group.amount_paid + part.allocated_amount);
    }

    const allPaid = group.participants
      .filter((p) => p.status === 'active' && p.allocated_amount > 0)
      .every((p) => p.payment_status === 'paid');

    if (allPaid && group.amount_paid >= group.total - 0.01) {
      group.status = 'fully_paid';
    }

    saveLocalGroup(group);
    return { success: true, fullyPaid: group.status === 'fully_paid' };
  }

  return { success: false, fullyPaid: false, error: 'Parámetros insuficientes.' };
}

// ==============================================================================
// 9. HELPER DE RECÁLCULO LOCAL (ALGORITMO TRICOUNT EXACTO)
// ==============================================================================

function recalculateLocalGroup(group: YaJuntosGroupWithDetails) {
  const itemsSubtotal = round2(
    group.items.reduce((sum, item) => sum + Number(item.line_subtotal || 0), 0)
  );

  let deliveryFee = 2.90;
  if (itemsSubtotal >= 30.0) {
    deliveryFee = 0.0;
  }

  const total = round2(itemsSubtotal + deliveryFee);
  group.subtotal = itemsSubtotal;
  group.delivery_fee = deliveryFee;
  group.total = total;

  const activeParts = group.participants.filter((p) => p.status === 'active');
  const count = Math.max(1, activeParts.length);

  if (group.payment_mode === 'single_payer') {
    const singlePayerId = group.single_payer_user_id || group.creator_id;
    group.participants.forEach((p) => {
      p.allocated_amount = p.user_id === singlePayerId ? total : 0;
    });
  } else if (group.payment_mode === 'split_equal') {
    const totalCents = Math.round(total * 100);
    const baseCents = Math.floor(totalCents / count);
    const remainder = totalCents % count;

    activeParts.forEach((p, idx) => {
      const cents = idx < remainder ? baseCents + 1 : baseCents;
      p.allocated_amount = round2(cents / 100);
    });
  } else {
    // split_by_items
    const feeCents = Math.round(deliveryFee * 100);
    const baseFeeCents = Math.floor(feeCents / count);
    const remainderFee = feeCents % count;

    activeParts.forEach((p, idx) => {
      const myItemsSub = group.items
        .filter((i) => i.added_by_user_id === p.user_id)
        .reduce((sum, i) => sum + Number(i.line_subtotal || 0), 0);

      const feeShare = round2((idx < remainderFee ? baseFeeCents + 1 : baseFeeCents) / 100);
      p.allocated_amount = round2(myItemsSub + feeShare);
    });
  }
}
