import { euro, productById } from '../data/products';
import { QuantitySelector } from './components';
import { useCart } from './CartContext';
import type { CartLine } from '../types/app';

export function CartItem({ line }: { line: CartLine }) {
  const { increaseQuantity, decreaseQuantity, removeFromCart } = useCart();
  const product = productById(line.productId);

  if (!product) return null;

  return (
    <article
      id={`cart-item-${product.id}`}
      className="flex gap-3 bg-ya-gray p-3 border-2 border-ya-gray hover:border-ya-lime transition-colors"
    >
      <div className="w-16 h-16 shrink-0 bg-ya-black border border-ya-gray grid place-items-center text-3xl">
        {product.image}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-black truncate">{product.name}</h3>
        <p className="font-bold text-ya-lime">{euro(product.price)}</p>
        <div className="flex justify-between items-center mt-2">
          <QuantitySelector
            quantity={line.quantity}
            onAdd={() => increaseQuantity(product.id)}
            onRemove={() => decreaseQuantity(product.id)}
          />
          <button
            id={`remove-${product.id}`}
            type="button"
            onClick={() => removeFromCart(product.id)}
            className="text-xs font-black text-gray-400 hover:text-white uppercase tracking-wider px-2 py-1"
          >
            Quitar
          </button>
        </div>
      </div>
    </article>
  );
}
