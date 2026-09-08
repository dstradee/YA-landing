import React, { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import {
  Plus,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Edit2,
  Trash2,
  ShieldAlert,
} from 'lucide-react';
import {
  adminFetchCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
  adminFetchProducts,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  type AdminCategoryWithCount,
  type AdminProductItem,
} from '../lib/catalog';
import { useAuth } from '../lib/auth';
import { euro } from '../data/products';
import { AdminLayout } from './admin/AdminLayout';
import { AdminDashboardPage } from './admin/AdminDashboardPage';
import { AdminOrdersPage } from './admin/AdminOrdersPage';
import { AdminOrderDetailPage } from './admin/AdminOrderDetailPage';
import { AdminCustomersPage } from './admin/AdminCustomersPage';
import { AdminCustomerDetailPage } from './admin/AdminCustomerDetailPage';
import { AdminSettingsPage } from './admin/AdminSettingsPage';
import { AdminPacksPage } from './admin/AdminPacksPage';
import { AdminDiscountsPage } from './admin/AdminDiscountsPage';
import { AdminPromotionsPage } from './admin/AdminPromotionsPage';
import { AdminCommercialPage } from './admin/AdminCommercialPage';

// ==============================================================================
// 1. COMPONENTE DE ACCESO / SEGURIDAD
// ==============================================================================
function AdminAccessDenied({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen bg-ya-black text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full border-4 border-ya-gray bg-ya-gray/30 p-8 text-center">
        <div className="w-16 h-16 bg-ya-gray border-2 border-ya-gray flex items-center justify-center mx-auto mb-6 text-ya-lime">
          <ShieldAlert size={36} />
        </div>
        <h1 className="text-3xl font-black uppercase tracking-tight mb-3">Acceso Restringido</h1>
        <p className="text-gray-300 text-sm mb-6 leading-relaxed">{reason}</p>

        <div className="space-y-3">
          <Link
            to="/login"
            className="block w-full py-3 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs hover:bg-white transition-colors"
          >
            Iniciar sesión como Admin
          </Link>
          <Link
            to="/app"
            className="block w-full py-3 border-2 border-ya-gray text-gray-300 font-black uppercase tracking-wider text-xs hover:border-white hover:text-white transition-colors"
          >
            Ir a la tienda YA
          </Link>
        </div>
      </div>
    </div>
  );
}

// ==============================================================================
// 2. GESTIÓN DE CATEGORÍAS (ADMIN)
// ==============================================================================
export function AdminCategoriesPage() {
  const [categories, setCategories] = useState<AdminCategoryWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal / Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<AdminCategoryWithCount | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('✦');
  const [sortOrder, setSortOrder] = useState(1);
  const [active, setActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setActionError(null);
    const res = await adminFetchCategories();
    if (res.error) {
      setActionError(res.error);
    } else if (res.data) {
      setCategories(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingCat(null);
    setName('');
    setSlug('');
    setDescription('');
    setIcon('✦');
    setSortOrder(categories.length + 1);
    setActive(true);
    setIsFormOpen(true);
  };

  const openEditModal = (cat: AdminCategoryWithCount) => {
    setEditingCat(cat);
    setName(cat.name);
    setSlug(cat.slug);
    setDescription(cat.description || '');
    setIcon(cat.icon || '✦');
    setSortOrder(cat.sort_order ?? 0);
    setActive(cat.active);
    setIsFormOpen(true);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!editingCat) {
      // Auto-generar slug simple
      const generatedSlug = val
        .toLowerCase()
        .trim()
        .replace(/[\s\W-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setSlug(generatedSlug);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    if (editingCat) {
      const res = await adminUpdateCategory(editingCat.id, {
        name,
        slug,
        description,
        icon,
        sort_order: Number(sortOrder),
        active,
      });

      if (!res.success) {
        setActionError(res.error);
      } else {
        setActionSuccess(`Categoría "${name}" actualizada con éxito.`);
        setIsFormOpen(false);
        loadData();
      }
    } else {
      const res = await adminCreateCategory({
        name,
        slug,
        description,
        icon,
        sort_order: Number(sortOrder),
        active,
      });

      if (!res.success) {
        setActionError(res.error);
      } else {
        setActionSuccess(`Categoría "${name}" creada correctamente.`);
        setIsFormOpen(false);
        loadData();
      }
    }
    setSubmitting(false);
  };

  const handleToggleActive = async (cat: AdminCategoryWithCount) => {
    const res = await adminUpdateCategory(cat.id, { active: !cat.active });
    if (!res.success) {
      setActionError(res.error);
    } else {
      loadData();
    }
  };

  const handleDelete = async (cat: AdminCategoryWithCount) => {
    if (!window.confirm(`¿Confirmas eliminar la categoría "${cat.name}"?`)) return;

    setActionError(null);
    const res = await adminDeleteCategory(cat.id);
    if (!res.success) {
      setActionError(res.error);
    } else {
      setActionSuccess(`Categoría "${cat.name}" eliminada.`);
      loadData();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Sección */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-ya-gray pb-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight">Categorías</h1>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">
            Gestión del árbol de catálogo en Jerez
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="p-3 border-2 border-ya-gray hover:border-ya-lime hover:text-ya-lime transition-colors"
            title="Recargar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 bg-ya-lime text-ya-black px-5 py-3 font-black text-xs uppercase tracking-wider hover:bg-white transition-colors"
          >
            <Plus size={16} />
            <span>Nueva Categoría</span>
          </button>
        </div>
      </div>

      {/* Alertas */}
      {actionError && (
        <div className="bg-red-950/80 border-2 border-red-500 text-red-200 p-4 font-bold text-xs uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="shrink-0 text-red-400" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-xs hover:underline">
            Cerrar
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="bg-ya-lime/10 border-2 border-ya-lime text-ya-lime p-4 font-bold text-xs uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="shrink-0 text-ya-lime" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-xs hover:underline">
            Cerrar
          </button>
        </div>
      )}

      {/* Tabla de Categorías */}
      <div className="border-4 border-ya-gray bg-ya-black overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-ya-gray bg-ya-gray/60 text-xs font-black uppercase tracking-wider text-gray-300">
              <th className="p-4">Orden</th>
              <th className="p-4">Icono</th>
              <th className="p-4">Nombre / Slug</th>
              <th className="p-4">Descripción</th>
              <th className="p-4 text-center">Productos</th>
              <th className="p-4 text-center">Estado</th>
              <th className="p-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-ya-gray font-bold">
            {loading && categories.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-400 uppercase tracking-widest text-xs">
                  Cargando categorías...
                </td>
              </tr>
            ) : categories.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-400 uppercase tracking-widest text-xs">
                  No hay categorías configuradas. Crea la primera con el botón superior.
                </td>
              </tr>
            ) : (
              categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-ya-gray/30 transition-colors">
                  <td className="p-4 font-mono text-gray-400 text-xs">#{cat.sort_order}</td>
                  <td className="p-4 text-2xl">{cat.icon || '✦'}</td>
                  <td className="p-4">
                    <p className="font-black text-white uppercase tracking-tight">{cat.name}</p>
                    <p className="text-xs font-mono text-ya-lime">{cat.slug}</p>
                  </td>
                  <td className="p-4 text-xs text-gray-400 max-w-xs truncate">
                    {cat.description || '—'}
                  </td>
                  <td className="p-4 text-center">
                    <span className="bg-ya-gray px-2 py-1 text-xs font-mono border border-ya-gray">
                      {cat.product_count}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => handleToggleActive(cat)}
                      className={`text-xs uppercase tracking-wider font-black px-2.5 py-1 border transition-colors ${
                        cat.active
                          ? 'border-ya-lime text-ya-lime hover:bg-ya-lime hover:text-ya-black'
                          : 'border-red-500 text-red-400 hover:bg-red-500 hover:text-white'
                      }`}
                    >
                      {cat.active ? 'Activa' : 'Inactiva'}
                    </button>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => openEditModal(cat)}
                      className="p-2 border border-ya-gray hover:border-ya-lime hover:text-ya-lime transition-colors inline-block"
                      title="Editar"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(cat)}
                      className="p-2 border border-ya-gray hover:border-red-500 hover:text-red-400 transition-colors inline-block"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal / Formulario Flotante */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-ya-black border-4 border-ya-lime max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center border-b-2 border-ya-gray pb-3">
              <h3 className="text-2xl font-black uppercase tracking-tight">
                {editingCat ? 'Editar Categoría' : 'Nueva Categoría'}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-gray-400 hover:text-white font-black text-xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 font-bold text-xs">
              <div>
                <label className="block uppercase tracking-wider text-gray-300 mb-1.5">
                  Nombre de la categoría *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Ej: Bebidas Frías"
                  className="w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime p-3 text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block uppercase tracking-wider text-gray-300 mb-1.5">
                    Slug URL *
                  </label>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="bebidas-frias"
                    className="w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime p-3 text-white outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block uppercase tracking-wider text-gray-300 mb-1.5">
                    Icono Emoji
                  </label>
                  <input
                    type="text"
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    placeholder="🥤"
                    className="w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime p-3 text-white outline-none text-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block uppercase tracking-wider text-gray-300 mb-1.5">
                  Descripción
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Texto descriptivo para la cabecera en la tienda..."
                  className="w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime p-3 text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block uppercase tracking-wider text-gray-300 mb-1.5">
                    Orden
                  </label>
                  <input
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(Number(e.target.value))}
                    className="w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime p-3 text-white outline-none"
                  />
                </div>
                <div className="pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                      className="w-4 h-4 accent-ya-lime"
                    />
                    <span className="uppercase tracking-wider text-white">Categoría Activa</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t-2 border-ya-gray">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 py-3 border-2 border-ya-gray text-gray-400 uppercase tracking-wider hover:text-white hover:border-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-ya-lime text-ya-black uppercase tracking-wider hover:bg-white transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Guardando...' : editingCat ? 'Guardar Cambios' : 'Crear Categoría'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ==============================================================================
// 4. GESTIÓN DE PRODUCTOS (ADMIN)
// ==============================================================================
export function AdminProductsPage() {
  const [products, setProducts] = useState<AdminProductItem[]>([]);
  const [categories, setCategories] = useState<AdminCategoryWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Form Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<AdminProductItem | null>(null);

  // Fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [price, setPrice] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [active, setActive] = useState(true);
  const [stockMode, setStockMode] = useState<'in_stock' | 'out_of_stock' | 'on_demand'>('in_stock');
  const [stockQuantity, setStockQuantity] = useState('10');
  const [internalCourierNotes, setInternalCourierNotes] = useState('');
  const [suggestedPurchaseLocations, setSuggestedPurchaseLocations] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setActionError(null);
    const [pRes, cRes] = await Promise.all([adminFetchProducts(), adminFetchCategories()]);

    if (pRes.error) setActionError(pRes.error);
    if (pRes.data) setProducts(pRes.data);

    if (cRes.data) setCategories(cRes.data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingProd(null);
    setName('');
    setSlug('');
    setCategoryId(categories[0]?.id || '');
    setDescription('');
    setImage('📦');
    setPrice('2.50');
    setEstimatedCost('1.40');
    setActive(true);
    setStockMode('in_stock');
    setStockQuantity('10');
    setInternalCourierNotes('');
    setSuggestedPurchaseLocations('Comercio o gasolinera local en Jerez');
    setIsFormOpen(true);
  };

  const openEditModal = (prod: AdminProductItem) => {
    setEditingProd(prod);
    setName(prod.name);
    setSlug(prod.slug);
    setCategoryId(prod.category_id);
    setDescription(prod.description || '');
    setImage(prod.image || '📦');
    setPrice(String(prod.price));
    setEstimatedCost(prod.estimated_cost ? String(prod.estimated_cost) : '');
    setActive(prod.active);
    setStockMode(prod.stock_mode || 'in_stock');
    setStockQuantity(String(prod.stock_quantity ?? 0));
    setInternalCourierNotes(prod.internal_courier_notes || '');
    setSuggestedPurchaseLocations(prod.suggested_purchase_locations || '');
    setIsFormOpen(true);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!editingProd) {
      const generatedSlug = val
        .toLowerCase()
        .trim()
        .replace(/[\s\W-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setSlug(generatedSlug);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    const payload = {
      category_id: categoryId,
      name,
      slug,
      description,
      image,
      price: parseFloat(price) || 0,
      estimated_cost: estimatedCost ? parseFloat(estimatedCost) : undefined,
      active,
      stock_mode: stockMode,
      stock_quantity: parseInt(stockQuantity, 10) || 0,
      internal_courier_notes: internalCourierNotes,
      suggested_purchase_locations: suggestedPurchaseLocations,
    };

    if (editingProd) {
      const res = await adminUpdateProduct(editingProd.id, payload);
      if (!res.success) {
        setActionError(res.error);
      } else {
        setActionSuccess(`Producto "${name}" actualizado.`);
        setIsFormOpen(false);
        loadData();
      }
    } else {
      const res = await adminCreateProduct(payload);
      if (!res.success) {
        setActionError(res.error);
      } else {
        setActionSuccess(`Producto "${name}" añadido.`);
        setIsFormOpen(false);
        loadData();
      }
    }
    setSubmitting(false);
  };

  const handleToggleActive = async (prod: AdminProductItem) => {
    const res = await adminUpdateProduct(prod.id, { active: !prod.active });
    if (!res.success) {
      setActionError(res.error);
    } else {
      loadData();
    }
  };

  const handleDelete = async (prod: AdminProductItem) => {
    if (!window.confirm(`¿Confirmas eliminar o desactivar de forma segura el producto "${prod.name}"?`)) return;

    setActionError(null);
    const res = await adminDeleteProduct(prod.id);
    if (!res.success) {
      setActionError(res.error);
    } else {
      setActionSuccess(res.error || `Producto "${prod.name}" eliminado.`);
      loadData();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Sección */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-ya-gray pb-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight">Productos</h1>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">
            Catálogo activo y notas operativas para repartidores
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="p-3 border-2 border-ya-gray hover:border-ya-lime hover:text-ya-lime transition-colors"
            title="Recargar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 bg-ya-lime text-ya-black px-5 py-3 font-black text-xs uppercase tracking-wider hover:bg-white transition-colors"
          >
            <Plus size={16} />
            <span>Nuevo Producto</span>
          </button>
        </div>
      </div>

      {/* Alertas */}
      {actionError && (
        <div className="bg-red-950/80 border-2 border-red-500 text-red-200 p-4 font-bold text-xs uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="shrink-0 text-red-400" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-xs hover:underline">
            Cerrar
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="bg-ya-lime/10 border-2 border-ya-lime text-ya-lime p-4 font-bold text-xs uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="shrink-0 text-ya-lime" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-xs hover:underline">
            Cerrar
          </button>
        </div>
      )}

      {/* Tabla de Productos */}
      <div className="border-4 border-ya-gray bg-ya-black overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-ya-gray bg-ya-gray/60 text-xs font-black uppercase tracking-wider text-gray-300">
              <th className="p-4">Visual</th>
              <th className="p-4">Producto</th>
              <th className="p-4">Categoría</th>
              <th className="p-4">PVP</th>
              <th className="p-4">Coste Est.</th>
              <th className="p-4">Stock</th>
              <th className="p-4 text-center">Estado</th>
              <th className="p-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-ya-gray font-bold">
            {loading && products.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-400 uppercase tracking-widest text-xs">
                  Cargando inventario...
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-400 uppercase tracking-widest text-xs">
                  No hay productos cargados en la base de datos. Pulsa "Nuevo Producto" para añadir uno.
                </td>
              </tr>
            ) : (
              products.map((prod) => {
                const isEmoji = !prod.image?.startsWith('http') && !prod.image?.startsWith('/');
                return (
                  <tr key={prod.id} className="hover:bg-ya-gray/30 transition-colors">
                    <td className="p-4">
                      <div className="w-12 h-12 bg-ya-gray border border-ya-gray grid place-items-center text-2xl overflow-hidden">
                        {isEmoji ? (
                          <span>{prod.image || '📦'}</span>
                        ) : (
                          <img
                            src={prod.image || ''}
                            alt={prod.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="font-black text-white uppercase tracking-tight">{prod.name}</p>
                      <p className="text-xs font-mono text-ya-lime">{prod.slug}</p>
                      {prod.internal_courier_notes && (
                        <p className="text-[10px] text-gray-400 italic mt-0.5 max-w-xs truncate">
                          Nota: {prod.internal_courier_notes}
                        </p>
                      )}
                    </td>
                    <td className="p-4 text-xs font-mono text-gray-300">
                      {prod.category_name || '—'}
                    </td>
                    <td className="p-4 font-black text-white">{euro(prod.price)}</td>
                    <td className="p-4 text-xs font-mono text-gray-400">
                      {prod.estimated_cost ? euro(prod.estimated_cost) : '—'}
                    </td>
                    <td className="p-4 text-xs font-mono">
                      <span className={prod.stock_quantity > 0 ? 'text-ya-lime' : 'text-red-400'}>
                        {prod.stock_mode === 'in_stock'
                          ? `${prod.stock_quantity} u.`
                          : prod.stock_mode === 'on_demand'
                          ? 'Bajo demanda'
                          : 'Agotado'}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleToggleActive(prod)}
                        className={`text-xs uppercase tracking-wider font-black px-2.5 py-1 border transition-colors ${
                          prod.active
                            ? 'border-ya-lime text-ya-lime hover:bg-ya-lime hover:text-ya-black'
                            : 'border-red-500 text-red-400 hover:bg-red-500 hover:text-white'
                        }`}
                      >
                        {prod.active ? 'Activo' : 'Pausado'}
                      </button>
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => openEditModal(prod)}
                        className="p-2 border border-ya-gray hover:border-ya-lime hover:text-ya-lime transition-colors inline-block"
                        title="Editar"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(prod)}
                        className="p-2 border border-ya-gray hover:border-red-500 hover:text-red-400 transition-colors inline-block"
                        title="Eliminar seguro"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal / Formulario Flotante de Producto */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-ya-black border-4 border-ya-lime max-w-2xl w-full p-6 sm:p-8 space-y-5 shadow-2xl my-8">
            <div className="flex justify-between items-center border-b-2 border-ya-gray pb-3">
              <h3 className="text-2xl font-black uppercase tracking-tight">
                {editingProd ? 'Editar Producto' : 'Nuevo Producto'}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-gray-400 hover:text-white font-black text-xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 font-bold text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block uppercase tracking-wider text-gray-300 mb-1.5">
                    Nombre del producto *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Ej: Red Bull 250 ml"
                    className="w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime p-3 text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block uppercase tracking-wider text-gray-300 mb-1.5">
                    Slug *
                  </label>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="red-bull-250-ml"
                    className="w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime p-3 text-white outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block uppercase tracking-wider text-gray-300 mb-1.5">
                    Categoría *
                  </label>
                  <select
                    required
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime p-3 text-white outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.slug})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block uppercase tracking-wider text-gray-300 mb-1.5">
                    Imagen (Emoji o URL preparada para CDN)
                  </label>
                  <input
                    type="text"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    placeholder="⚡ o https://..."
                    className="w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime p-3 text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block uppercase tracking-wider text-gray-300 mb-1.5">
                    PVP Cliente (€) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="2.50"
                    className="w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime p-3 text-white outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block uppercase tracking-wider text-gray-400 mb-1.5">
                    Coste Est. (Privado)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={estimatedCost}
                    onChange={(e) => setEstimatedCost(e.target.value)}
                    placeholder="1.45"
                    className="w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime p-3 text-white outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block uppercase tracking-wider text-gray-300 mb-1.5">
                    Modo Stock
                  </label>
                  <select
                    value={stockMode}
                    onChange={(e) => setStockMode(e.target.value as any)}
                    className="w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime p-3 text-white outline-none"
                  >
                    <option value="in_stock">En Stock</option>
                    <option value="on_demand">Bajo Demanda</option>
                    <option value="out_of_stock">Agotado</option>
                  </select>
                </div>
                <div>
                  <label className="block uppercase tracking-wider text-gray-300 mb-1.5">
                    Unidades
                  </label>
                  <input
                    type="number"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                    placeholder="10"
                    className="w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime p-3 text-white outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block uppercase tracking-wider text-gray-300 mb-1.5">
                  Descripción (Pública)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Texto visible para el cliente..."
                  className="w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime p-3 text-white outline-none"
                />
              </div>

              {/* CAMPOS INTERNOS RESTRINGIDOS */}
              <div className="p-3 border-2 border-ya-gray bg-ya-gray/30 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-ya-lime flex items-center gap-1">
                  <span>🔒 Campos Internos Operativos (Ocultos a clientes)</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block uppercase tracking-wider text-gray-400 mb-1 text-[10px]">
                      Notas para el repartidor
                    </label>
                    <input
                      type="text"
                      value={internalCourierNotes}
                      onChange={(e) => setInternalCourierNotes(e.target.value)}
                      placeholder="Ej: Asegurar que esté frío"
                      className="w-full bg-ya-black border border-ya-gray focus:border-ya-lime p-2 text-white outline-none text-xs"
                    />
                  </div>
                  <div>
                    <label className="block uppercase tracking-wider text-gray-400 mb-1 text-[10px]">
                      Ubicaciones de compra sugeridas
                    </label>
                    <input
                      type="text"
                      value={suggestedPurchaseLocations}
                      onChange={(e) => setSuggestedPurchaseLocations(e.target.value)}
                      placeholder="Ej: Bazar Calle Larga, Gasolinera Repsol..."
                      className="w-full bg-ya-black border border-ya-gray focus:border-ya-lime p-2 text-white outline-none text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="w-4 h-4 accent-ya-lime"
                  />
                  <span className="uppercase tracking-wider text-white">
                    Producto Activo y Visible en Tienda
                  </span>
                </label>
              </div>

              <div className="flex gap-3 pt-4 border-t-2 border-ya-gray">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 py-3 border-2 border-ya-gray text-gray-400 uppercase tracking-wider hover:text-white hover:border-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-ya-lime text-ya-black uppercase tracking-wider hover:bg-white transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Guardando...' : editingProd ? 'Guardar Cambios' : 'Crear Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ==============================================================================
// 5. ENRUTADOR PRINCIPAL DEL PANEL ADMIN
// ==============================================================================
export function AdminRoutes() {
  const { user, role, isAdmin, loading } = useAuth();

  // Pantalla de carga mientras se verifica la sesión en Supabase Auth
  if (loading) {
    return (
      <div className="min-h-screen bg-ya-black text-white flex items-center justify-center p-4">
        <div className="text-center font-mono text-xs uppercase tracking-widest text-ya-lime animate-pulse">
          Verificando credenciales de administrador...
        </div>
      </div>
    );
  }

  // REGLAS ESTRICTAS DE SEGURIDAD (SIN NINGÚN BYPASS):
  // 1. Usuario no autenticado -> Acceso denegado
  // 2. Usuario con rol diferente a 'admin' ('customer', 'courier' u otros) -> Acceso denegado
  // Únicamente usuario autenticado con profile.role === 'admin' puede acceder.
  if (!user || !isAdmin) {
    if (!user) {
      return (
        <AdminAccessDenied reason="Debes iniciar sesión con una cuenta autorizada con rol 'admin' para acceder al panel de administración de YA." />
      );
    }
    return (
      <AdminAccessDenied
        reason={`Acceso denegado: Tu cuenta (${user.email}) tiene rol '${role || 'sin rol asignado'}'. Únicamente usuarios autenticados con rol 'admin' tienen permisos para acceder al panel de administración.`}
      />
    );
  }

  return (
    <AdminLayout>
      <Routes>
        <Route path="/" element={<AdminDashboardPage />} />
        <Route path="/pedidos" element={<AdminOrdersPage />} />
        <Route path="/pedidos/:id" element={<AdminOrderDetailPage />} />
        <Route path="/clientes" element={<AdminCustomersPage />} />
        <Route path="/clientes/:id" element={<AdminCustomerDetailPage />} />
        <Route path="/productos" element={<AdminProductsPage />} />
        <Route path="/categorias" element={<AdminCategoriesPage />} />
        <Route path="/packs" element={<AdminPacksPage />} />
        <Route path="/descuentos" element={<AdminDiscountsPage />} />
        <Route path="/promociones" element={<AdminPromotionsPage />} />
        <Route path="/comercial" element={<AdminCommercialPage />} />
        <Route path="/configuracion" element={<AdminSettingsPage />} />
        {/* Fallback para cualquier ruta desconocida dentro de /admin */}
        <Route path="*" element={<AdminDashboardPage />} />
      </Routes>
    </AdminLayout>
  );
}
