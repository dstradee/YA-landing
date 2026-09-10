import { supabase, isSupabaseConfigured } from './supabase';
import type {
  DbCourier,
  DbProfile,
  AdminCourierListItem,
  AdminCourierDetail,
} from '../types/app';

export interface CourierFilterOptions {
  search?: string;
  status?: 'all' | 'active' | 'inactive';
  availability?: 'all' | 'available' | 'unavailable';
}

/**
 * Normaliza y rellena con valores seguros un registro de repartidor de la base de datos
 */
function normalizeCourier(raw: any, profile?: DbProfile | null): AdminCourierListItem {
  return {
    id: raw.id,
    profile_id: raw.profile_id,
    vehicle_type: raw.vehicle_type || null,
    active: Boolean(raw.active),
    available: Boolean(raw.available ?? false),
    commission_percent: Number(raw.commission_percent ?? 0),
    fixed_fee: Number(raw.fixed_fee ?? 0),
    notes: raw.notes || null,
    created_at: raw.created_at || new Date().toISOString(),
    updated_at: raw.updated_at || new Date().toISOString(),
    full_name: profile?.full_name || raw.profiles?.full_name || 'Repartidor sin nombre',
    email: profile?.email || raw.profiles?.email || null,
    phone: profile?.phone || raw.profiles?.phone || null,
    user_role: profile?.role || raw.profiles?.role || 'courier',
    orders_count: 0,
  };
}

/**
 * Consulta el listado de repartidores registrados con sus perfiles de usuario
 */
export async function adminFetchCouriers(
  filters?: CourierFilterOptions
): Promise<{ data: AdminCourierListItem[]; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { data: [], error: 'Supabase no está configurado.' };
  }

  try {
    // 1. Obtener todos los repartidores
    const { data: couriersData, error: couriersError } = await supabase
      .from('couriers')
      .select('*')
      .order('created_at', { ascending: false });

    if (couriersError) {
      return { data: [], error: couriersError.message };
    }

    if (!couriersData || couriersData.length === 0) {
      return { data: [], error: null };
    }

    // 2. Obtener perfiles asociados en lote
    const profileIds = Array.from(new Set(couriersData.map((c) => c.profile_id).filter(Boolean)));
    const profilesMap = new Map<string, DbProfile>();

    if (profileIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('*')
        .in('id', profileIds);

      if (profilesData) {
        for (const p of profilesData as DbProfile[]) {
          profilesMap.set(p.id, p);
        }
      }
    }

    // 3. Obtener contador de pedidos asociados
    const courierIds = couriersData.map((c) => c.id);
    const orderCounts = new Map<string, number>();

    if (courierIds.length > 0) {
      const { data: ordersData } = await supabase
        .from('orders')
        .select('courier_id')
        .in('courier_id', courierIds);

      if (ordersData) {
        for (const o of ordersData) {
          if (o.courier_id) {
            orderCounts.set(o.courier_id, (orderCounts.get(o.courier_id) || 0) + 1);
          }
        }
      }
    }

    // 4. Mapear resultados normalizados
    let results: AdminCourierListItem[] = couriersData.map((c) => {
      const prof = profilesMap.get(c.profile_id);
      const item = normalizeCourier(c, prof);
      item.orders_count = orderCounts.get(c.id) || 0;
      return item;
    });

    // 5. Aplicar filtros
    if (filters?.status && filters.status !== 'all') {
      const wantActive = filters.status === 'active';
      results = results.filter((c) => c.active === wantActive);
    }

    if (filters?.availability && filters.availability !== 'all') {
      const wantAvailable = filters.availability === 'available';
      results = results.filter((c) => c.available === wantAvailable);
    }

    if (filters?.search && filters.search.trim() !== '') {
      const q = filters.search.toLowerCase().trim();
      results = results.filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.phone && c.phone.toLowerCase().includes(q))
      );
    }

    return { data: results, error: null };
  } catch (err: unknown) {
    return {
      data: [],
      error: err instanceof Error ? err.message : 'Error inesperado al consultar repartidores.',
    };
  }
}

/**
 * Obtiene la ficha individual completa de un repartidor
 */
