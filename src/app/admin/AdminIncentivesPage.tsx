import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Users,
  Search,
  X,
  Gift,
  Sparkles,
} from 'lucide-react';
import {
  adminFetchIncentivesOverview,
  adminCreateIncentive,
  adminUpdateIncentive,
  adminDeleteIncentive,
} from '../../lib/adminIncentives';
import type {
  AdminIncentivesOverview,
  AdminIncentiveListItem,
  AdminCourierIncentiveProgress,
  CourierRewardHistoryItem,
} from '../../types/app';

export function AdminIncentivesPage() {
  const [data, setData] = useState<AdminIncentivesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Pestaña activa: 'incentives' | 'progress' | 'rewards'
  const [activeTab, setActiveTab] = useState<'incentives' | 'progress' | 'rewards'>('incentives');

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');

  // Modal de Crear / Editar
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIncentive, setEditingIncentive] = useState<AdminIncentiveListItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Datos de formulario
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    target_deliveries: 10,
    bonus_amount: 5,
    start_at: '',
    end_at: '',
    active: true,
  });

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const res = await adminFetchIncentivesOverview();
    if (res.error) {
      setError(res.error);
    } else {
      setData(res.data);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleOpenCreate = () => {
    setEditingIncentive(null);
    setFormData({
      name: '',
      description: '',
      target_deliveries: 10,
      bonus_amount: 5,
      start_at: '',
      end_at: '',
      active: true,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (inc: AdminIncentiveListItem) => {
    setEditingIncentive(inc);
    setFormData({
      name: inc.name,
      description: inc.description || '',
      target_deliveries: inc.target_deliveries,
      bonus_amount: inc.bonus_amount,
      start_at: inc.start_at ? inc.start_at.slice(0, 16) : '',
      end_at: inc.end_at ? inc.end_at.slice(0, 16) : '',
      active: inc.active,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleToggleActive = async (inc: AdminIncentiveListItem) => {
    const newStatus = !inc.active;
    const res = await adminUpdateIncentive(inc.id, { active: newStatus });
    if (res.error) {
      setError(res.error);
    } else {
      showSuccess(`Incentivo "${inc.name}" marcado como ${newStatus ? 'ACTIVO' : 'INACTIVO'}.`);
      loadData(true);
    }
  };

  const handleDelete = async (inc: AdminIncentiveListItem) => {
    const confirm = window.confirm(
      `¿Estás seguro de que deseas eliminar o desactivar el incentivo "${inc.name}"? Si ya tiene bonificaciones concedidas a repartidores, se desactivará automáticamente para proteger el histórico financiero.`
    );
    if (!confirm) return;

    const res = await adminDeleteIncentive(inc.id);
    if (res.error) {
      setError(res.error);
    } else {
      showSuccess(res.message || 'Operación completada con éxito.');
      loadData(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validaciones estrictas
    if (!formData.name.trim()) {
      setFormError('Debes indicar un nombre descriptivo para el incentivo.');
      return;
    }
    const target = Number(formData.target_deliveries);
    if (isNaN(target) || target <= 0) {
      setFormError('El número de entregas objetivo debe ser mayor que 0.');
      return;
    }
    const bonus = Number(formData.bonus_amount);
    if (isNaN(bonus) || bonus <= 0) {
      setFormError('El importe del bonus debe ser mayor que 0,00 €.');
      return;
    }

    if (formData.start_at && formData.end_at) {
      if (new Date(formData.start_at) >= new Date(formData.end_at)) {
        setFormError('La fecha de inicio debe ser anterior a la fecha de fin.');
        return;
      }
    }

    setSubmitting(true);

    if (editingIncentive) {
      const res = await adminUpdateIncentive(editingIncentive.id, {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        target_deliveries: target,
        bonus_amount: bonus,
        start_at: formData.start_at ? new Date(formData.start_at).toISOString() : null,
        end_at: formData.end_at ? new Date(formData.end_at).toISOString() : null,
        active: formData.active,
      });

      if (res.error) {
        setFormError(res.error);
      } else {
        showSuccess('Incentivo actualizado correctamente.');
        setModalOpen(false);
        loadData(true);
      }
    } else {
      const res = await adminCreateIncentive({
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        target_deliveries: target,
        bonus_amount: bonus,
        start_at: formData.start_at ? new Date(formData.start_at).toISOString() : null,
        end_at: formData.end_at ? new Date(formData.end_at).toISOString() : null,
        active: formData.active,
      });

      if (res.error) {
        setFormError(res.error);
      } else {
        showSuccess('Incentivo creado con éxito.');
        setModalOpen(false);
        loadData(true);
      }
    }

    setSubmitting(false);
  };

  const formatMoney = (val: number) =>
    val.toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' €';

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const metrics = data?.summary || {
    total_incentives: 0,
    active_incentives: 0,
    total_rewards: 0,
    total_bonus_amount: 0,
  };

  const incentives = data?.incentives || [];
  const progressList = data?.couriers_progress || [];
  const rewardsList = data?.rewards || [];

  const filteredIncentives = incentives.filter((inc) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return inc.name.toLowerCase().includes(term) || (inc.description || '').toLowerCase().includes(term);
  });

  const filteredProgress = progressList.filter((p: AdminCourierIncentiveProgress) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (p.full_name || '').toLowerCase().includes(term) ||
      (p.email || '').toLowerCase().includes(term) ||
      (p.incentive_name || '').toLowerCase().includes(term)
    );
  });

  const filteredRewards = rewardsList.filter((r: CourierRewardHistoryItem) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (r.courier_name || '').toLowerCase().includes(term) ||
      (r.courier_email || '').toLowerCase().includes(term) ||
      (r.incentive_name || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      {/* 1. CABECERA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-4 border-ya-gray pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 bg-ya-lime" />
            <h1 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <Award className="text-ya-lime" size={26} />
              Incentivos y Recompensas (Fase 4E)
            </h1>
          </div>
          <p className="text-xs text-gray-400 font-mono">
            Configura metas por número de entregas y bonificaciones económicas automáticas para los repartidores.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            id="refresh-admin-incentives-btn"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2.5 bg-ya-gray/60 hover:bg-ya-gray text-gray-300 hover:text-white border-2 border-ya-gray text-xs font-black uppercase tracking-wider transition-colors"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-ya-lime' : ''} />
            <span className="hidden sm:inline">Refrescar</span>
          </button>

          <button
            id="create-incentive-btn"
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-ya-lime hover:bg-white text-ya-black font-black text-xs uppercase tracking-wider transition-all active:scale-95 shadow-[0_0_15px_rgba(182,255,0,0.3)]"
          >
            <Plus size={16} />
            <span>Crear Incentivo</span>
          </button>
        </div>
      </div>

      {/* MENSAJES DE ERROR O ÉXITO */}
      {error && (
        <div className="p-4 bg-red-950/60 border-2 border-red-600 text-red-300 text-xs font-medium flex items-center gap-3">
          <AlertCircle size={18} className="shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-950/70 border-2 border-emerald-500 text-emerald-200 text-xs font-bold flex items-center gap-3 animate-fadeIn">
          <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 2. TARJETAS DE MÉTRICAS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 bg-ya-gray/30 border-2 border-ya-gray">
          <div className="text-[10px] text-gray-400 font-mono uppercase tracking-widest mb-1 flex items-center justify-between">
            <span>Incentivos Totales</span>
            <Award size={14} className="text-ya-lime" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white font-mono">
            {metrics.total_incentives}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            {metrics.active_incentives} activos ahora
          </div>
        </div>

        <div className="p-4 bg-ya-gray/30 border-2 border-ya-gray">
          <div className="text-[10px] text-gray-400 font-mono uppercase tracking-widest mb-1 flex items-center justify-between">
            <span>Incentivos Activos</span>
            <Sparkles size={14} className="text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
            {metrics.active_incentives}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            Vigentes para repartidores
          </div>
        </div>

        <div className="p-4 bg-ya-gray/30 border-2 border-ya-gray">
          <div className="text-[10px] text-gray-400 font-mono uppercase tracking-widest mb-1 flex items-center justify-between">
            <span>Bonus Concedidos</span>
            <Gift size={14} className="text-blue-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white font-mono">
            {metrics.total_rewards}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            Objetivos completados
          </div>
        </div>

        <div className="p-4 bg-ya-lime/10 border-2 border-ya-lime/60">
          <div className="text-[10px] text-ya-lime font-mono uppercase tracking-widest mb-1 flex items-center justify-between">
            <span>Total Bonificado</span>
            <TrendingUp size={14} className="text-ya-lime" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-ya-lime font-mono">
            {formatMoney(metrics.total_bonus_amount)}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            Importe total de bonus
          </div>
        </div>
      </div>

      {/* 3. PESTAÑAS DE NAVEGACIÓN */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-ya-gray">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('incentives')}
            className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'incentives'
                ? 'border-ya-lime text-ya-lime bg-ya-gray/40'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Award size={14} />
            <span>Objetivos ({incentives.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('progress')}
            className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'progress'
                ? 'border-ya-lime text-ya-lime bg-ya-gray/40'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Users size={14} />
            <span>Progreso de Repartidores ({progressList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('rewards')}
            className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'rewards'
                ? 'border-ya-lime text-ya-lime bg-ya-gray/40'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Gift size={14} />
            <span>Historial de Recompensas ({rewardsList.length})</span>
          </button>
        </div>

        {/* Buscador */}
        <div className="relative w-full sm:w-64 pb-2 sm:pb-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-ya-black border-2 border-ya-gray text-xs text-white placeholder-gray-500 focus:border-ya-lime focus:outline-none"
          />
        </div>
      </div>

      {/* 4. CONTENIDO DE LAS PESTAÑAS */}
      {loading ? (
        <div className="py-16 text-center space-y-3 border-2 border-ya-gray bg-ya-gray/20">
          <div className="w-8 h-8 border-3 border-ya-lime border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 text-xs font-mono uppercase tracking-widest">
            Cargando configuración de incentivos...
          </p>
        </div>
      ) : activeTab === 'incentives' ? (
        /* TAB 1: GESTIÓN DE INCENTIVOS */
        <div className="space-y-3">
          {filteredIncentives.length === 0 ? (
            <div className="p-12 text-center border-2 border-dashed border-gray-800 bg-ya-gray/20 space-y-3">
              <Award className="mx-auto text-gray-600" size={36} />
              <p className="text-gray-300 text-sm font-bold">No se han encontrado incentivos</p>
              <p className="text-gray-400 text-xs max-w-sm mx-auto">
                Crea tu primera meta de reparto para motivar y premiar a los repartidores.
              </p>
              <button
                onClick={handleOpenCreate}
                className="px-4 py-2 bg-ya-lime text-ya-black text-xs font-black uppercase tracking-wider"
              >
                Crear primer incentivo
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto border-2 border-ya-gray">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-ya-gray/80 border-b-2 border-ya-gray text-gray-300 font-mono text-[10px] uppercase tracking-wider">
                    <th className="p-3">Incentivo</th>
                    <th className="p-3 text-center">Objetivo</th>
                    <th className="p-3 text-right">Bonus</th>
                    <th className="p-3">Periodo</th>
                    <th className="p-3 text-center">Recompensas</th>
                    <th className="p-3 text-right">Total Pagado</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 bg-ya-black">
                  {filteredIncentives.map((inc) => (
                    <tr key={inc.id} className="hover:bg-ya-gray/30 transition-colors">
                      <td className="p-3">
                        <div className="font-black text-white text-sm">{inc.name}</div>
                        {inc.description && (
                          <div className="text-[11px] text-gray-400 max-w-xs truncate">
                            {inc.description}
                          </div>
                        )}
                      </td>

                      <td className="p-3 text-center font-mono font-bold text-white">
                        <span className="px-2 py-1 bg-ya-gray text-white border border-gray-700">
                          {inc.target_deliveries} entregas
                        </span>
                      </td>

                      <td className="p-3 text-right font-mono font-black text-ya-lime text-sm">
                        +{formatMoney(inc.bonus_amount)}
                      </td>

                      <td className="p-3 font-mono text-[11px] text-gray-400">
                        {inc.start_at || inc.end_at ? (
                          <div>
                            <div>{inc.start_at ? formatDate(inc.start_at) : 'Sin inicio'}</div>
                            <div className="text-gray-400">
                              → {inc.end_at ? formatDate(inc.end_at) : 'Sin fin'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">Permanente</span>
                        )}
                      </td>

                      <td className="p-3 text-center font-mono text-gray-300">
                        <span className="font-bold text-white">{inc.total_rewards || 0}</span>
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-emerald-400">
                        {formatMoney(inc.total_bonus_paid || 0)}
                      </td>

                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleToggleActive(inc)}
                          className={`px-2.5 py-1 text-[10px] font-mono font-black uppercase tracking-widest border transition-colors ${
                            inc.active
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-600 hover:bg-emerald-900'
                              : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
                          }`}
                          title="Haz clic para cambiar estado"
                        >
                          {inc.active ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>

                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(inc)}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-ya-gray transition-colors"
                            title="Editar incentivo"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(inc)}
                            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-950/40 transition-colors"
                            title="Eliminar o desactivar"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeTab === 'progress' ? (
        /* TAB 2: PROGRESO DE REPARTIDORES */
        <div className="space-y-3">
          {filteredProgress.length === 0 ? (
            <div className="p-8 text-center border-2 border-ya-gray bg-ya-gray/20 text-gray-400 text-xs">
              No hay datos de progreso de repartidores registrados.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProgress.map((p: AdminCourierIncentiveProgress) => (
                <div key={`${p.courier_id}-${p.incentive_id}`} className="p-4 bg-ya-gray/30 border-2 border-ya-gray space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <Link
                        to={`/admin/repartidores/${p.courier_id}`}
                        className="font-black text-sm text-white hover:text-ya-lime transition-colors"
                      >
                        {p.full_name}
                      </Link>
                      <div className="text-[11px] text-gray-400 font-mono">{p.email}</div>
                    </div>

                    <div className="text-right font-mono">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-black uppercase border ${
                          p.is_achieved
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                            : 'bg-ya-gray text-gray-300 border-gray-700'
                        }`}
                      >
                        {p.is_achieved ? '✓ Logrado' : 'En progreso'}
                      </span>
                    </div>
                  </div>

                  {/* Detalle del incentivo */}
                  <div className="bg-ya-black p-3 border border-gray-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-gray-200">{p.incentive_name}</span>
                      <span className="font-mono text-ya-lime font-black">
                        +{formatMoney(p.bonus_amount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-gray-400">
                      <span>
                        {p.deliveries_count} / {p.target_deliveries} entregas
                      </span>
                      <span className={p.is_achieved ? 'text-emerald-400 font-bold' : ''}>
                        {p.is_achieved ? '100%' : `${p.progress_percent}%`}
                      </span>
                    </div>

                    <div className="h-2 w-full bg-gray-800 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          p.is_achieved ? 'bg-emerald-500' : 'bg-ya-lime'
                        }`}
                        style={{ width: `${Math.min(100, p.progress_percent)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* TAB 3: HISTORIAL DE RECOMPENSAS CONCEDIDAS */
        <div className="space-y-3">
          {filteredRewards.length === 0 ? (
            <div className="p-8 text-center border-2 border-ya-gray bg-ya-gray/20 text-gray-400 text-xs">
              Aún no se ha registrado ninguna bonificación conseguida por los repartidores.
            </div>
          ) : (
            <div className="overflow-x-auto border-2 border-ya-gray">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-ya-gray/80 border-b-2 border-ya-gray text-gray-300 font-mono text-[10px] uppercase tracking-wider">
                    <th className="p-3">Repartidor</th>
                    <th className="p-3">Incentivo</th>
                    <th className="p-3 text-center">Entregas Alcanzadas</th>
                    <th className="p-3 text-right">Bonus Congelado</th>
                    <th className="p-3">Fecha de Consecución</th>
                    <th className="p-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 bg-ya-black">
                  {filteredRewards.map((r: CourierRewardHistoryItem) => (
                    <tr key={r.id} className="hover:bg-ya-gray/30 transition-colors">
                      <td className="p-3">
                        {r.courier_id ? (
                          <Link
                            to={`/admin/repartidores/${r.courier_id}`}
                            className="font-black text-white hover:text-ya-lime transition-colors"
                          >
                            {r.courier_name || 'Repartidor'}
                          </Link>
                        ) : (
                          <span className="font-black text-white">{r.courier_name || 'Repartidor'}</span>
                        )}
                        {r.courier_email && (
                          <div className="text-[11px] text-gray-400 font-mono">{r.courier_email}</div>
                        )}
                      </td>

                      <td className="p-3 font-bold text-gray-200">
                        {r.incentive_name}
                      </td>

                      <td className="p-3 text-center font-mono text-white font-bold">
                        {r.deliveries_count} entregas
                      </td>

                      <td className="p-3 text-right font-mono font-black text-emerald-400 text-sm">
                        +{formatMoney(r.bonus_amount)}
                      </td>

                      <td className="p-3 font-mono text-[11px] text-gray-300">
                        {formatDate(r.achieved_at)}
                      </td>

                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest bg-emerald-950 text-emerald-300 border border-emerald-700">
                          {r.status === 'earned' ? 'Conseguido' : r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 5. MODAL DE CREAR / EDITAR INCENTIVO */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
          <div className="max-w-md w-full bg-ya-black border-4 border-ya-gray p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b-2 border-ya-gray pb-3">
              <div className="flex items-center gap-2">
                <Award className="text-ya-lime" size={20} />
                <h3 className="text-base font-black uppercase text-white tracking-wide">
                  {editingIncentive ? 'Editar Incentivo' : 'Crear Nuevo Incentivo'}
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-950/60 border border-red-500 text-red-300 text-xs font-bold flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {/* Nombre */}
              <div>
                <label className="block text-gray-300 font-bold uppercase tracking-wider mb-1">
                  Nombre del Incentivo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Bonus 10 entregas, Sprint Fin de Semana"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-ya-gray/40 border-2 border-ya-gray text-white font-bold focus:border-ya-lime focus:outline-none"
                />
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-gray-300 font-bold uppercase tracking-wider mb-1">
                  Descripción (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej: Recompensa por alcanzar 10 entregas en Jerez..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-ya-gray/40 border-2 border-ya-gray text-white focus:border-ya-lime focus:outline-none resize-none"
                />
              </div>

              {/* Entregas objetivo & Importe Bonus */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-bold uppercase tracking-wider mb-1">
                    Entregas Objetivo *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={formData.target_deliveries}
                    onChange={(e) =>
                      setFormData({ ...formData, target_deliveries: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-ya-gray/40 border-2 border-ya-gray text-white font-mono font-bold focus:border-ya-lime focus:outline-none"
                  />
                  <span className="text-[10px] text-gray-400 font-mono mt-0.5 block">Mínimo 1</span>
                </div>

                <div>
                  <label className="block text-gray-300 font-bold uppercase tracking-wider mb-1">
                    Bonus (€) *
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={formData.bonus_amount}
                    onChange={(e) =>
                      setFormData({ ...formData, bonus_amount: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-ya-gray/40 border-2 border-ya-gray text-ya-lime font-mono font-bold focus:border-ya-lime focus:outline-none"
                  />
                  <span className="text-[10px] text-gray-400 font-mono mt-0.5 block">Importe fijo</span>
                </div>
              </div>

              {/* Fechas de vigencia (Opcionales) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-bold uppercase tracking-wider mb-1">
                    Inicio (Opcional)
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.start_at}
                    onChange={(e) => setFormData({ ...formData, start_at: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-ya-gray/40 border-2 border-ya-gray text-white font-mono text-[11px] focus:border-ya-lime focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 font-bold uppercase tracking-wider mb-1">
                    Fin (Opcional)
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.end_at}
                    onChange={(e) => setFormData({ ...formData, end_at: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-ya-gray/40 border-2 border-ya-gray text-white font-mono text-[11px] focus:border-ya-lime focus:outline-none"
                  />
                </div>
              </div>

              {/* Activo */}
              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="incentive-active-checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="w-4 h-4 accent-ya-lime"
                />
                <label
                  htmlFor="incentive-active-checkbox"
                  className="text-gray-200 font-bold uppercase tracking-wider cursor-pointer"
                >
                  Incentivo Activo (Visible para los repartidores)
                </label>
              </div>

              {/* Botones de acción */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-ya-gray">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2 border-2 border-ya-gray text-gray-300 uppercase font-black tracking-wider hover:bg-ya-gray transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-ya-lime text-ya-black font-black uppercase tracking-wider hover:bg-white transition-colors disabled:opacity-50"
                >
                  {submitting
                    ? 'Guardando...'
                    : editingIncentive
                    ? 'Actualizar Incentivo'
                    : 'Crear Incentivo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
