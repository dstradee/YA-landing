import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { euro, productById } from '../data/products';
import type { Address, LocalOrder, OrderStatus } from '../types/app';
import { AppHeader, EmptyState, OrderTimeline } from './components';
import { CartItem } from './CartItem';
import { loadOrders, saveOrder, useCart } from './CartContext';

const deliveryFee = 2.9;

export function CartPage() {
  const { lines, subtotal, clearCart } = useCart();
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
  const navigate = useNavigate();
  const [payment, setPayment] = useState('Tarjeta');
  const [error, setError] = useState('');
  const [address, setAddress] = useState<Address>({
    name: '',
    phone: '',
    street: '',
    number: '',
    floor: '',
    postalCode: '11401',
    city: 'Jerez de la Frontera',
    notes: '',
  });

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

  const change = (key: keyof Address, value: string) =>
    setAddress((old) => ({ ...old, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (
      !address.name.trim() ||
      !address.street.trim() ||
      !address.number.trim() ||
      !address.postalCode.trim() ||
      !address.city.trim()
    ) {
      setError('Por favor completa todos los campos obligatorios (*).');
      return;
    }

    const order: LocalOrder = {
      id: 'YA-' + Math.floor(1000 + Math.random() * 9000),
      createdAt: new Date().toISOString(),
      lines: [...lines],
      address,
      payment,
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      status: 'received',
    };

    saveOrder(order);
    clearCart();
    navigate('/app/pedido/' + order.id);
  };

  return (
    <>
      <AppHeader back />
      <main id="checkout-page" className="max-w-2xl mx-auto px-4 pt-6 pb-28">
        <h1 className="font-black text-4xl tracking-tight">Checkout</h1>
        <p className="text-gray-400 mt-1 font-bold text-sm">
          Confirmación de entrega y método de pago simulado
        </p>

        <form onSubmit={submit} className="mt-6 space-y-6">
          <fieldset className="border-2 border-ya-gray p-4 bg-ya-gray/30">
            <legend className="font-black text-xl px-2 text-ya-lime">Dirección de entrega</legend>
            <div className="grid sm:grid-cols-2 gap-3 mt-2">
              <label className="font-bold text-sm">
                Nombre y Apellidos <span className="text-ya-lime">*</span>
                <input
                  id="checkout-name"
                  required
                  placeholder="Tu nombre"
                  value={address.name}
                  onChange={(e) => change('name', e.target.value)}
                  className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 font-medium text-white"
                />
              </label>

              <label className="font-bold text-sm">
                Teléfono
                <input
                  id="checkout-phone"
                  type="tel"
                  placeholder="600 000 000"
                  value={address.phone ?? ''}
                  onChange={(e) => change('phone', e.target.value)}
                  className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 font-medium text-white"
                />
              </label>

              <label className="sm:col-span-2 font-bold text-sm">
                Calle / Avenida <span className="text-ya-lime">*</span>
                <input
                  id="checkout-street"
                  required
                  placeholder="Calle Larga, Porvera, etc."
                  value={address.street}
                  onChange={(e) => change('street', e.target.value)}
                  className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 font-medium text-white"
                />
              </label>

              <label className="font-bold text-sm">
                Número <span className="text-ya-lime">*</span>
                <input
                  id="checkout-number"
                  required
                  placeholder="12, s/n, etc."
                  value={address.number}
                  onChange={(e) => change('number', e.target.value)}
                  className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 font-medium text-white"
                />
              </label>

              <label className="font-bold text-sm">
                Piso / Puerta / Bloque
                <input
                  id="checkout-floor"
                  placeholder="2º B, Portal 1"
                  value={address.floor}
                  onChange={(e) => change('floor', e.target.value)}
                  className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 font-medium text-white"
                />
              </label>

              <label className="font-bold text-sm">
                Código Postal <span className="text-ya-lime">*</span>
                <input
                  id="checkout-postal"
                  required
                  placeholder="11401"
                  value={address.postalCode}
                  onChange={(e) => change('postalCode', e.target.value)}
                  className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 font-medium text-white"
                />
              </label>

              <label className="font-bold text-sm">
                Ciudad <span className="text-ya-lime">*</span>
                <input
                  id="checkout-city"
                  required
                  value={address.city}
                  onChange={(e) => change('city', e.target.value)}
                  className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 font-medium text-white"
                />
              </label>

              <label className="sm:col-span-2 font-bold text-sm">
                Notas para el repartidor
                <textarea
                  id="checkout-notes"
                  rows={2}
                  placeholder="Ej: Tocar al telefonillo 2B, la puerta del portal está abierta."
                  value={address.notes ?? ''}
                  onChange={(e) => change('notes', e.target.value)}
                  className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 font-medium text-white"
                />
              </label>
            </div>
            <p className="text-xs text-gray-400 mt-3 font-medium">
              📍 Cobertura inicial activa en casco urbano de Jerez de la Frontera.
            </p>
          </fieldset>

          <fieldset className="border-2 border-ya-gray p-4 bg-ya-gray/30">
            <legend className="font-black text-xl px-2 text-ya-lime">Método de pago</legend>
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
              ⚡ Pago simulado para fase frontend. No se efectuará ningún cargo bancario real.
            </p>
          </fieldset>

          {error && (
            <p role="alert" className="border-2 border-red-500 bg-red-950/40 p-3 font-bold text-red-200">
              {error}
            </p>
          )}

          <div className="border-2 border-ya-gray p-4 bg-ya-black space-y-2 font-bold">
            <div className="flex justify-between text-sm text-gray-300">
              <span>Subtotal</span>
              <span>{euro(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-300">
              <span>Coste de entrega</span>
              <span>{euro(deliveryFee)}</span>
            </div>
            <div className="flex justify-between text-xl font-black pt-2 border-t border-ya-gray">
              <span>Total a pagar</span>
              <span className="text-ya-lime">{euro(subtotal + deliveryFee)}</span>
            </div>
          </div>

          <button
            id="confirm-order-btn"
            type="submit"
            className="w-full bg-ya-lime text-ya-black font-black p-4 text-lg uppercase tracking-wider hover:bg-white transition-colors"
          >
            Confirmar pedido · {euro(subtotal + deliveryFee)}
          </button>
        </form>
      </main>
    </>
  );
}

export function OrderPage() {
  const { id } = useParams();
  const [orders, setOrders] = useState(loadOrders);
  const order = orders.find((item) => item.id === id);

  if (!order) {
    return (
      <>
        <AppHeader back />
        <main className="p-4 pb-28 max-w-2xl mx-auto">
          <EmptyState
            title="Pedido no encontrado"
            text="Puede que no exista o pertenezca a otra sesión de navegador."
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

  const statuses: OrderStatus[] = [
    'received',
    'preparing',
    'shopping',
    'ready',
    'delivering',
    'delivered',
  ];

  const advance = () => {
    const next = statuses[Math.min(statuses.indexOf(order.status) + 1, statuses.length - 1)];
    const updated = orders.map((item) => (item.id === order.id ? { ...item, status: next } : item));
    localStorage.setItem('ya-orders-v1', JSON.stringify(updated));
    setOrders(updated);
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
              const prod = productById(item.productId);
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
            ⚡ Simular siguiente estado
          </button>
        )}
      </main>
    </>
  );
}
