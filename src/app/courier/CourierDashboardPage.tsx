import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  AlertCircle,
  RefreshCw,
  CreditCard,
  ChevronRight,
} from 'lucide-react';
import {
  courierFetchCurrentProfile,
  courierFetchDaySummary,
  courierFetchOrders,
  courierUpdateOrderStatus,
  courierSubscribeToOrders,
} from '../../lib/courierOrders';
import type {
  DbCourier,
  DbProfile,
  CourierOrderListItem,
  CourierDaySummary,
  OrderStatus,
} from '../../types/app';

export function CourierDashboardPage() {

  const [courier, setCourier] = useState<DbCourier | null>(null);
  const [profile, setProfile] = useState<DbProfile | null>(null);
  const [summary, setSummary] = useState<CourierDaySummary>({
    assignedPending: 0,
    inProgress: 0,
    deliveredToday: 0,
    totalDelivered: 0,
  });
  const [activeOrders, setActiveOrders] = useState<CourierOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setActionError(null);

    const profileRes = await courierFetchCurrentProfile();
    if (profileRes.courier) {
      setCourier(profileRes.courier);
      setProfile(profileRes.profile);

      const [summaryRes, ordersRes] = await Promise.all([
        courierFetchDaySummary(profileRes.courier.id),
        courierFetchOrders({ courierId: profileRes.courier.id, filter: 'active' }),
      ]);

      setSummary(summaryRes.summary);
      setActiveOrders(ordersRes.orders);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Suscripción realtime
  useEffect(() => {
    if (!courier?.id) return;
    const unsub = courierSubscribeToOrders(courier.id, () => {
      loadData(true);
    });
    return () => unsub();
  }, [courier?.id, loadData]);

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
      await loadData(true);
    }

    setProcessingOrderId(null);
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'received':
        return (
          <span className="px-2.5 py-1 bg-yellow-950/80 border border-yellow-500 text-yellow-400 text-[11px] font-black uppercase tracking-wider">
            Asignado · Por Aceptar
          </span>
        );
      case 'preparing':
      case 'sourcing':
        return (
          <span className="px-2.5 py-1 bg-blue-950/80 border border-blue-500 text-blue-400 text-[11px] font-black uppercase tracking-wider">
            En Preparación
          </span>
        );
      case 'prepared':
        return (
          <span className="px-2.5 py-1 bg-purple-950/80 border border-purple-500 text-purple-400 text-[11px] font-black uppercase tracking-wider">
            Listo para Recoger
          </span>
        );
      case 'delivering':
        return (
          <span className="px-2.5 py-1 bg-ya-lime text-ya-black border border-ya-lime text-[11px] font-black uppercase tracking-wider animate-pulse">
            En Camino al Cliente
          </span>
        );
      case 'delivered':
        return (
          <span className="px-2.5 py-1 bg-green-950/80 border border-green-500 text-green-400 text-[11px] font-black uppercase tracking-wider">
            Entregado
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 bg-ya-gray border border-gray-600 text-gray-300 text-[11px] font-black uppercase tracking-wider">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Saludo y estado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-ya-gray pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">
            Hola, {profile?.full_name?.split(' ')[0] || 'Repartidor'}
          </h1>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
            <span>Operativo YA</span>
            <span>•</span>
            <span className={courier?.available ? 'text-ya-lime' : 'text-gray-400'}>
              {courier?.available ? 'Disponible en guardia' : 'Fuera de servicio'}
            </span>
          </p>
        </div>

        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="self-start sm:self-auto flex items-center gap-2 px-3 py-2 bg-ya-gray/50 hover:bg-ya-gray border border-ya-gray text-xs font-black uppercase tracking-wider text-gray-300 hover:text-white transition-colors"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin text-ya-lime' : ''} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Alerta de no disponibilidad */}
      {courier && !courier.available && courier.active && (
        <div className="bg-yellow-950/40 border-2 border-yellow-600 p-4 text-yellow-300 flex items-start gap-3">
          <AlertCircle size={20} className="shrink-0 mt-0.5 text-yellow-500" />
          <div className="text-xs leading-relaxed">
            <strong className="block font-black uppercase tracking-wide mb-1">
              Estás en modo NO DISPONIBLE
            </strong>
            Pulsa el botón superior para ponerte en guardia cuando estés listo para comenzar tus
            repartos.
          </div>
        </div>
      )}

      {/* Alerta de errores de acción */}
      {actionError && (
        <div className="bg-red-950/60 border-2 border-red-600 p-4 text-red-300 flex items-start gap-3">
          <AlertCircle size={20} className="shrink-0 mt-0.5 text-red-400" />
          <div className="text-xs leading-relaxed">
            <strong className="block font-black uppercase tracking-wide mb-1">
              Atención
            </strong>
            {actionError}
          </div>
        </div>
      )}

      {/* RESUMEN DEL DÍA */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">
            Resumen Operativo
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-ya-gray/30 border-2 border-ya-gray p-3.5">
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider">Pendientes</span>
              <Clock size={16} className="text-yellow-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white">
              {summary.assignedPending}
            </div>
            <div className="text-[10px] text-gray-400 font-bold uppercase mt-1">Por recoger/aceptar</div>
          </div>

          <div className="bg-ya-gray/30 border-2 border-ya-gray p-3.5">
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider">En Camino</span>
              <Truck size={16} className="text-ya-lime" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-ya-lime">
              {summary.inProgress}
            </div>
            <div className="text-[10px] text-gray-400 font-bold uppercase mt-1">En curso ahora</div>
          </div>

          <div className="bg-ya-gray/30 border-2 border-ya-gray p-3.5">
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider">Entregas Hoy</span>
              <CheckCircle2 size={16} className="text-green-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white">
              {summary.deliveredToday}
            </div>
            <div className="text-[10px] text-gray-400 font-bold uppercase mt-1">Completadas hoy</div>
          </div>

          {/* Tarjeta de ganancias claramente rotulada como Próximamente / Fase 4D */}
          <div className="bg-ya-gray/20 border-2 border-dashed border-gray-700 p-3.5 relative overflow-hidden">
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider">Ganancias</span>
              <CreditCard size={16} className="text-gray-500" />
            </div>
            <div className="text-lg font-black text-gray-400 flex items-center gap-1">
              <span>-- €</span>
            </div>
            <div className="text-[9px] font-black uppercase tracking-wider text-ya-lime/90 mt-1">
              Próximamente · Fase 4D
            </div>
          </div>
        </div>
      </section>

      {/* PEDIDOS ACTIVOS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black uppercase tracking-tight">
              Pedidos Asignados Activos
            </h2>
            <span className="px-2 py-0.5 bg-ya-gray text-ya-lime text-xs font-black">
              {activeOrders.length}
            </span>
          </div>

          {activeOrders.length > 0 && (
            <Link
              to="/repartidor/pedidos"
              className="text-xs font-black uppercase tracking-wider text-ya-lime hover:underline flex items-center gap-1"
            >
              <span>Ver todos</span>
              <ChevronRight size={14} />
            </Link>
          )}
        </div>

        {loading ? (
          <div className="py-12 border-2 border-ya-gray bg-ya-gray/20 text-center">
            <div className="w-8 h-8 border-3 border-ya-lime border-t-transparent animate-spin mx-auto mb-2" />
            <p className="text-xs font-black uppercase tracking-wider text-gray-400">
              Cargando tus pedidos...
            </p>
          </div>
        ) : activeOrders.length === 0 ? (
          <div className="border-2 border-ya-gray bg-ya-gray/20 p-8 text-center">
            <div className="w-12 h-12 bg-ya-gray flex items-center justify-center mx-auto mb-3 text-gray-400">
              <Package size={24} />
            </div>
            <h3 className="font-black uppercase tracking-tight text-lg mb-1">
              No tienes pedidos activos
            </h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto mb-4 leading-relaxed">
              Cuando un pedido sea asignado a tu cuenta por administración o por el servicio de YA,
              aparecerá aquí inmediatamente para que lo recojas y entregues.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-ya-gray text-[11px] font-bold text-gray-300">
              <span className="w-2 h-2 rounded-full bg-ya-lime animate-pulse" />
              <span>Escuchando nuevos pedidos en tiempo real</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {activeOrders.map((order) => {
              const isProcessing = processingOrderId === order.id;
              const isPaid = order.payment_status === 'paid';
              const isDelivering = order.status === 'delivering';
              const isReceived = order.status === 'received';
              const isPrepared = order.status === 'prepared' || order.status === 'preparing' || order.status === 'sourcing';

              const addressText = order.deliveryAddress
                ? `${order.deliveryAddress.street || ''} ${order.deliveryAddress.number || ''}${
                    order.deliveryAddress.floor ? `, ${order.deliveryAddress.floor}` : ''
                  }${order.deliveryAddress.city ? `, ${order.deliveryAddress.city}` : ''}`
                : order.delivery_address_snapshot?.street
                ? `${order.delivery_address_snapshot.street} ${order.delivery_address_snapshot.number || ''}`
                : 'Dirección no especificada';

              return (
                <div
                  key={order.id}
                  className="border-2 border-ya-gray bg-ya-gray/30 hover:border-gray-500 transition-colors p-4 space-y-3"
                >
                  {/* Encabezado de la tarjeta */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black font-mono text-base text-ya-lime">
                          {order.order_number}
                        </span>
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
                      <div className="text-base font-black text-white">
                        {Number(order.total).toFixed(2)} €
                      </div>
                      <div className="text-[10px] font-black uppercase tracking-wider">
                        {isPaid ? (
                          <span className="text-green-400">✓ Pagado</span>
                        ) : (
                          <span className="text-yellow-400">⚠️ Pago Pendiente</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Dirección y cliente */}
                  <div className="bg-ya-black/60 border border-ya-gray/80 p-3 space-y-1.5">
                    <div className="flex items-start gap-2">
                      <MapPin size={16} className="text-ya-lime shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <div className="font-bold text-white leading-snug">{addressText}</div>
                        <div className="text-gray-400 text-[11px] mt-0.5">
                          Destinatario: <span className="text-gray-200 font-bold">{order.customerName}</span>
                        </div>
                      </div>
                    </div>

                    {order.deliveryAddress?.notes && (
                      <div className="text-[11px] text-yellow-300 bg-yellow-950/30 border border-yellow-800/60 p-2 font-medium">
                        <strong>Nota entrega:</strong> {order.deliveryAddress.notes}
                      </div>
                    )}
                  </div>

                  {/* Botones de acción operativos */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-ya-gray">
                    <Link
                      to={`/repartidor/pedidos/${order.id}`}
                      className="px-3 py-2 border border-ya-gray hover:border-white text-xs font-black uppercase tracking-wider text-gray-300 hover:text-white transition-colors"
                    >
                      Ver Detalle
                    </Link>

                    <div className="flex items-center gap-2">
                      {isReceived && (
                        <button
                          onClick={() => handleOrderAction(order.id, 'accept')}
                          disabled={isProcessing}
                          className="px-4 py-2 bg-yellow-400 text-ya-black text-xs font-black uppercase tracking-wider hover:bg-white transition-colors active:scale-95 disabled:opacity-50"
                        >
                          {isProcessing ? 'Aceptando...' : 'Aceptar Pedido'}
                        </button>
                      )}

                      {isPrepared && (
                        <button
                          onClick={() => handleOrderAction(order.id, 'delivering')}
                          disabled={isProcessing}
                          className="px-4 py-2 bg-blue-500 text-white text-xs font-black uppercase tracking-wider hover:bg-blue-400 transition-colors active:scale-95 disabled:opacity-50"
                        >
                          {isProcessing ? 'Actualizando...' : 'Recogido / En Camino'}
                        </button>
                      )}

                      {isDelivering && (
                        <button
                          onClick={() => handleOrderAction(order.id, 'delivered')}
                          disabled={isProcessing}
                          className="px-4 py-2 bg-ya-lime text-ya-black text-xs font-black uppercase tracking-wider hover:bg-white transition-colors active:scale-95 disabled:opacity-50 shadow-[0_0_10px_rgba(182,255,0,0.3)]"
                        >
                          {isProcessing ? 'Guardando...' : 'Marcar como Entregado'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
