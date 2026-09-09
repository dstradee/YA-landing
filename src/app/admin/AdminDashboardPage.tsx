import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingBag,
  Clock,
  Truck,
  CheckCircle2,
  DollarSign,
  Users,
  Package,
  Layers,
  RefreshCw,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';
import { adminFetchDashboardStats } from '../../lib/adminStats';
import type { AdminDashboardStats, AdminOrderListItem, OrderStatus } from '../../types/app';
import { euro } from '../../data/products';

const statusBadges: Record<OrderStatus, { label: string; className: string }> = {
  payment_pending: { label: '⚠️ Pago Pendiente', className: 'border-amber-500 text-amber-400 bg-amber-500/10' },
  received: { label: 'Recibido', className: 'border-yellow-400 text-yellow-400 bg-yellow-400/10' },
  preparing: { label: 'En preparación', className: 'border-blue-400 text-blue-400 bg-blue-400/10' },
  shopping: { label: 'Comprando', className: 'border-blue-400 text-blue-400 bg-blue-400/10' },
  sourcing: { label: 'Comprando', className: 'border-blue-400 text-blue-400 bg-blue-400/10' },
  ready: { label: 'Preparado', className: 'border-purple-400 text-purple-400 bg-purple-400/10' },
  prepared: { label: 'Preparado', className: 'border-purple-400 text-purple-400 bg-purple-400/10' },
  delivering: { label: 'En camino', className: 'border-ya-lime text-ya-lime bg-ya-lime/10' },
  delivered: { label: 'Entregado', className: 'border-emerald-400 text-emerald-400 bg-emerald-400/10' },
  cancelled: { label: 'Cancelado', className: 'border-rose-500 text-rose-500 bg-rose-500/10' },
};

