// ==============================================================================
// YA - MOTOR PRINCIPAL DE JUEGO DE DROPS (DropGameEngine)
// Archivo: src/components/drops/DropGameEngine.tsx
// ==============================================================================

import React, { useState, useEffect } from 'react';
import {
  Gift,
  Trophy,
  AlertCircle,
  Clock,
  X,
  Ticket,
} from 'lucide-react';
import { checkDropEligibility, playDrop, formatMadridDate, saveAwardedPrizeCustomData } from '../../lib/drops';
import type { ActiveDropPayload, PlayDropResult } from '../../types/drops';
import { JackpotGame } from './games/JackpotGame';
import { CoinFlipGame } from './games/CoinFlipGame';
import { MysteryBoxGame } from './games/MysteryBoxGame';
import { ScratchGame, WheelGame, PickOneGame } from './games/ScratchGame';

interface DropGameEngineProps {
  dropPayload: ActiveDropPayload;
  orderId?: string;
  onFinished?: (result: PlayDropResult) => void;
  onClose?: () => void;
}


function CustomPrizeForm({
  prizeId,
  prizeConfig,
  onSaved,
}: {
  prizeId: string;
  prizeConfig?: Record<string, any>;
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
        ¡Datos guardados correctamente! Nos pondremos en contacto contigo para entregarte tu premio.
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
  onFinished,
  onClose,
}) => {
  const drop = dropPayload.drop;

  // Estados del ciclo de vida
  const [eligibilityChecking, setEligibilityChecking] = useState(true);
  const [isEligible, setIsEligible] = useState(false);
  const [ineligibleReason, setIneligibleReason] = useState<string | null>(null);

  // Estados de ejecución
  const [isPlaying, setIsPlaying] = useState(false);
  const [playResult, setPlayResult] = useState<PlayDropResult | null>(null);
  const [reelsFinished, setReelsFinished] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Clave de idempotencia única para esta sesión de tirada
  const [idempotencyKey] = useState<string>(
    () => `drop_${drop?.id}_${orderId || 'free'}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );

  // 1. Validar elegibilidad al montar
  useEffect(() => {
    let isMounted = true;

    async function verify() {
      if (!drop) {
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
  }, [drop?.id, orderId, drop?.activation_trigger]);

  // 2. Disparar tirada autoritativa en el servidor
  const handlePlay = async () => {
    if (!drop || isPlaying || playResult || !isEligible) return;

    setIsPlaying(true);
    setReelsFinished(false);
    setErrorMessage(null);

    try {
      // Llamada autoritativa 100% en backend
      const result = await playDrop(drop.id, orderId, idempotencyKey, drop.activation_trigger);

      // Entregar el resultado al juego para que coordine la desaceleración mecánica de los carretes
      setPlayResult(result);

      // Si no es jackpot, finalizar tras timeout estándar
      if ((drop.game_type || 'jackpot') !== 'jackpot') {
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

  if (!drop) {
    return null;
  }

  // Renderizador dinámico del juego según game_type
  const renderGame = () => {
    const gameType = drop.game_type || 'jackpot';
    switch (gameType) {
      case 'coin_flip':
        return (
          <CoinFlipGame
            isFlipping={isPlaying}
            result={playResult}
            onFlip={handlePlay}
            disabled={!isEligible}
          />
        );
      case 'mystery_box':
        return (
          <MysteryBoxGame
            isOpening={isPlaying}
            result={playResult}
            onSelectBox={handlePlay}
            disabled={!isEligible}
          />
        );
      case 'scratch':
        return (
          <ScratchGame
            isScratching={isPlaying}
            result={playResult}
            onScratch={handlePlay}
            disabled={!isEligible}
          />
        );
      case 'wheel':
        return (
          <WheelGame
            isSpinning={isPlaying}
            result={playResult}
            onSpin={handlePlay}
            disabled={!isEligible}
          />
        );
      case 'pick_one':
        return (
          <PickOneGame
            isPicking={isPlaying}
            result={playResult}
            onPick={handlePlay}
            disabled={!isEligible}
          />
        );
      case 'jackpot':
      default:
        return (
          <JackpotGame
            isSpinning={isPlaying}
            result={playResult}
            onSpin={handlePlay}
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
    <div className="relative bg-ya-black text-white p-6 border-4 border-ya-gray shadow-2xl max-w-lg w-full mx-auto">
      {/* Botón de cerrar */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white hover:bg-ya-gray transition-colors"
          title="Cerrar ventana"
        >
          <X size={20} />
        </button>
      )}

      {/* Cabecera del Drop */}
      <div className="mb-6 text-center">
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
              onClick={onClose}
              className="py-2.5 px-4 bg-ya-gray text-white font-black uppercase text-xs hover:bg-white hover:text-ya-black transition-colors"
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

          {/* Tarjeta de Resultado revelado (mostrada tras la parada completa de los rodillos) */}
          {playResult && ((drop.game_type || 'jackpot') !== 'jackpot' || reelsFinished) && (
            <div className="mt-6 transition-all duration-500 animate-fadeIn">
              {playResult.outcome === 'won_prize' && playResult.prize ? (
                // PREMIO GANADO
                <div className="border-2 border-ya-lime bg-ya-lime/10 p-5 text-center">
                  <div className="w-12 h-12 bg-ya-lime text-ya-black flex items-center justify-center mx-auto mb-3">
                    <Gift size={26} />
                  </div>
                  <span className="text-[10px] font-black uppercase font-mono tracking-widest text-ya-lime">
                    ¡ENHORABUENA! HAS GANADO
                  </span>
                  <h3 className="text-2xl font-black uppercase text-white mt-1 mb-2">
                    {playResult.prize.name}
                  </h3>
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
                    Tu cupón ha quedado registrado en tu cuenta de YA y podrás aplicarlo en tu próximo pedido.
                  </div>
                  {playResult.prize.prize_type === 'custom' && (
                    <CustomPrizeForm
                      prizeId={playResult.prize.awarded_prize_id!}
                      prizeConfig={
                        dropPayload.prizes?.find((p) => p.name === playResult.prize?.name)?.prize_config
                      }
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
                    RECOMPENSA DE DROP
                  </span>
                  <h3 className="text-xl font-black uppercase text-white mt-1 mb-2">
                    +1 PARTICIPACIÓN EN EL SORTEO MENSUAL
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

              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-5 w-full py-3 bg-white text-ya-black font-black uppercase tracking-wider text-xs hover:bg-ya-lime transition-colors"
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
