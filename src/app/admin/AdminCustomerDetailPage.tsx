import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  Calendar,
  ShoppingBag,
  MapPin,
  AlertTriangle,
  ArrowUpRight,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { adminFetchCustomerDetail, type AdminCustomerDetailResult } from '../../lib/adminCustomers';
import { euro } from '../../data/products';
import type { OrderStatus } from '../../types/app';

const statusBadges: Record<OrderStatus, { label: string; className: string }> = {
  received: { label: 'Recibido', className: 'border-yellow-400 text-yellow-400 bg-yellow-400/10' },
  preparing: { label: 'En preparación', className: 'border-blue-400 text-blue-400 bg-blue-400/10' },
  shopping: { label: 'Comprando', className: 'border-blue-400 text-blue-400 bg-blue-400/10' },
  sourcing: { label: 'Comprando', className: 'border-blue-400 text-blue-400 bg-blue-400/10' },
  ready: { label: 'Preparado', className: 'border-purple-400 text-purple-400 bg-purple-400/10' },
  prepared: { label: 'Preparado', className: 'border-purple-400 text-purple-400 bg-purple-400/10' },
  delivering: { label: 'En reparto', className: 'border-ya-lime text-ya-lime bg-ya-lime/10' },
  delivered: { label: 'Entregado', className: 'border-emerald-400 text-emerald-400 bg-emerald-400/10' },
  cancelled: { label: 'Cancelado', className: 'border-rose-500 text-rose-500 bg-rose-500/10' },
};

