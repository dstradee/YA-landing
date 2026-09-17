// ==============================================================================
// YA - MOTOR PRINCIPAL DE JUEGO DE DROPS (DropGameEngine)
// Archivo: src/components/drops/DropGameEngine.tsx
// ==============================================================================

import React, { useState, useEffect } from 'react';
import {
  Gift,
  Trophy,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  Clock,
  X,
  Ticket,
} from 'lucide-react';
import {
  checkDropEligibility,
  playDrop,
  adminTestPlayDrop,
  formatMadridDate,
  saveAwardedPrizeCustomData,
} from '../../lib/drops';
import type { ActiveDropPayload, PlayDropResult } from '../../types/drops';
import { JackpotGame } from './games/JackpotGame';
import { CoinFlipGame } from './games/CoinFlipGame';
import { TrileGame } from './games/TrileGame';
import { MysteryBoxGame } from './games/MysteryBoxGame';
import { ScratchGame, WheelGame, PickOneGame } from './games/ScratchGame';

interface DropGameEngineProps {
  dropPayload: ActiveDropPayload;
  orderId?: string;
  isTestMode?: boolean;
  onFinished?: (result: PlayDropResult) => void;
  onClose?: () => void;
}


function CustomPrizeForm({
  prizeId,
  prizeConfig,
  isTestMode,
  onSaved,
}: {
  prizeId: string;
  prizeConfig?: Record<string, any>;
  isTestMode?: boolean;
  onSaved: () => void;
}) {
  // Configuración de campos dinámicos: por defecto Nombre, Instagram, Mensaje
  // o configurable para Nombre, Email, Teléfono, etc.
  const rawFields = prizeConfig?.form_fields || ['Nombre', 'Instagram', 'Mensaje / Detalles'];
  const fields = Array.isArray(rawFields) ? rawFields : ['Nombre', 'Instagram', 'Mensaje / Detalles'];

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (isTestMode) {
      setTimeout(() => {
        setSaving(false);
        setSaved(true);
        onSaved();
      }, 400);
      return;
    }
    const success = await saveAwardedPrizeCustomData(prizeId, formData);
    setSaving(false);
    if (success) {
      setSaved(true);
      onSaved();
    }
  };

  if (saved) {
    return (
      <div className="mt-4 p-4 border-2 border-ya-lime bg-ya-lime/10 text-center text-ya-lime font-bold text-xs">
        {isTestMode
          ? '¡Simulación de datos completada en Modo Prueba! (No se han guardado datos en producción).'
          : '¡Datos guardados correctamente! Nos pondremos en contacto contigo para entregarte tu premio.'}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 p-4 border-2 border-ya-gray bg-ya-black text-left">
      <h4 className="text-white font-black uppercase mb-1 text-xs tracking-wider">
        Premio Especial — Completa tus datos
      </h4>
      <p className="text-[11px] text-gray-400 mb-3">
        Introduce tus datos para que el equipo de YA Delivery gestione la entrega.
      </p>
      <div className="space-y-3">
        {fields.map((field: string, idx: number) => {
          const fieldKey = field.toLowerCase().replace(/[^a-z0-9]/g, '_');
          const isTextArea = field.toLowerCase().includes('mensaje') || field.toLowerCase().includes('detalle');
          return (
            <div key={idx}>
              <label className="block text-[11px] text-gray-400 mb-1 uppercase font-bold font-mono">
                {field}
              </label>
              {isTextArea ? (
                <textarea
                  value={formData[fieldKey] || ''}
                  onChange={(e) => setFormData({ ...formData, [fieldKey]: e.target.value })}
                  placeholder={`Introduce ${field.toLowerCase()}...`}
                  className="w-full bg-zinc-900 border border-ya-gray text-white p-2 text-xs"
                  rows={2}
                />
              ) : (
                <input
                  required={idx === 0}
                  type={field.toLowerCase().includes('email') ? 'email' : field.toLowerCase().includes('tel') ? 'tel' : 'text'}
                  value={formData[fieldKey] || ''}
                  onChange={(e) => setFormData({ ...formData, [fieldKey]: e.target.value })}
                  placeholder={`Introduce tu ${field.toLowerCase()}...`}
                  className="w-full bg-zinc-900 border border-ya-gray text-white p-2 text-xs"
                />
              )}
            </div>
          );
        })}
        <button
          disabled={saving}
          type="submit"
          className="w-full bg-ya-lime text-ya-black font-black uppercase py-2.5 text-xs hover:bg-white transition-colors"
        >
          {saving ? 'Guardando...' : 'Confirmar Datos del Premio'}
        </button>
      </div>
    </form>
  );
}

