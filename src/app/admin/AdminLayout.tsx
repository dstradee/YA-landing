import React, { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  Users,
  Package,
  Layers,
  Settings,
  ExternalLink,
  Menu,
  X,
  Sparkles,
  Truck,
  Percent,
  Box,
  Sliders,
  Award,
  Boxes,
  PackageSearch,
  AlertOctagon,
  Zap,
  MessageSquarePlus,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { AdminErrorBoundary } from './AdminErrorBoundary';
import { NotificationBell } from '../../components/notifications/NotificationComponents';

interface AdminLayoutProps {
  children: React.ReactNode;
}

interface NavSection {
  title: string;
  items: {
    to: string;
    label: string;
    icon: LucideIcon;
    end?: boolean;
    badge?: string;
  }[];
}

const navSections: NavSection[] = [
  {
    title: 'Operaciones',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/admin/pedidos', label: 'Pedidos', icon: ShoppingBag },
      { to: '/admin/clientes', label: 'Clientes', icon: Users },
      { to: '/admin/repartidores', label: 'Repartidores', icon: Truck },
      { to: '/admin/incidencias', label: 'Incidencias', icon: AlertOctagon },
      { to: '/admin/abastecimiento', label: 'Abastecimiento', icon: PackageSearch },
      { to: '/admin/inventario', label: 'Inventario', icon: Boxes },
    ],
  },
  {
    title: 'Catálogo y Ofertas',
    items: [
      { to: '/admin/productos', label: 'Productos', icon: Package },
      { to: '/admin/categorias', label: 'Categorías', icon: Layers },
      { to: '/admin/packs', label: 'Packs YA', icon: Box },
      { to: '/admin/promociones', label: 'Promociones 2×1', icon: Sparkles, badge: 'NUEVO' },
      { to: '/admin/descuentos', label: 'Descuentos', icon: Percent },
      { to: '/admin/sugerencias', label: 'Sugerencias', icon: MessageSquarePlus },
    ],
  },
  {
    title: 'Programas',
    items: [
      { to: '/admin/ya-plus', label: 'YA+ Membresías', icon: Zap },
      { to: '/admin/ya-juntos', label: 'YA Juntos', icon: Users },
      { to: '/admin/incentivos', label: 'Incentivos', icon: Award },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { to: '/admin/comercial', label: 'Comercial', icon: Sliders },
      { to: '/admin/configuracion', label: 'Configuración', icon: Settings },
    ],
  },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('ya_admin_sidebar_collapsed') === 'true';
  });

  const { user } = useAuth();
  const location = useLocation();

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('ya_admin_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Close mobile drawer when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-ya-black text-white font-sans flex flex-col lg:flex-row selection:bg-ya-lime selection:text-ya-black">
      {/* ========================================================================= */}
      {/* 1. DESKTOP COLLAPSIBLE SIDEBAR */}
      {/* ========================================================================= */}
      <aside
        className={`hidden lg:flex flex-col border-r-4 border-ya-gray bg-ya-black transition-all duration-300 z-40 shrink-0 sticky top-0 h-screen ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Sidebar Brand Header */}
        <div className="h-18 px-4 flex items-center justify-between border-b-4 border-ya-gray">
          <Link to="/admin" className="flex items-center gap-2 overflow-hidden">
            <span className="bg-ya-lime text-ya-black px-2.5 py-1 text-2xl font-black tracking-tighter shrink-0">
              YA
            </span>
            {!isCollapsed && (
              <div className="flex flex-col truncate">
                <span className="text-xs font-black tracking-widest uppercase text-white leading-none">
                  ADMIN CORE
                </span>
                <span className="text-[9px] font-mono text-gray-400 tracking-wider uppercase">
                  Jerez Delivery
                </span>
              </div>
            )}
          </Link>

          <button
            type="button"
            onClick={toggleSidebar}
            title={isCollapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
            className="p-1.5 border-2 border-ya-gray hover:border-ya-lime text-gray-400 hover:text-ya-lime transition-colors"
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Sidebar Navigation Items (Scrollable) */}
        <div className="flex-1 overflow-y-auto py-4 px-2 space-y-6 scrollbar-thin">
          {navSections.map((sec) => (
            <div key={sec.title} className="space-y-1">
              {!isCollapsed && (
                <div className="px-3 pb-1 text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold">
                  {sec.title}
                </div>
              )}
              {sec.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={isCollapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 text-xs font-black uppercase tracking-wider border-2 transition-all ${
                      isCollapsed ? 'justify-center' : ''
                    } ${
                      isActive
                        ? 'border-ya-lime bg-ya-lime text-ya-black font-black shadow-[2px_2px_0px_0px_#000]'
                        : 'border-transparent text-gray-300 hover:border-ya-gray hover:bg-ya-gray/30 hover:text-white'
                    }`
                  }
                >
                  <item.icon size={16} className="shrink-0" />
                  {!isCollapsed && (
                    <div className="flex-1 flex items-center justify-between truncate">
                      <span className="truncate">{item.label}</span>
                      {item.badge && (
                        <span className="ml-1.5 px-1.5 py-0.2 bg-ya-lime/20 text-ya-lime border border-ya-lime/40 text-[9px] font-mono">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </div>

        {/* Sidebar User Footer */}
        <div className="p-3 border-t-4 border-ya-gray bg-ya-gray/10">
          {!isCollapsed ? (
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="truncate mr-2">
                <span className="text-[10px] text-gray-400 block truncate">{user?.email}</span>
                <span className="text-ya-lime font-bold text-[10px] uppercase tracking-wider">
                  ● Admin Activo
                </span>
              </div>
              <Link
                to="/app"
                target="_blank"
                rel="noreferrer"
                title="Abrir tienda cliente en nueva pestaña"
                className="p-1.5 border border-ya-gray hover:border-ya-lime text-ya-lime hover:text-white shrink-0"
              >
                <ExternalLink size={14} />
              </Link>
            </div>
          ) : (
            <div className="flex justify-center">
              <Link
                to="/app"
                target="_blank"
                rel="noreferrer"
                title="Abrir tienda cliente"
                className="p-1.5 border border-ya-gray hover:border-ya-lime text-ya-lime hover:text-white"
              >
                <ExternalLink size={16} />
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. MAIN CONTENT AREA */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar (Desktop & Mobile) */}
        <header className="border-b-4 border-ya-gray bg-ya-black sticky top-0 z-30">
          <div className="px-4 sm:px-6 h-18 flex items-center justify-between">
            {/* Mobile Brand & Hamburger Button */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 text-gray-300 hover:text-white border-2 border-ya-gray hover:border-ya-lime"
                aria-label="Abrir menú de navegación móvil"
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>

              <div className="lg:hidden flex items-center gap-2">
                <span className="bg-ya-lime text-ya-black px-2 py-0.5 text-xl font-black tracking-tighter">
                  YA
                </span>
                <span className="text-xs font-black tracking-widest uppercase text-white">
                  ADMIN CORE
                </span>
              </div>

              {/* Breadcrumb path for desktop */}
              <div className="hidden lg:flex items-center gap-2 text-gray-400 font-mono text-xs">
                <span className="text-ya-lime font-black">YA-ADMIN</span>
                <span>/</span>
                <span className="text-white uppercase font-bold tracking-wider">
                  {location.pathname.replace('/admin/', '').replace('/admin', '') || 'DASHBOARD'}
                </span>
              </div>
            </div>

            {/* Quick Actions Right */}
            <div className="flex items-center gap-3 sm:gap-4">
              <NotificationBell buttonId="admin-header-notification-bell" />

              <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-gray-400 font-mono">
                <span className="w-2 h-2 rounded-full bg-ya-lime animate-pulse"></span>
                <span className="bg-ya-gray px-2 py-0.5 text-[10px] font-black uppercase text-ya-lime border border-ya-lime/30 tracking-wider">
                  JEREZ OPERATIVO
                </span>
              </div>

              <Link
                to="/app"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-ya-lime hover:text-white transition-colors border-2 border-ya-gray hover:border-ya-lime px-3 py-1.5"
              >
                <span>Ver Tienda</span>
                <ExternalLink size={13} />
              </Link>
            </div>
          </div>

          {/* Mobile Drawer (When Opened) */}
          {mobileMenuOpen && (
            <div className="lg:hidden border-t-4 border-ya-gray bg-ya-black p-4 space-y-4 max-h-[calc(100vh-4.5rem)] overflow-y-auto">
              {navSections.map((sec) => (
                <div key={sec.title} className="space-y-1">
                  <div className="text-[10px] font-mono uppercase text-gray-400 tracking-widest px-2 pb-1 font-bold">
                    {sec.title}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {sec.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          `px-3 py-2 text-xs font-black uppercase tracking-wider border-2 flex items-center justify-between transition-colors ${
                            isActive
                              ? 'border-ya-lime bg-ya-lime text-ya-black'
                              : 'border-ya-gray text-gray-300 hover:border-white hover:text-white'
                          }`
                        }
                      >
                        <div className="flex items-center gap-2.5">
                          <item.icon size={15} />
                          <span>{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className="px-1.5 py-0.2 bg-ya-lime/20 text-ya-lime border border-ya-lime/40 text-[9px] font-mono">
                            {item.badge}
                          </span>
                        )}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}

              <div className="pt-3 border-t-2 border-ya-gray flex justify-between items-center text-xs text-gray-400 font-mono">
                <span className="text-[11px] truncate max-w-[200px]">{user?.email}</span>
                <span className="px-2 py-0.5 bg-ya-lime/20 text-ya-lime text-[10px] font-black uppercase">
                  ROL ADMIN
                </span>
              </div>
            </div>
          )}
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <AdminErrorBoundary>
            {children}
          </AdminErrorBoundary>
        </main>

        {/* Standard Footer */}
        <footer className="border-t-4 border-ya-gray bg-ya-black py-4 px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400 font-mono">
            <div>YA DELIVERY • PANEL DE ADMINISTRACIÓN • JEREZ DE LA FRONTERA</div>
            <div className="flex items-center gap-3">
              <span>MODO SEGURO RLS</span>
              <span>•</span>
              <span className="text-ya-lime">V3A ADMIN CORE</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
