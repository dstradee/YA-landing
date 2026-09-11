import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Users,
  Plus,
  Copy,
  Check,
  Share2,
  Lock,
  CreditCard,
  Trash2,
  Loader2,
  AlertCircle,
  Sparkles,
  ShoppingBag,
  Info,
} from 'lucide-react';
import { AppHeader } from './components';
import { useAuth } from '../lib/auth';
import { products, euro } from '../data/products';
import {
  createYaJuntosGroup,
  fetchYaJuntosGroupByCode,
  joinYaJuntosGroup,
  addItemToYaJuntos,
  removeItemFromYaJuntos,
  confirmYaJuntosOrder,
  simulateJuntosLocalPayment,
} from '../lib/yaJuntos';
import type {
  YaJuntosGroupWithDetails,
  YaJuntosPaymentMode,
  Product,
} from '../types/app';

export default function YaJuntosPage() {
  const { code: routeCode } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // State for hub (no code)
  const [createTitle, setCreateTitle] = useState('');
  const [createMode, setCreateMode] = useState<YaJuntosPaymentMode>('split_by_items');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [hubError, setHubError] = useState<string | null>(null);

  // State for active group view (with code)
  const [group, setGroup] = useState<YaJuntosGroupWithDetails | null>(null);
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Product quick-add picker
  const [productSearch, setProductSearch] = useState('');
  const [addingProduct, setAddingProduct] = useState(false);

  // Order confirmation & address modal
  const [confirmingOrder, setConfirmingOrder] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [deliveryStreet, setDeliveryStreet] = useState('Calle Larga 12');
  const [deliveryPhone, setDeliveryPhone] = useState('600 123 456');
  const [orderNotes, setOrderNotes] = useState('');

  // Payment simulation
  const [paying, setPaying] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);

  // Load group if code in URL
  const loadGroup = useCallback(async (codeToLoad: string) => {
    try {
      setLoadingGroup(true);
      setGroupError(null);
      const res = await fetchYaJuntosGroupByCode(codeToLoad, user?.id);
      if (res.error || !res.group) {
        setGroupError(res.error || 'Grupo no encontrado.');
        setGroup(null);
      } else {
        setGroup(res.group);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar el grupo.';
      setGroupError(msg);
    } finally {
      setLoadingGroup(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (routeCode) {
      loadGroup(routeCode);
    } else {
      setGroup(null);
    }
  }, [routeCode, loadGroup]);

  // Handle create
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim()) return;

    try {
      setCreating(true);
      setHubError(null);
      const res = await createYaJuntosGroup({
        title: createTitle,
        paymentMode: createMode,
        user: user ? { id: user.id, name: user.email?.split('@')[0] || 'Organizador' } : null,
      });

      if (!res.success || !res.group) {
        setHubError(res.error || 'No se pudo crear el grupo.');
      } else {
        navigate(`/app/juntos/${res.group.code}`);
      }
    } catch {
      setHubError('Error inesperado al crear el grupo.');
    } finally {
      setCreating(false);
    }
  };

  // Handle join
  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = joinCodeInput.trim().toUpperCase();
    if (clean.length !== 6) {
      setHubError('El código de grupo debe tener exactamente 6 caracteres.');
      return;
    }

    try {
      setJoining(true);
      setHubError(null);
      const res = await joinYaJuntosGroup({
        code: clean,
        user: user ? { id: user.id, name: user.email?.split('@')[0] || 'Amigo' } : null,
      });

      if (!res.success || !res.group) {
        setHubError(res.error || 'No se pudo unir al grupo.');
      } else {
        navigate(`/app/juntos/${res.group.code}`);
      }
    } catch {
      setHubError('Error al unirse al grupo.');
    } finally {
      setJoining(false);
    }
  };

  // Copy share link
  const handleCopyLink = () => {
    if (!group) return;
    const shareUrl = `${window.location.origin}/app/juntos/${group.code}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  // WhatsApp share
  const handleShareWhatsapp = () => {
    if (!group) return;
    const shareUrl = `${window.location.origin}/app/juntos/${group.code}`;
    const text = `¡Únete a mi pedido compartido en YA Delivery! Añade lo que quieras y dividimos la cuenta: ${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  // Add product to group
  const handleAddProduct = async (product: Product) => {
    if (!group || group.status !== 'open') return;

    try {
      setAddingProduct(true);
      const res = await addItemToYaJuntos({
        groupId: group.id,
        code: group.code,
        productId: product.id,
        quantity: 1,
        user: user ? { id: user.id, name: user.email?.split('@')[0] || 'Tú' } : null,
      });

      if (res.success) {
        await loadGroup(group.code);
      }
    } finally {
      setAddingProduct(false);
    }
  };

  // Remove item
  const handleRemoveItem = async (itemId: string) => {
    if (!group || group.status !== 'open') return;
    const res = await removeItemFromYaJuntos({ itemId, code: group.code });
    if (res.success) {
      await loadGroup(group.code);
    }
  };

  // Confirm order and start payment
  const handleConfirmOrderAndStartPayment = async () => {
    if (!group) return;

    try {
      setConfirmingOrder(true);
      setGroupError(null);
      const res = await confirmYaJuntosOrder({
        groupId: group.id,
        code: group.code,
        addressId: 'mock-address-jerez',
        notes: `${deliveryStreet} - Tel: ${deliveryPhone} ${orderNotes ? `(${orderNotes})` : ''}`,
      });

      if (!res.success) {
        setGroupError(res.error || 'No se pudo iniciar el cobro.');
      } else {
        setShowAddressModal(false);
        await loadGroup(group.code);
      }
    } catch {
      setGroupError('Error al cerrar el pedido.');
    } finally {
      setConfirmingOrder(false);
    }
  };

  // Pay individual share or full payment
  const handlePay = async (isFullPayment = false) => {
    if (!group) return;

    try {
      setPaying(true);
      const myPart = group.current_user_participant;
      const res = await simulateJuntosLocalPayment({
        code: group.code,
        participantId: myPart ? myPart.id : undefined,
        isFullPayment,
      });

      if (res.success) {
        setPaymentSuccess('¡Pago confirmado con éxito!');
        await loadGroup(group.code);
      }
    } finally {
      setPaying(false);
    }
  };

  // Filtered products for quick picker
  const filteredProducts = products.filter((p) => {
    return (
      !productSearch ||
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.category.toLowerCase().includes(productSearch.toLowerCase())
    );
  });

  // ==============================================================================
  // VIEW 1: ACTIVE GROUP DASHBOARD (/app/juntos/:code)
  // ==============================================================================
  if (routeCode) {
    if (loadingGroup) {
      return (
        <div className="min-h-screen bg-ya-black text-white">
          <AppHeader back />
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-ya-lime" />
            <p className="mt-3 font-mono text-xs text-zinc-400">Cargando grupo compartido...</p>
          </div>
        </div>
      );
    }

    if (!group) {
      return (
        <div className="min-h-screen bg-ya-black text-white">
          <AppHeader back />
          <div className="mx-auto max-w-md p-6 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
            <h2 className="mt-4 text-xl font-black uppercase">GRUPO NO ENCONTRADO</h2>
            <p className="mt-2 text-xs text-zinc-400">{groupError || 'El código introducido no existe o ha caducado.'}</p>
            <Link
              to="/app/juntos"
              className="mt-6 inline-block border-2 border-ya-lime bg-ya-lime px-6 py-2.5 font-mono text-xs font-black text-ya-black uppercase"
            >
              VOLVER A YA JUNTOS
            </Link>
          </div>
        </div>
      );
    }

    const myPart = group.current_user_participant;
    const isPaid = myPart ? myPart.payment_status === 'paid' : false;
    const progressPercent = group.total > 0 ? Math.min(100, Math.round((group.amount_paid / group.total) * 100)) : 0;

    return (
      <div className="min-h-screen bg-ya-black pb-28 text-white">
        <AppHeader back />

        {/* Group Banner Header */}
        <div className="border-b-4 border-ya-lime bg-zinc-950 p-4 sm:p-6">
          <div className="mx-auto max-w-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-ya-lime px-2 py-0.5 font-mono text-[10px] font-black text-ya-black uppercase">
                    CÓDIGO: {group.code}
                  </span>
                  <span
                    className={`px-2 py-0.5 font-mono text-[10px] font-black uppercase ${
                      group.status === 'open'
                        ? 'border border-blue-400 text-blue-400'
                        : group.status === 'payment_pending'
                        ? 'border border-amber-400 text-amber-400'
                        : 'border border-ya-lime bg-ya-lime/20 text-ya-lime'
                    }`}
                  >
                    {group.status === 'open'
                      ? 'CARRITO ABIERTO'
                      : group.status === 'payment_pending'
                      ? 'PAGOS EN CURSO'
                      : '¡PEDIDO PAGADO!'}
                  </span>
                </div>
                <h1 className="mt-2 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
                  {group.title}
                </h1>
                <p className="mt-1 font-mono text-xs text-zinc-400">
                  Modo de reparto:{' '}
                  <span className="text-ya-lime">
                    {group.payment_mode === 'split_by_items'
                      ? 'Cada uno paga lo que pide + envío compartido'
                      : group.payment_mode === 'split_equal'
                      ? 'Partes iguales entre todos'
                      : 'Un pagador único'}
                  </span>
                </p>
              </div>

              {/* Share actions */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs font-bold text-white hover:border-ya-lime cursor-pointer"
                >
                  {copiedCode ? <Check className="h-3.5 w-3.5 text-ya-lime" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedCode ? '¡COPIADO!' : 'COPIAR ENLACE'}
                </button>
                <button
                  type="button"
                  onClick={handleShareWhatsapp}
                  className="flex items-center gap-1.5 border-2 border-emerald-500 bg-emerald-600 px-3 py-2 font-mono text-xs font-black text-white hover:bg-emerald-500 cursor-pointer"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  WHATSAPP
                </button>
              </div>
            </div>

            {/* Payment Progress Bar if in payment mode */}
            {group.status === 'payment_pending' && (
              <div className="mt-5 border-2 border-amber-500/50 bg-amber-950/20 p-4">
                <div className="flex items-center justify-between text-xs font-mono mb-2">
                  <span className="text-amber-300 font-bold">PROGRESO DE PAGO DEL GRUPO:</span>
                  <span className="text-white font-black">
                    {euro(group.amount_paid)} de {euro(group.total)} ({progressPercent}%)
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden bg-zinc-800 border border-zinc-700">
                  <div
                    className="h-full bg-ya-lime transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Success Banner if fully paid */}
            {group.status === 'fully_paid' && (
              <div className="mt-5 border-2 border-ya-lime bg-ya-lime/20 p-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-6 w-6 text-ya-lime shrink-0" />
                  <div>
                    <h3 className="font-black text-white uppercase text-sm">¡PAGO COMPLETADO AL 100%!</h3>
                    <p className="text-xs text-zinc-200">
                      Todos los participantes han abonado su parte. El pedido ha sido confirmado con el número{' '}
                      <span className="font-mono font-bold text-ya-lime">{group.order_number || group.order_id}</span> y está en camino a preparación.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mx-auto max-w-2xl px-4 py-6 space-y-8">
          {paymentSuccess && (
            <div className="flex items-center gap-2 border-2 border-ya-lime bg-ya-lime/10 p-3 text-xs font-bold text-ya-lime">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span>{paymentSuccess}</span>
            </div>
          )}
          {/* PARTICIPANTS & TRICOUNT SPLIT TABLE */}
          <div className="border-2 border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <h2 className="flex items-center gap-2 font-mono text-xs font-black tracking-wider text-zinc-300 uppercase">
                <Users className="h-4 w-4 text-ya-lime" />
                PARTICIPANTES ({group.participants.length})
              </h2>
              <span className="font-mono text-[10px] text-zinc-500">REPARTO TRICOUNT</span>
            </div>

            <div className="space-y-3">
              {group.participants.map((p) => {
                const isMe = user?.id === p.user_id;
                const itemsOfParticipant = group.items.filter((i) => i.added_by_user_id === p.user_id);

                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between border p-3 ${
                      isMe ? 'border-ya-lime/60 bg-zinc-900' : 'border-zinc-800/80 bg-zinc-900/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 font-mono text-xs font-black text-ya-lime border border-zinc-700">
                        {p.display_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">
                            {p.display_name} {isMe && <span className="text-ya-lime text-xs font-mono">(Tú)</span>}
                          </span>
                          {p.role === 'creator' && (
                            <span className="bg-zinc-800 px-1.5 py-0.2 font-mono text-[9px] text-zinc-300">
                              ORGANIZADOR
                            </span>
                          )}
                        </div>
                        <p className="font-mono text-[11px] text-zinc-400">
                          {itemsOfParticipant.length} {itemsOfParticipant.length === 1 ? 'producto' : 'productos'} añadidos
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono text-sm font-black text-white">{euro(p.allocated_amount)}</div>
                      <span
                        className={`inline-block px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase ${
                          p.payment_status === 'paid' ? 'bg-ya-lime text-ya-black' : 'text-zinc-400'
                        }`}
                      >
                        {p.payment_status === 'paid' ? 'PAGADO' : 'PENDIENTE'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total balance row */}
            <div className="mt-4 border-t border-zinc-800 pt-3 flex justify-between items-baseline font-mono">
              <span className="text-xs text-zinc-400">TOTAL PEDIDO:</span>
              <div className="text-right">
                <span className="text-lg font-black text-ya-lime">{euro(group.total)}</span>
                <span className="block text-[10px] text-zinc-500">
                  (Productos: {euro(group.subtotal)} + Envío: {euro(group.delivery_fee)})
                </span>
              </div>
            </div>
          </div>

          {/* ACTIVE PAYMENT ACTION CALLOUT (IF IN PAYMENT_PENDING) */}
          {group.status === 'payment_pending' && !isPaid && myPart && (
            <div className="border-4 border-ya-lime bg-zinc-900 p-5 shadow-[6px_6px_0px_0px_#B6FF00]">
              <div className="flex items-start justify-between">
                <div>
                  <span className="bg-ya-lime px-2 py-0.5 font-mono text-[10px] font-black text-ya-black uppercase">
                    TU TURNO DE PAGO
                  </span>
                  <h3 className="mt-2 text-xl font-black text-white uppercase">
                    PAGAR TU PARTE: {euro(myPart.allocated_amount)}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-300">
                    Paga de forma individual y segura tu porción del pedido.
                  </p>
                </div>
                <CreditCard className="h-8 w-8 text-ya-lime" />
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => handlePay(false)}
                  disabled={paying}
                  className="w-full flex items-center justify-center gap-2 border-2 border-ya-lime bg-ya-lime py-3.5 font-mono text-sm font-black text-ya-black uppercase transition hover:bg-white hover:border-white disabled:opacity-50 cursor-pointer"
                >
                  {paying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      PROCESANDO PAGO...
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      CONFIRMAR Y PAGAR MI PARTE ({euro(myPart.allocated_amount)})
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* GROUP ITEMS LIST */}
          <div className="border-2 border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <h2 className="flex items-center gap-2 font-mono text-xs font-black tracking-wider text-zinc-300 uppercase">
                <ShoppingBag className="h-4 w-4 text-ya-lime" />
                CARRITO DEL GRUPO ({group.items.length})
              </h2>
            </div>

            {group.items.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400 font-mono">
                Todavía nadie ha añadido productos al carrito compartido.
                <br />
                ¡Sé el primero con el buscador inferior!
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/80">
                {group.items.map((item) => {
                  const canRemove = group.status === 'open' && (group.is_creator || item.added_by_user_id === user?.id);

                  return (
                    <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-zinc-900 text-lg border border-zinc-800">
                          {item.product_image || '🛒'}
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-sm">{item.product_name}</h4>
                          <p className="font-mono text-[11px] text-zinc-400">
                            {item.quantity} x {euro(item.unit_price)} · Añadido por{' '}
                            <span className="text-zinc-200 font-bold">{item.added_by_name}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-black text-white">{euro(item.line_subtotal)}</span>
                        {canRemove && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-zinc-500 hover:text-red-400 p-1"
                            title="Eliminar del grupo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ORGANIZER CLOSE CART ACTION */}
            {group.status === 'open' && (
              <div className="mt-6 border-t border-zinc-800 pt-4">
                {group.is_creator ? (
                  <button
                    type="button"
                    onClick={() => setShowAddressModal(true)}
                    disabled={group.items.length === 0}
                    className="w-full flex items-center justify-center gap-2 border-2 border-ya-lime bg-ya-lime py-3.5 font-mono text-sm font-black text-ya-black uppercase transition hover:bg-white hover:border-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Lock className="h-4 w-4" />
                    CERRAR CARRITO E INICIAR COBROS
                  </button>
                ) : (
                  <div className="flex items-center gap-2 border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-400">
                    <Info className="h-4 w-4 text-ya-lime shrink-0" />
                    <span>Cuando todos terminéis de añadir cosas, el organizador cerrará el carrito para pagar.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* QUICK ADD CATALOG PICKER (ONLY IF STATUS === OPEN) */}
          {group.status === 'open' && (
            <div className="border-2 border-zinc-800 bg-zinc-950 p-5">
              <h3 className="font-mono text-xs font-black tracking-wider text-zinc-300 uppercase mb-3">
                AÑADIR PRODUCTO AL GRUPO
              </h3>

              <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  placeholder="Buscar pizzas, bebidas, hielo, snacks..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full border-2 border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-ya-lime focus:outline-none"
                />
              </div>

              <div className="grid gap-2 max-h-80 overflow-y-auto pr-1">
                {filteredProducts.slice(0, 10).map((prod) => (
                  <div
                    key={prod.id}
                    className="flex items-center justify-between border border-zinc-800/80 bg-zinc-900/60 p-2.5 hover:border-zinc-600"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{prod.image}</span>
                      <div>
                        <h4 className="text-xs font-bold text-white">{prod.name}</h4>
                        <span className="font-mono text-[11px] text-ya-lime font-bold">{euro(prod.price)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddProduct(prod)}
                      disabled={addingProduct}
                      className="flex items-center gap-1 border border-ya-lime bg-ya-lime/10 px-2.5 py-1.5 font-mono text-[10px] font-black text-ya-lime hover:bg-ya-lime hover:text-ya-black cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" />
                      AÑADIR
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* MODAL: SELECT ADDRESS & CONFIRM FOR ORGANIZER */}
        {showAddressModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md border-4 border-ya-lime bg-zinc-900 p-6 shadow-[8px_8px_0px_0px_#B6FF00]">
              <h3 className="text-lg font-black text-white uppercase">CERRAR CARRITO DE GRUPO</h3>
              <p className="mt-1 text-xs text-zinc-300">
                Indica la dirección de entrega en Jerez donde se llevará el pedido conjunto.
              </p>

              <div className="mt-4 space-y-3 font-mono text-xs">
                <div>
                  <label className="text-zinc-400 block mb-1">DIRECCIÓN DE ENTREGA (JEREZ):</label>
                  <input
                    type="text"
                    value={deliveryStreet}
                    onChange={(e) => setDeliveryStreet(e.target.value)}
                    className="w-full border-2 border-zinc-700 bg-zinc-950 p-2 text-white focus:border-ya-lime focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">TELÉFONO DE CONTACTO:</label>
                  <input
                    type="text"
                    value={deliveryPhone}
                    onChange={(e) => setDeliveryPhone(e.target.value)}
                    className="w-full border-2 border-zinc-700 bg-zinc-950 p-2 text-white focus:border-ya-lime focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">NOTAS PARA EL REPARTIDOR (OPCIONAL):</label>
                  <input
                    type="text"
                    placeholder="Piso, timbre, etc."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    className="w-full border-2 border-zinc-700 bg-zinc-950 p-2 text-white focus:border-ya-lime focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setShowAddressModal(false)}
                  className="border border-zinc-600 bg-zinc-800 px-4 py-2 text-white hover:bg-zinc-700"
                >
                  CANCELAR
                </button>
                <button
                  type="button"
                  onClick={handleConfirmOrderAndStartPayment}
                  disabled={confirmingOrder}
                  className="border-2 border-ya-lime bg-ya-lime px-4 py-2 font-black text-ya-black hover:bg-white disabled:opacity-50"
                >
                  {confirmingOrder ? 'CERRANDO...' : 'INICIAR COBROS'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==============================================================================
  // VIEW 2: HUB - CREAR O UNIRSE (/app/juntos)
  // ==============================================================================
  return (
    <div className="min-h-screen bg-ya-black pb-28 text-white">
      <AppHeader back />

      {/* Hero */}
      <div className="relative overflow-hidden border-b-4 border-ya-lime bg-zinc-950 px-4 pt-6 pb-8 sm:px-6">
        <div className="mx-auto max-w-xl text-center">
          <div className="inline-flex items-center gap-2 border-2 border-ya-lime bg-ya-lime/10 px-3 py-1 font-mono text-xs font-black tracking-widest text-ya-lime uppercase">
            <Users className="h-4 w-4" />
            PEDIDOS COMPARTIDOS TIPO TRICOUNT
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tighter uppercase sm:text-4xl">
            PIDE CON TUS AMIGOS. <br />
            <span className="text-ya-lime">CADA UNO PAGA LO SUYO.</span>
          </h1>
          <p className="mt-3 text-xs text-zinc-300 sm:text-sm font-medium">
            Crea un grupo, comparte el enlace por WhatsApp, añadid lo que queráis al mismo carrito y dividid los gastos al céntimo.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 space-y-8">
        {hubError && (
          <div className="flex items-center gap-3 border-2 border-red-500 bg-red-950/40 p-4 text-sm text-red-200">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
            <p className="font-medium">{hubError}</p>
          </div>
        )}

        {/* 1. CREAR GRUPO */}
        <div className="border-3 border-ya-lime bg-zinc-950 p-6 shadow-[6px_6px_0px_0px_#B6FF00]">
          <h2 className="text-xl font-black uppercase text-white">CREAR UN NUEVO GRUPO</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Tú serás el organizador. Elige el nombre y cómo se dividirá la cuenta.
          </p>

          <form onSubmit={handleCreateGroup} className="mt-5 space-y-4">
            <div>
              <label className="block font-mono text-xs font-bold text-zinc-300 mb-1">
                NOMBRE DEL PEDIDO:
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Cena del viernes, Partido en casa de David..."
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                className="w-full border-2 border-zinc-700 bg-zinc-900 p-3 text-sm text-white placeholder-zinc-500 focus:border-ya-lime focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-mono text-xs font-bold text-zinc-300 mb-2">
                MODO DE PAGO:
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label
                  className={`cursor-pointer border-2 p-3 text-xs flex flex-col justify-between ${
                    createMode === 'split_by_items'
                      ? 'border-ya-lime bg-zinc-900 text-white'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value="split_by_items"
                    checked={createMode === 'split_by_items'}
                    onChange={() => setCreateMode('split_by_items')}
                    className="sr-only"
                  />
                  <span className="font-bold text-white block mb-1">TIPO TRICOUNT</span>
                  <span className="text-[11px] leading-tight">Cada uno paga sus productos + envío equitativo.</span>
                </label>

                <label
                  className={`cursor-pointer border-2 p-3 text-xs flex flex-col justify-between ${
                    createMode === 'split_equal'
                      ? 'border-ya-lime bg-zinc-900 text-white'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value="split_equal"
                    checked={createMode === 'split_equal'}
                    onChange={() => setCreateMode('split_equal')}
                    className="sr-only"
                  />
                  <span className="font-bold text-white block mb-1">A PARTES IGUALES</span>
                  <span className="text-[11px] leading-tight">El total se divide equitativamente entre todos.</span>
                </label>

                <label
                  className={`cursor-pointer border-2 p-3 text-xs flex flex-col justify-between ${
                    createMode === 'single_payer'
                      ? 'border-ya-lime bg-zinc-900 text-white'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value="single_payer"
                    checked={createMode === 'single_payer'}
                    onChange={() => setCreateMode('single_payer')}
                    className="sr-only"
                  />
                  <span className="font-bold text-white block mb-1">PAGO ÚNICO</span>
                  <span className="text-[11px] leading-tight">Todos eligen pero tú abonas el total.</span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={creating || !createTitle.trim()}
              className="w-full flex items-center justify-center gap-2 border-2 border-ya-lime bg-ya-lime py-3.5 font-mono text-sm font-black text-ya-black uppercase transition hover:bg-white hover:border-white disabled:opacity-50 cursor-pointer"
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  GENERANDO GRUPO...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4" />
                  CREAR GRUPO Y OBTENER ENLACE
                </>
              )}
            </button>
          </form>
        </div>

        {/* 2. UNIRSE CON CÓDIGO */}
        <div className="border-2 border-zinc-800 bg-zinc-950 p-6">
          <h2 className="text-lg font-black uppercase text-white">¿TIENES UN CÓDIGO DE GRUPO?</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Introduce el código de 6 caracteres que te ha pasado tu amigo por WhatsApp.
          </p>

          <form onSubmit={handleJoinGroup} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              maxLength={6}
              placeholder="Ej: ABC123"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              className="flex-1 border-2 border-zinc-700 bg-zinc-900 p-3 font-mono text-center text-lg font-black tracking-widest text-white uppercase placeholder-zinc-600 focus:border-ya-lime focus:outline-none"
            />
            <button
              type="submit"
              disabled={joining || joinCodeInput.trim().length !== 6}
              className="border-2 border-zinc-600 bg-zinc-800 px-6 py-3 font-mono text-xs font-black text-white uppercase transition hover:border-ya-lime hover:bg-ya-lime hover:text-ya-black disabled:opacity-50 cursor-pointer"
            >
              {joining ? 'UNIÉNDOSE...' : 'UNIRSE AL GRUPO'}
            </button>
          </form>
        </div>

        {/* 3. CÓMO FUNCIONA */}
        <div className="border border-zinc-800 bg-zinc-950/40 p-6">
          <h3 className="font-mono text-xs font-black tracking-wider text-zinc-400 uppercase mb-4">
            ¿CÓMO FUNCIONA YA JUNTOS?
          </h3>
          <div className="grid gap-4 sm:grid-cols-3 text-xs text-zinc-400">
            <div>
              <span className="font-black text-ya-lime font-mono text-sm block mb-1">01. CREA Y COMPARTE</span>
              Genera tu grupo en 5 segundos y pasa el link al chat de tus amigos.
            </div>
            <div>
              <span className="font-black text-ya-lime font-mono text-sm block mb-1">02. AÑADID AL CARRITO</span>
              Cada uno mete sus pizzas, bebidas o packs directamente en la misma cesta.
            </div>
            <div>
              <span className="font-black text-ya-lime font-mono text-sm block mb-1">03. PAGO INDIVIDUAL</span>
              El sistema calcula la parte exacta de cada uno al céntimo y permite pagar por separado.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
