import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
  fetchActiveDeliveryZone,
  createOrderViaRpc,
  fetchOrderByIdOrNumber,
  subscribeToOrderStatus,
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
} from 'lucide-react';

export function CartPage() {
  const { lines, subtotal, clearCart } = useCart();
  const [deliveryFee, setDeliveryFee] = useState(2.9);

  useEffect(() => {
    fetchActiveDeliveryZone().then((res) => {
      if (res && res.fee) {
        setDeliveryFee(res.fee);
      }
    });
  }, []);

  const total = subtotal + (lines.length ? deliveryFee : 0);

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
              text="¿Una energética bien fría o unos snacks? Elige lo que necesitas."
            />
            <Link
              id="empty-cart-explore-btn"
              to="/app"
              className="block bg-ya-lime text-ya-black font-black text-center p-4 mt-6 uppercase tracking-wider hover:bg-white transition-colors"
            >
              Explorar productos
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-6 space-y-3">
              {lines.map((line) => (
                <CartItem key={line.productId} line={line} />
              ))}
            </div>

            <aside id="cart-summary" className="mt-6 border-2 border-ya-gray bg-ya-gray/40 p-4 space-y-2 font-bold">
              <p className="flex justify-between text-gray-300">
                <span>Productos</span>
                <span className="font-black text-white">{euro(subtotal)}</span>
              </p>
              <p className="flex justify-between text-gray-300">
                <span>Entrega exprés en Jerez</span>
                <span className="font-black text-white">{euro(deliveryFee)}</span>
              </p>
              <div className="border-t-2 border-ya-gray pt-3 mt-3 flex justify-between items-baseline">
                <span className="text-xl font-black text-white">Total</span>
                <span className="text-3xl font-black text-ya-lime">{euro(total)}</span>
              </div>
            </aside>

            <Link
              id="go-to-checkout-btn"
              to="/app/checkout"
              className="block bg-ya-lime text-ya-black text-center font-black p-4 mt-6 text-lg uppercase tracking-wider hover:bg-white transition-colors"
            >
              Ir al checkout →
            </Link>
          </>
        )}
      </main>
    </>
  );
}

