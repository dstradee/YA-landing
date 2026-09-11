// ==============================================================================
// YA - ADMINISTRACIÓN DE YA JUNTOS (PEDIDOS COMPARTIDOS TIPO TRICOUNT)
// Archivo: src/app/admin/AdminYaJuntosPage.tsx
// ==============================================================================

import { useEffect, useState } from 'react';
import {
  Users,
  RefreshCw,
  Eye,
  CreditCard,
  CheckCircle2,
  Clock,
  X,
  Loader2,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import type { DbYaJuntosGroup, YaJuntosGroupWithDetails } from '../../types/app';
import { fetchYaJuntosGroupByCode } from '../../lib/yaJuntos';
import { euro } from '../../data/products';

export default function AdminYaJuntosPage() {
  const [groups, setGroups] = useState<DbYaJuntosGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<YaJuntosGroupWithDetails | null>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);

  const loadGroups = async () => {
    try {
      setLoading(true);
      if (!isSupabaseConfigured) {
        // Mock fallback de localStorage
        try {
          const raw = localStorage.getItem('ya_juntos_groups_v1');
          if (raw) {
            const all = JSON.parse(raw);
            setGroups(Object.values(all) as DbYaJuntosGroup[]);
            return;
          }
        } catch {
          // ignore
        }
        setGroups([]);
        return;
      }

      const { data, error } = await supabase
        .from('ya_juntos_groups')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        setGroups(data as DbYaJuntosGroup[]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const handleInspectGroup = async (code: string) => {
    const res = await fetchYaJuntosGroupByCode(code);
    if (res.group) {
      setSelectedGroup(res.group);
      setInspectModalOpen(true);
    }
  };

  const totalVolume = groups.reduce((sum, g) => sum + Number(g.total || 0), 0);
  const fullyPaidCount = groups.filter((g) => g.status === 'fully_paid').length;
  const inPaymentCount = groups.filter((g) => g.status === 'payment_pending').length;

  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-ya-lime uppercase">
            <Users className="h-4 w-4" />
            MÓDULO FASE 9
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
            YA JUNTOS (PEDIDOS COMPARTIDOS)
          </h1>
          <p className="text-xs text-zinc-400">
            Supervisión de carritos colaborativos, pagos atómicos parciales tipo Tricount y pedidos completados.
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <button
            type="button"
            onClick={loadGroups}
            className="flex items-center gap-2 border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-300 hover:border-ya-lime hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            ACTUALIZAR
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="border border-zinc-800 bg-zinc-950 p-4">
          <span className="font-mono text-xs text-zinc-400 block">TOTAL GRUPOS</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{groups.length}</span>
            <Users className="h-4 w-4 text-ya-lime" />
          </div>
          <span className="mt-1 block text-[10px] text-zinc-500">Histórico de grupos iniciados</span>
        </div>

        <div className="border border-zinc-800 bg-zinc-950 p-4">
          <span className="font-mono text-xs text-zinc-400 block">EN FASE DE COBRO</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-400">{inPaymentCount}</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <span className="mt-1 block text-[10px] text-zinc-500">Recaudando pagos parciales</span>
        </div>

        <div className="border border-zinc-800 bg-zinc-950 p-4">
          <span className="font-mono text-xs text-zinc-400 block">PEDIDOS COMPLETADOS</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-ya-lime">{fullyPaidCount}</span>
            <CheckCircle2 className="h-4 w-4 text-ya-lime" />
          </div>
          <span className="mt-1 block text-[10px] text-zinc-500">100% abonados por todos</span>
        </div>

        <div className="border border-zinc-800 bg-zinc-950 p-4">
          <span className="font-mono text-xs text-zinc-400 block">VOLUMEN COMPARTIDO</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{euro(totalVolume)}</span>
            <CreditCard className="h-4 w-4 text-ya-lime" />
          </div>
          <span className="mt-1 block text-[10px] text-zinc-500">Importe bruto procesado</span>
        </div>
      </div>

      {/* Table */}
      <div className="border border-zinc-800 bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="border-b border-zinc-800 bg-zinc-900 text-zinc-400 uppercase">
              <tr>
                <th className="p-3">Código</th>
                <th className="p-3">Título</th>
                <th className="p-3">Modo de Pago</th>
                <th className="p-3">Total / Pagado</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Fecha</th>
                <th className="p-3 text-right">Detalles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-zinc-400">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-ya-lime" />
                      <span>Cargando grupos de YA Juntos...</span>
                    </div>
                  </td>
                </tr>
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-zinc-500">
                    No hay grupos compartidos registrados.
                  </td>
                </tr>
              ) : (
                groups.map((g) => (
                  <tr key={g.id} className="hover:bg-zinc-900/40">
                    <td className="p-3 font-bold text-ya-lime text-sm tracking-widest">{g.code}</td>
                    <td className="p-3 font-bold text-white uppercase">{g.title}</td>
                    <td className="p-3 text-zinc-400">
                      {g.payment_mode === 'split_by_items'
                        ? 'Tricount'
                        : g.payment_mode === 'split_equal'
                        ? 'Partes Iguales'
                        : 'Pagador Único'}
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-white">{euro(g.total)}</div>
                      <div className="text-[10px] text-zinc-400">Pagado: {euro(g.amount_paid)}</div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold uppercase ${
                          g.status === 'fully_paid'
                            ? 'bg-ya-lime text-ya-black'
                            : g.status === 'payment_pending'
                            ? 'bg-amber-400 text-ya-black'
                            : 'border border-zinc-700 text-zinc-400'
                        }`}
                      >
                        {g.status === 'open'
                          ? 'ABIERTO'
                          : g.status === 'payment_pending'
                          ? 'EN PAGO'
                          : g.status === 'fully_paid'
                          ? 'COMPLETADO'
                          : g.status}
                      </span>
                    </td>
                    <td className="p-3 text-zinc-500">
                      {new Date(g.created_at).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleInspectGroup(g.code)}
                        className="inline-flex items-center gap-1 border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-zinc-300 hover:border-ya-lime hover:text-white"
                      >
                        <Eye className="h-3 w-3" />
                        VER
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* INSPECT GROUP MODAL */}
      {inspectModalOpen && selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl border-4 border-ya-lime bg-zinc-900 p-6 shadow-[8px_8px_0px_0px_#B6FF00] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div>
                <span className="bg-ya-lime px-2 py-0.5 font-mono text-[10px] font-black text-ya-black uppercase">
                  GRUPO: {selectedGroup.code}
                </span>
                <h3 className="mt-1 text-xl font-black uppercase text-white">{selectedGroup.title}</h3>
              </div>
              <button type="button" onClick={() => setInspectModalOpen(false)}>
                <X className="h-5 w-5 text-zinc-400 hover:text-white" />
              </button>
            </div>

            <div className="space-y-6 font-mono text-xs">
              {/* Financial snapshot */}
              <div className="grid grid-cols-3 gap-3 border border-zinc-800 bg-zinc-950 p-3 text-center">
                <div>
                  <span className="text-zinc-500 block text-[10px]">TOTAL PEDIDO</span>
                  <span className="text-sm font-black text-white">{euro(selectedGroup.total)}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px]">RECAUDADO</span>
                  <span className="text-sm font-black text-ya-lime">{euro(selectedGroup.amount_paid)}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px]">ESTADO</span>
                  <span className="text-sm font-black text-white uppercase">{selectedGroup.status}</span>
                </div>
              </div>

              {/* Participants */}
              <div>
                <h4 className="font-bold text-zinc-300 uppercase mb-2">
                  PARTICIPANTES ({selectedGroup.participants.length})
                </h4>
                <div className="border border-zinc-800 divide-y divide-zinc-800">
                  {selectedGroup.participants.map((p) => (
                    <div key={p.id} className="p-2.5 flex items-center justify-between bg-zinc-950">
                      <div>
                        <span className="font-bold text-white">{p.display_name}</span>
                        <span className="ml-2 text-[10px] text-zinc-500 uppercase">({p.role})</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-white block">{euro(p.allocated_amount)}</span>
                        <span
                          className={`text-[9px] font-bold uppercase ${
                            p.payment_status === 'paid' ? 'text-ya-lime' : 'text-amber-400'
                          }`}
                        >
                          {p.payment_status === 'paid' ? 'PAGADO' : 'PENDIENTE'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="font-bold text-zinc-300 uppercase mb-2">
                  PRODUCTOS EN EL CARRITO ({selectedGroup.items.length})
                </h4>
                <div className="border border-zinc-800 divide-y divide-zinc-800">
                  {selectedGroup.items.map((i) => (
                    <div key={i.id} className="p-2.5 flex items-center justify-between bg-zinc-950">
                      <div>
                        <span className="font-bold text-white">{i.product_name}</span>
                        <span className="block text-[10px] text-zinc-500">
                          {i.quantity} x {euro(i.unit_price)} · Añadido por {i.added_by_name}
                        </span>
                      </div>
                      <span className="font-bold text-white">{euro(i.line_subtotal)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setInspectModalOpen(false)}
                className="border border-zinc-700 bg-zinc-800 px-4 py-2 font-mono text-xs font-bold text-white hover:bg-zinc-700"
              >
                CERRAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
