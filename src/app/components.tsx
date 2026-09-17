import { motion } from 'framer-motion';
import {
  ChevronLeft,
  Home,
  Search,
  ShoppingBag,
  UserRound,
  ClipboardList,
  Minus,
  Plus,
  MapPin,
  PackageOpen,
  Zap,
  Users,
  Gift,
} from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { euro } from '../data/products';
import type { OrderStatus, Product } from '../types/app';
import { useCart } from './CartContext';
import { useYaJuntos } from './YaJuntosContext';
import { useCatalog } from './CatalogContext';
import { NotificationBell } from '../components/notifications/NotificationComponents';
import { isRealImageUrl, formatImageUrl } from '../lib/cloudinary';
import { getProductDiscount } from '../lib/pricing';

export function AppHeader({ back }: { back?: boolean }) {
  const { count } = useCart();
  const { hasActiveGroup, activeCode } = useYaJuntos();
  return (
    <header id="app-header" className="sticky top-0 z-30 bg-ya-black border-b-2 border-ya-gray">
      <div className="max-w-5xl mx-auto h-16 px-3 sm:px-4 flex items-center justify-between gap-1.5 sm:gap-3">
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          {back && (
            <Link
              id="header-back-btn"
              aria-label="Volver"
              to="/app"
              className="p-1.5 sm:p-2 border-2 border-ya-gray hover:border-ya-lime transition-colors shrink-0"
            >
              <ChevronLeft size={18} className="sm:w-5 sm:h-5" />
            </Link>
          )}
          <Link
            to="/app"
            className="font-black text-3xl sm:text-4xl leading-none text-ya-lime tracking-tighter hover:opacity-90 transition-opacity shrink-0"
          >
            YA
          </Link>
          <span className="hidden lg:flex text-xs font-bold text-gray-300 items-center gap-1 shrink-0">
            <MapPin size={14} className="text-ya-lime" /> Jerez
          </span>
          <Link
            to="/app/ya-plus"
            id="header-ya-plus-link"
            className="flex items-center gap-1 border border-ya-lime sm:border-2 bg-ya-lime/10 px-2 sm:px-2.5 py-1 sm:py-1.5 font-mono text-[10px] sm:text-[11px] font-black text-ya-lime hover:bg-ya-lime hover:text-ya-black transition shrink-0 whitespace-nowrap"
          >
            <Zap size={12} className="sm:w-3.5 sm:h-3.5" />
            YA+
          </Link>
          <Link
            to={hasActiveGroup && activeCode ? `/app/juntos/${activeCode}` : '/app/juntos'}
            id="header-ya-juntos-link"
            className={`flex items-center gap-1 sm:border-2 px-2 sm:px-2.5 py-1 sm:py-1.5 font-mono text-[10px] sm:text-[11px] transition shrink-0 whitespace-nowrap ${
              hasActiveGroup
                ? 'border-2 border-ya-lime bg-ya-lime/20 text-ya-lime font-black'
                : 'border border-zinc-700 bg-zinc-900 font-bold text-zinc-300 hover:border-white hover:text-white'
            }`}
          >
            <Users size={12} className="sm:w-3.5 sm:h-3.5" />
            <span>{hasActiveGroup && activeCode ? `JUNTOS #${activeCode}` : 'YA Juntos'}</span>
            {hasActiveGroup && (
              <span className="h-1.5 w-1.5 rounded-full bg-ya-lime animate-pulse ml-0.5" />
            )}
          </Link>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <NotificationBell buttonId="customer-notification-bell" />
          <Link
            id="header-cart-btn"
            to="/app/carrito"
            aria-label="Abrir carrito"
            className="relative p-2 sm:p-2.5 border-2 border-ya-gray hover:border-ya-lime transition-colors"
          >
            <ShoppingBag size={18} className="sm:w-5 sm:h-5" />
            {count > 0 && (
              <span className="absolute -right-2 -top-2 min-w-5 h-5 px-1 text-center bg-ya-lime text-ya-black text-xs font-black leading-5">
                {count}
              </span>
            )}
          </Link>
          <Link
            id="header-profile-btn"
            to="/app/perfil"
            aria-label="Perfil"
            className="p-2 sm:p-2.5 border-2 border-ya-gray hover:border-ya-lime transition-colors"
          >
            <UserRound size={18} className="sm:w-5 sm:h-5" />
          </Link>
        </div>
      </div>
    </header>
  );
}


