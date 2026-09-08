import { useEffect, useState } from 'react';
import {
  Settings,
  ShieldCheck,
  Database,
  MapPin,
  Clock,
  CreditCard,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

export function AdminSettingsPage() {
  const { user, role } = useAuth();
  const [deliveryZones, setDeliveryZones] = useState<{ id: string; name: string; city: string; delivery_fee: number; active: boolean }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadZones() {
      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await supabase.from('delivery_zones').select('*');
        if (data) {
          setDeliveryZones(data);
        }
      } catch {
        // Fallback
      } finally {
        setLoading(false);
      }
    }
    loadZones();
  }, []);

  return (
    <div className="space-y-8 max-w-5xl mx-auto font-mono">
      {/* Title Bar */}
      <div className="border-b-2 border-ya-gray pb-4">
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3 font-sans">
          <Settings className="text-ya-lime" size={28} />
          <span>Configuración del Sistema</span>
        </h1>
        <p className="text-xs text-gray-400 mt-1">
          Parámetros del entorno, seguridad de roles, zonas de entrega y estado de servicios
        </p>
      </div>

      {/* Grid: 2 Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Supabase & Database Connection */}
        <div className="border-4 border-ya-gray bg-ya-black p-6 space-y-4">
          <div className="flex items-center justify-between border-b-2 border-ya-gray pb-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2 font-sans">
              <Database size={18} className="text-ya-lime" />
              <span>Infraestructura y Base de Datos</span>
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-ya-lime text-ya-black">
              {isSupabaseConfigured ? 'CONECTADO' : 'MODO LOCAL'}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-ya-gray/40">
              <span className="text-gray-400">Motor de Base de Datos:</span>
              <span className="text-white font-bold">PostgreSQL 15+ (Supabase)</span>
            </div>
            <div className="flex justify-between py-1 border-b border-ya-gray/40">
              <span className="text-gray-400">Seguridad:</span>
              <span className="text-ya-lime font-bold">Row Level Security (RLS) Activo</span>
            </div>
            <div className="flex justify-between py-1 border-b border-ya-gray/40">
              <span className="text-gray-400">Suscripción en directo:</span>
              <span className="text-white font-bold">Supabase Realtime (WebSockets)</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-400">Módulo actual:</span>
              <span className="text-white font-bold">Phase 3A — Admin Core</span>
            </div>
          </div>
        </div>

        {/* Auth & Admin Session */}
        <div className="border-4 border-ya-gray bg-ya-black p-6 space-y-4">
          <div className="flex items-center justify-between border-b-2 border-ya-gray pb-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2 font-sans">
              <ShieldCheck size={18} className="text-ya-lime" />
              <span>Sesión y Autorización Actual</span>
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-ya-lime text-ya-black">
              AUTORIZADO
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-ya-gray/40">
              <span className="text-gray-400">Cuenta activa:</span>
              <span className="text-white font-bold truncate max-w-[200px]">{user?.email}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-ya-gray/40">
              <span className="text-gray-400">Rol asignado:</span>
              <span className="text-ya-lime font-bold uppercase">{role || 'admin'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-ya-gray/40">
              <span className="text-gray-400">Acceso a Admin:</span>
              <span className="text-emerald-400 font-bold">Concedido por profiles.role</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-400">ID de sesión:</span>
              <span className="text-gray-400 font-mono text-[10px] truncate max-w-[180px]">{user?.id}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Zones Configuration */}
      <div className="border-4 border-ya-gray bg-ya-black p-6 space-y-4">
        <div className="flex items-center justify-between border-b-2 border-ya-gray pb-3">
          <h2 className="text-base font-black uppercase tracking-wider text-white flex items-center gap-2 font-sans">
            <MapPin size={18} className="text-ya-lime" />
            <span>Zona Operativa de Entrega (Jerez de la Frontera)</span>
          </h2>
          <span className="text-xs text-gray-400">Tarifa fija actual: 2,90 €</span>
        </div>

        {loading ? (
          <div className="py-4 text-gray-400 text-xs text-center">Cargando zonas de entrega...</div>
        ) : deliveryZones.length > 0 ? (
          <div className="divide-y-2 divide-ya-gray">
            {deliveryZones.map((zone) => (
              <div key={zone.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <span className="text-white font-bold text-sm block font-sans">{zone.name}</span>
                  <span className="text-gray-400 text-[11px]">{zone.city}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 border border-ya-gray text-white font-bold">
                    {Number(zone.delivery_fee).toFixed(2)} €
                  </span>
                  <span className="px-2 py-0.5 bg-ya-lime/10 border border-ya-lime/40 text-ya-lime text-[10px] font-bold uppercase">
                    {zone.active ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 border-2 border-ya-gray bg-ya-gray/20 text-xs text-gray-300">
            Zona por defecto: <strong>Jerez de la Frontera Centro y Distritos</strong> • Coste: <strong>2,90 €</strong>
          </div>
        )}
      </div>

      {/* Placeholders for Future Modules */}
      <div className="border-4 border-ya-gray bg-ya-black p-6 space-y-4">
        <h2 className="text-base font-black uppercase tracking-wider text-white border-b-2 border-ya-gray pb-3 font-sans">
          Módulos Comerciales y Logísticos Próximos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 border-2 border-ya-gray/60 bg-ya-gray/10 space-y-2 opacity-80">
            <div className="flex items-center justify-between text-gray-400">
              <span className="font-bold text-xs uppercase font-sans">Tarifas por Distancia</span>
              <MapPin size={16} />
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Cálculo de envíos por geocodificación y radios kilométricos en Jerez.
            </p>
            <span className="inline-block text-[9px] font-black uppercase px-2 py-0.5 bg-ya-gray text-ya-lime border border-ya-lime/30">
              Fase 3B
            </span>
          </div>

          <div className="p-4 border-2 border-ya-gray/60 bg-ya-gray/10 space-y-2 opacity-80">
            <div className="flex items-center justify-between text-gray-400">
              <span className="font-bold text-xs uppercase font-sans">Promociones & Packs</span>
              <CreditCard size={16} />
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Cupones de descuento, combos nocturnos y campañas comerciales.
            </p>
            <span className="inline-block text-[9px] font-black uppercase px-2 py-0.5 bg-ya-gray text-ya-lime border border-ya-lime/30">
              Fase 3C
            </span>
          </div>

          <div className="p-4 border-2 border-ya-gray/60 bg-ya-gray/10 space-y-2 opacity-80">
            <div className="flex items-center justify-between text-gray-400">
              <span className="font-bold text-xs uppercase font-sans">App de Repartidores</span>
              <Clock size={16} />
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Panel exclusivo para couriers con asignación y enrutamiento en tiempo real.
            </p>
            <span className="inline-block text-[9px] font-black uppercase px-2 py-0.5 bg-ya-gray text-ya-lime border border-ya-lime/30">
              Fase 4
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
