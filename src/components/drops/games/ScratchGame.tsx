// ==============================================================================
// YA DELIVERY - JUEGOS DE DROP: DROP 002 — RASCA Y GANA
// Archivo: src/components/drops/games/ScratchGame.tsx
// ==============================================================================
// 1. Billete digital único con capa de rascado táctil e interactiva
// 2. Resultado autoritativo decidido en backend antes de rascar
// 3. 3 Categorías de premio configurables mediante drop_prizes
//    - Premio Principal: YA · YA · YA
//    - Premio Secundario: ✦ · ✦ · 🥤
//    - Premio de Consolación: YA · ✦ · 🥤 (+1 Sorteo Mensual)
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Zap, Volume2, VolumeX, ShieldCheck, Ticket, Loader2 } from 'lucide-react';
import type { PlayDropResult } from '../../../types/drops';
import { dropAudio } from '../../../lib/dropAudio';
import {
  determineScratchSymbols,
  SCRATCH_SYMBOLS,
  ScratchSymbolKey,
  ScratchPrizeInfo,
} from './ScratchSymbols';

// ------------------------------------------------------------------------------
// 1. COMPONENTE PRINCIPAL: DROP 002 — BILLETE RASCA Y GANA
// ------------------------------------------------------------------------------
export interface ScratchGameProps {
  isScratching?: boolean;
  result: PlayDropResult | null;
  prizes?: ScratchPrizeInfo[];
  onScratch?: () => void;
  onScratchFinished?: () => void;
  disabled?: boolean;
}

