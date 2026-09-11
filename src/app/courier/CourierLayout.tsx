import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Truck,
  Package,
  CheckCircle2,
  User,
  ShieldAlert,
  Loader2,
  ExternalLink,
  Award,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import {
  courierFetchCurrentProfile,
  courierSetAvailability,
  courierSubscribeToOrders,
} from '../../lib/courierOrders';
import type { DbCourier } from '../../types/app';
import { NotificationBell } from '../../components/notifications/NotificationComponents';

interface CourierLayoutProps {
  children: ReactNode;
}

export function CourierLayout({ children }: CourierLayoutProps) {
  const { user, role, isAdmin, loading: authLoading, signOut } = useAuth();
  const location = useLocation();

  const [courier, setCourier] = useState<DbCourier | null>(null);
  const [loadingCourier, setLoadingCourier] = useState(true);
  const [courierError, setCourierError] = useState<string | null>(null);
  const [togglingAvailability, setTogglingAvailability] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);

  const isCourierUser = role === 'courier' || isAdmin;

  const loadCourier = useCallback(async () => {
    if (!user) return;
    setLoadingCourier(true);
    setCourierError(null);

    const res = await courierFetchCurrentProfile();
    if (res.error) {
      setCourierError(res.error);
    } else if (res.courier) {
      setCourier(res.courier);
    }
    setLoadingCourier(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading && user && isCourierUser) {
      loadCourier();
    } else if (!authLoading) {
      setLoadingCourier(false);
    }
  }, [authLoading, user, isCourierUser, loadCourier]);

  // Suscripción realtime si el courier existe
  useEffect(() => {
    if (!courier?.id) return;
    const unsub = courierSubscribeToOrders(courier.id, () => {
      // Notificación o recarga silenciosa
    });
    return () => {
      unsub();
    };
  }, [courier?.id]);

  const handleToggleAvailability = async () => {
    if (!courier) return;
    if (!courier.active) {
      setAvailabilityMessage('Tu cuenta está inactiva. Contacta con administración.');
      setTimeout(() => setAvailabilityMessage(null), 4000);
      return;
    }

    setTogglingAvailability(true);
    setAvailabilityMessage(null);

    const target = !courier.available;
    const res = await courierSetAvailability(target);

    if (res.error) {
      setAvailabilityMessage(res.error);
    } else {
      setCourier((prev) => (prev ? { ...prev, available: res.available } : null));
      setAvailabilityMessage(
        res.available
          ? '🟢 Ahora estás DISPONIBLE en guardia'
          : '⚪ Te has puesto NO DISPONIBLE'
      );
    }

    setTogglingAvailability(false);
    setTimeout(() => setAvailabilityMessage(null), 3500);
  };

  // 1. Estado de carga de autenticación
  if (authLoading || (loadingCourier && user && isCourierUser)) {
    return (
      <div className="min-h-screen bg-ya-black text-white flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-ya-lime border-t-transparent animate-spin mb-4" />
        <p className="font-black text-xs uppercase tracking-widest text-ya-lime">
          Cargando Panel de Repartidor...
        </p>
      </div>
    );
  }

  // 2. No autenticado
  if (!user) {
    return (
      <div className="min-h-screen bg-ya-black text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full border-4 border-ya-gray bg-ya-gray/30 p-8 text-center">
          <div className="w-16 h-16 bg-ya-lime text-ya-black flex items-center justify-center mx-auto mb-6">
            <Truck size={36} />
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tight mb-2">Panel Repartidor</h1>
          <p className="text-gray-300 text-sm mb-6 leading-relaxed">
            Inicia sesión con tu cuenta de repartidor de YA para gestionar tus entregas.
          </p>
          <div className="space-y-3">
            <Link
              to="/login?redirect=/repartidor"
              className="block w-full py-4 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-sm hover:bg-white transition-colors"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/app"
              className="block w-full py-3 border-2 border-ya-gray text-gray-400 font-bold uppercase tracking-wider text-xs hover:text-white hover:border-white transition-colors"
            >
              Volver a la tienda YA
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. Autenticado pero no es repartidor
  if (!isCourierUser || (courierError && !courier)) {
    return (
      <div className="min-h-screen bg-ya-black text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full border-4 border-ya-gray bg-ya-gray/30 p-8 text-center">
          <div className="w-16 h-16 bg-ya-gray border-2 border-ya-lime flex items-center justify-center mx-auto mb-6 text-ya-lime">
            <ShieldAlert size={36} />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight mb-2">Acceso Exclusivo Repartidores</h1>
          <p className="text-gray-300 text-sm mb-6 leading-relaxed">
            {courierError ||
              'Esta sección está reservada exclusivamente para el equipo de reparto de YA. Si eres repartidor, solicita tu alta a administración.'}
          </p>
          <div className="space-y-3">
            <Link
              to="/app"
              className="block w-full py-3.5 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs hover:bg-white transition-colors"
            >
              Ir a la app de clientes
            </Link>
            {isAdmin && (
              <Link
                to="/admin/repartidores"
                className="block w-full py-3 border-2 border-ya-lime text-ya-lime font-black uppercase tracking-wider text-xs hover:bg-ya-lime hover:text-ya-black transition-colors"
              >
                Configurar repartidores (Admin)
              </Link>
            )}
            <button
              onClick={() => signOut()}
              className="block w-full py-2.5 text-gray-500 font-bold uppercase tracking-wider text-xs hover:text-gray-300 transition-colors"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { to: '/repartidor', label: 'Inicio', icon: Truck, end: true },
    { to: '/repartidor/pedidos', label: 'Mis Pedidos', icon: Package, end: false },
    { to: '/repartidor/entregados', label: 'Entregados', icon: CheckCircle2, end: false },
    { to: '/repartidor/incentivos', label: 'Incentivos', icon: Award, end: false },
    { to: '/repartidor/perfil', label: 'Perfil', icon: User, end: false },
  ];

  return (
    <div className="min-h-screen bg-ya-black text-white font-sans flex flex-col selection:bg-ya-lime selection:text-ya-black">
      {/* 1. CABECERA SUPERIOR FIJA / RESPONSIVE */}
      <header className="sticky top-0 z-40 bg-ya-black border-b-2 border-ya-gray shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Logo y título */}
          <div className="flex items-center gap-3">
            <Link
              to="/repartidor"
              className="font-black text-2xl tracking-tighter text-ya-lime flex items-center gap-1.5"
            >
              <span>YA</span>
              <span className="text-[10px] uppercase tracking-widest bg-ya-gray text-gray-200 px-2 py-0.5 border border-gray-700 font-mono">
                Rider
              </span>
            </Link>

            {courier?.vehicle_type && (
              <span className="hidden sm:inline-block text-[11px] font-bold text-gray-400 bg-ya-gray/50 px-2 py-0.5 border border-ya-gray">
                {courier.vehicle_type}
              </span>
            )}
          </div>

          {/* Estado de disponibilidad del repartidor */}
          <div className="flex items-center gap-2">
            {courier && !courier.active ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/60 border-2 border-red-600 text-red-400 text-xs font-black uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span>Inactivo</span>
              </div>
            ) : courier ? (
              <button
                id="toggle-courier-availability-btn"
                onClick={handleToggleAvailability}
                disabled={togglingAvailability}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-xs font-black uppercase tracking-wider border-2 transition-all active:scale-95 ${
                  courier.available
                    ? 'bg-ya-lime text-ya-black border-ya-lime hover:bg-white hover:border-white shadow-[0_0_12px_rgba(182,255,0,0.3)]'
                    : 'bg-ya-gray/60 text-gray-300 border-ya-gray hover:border-gray-500 hover:text-white'
                }`}
                title="Pulsa para cambiar tu disponibilidad"
              >
                {togglingAvailability ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : courier.available ? (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ya-black opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-ya-black" />
                  </span>
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-500" />
                )}
                <span>{courier.available ? 'En Guardia' : 'No disponible'}</span>
              </button>
            ) : null}

            {/* Campana de Notificaciones */}
            <NotificationBell buttonId="courier-header-notification-bell" />

            {/* Enlace desktop a la app o salir */}
            <Link
              to="/app"
              className="hidden sm:flex items-center gap-1 text-xs font-bold text-gray-400 hover:text-white p-2 border border-transparent hover:border-ya-gray"
              title="Ir a la tienda"
            >
              <ExternalLink size={14} />
            </Link>
          </div>
        </div>

        {/* Notificación flotante de disponibilidad */}
        {availabilityMessage && (
          <div className="bg-ya-gray border-t border-ya-lime/40 px-4 py-1.5 text-center text-xs font-bold tracking-wide text-ya-lime animate-fadeIn">
            {availabilityMessage}
          </div>
        )}
      </header>

      {/* 2. CONTENIDO PRINCIPAL */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 pt-4 pb-28 sm:pb-12">
        {children}
      </main>

      {/* 3. BARRA DE NAVEGACIÓN INFERIOR PARA MÓVIL (Y TABS EN DESKTOP) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-ya-black/95 backdrop-blur-md border-t-2 border-ya-gray">
        <div className="max-w-md mx-auto grid grid-cols-5 h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive: active }) =>
                  `flex flex-col items-center justify-center gap-1 transition-colors relative ${
                    active ? 'text-ya-lime font-black' : 'text-gray-400 hover:text-white font-bold'
                  }`
                }
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-ya-lime" />
                )}
                <Icon size={20} className={isActive ? 'stroke-[2.5]' : 'stroke-2'} />
                <span className="text-[10px] tracking-wider uppercase">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
