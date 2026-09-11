import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Truck,
  Search,
  RefreshCw,
  AlertTriangle,
  ArrowUpRight,
  Plus,
  Phone,
  Mail,
  CheckCircle2,
  X,
  Loader2,
  Check,
  Power,
} from 'lucide-react';
import {
  adminFetchCouriers,
  adminSearchUserByEmail,
  adminAssignCourier,
  adminToggleCourierActive,
  adminToggleCourierAvailable,
} from '../../lib/adminCouriers';
import type { AdminCourierListItem, DbProfile } from '../../types/app';
import { euro } from '../../data/products';

export function AdminCouriersPage() {
  const [couriers, setCouriers] = useState<AdminCourierListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [availFilter, setAvailFilter] = useState<'all' | 'available' | 'unavailable'>('all');

  // Modal para añadir repartidor
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [isSearchingUser, setIsSearchingUser] = useState(false);
  const [userSearchResult, setUserSearchResult] = useState<{
    user: DbProfile | null;
    isAlreadyCourier: boolean;
    courierId?: string;
  } | null>(null);
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);

  // Formulario de asignación de repartidor
  const [formCommission, setFormCommission] = useState('15');
  const [formFixedFee, setFormFixedFee] = useState('1.00');
  const [formVehicle, setFormVehicle] = useState('Moto');
  const [formActive, setFormActive] = useState(true);
  const [formAvailable, setFormAvailable] = useState(false);
  const [formNotes, setFormNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Carga de repartidores
  const loadCouriers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await adminFetchCouriers({
      search: searchTerm,
      status: statusFilter,
      availability: availFilter,
    });
    if (res.error) {
      setError(res.error);
    } else {
      setCouriers(res.data);
    }
    setLoading(false);
  }, [searchTerm, statusFilter, availFilter]);

  useEffect(() => {
    loadCouriers();
  }, [loadCouriers]);

  // Manejar búsqueda de usuario por email
  const handleSearchUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchEmail.trim()) return;

    setIsSearchingUser(true);
    setUserSearchResult(null);
    setSearchFeedback(null);
    setAssignError(null);

    const res = await adminSearchUserByEmail(searchEmail);
    setIsSearchingUser(false);

    if (res.error) {
      setSearchFeedback(res.error);
      return;
    }

    if (!res.user) {
      setSearchFeedback('Este usuario todavía no tiene una cuenta en YA.');
      setUserSearchResult({ user: null, isAlreadyCourier: false });
    } else {
      setUserSearchResult({
        user: res.user,
        isAlreadyCourier: res.isAlreadyCourier,
        courierId: res.courierId,
      });
    }
  };

  // Manejar asignación
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userSearchResult?.user) return;

    const commissionNum = parseFloat(formCommission);
    const fixedFeeNum = parseFloat(formFixedFee);

    if (isNaN(commissionNum) || commissionNum < 0 || commissionNum > 100) {
      setAssignError('La comisión debe ser un porcentaje válido entre 0 y 100.');
      return;
    }

    if (isNaN(fixedFeeNum) || fixedFeeNum < 0) {
      setAssignError('La tarifa fija no puede ser negativa.');
      return;
    }

    setIsSubmitting(true);
    setAssignError(null);

    const res = await adminAssignCourier({
      profileId: userSearchResult.user.id,
      commissionPercent: commissionNum,
      fixedFee: fixedFeeNum,
      active: formActive,
      available: formAvailable,
      vehicleType: formVehicle.trim() || null,
      notes: formNotes.trim() || null,
    });

    setIsSubmitting(false);

    if (res.error) {
      setAssignError(res.error);
    } else {
      // Éxito: cerrar modal y refrescar
      setIsAddModalOpen(false);
      resetModal();
      setActionNotice(`Repartidor ${userSearchResult.user.full_name} asignado correctamente.`);
      setTimeout(() => setActionNotice(null), 5000);
      loadCouriers();
    }
  };

  const resetModal = () => {
    setSearchEmail('');
    setUserSearchResult(null);
    setSearchFeedback(null);
    setAssignError(null);
    setFormCommission('15');
    setFormFixedFee('1.00');
    setFormVehicle('Moto');
    setFormActive(true);
    setFormAvailable(false);
    setFormNotes('');
  };

  // Toggle rápido de activo
  const handleToggleActive = async (courier: AdminCourierListItem) => {
    const res = await adminToggleCourierActive(courier.id, courier.active);
    if (res.error) {
      alert(`Error al cambiar estado: ${res.error}`);
    } else {
      setCouriers((prev) =>
        prev.map((c) =>
          c.id === courier.id
            ? {
                ...c,
                active: res.newActive,
                available: !res.newActive ? false : c.available,
              }
            : c
        )
      );
    }
  };

  // Toggle rápido de disponible
  const handleToggleAvailable = async (courier: AdminCourierListItem) => {
    if (!courier.active && !courier.available) {
      alert('Un repartidor inactivo no puede ponerse disponible. Actívalo primero.');
      return;
    }

    const res = await adminToggleCourierAvailable(courier.id, courier.available, courier.active);
    if (res.error) {
      alert(`Error al cambiar disponibilidad: ${res.error}`);
    } else {
      setCouriers((prev) =>
        prev.map((c) => (c.id === courier.id ? { ...c, available: res.newAvailable } : c))
      );
    }
  };

  // Métricas rápidas
  const totalCount = couriers.length;
  const activeCount = couriers.filter((c) => c.active).length;
  const availableCount = couriers.filter((c) => c.active && c.available).length;
  const inactiveCount = couriers.filter((c) => !c.active).length;

  return (
    <div className="space-y-6">
      {/* Barra superior de título y acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-ya-gray pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            <Truck className="text-ya-lime" size={28} />
            <span>Gestión de Repartidores</span>
            <span className="text-xs px-2 py-0.5 border border-ya-gray bg-ya-gray/30 text-gray-300 font-mono">
              Fase 4A
            </span>
          </h1>
          <p className="text-xs font-mono text-gray-400 mt-1">
            Administración operativa de repartidores, disponibilidades y remuneración individual
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadCouriers}
            className="flex items-center gap-1.5 px-3 py-2 bg-ya-gray text-white hover:bg-white hover:text-ya-black text-xs font-black uppercase tracking-wider transition-colors border border-gray-700"
            title="Refrescar lista"
          >
            <RefreshCw size={14} />
            <span className="hidden sm:inline">Refrescar</span>
          </button>

          <button
            type="button"
            id="add-courier-btn"
            onClick={() => {
              resetModal();
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-ya-lime text-ya-black hover:bg-white text-xs font-black uppercase tracking-wider transition-colors"
          >
            <Plus size={16} />
            <span>Añadir repartidor</span>
          </button>
        </div>
      </div>

      {/* Aviso de acción exitosa */}
      {actionNotice && (
        <div className="p-3 bg-ya-lime/10 border-2 border-ya-lime text-ya-lime text-xs font-mono flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Tarjetas de métricas rápidas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 bg-ya-black border-2 border-ya-gray">
          <div className="text-[10px] font-mono uppercase text-gray-400">Total Repartidores</div>
          <div className="text-2xl font-black text-white mt-1">{totalCount}</div>
          <div className="text-[10px] font-mono text-gray-500 mt-0.5">Inscritos en YA</div>
        </div>

        <div className="p-4 bg-ya-black border-2 border-ya-gray">
          <div className="text-[10px] font-mono uppercase text-emerald-400">Activos</div>
          <div className="text-2xl font-black text-emerald-400 mt-1">{activeCount}</div>
          <div className="text-[10px] font-mono text-gray-500 mt-0.5">Operativos en plataforma</div>
        </div>

        <div className="p-4 bg-ya-black border-2 border-ya-lime/40">
          <div className="text-[10px] font-mono uppercase text-ya-lime flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-ya-lime animate-pulse"></span>
            Disponibles Ahora
          </div>
          <div className="text-2xl font-black text-ya-lime mt-1">{availableCount}</div>
          <div className="text-[10px] font-mono text-gray-400 mt-0.5">Listos para recibir pedidos (4C)</div>
        </div>

        <div className="p-4 bg-ya-black border-2 border-ya-gray">
          <div className="text-[10px] font-mono uppercase text-rose-400">Inactivos</div>
          <div className="text-2xl font-black text-rose-400 mt-1">{inactiveCount}</div>
          <div className="text-[10px] font-mono text-gray-500 mt-0.5">Desactivados temporalmente</div>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Campo de búsqueda */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
              <Search size={16} />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, email o teléfono de repartidor..."
              className="w-full pl-10 pr-4 py-2.5 bg-ya-black border-2 border-ya-gray text-white placeholder-gray-500 font-mono text-xs focus:outline-none focus:border-ya-lime transition-colors"
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

          {/* Filtro de Estado */}
          <div className="flex items-center gap-1 bg-ya-black border-2 border-ya-gray p-1">
            <span className="text-[10px] font-mono text-gray-400 uppercase px-2">Estado:</span>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 text-[11px] font-mono uppercase ${
                statusFilter === 'all'
                  ? 'bg-ya-lime text-ya-black font-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-2.5 py-1 text-[11px] font-mono uppercase ${
                statusFilter === 'active'
                  ? 'bg-emerald-500 text-black font-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Activos
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('inactive')}
              className={`px-2.5 py-1 text-[11px] font-mono uppercase ${
                statusFilter === 'inactive'
                  ? 'bg-rose-500 text-white font-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Inactivos
            </button>
          </div>

          {/* Filtro de Disponibilidad */}
          <div className="flex items-center gap-1 bg-ya-black border-2 border-ya-gray p-1">
            <span className="text-[10px] font-mono text-gray-400 uppercase px-2">Disponibilidad:</span>
            <button
              type="button"
              onClick={() => setAvailFilter('all')}
              className={`px-2.5 py-1 text-[11px] font-mono uppercase ${
                availFilter === 'all'
                  ? 'bg-ya-lime text-ya-black font-black'
                : 'text-gray-400 hover:text-white'
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setAvailFilter('available')}
              className={`px-2.5 py-1 text-[11px] font-mono uppercase ${
                availFilter === 'available'
                  ? 'bg-ya-lime text-ya-black font-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Disponibles
            </button>
            <button
              type="button"
              onClick={() => setAvailFilter('unavailable')}
              className={`px-2.5 py-1 text-[11px] font-mono uppercase ${
                availFilter === 'unavailable'
                  ? 'bg-gray-700 text-white font-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              No disp.
            </button>
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-10 h-10 border-4 border-ya-gray border-t-ya-lime animate-spin mx-auto mb-3"></div>
          <p className="font-mono text-xs uppercase tracking-widest text-gray-400">
            Cargando repartidores de YA...
          </p>
        </div>
      ) : error ? (
        <div className="p-8 border-4 border-rose-500/50 bg-rose-500/10 text-center max-w-lg mx-auto">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <div className="text-base font-black uppercase text-white mb-2">
            Error al consultar repartidores
          </div>
          <p className="text-xs text-gray-300 font-mono mb-4">{error}</p>
          <button
            type="button"
            onClick={loadCouriers}
            className="px-4 py-2 bg-ya-lime text-ya-black font-black uppercase text-xs hover:bg-white transition-colors"
          >
            Reintentar
          </button>
        </div>
      ) : couriers.length === 0 ? (
        <div className="p-12 border-2 border-dashed border-ya-gray text-center max-w-lg mx-auto space-y-4">
          <Truck className="w-12 h-12 text-gray-600 mx-auto" />
          <div>
            <h3 className="text-base font-black uppercase text-white">No hay repartidores encontrados</h3>
            <p className="text-xs font-mono text-gray-400 mt-1">
              {searchTerm || statusFilter !== 'all' || availFilter !== 'all'
                ? 'Ningún repartidor coincide con los filtros aplicados.'
                : 'Aún no has registrado ningún repartidor en YA. Pulsa el botón superior para añadir el primero.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              resetModal();
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-ya-lime text-ya-black font-black uppercase text-xs tracking-wider hover:bg-white transition-colors"
          >
            <Plus size={16} />
            <span>Añadir primer repartidor</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Tabla para pantallas medianas y grandes */}
          <div className="hidden md:block overflow-x-auto border-2 border-ya-gray bg-ya-black">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-ya-gray/60 text-gray-400 uppercase text-[10px] tracking-wider border-b border-ya-gray">
                <tr>
                  <th className="py-3 px-4">Repartidor</th>
                  <th className="py-3 px-4">Contacto</th>
                  <th className="py-3 px-4">Remuneración Configurada</th>
                  <th className="py-3 px-4">Entregas / Ganancias</th>
                  <th className="py-3 px-4">Estado Operativo</th>
                  <th className="py-3 px-4">Disponibilidad</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ya-gray/40">
                {couriers.map((courier) => {
                  return (
                    <tr key={courier.id} className="hover:bg-ya-gray/20 transition-colors">
                      {/* Repartidor */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-sm flex items-center gap-2">
                          <Link
                            to={`/admin/repartidores/${courier.id}`}
                            className="hover:text-ya-lime transition-colors"
                          >
                            {courier.full_name}
                          </Link>
                          {courier.vehicle_type && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-ya-gray/80 text-gray-300 border border-gray-700">
                              {courier.vehicle_type}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          Alta: {new Date(courier.created_at).toLocaleDateString('es-ES')}
                        </div>
                      </td>

                      {/* Contacto */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          {courier.email && (
                            <div className="flex items-center gap-1.5 text-gray-300">
                              <Mail size={12} className="text-gray-500 shrink-0" />
                              <span className="truncate max-w-[180px]">{courier.email}</span>
                            </div>
                          )}
                          {courier.phone && (
                            <div className="flex items-center gap-1.5 text-gray-400">
                              <Phone size={12} className="text-gray-500 shrink-0" />
                              <span>{courier.phone}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Remuneración */}
                      <td className="py-3 px-4">
                        <div className="inline-flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-ya-lime/10 border border-ya-lime/40 text-ya-lime font-black text-xs">
                            {courier.commission_percent}% comisión
                          </span>
                          <span className="text-[11px] text-gray-300 font-bold">
                            + {euro(courier.fixed_fee)} fijo / pedido
                          </span>
                        </div>
                      </td>

                      {/* Entregas y Ganancias (Fase 4D) */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-xs">
                          {courier.delivered_count ?? 0} entregas
                        </div>
                        <div className="text-[11px] font-mono text-ya-lime font-black mt-0.5">
                          Total: {euro(courier.total_earnings ?? 0)}
                        </div>
                        {(courier.today_earnings ?? 0) > 0 && (
                          <div className="text-[10px] font-mono text-gray-400 mt-0.5">
                            Hoy: {euro(courier.today_earnings ?? 0)}
                          </div>
                        )}
                      </td>

                      {/* Estado: Activo / Inactivo */}
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(courier)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                            courier.active
                              ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                              : 'border-rose-500/50 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                          }`}
                          title="Haz clic para conmutar estado activo/inactivo"
                        >
                          <Power size={11} />
                          <span>{courier.active ? 'Activo' : 'Inactivo'}</span>
                        </button>
                      </td>

                      {/* Disponibilidad */}
                      <td className="py-3 px-4">
                        {!courier.active ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono text-gray-500 border border-gray-800 bg-gray-900/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-600"></span>
                            Inactivo (No disp.)
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleAvailable(courier)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                              courier.available
                                ? 'border-ya-lime bg-ya-lime/15 text-ya-lime hover:bg-ya-lime/25'
                                : 'border-amber-500/50 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                            }`}
                            title="Haz clic para conmutar disponibilidad en guardia"
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                courier.available ? 'bg-ya-lime animate-pulse' : 'bg-amber-500'
                              }`}
                            ></span>
                            <span>{courier.available ? 'Disponible' : 'No disponible'}</span>
                          </button>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-3 px-4 text-right">
                        <Link
                          to={`/admin/repartidores/${courier.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-ya-gray hover:bg-ya-lime hover:text-ya-black text-white text-[11px] font-black uppercase tracking-wider transition-colors border border-gray-700"
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

          {/* Tarjetas para móviles */}
          <div className="md:hidden space-y-3">
            {couriers.map((courier) => (
              <div key={courier.id} className="p-4 bg-ya-black border-2 border-ya-gray space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link
                      to={`/admin/repartidores/${courier.id}`}
                      className="font-bold text-white text-base hover:text-ya-lime transition-colors flex items-center gap-1.5"
                    >
                      <span>{courier.full_name}</span>
                      <ArrowUpRight size={14} className="text-gray-400" />
                    </Link>
                    {courier.email && <div className="text-xs text-gray-400 font-mono mt-0.5">{courier.email}</div>}
                  </div>

                  <span
                    className={`px-2 py-0.5 text-[10px] font-black uppercase border ${
                      courier.active
                        ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                        : 'border-rose-500 text-rose-400 bg-rose-500/10'
                    }`}
                  >
                    {courier.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-mono py-2 border-y border-ya-gray/60">
                  <span className="text-gray-400">Remuneración:</span>
                  <span className="text-ya-lime font-black">
                    {courier.commission_percent}% + {euro(courier.fixed_fee)} fijo
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-mono pb-2 border-b border-ya-gray/60">
                  <span className="text-gray-400">Entregas / Ganancias:</span>
                  <div className="text-right">
                    <span className="text-white font-bold mr-2">{courier.delivered_count ?? 0} entregas</span>
                    <span className="text-ya-lime font-black">{euro(courier.total_earnings ?? 0)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!courier.active}
                    onClick={() => handleToggleAvailable(courier)}
                    className={`flex-1 py-2 px-3 text-[11px] font-black uppercase tracking-wider border flex items-center justify-center gap-1.5 transition-colors ${
                      !courier.active
                        ? 'opacity-40 border-gray-700 text-gray-500'
                        : courier.available
                        ? 'border-ya-lime bg-ya-lime/10 text-ya-lime hover:bg-ya-lime/20'
                        : 'border-amber-500/50 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        courier.available && courier.active ? 'bg-ya-lime animate-pulse' : 'bg-gray-500'
                      }`}
                    ></span>
                    <span>{courier.available && courier.active ? 'Disponible' : 'No disponible'}</span>
                  </button>

                  <Link
                    to={`/admin/repartidores/${courier.id}`}
                    className="py-2 px-4 bg-ya-gray hover:bg-white hover:text-ya-black text-white text-[11px] font-black uppercase tracking-wider transition-colors border border-gray-700"
                  >
                    Ver Ficha
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: AÑADIR REPARTIDOR (SECCIÓN 3 Y 12 DEL PROMPT) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-ya-black border-4 border-ya-lime max-w-lg w-full p-6 space-y-5 text-white shadow-2xl relative max-h-[90vh] overflow-y-auto">
            {/* Cabecera del modal */}
            <div className="flex items-center justify-between border-b-2 border-ya-gray pb-3">
              <div className="flex items-center gap-2">
                <Truck className="text-ya-lime" size={22} />
                <h3 className="text-lg font-black uppercase tracking-tight text-white">
                  Añadir Repartidor
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 hover:text-white p-1"
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Paso 1: Introducir email y buscar usuario */}
            <form onSubmit={handleSearchUser} className="space-y-2">
              <label className="block text-xs font-mono uppercase text-gray-300">
                1. Buscar usuario de YA por correo electrónico:
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  required
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  placeholder="ej. repartidor@email.com"
                  className="flex-1 px-3 py-2.5 bg-ya-black border-2 border-ya-gray text-white text-xs font-mono placeholder-gray-600 focus:outline-none focus:border-ya-lime"
                />
                <button
                  type="submit"
                  disabled={isSearchingUser || !searchEmail.trim()}
                  className="px-4 py-2.5 bg-ya-lime text-ya-black font-black uppercase text-xs tracking-wider hover:bg-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSearchingUser ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Buscando...</span>
                    </>
                  ) : (
                    <>
                      <Search size={14} />
                      <span>Buscar</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Feedback cuando no se encuentra usuario */}
            {searchFeedback && !userSearchResult?.user && (
              <div className="p-4 bg-amber-500/10 border-2 border-amber-500 text-amber-300 text-xs font-mono space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-400 uppercase">
                  <AlertTriangle size={16} />
                  <span>{searchFeedback}</span>
                </div>
                <p className="text-[11px] text-gray-300">
                  Para poder asignar a alguien como repartidor, primero debe registrarse en YA
                  (iniciando sesión con Google o correo en la aplicación).
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchEmail('');
                      setSearchFeedback(null);
                    }}
                    className="text-[10px] uppercase font-bold text-white hover:underline"
                  >
                    Probar con otro correo
                  </button>
                </div>
              </div>
            )}

            {/* Si el usuario ya es repartidor */}
            {userSearchResult?.isAlreadyCourier && (
              <div className="p-4 bg-blue-500/10 border-2 border-blue-500 text-blue-300 text-xs font-mono space-y-2">
                <div className="flex items-center gap-2 font-bold text-blue-400 uppercase">
                  <CheckCircle2 size={16} />
                  <span>Este usuario ya está registrado como repartidor</span>
                </div>
                <p className="text-[11px] text-gray-300">
                  {userSearchResult.user?.full_name} ya figura con perfil de repartidor en el sistema.
                </p>
                {userSearchResult.courierId && (
                  <div className="pt-2">
                    <Link
                      to={`/admin/repartidores/${userSearchResult.courierId}`}
                      onClick={() => setIsAddModalOpen(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ya-lime text-ya-black font-black uppercase text-[10px]"
                    >
                      <span>Abrir su ficha</span>
                      <ArrowUpRight size={12} />
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Paso 2: Usuario encontrado -> Formulario de configuración */}
            {userSearchResult?.user && !userSearchResult.isAlreadyCourier && (
              <form onSubmit={handleAssignSubmit} className="space-y-4 pt-2 border-t-2 border-ya-gray">
                {/* Ficha resumen del usuario encontrado */}
                <div className="p-3 bg-ya-gray/30 border border-ya-lime/40 space-y-1">
                  <div className="text-[10px] font-mono uppercase text-ya-lime font-bold flex items-center gap-1">
                    <Check size={13} />
                    <span>Usuario encontrado en YA</span>
                  </div>
                  <div className="text-sm font-bold text-white">{userSearchResult.user.full_name}</div>
                  <div className="text-xs text-gray-300 font-mono">{userSearchResult.user.email}</div>
                  {userSearchResult.user.phone && (
                    <div className="text-[11px] text-gray-400 font-mono">
                      Tel: {userSearchResult.user.phone}
                    </div>
                  )}
                </div>

                {/* Configuración de Remuneración individual */}
                <div className="space-y-3">
                  <div className="text-xs font-black uppercase tracking-wider text-white border-b border-ya-gray/60 pb-1">
                    Configuración de Remuneración Individual
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-mono uppercase text-gray-300 mb-1">
                        Comisión (%) <span className="text-ya-lime">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          required
                          value={formCommission}
                          onChange={(e) => setFormCommission(e.target.value)}
                          className="w-full pl-3 pr-8 py-2 bg-ya-black border-2 border-ya-gray text-white text-xs font-mono focus:outline-none focus:border-ya-lime"
                          placeholder="15"
                        />
                        <span className="absolute right-2.5 top-2 text-xs font-bold text-gray-400">%</span>
                      </div>
                      <span className="text-[9px] font-mono text-gray-500">Ej: 15% o 20%</span>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase text-gray-300 mb-1">
                        Tarifa fija (€) <span className="text-ya-lime">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.10"
                          min="0"
                          required
                          value={formFixedFee}
                          onChange={(e) => setFormFixedFee(e.target.value)}
                          className="w-full pl-3 pr-8 py-2 bg-ya-black border-2 border-ya-gray text-white text-xs font-mono focus:outline-none focus:border-ya-lime"
                          placeholder="1.00"
                        />
                        <span className="absolute right-2.5 top-2 text-xs font-bold text-gray-400">€</span>
                      </div>
                      <span className="text-[9px] font-mono text-gray-500">Ej: 1.00 € o 0.50 €</span>
                    </div>
                  </div>

                  {/* Vehículo */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-gray-300 mb-1">
                      Tipo de vehículo (opcional)
                    </label>
                    <select
                      value={formVehicle}
                      onChange={(e) => setFormVehicle(e.target.value)}
                      className="w-full px-3 py-2 bg-ya-black border-2 border-ya-gray text-white text-xs font-mono focus:outline-none focus:border-ya-lime"
                    >
                      <option value="Moto">Moto</option>
                      <option value="Bicicleta">Bicicleta</option>
                      <option value="Patinete eléctrico">Patinete eléctrico</option>
                      <option value="Coche">Coche</option>
                      <option value="A pie">A pie</option>
                    </select>
                  </div>

                  {/* Estados iniciales */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <label className="flex items-center gap-2 text-xs font-mono text-gray-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formActive}
                        onChange={(e) => setFormActive(e.target.checked)}
                        className="w-4 h-4 accent-ya-lime"
                      />
                      <span>Activo en YA</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs font-mono text-gray-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formAvailable}
                        onChange={(e) => setFormAvailable(e.target.checked)}
                        disabled={!formActive}
                        className="w-4 h-4 accent-ya-lime"
                      />
                      <span className={!formActive ? 'opacity-40' : ''}>Disponible ahora</span>
                    </label>
                  </div>

                  {/* Notas internas */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-gray-300 mb-1">
                      Notas internas del administrador (opcional)
                    </label>
                    <textarea
                      rows={2}
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Observaciones de horario, zona o contrato..."
                      className="w-full px-3 py-2 bg-ya-black border-2 border-ya-gray text-white text-xs font-mono focus:outline-none focus:border-ya-lime placeholder-gray-600"
                    />
                  </div>
                </div>

                {assignError && (
                  <div className="p-3 bg-rose-500/10 border-2 border-rose-500 text-rose-300 text-xs font-mono flex items-center gap-2">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>{assignError}</span>
                  </div>
                )}

                {/* Botones de acción */}
                <div className="flex justify-end gap-2 pt-2 border-t border-ya-gray">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2.5 bg-ya-gray text-gray-300 hover:text-white font-black uppercase text-xs"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-ya-lime text-ya-black hover:bg-white font-black uppercase text-xs tracking-wider transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <>
                        <Check size={15} />
                        <span>Asignar como repartidor</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Botón de cierre inferior si no se ha buscado aún */}
            {!userSearchResult?.user && (
              <div className="flex justify-end pt-2 border-t border-ya-gray">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-ya-gray text-gray-300 hover:text-white font-black uppercase text-xs"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
