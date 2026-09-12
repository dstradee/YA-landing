import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ShoppingBag,
  Search,
  ArrowUpDown,
  RefreshCw,
  AlertTriangle,
  ArrowUpRight,
  Eye,
  MapPin,
  Trash2,
  CheckCircle2,
  X,
  CheckSquare,
  Square,
} from 'lucide-react';
import { adminFetchOrders, adminSubscribeToOrders, adminDeleteOrders } from '../../lib/adminOrders';
import type { AdminOrderListItem, OrderStatus } from '../../types/app';
import { euro } from '../../data/products';

const statusBadges: Record<OrderStatus, { label: string; className: string }> = {
  payment_pending: {
    label: '⚠️ PENDIENTE DE PAGO — NO PREPARAR',
    className: 'border-amber-500 text-amber-400 bg-amber-500/10 font-black animate-pulse',
  },
  received: { label: 'Recibido', className: 'border-yellow-400 text-yellow-400 bg-yellow-400/10' },
  preparing: { label: 'En preparación', className: 'border-blue-400 text-blue-400 bg-blue-400/10' },
  shopping: { label: 'Comprando', className: 'border-blue-400 text-blue-400 bg-blue-400/10' },
  sourcing: { label: 'Comprando en Jerez', className: 'border-blue-400 text-blue-400 bg-blue-400/10' },
  ready: { label: 'Preparado', className: 'border-purple-400 text-purple-400 bg-purple-400/10' },
  prepared: { label: 'Preparado', className: 'border-purple-400 text-purple-400 bg-purple-400/10' },
  delivering: { label: 'En reparto', className: 'border-ya-lime text-ya-lime bg-ya-lime/10' },
  delivered: { label: 'Entregado', className: 'border-emerald-400 text-emerald-400 bg-emerald-400/10' },
  cancelled: { label: 'Cancelado', className: 'border-rose-500 text-rose-500 bg-rose-500/10' },
};

const filterTabs = [
  { key: 'all', label: 'Todos' },
  { key: 'payment_pending', label: '⚠️ Pendientes de pago' },
  { key: 'received', label: 'Recibidos' },
  { key: 'preparing', label: 'En preparación' },
  { key: 'sourcing', label: 'Comprando' },
  { key: 'prepared', label: 'Preparados' },
  { key: 'delivering', label: 'En reparto' },
  { key: 'delivered', label: 'Entregados' },
  { key: 'cancelled', label: 'Cancelados' },
];

