import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { euro } from '../data/products';
import { AppHeader, EmptyState } from './components';
import { loadOrders } from './CartContext';
import { MapPin, Phone, Mail, ShoppingBag, CreditCard, ChevronRight } from 'lucide-react';

export function OrdersPage() {
  const orders = loadOrders();

  return (
    <>
      <AppHeader />
      <main id="orders-page" className="max-w-2xl mx-auto px-4 pt-6 pb-28">
        <h1 className="font-black text-4xl uppercase tracking-tight">Mis pedidos</h1>
        <p className="text-gray-400 font-bold text-xs uppercase tracking-wider mt-1">
          Historial de entregas y seguimiento en Jerez
        </p>

        {orders.length ? (
          <div className="mt-6 space-y-4">
            {orders.map((order) => {
              const count = order.lines.reduce((sum, line) => sum + line.quantity, 0);
              const dateStr = new Date(order.createdAt).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              });

              return (
                <article
                  key={order.id}
                  id={`order-card-${order.id}`}
                  className="bg-ya-gray border-2 border-ya-gray hover:border-ya-lime p-5 transition-colors"
                >
                  <div className="flex justify-between items-start font-black">
                    <div>
                      <span className="text-ya-lime text-xs uppercase tracking-wider block">
                        PEDIDO
                      </span>
                      <span className="text-2xl tracking-tight">{order.id}</span>
                    </div>
                    <span className="text-2xl text-ya-lime tracking-tight">
                      {euro(order.total)}
                    </span>
                  </div>

                  <div className="mt-3 text-xs font-bold text-gray-400 space-y-1">
                    <p>
                      {dateStr} · {count} {count === 1 ? 'producto' : 'productos'}
                    </p>
                    <p className="text-gray-300">
                      📍 {order.address.street}, {order.address.number}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-ya-gray/70 flex items-center justify-between">
                    <span className="inline-block px-2.5 py-1 bg-ya-black text-ya-lime border border-ya-lime/30 text-[10px] font-black uppercase tracking-wider">
                      {order.status === 'delivered'
                        ? '✓ Entregado'
                        : order.status === 'delivering'
                        ? '● Repartiendo'
                        : order.status === 'ready'
                        ? '● Preparado'
                        : order.status === 'shopping'
                        ? '● Comprando'
                        : order.status === 'preparing'
                        ? '● Preparando'
                        : '● Recibido'}
                    </span>
                    <Link
                      to={'/app/pedido/' + order.id}
                      className="text-xs font-black uppercase tracking-wider text-ya-lime hover:text-white flex items-center gap-1"
                    >
                      Ver seguimiento <ChevronRight size={14} />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-8">
            <EmptyState
              title="Todavía no tienes pedidos"
              text="Cuando confirmes tu primer pedido en Jerez aparecerá aquí con seguimiento en directo."
            />
            <Link
              to="/app"
              className="block bg-ya-lime text-ya-black font-black text-center p-4 mt-6 uppercase tracking-wider hover:bg-white transition-colors"
            >
              Hacer mi primer pedido
            </Link>
          </div>
        )}
      </main>
    </>
  );
}

export function ProfilePage() {
  const orders = loadOrders();

  return (
    <>
      <AppHeader />
      <main id="profile-page" className="max-w-2xl mx-auto px-4 pt-6 pb-28">
        {/* Banner de Usuario */}
        <div className="bg-ya-lime text-ya-black p-6 border-2 border-ya-lime">
          <p className="font-black uppercase text-xs tracking-widest text-black/80">
            Cuenta de usuario
          </p>
          <h1 className="font-black text-4xl sm:text-5xl tracking-tight mt-1">Alex de YA</h1>
          <div className="mt-3 text-sm font-bold space-y-1 text-black/90">
            <p className="flex items-center gap-2">
              <Mail size={16} /> alex@ya.app
            </p>
            <p className="flex items-center gap-2">
              <Phone size={16} /> +34 600 123 456
            </p>
            <p className="flex items-center gap-2">
              <MapPin size={16} /> Jerez de la Frontera, Cádiz (11401)
            </p>
          </div>
        </div>

        {/* Resumen de actividad */}
        <div className="grid grid-cols-2 gap-3 mt-6">
          <div className="bg-ya-gray border-2 border-ya-gray p-4">
            <p className="text-xs font-bold text-gray-400 uppercase">Pedidos totales</p>
            <p className="text-3xl font-black text-ya-lime mt-1">{orders.length}</p>
          </div>
          <div className="bg-ya-gray border-2 border-ya-gray p-4">
            <p className="text-xs font-bold text-gray-400 uppercase">Ciudad activa</p>
            <p className="text-xl font-black text-white mt-1 truncate">Jerez de la Fra.</p>
          </div>
        </div>

        {/* Secciones y accesos */}
        <div className="mt-6 border-2 border-ya-gray divide-y-2 divide-ya-gray bg-ya-gray/30">
          <Link
            to="/app/pedidos"
            className="p-4 font-black flex items-center justify-between hover:bg-ya-gray transition-colors text-white"
          >
            <span className="flex items-center gap-2">
              <ShoppingBag size={18} className="text-ya-lime" /> Mis pedidos
            </span>
            <span className="text-gray-400">→</span>
          </Link>

          <div className="p-4 font-black flex items-center justify-between hover:bg-ya-gray transition-colors cursor-pointer text-white">
            <span className="flex items-center gap-2">
              <MapPin size={18} className="text-ya-lime" /> Mis direcciones guardadas
            </span>
            <span className="text-xs font-bold text-gray-400">Jerez centro →</span>
          </div>

          <div className="p-4 font-black flex items-center justify-between hover:bg-ya-gray transition-colors cursor-pointer text-white">
            <span className="flex items-center gap-2">
              <CreditCard size={18} className="text-ya-lime" /> Métodos de pago (Mock)
            </span>
            <span className="text-xs font-bold text-gray-400">Tarjeta / Bizum →</span>
          </div>
        </div>

        <Link
          to="/login"
          className="block mt-8 text-center p-4 border-2 border-ya-gray font-black uppercase tracking-wider text-gray-400 hover:border-ya-lime hover:text-ya-lime transition-colors"
        >
          Cerrar sesión (Mock)
        </Link>
      </main>
    </>
  );
}

function AuthForm({ register }: { register?: boolean }) {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMessage(
      register
        ? '✓ Cuenta creada con éxito. Bienvenido a YA Jerez.'
        : '✓ Sesión iniciada correctamente. Redirigiendo a la app...'
    );
    setTimeout(() => navigate('/app'), 600);
  };

  return (
    <main className="min-h-screen max-w-md mx-auto px-4 pt-12 pb-16 flex flex-col justify-center">
      <div>
        <Link to="/" className="text-ya-lime font-black text-6xl tracking-tighter">
          YA
        </Link>
        <p className="mt-2 text-xs font-black text-gray-400 uppercase tracking-widest">
          Lo necesitas. Lo tienes.
        </p>
      </div>

      <div className="mt-8 border-2 border-ya-gray p-6 bg-ya-gray/30">
        <h1 className="font-black text-3xl uppercase tracking-tight">
          {register ? 'Crear cuenta' : 'Iniciar sesión'}
        </h1>
        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-1">
          {register
            ? 'Regístrate para pedir en Jerez en segundos'
            : 'Accede a tu cuenta mock de YA'}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {register && (
            <label className="block font-bold text-xs uppercase tracking-wider">
              Nombre y Apellidos
              <input
                id="auth-name"
                required
                type="text"
                placeholder="Ej: Laura Morales"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 text-white font-medium"
              />
            </label>
          )}

          <label className="block font-bold text-xs uppercase tracking-wider">
            Correo electrónico
            <input
              id="auth-email"
              required
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 text-white font-medium"
            />
          </label>

          {register && (
            <label className="block font-bold text-xs uppercase tracking-wider">
              Teléfono móvil
              <input
                id="auth-phone"
                required
                type="tel"
                placeholder="612 345 678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 text-white font-medium"
              />
            </label>
          )}

          <label className="block font-bold text-xs uppercase tracking-wider">
            Contraseña
            <input
              id="auth-password"
              required
              minLength={6}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 text-white font-medium"
            />
          </label>

          <button
            id="auth-submit-btn"
            type="submit"
            className="w-full bg-ya-lime text-ya-black p-4 font-black uppercase tracking-wider hover:bg-white transition-colors mt-2"
          >
            {register ? 'Crear cuenta' : 'Iniciar sesión'}
          </button>

          {message && (
            <p
              role="status"
              className="font-black text-sm text-ya-lime bg-ya-black p-3 border border-ya-lime text-center"
            >
              {message}
            </p>
          )}
        </form>

        <div className="mt-6 pt-4 border-t border-ya-gray text-center text-sm font-bold text-gray-400">
          {register ? '¿Ya tienes una cuenta? ' : '¿Aún no tienes cuenta? '}
          <Link
            className="text-ya-lime hover:underline uppercase tracking-wider text-xs ml-1"
            to={register ? '/login' : '/registro'}
          >
            {register ? 'Entrar' : 'Registrarse'}
          </Link>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link
          to="/app"
          className="text-xs font-bold text-gray-400 hover:text-ya-lime uppercase tracking-widest"
        >
          ← Continuar como invitado en /app
        </Link>
      </div>
    </main>
  );
}

export function LoginPage() {
  return <AuthForm />;
}

export function RegisterPage() {
  return <AuthForm register />;
}
