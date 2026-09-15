// ==============================================================================
// YA - JUEGO DE DROP: CAJAS MISTERIOSAS DE REPARTO
// Archivo: src/components/drops/games/MysteryBoxGame.tsx
// ==============================================================================

import React, { useState } from 'react';
import { Package, Sparkles } from 'lucide-react';
import type { PlayDropResult } from '../../../types/drops';

interface MysteryBoxGameProps {
  isOpening: boolean;
  result: PlayDropResult | null;
  onSelectBox: (boxIndex: number) => void;
  disabled?: boolean;
}

export const MysteryBoxGame: React.FC<MysteryBoxGameProps> = ({
  isOpening,
  result,
  onSelectBox,
  disabled,
}) => {
  const [selectedBox, setSelectedBox] = useState<number | null>(null);

  const handlePick = (idx: number) => {
    if (disabled || isOpening || result) return;
    setSelectedBox(idx);
    onSelectBox(idx);
  };

  return (
    <div className="w-full max-w-md mx-auto bg-ya-gray/40 border-2 border-ya-gray p-6 text-center">
      <div className="text-xs uppercase font-mono tracking-widest text-ya-lime mb-2">
        PAQUETERÍA MISTERIOSA YA
      </div>
      <h3 className="text-xl font-black uppercase tracking-tight text-white mb-2">
        Elige uno de los 3 pedidos
      </h3>
      <p className="text-xs text-gray-400 mb-6">
        Uno de estos paquetes contiene el premio exclusivo de esta semana.
      </p>

      {/* Grid de las 3 cajas */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[0, 1, 2].map((idx) => {
          const isSelected = selectedBox === idx;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => handlePick(idx)}
              disabled={disabled || isOpening || !!result}
              className={`p-4 border-2 flex flex-col items-center justify-center gap-2 transition-all relative ${
                isSelected
                  ? 'border-ya-lime bg-ya-black text-ya-lime scale-105'
                  : 'border-ya-gray bg-ya-black/70 text-gray-300 hover:border-white hover:text-white'
              } ${isOpening && isSelected ? 'animate-pulse' : ''}`}
            >
              <Package size={36} />
              <span className="text-[11px] font-black uppercase font-mono tracking-wider">
                PAQUETE 0{idx + 1}
              </span>
              {isSelected && !result && isOpening && (
                <div className="absolute inset-0 bg-ya-black/80 flex items-center justify-center">
                  <Sparkles size={20} className="animate-spin text-ya-lime" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="text-[11px] text-gray-400 font-mono">
        Toca cualquier paquete para abrirlo al instante.
      </div>
    </div>
  );
};