export async function adminFetchCourierDetail(
  courierId: string
): Promise<{ data: AdminCourierDetail | null; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { data: null, error: 'Supabase no está configurado.' };
  }

  try {
    // 1. Obtener registro de repartidor
    const { data: courierData, error: courierError } = await supabase
      .from('couriers')
      .select('*')
      .eq('id', courierId)
      .maybeSingle();

    if (courierError) {
      return { data: null, error: courierError.message };
    }

    if (!courierData) {
      return { data: null, error: 'Repartidor no encontrado.' };
    }

    // 2. Obtener perfil asociado
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', courierData.profile_id)
      .maybeSingle();

    if (profileError || !profileData) {
      return {
        data: null,
        error: profileError?.message || 'Perfil de usuario no encontrado para este repartidor.',
      };
    }

    // 3. Obtener resumen de pedidos
    const { data: ordersData } = await supabase
      .from('orders')
      .select('id, total, status')
      .eq('courier_id', courierId);

    const totalDeliveries = (ordersData || []).filter(
      (o) => o.status === 'delivered'
    ).length;

    const courier: DbCourier = {
      id: courierData.id,
      profile_id: courierData.profile_id,
      vehicle_type: courierData.vehicle_type || null,
      active: Boolean(courierData.active),
      available: Boolean(courierData.available ?? false),
      commission_percent: Number(courierData.commission_percent ?? 0),
      fixed_fee: Number(courierData.fixed_fee ?? 0),
      notes: courierData.notes || null,
      created_at: courierData.created_at,
      updated_at: courierData.updated_at,
    };

    const detail: AdminCourierDetail = {
      courier,
      profile: profileData as DbProfile,
      summary: {
        totalDeliveries,
        totalEarnings: 0, // Reservado para Fase 4D
        rating: null,
      },
    };

    return { data: detail, error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Error inesperado al obtener detalle del repartidor.',
    };
  }
}

/**
 * Busca si existe un usuario de YA con el email especificado y comprueba si ya es repartidor
 */
export async function adminSearchUserByEmail(email: string): Promise<{
  user: DbProfile | null;
  isAlreadyCourier: boolean;
  courierId?: string;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return { user: null, isAlreadyCourier: false, error: 'Supabase no está configurado.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { user: null, isAlreadyCourier: false, error: 'Introduce un correo electrónico válido.' };
  }

  try {
    // 1. Buscar en profiles por email exacto o insensitive
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (profileError) {
      return { user: null, isAlreadyCourier: false, error: profileError.message };
    }

    if (!profileData) {
      return { user: null, isAlreadyCourier: false, error: null };
    }

    const profile = profileData as DbProfile;

    // 2. Comprobar si ya existe como repartidor
    const { data: existingCourier } = await supabase
      .from('couriers')
      .select('id')
      .eq('profile_id', profile.id)
      .maybeSingle();

    return {
      user: profile,
      isAlreadyCourier: Boolean(existingCourier),
      courierId: existingCourier?.id,
      error: null,
    };
  } catch (err: unknown) {
    return {
      user: null,
      isAlreadyCourier: false,
      error: err instanceof Error ? err.message : 'Error al buscar el usuario.',
    };
  }
}

/**
 * Asigna un usuario existente como repartidor configurando su remuneración individual
 */
export async function adminAssignCourier(data: {
  profileId: string;
  commissionPercent: number;
  fixedFee: number;
  active?: boolean;
  available?: boolean;
  vehicleType?: string | null;
  notes?: string | null;
}): Promise<{ success: boolean; courierId?: string; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  // Validaciones obligatorias
  if (data.commissionPercent < 0 || data.commissionPercent > 100) {
    return { success: false, error: 'La comisión debe estar comprendida entre 0% y 100%.' };
  }

  if (data.fixedFee < 0) {
    return { success: false, error: 'La tarifa fija no puede ser negativa.' };
  }

  try {
    // Intentar primero a través de la función RPC segura admin_assign_courier
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_assign_courier', {
      p_profile_id: data.profileId,
      p_commission_percent: data.commissionPercent,
      p_fixed_fee: data.fixedFee,
      p_active: data.active ?? true,
      p_available: data.available ?? false,
      p_vehicle_type: data.vehicleType || null,
      p_notes: data.notes || null,
    });

    if (!rpcError && rpcData?.courier_id) {
      return { success: true, courierId: rpcData.courier_id, error: null };
    }

    // Fallback directo a tablas en caso de que la RPC no haya sido creada aún en Supabase
    const payload: any = {
      profile_id: data.profileId,
      active: data.active ?? true,
      available: data.available ?? false,
      commission_percent: data.commissionPercent,
      fixed_fee: data.fixedFee,
      vehicle_type: data.vehicleType || null,
      notes: data.notes || null,
      updated_at: new Date().toISOString(),
    };

    // Upsert en couriers
    const { data: inserted, error: insertError } = await supabase
      .from('couriers')
      .upsert(payload, { onConflict: 'profile_id' })
      .select('id')
      .single();

    if (insertError) {
      // Si falló por falta de columnas nuevas en la base de datos remota, reintentar con columnas base
      if (insertError.code === '42703' || insertError.message.includes('column')) {
        const fallbackPayload = {
          profile_id: data.profileId,
          active: data.active ?? true,
          vehicle_type: data.vehicleType || null,
          updated_at: new Date().toISOString(),
        };
        const { data: retryInsert, error: retryError } = await supabase
          .from('couriers')
          .upsert(fallbackPayload, { onConflict: 'profile_id' })
          .select('id')
          .single();

        if (retryError) {
          return { success: false, error: retryError.message };
        }

        // Actualizar rol a courier en profiles
        await supabase
          .from('profiles')
          .update({ role: 'courier', updated_at: new Date().toISOString() })
          .eq('id', data.profileId);

        return {
          success: true,
          courierId: retryInsert?.id,
          error: null,
        };
      }

      return { success: false, error: insertError.message };
    }

    // Actualizar rol a courier en profiles
    await supabase
      .from('profiles')
      .update({ role: 'courier', updated_at: new Date().toISOString() })
      .eq('id', data.profileId);

    return { success: true, courierId: inserted?.id, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al asignar repartidor.',
    };
  }
}

