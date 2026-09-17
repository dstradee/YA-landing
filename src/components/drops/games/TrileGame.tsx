// ==============================================================================
// YA - JUEGO DE DROP: DROP 004 — EL TRILE
// Archivo: src/components/drops/games/TrileGame.tsx
// ==============================================================================
// Mecánica autoritativa:
// 1. 3 CARTAS BOCA ABAJO: [ CARTA 1 ] [ CARTA 2 ] [ CARTA 3 ]
// 2. El usuario selecciona UNA.
// 3. La carta elegida se revela primero.
// 4. Inmediatamente después, las otras dos cartas también se revelan.
// 5. Las tres quedan visibles simultáneamente ("ELIGE UNA. DESCUBRE LAS TRES").
// 6. El backend determina el resultado de la partida autoritativamente.
//    La elección de la carta NO altera las probabilidades:
//    - 10% PREMIO GORDO (Símbolo YA)
//    - 20% DESCUENTO (Símbolo ✦)
//    - 70% PARTICIPACIONES SORTEO MENSUAL (Símbolo 🥤)
// 7. No hay replay, elección bloqueada, idempotencia estricta.
// ==============================================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Sparkles, Check, ShieldCheck, Ticket, Percent } from 'lucide-react';
import type { PlayDropResult, ActiveDropPrize } from '../../../types/drops';

export type TrileCategory = 'grand_prize' | 'discount' | 'consolation';

interface TrileCardData {
  category: TrileCategory;
  symbol: string;
  badge: string;
  title: string;
  subtitle: string;
  probability: string;
}

interface TrileGameProps {
  isPlaying: boolean;
  result: PlayDropResult | null;
  prizes?: ActiveDropPrize[];
  initialChoice?: number | null; // 0, 1, o 2
  onPickCard: (cardIndex: number) => void;
  onAnimationFinished?: () => void;
  disabled?: boolean;
  isTestMode?: boolean;
}

