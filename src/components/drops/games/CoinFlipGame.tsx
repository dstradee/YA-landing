// ==============================================================================
// YA - JUEGO DE DROP: MONEDA CONMEMORATIVA YA
// Archivo: src/components/drops/games/CoinFlipGame.tsx
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { Zap, Sparkles, Trophy, Disc } from 'lucide-react';
import type { PlayDropResult } from '../../../types/drops';

interface CoinFlipGameProps {
  isFlipping: boolean;
  result: PlayDropResult | null;
  onFlip: () => void;
  disabled?: boolean;
}

export const CoinFlipGame: React.FC<CoinFlipGameProps> = ({
  isFlipping,
  result,
  onFlip,
  disabled,
}) => {
  const [side, setSide] = useState<'heads' | 'tails'>('heads');

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isFlipping) {
      interval = setInterval(() => {
        setSide((prev) => (prev === 'heads' ? 'tails' : 'heads'));
      }, 120);
    } else if (result) {
      setSide(result.outcome === 'won_prize' ? 'heads' : 'tails');
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isFlipping, result]);

  return (
    <div className="w-full max-w-md mx-auto bg-ya-gray/40 border-2 border-ya-gray p-6 text-center">
      <div className="text-xs uppercase font-mono tracking-widest text-ya-lime mb-2">
        MONEDA CONMEMORATIVA YA
      </div>
      <h3 className="text-xl font-black uppercase tracking-tight text-white mb-6">
        Lanza la moneda al aire
      </h3>

      {/* Moneda YA 3D */}
      <div className="flex justify-center items-center py-6 mb-4">
        <div
          className={`w-36 h-36 rounded-full border-4 border-ya-lime bg-ya-black flex flex-col items-center justify-center p-4 transition-transform duration-300 shadow-xl ${
            isFlipping ? 'animate-spin' : ''
          }`}
        >
          {side === 'heads' ? (
            <div className="text-center">
              <Zap size={44} className="text-ya-lime mx-auto mb-1" />
              <span className="font-black text-xs uppercase tracking-widest text-white">
                YA DROP
              </span>
            </div>
          ) : (
            <div className="text-center">
              <Trophy size={40} className="text-amber-400 mx-auto mb-1" />
              <span className="font-black text-xs uppercase tracking-widest text-white">
                SORTEO
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-400 font-mono mb-6">
        Cara: Premio Directo • Cruz: Participación en el Sorteo Mensual
      </div>

      {!result && (
        <button
          type="button"
          onClick={onFlip}
          disabled={disabled || isFlipping}
          className={`w-full py-4 px-6 text-sm font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            disabled || isFlipping
              ? 'bg-ya-gray text-gray-400 cursor-not-allowed border-2 border-ya-gray'
              : 'bg-ya-lime text-ya-black hover:bg-white border-2 border-ya-lime hover:border-white shadow-lg shadow-ya-lime/10'
          }`}
        >
          {isFlipping ? (
            <>
              <Sparkles size={18} className="animate-spin text-ya-black" />
              <span>Lanzando en servidor...</span>
            </>
          ) : (
            <>
              <Disc size={18} />
              <span>¡LANZAR MONEDA YA!</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};
