import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Truck,
  User,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  Percent,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Save,
  Loader2,
  Shield,
  Bike,
  TrendingUp,
  Award,
  Gift,
} from 'lucide-react';
import {
  adminFetchCourierDetail,
  adminUpdateCourier,
  adminToggleCourierActive,
  adminToggleCourierAvailable,
} from '../../lib/adminCouriers';
import type { AdminCourierDetail } from '../../types/app';

export function AdminCourierDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [detail, setDetail] = useState<AdminCourierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Formulario de edición
  const [commissionInput, setCommissionInput] = useState('');
  const [fixedFeeInput, setFixedFeeInput] = useState('');
  const [vehicleInput, setVehicleInput] = useState('');
  const [activeState, setActiveState] = useState(false);
  const [availableState, setAvailableState] = useState(false);
  const [notesInput, setNotesInput] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadCourier = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const res = await adminFetchCourierDetail(id);
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setDetail(res.data);
      setCommissionInput(res.data.courier.commission_percent.toString());
      setFixedFeeInput(res.data.courier.fixed_fee.toString());
      setVehicleInput(res.data.courier.vehicle_type || 'Moto');
      setActiveState(res.data.courier.active);
      setAvailableState(res.data.courier.available);
      setNotesInput(res.data.courier.notes || '');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadCourier();
  }, [loadCourier]);

  // Guardar configuración
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    const commissionNum = parseFloat(commissionInput);
    const fixedFeeNum = parseFloat(fixedFeeInput);

    if (isNaN(commissionNum) || commissionNum < 0 || commissionNum > 100) {
      setSaveError('La comisión debe ser un valor porcentual entre 0 y 100.');
      return;
    }

    if (isNaN(fixedFeeNum) || fixedFeeNum < 0) {
      setSaveError('La tarifa fija no puede ser negativa.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const res = await adminUpdateCourier(id, {
      commissionPercent: commissionNum,
      fixedFee: fixedFeeNum,
      active: activeState,
      available: activeState ? availableState : false,
      vehicleType: vehicleInput.trim() || null,
      notes: notesInput.trim() || null,
    });

    setSaving(false);

    if (res.error) {
      setSaveError(res.error);
    } else {
      setSaveSuccess('Configuración de remuneración y estado guardada correctamente.');
      setTimeout(() => setSaveSuccess(null), 4000);
      loadCourier();
    }
  };

  // Toggle rápido de activo
  const handleToggleActiveQuick = async () => {
    if (!detail) return;
    const res = await adminToggleCourierActive(detail.courier.id, detail.courier.active);
    if (res.error) {
      setSaveError(res.error);
    } else {
      setActiveState(res.newActive);
      if (!res.newActive) setAvailableState(false);
      loadCourier();
    }
  };

  // Toggle rápido de disponible
  const handleToggleAvailableQuick = async () => {
    if (!detail) return;
    if (!detail.courier.active) {
      setSaveError('No puedes marcar como disponible a un repartidor inactivo. Actívalo primero.');
      return;
    }
    const res = await adminToggleCourierAvailable(
      detail.courier.id,
      detail.courier.available,
      detail.courier.active
    );
    if (res.error) {
      setSaveError(res.error);
    } else {
      setAvailableState(res.newAvailable);
      loadCourier();
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="w-12 h-12 border-4 border-ya-gray border-t-ya-lime animate-spin mx-auto mb-4"></div>
        <p className="font-mono text-xs uppercase tracking-widest text-gray-400">
          Cargando ficha del repartidor...
        </p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="p-8 border-4 border-rose-500/50 bg-rose-500/10 text-center max-w-xl mx-auto space-y-4">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-black uppercase text-white">Repartidor no encontrado</h2>
        <p className="text-xs text-gray-300 font-mono">
          {error || 'El repartidor solicitado no existe en la base de datos de YA.'}
        </p>
        <div className="pt-2">
          <Link
            to="/admin/repartidores"
            className="inline-flex items-center gap-2 px-4 py-2 bg-ya-lime text-ya-black font-black uppercase text-xs hover:bg-white transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Volver a Repartidores</span>
          </Link>
        </div>
      </div>
    );
  }

  const { courier, profile, summary } = detail;

  return (
    <div className="space-y-6">
      {/* Botón Volver y Cabecera de Ficha */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-ya-gray pb-4">
        <div className="space-y-1">
          <Link
            to="/admin/repartidores"
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase text-gray-400 hover:text-ya-lime transition-colors mb-2"
          >
            <ArrowLeft size={14} />
            <span>Volver a Repartidores</span>
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
              <Truck className="text-ya-lime" size={28} />
              <span>{profile.full_name}</span>
            </h1>

            {/* Badges de Estado */}
            <span
              className={`px-2.5 py-0.5 text-xs font-black uppercase border ${
                courier.active
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                  : 'border-rose-500 text-rose-400 bg-rose-500/10'
              }`}
            >
              {courier.active ? 'Activo en YA' : 'Inactivo'}
            </span>

            {courier.active && (
              <span
                className={`px-2.5 py-0.5 text-xs font-black uppercase border flex items-center gap-1.5 ${
                  courier.available
                    ? 'border-ya-lime text-ya-lime bg-ya-lime/10'
                    : 'border-amber-500/60 text-amber-400 bg-amber-500/10'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    courier.available ? 'bg-ya-lime animate-pulse' : 'bg-amber-500'
                  }`}
                ></span>
                <span>{courier.available ? 'Disponible en Guardia' : 'No disponible'}</span>
              </span>
            )}
          </div>

          <p className="text-xs font-mono text-gray-400">
            ID Repartidor: <span className="text-gray-300">{courier.id}</span> · Rol de cuenta:{' '}
            <span className="text-ya-lime uppercase">{profile.role}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={loadCourier}
          className="flex items-center gap-1.5 px-3 py-2 bg-ya-gray text-white hover:bg-white hover:text-ya-black text-xs font-black uppercase tracking-wider transition-colors border border-gray-700 self-start sm:self-auto"
        >
          <RefreshCw size={14} />
          <span>Refrescar</span>
        </button>
      </div>

      {/* Alertas de guardado */}
      {saveSuccess && (
        <div className="p-3 bg-ya-lime/10 border-2 border-ya-lime text-ya-lime text-xs font-mono flex items-center gap-2">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {saveError && (
        <div className="p-3 bg-rose-500/10 border-2 border-rose-500 text-rose-300 text-xs font-mono flex items-center gap-2">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Grid Principal de 2 Columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Izquierda (1 col): Información de Contacto y Estado Rápido */}
        <div className="space-y-6">
          {/* Bloque 1: Información Personal y Contacto */}
          <div className="p-5 bg-ya-black border-2 border-ya-gray space-y-4">
            <h2 className="text-sm font-black uppercase tracking-wider text-white border-b border-ya-gray pb-2 flex items-center gap-2">
              <User className="text-ya-lime" size={16} />
              <span>Información del Repartidor</span>
            </h2>

            <div className="space-y-3 text-xs font-mono">
              <div>
                <span className="text-gray-400 block text-[10px] uppercase">Nombre completo</span>
                <span className="text-white font-bold text-sm">{profile.full_name}</span>
              </div>

              <div>
                <span className="text-gray-400 block text-[10px] uppercase">Correo Electrónico</span>
                {profile.email ? (
                  <a
                    href={`mailto:${profile.email}`}
                    className="text-ya-lime hover:underline flex items-center gap-1.5 mt-0.5"
                  >
                    <Mail size={13} />
                    <span>{profile.email}</span>
                  </a>
                ) : (
                  <span className="text-gray-500">Sin correo registrado</span>
                )}
              </div>

              <div>
                <span className="text-gray-400 block text-[10px] uppercase">Teléfono</span>
                {profile.phone ? (
                  <a
                    href={`tel:${profile.phone}`}
                    className="text-white hover:text-ya-lime flex items-center gap-1.5 mt-0.5"
                  >
                    <Phone size={13} />
                    <span>{profile.phone}</span>
                  </a>
                ) : (
                  <span className="text-gray-500">Sin teléfono registrado</span>
                )}
              </div>

              <div>
                <span className="text-gray-400 block text-[10px] uppercase">Fecha de alta en YA</span>
                <div className="flex items-center gap-1.5 text-gray-300 mt-0.5">
                  <Calendar size={13} />
                  <span>
                    {new Date(courier.created_at).toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-gray-400 block text-[10px] uppercase">Tipo de vehículo asignado</span>
                <div className="flex items-center gap-1.5 text-gray-300 mt-0.5">
                  <Bike size={13} className="text-ya-lime" />
                  <span>{courier.vehicle_type || 'No especificado'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bloque 2: Control Operativo Rápido */}
          <div className="p-5 bg-ya-black border-2 border-ya-gray space-y-4">
            <h2 className="text-sm font-black uppercase tracking-wider text-white border-b border-ya-gray pb-2 flex items-center gap-2">
              <Shield className="text-ya-lime" size={16} />
              <span>Conmutadores Operativos</span>
            </h2>

            <div className="space-y-3">
              {/* Toggle Activo */}
              <div className="flex items-center justify-between p-3 bg-ya-gray/30 border border-ya-gray">
                <div>
                  <div className="text-xs font-bold text-white uppercase">Estado en plataforma</div>
                  <div className="text-[10px] font-mono text-gray-400">
                    {courier.active ? 'Habilitado para operar' : 'Suspendido / Desactivado'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleActiveQuick}
                  className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border transition-colors ${
                    courier.active
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                      : 'border-rose-500 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                  }`}
                >
                  {courier.active ? 'Activo' : 'Inactivo'}
                </button>
              </div>

              {/* Toggle Disponible */}
              <div className="flex items-center justify-between p-3 bg-ya-gray/30 border border-ya-gray">
                <div>
                  <div className="text-xs font-bold text-white uppercase">Disponibilidad (4C)</div>
                  <div className="text-[10px] font-mono text-gray-400">
                    {!courier.active
                      ? 'Inactivo (no puede estar disponible)'
                      : courier.available
                      ? 'En guardia, listo para recibir pedidos'
                      : 'Fuera de turno'}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!courier.active}
                  onClick={handleToggleAvailableQuick}
                  className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border transition-colors ${
                    !courier.active
                      ? 'opacity-30 border-gray-700 text-gray-600 cursor-not-allowed'
                      : courier.available
                      ? 'border-ya-lime bg-ya-lime/20 text-ya-lime hover:bg-ya-lime/30'
                      : 'border-amber-500/50 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                  }`}
                >
                  {courier.available ? 'Disponible' : 'No disponible'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Columna Derecha (2 cols): Configuración de Remuneración y Estadísticas Futuras */}
        <div className="lg:col-span-2 space-y-6">
          {/* Bloque 3: Configuración de Remuneración Individual */}
          <form
            onSubmit={handleSaveConfig}
            className="p-5 bg-ya-black border-2 border-ya-gray space-y-5"
          >
            <div className="border-b border-ya-gray pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <DollarSign className="text-ya-lime" size={16} />
                  <span>Configuración de Remuneración Individual</span>
                </h2>
                <p className="text-[11px] font-mono text-gray-400 mt-0.5">
                  Cada repartidor cuenta con sus propias tarifas configurables sin valores hardcodeados
                </p>
              </div>

              <span className="text-[10px] font-mono px-2 py-0.5 bg-ya-lime/10 border border-ya-lime text-ya-lime font-bold uppercase self-start">
                Fase 4A
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Comisión % */}
              <div className="p-4 bg-ya-gray/20 border border-ya-gray space-y-2">
                <label className="block text-xs font-mono uppercase font-bold text-gray-200 flex items-center gap-1.5">
                  <Percent size={14} className="text-ya-lime" />
                  <span>Comisión porcentual por pedido (%)</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    required
                    value={commissionInput}
                    onChange={(e) => setCommissionInput(e.target.value)}
                    className="w-full pl-3 pr-8 py-2.5 bg-ya-black border-2 border-ya-gray text-white text-base font-mono font-bold focus:outline-none focus:border-ya-lime"
                  />
                  <span className="absolute right-3 top-2.5 text-sm font-bold text-gray-400">%</span>
                </div>
                <p className="text-[10px] font-mono text-gray-400">
                  Porcentaje liquidado al repartidor sobre el subtotal de productos o entrega.
                </p>
              </div>

              {/* Tarifa fija € */}
              <div className="p-4 bg-ya-gray/20 border border-ya-gray space-y-2">
                <label className="block text-xs font-mono uppercase font-bold text-gray-200 flex items-center gap-1.5">
                  <DollarSign size={14} className="text-ya-lime" />
                  <span>Tarifa fija por pedido (€)</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    required
                    value={fixedFeeInput}
                    onChange={(e) => setFixedFeeInput(e.target.value)}
                    className="w-full pl-3 pr-8 py-2.5 bg-ya-black border-2 border-ya-gray text-white text-base font-mono font-bold focus:outline-none focus:border-ya-lime"
                  />
                  <span className="absolute right-3 top-2.5 text-sm font-bold text-gray-400">€</span>
                </div>
                <p className="text-[10px] font-mono text-gray-400">
                  Importe fijo garantizado por cada entrega completada (ej. 1,00 € o 1,50 €).
                </p>
              </div>
            </div>

            {/* Vehículo y Estados en el formulario */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div>
                <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                  Tipo de vehículo
                </label>
                <select
                  value={vehicleInput}
                  onChange={(e) => setVehicleInput(e.target.value)}
                  className="w-full px-3 py-2 bg-ya-black border-2 border-ya-gray text-white text-xs font-mono focus:outline-none focus:border-ya-lime"
                >
                  <option value="Moto">Moto</option>
                  <option value="Bicicleta">Bicicleta</option>
                  <option value="Patinete eléctrico">Patinete eléctrico</option>
                  <option value="Coche">Coche</option>
                  <option value="A pie">A pie</option>
                </select>
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 text-xs font-mono text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeState}
                    onChange={(e) => {
                      setActiveState(e.target.checked);
                      if (!e.target.checked) setAvailableState(false);
                    }}
                    className="w-4 h-4 accent-ya-lime"
                  />
                  <span className="font-bold">Activo en plataforma</span>
                </label>
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 text-xs font-mono text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={availableState}
                    disabled={!activeState}
                    onChange={(e) => setAvailableState(e.target.checked)}
                    className="w-4 h-4 accent-ya-lime"
                  />
                  <span className={`font-bold ${!activeState ? 'opacity-40' : ''}`}>
                    Disponible en guardia
                  </span>
                </label>
              </div>
            </div>

            {/* Notas internas */}
            <div>
              <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                Notas internas del administrador
              </label>
              <textarea
                rows={3}
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                placeholder="Anotaciones sobre disponibilidad semanal, zona de reparto preferente, acuerdo de remuneración..."
                className="w-full px-3 py-2 bg-ya-black border-2 border-ya-gray text-white text-xs font-mono focus:outline-none focus:border-ya-lime placeholder-gray-600"
              />
            </div>

            {/* Advertencia de trazabilidad histórica */}
            <div className="p-3 bg-blue-500/10 border border-blue-500/40 text-blue-300 text-xs font-mono">
              <span className="font-bold uppercase text-blue-400">Trazabilidad histórica asegurada: </span>
              Los cambios en estas tarifas aplicarán a pedidos asignados a partir de ahora. El histórico de pedidos
              anteriores preserva la remuneración exacta pactada en el momento de cada entrega.
            </div>

            {/* Botón de Guardar */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-ya-lime text-ya-black font-black uppercase text-xs tracking-wider hover:bg-white transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Guardando cambios...</span>
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    <span>Guardar configuración</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Bloque 4: Estadísticas Operativas y Liquidaciones de Ganancias (Fase 4D) */}
          <div className="p-5 bg-ya-black border-2 border-ya-gray space-y-4">
            <div className="border-b border-ya-gray pb-2 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <TrendingUp className="text-ya-lime" size={16} />
                  <span>Liquidaciones y Ganancias (Fase 4D)</span>
                </h2>
                <p className="text-[11px] font-mono text-gray-400 mt-0.5">
                  Cálculo automático de ganancias por pedidos entregados con tarifas congeladas
                </p>
              </div>

              <span className="text-[10px] font-black px-2 py-0.5 bg-ya-lime text-ya-black uppercase">
                Fases 4D + 4E Activas
              </span>
            </div>

            {/* Tarjetas de métricas financieras */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              <div className="p-3 bg-ya-gray/30 border border-ya-gray">
                <div className="text-[10px] font-mono uppercase text-gray-400 flex items-center gap-1">
                  <Truck size={12} />
                  <span>Entregas</span>
                </div>
                <div className="text-xl font-black text-white mt-1">
                  {summary.totalDeliveries}
                </div>
                <div className="text-[10px] font-mono text-gray-500 mt-0.5">Histórico total</div>
              </div>

              <div className="p-3 bg-ya-gray/30 border border-ya-gray">
                <div className="text-[10px] font-mono uppercase text-gray-400 flex items-center gap-1">
                  <DollarSign size={12} className="text-gray-300" />
                  <span>Por Pedidos</span>
                </div>
                <div className="text-xl font-black text-white mt-1">
                  {summary.totalEarnings.toFixed(2)} €
                </div>
                <div className="text-[10px] font-mono text-gray-500 mt-0.5">Comisiones (4D)</div>
              </div>

              <div className="p-3 bg-ya-gray/30 border border-emerald-800/60">
                <div className="text-[10px] font-mono uppercase text-emerald-400 flex items-center gap-1">
                  <Gift size={12} />
                  <span>Bonus (4E)</span>
                </div>
                <div className="text-xl font-black text-emerald-400 mt-1">
                  +{(summary.totalBonuses || 0).toFixed(2)} €
                </div>
                <div className="text-[10px] font-mono text-gray-500 mt-0.5">
                  {detail.rewards?.length || 0} recompensas
                </div>
              </div>

              <div className="p-3 bg-ya-lime/10 border-2 border-ya-lime/70">
                <div className="text-[10px] font-mono uppercase text-ya-lime font-bold">
                  Total Liquidación
                </div>
                <div className="text-xl font-black text-ya-lime mt-1 font-mono">
                  {((summary.totalPayout ?? (summary.totalEarnings + (summary.totalBonuses || 0))) || 0).toFixed(2)} €
                </div>
                <div className="text-[10px] font-mono text-gray-400 mt-0.5">Pedidos + Bonus</div>
              </div>

              <div className="p-3 bg-ya-gray/30 border border-ya-gray">
                <div className="text-[10px] font-mono uppercase text-gray-400">Hoy</div>
                <div className="text-xl font-black text-white mt-1">
                  {(summary.todayEarnings ?? 0).toFixed(2)} €
                </div>
                <div className="text-[10px] font-mono text-gray-500 mt-0.5">Entregas hoy</div>
              </div>

              <div className="p-3 bg-ya-gray/30 border border-ya-gray">
                <div className="text-[10px] font-mono uppercase text-gray-400">Esta Semana</div>
                <div className="text-xl font-black text-white mt-1">
                  {(summary.weekEarnings ?? 0).toFixed(2)} €
                </div>
                <div className="text-[10px] font-mono text-gray-500 mt-0.5">Semana actual</div>
              </div>

              <div className="p-3 bg-ya-gray/30 border border-ya-gray">
                <div className="text-[10px] font-mono uppercase text-gray-400">Media / Pedido</div>
                <div className="text-xl font-black text-white mt-1">
                  {(summary.avgPerDelivery ?? 0).toFixed(2)} €
                </div>
                <div className="text-[10px] font-mono text-gray-500 mt-0.5">Por entrega</div>
              </div>
            </div>

            {/* Recompensas y Bonus Conseguidos (Fase 4E) */}
            <div className="space-y-2 pt-2 border-t border-ya-gray">
              <div className="text-xs font-black uppercase text-white tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Award size={14} />
                  <span>Incentivos y Bonus Conseguidos (Fase 4E)</span>
                </span>
                <Link
                  to="/admin/incentivos"
                  className="text-gray-400 hover:text-ya-lime font-mono text-[11px] underline"
                >
                  Configurar incentivos →
                </Link>
              </div>

              {!detail.rewards || detail.rewards.length === 0 ? (
                <div className="p-4 border border-dashed border-ya-gray text-center text-gray-400 font-mono text-xs">
                  Este repartidor todavía no ha completado ningún objetivo de incentivos.
                </div>
              ) : (
                <div className="overflow-x-auto border border-emerald-900/60 bg-emerald-950/10">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-ya-gray/60 text-gray-300 uppercase text-[10px] border-b border-ya-gray">
                      <tr>
                        <th className="py-2.5 px-3">Incentivo</th>
                        <th className="py-2.5 px-3 text-center">Entregas al Lograrlo</th>
                        <th className="py-2.5 px-3 text-right">Bonus Otorgado</th>
                        <th className="py-2.5 px-3">Fecha de Consecución</th>
                        <th className="py-2.5 px-3 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {detail.rewards.map((rw) => (
                        <tr key={rw.id} className="hover:bg-ya-gray/30 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-white">
                            {rw.incentive_name}
                          </td>
                          <td className="py-2.5 px-3 text-center text-gray-300">
                            {rw.deliveries_count} entregas
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-emerald-400">
                            +{rw.bonus_amount.toFixed(2)} €
                          </td>
                          <td className="py-2.5 px-3 text-gray-400">
                            {new Date(rw.achieved_at).toLocaleDateString('es-ES', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest bg-emerald-950 text-emerald-300 border border-emerald-700">
                              {rw.status === 'earned' ? 'Conseguido' : rw.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Desglose de pedidos entregados */}
            <div className="space-y-2 pt-2">
              <div className="text-xs font-black uppercase text-white tracking-wider flex items-center justify-between">
                <span>Historial de Liquidación por Pedido</span>
                <span className="text-gray-400 font-mono text-[11px]">
                  {detail.deliveredOrders?.length ?? 0} registros
                </span>
              </div>

              {!detail.deliveredOrders || detail.deliveredOrders.length === 0 ? (
                <div className="p-6 border border-dashed border-ya-gray text-center text-gray-400 font-mono text-xs">
                  Este repartidor aún no ha completado pedidos como entregado.
                </div>
              ) : (
                <div className="overflow-x-auto border border-ya-gray">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-ya-gray/50 text-gray-400 uppercase text-[10px] border-b border-ya-gray">
                      <tr>
                        <th className="py-2.5 px-3">Pedido</th>
                        <th className="py-2.5 px-3">Fecha Entrega</th>
                        <th className="py-2.5 px-3">Cliente / Destino</th>
                        <th className="py-2.5 px-3 text-right">Subtotal Pedido</th>
                        <th className="py-2.5 px-3">Regla Aplicada</th>
                        <th className="py-2.5 px-3 text-right">Ganancia Congelada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ya-gray/30">
                      {detail.deliveredOrders.map((ord) => (
                        <tr key={ord.id} className="hover:bg-ya-gray/10">
                          <td className="py-2.5 px-3 font-bold text-white">
                            <div className="flex items-center gap-1.5">
                              <span>{ord.orderNumber}</span>
                              {ord.isTest && (
                                <span className="text-[9px] px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
                                  Prueba
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-gray-400 text-[11px]">
                            {ord.deliveredAt
                              ? new Date(ord.deliveredAt).toLocaleDateString('es-ES', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-gray-300 max-w-[180px] truncate">
                            <div>{ord.customerName}</div>
                            {ord.deliveryAddress?.city && (
                              <div className="text-[10px] text-gray-500">{ord.deliveryAddress.city}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-white">
                            {ord.subtotal.toFixed(2)} €
                          </td>
                          <td className="py-2.5 px-3 text-gray-300 text-[11px]">
                            <span className="text-gray-400">{ord.calculation.formulaText}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-ya-lime text-sm">
                            +{ord.payoutTotal.toFixed(2)} €
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="text-[10px] font-mono text-gray-500">
              * Las ganancias quedan congeladas atómicamente en la columna <code>courier_payout_total</code> al marcar el pedido como entregado (Fase 4D). Los pedidos de prueba calculan la remuneración idéntica con fines de verificación operativa.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
