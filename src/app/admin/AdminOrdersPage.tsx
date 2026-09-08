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
} from 'lucide-react';
import { adminFetchOrders, adminSubscribeToOrders } from '../../lib/adminOrders';
import type { AdminOrderListItem, OrderStatus } from '../../types/app';
import { euro } from '../../data/products';

const statusBadges: Record<OrderStatus, { label: string; className: string }> = {
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
                    <th className="py-3 px-4 font-black">Nº Pedido</th>
                    <th className="py-3 px-4 font-black">Fecha / Hora</th>
                    <th className="py-3 px-4 font-black">Cliente</th>
                    <th className="py-3 px-4 font-black">Dirección</th>
                    <th className="py-3 px-4 font-black">Pago</th>
                    <th className="py-3 px-4 font-black">Estado</th>
                    <th className="py-3 px-4 font-black text-right">Total</th>
                    <th className="py-3 px-4 font-black text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-ya-gray font-mono">
                  {orders.map((ord) => {
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
                      <tr key={ord.id} className="hover:bg-ya-gray/20 transition-colors">
                        <td className="py-3 px-4">
                          <Link
                            to={`/admin/pedidos/${ord.id}`}
                            className="font-black text-white hover:text-ya-lime text-sm tracking-tight flex items-center gap-1.5"
                          >
                            <span>{ord.order_number}</span>
                          </Link>
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
                          <span className="inline-block px-2 py-0.5 text-[10px] uppercase font-bold border border-ya-gray bg-ya-gray/30 text-gray-300">
                            {ord.payment_method.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-1 text-[10px] font-black uppercase border-2 ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-sm font-black text-white">{euro(ord.total)}</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link
                            to={`/admin/pedidos/${ord.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 border-2 border-ya-gray text-gray-300 hover:border-ya-lime hover:text-ya-lime text-xs font-black uppercase transition-colors"
                          >
                            <Eye size={13} />
                            <span>Detalle</span>
                          </Link>
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
                  className="border-2 border-ya-gray bg-ya-black p-4 space-y-3 hover:border-ya-lime transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <Link
                      to={`/admin/pedidos/${ord.id}`}
                      className="font-black text-white hover:text-ya-lime text-base tracking-tight font-mono"
                    >
                      {ord.order_number}
                    </Link>
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
                    <Link
                      to={`/admin/pedidos/${ord.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-ya-lime text-ya-black font-black uppercase text-[11px] tracking-wider hover:bg-white transition-colors"
                    >
                      <span>Ver Pedido</span>
                      <ArrowUpRight size={13} />
                    </Link>
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