export const TrileGame: React.FC<TrileGameProps> = ({
  isPlaying,
  result,
  prizes = [],
  initialChoice = null,
  onPickCard,
  onAnimationFinished,
  disabled = false,
  isTestMode = false,
}) => {
  // Selección del usuario: 0, 1, o 2
  const [selectedCard, setSelectedCard] = useState<number | null>(initialChoice);
  const [choiceLocked, setChoiceLocked] = useState<boolean>(Boolean(initialChoice !== null && result));

  // Estados de revelación individual de las 3 cartas
  const [revealed, setRevealed] = useState<boolean[]>([
    Boolean(result && initialChoice !== null),
    Boolean(result && initialChoice !== null),
    Boolean(result && initialChoice !== null),
  ]);

  const [settled, setSettled] = useState<boolean>(Boolean(result && initialChoice !== null));
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const animationFinishedCalledRef = useRef<boolean>(false);

  // Obtener datos reales de premios configurados
  const grandPrize = useMemo(() => {
    return prizes.find((p) => p.sort_order === 1) || prizes[0];
  }, [prizes]);

  const discountPrize = useMemo(() => {
    return prizes.find((p) => p.sort_order === 2) || prizes[1];
  }, [prizes]);

  // Determinar la categoría real ganada por el usuario desde el backend
  const userCategory = useMemo<TrileCategory>(() => {
    if (!result) return 'consolation';
    if (result.outcome === 'won_prize') {
      const prizeId = result.prize_id || result.prize?.id;
      if (discountPrize && prizeId === discountPrize.id) {
        return 'discount';
      }
      if (result.prize?.prize_type === 'percentage_discount' || result.prize?.prize_type === 'fixed_discount') {
        return 'discount';
      }
      return 'grand_prize';
    }
    return 'consolation';
  }, [result, discountPrize]);

  // Generar la definición de las 3 categorías disponibles
  const categoriesMap = useMemo<Record<TrileCategory, TrileCardData>>(() => {
    return {
      grand_prize: {
        category: 'grand_prize',
        symbol: 'YA',
        badge: '10 % PROB.',
        title: 'PREMIO GORDO',
        subtitle: grandPrize?.name || 'Sudadera Exclusiva YA — Oversize Trile',
        probability: '10%',
      },
      discount: {
        category: 'discount',
        symbol: '✦',
        badge: '20 % PROB.',
        title: 'DESCUENTO DIRECTO',
        subtitle: discountPrize?.name || '25% Dto. en tu próximo pedido',
        probability: '20%',
      },
      consolation: {
        category: 'consolation',
        symbol: '🥤',
        badge: '70 % PROB.',
        title: 'SORTEO MENSUAL',
        subtitle: `+${result?.consolation_entries || 2} Participaciones Reales`,
        probability: '70%',
      },
    };
  }, [grandPrize, discountPrize, result]);

  // Distribuir las 3 cartas en las 3 posiciones fijando la del usuario en la posición elegida
  const cardsLayout = useMemo<TrileCardData[]>(() => {
    const allCategories: TrileCategory[] = ['grand_prize', 'discount', 'consolation'];
    const chosenIndex = selectedCard !== null ? selectedCard : 0;
    const remainingCategories = allCategories.filter((c) => c !== userCategory);

    // Asignación determinista de las otras dos cartas
    const layout: TrileCardData[] = [];
    let remIdx = 0;
    for (let i = 0; i < 3; i++) {
      if (i === chosenIndex) {
        layout.push(categoriesMap[userCategory]);
      } else {
        layout.push(categoriesMap[remainingCategories[remIdx] || 'consolation']);
        remIdx++;
      }
    }
    return layout;
  }, [selectedCard, userCategory, categoriesMap]);

  // Manejar la elección del usuario
  const handleSelectCard = (index: number) => {
    if (choiceLocked || isPlaying || disabled) return;

    setSelectedCard(index);
    setChoiceLocked(true);
    onPickCard(index);
  };

  // Efecto cuando el backend entrega el resultado
  useEffect(() => {
    if (!result || selectedCard === null || settled) return;

    // Limpiar timeouts previos
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    // Paso 1: Revelar inmediatamente la carta elegida
    const t1 = setTimeout(() => {
      setRevealed((prev) => {
        const next = [...prev];
        next[selectedCard] = true;
        return next;
      });
    }, 150);

    // Paso 2: 400ms después, revelar las otras dos cartas simultáneamente
    const t2 = setTimeout(() => {
      setRevealed([true, true, true]);
    }, 550);

    // Paso 3: Asentar juego y finalizar animación
    const t3 = setTimeout(() => {
      setSettled(true);
      if (onAnimationFinished && !animationFinishedCalledRef.current) {
        animationFinishedCalledRef.current = true;
        onAnimationFinished();
      }
    }, 1100);

    timeoutsRef.current.push(t1, t2, t3);

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, [result, selectedCard, settled, onAnimationFinished]);

  // Si llega un resultado previo ya restaurado (ej. refresh de página)
  useEffect(() => {
    if (result && initialChoice !== null && !settled) {
      setSelectedCard(initialChoice);
      setChoiceLocked(true);
      setRevealed([true, true, true]);
      setSettled(true);
    }
  }, [result, initialChoice, settled]);

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col items-center">
      {/* Banner de Modo Prueba */}
      {isTestMode && (
        <div className="mb-4 inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border-2 border-amber-400 text-amber-300 text-xs font-mono font-bold uppercase tracking-wider">
          <Sparkles size={14} className="animate-spin" />
          <span>MODO PRUEBA ADMIN — Simulación 100% aislada de producción</span>
        </div>
      )}

      {/* Cabecera conceptual: "ELIGE UNA. DESCUBRE LAS TRES." */}
      <div className="text-center mb-6">
        <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-ya-lime block mb-1">
          DROP 004 · MECÁNICA EXCLUSIVA YA
        </span>
        <h2 className="text-2xl sm:text-3xl font-black uppercase text-white tracking-tight">
          ELIGE UNA. DESCUBRE LAS TRES.
        </h2>
        <p className="text-xs text-gray-400 font-mono mt-1">
          {settled
            ? 'Partida completada. Las tres cartas han sido reveladas.'
            : choiceLocked
            ? 'Elección bloqueada. Revelando cartas...'
            : 'Selecciona una de las 3 cartas. Tras tu elección, se revelarán todas.'}
        </p>
      </div>

      {/* TABLERO DE LAS 3 CARTAS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full px-2 sm:px-4 mb-6">
        {cardsLayout.map((card, idx) => {
          const isChosen = selectedCard === idx;
          const isCardRevealed = revealed[idx];

          return (
            <div
              key={idx}
              className={`relative select-none transition-all duration-300 ${
                !choiceLocked && !disabled
                  ? 'cursor-pointer hover:-translate-y-1'
                  : 'cursor-default'
              }`}
              onClick={() => handleSelectCard(idx)}
              style={{ perspective: '1000px' }}
            >
              {/* Contenedor con efecto 3D Flip */}
              <div
                className="w-full aspect-[2/3] transition-transform duration-700 ease-out"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: isCardRevealed ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
              >
                {/* ───────────────────────────────────────────────────────────── */}
                {/* REVERSO DE LA CARTA (BOCA ABAJO) */}
                {/* ───────────────────────────────────────────────────────────── */}
                <div
                  className={`absolute inset-0 w-full h-full bg-[#121212] border-4 ${
                    isChosen
                      ? 'border-ya-lime shadow-[6px_6px_0px_#B6FF00]'
                      : 'border-zinc-700 hover:border-zinc-400 shadow-[4px_4px_0px_#000000]'
                  } p-4 flex flex-col justify-between items-center transition-colors`}
                  style={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                  }}
                >
                  {/* Etiqueta superior */}
                  <div className="w-full flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest">
                      YA // DROP
                    </span>
                    <span className="text-[10px] font-mono font-black text-ya-lime">
                      0{idx + 1}
                    </span>
                  </div>

                  {/* Centro geométrico brutalista */}
                  <div className="flex flex-col items-center justify-center my-auto">
                    <div className="w-16 h-16 border-2 border-zinc-700 flex items-center justify-center mb-3 bg-zinc-900/50">
                      <span className="text-xl font-mono text-zinc-500 font-bold">?</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-zinc-400 tracking-wider">
                      CARTA {idx + 1}
                    </span>
                    <span className="text-[9px] font-mono text-zinc-600 mt-1 uppercase">
                      BOCA ABAJO
                    </span>
                  </div>

                  {/* Indicador inferior */}
                  <div className="w-full text-center border-t border-zinc-800 pt-2">
                    {!choiceLocked ? (
                      <span className="text-[10px] font-mono text-ya-lime font-bold uppercase tracking-wider hover:underline">
                        PULSAR PARA ELEGIR
                      </span>
                    ) : isChosen ? (
                      <span className="text-[10px] font-mono text-ya-lime font-bold uppercase tracking-wider">
                        ELEGIDA · REVELANDO...
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
                        BLOQUEADA
                      </span>
                    )}
                  </div>
                </div>

                {/* ───────────────────────────────────────────────────────────── */}
                {/* ANVERSO DE LA CARTA (REVELADA) */}
                {/* ───────────────────────────────────────────────────────────── */}
                <div
                  className={`absolute inset-0 w-full h-full p-4 flex flex-col justify-between items-center ${
                    isChosen
                      ? 'bg-zinc-900 border-4 border-ya-lime shadow-[6px_6px_0px_#B6FF00]'
                      : 'bg-zinc-950/90 border-2 border-zinc-700 shadow-[4px_4px_0px_#000000] opacity-85'
                  }`}
                  style={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                  }}
                >
                  {/* Insignia de estado (Tu Elección vs Otra Posición) */}
                  <div className="w-full flex items-center justify-between">
                    {isChosen ? (
                      <span className="px-2 py-0.5 bg-ya-lime text-ya-black text-[9px] font-mono font-black uppercase tracking-wider inline-flex items-center gap-1">
                        <Check size={11} strokeWidth={3} />
                        TU ELECCIÓN
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 text-[9px] font-mono uppercase tracking-wider">
                        OTRA CARTA
                      </span>
                    )}
                    <span className="text-[9px] font-mono text-zinc-500 font-bold">
                      {card.badge}
                    </span>
                  </div>

                  {/* Símbolo central de YA (YA, ✦, 🥤) */}
                  <div className="flex flex-col items-center justify-center my-auto text-center px-1">
                    <div
                      className={`w-14 h-14 border-2 flex items-center justify-center mb-2 font-black ${
                        card.category === 'grand_prize'
                          ? 'border-ya-lime bg-ya-lime/10 text-ya-lime text-2xl'
                          : card.category === 'discount'
                          ? 'border-white bg-white/10 text-white text-3xl'
                          : 'border-zinc-600 bg-zinc-800/40 text-zinc-300 text-3xl'
                      }`}
                    >
                      {card.symbol}
                    </div>

                    <span
                      className={`text-[11px] font-mono font-black uppercase tracking-wider mb-1 ${
                        card.category === 'grand_prize'
                          ? 'text-ya-lime'
                          : card.category === 'discount'
                          ? 'text-white'
                          : 'text-zinc-300'
                      }`}
                    >
                      {card.title}
                    </span>

                    <p className="text-[11px] font-medium text-gray-200 line-clamp-2 leading-tight">
                      {card.subtitle}
                    </p>
                  </div>

                  {/* Pie de carta revelada */}
                  <div className="w-full border-t border-zinc-800 pt-2 text-center">
                    {isChosen ? (
                      <span className="text-[10px] font-mono font-black text-ya-lime uppercase tracking-widest">
                        ★ PREMIO OBTENIDO ★
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
                        ESTABA EN CARTA 0{idx + 1}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* PANEL DE RESULTADO AUTORITATIVO TRAS COMPLETAR LA REVELACIÓN */}
      {/* ───────────────────────────────────────────────────────────────── */}
      {settled && result && (
        <div className="w-full px-2 sm:px-4 mt-2 transition-all duration-500 animate-fadeIn">
          {userCategory === 'grand_prize' && (
            <div className="p-5 border-4 border-ya-lime bg-zinc-900 shadow-[8px_8px_0px_#B6FF00] text-white">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-ya-lime text-ya-black flex items-center justify-center font-black text-xl shrink-0">
                    YA
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-ya-lime font-bold uppercase tracking-widest block">
                      ¡PREMIO GORDO CONSEGUIDO! (10% PROB.)
                    </span>
                    <h3 className="text-lg sm:text-xl font-black uppercase text-white">
                      {result.prize?.name || grandPrize?.name}
                    </h3>
                    <p className="text-xs text-gray-300 font-mono mt-0.5">
                      {result.prize?.description || grandPrize?.description}
                    </p>
                  </div>
                </div>
                <div className="sm:self-center shrink-0">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ya-lime text-ya-black font-mono font-black text-xs uppercase tracking-wider">
                    <ShieldCheck size={14} />
                    REGISTRADO EN TU CUENTA
                  </span>
                </div>
              </div>
            </div>
          )}

          {userCategory === 'discount' && (
            <div className="p-5 border-4 border-white bg-zinc-900 shadow-[8px_8px_0px_#FFFFFF] text-white">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white text-ya-black flex items-center justify-center font-black text-2xl shrink-0">
                    ✦
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-white font-bold uppercase tracking-widest block">
                      ¡DESCUENTO DIRECTO OBTENIDO! (20% PROB.)
                    </span>
                    <h3 className="text-lg sm:text-xl font-black uppercase text-white">
                      {result.prize?.name || discountPrize?.name || '25% Descuento'}
                    </h3>
                    <p className="text-xs text-gray-300 font-mono mt-0.5">
                      Disponible para aplicar en tu siguiente pedido durante los próximos{' '}
                      {result.prize?.validity_days || 7} días.
                    </p>
                  </div>
                </div>
                <div className="sm:self-center shrink-0">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-ya-black font-mono font-black text-xs uppercase tracking-wider">
                    <Percent size={14} />
                    DESCUENTO ACTIVO
                  </span>
                </div>
              </div>
            </div>
          )}

          {userCategory === 'consolation' && (
            <div className="p-5 border-4 border-zinc-600 bg-zinc-900 shadow-[8px_8px_0px_#333333] text-white">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-zinc-800 text-ya-lime border border-ya-lime flex items-center justify-center font-black text-2xl shrink-0">
                    🥤
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-ya-lime font-bold uppercase tracking-widest block">
                      PARTICIPACIONES GANADAS (70% PROB.)
                    </span>
                    <h3 className="text-lg sm:text-xl font-black uppercase text-white">
                      +{result.consolation_entries || 2} PARTICIPACIONES PARA EL SORTEO MENSUAL
                    </h3>
                    <p className="text-xs text-gray-300 font-mono mt-0.5">
                      Tus participaciones han sido sumadas a tu perfil para el Gran Sorteo Mensual activo.
                    </p>
                  </div>
                </div>
                <div className="sm:self-center shrink-0">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 text-ya-lime border border-ya-lime font-mono font-black text-xs uppercase tracking-wider">
                    <Ticket size={14} />
                    SORTEO MENSUAL
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
