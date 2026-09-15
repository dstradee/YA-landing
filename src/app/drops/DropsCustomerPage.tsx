// ==============================================================================
// YA - PÁGINA CLIENTE: DROPS SEMANALES & SORTEO MENSUAL
// Archivo: src/app/drops/DropsCustomerPage.tsx
// ==============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Gift,
  Trophy,
  Ticket,
  Sparkles,
  ArrowRight,
  Zap,
} from 'lucide-react';
import {
  fetchActiveDrop,
  fetchActiveMonthlyDraw,
  fetchUserAwardedPrizes,
  formatMadridDate,
} from '../../lib/drops';
import type {
  ActiveDropPayload,
  ActiveMonthlyDrawPayload,
  DbUserAwardedPrize,
} from '../../types/drops';
import { useAuth } from '../../lib/auth';
import { DropGameEngine } from '../../components/drops/DropGameEngine';
import { euro } from '../../data/products';

export function DropsCustomerPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [activeDrop, setActiveDrop] = useState<ActiveDropPayload | null>(null);
  const [activeDraw, setActiveDraw] = useState<ActiveMonthlyDrawPayload | null>(null);
  const [myPrizes, setMyPrizes] = useState<DbUserAwardedPrize[]>([]);
  const [showGameModal, setShowGameModal] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [dropRes, drawRes, prizesRes] = await Promise.all([
          fetchActiveDrop(),
          fetchActiveMonthlyDraw(),
          user ? fetchUserAwardedPrizes() : Promise.resolve([]),
        ]);
        setActiveDrop(dropRes);
        setActiveDraw(drawRes);
        setMyPrizes(prizesRes);
      } catch (err) {
        console.error('[DropsCustomerPage] Error al cargar promociones:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-ya-black text-white flex items-center justify-center p-4">
        <div className="text-center font-mono text-xs uppercase tracking-widest text-ya-lime animate-pulse">
          Cargando Drops y Sorteos YA...
        </div>
      </div>
    );
  }

  const hasActiveDrop = activeDrop && activeDrop.active && activeDrop.drop;
  const hasActiveDraw = activeDraw && activeDraw.active && activeDraw.draw;

  return (
    <div className="min-h-screen bg-ya-black text-white pb-24">
      {/* Cabecera */}
      <div className="border-b-2 border-ya-gray bg-ya-gray/20 py-8 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-ya-lime text-ya-black font-black font-mono text-xs uppercase tracking-wider mb-3">
            <Zap size={14} />
            <span>DROPS & SORTEO MENSUAL</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white mb-2">
            Recompensas Exclusivas YA
          </h1>
          <p className="text-sm text-gray-300 max-w-xl">
            Cada pedido en YA te da acceso al Drop semanal con premios inmediatos y
            participaciones directas en el gran Sorteo Mensual.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-8 space-y-10">
        {/* SECCIÓN 1: DROP SEMANAL ACTIVO */}
        <section id="active-drop-section">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
              <Gift size={20} className="text-ya-lime" />
              <span>Drop Semanal Activo</span>
            </h2>
            {hasActiveDrop && (
              <span className="font-mono text-xs text-gray-400">
                Hasta {formatMadridDate(activeDrop.drop!.ends_at)}
              </span>
            )}
          </div>

          {hasActiveDrop ? (
            <div className="border-4 border-ya-lime bg-ya-black p-6 sm:p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 transform translate-x-8 -translate-y-8 w-32 h-32 bg-ya-lime/10 rounded-full blur-2xl pointer-events-none" />

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-ya-lime uppercase tracking-widest mb-2">
                    <span>DROP #{activeDrop.drop!.drop_number}</span>
                    <span>•</span>
                    <span className="uppercase">{activeDrop.drop!.game_type}</span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white mb-2">
                    {activeDrop.drop!.title}
                  </h3>
                  <p className="text-sm text-gray-300 max-w-lg mb-4 leading-relaxed">
                    {activeDrop.drop!.description ||
                      'Participa completando un pedido en YA. Tienes premio directo o participaciones garantizadas en el Sorteo Mensual.'}
                  </p>

                  <div className="flex flex-wrap gap-2 text-xs font-mono text-gray-400">
                    <span className="bg-ya-gray/60 px-2.5 py-1 border border-ya-gray">
                      Validez de premios: {activeDrop.drop!.prize_validity_days} días
                    </span>
                    <span className="bg-ya-gray/60 px-2.5 py-1 border border-ya-gray">
                      Disparador:{' '}
                      {activeDrop.drop!.activation_trigger === 'after_delivery'
                        ? 'Tras entrega del pedido'
                        : activeDrop.drop!.activation_trigger === 'free'
                        ? 'Tirada gratis'
                        : 'Tras confirmar el pago'}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setShowGameModal(true)}
                    className="py-3.5 px-6 bg-ya-lime text-ya-black font-black uppercase text-sm tracking-wider hover:bg-white transition-all flex items-center justify-center gap-2 shadow-lg shadow-ya-lime/10"
                  >
                    <Sparkles size={18} />
                    <span>Jugar Mi Drop</span>
                  </button>
                  <span className="text-[11px] text-center text-gray-400 font-mono">
                    {activeDrop.drop!.activation_trigger === 'after_delivery'
                      ? 'Disponible tras la entrega del pedido'
                      : activeDrop.drop!.activation_trigger === 'free'
                      ? 'Tirada semanal gratuita'
                      : 'Disponible inmediatamente tras el pago'}
                  </span>
                </div>
              </div>

              {/* Premios en juego */}
              {activeDrop.prizes && activeDrop.prizes.length > 0 && (
                <div className="mt-6 pt-6 border-t-2 border-ya-gray">
                  <span className="text-xs font-mono uppercase text-gray-400 block mb-3">
                    Premios en juego en este Drop:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {activeDrop.prizes.map((p) => (
                      <div
                        key={p.id}
                        className="p-3 border border-ya-gray bg-ya-gray/20 flex items-center gap-3"
                      >
                        <div className="p-2 bg-ya-black border border-ya-gray text-ya-lime shrink-0">
                          <Gift size={16} />
                        </div>
                        <div className="overflow-hidden">
                          <span className="text-xs font-bold text-white block truncate">
                            {p.name}
                          </span>
                          <span className="text-[11px] text-gray-400 font-mono">
                            {p.prize_value > 0 ? `${euro(p.prize_value)} de valor` : 'Beneficio directo'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="border-2 border-ya-gray bg-ya-gray/20 p-8 text-center">
              <Gift size={32} className="text-gray-500 mx-auto mb-2" />
              <h3 className="text-base font-bold text-white mb-1">
                No hay ningún Drop activo en este momento
              </h3>
              <p className="text-xs text-gray-400">
                El próximo Drop semanal se activará muy pronto. ¡Permanece atento a las notificaciones!
              </p>
            </div>
          )}
        </section>

        {/* SECCIÓN 2: SORTEO MENSUAL */}
        <section id="monthly-draw-section">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
              <Trophy size={20} className="text-amber-400" />
              <span>Gran Sorteo Mensual</span>
            </h2>
            {hasActiveDraw && (
              <span className="font-mono text-xs text-gray-400">
                Cierre: {formatMadridDate(activeDraw.draw!.ends_at, false)}
              </span>
            )}
          </div>

          {hasActiveDraw ? (
            <div className="border-2 border-amber-400/80 bg-ya-gray/30 p-6 sm:p-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-widest block mb-1">
                    MES: {activeDraw.draw!.month_identifier}
                  </span>
                  <h3 className="text-2xl font-black uppercase tracking-tight text-white mb-2">
                    {activeDraw.draw!.title}
                  </h3>
                  <div className="text-sm text-gray-300 mb-4 max-w-lg">
                    Premio del mes:{' '}
                    <strong className="text-amber-300 font-black">
                      {activeDraw.draw!.prize_title}
                    </strong>{' '}
                    {activeDraw.draw!.prize_value > 0 && `(Valor aprox: ${euro(activeDraw.draw!.prize_value)})`}
                  </div>

                  <p className="text-xs text-gray-400 max-w-lg">
                    Todas las tiradas de Drop que no obtienen premio directo se convierten automáticamente en
                    participaciones para este sorteo.
                  </p>
                </div>

                {/* Marcador de Participaciones del Usuario */}
                <div className="border-2 border-amber-400/60 bg-ya-black p-5 text-center shrink-0 min-w-[200px]">
                  <Ticket size={24} className="text-amber-400 mx-auto mb-1" />
                  <span className="text-[10px] font-mono uppercase text-gray-400 block">
                    Tus Participaciones
                  </span>
                  <div className="text-3xl font-black text-amber-300 font-mono my-1">
                    {activeDraw.user_entries_count}
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">
                    {activeDraw.total_entries_count} participaciones totales
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-2 border-ya-gray bg-ya-gray/20 p-8 text-center">
              <Trophy size={32} className="text-gray-500 mx-auto mb-2" />
              <h3 className="text-base font-bold text-white mb-1">
                Sorteo Mensual en preparación
              </h3>
              <p className="text-xs text-gray-400">
                El sorteo del mes se anunciará en breve. Todas tus participaciones se vincularán al nuevo ciclo.
              </p>
            </div>
          )}
        </section>

        {/* SECCIÓN 3: MIS PREMIOS GANADOS */}
        {user && (
          <section id="my-prizes-section">
            <h2 className="text-lg font-black uppercase tracking-tight text-white mb-4 flex items-center gap-2">
              <Gift size={20} className="text-ya-lime" />
              <span>Mis Premios de Drops</span>
            </h2>

            {myPrizes.length === 0 ? (
              <div className="border-2 border-ya-gray bg-ya-gray/20 p-6 text-center text-xs text-gray-400">
                Aún no tienes premios registrados. ¡Completa un pedido para activar tu próximo Drop!
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {myPrizes.map((pz) => (
                  <div
                    key={pz.id}
                    className={`p-4 border-2 bg-ya-black flex flex-col justify-between ${
                      pz.status === 'pending'
                        ? 'border-ya-lime'
                        : pz.status === 'used'
                        ? 'border-ya-gray opacity-70'
                        : 'border-red-500/40 opacity-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 ${
                            pz.status === 'pending'
                              ? 'bg-ya-lime text-ya-black'
                              : pz.status === 'used'
                              ? 'bg-ya-gray text-white'
                              : 'bg-red-500/20 text-red-300'
                          }`}
                        >
                          {pz.status === 'pending'
                            ? 'DISPONIBLE'
                            : pz.status === 'used'
                            ? 'CANJEADO'
                            : 'EXPIRADO'}
                        </span>
                        <span className="text-[11px] font-mono text-gray-400">
                          {formatMadridDate(pz.awarded_at, false)}
                        </span>
                      </div>

                      <h4 className="text-base font-black uppercase text-white mb-1">
                        {pz.prize_name}
                      </h4>
                      {pz.prize_value > 0 && (
                        <span className="text-sm font-black text-ya-lime block mb-2">
                          Valor: {euro(pz.prize_value)}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t border-ya-gray/60 flex items-center justify-between text-xs font-mono text-gray-400">
                      <span>
                        {pz.status === 'pending'
                          ? `Válido hasta ${formatMadridDate(pz.expires_at, false)}`
                          : pz.status === 'used'
                          ? 'Canjeado en pedido'
                          : 'Expiró'}
                      </span>
                      {pz.status === 'pending' && (
                        <Link
                          to="/app"
                          className="text-ya-lime font-black uppercase hover:underline flex items-center gap-1"
                        >
                          Usar YA
                          <ArrowRight size={14} />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Modal de juego Drop */}
      {showGameModal && hasActiveDrop && (
        <div
          id="drop-game-backdrop"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto cursor-pointer"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              document.body.style.overflow = '';
              setShowGameModal(false);
            }
          }}
        >
          <div
            id="drop-game-container"
            className="w-full max-w-lg my-auto relative cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <DropGameEngine
              dropPayload={activeDrop}
              onClose={() => {
                document.body.style.overflow = '';
                setShowGameModal(false);
              }}
              onFinished={() => {
                // Recargar premios tras jugar
                if (user) {
                  fetchUserAwardedPrizes().then(setMyPrizes);
                  fetchActiveMonthlyDraw().then(setActiveDraw);
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