export const ScratchGame: React.FC<ScratchGameProps> = ({
  isScratching = false,
  result,
  prizes,
  onScratch,
  onScratchFinished,
  disabled = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isRevealed, setIsRevealed] = useState(false);
  const [scratchPercent, setScratchPercent] = useState(0);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [isMuted, setIsMuted] = useState(() => dropAudio.getMuted());
  const [ticketSerial] = useState(() => {
    return `YA-002-${Math.floor(100000 + Math.random() * 900000)}`;
  });

  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const strokesCountRef = useRef<number>(0);
  const audioTickThrottleRef = useRef<number>(0);
  const hasTriggeredFinishedRef = useRef<boolean>(false);

  // Mapear resultado autoritativo a los 3 símbolos oficiales:
  const combo = determineScratchSymbols(result, prizes);

  // Inicializar o redibujar el canvas de rascado
  const initScratchCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width || 360;
    const height = rect.height || 180;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // Fondo metalizado plateado / carbón de alta fidelidad
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#27272a');
    grad.addColorStop(0.3, '#3f3f46');
    grad.addColorStop(0.5, '#27272a');
    grad.addColorStop(0.7, '#52525b');
    grad.addColorStop(1, '#18181b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Patrón de seguridad diagonal estilo guilloché
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    const step = 14;
    for (let x = -height; x < width + height; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height, height);
      ctx.stroke();
    }

    // Marco perimetral con línea punteada
    ctx.strokeStyle = 'rgba(223, 255, 0, 0.45)'; // ya-lime con transparencia
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(6, 6, width - 12, height - 12);
    ctx.setLineDash([]);

    // Sello circular central de seguridad
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(9, 9, 11, 0.75)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#DFFF00';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Texto del sello central
    ctx.fillStyle = '#DFFF00';
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦ ✦ ✦', centerX, centerY - 14);

    ctx.font = '900 11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('RASCAR AQUÍ', centerX, centerY + 4);

    ctx.font = 'bold 8px "Courier New", monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('DESLIZA DEDO / RATÓN', centerX, centerY + 18);
    ctx.restore();

    // Texto de borde inferior
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '9px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ZONA AUTORIZADA · TICKET DE SEGURIDAD DROP 002', centerX, height - 12);
  }, []);

  // Montar canvas
  useEffect(() => {
    initScratchCanvas();
    const handleResize = () => {
      if (!isRevealed) {
        initScratchCanvas();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [initScratchCanvas, isRevealed]);

  // Si el resultado ya estaba completado o ya se ha revelado
  useEffect(() => {
    if (result && isRevealed && !hasTriggeredFinishedRef.current) {
      hasTriggeredFinishedRef.current = true;
      if (onScratchFinished) {
        onScratchFinished();
      }
    }
  }, [result, isRevealed, onScratchFinished]);

  // Manejo de sonido mute/unmute
  const handleToggleSound = () => {
    const muted = dropAudio.toggleMute();
    setIsMuted(muted);
  };

  // Función para calcular porcentaje de raspado
  const evaluateScratchProgress = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || isRevealed) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const w = canvas.width;
      const h = canvas.height;

      // Muestreo optimizado en cuadrícula de 24 x 14 puntos
      const sampleCols = 24;
      const sampleRows = 14;
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      let transparentPoints = 0;
      const totalPoints = sampleCols * sampleRows;

      for (let r = 0; r < sampleRows; r++) {
        for (let c = 0; c < sampleCols; c++) {
          const x = Math.floor((c / (sampleCols - 1 || 1)) * (w - 1));
          const y = Math.floor((r / (sampleRows - 1 || 1)) * (h - 1));
          const alphaIndex = (y * w + x) * 4 + 3;
          if (data[alphaIndex] < 64) {
            transparentPoints++;
          }
        }
      }

      const pct = Math.round((transparentPoints / totalPoints) * 100);
      setScratchPercent(pct);

      // Si ha rascado el 45% o más, revelar completamente el billete
      if (pct >= 45 && !isRevealed) {
        triggerFullReveal();
      }
    } catch {
      // Ignorar de forma segura si canvas estuviese restringido
    }
  }, [isRevealed]);

  // Disparar revelación completa
  const triggerFullReveal = useCallback(() => {
    if (isRevealed) return;
    setIsRevealed(true);
    setScratchPercent(100);

    // Sonido de celebración según la categoría obtenida
    if (combo.tier === 'principal') {
      dropAudio.playJackpotCelebration();
    } else if (combo.tier === 'secundario') {
      dropAudio.playMatchCelebration();
    } else {
      dropAudio.playConsolationSound();
    }

    if (!hasTriggeredFinishedRef.current) {
      hasTriggeredFinishedRef.current = true;
      if (onScratchFinished) {
        setTimeout(() => {
          onScratchFinished();
        }, 500);
      }
    }
  }, [isRevealed, combo.tier, onScratchFinished]);

  // Rascar en coordenadas dadas
  const scratchAt = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || isRevealed || disabled) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const x = (clientX - rect.left) * dpr;
      const y = (clientY - rect.top) * dpr;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 42 * dpr; // Radio de brocha generoso y táctil
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      if (lastPosRef.current) {
        ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      } else {
        ctx.arc(x, y, 22 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      lastPosRef.current = { x, y };
      strokesCountRef.current++;

      // Sonido de textura de raspado amortiguado
      const now = Date.now();
      if (now - audioTickThrottleRef.current > 75) {
        audioTickThrottleRef.current = now;
        dropAudio.playScratchTick();
      }

      // Evaluar progreso cada 5 movimientos
      if (strokesCountRef.current % 5 === 0) {
        evaluateScratchProgress();
      }
    },
    [isRevealed, disabled, evaluateScratchProgress]
  );

  // Manejadores de Ratón
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled || isRevealed) return;
    if (!result && onScratch) {
      onScratch();
    }
    setIsPointerDown(true);
    lastPosRef.current = null;
    scratchAt(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPointerDown || disabled || isRevealed) return;
    scratchAt(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    setIsPointerDown(false);
    lastPosRef.current = null;
    evaluateScratchProgress();
  };

  // Manejadores Táctiles (Smartphones y Tablets)
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled || isRevealed) return;
    if (!result && onScratch) {
      onScratch();
    }
    const touch = e.touches[0];
    if (touch) {
      setIsPointerDown(true);
      lastPosRef.current = null;
      scratchAt(touch.clientX, touch.clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isPointerDown || disabled || isRevealed) return;
    const touch = e.touches[0];
    if (touch) {
      scratchAt(touch.clientX, touch.clientY);
    }
  };

  const handleTouchEnd = () => {
    setIsPointerDown(false);
    lastPosRef.current = null;
    evaluateScratchProgress();
  };

  return (
    <div
      ref={containerRef}
      className="w-full max-w-md mx-auto select-none font-sans transition-all duration-300"
    >
      {/* BILLETE DIGITAL DE RASCADO */}
      <div className="relative bg-zinc-950 border-4 border-ya-lime shadow-[0_15px_40px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Cabecera del Billete */}
        <div className="p-4 bg-zinc-900 border-b-2 border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-ya-lime text-ya-black flex items-center justify-center font-black text-sm">
              YA
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-ya-lime font-bold">
                DROP 002 · BILLETE DIGITAL
              </div>
              <h3 className="text-sm font-black uppercase text-white tracking-tight">
                RASCA Y GANA
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleSound}
              className="p-1.5 text-zinc-400 hover:text-white bg-zinc-800 border border-zinc-700 transition-colors"
              title={isMuted ? 'Activar sonido' : 'Silenciar'}
              aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
            >
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <div className="px-2 py-1 bg-black border border-zinc-700 text-[10px] font-mono text-zinc-400 font-bold">
              {ticketSerial}
            </div>
          </div>
        </div>

        {/* Guía de Combinaciones y Premios */}
        <div className="px-4 py-2 bg-black/60 border-b border-zinc-800 flex items-center justify-between text-[10px] font-mono text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span className="text-ya-lime font-bold">3x YA:</span>
            <span>1º Premio</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1.5">
            <span className="text-amber-400 font-bold">✦ · ✦ · 🥤:</span>
            <span>2º Premio</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1.5">
            <span className="text-sky-400 font-bold">Mixto:</span>
            <span>Sorteo Mensual</span>
          </div>
        </div>

        {/* ZONA PRINCIPAL DE RASCADO */}
        <div className="p-4 sm:p-5 relative">
          <div className="text-center mb-3">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">
              {isRevealed
                ? '¡BILLETE RASCADO Y REVELADO!'
                : 'ZONA DE SEGURIDAD · RASCA PARA DESCUBRIR'}
            </span>
          </div>

          {/* Contenedor relativo del área de raspado */}
          <div
            className="relative w-full h-48 sm:h-52 bg-zinc-900 border-2 border-zinc-700 overflow-hidden shadow-inner flex flex-col items-center justify-center p-3"
            style={{ touchAction: 'none' }}
          >
            {/* CAPA INFERIOR: LOS 3 SÍMBOLOS PREDECIDIDOS POR EL SERVIDOR */}
            <div className="w-full h-full flex flex-col justify-between items-center py-2 relative z-0">
              {/* Contenedor de las 3 Casillas de Símbolos */}
              <div className="w-full grid grid-cols-3 gap-2.5 sm:gap-3 my-auto">
                {combo.symbols.map((symKey: ScratchSymbolKey, idx: number) => {
                  const symInfo = SCRATCH_SYMBOLS[symKey];
                  const isWinningTier = combo.tier === 'principal' || combo.tier === 'secundario';

                  return (
                    <div
                      key={idx}
                      className={`h-24 sm:h-28 border-2 flex flex-col items-center justify-center relative transition-all duration-500 ${
                        isWinningTier
                          ? 'border-ya-lime bg-zinc-950 shadow-[0_0_15px_rgba(223,255,0,0.15)]'
                          : 'border-zinc-700 bg-zinc-900/90'
                      }`}
                    >
                      <div className="text-3xl sm:text-4xl font-black mb-1 drop-shadow">
                        {symKey === 'YA' ? (
                          <span className="text-ya-lime font-black tracking-tighter">YA</span>
                        ) : symKey === 'STAR' ? (
                          <span className="text-amber-400">✦</span>
                        ) : (
                          <span>🥤</span>
                        )}
                      </div>
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                        {symInfo.label}
                      </span>

                      {/* Marca de casilla */}
                      <span className="absolute top-1 left-1.5 text-[8px] font-mono text-zinc-600">
                        #{idx + 1}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Mensaje o Banner del Resultado Decidido */}
              <div className="w-full pt-2 text-center">
                {combo.tier === 'principal' ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-ya-lime text-ya-black font-black font-mono text-[11px] uppercase tracking-wider shadow">
                    <Sparkles size={13} />
                    <span>¡3x YA! ¡PREMIO PRINCIPAL!</span>
                  </div>
                ) : combo.tier === 'secundario' ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-400 text-ya-black font-black font-mono text-[11px] uppercase tracking-wider shadow">
                    <Sparkles size={13} />
                    <span>¡COMBINACIÓN GANADORA! PREMIO SECUNDARIO</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-800 text-zinc-300 border border-zinc-700 font-bold font-mono text-[10px] uppercase tracking-wider">
                    <Ticket size={13} className="text-amber-400" />
                    <span>SÍMBOLOS MIXTOS · +1 EN SORTEO MENSUAL</span>
                  </div>
                )}
              </div>
            </div>

            {/* CAPA SUPERIOR: CANVAS DE RASCADO INTERACTIVO */}
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              className={`absolute inset-0 w-full h-full z-10 cursor-crosshair transition-opacity duration-700 ${
                isRevealed ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
            />
          </div>

          {/* Barra de progreso de raspado y botón de revelado rápido */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="flex justify-between text-[10px] font-mono text-zinc-400 mb-1">
                <span>Progreso de rascado:</span>
                <span className="text-ya-lime font-bold">{scratchPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 border border-zinc-700 overflow-hidden">
                <div
                  className="h-full bg-ya-lime transition-all duration-150"
                  style={{ width: `${scratchPercent}%` }}
                />
              </div>
            </div>

            {!isRevealed && (
              <button
                type="button"
                id="btn-scratch-reveal-all"
                onClick={triggerFullReveal}
                disabled={disabled}
                className="shrink-0 px-3 py-2 bg-zinc-800 hover:bg-ya-lime hover:text-ya-black text-zinc-200 border border-zinc-700 hover:border-ya-lime font-black uppercase text-[10px] tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles size={12} />
                <span>Rascar Todo</span>
              </button>
            )}
          </div>
        </div>

        {/* Pie del Billete con Sello de Auditoría */}
        <div className="px-4 py-2.5 bg-black border-t border-zinc-800 flex items-center justify-between text-[10px] font-mono text-zinc-500">
          <div className="flex items-center gap-1.5">
            {isScratching ? (
              <>
                <Loader2 size={14} className="text-ya-lime animate-spin" />
                <span className="text-ya-lime font-bold">Autenticando billete...</span>
              </>
            ) : (
              <>
                <ShieldCheck size={14} className="text-ya-lime" />
                <span>Resultado certificado por servidor</span>
              </>
            )}
          </div>
          <span>1 JUGADA / PEDIDO</span>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------------
// 2. JUEGO RULETA URBANA YA (Mantenido para compatibilidad)
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
// 3. ELEGIR CARTA YA (Pick One - Mantenido para compatibilidad)
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
