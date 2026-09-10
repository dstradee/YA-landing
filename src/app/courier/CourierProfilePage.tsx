import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  Mail,
  Phone,
  Truck,
  ShieldCheck,
  LogOut,
  ExternalLink,
  Info,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import {
  courierFetchCurrentProfile,
  courierSetAvailability,
} from '../../lib/courierOrders';
import type { DbCourier, DbProfile } from '../../types/app';

export function CourierProfilePage() {
  const { user, signOut } = useAuth();

  const [courier, setCourier] = useState<DbCourier | null>(null);
  const [profile, setProfile] = useState<DbProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [toggleMsg, setToggleMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await courierFetchCurrentProfile();
      if (res.courier) {
        setCourier(res.courier);
        setProfile(res.profile);
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleToggleAvailability = async () => {
    if (!courier) return;
    if (!courier.active) {
      setToggleMsg('Tu cuenta está desactivada por administración.');
      setTimeout(() => setToggleMsg(null), 3500);
      return;
    }

    setToggling(true);
    setToggleMsg(null);

    const target = !courier.available;
    const res = await courierSetAvailability(target);

    if (res.error) {
      setToggleMsg(res.error);
    } else {
      setCourier((prev) => (prev ? { ...prev, available: res.available } : null));
      setToggleMsg(
        res.available
          ? '🟢 Estado actualizado a: DISPONIBLE (En guardia)'
          : '⚪ Estado actualizado a: NO DISPONIBLE'
      );
    }

    setToggling(false);
    setTimeout(() => setToggleMsg(null), 3500);
  };

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="w-8 h-8 border-3 border-ya-lime border-t-transparent animate-spin mx-auto mb-2" />
        <p className="text-xs font-black uppercase tracking-wider text-gray-400">
          Cargando perfil...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="border-b-2 border-ya-gray pb-3">
        <h1 className="text-2xl font-black uppercase tracking-tight">Perfil de Repartidor</h1>
        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
          Configuración personal y operativa
        </p>
      </div>

      {toggleMsg && (
        <div className="bg-ya-gray border-2 border-ya-lime p-3 text-xs font-bold text-ya-lime text-center animate-fadeIn">
          {toggleMsg}
        </div>
      )}

      {/* ESTADO OPERATIVO */}
      <section className="border-2 border-ya-gray bg-ya-gray/30 p-4 space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">
          Disponibilidad en Turno
        </h2>

        <div className="flex items-center justify-between gap-3 bg-ya-black/60 border border-ya-gray p-3">
          <div>
            <div className="text-sm font-black text-white uppercase flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  courier?.available ? 'bg-ya-lime animate-pulse' : 'bg-gray-500'
                }`}
              />
              <span>{courier?.available ? 'En Guardia / Disponible' : 'Fuera de Servicio'}</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {courier?.available
                ? 'Estás recibiendo asignaciones de pedidos para reparto.'
                : 'No recibirás nuevos pedidos mientras estés fuera de servicio.'}
            </p>
          </div>

          <button
            onClick={handleToggleAvailability}
            disabled={toggling || !courier?.active}
            className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-2 transition-all active:scale-95 disabled:opacity-50 ${
              courier?.available
                ? 'bg-ya-lime text-ya-black border-ya-lime hover:bg-white hover:border-white'
                : 'bg-ya-gray text-gray-300 border-gray-600 hover:text-white hover:border-white'
            }`}
          >
            {toggling ? (
              <Loader2 size={14} className="animate-spin mx-auto" />
            ) : courier?.available ? (
              'Pausar Guardia'
            ) : (
              'Iniciar Guardia'
            )}
          </button>
        </div>
      </section>

      {/* DATOS DEL REPARTIDOR */}
      <section className="border-2 border-ya-gray bg-ya-gray/30 p-4 space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">
          Datos Personales
        </h2>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between p-2.5 bg-ya-black/50 border border-ya-gray/80">
            <span className="text-gray-400 font-bold flex items-center gap-2">
              <User size={14} className="text-ya-lime" />
              <span>Nombre Completo</span>
            </span>
            <span className="font-bold text-white">{profile?.full_name || 'No registrado'}</span>
          </div>

          <div className="flex items-center justify-between p-2.5 bg-ya-black/50 border border-ya-gray/80">
            <span className="text-gray-400 font-bold flex items-center gap-2">
              <Mail size={14} className="text-ya-lime" />
              <span>Correo Electrónico</span>
            </span>
            <span className="font-bold text-white font-mono">{user?.email || 'No registrado'}</span>
          </div>

          <div className="flex items-center justify-between p-2.5 bg-ya-black/50 border border-ya-gray/80">
            <span className="text-gray-400 font-bold flex items-center gap-2">
              <Phone size={14} className="text-ya-lime" />
              <span>Teléfono de Contacto</span>
            </span>
            <span className="font-bold text-white font-mono">{profile?.phone || 'No registrado'}</span>
          </div>

          <div className="flex items-center justify-between p-2.5 bg-ya-black/50 border border-ya-gray/80">
            <span className="text-gray-400 font-bold flex items-center gap-2">
              <Truck size={14} className="text-ya-lime" />
              <span>Vehículo Registrado</span>
            </span>
            <span className="font-bold text-white uppercase">{courier?.vehicle_type || 'Moto / Bici'}</span>
          </div>

          <div className="flex items-center justify-between p-2.5 bg-ya-black/50 border border-ya-gray/80">
            <span className="text-gray-400 font-bold flex items-center gap-2">
              <ShieldCheck size={14} className="text-ya-lime" />
              <span>Estado en Plataforma</span>
            </span>
            <span
              className={`font-black uppercase tracking-wider ${
                courier?.active ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {courier?.active ? '✓ Activo' : '✕ Inactivo'}
            </span>
          </div>
        </div>
      </section>

      {/* NOTA INFORMATIVA DE LIQUIDACIONES (FASE 4D) */}
      <section className="border border-dashed border-gray-700 bg-ya-gray/20 p-4 space-y-2">
        <div className="flex items-start gap-2.5 text-xs text-gray-300">
          <Info size={16} className="text-ya-lime shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="block font-black uppercase tracking-wide text-white mb-0.5">
              Liquidaciones y Tarifas
            </strong>
            Tus comisiones y tarifas fijas por entrega son gestionadas exclusivamente por la
            administración de YA. El módulo detallado de facturación y resumen de ganancias estará
            disponible en la Fase 4D.
          </div>
        </div>
      </section>

      {/* BOTONES DE ACCIÓN */}
      <div className="space-y-2 pt-2">
        <Link
          to="/app"
          className="w-full py-3 bg-ya-gray hover:bg-gray-700 text-gray-200 hover:text-white font-black uppercase tracking-wider text-xs border border-ya-gray flex items-center justify-center gap-2 transition-colors"
        >
          <ExternalLink size={14} />
          <span>Ir a la App de Clientes YA</span>
        </Link>

        <button
          onClick={() => signOut()}
          className="w-full py-3 border-2 border-red-900/60 hover:border-red-600 text-red-400 hover:text-white font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 transition-colors"
        >
          <LogOut size={14} />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </div>
  );
}
