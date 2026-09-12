import { supabase, isSupabaseConfigured } from './supabase';
import type { DbAddress, DbDeliveryZone, DbOrder, DbOrderItem, PaymentMethod } from '../types/app';

// ==============================================================================
// 1. GESTIÓN DE DIRECCIONES (addresses)
// ==============================================================================

export async function fetchUserAddresses(userId: string): Promise<DbAddress[]> {
  if (!isSupabaseConfigured || !userId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.warn('Error al cargar direcciones de usuario:', error);
      return [];
    }

    return data as DbAddress[];
  } catch (err) {
    console.warn('Excepción al cargar direcciones:', err);
    return [];
  }
}

export async function createUserAddress(params: {
  userId: string;
  name: string;
  phone?: string;
  street: string;
  number: string;
  floor_door?: string;
  postal_code: string;
  city?: string;
  notes?: string;
  is_default?: boolean;
}): Promise<{ address: DbAddress | null; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { address: null, error: 'Supabase no está configurado.' };
  }

  try {
    const payload = {
      user_id: params.userId,
      name: params.name.trim(),
      phone: params.phone ? params.phone.trim() : null,
      street: params.street.trim(),
      number: params.number.trim(),
      floor_door: params.floor_door ? params.floor_door.trim() : null,
      postal_code: params.postal_code.trim(),
      city: params.city ? params.city.trim() : 'Jerez de la Frontera',
      notes: params.notes ? params.notes.trim() : null,
      is_default: Boolean(params.is_default),
    };

    const { data, error } = await supabase
      .from('addresses')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      return { address: null, error: error.message };
    }

    return { address: data as DbAddress, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al guardar la dirección.';
    return { address: null, error: message };
  }
}

// ==============================================================================
// 2. ZONAS DE ENTREGA (delivery_zones)
// ==============================================================================

export async function fetchActiveDeliveryZone(): Promise<{ fee: number; zone: DbDeliveryZone | null }> {
  const fallback = { fee: 2.90, zone: null };

  if (!isSupabaseConfigured) {
    return fallback;
  }

  try {
    const { data, error } = await supabase
      .from('delivery_zones')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return fallback;
    }

    return {
      fee: Number(data.delivery_fee) || 2.90,
      zone: data as DbDeliveryZone,
    };
  } catch {
    return fallback;
  }
}

// ==============================================================================
// 3. CREACIÓN SEGURA DE PEDIDOS (RPC create_order)
// ==============================================================================

const PAYMENT_MAP: Record<string, PaymentMethod> = {
  PayPal: 'paypal',
  paypal: 'paypal',
  Tarjeta: 'card',
  card: 'card',
};

export type CreateOrderInput = {
  addressId: string;
  lines: Array<{
    productId: string;
    quantity: number;
    isPack?: boolean;
    packId?: string;
    selections?: any[];
  }>;
  notes?: string;
  paymentMethod?: string;
};

export type CreateOrderResult = {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  subtotal?: number;
  deliveryFee?: number;
  total?: number;
  discountTotal?: number;
  promotionDiscount?: number;
  promotionCode?: string;
  error?: string;
};

export async function createOrderViaRpc(input: CreateOrderInput): Promise<CreateOrderResult> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      error: 'Supabase no está configurado. Conéctate a una instancia activa de Supabase.',
    };
  }

  try {
    const paymentMethodType = PAYMENT_MAP[input.paymentMethod || 'Tarjeta'] || 'card';

    const rpcPayload = {
      p_address_id: input.addressId,
      p_items: input.lines.map((l) => {
        const normalizedSelections = (l.selections || []).map((s: any) => ({
          group_id: s.group_id || s.groupId,
          groupId: s.groupId || s.group_id,
          group_name: s.group_name || s.groupName,
          groupName: s.groupName || s.group_name,
          product_id: s.product_id || s.productId,
          productId: s.productId || s.product_id,
          product_name: s.product_name || s.productName,
          productName: s.productName || s.product_name,
          price_supplement: Number(s.price_supplement ?? s.priceSupplement ?? 0),
          priceSupplement: Number(s.priceSupplement ?? s.price_supplement ?? 0),
          quantity: Math.max(1, Number(s.quantity) || 1),
        }));

        return {
          product_id: l.isPack ? (l.packId || l.productId) : l.productId,
          quantity: l.quantity,
          is_pack: Boolean(l.isPack || l.packId),
          pack_id: l.isPack ? (l.packId || l.productId) : undefined,
          selections: normalizedSelections,
          pack_selections: normalizedSelections,
        };
      }),
      p_notes: input.notes && input.notes.trim() ? input.notes.trim() : null,
      p_payment_method: paymentMethodType,
    };

    const { data, error } = await supabase.rpc('create_order', rpcPayload);

    if (error) {
      return {
        success: false,
        error: error.message || 'No se pudo crear el pedido en Supabase.',
      };
    }

    if (!data || !data.success) {
      return {
        success: false,
        error: 'Respuesta inválida del servidor al crear el pedido.',
      };
    }

    return {
      success: true,
      orderId: data.order_id,
      orderNumber: data.order_number,
      subtotal: Number(data.subtotal),
      deliveryFee: Number(data.delivery_fee),
      total: Number(data.total),
      discountTotal: Number(data.discount_total || 0),
      promotionDiscount: Number(data.promotion_discount || 0),
      promotionCode: data.promotion_code || undefined,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado de comunicación con la base de datos.';
    return {
      success: false,
      error: msg,
    };
  }
}

