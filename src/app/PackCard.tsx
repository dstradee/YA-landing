// ==============================================================================
// YA - TARJETA DE PACK (PHASE 3B)
// Archivo: src/app/PackCard.tsx
// ==============================================================================

import { useState } from 'react';
import { Package, SlidersHorizontal, Check } from 'lucide-react';
import { euro } from '../data/products';
import { PackModal } from './PackModal';
import { useCart } from './CartContext';
import type { PackWithDetails } from '../types/app';
import { isRealImageUrl, formatImageUrl } from '../lib/cloudinary';

interface PackCardProps {
  pack: PackWithDetails;
}

export function PackCard({ pack }: PackCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [addedDirectly, setAddedDirectly] = useState(false);
  const { addPackToCart } = useCart();

  const savings =
    pack.reference_price && pack.reference_price > pack.price
      ? pack.reference_price - pack.price
      : 0;

  const isConfigurable = pack.pack_type === 'configurable';

  // Si es un pack cerrado, se puede añadir directamente o ver detalle
  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isConfigurable) {
      setModalOpen(true);
    } else {
      addPackToCart(pack, [], 1);
      setAddedDirectly(true);
      setTimeout(() => setAddedDirectly(false), 1200);
    }
  };

  return (
    <>
      <article
        id={`pack-card-${pack.slug || pack.id}`}
        onClick={() => setModalOpen(true)}
        className="border-2 border-ya-gray hover:border-ya-lime bg-ya-gray/30 p-4 flex flex-col justify-between cursor-pointer transition-all duration-150 group relative"
      >
        {/* Badges superiores */}
        <div className="flex justify-between items-start mb-2">
          <span className="bg-ya-lime text-ya-black text-[10px] font-black uppercase px-2 py-0.5 tracking-wider">
            {isConfigurable ? 'CONFIGURABLE' : 'PACK AHORRO'}
          </span>
          {savings > 0 && (
            <span className="bg-ya-black text-ya-lime border border-ya-lime text-[10px] font-black uppercase px-1.5 py-0.5">
              -{euro(savings)}
            </span>
          )}
        </div>

        {/* Visual / Emoji o Imagen Real de Cloudinary */}
        <div className="h-28 my-2 bg-ya-black border-2 border-ya-gray/50 group-hover:border-ya-lime/40 flex items-center justify-center transition-colors overflow-hidden">
          {isRealImageUrl(pack.image) ? (
            <img
              src={formatImageUrl(pack.image, 400)}
              alt={pack.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-5xl">{pack.image || '📦'}</span>
          )}
        </div>

        {/* Nombre y descripción */}
        <div className="flex-1 mt-1">
          <h3 className="font-black text-base uppercase tracking-tight text-white group-hover:text-ya-lime transition-colors line-clamp-1">
            {pack.name}
          </h3>
          <p className="text-gray-400 text-xs mt-1 line-clamp-2 leading-relaxed">
            {pack.description || 'Pack exclusivo con entrega en minutos en Jerez.'}
          </p>
        </div>

        {/* Precios y Botón de acción */}
        <div className="mt-4 pt-3 border-t border-ya-gray/80 flex items-center justify-between gap-2">
          <div>
            <div className="text-xl font-black text-ya-lime">{euro(pack.price)}</div>
            {pack.reference_price && pack.reference_price > pack.price && (
              <div className="text-[10px] text-gray-400 line-through font-mono">
                {euro(pack.reference_price)}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleQuickAdd}
            className={`font-black text-xs uppercase tracking-wider py-2.5 px-3 transition-colors flex items-center gap-1.5 ${
              addedDirectly
                ? 'bg-white text-ya-black'
                : 'bg-ya-lime text-ya-black hover:bg-white'
            }`}
          >
            {addedDirectly ? (
              <>
                <Check size={14} /> ¡AÑADIDO!
              </>
            ) : isConfigurable ? (
              <>
                <SlidersHorizontal size={14} /> ELEGIR
              </>
            ) : (
              <>
                <Package size={14} /> AÑADIR
              </>
            )}
          </button>
        </div>
      </article>

      {modalOpen && <PackModal pack={pack} onClose={() => setModalOpen(false)} />}
    </>
  );
}
