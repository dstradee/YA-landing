// ==============================================================================
// YA DELIVERY — GESTOR DE GALERÍA DE IMÁGENES (1 A 5 IMÁGENES)
// Archivo: src/components/admin/ImageGalleryManager.tsx
// Subida a Cloudinary, eliminación, reordenación y selección de imagen principal
// ==============================================================================

import React, { useState, useRef } from 'react';
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
} from 'lucide-react';
import { uploadImageToCloudinary } from '../../lib/cloudinary';

interface ImageGalleryManagerProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
  label?: string;
}

export function ImageGalleryManager({
  images = [],
  onChange,
  maxImages = 5,
  label = 'Imágenes (1 a 5 con Cloudinary)',
}: ImageGalleryManagerProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (images.length >= maxImages) {
      setUploadError(`Límite alcanzado: máximo ${maxImages} imágenes permitidas.`);
      return;
    }

    setUploading(true);
    setUploadError(null);

    const file = files[0];
    const { url, error } = await uploadImageToCloudinary(file);

    if (error || !url) {
      setUploadError(error || 'Error al procesar la imagen.');
    } else {
      onChange([...images, url]);
    }

    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddManualUrl = () => {
    const trimmed = manualUrl.trim();
    if (!trimmed) return;
    if (images.length >= maxImages) {
      setUploadError(`Límite alcanzado: máximo ${maxImages} imágenes permitidas.`);
      return;
    }
    onChange([...images, trimmed]);
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

      {uploadError && (
        <div className="p-2 border border-rose-500 bg-rose-500/10 text-rose-400 text-xs flex items-center gap-2 font-medium">
          <AlertCircle size={14} className="shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Manual URL Input */}
      {showManualInput && images.length < maxImages && (
        <div className="flex gap-2">
          <input
            type="url"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://res.cloudinary.com/..."
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

              {/* Thumbnail */}
              <div className="w-full aspect-square bg-ya-black border border-ya-gray overflow-hidden flex items-center justify-center my-1">
                {imgUrl.startsWith('http') || imgUrl.startsWith('data:') ? (
                  <img
                    src={imgUrl}
                    alt={`Foto ${index + 1}`}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
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

        {/* Upload Button Box */}
        {images.length < maxImages && (
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`aspect-square border-2 border-dashed ${
              uploading ? 'border-ya-lime bg-ya-lime/5 cursor-wait' : 'border-ya-gray hover:border-ya-lime bg-ya-black cursor-pointer'
            } flex flex-col items-center justify-center p-3 text-center transition-colors`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />

            {uploading ? (
              <div className="flex flex-col items-center gap-2 text-ya-lime">
                <Loader2 size={24} className="animate-spin" />
                <span className="text-[10px] font-mono uppercase tracking-wider">Subiendo...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-gray-400 hover:text-white transition-colors">
                <Upload size={20} className="text-ya-lime" />
                <span className="text-[10px] font-black uppercase tracking-wider">Subir foto</span>
                <span className="text-[9px] font-mono text-gray-500">Cloudinary</span>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] font-mono text-gray-400">
        * La primera imagen de la lista se utiliza como portada principal. Arrastra o usa las flechas para ordenar.
      </p>
    </div>
  );
}
