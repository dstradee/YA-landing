// ==============================================================================
// YA - PANEL DE GESTIÓN DE SUGERENCIAS DE PRODUCTOS (ADMIN)
// Archivo: src/app/admin/AdminSuggestionsPage.tsx
// ==============================================================================

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lightbulb,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  X,
  Edit3,
  ExternalLink,
  PlusCircle,
  MessageSquare,
  User,
} from 'lucide-react';
import {
  fetchProductSuggestions,
  updateSuggestionStatus,
  updateSuggestionAdminNotes,
} from '../../lib/adminSuggestions';
import type { DbProductSuggestion, ProductSuggestionStatus } from '../../types/app';
import { euro } from '../../data/products';

const STATUS_CONFIG: Record<
  ProductSuggestionStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  pending: {
    label: 'Pendiente',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
  },
  reviewing: {
    label: 'En Revisión',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
  },
  accepted: {
    label: 'Aprobada',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
  },
  rejected: {
    label: 'Descartada',
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
  },
  implemented: {
    label: 'Implementada en Catálogo',
    bg: 'bg-ya-lime/10',
    text: 'text-ya-lime',
    border: 'border-ya-lime/40',
  },
};

export function AdminSuggestionsPage() {
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState<DbProductSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ProductSuggestionStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modal / Edición de notas
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesText, setNotesText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetchProductSuggestions({
        status: statusFilter,
        query: searchQuery,
      });
      if (res.error) {
        setActionError(res.error);
      } else {
        setSuggestions(res.data);
      }
    } catch (err: any) {
      setActionError(err.message || 'Error al cargar sugerencias');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusChange = async (id: string, newStatus: ProductSuggestionStatus) => {
    setActionError(null);
    const res = await updateSuggestionStatus(id, newStatus);
    if (!res.success) {
      setActionError(res.error || 'Error al cambiar estado');
    } else {
      setActionSuccess(`Estado cambiado a "${STATUS_CONFIG[newStatus].label}"`);
      await loadData();
    }
  };

  const handleOpenNotes = (item: DbProductSuggestion) => {
    setEditingNotesId(item.id);
    setNotesText(item.admin_notes || '');
  };

  const handleSaveNotes = async () => {
    if (!editingNotesId) return;
    setSavingNotes(true);
    const res = await updateSuggestionAdminNotes(editingNotesId, notesText.trim());
    if (!res.success) {
      setActionError(res.error || 'Error al guardar notas');
    } else {
      setActionSuccess('Notas internas actualizadas correctamente');
      setEditingNotesId(null);
      await loadData();
    }
    setSavingNotes(false);
  };

  const handleConvertToProduct = (sugg: DbProductSuggestion) => {
    // Redirigir a la pestaña de productos prellenando datos en query params
    const params = new URLSearchParams();
    params.set('action', 'new');
    params.set('name', sugg.name || sugg.title || '');
    if (sugg.category_name) params.set('category', sugg.category_name);
    if (sugg.estimated_price) params.set('price', String(sugg.estimated_price));
    if (sugg.description) params.set('desc', sugg.description);

    navigate(`/admin/productos?${params.toString()}`);
  };

  // Contadores por estado
  const counts = {
    all: suggestions.length,
    pending: suggestions.filter((s) => s.status === 'pending').length,
    reviewing: suggestions.filter((s) => s.status === 'reviewing').length,
    accepted: suggestions.filter((s) => s.status === 'accepted').length,
    rejected: suggestions.filter((s) => s.status === 'rejected').length,
    implemented: suggestions.filter((s) => s.status === 'implemented').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b-2 border-ya-gray pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-ya-lime/10 text-ya-lime border border-ya-lime/30">
              <Lightbulb size={20} />
            </span>
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
              Sugerencias de Productos
            </h1>
          </div>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Revisa las peticiones enviadas por clientes y conviértelas en productos activos en el catálogo
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 border-2 border-ya-gray text-xs font-bold uppercase text-gray-300 hover:text-white hover:border-ya-lime transition-colors self-start sm:self-auto"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Alertas */}
      {actionSuccess && (
        <div className="p-3 bg-ya-lime/10 border-2 border-ya-lime text-ya-lime text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{actionSuccess}</span>
          </div>
          <button type="button" onClick={() => setActionSuccess(null)} className="hover:underline">
            Cerrar
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-red-500/10 border-2 border-red-500 text-red-400 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{actionError}</span>
          </div>
          <button type="button" onClick={() => setActionError(null)} className="hover:underline">
            Cerrar
          </button>
        </div>
      )}

      {/* Filtros y Búsqueda */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, marca o categoría..."
              className="w-full bg-ya-gray/30 border-2 border-ya-gray pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:border-ya-lime focus:outline-none font-mono"
            />
          </div>

          {/* Filtro por estado tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 font-mono text-[11px]">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-2 uppercase font-black tracking-wider border-2 transition-colors whitespace-nowrap ${
                statusFilter === 'all'
                  ? 'border-ya-lime bg-ya-lime text-ya-black'
                  : 'border-ya-gray text-gray-400 hover:text-white'
              }`}
            >
              Todas ({counts.all})
            </button>
            {(Object.keys(STATUS_CONFIG) as ProductSuggestionStatus[]).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-2 uppercase font-black tracking-wider border-2 transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'border-ya-lime bg-ya-lime text-ya-black'
                    : 'border-ya-gray text-gray-400 hover:text-white'
                }`}
              >
                {STATUS_CONFIG[st].label} ({counts[st]})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lista de Sugerencias */}
      <div className="space-y-3">
        {loading && suggestions.length === 0 ? (
          <div className="p-12 text-center text-gray-400 font-mono text-xs border-2 border-ya-gray">
            Cargando sugerencias...
          </div>
        ) : suggestions.length === 0 ? (
          <div className="p-12 text-center text-gray-400 font-mono text-xs border-2 border-ya-gray bg-ya-black">
            No se encontraron sugerencias con los filtros aplicados.
          </div>
        ) : (
          suggestions.map((item) => {
            const stCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
            return (
              <div
                key={item.id}
                className="border-2 border-ya-gray bg-ya-black/60 p-4 space-y-3 hover:border-ya-gray/90 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-black uppercase text-white tracking-tight">
                        {item.name}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 border ${stCfg.bg} ${stCfg.text} ${stCfg.border}`}
                      >
                        {stCfg.label}
                      </span>
                      {item.brand && (
                        <span className="text-[10px] font-mono text-gray-400 bg-ya-gray/40 px-2 py-0.5">
                          Marca: {item.brand}
                        </span>
                      )}
                      {item.category_name && (
                        <span className="text-[10px] font-mono text-gray-400 bg-ya-gray/40 px-2 py-0.5">
                          {item.category_name}
                        </span>
                      )}
                    </div>

                    {item.description && (
                      <p className="text-xs text-gray-300 italic pt-1 max-w-2xl">
                        "{item.description}"
                      </p>
                    )}
                  </div>

                  {/* Acciones principales */}
                  <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0">
                    <button
                      type="button"
                      onClick={() => handleConvertToProduct(item)}
                      className="px-3 py-1.5 bg-ya-lime text-ya-black text-xs font-black uppercase tracking-wider hover:bg-white transition-colors flex items-center gap-1.5"
                      title="Abrir formulario de nuevo producto con estos datos"
                    >
                      <PlusCircle size={14} />
                      <span>Convertir en Producto</span>
                    </button>
                  </div>
                </div>

                {/* Fila de detalles: Cliente, Fecha, PVP estimado, Enlace */}
                <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-gray-400 pt-2 border-t border-ya-gray/40">
                  <div className="flex items-center gap-1">
                    <User size={12} className="text-gray-500" />
                    <span>
                      {item.user_name || item.user_email || 'Usuario anónimo'}
                      {item.user_email && (
                        <span className="text-gray-500 ml-1">({item.user_email})</span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Clock size={12} className="text-gray-500" />
                    <span>{new Date(item.created_at).toLocaleString()}</span>
                  </div>

                  {item.estimated_price && (
                    <div>
                      PVP sugerido: <span className="text-white font-bold">{euro(item.estimated_price)}</span>
                    </div>
                  )}

                  {item.reference_url && (
                    <a
                      href={item.reference_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ya-lime hover:underline flex items-center gap-1"
                    >
                      <span>Ver enlace de referencia</span>
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>

                {/* Notas internas y cambio de estado */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 bg-ya-gray/20 p-2.5 border border-ya-gray/50 text-xs">
                  <div className="flex-1">
                    {item.admin_notes ? (
                      <div className="flex items-start gap-2">
                        <MessageSquare size={13} className="text-ya-lime shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] font-bold uppercase text-gray-400 block">
                            Notas internas del Administrador:
                          </span>
                          <p className="text-white font-mono text-[11px]">{item.admin_notes}</p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[10px] font-mono text-gray-500 italic">
                        Sin notas internas del administrador
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenNotes(item)}
                      className="px-2.5 py-1 text-[11px] font-mono uppercase font-bold border border-ya-gray hover:border-ya-lime text-gray-300 hover:text-white transition-colors flex items-center gap-1"
                    >
                      <Edit3 size={12} />
                      <span>{item.admin_notes ? 'Editar Notas' : 'Añadir Notas'}</span>
                    </button>

                    <select
                      value={item.status}
                      onChange={(e) =>
                        handleStatusChange(item.id, e.target.value as ProductSuggestionStatus)
                      }
                      className="bg-ya-black border border-ya-gray px-2 py-1 text-[11px] font-mono text-white focus:border-ya-lime focus:outline-none"
                    >
                      <option value="pending">Pendiente</option>
                      <option value="reviewing">En Revisión</option>
                      <option value="accepted">Aprobada</option>
                      <option value="rejected">Descartada</option>
                      <option value="implemented">Implementada</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal para editar notas internas */}
      {editingNotesId && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="border-4 border-ya-gray bg-ya-black max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b-2 border-ya-gray pb-3">
              <h3 className="text-sm font-black uppercase text-white flex items-center gap-2">
                <Edit3 size={16} className="text-ya-lime" />
                <span>Notas Internas del Administrador</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingNotesId(null)}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 font-mono">
                Observaciones operativas, acuerdos de proveedor o motivos:
              </label>
              <textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                rows={4}
                placeholder="Ej: Aprobado para catálogo. El proveedor distribuye cada martes..."
                className="w-full bg-ya-gray/30 border-2 border-ya-gray p-2 text-white font-mono text-xs focus:border-ya-lime focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-ya-gray">
              <button
                type="button"
                onClick={() => setEditingNotesId(null)}
                className="px-3 py-1.5 border border-ya-gray text-xs font-bold uppercase text-gray-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="px-4 py-1.5 bg-ya-lime text-ya-black text-xs font-black uppercase border border-ya-lime hover:bg-white transition-colors"
              >
                {savingNotes ? 'Guardando...' : 'Guardar Notas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
