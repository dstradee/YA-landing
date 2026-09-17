// ==============================================================================
// YA - JUEGO DE DROP: DROP 003 — EL CARA O CRUZ
// Archivo: src/components/drops/games/CoinFlipGame.tsx
// ==============================================================================
// Mecánica autoritativa:
// 1. El usuario elige CARA o CRUZ.
// 2. Al pulsar GIRAR MONEDA la elección queda bloqueada.
// 3. Backend autoritativo determina GANADOR (won_prize) o PERDEDOR (consolation).
// 4. Matriz de resultados:
//    - CARA + GANADOR -> CARA -> premio físico
//    - CARA + PERDEDOR -> CRUZ -> +2 participaciones
//    - CRUZ + GANADOR -> CRUZ -> premio físico
//    - CRUZ + PERDEDOR -> CARA -> +2 participaciones
// 5. Animación: Giro sobre eje vertical (Y) en su propio sitio.
//    Referencia: Moneda de 20 céntimos girando entre los dedos frente a los ojos.
//    CARA -> canto -> CRUZ -> canto -> CARA... Sin desplazamiento vertical.
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Check } from 'lucide-react';
import type { PlayDropResult, ActiveDropPrize } from '../../../types/drops';

export type CoinChoice = 'cara' | 'cruz';

interface CoinFlipGameProps {
  isFlipping: boolean;
  result: PlayDropResult | null;
  prizes?: ActiveDropPrize[];
  initialChoice?: CoinChoice | null;
  onFlip: (choice: CoinChoice) => void;
  onAnimationFinished?: () => void;
  disabled?: boolean;
  isTestMode?: boolean;
}