export function BottomNav() {
  const nav = [
    [Home, 'Inicio', '/app', 'bottom-nav-home'],
    [Search, 'Buscar', '/app/buscar', 'bottom-nav-search'],
    [ShoppingBag, 'Carrito', '/app/carrito', 'bottom-nav-cart'],
    [ClipboardList, 'Pedido', '/app/pedidos', 'bottom-nav-orders'],
    [Gift, 'Drops', '/app/drops', 'bottom-nav-drops'],
    [UserRound, 'Perfil', '/app/perfil', 'bottom-nav-profile'],
  ] as const;

  const { count } = useCart();

  return (
    <nav
      id="bottom-app-nav"
      className="fixed bottom-0 inset-x-0 z-40 bg-ya-black border-t-2 border-ya-gray pb-[env(safe-area-inset-bottom)]"
    >
      <div className="max-w-md mx-auto grid grid-cols-6">
        {nav.map(([Icon, label, to, elementId]) => (
          <NavLink
            id={elementId}
            end={to === '/app'}
            key={to}
            to={to}
            className={({ isActive }) =>
              'relative min-h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors ' +
              (isActive ? 'text-ya-lime bg-ya-gray' : 'text-gray-400 hover:text-white')
            }
          >
            <div className="relative">
              <Icon size={20} />
              {to === '/app/carrito' && count > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-ya-lime text-ya-black text-[10px] font-black leading-4 text-center">
                  {count}
                </span>
              )}
            </div>
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function QuantitySelector({
  quantity,
  onAdd,
  onRemove,
  max,
}: {
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
  max?: number;
}) {
  const isMaxReached = max !== undefined && quantity >= max;

  return (
    <div className="flex items-center border-2 border-ya-gray w-fit bg-ya-black">
      <button
        aria-label="Reducir cantidad"
        type="button"
        onClick={onRemove}
        className="p-2 hover:bg-ya-gray text-white transition-colors"
      >
        <Minus size={16} />
      </button>
      <span className="w-8 text-center font-black text-white text-sm">{quantity}</span>
      <button
        aria-label="Aumentar cantidad"
        type="button"
        disabled={isMaxReached}
        onClick={onAdd}
        title={isMaxReached ? `Stock máximo disponible: ${max} u.` : 'Aumentar cantidad'}
        className={`p-2 transition-colors ${
          isMaxReached
            ? 'bg-gray-700 text-gray-400 cursor-not-allowed opacity-50'
            : 'bg-ya-lime text-ya-black hover:bg-white'
        }`}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

export function ProductCard({ product }: { product: Product }) {
  const { lines, addToCart, increaseQuantity, decreaseQuantity, activeDiscounts } = useCart();
  const { categories } = useCatalog();
  const quantity = lines.find((line) => line.productId === product.id)?.quantity ?? 0;
  const category = categories.find((item) => item.slug === product.category);
  const isImg = isRealImageUrl(product.image);

  // Comprobar variantes
  const hasVariants = Boolean(product.hasVariants && product.variants && product.variants.length > 0);
  const activeVariants = product.variants?.filter((v) => v.active) || [];

  // Reutilizar exactamente el mismo motor de descuentos del carrito (getProductDiscount)
  let basePrice = Number(product.price);
  let discountedPrice = Number(product.price);
  let discountAmount = 0;
  let hasDiscount = false;
  let discountPercent = 0;

  if (hasVariants && activeVariants.length > 0) {
    const variantCalculations = activeVariants.map((v) => {
      const vBase = Number(v.price);
      const vDisc = getProductDiscount(product.id, category?.id, vBase, activeDiscounts);
      return {
        basePrice: vBase,
        discountedPrice: vDisc.discountedPrice,
        discountAmount: vDisc.discountAmount,
        hasDiscount: vDisc.discountAmount > 0,
      };
    });

    variantCalculations.sort((a, b) => a.discountedPrice - b.discountedPrice);
    const best = variantCalculations[0];
    basePrice = best.basePrice;
    discountedPrice = best.discountedPrice;
    discountAmount = best.discountAmount;
    hasDiscount = best.hasDiscount;
    if (hasDiscount && basePrice > 0) {
      discountPercent = Math.round((discountAmount / basePrice) * 100);
    }
  } else {
    const disc = getProductDiscount(product.id, category?.id, Number(product.price), activeDiscounts);
    basePrice = Number(product.price);
    discountedPrice = disc.discountedPrice;
    discountAmount = disc.discountAmount;
    hasDiscount = disc.discountAmount > 0;
    if (hasDiscount && basePrice > 0) {
      discountPercent = Math.round((discountAmount / basePrice) * 100);
    }
  }

  const isLowStock =
    product.inStock &&
    product.stockMode === 'in_stock' &&
    (product.stockQuantity ?? 0) <= (product.minStock ?? 5);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      id={`product-card-${product.slug || product.id}`}
      className="bg-ya-gray border-2 border-ya-gray hover:border-ya-lime flex flex-col justify-between transition-colors"
    >
      <Link to={'/app/producto/' + (product.slug || product.id)} className="block p-4 flex-1 group">
        <div className="h-36 sm:h-40 bg-zinc-950 border border-ya-gray flex items-center justify-center mb-3 relative overflow-hidden p-2.5">
          {isImg ? (
            <img
              src={formatImageUrl(product.image, 300)}
              alt={`${product.name} - YA Delivery Jerez`}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-contain object-center transition-transform duration-200 group-hover:scale-105"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-5xl">{product.image}</span>
          )}
          {hasDiscount && (
            <span className="absolute top-2 left-2 text-[10px] font-black uppercase tracking-wider text-ya-black bg-ya-lime px-2 py-0.5 border border-ya-lime shadow-sm z-10">
              -{discountPercent}%
            </span>
          )}
          {!product.inStock ? (
            <span className="absolute top-2 right-2 text-[9px] font-black uppercase tracking-wider text-red-400 bg-ya-black/90 px-2 py-0.5 border border-red-500/50 z-10">
              AGOTADO
            </span>
          ) : hasVariants ? (
            <span className="absolute top-2 right-2 text-[9px] font-black uppercase tracking-wider text-ya-lime bg-ya-black/90 px-1.5 py-0.5 border border-ya-lime/50 z-10">
              {activeVariants.length} {product.variantsTitle ? product.variantsTitle.toLowerCase() : 'opciones'}
            </span>
          ) : isLowStock ? (
            <span className="absolute top-2 right-2 text-[9px] font-black uppercase tracking-wider text-amber-400 bg-ya-black/90 px-1.5 py-0.5 border border-amber-500/50 z-10">
              Últimas {product.stockQuantity} u.
            </span>
          ) : (
            <span className="absolute top-2 right-2 text-[9px] font-black uppercase tracking-wider text-ya-lime bg-ya-black/80 px-1.5 py-0.5 border border-ya-lime/30 z-10">
              Stock
            </span>
          )}
        </div>
        <p className="text-[10px] uppercase tracking-widest text-ya-lime font-bold truncate">
          {category?.name ?? product.category}
        </p>
        <h3 className="font-black text-base leading-tight mt-1 min-h-10 line-clamp-2 text-white">
          {product.name}
        </h3>
        {hasDiscount ? (
          <div className="flex items-baseline gap-2 flex-wrap mt-2">
            <span className="font-black text-lg text-ya-lime">
              {hasVariants && <span className="text-xs text-gray-400 font-normal mr-1">Desde</span>}
              {euro(discountedPrice)}
            </span>
            <span className="text-xs text-gray-400 line-through font-bold">
              {euro(basePrice)}
            </span>
          </div>
        ) : (
          <p className="font-black text-lg mt-2 text-ya-white">
            {hasVariants ? (
              <span>
                <span className="text-xs text-gray-400 font-normal mr-1">Desde</span>
                {euro(basePrice)}
              </span>
            ) : (
              euro(product.price)
            )}
          </p>
        )}
      </Link>

      {!product.inStock ? (
        <button
          id={`sold-out-btn-${product.id}`}
          type="button"
          disabled
          className="m-4 mt-0 w-[calc(100%-2rem)] min-h-11 bg-ya-black border-2 border-red-500/40 text-red-400 font-black uppercase text-xs tracking-wider cursor-not-allowed opacity-80"
        >
          AGOTADO
        </button>
      ) : hasVariants ? (
        <Link
          id={`choose-option-btn-${product.id}`}
          to={'/app/producto/' + (product.slug || product.id)}
          className="m-4 mt-0 w-[calc(100%-2rem)] min-h-11 border-2 border-ya-lime bg-ya-lime/10 text-ya-lime hover:bg-ya-lime hover:text-ya-black font-black uppercase text-xs tracking-wider transition-colors flex items-center justify-center text-center px-2 py-1 leading-snug break-words"
        >
          Elegir {product.variantsTitle ? product.variantsTitle.toLowerCase() : 'opción'}
        </Link>
      ) : quantity ? (
        <div className="px-4 pb-4">
          <QuantitySelector
            quantity={quantity}
            max={product.stockMode === 'in_stock' ? product.stockQuantity : undefined}
            onAdd={() => increaseQuantity(product.id)}
            onRemove={() => decreaseQuantity(product.id)}
          />
        </div>
      ) : (
        <button
          id={`add-btn-${product.id}`}
          type="button"
          onClick={() => addToCart(product.id)}
          className="m-4 mt-0 w-[calc(100%-2rem)] min-h-11 bg-ya-lime text-ya-black font-black uppercase text-xs tracking-wider hover:bg-white transition-colors"
        >
          Añadir
        </button>
      )}
    </motion.article>
  );
}

export function CategoryCard({ slug }: { slug: string }) {
  const { categories } = useCatalog();
  const category = categories.find((item) => item.slug === slug);
  if (!category) return null;

  return (
    <Link
      id={`category-card-${category.slug}`}
      to={'/app/categoria/' + category.slug}
      className="bg-ya-gray border-2 border-ya-gray hover:border-ya-lime p-3.5 min-h-24 flex flex-col justify-between transition-colors group"
    >
      <span className="text-3xl group-hover:scale-110 transition-transform">{category.icon}</span>
      <span className="font-black text-xs uppercase tracking-tight text-white mt-2">
        {category.name}
      </span>
    </Link>
  );
}

const statusText: Record<OrderStatus, string> = {
  payment_pending: 'Pendiente de pago online',
  received: 'Pedido recibido',
  preparing: 'Preparando pedido',
  shopping: 'Comprando pedido',
  sourcing: 'Comprando pedido',
  ready: 'Pedido preparado',
  prepared: 'Pedido preparado',
  delivering: 'Ya estoy repartiendo',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

const statusDescriptions: Record<OrderStatus, string> = {
  payment_pending: 'Esperando confirmación del pago en PayPal Sandbox para iniciar la preparación.',
  received: 'Pago confirmado. Hemos recibido tu orden en Jerez de la Frontera.',
  preparing: 'Asignando repartidor y preparando los artículos.',
  shopping: 'Adquiriendo los artículos seleccionados.',
  sourcing: 'Adquiriendo los artículos en comercio de Jerez.',
  ready: 'Bolsa lista con bebidas frías y precintada.',
  prepared: 'Bolsa lista y precintada en punto de salida.',
  delivering: 'Tu repartidor YA va de camino a tu ubicación.',
  delivered: 'Pedido entregado en tu puerta. ¡Disfrútalo!',
  cancelled: 'El pedido ha sido cancelado.',
};

const statuses: OrderStatus[] = [
  'payment_pending',
  'received',
  'preparing',
  'shopping',
  'ready',
  'delivering',
  'delivered',
];

export function OrderTimeline({ status }: { status: OrderStatus }) {
  const activeIndex = statuses.indexOf(status);

  return (
    <ol className="space-y-4">
      {statuses.map((item, index) => {
        const isDone = index < activeIndex;
        const isCurrent = index === activeIndex;

        return (
          <li key={item} className="flex gap-4 items-start">
            <span
              className={
                'w-7 h-7 shrink-0 border-2 text-xs font-black grid place-items-center transition-colors ' +
                (isDone
                  ? 'bg-ya-lime text-ya-black border-ya-lime'
                  : isCurrent
                  ? 'border-ya-lime text-ya-lime bg-ya-black animate-pulse'
                  : 'border-ya-gray text-gray-500 bg-ya-gray/30')
              }
            >
              {isDone ? '✓' : isCurrent ? '●' : '○'}
            </span>
            <div className="flex-1">
              <p
                className={
                  'text-sm ' +
                  (isCurrent
                    ? 'font-black text-ya-lime'
                    : isDone
                    ? 'font-black text-white'
                    : 'font-bold text-gray-500')
                }
              >
                {statusText[item]}
              </p>
              {isCurrent && (
                <p className="text-xs text-gray-300 mt-0.5 font-medium">
                  {statusDescriptions[item]}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="border-2 border-dashed border-ya-gray p-8 text-center bg-ya-gray/20">
      <PackageOpen className="mx-auto text-ya-lime mb-3" size={38} />
      <h2 className="font-black text-2xl tracking-tight text-white">{title}</h2>
      <p className="text-gray-400 mt-2 text-sm font-medium max-w-md mx-auto">{text}</p>
    </div>
  );
}
