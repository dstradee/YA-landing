import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Package,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { adminFetchOrderById, adminUpdateOrderStatus } from '../../lib/adminOrders';
import type { AdminOrderDetail, OrderStatus } from '../../types/app';
import { euro } from '../../data/products';

const statusBadges: Record<OrderStatus, { label: string; description: string; className: string }> = {
  received: {
    label: 'Recibido',
    description: 'Pedido registrado en Supabase, pendiente de comenzar compra/preparación.',
    className: 'border-yellow-400 text-yellow-400 bg-yellow-400/10',
  },
  preparing: {
    label: 'En preparación',
    description: 'Pedido en proceso de preparación en almacén/local.',
    className: 'border-blue-400 text-blue-400 bg-blue-400/10',
  },
  shopping: {
    label: 'Comprando',
    description: 'Adquiriendo artículos.',
    className: 'border-blue-400 text-blue-400 bg-blue-400/10',
  },
  sourcing: {
    label: 'Comprando en Jerez',
    description: 'Adquiriendo artículos de comercios locales de Jerez de la Frontera.',
    className: 'border-blue-400 text-blue-400 bg-blue-400/10',
  },
  ready: {
    label: 'Preparado',
    description: 'Empaquetado y listo para salida de reparto.',
    className: 'border-purple-400 text-purple-400 bg-purple-400/10',
  },
  prepared: {
    label: 'Preparado',
    description: 'Empaquetado y listo para salida de reparto.',
    className: 'border-purple-400 text-purple-400 bg-purple-400/10',
  },
  delivering: {
    label: 'En reparto',
    description: 'Repartidor en ruta activa hacia la dirección de entrega.',
    className: 'border-ya-lime text-ya-lime bg-ya-lime/10',
  },
  delivered: {
    label: 'Entregado',
    description: 'Entrega finalizada con éxito.',
    className: 'border-emerald-400 text-emerald-400 bg-emerald-400/10',
  },
  cancelled: {
    label: 'Cancelado',
    description: 'Pedido anulado.',
    className: 'border-rose-500 text-rose-500 bg-rose-500/10',
  },
};

// Estados permitidos por el modelo oficial de Postgres
const availableStatuses: { value: OrderStatus; label: string }[] = [
  { value: 'received', label: '1. Recibido' },
  { value: 'preparing', label: '2. En preparación' },
  { value: 'sourcing', label: '3. Comprando en Jerez' },
  { value: 'prepared', label: '4. Preparado' },
  { value: 'delivering', label: '5. En reparto' },
  { value: 'delivered', label: '6. Entregado' },
  { value: 'cancelled', label: '7. Cancelado' },
];

