import { euro, productById as fallbackProductById } from '../data/products';
import { QuantitySelector } from './components';
import { useCart } from './CartContext';
import { useCatalog } from './CatalogContext';
import type { CartLine } from '../types/app';
import { isRealImageUrl, formatImageUrl } from '../lib/cloudinary';

export function CartItem({ line }: { line: CartLine }) {
  const { increaseQuantity, decreaseQuantity, removeFromCart, pricing, activePacks } = useCart();
  const { getProductById } = useCatalog();

  const lineKey = line.lineId || (line.isPack ? line.packId || line.productId : line.productId);
  const detail = pricing.lines.find((l) => l.lineId === line.lineId || l.lineId === line.productId);

  // Si es un pack
  if (line.isPack) {
    const pack = activePacks.find((p) => p.id === line.packId || p.slug === line.productId);
    const packName = pack?.name || line.packName || 'Pack';
    const packImage = pack?.image || line.packImage || '📦';
    const isImg = isRealImageUrl(packImage);
    const unitPrice = detail ? detail.discountedUnitPrice : pack?.price || line.unitPrice || 0;
    const originalUnitPrice = detail ? detail.originalUnitPrice : pack?.reference_price || unitPrice;

    return (
      <article
        id={`cart-item-${lineKey}`}
        className="flex gap-3 bg-ya-gray p-3 border-2 border-ya-lime/40 hover:border-ya-lime transition-colors relative"
      >
        <div className="w-16 h-16 shrink-0 bg-ya-black border border-ya-gray grid place-items-center text-3xl overflow-hidden relative">
          {isImg ? (
            <img
              src={formatImageUrl(packImage, 150)}
              alt={packName}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span>{packImage}</span>
          )}
          <span className="absolute bottom-0 inset-x-0 bg-ya-lime text-ya-black text-[8px] font-black uppercase text-center tracking-wider">
            PACK
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="bg-ya-lime text-ya-black text-[9px] font-black uppercase px-1.5 py-0.5 tracking-wider">
              PACK
            </span>
            <h3 className="font-black truncate text-sm text-white">{packName}</h3>
          </div>

          {/* Selecciones de pack configurable */}
          {line.packSelections && line.packSelections.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {line.packSelections.map((sel, idx) => (
                <div key={idx} className="text-[11px] text-gray-300 font-mono truncate">
                  <span className="text-gray-400">{sel.groupName}:</span>{' '}
                  <span className="text-ya-lime font-bold">{sel.productName}</span>
                </div>
              ))}
            </div>
          )}

          {/* Precio y Descuento / Ahorro */}
          <div className="flex items-baseline gap-2 mt-1.5">
            <span className="font-black text-ya-lime text-base">{euro(unitPrice)}</span>
            {originalUnitPrice > unitPrice && (
              <span className="text-xs text-gray-400 line-through">
                {euro(originalUnitPrice)}
              </span>
            )}
            {detail?.discountReason && (
              <span className="text-[10px] font-bold text-black bg-ya-lime px-1 rounded-none">
                {detail.discountReason}
              </span>
            )}
          </div>

          <div className="flex justify-between items-center mt-2.5">
            <QuantitySelector
              quantity={line.quantity}
              onAdd={() => increaseQuantity(lineKey)}
              onRemove={() => decreaseQuantity(lineKey)}
            />
            <button
              id={`remove-${lineKey}`}
              type="button"
              onClick={() => removeFromCart(lineKey)}
              className="text-xs font-black text-gray-400 hover:text-rose-400 uppercase tracking-wider px-2 py-1"
            >
              Quitar
            </button>
          </div>
        </div>
      </article>
    );
  }

  // Si es un producto estándar
  const product = getProductById(line.productId) || fallbackProductById(line.productId);
  if (!product) return null;

  const isImg = isRealImageUrl(product.image);
  const unitPrice = detail ? detail.discountedUnitPrice : product.price;
  const originalUnitPrice = detail ? detail.originalUnitPrice : product.price;
  const hasDiscount = originalUnitPrice > unitPrice;

  const isOut = !product.inStock || (product.stockMode === 'in_stock' && (product.stockQuantity ?? 0) <= 0);
  const exceedsStock = product.stockMode === 'in_stock' && (product.stockQuantity ?? 0) < line.quantity;

  return (
    <article
      id={`cart-item-${product.id}`}
      className={`flex gap-3 p-3 border-2 transition-colors ${
        isOut || exceedsStock
          ? 'bg-red-950/20 border-red-500/60'
          : 'bg-ya-gray border-ya-gray hover:border-ya-lime'
      }`}
    >
      <div className="w-16 h-16 shrink-0 bg-ya-black border border-ya-gray grid place-items-center text-3xl overflow-hidden relative">
        {isImg ? (
          <img
            src={formatImageUrl(product.image, 150)}
            alt={product.name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span>{product.image}</span>
        )}
        {isOut && (
          <span className="absolute inset-x-0 bottom-0 bg-red-600 text-white text-[8px] font-black uppercase text-center tracking-wider">
            AGOTADO
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-black truncate text-sm text-white">{product.name}</h3>

        {(isOut || exceedsStock) && (
          <p className="text-[11px] font-bold text-red-400 mt-0.5 flex items-center gap-1">
            <span>⚠️</span>
            <span>
              {isOut
                ? 'Producto agotado. Quítalo para continuar.'
                : `Solo quedan ${product.stockQuantity} u. disponibles.`}
            </span>
          </p>
        )}

        <div className="flex items-baseline gap-2 mt-1">
          <span className="font-black text-ya-lime">{euro(unitPrice)}</span>
          {hasDiscount && (
            <span className="text-xs text-gray-400 line-through">
              {euro(originalUnitPrice)}
            </span>
          )}
          {detail?.discountReason && (
            <span className="text-[10px] font-bold text-black bg-ya-lime px-1">
              {detail.discountReason}
            </span>
          )}
        </div>

        <div className="flex justify-between items-center mt-2">
          <QuantitySelector
            quantity={line.quantity}
            max={product.stockMode === 'in_stock' ? product.stockQuantity : undefined}
            onAdd={() => increaseQuantity(lineKey)}
            onRemove={() => decreaseQuantity(lineKey)}
          />
          <button
            id={`remove-${product.id}`}
            type="button"
            onClick={() => removeFromCart(lineKey)}
            className="text-xs font-black text-gray-400 hover:text-rose-400 uppercase tracking-wider px-2 py-1"
          >
            Quitar
          </button>
        </div>
      </div>
    </article>
  );
}
