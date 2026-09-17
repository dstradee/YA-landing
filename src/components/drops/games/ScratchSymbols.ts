// ==============================================================================
// YA DELIVERY - SÍMBOLOS Y COMBINACIONES PARA DROP 002: RASCA Y GANA
// Archivo: src/components/drops/games/ScratchSymbols.ts
// Símbolos autoritativos: 'YA' | 'STAR' (✦) | 'DRINK' (🥤)
// ==============================================================================

import type { PlayDropResult } from '../../../types/drops';

export type ScratchSymbolKey = 'YA' | 'STAR' | 'DRINK';

export interface ScratchPrizeInfo {
  id: string;
  name: string;
  description?: string | null;
  prize_type?: string;
  prize_value?: number;
  sort_order?: number;
}

export interface ScratchSymbolInfo {
  key: ScratchSymbolKey;
  symbol: string;
  label: string;
  accentColor: string;
  bgGradient: string;
}

export const SCRATCH_SYMBOLS: Record<ScratchSymbolKey, ScratchSymbolInfo> = {
  YA: {
    key: 'YA',
    symbol: 'YA',
    label: 'LOGO YA',
    accentColor: '#DFFF00', // ya-lime
    bgGradient: 'from-zinc-900 via-zinc-800 to-black',
  },
  STAR: {
    key: 'STAR',
    symbol: '✦',
    label: 'ESTRELLA YA',
    accentColor: '#F59E0B', // amber-500
    bgGradient: 'from-zinc-900 via-zinc-800 to-black',
  },
  DRINK: {
    key: 'DRINK',
    symbol: '🥤',
    label: 'BEBIDA YA',
    accentColor: '#38BDF8', // sky-400
    bgGradient: 'from-zinc-900 via-zinc-800 to-black',
  },
};

export interface ScratchCombinationResult {
  symbols: [ScratchSymbolKey, ScratchSymbolKey, ScratchSymbolKey];
  tier: 'principal' | 'secundario' | 'consolacion';
  tierLabel: string;
  combinationLabel: string;
}

/**
 * Determina de manera autoritativa y determinista la combinación visual de 3 símbolos
 * a partir del resultado que el servidor ya ha decidido y registrado:
 *
 * 1. Premio Principal (1º Premio / sort_order 1 / free_order):
 *    -> YA · YA · YA (3x YA)
 *
 * 2. Premio Secundario (2º Premio / sort_order 2 / descuento):
 *    -> ✦ · ✦ · 🥤 (2x ✦ + 🥤)
 *
 * 3. Premio de Consolación (No directo / Sorteo Mensual):
 *    -> YA · ✦ · 🥤 (Combinación mixta sin acierto)
 */
export function determineScratchSymbols(
  result: PlayDropResult | null,
  prizes?: ScratchPrizeInfo[]
): ScratchCombinationResult {
  if (!result) {
    return {
      symbols: ['YA', 'STAR', 'DRINK'],
      tier: 'consolacion',
      tierLabel: 'Sorteo Mensual',
      combinationLabel: 'YA · ✦ · 🥤',
    };
  }

  // A) PREMIO DIRECTO GANADO
  if (result.outcome === 'won_prize' && result.prize) {
    // Identificar si es Premio Principal o Secundario según drop_prizes configurados
    let isPrincipal = false;

    if (prizes && prizes.length > 0) {
      // Ordenar por sort_order
      const sorted = [...prizes].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      const firstPrize = sorted[0];
      if (
        result.prize.id === firstPrize?.id ||
        result.prize.name === firstPrize?.name ||
        result.prize.prize_type === 'free_order'
      ) {
        isPrincipal = true;
      }
    } else if (
      result.prize.prize_type === 'free_order' ||
      (result.prize.prize_value && result.prize.prize_value >= 20)
    ) {
      isPrincipal = true;
    }

    if (isPrincipal) {
      // 1. PREMIO PRINCIPAL: YA · YA · YA
      return {
        symbols: ['YA', 'YA', 'YA'],
        tier: 'principal',
        tierLabel: 'Premio Principal',
        combinationLabel: 'YA · YA · YA',
      };
    } else {
      // 2. PREMIO SECUNDARIO: ✦ · ✦ · 🥤
      return {
        symbols: ['STAR', 'STAR', 'DRINK'],
        tier: 'secundario',
        tierLabel: 'Premio Secundario',
        combinationLabel: '✦ · ✦ · 🥤',
      };
    }
  }

  // B) PREMIO DE CONSOLACIÓN: YA · ✦ · 🥤
  return {
    symbols: ['YA', 'STAR', 'DRINK'],
    tier: 'consolacion',
    tierLabel: 'Recompensa de Drop',
    combinationLabel: 'YA · ✦ · 🥤',
  };
}
