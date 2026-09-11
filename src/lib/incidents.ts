import { supabase, isSupabaseConfigured } from './supabase';
import type {
  DbIncident,
  DbIncidentAuditLog,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  IncidentsSummary,
} from '../types/app';

export interface IncidentFilters {
  status?: string;
  severity?: string;
  type?: string;
  orderId?: string;
  search?: string;
  includeTest?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateIncidentParams {
  orderId: string;
  type: IncidentType;
  severity: IncidentSeverity;
  title: string;
  description: string;
  orderItemId?: string | null;
  productId?: string | null;
  internalNotes?: string | null;
  requiresRefundReview?: boolean;
  courierId?: string | null;
}

export interface UpdateIncidentStatusParams {
  incidentId: string;
  status: IncidentStatus;
  resolutionNotes?: string | null;
  internalNotes?: string | null;
  recordStockLoss?: boolean;
  lossProductId?: string | null;
  lossQuantity?: number | null;
}

export interface UpdateIncidentParams {
  incidentId: string;
  severity?: IncidentSeverity;
  internalNotes?: string | null;
  requiresRefundReview?: boolean;
  title?: string;
  description?: string;
  auditNote?: string;
}

export interface CourierReportIncidentParams {
  orderId: string;
  type: IncidentType;
  title: string;
  description: string;
}

/**
 * Obtiene la lista de incidencias filtradas y enriquecidas para el panel de administración.
 */
export async function adminFetchIncidents(
  filters?: IncidentFilters
): Promise<{ data: DbIncident[]; total: number; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { data: [], total: 0, error: 'Supabase no está configurado.' };
  }

  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_fetch_incidents', {
      p_status: filters?.status && filters.status !== 'all' ? filters.status : null,
      p_severity: filters?.severity && filters.severity !== 'all' ? filters.severity : null,
      p_type: filters?.type && filters.type !== 'all' ? filters.type : null,
      p_search: filters?.search?.trim() || null,
      p_order_id: filters?.orderId || null,
      p_include_test: filters?.includeTest ?? true,
      p_limit: filters?.limit ?? 50,
      p_offset: filters?.offset ?? 0,
    });

    if (!rpcError && rpcData && typeof rpcData === 'object' && rpcData.success) {
      return {
        data: (rpcData.incidents || []) as DbIncident[],
        total: rpcData.total || 0,
        error: null,
      };
    }

    // Fallback: consulta directa a la tabla public.incidents
    let query = supabase
      .from('incidents')
      .select(`
        *,
        orders:order_id (
          order_number,
          status,
          total,
          is_test,
          created_at,
          user_id,
          profiles:user_id (
            full_name,
            phone
          )
        ),
        order_items:order_item_id (
          product_name
        ),
        products:product_id (
          name
        ),
        couriers:courier_id (
          id,
          profiles:profile_id (
            full_name
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters?.severity && filters.severity !== 'all') {
      query = query.eq('severity', filters.severity);
    }
    if (filters?.type && filters.type !== 'all') {
      query = query.eq('type', filters.type);
    }
    if (filters?.orderId) {
      query = query.eq('order_id', filters.orderId);
    }
    if (filters?.includeTest === false) {
      query = query.eq('is_test', false);
    }

    const { data, error, count } = await query.limit(filters?.limit ?? 50);

    if (error) {
      return { data: [], total: 0, error: error.message };
    }

    const mapped: DbIncident[] = (data || []).map((row: any) => ({
      id: row.id,
      incident_number: row.incident_number,
      order_id: row.order_id,
      order_item_id: row.order_item_id,
      product_id: row.product_id,
      type: row.type,
      severity: row.severity,
      status: row.status,
      title: row.title,
      description: row.description,
      internal_notes: row.internal_notes,
      origin: row.origin,
      is_test: row.is_test,
      requires_refund_review: row.requires_refund_review,
      courier_id: row.courier_id,
      reported_by: row.reported_by,
      resolved_by: row.resolved_by,
      resolution_notes: row.resolution_notes,
      resolved_at: row.resolved_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      order_number: row.orders?.order_number,
      order_status: row.orders?.status,
      order_total: row.orders?.total,
      order_is_test: row.orders?.is_test,
      order_created_at: row.orders?.created_at,
      customer_name: row.orders?.profiles?.full_name || 'Cliente',
      customer_phone: row.orders?.profiles?.phone,
      product_name: row.products?.name || row.order_items?.product_name,
      courier_name: row.couriers?.profiles?.full_name,
    }));

    return { data: mapped, total: count || mapped.length, error: null };
  } catch (err: any) {
    return { data: [], total: 0, error: err?.message || 'Error al obtener incidencias.' };
  }
}

/**
 * Obtiene el resumen de KPIs de incidencias (Abiertas, En investigación, Resueltas hoy, Críticas, etc.)
 */
export async function adminGetIncidentsSummary(): Promise<{
  data: IncidentsSummary | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return {
      data: {
        open_count: 0,
        investigating_count: 0,
        resolved_today_count: 0,
        critical_count: 0,
        affected_orders_count: 0,
        requires_refund_review_count: 0,
      },
      error: null,
    };
  }

  try {
    const { data, error } = await supabase.rpc('admin_get_incidents_summary');
    if (error) {
      // Fallback manual si la RPC da error
      const { data: rawData } = await supabase
        .from('incidents')
        .select('status, severity, order_id, requires_refund_review, resolved_at');

      if (!rawData) {
        return { data: null, error: error.message };
      }

      const today = new Date().toISOString().slice(0, 10);
      const openCount = rawData.filter((i) => i.status === 'open').length;
      const investigatingCount = rawData.filter((i) => i.status === 'investigating').length;
      const resolvedTodayCount = rawData.filter(
        (i) => i.status === 'resolved' && i.resolved_at?.startsWith(today)
      ).length;
      const criticalCount = rawData.filter(
        (i) => ['open', 'investigating'].includes(i.status) && ['high', 'critical'].includes(i.severity)
      ).length;
      const affectedOrders = new Set(
        rawData.filter((i) => ['open', 'investigating'].includes(i.status)).map((i) => i.order_id)
      ).size;
      const refundReviewCount = rawData.filter(
        (i) => i.requires_refund_review && i.status !== 'cancelled'
      ).length;

      return {
        data: {
          open_count: openCount,
          investigating_count: investigatingCount,
          resolved_today_count: resolvedTodayCount,
          critical_count: criticalCount,
          affected_orders_count: affectedOrders,
          requires_refund_review_count: refundReviewCount,
        },
        error: null,
      };
    }

    return {
      data: {
        open_count: data.open_count || 0,
        investigating_count: data.investigating_count || 0,
        resolved_today_count: data.resolved_today_count || 0,
        critical_count: data.critical_count || 0,
        affected_orders_count: data.affected_orders_count || 0,
        requires_refund_review_count: data.requires_refund_review_count || 0,
      },
      error: null,
    };
  } catch (err: any) {
    return { data: null, error: err?.message || 'Error al obtener resumen de incidencias.' };
  }
}

/**
 * Crea una incidencia como administrador.
 */
export async function adminCreateIncident(
  params: CreateIncidentParams
): Promise<{ incident?: DbIncident; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { error: 'Supabase no está configurado.' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_create_incident', {
      p_order_id: params.orderId,
      p_type: params.type,
      p_severity: params.severity,
      p_title: params.title.trim(),
      p_description: params.description.trim(),
      p_order_item_id: params.orderItemId || null,
      p_product_id: params.productId || null,
      p_internal_notes: params.internalNotes?.trim() || null,
      p_requires_refund_review: params.requiresRefundReview ?? false,
      p_courier_id: params.courierId || null,
    });

    if (error) {
      return { error: error.message };
    }

    if (!data?.success) {
      return { error: 'No se pudo crear la incidencia.' };
    }

    return { incident: data.incident as DbIncident, error: null };
  } catch (err: any) {
    return { error: err?.message || 'Error al crear la incidencia.' };
  }
}

/**
 * Actualiza el estado de una incidencia con control de concurrencia y registro de auditoría.
 */
export async function adminUpdateIncidentStatus(
  params: UpdateIncidentStatusParams
): Promise<{ incident?: DbIncident; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { error: 'Supabase no está configurado.' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_update_incident_status', {
      p_incident_id: params.incidentId,
      p_status: params.status,
      p_resolution_notes: params.resolutionNotes?.trim() || null,
      p_internal_notes: params.internalNotes?.trim() || null,
      p_record_stock_loss: params.recordStockLoss ?? false,
      p_loss_product_id: params.lossProductId || null,
      p_loss_quantity: params.lossQuantity || null,
    });

    if (error) {
      return { error: error.message };
    }

    if (!data?.success) {
      return { error: 'No se pudo actualizar el estado de la incidencia.' };
    }

    return { incident: data.incident as DbIncident, error: null };
  } catch (err: any) {
    return { error: err?.message || 'Error al actualizar el estado.' };
  }
}

/**
 * Modifica detalles de una incidencia (severidad, notas internas, bandera de reembolso).
 */
export async function adminUpdateIncident(
  params: UpdateIncidentParams
): Promise<{ incident?: DbIncident; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { error: 'Supabase no está configurado.' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_update_incident', {
      p_incident_id: params.incidentId,
      p_severity: params.severity || null,
      p_internal_notes: params.internalNotes ?? null,
      p_requires_refund_review: typeof params.requiresRefundReview === 'boolean' ? params.requiresRefundReview : null,
      p_title: params.title?.trim() || null,
      p_description: params.description?.trim() || null,
      p_audit_note: params.auditNote || null,
    });

    if (error) {
      return { error: error.message };
    }

    if (!data?.success) {
      return { error: 'No se pudo actualizar la incidencia.' };
    }

    return { incident: data.incident as DbIncident, error: null };
  } catch (err: any) {
    return { error: err?.message || 'Error al actualizar la incidencia.' };
  }
}

/**
 * Obtiene el historial de auditoría inmutable de una incidencia.
 */
export async function adminFetchIncidentAuditLogs(
  incidentId: string
): Promise<{ logs: DbIncidentAuditLog[]; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { logs: [], error: 'Supabase no está configurado.' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_fetch_incident_audit_logs', {
      p_incident_id: incidentId,
    });

    if (error) {
      return { logs: [], error: error.message };
    }

    return { logs: (data?.logs || []) as DbIncidentAuditLog[], error: null };
  } catch (err: any) {
    return { logs: [], error: err?.message || 'Error al obtener auditoría.' };
  }
}

/**
 * Permite a un repartidor en ruta reportar una incidencia operativa sobre su pedido asignado.
 */
export async function courierReportIncident(
  params: CourierReportIncidentParams
): Promise<{ incidentNumber?: string; message?: string; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { error: 'Supabase no está configurado.' };
  }

  try {
    const { data, error } = await supabase.rpc('courier_report_incident', {
      p_order_id: params.orderId,
      p_type: params.type,
      p_title: params.title.trim(),
      p_description: params.description.trim(),
    });

    if (error) {
      return { error: error.message };
    }

    return {
      incidentNumber: data?.incident_number,
      message: data?.message || 'Incidencia reportada exitosamente.',
      error: null,
    };
  } catch (err: any) {
    return { error: err?.message || 'Error al reportar la incidencia.' };
  }
}

/**
 * Consulta las incidencias del pedido asignado a un repartidor (sin notas internas).
 */
export async function courierFetchOrderIncidents(
  orderId: string
): Promise<{ incidents: DbIncident[]; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { incidents: [], error: 'Supabase no está configurado.' };
  }

  try {
    const { data, error } = await supabase.rpc('courier_fetch_order_incidents', {
      p_order_id: orderId,
    });

    if (error) {
      return { incidents: [], error: error.message };
    }

    return { incidents: (data?.incidents || []) as DbIncident[], error: null };
  } catch (err: any) {
    return { incidents: [], error: err?.message || 'Error al consultar incidencias.' };
  }
}

/**
 * Suscripción en tiempo real a cambios en la tabla 'incidents'.
 */
export function adminSubscribeToIncidents(onUpdate: () => void) {
  if (!isSupabaseConfigured) return () => {};

  const channel = supabase
    .channel('public:incidents_realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'incidents' },
      () => {
        onUpdate();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
