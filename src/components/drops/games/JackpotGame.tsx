// ==============================================================================
// YA DELIVERY - EXPERIENCIA DIGITAL JACKPOT (DROP 001)
// Archivo: src/components/drops/games/JackpotGame.tsx
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Sparkles } from 'lucide-react';
import {
  ReelSymbol,
  ReelSymbolKey,
  SYMBOL_KEYS,
  determineReelTargets,
} from './JackpotSymbols';
import { dropAudio } from '../../../lib/dropAudio';
import type { PlayDropResult } from '../../../types/drops';

interface JackpotGameProps {
  isSpinning: boolean;
  result: PlayDropResult | null;
  onSpin: () => void;
  disabled?: boolean;
  onReelsFinished?: () => void;
}

// Configuración de altura de símbolo para el tambor vertical
const SYMBOL_SLOT_HEIGHT = 124; // píxeles exactos por símbolo

export const JackpotGame: React.FC<JackpotGameProps> = ({
  isSpinning,
  result,
  onSpin,
  disabled = false,
  onReelsFinished,
}) => {
  // Símbolos visibles iniciales en reposo
  const [currentDisplay, setCurrentDisplay] = useState<[ReelSymbolKey, ReelSymbolKey, ReelSymbolKey]>([
    'YA',
    'STAR',
    'DRINK',
  ]);

  // Estado del juego: 'idle' | 'spinning' | 'stopping' | 'finished'
  const [gameState, setGameState] = useState<'idle' | 'spinning' | 'stopping' | 'finished'>('idle');

  // Estado sonoro
  const [isMuted, setIsMuted] = useState<boolean>(() => dropAudio.getMuted());

  // Tiras de símbolos pregeneradas para el giro de cada carrete
  const [strips, setStrips] = useState<ReelSymbolKey[][]>([[], [], []]);

  // Posición Y de cada carrete (transform: translate3d(0, y, 0))
  const [reelOffsets, setReelOffsets] = useState<[number, number, number]>([0, 0, 0]);

  // Transición CSS para cada carrete
  const [reelTransitions, setReelTransitions] = useState<[string, string, string]>([
    'none',
    'none',
    'none',
  ]);

  // Estado de parada de cada carrete individual (true cuando se ha clavado)
  const [reelsStopped, setReelsStopped] = useState<[boolean, boolean, boolean]>([false, false, false]);

  // Resultado de combinación calculada
  const [matchType, setMatchType] = useState<'jackpot' | 'match' | 'consolation' | null>(null);

  // Referencias para timers y limpieza
  const tickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stopTimersRef = useRef<NodeJS.Timeout[]>([]);
  const hasFinishedRef = useRef<boolean>(false);

  const toggleSound = () => {
    const muted = dropAudio.toggleMute();
    setIsMuted(muted);
  };

  // 1. GENERAR TIRA PARA GIRO MECÁNICO
  // Genera una secuencia vertical que termina con el símbolo objetivo en el índice 0
  const generateStrip = (targetSym: ReelSymbolKey, length: number): ReelSymbolKey[] => {
    const strip: ReelSymbolKey[] = [targetSym]; // Índice 0 = objetivo final
    for (let i = 1; i < length; i++) {
      const randomSym = SYMBOL_KEYS[Math.floor(Math.random() * SYMBOL_KEYS.length)];
      strip.push(randomSym);
    }
    return strip;
  };

  // Limpieza de timers al desmontar
  useEffect(() => {
    return () => {
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
      stopTimersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  // 2. DISPARO DEL GIRO AL PULSAR JUGAR
  const handleStartSpin = () => {
    if (disabled || gameState === 'spinning' || gameState === 'stopping') return;

    hasFinishedRef.current = false;
    setGameState('spinning');
    setReelsStopped([false, false, false]);
    setMatchType(null);

    // Audio inicial
    dropAudio.playSpinStart();

    // Iniciar bucle de audio ticks rítmicos mecánicos ("ti-ti-ti-ti...")
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    tickTimerRef.current = setInterval(() => {
      dropAudio.playTick(1 + (Math.random() * 0.2 - 0.1));
    }, 70);

    // Configurar tiras iniciales de giro continuo
    const tempStrip1 = generateStrip(currentDisplay[0], 28);
    const tempStrip2 = generateStrip(currentDisplay[1], 36);
    const tempStrip3 = generateStrip(currentDisplay[2], 44);

    setStrips([tempStrip1, tempStrip2, tempStrip3]);

    // Posicionar al final de la tira e iniciar descenso rápido
    const initialPos1 = -(tempStrip1.length - 1) * SYMBOL_SLOT_HEIGHT;
    const initialPos2 = -(tempStrip2.length - 1) * SYMBOL_SLOT_HEIGHT;
    const initialPos3 = -(tempStrip3.length - 1) * SYMBOL_SLOT_HEIGHT;

    setReelOffsets([initialPos1, initialPos2, initialPos3]);
    setReelTransitions(['none', 'none', 'none']);

    // Llamar a la función del padre para invocar RPC segura en backend
    onSpin();
  };

  // 3. RECIBIR RESULTADO DEL BACKEND Y SECUENCIAR PARADA CON DESACELERACIÓN
  useEffect(() => {
    if (!result || gameState !== 'spinning' || hasFinishedRef.current) {
      return;
    }

    setGameState('stopping');

    // Mapear resultado seguro del servidor a los 3 carretes
    const targets = determineReelTargets(result);

    // Regenerar tiras con el símbolo objetivo exactamente en el índice 0 (posición superior de reposo)
    const stripLen1 = 28;
    const stripLen2 = 36;
    const stripLen3 = 46;

    const s1 = generateStrip(targets[0], stripLen1);
    const s2 = generateStrip(targets[1], stripLen2);
    const s3 = generateStrip(targets[2], stripLen3);

    setStrips([s1, s2, s3]);

    // Calcular tiempos de llegada progresivos:
    // Carrete 1 se detiene a los ~1800ms
    // Carrete 2 se detiene a los ~2700ms (+900ms)
    // Carrete 3 se detiene a los ~3800ms (+1100ms de expectación)
    const duration1 = 1800;
    const duration2 = 2700;
    const duration3 = 3900;

    // Iniciar descenso y desaceleración con rebote elástico (cubic-bezier con ligero overshoot)
    // El cubic-bezier(0.18, 0.9, 0.22, 1.07) desacelera y genera un rebote natural de parada
    requestAnimationFrame(() => {
      setReelTransitions([
        `transform ${duration1}ms cubic-bezier(0.18, 0.9, 0.22, 1.07)`,
        `transform ${duration2}ms cubic-bezier(0.18, 0.9, 0.22, 1.07)`,
        `transform ${duration3}ms cubic-bezier(0.18, 0.9, 0.22, 1.07)`,
      ]);
      setReelOffsets([0, 0, 0]);
    });

    // Planificar eventos de parada para cada carrete con su audio específico:
    const t1 = setTimeout(() => {
      setReelsStopped((prev) => [true, prev[1], prev[2]]);
      dropAudio.playReelStop(0);
    }, duration1);

    const t2 = setTimeout(() => {
      setReelsStopped((prev) => [prev[0], true, prev[2]]);
      dropAudio.playReelStop(1);
    }, duration2);

    const t3 = setTimeout(() => {
      setReelsStopped([true, true, true]);
      dropAudio.playReelStop(2);

      // Detener ticks de audio
      if (tickTimerRef.current) {
        clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }

      // Actualizar símbolos estáticos finales
      setCurrentDisplay(targets);
      setGameState('finished');
      hasFinishedRef.current = true;

      // Evaluar combinación para celebración visual y sonora
      const isJackpot = targets[0] === targets[1] && targets[1] === targets[2];
      const isMatch =
        !isJackpot &&
        (targets[0] === targets[1] || targets[1] === targets[2] || targets[0] === targets[2]);

      if (isJackpot) {
        setMatchType('jackpot');
        dropAudio.playJackpotCelebration();
      } else if (isMatch) {
        setMatchType('match');
        dropAudio.playMatchCelebration();
      } else {
        setMatchType('consolation');
        dropAudio.playConsolationSound();
      }

      // Notificar al componente superior tras un breve instante para apreciar la combinación
      if (onReelsFinished) {
        setTimeout(() => {
          onReelsFinished();
        }, 500);
      }
    }, duration3);

    stopTimersRef.current = [t1, t2, t3];
  }, [result, gameState]);

  // Si el componente padre pasa isSpinning pero aún no habíamos iniciado localmente
  useEffect(() => {
    if (isSpinning && gameState === 'idle') {
      handleStartSpin();
    }
  }, [isSpinning]);

  // Comprobar si un carrete individual está entre los ganadores para iluminarlo
  const isReelWinning = (index: number): boolean => {
    if (gameState !== 'finished') return false;
    if (matchType === 'jackpot') return true;
    if (matchType === 'match') {
      const [s0, s1, s2] = currentDisplay;
      if (s0 === s1 && (index === 0 || index === 1)) return true;
      if (s1 === s2 && (index === 1 || index === 2)) return true;
      if (s0 === s2 && (index === 0 || index === 2)) return true;
    }
    return false;
  };

  return (
    <div className="w-full max-w-lg mx-auto bg-ya-black border-4 border-ya-gray select-none p-4 sm:p-6 relative shadow-2xl">
      {/* 1. BARRA SUPERIOR: DROP Y CONTROL DE SONIDO */}
      <div className="flex items-center justify-between border-b-2 border-ya-gray pb-3 mb-5">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 bg-ya-lime animate-ping" />
          <span className="text-[11px] font-mono font-black uppercase text-ya-lime tracking-wider">
            SISTEMA JACKPOT · EN LÍNEA
          </span>
        </div>
        <button
          type="button"
          onClick={toggleSound}
          className="p-1.5 text-gray-400 hover:text-ya-lime border border-ya-gray hover:border-ya-lime bg-zinc-900 transition-colors"
          title={isMuted ? 'Activar sonido' : 'Silenciar sonido'}
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>

      {/* 2. ETIQUETAS DE LOS 3 CARRETES */}
      <div className="grid grid-cols-3 gap-3 mb-2 px-1">
        {['[ CARRETE 1 ]', '[ CARRETE 2 ]', '[ CARRETE 3 ]'].map((label, idx) => (
          <div
            key={idx}
            className={`text-center font-mono text-[10px] font-black uppercase tracking-wider transition-colors ${
              reelsStopped[idx] && gameState === 'finished'
                ? isReelWinning(idx)
                  ? 'text-ya-lime'
                  : 'text-gray-400'
                : 'text-gray-400'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* 3. VISOR CENTRAL DE LOS 3 CARRETES */}
      <div className="relative bg-zinc-950 border-4 border-ya-gray p-2 sm:p-3 mb-5 overflow-hidden">
        {/* Línea de pago central con indicadores laterales */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-[2px] bg-ya-lime/25 z-20 pointer-events-none" />
        <div className="absolute left-1 top-1/2 -translate-y-1/2 text-ya-lime text-xs font-black z-20 pointer-events-none">
          ▶
        </div>
        <div className="absolute right-1 top-1/2 -translate-y-1/2 text-ya-lime text-xs font-black z-20 pointer-events-none">
          ◀
        </div>

        {/* Rejilla de los 3 carretes */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 relative z-10">
          {[0, 1, 2].map((reelIdx) => {
            const isFinishedReel = gameState === 'finished';
            const winning = isReelWinning(reelIdx);
            const isReelActive = gameState === 'spinning' || gameState === 'stopping';

            return (
              <div
                key={reelIdx}
                className={`relative bg-ya-black border-2 overflow-hidden transition-all duration-300 ${
                  winning
                    ? 'border-ya-lime bg-ya-lime/10 shadow-[0_0_20px_rgba(182,255,0,0.4)]'
                    : isFinishedReel
                    ? 'border-ya-gray/70'
                    : 'border-ya-gray'
                }`}
                style={{ height: `${SYMBOL_SLOT_HEIGHT}px` }}
              >
                {/* Degradados superior e inferior para efecto tambor / cilindro mecánico */}
                <div className="absolute inset-x-0 top-0 h-7 bg-gradient-to-b from-black/90 via-black/40 to-transparent z-10 pointer-events-none" />
                <div className="absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10 pointer-events-none" />

                {/* Tira animada que se desplaza de arriba hacia abajo */}
                {isReelActive && strips[reelIdx]?.length > 0 ? (
                  <div
                    className="flex flex-col"
                    style={{
                      transform: `translate3d(0, ${reelOffsets[reelIdx]}px, 0)`,
                      transition: reelTransitions[reelIdx],
                      willChange: 'transform',
                    }}
                  >
                    {strips[reelIdx].map((sym, sIdx) => (
                      <div
                        key={sIdx}
                        className="flex items-center justify-center shrink-0"
                        style={{ height: `${SYMBOL_SLOT_HEIGHT}px` }}
                      >
                        <ReelSymbol
                          symbol={sym}
                          isSpinning={!reelsStopped[reelIdx]}
                          isWinning={sIdx === 0 && winning}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Modo reposo o detenido: centrado perfecto */
                  <div
                    className="flex items-center justify-center w-full"
                    style={{ height: `${SYMBOL_SLOT_HEIGHT}px` }}
                  >
                    <ReelSymbol
                      symbol={currentDisplay[reelIdx]}
                      isWinning={winning}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. BANNER DE CELEBRACIÓN O ESTADO EN TIEMPO REAL */}
      {gameState === 'finished' && matchType && (
        <div
          className={`p-3.5 mb-5 border-2 text-center animate-fadeIn ${
            matchType === 'jackpot'
              ? 'border-ya-lime bg-ya-lime/20 text-ya-lime'
              : matchType === 'match'
              ? 'border-ya-lime/80 bg-ya-lime/10 text-white'
              : 'border-amber-400/80 bg-amber-950/20 text-amber-300'
          }`}
        >
          {matchType === 'jackpot' && (
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 font-mono font-black text-xs uppercase tracking-widest bg-ya-lime text-ya-black px-2 py-0.5">
                <Sparkles size={14} />
                <span>¡JACKPOT MAYOR! · 3 IGUALES</span>
              </div>
              <div className="text-xl sm:text-2xl font-black uppercase text-white tracking-tight">
                🥇 PEDIDO GRATIS HASTA 20 €
              </div>
              <p className="text-xs text-gray-200">
                ¡Los 3 carretes han coincidido! Tu pedido está completamente cubierto.
              </p>
            </div>
          )}

          {matchType === 'match' && (
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 font-mono font-black text-xs uppercase tracking-widest bg-ya-lime text-ya-black px-2 py-0.5">
                <span>COMBINACIÓN GANADORA · 2 IGUALES</span>
              </div>
              <div className="text-xl sm:text-2xl font-black uppercase text-white tracking-tight">
                🥈 25 % DTO. EN TU PRÓXIMO PEDIDO
              </div>
              <p className="text-xs text-gray-200">
                ¡2 carretes idénticos! Se ha guardado tu descuento del 25% para tu siguiente pedido.
              </p>
            </div>
          )}

          {matchType === 'consolation' && (
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 font-mono font-black text-xs uppercase tracking-widest bg-amber-400 text-ya-black px-2 py-0.5">
                <span>PARTICIPACIÓN DIRECTA</span>
              </div>
              <div className="text-lg sm:text-xl font-black uppercase text-white tracking-tight">
                🥉 +1 PARTICIPACIÓN SORTEO MENSUAL
              </div>
              <p className="text-xs text-gray-300">
                Cada pedido suma: sumas una participación para el gran sorteo del mes de YA.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 5. BOTÓN PRINCIPAL DE ACCIÓN */}
      <div className="mb-5">
        {gameState === 'idle' && (
          <button
            type="button"
            onClick={handleStartSpin}
            disabled={disabled}
            className={`w-full py-4 px-6 font-mono font-black text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-3 border-2 ${
              disabled
                ? 'bg-ya-gray text-gray-500 border-ya-gray cursor-not-allowed'
                : 'bg-ya-lime text-ya-black border-ya-lime hover:bg-white hover:border-white shadow-xl shadow-ya-lime/15 active:translate-y-0.5'
            }`}
          >
            <span>JUGAR</span>
          </button>
        )}

        {(gameState === 'spinning' || gameState === 'stopping') && (
          <div className="w-full py-4 px-6 bg-zinc-900 border-2 border-ya-lime/40 text-ya-lime font-mono font-black text-xs uppercase tracking-wider flex items-center justify-center gap-3">
            <span className="w-2 h-2 bg-ya-lime rounded-full animate-ping" />
            <span>GIRANDO CARRETES...</span>
          </div>
        )}
      </div>

      {/* 6. TABLA DE PREMIOS OFICIAL YA (INFORMACIÓN CLARA Y TRANSPARENTE) */}
      <div className="border-2 border-ya-gray bg-zinc-950/70 p-3 sm:p-4 text-left font-mono">
        <div className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2.5 flex items-center justify-between border-b border-ya-gray/60 pb-1.5">
          <span>COMBINACIONES DEL JACKPOT</span>
          <span className="text-ya-lime">YA REWARDS</span>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between text-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-ya-lime font-bold">3 IGUALES</span>
              <span className="text-[10px] text-gray-400">[ YA·YA·YA / ✦·✦·✦ / 🥤·🥤·🥤 ]</span>
            </div>
            <span className="font-black text-ya-lime text-right">🥇 PEDIDO GRATIS (-20€)</span>
          </div>

          <div className="flex items-center justify-between text-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-white font-bold">2 IGUALES</span>
              <span className="text-[10px] text-gray-400">[ CUALQUIER PAR ]</span>
            </div>
            <span className="font-bold text-white text-right">🥈 25 % DESCUENTO</span>
          </div>

          <div className="flex items-center justify-between text-gray-400">
            <div className="flex items-center gap-2">
              <span className="font-bold">NINGUNA</span>
              <span className="text-[10px] text-gray-500">[ 3 DISTINTOS ]</span>
            </div>
            <span className="text-amber-300 font-bold text-right">🥉 +1 SORTEO MENSUAL</span>
          </div>
        </div>
      </div>
    </div>
  );
};