/**
 * Actualiza la configuración y tarifas de un repartidor existente
 */
export async function adminUpdateCourier(
  courierId: string,
  data: {
    commissionPercent: number;
    fixedFee: number;
    active: boolean;
    available: boolean;
    vehicleType?: string | null;
    notes?: string | null;
  }
): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  if (data.commissionPercent < 0 || data.commissionPercent > 100) {
    return { success: false, error: 'La comisión debe estar comprendida entre 0% y 100%.' };
  }

  if (data.fixedFee < 0) {
    return { success: false, error: 'La tarifa fija no puede ser negativa.' };
  }

  try {
    // Intentar primero mediante la RPC segura
    const { error: rpcError } = await supabase.rpc('admin_update_courier', {
      p_courier_id: courierId,
      p_commission_percent: data.commissionPercent,
      p_fixed_fee: data.fixedFee,
      p_active: data.active,
      p_available: data.available,
      p_vehicle_type: data.vehicleType || null,
      p_notes: data.notes || null,
    });

    if (!rpcError) {
      return { success: true, error: null };
    }

    // Fallback a actualización directa en tabla couriers
    const updatePayload: any = {
      commission_percent: data.commissionPercent,
      fixed_fee: data.fixedFee,
      active: data.active,
      available: data.available,
      vehicle_type: data.vehicleType || null,
      notes: data.notes || null,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('couriers')
      .update(updatePayload)
      .eq('id', courierId);

    if (updateError) {
      if (updateError.code === '42703' || updateError.message.includes('column')) {
        const basePayload = {
          active: data.active,
          vehicle_type: data.vehicleType || null,
          updated_at: new Date().toISOString(),
        };
        const { error: retryErr } = await supabase
          .from('couriers')
          .update(basePayload)
          .eq('id', courierId);

        if (retryErr) {
          return { success: false, error: retryErr.message };
        }
        return { success: true, error: null };
      }
      return { success: false, error: updateError.message };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al actualizar repartidor.',
    };
  }
}

/**
 * Conmuta el estado activo/inactivo de un repartidor
 */
export async function adminToggleCourierActive(
  courierId: string,
  currentActive: boolean
): Promise<{ success: boolean; newActive: boolean; error: string | null }> {
  const nextActive = !currentActive;
  const updateData: any = {
    active: nextActive,
    updated_at: new Date().toISOString(),
  };

  // Si se desactiva, pasa automáticamente a no disponible
  if (!nextActive) {
    updateData.available = false;
  }

  const { error } = await supabase.from('couriers').update(updateData).eq('id', courierId);

  if (error) {
    return { success: false, newActive: currentActive, error: error.message };
  }

  return { success: true, newActive: nextActive, error: null };
}

/**
 * Conmuta el estado de disponibilidad operativa (disponible / no disponible)
 */
export async function adminToggleCourierAvailable(
  courierId: string,
  currentAvailable: boolean,
  isActive: boolean
): Promise<{ success: boolean; newAvailable: boolean; error: string | null }> {
  if (!isActive && !currentAvailable) {
    return {
      success: false,
      newAvailable: false,
      error: 'Un repartidor inactivo no puede ponerse disponible. Actívalo primero.',
    };
  }

  const nextAvailable = !currentAvailable;
  const { error } = await supabase
    .from('couriers')
    .update({
      available: nextAvailable,
      updated_at: new Date().toISOString(),
    })
    .eq('id', courierId);

  if (error) {
    return { success: false, newAvailable: currentAvailable, error: error.message };
  }

  return { success: true, newAvailable: nextAvailable, error: null };
}