export function AdminCustomerDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [detail, setDetail] = useState<AdminCustomerDetailResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCustomer = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const res = await adminFetchCustomerDetail(id);
    if (res.error) {
      setError(res.error);
    } else {
      setDetail(res.data);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="w-12 h-12 border-4 border-ya-gray border-t-ya-lime animate-spin mx-auto mb-4"></div>
        <p className="font-mono text-xs uppercase tracking-widest text-gray-400">
          Cargando ficha del cliente...
        </p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="p-8 border-4 border-rose-500/50 bg-rose-500/10 text-center max-w-xl mx-auto space-y-4">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-black uppercase text-white">Cliente no encontrado</h2>
        <p className="text-xs text-gray-300 font-mono">{error || 'El cliente solicitado no existe en la base de datos.'}</p>
        <div className="pt-2">
          <Link
            to="/admin/clientes"
            className="inline-flex items-center gap-2 px-4 py-2 bg-ya-lime text-ya-black font-black uppercase text-xs hover:bg-white transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Volver a Clientes</span>
          </Link>
        </div>
      </div>
    );
  }

  const { customer, orders, addresses, summary } = detail;

  const registerDate = new Date(customer.created_at).toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-ya-gray pb-4">
        <Link
          to="/admin/clientes"
          className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-400 hover:text-ya-lime transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Volver al listado de clientes</span>
        </Link>

        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-gray-400">ID: {customer.id}</span>
          <button
            type="button"
            onClick={loadCustomer}
            className="p-1.5 border border-ya-gray hover:border-ya-lime text-gray-400 hover:text-white transition-colors"
            title="Refrescar ficha"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Customer Header Card */}
      <div className="border-4 border-ya-gray bg-ya-black p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-ya-gray border-2 border-ya-gray text-ya-lime flex items-center justify-center shrink-0">
              <User size={28} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white font-sans">
                  {customer.full_name}
                </h1>
                <span className="px-2.5 py-0.5 border border-ya-lime/40 bg-ya-lime/10 text-ya-lime text-[10px] font-mono font-bold uppercase">
                  {customer.role}
                </span>
              </div>
              <p className="text-xs font-mono text-gray-400 capitalize mt-1 flex items-center gap-1.5">
                <Calendar size={13} />
                <span>Registrado el {registerDate}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Contact info strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t-2 border-ya-gray text-xs font-mono">
          <div className="flex items-center gap-2 text-gray-300">
            <Mail size={15} className="text-ya-lime shrink-0" />
            <span className="text-gray-400">Email:</span>
            <span className="text-white font-bold">{customer.email || 'No disponible'}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-300">
            <Phone size={15} className="text-ya-lime shrink-0" />
            <span className="text-gray-400">Teléfono:</span>
            <span className="text-white font-bold">{customer.phone || 'No especificado'}</span>
          </div>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border-4 border-ya-gray bg-ya-black p-4">
          <span className="text-[10px] font-mono uppercase text-gray-400 block">Pedidos Realizados</span>
          <span className="text-3xl font-black text-white font-mono">{summary.totalOrders}</span>
        </div>

        <div className="border-4 border-ya-gray bg-ya-black p-4">
          <span className="text-[10px] font-mono uppercase text-gray-400 block">Gasto Total Acumulado</span>
          <span className="text-3xl font-black text-ya-lime font-mono">{euro(summary.totalSpent)}</span>
        </div>

        <div className="border-4 border-ya-gray bg-ya-black p-4">
          <span className="text-[10px] font-mono uppercase text-gray-400 block">Ticket Medio</span>
          <span className="text-3xl font-black text-white font-mono">{euro(summary.averageOrder)}</span>
        </div>
      </div>

      {/* Two Columns: Orders History vs Saved Addresses */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Orders History (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="border-4 border-ya-gray bg-ya-black p-6">
            <div className="flex items-center justify-between mb-4 border-b-2 border-ya-gray pb-3">
              <h2 className="text-base font-black uppercase tracking-wider text-white flex items-center gap-2">
                <ShoppingBag size={18} className="text-ya-lime" />
                <span>Historial de Pedidos ({orders.length})</span>
              </h2>
            </div>

            {orders.length === 0 ? (
              <div className="py-10 text-center text-gray-400 font-mono text-xs">
                Este cliente todavía no ha realizado ningún pedido en YA.
              </div>
            ) : (
              <div className="divide-y-2 divide-ya-gray font-mono">
                {orders.map((ord) => {
                  const badge = statusBadges[ord.status] || {
                    label: ord.status,
                    className: 'border-gray-500 text-gray-300',
                  };
                  const dateFormatted = new Date(ord.created_at).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={ord.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-ya-gray/20 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/admin/pedidos/${ord.id}`}
                            className="font-black text-white hover:text-ya-lime text-sm"
                          >
                            {ord.order_number}
                          </Link>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-black uppercase border ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-400 mt-1">{dateFormatted}</div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="font-black text-white text-sm">{euro(ord.total)}</span>
                        <Link
                          to={`/admin/pedidos/${ord.id}`}
                          className="px-3 py-1 border border-ya-gray hover:border-ya-lime hover:text-ya-lime text-[11px] font-black uppercase transition-colors flex items-center gap-1"
                        >
                          <span>Ver</span>
                          <ArrowUpRight size={12} />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Saved Addresses & Security Notice */}
        <div className="space-y-6">
          {/* Addresses Card */}
          <div className="border-4 border-ya-gray bg-ya-black p-6">
            <h2 className="text-base font-black uppercase tracking-wider text-white mb-4 border-b-2 border-ya-gray pb-3 flex items-center gap-2">
              <MapPin size={18} className="text-ya-lime" />
              <span>Direcciones Guardadas ({addresses.length})</span>
            </h2>

            {addresses.length === 0 ? (
              <div className="py-6 text-center text-gray-400 font-mono text-xs">
                No tiene direcciones guardadas en su libreta.
              </div>
            ) : (
              <div className="space-y-3 font-mono text-xs">
                {addresses.map((addr) => (
                  <div key={addr.id} className="p-3 border-2 border-ya-gray bg-ya-gray/20 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white font-sans">{addr.name}</span>
                      {addr.is_default && (
                        <span className="px-1.5 py-0.5 text-[9px] bg-ya-lime text-ya-black font-black uppercase">
                          Predeterminada
                        </span>
                      )}
                    </div>
                    <div className="text-gray-300">
                      {addr.street} {addr.number}
                      {addr.floor_door ? `, ${addr.floor_door}` : ''}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {addr.postal_code} • {addr.city}
                    </div>
                    {addr.notes && (
                      <div className="text-[10px] text-gray-400 italic pt-1">
                        "{addr.notes}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Security & Data Protection Notice */}
          <div className="border-4 border-ya-gray bg-ya-gray/10 p-5 space-y-2 font-mono text-xs">
            <div className="flex items-center gap-2 text-ya-lime font-bold uppercase text-[11px]">
              <Lock size={14} />
              <span>Protección de Identidad y Seguridad</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Por especificación de seguridad de la Phase 3A, las acciones críticas (cambio de contraseña,
              modificación directa de credenciales o eliminación de usuarios de Auth) están expresamente
              bloqueadas desde esta interfaz administrativa para prevenir brechas o elevaciones de privilegios.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
