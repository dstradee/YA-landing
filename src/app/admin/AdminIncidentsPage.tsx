import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  Plus,
  ShieldAlert,
  ExternalLink,
  X,
  Boxes,
  Check,
  Truck,
} from 'lucide-react';
import {
  adminFetchIncidents,
  adminGetIncidentsSummary,
  adminCreateIncident,
  adminUpdateIncidentStatus,
  adminUpdateIncident,
  adminFetchIncidentAuditLogs,
  adminSubscribeToIncidents,
} from '../../lib/incidents';
import { adminFetchOrders } from '../../lib/adminOrders';
import { adminFetchProducts } from '../../lib/catalog';
import type {
  DbIncident,
  DbIncidentAuditLog,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  IncidentsSummary,
} from '../../types/app';

const TYPE_LABELS: Record<IncidentType, { label: string; desc: string }> = {
  product_unavailable: { label: 'Producto no disponible', desc: 'No encontrado o agotado en comercios' },
  partial_order: { label: 'Pedido parcial', desc: 'Entrega de solo una parte del pedido' },
  wrong_product: { label: 'Producto equivocado', desc: 'Artículo entregado incorrecto' },
  damaged_product: { label: 'Producto dañado / roto', desc: 'Deteriorado en almacén o transporte' },
  missing_product: { label: 'Producto faltante', desc: 'Falta en la bolsa preparada' },
  preparation_issue: { label: 'Problema en preparación', desc: 'Error durante el empaquetado' },
  delivery_issue: { label: 'Problema en reparto', desc: 'Incidencia en ruta de entrega' },
  customer_unavailable: { label: 'Cliente no responde', desc: 'Ausente en domicilio o incontactable' },
  address_issue: { label: 'Dirección errónea / inaccesible', desc: 'Imposible ubicar o acceder al portal' },
  delay: { label: 'Retraso significativo', desc: 'Tiempo de entrega excesivo' },
  returned_order: { label: 'Pedido devuelto', desc: 'Repartidor retorna el pedido al centro' },
  other: { label: 'Otra incidencia', desc: 'Causa operativa no clasificada' },
};

const SEVERITY_CONFIG: Record<
  IncidentSeverity,
  { label: string; badgeClass: string; dotClass: string }
> = {
  low: {
    label: 'Baja',
    badgeClass: 'border-blue-500/40 text-blue-400 bg-blue-500/10',
    dotClass: 'bg-blue-400',
  },
  medium: {
    label: 'Media',
    badgeClass: 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10',
    dotClass: 'bg-yellow-400',
  },
  high: {
    label: 'Alta',
    badgeClass: 'border-orange-500/50 text-orange-400 bg-orange-500/10',
    dotClass: 'bg-orange-400',
  },
  critical: {
    label: 'Crítica',
    badgeClass: 'border-rose-500 text-rose-400 bg-rose-500/15 animate-pulse',
    dotClass: 'bg-rose-500',
  },
};

const STATUS_CONFIG: Record<
  IncidentStatus,
  { label: string; badgeClass: string; icon: React.ElementType }
> = {
  open: {
    label: 'Abierta',
    badgeClass: 'border-amber-500 text-amber-400 bg-amber-500/10',
    icon: AlertCircle,
  },
  investigating: {
    label: 'En investigación',
    badgeClass: 'border-blue-400 text-blue-400 bg-blue-400/10',
    icon: Clock,
  },
  resolved: {
    label: 'Resuelta',
    badgeClass: 'border-emerald-400 text-emerald-400 bg-emerald-400/10',
    icon: CheckCircle2,
  },
  cancelled: {
    label: 'Cancelada',
    badgeClass: 'border-gray-600 text-gray-400 bg-gray-800/40',
    icon: X,
  },
};

