// ==============================================================================
// YA - MODAL DE CONFIGURACIÓN Y DETALLE DE PACKS (PHASE 3B)
// Archivo: src/app/PackModal.tsx
// ==============================================================================

import { useState, useMemo } from 'react';
import { X, Check, Package, Sparkles, AlertCircle, Plus, Minus } from 'lucide-react';
import { euro } from '../data/products';
import { useCart } from './CartContext';
import { useCatalog } from './CatalogContext';
import type { PackWithDetails, CartPackSelection } from '../types/app';
import { isRealImageUrl, formatImageUrl } from '../lib/cloudinary';

interface PackModalProps {
  pack: PackWithDetails;
  onClose: () => void;
}

export function PackModal({ pack, onClose }: PackModalProps) {
  const { addPackToCart } = useCart();
  const { getProductById } = useCatalog();

  // Estado para selecciones de packs configurables:
  // Record<groupId, Record<productId, quantity>>
  const [selections, setSelections] = useState<Record<string, Record<string, number>>>(() => {
    const initial: Record<string, Record<string, number>> = {};
    if (pack.pack_type === 'configurable' && pack.groups) {
      pack.groups.forEach((grp) => {
        initial[grp.id] = {};
        const options = grp.options || [];

        // 1. Buscar opciones marcadas por defecto
        const defaultOpts = options.filter((opt) => opt.default_selected);

        if (defaultOpts.length > 0) {
          let assigned = 0;
          for (const dOpt of defaultOpts) {
            if (assigned < grp.max_select) {
              initial[grp.id][dOpt.product_id] = 1;
              assigned += 1;
            }
          }
          // Si faltan para cumplir el mínimo y hay al menos una opción por defecto, asignar más unidades
          if (assigned < grp.min_select && defaultOpts.length > 0) {
            const firstId = defaultOpts[0].product_id;
            const needed = Math.min(grp.max_select - assigned, grp.min_select - assigned);
            initial[grp.id][firstId] = (initial[grp.id][firstId] || 0) + needed;
          }
        } else if (options.length > 0 && grp.min_select > 0) {
          // Si no hay default_selected, pre-seleccionar la primera opción con las unidades requeridas
          const firstId = options[0].product_id;
          initial[grp.id][firstId] = Math.min(grp.min_select, grp.max_select);
        }
      });
    }
    return initial;
  });

  const [quantity, setQuantity] = useState(1);
  const [addedFeedback, setAddedFeedback] = useState(false);

  // Obtener el total de unidades seleccionadas en un grupo específico
  const getGroupTotalUnits = (groupId: string): number => {
    const grpMap = selections[groupId] || {};
    return Object.values(grpMap).reduce((acc, val) => acc + (val || 0), 0);
  };

  // Obtener la cantidad de un producto específico en un grupo
  const getOptionQty = (groupId: string, productId: string): number => {
    return selections[groupId]?.[productId] || 0;
  };

  // Incrementar cantidad de un producto dentro de un grupo
  const handleIncrementOption = (groupId: string, productId: string, maxSelect: number) => {
    const currentTotal = getGroupTotalUnits(groupId);
    if (currentTotal >= maxSelect) return;

    setSelections((prev) => {
      const groupMap = { ...(prev[groupId] || {}) };
      groupMap[productId] = (groupMap[productId] || 0) + 1;
      return { ...prev, [groupId]: groupMap };
    });
  };

  // Decrementar cantidad de un producto dentro de un grupo
  const handleDecrementOption = (groupId: string, productId: string) => {
    setSelections((prev) => {
      const groupMap = { ...(prev[groupId] || {}) };
      const current = groupMap[productId] || 0;
      if (current <= 1) {
        delete groupMap[productId];
      } else {
        groupMap[productId] = current - 1;
      }
      return { ...prev, [groupId]: groupMap };
    });
  };

  // Seleccionar producto exclusivo (modo radio cuando maxSelect === 1)
  const handleSelectRadio = (groupId: string, productId: string) => {
    setSelections((prev) => ({
      ...prev,
      [groupId]: { [productId]: 1 },
    }));
  };

  // Calcular la suma de suplementos unitarios de las opciones seleccionadas
  const optionsSupplementPerPack = useMemo(() => {
    if (pack.pack_type !== 'configurable' || !pack.groups) return 0;
    let totalSupp = 0;
    pack.groups.forEach((grp) => {
      const grpSelections = selections[grp.id] || {};
      (grp.options || []).forEach((opt) => {
        const count = grpSelections[opt.product_id] || 0;
        const supp = Number(opt.price_supplement || 0);
        if (count > 0 && supp > 0) {
          totalSupp += supp * count;
        }
      });
    });
    return Math.round(totalSupp * 100) / 100;
  }, [pack, selections]);

  // Precio final por pack y precio total
  const unitPackPrice = Math.round((Number(pack.price) + optionsSupplementPerPack) * 100) / 100;
  const totalPackPrice = Math.round((unitPackPrice * quantity) * 100) / 100;

  // Validar si todos los grupos cumplen min_select y max_select en número total de unidades
  const validationErrors = useMemo(() => {
    if (pack.pack_type !== 'configurable' || !pack.groups) return [];
    const errors: string[] = [];
    pack.groups.forEach((grp) => {
      const totalUnits = getGroupTotalUnits(grp.id);
      if (totalUnits < grp.min_select) {
        const remaining = grp.min_select - totalUnits;
        errors.push(
          `"${grp.name}": te falta seleccionar ${remaining} unidad${remaining > 1 ? 'es' : ''} (mínimo: ${grp.min_select}).`
        );
      }
      if (totalUnits > grp.max_select) {
        errors.push(
          `"${grp.name}": has seleccionado ${totalUnits} unidades (máximo: ${grp.max_select}).`
        );
      }
    });
    return errors;
  }, [pack, selections]);

  const isValid = validationErrors.length === 0;

  // Añadir al carrito con selecciones detalladas y cantidades
  const handleAddToCart = () => {
    if (!isValid) return;

    const packSelections: CartPackSelection[] = [];
    if (pack.pack_type === 'configurable' && pack.groups) {
      pack.groups.forEach((grp) => {
        const grpSelections = selections[grp.id] || {};
        (grp.options || []).forEach((opt) => {
          const optQty = grpSelections[opt.product_id] || 0;
          if (optQty > 0) {
            const prod = getProductById(opt.product_id);
            packSelections.push({
              groupId: grp.id,
              groupName: grp.name,
              productId: opt.product_id,
              productName: prod?.name || opt.product?.name || opt.product_id,
              priceSupplement: Number(opt.price_supplement || 0),
              quantity: optQty,
            });
          }
        });
      });
    }

    addPackToCart(pack, packSelections, quantity);
    setAddedFeedback(true);
    setTimeout(() => {
      onClose();
    }, 450);
  };

  const savings =
    pack.reference_price && pack.reference_price > pack.price
      ? pack.reference_price - pack.price
      : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in"
    >
      <div className="bg-ya-black border-2 border-ya-lime w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Modal */}
        <div className="flex justify-between items-start p-5 border-b-2 border-ya-gray bg-ya-gray/30">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-ya-lime text-ya-black text-xs font-black uppercase px-2 py-0.5 tracking-wider">
                {pack.pack_type === 'configurable' ? 'PACK PERSONALIZABLE' : 'PACK CERRADO'}
              </span>
              {savings > 0 && (
                <span className="text-xs font-black text-ya-lime">
                  Ahorras {euro(savings)}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white mt-1.5">{pack.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 border border-ya-gray hover:border-ya-lime transition-colors"
            aria-label="Cerrar modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 text-sm font-medium">
          {/* Descripción & Precios */}
          <div className="flex gap-4 items-start">
            <div className="w-20 h-20 shrink-0 bg-ya-gray border-2 border-ya-lime/40 grid place-items-center overflow-hidden">
              {isRealImageUrl(pack.image) ? (
                <img
                  src={formatImageUrl(pack.image, 200)}
                  alt={pack.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-4xl">{pack.image || '📦'}</span>
              )}
            </div>
            <div className="flex-1">
              <p className="text-gray-300 text-xs leading-relaxed">{pack.description}</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-black text-ya-lime">{euro(unitPackPrice)}</span>
                {pack.reference_price && pack.reference_price > pack.price && (
                  <span className="text-xs text-gray-400 line-through">
                    {euro(pack.reference_price + optionsSupplementPerPack)}
                  </span>
                )}
                {optionsSupplementPerPack > 0 && (
                  <span className="text-[11px] font-mono text-amber-300 bg-amber-950/40 px-2 py-0.5 border border-amber-500/40">
                    Incluye +{euro(optionsSupplementPerPack)} de suplementos
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Si es pack cerrado: Detalle de artículos incluidos */}
          {pack.pack_type === 'fixed' && pack.items && pack.items.length > 0 && (
            <div className="border-2 border-ya-gray p-4 bg-ya-gray/20">
              <h3 className="font-black text-xs uppercase tracking-wider text-gray-300 mb-3 flex items-center gap-1.5">
                <Package size={14} className="text-ya-lime" /> Artículos incluidos en este pack:
              </h3>
              <div className="space-y-2">
                {pack.items.map((item) => {
                  const prod = getProductById(item.product_id);
                  return (
                    <div
                      key={item.id}
                      className="flex justify-between items-center text-xs font-bold py-1.5 border-b border-ya-gray/50 last:border-0"
                    >
                      <div className="flex items-center gap-2 text-white">
                        <span className="text-ya-lime font-black">{item.quantity}x</span>
                        <span>{prod?.name || item.product?.name || item.product_id}</span>
                      </div>
                      <span className="text-gray-400 font-mono">
                        {prod ? euro(prod.price * item.quantity) : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Si es pack configurable: Grupos de selección con cantidades y suplementos unitarios */}
          {pack.pack_type === 'configurable' && pack.groups && (
            <div className="space-y-5">
              {pack.groups.map((group) => {
                const totalUnits = getGroupTotalUnits(group.id);
                const isSatisfied =
                  totalUnits >= group.min_select && totalUnits <= group.max_select;
                const isSingleSelect = group.max_select === 1;

                return (
                  <div
                    key={group.id}
                    className={`border-2 p-4 transition-colors ${
                      isSatisfied ? 'border-ya-gray bg-ya-gray/20' : 'border-amber-400/70 bg-amber-950/20'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-black text-sm uppercase text-white flex items-center gap-1.5">
                          {isSatisfied && <Check size={14} className="text-ya-lime" />}
                          {group.name}
                        </h4>
                        {group.description && (
                          <p className="text-[11px] text-gray-400 mt-0.5">{group.description}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-ya-black border border-ya-gray text-gray-300">
                          {group.min_select === group.max_select
                            ? `Elige ${group.min_select} ud${group.min_select > 1 ? 's' : ''}`
                            : `Elige ${group.min_select}-${group.max_select} uds`}
                        </span>
                        <div className="text-[10px] font-mono text-gray-400 mt-1">
                          Seleccionadas:{' '}
                          <span className={isSatisfied ? 'text-ya-lime font-bold' : 'text-amber-400 font-bold'}>
                            {totalUnits}/{group.max_select}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Opciones del grupo */}
                    <div className="space-y-2 mt-3">
                      {(group.options || []).map((opt) => {
                        const prod = getProductById(opt.product_id);
                        const optQty = getOptionQty(group.id, opt.product_id);
                        const isSelected = optQty > 0;
                        const unitSupplement = Number(opt.price_supplement || 0);

                        // Si es modo single select (max_select === 1)
                        if (isSingleSelect) {
                          return (
                            <div
                              key={opt.id}
                              onClick={() => handleSelectRadio(group.id, opt.product_id)}
                              className={`flex items-center justify-between p-2.5 border cursor-pointer select-none transition-colors ${
                                isSelected
                                  ? 'border-ya-lime bg-ya-lime/10 text-white'
                                  : 'border-ya-gray bg-ya-black text-gray-300 hover:border-gray-500'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                    isSelected ? 'border-ya-lime bg-ya-lime text-ya-black' : 'border-gray-500'
                                  }`}
                                >
                                  {isSelected && <div className="w-2 h-2 rounded-full bg-ya-black" />}
                                </div>
                                <span className="text-xs font-bold truncate">
                                  {prod?.name || opt.product?.name || opt.product_id}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {unitSupplement > 0 ? (
                                  <span className="text-[11px] font-bold text-amber-300 bg-amber-950/60 px-2 py-0.5 border border-amber-500/40">
                                    +{euro(unitSupplement)} / ud
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-gray-500 font-mono">
                                    Incluido
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // Modo selección múltiple con cantidades (permite repetir unidades de una misma opción)
                        return (
                          <div
                            key={opt.id}
                            className={`flex items-center justify-between p-2.5 border select-none transition-colors ${
                              isSelected
                                ? 'border-ya-lime bg-ya-lime/10 text-white'
                                : 'border-ya-gray bg-ya-black text-gray-300'
                            }`}
                          >
                            <div
                              className="flex-1 min-w-0 cursor-pointer pr-2"
                              onClick={() => {
                                if (optQty === 0 && totalUnits < group.max_select) {
                                  handleIncrementOption(group.id, opt.product_id, group.max_select);
                                }
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold truncate">
                                  {prod?.name || opt.product?.name || opt.product_id}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {unitSupplement > 0 ? (
                                  <span className="text-[10px] font-bold text-amber-300">
                                    +{euro(unitSupplement)} por ud
                                    {optQty > 1 && ` (total: +${euro(unitSupplement * optQty)})`}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-gray-500 font-mono">
                                    Incluido en base
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Selector de cantidad para esta opción */}
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                disabled={optQty === 0}
                                onClick={() => handleDecrementOption(group.id, opt.product_id)}
                                className="w-7 h-7 bg-ya-gray hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-ya-gray text-white flex items-center justify-center font-black border border-ya-gray transition-colors"
                                aria-label={`Restar ${prod?.name || opt.product_id}`}
                              >
                                <Minus size={12} strokeWidth={3} />
                              </button>

                              <span
                                className={`w-6 text-center font-mono font-black text-xs ${
                                  optQty > 0 ? 'text-ya-lime' : 'text-gray-500'
                                }`}
                              >
                                {optQty}
                              </span>

                              <button
                                type="button"
                                disabled={totalUnits >= group.max_select}
                                onClick={() => handleIncrementOption(group.id, opt.product_id, group.max_select)}
                                className="w-7 h-7 bg-ya-lime hover:bg-white disabled:opacity-30 disabled:hover:bg-ya-lime text-ya-black flex items-center justify-center font-black transition-colors"
                                aria-label={`Sumar ${prod?.name || opt.product_id}`}
                              >
                                <Plus size={12} strokeWidth={3} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Errores de validación */}
          {validationErrors.length > 0 && (
            <div className="p-3 border-2 border-amber-400 bg-amber-950/30 text-amber-200 text-xs space-y-1 font-bold">
              <div className="flex items-center gap-1.5 text-amber-300 font-black">
                <AlertCircle size={14} /> Selecciones incompletas:
              </div>
              {validationErrors.map((err, i) => (
                <p key={i}>• {err}</p>
              ))}
            </div>
          )}
        </div>

        {/* Footer Modal con selector de cantidad del pack completo y botón brutalista */}
        <div className="p-4 border-t-2 border-ya-gray bg-ya-gray/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 border-2 border-ya-gray bg-ya-black px-2 py-1">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="px-2 py-1 font-black text-gray-400 hover:text-white transition-colors"
              aria-label="Restar pack"
            >
              -
            </button>
            <span className="font-black text-sm w-6 text-center">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="px-2 py-1 font-black text-gray-400 hover:text-white transition-colors"
              aria-label="Sumar pack"
            >
              +
            </button>
          </div>

          <button
            type="button"
            disabled={!isValid || addedFeedback}
            onClick={handleAddToCart}
            className={`flex-1 font-black py-3.5 px-4 text-xs sm:text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
              addedFeedback
                ? 'bg-white text-ya-black'
                : isValid
                ? 'bg-ya-lime text-ya-black hover:bg-white'
                : 'bg-ya-gray text-gray-500 cursor-not-allowed border border-ya-gray'
            }`}
          >
            {addedFeedback ? (
              <>
                <Check size={16} /> ¡AÑADIDO AL CARRITO!
              </>
            ) : (
              <>
                <Sparkles size={16} /> AÑADIR PACK · {euro(totalPackPrice)}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