export function AdminOrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStatus = searchParams.get('status') || 'all';

  const [orders, setOrders] = useState<AdminOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [sortAsc, setSortAsc] = useState(false);

  // Eliminación y selección de pedidos
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; targetIds: string[]; title: string } | null>(null);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const toggleSelectOrder = (id: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.length === orders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(orders.map((o) => o.id));
    }
  };

  const selectOnlyTestOrders = () => {
    const testIds = orders.filter((o) => o.is_test).map((o) => o.id);
    setSelectedOrderIds(testIds);
  };

  const handleConfirmDelete = async () => {
    if (!confirmModal || confirmModal.targetIds.length === 0) return;
    setIsDeleting(true);
    setActionNotice(null);
    const count = confirmModal.targetIds.length;
    const res = await adminDeleteOrders(confirmModal.targetIds);
    setIsDeleting(false);
    setConfirmModal(null);

    if (res.success) {
      setActionNotice({
        type: 'success',
        message: `Se han eliminado correctamente ${res.count || count} pedido(s) y todas sus relaciones (pagos, eventos, repartos).`,
      });
      setSelectedOrderIds((prev) => prev.filter((id) => !confirmModal.targetIds.includes(id)));
      loadOrders();
    } else {
      setActionNotice({
        type: 'error',
        message: `Error al eliminar pedidos: ${res.error}`,
      });
    }
  };

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await adminFetchOrders({
      status: statusFilter,
      search: searchTerm,
      sortAsc,
    });

    if (res.error) {
      setError(res.error);
    } else {
      setOrders(res.data);
    }
    setLoading(false);
  }, [statusFilter, searchTerm, sortAsc]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Actualizar parámetro URL cuando cambia filtro de estado
  const handleStatusChange = (status: string) => {
    setStatusFilter(status);
    if (status === 'all') {
      searchParams.delete('status');
    } else {
      searchParams.set('status', status);
    }
    setSearchParams(searchParams);
  };

  // Suscribirse a cambios en tiempo real en la tabla de pedidos
  useEffect(() => {
    const unsubscribe = adminSubscribeToOrders(() => {
      loadOrders();
    });
    return () => {
      unsubscribe();
    };
  }, [loadOrders]);

  return (
    <div className="space-y-6">
      {/* Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-ya-gray pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            <ShoppingBag className="text-ya-lime" size={28} />
            <span>Gestión de Pedidos</span>
            <span className="text-xs px-2 py-0.5 border border-ya-gray bg-ya-gray/30 text-gray-300 font-mono">
              {orders.length} pedidos
            </span>
          </h1>
          <p className="text-xs font-mono text-gray-400 mt-1">
            Visualiza, filtra y actualiza en tiempo real el ciclo de vida de cada entrega
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSortAsc(!sortAsc)}
            className="flex items-center gap-1.5 px-3 py-2 border-2 border-ya-gray hover:border-white text-xs font-black uppercase tracking-wider text-gray-300 hover:text-white transition-colors"
            title="Cambiar orden por fecha"
          >
            <ArrowUpDown size={14} />
            <span>{sortAsc ? 'Más antiguos' : 'Más recientes'}</span>
          </button>

          <button
            type="button"
            onClick={loadOrders}
            className="flex items-center gap-1.5 px-3 py-2 bg-ya-lime text-ya-black hover:bg-white text-xs font-black uppercase tracking-wider transition-colors"
          >
            <RefreshCw size={14} />
            <span>Refrescar</span>
          </button>
        </div>
      </div>

      {/* Alertas de acción */}
      {actionNotice && (
        <div
          className={`p-4 border-4 font-mono text-xs flex items-center justify-between gap-3 ${
            actionNotice.type === 'success'
              ? 'border-ya-lime bg-ya-lime/10 text-white'
              : 'border-red-500 bg-red-500/10 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionNotice.type === 'success' ? (
              <CheckCircle2 size={18} className="text-ya-lime shrink-0" />
            ) : (
              <AlertTriangle size={18} className="text-red-400 shrink-0" />
            )}
            <span>{actionNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="p-1 hover:text-white text-gray-400"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Barra de Gestión y Eliminación Masiva */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-2 border-ya-gray bg-ya-gray/10 font-mono text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="px-2.5 py-1.5 border border-ya-gray hover:border-white text-gray-300 hover:text-white flex items-center gap-1.5 font-bold uppercase text-[10px]"
          >
            {selectedOrderIds.length > 0 && selectedOrderIds.length === orders.length ? (
              <CheckSquare size={13} className="text-ya-lime" />
            ) : (
              <Square size={13} />
            )}
            <span>
              {selectedOrderIds.length === orders.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </span>
          </button>

          <button
            type="button"
            onClick={selectOnlyTestOrders}
            className="px-2.5 py-1.5 border border-purple-500/50 bg-purple-950/20 text-purple-300 hover:border-purple-400 flex items-center gap-1.5 font-bold uppercase text-[10px]"
          >
            <span>🧪 Seleccionar de prueba</span>
          </button>

          {selectedOrderIds.length > 0 && (
            <span className="text-ya-lime font-bold text-[11px] px-2">
              {selectedOrderIds.length} seleccionado(s)
            </span>
          )}
        </div>

        {selectedOrderIds.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setConfirmModal({
                open: true,
                targetIds: selectedOrderIds,
                title: `Eliminar ${selectedOrderIds.length} pedidos seleccionados`,
              })
            }
            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-black uppercase text-[11px] tracking-wider flex items-center gap-1.5 transition-colors shadow-[2px_2px_0px_0px_#000]"
          >
            <Trash2 size={14} />
            <span>Eliminar seleccionados ({selectedOrderIds.length})</span>
          </button>
        )}
      </div>

      {/* Modal de Confirmación de Eliminación Segura */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-ya-black border-4 border-red-500 max-w-md w-full p-6 space-y-4 font-mono">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-500/20 border-2 border-red-500 text-red-400 shrink-0">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-tight">
                  {confirmModal.title}
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Esta acción es definitiva. Se comprobarán y desvincularán automáticamente las dependencias asociadas (pagos, eventos de estado, líneas y entregas) para evitar claves huérfanas.
                </p>
              </div>
            </div>

            <div className="bg-ya-gray/20 border border-ya-gray p-3 text-xs text-gray-300 space-y-1">
              <div className="text-white font-bold text-[11px] uppercase">
                Pedidos a eliminar: {confirmModal.targetIds.length}
              </div>
              <p className="text-[10px] text-gray-400">
                Afectará exclusivamente al entorno administrativo y eliminará los registros de prueba o erróneos sin afectar a pedidos legítimos.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t-2 border-ya-gray">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 border-2 border-ya-gray text-gray-300 font-bold uppercase text-xs hover:border-white hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-black uppercase text-xs flex items-center gap-2 tracking-wider"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Eliminando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Sí, eliminar definitivamente</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="space-y-3">
        {/* Search input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
            <Search size={16} />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por número de pedido (ej: YA-1001), cliente, teléfono o email..."
            className="w-full pl-10 pr-4 py-3 bg-ya-black border-2 border-ya-gray text-white placeholder-gray-500 font-mono text-xs focus:outline-none focus:border-ya-lime transition-colors"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs font-mono text-gray-400 hover:text-white"
            >
              LIMPIAR
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {filterTabs.map((tab) => {
            const isActive = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleStatusChange(tab.key)}
                className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-ya-lime bg-ya-lime text-ya-black'
                    : 'border-ya-gray bg-ya-black text-gray-400 hover:text-white hover:border-gray-500'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-10 h-10 border-4 border-ya-gray border-t-ya-lime animate-spin mx-auto mb-3"></div>
          <p className="font-mono text-xs uppercase tracking-widest text-gray-400">
            Cargando pedidos de Supabase...
          </p>
        </div>
      ) : error ? (
        <div className="p-8 border-4 border-rose-500/50 bg-rose-500/10 text-center max-w-lg mx-auto">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <div className="text-base font-black uppercase text-white mb-2">
            No se han podido cargar los datos
          </div>
          <p className="text-xs text-gray-300 font-mono mb-4">{error}</p>
          <button
            type="button"
            onClick={loadOrders}
            className="px-4 py-2 bg-ya-lime text-ya-black font-black uppercase text-xs"
          >
            Reintentar
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="border-4 border-dashed border-ya-gray p-12 text-center bg-ya-gray/5">
          <ShoppingBag className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <div className="text-base font-black uppercase text-white mb-1">
            Todavía no hay pedidos
          </div>
          <p className="text-xs font-mono text-gray-400 max-w-sm mx-auto">
            {searchTerm || statusFilter !== 'all'
              ? 'No hay pedidos que coincidan con los filtros aplicados. Intenta ampliar la búsqueda o cambiar de estado.'
              : 'Cuando los clientes confirmen sus compras a través del checkout, aparecerán aquí en tiempo real.'}
          </p>
          {(searchTerm || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                handleStatusChange('all');
              }}
              className="mt-4 px-4 py-2 border-2 border-ya-lime text-ya-lime text-xs font-black uppercase tracking-wider hover:bg-ya-lime hover:text-ya-black transition-colors"
            >
              Restablecer filtros
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table Layout */}
          <div className="hidden md:block border-4 border-ya-gray bg-ya-black overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b-4 border-ya-gray bg-ya-gray/30 text-gray-400 font-mono uppercase text-[11px]">
                    <th className="py-3 px-3 w-10 text-center font-black">
                      <input
                        type="checkbox"
                        checked={orders.length > 0 && selectedOrderIds.length === orders.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 accent-ya-lime cursor-pointer"
                        title="Seleccionar / Deseleccionar todos"
                      />
                    </th>
                    <th className="py-3 px-4 font-black">Nº Pedido</th>
                    <th className="py-3 px-4 font-black">Fecha / Hora</th>
                    <th className="py-3 px-4 font-black">Cliente</th>
                    <th className="py-3 px-4 font-black">Dirección</th>
                    <th className="py-3 px-4 font-black">Pago</th>
                    <th className="py-3 px-4 font-black">Estado</th>
                    <th className="py-3 px-4 font-black text-right">Total</th>
                    <th className="py-3 px-4 font-black text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-ya-gray font-mono">
                  {orders.map((ord) => {
                    const isSelected = selectedOrderIds.includes(ord.id);
                    const badge = statusBadges[ord.status] || {
                      label: ord.status,
                      className: 'border-gray-500 text-gray-300',
                    };
                    const dateObj = new Date(ord.created_at);
                    const formattedDate = dateObj.toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                    });
                    const formattedTime = dateObj.toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    const snapshot = ord.delivery_address_snapshot as {
                      street?: string;
                      number?: string;
                      city?: string;
                    } | null;
                    const addressText = snapshot?.street
                      ? `${snapshot.street} ${snapshot.number || ''}, ${snapshot.city || 'Jerez'}`
                      : 'Jerez de la Frontera';

                    return (
                      <tr
                        key={ord.id}
                        className={`transition-colors ${
                          isSelected ? 'bg-ya-lime/10 hover:bg-ya-lime/15' : 'hover:bg-ya-gray/20'
                        }`}
                      >
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOrder(ord.id)}
                            className="w-4 h-4 accent-ya-lime cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link
                              to={`/admin/pedidos/${ord.id}`}
                              className="font-black text-white hover:text-ya-lime text-sm tracking-tight flex items-center gap-1.5"
                            >
                              <span>{ord.order_number}</span>
                            </Link>
                            {ord.is_test && (
                              <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500">
                                🧪 PRUEBA
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-400 font-sans">
                            {ord.itemsCount} {ord.itemsCount === 1 ? 'artículo' : 'artículos'}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="text-white font-bold">{formattedDate}</div>
                          <div className="text-[10px] text-gray-400">{formattedTime}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-sans font-bold text-white truncate max-w-[150px]">
                            {ord.customerName}
                          </div>
                          {ord.customerPhone && (
                            <div className="text-[10px] text-gray-400">{ord.customerPhone}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 max-w-[180px]">
                          <div className="truncate text-gray-300 font-sans text-[11px]" title={addressText}>
                            {addressText}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1">
                            <span className="inline-block px-2 py-0.5 text-[10px] uppercase font-bold border border-ya-gray bg-ya-gray/30 text-gray-300 w-fit">
                              {ord.payment_method.replace('_', ' ')}
                            </span>
                            <span
                              className={`text-[9px] font-black uppercase px-1.5 py-0.5 border w-fit ${
                                ord.payment_status === 'paid'
                                  ? 'border-ya-lime text-ya-lime bg-ya-lime/10'
                                  : ord.payment_status === 'failed' || ord.payment_status === 'cancelled'
                                  ? 'border-rose-500 text-rose-400 bg-rose-950/20'
                                  : 'border-amber-400 text-amber-400 bg-amber-950/20'
                              }`}
                            >
                              {ord.payment_status === 'paid'
                                ? '● Pagado'
                                : ord.payment_status === 'failed'
                                ? '● Fallido'
                                : ord.payment_status === 'cancelled'
                                ? '● Cancelado'
                                : '○ Pendiente'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {ord.status === 'payment_pending' || (ord.payment_status === 'pending' && ord.status !== 'cancelled') ? (
                            <span className="inline-block px-2.5 py-1 text-[10px] font-black uppercase border-2 border-amber-500 text-amber-400 bg-amber-500/10 animate-pulse">
                              ⚠️ PENDIENTE DE PAGO — NO PREPARAR
                            </span>
                          ) : (
                            <span
                              className={`inline-block px-2.5 py-1 text-[10px] font-black uppercase border-2 ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-sm font-black text-white">{euro(ord.total)}</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              to={`/admin/pedidos/${ord.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 border-2 border-ya-gray text-gray-300 hover:border-ya-lime hover:text-ya-lime text-xs font-black uppercase transition-colors"
                              title="Ver detalle del pedido"
                            >
                              <Eye size={13} />
                              <span>Detalle</span>
                            </Link>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmModal({
                                  open: true,
                                  targetIds: [ord.id],
                                  title: `Eliminar pedido ${ord.order_number}`,
                                })
                              }
                              className="p-1.5 border-2 border-ya-gray hover:border-red-500 text-gray-400 hover:text-red-400 transition-colors"
                              title="Eliminar pedido definitivamente"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card Layout */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {orders.map((ord) => {
              const isSelected = selectedOrderIds.includes(ord.id);
              const badge = statusBadges[ord.status] || {
                label: ord.status,
                className: 'border-gray-500 text-gray-300',
              };
              const dateObj = new Date(ord.created_at);
              const formattedDate = dateObj.toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              });
              const snapshot = ord.delivery_address_snapshot as {
                street?: string;
                number?: string;
                city?: string;
              } | null;
              const addressText = snapshot?.street
                ? `${snapshot.street} ${snapshot.number || ''}, ${snapshot.city || 'Jerez'}`
                : 'Jerez de la Frontera';

              return (
                <div
                  key={ord.id}
                  className={`border-2 p-4 space-y-3 transition-colors ${
                    isSelected
                      ? 'border-ya-lime bg-ya-lime/10'
                      : 'border-ya-gray bg-ya-black hover:border-ya-lime'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOrder(ord.id)}
                        className="w-4 h-4 accent-ya-lime cursor-pointer"
                      />
                      <Link
                        to={`/admin/pedidos/${ord.id}`}
                        className="font-black text-white hover:text-ya-lime text-base tracking-tight font-mono"
                      >
                        {ord.order_number}
                      </Link>
                      {ord.is_test && (
                        <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500">
                          🧪 PRUEBA
                        </span>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-black uppercase border-2 font-mono ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1 border-t border-ya-gray/60">
                    <div>
                      <span className="text-gray-400 block text-[10px]">CLIENTE</span>
                      <span className="font-bold text-white truncate block">{ord.customerName}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-400 block text-[10px]">TOTAL</span>
                      <span className="font-black text-white text-sm">{euro(ord.total)}</span>
                    </div>
                  </div>

                  <div className="text-[11px] text-gray-400 font-mono flex items-start gap-1.5">
                    <MapPin size={13} className="text-ya-lime shrink-0 mt-0.5" />
                    <span className="truncate">{addressText}</span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-ya-gray text-xs">
                    <span className="text-[10px] font-mono text-gray-400">{formattedDate}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmModal({
                            open: true,
                            targetIds: [ord.id],
                            title: `Eliminar pedido ${ord.order_number}`,
                          })
                        }
                        className="p-1.5 border border-ya-gray hover:border-red-500 text-gray-400 hover:text-red-400"
                        title="Eliminar pedido"
                      >
                        <Trash2 size={13} />
                      </button>
                      <Link
                        to={`/admin/pedidos/${ord.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-ya-lime text-ya-black font-black uppercase text-[11px] tracking-wider hover:bg-white transition-colors"
                      >
                        <span>Ver Pedido</span>
                        <ArrowUpRight size={13} />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
