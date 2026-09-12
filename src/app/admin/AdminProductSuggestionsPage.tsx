// ==============================================================================
// YA - GESTIÓN DE SUGERENCIAS DE PRODUCTOS EN ADMIN (FASE 10)
// Archivo: src/app/admin/AdminProductSuggestionsPage.tsx
// ==============================================================================

import React, { useEffect, useState } from 'react';
import {
  Lightbulb,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  X,
  Trash2,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  Edit2,
  Filter,
} from 'lucide-react';
import {
  adminFetchAllSuggestions,
  adminUpdateSuggestion,
  adminDeleteSuggestion,
} from '../../lib/suggestions';
import type { ProductSuggestion, SuggestionStatus } from '../../types/app';

export function AdminProductSuggestionsPage() {
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Edit / Notes modal
  const [editingSug, setEditingSug] = useState<ProductSuggestion | null>(null);
  const [newStatus, setNewStatus] = useState<SuggestionStatus>('pending');
  const [adminNotes, setAdminNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await adminFetchAllSuggestions(statusFilter);
      if (res.error) {
        setActionError(res.error);
      } else {
        setSuggestions(res.suggestions);
      }
    } catch (err: any) {
      setActionError(err.message || 'Error al cargar sugerencias');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleOpenEdit = (sug: ProductSuggestion) => {
    setEditingSug(sug);
    setNewStatus(sug.status);
    setAdminNotes(sug.admin_notes || '');
  };

  const handleSaveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSug) return;

    setSaving(true);
    setActionError(null);

    const res = await adminUpdateSuggestion(editingSug.id, newStatus, adminNotes);
    setSaving(false);

    if (res.error) {
      setActionError(res.error);
    } else {
      setActionSuccess('Sugerencia actualizada correctamente.');
      setEditingSug(null);
      loadData();
      setTimeout(() => setActionSuccess(null), 3500);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar esta sugerencia de producto?')) return;

    const res = await adminDeleteSuggestion(id);
    if (res.error) {
      setActionError(res.error);
    } else {
      setActionSuccess('Sugerencia eliminada.');
      loadData();
      setTimeout(() => setActionSuccess(null), 3000);
    }
  };

  const filteredList = suggestions.filter((sug) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const titleText = (sug.title || sug.name || '').toLowerCase();
    return (
      titleText.includes(term) ||
      (sug.brand && sug.brand.toLowerCase().includes(term)) ||
      (sug.category_hint && sug.category_hint.toLowerCase().includes(term)) ||
      (sug.user_name && sug.user_name.toLowerCase().includes(term)) ||
      (sug.user_email && sug.user_email.toLowerCase().includes(term))
    );
  });

  const getStatusBadge = (status: SuggestionStatus) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 text-[10px] font-black uppercase px-2 py-0.5">
            <Clock size={11} /> Pendiente
          </span>
        );
      case 'reviewing':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[10px] font-black uppercase px-2 py-0.5">
            <Search size={11} /> En revisión
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black uppercase px-2 py-0.5">
            <CheckCircle2 size={11} /> Aceptada
          </span>
        );
      case 'implemented':
        return (
          <span className="inline-flex items-center gap-1 bg-ya-lime text-ya-black text-[10px] font-black uppercase px-2 py-0.5">
            <Sparkles size={11} /> ¡Implementada!
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-black uppercase px-2 py-0.5">
            <X size={11} /> Rechazada
          </span>
        );
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-4 border-ya-gray pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-ya-lime animate-pulse"></span>
            <span className="font-mono text-xs uppercase tracking-widest text-ya-lime">
              Catálogo Colaborativo YA
            </span>
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            <Lightbulb className="text-ya-lime" size={32} />
            <span>Sugerencias de Productos</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Revisa las peticiones de nuevos productos hechas por clientes de Jerez y gestiona su estado.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="p-2.5 bg-ya-gray border-2 border-ya-gray hover:border-ya-lime text-white transition-colors"
            title="Refrescar lista"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-ya-lime' : ''} />
          </button>
        </div>
      </div>

      {/* Alerts */}
      {actionSuccess && (
        <div className="p-3 bg-ya-lime/10 border-2 border-ya-lime text-ya-lime text-xs font-bold flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-red-950/60 border-2 border-red-500 text-red-200 text-xs font-bold flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{actionError}</span>
        </div>
      )}

      {/* Filters & Search */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3.5 top-3 text-gray-400" size={18} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por producto, marca, categoría o cliente..."
            className="w-full bg-ya-gray border-2 border-ya-gray pl-11 pr-4 py-2.5 text-white text-xs font-medium focus:outline-none focus:border-ya-lime"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={16} className="text-ya-lime shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full bg-ya-gray border-2 border-ya-gray p-2.5 text-white text-xs font-bold focus:outline-none focus:border-ya-lime uppercase"
          >
            <option value="all">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="reviewing">En revisión</option>
            <option value="accepted">Aceptada</option>
            <option value="implemented">Implementada</option>
            <option value="rejected">Rechazada</option>
          </select>
        </div>
      </div>

      {/* Main Table / Grid */}
      <div className="border-4 border-ya-gray bg-ya-black overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400 font-mono text-xs flex items-center justify-center gap-2">
            <RefreshCw size={16} className="animate-spin text-ya-lime" />
            <span>Cargando sugerencias de catálogo...</span>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-xs">
            No se han encontrado sugerencias con los filtros aplicados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-ya-gray border-b-2 border-ya-gray text-[10px] font-black uppercase tracking-wider text-gray-300">
                <tr>
                  <th className="p-3">Producto Sugerido</th>
                  <th className="p-3">Categoría / Marca</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Precio Estimado</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ya-gray">
                {filteredList.map((sug) => (
                  <tr key={sug.id} className="hover:bg-ya-gray/30 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-white text-sm">{sug.title || sug.name || 'Sugerencia'}</div>
                      {sug.description && (
                        <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">
                          {sug.description}
                        </p>
                      )}
                      {sug.reference_url && (
                        <a
                          href={sug.reference_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-ya-lime hover:underline font-mono mt-1"
                        >
                          <span>Enlace externo</span>
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-gray-200">
                        {sug.category_hint || 'Sin categoría'}
                      </div>
                      <div className="text-[10px] text-gray-400 font-mono">
                        {sug.brand ? `Marca: ${sug.brand}` : '—'}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-gray-200">
                        {sug.user_name || 'Cliente YA'}
                      </div>
                      {sug.user_email && (
                        <div className="text-[10px] text-gray-400 font-mono">
                          {sug.user_email}
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-mono text-gray-300">
                      {sug.estimated_price !== null && sug.estimated_price !== undefined
                        ? `${Number(sug.estimated_price).toFixed(2)} €`
                        : '—'}
                    </td>
                    <td className="p-3">
                      {getStatusBadge(sug.status)}
                      {sug.admin_notes && (
                        <div className="text-[10px] text-gray-400 font-mono mt-1 flex items-center gap-1">
                          <MessageSquare size={10} className="text-ya-lime shrink-0" />
                          <span className="truncate max-w-[140px]">{sug.admin_notes}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-mono text-[11px] text-gray-400">
                      {new Date(sug.created_at).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="p-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(sug)}
                          className="p-1.5 bg-ya-gray hover:bg-ya-lime hover:text-ya-black text-gray-300 border border-transparent hover:border-ya-lime transition-colors"
                          title="Gestionar estado y notas"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(sug.id)}
                          className="p-1.5 text-red-400 hover:text-red-200 hover:bg-red-950/40 transition-colors"
                          title="Eliminar sugerencia"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingSug && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-ya-black border-4 border-ya-gray w-full max-w-md text-white p-6 space-y-4">
            <div className="flex items-center justify-between border-b-2 border-ya-gray pb-3">
              <h3 className="font-black text-base uppercase tracking-tight text-white flex items-center gap-2">
                <Edit2 size={16} className="text-ya-lime" />
                <span>Gestionar Sugerencia</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingSug(null)}
                className="p-1 text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <div className="font-black text-lg text-white">{editingSug.title || editingSug.name || 'Sugerencia'}</div>
              <p className="text-xs text-gray-400 font-mono mt-0.5">
                Cliente: {editingSug.user_name} ({editingSug.user_email || 'Sin email'})
              </p>
              {editingSug.description && (
                <div className="mt-2 p-2.5 bg-ya-gray/40 border border-ya-gray text-xs text-gray-300">
                  {editingSug.description}
                </div>
              )}
            </div>

            <form onSubmit={handleSaveStatus} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-black uppercase text-gray-300 mb-1">
                  Estado de la sugerencia
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as any)}
                  className="w-full bg-ya-gray border border-ya-gray p-2.5 text-white font-bold uppercase focus:outline-none focus:border-ya-lime"
                >
                  <option value="pending">⏳ Pendiente</option>
                  <option value="reviewing">🔍 En revisión</option>
                  <option value="accepted">✅ Aceptada (se buscará proveedor)</option>
                  <option value="implemented">🚀 Implementada (ya en catálogo)</option>
                  <option value="rejected">❌ Rechazada (no viable)</option>
                </select>
              </div>

              <div>
                <label className="block font-black uppercase text-gray-300 mb-1">
                  Nota visible para el cliente (opcional)
                </label>
                <textarea
                  rows={3}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="ej. ¡Añadido al catálogo! Ya puedes comprarlo en la sección Bebidas..."
                  className="w-full bg-ya-gray border border-ya-gray p-2 text-white font-medium focus:outline-none focus:border-ya-lime resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-ya-gray">
                <button
                  type="button"
                  onClick={() => setEditingSug(null)}
                  className="px-4 py-2 border border-ya-gray text-gray-300 font-black uppercase text-xs hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-ya-lime text-ya-black font-black uppercase text-xs hover:bg-white transition-colors"
                >
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
