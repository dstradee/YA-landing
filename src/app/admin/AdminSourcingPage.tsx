import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  PackageSearch,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Store,
  ExternalLink,
  MapPin,
  FileText,
  XCircle,
  Check,
} from 'lucide-react';
import {
  adminFetchSourcingItems,
  adminUpdateSourcingItem,
  adminGetSourcingSummary,
  adminSubscribeToSourcing,
} from '../../lib/sourcing';
import type { DbSourcingItem, SourcingStatus, SourcingSummary } from '../../types/app';
import { euro } from '../../data/products';

export function AdminSourcingPage() {
  const [items, setItems] = useState<DbSourcingItem[]>([]);
  const [summary, setSummary] = useState<SourcingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filtros
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [includeTestOrders, setIncludeTestOrders] = useState(true);

  // Modal para marcar como conseguido o editar
  const [activeModalItem, setActiveModalItem] = useState<DbSourcingItem | null>(null);
  const [modalTargetStatus, setModalTargetStatus] = useState<SourcingStatus>('sourced');
  const [modalSupplier, setModalSupplier] = useState('');
  const [modalCost, setModalCost] = useState<string>('');
  const [modalNotes, setModalNotes] = useState('');
  const [savingModal, setSavingModal] = useState(false);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    const [itemsRes, summaryRes] = await Promise.all([
      adminFetchSourcingItems({
        status: selectedStatus,
        search: searchQuery,
        isTest: includeTestOrders ? undefined : false,
      }),
      adminGetSourcingSummary(),
    ]);

    if (itemsRes.error) {
      setError(itemsRes.error);
    } else {
      setItems(itemsRes.data);
    }

    if (summaryRes.data) {
      setSummary(summaryRes.data);
    }

    setLoading(false);
    setRefreshing(false);
  }, [selectedStatus, searchQuery, includeTestOrders]);

  useEffect(() => {
    loadData();
    const unsubscribe = adminSubscribeToSourcing(() => {
      loadData(true);
    });
    return () => unsubscribe();
  }, [loadData]);

  // Manejador rápido para cambiar a 'sourcing' (en ruta)
  const handleStartSourcing = async (item: DbSourcingItem) => {
    const res = await adminUpdateSourcingItem({
      sourcingItemId: item.id,
      status: 'sourcing',
      notes: item.notes ? `${item.notes} | Iniciada compra por admin` : 'Iniciada compra por admin',
    });

    if (res.error) {
      setFeedback({ type: 'error', message: res.error });
    } else {
      setFeedback({
        type: 'success',
        message: `El producto "${item.product_name}" ha sido marcado como "En Compra".`,
      });
      loadData(true);
    }
    setTimeout(() => setFeedback(null), 4000);
  };

  // Abrir modal para marcar como 'sourced'
  const handleOpenSourcedModal = (item: DbSourcingItem) => {
    setActiveModalItem(item);
    setModalTargetStatus('sourced');
    setModalSupplier(item.supplier_name || item.suggested_purchase_locations || '');
    setModalCost(
      item.source_cost !== null && item.source_cost !== undefined
        ? String(item.source_cost)
        : item.product_estimated_cost
        ? String(item.product_estimated_cost)
        : ''
    );
    setModalNotes(item.notes || '');
  };

  // Abrir modal para marcar como 'unavailable'
  const handleOpenUnavailableModal = (item: DbSourcingItem) => {
    setActiveModalItem(item);
    setModalTargetStatus('unavailable');
    setModalSupplier(item.supplier_name || '');
    setModalCost(item.source_cost ? String(item.source_cost) : '');
    setModalNotes(item.notes ? `${item.notes} | No encontrado en comercio habitual` : 'No encontrado en comercio habitual');
  };

  // Guardar datos desde el modal
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModalItem) return;

    setSavingModal(true);
    const costNum = modalCost.trim() !== '' ? parseFloat(modalCost.replace(',', '.')) : undefined;

    const res = await adminUpdateSourcingItem({
      sourcingItemId: activeModalItem.id,
      status: modalTargetStatus,
      supplierName: modalSupplier.trim() || undefined,
      sourceCost: !isNaN(costNum as number) ? costNum : undefined,
      notes: modalNotes.trim() || undefined,
    });

    setSavingModal(false);

    if (res.error) {
      setFeedback({ type: 'error', message: res.error });
    } else {
      setFeedback({
        type: 'success',
        message: `Estado de abastecimiento actualizado con éxito.${
          res.allSourcedForOrder
            ? ' ¡Todos los productos del pedido han sido conseguidos!'
            : ''
        }`,
      });
      setActiveModalItem(null);
      loadData(true);
    }
    setTimeout(() => setFeedback(null), 5000);
  };

  const getStatusBadge = (status: SourcingStatus) => {
    switch (status) {
      case 'pending':
        return (
          <span className="px-2.5 py-1 bg-amber-400/20 text-amber-300 border border-amber-400 font-mono text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 w-max">
            <Clock size={12} />
            <span>Pendiente</span>
          </span>
        );
      case 'sourcing':
        return (
          <span className="px-2.5 py-1 bg-purple-500/20 text-purple-300 border border-purple-400 font-mono text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 w-max animate-pulse">
            <Store size={12} />
            <span>En Compra</span>
          </span>
        );
      case 'sourced':
        return (
          <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-400 font-mono text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 w-max">
            <CheckCircle2 size={12} />
            <span>Conseguido</span>
          </span>
        );
      case 'unavailable':
        return (
          <span className="px-2.5 py-1 bg-rose-500/20 text-rose-300 border border-rose-500 font-mono text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 w-max">
            <XCircle size={12} />
            <span>No Disponible</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2.5 py-1 bg-gray-700/40 text-gray-400 border border-gray-600 font-mono text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 w-max">
            <span>Cancelado</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-ya-gray pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
              <span>Abastecimiento</span>
              <span className="text-xs px-2.5 py-1 bg-ya-lime text-ya-black font-mono font-bold tracking-widest">
                FASE 6
              </span>
            </h1>
          </div>
          <p className="text-gray-400 text-sm mt-1 font-mono">
            Ruta de compra y aprovisionamiento de productos bajo demanda en comercios de Jerez
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 border-2 border-ya-gray hover:border-ya-lime hover:text-ya-lime text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Actualizando...' : 'Refrescar'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 border-2 font-mono text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'border-emerald-400 bg-emerald-950/40 text-emerald-300'
              : 'border-rose-500 bg-rose-950/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-gray-400 hover:text-white text-xs uppercase underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* KPI Cards Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="border-4 border-amber-400/80 bg-amber-950/20 p-4">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-300">
              Pendientes
            </span>
            <div className="text-2xl sm:text-3xl font-black text-white mt-1">
              {summary.pending_count}
            </div>
            <p className="text-[10px] font-mono text-gray-400 mt-1">Por iniciar compra</p>
          </div>

          <div className="border-4 border-purple-500/80 bg-purple-950/20 p-4">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-purple-300">
              En Compra
            </span>
            <div className="text-2xl sm:text-3xl font-black text-white mt-1">
              {summary.sourcing_count}
            </div>
            <p className="text-[10px] font-mono text-gray-400 mt-1">En ruta de adquisición</p>
          </div>

          <div className="border-4 border-emerald-500/80 bg-emerald-950/20 p-4">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-300">
              Conseguidos Hoy
            </span>
            <div className="text-2xl sm:text-3xl font-black text-white mt-1">
              {summary.sourced_today_count}
            </div>
            <p className="text-[10px] font-mono text-gray-400 mt-1">Listos en almacén</p>
          </div>

          <div className="border-4 border-rose-500/80 bg-rose-950/20 p-4">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-rose-300">
              No Disponibles
            </span>
            <div className="text-2xl sm:text-3xl font-black text-white mt-1">
              {summary.unavailable_count}
            </div>
            <p className="text-[10px] font-mono text-gray-400 mt-1">Agotados en plaza</p>
          </div>

          <div className="border-4 border-ya-gray bg-ya-black p-4 col-span-2 sm:col-span-1">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-gray-400">
              Pedidos Afectados
            </span>
            <div className="text-2xl sm:text-3xl font-black text-ya-lime mt-1">
              {summary.orders_pending_sourcing}
            </div>
            <p className="text-[10px] font-mono text-gray-400 mt-1">Esperando aprovisionamiento</p>
          </div>
        </div>
      )}

      {/* Controls & Filter Bar */}
      <div className="border-4 border-ya-gray bg-ya-black p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'pending', label: 'Pendientes' },
              { id: 'sourcing', label: 'En Compra' },
              { id: 'sourced', label: 'Conseguidos' },
              { id: 'unavailable', label: 'No Disponibles' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedStatus(tab.id)}
                className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 transition-colors whitespace-nowrap ${
                  selectedStatus === tab.id
                    ? 'border-ya-lime bg-ya-lime text-ya-black'
                    : 'border-transparent text-gray-300 hover:border-ya-gray hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Test Orders Toggle */}
          <label className="flex items-center gap-2 text-xs font-mono text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeTestOrders}
              onChange={(e) => setIncludeTestOrders(e.target.checked)}
              className="accent-ya-lime w-4 h-4 rounded-none"
            />
            <span>Incluir pedidos de prueba admin</span>
          </label>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre de producto, número de pedido, proveedor o ubicación de compra..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-ya-gray/30 border-2 border-ya-gray text-white text-xs font-mono placeholder:text-gray-500 focus:outline-none focus:border-ya-lime"
          />
        </div>
      </div>

      {/* Main Sourcing Items List */}
      {loading ? (
        <div className="py-16 text-center border-4 border-ya-gray bg-ya-black">
          <div className="w-10 h-10 border-4 border-ya-gray border-t-ya-lime animate-spin mx-auto mb-4"></div>
          <p className="font-mono text-xs uppercase tracking-widest text-gray-400">
            Cargando cola de abastecimiento...
          </p>
        </div>
      ) : error ? (
        <div className="p-8 border-4 border-rose-500/50 bg-rose-500/10 text-center">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <p className="text-white font-black text-sm uppercase">{error}</p>
          <button
            type="button"
            onClick={() => loadData()}
            className="mt-4 px-4 py-2 bg-ya-lime text-ya-black font-black uppercase text-xs hover:bg-white"
          >
            Reintentar
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center border-4 border-dashed border-ya-gray bg-ya-black/50 p-6">
          <PackageSearch className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <h3 className="text-base font-black uppercase text-white tracking-wider">
            No hay tareas de abastecimiento
          </h3>
          <p className="text-gray-400 font-mono text-xs mt-1 max-w-md mx-auto">
            {selectedStatus !== 'all' || searchQuery
              ? 'No hay registros que coincidan con los filtros aplicados.'
              : 'Todos los productos de los pedidos actuales están disponibles en almacén o ya han sido aprovisionados.'}
          </p>
        </div>
      ) : (
        <div className="border-4 border-ya-gray bg-ya-black divide-y-2 divide-ya-gray">
          {items.map((item) => {
            const isTest = !!item.is_test;

            return (
              <div
                key={item.id}
                className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-ya-gray/10 transition-colors"
              >
                {/* Col 1: Product Info & Quantity */}
                <div className="flex items-start gap-4 flex-1">
                  {item.product_image ? (
                    <img
                      src={item.product_image}
                      alt={item.product_name}
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 object-cover border-2 border-ya-gray shrink-0 bg-ya-gray/30"
                    />
                  ) : (
                    <div className="w-14 h-14 border-2 border-ya-gray shrink-0 bg-ya-gray/30 flex items-center justify-center text-ya-lime">
                      <Store size={22} />
                    </div>
                  )}

                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-black text-ya-lime bg-ya-lime/10 px-2 py-0.5 border border-ya-lime/40">
                        {item.quantity}x
                      </span>
                      <h4 className="font-sans font-black text-white text-base truncate">
                        {item.product_name}
                      </h4>
                      {isTest && (
                        <span className="px-2 py-0.5 bg-purple-950/60 text-purple-300 border border-purple-500 font-mono text-[10px] font-bold uppercase">
                          Pedido de prueba
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-gray-400">
                      <span className="flex items-center gap-1">
                        <span>Pedido:</span>
                        <Link
                          to={`/admin/pedidos/${item.order_id}`}
                          className="text-ya-lime font-bold hover:underline flex items-center gap-0.5"
                        >
                          {item.order_number || 'Ver Pedido'}
                          <ExternalLink size={11} />
                        </Link>
                      </span>

                      {item.delivery_address && (
                        <span className="flex items-center gap-1 text-gray-300">
                          <MapPin size={12} className="text-gray-400" />
                          <span>
                            {item.delivery_address.city || 'Jerez'} ({item.delivery_address.postalCode || '11400'})
                          </span>
                        </span>
                      )}

                      <span className="text-gray-500">
                        {new Date(item.created_at).toLocaleTimeString('es-ES', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: '2-digit',
                          month: 'short',
                        })}
                      </span>
                    </div>

                    {/* Ubicaciones de compra recomendadas (del catálogo) */}
                    {item.suggested_purchase_locations && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-300/90 font-mono pt-1">
                        <Store size={13} className="shrink-0" />
                        <span>Sugerencia: {item.suggested_purchase_locations}</span>
                      </div>
                    )}

                    {/* Notas operativas internas */}
                    {item.notes && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-300 font-mono pt-0.5">
                        <FileText size={13} className="text-gray-400 shrink-0" />
                        <span className="italic">"{item.notes}"</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Col 2: Status & Operational Details */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-6 border-t lg:border-t-0 pt-3 lg:pt-0 border-ya-gray">
                  <div className="space-y-1">
                    <div className="text-[11px] font-mono text-gray-400 uppercase font-bold">Estado</div>
                    {getStatusBadge(item.status)}
                  </div>

                  {/* Proveedor y Coste */}
                  <div className="space-y-0.5 min-w-[120px]">
                    <div className="text-[11px] font-mono text-gray-400 uppercase font-bold">
                      Proveedor / Coste
                    </div>
                    <div className="font-mono text-xs text-white">
                      {item.supplier_name || 'Sin asignar'}
                    </div>
                    <div className="font-mono text-xs text-ya-lime">
                      {item.source_cost !== null && item.source_cost !== undefined
                        ? `Coste: ${euro(item.source_cost)}`
                        : item.product_estimated_cost
                        ? `Est.: ${euro(item.product_estimated_cost)}`
                        : '—'}
                    </div>
                  </div>

                  {/* Actions Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleStartSourcing(item)}
                        className="px-3 py-2 bg-purple-500 text-white font-black uppercase text-xs tracking-wider hover:bg-white hover:text-ya-black transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Store size={13} />
                        <span>Comprar</span>
                      </button>
                    )}

                    {(item.status === 'pending' || item.status === 'sourcing') && (
                      <button
                        type="button"
                        onClick={() => handleOpenSourcedModal(item)}
                        className="px-3 py-2 bg-ya-lime text-ya-black font-black uppercase text-xs tracking-wider hover:bg-white transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Check size={13} />
                        <span>Conseguido</span>
                      </button>
                    )}

                    {(item.status === 'pending' || item.status === 'sourcing') && (
                      <button
                        type="button"
                        onClick={() => handleOpenUnavailableModal(item)}
                        className="px-2.5 py-2 border-2 border-rose-500/70 text-rose-300 font-black uppercase text-xs tracking-wider hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
                        title="Marcar como no disponible en comercio local"
                      >
                        <XCircle size={14} />
                      </button>
                    )}

                    {item.status === 'sourced' && (
                      <button
                        type="button"
                        onClick={() => handleOpenSourcedModal(item)}
                        className="px-3 py-2 border-2 border-ya-gray text-gray-300 font-mono text-xs hover:border-ya-lime hover:text-white transition-colors"
                      >
                        Editar coste
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal para marcar como conseguido / no disponible / editar */}
      {activeModalItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-ya-black border-4 border-ya-gray p-6 space-y-4">
            <div className="flex items-center justify-between border-b-2 border-ya-gray pb-3">
              <h3 className="font-black text-base uppercase tracking-wider text-white flex items-center gap-2">
                {modalTargetStatus === 'sourced' ? (
                  <>
                    <CheckCircle2 size={18} className="text-ya-lime" />
                    <span>Confirmar Abastecimiento</span>
                  </>
                ) : (
                  <>
                    <XCircle size={18} className="text-rose-500" />
                    <span>Marcar No Disponible</span>
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setActiveModalItem(null)}
                className="text-gray-400 hover:text-white font-mono text-xs uppercase"
              >
                ✕ Cerrar
              </button>
            </div>

            <div className="bg-ya-gray/30 p-3 border border-ya-gray text-xs font-mono">
              <p className="text-white font-black">{activeModalItem.product_name}</p>
              <p className="text-gray-400">
                Cantidad a comprar: <strong className="text-ya-lime">{activeModalItem.quantity} unidades</strong>
              </p>
              <p className="text-gray-400">
                Pedido: #{activeModalItem.order_number}
              </p>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase font-bold text-gray-300 mb-1">
                  Proveedor / Comercio de Compra
                </label>
                <input
                  type="text"
                  placeholder="Ej: Mercadona Plaza Madrid, Super Carmela, etc."
                  value={modalSupplier}
                  onChange={(e) => setModalSupplier(e.target.value)}
                  className="w-full px-3 py-2 bg-ya-gray border-2 border-ya-gray text-white text-xs font-mono focus:outline-none focus:border-ya-lime"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase font-bold text-gray-300 mb-1">
                  Coste Real de Compra (€)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ej: 2.15"
                  value={modalCost}
                  onChange={(e) => setModalCost(e.target.value)}
                  className="w-full px-3 py-2 bg-ya-gray border-2 border-ya-gray text-white text-xs font-mono focus:outline-none focus:border-ya-lime"
                />
                <span className="text-[10px] font-mono text-gray-500 mt-1 block">
                  Información interna para finanzas. No se muestra al cliente ni al repartidor.
                </span>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase font-bold text-gray-300 mb-1">
                  Notas Internas de Sourcing
                </label>
                <textarea
                  rows={2}
                  placeholder="Comentarios operativos para el equipo..."
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-ya-gray border-2 border-ya-gray text-white text-xs font-mono focus:outline-none focus:border-ya-lime resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModalItem(null)}
                  className="flex-1 py-2.5 border-2 border-ya-gray text-gray-300 uppercase text-xs font-black hover:border-white hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingModal}
                  className="flex-1 py-2.5 bg-ya-lime text-ya-black uppercase text-xs font-black hover:bg-white transition-colors disabled:opacity-50"
                >
                  {savingModal ? 'Guardando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
