// ==============================================================================
// YA - GESTIÓN DE CONFIGURACIÓN COMERCIAL (PHASE 3B)
// Archivo: src/app/admin/AdminCommercialPage.tsx
// ==============================================================================

import React, { useEffect, useState } from 'react';
import {
  Sliders,
  DollarSign,
  Truck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Info,
} from 'lucide-react';
import { getCommercialSettings, updateCommercialSettings } from '../../lib/commercialSettings';
import { euro } from '../../data/products';
import { useCart } from '../CartContext';

export function AdminCommercialPage() {
  const { refreshCommercialData } = useCart();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form state
  const [minOrderEnabled, setMinOrderEnabled] = useState(true);
  const [minOrderAmount, setMinOrderAmount] = useState('10.00');
  const [freeShippingEnabled, setFreeShippingEnabled] = useState(true);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState('30.00');
  const [standardDeliveryFee, setStandardDeliveryFee] = useState('2.90');

  const loadSettings = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await getCommercialSettings();
      setMinOrderEnabled(data.min_order_enabled);
      setMinOrderAmount(data.min_order_amount.toFixed(2));
      setFreeShippingEnabled(data.free_shipping_enabled);
      setFreeShippingThreshold(data.free_shipping_threshold.toFixed(2));
      setStandardDeliveryFee(data.standard_delivery_fee.toFixed(2));
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al cargar la configuración comercial');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    const minAmount = parseFloat(minOrderAmount);
    const freeThreshold = parseFloat(freeShippingThreshold);
    const standardFee = parseFloat(standardDeliveryFee);

    if (isNaN(minAmount) || minAmount < 0) {
      setErrorMsg('El importe del pedido mínimo debe ser un número positivo.');
      setSaving(false);
      return;
    }

    if (isNaN(freeThreshold) || freeThreshold < 0) {
      setErrorMsg('El umbral de envío gratis debe ser un número positivo.');
      setSaving(false);
      return;
    }

    if (isNaN(standardFee) || standardFee < 0) {
      setErrorMsg('La tarifa de entrega estándar debe ser un número positivo.');
      setSaving(false);
      return;
    }

    const res = await updateCommercialSettings({
      min_order_enabled: minOrderEnabled,
      min_order_amount: minAmount,
      free_shipping_enabled: freeShippingEnabled,
      free_shipping_threshold: freeThreshold,
      standard_delivery_fee: standardFee,
    });

    if (!res.success) {
      setErrorMsg(res.error || 'No se pudo guardar la configuración.');
    } else {
      setSuccessMsg('Configuración comercial actualizada correctamente.');
      // Actualizar contexto global del carrito
      await refreshCommercialData();
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 font-mono text-xs uppercase text-ya-lime animate-pulse">
        Cargando parámetros comerciales...
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="border-b-4 border-ya-gray pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-ya-lime text-ya-black px-2 py-0.5 text-xs font-black uppercase tracking-wider">
              PHASE 3B
            </span>
            <span className="text-xs font-mono text-gray-400">MOTOR COMERCIAL</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            <Sliders className="text-ya-lime" size={28} />
            <span>Configuración Comercial</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1 font-mono">
            Define las reglas globales de pedido mínimo, umbral de envío gratuito y costes de reparto en Jerez.
          </p>
        </div>

        <button
          type="button"
          onClick={loadSettings}
          disabled={loading || saving}
          className="self-start sm:self-auto px-4 py-2 border-2 border-ya-gray text-xs font-black uppercase tracking-wider hover:border-ya-lime hover:text-ya-lime transition-colors flex items-center gap-2"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Recargar</span>
        </button>
      </div>

      {/* Alertas */}
      {successMsg && (
        <div className="border-4 border-ya-lime bg-ya-lime/10 p-4 text-white text-xs font-mono flex items-center gap-3">
          <CheckCircle2 size={20} className="text-ya-lime shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="border-4 border-red-500 bg-red-500/10 p-4 text-white text-xs font-mono flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Grid: Formulario + Simulador en Vivo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Columna Izquierda: Formulario (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="space-y-6">
            {/* Bloque 1: Pedido Mínimo */}
            <div className="border-4 border-ya-gray bg-ya-black p-6 space-y-4">
              <div className="flex items-center justify-between border-b-2 border-ya-gray pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-ya-gray flex items-center justify-center text-ya-lime">
                    <ShoppingBag size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-wider text-white">
                      1. Regla de Pedido Mínimo
                    </h2>
                    <p className="text-[11px] font-mono text-gray-400">
                      Impide procesar checkout si el subtotal de productos no alcanza este valor
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={minOrderEnabled}
                    onChange={(e) => setMinOrderEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-ya-gray peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-ya-lime"></div>
                </label>
              </div>

              <div className="pt-2">
                <label className="block text-xs font-mono uppercase text-gray-300 mb-2">
                  Importe Mínimo de Pedido (€)
                </label>
                <div className="relative max-w-xs">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">
                    €
                  </span>
                  <input
                    type="number"
                    step="0.10"
                    min="0"
                    value={minOrderAmount}
                    onChange={(e) => setMinOrderAmount(e.target.value)}
                    disabled={!minOrderEnabled}
                    className="w-full bg-ya-gray/30 border-2 border-ya-gray pl-8 pr-4 py-2.5 text-white font-mono text-sm focus:border-ya-lime focus:outline-none disabled:opacity-40"
                    placeholder="10.00"
                    required={minOrderEnabled}
                  />
                </div>
                <p className="text-[10px] font-mono text-gray-400 mt-2">
                  {minOrderEnabled
                    ? `El cliente debe añadir al menos ${euro(parseFloat(minOrderAmount) || 0)} en productos para poder pagar.`
                    : 'Cualquier importe será aceptado para tramitar el pedido.'}
                </p>
              </div>
            </div>

            {/* Bloque 2: Envío Gratis */}
            <div className="border-4 border-ya-gray bg-ya-black p-6 space-y-4">
              <div className="flex items-center justify-between border-b-2 border-ya-gray pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-ya-gray flex items-center justify-center text-ya-lime">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-wider text-white">
                      2. Umbral de Envío Gratis
                    </h2>
                    <p className="text-[11px] font-mono text-gray-400">
                      Muestra barra de progreso y bonifica el 100% de la tarifa de entrega
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={freeShippingEnabled}
                    onChange={(e) => setFreeShippingEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-ya-gray peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-ya-lime"></div>
                </label>
              </div>

              <div className="pt-2">
                <label className="block text-xs font-mono uppercase text-gray-300 mb-2">
                  Subtotal Necesario para Envío Gratis (€)
                </label>
                <div className="relative max-w-xs">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">
                    €
                  </span>
                  <input
                    type="number"
                    step="0.50"
                    min="0"
                    value={freeShippingThreshold}
                    onChange={(e) => setFreeShippingThreshold(e.target.value)}
                    disabled={!freeShippingEnabled}
                    className="w-full bg-ya-gray/30 border-2 border-ya-gray pl-8 pr-4 py-2.5 text-white font-mono text-sm focus:border-ya-lime focus:outline-none disabled:opacity-40"
                    placeholder="30.00"
                    required={freeShippingEnabled}
                  />
                </div>
                <p className="text-[10px] font-mono text-gray-400 mt-2">
                  {freeShippingEnabled
                    ? `A partir de ${euro(parseFloat(freeShippingThreshold) || 0)}, el cliente tiene coste de entrega 0,00 €.`
                    : 'No hay bonificación de envío gratis activa.'}
                </p>
              </div>
            </div>

            {/* Bloque 3: Tarifa de Envío Estándar */}
            <div className="border-4 border-ya-gray bg-ya-black p-6 space-y-4">
              <div className="flex items-center justify-between border-b-2 border-ya-gray pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-ya-gray flex items-center justify-center text-ya-lime">
                    <Truck size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-wider text-white">
                      3. Tarifa de Entrega Estándar
                    </h2>
                    <p className="text-[11px] font-mono text-gray-400">
                      Coste base de envío aplicado a pedidos en Jerez que no superen el umbral gratis
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <label className="block text-xs font-mono uppercase text-gray-300 mb-2">
                  Tarifa Estándar (€)
                </label>
                <div className="relative max-w-xs">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">
                    €
                  </span>
                  <input
                    type="number"
                    step="0.10"
                    min="0"
                    value={standardDeliveryFee}
                    onChange={(e) => setStandardDeliveryFee(e.target.value)}
                    className="w-full bg-ya-gray/30 border-2 border-ya-gray pl-8 pr-4 py-2.5 text-white font-mono text-sm focus:border-ya-lime focus:outline-none"
                    placeholder="2.90"
                    required
                  />
                </div>
                <p className="text-[10px] font-mono text-gray-400 mt-2">
                  Tarifa base cobrada por cada entrega de mensajería urgente en menos de 15 minutos.
                </p>
              </div>
            </div>

            {/* Botón Guardar */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-8 py-3.5 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs border-2 border-ya-lime hover:bg-white hover:border-white transition-all shadow-[4px_4px_0px_0px_#1A1A1A] disabled:opacity-50"
              >
                {saving ? 'Guardando en Supabase...' : 'Guardar Parámetros Comerciales'}
              </button>
            </div>
          </form>
        </div>

        {/* Columna Derecha: Vista Previa y Simulación */}
        <div className="space-y-6">
          <div className="border-4 border-ya-lime bg-ya-black p-6 space-y-4">
            <div className="flex items-center gap-2 border-b-2 border-ya-lime pb-3">
              <Info size={18} className="text-ya-lime" />
              <h3 className="text-xs font-black uppercase tracking-wider text-white">
                Simulación en Tiempo Real
              </h3>
            </div>

            <p className="text-[11px] font-mono text-gray-400">
              Así experimentará el cliente de Jerez las reglas configuradas:
            </p>

            <div className="space-y-3 font-mono text-xs pt-2">
              {/* Caso A: Pedido pequeño (8€) */}
              <div className="p-3 bg-ya-gray/30 border-2 border-ya-gray space-y-1.5">
                <div className="flex justify-between font-bold text-white">
                  <span>Pedido de 8,00 €</span>
                  <span className={minOrderEnabled && 8 < parseFloat(minOrderAmount || '0') ? 'text-red-400' : 'text-ya-lime'}>
                    {minOrderEnabled && 8 < parseFloat(minOrderAmount || '0') ? 'BLOQUEADO' : 'PERMITIDO'}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400">
                  {minOrderEnabled && 8 < parseFloat(minOrderAmount || '0')
                    ? `Faltarían ${euro(Math.max(0, parseFloat(minOrderAmount || '0') - 8))} para el mínimo.`
                    : 'Cumple los requisitos de compra.'}
                </p>
                <div className="flex justify-between text-[11px] text-gray-300 pt-1 border-t border-ya-gray/40">
                  <span>Envío:</span>
                  <span>{euro(parseFloat(standardDeliveryFee || '0'))}</span>
                </div>
              </div>

              {/* Caso B: Pedido mediano (18€) */}
              <div className="p-3 bg-ya-gray/30 border-2 border-ya-gray space-y-1.5">
                <div className="flex justify-between font-bold text-white">
                  <span>Pedido de 18,00 €</span>
                  <span className="text-ya-lime">PERMITIDO</span>
                </div>
                <p className="text-[10px] text-gray-400">
                  {freeShippingEnabled && 18 < parseFloat(freeShippingThreshold || '0')
                    ? `Faltan ${euro(Math.max(0, parseFloat(freeShippingThreshold || '0') - 18))} para envío gratis.`
                    : 'Envío gratuito alcanzado.'}
                </p>
                <div className="flex justify-between text-[11px] text-gray-300 pt-1 border-t border-ya-gray/40">
                  <span>Envío:</span>
                  <span>
                    {freeShippingEnabled && 18 >= parseFloat(freeShippingThreshold || '0')
                      ? '0,00 € (GRATIS)'
                      : euro(parseFloat(standardDeliveryFee || '0'))}
                  </span>
                </div>
              </div>

              {/* Caso C: Pedido grande (35€) */}
              <div className="p-3 bg-ya-lime/10 border-2 border-ya-lime space-y-1.5">
                <div className="flex justify-between font-bold text-white">
                  <span>Pedido de 35,00 €</span>
                  <span className="text-ya-lime font-black">ENVÍO GRATIS</span>
                </div>
                <div className="flex justify-between text-[11px] text-gray-300 pt-1 border-t border-ya-lime/30">
                  <span>Tarifa cobrada:</span>
                  <span className="text-ya-lime font-black">0,00 €</span>
                </div>
              </div>
            </div>
          </div>

          {/* Seguridad y Autoridad */}
          <div className="border-4 border-ya-gray bg-ya-black p-5 text-xs font-mono space-y-2 text-gray-400">
            <div className="text-white font-bold uppercase text-[11px] flex items-center gap-2">
              <DollarSign size={14} className="text-ya-lime" />
              <span>Garantía Anti-Manipulación</span>
            </div>
            <p className="text-[10px] leading-relaxed">
              Todos los cálculos están respaldados por la función RPC <code className="text-ya-lime">create_order</code> en PostgreSQL. Un cliente no puede forzar un subtotal inferior al mínimo ni evitar la tarifa de entrega modificando el frontend.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
