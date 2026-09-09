// ==============================================================================
// YA DELIVERY - SECCIÓN DE PAGO CON PAYPAL SANDBOX (PHASE 3C.1)
// Archivo: src/components/PayPalPaymentSection.tsx
// ==============================================================================

import { useState, useEffect } from 'react';
import {
  CreditCard,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import {
  fetchPayPalConfig,
  requestCreatePayPalOrder,
  requestCapturePayPalOrder,
  type PayPalConfig,
} from '../lib/paypalClient';
import { supabase } from '../lib/supabase';
import { euro } from '../data/products';

type PayPalPaymentSectionProps = {
  orderId: string;
  orderNumber: string;
  amount: number;
  selectedMethod: string;
  onMethodChange: (method: string) => void;
  onPaymentSuccess: (details: {
    orderId: string;
    orderNumber: string;
    captureId?: string;
    amount: number;
  }) => void;
  onPaymentError: (errorMessage: string) => void;
  onPaymentCancel: () => void;
};

export function PayPalPaymentSection({
  orderId,
  orderNumber,
  amount,
  selectedMethod,
  onMethodChange,
  onPaymentSuccess,
  onPaymentError,
  onPaymentCancel,
}: PayPalPaymentSectionProps) {
  const [config, setConfig] = useState<PayPalConfig | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [paypalOrderId, setPaypalOrderId] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState(false);

  useEffect(() => {
    fetchPayPalConfig().then((cfg) => {
      setConfig(cfg);
    });
  }, []);

  // Normalizar método seleccionado (PayPal o Tarjeta)
  const normalizedMethod = (selectedMethod || 'paypal').toLowerCase().replace(' ', '_');
  const isCard = normalizedMethod === 'tarjeta' || normalizedMethod === 'card';

  // ==============================================================================
  // FLUJO DE CAPTURA Y CONFIRMACIÓN
  // ==============================================================================
  const handleExecutePayment = async (simulatedType: 'success' | 'declined' | 'cancelled' = 'success') => {
    if (isProcessing) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusText('Iniciando sesión segura con PayPal Sandbox...');

    try {
      // 0. Obtener token de sesión del usuario en Supabase si está autenticado
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      // 1. Paso 1: Crear la orden en el servidor (PayPal Orders v2 API) con URLs de retorno
      const origin = window.location.origin;
      const returnUrl = `${origin}/app/checkout/paypal-return?orderId=${encodeURIComponent(orderId)}`;
      const cancelUrl = `${origin}/app/checkout/paypal-cancel?orderId=${encodeURIComponent(orderId)}`;

      const createRes = await requestCreatePayPalOrder({
        orderId,
        paymentMethod: isCard ? 'card' : 'paypal',
        amount,
        token,
        returnUrl,
        cancelUrl,
      });

      const orderIdCreated = createRes.paypalOrderId;
      setPaypalOrderId(orderIdCreated);

      // Si es un entorno de prueba simulado (sin credenciales PayPal en sandbox)
      if (createRes.isSimulated) {
        if (simulatedType === 'cancelled') {
          setIsProcessing(false);
          setStatusText(null);
          setErrorMessage('Has cancelado el pago en PayPal. Tu pedido sigue guardado como pendiente para que puedas completarlo.');
          onPaymentCancel();
          return;
        }

        if (simulatedType === 'declined') {
          setIsProcessing(false);
          setStatusText(null);
          const errMsg = 'Fondos insuficientes o tarjeta rechazada por la entidad emisora (INSTRUMENT_DECLINED).';
          setErrorMessage(errMsg);
          onPaymentError(errMsg);
          return;
        }

        setStatusText('Confirmando simulación de pago en Sandbox...');
        const captureRes = await requestCapturePayPalOrder({
          orderId,
          paypalOrderId: orderIdCreated,
          paymentMethod: isCard ? 'card' : 'paypal',
          amount,
          token,
        });

        if (captureRes.success) {
          setIsApproved(true);
          setStatusText('¡Pago verificado exitosamente!');
          onPaymentSuccess({
            orderId,
            orderNumber,
            captureId: captureRes.captureId,
            amount,
          });
        }
        return;
      }

      // ENTORNO SANDBOX OFICIAL CON CREDENCIALES
      // Guardar contexto en sessionStorage para respaldar el retorno
      try {
        sessionStorage.setItem(
          'ya_paypal_checkout_pending',
          JSON.stringify({
            orderId,
            orderNumber,
            paypalOrderId: orderIdCreated,
            amount,
            timestamp: Date.now(),
          })
        );
      } catch {
        // ignore storage error
      }

      if (createRes.approveUrl) {
        setStatusText('Redirigiendo a PayPal Sandbox para autorizar el pago...');
        // Redirigir al cliente a la URL HATEOAS rel="approve" de PayPal
        window.location.href = createRes.approveUrl;
        return;
      }

      throw new Error('PayPal no proporcionó el enlace de aprobación seguro (rel="approve").');
    } catch (err: any) {
      console.error('Error durante el proceso de pago:', err);
      const msg = err?.message || 'Error inesperado al comunicarse con la pasarela de PayPal.';
      setErrorMessage(msg);
      onPaymentError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div id="paypal-payment-section" className="space-y-4">
      {/* Banner de Entorno de Pruebas Sandbox */}
      <div className="border-2 border-ya-lime/40 bg-ya-gray/40 p-3.5 flex items-start gap-3 text-xs">
        <div className="p-1 bg-ya-lime text-ya-black font-black uppercase text-[10px] tracking-wider shrink-0 mt-0.5">
          SANDBOX
        </div>
        <div className="space-y-1">
          <p className="font-black text-white uppercase tracking-wide">
            Entorno de Pruebas · PayPal Sandbox v2
          </p>
          <p className="text-gray-300 text-[11px] leading-relaxed">
            Fase 3C.1 activa. Pagos procesados a través de PayPal Sandbox. En esta fase se admiten exclusivamente pagos seguros mediante <strong>PayPal</strong> y <strong>Tarjeta</strong>.
          </p>
          {paypalOrderId && (
            <p className="text-ya-lime text-[10px] font-mono">
              Orden PayPal activa: {paypalOrderId}
            </p>
          )}
        </div>
      </div>

      {/* Resumen del pedido a pagar */}
      <div className="border-2 border-ya-gray bg-ya-black p-4 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-mono uppercase text-gray-400 block">Pedido YA</span>
          <span className="font-mono font-black text-lg text-white">{orderNumber}</span>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-mono uppercase text-gray-400 block">Total a Pagar</span>
          <span className="font-black text-xl text-ya-lime">{euro(amount)}</span>
        </div>
      </div>

      {/* Selección Simplificada de Método de Pago: Solo PayPal y Tarjeta */}
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-wider text-gray-300">
          Selecciona tu método de pago:
        </p>

        <div className="grid grid-cols-2 gap-3">
          {/* 1. PayPal */}
          <button
            type="button"
            id="select-method-paypal-btn"
            onClick={() => onMethodChange('PayPal')}
            className={`p-4 border-2 font-black text-xs uppercase tracking-wider text-center transition-colors flex flex-col items-center justify-center gap-1.5 ${
              !isCard
                ? 'border-ya-lime bg-ya-lime text-ya-black'
                : 'border-ya-gray bg-ya-gray text-white hover:border-gray-400'
            }`}
          >
            <span className="font-black text-sm">PayPal</span>
            <span className="text-[10px] font-normal opacity-80 lowercase">Saldo o cuenta PayPal</span>
          </button>

          {/* 2. Tarjeta */}
          <button
            type="button"
            id="select-method-card-btn"
            onClick={() => onMethodChange('Tarjeta')}
            className={`p-4 border-2 font-black text-xs uppercase tracking-wider text-center transition-colors flex flex-col items-center justify-center gap-1.5 ${
              isCard
                ? 'border-ya-lime bg-ya-lime text-ya-black'
                : 'border-ya-gray bg-ya-gray text-white hover:border-gray-400'
            }`}
          >
            <span className="font-black text-sm flex items-center gap-1.5">
              <CreditCard size={16} /> Tarjeta
            </span>
            <span className="text-[10px] font-normal opacity-80 lowercase">Débito o Crédito</span>
          </button>
        </div>
      </div>

      {/* Alerta de Error con opción de reintento */}
      {errorMessage && (
        <div
          role="alert"
          className="border-2 border-rose-500 bg-rose-950/40 p-4 text-xs text-rose-200 space-y-3"
        >
          <div className="flex items-center gap-2 font-black uppercase text-rose-400">
            <AlertCircle size={18} /> Incidencia en el pago
          </div>
          <p className="pl-6 text-[11px] leading-relaxed">{errorMessage}</p>
          <div className="pl-6 pt-1">
            <button
              type="button"
              onClick={() => handleExecutePayment('success')}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black uppercase text-[10px] tracking-wider transition-colors"
            >
              <RotateCcw size={13} /> Reintentar pago ahora
            </button>
          </div>
        </div>
      )}

      {/* Estado en proceso */}
      {isProcessing && (
        <div className="border-2 border-ya-lime bg-ya-black p-5 text-center space-y-2.5 animate-pulse">
          <Loader2 size={26} className="animate-spin text-ya-lime mx-auto" />
          <p className="text-xs font-black uppercase tracking-wider text-ya-lime">
            {statusText || 'Comunicando con PayPal Sandbox...'}
          </p>
          <p className="text-[11px] text-gray-400 font-mono">
            Por favor no cierres esta ventana mientras procesamos la confirmación.
          </p>
        </div>
      )}

      {/* Botón Principal de Pago */}
      {!isProcessing && !isApproved && (
        <div className="space-y-3 pt-2">
          <button
            type="button"
            id="execute-paypal-payment-btn"
            onClick={() => handleExecutePayment('success')}
            className="w-full p-4 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-base hover:bg-white transition-colors flex items-center justify-center gap-2 shadow-lg cursor-pointer"
          >
            <ShieldCheck size={20} />
            <span>
              {isCard
                ? `Pagar con Tarjeta · ${euro(amount)}`
                : `Pagar con PayPal · ${euro(amount)}`}
            </span>
          </button>

          {/* Controles de Simulación Sandbox: Visibles ÚNICAMENTE si isSandbox === true */}
          {config?.isSandbox && (
            <div className="border border-ya-gray bg-ya-gray/20 p-3 text-[11px] space-y-2">
              <div className="flex items-center justify-between text-gray-400">
                <span className="font-mono uppercase font-bold text-[10px] text-ya-lime">
                  Herramientas de Test Sandbox
                </span>
                <span className="text-[10px]">Pruebas de verificación</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleExecutePayment('declined')}
                  className="py-1.5 px-2 border border-rose-500/60 bg-rose-950/20 text-rose-300 font-mono text-[10px] uppercase font-bold hover:bg-rose-900/40 transition-colors text-center cursor-pointer"
                  title="Simula un rechazo bancario por fondos insuficientes o tarjeta denegada"
                >
                  Simular Rechazo
                </button>
                <button
                  type="button"
                  onClick={() => handleExecutePayment('cancelled')}
                  className="py-1.5 px-2 border border-gray-600 bg-ya-gray/40 text-gray-300 font-mono text-[10px] uppercase font-bold hover:bg-gray-700 transition-colors text-center cursor-pointer"
                  title="Simula que el comprador cancela la operación en la ventana de PayPal"
                >
                  Simular Cancelación
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmación de éxito */}
      {isApproved && (
        <div className="border-2 border-ya-lime bg-ya-lime/10 p-4 text-center space-y-2">
          <CheckCircle2 size={28} className="text-ya-lime mx-auto" />
          <p className="text-sm font-black uppercase tracking-wider text-ya-lime">
            Pago confirmado por PayPal Sandbox
          </p>
          <p className="text-xs text-gray-300 font-mono">
            Transacción registrada y confirmada en Supabase. Redirigiendo...
          </p>
        </div>
      )}
    </div>
  );
}
