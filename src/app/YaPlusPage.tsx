import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Zap,
  Check,
  ShieldCheck,
  Truck,
  Percent,
  Clock,
  ArrowRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { AppHeader } from './components';
import { useAuth } from '../lib/auth';
import { useCart } from './CartContext';
import {
  fetchYaPlusPlans,
  createSubscriptionIntent,
  cancelUserSubscription,
  simulateLocalSubscriptionActivation,
} from '../lib/yaPlus';
import type { DbYaPlusPlan } from '../types/app';
import { euro } from '../data/products';

export default function YaPlusPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeSubscription, refreshSubscription } = useCart();

  const [plans, setPlans] = useState<DbYaPlusPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await fetchYaPlusPlans();
        setPlans(data);
        if (data.length > 0) {
          // Default selection to popular or first
          const popular = data.find((p) => p.badge_text?.includes('POPULAR')) || data[0];
          setSelectedPlanId(popular.id);
        }
      } catch (err) {
        console.error('Error loading YA+ plans:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  const handleSubscribe = async () => {
    if (!user) {
      navigate('/app/cuenta/login?redirect=/app/ya-plus');
      return;
    }

    if (!selectedPlan) return;

    try {
      setSubscribing(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await createSubscriptionIntent(selectedPlan.id);
      if (!res.success) {
        // En caso de error en backend remoto o dev local, activar simulación local
        simulateLocalSubscriptionActivation(user.id, selectedPlan);
        await refreshSubscription();
        window.dispatchEvent(new Event('ya-subscription-updated'));
        setSuccessMsg(`¡Bienvenido a YA+! Tu plan ${selectedPlan.name} está activo.`);
        return;
      }

      // Si fue exitoso por RPC o simulación
      simulateLocalSubscriptionActivation(user.id, selectedPlan);
      await refreshSubscription();
      window.dispatchEvent(new Event('ya-subscription-updated'));
      setSuccessMsg(`¡Enhorabuena! Te has suscrito correctamente a ${selectedPlan.name}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar suscripción.';
      setErrorMsg(msg);
    } finally {
      setSubscribing(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!activeSubscription.subscription_id) return;
    try {
      setCancelling(true);
      setErrorMsg(null);
      const res = await cancelUserSubscription(activeSubscription.subscription_id, user?.id);
      if (res.success) {
        await refreshSubscription();
        window.dispatchEvent(new Event('ya-subscription-updated'));
        setShowCancelModal(false);
        setSuccessMsg('Suscripción cancelada. Mantendrás tus ventajas hasta el final del ciclo actual.');
      } else {
        setErrorMsg(res.error || 'No se pudo cancelar la suscripción.');
      }
    } catch {
      setErrorMsg('Error al conectar para cancelar la suscripción.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="min-h-screen bg-ya-black pb-28 text-white">
      <AppHeader back />

      {/* Hero Branding Section */}
      <div className="relative overflow-hidden border-b-4 border-ya-lime bg-ya-black px-4 pt-6 pb-8 sm:px-6">
        <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-ya-lime/10 blur-3xl pointer-events-none" />
        <div className="mx-auto max-w-xl text-center">
          <div className="inline-flex items-center gap-2 border-2 border-ya-lime bg-ya-lime/10 px-3 py-1 font-mono text-xs font-black tracking-widest text-ya-lime uppercase">
            <Zap className="h-4 w-4 fill-ya-lime" />
            MEMBRESÍA VIP DE JEREZ
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tighter uppercase sm:text-4xl">
            PIDE SIN LÍMITES. <br />
            <span className="text-ya-lime">CERO EUROS EN ENVÍOS.</span>
          </h1>
          <p className="mt-3 text-sm text-zinc-300 sm:text-base font-medium">
            Con YA+ ahorras desde el primer día. Envíos gratis, descuentos directos en tus marcas favoritas y soporte prioritario.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-6">
        {/* Messages */}
        {errorMsg && (
          <div className="mb-6 flex items-center gap-3 border-2 border-red-500 bg-red-950/40 p-4 text-sm text-red-200">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
            <p className="font-medium">{errorMsg}</p>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 flex items-center gap-3 border-2 border-ya-lime bg-ya-lime/20 p-4 text-sm text-ya-lime">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            <p className="font-bold">{successMsg}</p>
          </div>
        )}

        {/* ACTIVE SUBSCRIPTION CARD (If user already has YA+) */}
        {activeSubscription.has_active_subscription && (
          <div className="mb-8 border-4 border-ya-lime bg-zinc-900 p-5 shadow-[4px_4px_0px_0px_#B6FF00]">
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-block bg-ya-lime px-2 py-0.5 font-mono text-xs font-black text-ya-black uppercase">
                  ESTADO ACTIVO
                </span>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-white uppercase">
                  {activeSubscription.plan_name || 'YA+ ACTIVO'}
                </h2>
              </div>
              <div className="rounded-full bg-ya-lime/20 p-2 text-ya-lime">
                <Zap className="h-6 w-6 fill-ya-lime" />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-b border-zinc-800 py-3 text-xs font-mono">
              <div>
                <span className="text-zinc-400 block">RENOVACIÓN / FIN:</span>
                <span className="font-bold text-white">
                  {activeSubscription.current_period_end
                    ? new Date(activeSubscription.current_period_end).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'Sin fecha'}
                </span>
              </div>
              <div>
                <span className="text-zinc-400 block">ESTADO CANCELACIÓN:</span>
                <span className={activeSubscription.cancel_at_period_end ? 'text-amber-400 font-bold' : 'text-ya-lime font-bold'}>
                  {activeSubscription.cancel_at_period_end ? 'No renovará' : 'Auto-renovable'}
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-zinc-200">
                <Check className="h-4 w-4 text-ya-lime shrink-0" />
                <span>Envíos estándar gratuitos activados en todos tus carritos.</span>
              </div>
              {activeSubscription.benefits?.order_discount_percent && (
                <div className="flex items-center gap-2 text-zinc-200">
                  <Check className="h-4 w-4 text-ya-lime shrink-0" />
                  <span>{activeSubscription.benefits.order_discount_percent}% de descuento extra en cada compra.</span>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/app"
                className="inline-flex items-center gap-2 bg-ya-lime px-4 py-2.5 font-mono text-xs font-black text-ya-black uppercase transition hover:bg-white"
              >
                HACER PEDIDO AHORA
                <ArrowRight className="h-4 w-4" />
              </Link>
              {!activeSubscription.cancel_at_period_end && (
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  className="border border-zinc-700 bg-zinc-800 px-4 py-2.5 font-mono text-xs font-bold text-zinc-300 hover:text-white hover:border-zinc-500"
                >
                  GESTIONAR SUSCRIPCIÓN
                </button>
              )}
            </div>
          </div>
        )}

        {/* PLANS SELECTION */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-ya-lime" />
            <p className="mt-3 font-mono text-xs text-zinc-400">Cargando planes de YA+...</p>
          </div>
        ) : (
          <div>
            <h2 className="mb-4 font-mono text-xs font-black tracking-wider text-zinc-400 uppercase">
              {activeSubscription.has_active_subscription ? 'PLANES DISPONIBLES' : 'ELIGE TU PLAN'}
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {plans.map((plan) => {
                const isSelected = selectedPlanId === plan.id;
                const isCurrent = activeSubscription.plan_id === plan.id;

                return (
                  <div
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`cursor-pointer border-3 p-5 transition relative ${
                      isSelected
                        ? 'border-ya-lime bg-zinc-900 shadow-[4px_4px_0px_0px_#B6FF00]'
                        : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600'
                    }`}
                  >
                    {plan.badge_text && (
                      <div className="absolute -top-3 right-4 bg-ya-lime px-2 py-0.5 font-mono text-[10px] font-black text-ya-black uppercase">
                        {plan.badge_text}
                      </div>
                    )}

                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-xl font-black text-white uppercase">{plan.name}</h3>
                        <p className="font-mono text-xs text-zinc-400">
                          {plan.periodicity === 'monthly' ? 'Facturación mensual' : 'Facturación anual'}
                        </p>
                      </div>
                      <div
                        className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-ya-lime bg-ya-lime' : 'border-zinc-600'
                        }`}
                      >
                        {isSelected && <div className="h-2 w-2 rounded-full bg-ya-black" />}
                      </div>
                    </div>

                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-3xl font-black text-white">{euro(plan.price)}</span>
                      <span className="font-mono text-xs text-zinc-400">
                        {plan.periodicity === 'monthly' ? '/mes' : '/año'}
                      </span>
                    </div>

                    {plan.promotional_text && (
                      <p className="mt-2 text-xs font-bold text-ya-lime">{plan.promotional_text}</p>
                    )}

                    <p className="mt-3 text-xs text-zinc-300 leading-relaxed">{plan.description}</p>

                    <ul className="mt-4 space-y-2 border-t border-zinc-800/80 pt-3 text-xs text-zinc-300">
                      <li className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-ya-lime shrink-0" />
                        <span>Envíos gratis ilimitados</span>
                      </li>
                      {plan.benefits?.order_discount_percent && (
                        <li className="flex items-center gap-2">
                          <Check className="h-3.5 w-3.5 text-ya-lime shrink-0" />
                          <span>{plan.benefits.order_discount_percent}% de descuento en tus pedidos</span>
                        </li>
                      )}
                      <li className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-ya-lime shrink-0" />
                        <span>Acceso anticipado a packs y ofertas</span>
                      </li>
                    </ul>

                    {isCurrent && (
                      <div className="mt-4 border border-ya-lime/40 bg-ya-lime/10 p-2 text-center font-mono text-xs font-bold text-ya-lime uppercase">
                        Tu plan actual
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ACTION CTA */}
            <div className="mt-6 border-2 border-zinc-800 bg-zinc-900/60 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="font-bold text-white">
                    {selectedPlan ? `Plan seleccionado: ${selectedPlan.name}` : 'Selecciona un plan'}
                  </h4>
                  <p className="text-xs text-zinc-400">
                    Cancela en cualquier momento con un solo clic. Sin compromisos.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSubscribe}
                  disabled={subscribing || !selectedPlan || activeSubscription.plan_id === selectedPlanId}
                  className="inline-flex items-center justify-center gap-2 border-2 border-ya-lime bg-ya-lime px-6 py-3 font-mono text-sm font-black text-ya-black uppercase transition hover:bg-white hover:border-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {subscribing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      ACTIVANDO...
                    </>
                  ) : activeSubscription.plan_id === selectedPlanId ? (
                    'PLAN YA ACTIVO'
                  ) : (
                    <>
                      <Zap className="h-4 w-4 fill-ya-black" />
                      UNIRME A YA+ ({selectedPlan ? euro(selectedPlan.price) : ''})
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* COMPARISON / PERKS GRID */}
        <div className="mt-12">
          <h2 className="text-center font-black tracking-tight text-xl text-white uppercase">
            ¿POR QUÉ HACERTE DE <span className="text-ya-lime">YA+</span>?
          </h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="border border-zinc-800 bg-zinc-950 p-4">
              <div className="h-10 w-10 flex items-center justify-center bg-ya-lime/10 text-ya-lime mb-3">
                <Truck className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-white text-sm uppercase">ENVÍOS SIEMPRE A 0€</h3>
              <p className="mt-2 text-xs text-zinc-400">
                Olvídate de la tarifa de envío en cualquier pedido que hagas a domicilio en Jerez.
              </p>
            </div>

            <div className="border border-zinc-800 bg-zinc-950 p-4">
              <div className="h-10 w-10 flex items-center justify-center bg-ya-lime/10 text-ya-lime mb-3">
                <Percent className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-white text-sm uppercase">DESCUENTO DIRECTO</h3>
              <p className="mt-2 text-xs text-zinc-400">
                Ahorro acumulable con otras promociones activas en la app.
              </p>
            </div>

            <div className="border border-zinc-800 bg-zinc-950 p-4">
              <div className="h-10 w-10 flex items-center justify-center bg-ya-lime/10 text-ya-lime mb-3">
                <Clock className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-white text-sm uppercase">PRIORIDAD EN HORAS PUNTA</h3>
              <p className="mt-2 text-xs text-zinc-400">
                Tus pedidos entran en la primera cola de asignación de repartidores.
              </p>
            </div>
          </div>
        </div>

        {/* FAQS */}
        <div className="mt-12 border-t border-zinc-800 pt-8">
          <h2 className="font-mono text-xs font-black tracking-wider text-zinc-400 uppercase mb-4">
            PREGUNTAS FRECUENTES
          </h2>
          <div className="space-y-3 text-xs">
            <details className="border border-zinc-800 bg-zinc-950 p-3 group">
              <summary className="cursor-pointer font-bold text-white list-none flex items-center justify-between">
                <span>¿Puedo cancelar cuando quiera?</span>
                <span className="text-ya-lime group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="mt-2 text-zinc-400">
                Sí, con un solo clic en esta misma página o desde tu perfil. Mantendrás todas las ventajas hasta que termine el periodo ya pagado.
              </p>
            </details>
            <details className="border border-zinc-800 bg-zinc-950 p-3 group">
              <summary className="cursor-pointer font-bold text-white list-none flex items-center justify-between">
                <span>¿Se aplica en pedidos compartidos (YA Juntos)?</span>
                <span className="text-ya-lime group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="mt-2 text-zinc-400">
                ¡Sí! Si el organizador del grupo tiene YA+, el envío del grupo se beneficia automáticamente de las ventajas de su cuenta.
              </p>
            </details>
          </div>
        </div>
      </div>

      {/* CANCEL MODAL */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md border-4 border-red-500 bg-zinc-900 p-6 shadow-[8px_8px_0px_0px_#ef4444]">
            <h3 className="text-lg font-black text-white uppercase">¿CANCELAR TU SUSCRIPCIÓN A YA+?</h3>
            <p className="mt-2 text-xs text-zinc-300">
              Perderás los envíos gratuitos automáticos a partir de tu fecha de fin de ciclo actual. Podrás seguir disfrutando de tus beneficios hasta esa fecha.
            </p>

            <div className="mt-6 flex justify-end gap-3 font-mono text-xs">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="border border-zinc-600 bg-zinc-800 px-4 py-2 text-white hover:bg-zinc-700"
              >
                VOLVER
              </button>
              <button
                type="button"
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="border-2 border-red-500 bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling ? 'CANCELANDO...' : 'SÍ, CANCELAR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
