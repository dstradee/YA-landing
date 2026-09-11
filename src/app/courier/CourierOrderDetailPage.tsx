import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Phone,
  Package,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  DollarSign,
  AlertOctagon,
  X,
} from 'lucide-react';
import {
  courierFetchCurrentProfile,
  courierFetchOrderDetail,
  courierUpdateOrderStatus,
  calculateCourierOrderEarnings,
} from '../../lib/courierOrders';
import { courierReportIncident, courierFetchOrderIncidents } from '../../lib/incidents';
import type { CourierOrderDetail, DbCourier, DbIncident, IncidentType } from '../../types/app';

export function CourierOrderDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [courier, setCourier] = useState<DbCourier | null>(null);
  const [order, setOrder] = useState<CourierOrderDetail | null>(null);
  const [incidents, setIncidents] = useState<DbIncident[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState<IncidentType>('customer_unavailable');
  const [reportDesc, setReportDesc] = useState('');
  const [reporting, setReporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setActionError(null);

    const profileRes = await courierFetchCurrentProfile();
    if (!profileRes.courier) {
      setError(profileRes.error || 'No tienes permisos de repartidor.');
      setLoading(false);
      return;
    }

    setCourier(profileRes.courier);

    const [detailRes, incRes] = await Promise.all([
      courierFetchOrderDetail({
        orderId: id,
        courierId: profileRes.courier.id,
      }),
      courierFetchOrderIncidents(id),
    ]);

    if (detailRes.error) {
      setError(detailRes.error);
    } else {
      setOrder(detailRes.order);
    }

    if (incRes.incidents) {
      setIncidents(incRes.incidents);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleCourierReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courier || !order) return;
    if (!reportDesc.trim()) {
      setActionError('Describe brevemente lo ocurrido para que central te asista.');
      return;
    }
    setReporting(true);
    const res = await courierReportIncident({
      orderId: order.id,
      type: reportType,
      title: `Incidencia en reparto: ${reportType}`,
      description: reportDesc,
    });
    setReporting(false);
    if (res.error) {
      setActionError(res.error);
    } else {
      setShowReportModal(false);
      setReportDesc('');
      const refreshed = await courierFetchOrderIncidents(order.id);
      if (refreshed.incidents) setIncidents(refreshed.incidents);
    }
  };

  const handleAction = async (action: 'accept' | 'delivering' | 'delivered') => {
    if (!courier || !order) return;

    if (action === 'delivered') {
      const confirmDeliver = window.confirm(
        `¿Confirmas que has entregado el pedido ${order.order_number} al cliente en ${order.deliveryAddress?.street || 'su domicilio'}?`
      );
      if (!confirmDeliver) return;
    }

    setProcessing(true);
    setActionError(null);

    const res = await courierUpdateOrderStatus({
      orderId: order.id,
      courierId: courier.id,
      action,
    });

    if (res.error) {
      setActionError(res.error);
    } else {
      await loadDetail();
    }

    setProcessing(false);
  };

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="w-10 h-10 border-4 border-ya-lime border-t-transparent animate-spin mx-auto mb-3" />
        <p className="text-xs font-black uppercase tracking-wider text-gray-400">
          Cargando detalle del pedido...
        </p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="border-2 border-red-800 bg-red-950/40 p-6 text-center space-y-4">
        <AlertTriangle size={32} className="text-red-500 mx-auto" />
        <h2 className="text-xl font-black uppercase tracking-tight text-red-300">
          No se pudo cargar el pedido
        </h2>
        <p className="text-xs text-red-200/80 max-w-md mx-auto">{error}</p>
        <Link
          to="/repartidor"
          className="inline-flex items-center gap-2 px-4 py-2 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs hover:bg-white transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Volver al inicio</span>
        </Link>
      </div>
    );
  }

  const isPaid = order.payment_status === 'paid';
  const isPendingPayment = order.payment_status === 'pending' || order.status === 'payment_pending';
  const isDelivered = order.status === 'delivered';
  const isDelivering = order.status === 'delivering';
  const isReceived = order.status === 'received';
  const isPreparedOrPreparing =
    order.status === 'prepared' || order.status === 'preparing' || order.status === 'sourcing';

  const snapshot = order.deliveryAddress;
  const addressFull = snapshot
    ? `${snapshot.street || ''} ${snapshot.number || ''}${snapshot.floor ? `, ${snapshot.floor}` : ''}`
    : 'Dirección no disponible';

  const cityZip = snapshot
    ? `${snapshot.postalCode ? `${snapshot.postalCode} ` : ''}${snapshot.city || ''}`
    : '';

  return (
    <div className="space-y-4 pb-20">
      {/* Botón Volver y Nº de Pedido */}
      <div className="flex items-center justify-between gap-3 border-b-2 border-ya-gray pb-3">
        <Link
          to="/repartidor"
          className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Volver</span>
        </Link>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {order.is_test && (
            <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500">
              🧪 PRUEBA
            </span>
          )}
          <span className="font-mono font-black text-xl text-ya-lime">
            {order.order_number}
          </span>
        </div>
      </div>

      {/* Alerta de error de acción */}
      {actionError && (
        <div className="bg-red-950/70 border-2 border-red-600 p-4 text-red-300 text-xs flex items-start gap-2.5">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-400" />
          <div className="leading-relaxed">
            <strong className="block font-black uppercase tracking-wide mb-0.5">
              Acción no completada
            </strong>
            {actionError}
          </div>
        </div>
      )}

      {/* Alerta de Pago Pendiente */}
      {isPendingPayment && (
        <div className="bg-yellow-950/70 border-2 border-yellow-500 p-4 text-yellow-300 text-xs flex items-start gap-3">
          <AlertTriangle size={20} className="shrink-0 mt-0.5 text-yellow-400" />
          <div className="leading-relaxed">
            <strong className="block font-black uppercase tracking-wide mb-1 text-yellow-300">
              ⚠️ PAGO PENDIENTE
            </strong>
            Este pedido aún no ha completado el pago en la pasarela. No debe entregarse al cliente
            hasta que el pago esté confirmado en el sistema.
          </div>
        </div>
      )}

      {/* Banner de Entregado */}
      {isDelivered && (
        <div className="bg-green-950/60 border-2 border-green-500 p-4 text-green-300 text-xs flex items-start gap-3">
          <CheckCircle2 size={22} className="shrink-0 mt-0.5 text-green-400" />
          <div>
            <strong className="block font-black uppercase tracking-wide text-sm mb-0.5 text-green-400">
              PEDIDO ENTREGADO CON ÉXITO
            </strong>
            <p className="text-green-200/90 text-xs">
              Fecha de entrega:{' '}
              <span className="font-mono font-bold">
                {order.delivered_at
                  ? new Date(order.delivered_at).toLocaleString('es-ES')
                  : new Date(order.updated_at).toLocaleString('es-ES')}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* TARJETA 1: DESTINATARIO Y DIRECCIÓN DE ENTREGA */}
      <section className="border-2 border-ya-gray bg-ya-gray/30 p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-ya-gray pb-2">
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
            <MapPin size={14} className="text-ya-lime" />
            <span>Datos de Entrega</span>
          </h2>
          <span className="text-[10px] font-mono text-gray-400">
            {new Date(order.created_at).toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        <div className="space-y-2">
          <div>
            <div className="text-lg font-black text-white leading-tight">{addressFull}</div>
            {cityZip && <div className="text-xs font-bold text-gray-400">{cityZip}</div>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-ya-gray/60">
            <div>
              <span className="text-[10px] text-gray-400 font-bold uppercase block">Cliente</span>
              <span className="text-sm font-bold text-gray-200">{order.customerName}</span>
            </div>

            {order.customerPhone && (
              <a
                href={`tel:${order.customerPhone}`}
                className="flex items-center gap-2 px-3 py-2 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs hover:bg-white transition-colors"
                title="Llamar al cliente"
              >
                <Phone size={14} />
                <span>{order.customerPhone}</span>
              </a>
            )}
          </div>

          {snapshot?.notes && (
            <div className="mt-2 bg-yellow-950/40 border border-yellow-600/70 p-3 text-xs text-yellow-200">
              <strong className="block font-black uppercase tracking-wide text-[10px] text-yellow-400 mb-1">
                Instrucciones del cliente:
              </strong>
              {snapshot.notes}
            </div>
          )}
        </div>
      </section>

      {/* TARJETA 2: ESTADO Y PAGO */}
      <section className="border-2 border-ya-gray bg-ya-gray/30 p-4 space-y-2.5">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
          <CreditCard size={14} className="text-ya-lime" />
          <span>Estado del Pedido y Pago</span>
        </h2>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-ya-black/60 p-3 border border-ya-gray">
            <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1">
              Estado operativo
            </span>
            <span className="font-black uppercase tracking-wider text-ya-lime">
              {order.status}
            </span>
          </div>

          <div className="bg-ya-black/60 p-3 border border-ya-gray">
            <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1">
              Pago ({order.payment_method})
            </span>
            <span
              className={`font-black uppercase tracking-wider ${
                isPaid ? 'text-green-400' : 'text-yellow-400'
              }`}
            >
              {isPaid ? '✓ Pagado' : 'Pendiente'}
            </span>
          </div>
        </div>
      </section>

      {/* TARJETA 2B: REMUNERACIÓN DEL REPARTIDOR (FASE 4D) */}
      {(() => {
        const calc = calculateCourierOrderEarnings(order);
        return (
          <section className="border-2 border-ya-lime/50 bg-ya-black p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-ya-lime flex items-center gap-1.5">
                <DollarSign size={15} className="text-ya-lime" />
                <span>{isDelivered ? 'Ganancia Congelada (Fase 4D)' : 'Remuneración Estimada'}</span>
              </h2>
              {isDelivered && (
                <span className="px-2 py-0.5 bg-ya-lime text-ya-black text-[10px] font-black uppercase tracking-wider">
                  ✓ Liquidada
                </span>
              )}
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div>
                <div className="text-2xl font-black text-ya-lime">
                  +{calc.earnings.toFixed(2)} €
                </div>
                <div className="text-[11px] font-mono text-gray-300 mt-0.5">
                  {calc.formulaText}
                </div>
              </div>

              {order.is_test && (
                <div className="text-right">
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono uppercase">
                    Pedido de Prueba
                  </span>
                  <div className="text-[9px] text-gray-500 font-mono mt-0.5">Sin cobro real</div>
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {/* TARJETA 3: PRODUCTOS DEL PEDIDO */}
      <section className="border-2 border-ya-gray bg-ya-gray/30 p-4 space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
          <Package size={14} className="text-ya-lime" />
          <span>Productos a Entregar ({order.items.length})</span>
        </h2>

        <div className="divide-y divide-ya-gray/60">
          {order.items.map((item) => (
            <div key={item.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5">
                <span className="w-6 h-6 bg-ya-lime text-ya-black font-black text-xs flex items-center justify-center shrink-0">
                  {item.quantity}x
                </span>
                <div>
                  <div className="font-bold text-white leading-snug">{item.product_name}</div>
                  <div className="text-[11px] text-gray-400 font-mono">
                    {Number(item.unit_price).toFixed(2)} € / ud.
                  </div>

                  {item.pack_selections_snapshot && (
                    <div className="text-[10px] text-gray-400 mt-1 pl-2 border-l border-gray-600">
                      Incluye: {typeof item.pack_selections_snapshot === 'string' ? item.pack_selections_snapshot : JSON.stringify(item.pack_selections_snapshot)}
                    </div>
                  )}
                </div>
              </div>

              <div className="font-mono font-bold text-white text-right">
                {Number(item.subtotal || item.quantity * item.unit_price).toFixed(2)} €
              </div>
            </div>
          ))}
        </div>

        {/* Desglose económico */}
        <div className="pt-3 border-t-2 border-ya-gray space-y-1 text-xs font-mono">
          <div className="flex justify-between text-gray-400">
            <span>Subtotal</span>
            <span>{Number(order.subtotal).toFixed(2)} €</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Envío</span>
            <span>{Number(order.delivery_fee).toFixed(2)} €</span>
          </div>
          <div className="flex justify-between text-base font-black text-white pt-2 border-t border-ya-gray/60">
            <span>TOTAL PEDIDO</span>
            <span className="text-ya-lime">{Number(order.total).toFixed(2)} €</span>
          </div>
        </div>
      </section>

      {/* SECCIÓN: INCIDENCIAS REPORTADAS (FASE 7) */}
      <section className="border-2 border-rose-500/40 bg-rose-950/20 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-widest text-rose-400 flex items-center gap-1.5">
            <AlertOctagon size={15} className="text-rose-400" />
            <span>Incidencias y Ayuda en Ruta ({incidents.length})</span>
          </h2>
          {!isDelivered && (
            <button
              type="button"
              onClick={() => setShowReportModal(true)}
              className="px-2.5 py-1 bg-rose-500 hover:bg-white hover:text-black text-white text-[10px] font-black uppercase tracking-wider transition-colors"
            >
              + Reportar Problema
            </button>
          )}
        </div>

        {incidents.length === 0 ? (
          <p className="text-[11px] text-gray-400 font-mono">
            Sin incidencias en esta entrega. Si surge algún imprevisto (cliente ausente, dirección errónea o producto roto), repórtalo directamente.
          </p>
        ) : (
          <div className="space-y-2">
            {incidents.map((inc) => (
              <div
                key={inc.id}
                className="p-2.5 bg-ya-black/80 border border-rose-500/40 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-ya-lime text-[11px]">
                    {inc.incident_number}
                  </span>
                  <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border ${
                    inc.status === 'resolved'
                      ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                      : inc.status === 'investigating'
                      ? 'border-blue-400 text-blue-400 bg-blue-400/10'
                      : 'border-amber-500 text-amber-400 bg-amber-500/10'
                  }`}>
                    {inc.status === 'resolved' ? 'Resuelta' : inc.status === 'investigating' ? 'En gestión' : 'Abierta'}
                  </span>
                </div>
                <div className="font-bold text-white text-[11px]">{inc.title}</div>
                <div className="text-[10px] text-gray-300">{inc.description}</div>
                {inc.resolution_notes && (
                  <div className="text-[10px] text-emerald-300 font-mono pt-1 border-t border-ya-gray/40">
                    Instrucción de Central: {inc.resolution_notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* BARRA DE ACCIÓN INFERIOR OPERATIVA (TÁCTIL Y VISIBLE) */}
      {!isDelivered && (
        <div className="sticky bottom-16 sm:bottom-0 left-0 right-0 bg-ya-black/95 backdrop-blur-md border-2 border-ya-gray p-3 shadow-2xl z-30">
          <div className="flex items-center justify-between gap-2">
            {isReceived && (
              <button
                id="courier-accept-order-btn"
                onClick={() => handleAction('accept')}
                disabled={processing}
                className="w-full py-4 bg-yellow-400 text-ya-black font-black uppercase tracking-wider text-sm hover:bg-white transition-colors active:scale-95 disabled:opacity-50"
              >
                {processing ? 'Procesando...' : 'Aceptar Pedido'}
              </button>
            )}

            {isPreparedOrPreparing && (
              <button
                id="courier-pickup-order-btn"
                onClick={() => handleAction('delivering')}
                disabled={processing}
                className="w-full py-4 bg-blue-500 text-white font-black uppercase tracking-wider text-sm hover:bg-blue-400 transition-colors active:scale-95 disabled:opacity-50"
              >
                {processing ? 'Actualizando...' : 'Marcar como Recogido / En Camino'}
              </button>
            )}

            {isDelivering && (
              <button
                id="courier-delivered-order-btn"
                onClick={() => handleAction('delivered')}
                disabled={processing}
                className="w-full py-4 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-sm hover:bg-white transition-colors active:scale-95 disabled:opacity-50 shadow-[0_0_15px_rgba(182,255,0,0.4)]"
              >
                {processing ? 'Guardando entrega...' : '✓ Marcar como Entregado al Cliente'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* MODAL PARA REPORTAR INCIDENCIA POR EL REPARTIDOR */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="bg-ya-black border-4 border-ya-gray max-w-sm w-full p-5 text-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b-2 border-ya-gray mb-3">
              <div className="flex items-center gap-2">
                <AlertOctagon className="text-rose-500" size={18} />
                <h3 className="text-sm font-black uppercase tracking-tight">Reportar Incidencia en Ruta</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCourierReportSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-400 font-mono uppercase text-[10px] mb-1">
                  Motivo principal *
                </label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as IncidentType)}
                  className="w-full bg-ya-gray/30 border-2 border-ya-gray p-2 text-white focus:border-ya-lime focus:outline-none"
                >
                  <option value="customer_unavailable">Cliente ausente / no responde</option>
                  <option value="address_issue">Dirección errónea o portal inaccesible</option>
                  <option value="damaged_product">Producto roto / dañado</option>
                  <option value="delay">Retraso grave en ruta</option>
                  <option value="delivery_issue">Problema con el vehículo / reparto</option>
                  <option value="other">Otro motivo</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 font-mono uppercase text-[10px] mb-1">
                  ¿Qué ha ocurrido? (Detalles) *
                </label>
                <textarea
                  rows={3}
                  value={reportDesc}
                  onChange={(e) => setReportDesc(e.target.value)}
                  placeholder="Ej: He llamado 3 veces al timbre y teléfono pero no contesta nadie..."
                  required
                  className="w-full bg-ya-gray/30 border-2 border-ya-gray p-2 text-white focus:border-ya-lime focus:outline-none text-xs"
                />
              </div>

              <p className="text-[10px] text-gray-400 font-mono">
                Central YA recibirá tu aviso inmediatamente para asistirte o contactar con el cliente.
              </p>

              <div className="flex gap-2 pt-2 border-t border-ya-gray">
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="flex-1 py-2 border-2 border-ya-gray text-gray-400 hover:text-white uppercase font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={reporting}
                  className="flex-1 py-2 bg-rose-500 text-white font-black uppercase tracking-wider hover:bg-rose-600 transition-colors disabled:opacity-50"
                >
                  {reporting ? 'Enviando...' : 'Enviar a Central'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
