// ==============================================================================
// YA - MODAL DE CONFIGURACIÓN Y DETALLE DE PACKS (PHASE 3B)
// Archivo: src/app/PackModal.tsx
// ==============================================================================

import { useState, useMemo } from 'react';
import { X, Check, Package, Sparkles, AlertCircle } from 'lucide-react';
import { euro } from '../data/products';
import { useCart } from './CartContext';
import { useCatalog } from './CatalogContext';
import type { PackWithDetails, CartPackSelection } from '../types/app';

interface PackModalProps {
  pack: PackWithDetails;
  onClose: () => void;
}

export function PackModal({ pack, onClose }: PackModalProps) {
  const { addPackToCart } = useCart();
  const { getProductById } = useCatalog();

  // Estado para selecciones de packs configurables: Record<groupId, string[]>
  const [selections, setSelections] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    if (pack.pack_type === 'configurable' && pack.groups) {
      pack.groups.forEach((grp) => {
        const defaultOpts = (grp.options || [])
          .filter((opt) => opt.default_selected)
          .map((opt) => opt.product_id);

        if (defaultOpts.length > 0) {
          initial[grp.id] = defaultOpts.slice(0, grp.max_select);
        } else if (grp.options && grp.options.length > 0 && grp.min_select > 0) {
          initial[grp.id] = [grp.options[0].product_id];
        } else {
          initial[grp.id] = [];
        }
      });
    }
    return initial;
  });

  const [quantity, setQuantity] = useState(1);
  const [addedFeedback, setAddedFeedback] = useState(false);

  // Manejar selección de opción dentro de un grupo
  const handleToggleOption = (groupId: string, productId: string, maxSelect: number) => {
    setSelections((prev) => {
      const current = prev[groupId] || [];
      if (maxSelect === 1) {
        // Modo radio
        return { ...prev, [groupId]: [productId] };
      }
      // Modo múltiple
      if (current.includes(productId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== productId) };
      }
      if (current.length < maxSelect) {
        return { ...prev, [groupId]: [...current, productId] };
      }
      return prev;
    });
  };

  // Validar si todos los grupos cumplen min_select y max_select
  const validationErrors = useMemo(() => {
    if (pack.pack_type !== 'configurable' || !pack.groups) return [];
    const errors: string[] = [];
    pack.groups.forEach((grp) => {
      const count = (selections[grp.id] || []).length;
      if (count < grp.min_select) {
        errors.push(`"${grp.name}": debes seleccionar al menos ${grp.min_select} opción(es).`);
      }
      if (count > grp.max_select) {
        errors.push(`"${grp.name}": máximo ${grp.max_select} opción(es).`);
      }
    });
    return errors;
  }, [pack, selections]);

  const isValid = validationErrors.length === 0;

  // Añadir al carrito
  const handleAddToCart = () => {
    if (!isValid) return;

    let packSelections: CartPackSelection[] = [];
    if (pack.pack_type === 'configurable' && pack.groups) {
      pack.groups.forEach((grp) => {
        const chosenIds = selections[grp.id] || [];
        chosenIds.forEach((pId) => {
          const prod = getProductById(pId);
          packSelections.push({
            groupId: grp.id,
            groupName: grp.name,
            productId: pId,
            productName: prod?.name || pId,
          });
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
    >
      <div className="bg-ya-black border-2 border-ya-lime w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Modal */}
        <div className="flex justify-between items-start p-5 border-b-2 border-ya-gray bg-ya-gray/30">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-ya-lime text-ya-black text-xs font-black uppercase px-2 py-0.5 tracking-wider">
                {pack.pack_type === 'configurable' ? 'PACK CONFIGURABLE' : 'PACK CERRADO'}
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
            className="text-gray-400 hover:text-white p-1 border border-ya-gray hover:border-ya-lime"
            aria-label="Cerrar modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 text-sm font-medium">
          {/* Descripción & Precios */}
          <div className="flex gap-4 items-start">
            <div className="w-20 h-20 shrink-0 bg-ya-gray border-2 border-ya-lime/40 grid place-items-center text-4xl">
              {pack.image || '📦'}
            </div>
            <div>
              <p className="text-gray-300 text-xs leading-relaxed">{pack.description}</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-black text-ya-lime">{euro(pack.price)}</span>
                {pack.reference_price && pack.reference_price > pack.price && (
                  <span className="text-xs text-gray-400 line-through">
                    {euro(pack.reference_price)}
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

          {/* Si es pack configurable: Grupos de selección con min/max */}
          {pack.pack_type === 'configurable' && pack.groups && (
            <div className="space-y-5">
              {pack.groups.map((group) => {
                const chosen = selections[group.id] || [];
                const isSatisfied =
                  chosen.length >= group.min_select && chosen.length <= group.max_select;

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
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-ya-black border border-ya-gray text-gray-300">
                        {group.min_select === group.max_select
                          ? `Elige ${group.min_select}`
                          : `Elige ${group.min_select}-${group.max_select}`}
                      </span>
                    </div>

                    {/* Opciones del grupo */}
                    <div className="space-y-1.5 mt-3">
                      {(group.options || []).map((opt) => {
                        const prod = getProductById(opt.product_id);
                        const isSelected = chosen.includes(opt.product_id);

                        return (
                          <label
                            key={opt.id}
                            className={`flex items-center justify-between p-2.5 border cursor-pointer select-none transition-colors ${
                              isSelected
                                ? 'border-ya-lime bg-ya-lime/10 text-white'
                                : 'border-ya-gray bg-ya-black text-gray-300 hover:border-gray-500'
                            }`}
                            onClick={() =>
                              handleToggleOption(group.id, opt.product_id, group.max_select)
                            }
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-4 h-4 rounded-none border flex items-center justify-center shrink-0 ${
                                  isSelected ? 'border-ya-lime bg-ya-lime text-ya-black' : 'border-gray-500'
                                }`}
                              >
                                {isSelected && <Check size={12} strokeWidth={3} />}
                              </div>
                              <span className="text-xs font-bold truncate">
                                {prod?.name || opt.product?.name || opt.product_id}
                              </span>
                            </div>
                            <span className="text-[11px] text-gray-400 font-mono">
                              {prod ? euro(prod.price) : ''}
                            </span>
                          </label>
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

        {/* Footer Modal con selector de cantidad y botón brutalista */}
        <div className="p-4 border-t-2 border-ya-gray bg-ya-gray/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 border-2 border-ya-gray bg-ya-black px-2 py-1">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="px-2 py-1 font-black text-gray-400 hover:text-white"
            >
              -
            </button>
            <span className="font-black text-sm w-6 text-center">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="px-2 py-1 font-black text-gray-400 hover:text-white"
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
                <Sparkles size={16} /> AÑADIR PACK · {euro(pack.price * quantity)}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
