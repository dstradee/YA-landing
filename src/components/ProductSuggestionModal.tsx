// ==============================================================================
// YA - MODAL DE SUGERENCIA DE PRODUCTOS PARA CLIENTES
// Archivo: src/components/ProductSuggestionModal.tsx
// ==============================================================================

import React, { useEffect, useState } from 'react';
import {
  Lightbulb,
  X,
  Send,
  Loader2,
  CheckCircle2,
  Clock,
  Search,
  Sparkles,
  AlertCircle,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  createProductSuggestion,
  fetchMySuggestions,
} from '../lib/suggestions';
import type { ProductSuggestion, SuggestionStatus } from '../types/app';

interface ProductSuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProductSuggestionModal({ isOpen, onClose }: ProductSuggestionModalProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [mySuggestions, setMySuggestions] = useState<ProductSuggestion[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // Form
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [categoryHint, setCategoryHint] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedPrice, setEstimatedPrice] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadHistory = async () => {
    if (!user) return;
    setLoadingList(true);
    const res = await fetchMySuggestions(user.id);
    if (res.suggestions) {
      setMySuggestions(res.suggestions);
    }
    setLoadingList(false);
  };

  useEffect(() => {
    if (isOpen && user) {
      loadHistory();
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setErrorMsg('Debes iniciar sesión para sugerir productos.');
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMsg('El nombre del producto es obligatorio.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const priceNum = estimatedPrice ? parseFloat(estimatedPrice.replace(',', '.')) : undefined;

    const res = await createProductSuggestion({
      userId: user.id,
      title: trimmedTitle,
      brand: brand.trim() || undefined,
      categoryHint: categoryHint.trim() || undefined,
      description: description.trim() || undefined,
      estimatedPrice: isNaN(priceNum as any) ? undefined : priceNum,
      referenceUrl: referenceUrl.trim() || undefined,
    });

    setSubmitting(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setSuccessMsg('¡Muchas gracias! Tu sugerencia ha sido enviada al equipo de YA.');
      setTitle('');
      setBrand('');
      setCategoryHint('');
      setDescription('');
      setEstimatedPrice('');
      setReferenceUrl('');
      loadHistory();
      setTimeout(() => {
        setActiveTab('history');
        setSuccessMsg(null);
      }, 1500);
    }
  };

  const renderStatusBadge = (status: SuggestionStatus) => {
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
            <Sparkles size={11} /> ¡En Catálogo!
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-black uppercase px-2 py-0.5">
            <X size={11} /> Descartada
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-ya-black border-4 border-ya-gray w-full max-w-lg max-h-[90vh] overflow-y-auto text-white flex flex-col">
        {/* Header */}
        <div className="p-5 border-b-2 border-ya-gray flex items-center justify-between sticky top-0 bg-ya-black z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-ya-lime text-ya-black">
              <Lightbulb size={20} />
            </div>
            <div>
              <h2 className="font-black text-lg uppercase tracking-tight">Sugerir un Producto</h2>
              <p className="text-xs text-gray-400 font-mono">
                ¿Echas algo de menos en Jerez? ¡Dínoslo!
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white border border-ya-gray hover:border-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b-2 border-ya-gray bg-ya-gray/30">
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'create'
                ? 'border-ya-lime text-ya-lime bg-ya-black'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            Nueva Sugerencia
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              loadHistory();
            }}
            className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'history'
                ? 'border-ya-lime text-ya-lime bg-ya-black'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            Mis Sugerencias ({mySuggestions.length})
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 flex-1">
          {errorMsg && (
            <div className="p-3 bg-red-950/60 border-2 border-red-500 text-red-200 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-ya-lime/10 border-2 border-ya-lime text-ya-lime text-xs flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {activeTab === 'create' ? (
            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-black uppercase text-gray-300 text-[11px] mb-1">
                  Nombre del producto o artículo *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="ej. Red Bull Sandía 250ml, Hielo bolsa 2kg..."
                  className="w-full bg-ya-gray border border-ya-gray p-2.5 text-white font-medium focus:outline-none focus:border-ya-lime"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black uppercase text-gray-300 text-[11px] mb-1">
                    Marca (opcional)
                  </label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="ej. Nestlé, Coca-Cola..."
                    className="w-full bg-ya-gray border border-ya-gray p-2 text-white font-medium focus:outline-none focus:border-ya-lime"
                  />
                </div>
                <div>
                  <label className="block font-black uppercase text-gray-300 text-[11px] mb-1">
                    Categoría sugerida
                  </label>
                  <input
                    type="text"
                    value={categoryHint}
                    onChange={(e) => setCategoryHint(e.target.value)}
                    placeholder="ej. Bebidas, Snacks, Dulces..."
                    className="w-full bg-ya-gray border border-ya-gray p-2 text-white font-medium focus:outline-none focus:border-ya-lime"
                  />
                </div>
              </div>

              <div>
                <label className="block font-black uppercase text-gray-300 text-[11px] mb-1">
                  Descripción o dónde encontrarlo en Jerez (opcional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="ej. Lo suelen vender en gasolineras o supermercados Dia..."
                  className="w-full bg-ya-gray border border-ya-gray p-2 text-white font-medium focus:outline-none focus:border-ya-lime resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black uppercase text-gray-300 text-[11px] mb-1">
                    Precio orientativo (€)
                  </label>
                  <input
                    type="text"
                    value={estimatedPrice}
                    onChange={(e) => setEstimatedPrice(e.target.value)}
                    placeholder="ej. 2.20"
                    className="w-full bg-ya-gray border border-ya-gray p-2 text-white font-mono focus:outline-none focus:border-ya-lime"
                  />
                </div>
                <div>
                  <label className="block font-black uppercase text-gray-300 text-[11px] mb-1">
                    Enlace de referencia
                  </label>
                  <input
                    type="url"
                    value={referenceUrl}
                    onChange={(e) => setReferenceUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-ya-gray border border-ya-gray p-2 text-white font-mono text-[11px] focus:outline-none focus:border-ya-lime"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-ya-lime text-ya-black font-black uppercase tracking-wider text-xs hover:bg-white transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Enviando sugerencia...</span>
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      <span>Enviar Sugerencia</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {loadingList ? (
                <div className="p-8 text-center text-gray-400 font-mono text-xs animate-pulse flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin text-ya-lime" />
                  Cargando tus sugerencias...
                </div>
              ) : mySuggestions.length === 0 ? (
                <div className="p-8 text-center border-2 border-ya-gray bg-ya-gray/20">
                  <p className="text-gray-400 text-xs">Aún no has sugerido ningún producto.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('create')}
                    className="mt-3 text-xs font-black uppercase text-ya-lime hover:underline inline-flex items-center gap-1"
                  >
                    <span>Hacer mi primera sugerencia</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              ) : (
                mySuggestions.map((sug) => (
                  <div
                    key={sug.id}
                    className="p-3.5 border-2 border-ya-gray bg-ya-gray/30 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-black text-sm text-white">{sug.title || sug.name || 'Sugerencia'}</h4>
                        {sug.brand && (
                          <span className="text-[11px] text-gray-400 font-mono">
                            Marca: {sug.brand}
                          </span>
                        )}
                      </div>
                      {renderStatusBadge(sug.status)}
                    </div>

                    {sug.description && (
                      <p className="text-xs text-gray-300 mt-1">{sug.description}</p>
                    )}

                    {sug.admin_notes && (
                      <div className="mt-2 p-2 bg-ya-black border border-ya-lime/40 text-[11px] text-ya-lime font-mono">
                        💬 Respuesta YA: {sug.admin_notes}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono pt-1">
                      <span>
                        Enviada: {new Date(sug.created_at).toLocaleDateString('es-ES')}
                      </span>
                      {sug.reference_url && (
                        <a
                          href={sug.reference_url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-ya-lime inline-flex items-center gap-1"
                        >
                          <span>Ver enlace</span>
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
