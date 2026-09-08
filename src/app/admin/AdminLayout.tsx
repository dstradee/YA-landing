import React, { useState } from 'react';
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
  Tag,
  Percent,
  MapPin,
  BarChart3,
  Box,
  Sliders,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { AdminErrorBoundary } from './AdminErrorBoundary';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  const navItems = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/pedidos', label: 'Pedidos', icon: ShoppingBag, end: false },
    { to: '/admin/clientes', label: 'Clientes', icon: Users, end: false },
    { to: '/admin/productos', label: 'Productos', icon: Package, end: false },
    { to: '/admin/categorias', label: 'Categorías', icon: Layers, end: false },
    { to: '/admin/packs', label: 'Packs YA', icon: Box, end: false },
    { to: '/admin/descuentos', label: 'Descuentos', icon: Percent, end: false },
    { to: '/admin/promociones', label: 'Promociones', icon: Sparkles, end: false },
    { to: '/admin/comercial', label: 'Comercial', icon: Sliders, end: false },
    { to: '/admin/configuracion', label: 'Configuración', icon: Settings, end: false },
  ];

  const upcomingModules = [
    { label: 'Envíos', icon: Truck },
    { label: 'Zonas', icon: MapPin },
    { label: 'Repartidores', icon: Tag },
    { label: 'Estadísticas', icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-ya-black text-white font-sans flex flex-col selection:bg-ya-lime selection:text-ya-black">
      {/* Top Header */}
      <header className="border-b-4 border-ya-gray bg-ya-black sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-6">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-300 hover:text-white border-2 border-ya-gray"
              aria-label="Abrir menú de navegación"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <Link to="/admin" className="flex items-center gap-2">
              <span className="bg-ya-lime text-ya-black px-2.5 py-1 text-2xl font-black tracking-tighter">
                YA
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-black tracking-widest uppercase text-white leading-none">
                  ADMIN CORE
                </span>
                <span className="text-[9px] font-mono text-gray-400 tracking-wider uppercase">
                  Jerez Delivery
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center gap-1 ml-4">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `px-3.5 py-2 text-xs font-black uppercase tracking-wider border-2 transition-colors flex items-center gap-2 ${
                      isActive
                        ? 'border-ya-lime bg-ya-lime text-ya-black'
                        : 'border-transparent text-gray-300 hover:border-ya-gray hover:text-white'
                    }`
                  }
                >
                  <item.icon size={15} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-gray-400">
              <span className="w-2 h-2 rounded-full bg-ya-lime animate-pulse"></span>
              <span className="bg-ya-gray px-2 py-0.5 text-[10px] font-black uppercase text-ya-lime border border-ya-lime/30 tracking-wider">
                ADMIN AUTORIZADO
              </span>
            </div>

            <Link
              to="/app"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-ya-lime hover:text-white transition-colors border-2 border-ya-gray hover:border-ya-lime px-3 py-1.5"
            >
              <span>Ver App</span>
              <ExternalLink size={13} />
            </Link>
          </div>
        </div>

        {/* Medium Screen Navigation Bar */}
        <div className="hidden md:flex lg:hidden border-t-2 border-ya-gray px-4 py-2 gap-1 bg-ya-black overflow-x-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 whitespace-nowrap flex items-center gap-1.5 ${
                  isActive
                    ? 'border-ya-lime bg-ya-lime text-ya-black'
                    : 'border-transparent text-gray-300 hover:border-ya-gray'
                }`
              }
            >
              <item.icon size={14} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        {/* Mobile Navigation Drawer / Panel */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t-2 border-ya-gray bg-ya-black p-4 space-y-4">
            <div className="space-y-1">
              <div className="text-[10px] font-mono uppercase text-gray-400 tracking-widest px-2 pb-1">
                Navegación Admin
              </div>
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `w-full px-4 py-3 text-xs font-black uppercase tracking-wider border-2 flex items-center gap-3 transition-colors ${
                      isActive
                        ? 'border-ya-lime bg-ya-lime text-ya-black'
                        : 'border-ya-gray text-gray-300 hover:border-white hover:text-white'
                    }`
                  }
                >
                  <item.icon size={16} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>

            {/* Upcoming modules list for mobile */}
            <div className="pt-2 border-t border-ya-gray/60">
              <div className="text-[10px] font-mono uppercase text-gray-400 tracking-widest px-2 pb-2">
                Módulos Próximos (Fases siguientes)
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {upcomingModules.map((m) => (
                  <div
                    key={m.label}
                    className="p-2 border border-ya-gray/40 bg-ya-gray/10 text-gray-400 flex items-center gap-2 text-[11px] font-mono opacity-70"
                  >
                    <m.icon size={13} />
                    <span className="truncate">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-ya-gray flex justify-between items-center text-xs text-gray-400">
              <span className="font-mono text-[11px] truncate max-w-[200px]">{user?.email}</span>
              <span className="px-2 py-0.5 bg-ya-lime/20 text-ya-lime text-[10px] font-black uppercase">
                ROL ADMIN
              </span>
            </div>
          </div>
        )}
      </header>

      {/* Main Admin Body with Optional Side Rail for Upcoming Modules */}
      <div className="flex-1 flex flex-col">
        {/* Sub-bar showing breadcrumb & quick status */}
        <div className="border-b-2 border-ya-gray bg-ya-gray/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-gray-400 font-mono text-[11px]">
              <span className="text-ya-lime">YA-ADMIN</span>
              <span>/</span>
              <span className="text-white uppercase font-bold">
                {location.pathname.replace('/admin', '') || 'dashboard'}
              </span>
            </div>

            {/* Future modules status bar for desktop */}
            <div className="hidden xl:flex items-center gap-2 text-[10px] font-mono text-gray-400">
              <span className="text-gray-400 font-bold uppercase tracking-wider">Módulos en preparación:</span>
              {upcomingModules.slice(0, 5).map((m) => (
                <span
                  key={m.label}
                  className="px-2 py-0.5 border border-ya-gray bg-ya-gray/40 text-gray-400 uppercase tracking-tight"
                  title="Módulo preparado para fases posteriores"
                >
                  {m.label}
                </span>
              ))}
              <span className="text-gray-400">+2 más</span>
            </div>
          </div>
        </div>

        {/* Content Container */}
        <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          <AdminErrorBoundary>
            {children}
          </AdminErrorBoundary>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t-4 border-ya-gray bg-ya-black py-4 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400 font-mono">
          <div>
            YA DELIVERY • PANEL DE ADMINISTRACIÓN • JEREZ DE LA FRONTERA
          </div>
          <div className="flex items-center gap-3">
            <span>MODO SEGURO RLS</span>
            <span>•</span>
            <span className="text-ya-lime">V3A ADMIN CORE</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