export function CheckoutPage() {
  const { lines, subtotal, clearCart } = useCart();
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Estados de checkout
  const [deliveryFee, setDeliveryFee] = useState(2.9);
  const [payment, setPayment] = useState('Tarjeta');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // 1. Cargar tarifa de zona activa
  useEffect(() => {
    fetchActiveDeliveryZone().then((res) => {
      if (res && res.fee) {
        setDeliveryFee(res.fee);
      }
    });
  }, []);

  // 2. Cargar direcciones del usuario autenticado y pre-rellenar datos de contacto
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
            text="Añade productos antes de realizar el pedido."
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
              ✓ Tus {lines.reduce((s, i) => s + i.quantity, 0)} productos están seguros en tu carrito y se conservarán al volver.
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
              <span>{euro(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-300">
              <span>Entrega exprés en Jerez</span>
              <span>{euro(deliveryFee)}</span>
            </div>
            <div className="flex justify-between text-xl font-black pt-2 border-t border-ya-gray">
              <span>Total a pagar</span>
              <span className="text-ya-lime">{euro(subtotal + deliveryFee)}</span>
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

    // 2. Crear pedido real en Supabase de forma atómica y segura mediante la RPC
    setIsSubmitting(true);

    const rpcResult = await createOrderViaRpc({
      addressId: targetAddressId,
      lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      notes: courierNotes.trim() || newAddress.notes || undefined,
      paymentMethod: payment,
    });

    if (!rpcResult.success || !rpcResult.orderId) {
      setIsSubmitting(false);
      setError(rpcResult.error || 'Ocurrió un error al procesar tu pedido. Tu carrito no se ha modificado.');
      return;
    }

    // 3. Éxito: vaciar carrito SOLO tras confirmación en base de datos y redirigir
    clearCart();
    setIsSubmitting(false);
    navigate('/app/pedido/' + (rpcResult.orderNumber || rpcResult.orderId));
  };

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

          {/* MÉTODO DE PAGO */}
          <fieldset className="border-2 border-ya-gray p-4 bg-ya-gray/30">
            <legend className="font-black text-xl px-2 text-ya-lime flex items-center gap-2">
              <CreditCard size={20} /> Método de pago
            </legend>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {['Tarjeta', 'Apple Pay', 'Google Pay', 'Bizum'].map((method) => (
                <label
                  key={method}
                  className={
                    'border-2 p-4 font-black cursor-pointer text-center select-none transition-colors ' +
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
              ⚡ Fase 2D: Pago de prueba. No se realizará ningún cargo bancario en tu cuenta.
            </p>
          </fieldset>

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

          {/* DESGLOSE SEGURO */}
          <div className="border-2 border-ya-gray p-4 bg-ya-black space-y-2 font-bold">
            <div className="flex justify-between text-sm text-gray-300">
              <span>Subtotal productos ({lines.reduce((s, i) => s + i.quantity, 0)})</span>
              <span>{euro(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-300">
              <span>Coste de entrega (Jerez)</span>
              <span>{euro(deliveryFee)}</span>
            </div>
            <div className="flex justify-between text-xl font-black pt-2 border-t border-ya-gray">
              <span>Total a pagar</span>
              <span className="text-ya-lime">{euro(subtotal + deliveryFee)}</span>
            </div>
          </div>

          {/* BOTÓN CONFIRMAR PEDIDO */}
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
              `Confirmar pedido · ${euro(subtotal + deliveryFee)}`
            )}
          </button>
        </form>
      </main>
    </>
  );
}

export function OrderPage() {
  const { id } = useParams();
  const { getProductById } = useCatalog();

  // Estados de carga de pedido
  const [loading, setLoading] = useState(true);
  const [dbOrder, setDbOrder] = useState<OrderWithDetails | null>(null);
  const [localOrder, setLocalOrder] = useState<LocalOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            <div className="flex items-center gap-2">
              <span className="font-black text-ya-lime uppercase tracking-widest text-xs">
                PEDIDO: {orderNumber}
              </span>
              <span className="bg-ya-lime/20 text-ya-lime text-[10px] font-black uppercase px-2 py-0.5 border border-ya-lime/30">
                REAL SUPABASE
              </span>
            </div>
            <span className="text-xs text-gray-400 font-bold">{dateStr}</span>
          </div>

          <h1 className="font-black text-4xl tracking-tight mt-2">
            {dbOrder.status === 'delivering'
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
            {dbOrder.status === 'delivered'
              ? '¡Que lo disfrutes! Gracias por pedir con YA en Jerez.'
              : 'Tu pedido está registrado en el sistema. Puedes consultar el estado en directo.'}
          </p>

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
              Datos de entrega
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
            <div className="pt-2 border-t border-ya-gray text-xs text-gray-400 font-bold flex justify-between">
              <span>Método de pago:</span>
              <span className="text-white uppercase font-black">{dbOrder.payment_method}</span>
            </div>
          </section>

          {/* Artículos reales guardados con precio histórico */}
          <section className="mt-6 border-2 border-ya-gray p-5">
            <h2 className="font-black text-lg uppercase tracking-wider mb-3">Productos</h2>
            <div className="divide-y-2 divide-ya-gray">
              {dbOrder.order_items.map((item) => (
                <div key={item.id} className="py-3 flex justify-between items-center text-sm font-bold">
                  <div className="flex items-center gap-2">
                    <span className="text-ya-lime font-black">{item.quantity}x</span>
                    <span>{item.product_name}</span>
                  </div>
                  <span className="font-black">
                    {euro(Number(item.subtotal))}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t-2 border-ya-gray pt-4 mt-2 space-y-1 text-sm font-bold">
              <div className="flex justify-between text-gray-400">
                <span>Subtotal</span>
                <span>{euro(Number(dbOrder.subtotal))}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Entrega exprés en Jerez</span>
                <span>{euro(Number(dbOrder.delivery_fee))}</span>
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
