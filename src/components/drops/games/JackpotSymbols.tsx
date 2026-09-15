// ==============================================================================
// YA DELIVERY - SÍMBOLOS EXCLUSIVOS DEL JACKPOT DE YA
// Archivo: src/components/drops/games/JackpotSymbols.tsx
// Símbolos oficiales: 'YA' | 'STAR' (✦) | 'DRINK' (🥤)
// ==============================================================================

import React from 'react';

export type ReelSymbolKey = 'YA' | 'STAR' | 'DRINK';

export interface ReelSymbolInfo {
  key: ReelSymbolKey;
  label: string;
  subLabel: string;
  badgeText: string;
}

export const JACKPOT_SYMBOLS: Record<ReelSymbolKey, ReelSymbolInfo> = {
  YA: {
    key: 'YA',
    label: 'YA LOGO',
    subLabel: 'Símbolo Estrella',
    badgeText: 'YA',
  },
  STAR: {
    key: 'STAR',
    label: 'ESTRELLA YA',
    subLabel: 'Identidad Gráfica',
    badgeText: '✦',
  },
  DRINK: {
    key: 'DRINK',
    label: 'BEBIDA CONVENIENCIA',
    subLabel: 'Delivery YA',
    badgeText: '🥤',
  },
};

export const SYMBOL_KEYS: ReelSymbolKey[] = ['YA', 'STAR', 'DRINK'];

/**
 * Determina las posiciones de los 3 carretes de forma determinista y segura
 * según el resultado decidido previamente por el backend:
 * - free_order (Pedido gratis hasta 20€) -> 3 IGUALES
 * - percentage_discount (25% dto) -> 2 IGUALES
 * - mensual / consolación / sin premio -> 0 IGUALES (TODOS DISTINTOS)
 */
export function determineReelTargets(
  result: {
    outcome?: string;
    prize?: { prize_type?: string; prize_value?: number } | null;
  } | null
): [ReelSymbolKey, ReelSymbolKey, ReelSymbolKey] {
  const all: ReelSymbolKey[] = ['YA', 'STAR', 'DRINK'];

  if (!result) {
    return ['YA', 'STAR', 'DRINK'];
  }

  // 1. CASO 3 IGUALES: free_order (Pedido gratis hasta 20€)
  if (
    result.outcome === 'won_prize' &&
    result.prize &&
    result.prize.prize_type === 'free_order'
  ) {
    const chosen = all[Math.floor(Math.random() * all.length)];
    return [chosen, chosen, chosen];
  }

  // 2. CASO 2 IGUALES: percentage_discount (25% o premio intermedio)
  if (result.outcome === 'won_prize' && result.prize) {
    const matchSym = all[Math.floor(Math.random() * all.length)];
    const others = all.filter((s) => s !== matchSym);
    const nonMatch = others[Math.floor(Math.random() * others.length)];

    // Elegir aleatoriamente qué dos carretes coinciden (0 y 1, 1 y 2, o 0 y 2)
    const pattern = Math.floor(Math.random() * 3);
    if (pattern === 0) return [matchSym, matchSym, nonMatch];
    if (pattern === 1) return [matchSym, nonMatch, matchSym];
    return [nonMatch, matchSym, matchSym];
  }

  // 3. CASO NINGUNA (0 IGUALES - TODOS DISTINTOS): Sorteo mensual / consolación
  // Permutación aleatoria de los 3 símbolos para que no coincida ninguno
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1], shuffled[2]];
}

interface ReelSymbolProps {
  symbol: ReelSymbolKey;
  isWinning?: boolean;
  isSpinning?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const ReelSymbol: React.FC<ReelSymbolProps> = ({
  symbol,
  isWinning = false,
  isSpinning = false,
  size = 'md',
}) => {
  const containerClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24 sm:w-28 sm:h-28',
    lg: 'w-28 h-28 sm:w-32 sm:h-32',
  }[size];

  const motionClasses = isSpinning ? 'blur-[0.5px] opacity-90' : 'blur-0 opacity-100';

  // 1. SÍMBOLO 'YA'
  if (symbol === 'YA') {
    return (
      <div
        className={`relative flex flex-col items-center justify-center select-none transition-transform duration-200 ${containerClasses} ${motionClasses}`}
      >
        <div
          className={`px-3 py-1.5 font-mono font-black tracking-tighter text-2xl sm:text-3xl uppercase transition-all duration-200 border-2 ${
            isWinning
              ? 'bg-ya-lime text-ya-black border-white shadow-[0_0_15px_#B6FF00] scale-105'
              : 'bg-ya-lime text-ya-black border-ya-black shadow-[2px_2px_0px_rgba(255,255,255,0.3)]'
          }`}
        >
          YA
        </div>
        <span className="text-[9px] font-mono font-black uppercase text-gray-400 mt-1 tracking-widest">
          YA
        </span>
      </div>
    );
  }

  // 2. SÍMBOLO '✦' (Estrella gráfica de YA)
  if (symbol === 'STAR') {
    return (
      <div
        className={`relative flex flex-col items-center justify-center select-none transition-transform duration-200 ${containerClasses} ${motionClasses}`}
      >
        <div
          className={`flex items-center justify-center transition-all duration-200 ${
            isWinning ? 'scale-110 drop-shadow-[0_0_16px_#B6FF00]' : 'scale-100'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className="w-10 h-10 sm:w-12 sm:h-12 text-ya-lime fill-current"
          >
            {/* Estrella cóncava de 4 puntas de YA */}
            <path d="M12 0 C12 6.627 6.627 12 0 12 C6.627 12 12 17.373 12 24 C12 17.373 17.373 12 24 12 C17.373 12 12 6.627 12 0 Z" />
          </svg>
        </div>
        <span className="text-[9px] font-mono font-black uppercase text-gray-400 mt-1 tracking-widest">
          ✦ ESTRELLA
        </span>
      </div>
    );
  }

  // 3. SÍMBOLO '🥤' (Bebida de conveniencia genérica moderna en el universo YA)
  return (
    <div
      className={`relative flex flex-col items-center justify-center select-none transition-transform duration-200 ${containerClasses} ${motionClasses}`}
    >
      <div
        className={`flex items-center justify-center transition-all duration-200 ${
          isWinning ? 'scale-110 drop-shadow-[0_0_16px_#B6FF00]' : 'scale-100'
        }`}
      >
        <svg
          viewBox="0 0 28 32"
          className="w-10 h-11 sm:w-12 sm:h-13 stroke-white fill-none stroke-[2] stroke-linecap-round stroke-linejoin-round"
        >
          {/* Pajita o tirador superior */}
          <path d="M12 5 L12 2 L16 2" className="stroke-ya-lime stroke-[2.5]" />
          {/* Cuerpo cilíndrico de lata/vaso de conveniencia */}
          <rect
            x="6"
            y="6"
            width="16"
            height="23"
            rx="3.5"
            className="fill-zinc-900/90 stroke-white stroke-[2]"
          />
          {/* Ranura y bandas de diseño de la lata */}
          <line x1="6" y1="11" x2="22" y2="11" className="stroke-ya-lime stroke-[1.5]" />
          <line x1="6" y1="23" x2="22" y2="23" className="stroke-ya-lime stroke-[1.5]" />
          {/* Insignia central en forma de gota/estrella */}
          <circle cx="14" cy="17" r="2.8" className="fill-ya-lime stroke-none" />
        </svg>
      </div>
      <span className="text-[9px] font-mono font-black uppercase text-gray-400 mt-1 tracking-widest">
        BEBIDA
      </span>
    </div>
  );
};
