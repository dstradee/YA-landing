// ==============================================================================
// YA - MODAL DE GESTIÓN DE 1 A 5 IMÁGENES (CLOUDINARY GRATUITO)
// Archivo: src/components/ImageManagerModal.tsx
// ==============================================================================

import React, { useState } from 'react';
import {
  X,
  Upload,
  Trash2,
  Star,
  ChevronLeft,
  ChevronRight,
  Link2,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Settings,
  Loader2,
} from 'lucide-react';
import {
  type ManagedImage,
  uploadToCloudinary,
  getCloudinaryConfig,
  saveCloudinaryConfig,
} from '../lib/cloudinary';

interface ImageManagerModalProps {
  isOpen: boolean;
  title: string;
  initialImages: ManagedImage[];
  onClose: () => void;
  onSave: (images: ManagedImage[], primaryUrl: string) => void;
}

export function ImageManagerModal({
  isOpen,
  title,
  initialImages,
  onClose,
  onSave,
}: ImageManagerModalProps) {
  const [images, setImages] = useState<ManagedImage[]>(() => [...initialImages]);
  const [urlInput, setUrlInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  // Cloudinary settings
  const [cloudName, setCloudName] = useState(() => getCloudinaryConfig().cloudName);
  const [uploadPreset, setUploadPreset] = useState(() => getCloudinaryConfig().uploadPreset);

  if (!isOpen) return null;

  const handleSaveConfig = () => {
    saveCloudinaryConfig({ cloudName, uploadPreset });
    setShowConfig(false);
    setSuccessMsg('Configuración de Cloudinary guardada en este navegador.');
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (images.length >= 5) {
      setErrorMsg('Límite alcanzado: máximo 5 imágenes por producto o pack.');
      return;
    }

    const file = files[0];
    setUploading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await uploadToCloudinary(file, { cloudName, uploadPreset });
      const newImages = [...images];
      const isFirst = newImages.length === 0;
      newImages.push({
        url: res.url,
        is_primary: isFirst,
      });
      setImages(newImages);
      setSuccessMsg('¡Imagen subida exitosamente a Cloudinary!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al subir imagen a Cloudinary.');
    } finally {
      setUploading(false);
      // reset file input
      e.target.value = '';
    }
  };

  const handleAddUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    if (images.length >= 5) {
      setErrorMsg('Límite alcanzado: máximo 5 imágenes por producto o pack.');
      return;
    }

    const isFirst = images.length === 0;
    setImages([...images, { url: trimmed, is_primary: isFirst }]);
    setUrlInput('');
    setErrorMsg(null);
  };

  const handleDelete = (index: number) => {
    const isRemovingPrimary = images[index]?.is_primary;
    const next = images.filter((_, i) => i !== index);

    if (isRemovingPrimary && next.length > 0) {
      next[0].is_primary = true;
    }
    setImages(next);
  };

  const handleSetPrimary = (index: number) => {
    const next = images.map((img, i) => ({
      ...img,
      is_primary: i === index,
    }));
    setImages(next);
  };

  const handleMove = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= images.length) return;
    const next = [...images];
    const item = next.splice(fromIndex, 1)[0];
    next.splice(toIndex, 0, item);
    setImages(next);
  };

  const handleApply = () => {
    if (images.length === 0) {
      onSave([], '');
      onClose();
      return;
    }

    const primary = images.find((i) => i.is_primary) || images[0];
    onSave(images, primary.url);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-ya-black border-4 border-ya-gray w-full max-w-2xl max-h-[90vh] overflow-y-auto text-white flex flex-col">
        {/* Header */}
        <div className="p-5 border-b-2 border-ya-gray flex items-center justify-between sticky top-0 bg-ya-black z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-ya-gray text-ya-lime border border-ya-lime/30">
              <ImageIcon size={20} />
            </div>
            <div>
              <h2 className="font-black text-lg uppercase tracking-tight">{title}</h2>
              <p className="text-xs text-gray-400 font-mono">
                Gestión de 1 a 5 imágenes con Cloudinary (opción gratuita)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white border border-ya-gray hover:border-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6 flex-1">
          {/* Notifications */}
          {errorMsg && (
            <div className="p-3 bg-red-950/60 border-2 border-red-500 text-red-200 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-ya-lime/10 border-2 border-ya-lime text-ya-lime text-xs flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Cloudinary config toggle */}
          <div className="border-2 border-ya-gray bg-ya-gray/30 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <Settings size={15} className="text-ya-lime" />
              <span className="font-bold text-gray-300">
                Cloudinary: <span className="text-white font-mono">{cloudName || 'no configurado'}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="text-[11px] font-mono text-ya-lime hover:underline uppercase tracking-wider"
            >
              {showConfig ? 'Ocultar ajustes' : 'Configurar Cloudinary'}
            </button>
          </div>

          {showConfig && (
            <div className="p-4 border-2 border-ya-lime/50 bg-ya-black space-y-3 text-xs">
              <h4 className="font-black uppercase tracking-wider text-ya-lime">
                Ajustes Cloudinary Gratuito
              </h4>
              <p className="text-gray-400 text-[11px] leading-relaxed">
                Utiliza tu cuenta 100% gratuita de Cloudinary. Crea un{' '}
                <strong className="text-white">Upload Preset de tipo Unsigned</strong> en la consola de
                Cloudinary (Settings &gt; Upload &gt; Upload presets) para permitir subidas seguras
                directas sin servidor de pago.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-gray-400 mb-1">
                    Cloud Name
                  </label>
                  <input
                    type="text"
                    value={cloudName}
                    onChange={(e) => setCloudName(e.target.value)}
                    placeholder="ej. mi-empresa"
                    className="w-full bg-ya-gray border border-ya-gray p-2 text-white font-mono text-xs focus:outline-none focus:border-ya-lime"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-gray-400 mb-1">
                    Upload Preset (Unsigned)
                  </label>
                  <input
                    type="text"
                    value={uploadPreset}
                    onChange={(e) => setUploadPreset(e.target.value)}
                    placeholder="ej. ya_uploads"
                    className="w-full bg-ya-gray border border-ya-gray p-2 text-white font-mono text-xs focus:outline-none focus:border-ya-lime"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="px-3 py-1.5 bg-ya-lime text-ya-black font-black uppercase text-xs hover:bg-white transition-colors"
                >
                  Guardar Configuración
                </button>
              </div>
            </div>
          )}

          {/* Subir archivo a Cloudinary o URL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Opción A: Subir imagen */}
            <label
              className={`border-2 border-dashed p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                images.length >= 5
                  ? 'border-gray-600 bg-gray-900/40 opacity-50 cursor-not-allowed'
                  : 'border-ya-lime/50 bg-ya-lime/5 hover:border-ya-lime hover:bg-ya-lime/10'
              }`}
            >
              <input
                type="file"
                accept="image/*"
                disabled={uploading || images.length >= 5}
                onChange={handleFileUpload}
                className="hidden"
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 size={24} className="animate-spin text-ya-lime" />
                  <span className="text-xs font-mono text-ya-lime">Subiendo a Cloudinary...</span>
                </div>
              ) : (
                <>
                  <Upload size={24} className="text-ya-lime mb-2" />
                  <span className="text-xs font-black uppercase tracking-wider text-white">
                    Subir a Cloudinary (Gratis)
                  </span>
                  <span className="text-[10px] text-gray-400 mt-1">
                    JPG, PNG o WEBP (máx. 5 MB)
                  </span>
                </>
              )}
            </label>

            {/* Opción B: Pegar URL */}
            <div className="border-2 border-ya-gray bg-ya-gray/20 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-black uppercase text-gray-300 mb-2">
                  <Link2 size={14} className="text-ya-lime" />
                  <span>O añade mediante URL</span>
                </div>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://res.cloudinary.com/..."
                  disabled={images.length >= 5}
                  className="w-full bg-ya-gray border border-ya-gray p-2 text-white font-mono text-xs focus:outline-none focus:border-ya-lime"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddUrl();
                    }
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleAddUrl}
                disabled={images.length >= 5 || !urlInput.trim()}
                className="mt-2 w-full py-1.5 border border-ya-lime text-ya-lime font-black uppercase text-xs hover:bg-ya-lime hover:text-ya-black transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ya-lime"
              >
                Añadir URL
              </button>
            </div>
          </div>

          {/* Listado de imágenes (1 a 5) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-xs uppercase tracking-wider text-gray-400">
                Imágenes configuradas: <strong className="text-white">{images.length}/5</strong>
              </span>
              <span className="text-[11px] text-gray-400">
                ⭐ La imagen principal se mostrará en el catálogo y miniaturas
              </span>
            </div>

            {images.length === 0 ? (
              <div className="p-8 border-2 border-ya-gray text-center text-gray-500 text-xs">
                No hay imágenes configuradas aún. Sube un archivo a Cloudinary o pega un enlace.
              </div>
            ) : (
              <div className="space-y-2.5">
                {images.map((img, idx) => (
                  <div
                    key={img.url + idx}
                    className={`flex items-center justify-between p-2.5 border-2 transition-colors ${
                      img.is_primary
                        ? 'border-ya-lime bg-ya-lime/10'
                        : 'border-ya-gray bg-ya-gray/30 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative w-14 h-14 bg-black border border-ya-gray flex items-center justify-center shrink-0 overflow-hidden">
                        <img
                          src={img.url}
                          alt={`Foto ${idx + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        {img.is_primary && (
                          <div className="absolute top-0 right-0 bg-ya-lime text-ya-black p-0.5" title="Principal">
                            <Star size={10} fill="currentColor" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-gray-300">
                            #{idx + 1}
                          </span>
                          {img.is_primary ? (
                            <span className="bg-ya-lime text-ya-black text-[9px] font-black uppercase px-1.5 py-0.5">
                              PRINCIPAL
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetPrimary(idx)}
                              className="text-[10px] text-gray-400 hover:text-ya-lime flex items-center gap-1 font-mono hover:underline"
                            >
                              <Star size={11} />
                              Hacer principal
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 truncate max-w-xs font-mono mt-0.5">
                          {img.url}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMove(idx, idx - 1)}
                        className="p-1.5 text-gray-400 hover:text-white disabled:opacity-20 border border-transparent hover:border-ya-gray"
                        title="Mover arriba/antes"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        type="button"
                        disabled={idx === images.length - 1}
                        onClick={() => handleMove(idx, idx + 1)}
                        className="p-1.5 text-gray-400 hover:text-white disabled:opacity-20 border border-transparent hover:border-ya-gray"
                        title="Mover abajo/después"
                      >
                        <ChevronRight size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(idx)}
                        className="p-1.5 text-red-400 hover:text-red-200 border border-transparent hover:border-red-500 ml-1"
                        title="Eliminar imagen"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-ya-gray flex items-center justify-end gap-3 bg-ya-black sticky bottom-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border-2 border-ya-gray text-gray-300 font-black uppercase text-xs hover:text-white hover:border-white transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 bg-ya-lime text-ya-black font-black uppercase text-xs hover:bg-white transition-colors flex items-center gap-2"
          >
            <CheckCircle2 size={15} />
            <span>Guardar Galería ({images.length})</span>
          </button>
        </div>
      </div>
    </div>
  );
}