export function AdminIncidentsPage() {
  const [incidents, setIncidents] = useState<DbIncident[]>([]);
  const [summary, setSummary] = useState<IncidentsSummary | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Filtros
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [includeTest, setIncludeTest] = useState(true);

  // Modal: Nueva Incidencia
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createOrderId, setCreateOrderId] = useState('');
  const [createType, setCreateType] = useState<IncidentType>('delivery_issue');
  const [createSeverity, setCreateSeverity] = useState<IncidentSeverity>('medium');
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createInternalNotes, setCreateInternalNotes] = useState('');
  const [createRefundReview, setCreateRefundReview] = useState(false);
  const [creating, setCreating] = useState(false);

  // Listado de pedidos recientes para autocomplete en modal
  const [recentOrdersList, setRecentOrdersList] = useState<{ id: string; order_number: string; customer: string }[]>([]);

  // Modal: Detalle & Resolución
  const [selectedIncident, setSelectedIncident] = useState<DbIncident | null>(null);
  const [auditLogs, setAuditLogs] = useState<DbIncidentAuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [targetStatus, setTargetStatus] = useState<IncidentStatus>('resolved');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [editInternalNotes, setEditInternalNotes] = useState('');
  const [editSeverity, setEditSeverity] = useState<IncidentSeverity>('medium');
  const [editRefundReview, setEditRefundReview] = useState(false);

  // Opciones de merma física de stock en resolución
  const [recordStockLoss, setRecordStockLoss] = useState(false);
  const [lossQuantity, setLossQuantity] = useState<number>(1);
  const [lossProductId, setLossProductId] = useState<string>('');
  const [availableProducts, setAvailableProducts] = useState<{ id: string; name: string }[]>([]);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const [incidentsRes, summaryRes] = await Promise.all([
      adminFetchIncidents({
        status: statusFilter,
        severity: severityFilter,
        type: typeFilter,
        search: searchQuery,
        includeTest,
      }),
      adminGetIncidentsSummary(),
    ]);

    if (incidentsRes.error) {
      setFeedback({ type: 'error', message: incidentsRes.error });
    } else {
      setIncidents(incidentsRes.data);
      setTotalCount(incidentsRes.total);
    }

    if (summaryRes.data) {
      setSummary(summaryRes.data);
    }

    setLoading(false);
    setRefreshing(false);
  }, [statusFilter, severityFilter, typeFilter, searchQuery, includeTest]);

  useEffect(() => {
    loadData();
    const unsubscribe = adminSubscribeToIncidents(() => {
      loadData(true);
    });
    return () => unsubscribe();
  }, [loadData]);

  // Carga lista de pedidos para el modal de creación
  const prepareCreateModal = async () => {
    setShowCreateModal(true);
    setCreateTitle('');
    setCreateDescription('');
    setCreateInternalNotes('');
    setCreateRefundReview(false);
    setCreateType('delivery_issue');
    setCreateSeverity('medium');

    const ordersRes = await adminFetchOrders({});
    if (ordersRes.data) {
      setRecentOrdersList(
        ordersRes.data.slice(0, 30).map((o) => ({
          id: o.id,
          order_number: o.order_number,
          customer: o.customerName || 'Cliente',
        }))
      );
      if (!createOrderId && ordersRes.data.length > 0) {
        setCreateOrderId(ordersRes.data[0].id);
      }
    }
  };

  // Abrir modal de detalle
  const openDetailModal = async (inc: DbIncident) => {
    setSelectedIncident(inc);
    setTargetStatus(inc.status === 'open' ? 'investigating' : inc.status === 'investigating' ? 'resolved' : inc.status);
    setResolutionNotes(inc.resolution_notes || '');
    setEditInternalNotes(inc.internal_notes || '');
    setEditSeverity(inc.severity);
    setEditRefundReview(inc.requires_refund_review);
    setRecordStockLoss(false);
    setLossQuantity(1);
    setLossProductId(inc.product_id || '');

    // Cargar productos si se necesita merma
    const prodRes = await adminFetchProducts();
    if (prodRes.data) {
      setAvailableProducts(prodRes.data.map((p) => ({ id: p.id, name: p.name })));
    }

    // Cargar historial de auditoría
    setLoadingLogs(true);
    const logsRes = await adminFetchIncidentAuditLogs(inc.id);
    setAuditLogs(logsRes.logs || []);
    setLoadingLogs(false);
  };

  // Enviar creación de incidencia
  const handleCreateIncidentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createOrderId) {
      setFeedback({ type: 'error', message: 'Debes seleccionar un pedido.' });
      return;
    }
    if (!createTitle.trim()) {
      setFeedback({ type: 'error', message: 'Debes indicar un título para la incidencia.' });
      return;
    }
    if (!createDescription.trim()) {
      setFeedback({ type: 'error', message: 'Debes indicar una descripción de lo ocurrido.' });
      return;
    }

    setCreating(true);
    const res = await adminCreateIncident({
      orderId: createOrderId,
      type: createType,
      severity: createSeverity,
      title: createTitle,
      description: createDescription,
      internalNotes: createInternalNotes || null,
      requiresRefundReview: createRefundReview,
    });
    setCreating(false);

    if (res.error) {
      setFeedback({ type: 'error', message: res.error });
    } else {
      setFeedback({
        type: 'success',
        message: `Incidencia ${res.incident?.incident_number || ''} registrada correctamente.`,
      });
      setShowCreateModal(false);
      loadData(true);
    }
    setTimeout(() => setFeedback(null), 4000);
  };

  // Actualizar estado de la incidencia
  const handleUpdateStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident) return;

    setUpdatingStatus(true);
    const res = await adminUpdateIncidentStatus({
      incidentId: selectedIncident.id,
      status: targetStatus,
      resolutionNotes: resolutionNotes || null,
      internalNotes: editInternalNotes || null,
      recordStockLoss: targetStatus === 'resolved' ? recordStockLoss : false,
      lossProductId: recordStockLoss ? lossProductId : null,
      lossQuantity: recordStockLoss ? lossQuantity : null,
    });
    setUpdatingStatus(false);

    if (res.error) {
      setFeedback({ type: 'error', message: res.error });
    } else {
      setFeedback({
        type: 'success',
        message: `Incidencia ${selectedIncident.incident_number} actualizada a "${STATUS_CONFIG[targetStatus].label}".`,
      });
      setSelectedIncident(null);
      loadData(true);
    }
    setTimeout(() => setFeedback(null), 4000);
  };

  // Guardar cambios secundarios (severidad, notas internas, reembolso)
  const handleSaveDetailsOnly = async () => {
    if (!selectedIncident) return;

    setUpdatingStatus(true);
    const res = await adminUpdateIncident({
      incidentId: selectedIncident.id,
      severity: editSeverity,
      internalNotes: editInternalNotes,
      requiresRefundReview: editRefundReview,
      auditNote: 'Actualización de notas internas / severidad por admin',
    });
    setUpdatingStatus(false);

    if (res.error) {
      setFeedback({ type: 'error', message: res.error });
    } else {
      setFeedback({
        type: 'success',
        message: `Detalles de la incidencia ${selectedIncident.incident_number} guardados.`,
      });
      setSelectedIncident(res.incident || null);
      loadData(true);
    }
    setTimeout(() => setFeedback(null), 4000);
  };

  return (
    <div className="space-y-8">
      {/* 1. Header principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b-4 border-ya-gray pb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2 bg-rose-500/10 border-2 border-rose-500/30 text-rose-400">
              <AlertOctagon size={24} />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
                Gestión de Incidencias
              </h1>
              <p className="text-xs font-mono uppercase tracking-widest text-gray-400 mt-1">
                Fase 7 · Control Operativo, Trazabilidad y Calidad de Entrega
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="px-4 py-2.5 bg-ya-gray hover:bg-gray-800 text-gray-300 hover:text-white border-2 border-ya-gray text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-2"
            title="Refrescar datos"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-ya-lime' : ''} />
            <span>Refrescar</span>
          </button>

          <button
            type="button"
            onClick={prepareCreateModal}
            className="px-5 py-2.5 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs hover:bg-white transition-colors flex items-center gap-2"
          >
            <Plus size={16} />
            <span>Nueva Incidencia</span>
          </button>
        </div>
      </div>

      {/* 2. Banner de Feedback */}
      {feedback && (
        <div
          className={`p-4 border-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider ${
            feedback.type === 'success'
              ? 'border-ya-lime bg-ya-lime/10 text-ya-lime'
              : 'border-rose-500 bg-rose-500/10 text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="text-gray-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 3. Alerta destacada si hay incidencias críticas */}
      {summary && summary.critical_count > 0 && (
        <div className="p-4 border-2 border-rose-500 bg-rose-500/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-rose-500 text-white animate-pulse">
              <AlertTriangle size={20} />
            </span>
            <div>
              <p className="text-sm font-black uppercase text-rose-300">
                Atención Inmediata: Hay {summary.critical_count} incidencia(s) de alta prioridad o críticas activas
              </p>
              <p className="text-xs text-gray-300 mt-0.5">
                Afectan a la entrega directa con clientes en Jerez. Revisa los casos señalados en rojo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setSeverityFilter('critical');
              setStatusFilter('all');
            }}
            className="px-3 py-1.5 bg-rose-500 text-white text-xs font-black uppercase tracking-wider hover:bg-rose-600 transition-colors whitespace-nowrap"
          >
            Ver Críticas
          </button>
        </div>
      )}

      {/* 4. Tarjetas de Resumen Operativo (KPIs) */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 bg-ya-gray/30 border-2 border-amber-500/30 flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 mb-1">
              Abiertas
            </span>
            <span className="text-3xl font-black text-white">{summary.open_count}</span>
            <span className="text-[10px] text-gray-400 mt-1">Pendientes de gestión</span>
          </div>

          <div className="p-4 bg-ya-gray/30 border-2 border-blue-500/30 flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-widest text-blue-400 mb-1">
              Investigando
            </span>
            <span className="text-3xl font-black text-white">{summary.investigating_count}</span>
            <span className="text-[10px] text-gray-400 mt-1">En curso con cliente/repartidor</span>
          </div>

          <div className="p-4 bg-ya-gray/30 border-2 border-rose-500/40 flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-widest text-rose-400 mb-1">
              Alta / Crítica
            </span>
            <span className={`text-3xl font-black ${summary.critical_count > 0 ? 'text-rose-400' : 'text-white'}`}>
              {summary.critical_count}
            </span>
            <span className="text-[10px] text-gray-400 mt-1">Riesgo operativo directo</span>
          </div>

          <div className="p-4 bg-ya-gray/30 border-2 border-emerald-500/30 flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 mb-1">
              Resueltas Hoy
            </span>
            <span className="text-3xl font-black text-emerald-400">{summary.resolved_today_count}</span>
            <span className="text-[10px] text-gray-400 mt-1">Casos cerrados satisfactoriamente</span>
          </div>

          <div className="p-4 bg-ya-gray/30 border-2 border-ya-gray flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-widest text-gray-300 mb-1">
              Pedidos Afectados
            </span>
            <span className="text-3xl font-black text-white">{summary.affected_orders_count}</span>
            <span className="text-[10px] text-gray-400 mt-1">Pedidos con problemas activos</span>
          </div>

          <div className="p-4 bg-ya-gray/30 border-2 border-purple-500/30 flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-widest text-purple-400 mb-1">
              Revisar Reembolso
            </span>
            <span className="text-3xl font-black text-purple-300">{summary.requires_refund_review_count}</span>
            <span className="text-[10px] text-gray-400 mt-1">Pendiente de Fase 12</span>
          </div>
        </div>
      )}

      {/* 5. Barra de Filtros y Búsqueda */}
      <div className="p-4 bg-ya-gray/20 border-2 border-ya-gray space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Búsqueda por texto */}
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por código INC, pedido YA, cliente, descripción..."
              className="w-full pl-9 pr-3 py-2 bg-ya-black border-2 border-ya-gray text-white text-xs font-mono focus:border-ya-lime focus:outline-none placeholder:text-gray-500"
            />
          </div>

          {/* Filtro de Estado */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase text-gray-400">Estado:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filtrar por estado"
              className="bg-ya-black border-2 border-ya-gray px-3 py-2 text-xs text-white uppercase font-bold focus:border-ya-lime focus:outline-none"
            >
              <option value="all">Todos los estados</option>
              <option value="open">Abiertas</option>
              <option value="investigating">En investigación</option>
              <option value="resolved">Resueltas</option>
              <option value="cancelled">Canceladas</option>
            </select>
          </div>

          {/* Filtro de Severidad */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase text-gray-400">Severidad:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              aria-label="Filtrar por severidad"
              className="bg-ya-black border-2 border-ya-gray px-3 py-2 text-xs text-white uppercase font-bold focus:border-ya-lime focus:outline-none"
            >
              <option value="all">Todas</option>
              <option value="critical">Crítica</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
          </div>

          {/* Filtro de Tipo */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase text-gray-400">Tipo:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filtrar por tipo"
              className="bg-ya-black border-2 border-ya-gray px-3 py-2 text-xs text-white font-bold focus:border-ya-lime focus:outline-none"
            >
              <option value="all">Todos los tipos</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-ya-gray/50 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white">
            <input
              type="checkbox"
              checked={includeTest}
              onChange={(e) => setIncludeTest(e.target.checked)}
              className="w-4 h-4 accent-ya-lime"
            />
            <span>Incluir incidencias de pedidos de prueba (is_test = true)</span>
          </label>

          <span className="text-[11px] font-mono text-gray-400">
            Mostrando {incidents.length} de {totalCount} incidencias
          </span>
        </div>
      </div>

      {/* 6. Tabla / Lista de Incidencias */}
      {loading ? (
        <div className="p-12 text-center border-2 border-ya-gray">
          <RefreshCw size={24} className="animate-spin text-ya-lime mx-auto mb-3" />
          <p className="text-xs font-mono uppercase tracking-widest text-gray-400">
            Cargando incidencias de la base de datos...
          </p>
        </div>
      ) : incidents.length === 0 ? (
        <div className="p-12 text-center border-2 border-ya-gray bg-ya-gray/10">
          <CheckCircle2 size={36} className="text-ya-lime mx-auto mb-3" />
          <h3 className="text-lg font-black uppercase text-white">Sin incidencias para estos filtros</h3>
          <p className="text-xs text-gray-400 max-w-md mx-auto mt-1">
            No se han encontrado incidencias registradas con los criterios seleccionados. Todo el flujo operativo
            está al día.
          </p>
        </div>
      ) : (
        <div className="border-2 border-ya-gray overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-ya-gray bg-ya-gray/50 text-gray-300 uppercase font-mono text-[10px] tracking-wider">
                <th className="py-3 px-4">Incidencia</th>
                <th className="py-3 px-4">Pedido / Cliente</th>
                <th className="py-3 px-4">Tipo y Severidad</th>
                <th className="py-3 px-4">Título y Descripción</th>
                <th className="py-3 px-4">Origen / Asignación</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ya-gray/40">
              {incidents.map((inc) => {
                const sev = SEVERITY_CONFIG[inc.severity];
                const st = STATUS_CONFIG[inc.status];
                const typeInfo = TYPE_LABELS[inc.type] || { label: inc.type, desc: '' };

                return (
                  <tr
                    key={inc.id}
                    className={`hover:bg-ya-gray/20 transition-colors ${
                      inc.status === 'open' && (inc.severity === 'high' || inc.severity === 'critical')
                        ? 'bg-rose-500/5'
                        : ''
                    }`}
                  >
                    {/* Código INC */}
                    <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${sev.dotClass}`} />
                        <span className="font-bold text-white text-xs">{inc.incident_number}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 block mt-0.5">
                        {new Date(inc.created_at).toLocaleTimeString('es-ES', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: '2-digit',
                          month: '2-digit',
                        })}
                      </span>
                      {inc.is_test && (
                        <span className="inline-block mt-1 px-1.5 py-0.2 text-[9px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase">
                          Test
                        </span>
                      )}
                    </td>

                    {/* Pedido / Cliente */}
                    <td className="py-3.5 px-4">
                      <Link
                        to={`/admin/pedidos/${inc.order_id}`}
                        className="font-mono text-ya-lime hover:underline font-bold text-xs flex items-center gap-1"
                      >
                        <span>{inc.order_number || 'Ver pedido'}</span>
                        <ExternalLink size={10} />
                      </Link>
                      <div className="text-gray-300 text-[11px] truncate max-w-[140px] mt-0.5">
                        {inc.customer_name || 'Cliente'}
                      </div>
                      {inc.customer_phone && (
                        <div className="text-[10px] font-mono text-gray-400">{inc.customer_phone}</div>
                      )}
                    </td>

                    {/* Tipo y Severidad */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white text-xs">{typeInfo.label}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border ${sev.badgeClass}`}
                        >
                          {sev.label}
                        </span>
                        {inc.requires_refund_review && (
                          <span
                            className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            title="Marcado para revisión de reembolso en Fase 12"
                          >
                            Reembolso
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Título y Descripción */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-bold text-gray-200 text-xs truncate">{inc.title}</div>
                      <div className="text-[11px] text-gray-400 line-clamp-2 mt-0.5">{inc.description}</div>
                      {inc.product_name && (
                        <div className="text-[10px] font-mono text-yellow-400 mt-1 flex items-center gap-1">
                          <Boxes size={11} />
                          <span>Producto: {inc.product_name}</span>
                        </div>
                      )}
                      {inc.internal_notes && (
                        <div className="text-[10px] font-mono text-gray-400 mt-1 bg-ya-gray/40 px-1.5 py-0.5 border border-ya-gray/60 inline-block">
                          🔒 Nota interna registrada
                        </div>
                      )}
                    </td>

                    {/* Origen / Repartidor */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-[11px] text-gray-300 font-bold uppercase">
                        {inc.origin === 'courier' ? (
                          <>
                            <Truck size={12} className="text-ya-lime" />
                            <span>Repartidor</span>
                          </>
                        ) : inc.origin === 'system' ? (
                          <>
                            <RefreshCw size={12} className="text-blue-400" />
                            <span>Sistema</span>
                          </>
                        ) : (
                          <>
                            <ShieldAlert size={12} className="text-gray-400" />
                            <span>Admin</span>
                          </>
                        )}
                      </div>
                      {inc.courier_name && (
                        <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[120px]">
                          Repartidor: {inc.courier_name}
                        </div>
                      )}
                    </td>

                    {/* Estado */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider border ${st.badgeClass}`}
                      >
                        <st.icon size={12} />
                        <span>{st.label}</span>
                      </span>
                      {inc.resolved_at && (
                        <span className="text-[9px] font-mono text-gray-400 block mt-1">
                          Resuelta:{' '}
                          {new Date(inc.resolved_at).toLocaleTimeString('es-ES', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openDetailModal(inc)}
                        className="px-3 py-1.5 bg-ya-gray hover:bg-white hover:text-ya-black text-gray-200 text-xs font-black uppercase tracking-wider transition-colors border border-ya-gray/70"
                      >
                        Gestionar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ============================================================================== */}
      {/* MODAL 1: REGISTRAR NUEVA INCIDENCIA                                            */}
      {/* ============================================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-ya-black border-4 border-ya-gray max-w-lg w-full p-6 text-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b-2 border-ya-gray mb-4">
              <div className="flex items-center gap-2">
                <AlertOctagon className="text-ya-lime" size={20} />
                <h3 className="text-lg font-black uppercase tracking-tight">Nueva Incidencia Operativa</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateIncidentSubmit} className="space-y-4 text-xs">
              {/* Pedido Asociado */}
              <div>
                <label className="block text-gray-400 font-mono uppercase text-[10px] mb-1">
                  Pedido Afectado *
                </label>
                <select
                  value={createOrderId}
                  onChange={(e) => setCreateOrderId(e.target.value)}
                  required
                  className="w-full bg-ya-gray/30 border-2 border-ya-gray p-2 text-white font-mono focus:border-ya-lime focus:outline-none"
                >
                  <option value="">Selecciona un pedido...</option>
                  {recentOrdersList.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_number} — {o.customer}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tipo y Severidad en 2 columnas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 font-mono uppercase text-[10px] mb-1">
                    Tipo de Incidencia *
                  </label>
                  <select
                    value={createType}
                    onChange={(e) => setCreateType(e.target.value as IncidentType)}
                    className="w-full bg-ya-gray/30 border-2 border-ya-gray p-2 text-white focus:border-ya-lime focus:outline-none"
                  >
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-400 font-mono uppercase text-[10px] mb-1">Severidad *</label>
                  <select
                    value={createSeverity}
                    onChange={(e) => setCreateSeverity(e.target.value as IncidentSeverity)}
                    className="w-full bg-ya-gray/30 border-2 border-ya-gray p-2 text-white focus:border-ya-lime focus:outline-none"
                  >
                    <option value="low">Baja (Informativa)</option>
                    <option value="medium">Media (Atención requerida)</option>
                    <option value="high">Alta (Afecta entrega)</option>
                    <option value="critical">Crítica (Bloqueante)</option>
                  </select>
                </div>
              </div>

              {/* Título de la incidencia */}
              <div>
                <label className="block text-gray-400 font-mono uppercase text-[10px] mb-1">
                  Título Resumen *
                </label>
                <input
                  type="text"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="Ej: Producto dañado en bolsa / Cliente no contesta al timbre"
                  required
                  className="w-full bg-ya-gray/30 border-2 border-ya-gray p-2 text-white focus:border-ya-lime focus:outline-none"
                />
              </div>

              {/* Descripción detallada */}
              <div>
                <label className="block text-gray-400 font-mono uppercase text-[10px] mb-1">
                  Descripción Operativa *
                </label>
                <textarea
                  rows={3}
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="Describe qué ha ocurrido y los hechos verificados..."
                  required
                  className="w-full bg-ya-gray/30 border-2 border-ya-gray p-2 text-white focus:border-ya-lime focus:outline-none"
                />
              </div>

              {/* Notas internas (Admin-only) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-gray-400 font-mono uppercase text-[10px]">
                    Notas Internas (Solo Administradores)
                  </label>
                  <span className="text-[9px] text-amber-400 font-mono">🔒 Oculto a clientes y repartidores</span>
                </div>
                <textarea
                  rows={2}
                  value={createInternalNotes}
                  onChange={(e) => setCreateInternalNotes(e.target.value)}
                  placeholder="Instrucciones internas, costes de reemplazo, decisiones administrativas..."
                  className="w-full bg-ya-gray/30 border-2 border-ya-gray p-2 text-white focus:border-ya-lime focus:outline-none font-mono text-[11px]"
                />
              </div>

              {/* Checkbox: Requiere revisión de reembolso */}
              <div className="p-3 bg-purple-500/10 border border-purple-500/30">
                <label className="flex items-center gap-2 cursor-pointer text-purple-200">
                  <input
                    type="checkbox"
                    checked={createRefundReview}
                    onChange={(e) => setCreateRefundReview(e.target.checked)}
                    className="w-4 h-4 accent-purple-400"
                  />
                  <span className="font-bold">Marcar para revisión de reembolso (Fase 12)</span>
                </label>
                <p className="text-[10px] text-gray-400 mt-1">
                  Señala esta incidencia para que el equipo financiero la evalúe sin ejecutar pagos o devoluciones
                  automáticas.
                </p>
              </div>

              {/* Botones de acción */}
              <div className="flex gap-3 pt-3 border-t border-ya-gray">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 border-2 border-ya-gray text-gray-400 hover:text-white uppercase tracking-wider font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2.5 bg-ya-lime text-ya-black font-black uppercase tracking-wider hover:bg-white transition-colors disabled:opacity-50"
                >
                  {creating ? 'Registrando...' : 'Crear Incidencia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* MODAL 2: GESTIÓN, RESOLUCIÓN Y AUDITORÍA DE INCIDENCIA                         */}
      {/* ============================================================================== */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="bg-ya-black border-4 border-ya-gray max-w-2xl w-full p-6 text-white max-h-[92vh] overflow-y-auto space-y-6">
            {/* Header del Modal */}
            <div className="flex items-start justify-between pb-4 border-b-2 border-ya-gray">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-lg font-black text-ya-lime">
                    {selectedIncident.incident_number}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border ${
                      SEVERITY_CONFIG[selectedIncident.severity].badgeClass
                    }`}
                  >
                    Severidad {SEVERITY_CONFIG[selectedIncident.severity].label}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border ${
                      STATUS_CONFIG[selectedIncident.status].badgeClass
                    }`}
                  >
                    {STATUS_CONFIG[selectedIncident.status].label}
                  </span>
                </div>
                <h3 className="text-base font-black uppercase text-white">{selectedIncident.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIncident(null)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>

            {/* Ficha rápida de datos */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-ya-gray/20 p-3 border border-ya-gray">
              <div>
                <span className="text-gray-400 block font-mono text-[9px] uppercase">Pedido</span>
                <Link
                  to={`/admin/pedidos/${selectedIncident.order_id}`}
                  className="font-mono text-ya-lime hover:underline font-bold"
                >
                  {selectedIncident.order_number || 'Ver Pedido'}
                </Link>
              </div>
              <div>
                <span className="text-gray-400 block font-mono text-[9px] uppercase">Cliente</span>
                <span className="text-white font-bold">{selectedIncident.customer_name || 'Cliente'}</span>
              </div>
              <div>
                <span className="text-gray-400 block font-mono text-[9px] uppercase">Origen</span>
                <span className="text-white font-bold uppercase">{selectedIncident.origin}</span>
              </div>
              <div>
                <span className="text-gray-400 block font-mono text-[9px] uppercase">Creada</span>
                <span className="text-gray-300 font-mono">
                  {new Date(selectedIncident.created_at).toLocaleString('es-ES')}
                </span>
              </div>
            </div>

            {/* Descripción completa */}
            <div>
              <span className="text-[10px] font-mono text-gray-400 uppercase block mb-1">
                Descripción Registrada
              </span>
              <p className="text-xs text-gray-200 bg-ya-gray/30 p-3 border border-ya-gray leading-relaxed">
                {selectedIncident.description}
              </p>
            </div>

            {/* Formulario de Resolución y Cambio de Estado */}
            <form onSubmit={handleUpdateStatusSubmit} className="space-y-4 border-2 border-ya-gray/80 p-4 bg-ya-gray/10">
              <div className="flex items-center gap-2 pb-2 border-b border-ya-gray text-xs font-black uppercase tracking-wider text-ya-lime">
                <CheckCircle2 size={16} />
                <span>Actualizar Estado / Resolución</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-gray-400 font-mono uppercase text-[10px] mb-1">
                    Nuevo Estado *
                  </label>
                  <select
                    value={targetStatus}
                    onChange={(e) => setTargetStatus(e.target.value as IncidentStatus)}
                    className="w-full bg-ya-black border-2 border-ya-gray p-2 text-white font-bold uppercase focus:border-ya-lime focus:outline-none"
                  >
                    <option value="open">Abierta (Sin resolver)</option>
                    <option value="investigating">En investigación activa</option>
                    <option value="resolved">Resuelta (Cerrar incidencia)</option>
                    <option value="cancelled">Cancelada / Descartada</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-400 font-mono uppercase text-[10px] mb-1">
                    Severidad Operativa
                  </label>
                  <select
                    value={editSeverity}
                    onChange={(e) => setEditSeverity(e.target.value as IncidentSeverity)}
                    className="w-full bg-ya-black border-2 border-ya-gray p-2 text-white focus:border-ya-lime focus:outline-none"
                  >
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                  </select>
                </div>
              </div>

              {/* Notas de resolución */}
              <div>
                <label className="block text-gray-400 font-mono uppercase text-[10px] mb-1">
                  Notas de Resolución / Explicación del Cierre
                </label>
                <textarea
                  rows={2}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Detalla cómo se ha resuelto (ej: se entregó producto de sustitución, cliente contactado...)"
                  className="w-full bg-ya-black border-2 border-ya-gray p-2 text-white text-xs focus:border-ya-lime focus:outline-none"
                />
              </div>

              {/* Integración con Inventario (Fase 5): Merma física de stock */}
              {targetStatus === 'resolved' && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-amber-300 font-bold">
                    <input
                      type="checkbox"
                      checked={recordStockLoss}
                      onChange={(e) => setRecordStockLoss(e.target.checked)}
                      className="w-4 h-4 accent-amber-400"
                    />
                    <span>Registrar merma física en inventario (Fase 5: Stock Movement &apos;loss&apos;)</span>
                  </label>
                  <p className="text-[10px] text-gray-300">
                    Si el producto quedó roto, caducado o inservible, descontará automáticamente las unidades del
                    stock de almacén y quedará auditado en el historial de movimientos de inventario.
                  </p>

                  {recordStockLoss && (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-amber-500/20">
                      <div>
                        <span className="block text-[9px] font-mono uppercase text-gray-400">Producto</span>
                        <select
                          value={lossProductId}
                          onChange={(e) => setLossProductId(e.target.value)}
                          className="w-full bg-ya-black border border-ya-gray p-1.5 text-xs text-white"
                        >
                          <option value="">Seleccionar producto...</option>
                          {availableProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <span className="block text-[9px] font-mono uppercase text-gray-400">
                          Unidades de merma
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={lossQuantity}
                          onChange={(e) => setLossQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full bg-ya-black border border-ya-gray p-1.5 text-xs text-white font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Notas internas */}
              <div>
                <label className="block text-gray-400 font-mono uppercase text-[10px] mb-1">
                  Notas Internas Confidenciales (Admin)
                </label>
                <textarea
                  rows={2}
                  value={editInternalNotes}
                  onChange={(e) => setEditInternalNotes(e.target.value)}
                  placeholder="Información sensible no expuesta al repartidor ni al cliente..."
                  className="w-full bg-ya-black border-2 border-ya-gray p-2 text-white font-mono text-[11px] focus:border-ya-lime focus:outline-none"
                />
              </div>

              {/* Botones de acción */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSaveDetailsOnly}
                  disabled={updatingStatus}
                  className="px-4 py-2 bg-ya-gray hover:bg-gray-800 text-gray-300 hover:text-white border border-ya-gray text-xs font-bold uppercase tracking-wider"
                >
                  Guardar Notas
                </button>
                <button
                  type="submit"
                  disabled={updatingStatus}
                  className="flex-1 py-2 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs hover:bg-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Check size={14} />
                  <span>{updatingStatus ? 'Guardando...' : `Confirmar estado (${STATUS_CONFIG[targetStatus].label})`}</span>
                </button>
              </div>
            </form>

            {/* Historial Inmutable de Auditoría */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock size={14} className="text-gray-400" />
                <span className="text-xs font-mono uppercase tracking-widest text-gray-300">
                  Historial de Auditoría Inmutable (incident_audit_logs)
                </span>
              </div>

              {loadingLogs ? (
                <p className="text-xs font-mono text-gray-500">Cargando registros de auditoría...</p>
              ) : auditLogs.length === 0 ? (
                <p className="text-xs text-gray-500 font-mono">No hay registros de auditoría adicionales.</p>
              ) : (
                <div className="border border-ya-gray divide-y divide-ya-gray/60 max-h-44 overflow-y-auto text-xs font-mono">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="p-2.5 bg-ya-gray/20 hover:bg-ya-gray/30">
                      <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                        <span className="text-ya-lime font-bold uppercase">{log.action}</span>
                        <span>{new Date(log.created_at).toLocaleString('es-ES')}</span>
                      </div>
                      {log.notes && <p className="text-gray-200 text-[11px] mb-0.5">{log.notes}</p>}
                      <div className="flex items-center gap-3 text-[9px] text-gray-400">
                        {log.changed_by_name && <span>Por: {log.changed_by_name}</span>}
                        {log.previous_status && log.new_status && (
                          <span>
                            Estado: {log.previous_status} → {log.new_status}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
