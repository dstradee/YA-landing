// ==============================================================================
// YA - PANEL ADMIN: GESTIÓN DE DROPS SEMANALES
// Archivo: src/app/admin/AdminDropsPage.tsx
// ==============================================================================

import React, { useEffect, useState } from 'react';
import {
  Gift,
  Plus,
  Trash2,
  Edit2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  X,
  Percent,
  Play,
} from 'lucide-react';
import {
  adminFetchAllDrops,
  adminFetchDropWithPrizes,
  adminCreateDrop,
  adminUpdateDrop,
  adminDeleteDrop,
  adminFetchAwardedPrizes,
  adminRunDataCleanup,
  formatMadridDate,
  getDropTimingStatus,
} from '../../lib/drops';
import type { DbDrop, DropGameType, DropPrizeType, ActiveDropPayload } from '../../types/drops';
import { DropGameEngine } from '../../components/drops/DropGameEngine';

function formatToDateTimeLocal(isoString?: string | null): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdminDropsPage() {
  const [drops, setDrops] = useState<DbDrop[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'active' | 'scheduled' | 'finished'>('all');

  // Sección activa: Gestión de Drops o Premios Otorgados/Formularios
  const [panelSection, setPanelSection] = useState<'drops' | 'awarded'>('drops');
  const [awardedPrizes, setAwardedPrizes] = useState<any[]>([]);
  const [loadingAwarded, setLoadingAwarded] = useState(false);

  // Modal de Asistente IA / Importación JSON
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiJsonInput, setAiJsonInput] = useState('');

  // Modal Crear/Editar Drop
  const [showModal, setShowModal] = useState(false);
  const [editingDropId, setEditingDropId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Modo Prueba de Drops (Admin)
  const [testingDropPayload, setTestingDropPayload] = useState<ActiveDropPayload | null>(null);
  const [testingLoadingId, setTestingLoadingId] = useState<string | null>(null);

  // Form State
  const [dropNumber, setDropNumber] = useState(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [gameType, setGameType] = useState<DropGameType>('jackpot');
  const [status, setStatus] = useState<any>('scheduled');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [activationTrigger, setActivationTrigger] = useState('after_payment');
  const [prizeValidityDays, setPrizeValidityDays] = useState(7);
  const [consolationEntries, setConsolationEntries] = useState(1);

  // Form Prizes
  const [prizes, setPrizes] = useState<
    Array<{
      id?: string;
      name: string;
      description: string;
      prize_type: DropPrizeType;
      prize_value: number;
      probability_pct: number;
      max_inventory: number | '' | null;
      validity_days: number | '' | null;
      is_active: boolean;
    }>
  >([
    {
      name: 'Descuento 20% YA',
      description: '20% en tu próximo pedido',
      prize_type: 'percentage_discount',
      prize_value: 20,
      probability_pct: 15.0,
      max_inventory: 100,
      validity_days: 7,
      is_active: true,
    },
  ]);

  const loadDrops = async () => {
    setLoading(true);
    try {
      const data = await adminFetchAllDrops();
      setDrops(data);
      if (data.length > 0) {
        const maxNum = Math.max(...data.map((d) => d.drop_number || 0));
        setDropNumber(maxNum + 1);
      }
    } catch (err: any) {
      console.error('[AdminDropsPage] Error loading drops:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrops();
  }, []);

  // Abrir modal en modo crear
  const handleOpenCreate = () => {
    setEditingDropId(null);
    setTitle(`Drop #${dropNumber} Semanal YA`);
    setDescription('¡Gana premios directos en tu pedido o participaciones para el Sorteo Mensual!');
    setGameType('jackpot');
    setStatus('scheduled');

    // Fechas por defecto: empieza ahora, termina en 7 días
    const now = new Date();
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    setStartsAt(now.toISOString().slice(0, 16));
    setEndsAt(nextWeek.toISOString().slice(0, 16));

    setActivationTrigger('after_payment');
    setPrizeValidityDays(7);
    setConsolationEntries(1);
    setPrizes([
      {
        name: 'Descuento 15% YA',
        description: 'Válido en tu próximo pedido',
        prize_type: 'percentage_discount',
        prize_value: 15,
        probability_pct: 10,
        max_inventory: 50,
        validity_days: 7,
        is_active: true,
      },
    ]);
    setFormError(null);
    setShowModal(true);
  };

  // Abrir modal en modo editar
  const handleOpenEdit = async (dropId: string) => {
    setEditingDropId(dropId);
    setFormError(null);
    try {
      const { drop, prizes: dbPrizes } = await adminFetchDropWithPrizes(dropId);
      setDropNumber(drop.drop_number);
      setTitle(drop.title);
      setDescription(drop.description || '');
      setGameType(drop.game_key || drop.game_type || 'jackpot');
      setStatus(drop.status);
      setStartsAt(formatToDateTimeLocal(drop.starts_at));
      setEndsAt(formatToDateTimeLocal(drop.ends_at));
      setActivationTrigger(drop.activation_trigger);
      setPrizeValidityDays(drop.prize_validity_days || 7);
      setConsolationEntries(drop.consolation_config?.entries_count || 1);

      setPrizes(
        dbPrizes.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description || '',
          prize_type: p.prize_type,
          prize_value: Number(p.prize_value),
          probability_pct: Number(p.probability_pct),
          max_inventory: p.max_inventory,
          validity_days: p.validity_days,
          is_active: p.is_active,
        }))
      );
      setShowModal(true);
    } catch (err: any) {
      alert(`Error al cargar datos del drop: ${err.message}`);
    }
  };

  // Probar Drop en vivo (Modo Prueba de Admin)
  const handleTestDrop = async (dropId: string) => {
    setTestingLoadingId(dropId);
    try {
      const dropData = await adminFetchDropWithPrizes(dropId);
      if (!dropData || !dropData.drop) {
        alert('No se pudo encontrar la información del Drop seleccionado.');
        return;
      }

      const rawPrizes = dropData.prizes || [];
      const activePrizes = rawPrizes.filter((p) => p.is_active !== false);

      if (activePrizes.length === 0) {
        alert(
          'Este Drop no tiene premios activos configurados. Para poder probar el juego, pulsa en "Probabilidades" y añade al menos un premio activo.'
        );
        return;
      }

      const effectiveGameKey = dropData.drop.game_key || dropData.drop.game_type || 'jackpot';

      const payload: ActiveDropPayload = {
        active: true,
        drop: {
          id: dropData.drop.id,
          drop_number: dropData.drop.drop_number,
          title: dropData.drop.title,
          description: dropData.drop.description,
          game_type: effectiveGameKey as any,
          game_key: effectiveGameKey,
          activation_trigger: dropData.drop.activation_trigger || 'after_payment',
          game_config: dropData.drop.game_config || {},
          consolation_reward_type: dropData.drop.consolation_reward_type || 'monthly_draw_entry',
          consolation_config: dropData.drop.consolation_config || { entries_count: 1 },
          starts_at: dropData.drop.starts_at,
          ends_at: dropData.drop.ends_at,
          prize_validity_days: dropData.drop.prize_validity_days || 7,
        },
        prizes: activePrizes.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          prize_type: p.prize_type,
          prize_value: Number(p.prize_value || 0),
          prize_config: p.prize_config || {},
          sort_order: p.sort_order || 0,
        })),
      };

      setTestingDropPayload(payload);
    } catch (err: any) {
      console.error('[AdminDropsPage] Error al iniciar prueba del Drop:', err);
      alert(err?.message || 'Error al iniciar la prueba del Drop.');
    } finally {
      setTestingLoadingId(null);
    }
  };

  // Función para aplicar Preset de 8 Premios (Jackpot completo y equilibrado)
  const handleApplyJackpot8Preset = () => {
    setTitle(`Drop #${dropNumber} — Jackpot Especial YA`);
    setGameType('jackpot');
    setActivationTrigger('after_payment');
    setPrizes([
      { name: 'Descuento 50% YA', description: '50% en tu próximo pedido', prize_type: 'percentage_discount', prize_value: 50, probability_pct: 1, max_inventory: 10, validity_days: 7, is_active: true },
      { name: 'Envío Gratis YA', description: 'Envío gratuito en tu próximo pedido', prize_type: 'free_shipping', prize_value: 0, probability_pct: 15, max_inventory: null, validity_days: 7, is_active: true },
      { name: 'Pedido Gratis (hasta 20€)', description: 'Pedido cubierto hasta 20€', prize_type: 'free_order', prize_value: 20, probability_pct: 0.5, max_inventory: 5, validity_days: 7, is_active: true },
      { name: 'Premio Exclusivo YA', description: 'Merchandising edición limitada YA', prize_type: 'custom', prize_value: 0, probability_pct: 2, max_inventory: 25, validity_days: 14, is_active: true },
      { name: 'Descuento 25% YA', description: '25% directo al checkout', prize_type: 'percentage_discount', prize_value: 25, probability_pct: 5, max_inventory: null, validity_days: 7, is_active: true },
      { name: 'Descuento 15% YA', description: '15% directo al checkout', prize_type: 'percentage_discount', prize_value: 15, probability_pct: 12, max_inventory: null, validity_days: 7, is_active: true },
      { name: 'Descuento 3€ Fijo', description: '3€ de descuento en tu cesta', prize_type: 'fixed_discount', prize_value: 3, probability_pct: 10, max_inventory: null, validity_days: 7, is_active: true },
      { name: 'Bebida Energética Gratis', description: 'Producto gratis con tu pedido', prize_type: 'product', prize_value: 0, probability_pct: 4.5, max_inventory: 50, validity_days: 7, is_active: true },
    ]);
  };

  // Función para aplicar Preset DROP 002 — Rasca y Gana (3 Categorías: Principal, Secundario, Consolación)
  const handleApplyScratchPreset = () => {
    setTitle(`DROP 002 — RASCA Y GANA`);
    setDescription('Rasca tu billete digital exclusivo tras realizar tu pedido. ¡Descubre premios directos o participaciones para el Sorteo Mensual!');
    setGameType('scratch');
    setActivationTrigger('after_payment');
    setPrizeValidityDays(7);
    setConsolationEntries(1);
    setPrizes([
      {
        name: 'Pedido Gratis hasta 20 €',
        description: 'Premio Principal (3x YA): Tu próximo pedido en YA Delivery es 100% gratis hasta 20 €.',
        prize_type: 'free_order',
        prize_value: 20,
        probability_pct: 5,
        max_inventory: 100,
        validity_days: 7,
        is_active: true,
      },
      {
        name: '25 % Dto. en tu próximo pedido',
        description: 'Premio Secundario (✦ · ✦ · 🥤): Ahorra un 25% directo en tu siguiente pedido.',
        prize_type: 'percentage_discount',
        prize_value: 25,
        probability_pct: 20,
        max_inventory: 500,
        validity_days: 7,
        is_active: true,
      },
    ]);
  };

  // Función para aplicar Preset DROP 003 — El Cara o Cruz (10% Físico / 90% Consolación +2)
  const handleApplyCaraCruzPreset = () => {
    setTitle(`DROP 003 — EL CARA O CRUZ`);
    setDescription('Elige cara o cruz y haz girar la moneda exclusiva de YA. Si aciertas te llevas el premio físico exclusivo; si no, ganas +2 participaciones para el Gran Sorteo Mensual.');
    setGameType('cara_cruz');
    setActivationTrigger('after_payment');
    setPrizeValidityDays(14);
    setConsolationEntries(2);
    setPrizes([
      {
        name: 'Gorra Exclusiva YA — Edición Limitada',
        description: 'Premio físico oficial Drop 003: Gorra bordada YA Neo-Brutalist de alta calidad. Te contactaremos para el envío directo a tu dirección.',
        prize_type: 'custom',
        prize_value: 30,
        probability_pct: 10,
        max_inventory: 50,
        validity_days: 14,
        is_active: true,
      },
    ]);
  };

  // Función para aplicar Preset DROP 004 — El Trile (10% Premio Gordo / 20% Descuento / 70% Consolación +2)
  const handleApplyTrilePreset = () => {
    setTitle(`DROP 004 — EL TRILE`);
    setDescription('3 cartas boca abajo: elige una, descubre las tres. Consigue el Premio Gordo, un descuento directo en tu próximo pedido o participaciones para el Gran Sorteo Mensual.');
    setGameType('trile');
    setActivationTrigger('after_payment');
    setPrizeValidityDays(14);
    setConsolationEntries(2);
    setPrizes([
      {
        name: 'Sudadera Exclusiva YA — Oversize Trile',
        description: 'Premio Gordo oficial Drop 004: Sudadera con capucha bordada YA Neo-Brutalist edición especial Trile.',
        prize_type: 'custom',
        prize_value: 45,
        probability_pct: 10,
        max_inventory: 30,
        validity_days: 14,
        is_active: true,
      },
      {
        name: '25% Descuento en tu próximo pedido',
        description: 'Premio Secundario Drop 004: 25% de descuento directo en tu próximo pedido en YA.',
        prize_type: 'percentage_discount',
        prize_value: 25,
        probability_pct: 20,
        max_inventory: 500,
        validity_days: 7,
        is_active: true,
      },
    ]);
  };

  // Función para importar configuración JSON de IA
  const handleImportAiJson = () => {
    try {
      const parsed = JSON.parse(aiJsonInput);
      if (parsed.title) setTitle(parsed.title);
      if (parsed.drop_number) setDropNumber(Number(parsed.drop_number));
      if (parsed.description) setDescription(parsed.description);
      if (parsed.game_key || parsed.game_type) setGameType(parsed.game_key || parsed.game_type);
      if (parsed.activation_trigger) setActivationTrigger(parsed.activation_trigger);
      if (parsed.prize_validity_days) setPrizeValidityDays(Number(parsed.prize_validity_days));
      if (parsed.consolation_entries) setConsolationEntries(Number(parsed.consolation_entries));
      if (Array.isArray(parsed.prizes) && parsed.prizes.length > 0) {
        setPrizes(parsed.prizes.map((p: any) => ({
          name: p.name || 'Premio',
          description: p.description || '',
          prize_type: p.prize_type || 'percentage_discount',
          prize_value: Number(p.prize_value) || 0,
          probability_pct: Number(p.probability_pct) || 0,
          max_inventory: p.max_inventory ?? null,
          validity_days: p.validity_days ?? 7,
          is_active: p.is_active ?? true,
        })));
      }
      setShowAiModal(false);
      setAiJsonInput('');
    } catch (err: any) {
      alert(`Error al parsear el JSON de la IA: ${err.message}`);
    }
  };

  // Guardar Drop
  const handleSaveDrop = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError('El título es obligatorio.');
      return;
    }

    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setFormError('Las fechas de inicio y fin no son válidas.');
      return;
    }

    if (endDate <= startDate) {
      setFormError('La fecha de fin debe ser posterior a la fecha de inicio.');
      return;
    }

    const totalProbability = prizes.reduce(
      (sum, p) => sum + (p.is_active ? Number(p.probability_pct || 0) : 0),
      0
    );

    console.log(`Premios directos: ${totalProbability}%`);
    console.log(`Consolación: ${Math.max(0, 100 - totalProbability)}%`);

    if (totalProbability > 100) {
      setFormError(
        `La suma de probabilidades (${totalProbability.toFixed(1)}%) supera el 100%. Ajústalas para continuar.`
      );
      return;
    }

    setIsSaving(true);
    try {
      const dropPayload: any = {
        drop_number: Number(dropNumber),
        title: title.trim(),
        description: description.trim() || null,
        game_type: gameType,
        game_key: gameType,
        status,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        activation_trigger: activationTrigger,
        trigger_config: {},
        game_config: { game_key: gameType },
        consolation_reward_type: 'monthly_draw_entry',
        consolation_config: { entries_count: Number(consolationEntries) || 1 },
        prize_validity_days: Number(prizeValidityDays) || 7,
      };

      const prizesPayload: any = prizes.map((p) => ({
        id: (p as any).id,
        name: p.name.trim(),
        description: p.description.trim() || null,
        prize_type: p.prize_type,
        prize_value: Number(p.prize_value) || 0,
        prize_config: (p as any).prize_config || {},
        probability_pct: Number(p.probability_pct) || 0,
        max_inventory: p.max_inventory === '' || p.max_inventory === null ? null : Number(p.max_inventory),
        validity_days: p.validity_days === '' || p.validity_days === null ? null : Number(p.validity_days),
        is_active: p.is_active,
      }));

      if (editingDropId) {
        await adminUpdateDrop(editingDropId, dropPayload, prizesPayload);
        setSuccessNotice(`Drop #${dropNumber} actualizado exitosamente.`);
      } else {
        await adminCreateDrop(dropPayload, prizesPayload);
        setSuccessNotice(`Drop #${dropNumber} programado exitosamente.`);
      }

      setShowModal(false);
      await loadDrops();
    } catch (err: any) {
      console.error('[AdminDropsPage] Error saving drop:', err);
      setFormError(err.message || 'Error al guardar el Drop.');
    } finally {
      setIsSaving(false);
    }
  };

  // Eliminar Drop con comprobación
  const handleDeleteDrop = async (drop: DbDrop) => {
    const confirmMsg = `¿Eliminar permanentemente el Drop #${drop.drop_number} (${drop.title})? Esta acción no se puede deshacer.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await adminDeleteDrop(drop.id);
      setSuccessNotice(`Drop #${drop.drop_number} eliminado correctamente.`);
      await loadDrops();
    } catch (err: any) {
      alert(`No se pudo eliminar el Drop: ${err.message}`);
    }
  };

  // Ejecutar limpieza manual
  const handleDataCleanup = async () => {
    try {
      const res = await adminRunDataCleanup();
      alert(`Limpieza ejecutada: ${res.expired_prizes_marked} premios expirados marcados.`);
      await loadDrops();
    } catch (err: any) {
      alert(`Error en la limpieza: ${err.message}`);
    }
  };

  // Filtrado de Drops por estado temporal en tiempo real
  const filteredDrops = drops.filter((d) => {
    if (selectedFilter === 'all') return true;
    const timing = getDropTimingStatus(d);
    return timing === selectedFilter;
  });

  const totalProb = prizes.reduce(
    (sum, p) => sum + (p.is_active ? Number(p.probability_pct || 0) : 0),
    0
  );

  useEffect(() => {
    if (showModal) {
      console.log(`Premios directos: ${totalProb}%`);
      console.log(`Consolación: ${Math.max(0, 100 - totalProb)}%`);
    }
  }, [totalProb, showModal]);

  return (
    <div className="space-y-6">
      {/* Cabecera del Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-ya-gray pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-ya-lime text-ya-black font-black font-mono text-[10px] uppercase tracking-wider mb-2">
            <Gift size={12} />
            <span>MÓDULO DE DROPS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
            Drops Semanales
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Configuración, calendario y reglas probabilísticas de Drops para clientes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDataCleanup}
            className="py-2.5 px-4 border-2 border-ya-gray text-gray-300 hover:text-white hover:border-white font-mono text-xs uppercase font-bold flex items-center gap-1.5 transition-colors"
            title="Ejecutar limpieza de premios expirados e historial antiguo"
          >
            <RefreshCw size={14} />
            <span>Limpieza</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="py-2.5 px-4 bg-ya-lime text-ya-black hover:bg-white font-black uppercase text-xs tracking-wider flex items-center gap-1.5 transition-colors"
          >
            <Plus size={16} />
            <span>Nuevo Drop</span>
          </button>
        </div>
      </div>

      {/* Avisos */}
      {successNotice && (
        <div className="p-3 border-2 border-ya-lime bg-ya-lime/10 text-ya-lime text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{successNotice}</span>
          </div>
          <button onClick={() => setSuccessNotice(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Selector de Sección: Drops vs Premios Otorgados */}
      <div className="flex border-b-2 border-ya-gray gap-4">
        <button
          type="button"
          onClick={() => setPanelSection('drops')}
          className={`py-2 px-3 text-xs font-black uppercase tracking-wider transition-colors border-b-2 -mb-[2px] ${
            panelSection === 'drops'
              ? 'border-ya-lime text-ya-lime'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Drops Semanales ({drops.length})
        </button>
        <button
          type="button"
          onClick={async () => {
            setPanelSection('awarded');
            setLoadingAwarded(true);
            const res = await adminFetchAwardedPrizes();
            setAwardedPrizes(res);
            setLoadingAwarded(false);
          }}
          className={`py-2 px-3 text-xs font-black uppercase tracking-wider transition-colors border-b-2 -mb-[2px] ${
            panelSection === 'awarded'
              ? 'border-ya-lime text-ya-lime'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Premios Otorgados / Formularios Especiales
        </button>
      </div>

      {panelSection === 'awarded' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase text-white tracking-wider">
              Historial de Premios Otorgados a Usuarios
            </h3>
            <button
              type="button"
              onClick={async () => {
                setLoadingAwarded(true);
                const res = await adminFetchAwardedPrizes();
                setAwardedPrizes(res);
                setLoadingAwarded(false);
              }}
              className="px-3 py-1.5 border border-ya-gray hover:border-white text-[11px] font-mono uppercase text-gray-300 flex items-center gap-1.5"
            >
              <RefreshCw size={12} />
              Actualizar
            </button>
          </div>

          {loadingAwarded ? (
            <div className="py-12 text-center text-xs font-mono uppercase tracking-widest text-ya-lime animate-pulse">
              Cargando premios otorgados...
            </div>
          ) : awardedPrizes.length === 0 ? (
            <div className="border-2 border-ya-gray bg-ya-gray/20 p-8 text-center text-gray-400 text-xs font-mono">
              No hay premios registrados todavía.
            </div>
          ) : (
            <div className="space-y-3">
              {awardedPrizes.map((p) => {
                const isCustom = p.prize_type === 'custom' || (p.prize_config && Object.keys(p.prize_config).length > 0);
                return (
                  <div
                    key={p.id}
                    className="border-2 border-ya-gray bg-ya-black p-4 flex flex-col md:flex-row md:items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-ya-lime uppercase font-mono">
                          {p.prize_name}
                        </span>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-zinc-800 text-gray-300 border border-zinc-700">
                          {p.prize_type}
                        </span>
                        <span
                          className={`text-[10px] uppercase font-mono px-2 py-0.5 ${
                            p.status === 'used'
                              ? 'bg-blue-900/40 text-blue-300 border border-blue-500/40'
                              : p.status === 'expired'
                              ? 'bg-red-950/40 text-red-400 border border-red-500/40'
                              : 'bg-ya-lime/20 text-ya-lime border border-ya-lime/40'
                          }`}
                        >
                          {p.status}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-gray-400">
                        Usuario ID: <span className="text-white">{p.user_id}</span> • Otorgado:{' '}
                        {formatMadridDate(p.awarded_at)}
                      </div>

                      {/* Datos del Formulario Especial / Configuración */}
                      {isCustom && p.prize_config && (
                        <div className="mt-2 p-3 border border-ya-lime/40 bg-zinc-900/80">
                          <span className="text-[10px] font-mono text-ya-lime uppercase font-bold block mb-1">
                            Datos del Formulario de Entrega:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono text-gray-200">
                            {Object.entries(p.prize_config).map(([key, val]) => (
                              <div key={key}>
                                <span className="text-gray-400 capitalize">{key.replace(/_/g, ' ')}:</span>{' '}
                                <strong className="text-white">{String(val)}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Filtros por pestaña */}
          <div className="flex border-b-2 border-ya-gray gap-2">
            {(['all', 'active', 'scheduled', 'finished'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSelectedFilter(tab)}
                className={`py-2 px-4 text-xs font-black uppercase tracking-wider transition-colors border-b-2 -mb-[2px] ${
                  selectedFilter === tab
                    ? 'border-ya-lime text-ya-lime'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                {tab === 'all'
                  ? `Todos (${drops.length})`
                  : tab === 'active'
                  ? `Activos Ahora (${drops.filter((d) => getDropTimingStatus(d) === 'active').length})`
                  : tab === 'scheduled'
                  ? `Programados (${drops.filter((d) => getDropTimingStatus(d) === 'scheduled').length})`
                  : `Finalizados (${drops.filter((d) => getDropTimingStatus(d) === 'finished').length})`}
              </button>
            ))}
          </div>

          {/* Lista de Drops */}
          {loading ? (
            <div className="py-12 text-center text-xs font-mono uppercase tracking-widest text-ya-lime animate-pulse">
              Cargando configuración de Drops...
            </div>
          ) : filteredDrops.length === 0 ? (
            <div className="border-2 border-ya-gray bg-ya-gray/20 p-8 text-center">
              <Gift size={32} className="text-gray-500 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-white mb-1">No hay Drops en este estado</h3>
              <p className="text-xs text-gray-400 mb-4">
                Puedes programar un nuevo Drop con el botón "Nuevo Drop".
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredDrops.map((drop) => {
                const timing = getDropTimingStatus(drop);
                return (
                <div
                  key={drop.id}
                  className={`border-2 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                    timing === 'active'
                      ? 'border-ya-lime bg-ya-black shadow-lg shadow-ya-lime/5'
                      : 'border-ya-gray bg-ya-black'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-black font-mono text-ya-lime">
                        DROP #{drop.drop_number}
                      </span>
                      {timing === 'active' ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-black uppercase px-2.5 py-0.5 bg-ya-lime text-ya-black">
                          <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                          ACTIVO AHORA
                        </span>
                      ) : timing === 'scheduled' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/40">
                          <Clock size={10} />
                          PROGRAMADO
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 bg-zinc-800 text-gray-400 border border-zinc-700">
                          FINALIZADO
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-gray-400 uppercase bg-ya-gray/40 px-2 py-0.5">
                        Juego: {drop.game_type}
                      </span>
                    </div>

                    <h3 className="text-lg font-black uppercase text-white mb-1">{drop.title}</h3>
                    {drop.description && (
                      <p className="text-xs text-gray-400 mb-2 max-w-xl">{drop.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        <span>Inicio: {formatMadridDate(drop.starts_at)}</span>
                      </span>
                      <span>•</span>
                      <span>Fin: {formatMadridDate(drop.ends_at)}</span>
                      <span>•</span>
                      <span>Validez: {drop.prize_validity_days} días</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      id={`btn-test-drop-${drop.id}`}
                      onClick={() => handleTestDrop(drop.id)}
                      disabled={testingLoadingId === drop.id}
                      className="flex items-center gap-1.5 px-3 py-2 border border-amber-400 bg-amber-400/10 text-amber-300 hover:bg-amber-400 hover:text-ya-black text-xs font-mono font-black uppercase transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                      title="Probar Drop en vivo (Modo Prueba de Admin)"
                    >
                      <Play size={14} className="fill-current" />
                      <span>{testingLoadingId === drop.id ? 'Cargando...' : 'PROBAR DROP'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(drop.id)}
                      className="flex items-center gap-1.5 px-3 py-2 border border-ya-lime/50 bg-ya-lime/10 text-ya-lime hover:bg-ya-lime hover:text-ya-black text-xs font-mono font-bold uppercase transition-colors"
                      title="Configurar Premios y Probabilidades del Drop"
                    >
                      <Percent size={14} />
                      <span className="hidden sm:inline">Probabilidades</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(drop.id)}
                      className="p-2.5 border border-ya-gray text-gray-300 hover:text-white hover:border-white transition-colors"
                      title="Editar Drop"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDrop(drop)}
                      className="p-2.5 border border-red-500/40 text-red-400 hover:text-red-300 hover:border-red-500 transition-colors"
                      title="Eliminar Drop"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </>
      )}

      {/* MODAL CREAR / EDITAR DROP */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-ya-black border-4 border-ya-gray max-w-2xl w-full p-6 my-8 text-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b-2 border-ya-gray pb-4 mb-6 gap-3">
              <div>
                <span className="text-[10px] font-mono text-ya-lime uppercase tracking-widest block">
                  {editingDropId ? 'EDITAR DROP' : 'PROGRAMAR NUEVO DROP'}
                </span>
                <h3 className="text-xl font-black uppercase">Configuración de Drop</h3>
              </div>
              <div className="flex items-center gap-2">
                {!editingDropId && (
                  <>
                    <button
                      type="button"
                      onClick={handleApplyJackpot8Preset}
                      className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-ya-lime text-ya-lime text-[11px] font-black uppercase tracking-wider transition"
                      title="Cargar preset con 8 premios equilibrados"
                    >
                      Preset Jackpot
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyScratchPreset}
                      className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-amber-400 text-amber-400 text-[11px] font-black uppercase tracking-wider transition"
                      title="Cargar preset Rasca y Gana (3 Categorías)"
                    >
                      Preset Rasca y Gana
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyCaraCruzPreset}
                      className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white text-white text-[11px] font-black uppercase tracking-wider transition"
                      title="Cargar preset Cara o Cruz (Drop 003: 10% Físico / 90% Consolación +2)"
                    >
                      Preset Cara o Cruz
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyTrilePreset}
                      className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-ya-lime text-ya-lime text-[11px] font-black uppercase tracking-wider transition"
                      title="Cargar preset El Trile (Drop 004: 10% Físico / 20% Dto / 70% Consolación +2)"
                    >
                      Preset El Trile
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAiModal(true)}
                      className="px-2.5 py-1.5 bg-ya-lime text-ya-black hover:bg-white text-[11px] font-black uppercase tracking-wider transition"
                      title="Pegar JSON creado por IA"
                    >
                      Importar JSON IA
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="p-2 text-gray-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {formError && (
              <div className="mb-4 p-3 border-2 border-red-500 bg-red-950/40 text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveDrop} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Nº de Drop
                  </label>
                  <input
                    type="number"
                    value={dropNumber}
                    onChange={(e) => setDropNumber(Number(e.target.value))}
                    required
                    min={1}
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-sm text-white font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Título del Drop
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="Ej. Drop #1 Semanal YA"
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1">
                  Descripción
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-sm text-white"
                  placeholder="Texto explicativo para los clientes..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Identificador de Juego (game_key)
                  </label>
                  <input
                    type="text"
                    value={gameType}
                    onChange={(e) => setGameType(e.target.value)}
                    placeholder="jackpot, coin_flip, mi_nuevo_juego..."
                    list="game-keys-datalist"
                    required
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-xs text-white font-mono"
                  />
                  <datalist id="game-keys-datalist">
                    <option value="trile">Drop 004 — El Trile (3 Cartas YA)</option>
                    <option value="cara_cruz">Drop 003 — El Cara o Cruz (Moneda YA)</option>
                    <option value="jackpot">Jackpot YA (Rodillos)</option>
                    <option value="scratch">Rascar Tarjeta (Rasca y Gana)</option>
                    <option value="coin_flip">Moneda YA (Cara o Cruz)</option>
                    <option value="mystery_box">Cajas Misteriosas (Paquetes)</option>
                    <option value="wheel">Ruleta Urbana</option>
                    <option value="pick_one">Elegir Carta</option>
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Disparador
                  </label>
                  <select
                    value={activationTrigger}
                    onChange={(e) => setActivationTrigger(e.target.value)}
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-xs text-white uppercase font-mono"
                  >
                    <option value="after_payment">Tras Pago (after_payment)</option>
                    <option value="after_delivery">Tras Entrega (after_delivery)</option>
                    <option value="free">Tirada Gratis (free)</option>
                    <option value="manual">Manual / Por Código (manual/code)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Estado Inicial
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-xs text-white uppercase font-mono"
                  >
                    <option value="scheduled">Programado</option>
                    <option value="active">Activo Ahora</option>
                    <option value="draft">Borrador</option>
                    <option value="finished">Finalizado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Fecha y Hora Inicio (España)
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
                    Fecha y Hora Fin (España)
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Validez del Premio (Días)
                  </label>
                  <input
                    type="number"
                    value={prizeValidityDays}
                    onChange={(e) => setPrizeValidityDays(Number(e.target.value))}
                    min={1}
                    required
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-sm text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">
                    Participaciones de Sorteo al Perder
                  </label>
                  <input
                    type="number"
                    value={consolationEntries}
                    onChange={(e) => setConsolationEntries(Number(e.target.value))}
                    min={1}
                    required
                    className="w-full bg-ya-gray/30 border border-ya-gray p-2 text-sm text-white font-mono"
                  />
                </div>
              </div>

              {/* SECCIÓN DE PREMIOS Y PROBABILIDADES CONFIGURABLES */}
              <div className="pt-4 border-t-2 border-ya-gray">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="text-sm font-black uppercase text-white flex items-center gap-1.5">
                      <Gift size={16} className="text-ya-lime" />
                      <span>Premios y Probabilidades del Jackpot</span>
                    </h4>
                    <p className="text-[11px] text-gray-400 font-mono">
                      Configura las probabilidades de cada premio directo. El sistema calcula la consolación automáticamente.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPrizes((prev) => [
                        ...prev,
                        {
                          name: 'Nuevo Premio',
                          description: '',
                          prize_type: 'percentage_discount',
                          prize_value: 10,
                          probability_pct: 5,
                          max_inventory: null,
                          validity_days: 7,
                          is_active: true,
                        },
                      ])
                    }
                    className="text-xs font-bold text-ya-lime hover:underline flex items-center gap-1 shrink-0"
                  >
                    + Añadir Premio
                  </button>
                </div>

                {/* Tarjeta de cálculo automático del Premio de Consolación */}
                <div className="mb-4 bg-ya-black border-2 border-ya-gray p-3.5 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-black uppercase tracking-wider text-gray-300">
                          PREMIO DE CONSOLACIÓN AUTOMÁTICO
                        </span>
                        <span className="text-[10px] font-mono bg-ya-gray/70 text-ya-lime px-1.5 py-0.5 uppercase">
                          +{consolationEntries} part. Sorteo Mensual
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                        Fórmula: 100% − suma de probabilidades directas ({totalProb.toFixed(1)}%)
                      </p>
                    </div>

                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <div className="text-[10px] font-mono text-gray-400 uppercase">Premios Directos</div>
                        <div
                          className={`text-sm font-black font-mono ${
                            totalProb > 100
                              ? 'text-red-400'
                              : totalProb === 100
                              ? 'text-ya-lime'
                              : 'text-amber-300'
                          }`}
                        >
                          {totalProb.toFixed(1)}%
                        </div>
                      </div>
                      <div className="border-l border-ya-gray pl-4">
                        <div className="text-[10px] font-mono text-gray-400 uppercase">Consolación (Auto)</div>
                        <div
                          className={`text-base font-black font-mono ${
                            totalProb > 100 ? 'text-red-400' : 'text-ya-lime'
                          }`}
                        >
                          {Math.max(0, 100 - totalProb).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Barra de distribución visual */}
                  <div className="w-full bg-ya-gray/50 h-2.5 flex overflow-hidden border border-ya-gray">
                    {prizes.map((p, idx) => {
                      const pct = Math.min(100, Math.max(0, Number(p.probability_pct || 0)));
                      if (pct <= 0) return null;
                      return (
                        <div
                          key={idx}
                          style={{ width: `${pct}%` }}
                          className={`h-full border-r border-ya-black transition-all ${
                            idx % 2 === 0 ? 'bg-amber-400' : 'bg-orange-400'
                          }`}
                          title={`${p.name}: ${pct}%`}
                        />
                      );
                    })}
                    {100 - totalProb > 0 && (
                      <div
                        style={{ width: `${Math.max(0, 100 - totalProb)}%` }}
                        className="h-full bg-ya-lime transition-all"
                        title={`Consolación Sorteo Mensual: ${(100 - totalProb).toFixed(1)}%`}
                      />
                    )}
                  </div>

                  {totalProb > 100 ? (
                    <div className="flex items-center gap-1.5 text-xs text-red-400 font-mono font-bold pt-1">
                      <AlertTriangle size={14} />
                      <span>
                        La suma de probabilidades ({totalProb.toFixed(1)}%) supera el 100%. Reduce algún porcentaje para poder guardar.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-mono pt-0.5">
                      <CheckCircle2 size={13} className="text-ya-lime" />
                      <span>
                        El {Math.max(0, 100 - totalProb).toFixed(1)}% restante se otorgará como Premio de Consolación en cada tirada.
                      </span>
                    </div>
                  )}
                </div>

                {/* Cabecera de columnas para los premios */}
                <div className="hidden lg:grid grid-cols-6 gap-2 text-[10px] font-mono text-gray-400 uppercase tracking-wider px-3 mb-1">
                  <div className="col-span-2">Nombre y Descripción</div>
                  <div className="col-span-2">Tipo y Valor</div>
                  <div>Probabilidad (%)</div>
                  <div>Límite Stock</div>
                </div>

                <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                  {prizes.map((p, pIdx) => (
                    <div
                      key={pIdx}
                      className="p-3 border border-ya-gray bg-ya-gray/20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 text-xs"
                    >
                      <div className="lg:col-span-2">
                        <input
                          type="text"
                          value={p.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPrizes((prev) =>
                              prev.map((item, idx) => (idx === pIdx ? { ...item, name: val } : item))
                            );
                          }}
                          placeholder="Nombre del premio"
                          className="w-full bg-ya-black border border-ya-gray p-1.5 text-xs text-white mb-1"
                        />
                        <input
                          type="text"
                          value={p.description}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPrizes((prev) =>
                              prev.map((item, idx) => (idx === pIdx ? { ...item, description: val } : item))
                            );
                          }}
                          placeholder="Descripción breve (opcional)"
                          className="w-full bg-ya-black border border-ya-gray p-1.5 text-xs text-white"
                        />
                      </div>

                      <div className="lg:col-span-2 space-y-1">
                        <select
                          value={p.prize_type}
                          onChange={(e) => {
                            const val = e.target.value as any;
                            setPrizes((prev) =>
                              prev.map((item, idx) => (idx === pIdx ? { ...item, prize_type: val } : item))
                            );
                          }}
                          className="w-full bg-ya-black border border-ya-gray p-1.5 text-xs text-white uppercase"
                        >
                          <option value="percentage_discount">Descuento %</option>
                          <option value="fixed_discount">Descuento Fijo €</option>
                          <option value="free_shipping">Envío Gratis</option>
                          <option value="free_order">Pedido Gratis</option>
                          <option value="product">Producto Gratis</option>
                          <option value="custom">Premio Especial (Custom)</option>
                        </select>
                        {['percentage_discount', 'fixed_discount'].includes(p.prize_type) && (
                          <input
                            type="number"
                            value={p.prize_value}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setPrizes((prev) =>
                                prev.map((item, idx) => (idx === pIdx ? { ...item, prize_value: val } : item))
                              );
                            }}
                            placeholder="Valor (€ o %)"
                            className="w-full bg-ya-black border border-ya-gray p-1.5 text-xs text-white font-mono"
                          />
                        )}
                      </div>

                      <div>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={p.probability_pct}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setPrizes((prev) =>
                                prev.map((item, idx) =>
                                  idx === pIdx ? { ...item, probability_pct: val } : item
                                )
                              );
                            }}
                            placeholder="Probabilidad %"
                            className="w-full bg-ya-black border border-ya-gray p-1.5 pr-6 text-xs text-white font-mono"
                          />
                          <span className="absolute right-2 top-1.5 text-xs text-gray-400 font-mono pointer-events-none">
                            %
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={p.max_inventory ?? ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : Number(e.target.value);
                            setPrizes((prev) =>
                              prev.map((item, idx) =>
                                idx === pIdx ? { ...item, max_inventory: val } : item
                              )
                            );
                          }}
                          placeholder="Límite stock"
                          className="w-full bg-ya-black border border-ya-gray p-1.5 text-xs text-white font-mono"
                        />
                        {prizes.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setPrizes((prev) => prev.filter((_, idx) => idx !== pIdx))}
                            className="p-1 text-red-400 hover:text-red-300"
                            title="Eliminar este premio"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t-2 border-ya-gray">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="py-2.5 px-4 border border-ya-gray text-gray-300 hover:text-white font-bold text-xs uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="py-2.5 px-6 bg-ya-lime text-ya-black font-black uppercase text-xs hover:bg-white transition-colors"
                >
                  {isSaving ? 'Guardando...' : editingDropId ? 'Actualizar Drop' : 'Programar Drop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL IMPORTAR JSON DE IA */}
      {showAiModal && (
        <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-zinc-950 border-2 border-ya-lime max-w-xl w-full p-6 text-white">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-black uppercase text-ya-lime">
                Importar Configuración Drop desde IA
              </h4>
              <button onClick={() => setShowAiModal(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Pega aquí el JSON generado por la IA (incluyendo title, game_key, activation_trigger y la lista de premios con sus probabilidades y tipos).
            </p>
            <textarea
              rows={9}
              value={aiJsonInput}
              onChange={(e) => setAiJsonInput(e.target.value)}
              placeholder={`{\n  "title": "Drop 002 — Jackpot Nocturno",\n  "game_key": "jackpot",\n  "activation_trigger": "after_payment",\n  "prizes": [\n    { "name": "50% Descuento", "prize_type": "percentage_discount", "prize_value": 50, "probability_pct": 1 },\n    { "name": "Envío Gratis", "prize_type": "free_shipping", "prize_value": 0, "probability_pct": 15 },\n    { "name": "Camiseta YA", "prize_type": "custom", "prize_value": 0, "probability_pct": 2 }\n  ]\n}`}
              className="w-full bg-black border border-ya-gray p-3 text-xs font-mono text-ya-lime"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="px-4 py-2 border border-ya-gray text-xs uppercase font-bold text-gray-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImportAiJson}
                className="px-4 py-2 bg-ya-lime text-ya-black text-xs uppercase font-black hover:bg-white"
              >
                Cargar en el Formulario
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE PRUEBA DE DROP (ADMIN - SIMULACIÓN EN VIVO) */}
      {testingDropPayload && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
          <DropGameEngine
            dropPayload={testingDropPayload}
            isTestMode={true}
            onClose={() => setTestingDropPayload(null)}
          />
        </div>
      )}
    </div>
  );
}
