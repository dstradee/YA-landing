// ==============================================================================
// YA - JUEGOS DE DROP ADICIONALES: RASCAR, RULETA Y ELEGIR CARTA
// Archivo: src/components/drops/games/ScratchGame.tsx
// ==============================================================================

import React, { useState } from 'react';
import { Sparkles, Zap, Layers } from 'lucide-react';
import type { PlayDropResult } from '../../../types/drops';

// ------------------------------------------------------------------------------
// 1. RASCAR / RASCA Y GANA YA
// ------------------------------------------------------------------------------
export const ScratchGame: React.FC<{
  isScratching: boolean;
  result?: PlayDropResult | null;
  onScratch: () => void;
  disabled?: boolean;
}> = ({ isScratching, onScratch, disabled }) => {
  const [revealed, setRevealed] = useState(false);

  const handleClick = () => {
    if (disabled || isScratching || revealed) return;
    setRevealed(true);
    onScratch();
  };

  return (
    <div className="w-full max-w-md mx-auto bg-ya-gray/40 border-2 border-ya-gray p-6 text-center">
      <div className="text-xs uppercase font-mono tracking-widest text-ya-lime mb-2">
        TARJETA DE RASCADO YA
      </div>
      <h3 className="text-xl font-black uppercase tracking-tight text-white mb-4">
        Despeja la cinta de seguridad
      </h3>

      <div
        onClick={handleClick}
        className={`w-full h-36 border-2 border-dashed border-ya-lime flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden ${
          revealed ? 'bg-ya-black' : 'bg-ya-lime/20 hover:bg-ya-lime/30'
        }`}
      >
        {!revealed ? (
          <>
            <Layers size={36} className="text-ya-lime mb-2" />
            <span className="font-black text-xs uppercase tracking-wider text-white">
              TOCA AQUÍ PARA RASCAR Y REVELAR
            </span>
          </>
        ) : isScratching ? (
          <div className="flex items-center gap-2 text-ya-lime font-mono text-xs uppercase">
            <Sparkles size={18} className="animate-spin" />
            <span>Verificando autenticidad...</span>
          </div>
        ) : (
          <div className="text-xs font-mono uppercase text-gray-300">
            Tarjeta raspada exitosamente
          </div>
        )}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------------
// 2. RULETA URBANA YA
// ------------------------------------------------------------------------------
export const WheelGame: React.FC<{
  isSpinning: boolean;
  result: PlayDropResult | null;
  onSpin: () => void;
  disabled?: boolean;
}> = ({ isSpinning, result, onSpin, disabled }) => {
  return (
    <div className="w-full max-w-md mx-auto bg-ya-gray/40 border-2 border-ya-gray p-6 text-center">
      <div className="text-xs uppercase font-mono tracking-widest text-ya-lime mb-2">
        RULETA URBANA DE BENEFICIOS
      </div>
      <h3 className="text-xl font-black uppercase tracking-tight text-white mb-4">
        Gira la rueda YA
      </h3>

      <div className="flex justify-center py-4 mb-4">
        <div
          className={`w-40 h-40 rounded-full border-4 border-ya-lime bg-ya-black flex items-center justify-center relative transition-transform duration-700 ${
            isSpinning ? 'animate-spin' : ''
          }`}
        >
          <div className="absolute top-1 w-2 h-4 bg-ya-lime" />
          <div className="text-center font-mono">
            <Zap size={32} className="text-ya-lime mx-auto mb-1" />
            <span className="text-[10px] font-black uppercase tracking-wider text-white">
              YA DROP
            </span>
          </div>
        </div>
      </div>

      {!result && (
        <button
          type="button"
          onClick={onSpin}
          disabled={disabled || isSpinning}
          className={`w-full py-4 px-6 text-sm font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            disabled || isSpinning
              ? 'bg-ya-gray text-gray-400 cursor-not-allowed border-2 border-ya-gray'
              : 'bg-ya-lime text-ya-black hover:bg-white border-2 border-ya-lime hover:border-white'
          }`}
        >
          {isSpinning ? 'Girando ruleta...' : '¡GIRAR RULETA AHORA!'}
        </button>
      )}
    </div>
  );
};

// ------------------------------------------------------------------------------
// 3. ELEGIR CARTA YA (Pick One)
// ------------------------------------------------------------------------------
export const PickOneGame: React.FC<{
  isPicking: boolean;
  result: PlayDropResult | null;
  onPick: () => void;
  disabled?: boolean;
}> = ({ isPicking, result, onPick, disabled }) => {
  return (
    <div className="w-full max-w-md mx-auto bg-ya-gray/40 border-2 border-ya-gray p-6 text-center">
      <div className="text-xs uppercase font-mono tracking-widest text-ya-lime mb-2">
        CARTAS SORPRESA YA
      </div>
      <h3 className="text-xl font-black uppercase tracking-tight text-white mb-4">
        Elige tu carta
      </h3>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {[1, 2, 3].map((cardNum) => (
          <button
            key={cardNum}
            type="button"
            onClick={onPick}
            disabled={disabled || isPicking || !!result}
            className="h-28 border-2 border-ya-gray bg-ya-black flex flex-col items-center justify-center hover:border-ya-lime transition-all"
          >
            <Zap size={24} className="text-ya-lime mb-2" />
            <span className="text-xs font-mono font-bold text-gray-300">CARTA {cardNum}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
