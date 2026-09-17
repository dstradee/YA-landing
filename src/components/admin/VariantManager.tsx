// ==============================================================================
// YA DELIVERY — GESTOR DE VARIANTES / SUBPRODUCTOS (ADMIN)
// Archivo: src/components/admin/VariantManager.tsx
// Soporta título configurable (Sabores, Colores, Tamaños...)
// Atributos por variante: nombre, precio, stock, activa/inactiva, imagen opcional (Cloudinary)
// Si no tiene imagen propia, hereda la imagen principal del producto.
// ==============================================================================

import { useState } from 'react';
import { Plus, Trash2, Image as ImageIcon, Eye, EyeOff, Loader2 } from 'lucide-react';
import type { ProductVariant } from '../../types/app';
import { openCloudinaryUploadWidget, isRealImageUrl, formatImageUrl } from '../../lib/cloudinary';

interface VariantManagerProps {
  hasVariants: boolean;
  onHasVariantsChange: (has: boolean) => void;
  variantsTitle: string;
  onVariantsTitleChange: (title: string) => void;
  variants: ProductVariant[];
  onVariantsChange: (variants: ProductVariant[]) => void;
  parentMainImage?: string;
  defaultPrice?: string;
}

export function VariantManager({
  hasVariants,
  onHasVariantsChange,
  variantsTitle,
  onVariantsTitleChange,
  variants,
  onVariantsChange,
  parentMainImage,
  defaultPrice = '2.50',
}: VariantManagerProps) {
  const [uploadingVariantId, setUploadingVariantId] = useState<string | null>(null);

  const handleAddVariant = () => {
    const newVariant: ProductVariant = {
      id: `var-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: '',
      price: parseFloat(defaultPrice) || 0,
      stock: 10,
      active: true,
      image: null,
    };
    onVariantsChange([...variants, newVariant]);
  };

  const handleUpdateVariant = (id: string, patch: Partial<ProductVariant>) => {
    onVariantsChange(
      variants.map((v) => (v.id === id ? { ...v, ...patch } : v))
    );
  };

  const handleRemoveVariant = (id: string) => {
    onVariantsChange(variants.filter((v) => v.id !== id));
  };

  const handleUploadVariantImage = async (variantId: string) => {
    setUploadingVariantId(variantId);
    try {
      await openCloudinaryUploadWidget({
        folder: 'ya_delivery/variants',
        maxFiles: 1,
        onSuccess: (secureUrl) => {
          handleUpdateVariant(variantId, { image: secureUrl });
          setUploadingVariantId(null);
        },
        onError: () => {
          setUploadingVariantId(null);
        },
      });
    } catch {
      setUploadingVariantId(null);
    }
  };

  return (
    <div className="border-2 border-ya-gray bg-ya-gray/10 p-4 space-y-4">
      <div className="flex items-center justify-between border-b border-ya-gray pb-3">
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasVariants}
              onChange={(e) => onHasVariantsChange(e.target.checked)}
              className="w-4 h-4 accent-ya-lime cursor-pointer"
            />
            <span className="font-black uppercase tracking-wider text-sm text-white">
              Este producto tiene Variantes / Opciones internas
            </span>
          </label>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Activa sabores, colores, tamaños u opciones con su propio stock, precio e imagen opcional.
          </p>
        </div>

        {hasVariants && (
          <button
            type="button"
            onClick={handleAddVariant}
            className="flex items-center gap-1.5 bg-ya-lime text-ya-black px-3 py-1.5 font-black text-xs uppercase tracking-wider hover:bg-white transition-colors shrink-0"
          >
            <Plus size={14} />
            <span>Añadir Variante</span>
          </button>
        )}
      </div>

      {hasVariants && (
        <div className="space-y-4">
          {/* Título de la sección de variantes configurable */}
          <div className="bg-zinc-900/70 p-3 border border-zinc-700">
            <label className="block uppercase tracking-wider text-gray-300 mb-1 text-[11px] font-bold">
              Título de la sección de variantes (Visible para el cliente) *
            </label>
            <input
              type="text"
              required={hasVariants}
              value={variantsTitle}
              onChange={(e) => onVariantsTitleChange(e.target.value)}
              placeholder="Ej: Sabores, Colores, Tamaños, Opciones..."
              className="w-full bg-ya-black border border-ya-gray focus:border-ya-lime p-2.5 text-white outline-none font-bold text-xs"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[10px] text-gray-400 font-medium">Sugerencias rápidas:</span>
              {['Sabores', 'Colores', 'Tamaños', 'Modelos', 'Formatos'].map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => onVariantsTitleChange(sug)}
                  className="text-[10px] bg-zinc-800 text-zinc-300 hover:text-ya-lime hover:bg-zinc-700 px-2 py-0.5 border border-zinc-700 font-bold"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de variantes */}
          {variants.length === 0 ? (
            <div className="border border-dashed border-zinc-700 p-6 text-center">
              <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">
                No has añadido ninguna variante todavía.
              </p>
              <button
                type="button"
                onClick={handleAddVariant}
                className="mt-2 text-ya-lime text-xs font-black uppercase hover:underline inline-flex items-center gap-1"
              >
                <Plus size={14} /> Añadir primera opción
              </button>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {variants.map((variant) => {
                const effectiveImg = variant.image || parentMainImage;
                const isImg = isRealImageUrl(effectiveImg);
                const isUploading = uploadingVariantId === variant.id;

                return (
                  <div
                    key={variant.id}
                    className={`p-3 border-2 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                      variant.active
                        ? 'bg-zinc-900 border-zinc-700 hover:border-zinc-500'
                        : 'bg-zinc-950/70 border-zinc-800 opacity-60'
                    }`}
                  >
                    {/* Imagen / Subida Cloudinary */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-12 h-12 bg-ya-black border border-zinc-700 grid place-items-center text-xl overflow-hidden relative group">
                        {isImg ? (
                          <img
                            src={formatImageUrl(effectiveImg, 100)}
                            alt={variant.name || 'Variante'}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span>{effectiveImg || '📦'}</span>
                        )}
                        {!variant.image && parentMainImage && (
                          <span className="absolute inset-x-0 bottom-0 bg-zinc-800/90 text-gray-300 text-[8px] font-bold text-center">
                            Heredada
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => handleUploadVariantImage(variant.id)}
                          disabled={isUploading}
                          className="text-[10px] font-bold uppercase bg-zinc-800 text-zinc-300 hover:text-white px-2 py-1 border border-zinc-700 flex items-center gap-1"
                          title="Subir foto propia a Cloudinary"
                        >
                          {isUploading ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <ImageIcon size={11} />
                          )}
                          <span>{variant.image ? 'Cambiar' : 'Foto'}</span>
                        </button>
                        {variant.image && (
                          <button
                            type="button"
                            onClick={() => handleUpdateVariant(variant.id, { image: null })}
                            className="text-[9px] text-red-400 hover:underline text-left"
                            title="Quitar imagen propia y usar la principal del producto"
                          >
                            Heredar
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inputs Nombre, Precio, Stock */}
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                      <div>
                        <label className="block text-[9px] uppercase tracking-wider text-gray-400 mb-0.5 font-bold">
                          Nombre *
                        </label>
                        <input
                          type="text"
                          required
                          value={variant.name}
                          onChange={(e) => handleUpdateVariant(variant.id, { name: e.target.value })}
                          placeholder="Ej: Mango Loco"
                          className="w-full bg-ya-black border border-zinc-700 focus:border-ya-lime p-1.5 text-white outline-none font-bold text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase tracking-wider text-gray-400 mb-0.5 font-bold">
                          Precio (€) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={variant.price}
                          onChange={(e) =>
                            handleUpdateVariant(variant.id, { price: parseFloat(e.target.value) || 0 })
                          }
                          className="w-full bg-ya-black border border-zinc-700 focus:border-ya-lime p-1.5 text-white outline-none font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase tracking-wider text-gray-400 mb-0.5 font-bold">
                          Stock (uds) *
                        </label>
                        <input
                          type="number"
                          required
                          value={variant.stock}
                          onChange={(e) =>
                            handleUpdateVariant(variant.id, { stock: parseInt(e.target.value, 10) || 0 })
                          }
                          className="w-full bg-ya-black border border-zinc-700 focus:border-ya-lime p-1.5 text-white outline-none font-mono text-xs"
                        />
                      </div>
                    </div>

                    {/* Activar/Desactivar & Borrar */}
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleUpdateVariant(variant.id, { active: !variant.active })}
                        className={`p-2 border transition-colors ${
                          variant.active
                            ? 'border-zinc-700 text-ya-lime hover:bg-zinc-800'
                            : 'border-zinc-800 text-gray-500 hover:text-white'
                        }`}
                        title={variant.active ? 'Variante activa' : 'Variante inactiva'}
                      >
                        {variant.active ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveVariant(variant.id)}
                        className="p-2 border border-zinc-700 text-gray-400 hover:text-red-400 hover:border-red-500 transition-colors"
                        title="Eliminar variante"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
