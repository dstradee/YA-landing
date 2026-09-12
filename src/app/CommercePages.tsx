import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { euro } from '../data/products';
import type { Address, DbAddress, LocalOrder, OrderStatus } from '../types/app';
import { AppHeader, EmptyState, OrderTimeline } from './components';
import { CartItem } from './CartItem';
import { loadOrders, useCart } from './CartContext';
import { useCatalog } from './CatalogContext';
import { useAuth } from '../lib/auth';
import {
  fetchUserAddresses,
  createUserAddress,
  createOrderViaRpc,
  createAdminTestOrderViaRpc,
  fetchOrderByIdOrNumber,
  subscribeToOrderStatus,
  checkCouriersAvailable,
  type OrderWithDetails,
} from '../lib/orders';
import {
  MapPin,
  Plus,
  Check,
  CreditCard,
  Loader2,
  AlertCircle,
  LogIn,
  UserPlus,
  ShieldCheck,
  CheckCircle2,
  Zap,
  Users,
  RefreshCw,
} from 'lucide-react';
import { PayPalPaymentSection } from '../components/PayPalPaymentSection';
import { requestCapturePayPalOrder } from '../lib/paypalClient';

export function CartPage() {
  const { lines, clearCart, pricing, hasOutOfStockItems, activeSubscription } = useCart();

  return (
    <>
      <AppHeader />
      <main id="cart-page" className="max-w-2xl mx-auto px-4 pt-6 pb-28">
        <div className="flex justify-between items-center">
          <h1 className="font-black text-4xl tracking-tight">Carrito</h1>
          {lines.length > 0 && (
            <button
              id="clear-cart-btn"
              onClick={clearCart}
              className="text-xs font-black tracking-wider text-gray-400 hover:text-ya-lime uppercase py-2 px-3 border border-ya-gray hover:border-ya-lime"
            >
              Vaciar carrito
            </button>
          )}
        </div>

        {!lines.length ? (
          <div className="mt-8">
            <EmptyState
              title="Tu carrito está vacío"
              text="¿Una energética bien fría, un pack o unos snacks? Elige lo que necesitas."
            />
            <Link
              id="empty-cart-explore-btn"
              to="/app"
              className="block bg-ya-lime text-ya-black font-black text-center p-4 mt-6 uppercase tracking-wider hover:bg-white transition-colors"
            >
              Explorar productos y packs
            </Link>
          </div>
        ) : (
          <>
            {/* Barra de progreso de Envío Gratis */}
            {pricing.freeShippingEnabled && (
              <div
                id="cart-free-shipping-banner"
                className={`mt-4 p-3.5 border-2 ${
                  pricing.isFreeShipping
                    ? 'border-ya-lime bg-ya-lime/10 text-white'
                    : 'border-ya-gray bg-ya-black text-gray-300'
                }`}
              >
                <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider">
                  <span className={pricing.isFreeShipping ? 'text-ya-lime' : 'text-gray-300'}>
                    {pricing.isFreeShipping
                      ? '⚡ ¡ENVÍO GRATIS CONSEGUIDO EN JEREZ!'
                      : `Añade ${euro(pricing.freeShippingRemaining)} más para ENVÍO GRATIS`}
                  </span>
                  <span className="font-mono text-gray-400">
                    {euro(pricing.subtotal)} / {euro(pricing.freeShippingThreshold)}
                  </span>
                </div>
                <div className="w-full bg-ya-gray h-2 mt-2 overflow-hidden">
                  <div
                    className="bg-ya-lime h-full transition-all duration-300"
                    style={{ width: `${pricing.freeShippingProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Alerta de Artículos Agotados o Insuficientes (Fase 5) */}
            {hasOutOfStockItems && (
              <div
                id="cart-out-of-stock-alert"
                className="mt-3 p-3.5 border-2 border-red-500 bg-red-950/40 text-red-200 text-xs font-bold flex items-center gap-2"
              >
                <AlertCircle size={16} className="text-red-400 shrink-0" />
                <span>
                  Hay artículos en tu carrito con <strong>stock insuficiente o agotados</strong>. Por favor, retíralos o ajusta sus unidades para poder tramitar tu pedido.
                </span>
              </div>
            )}

            {/* Alerta de Pedido Mínimo si no se alcanza */}
            {pricing.minOrderEnabled && !pricing.isMinOrderSatisfied && (
              <div
                id="cart-min-order-alert"
                className="mt-3 p-3.5 border-2 border-amber-400/80 bg-amber-950/30 text-amber-200 text-xs font-bold flex items-center gap-2"
              >
                <AlertCircle size={16} className="text-amber-400 shrink-0" />
                <span>
                  Pedido mínimo requerido: <strong className="text-white">{euro(pricing.minOrderAmount)}</strong>.
                  Te faltan <strong className="text-amber-300">{euro(pricing.minOrderRemaining)}</strong> para poder tramitar el pedido.
                </span>
              </div>
            )}

            {/* Listado de artículos */}
            <div className="mt-4 space-y-3">
              {lines.map((line) => (
                <CartItem key={line.lineId || line.productId} line={line} />
              ))}
            </div>

            {/* Resumen Comercial */}
            <aside id="cart-summary" className="mt-6 border-2 border-ya-gray bg-ya-gray/40 p-4 space-y-2 font-bold">
              <div className="flex justify-between text-gray-300 text-sm">
                <span>Subtotal catálogo</span>
                <span className="font-black text-white">{euro(pricing.rawSubtotal)}</span>
              </div>

              {/* Descuentos de productos o categorías */}
              {pricing.totalSavings > 0 && (
                <div className="flex justify-between text-ya-lime text-sm">
                  <span>Descuentos automáticos</span>
                  <span className="font-black">-{euro(pricing.totalSavings)}</span>
                </div>
              )}

              {/* Promoción global por volumen */}
              {pricing.appliedPromotion && (
                <div className="flex justify-between text-ya-lime text-sm bg-ya-black/50 p-2 border border-ya-lime/30">
                  <span className="truncate pr-2">
                    Promo: {pricing.appliedPromotion.name}
                  </span>
                  <span className="font-black shrink-0">
                    -{euro(pricing.promotionDiscount)}
                  </span>
                </div>
              )}

              {/* Coste de entrega */}
              <div className="flex justify-between text-gray-300 text-sm">
                <span>Entrega exprés en Jerez</span>
                <span className="font-black text-white">
                  {pricing.isFreeShipping ? (
                    <span className="text-ya-lime uppercase">GRATIS</span>
                  ) : (
                    euro(pricing.deliveryFee)
                  )}
                </span>
              </div>

              {/* Total final */}
              <div className="border-t-2 border-ya-gray pt-3 mt-3 flex justify-between items-baseline">
                <div>
                  <span className="text-xl font-black text-white block">Total</span>
                  {pricing.totalSavings > 0 && (
                    <span className="text-[11px] text-ya-lime font-bold">
                      Ahorras {euro(pricing.totalSavings)} en este pedido
                    </span>
                  )}
                </div>
                <span className="text-3xl font-black text-ya-lime">{euro(pricing.total)}</span>
              </div>

              {/* YA+ Member Active Notice */}
              {activeSubscription && (
                <div className="mt-3 flex items-center gap-2 border border-ya-lime/40 bg-ya-lime/10 p-2.5 text-xs text-ya-lime">
                  <Zap className="h-4 w-4 shrink-0" />
                  <span className="font-mono text-[11px]">
                    Beneficios <strong>YA+</strong> activos: Entrega gratuita y descuentos aplicados.
                  </span>
                </div>
              )}
            </aside>

            {/* YA Juntos & YA+ Upsell Cards */}
            <div className="mt-4 space-y-2">
              <Link
                to="/app/juntos"
                className="flex items-center justify-between border-2 border-zinc-700 bg-zinc-950 p-3 hover:border-ya-lime transition group"
              >
                <div className="flex items-center gap-2.5">
                  <Users className="h-5 w-5 text-ya-lime shrink-0" />
                  <div>
                    <span className="text-xs font-black uppercase text-white block">
                      ¿Pides en grupo? Usa YA Juntos
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      Comparte el carrito y cada uno paga lo suyo tipo Tricount
                    </span>
                  </div>
                </div>
                <span className="font-mono text-xs font-black text-ya-lime group-hover:underline shrink-0">
                  CREAR GRUPO →
                </span>
              </Link>

              {!activeSubscription && (
                <Link
                  to="/app/ya-plus"
                  className="flex items-center justify-between border border-ya-lime/40 bg-ya-lime/10 p-3 hover:bg-ya-lime/20 transition group"
                >
                  <div className="flex items-center gap-2.5">
                    <Zap className="h-5 w-5 text-ya-lime shrink-0" />
                    <div>
                      <span className="text-xs font-black uppercase text-white block">
                        Ahorra en este y todos tus pedidos con YA+
                      </span>
                      <span className="text-[11px] text-zinc-300">
                        Envíos gratis ilimitados por solo 4,99 €/mes
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-black text-ya-lime group-hover:underline shrink-0">
                    VER PLANES →
                  </span>
                </Link>
              )}
            </div>

            {hasOutOfStockItems ? (
              <div className="mt-6 space-y-2">
                <button
                  disabled
                  className="w-full bg-red-950/40 border-2 border-red-500/60 text-red-300 font-black p-4 text-center text-sm uppercase tracking-wider cursor-not-allowed"
                >
                  Quita los productos agotados para continuar
                </button>
                <p className="text-center text-xs text-red-400 font-bold">
                  Revisa los productos marcados en rojo en tu cesta antes de tramitar el pedido.
                </p>
              </div>
            ) : pricing.isMinOrderSatisfied ? (
              <Link
                id="go-to-checkout-btn"
                to="/app/checkout"
                className="block bg-ya-lime text-ya-black text-center font-black p-4 mt-6 text-lg uppercase tracking-wider hover:bg-white transition-colors"
              >
                Ir al checkout →
              </Link>
            ) : (
              <div className="mt-6 space-y-2">
                <button
                  disabled
                  className="w-full bg-ya-gray text-gray-500 cursor-not-allowed font-black p-4 text-center text-sm uppercase tracking-wider border-2 border-ya-gray"
                >
                  Pedido mínimo {euro(pricing.minOrderAmount)} (Faltan {euro(pricing.minOrderRemaining)})
                </button>
                <Link
                  to="/app"
                  className="block text-center text-xs font-black uppercase tracking-wider text-ya-lime hover:underline py-1"
                >
                  + Seguir comprando productos o packs
                </Link>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

export function CheckoutPage() {
  const { lines, clearCart, pricing, hasOutOfStockItems } = useCart();
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Estados de checkout
  const [checkoutMode, setCheckoutMode] = useState<'paypal' | 'test_free'>('paypal');
  const [payment, setPayment] = useState('PayPal');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<{
    id: string;
    number: string;
    total: number;
  } | null>(null);

  // Gestión de direcciones
  const [userAddresses, setUserAddresses] = useState<DbAddress[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | 'new'>('new');

  // Formulario de nueva dirección
  const [newAddress, setNewAddress] = useState<Address>({
    name: '',
    phone: '',
    street: '',
    number: '',
    floor: '',
    postalCode: '11401',
    city: 'Jerez de la Frontera',
    notes: '',
  });

  // Notas para el repartidor
  const [courierNotes, setCourierNotes] = useState('');

  // Disponibilidad de repartidores en Jerez
  const [couriersAvailable, setCouriersAvailable] = useState<boolean | null>(null);
  const [checkingCouriers, setCheckingCouriers] = useState(false);

  // Comprobar disponibilidad de repartidores al cargar el checkout
  useEffect(() => {
    let isMounted = true;
    setCheckingCouriers(true);
    checkCouriersAvailable().then((res) => {
      if (isMounted) {
        setCouriersAvailable(res.available);
        setCheckingCouriers(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // 1. Cargar direcciones del usuario autenticado y pre-rellenar datos de contacto
  useEffect(() => {
    if (!user) return;

    setLoadingAddresses(true);
    fetchUserAddresses(user.id)
      .then((addresses) => {
        setUserAddresses(addresses);
        if (addresses.length > 0) {
          // Si tiene direcciones guardadas, pre-seleccionar la predeterminada o primera
          const def = addresses.find((a) => a.is_default) || addresses[0];
          setSelectedAddressId(def.id);
        } else {
          setSelectedAddressId('new');
        }
      })
      .finally(() => setLoadingAddresses(false));

    // Pre-rellenar formulario de nueva dirección con perfil del usuario
    setNewAddress((prev) => ({
      ...prev,
      name: prev.name || profile?.full_name || user.user_metadata?.full_name || '',
      phone: prev.phone || profile?.phone || user.phone || '',
    }));
  }, [user, profile]);

  if (!lines.length) {
    return (
      <>
        <AppHeader back />
        <main className="p-4 pb-28 max-w-2xl mx-auto">
          <EmptyState
            title="No hay productos en el carrito"
            text="Añade productos o packs antes de realizar el pedido."
          />
          <Link
            to="/app"
            className="block bg-ya-lime text-ya-black font-black text-center p-4 mt-6 uppercase"
          >
            Volver a la tienda
          </Link>
        </main>
      </>
    );
  }

  // Si aún está cargando la sesión
  if (authLoading) {
    return (
      <>
        <AppHeader back />
        <main className="p-4 pb-28 max-w-2xl mx-auto text-center pt-16">
          <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-ya-lime animate-pulse">
            <Loader2 size={16} className="animate-spin" /> Verificando sesión...
          </div>
        </main>
      </>
    );
  }

  // ==============================================================================
  // CASO A: USUARIO NO AUTENTICADO
  // ==============================================================================
  if (!user) {
    return (
      <>
        <AppHeader back />
        <main id="checkout-guest-required" className="max-w-2xl mx-auto px-4 pt-6 pb-28">
          <h1 className="font-black text-4xl tracking-tight">Checkout</h1>
          <p className="text-gray-400 mt-1 font-bold text-sm">
            Confirmación de entrega y pedido seguro en Jerez
          </p>

          <div className="mt-8 border-2 border-ya-lime bg-ya-gray/30 p-6 sm:p-8">
            <div className="w-14 h-14 bg-ya-black border-2 border-ya-lime text-ya-lime flex items-center justify-center mb-4">
              <ShieldCheck size={28} />
            </div>

            <h2 className="font-black text-2xl uppercase tracking-tight text-white">
              Inicia sesión para completar tu pedido
            </h2>
            <p className="text-gray-300 font-medium text-sm mt-2 leading-relaxed">
              Para crear tu pedido real, asignarte seguimiento en tiempo real y vincular tu dirección en Jerez, necesitas una cuenta en YA.
            </p>
            <p className="text-ya-lime font-bold text-xs uppercase tracking-wider mt-3">
              ✓ Tus {lines.reduce((s, i) => s + i.quantity, 0)} artículos están seguros en tu carrito y se conservarán al volver.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Link
                id="checkout-login-btn"
                to="/login"
                className="flex-1 bg-ya-lime text-ya-black font-black uppercase tracking-wider p-4 text-center hover:bg-white transition-colors flex items-center justify-center gap-2"
              >
                <LogIn size={18} /> Iniciar sesión
              </Link>
              <Link
                id="checkout-register-btn"
                to="/registro"
                className="flex-1 border-2 border-white text-white font-black uppercase tracking-wider p-4 text-center hover:bg-white hover:text-ya-black transition-colors flex items-center justify-center gap-2"
              >
                <UserPlus size={18} /> Crear cuenta
              </Link>
            </div>
          </div>

          {/* Resumen previo del carrito para comodidad del cliente */}
          <section className="mt-6 border-2 border-ya-gray p-5 bg-ya-black space-y-2 font-bold">
            <h3 className="font-black text-sm uppercase tracking-wider text-gray-400 mb-3">
              Resumen del carrito
            </h3>
            <div className="flex justify-between text-sm text-gray-300">
              <span>Productos ({lines.reduce((s, i) => s + i.quantity, 0)})</span>
              <span>{euro(pricing.rawSubtotal)}</span>
            </div>
            {pricing.totalSavings > 0 && (
              <div className="flex justify-between text-sm text-ya-lime">
                <span>Descuentos aplicados</span>
                <span>-{euro(pricing.totalSavings)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-gray-300">
              <span>Entrega exprés en Jerez</span>
              <span>{pricing.isFreeShipping ? 'GRATIS' : euro(pricing.deliveryFee)}</span>
            </div>
            <div className="flex justify-between text-xl font-black pt-2 border-t border-ya-gray">
              <span>Total a pagar</span>
              <span className="text-ya-lime">{euro(pricing.total)}</span>
            </div>
          </section>
        </main>
      </>
    );
  }

  // ==============================================================================
  // CASO B: USUARIO AUTENTICADO -> CHECKOUT REAL
  // ==============================================================================

  const changeNewAddress = (key: keyof Address, value: string) =>
    setNewAddress((old) => ({ ...old, [key]: value }));

  const handleSubmitOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);

    // Validar stock disponible antes de enviar al RPC (Fase 5)
    if (hasOutOfStockItems) {
      setError(
        'Hay artículos en tu carrito con stock insuficiente o agotados. Por favor, regresa al carrito para quitarlos o ajustar sus cantidades antes de continuar.'
      );
      return;
    }

    // Validar pedido mínimo de forma preventiva (exento en pedidos de prueba para administradores)
    if (checkoutMode !== 'test_free' && pricing.minOrderEnabled && !pricing.isMinOrderSatisfied) {
      setError(
        `No se alcanza el pedido mínimo de ${euro(pricing.minOrderAmount)}. Te faltan ${euro(
          pricing.minOrderRemaining
        )} para tramitar el pedido.`
      );
      return;
    }

    // Validar disponibilidad de repartidores en Jerez (exento en pedidos de prueba para administradores)
    if (checkoutMode !== 'test_free') {
      setIsSubmitting(true);
      const courierCheck = await checkCouriersAvailable();
      if (!courierCheck.available) {
        setCouriersAvailable(false);
        setError(
          'En este momento todos nuestros repartidores en Jerez están ocupados o no hay turnos activos. La tramitación de pedidos está pausada temporalmente para garantizar la calidad del servicio.'
        );
        setIsSubmitting(false);
        return;
      }
      setCouriersAvailable(true);
      setIsSubmitting(false);
    }

    let targetAddressId: string = '';

    // 1. Determinar dirección: existente o crear nueva
    if (selectedAddressId !== 'new') {
      targetAddressId = selectedAddressId;
    } else {
      // Validar campos de nueva dirección
      if (
        !newAddress.name.trim() ||
        !newAddress.street.trim() ||
        !newAddress.number.trim() ||
        !newAddress.postalCode.trim() ||
        !newAddress.city.trim()
      ) {
        setError('Por favor completa todos los campos obligatorios de la dirección (*).');
        return;
      }

      setIsSubmitting(true);
      const resAddress = await createUserAddress({
        userId: user.id,
        name: newAddress.name,
        phone: newAddress.phone,
        street: newAddress.street,
        number: newAddress.number,
        floor_door: newAddress.floor,
        postal_code: newAddress.postalCode,
        city: newAddress.city,
        notes: newAddress.notes,
        is_default: userAddresses.length === 0,
      });

      if (resAddress.error || !resAddress.address) {
        setIsSubmitting(false);
        setError(resAddress.error || 'No se pudo guardar la dirección de entrega.');
        return;
      }

      targetAddressId = resAddress.address.id;
    }

    // 2A. RUTA ALTERNATIVA: PEDIDO DE PRUEBA GRATIS PARA ADMINISTRADORES
    // Verifica en backend/RPC que auth.uid() sea admin, crea el pedido con 0 €, pago 'paid' y sin pasar por PayPal
    if (isAdmin && checkoutMode === 'test_free') {
      setIsSubmitting(true);

      const rpcResult = await createAdminTestOrderViaRpc({
        addressId: targetAddressId,
        lines: lines.map((l) => ({
          productId: l.isPack ? (l.packId || l.productId) : l.productId,
          quantity: l.quantity,
          isPack: l.isPack,
          packId: l.packId,
          selections: l.packSelections,
        })),
        notes: courierNotes.trim() || newAddress.notes || undefined,
      });

      if (!rpcResult.success || !rpcResult.orderId) {
        setIsSubmitting(false);
        setError(rpcResult.error || 'No se pudo procesar el pedido de prueba de administrador.');
        return;
      }

      clearCart();
      setIsSubmitting(false);
      navigate(`/app/pedido/${rpcResult.orderNumber || rpcResult.orderId}?test_order=true`);
      return;
    }

    // 2B. RUTA ESTÁNDAR: Crear pedido con reserva en Supabase y abrir pasarela PayPal
    setIsSubmitting(true);

    const rpcResult = await createOrderViaRpc({
      addressId: targetAddressId,
      lines: lines.map((l) => ({
        productId: l.isPack ? (l.packId || l.productId) : l.productId,
        quantity: l.quantity,
        isPack: l.isPack,
        packId: l.packId,
        selections: l.packSelections,
      })),
      notes: courierNotes.trim() || newAddress.notes || undefined,
      paymentMethod: payment,
    });

    if (!rpcResult.success || !rpcResult.orderId) {
      setIsSubmitting(false);
      setError(rpcResult.error || 'Ocurrió un error al procesar tu pedido. Tu carrito no se ha modificado.');
      return;
    }

    // 3. Pasar al paso de pago interactivo PayPal Sandbox con pedido reservado en DB
    setIsSubmitting(false);
    setPendingOrder({
      id: rpcResult.orderId,
      number: rpcResult.orderNumber || rpcResult.orderId,
      total: pricing.total,
    });
  };

  if (pendingOrder) {
    return (
      <>
        <AppHeader back />
        <main id="checkout-payment-step" className="max-w-2xl mx-auto px-4 pt-6 pb-28 space-y-6">
          <div className="flex items-baseline justify-between">
            <h1 className="font-black text-4xl tracking-tight">Completar Pago</h1>
            <span className="text-xs font-mono font-bold text-ya-lime border border-ya-lime/40 px-2 py-0.5 bg-ya-lime/10">
              Paso 2 de 2 · Reserva Activa
            </span>
          </div>
          <p className="text-gray-400 mt-1 font-bold text-sm">
            Tu pedido está registrado en reserva. Paga ahora con PayPal Sandbox para iniciar la preparación inmediata en Jerez.
          </p>

          <PayPalPaymentSection
            orderId={pendingOrder.id}
            orderNumber={pendingOrder.number}
            amount={pendingOrder.total}
            selectedMethod={payment}
            onMethodChange={(m) => setPayment(m)}
            onPaymentSuccess={({ orderNumber, orderId }) => {
              clearCart();
              navigate(`/app/pedido/${orderNumber || orderId}?payment=success`);
            }}
            onPaymentError={(errMsg) => {
              setError(errMsg);
            }}
            onPaymentCancel={() => {
              // Notifica sin perder datos
            }}
          />

          <div className="pt-4 border-t border-ya-gray flex justify-between items-center text-xs">
            <button
              type="button"
              onClick={() => setPendingOrder(null)}
              className="text-gray-400 hover:text-white underline font-bold"
            >
              ← Modificar dirección o notas
            </button>
            <Link
              to={`/app/pedido/${pendingOrder.number || pendingOrder.id}`}
              className="text-ya-lime hover:underline font-bold"
            >
              Ver ficha del pedido pendiente →
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader back />
      <main id="checkout-page" className="max-w-2xl mx-auto px-4 pt-6 pb-28">
        <div className="flex items-baseline justify-between">
          <h1 className="font-black text-4xl tracking-tight">Checkout</h1>
          <span className="text-xs font-mono font-bold text-gray-400">
            {user.email}
          </span>
        </div>
        <p className="text-gray-400 mt-1 font-bold text-sm">
          Confirmación de entrega y creación de pedido real en Jerez
        </p>

        {/* Notificación de Envío Gratis o Pedido Mínimo */}
        {pricing.freeShippingEnabled && pricing.isFreeShipping && (
          <div className="mt-4 p-3 border-2 border-ya-lime bg-ya-lime/10 text-xs font-black uppercase tracking-wider text-ya-lime flex items-center gap-2">
            <Check size={16} /> ¡Genial! Tu pedido califica para ENVÍO GRATIS a cualquier punto de Jerez.
          </div>
        )}

        <form onSubmit={handleSubmitOrder} className="mt-6 space-y-6">
          {/* SELECCIÓN O INTRODUCCIÓN DE DIRECCIÓN */}
          <fieldset className="border-2 border-ya-gray p-4 bg-ya-gray/30">
            <legend className="font-black text-xl px-2 text-ya-lime flex items-center gap-2">
              <MapPin size={20} /> Dirección de entrega
            </legend>

            {loadingAddresses ? (
              <div className="py-6 text-center text-xs font-mono text-gray-400 animate-pulse">
                Cargando direcciones guardadas...
              </div>
            ) : (
              <>
                {userAddresses.length > 0 && (
                  <div className="space-y-3 mb-4">
                    <p className="text-xs font-black uppercase tracking-wider text-gray-300">
                      Tus direcciones guardadas:
                    </p>
                    <div className="space-y-2">
                      {userAddresses.map((addr) => (
                        <label
                          key={addr.id}
                          className={`block p-3 border-2 cursor-pointer transition-colors ${
                            selectedAddressId === addr.id
                              ? 'border-ya-lime bg-ya-black text-white'
                              : 'border-ya-gray bg-ya-gray/40 text-gray-300 hover:border-gray-500'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="selected-address"
                                checked={selectedAddressId === addr.id}
                                onChange={() => setSelectedAddressId(addr.id)}
                                className="accent-ya-lime"
                              />
                              <span className="font-black text-sm text-white">{addr.name}</span>
                              {addr.is_default && (
                                <span className="bg-ya-lime/20 text-ya-lime text-[10px] font-black uppercase px-1.5 py-0.5 border border-ya-lime/30">
                                  Predeterminada
                                </span>
                              )}
                            </div>
                            {selectedAddressId === addr.id && (
                              <Check size={16} className="text-ya-lime" />
                            )}
                          </div>
                          <p className="text-xs text-gray-300 mt-1 pl-6">
                            {addr.street}, {addr.number} {addr.floor_door ? `(${addr.floor_door})` : ''} · {addr.postal_code} {addr.city}
                          </p>
                          {addr.phone && (
                            <p className="text-xs text-gray-400 pl-6">Tel: {addr.phone}</p>
                          )}
                        </label>
                      ))}

                      <label
                        className={`block p-3 border-2 cursor-pointer transition-colors ${
                          selectedAddressId === 'new'
                            ? 'border-ya-lime bg-ya-black text-white'
                            : 'border-ya-gray bg-ya-gray/40 text-gray-300 hover:border-gray-500'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="selected-address"
                            checked={selectedAddressId === 'new'}
                            onChange={() => setSelectedAddressId('new')}
                            className="accent-ya-lime"
                          />
                          <span className="font-black text-sm flex items-center gap-1.5">
                            <Plus size={16} className="text-ya-lime" /> Añadir otra dirección de entrega
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                {/* Formulario de nueva dirección si no tiene o seleccionó 'new' */}
                {selectedAddressId === 'new' && (
                  <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-ya-gray/70 mt-2">
                    <label className="font-bold text-sm">
                      Nombre y Apellidos <span className="text-ya-lime">*</span>
                      <input
                        id="checkout-name"
                        required
                        placeholder="Tu nombre completo"
                        value={newAddress.name}
                        onChange={(e) => changeNewAddress('name', e.target.value)}
                        className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 font-medium text-white"
                      />
                    </label>

                    <label className="font-bold text-sm">
                      Teléfono de contacto
                      <input
                        id="checkout-phone"
                        type="tel"
                        placeholder="600 000 000"
                        value={newAddress.phone ?? ''}
                        onChange={(e) => changeNewAddress('phone', e.target.value)}
                        className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 font-medium text-white"
                      />
                    </label>

                    <label className="sm:col-span-2 font-bold text-sm">
                      Calle / Avenida <span className="text-ya-lime">*</span>
                      <input
                        id="checkout-street"
                        required
                        placeholder="Calle Larga, Porvera, etc."
                        value={newAddress.street}
                        onChange={(e) => changeNewAddress('street', e.target.value)}
                        className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 font-medium text-white"
                      />
                    </label>

                    <label className="font-bold text-sm">
                      Número <span className="text-ya-lime">*</span>
                      <input
                        id="checkout-number"
                        required
                        placeholder="12, s/n, etc."
                        value={newAddress.number}
                        onChange={(e) => changeNewAddress('number', e.target.value)}
                        className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 font-medium text-white"
                      />
                    </label>

                    <label className="font-bold text-sm">
                      Piso / Puerta / Bloque
                      <input
                        id="checkout-floor"
                        placeholder="2º B, Portal 1"
                        value={newAddress.floor}
                        onChange={(e) => changeNewAddress('floor', e.target.value)}
                        className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 font-medium text-white"
                      />
                    </label>

                    <label className="font-bold text-sm">
                      Código Postal <span className="text-ya-lime">*</span>
                      <input
                        id="checkout-postal"
                        required
                        placeholder="11401"
                        value={newAddress.postalCode}
                        onChange={(e) => changeNewAddress('postalCode', e.target.value)}
                        className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 font-medium text-white"
                      />
                    </label>

                    <label className="font-bold text-sm">
                      Ciudad <span className="text-ya-lime">*</span>
                      <input
                        id="checkout-city"
                        required
                        value={newAddress.city}
                        onChange={(e) => changeNewAddress('city', e.target.value)}
                        className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 font-medium text-white"
                      />
                    </label>
                  </div>
                )}
              </>
            )}

            <div className="mt-4 pt-3 border-t border-ya-gray/70">
              <label className="font-bold text-sm block">
                Instrucciones de entrega para el repartidor (opcional)
                <textarea
                  id="checkout-notes"
                  rows={2}
                  placeholder="Ej: Tocar al telefonillo 2B, la puerta del portal está abierta."
                  value={courierNotes}
                  onChange={(e) => setCourierNotes(e.target.value)}
                  className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 font-medium text-white"
                />
              </label>
            </div>

            <p className="text-xs text-gray-400 mt-3 font-medium flex items-center gap-1">
              <MapPin size={13} className="text-ya-lime" /> Cobertura activa en casco urbano de Jerez de la Frontera.
            </p>
          </fieldset>

          {/* SELECTOR EXCLUSIVO PARA ADMINISTRADORES */}
          {isAdmin && (
            <div className="border-2 border-purple-500 bg-purple-950/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-purple-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse shrink-0" />
                  <span>Opciones de Administrador</span>
                </div>
                <span className="text-[10px] font-mono text-purple-300 border border-purple-500/50 px-1.5 py-0.5 bg-purple-500/20 font-black uppercase">
                  ROL ADMIN DETECTADO
                </span>
              </div>
              <p className="text-xs text-purple-200/90 font-medium">
                Como administrador de YA, puedes elegir entre realizar un pago real con PayPal o crear un pedido de prueba 100% operativo y gratuito:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCheckoutMode('paypal')}
                  className={`p-3 text-left border-2 font-black text-xs uppercase tracking-wider transition-colors flex items-center justify-between ${
                    checkoutMode === 'paypal'
                      ? 'border-ya-lime bg-ya-lime text-ya-black'
                      : 'border-ya-gray bg-ya-black text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <div>
                    <div className="font-black text-xs">Pagar con PayPal</div>
                    <div className="text-[10px] font-mono font-normal opacity-80 mt-0.5">
                      Flujo real · Sandbox ({euro(pricing.total)})
                    </div>
                  </div>
                  {checkoutMode === 'paypal' && <Check size={16} />}
                </button>

                <button
                  type="button"
                  id="admin-test-order-option-btn"
                  onClick={() => setCheckoutMode('test_free')}
                  className={`p-3 text-left border-2 font-black text-xs uppercase tracking-wider transition-colors flex items-center justify-between ${
                    checkoutMode === 'test_free'
                      ? 'border-purple-400 bg-purple-500 text-white shadow-lg'
                      : 'border-purple-500/50 bg-purple-950/20 text-purple-200 hover:border-purple-400'
                  }`}
                >
                  <div>
                    <div className="font-black text-xs">Pedido de prueba · Gratis</div>
                    <div className="text-[10px] font-mono font-normal opacity-90 mt-0.5">
                      Sin PayPal · 0 € · Operativo
                    </div>
                  </div>
                  {checkoutMode === 'test_free' && <Check size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* MÉTODO DE PAGO */}
          {checkoutMode === 'test_free' ? (
            <div className="border-2 border-purple-500/60 p-4 bg-purple-950/20 space-y-2">
              <div className="font-black text-sm uppercase text-purple-300 flex items-center gap-2">
                <CreditCard size={18} className="text-purple-400" /> Método de pago seleccionado
              </div>
              <div className="p-3 border border-purple-500/40 bg-purple-950/40 text-xs font-mono text-purple-200">
                <div className="font-black text-white text-sm uppercase flex items-center justify-between">
                  <span>Pedido de prueba · Gratis</span>
                  <span className="text-ya-lime font-black">0,00 €</span>
                </div>
                <p className="mt-1 text-purple-300/80 font-sans">
                  Este pedido se creará en Supabase con total 0 €, marcado como <strong>Pagado</strong> sin pasar por PayPal, y entrará directamente al flujo normal de YA para probar preparación, reparto y entrega.
                </p>
              </div>
            </div>
          ) : (
            <fieldset className="border-2 border-ya-gray p-4 bg-ya-gray/30">
              <legend className="font-black text-xl px-2 text-ya-lime flex items-center gap-2">
                <CreditCard size={20} /> Método de pago
              </legend>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {['PayPal', 'Tarjeta'].map((method) => (
                  <label
                    key={method}
                    className={
                      'border-2 p-3 font-black cursor-pointer text-center select-none transition-colors text-xs uppercase ' +
                      (payment === method
                        ? 'border-ya-lime bg-ya-lime text-ya-black'
                        : 'border-ya-gray bg-ya-gray text-white hover:border-gray-500')
                    }
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="payment-method"
                      checked={payment === method}
                      onChange={() => setPayment(method)}
                    />
                    {method}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                ⚡ Fase 3C: Pasarela PayPal Sandbox v2. Pagos procesados de forma segura mediante PayPal y Tarjeta.
              </p>
            </fieldset>
          )}

          {error && (
            <div
              role="alert"
              className="border-2 border-red-500 bg-red-950/40 p-4 font-bold text-red-200 flex items-start gap-3"
            >
              <AlertCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-black uppercase tracking-wide text-xs text-red-400">Error al procesar el pedido</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* DESGLOSE SEGURO DEL MOTOR COMERCIAL */}
          {checkoutMode === 'test_free' ? (
            <div className="border-2 border-purple-500/60 p-4 bg-ya-black space-y-2 font-bold font-mono">
              <div className="flex justify-between text-sm text-gray-300">
                <span>Subtotal catálogo ({lines.reduce((s, i) => s + i.quantity, 0)} artículos)</span>
                <span>{euro(pricing.rawSubtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-purple-400">
                <span>Bonificación Pedido de Prueba Admin</span>
                <span>-{euro(pricing.rawSubtotal + (pricing.isFreeShipping ? 0 : pricing.deliveryFee))}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-300">
                <span>Coste de entrega (Jerez)</span>
                <span className="text-ya-lime uppercase">GRATIS</span>
              </div>
              <div className="flex justify-between text-xl font-black pt-2 border-t border-purple-500/40">
                <div>
                  <span className="text-white block font-sans">Total a pagar</span>
                  <span className="text-[11px] text-purple-300 font-normal block font-sans">
                    Pedido de prueba exento de cobro
                  </span>
                </div>
                <span className="text-ya-lime text-2xl font-black">0,00 €</span>
              </div>
            </div>
          ) : (
            <div className="border-2 border-ya-gray p-4 bg-ya-black space-y-2 font-bold">
              <div className="flex justify-between text-sm text-gray-300">
                <span>Subtotal catálogo ({lines.reduce((s, i) => s + i.quantity, 0)} artículos)</span>
                <span>{euro(pricing.rawSubtotal)}</span>
              </div>

              {pricing.totalSavings > 0 && (
                <div className="flex justify-between text-sm text-ya-lime">
                  <span>Descuentos aplicados</span>
                  <span>-{euro(pricing.totalSavings)}</span>
                </div>
              )}

              {pricing.appliedPromotion && (
                <div className="flex justify-between text-sm text-ya-lime bg-ya-gray/30 p-2 border border-ya-lime/30">
                  <span className="truncate pr-2">Promoción ({pricing.appliedPromotion.code})</span>
                  <span>-{euro(pricing.promotionDiscount)}</span>
                </div>
              )}

              <div className="flex justify-between text-sm text-gray-300">
                <span>Coste de entrega (Jerez)</span>
                <span>
                  {pricing.isFreeShipping ? (
                    <span className="text-ya-lime uppercase">GRATIS</span>
                  ) : (
                    euro(pricing.deliveryFee)
                  )}
                </span>
              </div>

              <div className="flex justify-between text-xl font-black pt-2 border-t border-ya-gray">
                <div>
                  <span className="text-white block">Total a pagar</span>
                  {pricing.totalSavings > 0 && (
                    <span className="text-[11px] text-ya-lime font-bold">
                      Ahorro total de {euro(pricing.totalSavings)}
                    </span>
                  )}
                </div>
                <span className="text-ya-lime">{euro(pricing.total)}</span>
              </div>
            </div>
          )}

          {/* BOTÓN CONFIRMAR PEDIDO O BLOQUEO POR STOCK / PEDIDO MÍNIMO */}
          {hasOutOfStockItems ? (
            <div className="space-y-2">
              <button
                type="button"
                disabled
                className="w-full font-black p-4 text-sm uppercase tracking-wider bg-red-950/40 border-2 border-red-500/60 text-red-300 cursor-not-allowed"
              >
                Artículos sin stock en el carrito
              </button>
              <div className="text-center">
                <Link
                  to="/app/carrito"
                  className="text-xs font-black uppercase tracking-wider text-ya-lime hover:underline inline-flex items-center gap-1"
                >
                  ← Volver al carrito para retirar productos agotados
                </Link>
              </div>
            </div>
          ) : checkoutMode === 'test_free' ? (
            <button
              id="confirm-test-order-btn"
              type="submit"
              disabled={isSubmitting}
              className={`w-full font-black p-4 text-base uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
                isSubmitting
                  ? 'bg-ya-gray text-gray-400 cursor-not-allowed border-2 border-ya-gray'
                  : 'bg-purple-600 text-white hover:bg-purple-500 shadow-lg'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Creando pedido de prueba en Supabase...
                </>
              ) : (
                <span>Crear pedido de prueba · Gratis (0 €)</span>
              )}
            </button>
          ) : pricing.minOrderEnabled && !pricing.isMinOrderSatisfied ? (
            <div className="space-y-2">
              <button
                type="button"
                disabled
                className="w-full font-black p-4 text-sm uppercase tracking-wider bg-ya-gray text-gray-500 cursor-not-allowed border-2 border-ya-gray"
              >
                Pedido mínimo {euro(pricing.minOrderAmount)} (Faltan {euro(pricing.minOrderRemaining)})
              </button>
              <p className="text-center text-xs text-gray-400 font-bold">
                Añade más productos o packs a tu carrito para alcanzar el pedido mínimo de entrega.
              </p>
            </div>
          ) : couriersAvailable === false ? (
            <div className="space-y-3">
              <div className="border-2 border-amber-500 bg-amber-500/10 p-4 font-mono text-xs text-amber-300 space-y-2">
                <div className="flex items-center gap-2 font-black uppercase text-amber-400 text-sm">
                  <AlertCircle size={18} />
                  <span>Repartidores ocupados en Jerez</span>
                </div>
                <p className="text-gray-300 font-sans text-xs">
                  Todos nuestros repartidores se encuentran actualmente en ruta completando entregas o fuera de turno. Para garantizar la puntualidad de tu pedido, el botón se reactivará en cuanto un repartidor quede libre.
                </p>
                <button
                  type="button"
                  disabled={checkingCouriers}
                  onClick={async () => {
                    setCheckingCouriers(true);
                    const res = await checkCouriersAvailable();
                    setCouriersAvailable(res.available);
                    setCheckingCouriers(false);
                  }}
                  className="mt-2 px-3 py-1.5 border border-amber-400 text-amber-400 hover:bg-amber-400 hover:text-black font-bold uppercase text-[11px] flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw size={13} className={checkingCouriers ? 'animate-spin' : ''} />
                  <span>{checkingCouriers ? 'Comprobando repartidores...' : 'Recomprobar disponibilidad'}</span>
                </button>
              </div>

              <button
                type="button"
                disabled
                className="w-full font-black p-4 text-sm uppercase tracking-wider bg-ya-gray text-gray-500 cursor-not-allowed border-2 border-ya-gray"
              >
                Repartidores no disponibles temporalmente
              </button>
            </div>
          ) : (
            <button
              id="confirm-order-btn"
              type="submit"
              disabled={isSubmitting}
              className={`w-full font-black p-4 text-lg uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
                isSubmitting
                  ? 'bg-ya-gray text-gray-400 cursor-not-allowed border-2 border-ya-gray'
                  : 'bg-ya-lime text-ya-black hover:bg-white'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Creando pedido en Supabase...
                </>
              ) : (
                `Continuar al pago online · ${euro(pricing.total)}`
              )}
            </button>
          )}
        </form>
      </main>
    </>
  );
}

export function OrderPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isPaymentSuccessNotice = searchParams.get('payment') === 'success';
  const { getProductById } = useCatalog();

  // Estados de carga de pedido
  const [loading, setLoading] = useState(true);
  const [dbOrder, setDbOrder] = useState<OrderWithDetails | null>(null);
  const [localOrder, setLocalOrder] = useState<LocalOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOrderPayment, setShowOrderPayment] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Función para verificar y reconciliar cobros completados en PayPal
  const handleVerifyExistingPayment = async () => {
    if (!dbOrder) return;
    setIsVerifyingPayment(true);
    setVerifyMsg(null);
    try {
      const res = await requestCapturePayPalOrder({
        orderId: dbOrder.id,
      });
      if (res.success || res.status === 'paid' || res.alreadyPaid) {
        setDbOrder((prev) =>
          prev
            ? {
                ...prev,
                status: 'received',
                payment_status: 'paid',
              }
            : prev
        );
        setVerifyMsg({
          type: 'success',
          text: `¡Pago verificado y confirmado exitosamente! Transacción: ${res.captureId || 'Completada'}`,
        });
      } else {
        setVerifyMsg({
          type: 'error',
          text: res.error || 'No se pudo verificar la transacción en PayPal todavía.',
        });
      }
    } catch (err: any) {
      setVerifyMsg({
        type: 'error',
        text: err?.message || 'Error al conectar con la pasarela de PayPal.',
      });
    } finally {
      setIsVerifyingPayment(false);
    }
  };

  // 1. Cargar el pedido: primero buscar en Supabase, si no fallback a mock local
  useEffect(() => {
    if (!id) return;

    let unsubscribeRealtime: (() => void) | null = null;

    setLoading(true);
    fetchOrderByIdOrNumber(id)
      .then((res) => {
        if (res.order) {
          setDbOrder(res.order);
          // Suscribirse a cambios en tiempo real del estado del pedido
          unsubscribeRealtime = subscribeToOrderStatus(res.order.id, (updated) => {
            setDbOrder((prev) => (prev ? { ...prev, ...updated } : prev));
          });
        } else {
          // Fallback a localStorage para pedidos mock creados antes de Phase 2D
          const localOrders = loadOrders();
          const foundLocal = localOrders.find((o) => o.id === id);
          if (foundLocal) {
            setLocalOrder(foundLocal);
          } else {
            setError(res.error || 'Pedido no encontrado');
          }
        }
      })
      .catch((err) => {
        console.warn('Error fetching order:', err);
        const localOrders = loadOrders();
        const foundLocal = localOrders.find((o) => o.id === id);
        if (foundLocal) {
          setLocalOrder(foundLocal);
        } else {
          setError('No se pudo encontrar el pedido');
        }
      })
      .finally(() => setLoading(false));

    return () => {
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
      }
    };
  }, [id]);

  if (loading) {
    return (
      <>
        <AppHeader back />
        <main className="p-4 pb-28 max-w-2xl mx-auto text-center pt-16">
          <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-ya-lime animate-pulse">
            <Loader2 size={16} className="animate-spin" /> Cargando datos del pedido...
          </div>
        </main>
      </>
    );
  }

  // Si no se encuentra ni en DB ni en local
  if (!dbOrder && !localOrder) {
    return (
      <>
        <AppHeader back />
        <main className="p-4 pb-28 max-w-2xl mx-auto">
          <EmptyState
            title="Pedido no encontrado"
            text={error || 'Puede que no exista o pertenezca a otra cuenta de usuario.'}
          />
          <Link
            to="/app/pedidos"
            className="block bg-ya-lime text-ya-black font-black text-center p-4 mt-6 uppercase"
          >
            Ver mis pedidos
          </Link>
        </main>
      </>
    );
  }

  // ==============================================================================
  // A) RENDERIZADO DE PEDIDO REAL (SUPABASE)
  // ==============================================================================
  if (dbOrder) {
    const orderNumber = dbOrder.order_number || dbOrder.id.slice(0, 8);
    const dateStr = new Date(dbOrder.created_at).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
    });

    const addressSnapshot: Address = (dbOrder.delivery_address_snapshot as Address | null) || {
      name: 'Cliente YA',
      street: 'Jerez de la Frontera',
      number: '',
      floor: '',
      postalCode: '11401',
      city: 'Jerez de la Frontera',
    };

    return (
      <>
        <AppHeader back />
        <main id="order-detail-page" className="max-w-2xl mx-auto px-4 pt-6 pb-28">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-ya-lime uppercase tracking-widest text-xs">
                PEDIDO: {orderNumber}
              </span>
              <span className="bg-ya-lime/20 text-ya-lime text-[10px] font-black uppercase px-2 py-0.5 border border-ya-lime/30">
                REAL SUPABASE
              </span>
              {dbOrder.is_test && (
                <span className="bg-purple-500/20 text-purple-300 text-[10px] font-black uppercase px-2 py-0.5 border border-purple-500/50">
                  🧪 PRUEBA ADMIN
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400 font-bold">{dateStr}</span>
          </div>

          <h1 className="font-black text-4xl tracking-tight mt-2">
            {dbOrder.status === 'payment_pending' || dbOrder.payment_status === 'pending'
              ? 'Pendiente de pago'
              : dbOrder.status === 'delivering'
              ? 'Ya estoy repartiendo'
              : dbOrder.status === 'delivered'
              ? 'Pedido entregado'
              : dbOrder.status === 'prepared' || dbOrder.status === 'ready'
              ? 'Pedido preparado'
              : dbOrder.status === 'sourcing' || dbOrder.status === 'shopping'
              ? 'Comprando pedido'
              : dbOrder.status === 'preparing'
              ? 'Preparando pedido'
              : 'Pedido recibido'}
          </h1>
          <p className="text-gray-400 mt-1 font-bold text-sm">
            {dbOrder.status === 'payment_pending' || dbOrder.payment_status === 'pending'
              ? 'Tu pedido está registrado en el sistema. Para que el equipo comience a prepararlo, por favor completa el pago online.'
              : dbOrder.status === 'delivered'
              ? '¡Que lo disfrutes! Gracias por pedir con YA en Jerez.'
              : 'Tu pedido está confirmado y registrado. Puedes consultar el estado en directo.'}
          </p>

          {/* Banner de Pedido de Prueba para Administradores */}
          {dbOrder.is_test && (
            <div className="border-2 border-purple-500 bg-purple-950/40 p-3 mt-4 text-xs font-mono text-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse shrink-0" />
                <span className="font-black uppercase tracking-wider text-purple-300">
                  🧪 Pedido de Prueba · Gratis (Modo Admin)
                </span>
              </div>
              <span className="text-[11px] text-purple-300/90 font-normal">
                Total cobrado: 0,00 € · Pago registrado · Operativo en Jerez
              </span>
            </div>
          )}

          {/* Banner de Estado Pendiente de Pago con Opción Inmediata de Pago/Reintento */}
          {(dbOrder.status === 'payment_pending' || dbOrder.payment_status === 'pending') && (
            <div className="border-2 border-amber-400 bg-amber-950/40 p-4 flex flex-col gap-3 mt-4">
              <div className="flex items-start gap-3">
                <AlertCircle size={24} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-black text-sm uppercase text-amber-300 tracking-wide">
                    ⚠️ PENDIENTE DE PAGO — NO EN PREPARACIÓN
                  </h3>
                  <p className="text-xs text-gray-200 mt-1 leading-relaxed">
                    Este pedido no entrará en preparación ni se asignará a un repartidor hasta que el pago quede completado y verificado en la pasarela.
                  </p>
                </div>
              </div>
              {verifyMsg && (
                <div
                  className={`p-3 text-xs border font-medium ${
                    verifyMsg.type === 'success'
                      ? 'border-ya-lime bg-ya-lime/10 text-ya-lime'
                      : 'border-red-500 bg-red-950/40 text-red-300'
                  }`}
                >
                  {verifyMsg.text}
                </div>
              )}

              {!showOrderPayment ? (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    id="verify-pending-order-now-btn"
                    disabled={isVerifyingPayment}
                    onClick={handleVerifyExistingPayment}
                    className="w-full py-3 px-4 bg-emerald-500 text-black font-black uppercase text-xs tracking-wider hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isVerifyingPayment ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Verificando transacción en PayPal...
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={16} /> Ya pagué en PayPal · Verificar y activar pedido
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    id="pay-pending-order-now-btn"
                    onClick={() => setShowOrderPayment(true)}
                    className="w-full py-3.5 px-4 bg-ya-lime text-ya-black font-black uppercase text-xs tracking-wider hover:bg-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CreditCard size={16} /> Pagar ahora con PayPal o Tarjeta ({euro(Number(dbOrder.total))})
                  </button>
                </div>
              ) : (
                <div className="mt-2 bg-ya-black p-4 border border-amber-400/40">
                  <PayPalPaymentSection
                    orderId={dbOrder.id}
                    orderNumber={orderNumber}
                    amount={Number(dbOrder.total)}
                    selectedMethod={dbOrder.payment_method}
                    onMethodChange={(m) => {
                      setDbOrder((prev) => (prev ? { ...prev, payment_method: m as any } : prev));
                    }}
                    onPaymentSuccess={({ captureId }) => {
                      setDbOrder((prev) =>
                        prev
                          ? {
                              ...prev,
                              status: 'received',
                              payment_status: 'paid',
                              payment_capture_id: captureId,
                              payment_provider: 'paypal',
                              paid_at: new Date().toISOString(),
                            }
                          : prev
                      );
                      setShowOrderPayment(false);
                    }}
                    onPaymentError={(err) => {
                      console.warn('Error en pago en ficha:', err);
                    }}
                    onPaymentCancel={() => {
                      setShowOrderPayment(false);
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Banner de Confirmación de Pago si viene de checkout */}
          {isPaymentSuccessNotice && dbOrder.payment_status === 'paid' && (
            <div className="border-2 border-ya-lime bg-ya-lime/10 p-4 flex items-start gap-3 mt-4">
              <CheckCircle2 size={24} className="text-ya-lime shrink-0 mt-0.5" />
              <div>
                <h3 className="font-black text-sm uppercase text-ya-lime tracking-wide">
                  ¡Pago verificado con éxito vía PayPal!
                </h3>
                <p className="text-xs text-gray-200 mt-1">
                  La transacción ha sido confirmada por la pasarela e inscrita en el registro de pagos. Tu pedido ya está recibido y entra en preparación.
                </p>
              </div>
            </div>
          )}

          {/* Banner si el usuario canceló en la pasarela PayPal */}
          {searchParams.get('payment') === 'cancelled' && (
            <div className="border-2 border-amber-400 bg-amber-950/40 p-4 flex items-start gap-3 mt-4">
              <AlertCircle size={24} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-black text-sm uppercase text-amber-300 tracking-wide">
                  Pago cancelado en PayPal
                </h3>
                <p className="text-xs text-gray-200 mt-1">
                  Has cancelado la operación en PayPal Sandbox. Tu pedido sigue guardado como pendiente para que puedas completarlo cuando lo desees.
                </p>
              </div>
            </div>
          )}

          {/* Timeline de estado real */}
          <section className="mt-8 bg-ya-gray border-2 border-ya-gray p-6">
            <h2 className="font-black text-lg text-white mb-6 uppercase tracking-wider">
              Estado de tu pedido
            </h2>
            <OrderTimeline status={dbOrder.status} />
          </section>

          {/* Dirección y Pago Real */}
          <section className="mt-6 bg-ya-gray/30 border-2 border-ya-gray p-5 space-y-3">
            <h2 className="font-black text-lg text-white uppercase tracking-wider">
              Datos de entrega y cobro
            </h2>
            <div className="text-sm space-y-1">
              <p className="font-black text-white">{addressSnapshot.name}</p>
              <p className="text-gray-300">
                {addressSnapshot.street}, {addressSnapshot.number}
                {addressSnapshot.floor ? ` (${addressSnapshot.floor})` : ''}
              </p>
              <p className="text-gray-400">
                {addressSnapshot.postalCode} {addressSnapshot.city}
              </p>
              {addressSnapshot.phone && (
                <p className="text-gray-400">Tel: {addressSnapshot.phone}</p>
              )}
              {(dbOrder.notes || addressSnapshot.notes) && (
                <p className="text-ya-lime text-xs font-bold pt-1">
                  Nota: {dbOrder.notes || addressSnapshot.notes}
                </p>
              )}
            </div>

            {/* Ficha detallada de pago */}
            <div className="pt-3 border-t border-ya-gray space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400 font-bold">Método seleccionado:</span>
                <span className="text-white uppercase font-black">{dbOrder.payment_method}</span>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-gray-400">Estado del pago:</span>
                <span
                  className={`text-[11px] font-black uppercase px-2.5 py-1 tracking-wider border ${
                    dbOrder.is_test
                      ? 'border-purple-500 bg-purple-950/40 text-purple-300'
                      : dbOrder.payment_status === 'paid'
                      ? 'border-ya-lime bg-ya-lime/20 text-ya-lime'
                      : dbOrder.payment_status === 'failed' || dbOrder.payment_status === 'cancelled'
                      ? 'border-rose-500 bg-rose-950/40 text-rose-300'
                      : 'border-amber-400 bg-amber-950/40 text-amber-300 animate-pulse'
                  }`}
                >
                  {dbOrder.is_test
                    ? 'PEDIDO DE PRUEBA · GRATIS (ADMIN)'
                    : dbOrder.payment_status === 'paid'
                    ? 'PAGO CONFIRMADO (SANDBOX)'
                    : dbOrder.payment_status === 'failed'
                    ? 'PAGO FALLIDO'
                    : dbOrder.payment_status === 'cancelled'
                    ? 'PAGO CANCELADO'
                    : 'PENDIENTE DE PAGO'}
                </span>
              </div>

              {dbOrder.payment_status === 'paid' ? (
                <div className="text-[11px] font-mono text-gray-400 space-y-1 pt-2 bg-ya-black/50 p-3 border border-ya-gray">
                  <div className="flex justify-between">
                    <span>Pasarela:</span>
                    <span className="text-gray-200 font-bold uppercase">
                      {dbOrder.is_test ? 'PRUEBA INTERNA (ADMIN)' : (dbOrder.payment_provider || 'paypal sandbox')}
                    </span>
                  </div>
                  {(dbOrder.payment_capture_id || dbOrder.payment_reference) && (
                    <div className="flex justify-between">
                      <span>Ref. Captura:</span>
                      <span className="text-ya-lime font-bold">{dbOrder.payment_capture_id || dbOrder.payment_reference}</span>
                    </div>
                  )}
                  {dbOrder.paid_at && (
                    <div className="flex justify-between">
                      <span>Fecha cobro:</span>
                      <span className="text-gray-300">{new Date(dbOrder.paid_at).toLocaleString('es-ES')}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="pt-2">
                  {!showOrderPayment ? (
                    <button
                      type="button"
                      onClick={() => setShowOrderPayment(true)}
                      className="w-full py-3 px-4 bg-ya-lime text-ya-black font-black uppercase text-xs tracking-wider hover:bg-white transition-colors flex items-center justify-center gap-2"
                    >
                      <CreditCard size={16} /> Completar pago online ({euro(dbOrder.total)})
                    </button>
                  ) : (
                    <div className="pt-2">
                      <PayPalPaymentSection
                        orderId={dbOrder.id}
                        orderNumber={orderNumber}
                        amount={dbOrder.total}
                        selectedMethod={dbOrder.payment_method}
                        onMethodChange={(m) => {
                          setDbOrder((prev) => (prev ? { ...prev, payment_method: m as any } : prev));
                        }}
                        onPaymentSuccess={({ captureId }) => {
                          setDbOrder((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  payment_status: 'paid',
                                  payment_capture_id: captureId,
                                  payment_provider: 'paypal',
                                  paid_at: new Date().toISOString(),
                                }
                              : prev
                          );
                          setShowOrderPayment(false);
                        }}
                        onPaymentError={(err) => {
                          console.warn('Error en pago en ficha:', err);
                        }}
                        onPaymentCancel={() => {
                          setShowOrderPayment(false);
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Artículos reales guardados con precio histórico */}
          <section className="mt-6 border-2 border-ya-gray p-5">
            <h2 className="font-black text-lg uppercase tracking-wider mb-3">Artículos del pedido</h2>
            <div className="divide-y-2 divide-ya-gray">
              {dbOrder.order_items.map((item) => {
                const isPack = Boolean(item.is_pack);
                const selections = (item.pack_selections_snapshot as any[]) || [];
                const discountAmt = Number(item.discount_amount || 0);

                return (
                  <div key={item.id} className="py-3 text-sm font-bold">
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-2">
                        <span className="text-ya-lime font-black shrink-0">{item.quantity}x</span>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isPack && (
                              <span className="bg-ya-lime text-ya-black text-[9px] font-black uppercase px-1.5 py-0.5 tracking-wider">
                                PACK
                              </span>
                            )}
                            <span className="text-white">{item.product_name}</span>
                          </div>

                          {/* Selecciones de pack si existen */}
                          {isPack && selections.length > 0 && (
                            <div className="mt-1 space-y-0.5 pl-1">
                              {selections.map((sel, sIdx) => (
                                <p key={sIdx} className="text-xs text-gray-400 font-mono">
                                  · {sel.group_name || sel.groupName}:{' '}
                                  <span className="text-gray-200">{sel.product_name || sel.productName}</span>
                                </p>
                              ))}
                            </div>
                          )}

                          {discountAmt > 0 && (
                            <p className="text-[11px] text-ya-lime mt-0.5">
                              Descuento unitario aplicado: -{euro(discountAmt)}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="font-black shrink-0 text-white ml-3">
                        {euro(Number(item.subtotal))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t-2 border-ya-gray pt-4 mt-2 space-y-1 text-sm font-bold">
              <div className="flex justify-between text-gray-400">
                <span>Subtotal catálogo</span>
                <span>{euro(Number(dbOrder.subtotal) + Number(dbOrder.discount_total || 0) + Number(dbOrder.promotion_discount || 0))}</span>
              </div>

              {Number(dbOrder.discount_total || 0) > 0 && (
                <div className="flex justify-between text-ya-lime">
                  <span>Descuentos automáticos</span>
                  <span>-{euro(Number(dbOrder.discount_total))}</span>
                </div>
              )}

              {Number(dbOrder.promotion_discount || 0) > 0 && (
                <div className="flex justify-between text-ya-lime">
                  <span>
                    Promoción {dbOrder.promotion_code ? `(${dbOrder.promotion_code})` : ''}
                  </span>
                  <span>-{euro(Number(dbOrder.promotion_discount))}</span>
                </div>
              )}

              {dbOrder.is_test && (
                <div className="flex justify-between text-purple-400 font-mono text-xs">
                  <span>Bonificación Pedido de Prueba Admin</span>
                  <span>-{euro(Number(dbOrder.subtotal))}</span>
                </div>
              )}

              <div className="flex justify-between text-gray-400">
                <span>Entrega exprés en Jerez</span>
                <span>
                  {Number(dbOrder.delivery_fee) === 0 ? (
                    <span className="text-ya-lime uppercase">GRATIS</span>
                  ) : (
                    euro(Number(dbOrder.delivery_fee))
                  )}
                </span>
              </div>

              <div className="flex justify-between text-xl font-black text-white pt-2 border-t border-ya-gray">
                <span>Total</span>
                <span className="text-ya-lime">{euro(Number(dbOrder.total))}</span>
              </div>
            </div>
          </section>

          <div className="mt-6">
            <Link
              to="/app/pedidos"
              className="block w-full text-center border-2 border-ya-gray text-gray-300 hover:border-ya-lime hover:text-white p-4 font-black uppercase tracking-wider text-xs transition-colors"
            >
              Volver a mis pedidos
            </Link>
          </div>
        </main>
      </>
    );
  }

  // ==============================================================================
  // B) RENDERIZADO DE PEDIDO LOCAL / COMPATIBILIDAD CON PEDIDOS MOCK PREVIOS
  // ==============================================================================
  const order = localOrder!;
  const statuses: OrderStatus[] = [
    'received',
    'preparing',
    'shopping',
    'ready',
    'delivering',
    'delivered',
  ];

  const advance = () => {
    const localOrders = loadOrders();
    const next = statuses[Math.min(statuses.indexOf(order.status) + 1, statuses.length - 1)];
    const updated = localOrders.map((item) =>
      item.id === order.id ? { ...item, status: next } : item
    );
    localStorage.setItem('ya-orders-v1', JSON.stringify(updated));
    setLocalOrder({ ...order, status: next });
  };

  return (
    <>
      <AppHeader back />
      <main id="order-detail-page" className="max-w-2xl mx-auto px-4 pt-6 pb-28">
        <div className="flex items-center justify-between">
          <p className="font-bold text-ya-lime uppercase tracking-widest text-xs">
            ID: {order.id}
          </p>
          <span className="text-xs text-gray-400 font-bold">
            {new Date(order.createdAt).toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        <h1 className="font-black text-4xl tracking-tight mt-2">
          {order.status === 'delivering'
            ? 'Ya estoy repartiendo'
            : order.status === 'delivered'
            ? 'Pedido entregado'
            : order.status === 'ready'
            ? 'Pedido preparado'
            : order.status === 'shopping'
            ? 'Comprando pedido'
            : order.status === 'preparing'
            ? 'Preparando pedido'
            : 'Pedido recibido'}
        </h1>
        <p className="text-gray-400 mt-1 font-bold text-sm">
          {order.status === 'delivered'
            ? '¡Que lo disfrutes! Gracias por pedir con YA.'
            : 'Tu pedido está en marcha. Te avisamos de cada paso en tiempo real.'}
        </p>

        {/* Timeline */}
        <section className="mt-8 bg-ya-gray border-2 border-ya-gray p-6">
          <h2 className="font-black text-lg text-white mb-6 uppercase tracking-wider">
            Estado de tu pedido
          </h2>
          <OrderTimeline status={order.status} />
        </section>

        {/* Dirección y Pago */}
        <section className="mt-6 bg-ya-gray/30 border-2 border-ya-gray p-5 space-y-3">
          <h2 className="font-black text-lg text-white uppercase tracking-wider">
            Datos de entrega
          </h2>
          <div className="text-sm space-y-1">
            <p className="font-black text-white">{order.address.name}</p>
            <p className="text-gray-300">
              {order.address.street}, {order.address.number}
              {order.address.floor ? ` (${order.address.floor})` : ''}
            </p>
            <p className="text-gray-400">
              {order.address.postalCode} {order.address.city}
            </p>
            {order.address.phone && (
              <p className="text-gray-400">Tel: {order.address.phone}</p>
            )}
            {order.address.notes && (
              <p className="text-ya-lime text-xs font-bold pt-1">
                Nota: {order.address.notes}
              </p>
            )}
          </div>
          <div className="pt-2 border-t border-ya-gray text-xs text-gray-400 font-bold flex justify-between">
            <span>Método de pago:</span>
            <span className="text-white">{order.payment}</span>
          </div>
        </section>

        {/* Artículos */}
        <section className="mt-6 border-2 border-ya-gray p-5">
          <h2 className="font-black text-lg uppercase tracking-wider mb-3">Productos</h2>
          <div className="divide-y-2 divide-ya-gray">
            {order.lines.map((item) => {
              const prod = getProductById(item.productId);
              return (
                <div key={item.productId} className="py-3 flex justify-between items-center text-sm font-bold">
                  <div className="flex items-center gap-2">
                    <span className="text-ya-lime font-black">{item.quantity}x</span>
                    <span>{prod?.name ?? item.productId}</span>
                  </div>
                  <span className="font-black">
                    {euro((prod?.price ?? 0) * item.quantity)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="border-t-2 border-ya-gray pt-4 mt-2 space-y-1 text-sm font-bold">
            <div className="flex justify-between text-gray-400">
              <span>Subtotal</span>
              <span>{euro(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Entrega</span>
              <span>{euro(order.deliveryFee)}</span>
            </div>
            <div className="flex justify-between text-xl font-black text-white pt-2 border-t border-ya-gray">
              <span>Total</span>
              <span className="text-ya-lime">{euro(order.total)}</span>
            </div>
          </div>
        </section>

        {order.status !== 'delivered' && (
          <button
            id="advance-status-simulation-btn"
            onClick={advance}
            className="mt-6 w-full border-2 border-ya-lime text-ya-lime font-black p-4 uppercase tracking-wider hover:bg-ya-lime hover:text-ya-black transition-colors"
          >
            ⚡ Simular siguiente estado (mock local)
          </button>
        )}
      </main>
    </>
  );
}
