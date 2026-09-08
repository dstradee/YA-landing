// ==============================================================================
// YA - GESTIÓN DE PROMOCIONES EN ADMIN (PHASE 3B)
// Archivo: src/app/admin/AdminPromotionsPage.tsx
// ==============================================================================

import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
  Ticket,
  X,
} from 'lucide-react';
import {
  fetchPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
} from '../../lib/adminPromotions';
import type { DbPromotion, DiscountType } from '../../types/app';
import { euro } from '../../data/products';

export function AdminPromotionsPage() {
  const [promotions, setPromotions] = useState<DbPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<DbPromotion | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('percentage');
  const [discountValue, setDiscountValue] = useState('10');
  const [minimumOrder, setMinimumOrder] = useState('30.00');
  const [isAutomatic, setIsAutomatic] = useState(true);
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [active, setActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const data = await fetchPromotions();
      setPromotions(data);
    } catch (err: any) {
      setActionError(err.message || 'Error al cargar promociones.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingPromo(null);
    setName('');
    setCode('');
    setDescription('');
    setDiscountType('percentage');
    setDiscountValue('10');
    setMinimumOrder('30.00');
    setIsAutomatic(true);
    setStartsAt('');
    setExpiresAt('');
    setActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (p: DbPromotion) => {
    setEditingPromo(p);
    setName(p.name || '');
    setCode(p.code);
    setDescription(p.description || '');
    setDiscountType(p.discount_type);
    setDiscountValue(String(p.discount_value));
    setMinimumOrder(String(p.minimum_order));
    setIsAutomatic(p.is_automatic ?? true);
    setStartsAt(p.starts_at ? p.starts_at.slice(0, 16) : '');
    setExpiresAt(p.expires_at ? p.expires_at.slice(0, 16) : '');
    setActive(p.active);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPromo(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    const val = parseFloat(discountValue);
    const minOrd = parseFloat(minimumOrder);

    if (isNaN(val) || val <= 0) {
      setActionError('El valor del descuento debe ser mayor que 0.');
      setSubmitting(false);
      return;
    }

    if (discountType === 'percentage' && val > 90) {
      setActionError('El porcentaje no puede superar el 90%.');
      setSubmitting(false);
      return;
    }

    if (isNaN(minOrd) || minOrd < 0) {
      setActionError('El pedido mínimo debe ser un número válido.');
      setSubmitting(false);
      return;
    }

    const cleanCode = code.trim().toUpperCase().replace(/\s+/g, '_');
    if (!cleanCode) {
      setActionError('El código de promoción es obligatorio.');
      setSubmitting(false);
      return;
    }

    const payload = {
      name: name.trim() || cleanCode,
      code: cleanCode,
      description: description.trim() || null,
      discount_type: discountType,
      discount_value: val,
      minimum_order: minOrd,
      is_automatic: isAutomatic,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      active,
    };

    if (editingPromo) {
      const res = await updatePromotion(editingPromo.id, payload);
      if (!res.success) {
        setActionError(res.error || 'Error al actualizar promoción.');
      } else {
        setActionSuccess(`Promoción "${cleanCode}" actualizada correctamente.`);
        closeModal();
        await loadData();
        window.dispatchEvent(new Event('ya-commercial-updated'));
      }
    } else {
      const res = await createPromotion(payload);
      if (!res.success) {
        setActionError(res.error || 'Error al crear promoción.');
      } else {
        setActionSuccess(`Promoción "${cleanCode}" creada con éxito.`);
        closeModal();
        await loadData();
        window.dispatchEvent(new Event('ya-commercial-updated'));
      }
    }

    setSubmitting(false);
  };

  const handleToggleActive = async (p: DbPromotion) => {
    setActionError(null);
    const res = await updatePromotion(p.id, { active: !p.active });
    if (!res.success) {
      setActionError(res.error || 'Error al cambiar estado.');
    } else {
      setActionSuccess(`Promoción "${p.code}" ${!p.active ? 'activada' : 'desactivada'}.`);
      await loadData();
      window.dispatchEvent(new Event('ya-commercial-updated'));
    }
  };

  const handleDelete = async (id: string, codeStr: string) => {
    if (!window.confirm(`¿Confirmas que deseas eliminar la promoción "${codeStr}"?`)) return;
    setActionError(null);
    const res = await deletePromotion(id);
    if (!res.success) {
      setActionError(res.error || 'Error al eliminar promoción.');
    } else {
      setActionSuccess(`Promoción "${codeStr}" eliminada.`);
      await loadData();
      window.dispatchEvent(new Event('ya-commercial-updated'));
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="border-b-4 border-ya-gray pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-ya-lime text-ya-black px-2 py-0.5 text-xs font-black uppercase tracking-wider">
              PHASE 3B
            </span>
            <span className="text-xs font-mono text-gray-400">BENEFICIOS GLOBALES</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            <Sparkles className="text-ya-lime" size={28} />
            <span>Promociones (Nivel Pedido)</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1 font-mono">
            Campañas con descuento directo aplicable automáticamente al superar umbrales de pedido.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="px-4 py-2.5 border-2 border-ya-gray text-xs font-black uppercase tracking-wider hover:border-ya-lime hover:text-ya-lime transition-colors flex items-center gap-2"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refrescar</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-5 py-2.5 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs border-2 border-ya-lime hover:bg-white hover:border-white transition-all shadow-[4px_4px_0px_0px_#1A1A1A] flex items-center gap-2"
          >
            <Plus size={16} strokeWidth={3} />
            <span>Nueva Promoción</span>
          </button>
        </div>
      </div>

      {/* Alertas */}
      {actionSuccess && (
        <div className="border-4 border-ya-lime bg-ya-lime/10 p-4 text-white text-xs font-mono flex items-center gap-3">
          <CheckCircle2 size={20} className="text-ya-lime shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="border-4 border-red-500 bg-red-500/10 p-4 text-white text-xs font-mono flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-400 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Tabla de Promociones */}
      {loading ? (
        <div className="py-24 text-center font-mono text-xs uppercase text-ya-lime animate-pulse">
          Cargando promociones...
        </div>
      ) : actionError && promotions.length === 0 ? (
        <div className="border-4 border-red-500 bg-ya-black p-12 text-center space-y-4 shadow-[6px_6px_0px_0px_#EF4444]">
          <AlertTriangle size={40} className="text-red-400 mx-auto" />
          <h3 className="text-lg font-black uppercase text-white">Error al cargar promociones</h3>
          <p className="text-xs font-mono text-gray-300 max-w-md mx-auto">{actionError}</p>
          <button
            type="button"
            onClick={loadData}
            className="px-6 py-2.5 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs border-2 border-ya-lime hover:bg-white hover:border-white transition-all inline-flex items-center gap-2"
          >
            <RefreshCw size={14} />
            <span>Reintentar Carga</span>
          </button>
        </div>
      ) : promotions.length === 0 ? (
        <div className="border-4 border-ya-gray bg-ya-black p-12 text-center space-y-4">
          <Sparkles size={40} className="text-gray-500 mx-auto" />
          <h3 className="text-lg font-black uppercase text-white">No hay promociones configuradas</h3>
          <p className="text-xs font-mono text-gray-400 max-w-md mx-auto">
            Configura promociones automáticas por volumen de compra para incentivar cestas de mayor valor en Jerez.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-6 py-2.5 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs border-2 border-ya-lime hover:bg-white hover:border-white transition-all"
          >
            Crear Primera Promoción
          </button>
        </div>
      ) : (
        <div className="border-4 border-ya-gray bg-ya-black overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="border-b-4 border-ya-gray bg-ya-gray/30 text-gray-300 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-4">Código & Nombre</th>
                <th className="p-4">Tipo & Valor</th>
                <th className="p-4">Pedido Mínimo</th>
                <th className="p-4">Modalidad</th>
                <th className="p-4">Vigencia</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-ya-gray/50">
              {promotions.map((p) => (
                <tr key={p.id} className="hover:bg-ya-gray/20 transition-colors">
                  <td className="p-4 font-bold text-white">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="bg-ya-black border-2 border-ya-lime text-ya-lime px-2 py-0.5 font-mono font-black text-xs uppercase tracking-wider">
                          {p.code}
                        </span>
                        <span className="font-bold text-sm text-white">{p.name}</span>
                      </div>
                      {p.description && (
                        <span className="text-[10px] text-gray-400 mt-1 line-clamp-1">
                          {p.description}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="p-4">
                    <span className="bg-ya-lime/20 text-ya-lime px-2.5 py-1 font-black text-sm border border-ya-lime/40">
                      {p.discount_type === 'percentage'
                        ? `-${p.discount_value}%`
                        : `-${euro(p.discount_value)}`}
                    </span>
                  </td>

                  <td className="p-4 text-gray-300 font-bold">
                    {euro(p.minimum_order)}
                  </td>

                  <td className="p-4">
                    {p.is_automatic ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-emerald-950/50 border border-emerald-500/50 text-emerald-300 font-bold uppercase">
                        <Zap size={11} />
                        <span>Automática</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-ya-gray/40 border border-ya-gray text-gray-300 font-bold uppercase">
                        <Ticket size={11} />
                        <span>Cupón</span>
                      </span>
                    )}
                  </td>

                  <td className="p-4 text-gray-400 text-[11px]">
                    {p.starts_at || p.expires_at ? (
                      <div className="space-y-0.5">
                        {p.starts_at && <div>Desde: {new Date(p.starts_at).toLocaleDateString()}</div>}
                        {p.expires_at && <div>Hasta: {new Date(p.expires_at).toLocaleDateString()}</div>}
                      </div>
                    ) : (
                      <span className="text-gray-500">Sin límite</span>
                    )}
                  </td>

                  <td className="p-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(p)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider border ${
                        p.active
                          ? 'bg-ya-lime text-ya-black border-ya-lime'
                          : 'bg-ya-gray/40 text-gray-400 border-ya-gray'
                      }`}
                    >
                      {p.active ? 'ACTIVO' : 'INACTIVO'}
                    </button>
                  </td>

                  <td className="p-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(p)}
                        className="p-1.5 border border-ya-gray hover:border-ya-lime text-gray-300 hover:text-ya-lime transition-colors"
                        title="Editar promoción"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id, p.code)}
                        className="p-1.5 border border-ya-gray hover:border-red-500 text-gray-300 hover:text-red-400 transition-colors"
                        title="Eliminar promoción"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Crear / Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="border-4 border-ya-gray bg-ya-black max-w-xl w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-ya-gray pb-4">
              <h2 className="text-lg font-black uppercase text-white flex items-center gap-2">
                <Sparkles size={20} className="text-ya-lime" />
                <span>{editingPromo ? 'Editar Promoción' : 'Nueva Promoción'}</span>
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1 border-2 border-ya-gray text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 font-mono text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 uppercase font-bold mb-1">
                    Código de Promoción *
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="Ej: FIESTA15"
                    className="w-full bg-ya-gray/30 border-2 border-ya-gray px-3 py-2 text-ya-lime font-black uppercase focus:border-ya-lime focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-gray-300 uppercase font-bold mb-1">
                    Nombre Visible *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: 15% Descuento Especial"
                    className="w-full bg-ya-gray/30 border-2 border-ya-gray px-3 py-2 text-white focus:border-ya-lime focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-300 uppercase font-bold mb-1">
                  Descripción (Opcional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej: Aplica a compras superiores a 35€"
                  className="w-full bg-ya-gray/30 border-2 border-ya-gray px-3 py-2 text-white focus:border-ya-lime focus:outline-none"
                />
              </div>

              {/* Tipo y Valor */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 uppercase font-bold mb-1">
                    Tipo de Rebaja
                  </label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                    className="w-full bg-ya-gray/40 border-2 border-ya-gray px-3 py-2 text-white focus:border-ya-lime focus:outline-none"
                  >
                    <option value="percentage" className="bg-ya-black">Porcentaje (%)</option>
                    <option value="fixed" className="bg-ya-black">Importe Fijo (€)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-300 uppercase font-bold mb-1">
                    Valor de Descuento *
                  </label>
                  <input
                    type="number"
                    step={discountType === 'percentage' ? '1' : '0.50'}
                    min="0"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className="w-full bg-ya-gray/30 border-2 border-ya-gray px-3 py-2 text-white focus:border-ya-lime focus:outline-none font-bold"
                    placeholder="10"
                    required
                  />
                </div>
              </div>

              {/* Pedido Mínimo */}
              <div>
                <label className="block text-gray-300 uppercase font-bold mb-1">
                  Pedido Mínimo para Activar (€) *
                </label>
                <input
                  type="number"
                  step="0.50"
                  min="0"
                  value={minimumOrder}
                  onChange={(e) => setMinimumOrder(e.target.value)}
                  className="w-full bg-ya-gray/30 border-2 border-ya-gray px-3 py-2 text-white focus:border-ya-lime focus:outline-none font-bold"
                  placeholder="30.00"
                  required
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  El cliente debe alcanzar este subtotal en su carrito para disfrutar de la bonificación.
                </p>
              </div>

              {/* Checkbox Automática */}
              <div className="p-3 border-2 border-ya-gray bg-ya-gray/20 flex items-center justify-between">
                <div>
                  <span className="block font-bold text-white uppercase">Aplicación Automática</span>
                  <span className="text-[10px] text-gray-400">
                    Se activa sola al superar el umbral sin necesidad de teclear cupón
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={isAutomatic}
                  onChange={(e) => setIsAutomatic(e.target.checked)}
                  className="w-5 h-5 accent-ya-lime"
                />
              </div>

              {/* Rango de Fechas */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 uppercase font-bold mb-1">
                    Fecha Inicio (Opcional)
                  </label>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="w-full bg-ya-gray/30 border-2 border-ya-gray px-3 py-2 text-white focus:border-ya-lime focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 uppercase font-bold mb-1">
                    Fecha Fin (Opcional)
                  </label>
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full bg-ya-gray/30 border-2 border-ya-gray px-3 py-2 text-white focus:border-ya-lime focus:outline-none"
                  />
                </div>
              </div>

              {/* Estado Activo */}
              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="activePromoCheckbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4 accent-ya-lime"
                />
                <label htmlFor="activePromoCheckbox" className="text-gray-300 uppercase font-bold cursor-pointer">
                  Promoción activa inmediatamente
                </label>
              </div>

              {/* Botones Acciones */}
              <div className="flex justify-end gap-3 pt-4 border-t-2 border-ya-gray">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border-2 border-ya-gray text-gray-300 font-bold uppercase hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-ya-lime text-ya-black font-black uppercase border-2 border-ya-lime hover:bg-white hover:border-white transition-all disabled:opacity-50"
                >
                  {submitting ? 'Guardando...' : editingPromo ? 'Guardar Cambios' : 'Crear Promoción'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
