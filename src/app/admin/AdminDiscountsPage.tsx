// ==============================================================================
// YA - GESTIÓN DE DESCUENTOS EN ADMIN (PHASE 3B)
// Archivo: src/app/admin/AdminDiscountsPage.tsx
// ==============================================================================

import React, { useEffect, useState } from 'react';
import {
  Percent,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  Package,
  X,
} from 'lucide-react';
import {
  fetchDiscounts,
  createDiscount,
  updateDiscount,
  deleteDiscount,
} from '../../lib/adminDiscounts';
import { adminFetchProducts, adminFetchCategories, type AdminCategoryWithCount, type AdminProductItem } from '../../lib/catalog';
import type { DbDiscount, DiscountScope, DiscountType } from '../../types/app';
import { euro } from '../../data/products';

export function AdminDiscountsPage() {
  const [discounts, setDiscounts] = useState<DbDiscount[]>([]);
  const [products, setProducts] = useState<AdminProductItem[]>([]);
  const [categories, setCategories] = useState<AdminCategoryWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterScope, setFilterScope] = useState<'all' | 'product' | 'category'>('all');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<DbDiscount | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<DiscountScope>('product');
  const [productId, setProductId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('percentage');
  const [discountValue, setDiscountValue] = useState('10');
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [active, setActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const [discList, prodList, catList] = await Promise.all([
        fetchDiscounts(),
        adminFetchProducts(),
        adminFetchCategories(),
      ]);

      setDiscounts(discList);
      if (prodList.data) setProducts(prodList.data);
      if (catList.data) setCategories(catList.data);
    } catch (err: any) {
      setActionError(err.message || 'Error al cargar datos de descuentos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingDiscount(null);
    setName('');
    setDescription('');
    setScope('product');
    setProductId(products.length > 0 ? products[0].id : '');
    setCategoryId(categories.length > 0 ? categories[0].id : '');
    setDiscountType('percentage');
    setDiscountValue('10');
    setStartsAt('');
    setExpiresAt('');
    setActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (d: DbDiscount) => {
    setEditingDiscount(d);
    setName(d.name);
    setDescription(d.description || '');
    setScope(d.scope);
    setProductId(d.product_id || (products.length > 0 ? products[0].id : ''));
    setCategoryId(d.category_id || (categories.length > 0 ? categories[0].id : ''));
    setDiscountType(d.discount_type);
    setDiscountValue(String(d.discount_value));
    setStartsAt(d.starts_at ? d.starts_at.slice(0, 16) : '');
    setExpiresAt(d.expires_at ? d.expires_at.slice(0, 16) : '');
    setActive(d.active);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingDiscount(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    let val = parseFloat(discountValue);
    if (discountType === 'two_for_one') {
      val = 1;
    } else {
      if (isNaN(val) || val <= 0) {
        setActionError('El valor del descuento debe ser mayor que 0.');
        setSubmitting(false);
        return;
      }

      if (discountType === 'percentage' && val > 90) {
        setActionError('El porcentaje de descuento no puede ser superior al 90%.');
        setSubmitting(false);
        return;
      }
    }

    if (scope === 'product' && !productId) {
      setActionError('Debes seleccionar un producto.');
      setSubmitting(false);
      return;
    }

    if (scope === 'category' && !categoryId) {
      setActionError('Debes seleccionar una categoría.');
      setSubmitting(false);
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      scope,
      product_id: scope === 'product' ? productId : null,
      category_id: scope === 'category' ? categoryId : null,
      discount_type: discountType,
      discount_value: val,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      active,
    };

    if (editingDiscount) {
      const res = await updateDiscount(editingDiscount.id, payload);
      if (!res.success) {
        setActionError(res.error || 'Error al actualizar descuento.');
      } else {
        setActionSuccess(`Descuento "${payload.name}" actualizado correctamente.`);
        closeModal();
        await loadData();
        window.dispatchEvent(new Event('ya-commercial-updated'));
      }
    } else {
      const res = await createDiscount(payload);
      if (!res.success) {
        setActionError(res.error || 'Error al crear descuento.');
      } else {
        setActionSuccess(`Descuento "${payload.name}" creado con éxito.`);
        closeModal();
        await loadData();
        window.dispatchEvent(new Event('ya-commercial-updated'));
      }
    }

    setSubmitting(false);
  };

  const handleToggleActive = async (d: DbDiscount) => {
    setActionError(null);
    const res = await updateDiscount(d.id, { active: !d.active });
    if (!res.success) {
      setActionError(res.error || 'Error al cambiar estado del descuento.');
    } else {
      setActionSuccess(`Descuento "${d.name}" ${!d.active ? 'activado' : 'desactivado'}.`);
      await loadData();
      window.dispatchEvent(new Event('ya-commercial-updated'));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`¿Confirmas que deseas eliminar el descuento "${name}"?`)) return;
    setActionError(null);
    const res = await deleteDiscount(id);
    if (!res.success) {
      setActionError(res.error || 'Error al eliminar descuento.');
    } else {
      setActionSuccess(`Descuento "${name}" eliminado.`);
      await loadData();
      window.dispatchEvent(new Event('ya-commercial-updated'));
    }
  };

  const filteredDiscounts = discounts.filter((d) => {
    if (filterScope === 'product') return d.scope === 'product';
    if (filterScope === 'category') return d.scope === 'category';
    return true;
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="border-b-4 border-ya-gray pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-ya-lime text-ya-black px-2 py-0.5 text-xs font-black uppercase tracking-wider">
              PHASE 3B
            </span>
            <span className="text-xs font-mono text-gray-400">TARIFAS Y OFERTAS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            <Percent className="text-ya-lime" size={28} />
            <span>Descuentos (Producto y Categoría)</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1 font-mono">
            Aplica rebajas automáticas a nivel de producto individual o a categorías enteras con cálculo jerárquico.
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
            <span>Nuevo Descuento</span>
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

      {/* Filtros */}
      <div className="flex items-center gap-2 border-b-2 border-ya-gray pb-4">
        <span className="text-xs font-mono uppercase text-gray-400 mr-2">Ámbito:</span>
        {(['all', 'product', 'category'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterScope(s)}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 transition-colors ${
              filterScope === s
                ? 'bg-ya-lime text-ya-black border-ya-lime'
                : 'border-ya-gray text-gray-300 hover:border-white hover:text-white'
            }`}
          >
            {s === 'all' ? 'Todos' : s === 'product' ? 'Por Producto' : 'Por Categoría'}
          </button>
        ))}
      </div>

      {/* Tabla de Descuentos */}
      {loading ? (
        <div className="py-24 text-center font-mono text-xs uppercase text-ya-lime animate-pulse">
          Cargando reglas de descuento...
        </div>
      ) : actionError && discounts.length === 0 ? (
        <div className="border-4 border-red-500 bg-ya-black p-12 text-center space-y-4 shadow-[6px_6px_0px_0px_#EF4444]">
          <AlertTriangle size={40} className="text-red-400 mx-auto" />
          <h3 className="text-lg font-black uppercase text-white">Error al cargar reglas de descuento</h3>
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
      ) : filteredDiscounts.length === 0 ? (
        <div className="border-4 border-ya-gray bg-ya-black p-12 text-center space-y-4">
          <Percent size={40} className="text-gray-500 mx-auto" />
          <h3 className="text-lg font-black uppercase text-white">No hay descuentos configurados</h3>
          <p className="text-xs font-mono text-gray-400 max-w-md mx-auto">
            Crea tu primer descuento para ofrecer precios reducidos a clientes en productos o categorías completas.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-6 py-2.5 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs border-2 border-ya-lime hover:bg-white hover:border-white transition-all"
          >
            Crear Primer Descuento
          </button>
        </div>
      ) : (
        <div className="border-4 border-ya-gray bg-ya-black overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="border-b-4 border-ya-gray bg-ya-gray/30 text-gray-300 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-4">Descuento</th>
                <th className="p-4">Ámbito & Destino</th>
                <th className="p-4">Tipo & Valor</th>
                <th className="p-4">Vigencia</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-ya-gray/50">
              {filteredDiscounts.map((d) => (
                <tr key={d.id} className="hover:bg-ya-gray/20 transition-colors">
                  <td className="p-4 font-bold text-white">
                    <div className="flex flex-col">
                      <span className="font-black text-sm">{d.name}</span>
                      {d.description && (
                        <span className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">
                          {d.description}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="p-4">
                    {d.scope === 'product' ? (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-950/40 border border-blue-500/50 text-blue-300 text-[11px] font-bold uppercase">
                        <Package size={12} />
                        <span>{d.product_name || `ID: ${d.product_id?.slice(0, 8)}...`}</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-950/40 border border-purple-500/50 text-purple-300 text-[11px] font-bold uppercase">
                        <Layers size={12} />
                        <span>{d.category_name || `Categoría: ${d.category_id}`}</span>
                      </div>
                    )}
                  </td>

                  <td className="p-4">
                    {d.discount_type === 'two_for_one' ? (
                      <span className="bg-ya-lime text-ya-black px-2.5 py-1 font-black text-xs uppercase tracking-wider">
                        ⚡ 2×1 (2ª gratis)
                      </span>
                    ) : (
                      <span className="bg-ya-lime/20 text-ya-lime px-2.5 py-1 font-black text-sm border border-ya-lime/40">
                        {d.discount_type === 'percentage'
                          ? `-${d.discount_value}%`
                          : `-${euro(d.discount_value)}`}
                      </span>
                    )}
                  </td>

                  <td className="p-4 text-gray-400 text-[11px]">
                    {d.starts_at || d.expires_at ? (
                      <div className="space-y-0.5">
                        {d.starts_at && <div>Desde: {new Date(d.starts_at).toLocaleDateString()}</div>}
                        {d.expires_at && <div>Hasta: {new Date(d.expires_at).toLocaleDateString()}</div>}
                      </div>
                    ) : (
                      <span className="text-gray-500">Sin límite temporal</span>
                    )}
                  </td>

                  <td className="p-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(d)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider border ${
                        d.active
                          ? 'bg-ya-lime text-ya-black border-ya-lime'
                          : 'bg-ya-gray/40 text-gray-400 border-ya-gray'
                      }`}
                    >
                      {d.active ? 'ACTIVO' : 'INACTIVO'}
                    </button>
                  </td>

                  <td className="p-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(d)}
                        className="p-1.5 border border-ya-gray hover:border-ya-lime text-gray-300 hover:text-ya-lime transition-colors"
                        title="Editar descuento"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(d.id, d.name)}
                        className="p-1.5 border border-ya-gray hover:border-red-500 text-gray-300 hover:text-red-400 transition-colors"
                        title="Eliminar descuento"
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

      {/* Modal de Creación / Edición */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="border-4 border-ya-gray bg-ya-black max-w-xl w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-ya-gray pb-4">
              <h2 className="text-lg font-black uppercase text-white flex items-center gap-2">
                <Percent size={20} className="text-ya-lime" />
                <span>{editingDiscount ? 'Editar Descuento' : 'Nuevo Descuento'}</span>
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
              <div>
                <label className="block text-gray-300 uppercase font-bold mb-1">
                  Nombre del Descuento *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Rebaja Red Bull Noche"
                  className="w-full bg-ya-gray/30 border-2 border-ya-gray px-3 py-2 text-white focus:border-ya-lime focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-300 uppercase font-bold mb-1">
                  Descripción (Opcional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej: Oferta temporal de fin de semana"
                  className="w-full bg-ya-gray/30 border-2 border-ya-gray px-3 py-2 text-white focus:border-ya-lime focus:outline-none"
                />
              </div>

              {/* Selector de Ámbito */}
              <div>
                <label className="block text-gray-300 uppercase font-bold mb-2">
                  Ámbito de Aplicación *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setScope('product')}
                    className={`py-2 px-3 border-2 font-black uppercase flex items-center justify-center gap-2 ${
                      scope === 'product'
                        ? 'border-ya-lime bg-ya-lime text-ya-black'
                        : 'border-ya-gray text-gray-300 hover:border-white'
                    }`}
                  >
                    <Package size={14} />
                    <span>Producto Único</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('category')}
                    className={`py-2 px-3 border-2 font-black uppercase flex items-center justify-center gap-2 ${
                      scope === 'category'
                        ? 'border-ya-lime bg-ya-lime text-ya-black'
                        : 'border-ya-gray text-gray-300 hover:border-white'
                    }`}
                  >
                    <Layers size={14} />
                    <span>Categoría Entera</span>
                  </button>
                </div>
              </div>

              {/* Dropdown condicional */}
              {scope === 'product' ? (
                <div>
                  <label className="block text-gray-300 uppercase font-bold mb-1">
                    Selecciona el Producto *
                  </label>
                  <select
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    className="w-full bg-ya-gray/40 border-2 border-ya-gray px-3 py-2 text-white focus:border-ya-lime focus:outline-none"
                    required
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id} className="bg-ya-black">
                        {p.name} ({euro(p.price)})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-gray-300 uppercase font-bold mb-1">
                    Selecciona la Categoría *
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full bg-ya-gray/40 border-2 border-ya-gray px-3 py-2 text-white focus:border-ya-lime focus:outline-none"
                    required
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id} className="bg-ya-black">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Tipo y Valor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 uppercase font-bold mb-1">
                    Tipo de Descuento
                  </label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                    className="w-full bg-ya-gray/40 border-2 border-ya-gray px-3 py-2 text-white focus:border-ya-lime focus:outline-none"
                  >
                    <option value="percentage" className="bg-ya-black">Porcentaje (%)</option>
                    <option value="fixed" className="bg-ya-black">Importe Fijo (€)</option>
                    <option value="two_for_one" className="bg-ya-black">⚡ Promoción 2×1 (Lleva 2, paga 1)</option>
                  </select>
                </div>

                <div>
                  {discountType === 'two_for_one' ? (
                    <div className="h-full flex items-center p-3 bg-ya-lime/10 border-2 border-ya-lime/40 text-ya-lime text-[11px] font-bold">
                      ⚡ Automático: 2×1 (la 2ª unidad sale al 100% de descuento)
                    </div>
                  ) : (
                    <>
                      <label className="block text-gray-300 uppercase font-bold mb-1">
                        Valor del Descuento *
                      </label>
                      <input
                        type="number"
                        step={discountType === 'percentage' ? '1' : '0.10'}
                        min="0"
                        max={discountType === 'percentage' ? '90' : undefined}
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        className="w-full bg-ya-gray/30 border-2 border-ya-gray px-3 py-2 text-white focus:border-ya-lime focus:outline-none font-bold"
                        placeholder="10"
                        required
                      />
                    </>
                  )}
                </div>
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
                  id="activeDiscountCheckbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4 accent-ya-lime"
                />
                <label htmlFor="activeDiscountCheckbox" className="text-gray-300 uppercase font-bold cursor-pointer">
                  Descuento activo inmediatamente
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
                  {submitting ? 'Guardando...' : editingDiscount ? 'Guardar Cambios' : 'Crear Descuento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