export const CoinFlipGame: React.FC<CoinFlipGameProps> = ({
  isFlipping,
  result,
  prizes = [],
  initialChoice = null,
  onFlip,
  onAnimationFinished,
  disabled = false,
  isTestMode = false,
}) => {
  // Selección del usuario
  const [selectedChoice, setSelectedChoice] = useState<CoinChoice | null>(initialChoice);
  const [choiceLocked, setChoiceLocked] = useState<boolean>(Boolean(initialChoice && result));

  // Control de ángulo físico de giro en eje vertical (eje Y)
  const [rotationY, setRotationY] = useState<number>(0);
  const [animating, setAnimating] = useState<boolean>(false);
  const [settled, setSettled] = useState<boolean>(Boolean(result));
  const [activeSide, setActiveSide] = useState<CoinChoice>('cara');

  // Ref para controlar timeouts limpios de animación
  const spinTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const animationFinishedCalledRef = useRef<boolean>(false);

  // Nombre del premio físico configurado (de drop_prizes, nunca hardcodeado)
  const physicalPrize = prizes.length > 0 ? prizes[0] : null;
  const prizeName = result?.prize?.name || physicalPrize?.name || 'Premio Físico Exclusivo YA';

  // Si ya tenemos resultado previo (por ejemplo tras refresh o tirada anterior)
  useEffect(() => {
    if (result && !animating && !settled) {
      const isWinner = result.outcome === 'won_prize';
      const userPick = selectedChoice || 'cara';
      // Matriz inamovible
      const finalSide: CoinChoice = isWinner ? userPick : userPick === 'cara' ? 'cruz' : 'cara';
      setActiveSide(finalSide);
      setRotationY(finalSide === 'cruz' ? 180 : 0);
      setSettled(true);
      setChoiceLocked(true);
      if (onAnimationFinished && !animationFinishedCalledRef.current) {
        animationFinishedCalledRef.current = true;
        onAnimationFinished();
      }
    }
  }, [result, animating, settled, selectedChoice, onAnimationFinished]);

  // Manejador del lanzamiento de la moneda
  const handleStartFlip = () => {
    if (!selectedChoice || disabled || isFlipping || animating || settled) return;

    setChoiceLocked(true);
    setAnimating(true);
    setSettled(false);
    animationFinishedCalledRef.current = false;

    // Disparar llamada al servidor con la elección bloqueada
    onFlip(selectedChoice);
  };

  // Cuando el resultado llega del servidor y estamos en estado animando
  useEffect(() => {
    if (animating && result) {
      const isWinner = result.outcome === 'won_prize';
      const userPick = selectedChoice || 'cara';

      // --------------------------------------------------------------------------
      // MATRIZ INAMOVIBLE DEL JUEGO
      // CARA + GANADOR  -> CARA (Premio físico)
      // CARA + PERDEDOR -> CRUZ (+2 participaciones)
      // CRUZ + GANADOR  -> CRUZ (Premio físico)
      // CRUZ + PERDEDOR -> CARA (+2 participaciones)
      // --------------------------------------------------------------------------
      const targetSide: CoinChoice = isWinner ? userPick : userPick === 'cara' ? 'cruz' : 'cara';

      // Cálculo de rotación: mínimo 8 vueltas completas (2880°) para un giro rápido
      // que desacelere con realismo físico exactamente en targetSide.
      // CARA = múltiplo de 360° (0°)
      // CRUZ = múltiplo de 360° + 180°
      const baseSpins = 8 * 360; // 2880°
      const finalTargetAngle = baseSpins + (targetSide === 'cruz' ? 180 : 0);

      // Iniciar el giro suave con desaceleración sobre eje Y
      setRotationY(finalTargetAngle);

      // Tiempo exacto de la desaceleración física: 3200ms
      spinTimeoutRef.current = setTimeout(() => {
        setAnimating(false);
        setSettled(true);
        setActiveSide(targetSide);

        // Pequeño retroceso / asentamiento metálico realista (damping)
        setTimeout(() => {
          if (onAnimationFinished && !animationFinishedCalledRef.current) {
            animationFinishedCalledRef.current = true;
            onAnimationFinished();
          }
        }, 300);
      }, 3200);
    }

    return () => {
      if (spinTimeoutRef.current) {
        clearTimeout(spinTimeoutRef.current);
      }
    };
  }, [animating, result, selectedChoice, onAnimationFinished]);

  // Si se resetea en modo prueba (Probar de nuevo)
  useEffect(() => {
    if (!result && settled && isTestMode) {
      setSettled(false);
      setAnimating(false);
      setChoiceLocked(false);
      setRotationY(0);
      setActiveSide('cara');
      animationFinishedCalledRef.current = false;
    }
  }, [result, settled, isTestMode]);

  // Cálculo de resultado para los textos del juego
  const isWinner = result?.outcome === 'won_prize';
  const consolationEntries = result?.consolation_entries || 2;

  return (
    <div className="w-full max-w-lg mx-auto bg-[#0A0A0A] border-2 border-white/20 p-6 sm:p-8 text-center select-none shadow-2xl relative">
      {/* Subtítulo conceptual YA */}
      <div className="text-[11px] font-mono tracking-widest text-ya-lime font-bold uppercase mb-1">
        ELIGE. GIRA. DESCUBRE.
      </div>
      <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white mb-2">
        EL CARA O CRUZ
      </h2>
      <p className="text-xs text-gray-400 font-mono mb-6 max-w-sm mx-auto">
        Acierta la cara de la moneda para ganar el premio físico oficial. Si no aciertas, recibes +2 participaciones para el Sorteo Mensual.
      </p>

      {/* Selector de Elección: ¿CARA O CRUZ? */}
      {!settled && (
        <div className="mb-6">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-white mb-3 flex items-center justify-center gap-2">
            <span>¿CARA O CRUZ?</span>
            {choiceLocked && (
              <span className="px-2 py-0.5 bg-ya-lime/20 text-ya-lime text-[10px] border border-ya-lime">
                ELECCIÓN BLOQUEADA
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Opción CARA */}
            <button
              type="button"
              id="btn-choose-cara"
              onClick={() => !choiceLocked && !animating && setSelectedChoice('cara')}
              disabled={choiceLocked || animating || disabled}
              className={`p-4 border-2 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer ${
                selectedChoice === 'cara'
                  ? 'border-ya-lime bg-ya-lime/15 text-white shadow-[0_0_15px_rgba(182,255,0,0.25)]'
                  : 'border-white/20 bg-zinc-950 text-gray-300 hover:border-white/50 hover:bg-zinc-900'
              } ${choiceLocked || animating || disabled ? 'opacity-80 cursor-not-allowed' : ''}`}
            >
              <div className="w-10 h-10 rounded-full border-2 border-ya-lime bg-black flex items-center justify-center font-black text-ya-lime text-xs font-mono">
                YA
              </div>
              <div className="font-black text-sm uppercase tracking-wider font-mono">
                CARA
              </div>
              <div className="text-[10px] font-mono text-gray-400">
                Premio si aciertas
              </div>
              {selectedChoice === 'cara' && (
                <div className="flex items-center gap-1 text-[10px] text-ya-lime font-mono font-bold mt-1">
                  <Check size={12} />
                  <span>SELECCIONADO</span>
                </div>
              )}
            </button>

            {/* Opción CRUZ */}
            <button
              type="button"
              id="btn-choose-cruz"
              onClick={() => !choiceLocked && !animating && setSelectedChoice('cruz')}
              disabled={choiceLocked || animating || disabled}
              className={`p-4 border-2 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer ${
                selectedChoice === 'cruz'
                  ? 'border-white bg-white/15 text-white shadow-[0_0_15px_rgba(255,255,255,0.25)]'
                  : 'border-white/20 bg-zinc-950 text-gray-300 hover:border-white/50 hover:bg-zinc-900'
              } ${choiceLocked || animating || disabled ? 'opacity-80 cursor-not-allowed' : ''}`}
            >
              <div className="w-10 h-10 rounded-full border-2 border-white bg-black flex items-center justify-center font-black text-white text-base">
                +
              </div>
              <div className="font-black text-sm uppercase tracking-wider font-mono">
                CRUZ
              </div>
              <div className="text-[10px] font-mono text-gray-400">
                Premio si aciertas
              </div>
              {selectedChoice === 'cruz' && (
                <div className="flex items-center gap-1 text-[10px] text-white font-mono font-bold mt-1">
                  <Check size={12} />
                  <span>SELECCIONADO</span>
                </div>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* MONEDA 3D - GIRO VERTICAL SOBRE SU PROPIO SITIO                        */}
      {/* Referencia: Moneda de 20 céntimos girando entre los dedos frente a los ojos */}
      {/* CARA -> canto -> CRUZ -> canto -> CARA...                               */}
      {/* Sin parábola, sin caída, sin salto vertical, sin movimiento de mesa     */}
      {/* ---------------------------------------------------------------------- */}
      <div className="py-4 my-2 flex justify-center items-center">
        <div
          style={{ perspective: '1200px' }}
          className="w-48 h-48 sm:w-56 sm:h-56 relative flex items-center justify-center"
        >
          <div
            id="coin-spinner-disc"
            style={{
              width: '100%',
              height: '100%',
              transformStyle: 'preserve-3d',
              transform: `rotateY(${rotationY}deg)`,
              transition: animating
                ? 'transform 3.2s cubic-bezier(0.12, 0.85, 0.32, 1)'
                : 'transform 0.2s ease-out',
            }}
            className="relative select-none pointer-events-none"
          >
            {/* CAPAS DE ESPESOR METÁLICO (CANTO DE 20 CÉNTIMOS) */}
            <div
              style={{
                transform: 'translateZ(-2px)',
                backfaceVisibility: 'hidden',
              }}
              className="absolute inset-0 rounded-full bg-zinc-800 border-2 border-zinc-700"
            />
            <div
              style={{
                transform: 'translateZ(-1px)',
                backfaceVisibility: 'hidden',
              }}
              className="absolute inset-0 rounded-full bg-zinc-900"
            />
            <div
              style={{
                transform: 'translateZ(1px)',
                backfaceVisibility: 'hidden',
              }}
              className="absolute inset-0 rounded-full bg-zinc-900"
            />
            <div
              style={{
                transform: 'translateZ(2px)',
                backfaceVisibility: 'hidden',
              }}
              className="absolute inset-0 rounded-full bg-zinc-800 border-2 border-zinc-700"
            />

            {/* ================================================================ */}
            {/* CARA (FRENTE - 0°)                                               */}
            {/* ================================================================ */}
            <div
              style={{
                transform: 'rotateY(0deg) translateZ(4px)',
                backfaceVisibility: 'hidden',
              }}
              className="absolute inset-0 rounded-full border-4 border-ya-lime bg-[#0A0A0A] flex flex-col items-center justify-between p-4 shadow-2xl"
            >
              {/* Aro estriado interior estilo moneda */}
              <div className="absolute inset-2 rounded-full border border-dashed border-ya-lime/40 pointer-events-none" />

              {/* Texto superior grabado */}
              <div className="font-mono text-[10px] tracking-widest font-black text-white/80 uppercase pt-2 z-10">
                DROP 003 • YA
              </div>

              {/* Centro de la moneda */}
              <div className="text-center my-auto z-10">
                <div className="font-black text-5xl sm:text-6xl tracking-tighter text-ya-lime font-mono drop-shadow-[0_2px_10px_rgba(182,255,0,0.4)]">
                  YA
                </div>
                <div className="text-[10px] font-mono tracking-widest text-white/60 uppercase mt-0.5">
                  DELIVERY
                </div>
              </div>

              {/* Texto inferior de la cara */}
              <div className="bg-ya-lime text-ya-black font-black text-xs font-mono px-3 py-0.5 uppercase tracking-widest z-10 mb-1">
                CARA
              </div>
            </div>

            {/* ================================================================ */}
            {/* CRUZ (REVERSO - 180°)                                            */}
            {/* ================================================================ */}
            <div
              style={{
                transform: 'rotateY(180deg) translateZ(4px)',
                backfaceVisibility: 'hidden',
              }}
              className="absolute inset-0 rounded-full border-4 border-white bg-[#141414] flex flex-col items-center justify-between p-4 shadow-2xl"
            >
              {/* Aro estriado interior */}
              <div className="absolute inset-2 rounded-full border border-dashed border-white/40 pointer-events-none" />

              {/* Texto superior */}
              <div className="font-mono text-[10px] tracking-widest font-black text-white/80 uppercase pt-2 z-10">
                SORTEO MENSUAL
              </div>

              {/* Centro de la Cruz: Símbolo geométrico brutalista */}
              <div className="text-center my-auto z-10 flex flex-col items-center justify-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 relative flex items-center justify-center">
                  <div className="absolute w-full h-3.5 bg-white shadow-md" />
                  <div className="absolute h-full w-3.5 bg-white shadow-md" />
                  <div className="absolute w-4 h-4 bg-ya-lime" />
                </div>
                <div className="text-[9px] font-mono tracking-widest text-gray-400 uppercase mt-2">
                  +2 TICKETS
                </div>
              </div>

              {/* Texto inferior de la cruz */}
              <div className="bg-white text-ya-black font-black text-xs font-mono px-3 py-0.5 uppercase tracking-widest z-10 mb-1">
                CRUZ
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Indicador de estado de la animación */}
      {animating && (
        <div className="text-xs font-mono text-ya-lime font-bold uppercase tracking-wider mb-4 animate-pulse flex items-center justify-center gap-2">
          <Sparkles size={14} className="animate-spin" />
          <span>GIRANDO MONEDA AUTORITATIVAMENTE...</span>
        </div>
      )}

      {/* Resultados inamovibles tras finalizar el giro */}
      {settled && result && (
        <div className="mt-4 mb-2">
          {isWinner ? (
            // CASO GANADOR (CARA+CARA o CRUZ+CRUZ)
            <div className="p-4 border-2 border-ya-lime bg-ya-lime/10 text-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-ya-lime text-ya-black font-black text-xs font-mono uppercase tracking-widest mb-2">
                <Check size={14} />
                <span>¡HAS ACERTADO!</span>
              </div>
              <h3 className="text-2xl font-black uppercase text-white tracking-tight">
                HAS GANADO
              </h3>
              <p className="text-sm font-bold text-ya-lime mt-1 font-mono">
                {prizeName}
              </p>
              <div className="text-xs text-gray-300 mt-2 font-mono">
                La moneda ha caído exactamente en <strong className="text-white uppercase">{activeSide}</strong>.
              </div>
            </div>
          ) : (
            // CASO CONSOLACIÓN (CARA+CRUZ o CRUZ+CARA)
            <div className="p-4 border-2 border-amber-400 bg-amber-400/10 text-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-400 text-ya-black font-black text-xs font-mono uppercase tracking-widest mb-2">
                <span>NO ESTA VEZ</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black uppercase text-white tracking-tight">
                +{consolationEntries} PARTICIPACIONES PARA EL SORTEO MENSUAL
              </h3>
              <p className="text-xs text-gray-300 mt-1 font-mono">
                Elegiste <strong className="text-white uppercase">{selectedChoice}</strong> y la moneda ha quedado en <strong className="text-white uppercase">{activeSide}</strong>.
              </p>
              <div className="mt-2 text-xs text-amber-300 font-mono">
                Tus +{consolationEntries} participaciones reales han sido acreditadas en tu cuenta para el Sorteo Mensual.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Botón de Acción Principal: GIRAR MONEDA */}
      {!settled && (
        <button
          type="button"
          id="btn-spin-coin"
          onClick={handleStartFlip}
          disabled={!selectedChoice || disabled || isFlipping || animating}
          className={`w-full py-4 px-6 text-sm font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer font-mono ${
            !selectedChoice || disabled || isFlipping || animating
              ? 'bg-zinc-800 text-gray-500 border-2 border-zinc-700 cursor-not-allowed'
              : 'bg-ya-lime text-ya-black hover:bg-white border-2 border-ya-lime hover:border-white shadow-[0_4px_20px_rgba(182,255,0,0.3)] active:translate-y-0.5'
          }`}
        >
          {animating || isFlipping ? (
            <>
              <Sparkles size={18} className="animate-spin text-ya-black" />
              <span>GIRANDO MONEDA...</span>
            </>
          ) : (
            <span>GIRAR MONEDA</span>
          )}
        </button>
      )}

      {/* Detalle inferior de pie */}
      <div className="mt-4 text-[11px] font-mono text-gray-500 flex items-center justify-between border-t border-white/10 pt-3">
        <span>DROP 003 • YA DELIVERY</span>
        <span>1 PARTIDA POR PEDIDO</span>
      </div>
    </div>
  );
};
