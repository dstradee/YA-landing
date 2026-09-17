// ==============================================================================
// YA DELIVERY — GESTOR DE GALERÍA DE IMÁGENES (1 A 5 IMÁGENES)
// Archivo: src/components/admin/ImageGalleryManager.tsx
// Integración con Cloudinary Upload Widget oficial, reordenación y selección principal
// ==============================================================================

import { useState } from 'react';
import {
  Upload,
  Trash2,
  Star,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Image as ImageIcon,
  AlertCircle,
  Link as LinkIcon,
  Smartphone,
} from 'lucide-react';
import {
  openCloudinaryUploadWidget,
  isRealImageUrl,
  formatImageUrl,
  getCloudinaryConfig,
} from '../../lib/cloudinary';

interface ImageGalleryManagerProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
  label?: string;
  productName?: string;
  productPrice?: number | string;
  productCategory?: string;
}

export function ImageGalleryManager({
  images = [],
  onChange,
  maxImages = 5,
  label = 'Imágenes (1 a 5 con Cloudinary)',
  productName = 'Producto de ejemplo',
  productPrice = 2.5,
  productCategory = 'Bebidas',
}: ImageGalleryManagerProps) {
  const [openingWidget, setOpeningWidget] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [previewTab, setPreviewTab] = useState<'card' | 'detail'>('card');

  // Apertura del Cloudinary Upload Widget oficial
  const handleOpenCloudinary = async () => {
    if (images.length >= maxImages) {
      setUploadError(`Límite alcanzado: máximo ${maxImages} imágenes permitidas.`);
      return;
    }

    setUploadError(null);
    setOpeningWidget(true);

    try {
      await openCloudinaryUploadWidget({
        folder: 'ya_delivery',
        maxFiles: maxImages - images.length,
        onSuccess: (secureUrl) => {
          setOpeningWidget(false);
          setUploadError(null);

          // Asegurar que guardamos una URL HTTPS REAL y optimizada
          const finalUrl = formatImageUrl(secureUrl);
          if (finalUrl) {
            onChange([...images, finalUrl]);
          }
        },
        onError: (errMsg) => {
          setOpeningWidget(false);
          setUploadError(errMsg);
        },
      });
    } catch (err: any) {
      setOpeningWidget(false);
      setUploadError(err?.message || 'Error abriendo el widget de Cloudinary');
    } finally {
      setOpeningWidget(false);
    }
  };

  // Añadir URL manual
  const handleAddManualUrl = () => {
    const trimmed = manualUrl.trim();
    if (!trimmed) return;
    if (images.length >= maxImages) {
      setUploadError(`Límite alcanzado: máximo ${maxImages} imágenes permitidas.`);
      return;
    }

    const formatted = formatImageUrl(trimmed);
    onChange([...images, formatted]);
    setManualUrl('');
    setShowManualInput(false);
    setUploadError(null);
  };

  const handleRemove = (index: number) => {
    const updated = images.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleSetMain = (index: number) => {
    if (index === 0) return;
    const target = images[index];
    const rest = images.filter((_, i) => i !== index);
    onChange([target, ...rest]);
  };

  const handleMove = (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;

    const next = [...images];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    onChange(next);
  };

  const config = getCloudinaryConfig();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-black uppercase tracking-wider text-gray-300 flex items-center gap-2">
          <ImageIcon size={14} className="text-ya-lime" />
          <span>{label}</span>
          <span className="text-[10px] font-mono px-2 py-0.5 border border-ya-gray bg-ya-black text-ya-lime">
            {images.length} / {maxImages}
          </span>
        </label>

        {images.length < maxImages && (
          <button
            type="button"
            onClick={() => setShowManualInput(!showManualInput)}
            className="text-[11px] font-mono text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
          >
            <LinkIcon size={12} />
            {showManualInput ? 'Cancelar URL' : '+ Pegar URL'}
          </button>
        )}
      </div>

      {/* Indicación clara para el administrador */}
      <div className="bg-zinc-900/90 border border-zinc-700 p-3 rounded-none flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-ya-lime text-ya-black text-[10px] font-black uppercase px-2 py-0.5 tracking-wider">
              Recomendado: 1000 × 1000 px
            </span>
            <span className="text-[10px] font-mono text-zinc-300">
              Proporción 1:1 · JPG, PNG o WebP
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-snug">
            Sube imágenes cuadradas con el producto centrado. En la app móvil se encuadran en modo completo (<span className="text-ya-lime font-mono">object-contain</span>) para que nunca se corten ni se desplacen.
          </p>
        </div>
        {images.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`px-3 py-1.5 border text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0 transition-colors ${
              showPreview
                ? 'bg-ya-lime text-ya-black border-ya-lime'
                : 'bg-zinc-800 text-zinc-200 border-zinc-600 hover:border-ya-lime'
            }`}
          >
            <Smartphone size={13} />
            <span>{showPreview ? 'Ocultar Previa Móvil' : 'Ver Previa Móvil'}</span>
          </button>
        )}
      </div>

      {uploadError && (
        <div className="p-2.5 border border-rose-500/80 bg-rose-950/40 text-rose-300 text-xs flex items-start gap-2 font-medium">
          <AlertCircle size={16} className="shrink-0 text-rose-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">{uploadError}</p>
            {!config.isCustomConfigured && (
              <p className="text-[11px] text-gray-300 font-normal">
                Nota: Recuerda configurar las variables <code>VITE_CLOUDINARY_CLOUD_NAME</code> y <code>VITE_CLOUDINARY_UPLOAD_PRESET</code> en Vercel con tu cuenta de Cloudinary (unsigned preset).
              </p>
            )}
          </div>
        </div>
      )}

      {/* Manual URL Input */}
      {showManualInput && images.length < maxImages && (
        <div className="flex gap-2">
          <input
            type="url"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://res.cloudinary.com/... o https://..."
            className="flex-1 bg-ya-black border-2 border-ya-gray focus:border-ya-lime px-3 py-1.5 text-xs text-white font-mono outline-none"
          />
          <button
            type="button"
            onClick={handleAddManualUrl}
            className="px-3 py-1.5 bg-ya-lime text-ya-black text-xs font-black uppercase hover:bg-white transition-colors"
          >
            Añadir
          </button>
        </div>
      )}

      {/* Image Grid / Carousel */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {images.map((imgUrl, index) => {
          const isMain = index === 0;
          const isImg = isRealImageUrl(imgUrl);
          const displayUrl = formatImageUrl(imgUrl, 300);

          return (
            <div
              key={`${imgUrl}-${index}`}
              className={`relative group border-2 ${
                isMain ? 'border-ya-lime bg-ya-lime/5' : 'border-ya-gray bg-ya-black'
              } p-2 flex flex-col justify-between transition-all`}
            >
              {/* Badge Principal */}
              {isMain && (
                <div className="absolute -top-2.5 left-2 bg-ya-lime text-ya-black text-[9px] font-black uppercase px-2 py-0.5 tracking-wider shadow flex items-center gap-1 z-10">
                  <Star size={10} className="fill-ya-black" />
                  Principal
                </div>
              )}

              {/* Thumbnail con imagen real garantizada */}
              <div className="w-full aspect-square bg-zinc-950 border border-ya-gray overflow-hidden flex items-center justify-center my-1 relative p-1">
                {isImg ? (
                  <img
                    src={displayUrl}
                    alt={`Foto ${index + 1}`}
                    className="w-full h-full object-contain object-center"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      // Si la URL falla al cargar, mostrar icono de respaldo en vez de romper la UI
                      e.currentTarget.style.opacity = '0.3';
                    }}
                  />
                ) : (
                  <span className="text-3xl">{imgUrl}</span>
                )}
              </div>

              {/* Actions Toolbar */}
              <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-ya-gray/60 mt-1">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => handleMove(index, 'left')}
                    title="Mover a la izquierda"
                    className="p-1 text-gray-400 hover:text-white disabled:opacity-20 disabled:hover:text-gray-400"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={index === images.length - 1}
                    onClick={() => handleMove(index, 'right')}
                    title="Mover a la derecha"
                    className="p-1 text-gray-400 hover:text-white disabled:opacity-20 disabled:hover:text-gray-400"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>

                <div className="flex items-center gap-0.5">
                  {!isMain && (
                    <button
                      type="button"
                      onClick={() => handleSetMain(index)}
                      title="Marcar como imagen principal"
                      className="p-1 text-gray-400 hover:text-ya-lime transition-colors"
                    >
                      <Star size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(index)}
                    title="Eliminar imagen"
                    className="p-1 text-gray-400 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Upload Button Box con Cloudinary Upload Widget Oficial */}
        {images.length < maxImages && (
          <div
            className={`aspect-square border-2 border-dashed ${
              openingWidget ? 'border-ya-lime bg-ya-lime/5' : 'border-ya-gray bg-ya-black hover:border-ya-lime/60'
            } flex flex-col items-center justify-center p-2 text-center transition-colors`}
          >
            {openingWidget ? (
              <div className="flex flex-col items-center gap-2 text-ya-lime p-2">
                <Loader2 size={24} className="animate-spin" />
                <span className="text-[10px] font-mono uppercase tracking-wider">
                  Abriendo Cloudinary...
                </span>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center justify-center gap-2 h-full">
                {/* Botón principal: abre directamente el Upload Widget Oficial de Cloudinary */}
                <button
                  type="button"
                  onClick={handleOpenCloudinary}
                  className="w-full py-2.5 px-2 bg-ya-gray hover:bg-ya-lime hover:text-ya-black text-white text-[10px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 border border-ya-gray hover:border-ya-lime"
                  title="Abrir Cloudinary Upload Widget oficial para subir desde PC, URL o cámara"
                >
                  <Upload size={14} className="text-ya-lime hover:text-ya-black shrink-0" />
                  <span>Subir desde PC</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowManualInput(true)}
                  className="w-full py-1.5 px-1 bg-ya-black hover:bg-ya-gray text-gray-300 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1 border border-ya-gray/50"
                  title="Pegar una URL directa de imagen"
                >
                  <LinkIcon size={11} />
                  <span>Pegar URL</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] font-mono text-gray-400">
        * La primera imagen de la lista se utiliza como portada principal. Puedes añadir hasta {maxImages} fotos por producto o pack.
      </p>

      {/* Simulación en Vivo de Vista Móvil para el Administrador */}
      {images.length > 0 && showPreview && (
        <div className="mt-4 p-4 border-2 border-zinc-700 bg-zinc-950/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-2">
            <div className="flex items-center gap-2">
              <Smartphone size={15} className="text-ya-lime" />
              <h5 className="font-mono text-xs font-black uppercase tracking-wider text-white">
                Simulación en Móvil (320px – 430px)
              </h5>
            </div>
            <div className="flex items-center gap-1 font-mono text-[10px]">
              <button
                type="button"
                onClick={() => setPreviewTab('card')}
                className={`px-2.5 py-1 border transition-colors ${
                  previewTab === 'card'
                    ? 'border-ya-lime bg-ya-lime text-ya-black font-black'
                    : 'border-zinc-700 text-zinc-400 hover:text-white bg-zinc-900'
                }`}
              >
                Tarjeta Catálogo
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('detail')}
                className={`px-2.5 py-1 border transition-colors ${
                  previewTab === 'detail'
                    ? 'border-ya-lime bg-ya-lime text-ya-black font-black'
                    : 'border-zinc-700 text-zinc-400 hover:text-white bg-zinc-900'
                }`}
              >
                Ficha Detalle
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
            {/* Teléfono simulado */}
            <div className="w-full max-w-[280px] bg-black border-2 border-zinc-700 p-3 shadow-xl">
              <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 pb-2 mb-2 border-b border-zinc-800">
                <span>VISTA PREVIA MÓVIL</span>
                <span className="text-ya-lime font-bold">100% COMPLETO</span>
              </div>

              {previewTab === 'card' ? (
                /* Simulación Tarjeta Catálogo */
                <div className="border-2 border-ya-gray bg-ya-black p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono uppercase bg-zinc-900 text-zinc-400 px-1.5 py-0.5 border border-zinc-800">
                      {productCategory}
                    </span>
                    <span className="text-[10px] font-mono text-ya-lime font-bold">
                      {typeof productPrice === 'number' ? `${productPrice.toFixed(2)} €` : `${productPrice} €`}
                    </span>
                  </div>

                  {/* Visual del producto con el mismo encuadre exacto del catálogo */}
                  <div className="h-32 bg-zinc-950 border-2 border-ya-gray/60 flex items-center justify-center p-2 overflow-hidden">
                    {isRealImageUrl(images[0]) ? (
                      <img
                        src={formatImageUrl(images[0], 300)}
                        alt={productName}
                        className="w-full h-full object-contain object-center"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-3xl">{images[0] || '📦'}</span>
                    )}
                  </div>

                  <div>
                    <p className="font-black text-xs uppercase tracking-tight text-white line-clamp-1">
                      {productName}
                    </p>
                    <p className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">
                      Entrega en 10-20 min
                    </p>
                  </div>
                </div>
              ) : (
                /* Simulación Ficha de Detalle */
                <div className="border-2 border-ya-gray bg-ya-black p-3 space-y-2">
                  <div className="aspect-square bg-zinc-950 border-2 border-ya-gray flex items-center justify-center p-3 overflow-hidden">
                    {isRealImageUrl(images[0]) ? (
                      <img
                        src={formatImageUrl(images[0], 400)}
                        alt={productName}
                        className="w-full h-full object-contain object-center"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-4xl">{images[0] || '📦'}</span>
                    )}
                  </div>

                  {/* Miniaturas de galería si hay más de 1 */}
                  {images.length > 1 && (
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {images.map((img, i) => (
                        <div
                          key={i}
                          className={`w-8 h-8 shrink-0 bg-zinc-950 border ${
                            i === 0 ? 'border-ya-lime' : 'border-zinc-800'
                          } flex items-center justify-center p-0.5 overflow-hidden`}
                        >
                          {isRealImageUrl(img) ? (
                            <img
                              src={formatImageUrl(img, 80)}
                              alt=""
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <span className="text-xs">{img}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <span className="text-[9px] font-mono uppercase text-ya-lime">
                      {productCategory}
                    </span>
                    <p className="font-black text-xs uppercase tracking-tight text-white line-clamp-1">
                      {productName}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Checklist de verificación óptica */}
            <div className="space-y-2 text-left max-w-xs font-mono text-[11px]">
              <div className="flex items-start gap-2 text-emerald-400">
                <span className="font-bold">✓</span>
                <span>
                  <strong>Encuadre:</strong> El producto se muestra entero sin recortes forzados en los bordes.
                </span>
              </div>
              <div className="flex items-start gap-2 text-emerald-400">
                <span className="font-bold">✓</span>
                <span>
                  <strong>Posición:</strong> Mantiene la misma alineación óptica entre catálogo y detalle.
                </span>
              </div>
              <div className="flex items-start gap-2 text-emerald-400">
                <span className="font-bold">✓</span>
                <span>
                  <strong>Fondo:</strong> Contenedor <code className="text-ya-lime">zinc-950</code> uniforme para cualquier formato.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
