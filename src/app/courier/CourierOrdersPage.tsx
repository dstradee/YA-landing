import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  Search,
  MapPin,
  RefreshCw,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import {
  courierFetchCurrentProfile,
  courierFetchOrders,
  courierUpdateOrderStatus,
  courierSubscribeToOrders,
} from '../../lib/courierOrders';
import type { CourierOrderListItem, DbCourier, OrderStatus } from '../../types/app';

export function CourierOrdersPage() {
  const [courier, setCourier] = useState<DbCourier | null>(null);
  const [orders, setOrders] = useState<CourierOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'active' | 'all'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);

  const loadOrders = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setActionError(null);

    const profileRes = await courierFetchCurrentProfile();
    if (profileRes.courier) {
      setCourier(profileRes.courier);
      const ordersRes = await courierFetchOrders({
        courierId: profileRes.courier.id,
        filter: tab === 'active' ? 'active' : 'all',
      });
      setOrders(ordersRes.orders);
    }

    setLoading(false);
    setRefreshing(false);
  }, [tab]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Suscripción en tiempo real
  useEffect(() => {
    if (!courier?.id) return;
    const unsub = courierSubscribeToOrders(courier.id, () => {
      loadOrders(true);
    });
    return () => unsub();
  }, [courier?.id, loadOrders]);

  const handleOrderAction = async (
    orderId: string,
    action: 'accept' | 'delivering' | 'delivered'
  ) => {
    if (!courier) return;

    if (action === 'delivered') {
      const confirmDeliver = window.confirm(
        '¿Confirmas que has entregado el pedido al cliente en su domicilio?'
      );
      if (!confirmDeliver) return;
    }

    setProcessingOrderId(orderId);
    setActionError(null);

    const res = await courierUpdateOrderStatus({
      orderId,
      courierId: courier.id,
      action,
    });

    if (res.error) {
      setActionError(res.error);
    } else {
      await loadOrders(true);
    }

    setProcessingOrderId(null);
  };

  const filteredOrders = orders.filter((o) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const orderNum = o.order_number.toLowerCase();
    const customer = o.customerName.toLowerCase();
    const street = (o.deliveryAddress?.street || o.delivery_address_snapshot?.street || '').toLowerCase();
    return orderNum.includes(term) || customer.includes(term) || street.includes(term);
  });

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'received':
        return (
          <span className="px-2 py-0.5 bg-yellow-950/80 border border-yellow-500 text-yellow-400 text-[10px] font-black uppercase tracking-wider">
            Asignado · Aceptar
          </span>
        );
      case 'preparing':
      case 'sourcing':
        return (
          <span className="px-2 py-0.5 bg-blue-950/80 border border-blue-500 text-blue-400 text-[10px] font-black uppercase tracking-wider">
            En Preparación
          </span>
        );
      case 'prepared':
        return (
          <span className="px-2 py-0.5 bg-purple-950/80 border border-purple-500 text-purple-400 text-[10px] font-black uppercase tracking-wider">
            Listo Recogida
          </span>
        );
      case 'delivering':
        return (
          <span className="px-2 py-0.5 bg-ya-lime text-ya-black border border-ya-lime text-[10px] font-black uppercase tracking-wider animate-pulse">
            En Camino
          </span>
        );
      case 'delivered':
        return (
          <span className="px-2 py-0.5 bg-green-950/80 border border-green-500 text-green-400 text-[10px] font-black uppercase tracking-wider">
            Entregado
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2 py-0.5 bg-red-950/80 border border-red-500 text-red-400 text-[10px] font-black uppercase tracking-wider">
            Cancelado
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 bg-ya-gray border border-gray-600 text-gray-300 text-[10px] font-black uppercase tracking-wider">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Título y refresco */}
      <div className="flex items-center justify-between border-b-2 border-ya-gray pb-3">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Mis Pedidos</h1>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
            Gestiona tus repartos asignados
          </p>
        </div>

        <button
          onClick={() => loadOrders(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-ya-gray/50 hover:bg-ya-gray border border-ya-gray text-xs font-black uppercase tracking-wider text-gray-300 hover:text-white transition-colors"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin text-ya-lime' : ''} />
          <span>Refrescar</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2 bg-ya-gray/30 p-1 border-2 border-ya-gray">
        <button
          onClick={() => setTab('active')}
          className={`py-2 text-xs font-black uppercase tracking-wider transition-colors ${
            tab === 'active'
              ? 'bg-ya-lime text-ya-black shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Activos ({orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length})
        </button>
        <button
          onClick={() => setTab('all')}
          className={`py-2 text-xs font-black uppercase tracking-wider transition-colors ${
            tab === 'all'
              ? 'bg-ya-lime text-ya-black shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Todos ({orders.length})
        </button>
      </div>

      {/* Barra de búsqueda */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por Nº pedido, cliente o calle..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-ya-black border-2 border-ya-gray text-xs text-white placeholder-gray-500 focus:border-ya-lime focus:outline-none"
        />
      </div>

      {/* Alerta de error */}
      {actionError && (
        <div className="bg-red-950/60 border-2 border-red-600 p-3 text-red-300 text-xs flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Lista de pedidos */}
      {loading ? (
        <div className="py-12 border-2 border-ya-gray bg-ya-gray/20 text-center">
          <div className="w-8 h-8 border-3 border-ya-lime border-t-transparent animate-spin mx-auto mb-2" />
          <p className="text-xs font-black uppercase tracking-wider text-gray-400">
            Cargando pedidos...
          </p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="border-2 border-ya-gray bg-ya-gray/20 p-8 text-center">
          <div className="w-12 h-12 bg-ya-gray flex items-center justify-center mx-auto mb-3 text-gray-400">
            <Package size={24} />
          </div>
          <h3 className="font-black uppercase tracking-tight text-base mb-1">
            {searchTerm ? 'Sin coincidencias' : 'No hay pedidos en esta sección'}
          </h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            {searchTerm
              ? 'Prueba a buscar con otro término o limpia el buscador.'
              : 'Cuando se te asigne un pedido aparecerá en esta lista.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const isProcessing = processingOrderId === order.id;
            const isPaid = order.payment_status === 'paid';
            const isDelivering = order.status === 'delivering';
            const isReceived = order.status === 'received';
            const isPrepared = order.status === 'prepared' || order.status === 'preparing' || order.status === 'sourcing';
            const isDelivered = order.status === 'delivered';

            const addressText = order.deliveryAddress
              ? `${order.deliveryAddress.street || ''} ${order.deliveryAddress.number || ''}${
                  order.deliveryAddress.floor ? `, ${order.deliveryAddress.floor}` : ''
                }`
              : order.delivery_address_snapshot?.street || 'Dirección no especificada';

            return (
              <div
                key={order.id}
                className="border-2 border-ya-gray bg-ya-gray/30 hover:border-gray-500 transition-colors p-4 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black font-mono text-sm text-ya-lime">
                        {order.order_number}
                      </span>
                      {order.is_test && (
                        <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500">
                          🧪 PRUEBA
                        </span>
                      )}
                      {getStatusBadge(order.status)}
                    </div>
                    <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                      {new Date(order.created_at).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      • {new Date(order.created_at).toLocaleDateString('es-ES')}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-black text-white">
                      {Number(order.total).toFixed(2)} €
                    </div>
                    <div className="text-[10px] font-bold">
                      {isPaid ? (
                        <span className="text-green-400">Pagado</span>
                      ) : (
                        <span className="text-yellow-400">⚠️ Pago Pendiente</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Cliente y dirección */}
                <div className="bg-ya-black/50 border border-ya-gray/70 p-2.5 text-xs flex items-start gap-2">
                  <MapPin size={15} className="text-ya-lime shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-gray-200 truncate">{addressText}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {order.customerName} {order.customerPhone ? `• ${order.customerPhone}` : ''}
                    </div>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-ya-gray">
                  <Link
                    to={`/repartidor/pedidos/${order.id}`}
                    className="text-xs font-black uppercase tracking-wider text-gray-300 hover:text-white flex items-center gap-1"
                  >
                    <span>Detalle</span>
                    <ChevronRight size={13} />
                  </Link>

                  <div className="flex items-center gap-2">
                    {isReceived && (
                      <button
                        onClick={() => handleOrderAction(order.id, 'accept')}
                        disabled={isProcessing}
                        className="px-3 py-1.5 bg-yellow-400 text-ya-black text-xs font-black uppercase tracking-wider hover:bg-white transition-colors"
                      >
                        {isProcessing ? 'Aceptando...' : 'Aceptar'}
                      </button>
                    )}

                    {isPrepared && (
                      <button
                        onClick={() => handleOrderAction(order.id, 'delivering')}
                        disabled={isProcessing}
                        className="px-3 py-1.5 bg-blue-500 text-white text-xs font-black uppercase tracking-wider hover:bg-blue-400 transition-colors"
                      >
                        {isProcessing ? 'Guardando...' : 'En Camino'}
                      </button>
                    )}

                    {isDelivering && (
                      <button
                        onClick={() => handleOrderAction(order.id, 'delivered')}
                        disabled={isProcessing}
                        className="px-3 py-1.5 bg-ya-lime text-ya-black text-xs font-black uppercase tracking-wider hover:bg-white transition-colors"
                      >
                        {isProcessing ? 'Guardando...' : 'Entregado'}
                      </button>
                    )}

                    {isDelivered && (
                      <span className="text-[11px] font-bold text-green-400">✓ Entregado</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
