import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  TrendingUp,
  CheckCircle2,
  Clock,
  Calendar,
  AlertCircle,
  ChevronRight,
  Sparkles,
  Info,
  RefreshCw,
  Gift,
} from 'lucide-react';
import { courierFetchIncentivesOverview } from '../../lib/courierIncentives';
import type {
  CourierIncentivesOverview,
  CourierIncentiveWithProgress,
} from '../../types/app';

export function CourierIncentivesPage() {
  const [data, setData] = useState<CourierIncentivesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setError(null);
    const res = await courierFetchIncentivesOverview();
    if (res.error) {
      setError(res.error);
    } else {
      setData(res.data);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatMoney = (val: number) =>
    val.toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' €';

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center space-y-4">
        <div className="w-10 h-10 border-3 border-ya-lime border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-xs uppercase font-mono tracking-widest">
          Calculando objetivos y recompensas...
        </p>
      </div>
    );
  }

  const summary = data?.summary || {
    total_count: 0,
    total_earned: 0,
    today_earned: 0,
    week_earned: 0,
    month_earned: 0,
  };

  const incentives = data?.incentives || [];
  const rewards = data?.rewards || [];

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      {/* 1. CABECERA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-ya-gray pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 bg-ya-lime" />
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <Award className="text-ya-lime" size={24} />
              Incentivos y Recompensas
            </h1>
          </div>
          <p className="text-gray-400 text-xs">
            Alcanza objetivos de entrega y suma bonificaciones económicas congeladas directamente en tu saldo.
          </p>
        </div>

        <button
          id="refresh-incentives-btn"
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-ya-gray/70 hover:bg-ya-gray text-gray-200 border border-gray-700 text-xs font-bold uppercase tracking-wider transition-colors active:scale-95 self-start sm:self-auto"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin text-ya-lime' : ''} />
          <span>Actualizar</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 bg-red-950/40 border-2 border-red-600 text-red-300 text-xs font-medium flex items-center gap-3">
          <AlertCircle size={18} className="shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. TARJETAS DE MÉTRICAS GLOBALES DE BONUS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total histórico ganado */}
        <div className="p-4 bg-ya-gray/50 border-2 border-ya-gray hover:border-ya-lime/50 transition-colors">
          <div className="text-gray-400 text-[10px] font-mono uppercase tracking-widest mb-1 flex items-center justify-between">
            <span>Total Bonus</span>
            <Gift size={13} className="text-ya-lime" />
          </div>
          <div className="text-2xl font-black tracking-tight text-ya-lime font-mono">
            {formatMoney(summary.total_earned)}
          </div>
          <div className="text-gray-400 text-[11px] mt-1">
            {summary.total_count} {summary.total_count === 1 ? 'bonus alcanzado' : 'bonus alcanzados'}
          </div>
        </div>

        {/* Bonus este mes */}
        <div className="p-4 bg-ya-gray/50 border-2 border-ya-gray hover:border-ya-lime/50 transition-colors">
          <div className="text-gray-400 text-[10px] font-mono uppercase tracking-widest mb-1 flex items-center justify-between">
            <span>Este Mes</span>
            <Calendar size={13} className="text-blue-400" />
          </div>
          <div className="text-2xl font-black tracking-tight text-white font-mono">
            {formatMoney(summary.month_earned)}
          </div>
          <div className="text-gray-400 text-[11px] mt-1">Acumulado mensual</div>
        </div>

        {/* Bonus esta semana */}
        <div className="p-4 bg-ya-gray/50 border-2 border-ya-gray hover:border-ya-lime/50 transition-colors">
          <div className="text-gray-400 text-[10px] font-mono uppercase tracking-widest mb-1 flex items-center justify-between">
            <span>Esta Semana</span>
            <TrendingUp size={13} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-black tracking-tight text-white font-mono">
            {formatMoney(summary.week_earned)}
          </div>
          <div className="text-gray-400 text-[11px] mt-1">Lunes a domingo</div>
        </div>

        {/* Bonus hoy */}
        <div className="p-4 bg-ya-gray/50 border-2 border-ya-gray hover:border-ya-lime/50 transition-colors">
          <div className="text-gray-400 text-[10px] font-mono uppercase tracking-widest mb-1 flex items-center justify-between">
            <span>Hoy</span>
            <Clock size={13} className="text-amber-400" />
          </div>
          <div className="text-2xl font-black tracking-tight text-white font-mono">
            {formatMoney(summary.today_earned)}
          </div>
          <div className="text-gray-400 text-[11px] mt-1">Conseguido hoy</div>
        </div>
      </div>

      {/* 3. LISTADO DE INCENTIVOS ACTIVOS Y PROGRESO */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-300 flex items-center gap-2">
            <Sparkles size={14} className="text-ya-lime" />
            Objetivos y Metas de Reparto
          </h2>
          <span className="text-[11px] font-mono text-gray-400">
            {incentives.filter((i) => i.is_achieved).length} de {incentives.length} completados
          </span>
        </div>

        {incentives.length === 0 ? (
          <div className="p-8 text-center bg-ya-gray/20 border-2 border-dashed border-gray-800 space-y-2">
            <Award className="mx-auto text-gray-600" size={32} />
            <p className="text-gray-400 text-sm font-bold">No hay incentivos activos en este momento</p>
            <p className="text-gray-400 text-xs max-w-sm mx-auto">
              La administración publicará nuevas metas y bonificaciones periódicamente para premiar tu esfuerzo.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {incentives.map((inc) => (
              <IncentiveCard key={inc.id} incentive={inc} formatMoney={formatMoney} formatDate={formatDate} />
            ))}
          </div>
        )}
      </div>

      {/* 4. HISTORIAL DE RECOMPENSAS OBTENIDAS */}
      <div className="space-y-3 pt-4 border-t-2 border-ya-gray">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-300 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-ya-lime" />
            Historial de Bonus Ganados
          </h2>
          <span className="text-[11px] font-mono text-gray-400">{rewards.length} recompensas</span>
        </div>

        {rewards.length === 0 ? (
          <div className="p-6 text-center bg-ya-gray/20 border-2 border-gray-800 text-gray-400 text-xs">
            Aún no has desbloqueado ningún bonus. ¡Completa los objetivos activos para sumar recompensas a tus ganancias!
          </div>
        ) : (
          <div className="bg-ya-gray/30 border-2 border-ya-gray overflow-hidden divide-y divide-gray-800">
            {rewards.map((r) => (
              <div key={r.id} className="p-4 flex items-center justify-between gap-4 hover:bg-ya-gray/50 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-white tracking-wide">
                      {r.incentive_name}
                    </span>
                    <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest bg-emerald-950 text-emerald-300 border border-emerald-700">
                      {r.status === 'earned' ? 'Conseguido' : r.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 flex items-center gap-3">
                    <span>
                      {r.deliveries_count} {r.deliveries_count === 1 ? 'entrega realizada' : 'entregas realizadas'}
                    </span>
                    <span>•</span>
                    <span>{formatDate(r.achieved_at)}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-base font-black font-mono text-ya-lime">
                    +{formatMoney(r.bonus_amount)}
                  </div>
                  <div className="text-[10px] text-gray-400 uppercase font-mono">Congelado</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. INFORMACIÓN LEGAL Y FUNCIONAMIENTO */}
      <div className="p-4 bg-ya-gray/30 border border-gray-800 space-y-2 text-xs text-gray-400 leading-relaxed">
        <div className="flex items-center gap-2 text-gray-300 font-bold uppercase text-[11px]">
          <Info size={14} className="text-ya-lime shrink-0" />
          <span>Reglas y Funcionamiento de Incentivos</span>
        </div>
        <ul className="list-disc list-inside space-y-1 pl-1">
          <li>
            <strong className="text-gray-300">Cálculo server-side:</strong> Las entregas se contabilizan de forma oficial cuando el pedido pasa al estado <span className="text-white font-mono">Entregado</span>.
          </li>
          <li>
            <strong className="text-gray-300">Bonus congelado:</strong> Al alcanzar un objetivo, el importe del bonus se congela irrevocablemente en tu histórico.
          </li>
          <li>
            <strong className="text-gray-300">Independencia de ganancias:</strong> Los incentivos son independientes y complementarios a las comisiones por pedido (Fase 4D).
          </li>
          <li>
            <strong className="text-gray-300">Pedidos de prueba:</strong> Siguiendo el estándar de la plataforma, los pedidos de prueba entregados computan como entrega válida para facilitar verificaciones en entorno de test.
          </li>
        </ul>
      </div>

      {/* ENLACES RÁPIDOS */}
      <div className="flex items-center justify-between pt-2">
        <Link
          to="/repartidor"
          className="text-xs text-gray-400 hover:text-white font-bold flex items-center gap-1 transition-colors"
        >
          <span>← Volver al Panel de Inicio</span>
        </Link>
        <Link
          to="/repartidor/entregados"
          className="text-xs text-ya-lime hover:underline font-bold flex items-center gap-1 transition-colors"
        >
          <span>Ver pedidos entregados</span>
          <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}

interface IncentiveCardProps {
  incentive: CourierIncentiveWithProgress;
  formatMoney: (val: number) => string;
  formatDate: (dateStr: string) => string;
}

function IncentiveCard({ incentive, formatMoney, formatDate }: IncentiveCardProps) {
  const isAchieved = incentive.is_achieved;
  const isExpired = incentive.is_expired;
  const isUpcoming = incentive.is_future;

  return (
    <div
      className={`p-5 border-2 transition-all flex flex-col justify-between space-y-4 ${
        isAchieved
          ? 'bg-emerald-950/20 border-emerald-700/80 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
          : isExpired
          ? 'bg-ya-gray/20 border-gray-800 opacity-60'
          : 'bg-ya-gray/40 border-ya-gray hover:border-ya-lime/60'
      }`}
    >
      {/* Cabecera de la tarjeta */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-black uppercase tracking-tight text-white">
              {incentive.name}
            </h3>
            {incentive.description && (
              <p className="text-xs text-gray-400 mt-0.5 leading-snug">{incentive.description}</p>
            )}
          </div>

          <span
            className={`shrink-0 px-2 py-0.5 text-[9px] font-mono font-black uppercase tracking-widest border ${
              isAchieved
                ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                : isExpired
                ? 'bg-gray-800 text-gray-400 border-gray-700'
                : isUpcoming
                ? 'bg-blue-950 text-blue-300 border-blue-700'
                : 'bg-ya-lime/10 text-ya-lime border-ya-lime/40'
            }`}
          >
            {isAchieved
              ? '✓ Conseguido'
              : isExpired
              ? 'Finalizado'
              : isUpcoming
              ? 'Próximamente'
              : 'En progreso'}
          </span>
        </div>

        {/* Recompensa destacada */}
        <div className="flex items-baseline justify-between pt-1">
          <div className="text-xs text-gray-400">
            Objetivo:{' '}
            <strong className="text-white">
              {incentive.target_deliveries} {incentive.target_deliveries === 1 ? 'entrega' : 'entregas'}
            </strong>
          </div>
          <div className="text-lg font-black font-mono text-ya-lime">
            +{formatMoney(incentive.bonus_amount)}
          </div>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-gray-300 font-bold">
            {incentive.current_deliveries} / {incentive.target_deliveries} entregas
          </span>
          <span className={isAchieved ? 'text-emerald-400 font-bold' : 'text-ya-lime font-bold'}>
            {incentive.progress_percent}%
          </span>
        </div>

        {/* Barra estilizada */}
        <div className="h-3 w-full bg-black/60 border border-gray-700 p-0.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              isAchieved
                ? 'bg-emerald-500'
                : isExpired
                ? 'bg-gray-600'
                : 'bg-ya-lime'
            }`}
            style={{ width: `${Math.min(100, incentive.progress_percent)}%` }}
          />
        </div>

        {/* Estado y detalle restante */}
        <div className="text-[11px]">
          {isAchieved ? (
            <div className="text-emerald-400 font-bold flex items-center gap-1">
              <CheckCircle2 size={12} />
              <span>
                ¡Objetivo alcanzado! Bonus de {formatMoney(incentive.achieved_reward?.bonus_amount || incentive.bonus_amount)} registrado.
              </span>
            </div>
          ) : isExpired ? (
            <span className="text-gray-400">El periodo de este incentivo ha finalizado.</span>
          ) : (
            <span className="text-gray-300">
              Te {incentive.remaining_deliveries === 1 ? 'falta' : 'faltan'}{' '}
              <strong className="text-ya-lime">{incentive.remaining_deliveries}</strong>{' '}
              {incentive.remaining_deliveries === 1 ? 'entrega' : 'entregas'} para conseguir el bonus.
            </span>
          )}
        </div>
      </div>

      {/* Periodo de vigencia */}
      {(incentive.start_at || incentive.end_at) && (
        <div className="text-[10px] text-gray-400 font-mono pt-2 border-t border-gray-800/80 flex items-center gap-1.5">
          <Calendar size={11} className="text-gray-400 shrink-0" />
          <span>
            {incentive.start_at && `Desde ${formatDate(incentive.start_at)} `}
            {incentive.end_at && `hasta ${formatDate(incentive.end_at)}`}
          </span>
        </div>
      )}
    </div>
  );
}
