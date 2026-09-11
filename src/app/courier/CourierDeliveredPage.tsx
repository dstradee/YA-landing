import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  MapPin,
  RefreshCw,
  Search,
  ChevronRight,
  PackageCheck,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import {
  courierFetchCurrentProfile,
  courierFetchEarningsSummary,
} from '../../lib/courierOrders';
import type {
  CourierEarningsSummary,
  CourierDeliveredOrderEarningsItem,
} from '../../types/app';

export function CourierDeliveredPage() {
  const [orders, setOrders] = useState<CourierDeliveredOrderEarningsItem[]>([]);
  const [earningsSummary, setEarningsSummary] = useState<CourierEarningsSummary>({
    today: { earnings: 0, deliveredCount: 0, avgPerDelivery: 0 },
    thisWeek: { earnings: 0, deliveredCount: 0, avgPerDelivery: 0 },
    thisMonth: { earnings: 0, deliveredCount: 0, avgPerDelivery: 0 },
    allTime: { earnings: 0, deliveredCount: 0, avgPerDelivery: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const loadDelivered = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const profileRes = await courierFetchCurrentProfile();
    if (profileRes.courier) {
      const res = await courierFetchEarningsSummary(profileRes.courier.id);
      setEarningsSummary(res.summary);
      setOrders(res.orders);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadDelivered();
  }, [loadDelivered]);

  const filteredOrders = orders.filter((o) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const orderNum = o.orderNumber.toLowerCase();
    const customer = o.customerName.toLowerCase();
    const street = (o.deliveryAddress?.street || '').toLowerCase();
    return orderNum.includes(term) || customer.includes(term) || street.includes(term);
  });

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex items-center justify-between border-b-2 border-ya-gray pb-3">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Entregas y Ganancias</h1>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
            Historial de pedidos completados y liquidación ({orders.length})
          </p>
        </div>

        <button
          onClick={() => loadDelivered(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-ya-gray/50 hover:bg-ya-gray border border-ya-gray text-xs font-black uppercase tracking-wider text-gray-300 hover:text-white transition-colors"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin text-ya-lime' : ''} />
          <span>Refrescar</span>
        </button>
      </div>

      {/* Resumen de Ganancias (Fase 4D) */}
      <div className="bg-ya-black border-2 border-ya-gray p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-ya-lime" />
          <h2 className="text-xs font-black uppercase tracking-widest text-white">
            Liquidación Acumulada
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-ya-gray/40 border border-ya-gray p-2.5">
            <div className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Hoy</div>
            <div className="text-xl font-black text-ya-lime mt-0.5">
              {earningsSummary.today.earnings.toFixed(2)} €
            </div>
            <div className="text-[10px] text-gray-400 font-mono mt-0.5">
              {earningsSummary.today.deliveredCount} entregas
            </div>
          </div>

          <div className="bg-ya-gray/40 border border-ya-gray p-2.5">
            <div className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Esta Semana</div>
            <div className="text-xl font-black text-white mt-0.5">
              {earningsSummary.thisWeek.earnings.toFixed(2)} €
            </div>
            <div className="text-[10px] text-gray-400 font-mono mt-0.5">
              {earningsSummary.thisWeek.deliveredCount} entregas
            </div>
          </div>

          <div className="bg-ya-gray/40 border border-ya-gray p-2.5">
            <div className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Este Mes</div>
            <div className="text-xl font-black text-white mt-0.5">
              {earningsSummary.thisMonth.earnings.toFixed(2)} €
            </div>
            <div className="text-[10px] text-gray-400 font-mono mt-0.5">
              {earningsSummary.thisMonth.deliveredCount} entregas
            </div>
          </div>

          <div className="bg-ya-gray/40 border border-ya-gray p-2.5">
            <div className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Total Histórico</div>
            <div className="text-xl font-black text-white mt-0.5">
              {earningsSummary.allTime.earnings.toFixed(2)} €
            </div>
            <div className="text-[10px] text-gray-400 font-mono mt-0.5">
              Media: {earningsSummary.allTime.avgPerDelivery.toFixed(2)} € / pedido
            </div>
          </div>
        </div>
      </div>

      {/* Buscador */}
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

      {/* Lista */}
      {loading ? (
        <div className="py-12 border-2 border-ya-gray bg-ya-gray/20 text-center">
          <div className="w-8 h-8 border-3 border-ya-lime border-t-transparent animate-spin mx-auto mb-2" />
          <p className="text-xs font-black uppercase tracking-wider text-gray-400">
            Cargando historial de entregas...
          </p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="border-2 border-ya-gray bg-ya-gray/20 p-8 text-center">
          <div className="w-12 h-12 bg-ya-gray flex items-center justify-center mx-auto mb-3 text-gray-400">
            <PackageCheck size={24} />
          </div>
          <h3 className="font-black uppercase tracking-tight text-base mb-1">
            {searchTerm ? 'Sin coincidencias' : 'Aún no tienes entregas completadas'}
          </h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            {searchTerm
              ? 'Prueba a buscar con otro término.'
              : 'Los pedidos que marques como entregados aparecerán aquí con su liquidación.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const deliveredDate = order.deliveredAt;
            const addressText = order.deliveryAddress
              ? `${order.deliveryAddress.street || ''} ${order.deliveryAddress.number || ''}`
              : 'Dirección registrada';

            return (
              <div
                key={order.id}
                className="border-2 border-ya-gray bg-ya-gray/30 p-3.5 space-y-2.5 hover:border-gray-500 transition-colors"
              >
                {/* Fila superior: Nº de pedido, estados y ganancias */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-sm text-white">
                        {order.orderNumber}
                      </span>
                      <span className="px-2 py-0.5 bg-green-950/80 border border-green-500 text-green-400 text-[10px] font-black uppercase tracking-wider">
                        ✓ Entregado
                      </span>
                      {order.isTest && (
                        <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-mono uppercase">
                          Prueba
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 font-mono mt-0.5 flex items-center gap-1.5">
                      <Clock size={12} className="text-gray-500" />
                      <span>
                        {deliveredDate
                          ? new Date(deliveredDate).toLocaleDateString('es-ES', {
                              day: '2-digit',
                              month: 'short',
                            })
                          : '—'}{' '}
                        •{' '}
                        {deliveredDate
                          ? new Date(deliveredDate).toLocaleTimeString('es-ES', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                    </div>
                  </div>

                  {/* Bloque de Ganancia Destacada */}
                  <div className="text-right">
                    <div className="text-xs text-gray-400 font-mono uppercase">Tu Ganancia</div>
                    <div className="text-lg font-black text-ya-lime flex items-center justify-end gap-0.5">
                      <DollarSign size={16} className="text-ya-lime" />
                      <span>+{order.payoutTotal.toFixed(2)} €</span>
                    </div>
                  </div>
                </div>

                {/* Desglose de liquidación */}
                <div className="bg-ya-black/70 border border-ya-gray/80 p-2 text-xs flex flex-wrap items-center justify-between gap-2 font-mono">
                  <div className="text-gray-400 text-[11px]">
                    <span className="text-gray-500 uppercase mr-1">Fórmula:</span>
                    <span className="text-gray-300">{order.calculation.formulaText}</span>
                  </div>
                  <div className="text-gray-400 text-[11px]">
                    <span className="text-gray-500 uppercase mr-1">Subtotal:</span>
                    <span className="text-white font-bold">{order.subtotal.toFixed(2)} €</span>
                  </div>
                </div>

                {/* Fila inferior: Dirección y enlace */}
                <div className="bg-ya-black/40 border border-ya-gray/60 p-2.5 text-xs flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <MapPin size={14} className="text-ya-lime shrink-0 mt-0.5" />
                    <div className="truncate">
                      <div className="font-bold text-gray-200 truncate">{addressText}</div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {order.customerName}
                      </div>
                    </div>
                  </div>

                  <Link
                    to={`/repartidor/pedidos/${order.id}`}
                    className="shrink-0 text-xs font-black uppercase tracking-wider text-ya-lime hover:underline flex items-center gap-0.5"
                  >
                    <span>Detalle</span>
                    <ChevronRight size={13} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