export function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<AdminOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await adminFetchDashboardStats();
    if (res.error) {
      setError(res.error);
    } else {
      setStats(res.stats);
      setRecentOrders(res.recentOrders);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-ya-gray border-t-ya-lime animate-spin mb-4"></div>
        <p className="font-mono text-xs uppercase tracking-widest text-gray-400">
          Cargando métricas en tiempo real de Supabase...
        </p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-8 border-4 border-rose-500/50 bg-rose-500/10 max-w-xl mx-auto text-center">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-black uppercase text-white tracking-tight mb-2">
          Error al cargar datos del Dashboard
        </h2>
        <p className="text-sm text-gray-300 mb-6">{error || 'No se han podido cargar los datos.'}</p>
        <button
          type="button"
          onClick={loadData}
          className="px-6 py-3 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs hover:bg-white transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header with Title & Refresh Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-ya-gray pb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            <span>Centro de Control</span>
            <span className="text-xs px-2.5 py-1 bg-ya-lime text-ya-black font-mono font-bold tracking-widest">
              EN DIRECTO
            </span>
          </h1>
          <p className="text-gray-400 text-sm mt-1 font-mono">
            Métricas operativas y comerciales de YA en Jerez de la Frontera
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2.5 border-2 border-ya-gray hover:border-ya-lime hover:text-ya-lime text-xs font-black uppercase tracking-wider transition-colors"
          >
            <RefreshCw size={14} />
            <span>Actualizar</span>
          </button>
          <Link
            to="/admin/pedidos"
            className="flex items-center gap-2 px-4 py-2.5 bg-ya-lime text-ya-black text-xs font-black uppercase tracking-wider hover:bg-white transition-colors"
          >
            <span>Ver Pedidos</span>
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>

      {/* Primary KPI Metrics (Ventas & Pedidos) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ventas Totales */}
        <div className="border-4 border-ya-gray bg-ya-black p-5 flex flex-col justify-between hover:border-ya-lime transition-colors">
          <div className="flex items-center justify-between text-gray-400 mb-4">
            <span className="text-xs font-black uppercase tracking-wider font-mono">Ventas Totales</span>
            <div className="p-2 border border-ya-gray bg-ya-gray/30 text-ya-lime">
              <DollarSign size={18} />
            </div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {euro(stats.totalRevenue)}
            </div>
            <div className="text-xs font-mono text-gray-400 mt-2 flex items-center gap-1.5">
              <span className="text-ya-lime font-bold">Hoy:</span>
              <span className="text-white font-bold">{euro(stats.todayRevenue)}</span>
            </div>
          </div>
        </div>

        {/* Pedidos Totales */}
        <div className="border-4 border-ya-gray bg-ya-black p-5 flex flex-col justify-between hover:border-ya-lime transition-colors">
          <div className="flex items-center justify-between text-gray-400 mb-4">
            <span className="text-xs font-black uppercase tracking-wider font-mono">Pedidos Totales</span>
            <div className="p-2 border border-ya-gray bg-ya-gray/30 text-ya-lime">
              <ShoppingBag size={18} />
            </div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {stats.totalOrders}
            </div>
            <div className="text-xs font-mono text-gray-400 mt-2 flex items-center gap-1.5">
              <span className="text-ya-lime font-bold">Hoy:</span>
              <span className="text-white font-bold">{stats.todayOrders} pedidos</span>
            </div>
          </div>
        </div>

        {/* Clientes Registrados */}
        <div className="border-4 border-ya-gray bg-ya-black p-5 flex flex-col justify-between hover:border-ya-lime transition-colors">
          <div className="flex items-center justify-between text-gray-400 mb-4">
            <span className="text-xs font-black uppercase tracking-wider font-mono">Clientes</span>
            <div className="p-2 border border-ya-gray bg-ya-gray/30 text-ya-lime">
              <Users size={18} />
            </div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {stats.totalCustomers}
            </div>
            <div className="text-xs font-mono text-gray-400 mt-2">
              Cuentas de usuario registradas
            </div>
          </div>
        </div>

        {/* Catálogo Activo */}
        <div className="border-4 border-ya-gray bg-ya-black p-5 flex flex-col justify-between hover:border-ya-lime transition-colors">
          <div className="flex items-center justify-between text-gray-400 mb-4">
            <span className="text-xs font-black uppercase tracking-wider font-mono">Catálogo</span>
            <div className="p-2 border border-ya-gray bg-ya-gray/30 text-ya-lime">
              <Package size={18} />
            </div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {stats.activeProducts}
            </div>
            <div className="text-xs font-mono text-gray-400 mt-2 flex items-center gap-2">
              <span className="text-white">{stats.activeCategories} categorías</span>
              <span>•</span>
              <span className="text-gray-500">{stats.inactiveProducts} inactivos</span>
            </div>
          </div>
        </div>
      </div>

      {/* Operaciones de Pedidos en Curso (Pipeline Status) */}
      <div className="border-4 border-ya-gray bg-ya-black p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6 border-b-2 border-ya-gray pb-4">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wider text-white flex items-center gap-2">
              <TrendingUp size={20} className="text-ya-lime" />
              <span>Estado Operativo de Pedidos</span>
            </h2>
            <p className="text-xs font-mono text-gray-400">
              Desglose de pedidos según su fase en el flujo de entrega
            </p>
          </div>
          <Link
            to="/admin/pedidos"
            className="text-xs font-black uppercase tracking-wider text-ya-lime hover:underline flex items-center gap-1"
          >
            <span>Gestionar pedidos</span>
            <ArrowUpRight size={14} />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Pendientes / Recibidos */}
          <Link
            to="/admin/pedidos?status=received"
            className="p-4 border-2 border-yellow-400/40 bg-yellow-400/5 hover:border-yellow-400 transition-colors block group"
          >
            <div className="flex items-center justify-between text-yellow-400 mb-2">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider">Pendientes</span>
              <Clock size={16} />
            </div>
            <div className="text-3xl font-black text-white group-hover:text-yellow-400 transition-colors">
              {stats.pendingOrders}
            </div>
            <div className="text-[10px] font-mono text-gray-400 mt-1 uppercase">Estado: recibido</div>
          </Link>

          {/* En Preparación / Compra */}
          <Link
            to="/admin/pedidos?status=preparing"
            className="p-4 border-2 border-blue-400/40 bg-blue-400/5 hover:border-blue-400 transition-colors block group"
          >
            <div className="flex items-center justify-between text-blue-400 mb-2">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider">En Preparación</span>
              <ShoppingBag size={16} />
            </div>
            <div className="text-3xl font-black text-white group-hover:text-blue-400 transition-colors">
              {stats.preparingOrders}
            </div>
            <div className="text-[10px] font-mono text-gray-400 mt-1 uppercase">Comprando / Listo</div>
          </Link>

          {/* En Camino / Reparto */}
          <Link
            to="/admin/pedidos?status=delivering"
            className="p-4 border-2 border-ya-lime/40 bg-ya-lime/5 hover:border-ya-lime transition-colors block group"
          >
            <div className="flex items-center justify-between text-ya-lime mb-2">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider">En Camino</span>
              <Truck size={16} />
            </div>
            <div className="text-3xl font-black text-white group-hover:text-ya-lime transition-colors">
              {stats.deliveringOrders}
            </div>
            <div className="text-[10px] font-mono text-gray-400 mt-1 uppercase">Repartiendo en Jerez</div>
          </Link>

          {/* Entregados */}
          <Link
            to="/admin/pedidos?status=delivered"
            className="p-4 border-2 border-emerald-400/40 bg-emerald-400/5 hover:border-emerald-400 transition-colors block group"
          >
            <div className="flex items-center justify-between text-emerald-400 mb-2">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider">Entregados</span>
              <CheckCircle2 size={16} />
            </div>
            <div className="text-3xl font-black text-white group-hover:text-emerald-400 transition-colors">
              {stats.deliveredOrders}
            </div>
            <div className="text-[10px] font-mono text-gray-400 mt-1 uppercase">Completados</div>
          </Link>
        </div>
      </div>

      {/* Pedidos Recientes & Accesos Rápidos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Orders Table (2 columns on large) */}
        <div className="lg:col-span-2 border-4 border-ya-gray bg-ya-black p-6">
          <div className="flex items-center justify-between mb-4 border-b-2 border-ya-gray pb-3">
            <h2 className="text-base font-black uppercase tracking-wider text-white flex items-center gap-2">
              <ShoppingBag size={18} className="text-ya-lime" />
              <span>Pedidos Recientes</span>
            </h2>
            <Link
              to="/admin/pedidos"
              className="text-xs font-black uppercase tracking-wider text-ya-lime hover:underline"
            >
              Ver todos ({stats.totalOrders})
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="py-12 text-center text-gray-400 font-mono text-xs">
              Todavía no hay pedidos registrados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b-2 border-ya-gray text-gray-400 font-mono uppercase text-[11px]">
                    <th className="pb-3 font-black">Pedido</th>
                    <th className="pb-3 font-black">Cliente</th>
                    <th className="pb-3 font-black">Estado</th>
                    <th className="pb-3 font-black">Total</th>
                    <th className="pb-3 font-black text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ya-gray/60 font-mono">
                  {recentOrders.map((ord) => {
                    const badge = statusBadges[ord.status] || {
                      label: ord.status,
                      className: 'border-gray-500 text-gray-300',
                    };
                    const dateFormatted = new Date(ord.created_at).toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <tr key={ord.id} className="hover:bg-ya-gray/20 transition-colors">
                        <td className="py-3 pr-2">
                          <Link
                            to={`/admin/pedidos/${ord.id}`}
                            className="font-bold text-white hover:text-ya-lime transition-colors"
                          >
                            {ord.order_number}
                          </Link>
                          <div className="text-[10px] text-gray-400">{dateFormatted}</div>
                        </td>
                        <td className="py-3 pr-2">
                          <span className="text-gray-200 font-sans font-bold block truncate max-w-[140px]">
                            {ord.customerName}
                          </span>
                          <span className="text-[10px] text-gray-400">{ord.itemsCount} art.</span>
                        </td>
                        <td className="py-3 pr-2">
                          <span
                            className={`inline-block px-2 py-0.5 text-[10px] font-black uppercase border ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 pr-2 font-black text-white">{euro(ord.total)}</td>
                        <td className="py-3 text-right">
                          <Link
                            to={`/admin/pedidos/${ord.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-ya-gray text-gray-300 hover:border-ya-lime hover:text-ya-lime text-[11px] font-black uppercase transition-colors"
                          >
                            <span>Ver</span>
                            <ArrowUpRight size={12} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Direct Action Shortcuts & Catalog Summary */}
        <div className="space-y-6">
          <div className="border-4 border-ya-gray bg-ya-black p-6">
            <h2 className="text-base font-black uppercase tracking-wider text-white mb-4 border-b-2 border-ya-gray pb-2">
              Accesos Rápidos
            </h2>
            <div className="space-y-3">
              <Link
                to="/admin/pedidos"
                className="flex items-center justify-between p-3 border-2 border-ya-gray hover:border-ya-lime hover:bg-ya-gray/20 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-ya-gray text-ya-lime border border-ya-gray">
                    <ShoppingBag size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase text-white group-hover:text-ya-lime">
                      Gestión de Pedidos
                    </div>
                    <div className="text-[10px] font-mono text-gray-400">
                      Cambiar estados y ver detalles
                    </div>
                  </div>
                </div>
                <ArrowUpRight size={16} className="text-gray-500 group-hover:text-ya-lime" />
              </Link>

              <Link
                to="/admin/clientes"
                className="flex items-center justify-between p-3 border-2 border-ya-gray hover:border-ya-lime hover:bg-ya-gray/20 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-ya-gray text-ya-lime border border-ya-gray">
                    <Users size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase text-white group-hover:text-ya-lime">
                      Clientes Registrados
                    </div>
                    <div className="text-[10px] font-mono text-gray-400">
                      Perfiles y direcciones de entrega
                    </div>
                  </div>
                </div>
                <ArrowUpRight size={16} className="text-gray-500 group-hover:text-ya-lime" />
              </Link>

              <Link
                to="/admin/productos"
                className="flex items-center justify-between p-3 border-2 border-ya-gray hover:border-ya-lime hover:bg-ya-gray/20 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-ya-gray text-ya-lime border border-ya-gray">
                    <Package size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase text-white group-hover:text-ya-lime">
                      Catálogo de Productos
                    </div>
                    <div className="text-[10px] font-mono text-gray-400">
                      Crear, editar, stock y precios
                    </div>
                  </div>
                </div>
                <ArrowUpRight size={16} className="text-gray-500 group-hover:text-ya-lime" />
              </Link>

              <Link
                to="/admin/categorias"
                className="flex items-center justify-between p-3 border-2 border-ya-gray hover:border-ya-lime hover:bg-ya-gray/20 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-ya-gray text-ya-lime border border-ya-gray">
                    <Layers size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase text-white group-hover:text-ya-lime">
                      Categorías
                    </div>
                    <div className="text-[10px] font-mono text-gray-400">
                      Organización y orden visual
                    </div>
                  </div>
                </div>
                <ArrowUpRight size={16} className="text-gray-500 group-hover:text-ya-lime" />
              </Link>
            </div>
          </div>

          {/* Infrastructure & Security Status */}
          <div className="border-4 border-ya-gray bg-ya-gray/10 p-5">
            <div className="text-xs font-black uppercase tracking-wider text-white mb-2 font-mono flex items-center justify-between">
              <span>Seguridad de Sistema</span>
              <span className="text-ya-lime">ACTIVO</span>
            </div>
            <p className="text-[11px] font-mono text-gray-400 leading-relaxed mb-3">
              Row Level Security (RLS) activo en PostgreSQL. Las consultas de administración están
              autorizadas exclusivamente para usuarios con <code className="text-ya-lime">role = 'admin'</code>.
            </p>
            <div className="flex items-center gap-2 text-[10px] font-mono text-gray-400">
              <span className="w-1.5 h-1.5 rounded-full bg-ya-lime"></span>
              <span>Conexión Supabase validada</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
