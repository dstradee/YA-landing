// ==============================================================================
// YA - ADMINISTRACIÓN DE YA+ (SUSCRIPCIONES Y BENEFICIOS)
// Archivo: src/app/admin/AdminYaPlusPage.tsx
// ==============================================================================

import React, { useEffect, useState } from 'react';
import {
  Zap,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Users,
  ShieldCheck,
  X,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import {
  adminFetchAllPlans,
  adminSavePlan,
  adminDeletePlan,
  adminFetchSubscriptions,
} from '../../lib/yaPlus';
import type {
  DbYaPlusPlan,
  DbUserSubscription,
  YaPlusPlanPeriodicity,
} from '../../types/app';
import { euro } from '../../data/products';

export default function AdminYaPlusPage() {
  const [activeTab, setActiveTab] = useState<'plans' | 'subscribers'>('plans');
  const [plans, setPlans] = useState<DbYaPlusPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<DbUserSubscription[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modal Plan
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<DbYaPlusPlan | null>(null);
  const [planName, setPlanName] = useState('');
  const [planSlug, setPlanSlug] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [planPrice, setPlanPrice] = useState('4.99');
  const [planPeriodicity, setPlanPeriodicity] = useState<YaPlusPlanPeriodicity>('monthly');
  const [planActive, setPlanActive] = useState(true);
  const [planColor, setPlanColor] = useState('#B6FF00');
  const [planBadge, setPlanBadge] = useState('');
  const [planPromo, setPlanPromo] = useState('');
  const [planFreeShipping, setPlanFreeShipping] = useState(true);
  const [planDiscountPercent, setPlanDiscountPercent] = useState('5');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [plansRes, subsRes] = await Promise.all([
        adminFetchAllPlans(),
        adminFetchSubscriptions(),
      ]);

      if (plansRes.error) setActionError(plansRes.error);
      else setPlans(plansRes.plans);

      setSubscriptions(subsRes.subscriptions);
      setActiveCount(subsRes.activeCount);
      setMonthlyRevenue(subsRes.monthlyRevenue);
    } catch {
      setActionError('Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openNewPlanModal = () => {
    setEditingPlan(null);
    setPlanName('');
    setPlanSlug('');
    setPlanDescription('');
    setPlanPrice('4.99');
    setPlanPeriodicity('monthly');
    setPlanActive(true);
    setPlanColor('#B6FF00');
    setPlanBadge('NUEVO');
    setPlanPromo('');
    setPlanFreeShipping(true);
    setPlanDiscountPercent('5');
    setIsModalOpen(true);
  };

  const openEditPlanModal = (p: DbYaPlusPlan) => {
    setEditingPlan(p);
    setPlanName(p.name);
    setPlanSlug(p.slug);
    setPlanDescription(p.description || '');
    setPlanPrice(String(p.price));
    setPlanPeriodicity(p.periodicity);
    setPlanActive(p.active);
    setPlanColor(p.color || '#B6FF00');
    setPlanBadge(p.badge_text || '');
    setPlanPromo(p.promotional_text || '');
    setPlanFreeShipping(p.benefits?.free_shipping ?? true);
    setPlanDiscountPercent(String(p.benefits?.order_discount_percent ?? 0));
    setIsModalOpen(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setActionError(null);
      const res = await adminSavePlan({
        id: editingPlan?.id,
        name: planName,
        slug: planSlug || planName.toLowerCase().replace(/\s+/g, '-'),
        description: planDescription,
        price: parseFloat(planPrice) || 4.99,
        periodicity: planPeriodicity,
        active: planActive,
        color: planColor,
        badge_text: planBadge || null,
        promotional_text: planPromo || null,
        benefits: {
          free_shipping: planFreeShipping,
          order_discount_percent: parseFloat(planDiscountPercent) || 0,
        },
      });

      if (!res.success) {
        setActionError(res.error || 'No se pudo guardar el plan.');
      } else {
        setActionSuccess('Plan guardado con éxito.');
        setIsModalOpen(false);
        await loadData();
      }
    } catch {
      setActionError('Error inesperado al guardar plan.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlan = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar este plan de suscripción?')) return;
    try {
      const res = await adminDeletePlan(id);
      if (res.success) {
        setActionSuccess('Plan eliminado.');
        await loadData();
      } else {
        setActionError(res.error || 'No se pudo eliminar el plan.');
      }
    } catch {
      setActionError('Error al eliminar el plan.');
    }
  };

  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-ya-lime uppercase">
            <Zap className="h-4 w-4" />
            MÓDULO FASE 9
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
            YA+ (MEMBRESÍAS Y PLANES)
          </h1>
          <p className="text-xs text-zinc-400">
            Control de suscripciones recurrentes, ingresos MRR y beneficios exclusivos en envíos y pedidos.
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-2 border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-300 hover:border-ya-lime hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            ACTUALIZAR
          </button>
          <button
            type="button"
            onClick={openNewPlanModal}
            className="flex items-center gap-2 border-2 border-ya-lime bg-ya-lime px-4 py-2 font-black text-ya-black hover:bg-white cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            NUEVO PLAN
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="flex items-center justify-between border-2 border-ya-lime bg-ya-lime/10 p-4 text-xs font-bold text-ya-lime">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>{actionSuccess}</span>
          </div>
          <button type="button" onClick={() => setActionSuccess(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="flex items-center justify-between border-2 border-red-500 bg-red-950/40 p-4 text-xs font-bold text-red-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>{actionError}</span>
          </div>
          <button type="button" onClick={() => setActionError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="border border-zinc-800 bg-zinc-950 p-4">
          <span className="font-mono text-xs text-zinc-400 block">SUSCRIPTORES ACTIVOS</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{activeCount}</span>
            <Users className="h-4 w-4 text-ya-lime" />
          </div>
          <span className="mt-1 block text-[10px] text-zinc-500">Usuarios con beneficios activos</span>
        </div>

        <div className="border border-zinc-800 bg-zinc-950 p-4">
          <span className="font-mono text-xs text-zinc-400 block">MRR ESTIMADO</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-ya-lime">{euro(monthlyRevenue)}</span>
            <TrendingUp className="h-4 w-4 text-ya-lime" />
          </div>
          <span className="mt-1 block text-[10px] text-zinc-500">Ingresos recurrentes mensuales</span>
        </div>

        <div className="border border-zinc-800 bg-zinc-950 p-4">
          <span className="font-mono text-xs text-zinc-400 block">PLANES CONFIGURADOS</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{plans.length}</span>
            <Zap className="h-4 w-4 text-ya-lime" />
          </div>
          <span className="mt-1 block text-[10px] text-zinc-500">{plans.filter((p) => p.active).length} activos en catálogo</span>
        </div>

        <div className="border border-zinc-800 bg-zinc-950 p-4">
          <span className="font-mono text-xs text-zinc-400 block">GATEWAY & AUDITORÍA</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-black text-emerald-400">PAYPAL & RPC</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <span className="mt-1 block text-[10px] text-zinc-500">Garantía atómica server-side</span>
        </div>
      </div>

      {/* TABS */}
      <div className="flex border-b border-zinc-800 font-mono text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('plans')}
          className={`px-4 py-3 uppercase transition ${
            activeTab === 'plans'
              ? 'border-b-2 border-ya-lime text-ya-lime'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          PLANES DE MEMBRESÍA ({plans.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('subscribers')}
          className={`px-4 py-3 uppercase transition ${
            activeTab === 'subscribers'
              ? 'border-b-2 border-ya-lime text-ya-lime'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          LISTA DE SUSCRIPTORES ({subscriptions.length})
        </button>
      </div>

      {/* TAB CONTENT: PLANS */}
      {activeTab === 'plans' && (
        <div className="border border-zinc-800 bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-900 text-zinc-400 uppercase">
                <tr>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Precio</th>
                  <th className="p-3">Ciclo</th>
                  <th className="p-3">Beneficios</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-zinc-400">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-ya-lime" />
                        <span>Cargando datos de YA+...</span>
                      </div>
                    </td>
                  </tr>
                ) : plans.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-900/40">
                    <td className="p-3">
                      <div className="font-bold text-white text-sm uppercase">{p.name}</div>
                      <div className="text-[10px] text-zinc-500">{p.slug}</div>
                      {p.badge_text && (
                        <span className="mt-1 inline-block bg-ya-lime/20 text-ya-lime px-1.5 py-0.2 text-[9px] font-bold">
                          {p.badge_text}
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-bold text-ya-lime text-sm">{euro(p.price)}</td>
                    <td className="p-3 uppercase">{p.periodicity === 'monthly' ? 'Mensual' : 'Anual'}</td>
                    <td className="p-3">
                      <ul className="space-y-0.5 text-[11px] text-zinc-300">
                        {p.benefits?.free_shipping && <li>✓ Envíos gratis</li>}
                        {p.benefits?.order_discount_percent ? (
                          <li>✓ {p.benefits.order_discount_percent}% dto. pedido</li>
                        ) : null}
                      </ul>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold uppercase ${
                          p.active ? 'bg-ya-lime text-ya-black' : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {p.active ? 'ACTIVO' : 'PAUSADO'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditPlanModal(p)}
                          className="border border-zinc-700 bg-zinc-900 p-1.5 text-zinc-300 hover:border-ya-lime hover:text-white"
                          title="Editar"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePlan(p.id)}
                          className="border border-zinc-700 bg-zinc-900 p-1.5 text-zinc-400 hover:border-red-500 hover:text-red-400"
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: SUBSCRIBERS */}
      {activeTab === 'subscribers' && (
        <div className="border border-zinc-800 bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-900 text-zinc-400 uppercase">
                <tr>
                  <th className="p-3">Usuario</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Cuota</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Fin Periodo</th>
                  <th className="p-3">Alta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {subscriptions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-zinc-500">
                      No hay registros de suscriptores actualmente.
                    </td>
                  </tr>
                ) : (
                  subscriptions.map((s) => (
                    <tr key={s.id} className="hover:bg-zinc-900/40">
                      <td className="p-3 font-bold text-white">{s.user_name || s.user_id}</td>
                      <td className="p-3 text-ya-lime font-bold">{s.plan?.name || 'YA+'}</td>
                      <td className="p-3">{euro(s.price)}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold uppercase ${
                            s.status === 'active'
                              ? 'bg-ya-lime text-ya-black'
                              : s.status === 'cancelled'
                              ? 'bg-amber-400 text-ya-black'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="p-3 text-zinc-300">
                        {s.current_period_end
                          ? new Date(s.current_period_end).toLocaleDateString('es-ES')
                          : '-'}
                      </td>
                      <td className="p-3 text-zinc-500">
                        {new Date(s.created_at).toLocaleDateString('es-ES')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL PLAN CRUD */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg border-4 border-ya-lime bg-zinc-900 p-6 shadow-[8px_8px_0px_0px_#B6FF00]">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <h3 className="text-lg font-black uppercase text-white">
                {editingPlan ? 'EDITAR PLAN YA+' : 'NUEVO PLAN YA+'}
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)}>
                <X className="h-5 w-5 text-zinc-400 hover:text-white" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="space-y-4 font-mono text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">NOMBRE DEL PLAN:</label>
                  <input
                    type="text"
                    required
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    placeholder="Ej: YA+ Mensual"
                    className="w-full border-2 border-zinc-700 bg-zinc-950 p-2 text-white focus:border-ya-lime focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">SLUG (URL/ID):</label>
                  <input
                    type="text"
                    value={planSlug}
                    onChange={(e) => setPlanSlug(e.target.value)}
                    placeholder="ya-plus-mensual"
                    className="w-full border-2 border-zinc-700 bg-zinc-950 p-2 text-white focus:border-ya-lime focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">PRECIO (€):</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={planPrice}
                    onChange={(e) => setPlanPrice(e.target.value)}
                    className="w-full border-2 border-zinc-700 bg-zinc-950 p-2 text-white focus:border-ya-lime focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">PERIODICIDAD:</label>
                  <select
                    value={planPeriodicity}
                    onChange={(e) => setPlanPeriodicity(e.target.value as YaPlusPlanPeriodicity)}
                    className="w-full border-2 border-zinc-700 bg-zinc-950 p-2 text-white focus:border-ya-lime focus:outline-none"
                  >
                    <option value="monthly">Mensual</option>
                    <option value="yearly">Anual</option>
                    <option value="quarterly">Trimestral</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">DESCRIPCIÓN:</label>
                <textarea
                  rows={2}
                  value={planDescription}
                  onChange={(e) => setPlanDescription(e.target.value)}
                  placeholder="Envíos gratis y ventajas..."
                  className="w-full border-2 border-zinc-700 bg-zinc-950 p-2 text-white focus:border-ya-lime focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">BADGE DESTACADO:</label>
                  <input
                    type="text"
                    value={planBadge}
                    onChange={(e) => setPlanBadge(e.target.value)}
                    placeholder="MÁS POPULAR"
                    className="w-full border-2 border-zinc-700 bg-zinc-950 p-2 text-white focus:border-ya-lime focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">DESCUENTO EN PEDIDO (%):</label>
                  <input
                    type="number"
                    value={planDiscountPercent}
                    onChange={(e) => setPlanDiscountPercent(e.target.value)}
                    placeholder="5"
                    className="w-full border-2 border-zinc-700 bg-zinc-950 p-2 text-white focus:border-ya-lime focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={planFreeShipping}
                    onChange={(e) => setPlanFreeShipping(e.target.checked)}
                    className="h-4 w-4 accent-ya-lime"
                  />
                  <span className="text-zinc-300 font-bold">Envíos Gratis Activos</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={planActive}
                    onChange={(e) => setPlanActive(e.target.checked)}
                    className="h-4 w-4 accent-ya-lime"
                  />
                  <span className="text-zinc-300 font-bold">Plan Visible</span>
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="border border-zinc-600 bg-zinc-800 px-4 py-2 text-white hover:bg-zinc-700"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="border-2 border-ya-lime bg-ya-lime px-4 py-2 font-black text-ya-black hover:bg-white disabled:opacity-50"
                >
                  {saving ? 'GUARDANDO...' : 'GUARDAR PLAN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
