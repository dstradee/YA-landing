// ==============================================================================
// YA - GESTIÓN DE PACKS EN ADMIN (PHASE 3B)
// Archivo: src/app/admin/AdminPacksPage.tsx
// ==============================================================================

import React, { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  SlidersHorizontal,
  Box,
  Check,
  X,
} from 'lucide-react';
import {
  fetchPacks,
  createPack,
  updatePack,
  deletePack,
} from '../../lib/adminPacks';
import { adminFetchProducts, type AdminProductItem } from '../../lib/catalog';
import type { PackWithDetails, PackType } from '../../types/app';
import { euro } from '../../data/products';
import { useCart } from '../CartContext';

export function AdminPacksPage() {
  const { refreshCommercialData } = useCart();
  const [packs, setPacks] = useState<PackWithDetails[]>([]);
  const [products, setProducts] = useState<AdminProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'fixed' | 'configurable'>('all');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<PackWithDetails | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('📦');
  const [packType, setPackType] = useState<PackType>('fixed');
  const [price, setPrice] = useState('9.90');
  const [referencePrice, setReferencePrice] = useState('12.00');
  const [sortOrder, setSortOrder] = useState(1);
  const [active, setActive] = useState(true);

  // Items para pack fijo
  const [fixedItems, setFixedItems] = useState<{ productId: string; quantity: number }[]>([]);

  // Grupos para pack personalizable
  type LocalGroup = {
    name: string;
    min_select: number;
    max_select: number;
    productIds: string[];
  };
  const [configurableGroups, setConfigurableGroups] = useState<LocalGroup[]>([]);

  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const [packsList, prodsRes] = await Promise.all([
        fetchPacks(),
        adminFetchProducts(),
      ]);
      setPacks(packsList);
      if (prodsRes.data) setProducts(prodsRes.data);
    } catch (err: any) {
      setActionError(err.message || 'Error al cargar packs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingPack(null);
    setName('');
    setSlug('');
    setDescription('');
    setImage('📦');
    setPackType('fixed');
    setPrice('9.90');
    setReferencePrice('');
    setSortOrder(packs.length + 1);
    setActive(true);
    setFixedItems(products.length > 0 ? [{ productId: products[0].id, quantity: 1 }] : []);
    setConfigurableGroups([]);
    setIsModalOpen(true);
  };

  const openEditModal = (p: PackWithDetails) => {
    setEditingPack(p);
    setName(p.name);
    setSlug(p.slug || '');
    setDescription(p.description || '');
    setImage(p.image || '📦');
    setPackType(p.pack_type);
    setPrice(String(p.price));
    setReferencePrice(p.reference_price ? String(p.reference_price) : '');
    setSortOrder(p.sort_order || 1);
    setActive(p.active);

    if (p.pack_type === 'fixed') {
      const items = (p.items || []).map((i) => ({
        productId: i.product_id,
        quantity: i.quantity,
      }));
      setFixedItems(items.length > 0 ? items : (products.length > 0 ? [{ productId: products[0].id, quantity: 1 }] : []));
      setConfigurableGroups([]);
    } else {
      const groups = (p.groups || []).map((g) => ({
        name: g.name,
        min_select: g.min_select,
        max_select: g.max_select,
        productIds: (g.options || []).map((o) => o.product_id),
      }));
      setConfigurableGroups(groups);
      setFixedItems([]);
    }

    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPack(null);
  };

  // Fixed Items Helpers
  const addFixedItem = () => {
    if (products.length === 0) return;
    setFixedItems([...fixedItems, { productId: products[0].id, quantity: 1 }]);
  };

  const updateFixedItem = (index: number, field: 'productId' | 'quantity', val: any) => {
    const next = [...fixedItems];
    next[index] = { ...next[index], [field]: val };
    setFixedItems(next);
  };

  const removeFixedItem = (index: number) => {
    setFixedItems(fixedItems.filter((_, i) => i !== index));
  };

  // Configurable Groups Helpers
  const addConfigurableGroup = () => {
    setConfigurableGroups([
      ...configurableGroups,
      {
        name: `Grupo ${configurableGroups.length + 1}`,
        min_select: 1,
        max_select: 1,
        productIds: products.slice(0, 3).map((p) => p.id),
      },
    ]);
  };

  const updateConfigurableGroup = (index: number, field: keyof LocalGroup, val: any) => {
    const next = [...configurableGroups];
    next[index] = { ...next[index], [field]: val };
    setConfigurableGroups(next);
  };

  const removeConfigurableGroup = (index: number) => {
    setConfigurableGroups(configurableGroups.filter((_, i) => i !== index));
  };

  const toggleProductInGroup = (groupIndex: number, prodId: string) => {
    const group = configurableGroups[groupIndex];
    const exists = group.productIds.includes(prodId);
    const updatedIds = exists
      ? group.productIds.filter((id) => id !== prodId)
      : [...group.productIds, prodId];
    updateConfigurableGroup(groupIndex, 'productIds', updatedIds);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    const pr = parseFloat(price);
    if (isNaN(pr) || pr <= 0) {
      setActionError('El precio del pack debe ser mayor que 0.');
      setSubmitting(false);
      return;
    }

    const cleanSlug = slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    if (packType === 'fixed') {
      if (fixedItems.length === 0) {
        setActionError('Un pack cerrado debe tener al menos un producto.');
        setSubmitting(false);
        return;
      }
    } else {
      if (configurableGroups.length === 0) {
        setActionError('Un pack personalizable debe tener al menos un grupo de selección.');
        setSubmitting(false);
        return;
      }
      for (const grp of configurableGroups) {
        if (!grp.name.trim()) {
          setActionError('Todos los grupos deben tener nombre.');
          setSubmitting(false);
          return;
        }
        if (grp.productIds.length === 0) {
          setActionError(`El grupo "${grp.name}" no tiene productos asignados.`);
          setSubmitting(false);
          return;
        }
        if (grp.min_select > grp.max_select) {
          setActionError(`En el grupo "${grp.name}", el mínimo a seleccionar no puede ser mayor que el máximo.`);
          setSubmitting(false);
          return;
        }
      }
    }

    const packData = {
      name: name.trim(),
      slug: cleanSlug,
      description: description.trim() || null,
      image: image.trim() || '📦',
      pack_type: packType,
      price: pr,
      reference_price: referencePrice ? parseFloat(referencePrice) : null,
      sort_order: sortOrder,
      active,
    };

    let itemsPayload: any[] | undefined = undefined;
    let groupsPayload: any[] | undefined = undefined;

    if (packType === 'fixed') {
      itemsPayload = fixedItems.map((fi, idx) => ({
        product_id: fi.productId,
        quantity: Math.max(1, fi.quantity || 1),
        sort_order: idx + 1,
      }));
    } else {
      groupsPayload = configurableGroups.map((cg, gIdx) => ({
        name: cg.name.trim(),
        min_select: cg.min_select,
        max_select: cg.max_select,
        sort_order: gIdx + 1,
        options: cg.productIds.map((pid, oIdx) => ({
          product_id: pid,
          sort_order: oIdx + 1,
        })),
      }));
    }

    if (editingPack) {
      const res = await updatePack(editingPack.id, {
        pack: packData,
        items: itemsPayload,
        groups: groupsPayload,
      });
      if (!res.success) {
        setActionError(res.error || 'Error al actualizar pack.');
      } else {
        setActionSuccess(`Pack "${packData.name}" actualizado correctamente.`);
        closeModal();
        await loadData();
        await refreshCommercialData();
      }
    } else {
      const res = await createPack({
        pack: packData,
        items: itemsPayload,
        groups: groupsPayload,
      });
      if (!res.success) {
        setActionError(res.error || 'Error al crear pack.');
      } else {
        setActionSuccess(`Pack "${packData.name}" creado con éxito.`);
        closeModal();
        await loadData();
        await refreshCommercialData();
      }
    }

    setSubmitting(false);
  };

  const handleToggleActive = async (p: PackWithDetails) => {
    setActionError(null);
    const res = await updatePack(p.id, { pack: { active: !p.active } });
    if (!res.success) {
      setActionError(res.error || 'Error al cambiar estado.');
    } else {
      setActionSuccess(`Pack "${p.name}" ${!p.active ? 'activado' : 'desactivado'}.`);
      await loadData();
      await refreshCommercialData();
    }
  };

  const handleDelete = async (id: string, packName: string) => {
    if (!window.confirm(`¿Confirmas que deseas eliminar el pack "${packName}"?`)) return;
    setActionError(null);
    const res = await deletePack(id);
    if (!res.success) {
      setActionError(res.error || 'Error al eliminar pack.');
    } else {
      setActionSuccess(`Pack "${packName}" eliminado.`);
      await loadData();
      await refreshCommercialData();
    }
  };

  const filteredPacks = packs.filter((p) => {
    if (filterType === 'fixed') return p.pack_type === 'fixed';
    if (filterType === 'configurable') return p.pack_type === 'configurable';
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
            <span className="text-xs font-mono text-gray-400">COMBINACIONES Y COMBOS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            <Box className="text-ya-lime" size={28} />
            <span>Packs YA (Fijos y Configurables)</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1 font-mono">
            Crea combos cerrados o configurables con precio especial, validación de stock y desglose completo.
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
            <span>Nuevo Pack</span>
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
        <span className="text-xs font-mono uppercase text-gray-400 mr-2">Tipo de Pack:</span>
        {(['all', 'fixed', 'configurable'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 transition-colors ${
              filterType === t
                ? 'bg-ya-lime text-ya-black border-ya-lime'
                : 'border-ya-gray text-gray-300 hover:border-white hover:text-white'
            }`}
          >
            {t === 'all' ? 'Todos los Packs' : t === 'fixed' ? 'Packs Fijos' : 'Personalizables'}
          </button>
        ))}
      </div>

      {/* Grid de Packs */}
      {loading ? (
        <div className="py-24 text-center font-mono text-xs uppercase text-ya-lime animate-pulse">
          Cargando catálogo de packs...
        </div>
      ) : filteredPacks.length === 0 ? (
        <div className="border-4 border-ya-gray bg-ya-black p-12 text-center space-y-4">
          <Box size={40} className="text-gray-500 mx-auto" />
          <h3 className="text-lg font-black uppercase text-white">No hay packs en esta categoría</h3>
          <p className="text-xs font-mono text-gray-400 max-w-md mx-auto">
            Crea tu primer pack para agrupar productos populares (ej: Noche de Fiesta, Kit Aperitivo).
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-6 py-2.5 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs border-2 border-ya-lime hover:bg-white hover:border-white transition-all"
          >
            Crear Primer Pack
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPacks.map((p) => {
            const savings = p.reference_price && p.reference_price > p.price
              ? Math.round(((p.reference_price - p.price) / p.reference_price) * 100)
              : null;

            return (
              <div
                key={p.id}
                className="border-4 border-ya-gray bg-ya-black p-5 flex flex-col justify-between space-y-4 transition-all hover:border-ya-lime"
              >
                <div>
                  {/* Top Bar */}
                  <div className="flex items-start justify-between gap-2 border-b-2 border-ya-gray/50 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{p.image || '📦'}</span>
                      <div>
                        <h3 className="font-black text-sm uppercase text-white tracking-tight leading-tight">
                          {p.name}
                        </h3>
                        <span className="text-[10px] font-mono text-gray-400">/{p.slug}</span>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 text-[9px] font-mono font-black uppercase tracking-wider border ${
                        p.pack_type === 'fixed'
                          ? 'border-blue-500 text-blue-300 bg-blue-950/40'
                          : 'border-purple-500 text-purple-300 bg-purple-950/40'
                      }`}
                    >
                      {p.pack_type === 'fixed' ? 'FIJO' : 'PERSONALIZABLE'}
                    </span>
                  </div>

                  {/* Descripción */}
                  {p.description && (
                    <p className="text-xs text-gray-400 font-mono mt-3 line-clamp-2 leading-relaxed">
                      {p.description}
                    </p>
                  )}

                  {/* Composición */}
                  <div className="mt-4 pt-3 border-t border-ya-gray/40 font-mono text-[11px] space-y-1.5">
                    <div className="text-gray-400 uppercase text-[10px] font-bold">
                      {p.pack_type === 'fixed' ? 'Contenido incluido:' : 'Grupos de selección:'}
                    </div>

                    {p.pack_type === 'fixed' ? (
                      <div className="space-y-1">
                        {(p.items || []).slice(0, 3).map((it, i) => (
                          <div key={i} className="text-gray-300 flex items-center gap-1.5">
                            <span className="text-ya-lime font-bold">×{it.quantity}</span>
                            <span className="truncate">
                              {(it as any).product_name || products.find((prod) => prod.id === it.product_id)?.name || `Producto (${it.product_id})`}
                            </span>
                          </div>
                        ))}
                        {(p.items || []).length > 3 && (
                          <div className="text-gray-500 text-[10px]">
                            +{(p.items || []).length - 3} producto(s) más
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {(p.groups || []).map((grp, i) => (
                          <div key={i} className="text-gray-300 flex items-center justify-between">
                            <span className="truncate font-bold">{grp.name}:</span>
                            <span className="text-gray-400 shrink-0 text-[10px]">
                              {grp.min_select === grp.max_select
                                ? `Elige ${grp.min_select}`
                                : `${grp.min_select} a ${grp.max_select}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer del card */}
                <div className="pt-3 border-t-2 border-ya-gray/60 space-y-3 font-mono">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-lg font-black text-white">{euro(p.price)}</span>
                      {p.reference_price && (
                        <span className="text-xs text-gray-500 line-through ml-2">
                          {euro(p.reference_price)}
                        </span>
                      )}
                    </div>

                    {savings && (
                      <span className="bg-ya-lime text-ya-black font-black text-[10px] px-2 py-0.5">
                        AHORRAS {savings}%
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(p)}
                      className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider border ${
                        p.active
                          ? 'bg-ya-lime text-ya-black border-ya-lime'
                          : 'bg-ya-gray/40 text-gray-400 border-ya-gray'
                      }`}
                    >
                      {p.active ? 'ACTIVO' : 'INACTIVO'}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(p)}
                        className="p-1.5 border border-ya-gray hover:border-ya-lime text-gray-300 hover:text-ya-lime transition-colors"
                        title="Editar pack"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id, p.name)}
                        className="p-1.5 border border-ya-gray hover:border-red-500 text-gray-300 hover:text-red-400 transition-colors"
                        title="Eliminar pack"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Crear / Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="border-4 border-ya-gray bg-ya-black max-w-2xl w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-ya-gray pb-4">
              <h2 className="text-lg font-black uppercase text-white flex items-center gap-2">
                <Box size={20} className="text-ya-lime" />
                <span>{editingPack ? 'Editar Pack' : 'Nuevo Pack YA'}</span>
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
              {/* Nombre y Emoji */}
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-3">
                  <label className="block text-gray-300 uppercase font-bold mb-1">
                    Nombre del Pack *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!editingPack) {
                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                      }
                    }}
                    placeholder="Ej: PACK NOCHE DE FIESTA"
                    className="w-full bg-ya-gray/30 border-2 border-ya-gray px-3 py-2 text-white font-bold focus:border-ya-lime focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-gray-300 uppercase font-bold mb-1">
                    Emoji / Icono
                  </label>
                  <input
                    type="text"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    placeholder="🌙"
                    className="w-full bg-ya-gray/30 border-2 border-ya-gray px-3 py-2 text-white text-center text-lg focus:border-ya-lime focus:outline-none"
                  />
                </div>
              </div>

              {/* Slug y Orden */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 uppercase font-bold mb-1">
                    Slug (URL amigable) *
                  </label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="pack-noche-fiesta"
                    className="w-full bg-ya-gray/30 border-2 border-ya-gray px-3 py-2 text-white focus:border-ya-lime focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-gray-300 uppercase font-bold mb-1">
                    Orden de Visualización
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(parseInt(e.target.value) || 1)}
                    className="w-full bg-ya-gray/30 border-2 border-ya-gray px-3 py-2 text-white focus:border-ya-lime focus:outline-none"
                  />
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-gray-300 uppercase font-bold mb-1">
                  Descripción
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explica qué contiene y por qué es una combinación ganadora"
                  rows={2}
                  className="w-full bg-ya-gray/30 border-2 border-ya-gray px-3 py-2 text-white focus:border-ya-lime focus:outline-none"
                />
              </div>

              {/* Selector de Tipo: Fixed vs Configurable */}
              <div>
                <label className="block text-gray-300 uppercase font-bold mb-2">
                  Tipo de Pack *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPackType('fixed')}
                    className={`py-2 px-3 border-2 font-black uppercase flex items-center justify-center gap-2 ${
                      packType === 'fixed'
                        ? 'border-ya-lime bg-ya-lime text-ya-black'
                        : 'border-ya-gray text-gray-300 hover:border-white'
                    }`}
                  >
                    <Box size={14} />
                    <span>Pack Cerrado / Fijo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPackType('configurable')}
                    className={`py-2 px-3 border-2 font-black uppercase flex items-center justify-center gap-2 ${
                      packType === 'configurable'
                        ? 'border-ya-lime bg-ya-lime text-ya-black'
                        : 'border-ya-gray text-gray-300 hover:border-white'
                    }`}
                  >
                    <SlidersHorizontal size={14} />
                    <span>Pack Personalizable</span>
                  </button>
                </div>
              </div>

              {/* Precios */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 uppercase font-bold mb-1">
                    Precio del Pack (€) *
                  </label>
                  <input
                    type="number"
                    step="0.10"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full bg-ya-gray/30 border-2 border-ya-gray px-3 py-2 text-ya-lime font-black text-sm focus:border-ya-lime focus:outline-none"
                    placeholder="9.90"
                    required
                  />
                </div>

                <div>
                  <label className="block text-gray-300 uppercase font-bold mb-1">
                    Precio de Referencia (€) (Tachado)
                  </label>
                  <input
                    type="number"
                    step="0.10"
                    min="0"
                    value={referencePrice}
                    onChange={(e) => setReferencePrice(e.target.value)}
                    className="w-full bg-ya-gray/30 border-2 border-ya-gray px-3 py-2 text-white focus:border-ya-lime focus:outline-none"
                    placeholder="12.50"
                  />
                </div>
              </div>

              {/* SECCIÓN ESPECÍFICA SEGÚN TIPO */}
              {packType === 'fixed' ? (
                /* PACK CERRADO: LISTA DE PRODUCTOS INCLUIDOS */
                <div className="border-2 border-ya-gray bg-ya-gray/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase text-white flex items-center gap-1.5">
                      <Box size={14} className="text-ya-lime" />
                      <span>Productos Incluidos en el Pack</span>
                    </span>
                    <button
                      type="button"
                      onClick={addFixedItem}
                      className="px-2.5 py-1 bg-ya-lime text-ya-black font-black uppercase text-[10px] flex items-center gap-1"
                    >
                      <Plus size={12} strokeWidth={3} />
                      <span>Añadir Producto</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {fixedItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={item.productId}
                          onChange={(e) => updateFixedItem(idx, 'productId', e.target.value)}
                          className="flex-1 bg-ya-gray/40 border border-ya-gray px-2 py-1.5 text-white focus:border-ya-lime focus:outline-none"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id} className="bg-ya-black">
                              {p.name} ({euro(p.price)})
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">Cant:</span>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateFixedItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-16 bg-ya-gray/40 border border-ya-gray px-2 py-1.5 text-center text-white focus:border-ya-lime focus:outline-none"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => removeFixedItem(idx)}
                          className="p-1.5 border border-ya-gray hover:border-red-500 text-gray-400 hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* PACK PERSONALIZABLE: GRUPOS Y OPCIONES */
                <div className="border-2 border-ya-gray bg-ya-gray/20 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase text-white flex items-center gap-1.5">
                      <SlidersHorizontal size={14} className="text-ya-lime" />
                      <span>Grupos de Selección</span>
                    </span>
                    <button
                      type="button"
                      onClick={addConfigurableGroup}
                      className="px-2.5 py-1 bg-ya-lime text-ya-black font-black uppercase text-[10px] flex items-center gap-1"
                    >
                      <Plus size={12} strokeWidth={3} />
                      <span>Añadir Grupo</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {configurableGroups.map((grp, gIdx) => (
                      <div key={gIdx} className="border border-ya-gray/60 p-3 bg-ya-black/50 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={grp.name}
                            onChange={(e) => updateConfigurableGroup(gIdx, 'name', e.target.value)}
                            placeholder="Nombre del grupo (ej: Elige tu Bebida)"
                            className="flex-1 bg-ya-gray/30 border border-ya-gray px-2 py-1 text-white font-bold focus:border-ya-lime focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => removeConfigurableGroup(gIdx)}
                            className="p-1 text-gray-400 hover:text-red-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-[11px]">
                          <div>
                            <label className="text-gray-400">Mínimo a elegir:</label>
                            <input
                              type="number"
                              min="1"
                              value={grp.min_select}
                              onChange={(e) => updateConfigurableGroup(gIdx, 'min_select', parseInt(e.target.value) || 1)}
                              className="w-full mt-1 bg-ya-gray/30 border border-ya-gray px-2 py-1 text-white focus:border-ya-lime focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-gray-400">Máximo a elegir:</label>
                            <input
                              type="number"
                              min="1"
                              value={grp.max_select}
                              onChange={(e) => updateConfigurableGroup(gIdx, 'max_select', parseInt(e.target.value) || 1)}
                              className="w-full mt-1 bg-ya-gray/30 border border-ya-gray px-2 py-1 text-white focus:border-ya-lime focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Selección de productos disponibles para este grupo */}
                        <div>
                          <label className="block text-gray-400 text-[10px] uppercase font-bold mb-1.5">
                            Productos disponibles en este grupo ({grp.productIds.length} seleccionados):
                          </label>
                          <div className="max-h-32 overflow-y-auto border border-ya-gray/40 p-2 space-y-1 bg-ya-black">
                            {products.map((p) => {
                              const isSelected = grp.productIds.includes(p.id);
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => toggleProductInGroup(gIdx, p.id)}
                                  className={`w-full flex items-center justify-between px-2 py-1 text-left text-[11px] transition-colors ${
                                    isSelected
                                      ? 'bg-ya-lime text-ya-black font-bold'
                                      : 'text-gray-300 hover:bg-ya-gray/40'
                                  }`}
                                >
                                  <span className="truncate">{p.name}</span>
                                  {isSelected && <Check size={12} strokeWidth={3} />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Checkbox Activo */}
              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="activePackCheckbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4 accent-ya-lime"
                />
                <label htmlFor="activePackCheckbox" className="text-gray-300 uppercase font-bold cursor-pointer">
                  Pack activo inmediatamente en la tienda
                </label>
              </div>

              {/* Botones de acción */}
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
                  {submitting ? 'Guardando...' : editingPack ? 'Guardar Cambios' : 'Crear Pack'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
