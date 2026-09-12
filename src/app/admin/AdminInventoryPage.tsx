// ==============================================================================
// YA - PANEL DE GESTIÓN DE INVENTARIO Y STOCK REAL (FASE 5)
// Archivo: src/app/admin/AdminInventoryPage.tsx
// ==============================================================================

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Boxes,
  Package,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  ArrowDownRight,
  ArrowUpRight,
  History,
  SlidersHorizontal,
  X,
  ExternalLink,
} from 'lucide-react';
import {
  fetchInventorySummary,
  fetchStockMovements,
  adminAdjustStock,
} from '../../lib/adminInventory';
import { adminFetchProducts, subscribeToCatalogChanges, type AdminProductItem } from '../../lib/catalog';
import { isRealImageUrl, formatImageUrl } from '../../lib/cloudinary';
import type { DbStockMovement, InventorySummary, StockMovementType } from '../../types/app';
import { euro } from '../../data/products';

const MOVEMENT_TYPE_LABELS: Record<StockMovementType, { label: string; badgeClass: string }> = {
  entry: {
    label: 'Recepción Mercancía (+)',
    badgeClass: 'bg-ya-lime/10 text-ya-lime border-ya-lime/30',
  },
  sale: {
    label: 'Venta / Pedido (-)',
    badgeClass: 'bg-red-500/10 text-red-400 border-red-500/30',
  },
  cancellation: {
    label: 'Reposición Cancelado (+)',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
  adjustment: {
    label: 'Ajuste Manual',
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  },
  loss: {
    label: 'Merma / Rotura (-)',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  },
  test_order: {
    label: 'Pedido de Prueba (-)',
    badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  },
};

export function AdminInventoryPage() {
  const [activeTab, setActiveTab] = useState<'inventory' | 'movements'>('inventory');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Datos
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [products, setProducts] = useState<AdminProductItem[]>([]);
  const [movements, setMovements] = useState<DbStockMovement[]>([]);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [movementFilter, setMovementFilter] = useState<string>('all');

  // Modal Ajuste de Stock
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<AdminProductItem | null>(null);
  const [adjustType, setAdjustType] = useState<StockMovementType>('adjustment');
  const [adjustQuantity, setAdjustQuantity] = useState<string>('0');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [summaryRes, prodsRes, movesRes] = await Promise.all([
        fetchInventorySummary(),
        adminFetchProducts(),
        fetchStockMovements({ limit: 100 }),
      ]);

      if (summaryRes.data) setSummary(summaryRes.data);
      if (prodsRes.data) setProducts(prodsRes.data);
      if (movesRes.data) setMovements(movesRes.data);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error cargando datos de inventario');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    const handleInventoryUpdated = () => {
      loadData();
    };
    window.addEventListener('ya-inventory-updated', handleInventoryUpdated);

    const unsubscribe = subscribeToCatalogChanges(() => {
      loadData();
    });

    return () => {
      window.removeEventListener('ya-inventory-updated', handleInventoryUpdated);
      unsubscribe();
    };
  }, [loadData]);

  // Filtrado de productos
  const filteredProducts = useMemo(() => {
    return products.filter((prod) => {
      const matchesQuery =
        !searchQuery.trim() ||
        prod.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prod.category_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prod.slug.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesQuery) return false;

      const qty = prod.stock_quantity ?? 0;
      const min = prod.min_stock ?? 5;
      const isOut = prod.stock_mode === 'out_of_stock' || (prod.stock_mode === 'in_stock' && qty <= 0);
      const isLow = prod.stock_mode === 'in_stock' && qty > 0 && qty <= min;
      const isGood = prod.stock_mode === 'in_stock' && qty > min;

      if (statusFilter === 'out_of_stock') return isOut;
      if (statusFilter === 'low_stock') return isLow;
      if (statusFilter === 'in_stock') return isGood;
      return true;
    });
  }, [products, searchQuery, statusFilter]);

  // Filtrado de movimientos
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      if (movementFilter !== 'all' && m.movement_type !== movementFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const prodMatch = m.product_name?.toLowerCase().includes(query);
        const orderMatch = m.order_number?.toLowerCase().includes(query);
        const reasonMatch = m.reason?.toLowerCase().includes(query);
        return prodMatch || orderMatch || reasonMatch;
      }
      return true;
    });
  }, [movements, movementFilter, searchQuery]);

  // Abrir modal para un producto específico
  const openAdjustModal = (prod: AdminProductItem) => {
    setSelectedProduct(prod);
    setAdjustType('adjustment');
    setAdjustQuantity('0');
    setAdjustReason('');
    setIsAdjustModalOpen(true);
  };

  // Enviar ajuste manual de stock
  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    const qty = parseInt(adjustQuantity, 10);
    if (isNaN(qty) || qty === 0) {
      setErrorMsg('Debes especificar una cantidad de ajuste distinta de 0 (+ o -).');
      return;
    }

    if (!adjustReason.trim()) {
      setErrorMsg('Debes indicar el motivo o justificación del ajuste para la auditoría.');
      return;
    }

    setSubmittingAdjust(true);
    setErrorMsg(null);

    const res = await adminAdjustStock({
      productId: selectedProduct.id,
      type: adjustType,
      quantity: qty,
      reason: adjustReason.trim(),
    });

    setSubmittingAdjust(false);

    if (!res.success) {
      setErrorMsg(res.error || 'No se pudo realizar el ajuste de stock.');
    } else {
      setSuccessMsg(
        `Ajuste realizado correctamente para "${selectedProduct.name}". Nuevo stock: ${res.new_stock ?? 'actualizado'} u.`
      );
      setIsAdjustModalOpen(false);
      loadData();
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-ya-gray pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="text-ya-lime" size={24} />
            <h1 className="text-2xl font-black uppercase tracking-tight text-white">
              Inventario y Stock Real
            </h1>
          </div>
          <p className="text-xs font-mono text-gray-400 mt-1">
            Gestión atómica y trazabilidad completa de existencias en almacén Jerez
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (products.length > 0) openAdjustModal(products[0]);
            }}
            className="px-4 py-2 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs hover:bg-white transition-colors flex items-center gap-1.5"
          >
            <SlidersHorizontal size={14} />
            <span>Ajustar Stock</span>
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 border-2 border-ya-gray text-gray-300 hover:border-ya-lime hover:text-white transition-colors disabled:opacity-50"
            title="Actualizar datos"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Alertas */}
      {errorMsg && (
        <div className="p-4 border-2 border-rose-500 bg-rose-500/10 text-rose-300 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 border-2 border-emerald-500 bg-emerald-500/10 text-emerald-300 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Tarjetas de Resumen KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-4 bg-ya-gray/30 border-2 border-ya-gray">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 block">
            Total Catálogo
          </span>
          <span className="text-2xl font-black text-white mt-1 block">
            {summary?.total_products ?? products.length}
          </span>
          <span className="text-[10px] text-gray-400 mt-1 block">referencias activas</span>
        </div>

        <div className="p-4 bg-ya-gray/30 border-2 border-emerald-500/30">
          <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 block">
            En Stock Normal
          </span>
          <span className="text-2xl font-black text-emerald-400 mt-1 block">
            {summary?.in_stock_products ?? 0}
          </span>
          <span className="text-[10px] text-emerald-500/80 mt-1 block">con stock óptimo</span>
        </div>

        <div className="p-4 bg-ya-gray/30 border-2 border-amber-500/40">
          <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 block">
            Stock Bajo (Alerta)
          </span>
          <span className="text-2xl font-black text-amber-400 mt-1 block">
            {summary?.low_stock_products ?? 0}
          </span>
          <span className="text-[10px] text-amber-400/80 mt-1 block">≤ stock mínimo</span>
        </div>

        <div className="p-4 bg-ya-gray/30 border-2 border-rose-500/40">
          <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400 block">
            Agotados
          </span>
          <span className="text-2xl font-black text-rose-400 mt-1 block">
            {summary?.out_of_stock_products ?? 0}
          </span>
          <span className="text-[10px] text-rose-400/80 mt-1 block">bloqueados en tienda</span>
        </div>

        <div className="p-4 bg-ya-gray/30 border-2 border-ya-lime/40 col-span-2 lg:col-span-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-ya-lime block">
            Unidades Totales
          </span>
          <span className="text-2xl font-black text-ya-lime mt-1 block">
            {summary?.total_units_in_stock ?? 0} u.
          </span>
          <span className="text-[10px] text-gray-400 mt-1 block">físicas en almacén</span>
        </div>
      </div>

      {/* Navegación por pestañas */}
      <div className="flex border-b-2 border-ya-gray">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-5 py-3 font-black text-xs uppercase tracking-wider border-b-2 -mb-[2px] transition-colors flex items-center gap-2 ${
            activeTab === 'inventory'
              ? 'border-ya-lime text-ya-lime bg-ya-gray/20'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Package size={15} />
          <span>Control de Stock por Producto</span>
        </button>

        <button
          onClick={() => setActiveTab('movements')}
          className={`px-5 py-3 font-black text-xs uppercase tracking-wider border-b-2 -mb-[2px] transition-colors flex items-center gap-2 ${
            activeTab === 'movements'
              ? 'border-ya-lime text-ya-lime bg-ya-gray/20'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <History size={15} />
          <span>Historial de Movimientos / Auditoría ({movements.length})</span>
        </button>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-ya-gray/20 p-3 border-2 border-ya-gray">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, slug, motivo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-ya-black border border-ya-gray text-xs text-white focus:border-ya-lime outline-none"
          />
        </div>

        {activeTab === 'inventory' ? (
          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
            <span className="text-[10px] font-mono uppercase text-gray-400">Estado:</span>
            {(
              [
                ['all', 'Todos'],
                ['in_stock', 'Óptimo'],
                ['low_stock', 'Stock Bajo'],
                ['out_of_stock', 'Agotados'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setStatusFilter(val)}
                className={`px-2.5 py-1 text-[11px] font-bold uppercase transition-colors ${
                  statusFilter === val
                    ? 'bg-ya-lime text-ya-black'
                    : 'bg-ya-gray/40 text-gray-300 hover:bg-ya-gray'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
            <span className="text-[10px] font-mono uppercase text-gray-400">Tipo:</span>
            <select
              value={movementFilter}
              onChange={(e) => setMovementFilter(e.target.value)}
              className="bg-ya-black border border-ya-gray text-xs text-white p-1.5 focus:border-ya-lime outline-none"
            >
              <option value="all">Todos los movimientos</option>
              <option value="entry">Recepción Mercancía (+)</option>
              <option value="sale">Venta / Pedido (-)</option>
              <option value="cancellation">Reposición Cancelado (+)</option>
              <option value="adjustment">Ajuste Manual</option>
              <option value="loss">Merma / Rotura (-)</option>
              <option value="test_order">Pedido de Prueba (-)</option>
            </select>
          </div>
        )}
      </div>

      {/* TAB 1: LISTADO DE PRODUCTOS Y STOCK */}
      {activeTab === 'inventory' && (
        <div className="border-2 border-ya-gray overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-ya-gray text-gray-300 uppercase font-mono tracking-wider text-[10px] border-b-2 border-ya-gray">
              <tr>
                <th className="p-3">Producto</th>
                <th className="p-3">Categoría</th>
                <th className="p-3">Modo Stock</th>
                <th className="p-3 text-right">PVP</th>
                <th className="p-3 text-center">Stock Actual</th>
                <th className="p-3 text-center">Stock Mínimo</th>
                <th className="p-3 text-center">Estado</th>
                <th className="p-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-ya-gray font-bold">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-400 text-xs uppercase font-mono">
                    No se encontraron productos con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((prod) => {
                  const qty = prod.stock_quantity ?? 0;
                  const min = prod.min_stock ?? 5;
                  const isOut =
                    prod.stock_mode === 'out_of_stock' || (prod.stock_mode === 'in_stock' && qty <= 0);
                  const isLow = prod.stock_mode === 'in_stock' && qty > 0 && qty <= min;

                  return (
                    <tr key={prod.id} className="hover:bg-ya-gray/30 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 bg-ya-black border border-ya-gray grid place-items-center text-lg overflow-hidden shrink-0">
                            {isRealImageUrl(prod.image) ? (
                              <img
                                src={formatImageUrl(prod.image, 100)}
                                alt={prod.name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <span>{prod.image || '📦'}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-white truncate">{prod.name}</p>
                            <p className="text-[10px] font-mono text-ya-lime truncate">{prod.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-gray-400 font-mono text-[11px]">
                        {prod.category_name || '—'}
                      </td>
                      <td className="p-3 font-mono text-[11px]">
                        {prod.stock_mode === 'in_stock' ? (
                          <span className="text-gray-300">Inventario Real</span>
                        ) : prod.stock_mode === 'on_demand' ? (
                          <span className="text-blue-400">Bajo Demanda</span>
                        ) : (
                          <span className="text-rose-400">Sin Stock</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono text-white">{euro(prod.price)}</td>
                      <td className="p-3 text-center font-mono text-sm">
                        <span
                          className={`font-black ${
                            isOut ? 'text-rose-400' : isLow ? 'text-amber-400' : 'text-ya-lime'
                          }`}
                        >
                          {qty} u.
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono text-gray-400 text-xs">{min} u.</td>
                      <td className="p-3 text-center">
                        {isOut ? (
                          <span className="inline-block px-2 py-0.5 text-[9px] font-black uppercase bg-rose-500/10 text-rose-400 border border-rose-500/30">
                            Agotado
                          </span>
                        ) : isLow ? (
                          <span className="inline-block px-2 py-0.5 text-[9px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            Stock Bajo
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            En Stock
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => openAdjustModal(prod)}
                          className="px-2.5 py-1 text-[11px] font-black uppercase tracking-wider bg-ya-gray border border-ya-gray hover:border-ya-lime hover:text-ya-lime transition-colors"
                        >
                          Ajustar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: AUDITORÍA DE MOVIMIENTOS */}
      {activeTab === 'movements' && (
        <div className="border-2 border-ya-gray overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-ya-gray text-gray-300 uppercase font-mono tracking-wider text-[10px] border-b-2 border-ya-gray">
              <tr>
                <th className="p-3">Fecha / Hora</th>
                <th className="p-3">Producto</th>
                <th className="p-3">Tipo Movimiento</th>
                <th className="p-3 text-center">Variación</th>
                <th className="p-3 text-center">Stock Resultante</th>
                <th className="p-3">Pedido</th>
                <th className="p-3">Motivo / Justificación</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-ya-gray font-bold">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400 text-xs uppercase font-mono">
                    No hay movimientos registrados en el historial con este filtro.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((move) => {
                  const typeInfo =
                    MOVEMENT_TYPE_LABELS[move.movement_type] || {
                      label: move.movement_type,
                      badgeClass: 'bg-ya-gray text-white border-ya-gray',
                    };
                  const isPositive = move.quantity > 0;
                  const formattedDate = new Date(move.created_at).toLocaleString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr key={move.id} className="hover:bg-ya-gray/30 transition-colors">
                      <td className="p-3 font-mono text-[11px] text-gray-400 whitespace-nowrap">
                        {formattedDate}
                      </td>
                      <td className="p-3">
                        <span className="text-white font-black">{move.product_name || '—'}</span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-block px-2 py-0.5 text-[9px] font-black uppercase border ${typeInfo.badgeClass}`}
                        >
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono">
                        <span
                          className={`font-black flex items-center justify-center gap-0.5 ${
                            isPositive ? 'text-ya-lime' : 'text-rose-400'
                          }`}
                        >
                          {isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                          {isPositive ? `+${move.quantity}` : move.quantity} u.
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono text-white text-xs">
                        {move.new_stock} u.
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {move.order_number ? (
                          <Link
                            to={`/admin/pedidos/${move.order_id || move.order_number}`}
                            className="text-ya-lime hover:underline inline-flex items-center gap-1"
                          >
                            <span>#{move.order_number}</span>
                            <ExternalLink size={10} />
                          </Link>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="p-3 text-gray-300 text-xs max-w-xs truncate">
                        {move.reason || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL DE AJUSTE MANUAL DE STOCK */}
      {isAdjustModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-ya-black border-4 border-ya-lime max-w-lg w-full p-6 text-white space-y-4">
            <div className="flex items-center justify-between border-b-2 border-ya-gray pb-3">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
                  <SlidersHorizontal size={18} className="text-ya-lime" />
                  <span>Ajuste de Stock Manual</span>
                </h2>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">
                  Registra un movimiento auditado en la tabla de stock_movements
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAdjustModalOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              {/* Selector de Producto */}
              <div>
                <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                  Producto a Ajustar
                </label>
                <select
                  value={selectedProduct.id}
                  onChange={(e) => {
                    const found = products.find((p) => p.id === e.target.value);
                    if (found) setSelectedProduct(found);
                  }}
                  className="w-full bg-ya-gray border-2 border-ya-gray p-2 text-xs text-white focus:border-ya-lime outline-none"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.stock_quantity ?? 0} u. en stock)
                    </option>
                  ))}
                </select>
              </div>

              {/* Detalle actual del producto */}
              <div className="p-3 bg-ya-gray/30 border border-ya-gray flex justify-between items-center text-xs">
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-mono">
                    Stock Actual en Base de Datos:
                  </span>
                  <span className="text-lg font-black text-ya-lime">
                    {selectedProduct.stock_quantity ?? 0} unidades
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-gray-400 block text-[10px] uppercase font-mono">
                    Umbral Alerta Mínimo:
                  </span>
                  <span className="text-sm font-black text-gray-300">
                    {selectedProduct.min_stock ?? 5} unidades
                  </span>
                </div>
              </div>

              {/* Tipo de Operación / Movimiento */}
              <div>
                <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                  Tipo de Operación
                </label>
                <select
                  value={adjustType}
                  onChange={(e) => setAdjustType(e.target.value as StockMovementType)}
                  className="w-full bg-ya-gray border-2 border-ya-gray p-2 text-xs text-white focus:border-ya-lime outline-none"
                >
                  <option value="entry">Recepción de Mercancía (Entrada +)</option>
                  <option value="adjustment">Ajuste de Inventario / Corrección (+ / -)</option>
                  <option value="loss">Merma / Rotura / Producto deteriorado (Salida -)</option>
                </select>
              </div>

              {/* Variación de Cantidad (+ o -) */}
              <div>
                <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                  Variación de Cantidad (Delta)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="1"
                    placeholder="Ej: +10 o -3"
                    value={adjustQuantity}
                    onChange={(e) => setAdjustQuantity(e.target.value)}
                    required
                    className="flex-1 bg-ya-gray border-2 border-ya-gray p-2 text-sm text-white font-mono focus:border-ya-lime outline-none"
                  />
                  <div className="p-2 bg-ya-gray text-xs font-mono text-gray-300 border border-ya-gray">
                    Nuevo Stock Estimado:{' '}
                    <strong className="text-ya-lime font-black">
                      {Math.max(
                        0,
                        (selectedProduct.stock_quantity ?? 0) + (parseInt(adjustQuantity, 10) || 0)
                      )}{' '}
                      u.
                    </strong>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  Usa números positivos para añadir stock (ej: <code>15</code>) o negativos para restar (ej: <code>-5</code>).
                </p>
              </div>

              {/* Motivo del Ajuste (Obligatorio) */}
              <div>
                <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                  Motivo / Justificación (Obligatorio para Auditoría)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej: Recuento físico mensual, reposición de proveedor Makro, rotura de lata en almacén..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  required
                  className="w-full bg-ya-gray border-2 border-ya-gray p-2 text-xs text-white focus:border-ya-lime outline-none"
                />
              </div>

              {/* Botones de acción */}
              <div className="flex gap-3 pt-3 border-t-2 border-ya-gray">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="flex-1 py-2.5 border-2 border-ya-gray text-gray-300 uppercase font-black text-xs hover:border-white hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingAdjust}
                  className="flex-1 py-2.5 bg-ya-lime text-ya-black uppercase font-black text-xs hover:bg-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {submittingAdjust ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  <span>Confirmar Ajuste</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