// ==============================================================================
// 3B. CREACIÓN DE PEDIDO DE PRUEBA GRATIS PARA ADMINISTRADORES (RPC create_admin_test_order)
// Autorizado estrictamente en DB para usuarios con rol 'admin'.
// Genera el pedido con total 0 €, sin pasarela PayPal y marcado como pagado.
// ==============================================================================

export type CreateAdminTestOrderInput = {
  addressId?: string | null;
  lines: Array<{
    productId: string;
    quantity: number;
    isPack?: boolean;
    packId?: string;
    selections?: any[];
  }>;
  notes?: string;
};

export async function createAdminTestOrderViaRpc(
  input: CreateAdminTestOrderInput
): Promise<CreateOrderResult> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      error: 'Supabase no está configurado. Conéctate a una instancia activa de Supabase.',
    };
  }

  try {
    const rpcPayload = {
      p_address_id: input.addressId || null,
      p_items: input.lines.map((l) => {
        const normalizedSelections = (l.selections || []).map((s: any) => ({
          group_id: s.group_id || s.groupId,
          groupId: s.groupId || s.group_id,
          group_name: s.group_name || s.groupName,
          groupName: s.groupName || s.group_name,
          product_id: s.product_id || s.productId,
          productId: s.productId || s.product_id,
          product_name: s.product_name || s.productName,
          productName: s.productName || s.product_name,
          price_supplement: Number(s.price_supplement ?? s.priceSupplement ?? 0),
          priceSupplement: Number(s.priceSupplement ?? s.price_supplement ?? 0),
          quantity: Math.max(1, Number(s.quantity) || 1),
        }));

        return {
          product_id: l.isPack ? (l.packId || l.productId) : l.productId,
          quantity: l.quantity,
          is_pack: Boolean(l.isPack || l.packId),
          pack_id: l.isPack ? (l.packId || l.productId) : undefined,
          selections: normalizedSelections,
          pack_selections: normalizedSelections,
        };
      }),
      p_notes: input.notes && input.notes.trim() ? input.notes.trim() : null,
    };

    const { data, error } = await supabase.rpc('create_admin_test_order', rpcPayload);

    if (error) {
      return {
        success: false,
        error: error.message || 'No se pudo crear el pedido de prueba.',
      };
    }

    if (!data || !data.success) {
      return {
        success: false,
        error: data?.error || 'Respuesta no satisfactoria al crear pedido de prueba.',
      };
    }

    return {
      success: true,
      orderId: data.order_id,
      orderNumber: data.order_number,
      subtotal: Number(data.subtotal || 0),
      deliveryFee: 0,
      total: 0,
      discountTotal: Number(data.subtotal || 0),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al conectar para crear pedido de prueba.';
    return {
      success: false,
      error: msg,
    };
  }
}

// ==============================================================================
// 4. CONSULTA DE PEDIDO INDIVIDUAL (orders + order_items)
// ==============================================================================

export type OrderWithDetails = DbOrder & {
  order_items: DbOrderItem[];
};

export async function fetchOrderByIdOrNumber(
  idOrNumber: string
): Promise<{ order: OrderWithDetails | null; error: string | null }> {
  if (!isSupabaseConfigured || !idOrNumber) {
    return { order: null, error: 'Identificador de pedido no válido.' };
  }

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrNumber);

    let query = supabase
      .from('orders')
      .select('*, order_items(*)');

    if (isUuid) {
      query = query.eq('id', idOrNumber);
    } else {
      query = query.eq('order_number', idOrNumber);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return { order: null, error: error.message };
    }

    if (!data) {
      return { order: null, error: 'Pedido no encontrado.' };
    }

    return { order: data as OrderWithDetails, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al consultar el pedido.';
    return { order: null, error: msg };
  }
}

// ==============================================================================
// 5. CONSULTA DE HISTORIAL DE PEDIDOS DEL USUARIO
// ==============================================================================

export async function fetchUserOrders(userId: string): Promise<{
  orders: OrderWithDetails[];
  error: string | null;
}> {
  if (!isSupabaseConfigured || !userId) {
    return { orders: [], error: null };
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return { orders: [], error: error.message };
    }

    return { orders: (data || []) as OrderWithDetails[], error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al cargar los pedidos del usuario.';
    return { orders: [], error: msg };
  }
}

// ==============================================================================
// 6. SUSCRIPCIÓN EN TIEMPO REAL AL ESTADO DE UN PEDIDO
// ==============================================================================

export function subscribeToOrderStatus(
  orderId: string,
  onStatusChange: (updatedOrder: Partial<DbOrder>) => void
): () => void {
  if (!isSupabaseConfigured || !orderId || typeof supabase.channel !== 'function') {
    return () => {};
  }

  try {
    const channel = supabase
      .channel(`order-realtime-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          if (payload.new) {
            onStatusChange(payload.new as Partial<DbOrder>);
          }
        }
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
// 7. COMPROBACIÓN DE DISPONIBILIDAD DE REPARTIDORES EN JEREZ
// ==============================================================================
export async function checkCouriersAvailable(): Promise<{ available: boolean; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { available: true, error: null };
  }

  try {
    // 1. Intentar RPC check_couriers_available
    const { data: rpcData, error: rpcError } = await supabase.rpc('check_couriers_available');
    if (!rpcError && typeof rpcData === 'boolean') {
      return { available: rpcData, error: null };
    }

    // 2. Fallback: consulta directa a couriers activos y disponibles
    const { count, error } = await supabase
      .from('couriers')
      .select('id', { count: 'exact', head: true })
      .eq('active', true)
      .eq('available', true);

    if (!error) {
      return { available: (count || 0) > 0, error: null };
    }

    return { available: true, error: null };
  } catch {
    return { available: true, error: null };
  }
}

