import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { productById } from '../data/products';
import type { CartLine, LocalOrder } from '../types/app';

type CartApi = {
  lines: CartLine[];
  addToCart: (id: string, quantity?: number) => void;
  removeFromCart: (id: string) => void;
  increaseQuantity: (id: string) => void;
  decreaseQuantity: (id: string) => void;
  clearCart: () => void;
  count: number;
  subtotal: number;
};

const CartContext = createContext<CartApi | undefined>(undefined);
const CART_KEY = 'ya-cart-v1';
const ORDERS_KEY = 'ya-orders-v1';

const INITIAL_MOCK_ORDERS: LocalOrder[] = [
  {
    id: 'YA-1042',
    createdAt: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
    lines: [
      { productId: 'red-bull', quantity: 2 },
      { productId: 'doritos', quantity: 1 },
      { productId: 'hielo', quantity: 1 },
    ],
    address: {
      name: 'Alex de YA',
      phone: '600 123 456',
      street: 'Calle Larga',
      number: '24',
      floor: '3º A',
      postalCode: '11403',
      city: 'Jerez de la Frontera',
      notes: 'Portal blanco frente a la plaza.',
    },
    payment: 'Tarjeta',
    subtotal: 11.25,
    deliveryFee: 2.9,
    total: 14.15,
    status: 'delivered',
  },
];

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') as CartLine[];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(lines));
    } catch {
      // Ignore quota errors
    }
  }, [lines]);

  const api = useMemo<CartApi>(() => {
    const addToCart = (id: string, quantity = 1) =>
      setLines((old) => {
        const line = old.find((item) => item.productId === id);
        return line
          ? old.map((item) =>
              item.productId === id ? { ...item, quantity: item.quantity + quantity } : item
            )
          : [...old, { productId: id, quantity }];
      });

    const removeFromCart = (id: string) =>
      setLines((old) => old.filter((item) => item.productId !== id));

    const increaseQuantity = (id: string) => addToCart(id, 1);

    const decreaseQuantity = (id: string) =>
      setLines((old) =>
        old.flatMap((item) =>
          item.productId !== id
            ? [item]
            : item.quantity > 1
            ? [{ ...item, quantity: item.quantity - 1 }]
            : []
        )
      );

    const clearCart = () => setLines([]);

    const count = lines.reduce((sum, item) => sum + item.quantity, 0);

    const subtotal = lines.reduce((sum, item) => {
      const prod = productById(item.productId);
      return sum + (prod?.price ?? 0) * item.quantity;
    }, 0);

    return {
      lines,
      addToCart,
      removeFromCart,
      increaseQuantity,
      decreaseQuantity,
      clearCart,
      count,
      subtotal,
    };
  }, [lines]);

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart debe usarse dentro de CartProvider');
  }
  return context;
};

export const loadOrders = (): LocalOrder[] => {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    if (!raw) {
      localStorage.setItem(ORDERS_KEY, JSON.stringify(INITIAL_MOCK_ORDERS));
      return INITIAL_MOCK_ORDERS;
    }
    return JSON.parse(raw) as LocalOrder[];
  } catch {
    return INITIAL_MOCK_ORDERS;
  }
};

export const saveOrder = (order: LocalOrder) => {
  try {
    const existing = loadOrders();
    const updated = [order, ...existing.filter((o) => o.id !== order.id)];
    localStorage.setItem(ORDERS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage issues
  }
};
