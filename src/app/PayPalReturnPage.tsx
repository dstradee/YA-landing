// ==============================================================================
// YA DELIVERY - PÁGINA DE RETORNO Y CAPTURA PAYPAL SANDBOX (PHASE 3C.1)
// Archivo: src/app/PayPalReturnPage.tsx
// ==============================================================================

import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle, ArrowRight, RotateCcw } from 'lucide-react';
import { AppHeader } from './components';
import { useCart } from './CartContext';
import { requestCapturePayPalOrder } from '../lib/paypalClient';
import { supabase } from '../lib/supabase';
import { euro } from '../data/products';

export function PayPalReturnPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();

  const orderIdParam = searchParams.get('orderId');
  const tokenParam = searchParams.get('token'); // PayPal Order ID
  const payerIdParam = searchParams.get('PayerID');
  const isCancelParam = searchParams.get('cancel') === 'true';

  const [status, setStatus] = useState<'processing' | 'success' | 'cancelled' | 'error'>('processing');
  const [statusText, setStatusText] = useState('Verificando aprobación en PayPal Sandbox...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<any>(null);
  const [resolvedOrder, setResolvedOrder] = useState<{
    orderId: string;
    orderNumber?: string;
    amount?: number;
    captureId?: string;
  } | null>(null);

  // Prevenir dobles ejecuciones en React StrictMode
  const hasCapturedRef = useRef(false);

  useEffect(() => {
    // 1. Manejo de cancelación voluntaria en PayPal
    if (isCancelParam) {
      setStatus('cancelled');
      setStatusText('Operación cancelada');
      return;
    }

    if (hasCapturedRef.current) return;
    hasCapturedRef.current = true;

    async function executeCapture() {
      // Determinar orderId (de URL o de sessionStorage)
      let targetOrderId = orderIdParam;
      let cachedAmount: number | undefined;
      let cachedOrderNumber: string | undefined;

      try {
        const saved = sessionStorage.getItem('ya_paypal_checkout_pending');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (!targetOrderId && parsed.orderId) {
            targetOrderId = parsed.orderId;
          }
          cachedAmount = parsed.amount;
          cachedOrderNumber = parsed.orderNumber;
        }
      } catch {
        // ignore
      }

      if (!targetOrderId) {
        setStatus('error');
        setErrorMessage('No se encontró el identificador del pedido YA para confirmar el cobro.');
        return;
      }

      const paypalOrderId = tokenParam || undefined;

      try {
        setStatusText('Capturando fondos y verificando pedido en PayPal...');

        // Obtener token de sesión Supabase si el usuario está autenticado
        const { data: sessionData } = await supabase.auth.getSession();
        const authToken = sessionData?.session?.access_token;

        const captureResult = await requestCapturePayPalOrder({
          orderId: targetOrderId,
          paypalOrderId: paypalOrderId || '',
          token: authToken,
        });

        if (captureResult.success) {
          // Limpiar carrito ya que el pedido ha sido formalmente pagado
          clearCart();
          try {
            sessionStorage.removeItem('ya_paypal_checkout_pending');
          } catch {
            // ignore
          }

          setResolvedOrder({
            orderId: targetOrderId,
            orderNumber: captureResult.orderNumber || cachedOrderNumber,
            amount: captureResult.amount || cachedAmount,
            captureId: captureResult.captureId,
          });

          setStatus('success');
          setStatusText('¡Pago confirmado exitosamente!');

          // Redirección suave al detalle del pedido tras 2 segundos
          setTimeout(() => {
            navigate(`/app/pedido/${captureResult.orderNumber || targetOrderId}?payment=success`);
          }, 2000);
        } else {
          throw new Error(captureResult.error || 'La pasarela no pudo confirmar la captura de fondos.');
        }
      } catch (err: any) {
        console.error('Error al capturar orden PayPal en retorno:', err);
        setStatus('error');
        setErrorMessage(err?.message || 'Ocurrió un error inesperado al capturar el pago.');
        setErrorDetails({
          name: err?.name,
          debug_id: err?.debug_id,
          details: err?.details,
        });
      }
    }

    executeCapture();
  }, [orderIdParam, tokenParam, payerIdParam, isCancelParam, clearCart, navigate]);

  return (
    <>
      <AppHeader />
      <main className="max-w-2xl mx-auto px-4 pt-8 pb-28">
        {/* ESTADO 1: PROCESANDO CAPTURA */}
        {status === 'processing' && (
          <div className="border-2 border-ya-lime bg-ya-black p-8 text-center space-y-4">
            <Loader2 size={40} className="animate-spin text-ya-lime mx-auto" />
            <h1 className="font-black text-2xl uppercase tracking-wider text-white">
              Confirmando tu pago
            </h1>
            <p className="text-sm text-ya-lime font-mono">
              {statusText}
            </p>
            <p className="text-xs text-gray-400 font-mono max-w-md mx-auto">
              PayPal ha autorizado la transacción. Estamos verificando los fondos y registrando el pedido en YA Jerez. No cierres esta ventana.
            </p>
          </div>
        )}

        {/* ESTADO 2: ÉXITO */}
        {status === 'success' && (
          <div className="border-2 border-ya-lime bg-ya-black p-8 text-center space-y-5">
            <div className="w-16 h-16 bg-ya-lime/20 border-2 border-ya-lime rounded-full flex items-center justify-center mx-auto text-ya-lime">
              <CheckCircle2 size={36} />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-mono font-black uppercase tracking-widest text-ya-lime border border-ya-lime/40 px-2 py-0.5 bg-ya-lime/10">
                PAGO AUTORIZADO Y CAPTURADO
              </span>
              <h1 className="font-black text-3xl tracking-tight text-white pt-2">
                ¡Pago Completado!
              </h1>
              <p className="text-sm text-gray-300">
                Tu pedido ha sido recibido y el pago verificado por PayPal Sandbox.
              </p>
            </div>

            {resolvedOrder && (
              <div className="border border-ya-gray bg-ya-gray/30 p-4 text-xs font-mono space-y-1.5 text-left max-w-md mx-auto">
                <div className="flex justify-between">
                  <span className="text-gray-400">Pedido YA:</span>
                  <span className="font-black text-white">{resolvedOrder.orderNumber || resolvedOrder.orderId}</span>
                </div>
                {resolvedOrder.amount !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total Pagado:</span>
                    <span className="font-black text-ya-lime">{euro(resolvedOrder.amount)}</span>
                  </div>
                )}
                {resolvedOrder.captureId && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Capture ID:</span>
                    <span className="text-gray-300 truncate max-w-[200px]">{resolvedOrder.captureId}</span>
                  </div>
                )}
              </div>
            )}

            <div className="pt-3">
              <Link
                to={`/app/pedido/${resolvedOrder?.orderNumber || resolvedOrder?.orderId || orderIdParam}?payment=success`}
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-ya-lime text-ya-black font-black uppercase text-xs tracking-wider hover:bg-white transition-colors"
              >
                <span>Ver seguimiento de mi pedido</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        )}

        {/* ESTADO 3: CANCELADO POR EL USUARIO EN PAYPAL */}
        {status === 'cancelled' && (
          <div className="border-2 border-amber-500 bg-ya-black p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-amber-500/20 border-2 border-amber-500 rounded-full flex items-center justify-center mx-auto text-amber-400">
              <AlertCircle size={36} />
            </div>
            <h1 className="font-black text-2xl uppercase tracking-wider text-white">
              Pago Cancelado en PayPal
            </h1>
            <p className="text-xs text-gray-300 leading-relaxed max-w-md mx-auto">
              Has cancelado el proceso en la ventana de PayPal. Tu pedido sigue guardado en nuestro sistema en reserva y pendiente de pago.
            </p>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              {orderIdParam && (
                <Link
                  to={`/app/pedido/${orderIdParam}`}
                  className="w-full sm:w-auto px-5 py-3 bg-ya-lime text-ya-black font-black uppercase text-xs tracking-wider hover:bg-white transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw size={15} /> Retomar pago del pedido
                </Link>
              )}
              <Link
                to="/app"
                className="w-full sm:w-auto px-5 py-3 border border-ya-gray text-gray-300 font-black uppercase text-xs tracking-wider hover:border-white transition-colors"
              >
                Volver a la tienda
              </Link>
            </div>
          </div>
        )}

        {/* ESTADO 4: ERROR AL CAPTURAR */}
        {status === 'error' && (
          <div className="border-2 border-rose-500 bg-ya-black p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-rose-500/20 border-2 border-rose-500 rounded-full flex items-center justify-center mx-auto text-rose-400">
              <AlertCircle size={36} />
            </div>
            <h1 className="font-black text-2xl uppercase tracking-wider text-white">
              Incidencia al capturar el pago
            </h1>
            <p className="text-xs text-rose-300 font-mono leading-relaxed max-w-md mx-auto">
              {errorMessage}
            </p>

            {errorDetails && (
              <div className="border border-rose-900/60 bg-rose-950/30 p-3 text-[11px] font-mono text-left max-w-md mx-auto text-rose-200 space-y-1">
                {errorDetails.name && <div>Error: {errorDetails.name}</div>}
                {errorDetails.debug_id && <div>Debug ID: {errorDetails.debug_id}</div>}
              </div>
            )}

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              {orderIdParam && (
                <Link
                  to={`/app/pedido/${orderIdParam}`}
                  className="w-full sm:w-auto px-5 py-3 bg-rose-600 text-white font-black uppercase text-xs tracking-wider hover:bg-rose-500 transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw size={15} /> Volver a intentar el pago
                </Link>
              )}
              <Link
                to="/app"
                className="w-full sm:w-auto px-5 py-3 border border-ya-gray text-gray-300 font-black uppercase text-xs tracking-wider hover:border-white transition-colors"
              >
                Volver a la tienda
              </Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