export const DropGameEngine: React.FC<DropGameEngineProps> = ({
  dropPayload,
  orderId,
  isTestMode = false,
  onFinished,
  onClose,
}) => {
  const drop = dropPayload.drop;

  // Estados del ciclo de vida
  const [eligibilityChecking, setEligibilityChecking] = useState(!isTestMode);
  const [isEligible, setIsEligible] = useState(isTestMode);
  const [ineligibleReason, setIneligibleReason] = useState<string | null>(null);

  // Estados de ejecución
  const [isPlaying, setIsPlaying] = useState(false);
  const [playResult, setPlayResult] = useState<PlayDropResult | null>(null);
  const [reelsFinished, setReelsFinished] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [coinChoice, setCoinChoice] = useState<'cara' | 'cruz' | null>(() => {
    try {
      return (localStorage.getItem(`ya_drop_${drop?.id}_choice_${orderId || 'user'}`) as 'cara' | 'cruz') || null;
    } catch (_) {
      return null;
    }
  });
  const [trileChoice, setTrileChoice] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(`ya_drop_${drop?.id}_trile_choice_${orderId || 'user'}`);
      return saved !== null ? Number(saved) : null;
    } catch (_) {
      return null;
    }
  });

  // Clave de idempotencia única para esta sesión de tirada
  const [idempotencyKey] = useState<string>(
    () => `drop_${drop?.id}_${orderId || (isTestMode ? 'test_admin' : 'free')}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );

  // Manejo de scroll del body y cierre seguro restaurando interacción
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow || '';
    };
  }, []);

  const handleClose = () => {
    document.body.style.overflow = '';
    if (onClose) {
      onClose();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // 1. Validar elegibilidad al montar
  useEffect(() => {
    let isMounted = true;

    async function verify() {
      if (!drop) {
        setEligibilityChecking(false);
        return;
      }

      // En MODO PRUEBA (Admin), se ignora cualquier requisito de pedido, trigger o fechas
      if (isTestMode) {
        setIsEligible(true);
        setEligibilityChecking(false);
        return;
      }

      setEligibilityChecking(true);
      const res = await checkDropEligibility(drop.id, orderId, drop.activation_trigger);
      if (isMounted) {
        setIsEligible(res.eligible);
        if (!res.eligible) {
          const trigger = drop.activation_trigger || 'after_payment';
          if (res.reason === 'already_played') {
            setIneligibleReason('Ya has participado en este Drop con tu pedido actual.');
            // Si ya ha participado, restauramos su intento previo para mantener resultado inamovible tras refresh
            if (res.attempt_id) {
              const restoredResult: PlayDropResult = {
                success: true,
                outcome: (res.outcome || 'consolation') as any,
                attempt_id: res.attempt_id,
                prize_id: res.prize_id || undefined,
                awarded_prize_id: res.awarded_prize_id || undefined,
                prize: res.prize
                  ? {
                      id: res.prize.id,
                      awarded_prize_id: res.awarded_prize_id || res.attempt_id,
                      name: res.prize.name,
                      description: res.prize.description,
                      prize_type: res.prize.prize_type,
                      prize_value: res.prize.prize_value,
                      validity_days: res.prize.validity_days || drop.prize_validity_days || 7,
                      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
                    }
                  : undefined,
                consolation_entries:
                  res.consolation?.entries_awarded || drop.consolation_config?.entries_count || 2,
                consolation: res.consolation,
              };
              setPlayResult(restoredResult);
              setReelsFinished(true);
            }
          } else if (res.reason === 'authentication_required') {
            setIneligibleReason('Debes iniciar sesión para desbloquear tu Drop.');
          } else if (res.reason === 'order_required') {
            if (trigger === 'after_delivery') {
              setIneligibleReason('Este Drop se desbloquea tras la entrega de tu pedido.');
            } else {
              setIneligibleReason('Este Drop se activa inmediatamente al confirmar el pago de un pedido.');
            }
          } else if (res.reason === 'order_not_eligible_for_delivery') {
            setIneligibleReason('Tu pedido está en camino. El Drop estará disponible cuando sea entregado.');
          } else if (res.reason === 'order_not_eligible') {
            setIneligibleReason('El pago de tu pedido aún está pendiente de confirmación.');
          } else {
            setIneligibleReason('Esta promoción no está disponible actualmente.');
          }
        }
        setEligibilityChecking(false);
      }
    }

    verify();

    return () => {
      isMounted = false;
    };
  }, [drop?.id, orderId, drop?.activation_trigger, isTestMode]);

  const activeGameKey = drop?.game_key || drop?.game_type || 'jackpot';

  // 2. Disparar tirada autoritativa en el servidor
  const handlePlay = async (playerChoice?: 'cara' | 'cruz') => {
    if (!drop || isPlaying || playResult || !isEligible) return;

    if (playerChoice) {
      setCoinChoice(playerChoice);
      try {
        localStorage.setItem(`ya_drop_${drop.id}_choice_${orderId || 'user'}`, playerChoice);
      } catch (_) {}
    }

    setIsPlaying(true);
    setReelsFinished(false);
    setErrorMessage(null);

    try {
      let result: PlayDropResult;

      if (isTestMode) {
        // En MODO PRUEBA: simulación autoritativa aislada de producción
        result = await adminTestPlayDrop(drop.id);
      } else {
        // En PRODUCCIÓN: llamada autoritativa 100% en backend
        result = await playDrop(drop.id, orderId, idempotencyKey, drop.activation_trigger);
      }

      // Entregar el resultado al juego para que coordine la desaceleración mecánica o el billete de rascado
      setPlayResult(result);

      // Si no es jackpot, scratch, cara_cruz, coin_flip ni trile, finalizar tras timeout estándar
      const gameKey = drop.game_key || drop.game_type || 'jackpot';
      if (
        gameKey !== 'jackpot' &&
        gameKey !== 'scratch' &&
        gameKey !== 'cara_cruz' &&
        gameKey !== 'coin_flip' &&
        gameKey !== 'trile'
      ) {
        setTimeout(() => {
          setReelsFinished(true);
          if (onFinished) {
            onFinished(result);
          }
        }, 1600);
      }
    } catch (err: any) {
      console.error('[DropGameEngine] Error al jugar drop:', err);
      setErrorMessage(err?.message || 'No se pudo conectar con el servidor para validar el juego.');
    } finally {
      setIsPlaying(false);
    }
  };

  // Si el juego es 'scratch' o 'trile' y el usuario es elegible, resolver autoritativamente en servidor
  // antes de que el usuario empiece a interactuar, cumpliendo el principio de que el resultado ya existe bajo la capa o cartas
  useEffect(() => {
    if (
      isEligible &&
      !eligibilityChecking &&
      (activeGameKey === 'scratch' || activeGameKey === 'trile') &&
      !playResult &&
      !isPlaying &&
      !reelsFinished
    ) {
      handlePlay();
    }
  }, [isEligible, eligibilityChecking, activeGameKey, playResult, isPlaying, reelsFinished]);

  const handlePickTrileCard = (cardIndex: number) => {
    setTrileChoice(cardIndex);
    try {
      localStorage.setItem(`ya_drop_${drop?.id}_trile_choice_${orderId || 'user'}`, String(cardIndex));
    } catch (_) {}
    if (!playResult && !isPlaying) {
      handlePlay();
    }
  };

  if (!drop) {
    return null;
  }

  // Renderizador dinámico del juego según game_key o game_type
  const renderGame = () => {
    const gameType = drop.game_key || drop.game_type || 'jackpot';
    switch (gameType) {
      case 'trile':
        return (
          <TrileGame
            isPlaying={isPlaying}
            result={playResult}
            prizes={dropPayload?.prizes}
            initialChoice={trileChoice}
            onPickCard={handlePickTrileCard}
            onAnimationFinished={() => {
              setReelsFinished(true);
              if (onFinished && playResult) {
                onFinished(playResult);
              }
            }}
            disabled={!isEligible}
            isTestMode={isTestMode}
          />
        );
      case 'cara_cruz':
      case 'coin_flip':
        return (
          <CoinFlipGame
            isFlipping={isPlaying}
            result={playResult}
            prizes={dropPayload?.prizes}
            initialChoice={coinChoice}
            onFlip={(choice) => handlePlay(choice)}
            onAnimationFinished={() => {
              setReelsFinished(true);
              if (onFinished && playResult) {
                onFinished(playResult);
              }
            }}
            disabled={!isEligible}
            isTestMode={isTestMode}
          />
        );
      case 'mystery_box':
        return (
          <MysteryBoxGame
            isOpening={isPlaying}
            result={playResult}
            onSelectBox={() => handlePlay()}
            disabled={!isEligible}
          />
        );
      case 'scratch':
        return (
          <ScratchGame
            isScratching={isPlaying}
            result={playResult}
            prizes={dropPayload?.prizes}
            onScratch={() => handlePlay()}
            onScratchFinished={() => {
              setReelsFinished(true);
              if (onFinished && playResult) {
                onFinished(playResult);
              }
            }}
            disabled={!isEligible}
          />
        );
      case 'wheel':
        return (
          <WheelGame
            isSpinning={isPlaying}
            result={playResult}
            onSpin={() => handlePlay()}
            disabled={!isEligible}
          />
        );
      case 'pick_one':
        return (
          <PickOneGame
            isPicking={isPlaying}
            result={playResult}
            onPick={() => handlePlay()}
            disabled={!isEligible}
          />
        );
      case 'jackpot':
      default:
        return (
          <JackpotGame
            isSpinning={isPlaying}
            result={playResult}
            onSpin={() => handlePlay()}
            disabled={!isEligible}
            onReelsFinished={() => {
              setReelsFinished(true);
              if (onFinished && playResult) {
                onFinished(playResult);
              }
            }}
          />
        );
    }
  };

  return (
    <div className="relative bg-ya-black text-white p-6 border-4 border-ya-gray shadow-2xl max-w-lg w-full mx-auto max-h-[90vh] overflow-y-auto">
      {/* Botón X claramente visible en la esquina superior derecha del modal */}
      {onClose && (
        <button
          type="button"
          id="btn-close-drop-modal"
          onClick={handleClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-30 p-2 text-white bg-zinc-900 border-2 border-ya-gray hover:border-ya-lime hover:text-ya-lime hover:bg-zinc-800 transition-all shadow-lg cursor-pointer flex items-center justify-center min-w-[40px] min-h-[40px]"
          title="Cerrar modal"
          aria-label="Cerrar modal"
        >
          <X size={22} className="stroke-[2.5]" />
        </button>
      )}

      {/* Cabecera del Drop */}
      <div className="mb-6 text-center">
        {/* Banner destacado de MODO PRUEBA */}
        {isTestMode && (
          <div className="mb-4 p-3 border-2 border-amber-400 bg-amber-400/15 text-amber-200 text-xs font-mono text-center flex flex-col items-center justify-center gap-1 shadow-md">
            <div className="flex items-center gap-1.5 font-black uppercase text-amber-300">
              <AlertTriangle size={16} />
              <span>⚠ MODO PRUEBA — SIMULACIÓN DE ADMIN</span>
            </div>
            <p className="text-[11px] text-amber-200/90 max-w-sm">
              Prueba en vivo del juego y probabilidades. No consume intentos reales ni modifica pedidos ni premios de producción.
            </p>
          </div>
        )}

        <div className="inline-flex items-center gap-2 px-3 py-1 bg-ya-lime text-ya-black font-black font-mono text-[11px] uppercase tracking-wider mb-2">
          <span>DROP #{drop.drop_number}</span>
          <span>•</span>
          <span>SEMANAL</span>
        </div>
        <h2 className="text-2xl font-black uppercase tracking-tight text-white mb-1">
          {drop.title}
        </h2>
        {drop.description && (
          <p className="text-xs text-gray-400 max-w-sm mx-auto">{drop.description}</p>
        )}
      </div>

      {/* Estado: Comprobando elegibilidad */}
      {eligibilityChecking && (
        <div className="py-12 text-center text-xs font-mono uppercase tracking-widest text-ya-lime animate-pulse">
          Comprobando condiciones de participación...
        </div>
      )}

      {/* Estado: No elegible */}
      {!eligibilityChecking && !isEligible && (
        <div className="p-5 border-2 border-ya-gray bg-ya-gray/30 text-center mb-4">
          <AlertCircle size={28} className="text-amber-400 mx-auto mb-2" />
          <h4 className="text-sm font-black uppercase text-white mb-1">
            Participación no disponible
          </h4>
          <p className="text-xs text-gray-400 mb-4">{ineligibleReason}</p>
          {onClose && (
            <button
              type="button"
              onClick={handleClose}
              className="py-2.5 px-4 bg-ya-gray text-white font-black uppercase text-xs hover:bg-white hover:text-ya-black transition-colors cursor-pointer"
            >
              Entendido
            </button>
          )}
        </div>
      )}

      {/* Estado: Elegible y listo para jugar */}
      {!eligibilityChecking && isEligible && (
        <>
          {renderGame()}

          {/* Error de ejecución si hubiese */}
          {errorMessage && (
            <div className="mt-4 p-3 border border-red-500 bg-red-950/40 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Tarjeta de Resultado revelado (mostrada tras la parada completa de rodillos o rascado del billete) */}
          {playResult && reelsFinished && (
            <div id="jackpot-results-modal-card" className="mt-6 transition-all duration-500 animate-fadeIn relative">
              {/* Botón X claramente visible en la esquina superior derecha del modal de resultados */}
              {onClose && (
                <button
                  type="button"
                  id="btn-close-jackpot-results"
                  onClick={handleClose}
                  className="absolute -top-3 -right-2 z-30 p-1.5 text-white bg-ya-black border-2 border-ya-lime hover:bg-ya-lime hover:text-ya-black transition-all shadow-xl cursor-pointer flex items-center justify-center min-w-[36px] min-h-[36px]"
                  title="Cerrar resultados del Jackpot"
                  aria-label="Cerrar resultados del Jackpot"
                >
                  <X size={20} className="stroke-[2.5]" />
                </button>
              )}

              {/* Indicador de MODO PRUEBA en Resultados */}
              {(isTestMode || playResult.is_test_mode) && (
                <div className="mb-3 px-3 py-2 bg-amber-400/20 border-2 border-amber-400 text-amber-300 text-xs font-mono font-bold uppercase text-center flex items-center justify-center gap-2">
                  <AlertTriangle size={15} className="shrink-0" />
                  <span>MODO PRUEBA: Resultado de simulación. No se ha otorgado ningún premio real.</span>
                </div>
              )}

              {playResult.outcome === 'won_prize' && playResult.prize ? (
                // PREMIO GANADO
                <div className="border-2 border-ya-lime bg-ya-lime/10 p-5 text-center">
                  <div className="w-12 h-12 bg-ya-lime text-ya-black flex items-center justify-center mx-auto mb-3">
                    <Gift size={26} />
                  </div>
                  <span className="text-[10px] font-black uppercase font-mono tracking-widest text-ya-lime">
                    {activeGameKey === 'cara_cruz' || activeGameKey === 'coin_flip'
                      ? '¡HAS ACERTADO!'
                      : '¡ENHORABUENA! HAS GANADO'}
                  </span>
                  <h3 className="text-2xl font-black uppercase text-white mt-1 mb-2">
                    {activeGameKey === 'cara_cruz' || activeGameKey === 'coin_flip'
                      ? 'HAS GANADO'
                      : playResult.prize.name}
                  </h3>
                  {(activeGameKey === 'cara_cruz' || activeGameKey === 'coin_flip') && (
                    <div className="text-xl font-bold uppercase text-ya-lime font-mono mb-2">
                      {playResult.prize.name}
                    </div>
                  )}
                  {playResult.prize.description && (
                    <p className="text-xs text-gray-300 mb-3">
                      {playResult.prize.description}
                    </p>
                  )}
                  <div className="inline-flex items-center gap-1.5 text-xs font-mono text-gray-400 bg-ya-black px-3 py-1.5 border border-ya-gray mb-4">
                    <Clock size={14} className="text-ya-lime" />
                    <span>
                      Válido durante {playResult.prize.validity_days} días (hasta{' '}
                      {formatMadridDate(playResult.prize.expires_at)})
                    </span>
                  </div>

                  <div className="text-xs text-gray-300">
                    {isTestMode
                      ? 'Simulación técnica: el cupón y premio se mostrarían aquí al cliente final.'
                      : 'Tu cupón ha quedado registrado en tu cuenta de YA y podrás aplicarlo en tu próximo pedido.'}
                  </div>
                  {playResult.prize.prize_type === 'custom' && (
                    <CustomPrizeForm
                      prizeId={playResult.prize.awarded_prize_id!}
                      prizeConfig={
                        dropPayload.prizes?.find((p) => p.name === playResult.prize?.name)?.prize_config
                      }
                      isTestMode={isTestMode}
                      onSaved={() => {}}
                    />
                  )}

                </div>
              ) : (
                // CONSOLACIÓN: PARTICIPACIÓN EN EL SORTEO MENSUAL
                <div className="border-2 border-amber-400/80 bg-amber-950/20 p-5 text-center">
                  <div className="w-12 h-12 bg-amber-400 text-ya-black flex items-center justify-center mx-auto mb-3">
                    <Trophy size={26} />
                  </div>
                  <span className="text-[10px] font-black uppercase font-mono tracking-widest text-amber-400">
                    {activeGameKey === 'cara_cruz' || activeGameKey === 'coin_flip'
                      ? 'NO ESTA VEZ'
                      : 'RECOMPENSA DE DROP'}
                  </span>
                  <h3 className="text-xl font-black uppercase text-white mt-1 mb-2">
                    +{playResult.consolation_entries || playResult.consolation?.entries_awarded || drop.consolation_config?.entries_count || 1} PARTICIPACIONES PARA EL SORTEO MENSUAL
                  </h3>
                  <p className="text-xs text-gray-300 mb-4">
                    {playResult.consolation?.draw_title ? (
                      <>
                        Añadida a tu cuenta para el{' '}
                        <strong className="text-white">
                          {playResult.consolation.draw_title}
                        </strong>
                        .
                      </>
                    ) : (
                      'Participación acumulada en tu cuenta para el sorteo del mes.'
                    )}
                  </p>
                  <div className="inline-flex items-center gap-2 text-xs font-mono text-amber-300 bg-ya-black px-4 py-2 border border-amber-400/40">
                    <Ticket size={16} />
                    <span>¡Tienes una oportunidad más para ganar el gran premio!</span>
                  </div>
                </div>
              )}

              {/* Botón PROBAR DE NUEVO en Modo Prueba */}
              {isTestMode && (
                <button
                  type="button"
                  id="btn-replay-test-drop"
                  onClick={() => {
                    setPlayResult(null);
                    setReelsFinished(false);
                    setErrorMessage(null);
                    setCoinChoice(null);
                    if (activeGameKey === 'scratch') {
                      setTimeout(() => {
                        handlePlay();
                      }, 100);
                    }
                  }}
                  className="mt-3 w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-ya-black font-black uppercase text-xs tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow font-mono"
                >
                  <RotateCcw size={15} />
                  <span>Probar de Nuevo (Simular otra tirada)</span>
                </button>
              )}

              {onClose && (
                <button
                  type="button"
                  id="btn-continue-drop-modal"
                  onClick={handleClose}
                  className="mt-5 w-full py-3 bg-white text-ya-black font-black uppercase tracking-wider text-xs hover:bg-ya-lime transition-colors cursor-pointer"
                >
                  Continuar
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
