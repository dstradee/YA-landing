import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { euro } from '../data/products';
import { AppHeader, EmptyState } from './components';
import { loadOrders } from './CartContext';
import {
  MapPin,
  Phone,
  Mail,
  ShoppingBag,
  CreditCard,
  ChevronRight,
  User,
  LogOut,
  Edit2,
  Check,
  X,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../lib/auth';

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
  const { user, profile, role, isAdmin, loading, signOut, updateProfile } = useAuth();
  const navigate = useNavigate();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const startEditing = () => {
    setEditName(profile?.full_name || '');
    setEditPhone(profile?.phone || '');
    setSaveMessage(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setSaveMessage(null);
  };

  // Guardar datos modificados
  // SEGURIDAD: Solo se envían full_name y phone. Ningún parámetro de id ni de role.
  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMessage(null);

    const res = await updateProfile({
      full_name: editName,
      phone: editPhone,
    });

    setIsSaving(false);
    if (res.success) {
      setSaveMessage({ type: 'success', text: '✓ Perfil actualizado correctamente.' });
      setIsEditing(false);
    } else {
      setSaveMessage({ type: 'error', text: res.error || 'Error al guardar los cambios.' });
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/app');
  };

  if (loading) {
    return (
      <>
        <AppHeader />
        <main className="max-w-2xl mx-auto px-4 pt-12 text-center">
          <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-ya-lime animate-pulse">
            <Loader2 size={16} className="animate-spin" /> Cargando cuenta de usuario...
          </div>
        </main>
      </>
    );
  }

  // CASO: Usuario NO autenticado
  if (!user) {
    return (
      <>
        <AppHeader />
        <main id="profile-page-guest" className="max-w-2xl mx-auto px-4 pt-6 pb-28">
          <div className="bg-ya-gray border-2 border-ya-gray p-8 text-center">
            <div className="w-16 h-16 bg-ya-black border-2 border-ya-lime text-ya-lime flex items-center justify-center mx-auto mb-4">
              <User size={32} />
            </div>
            <h1 className="font-black text-3xl uppercase tracking-tight">No has iniciado sesión</h1>
            <p className="text-gray-400 font-bold text-sm mt-2 max-w-md mx-auto">
              Inicia sesión o crea tu cuenta en YA para guardar tus direcciones en Jerez, ver tus pedidos anteriores y seguir entregas en tiempo real.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center max-w-sm mx-auto">
              <Link
                id="profile-guest-login-btn"
                to="/login"
                className="block flex-1 bg-ya-lime text-ya-black font-black uppercase tracking-wider p-4 text-center hover:bg-white transition-colors"
              >
                Iniciar sesión
              </Link>
              <Link
                id="profile-guest-register-btn"
                to="/registro"
                className="block flex-1 border-2 border-ya-lime text-ya-lime font-black uppercase tracking-wider p-4 text-center hover:bg-ya-lime hover:text-ya-black transition-colors"
              >
                Crear cuenta
              </Link>
            </div>
          </div>

          <div className="mt-6 border-2 border-ya-gray p-5 bg-ya-black text-center">
            <p className="text-xs font-bold text-gray-400">
              ¿Quieres seguir navegando? Puedes consultar el catálogo y añadir productos al carrito sin registrarte.
            </p>
            <Link to="/app" className="inline-block mt-3 text-xs font-black uppercase text-ya-lime hover:underline tracking-wider">
              Ir a la tienda de Jerez →
            </Link>
          </div>
        </main>
      </>
    );
  }

  // CASO: Usuario AUTENTICADO
  const displayName = profile?.full_name || user.email?.split('@')[0] || 'Usuario YA';
  const displayPhone = profile?.phone || 'Sin teléfono guardado';

  return (
    <>
      <AppHeader />
      <main id="profile-page" className="max-w-2xl mx-auto px-4 pt-6 pb-28">
        {/* Banner de Usuario Real */}
        <div className="bg-ya-lime text-ya-black p-6 border-2 border-ya-lime">
          <div className="flex items-center justify-between">
            <p className="font-black uppercase text-xs tracking-widest text-black/80">
              Cuenta de usuario
            </p>
            <span className="bg-ya-black text-ya-lime text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 border border-ya-black">
              {isAdmin ? 'Administrador' : role === 'courier' ? 'Repartidor' : 'Cliente YA'}
            </span>
          </div>

          <h1 className="font-black text-3xl sm:text-4xl tracking-tight mt-2 break-words">
            {displayName}
          </h1>

          <div className="mt-3 text-sm font-bold space-y-1 text-black/90">
            <p className="flex items-center gap-2">
              <Mail size={16} /> {user.email}
            </p>
            <p className="flex items-center gap-2">
              <Phone size={16} /> {displayPhone}
            </p>
            <p className="flex items-center gap-2">
              <MapPin size={16} /> Jerez de la Frontera, Cádiz
            </p>
          </div>

          {!isEditing && (
            <div className="mt-4 pt-4 border-t border-black/20 flex items-center justify-between">
              <button
                type="button"
                onClick={startEditing}
                className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider bg-ya-black text-white px-3 py-1.5 hover:bg-white hover:text-ya-black transition-colors"
              >
                <Edit2 size={13} /> Editar datos personales
              </button>
            </div>
          )}
        </div>

        {/* Notificación de guardado */}
        {saveMessage && (
          <div
            className={`mt-4 p-3 border text-xs font-black uppercase tracking-wider flex items-center gap-2 ${
              saveMessage.type === 'success'
                ? 'bg-ya-black text-ya-lime border-ya-lime'
                : 'bg-ya-black text-red-400 border-red-500'
            }`}
          >
            {saveMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
            <span>{saveMessage.text}</span>
          </div>
        )}

        {/* Formulario de Edición de Perfil (Solo Nombre y Teléfono) */}
        {isEditing && (
          <form
            onSubmit={handleSaveProfile}
            className="mt-6 p-5 border-2 border-ya-lime bg-ya-gray/50 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-ya-gray pb-2">
              <h2 className="font-black text-sm uppercase tracking-wider text-ya-lime flex items-center gap-2">
                <Edit2 size={14} /> Modificar datos personales
              </h2>
              <button
                type="button"
                onClick={cancelEditing}
                className="text-gray-400 hover:text-white"
                aria-label="Cerrar edición"
              >
                <X size={18} />
              </button>
            </div>

            <label className="block text-xs font-bold uppercase tracking-wider">
              Nombre y Apellidos
              <input
                id="edit-profile-name"
                required
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="block mt-1 w-full bg-ya-black border-2 border-ya-gray focus:border-ya-lime outline-none p-3 text-white font-medium"
              />
            </label>

            <label className="block text-xs font-bold uppercase tracking-wider">
              Teléfono de contacto
              <input
                id="edit-profile-phone"
                type="tel"
                placeholder="612 345 678"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="block mt-1 w-full bg-ya-black border-2 border-ya-gray focus:border-ya-lime outline-none p-3 text-white font-medium"
              />
            </label>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 bg-ya-lime text-ya-black p-3 font-black uppercase text-xs tracking-wider hover:bg-white transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                className="px-4 py-3 border-2 border-ya-gray text-gray-300 font-black uppercase text-xs tracking-wider hover:border-white transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* Acceso directo a Panel Admin si el usuario tiene rol 'admin' */}
        {isAdmin && (
          <div className="mt-6 bg-ya-black border-2 border-ya-lime p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck size={20} className="text-ya-lime" />
              <div>
                <p className="font-black text-sm uppercase tracking-wider text-ya-lime">
                  Panel de Administración
                </p>
                <p className="text-xs text-gray-400 font-bold">
                  Tienes permisos para gestionar categorías y productos
                </p>
              </div>
            </div>
            <Link
              to="/admin"
              className="px-3 py-2 bg-ya-lime text-ya-black font-black uppercase text-xs tracking-wider hover:bg-white transition-colors"
            >
              Abrir /admin →
            </Link>
          </div>
        )}

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

        {/* Botón de Logout Real */}
        <button
          id="profile-logout-btn"
          type="button"
          onClick={handleLogout}
          className="w-full mt-8 p-4 border-2 border-ya-gray font-black uppercase tracking-wider text-gray-400 hover:border-red-500 hover:text-red-400 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut size={16} /> Cerrar sesión
        </button>
      </main>
    </>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { user, signIn, signOut } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Si ya tiene sesión activa
  if (user) {
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

        <div className="mt-8 border-2 border-ya-lime p-6 bg-ya-gray/30">
          <h1 className="font-black text-2xl uppercase tracking-tight text-ya-lime">
            Sesión activa
          </h1>
          <p className="text-xs text-gray-300 font-bold mt-2">
            Has iniciado sesión como <span className="text-white">{user.email}</span>.
          </p>

          <div className="mt-6 space-y-3">
            <Link
              to="/app"
              className="block w-full bg-ya-lime text-ya-black p-4 font-black text-center uppercase tracking-wider hover:bg-white transition-colors"
            >
              Continuar a la tienda
            </Link>
            <button
              type="button"
              onClick={() => signOut()}
              className="block w-full border-2 border-ya-gray text-gray-400 p-3 font-black text-center uppercase text-xs tracking-wider hover:border-white hover:text-white transition-colors"
            >
              Cerrar sesión e ingresar con otra cuenta
            </button>
          </div>
        </div>
      </main>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    const res = await signIn(email, password);
    setIsSubmitting(false);

    if (res.success) {
      navigate('/app');
    } else {
      setErrorMessage(res.error || 'Error al iniciar sesión.');
    }
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
        <h1 className="font-black text-3xl uppercase tracking-tight">Iniciar sesión</h1>
        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-1">
          Accede a tu cuenta de YA Jerez
        </p>

        {errorMessage && (
          <div
            role="alert"
            className="mt-4 p-3 bg-red-950/60 border-2 border-red-500 text-red-300 text-xs font-bold flex items-start gap-2"
          >
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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

          <label className="block font-bold text-xs uppercase tracking-wider">
            Contraseña
            <input
              id="auth-password"
              required
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
            disabled={isSubmitting}
            className="w-full bg-ya-lime text-ya-black p-4 font-black uppercase tracking-wider hover:bg-white transition-colors mt-2 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Iniciando sesión...
              </>
            ) : (
              'Iniciar sesión'
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-ya-gray text-center text-sm font-bold text-gray-400">
          ¿Aún no tienes cuenta?
          <Link
            className="text-ya-lime hover:underline uppercase tracking-wider text-xs ml-1"
            to="/registro"
          >
            Registrarse
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

export function RegisterPage() {
  const navigate = useNavigate();
  const { user, signUp } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Si ya tiene sesión activa
  if (user) {
    return (
      <main className="min-h-screen max-w-md mx-auto px-4 pt-12 pb-16 flex flex-col justify-center">
        <div className="border-2 border-ya-lime p-6 bg-ya-gray/30 text-center">
          <h1 className="font-black text-2xl uppercase tracking-tight text-ya-lime">
            Ya tienes una cuenta activa
          </h1>
          <p className="text-xs text-gray-300 font-bold mt-2">
            Sesión iniciada como <span className="text-white">{user.email}</span>.
          </p>
          <Link
            to="/app"
            className="block mt-6 w-full bg-ya-lime text-ya-black p-4 font-black uppercase tracking-wider hover:bg-white transition-colors"
          >
            Ir a la tienda
          </Link>
        </div>
      </main>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessNotice('');

    if (password !== confirmPassword) {
      setErrorMessage('Las contraseñas no coinciden. Por favor verifícalas.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setIsSubmitting(true);

    // REGISTRO REAL CON SUPABASE AUTH:
    // El frontend NO envía role. El trigger on_auth_user_created en PostgreSQL asigna role = 'customer'.
    const res = await signUp(email, password, name, phone);
    setIsSubmitting(false);

    if (res.success) {
      if (res.requiresEmailConfirmation) {
        setSuccessNotice(
          `✓ Cuenta creada correctamente. Hemos enviado un correo de confirmación a ${email}. Por favor verifica tu bandeja de entrada para activar tu cuenta.`
        );
      } else {
        setSuccessNotice('✓ Cuenta creada e iniciada con éxito. Redirigiendo a la app...');
        setTimeout(() => navigate('/app'), 900);
      }
    } else {
      setErrorMessage(res.error || 'Error al registrar la cuenta.');
    }
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
        <h1 className="font-black text-3xl uppercase tracking-tight">Crear cuenta</h1>
        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-1">
          Regístrate para pedir en Jerez en segundos
        </p>

        {errorMessage && (
          <div
            role="alert"
            className="mt-4 p-3 bg-red-950/60 border-2 border-red-500 text-red-300 text-xs font-bold flex items-start gap-2"
          >
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successNotice && (
          <div
            role="status"
            className="mt-4 p-4 bg-ya-black border-2 border-ya-lime text-ya-lime text-xs font-black flex items-start gap-2"
          >
            <Check size={18} className="shrink-0 mt-0.5 text-ya-lime" />
            <span>{successNotice}</span>
          </div>
        )}

        {!successNotice && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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

            <label className="block font-bold text-xs uppercase tracking-wider">
              Teléfono móvil
              <input
                id="auth-phone"
                type="tel"
                placeholder="612 345 678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 text-white font-medium"
              />
            </label>

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

            <label className="block font-bold text-xs uppercase tracking-wider">
              Contraseña (mínimo 6 caracteres)
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

            <label className="block font-bold text-xs uppercase tracking-wider">
              Confirmar contraseña
              <input
                id="auth-confirm-password"
                required
                minLength={6}
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="block mt-1 w-full bg-ya-gray border-2 border-ya-gray focus:border-ya-lime outline-none p-3 text-white font-medium"
              />
            </label>

            <button
              id="auth-submit-btn"
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-ya-lime text-ya-black p-4 font-black uppercase tracking-wider hover:bg-white transition-colors mt-2 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Registrando...
                </>
              ) : (
                'Crear cuenta'
              )}
            </button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-ya-gray text-center text-sm font-bold text-gray-400">
          ¿Ya tienes una cuenta?
          <Link
            className="text-ya-lime hover:underline uppercase tracking-wider text-xs ml-1"
            to="/login"
          >
            Entrar
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

