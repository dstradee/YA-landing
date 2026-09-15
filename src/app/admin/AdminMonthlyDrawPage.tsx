// ==============================================================================
// YA - PANEL ADMIN: GESTIÓN DE SORTEO MENSUAL
// Archivo: src/app/admin/AdminMonthlyDrawPage.tsx
// ==============================================================================

import React, { useEffect, useState } from 'react';
import {
  Trophy,
  Plus,
  CheckCircle2,
  Users,
  Clock,
  AlertTriangle,
  Award,
  X,
  Search,
  Edit2,
} from 'lucide-react';
import {
  adminFetchAllMonthlyDraws,
  adminFetchMonthlyDrawParticipants,
  adminCreateMonthlyDraw,
  adminUpdateMonthlyDraw,
  adminCloseMonthlyDraw,
  formatMadridDate,
} from '../../lib/drops';
import type { DbMonthlyDraw, DbMonthlyDrawHistory } from '../../types/drops';
import { euro } from '../../data/products';

export function AdminMonthlyDrawPage() {
  const [draws, setDraws] = useState<DbMonthlyDraw[]>([]);
  const [history, setHistory] = useState<DbMonthlyDrawHistory[]>([]);
  const [loading, setLoading] = useState(true);

  // Participantes del sorteo activo
  const [participants, setParticipants] = useState<
    Array<{
      user_id: string;
      entries_count: number;
      full_name: string;
      email: string;
      phone: string;
    }>
  >([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  // Modal Elegir Ganador Manualmente
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [selectedDrawToClose, setSelectedDrawToClose] = useState<DbMonthlyDraw | null>(null);
  const [selectedWinnerId, setSelectedWinnerId] = useState<string>('');
  const [winnerNotes, setWinnerNotes] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal Crear Sorteo Mensual
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [monthIdentifier, setMonthIdentifier] = useState('');
  const [title, setTitle] = useState('');
  const [prizeTitle, setPrizeTitle] = useState('');
  const [prizeValue, setPrizeValue] = useState<number>(100);
  const [themeKey, setThemeKey] = useState('standard');
  const [themeUnitName, setThemeUnitName] = useState('participación');
  const [themeUnitIcon, setThemeUnitIcon] = useState('ticket');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Modal Editar Sorteo Mensual (Activo o en curso)
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedDrawToEdit, setSelectedDrawToEdit] = useState<DbMonthlyDraw | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrizeTitle, setEditPrizeTitle] = useState('');
  const [editPrizeDescription, setEditPrizeDescription] = useState('');
  const [editPrizeValue, setEditPrizeValue] = useState<number>(100);
  const [editThemeKey, setEditThemeKey] = useState('standard');
  const [editThemeUnitName, setEditThemeUnitName] = useState('participación');
  const [editThemeUnitIcon, setEditThemeUnitIcon] = useState('ticket');
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editEndsAt, setEditEndsAt] = useState('');
  const [editStatus, setEditStatus] = useState<any>('open');
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await adminFetchAllMonthlyDraws();
      setDraws(res.draws);
      setHistory(res.history);

      const active = res.draws.find((d) => d.status === 'open');
      if (active) {
        setLoadingParticipants(true);
        const parts = await adminFetchMonthlyDrawParticipants(active.id);
        setParticipants(parts);
        setLoadingParticipants(false);
      }
    } catch (err: any) {
      console.error('[AdminMonthlyDrawPage] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeDraw = draws.find((d) => d.status === 'open');

  // Abrir modal de nuevo sorteo
  const handleOpenCreateModal = () => {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const yyyy = nextMonth.getFullYear();
    const mm = String(nextMonth.getMonth() + 1).padStart(2, '0');
    const monthKey = `${yyyy}-${mm}`;

    setMonthIdentifier(monthKey);
    setTitle(`Gran Sorteo YA — ${monthKey}`);
    setPrizeTitle('100 € en compras en YA Delivery');
    setPrizeValue(100);
    setThemeKey('standard');
    setThemeUnitName('participación');
    setThemeUnitIcon('ticket');

    // Fechas primer día y último día del mes
    const start = new Date(yyyy, nextMonth.getMonth(), 1, 0, 0, 0);
    const end = new Date(yyyy, nextMonth.getMonth() + 1, 0, 23, 59, 59);
    setStartsAt(start.toISOString().slice(0, 16));
    setEndsAt(end.toISOString().slice(0, 16));

    setModalError(null);
    setShowCreateModal(true);
  };

  const handleCreateDraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!monthIdentifier.trim() || !title.trim() || !prizeTitle.trim()) {
      setModalError('Por favor completa todos los campos requeridos.');
      return;
    }

    setIsCreating(true);
    try {
      await adminCreateMonthlyDraw({
        month_identifier: monthIdentifier.trim(),
        title: title.trim(),
        description: `Sorteo mensual para todos los pedidos y drops de ${monthIdentifier}.`,
        theme_key: themeKey,
        theme_unit_name: themeUnitName,
        theme_unit_icon: themeUnitIcon,
        prize_title: prizeTitle.trim(),
        prize_description: 'Premio entregado al ganador seleccionado.',
        prize_value: Number(prizeValue) || 0,
        status: 'open',
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
      });

      setNotice(`Sorteo ${monthIdentifier} creado con éxito.`);
      setShowCreateModal(false);
      await loadData();
    } catch (err: any) {
      setModalError(err.message || 'Error al registrar el sorteo.');
    } finally {
      setIsCreating(false);
    }
  };

  // Abrir modal en modo edición
  const handleOpenEditModal = (draw: DbMonthlyDraw) => {
    setSelectedDrawToEdit(draw);
    setEditTitle(draw.title || '');
    setEditDescription(draw.description || '');
    setEditPrizeTitle(draw.prize_title || '');
    setEditPrizeDescription(draw.prize_description || '');
    setEditPrizeValue(draw.prize_value || 100);
    setEditThemeKey(draw.theme_key || 'standard');
    setEditThemeUnitName(draw.theme_unit_name || 'participación');
    setEditThemeUnitIcon(draw.theme_unit_icon || 'ticket');
    setEditStatus(draw.status || 'open');

    if (draw.starts_at) {
      try {
        setEditStartsAt(new Date(draw.starts_at).toISOString().slice(0, 16));
      } catch {
        setEditStartsAt('');
      }
    }
    if (draw.ends_at) {
      try {
        setEditEndsAt(new Date(draw.ends_at).toISOString().slice(0, 16));
      } catch {
        setEditEndsAt('');
      }
    }

    setEditError(null);
    setShowEditModal(true);
  };

  // Guardar edición del sorteo mensual (sin borrar participaciones)
  const handleUpdateDraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDrawToEdit) return;
    setEditError(null);

    if (!editTitle.trim() || !editPrizeTitle.trim() || !editStartsAt || !editEndsAt) {
      setEditError('Por favor completa todos los campos requeridos.');
      return;
    }

    setIsUpdating(true);
    try {
      await adminUpdateMonthlyDraw(selectedDrawToEdit.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        prize_title: editPrizeTitle.trim(),
        prize_description: editPrizeDescription.trim() || null,
        prize_value: Number(editPrizeValue) || 0,
        theme_key: editThemeKey,
        theme_unit_name: editThemeUnitName,
        theme_unit_icon: editThemeUnitIcon,
        status: editStatus,
        starts_at: new Date(editStartsAt).toISOString(),
        ends_at: new Date(editEndsAt).toISOString(),
      });

      setNotice(
        `Sorteo "${editTitle}" actualizado correctamente. Las participaciones registradas se mantienen intactas.`
      );
      setShowEditModal(false);
      await loadData();
    } catch (err: any) {
      console.error('[AdminMonthlyDrawPage] Error updating draw:', err);
      setEditError(err.message || 'Error al actualizar el sorteo mensual.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Abrir modal de selección manual de ganador
  const handleOpenWinnerModal = (draw: DbMonthlyDraw) => {
    setSelectedDrawToClose(draw);
    setSelectedWinnerId('');
    setWinnerNotes('');
    setSearchTerm('');
    setShowWinnerModal(true);
  };

  // Confirmar y cerrar sorteo con ganador manual
  const handleConfirmWinner = async () => {
    if (!selectedDrawToClose || !selectedWinnerId) {
      alert('Debes seleccionar a un usuario ganador de la lista.');
      return;
    }

    const winner = participants.find((p) => p.user_id === selectedWinnerId);
    const confirmMsg = `¿Confirmas que deseas declarar GANADOR a ${winner?.full_name || 'este usuario'} (${winner?.email}) para el sorteo "${selectedDrawToClose.title}"?\n\nAl confirmar:\n1. Se registrará en el histórico oficial.\n2. Se liberarán y eliminarán las participaciones del mes.\n3. El sorteo quedará completado.`;

    if (!window.confirm(confirmMsg)) return;

    setIsClosing(true);
    try {
      await adminCloseMonthlyDraw(selectedDrawToClose.id, selectedWinnerId, winnerNotes);
      setNotice(`¡Ganador registrado con éxito! El sorteo ha finalizado y se ha archivado limpiamente.`);
      setShowWinnerModal(false);
      await loadData();
    } catch (err: any) {
      alert(`Error al cerrar sorteo: ${err.message}`);
    } finally {
      setIsClosing(false);
    }
  };

  const filteredParticipants = participants.filter((p) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(term) ||
      p.email.toLowerCase().includes(term) ||
      p.phone.includes(term)
    );
  });

  const totalTickets = participants.reduce((sum, p) => sum + p.entries_count, 0);

  if (loading) {
    return (
      <div className="py-12 text-center text-xs font-mono uppercase tracking-widest text-amber-400 animate-pulse">
        Cargando sorteos mensuales...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-ya-gray pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-400 text-ya-black font-black font-mono text-[10px] uppercase tracking-wider mb-2">
            <Trophy size={12} />
            <span>SORTEO MENSUAL</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
            Gran Sorteo Mensual
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Gestión de ciclo mensual, participaciones de Drops y selección manual de ganador.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="py-2.5 px-4 bg-amber-400 text-ya-black hover:bg-white font-black uppercase text-xs tracking-wider flex items-center gap-1.5 transition-colors"
        >
          <Plus size={16} />
          <span>Nuevo Sorteo Mensual</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 border-2 border-amber-400 bg-amber-950/30 text-amber-200 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* SORTEO ACTIVO ACTUAL */}
      {activeDraw ? (
        <div className="border-4 border-amber-400/80 bg-ya-black p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b-2 border-ya-gray">
            <div>
              <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-widest block mb-1">
                SORTEO EN CURSO • MES: {activeDraw.month_identifier}
              </span>
              <h2 className="text-2xl font-black uppercase text-white mb-2">{activeDraw.title}</h2>
              <div className="text-sm text-gray-300">
                Premio principal:{' '}
                <strong className="text-amber-300">{activeDraw.prize_title}</strong> (
                {euro(activeDraw.prize_value)})
              </div>
              <div className="text-xs font-mono text-gray-400 mt-2 flex items-center gap-2">
                <Clock size={14} />
                <span>
                  Periodo: {formatMadridDate(activeDraw.starts_at)} —{' '}
                  {formatMadridDate(activeDraw.ends_at)}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="border-2 border-ya-gray bg-ya-gray/30 p-3 text-center min-w-[130px]">
                <span className="text-[10px] font-mono text-gray-400 uppercase block">
                  Participantes
                </span>
                <span className="text-2xl font-black font-mono text-white">
                  {participants.length}
                </span>
              </div>

              <div className="border-2 border-amber-400/50 bg-amber-950/20 p-3 text-center min-w-[130px]">
                <span className="text-[10px] font-mono text-amber-300 uppercase block">
                  Total Boletos
                </span>
                <span className="text-2xl font-black font-mono text-amber-400">
                  {totalTickets}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleOpenEditModal(activeDraw)}
                className="py-3 px-4 border-2 border-amber-400/80 bg-amber-400/10 text-amber-300 hover:bg-amber-400 hover:text-ya-black font-black uppercase text-xs tracking-wider flex items-center gap-2 transition-all shadow-md"
                title="Editar título, premio, fechas o estado de este sorteo"
              >
                <Edit2 size={16} />
                <span>Editar Sorteo</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenWinnerModal(activeDraw)}
                className="py-3 px-5 bg-amber-400 text-ya-black hover:bg-white font-black uppercase text-xs tracking-wider flex items-center gap-2 transition-all shadow-lg"
              >
                <Award size={16} />
                <span>Elegir Ganador Manual</span>
              </button>
            </div>
          </div>

          {/* Lista de Participantes del mes */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black uppercase text-white flex items-center gap-2">
                <Users size={16} className="text-amber-400" />
                <span>Participantes con Boletos ({participants.length})</span>
              </h3>
              <div className="text-xs font-mono text-gray-400">
                Cada participación representa una opción de ser elegido
              </div>
            </div>

            {loadingParticipants ? (
              <div className="py-6 text-center text-xs font-mono text-gray-400 animate-pulse">
                Cargando participantes...
              </div>
            ) : participants.length === 0 ? (
              <div className="p-4 border border-ya-gray text-center text-xs text-gray-400">
                Aún no hay participaciones registradas para este sorteo mensual.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto border border-ya-gray">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-ya-gray/50 text-gray-300 border-b border-ya-gray">
                    <tr>
                      <th className="p-2.5">Cliente</th>
                      <th className="p-2.5">Email / Teléfono</th>
                      <th className="p-2.5 text-right">Boletos</th>
                      <th className="p-2.5 text-right">% Probabilidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ya-gray/30">
                    {participants.map((p) => {
                      const pct = totalTickets > 0 ? (p.entries_count / totalTickets) * 100 : 0;
                      return (
                        <tr key={p.user_id} className="hover:bg-ya-gray/20">
                          <td className="p-2.5 font-bold text-white">{p.full_name}</td>
                          <td className="p-2.5 text-gray-400">{p.email || p.phone}</td>
                          <td className="p-2.5 text-right font-black text-amber-300">
                            {p.entries_count}
                          </td>
                          <td className="p-2.5 text-right text-gray-300">
                            {pct.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="border-2 border-ya-gray bg-ya-gray/20 p-8 text-center">
          <Trophy size={32} className="text-gray-500 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-white mb-1">No hay sorteo mensual abierto</h3>
          <p className="text-xs text-gray-400 mb-4">
            Crea el próximo sorteo mensual para que las participaciones de los Drops se vinculen.
          </p>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="py-2.5 px-4 bg-amber-400 text-ya-black hover:bg-white font-black uppercase text-xs"
          >
            Abrir Sorteo Mensual
          </button>
        </div>
      )}

      {/* HISTÓRICO PERMANENTE DE GANADORES ANTERIORES */}
      <section className="pt-4">
        <h3 className="text-sm font-black uppercase text-white mb-3 flex items-center gap-2">
          <Award size={16} className="text-amber-400" />
          <span>Histórico Oficial de Ganadores</span>
        </h3>

        {history.length === 0 ? (
          <div className="border border-ya-gray bg-ya-gray/10 p-4 text-center text-xs text-gray-400">
            Aún no se ha completado ningún sorteo mensual.
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((h) => (
              <div
                key={h.id}
                className="border-2 border-ya-gray bg-ya-black p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-black text-amber-400">
                      MES {h.month_identifier}
                    </span>
                    <span className="text-[10px] font-mono bg-ya-lime/20 text-ya-lime px-2 py-0.5">
                      COMPLETADO
                    </span>
                  </div>
                  <h4 className="text-base font-black uppercase text-white">{h.draw_title}</h4>
                  <div className="text-xs text-gray-300 mt-1">
                    Ganador:{' '}
                    <strong className="text-white">
                      {h.winner_name} ({h.winner_email || 'Sin email'})
                    </strong>
                  </div>
                  {h.notes && <p className="text-xs text-gray-400 mt-1 italic">{h.notes}</p>}
                </div>

                <div className="text-right shrink-0">
                  <div className="text-sm font-black text-amber-300 font-mono">
                    {euro(h.prize_value)}
                  </div>
                  <div className="text-[11px] font-mono text-gray-400">
                    {h.total_entries_count} boletos • {h.total_unique_participants} participantes
                  </div>
                  <div className="text-[10px] font-mono text-gray-500">
                    Entregado: {formatMadridDate(h.awarded_at, false)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MODAL CREAR SORTEO MENSUAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-ya-black border-4 border-ya-gray max-w-lg w-full p-6 text-white">
            <div className="flex items-center justify-between border-b-2 border-ya-gray pb-4 mb-4">
              <div>
                <span className="text-[10px] font-mono text-amber-400 uppercase tracking-widest block">
                  SORTEO MENSUAL
                </span>
                <h3 className="text-xl font-black uppercase">Crear Nuevo Sorteo</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {modalError && (
              <div className="mb-4 p-3 border-2 border-red-500 bg-red-950/40 text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateDraw} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Mes (YYYY-MM)
                  </label>
                  <input
                    type="text"
                    value={monthIdentifier}
                    onChange={(e) => setMonthIdentifier(e.target.value)}
                    required
                    placeholder="2026-10"
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Valor Estimado (€)
                  </label>
                  <input
                    type="number"
                    value={prizeValue}
                    onChange={(e) => setPrizeValue(Number(e.target.value))}
                    required
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1">
                  Título del Sorteo
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="Gran Sorteo YA Octubre"
                  className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1">
                  Premio Principal
                </label>
                <input
                  type="text"
                  value={prizeTitle}
                  onChange={(e) => setPrizeTitle(e.target.value)}
                  required
                  placeholder="150 € en pedidos YA o PlayStation 5"
                  className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Fecha Inicio
                  </label>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    required
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Fecha Cierre
                  </label>
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    required
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t-2 border-ya-gray">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="py-2.5 px-4 border border-ya-gray text-gray-300 hover:text-white font-bold text-xs uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="py-2.5 px-6 bg-amber-400 text-ya-black font-black uppercase text-xs hover:bg-white transition-colors"
                >
                  {isCreating ? 'Creando...' : 'Crear Sorteo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR SORTEO MENSUAL */}
      {showEditModal && selectedDrawToEdit && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-ya-black border-4 border-amber-400 max-w-lg w-full p-6 text-white my-8 shadow-2xl">
            <div className="flex items-center justify-between border-b-2 border-ya-gray pb-4 mb-4">
              <div>
                <span className="text-[10px] font-mono text-amber-400 uppercase tracking-widest block">
                  EDICIÓN OFICIAL DE SORTEO
                </span>
                <h3 className="text-xl font-black uppercase">Editar Sorteo Mensual</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="p-2 text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-4 p-3 border border-amber-400/50 bg-amber-950/30 text-amber-200 text-xs font-mono">
              ✓ Las participaciones de los usuarios ya registradas se mantienen intactas. La edición solo actualiza la información, fechas, premio y estado del sorteo.
            </div>

            {editError && (
              <div className="mb-4 p-3 border-2 border-red-500 bg-red-950/40 text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateDraw} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1">
                  Título del Sorteo *
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  placeholder="Gran Sorteo YA — Septiembre"
                  className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1">
                  Descripción
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  placeholder="Participa automáticamente con tus pedidos..."
                  className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Premio Principal *
                  </label>
                  <input
                    type="text"
                    value={editPrizeTitle}
                    onChange={(e) => setEditPrizeTitle(e.target.value)}
                    required
                    placeholder="Pack Tech YA o 250 €"
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Valor Estimado (€) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editPrizeValue}
                    onChange={(e) => setEditPrizeValue(Number(e.target.value))}
                    required
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1">
                  Detalles del Premio
                </label>
                <input
                  type="text"
                  value={editPrizeDescription}
                  onChange={(e) => setEditPrizeDescription(e.target.value)}
                  placeholder="1 mes completo de pedidos gratis..."
                  className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Tema
                  </label>
                  <select
                    value={editThemeKey}
                    onChange={(e) => setEditThemeKey(e.target.value)}
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-xs text-white"
                  >
                    <option value="standard">Standard</option>
                    <option value="halloween">Halloween</option>
                    <option value="christmas">Navidad</option>
                    <option value="summer">Verano</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Unidad
                  </label>
                  <input
                    type="text"
                    value={editThemeUnitName}
                    onChange={(e) => setEditThemeUnitName(e.target.value)}
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Estado *
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-xs text-white font-bold"
                  >
                    <option value="open">Abierto (Activo)</option>
                    <option value="closed">Pausado / Cerrado</option>
                    <option value="draft">Borrador</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Fecha Inicio *
                  </label>
                  <input
                    type="datetime-local"
                    value={editStartsAt}
                    onChange={(e) => setEditStartsAt(e.target.value)}
                    required
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Fecha Cierre *
                  </label>
                  <input
                    type="datetime-local"
                    value={editEndsAt}
                    onChange={(e) => setEditEndsAt(e.target.value)}
                    required
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t-2 border-ya-gray">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="py-2.5 px-4 border border-ya-gray text-gray-300 hover:text-white font-bold text-xs uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="py-2.5 px-6 bg-amber-400 text-ya-black font-black uppercase text-xs hover:bg-white transition-colors"
                >
                  {isUpdating ? 'Guardando cambios...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL SELECCIÓN MANUAL DE GANADOR */}
      {showWinnerModal && selectedDrawToClose && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-ya-black border-4 border-amber-400 max-w-xl w-full p-6 text-white">
            <div className="flex items-center justify-between border-b-2 border-ya-gray pb-4 mb-4">
              <div>
                <span className="text-[10px] font-mono text-amber-400 uppercase tracking-widest block">
                  ADJUDICACIÓN MANUAL
                </span>
                <h3 className="text-xl font-black uppercase">Elegir Ganador del Sorteo</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWinnerModal(false)}
                className="p-2 text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="text-xs text-gray-300 mb-4 bg-ya-gray/30 p-3 border border-ya-gray">
              Selecciona manualmente al cliente ganador de entre las participaciones validadas. Al
              confirmar, el sorteo quedará archivado y se purgarán las participaciones temporales.
            </div>

            {/* Buscador de participantes */}
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre, email o teléfono..."
                className="w-full bg-ya-gray/30 border border-ya-gray pl-9 pr-3 py-2 text-xs text-white"
              />
            </div>

            {/* Selector de ganador */}
            <div className="max-h-52 overflow-y-auto border border-ya-gray mb-4 space-y-1 p-1">
              {filteredParticipants.length === 0 ? (
                <div className="p-3 text-center text-xs text-gray-400">
                  No se encontraron participantes con este criterio.
                </div>
              ) : (
                filteredParticipants.map((p) => (
                  <label
                    key={p.user_id}
                    className={`flex items-center justify-between p-2.5 cursor-pointer border transition-colors ${
                      selectedWinnerId === p.user_id
                        ? 'border-amber-400 bg-amber-950/40 text-white'
                        : 'border-transparent hover:bg-ya-gray/30 text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="winner_radio"
                        checked={selectedWinnerId === p.user_id}
                        onChange={() => setSelectedWinnerId(p.user_id)}
                        className="accent-amber-400"
                      />
                      <div>
                        <span className="font-bold block">{p.full_name}</span>
                        <span className="text-[11px] text-gray-400 font-mono">{p.email}</span>
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs">
                      <span className="font-black text-amber-300">{p.entries_count} boletos</span>
                    </div>
                  </label>
                ))
              )}
            </div>

            {/* Notas opcionales */}
            <div className="mb-4">
              <label className="block text-xs font-mono text-gray-400 mb-1">
                Notas / Acta del Sorteo (Opcional)
              </label>
              <textarea
                value={winnerNotes}
                onChange={(e) => setWinnerNotes(e.target.value)}
                rows={2}
                placeholder="Ej. Sorteado en directo en Instagram / Pedido #1234 elegible..."
                className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-xs text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t-2 border-ya-gray">
              <button
                type="button"
                onClick={() => setShowWinnerModal(false)}
                className="py-2.5 px-4 border border-ya-gray text-gray-300 hover:text-white font-bold text-xs uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!selectedWinnerId || isClosing}
                onClick={handleConfirmWinner}
                className={`py-2.5 px-6 font-black uppercase text-xs transition-colors ${
                  !selectedWinnerId || isClosing
                    ? 'bg-ya-gray text-gray-400 cursor-not-allowed'
                    : 'bg-amber-400 text-ya-black hover:bg-white'
                }`}
              >
                {isClosing ? 'Registrando...' : 'Declarar Ganador y Cerrar Mes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
