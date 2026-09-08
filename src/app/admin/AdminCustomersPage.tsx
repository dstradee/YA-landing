import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Search,
  RefreshCw,
  AlertTriangle,
  ArrowUpRight,
  Phone,
  Mail,
} from 'lucide-react';
import { adminFetchCustomers } from '../../lib/adminCustomers';
import type { AdminCustomerListItem } from '../../types/app';
import { euro } from '../../data/products';

export function AdminCustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await adminFetchCustomers({ search: searchTerm });
    if (res.error) {
      setError(res.error);
    } else {
      setCustomers(res.data);
    }
    setLoading(false);
  }, [searchTerm]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  return (
    <div className="space-y-6">
      {/* Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-ya-gray pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            <Users className="text-ya-lime" size={28} />
            <span>Gestión de Clientes</span>
            <span className="text-xs px-2 py-0.5 border border-ya-gray bg-ya-gray/30 text-gray-300 font-mono">
              {customers.length} registrados
            </span>
          </h1>
          <p className="text-xs font-mono text-gray-400 mt-1">
            Listado de perfiles reales de usuarios registrados en YA
          </p>
        </div>

        <button
          type="button"
          onClick={loadCustomers}
          className="flex items-center gap-1.5 px-3 py-2 bg-ya-lime text-ya-black hover:bg-white text-xs font-black uppercase tracking-wider transition-colors self-start sm:self-auto"
        >
          <RefreshCw size={14} />
          <span>Refrescar</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
          <Search size={16} />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por nombre, email o teléfono de cliente..."
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

      {/* Content Area */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-10 h-10 border-4 border-ya-gray border-t-ya-lime animate-spin mx-auto mb-3"></div>
          <p className="font-mono text-xs uppercase tracking-widest text-gray-400">
            Cargando clientes de Supabase...
          </p>
        </div>
      ) : error ? (
        <div className="p-8 border-4 border-rose-500/50 bg-rose-500/10 text-center max-w-lg mx-auto">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <div className="text-base font-black uppercase text-white mb-2">
            No se han podido cargar los clientes
          </div>
          <p className="text-xs text-gray-300 font-mono mb-4">{error}</p>
          <button
            type="button"
            onClick={loadCustomers}
            className="px-4 py-2 bg-ya-lime text-ya-black font-black uppercase text-xs"
          >
            Reintentar
          </button>
        </div>
      ) : customers.length === 0 ? (
        <div className="border-4 border-dashed border-ya-gray p-12 text-center bg-ya-gray/5">
          <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <div className="text-base font-black uppercase text-white mb-1">
            Todavía no hay clientes
          </div>
          <p className="text-xs font-mono text-gray-400 max-w-sm mx-auto">
            {searchTerm
              ? 'No hay clientes que coincidan con los términos de búsqueda.'
              : 'Cuando los usuarios se registren en la plataforma YA, aparecerán listados aquí.'}
          </p>
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="mt-4 px-4 py-2 border-2 border-ya-lime text-ya-lime text-xs font-black uppercase tracking-wider hover:bg-ya-lime hover:text-ya-black transition-colors"
            >
              Limpiar búsqueda
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block border-4 border-ya-gray bg-ya-black overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b-4 border-ya-gray bg-ya-gray/30 text-gray-400 font-mono uppercase text-[11px]">
                    <th className="py-3 px-4 font-black">Cliente</th>
                    <th className="py-3 px-4 font-black">Email</th>
                    <th className="py-3 px-4 font-black">Teléfono</th>
                    <th className="py-3 px-4 font-black">Registro</th>
                    <th className="py-3 px-4 font-black text-center">Pedidos</th>
                    <th className="py-3 px-4 font-black text-right">Gasto Total</th>
                    <th className="py-3 px-4 font-black text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-ya-gray font-mono">
                  {customers.map((c) => {
                    const registerDate = new Date(c.created_at).toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    });

                    return (
                      <tr key={c.id} className="hover:bg-ya-gray/20 transition-colors">
                        <td className="py-3 px-4">
                          <Link
                            to={`/admin/clientes/${c.id}`}
                            className="font-black text-white hover:text-ya-lime text-sm tracking-tight font-sans block"
                          >
                            {c.full_name}
                          </Link>
                          <span className="text-[10px] text-gray-400 font-mono uppercase">
                            Rol: {c.role}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-gray-300">
                            {c.email || <span className="text-gray-500 italic">No disponible</span>}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-gray-300">
                            {c.phone || <span className="text-gray-500 italic">Sin teléfono</span>}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-gray-300">
                          {registerDate}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-block px-2 py-0.5 border border-ya-gray bg-ya-gray/30 text-white font-black">
                            {c.ordersCount}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-black text-white">
                          {euro(c.totalSpent)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link
                            to={`/admin/clientes/${c.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 border-2 border-ya-gray text-gray-300 hover:border-ya-lime hover:text-ya-lime text-xs font-black uppercase transition-colors"
                          >
                            <span>Ficha</span>
                            <ArrowUpRight size={13} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards View */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {customers.map((c) => {
              const registerDate = new Date(c.created_at).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              });

              return (
                <div
                  key={c.id}
                  className="border-2 border-ya-gray bg-ya-black p-4 space-y-3 hover:border-ya-lime transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <Link
                        to={`/admin/clientes/${c.id}`}
                        className="font-black text-white hover:text-ya-lime text-base tracking-tight font-sans block"
                      >
                        {c.full_name}
                      </Link>
                      <span className="text-[10px] font-mono text-gray-400">Desde: {registerDate}</span>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-ya-gray border border-ya-gray text-gray-300">
                      {c.ordersCount} pedidos
                    </span>
                  </div>

                  <div className="space-y-1 text-xs font-mono text-gray-300 pt-1 border-t border-ya-gray/60">
                    {c.email && (
                      <div className="flex items-center gap-2 truncate">
                        <Mail size={13} className="text-ya-lime shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </div>
                    )}
                    {c.phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={13} className="text-ya-lime shrink-0" />
                        <span>{c.phone}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-ya-gray text-xs">
                    <span className="font-mono text-gray-400">
                      Gasto: <strong className="text-white font-black">{euro(c.totalSpent)}</strong>
                    </span>
                    <Link
                      to={`/admin/clientes/${c.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-ya-lime text-ya-black font-black uppercase text-[11px] tracking-wider hover:bg-white transition-colors"
                    >
                      <span>Ver Ficha</span>
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