export function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados para la acción de cambio de estado
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus>('received');
  const [updating, setUpdating] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadOrder = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const res = await adminFetchOrderById(id);
    if (res.error) {
      setError(res.error);
    } else if (res.order) {
      setOrder(res.order);
      setSelectedStatus(res.order.status);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handleUpdateStatus = async () => {
    if (!order || selectedStatus === order.status) return;

    setUpdating(true);
    setActionFeedback(null);

    const res = await adminUpdateOrderStatus(order.id, selectedStatus);

    if (res.success) {
      setActionFeedback({
        type: 'success',
        message: `Estado actualizado con éxito a "${statusBadges[selectedStatus]?.label || selectedStatus}". Notificado en tiempo real.`,
      });
      // Actualizar estado local inmediatamente
      setOrder((prev) => (prev ? { ...prev, status: selectedStatus } : null));
    } else {
      setActionFeedback({
        type: 'error',
        message: res.error || 'No se pudo actualizar el estado del pedido.',
      });
    }

    setUpdating(false);
  };

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="w-12 h-12 border-4 border-ya-gray border-t-ya-lime animate-spin mx-auto mb-4"></div>
        <p className="font-mono text-xs uppercase tracking-widest text-gray-400">
          Cargando detalle del pedido...
        </p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-8 border-4 border-rose-500/50 bg-rose-500/10 text-center max-w-xl mx-auto space-y-4">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-black uppercase text-white">Pedido no encontrado</h2>
        <p className="text-xs text-gray-300 font-mono">{error || 'El identificador de pedido no existe.'}</p>
        <div className="pt-2">
          <Link
            to="/admin/pedidos"
            className="inline-flex items-center gap-2 px-4 py-2 bg-ya-lime text-ya-black font-black uppercase text-xs hover:bg-white transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Volver a Pedidos</span>
          </Link>
        </div>
      </div>
    );
  }

  const currentBadge = statusBadges[order.status] || {
    label: order.status,
    description: '',
    className: 'border-gray-500 text-gray-300',
  };

  const addressSnapshot = order.delivery_address_snapshot as {
    name?: string;
    phone?: string;
    street?: string;
    number?: string;
    floor?: string;
    floor_door?: string;
    postalCode?: string;
    postal_code?: string;
    city?: string;
    notes?: string;
  } | null;

  const dateObj = new Date(order.created_at);
  const formattedDate = dateObj.toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Top Breadcrumb / Return Link */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-ya-gray pb-4">
        <Link
          to="/admin/pedidos"
          className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-400 hover:text-ya-lime transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Volver al listado de pedidos</span>
        </Link>

        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-gray-400">ID: {order.id}</span>
          <button
            type="button"
            onClick={loadOrder}
            className="p-1.5 border border-ya-gray hover:border-ya-lime text-gray-400 hover:text-white transition-colors"
            title="Refrescar pedido"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Main Order Header */}
      <div className="border-4 border-ya-gray bg-ya-black p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white font-mono">
                {order.order_number}
              </h1>
              <span
                className={`px-3 py-1 text-xs font-black uppercase border-2 font-mono ${currentBadge.className}`}
              >
                {currentBadge.label}
              </span>
            </div>
            <p className="text-xs font-mono text-gray-400 capitalize mt-1 flex items-center gap-1.5">
              <Clock size={13} />
              <span>{formattedDate}</span>
            </p>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-mono text-gray-400 block uppercase">Total del Pedido</span>
            <span className="text-3xl font-black text-white font-mono">{euro(order.total)}</span>
          </div>
        </div>

        {/* Change Status Control Panel */}
        <div className="border-t-2 border-ya-gray pt-4 mt-2">
          <div className="text-xs font-black uppercase tracking-wider text-ya-lime font-mono mb-2 flex items-center gap-2">
            <span>Control de Estado Operativo</span>
            <span className="text-[10px] text-gray-400 lowercase font-normal">(Supabase Realtime)</span>
          </div>

          {actionFeedback && (
            <div
              className={`p-3 mb-3 border-2 text-xs font-mono flex items-center gap-2 ${
                actionFeedback.type === 'success'
                  ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300'
                  : 'border-rose-500 bg-rose-500/10 text-rose-300'
              }`}
            >
              {actionFeedback.type === 'success' ? (
                <CheckCircle2 size={16} className="shrink-0" />
              ) : (
                <AlertTriangle size={16} className="shrink-0" />
              )}
              <span>{actionFeedback.message}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as OrderStatus)}
              className="flex-1 bg-ya-gray border-2 border-ya-gray text-white px-4 py-3 font-mono text-xs uppercase font-bold focus:outline-none focus:border-ya-lime"
            >
              {availableStatuses.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={updating || selectedStatus === order.status}
              onClick={handleUpdateStatus}
              className="px-6 py-3 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
            >
              {updating ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Actualizando...</span>
                </>
              ) : (
                <span>Aplicar Cambio de Estado</span>
              )}
            </button>
          </div>
          <p className="text-[11px] font-mono text-gray-400 mt-2">
            {statusBadges[selectedStatus]?.description}
          </p>
        </div>
      </div>

      {/* Grid: 2 Columns (Items vs Customer & Delivery) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Col 1 & 2: Products Breakdown */}
        <div className="lg:col-span-2 space-y-6">
          <div className="border-4 border-ya-gray bg-ya-black p-6">
            <h2 className="text-base font-black uppercase tracking-wider text-white mb-4 border-b-2 border-ya-gray pb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Package size={18} className="text-ya-lime" />
                <span>Productos del Pedido ({order.items.length})</span>
              </span>
              <span className="text-[11px] font-mono text-gray-400">Precios congelados</span>
            </h2>

            {order.items.length === 0 ? (
              <div className="py-8 text-center text-gray-400 font-mono text-xs">
                No hay líneas registradas para este pedido.
              </div>
            ) : (
              <div className="divide-y-2 divide-ya-gray">
                {order.items.map((item) => (
                  <div key={item.id} className="py-3.5 flex items-center justify-between gap-4 font-mono">
                    <div>
                      <div className="font-sans font-black text-white text-sm">
                        {item.product_name}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {item.quantity} × {euro(item.unit_price)}
                      </div>
                    </div>
                    <div className="font-black text-white text-sm text-right">
                      {euro(item.subtotal)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Financial Totals Breakdown */}
            <div className="border-t-4 border-ya-gray mt-6 pt-4 space-y-2 font-mono text-xs">
              <div className="flex justify-between text-gray-400">
                <span>Subtotal artículos:</span>
                <span className="text-white">{euro(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Coste de entrega en Jerez:</span>
                <span className="text-white">{euro(order.delivery_fee)}</span>
              </div>
              <div className="flex justify-between text-white font-black text-base border-t-2 border-ya-gray pt-3">
                <span className="uppercase">TOTAL FACTURADO:</span>
                <span className="text-ya-lime">{euro(order.total)}</span>
              </div>
            </div>
          </div>

          {/* Customer Order Notes */}
          {order.notes && (
            <div className="border-4 border-ya-gray bg-ya-black p-6">
              <h2 className="text-xs font-black uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-2">
                <FileText size={16} className="text-ya-lime" />
                <span>Notas del Cliente / Instrucciones de Entrega</span>
              </h2>
              <p className="text-sm font-mono text-white bg-ya-gray/30 p-3 border border-ya-gray">
                "{order.notes}"
              </p>
            </div>
          )}
        </div>

        {/* Col 3: Customer & Delivery Info */}
        <div className="space-y-6">
          {/* Customer Card */}
          <div className="border-4 border-ya-gray bg-ya-black p-6">
            <h2 className="text-base font-black uppercase tracking-wider text-white mb-4 border-b-2 border-ya-gray pb-3 flex items-center gap-2">
              <User size={18} className="text-ya-lime" />
              <span>Datos del Cliente</span>
            </h2>

            <div className="space-y-3 text-xs font-mono">
              <div>
                <span className="text-gray-400 block text-[10px] uppercase">Nombre</span>
                <span className="text-white font-bold font-sans text-sm block">
                  {addressSnapshot?.name || order.customer?.full_name || 'Cliente YA'}
                </span>
              </div>

              <div>
                <span className="text-gray-400 block text-[10px] uppercase">Teléfono</span>
                <span className="text-white flex items-center gap-1.5">
                  <Phone size={13} className="text-ya-lime" />
                  <span>{addressSnapshot?.phone || order.customer?.phone || 'No especificado'}</span>
                </span>
              </div>

              <div>
                <span className="text-gray-400 block text-[10px] uppercase">Email</span>
                <span className="text-white flex items-center gap-1.5">
                  <Mail size={13} className="text-ya-lime" />
                  <span className="truncate">
                    {order.customer?.email || 'No disponible'}
                  </span>
                </span>
              </div>

              {order.user_id && (
                <div className="pt-2 border-t border-ya-gray">
                  <Link
                    to={`/admin/clientes/${order.user_id}`}
                    className="text-xs font-black uppercase text-ya-lime hover:underline flex items-center gap-1"
                  >
                    <span>Ver ficha del cliente</span>
                    <span>→</span>
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Delivery Address Card (Snapshot) */}
          <div className="border-4 border-ya-gray bg-ya-black p-6">
            <h2 className="text-base font-black uppercase tracking-wider text-white mb-4 border-b-2 border-ya-gray pb-3 flex items-center gap-2">
              <MapPin size={18} className="text-ya-lime" />
              <span>Dirección de Entrega</span>
            </h2>

            {addressSnapshot ? (
              <div className="space-y-2 text-xs font-mono">
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase">Calle y Número</span>
                  <span className="text-white font-bold block font-sans">
                    {addressSnapshot.street} {addressSnapshot.number}
                  </span>
                </div>

                {(addressSnapshot.floor || addressSnapshot.floor_door) && (
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Piso / Puerta</span>
                    <span className="text-white block">
                      {addressSnapshot.floor || addressSnapshot.floor_door}
                    </span>
                  </div>
                )}

                <div>
                  <span className="text-gray-400 block text-[10px] uppercase">Código Postal & Ciudad</span>
                  <span className="text-white block">
                    {addressSnapshot.postalCode || addressSnapshot.postal_code || '11401'} — {addressSnapshot.city || 'Jerez de la Frontera'}
                  </span>
                </div>

                {addressSnapshot.notes && (
                  <div className="pt-1">
                    <span className="text-gray-400 block text-[10px] uppercase">Aclaración</span>
                    <span className="text-gray-300 block italic">"{addressSnapshot.notes}"</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs font-mono text-gray-400">
                Dirección general en Jerez de la Frontera.
              </div>
            )}
          </div>

          {/* Payment Method Card */}
          <div className="border-4 border-ya-gray bg-ya-black p-6">
            <h2 className="text-base font-black uppercase tracking-wider text-white mb-4 border-b-2 border-ya-gray pb-3 flex items-center gap-2">
              <CreditCard size={18} className="text-ya-lime" />
              <span>Método de Pago</span>
            </h2>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Método:</span>
                <span className="font-bold text-white uppercase px-2 py-0.5 border border-ya-gray bg-ya-gray/30">
                  {order.payment_method.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Estado de pago:</span>
                <span className="font-bold text-ya-lime uppercase">
                  {order.payment_status}
                </span>
              </div>
              <p className="text-[10px] text-gray-400 pt-1">
                Transacción de prueba (Phase 2D). Pagos reales con Stripe programados para fases posteriores.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
