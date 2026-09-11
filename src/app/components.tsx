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
} from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { euro } from '../data/products';
import type { OrderStatus, Product } from '../types/app';
import { useCart } from './CartContext';
import { useCatalog } from './CatalogContext';

export function AppHeader({ back }: { back?: boolean }) {
  const { count } = useCart();
  return (
    <header id="app-header" className="sticky top-0 z-30 bg-ya-black border-b-2 border-ya-gray">
      <div className="max-w-5xl mx-auto h-16 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {back && (
            <Link
              id="header-back-btn"
              aria-label="Volver"
              to="/app"
              className="p-2 border-2 border-ya-gray hover:border-ya-lime transition-colors"
            >
              <ChevronLeft size={20} />
            </Link>
          )}
          <Link
            to="/app"
            className="font-black text-4xl leading-none text-ya-lime tracking-tighter hover:opacity-90 transition-opacity"
          >
            YA
          </Link>
          <span className="hidden sm:flex text-xs font-bold text-gray-300 items-center gap-1">
            <MapPin size={14} className="text-ya-lime" /> Jerez
          </span>
        </div>

        <div className="flex gap-2">
          <Link
            id="header-cart-btn"
            to="/app/carrito"
            aria-label="Abrir carrito"
            className="relative p-2.5 border-2 border-ya-gray hover:border-ya-lime transition-colors"
          >
            <ShoppingBag size={20} />
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
            className="p-2.5 border-2 border-ya-gray hover:border-ya-lime transition-colors"
          >
            <UserRound size={20} />
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
    [ClipboardList, 'Pedidos', '/app/pedidos', 'bottom-nav-orders'],
    [UserRound, 'Perfil', '/app/perfil', 'bottom-nav-profile'],
  ] as const;

  const { count } = useCart();

  return (
    <nav
      id="bottom-app-nav"
      className="fixed bottom-0 inset-x-0 z-40 bg-ya-black border-t-2 border-ya-gray pb-[env(safe-area-inset-bottom)]"
    >
      <div className="max-w-md mx-auto grid grid-cols-5">
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
  const { lines, addToCart, increaseQuantity, decreaseQuantity } = useCart();
  const { categories } = useCatalog();
  const quantity = lines.find((line) => line.productId === product.id)?.quantity ?? 0;
  const category = categories.find((item) => item.slug === product.category);
  const isImageEmoji = !product.image.startsWith('http') && !product.image.startsWith('/');

  const isLowStock =
    product.inStock &&
    product.stockMode === 'in_stock' &&
    (product.stockQuantity ?? 0) <= (product.minStock ?? 5);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      id={`product-card-${product.id}`}
      className="bg-ya-gray border-2 border-ya-gray hover:border-ya-lime flex flex-col justify-between transition-colors"
    >
      <Link to={'/app/producto/' + product.id} className="block p-4 flex-1">
        <div className="h-28 bg-ya-black border border-ya-gray flex items-center justify-center text-5xl mb-3 relative overflow-hidden">
          {isImageEmoji ? (
            <span>{product.image}</span>
          ) : (
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          )}
          {!product.inStock ? (
            <span className="absolute top-2 right-2 text-[9px] font-black uppercase tracking-wider text-red-400 bg-ya-black/90 px-2 py-0.5 border border-red-500/50">
              AGOTADO
            </span>
          ) : isLowStock ? (
            <span className="absolute top-2 right-2 text-[9px] font-black uppercase tracking-wider text-amber-400 bg-ya-black/90 px-1.5 py-0.5 border border-amber-500/50">
              Últimas {product.stockQuantity} u.
            </span>
          ) : (
            <span className="absolute top-2 right-2 text-[9px] font-black uppercase tracking-wider text-ya-lime bg-ya-black/80 px-1.5 py-0.5 border border-ya-lime/30">
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
        <p className="font-black text-lg mt-2 text-ya-white">{euro(product.price)}</p>
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
