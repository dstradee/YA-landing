import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { productById } from '../data/products';
import type { CartLine, LocalOrder } from '../types/app';

type CartApi = { lines: CartLine[]; addToCart: (id: string, quantity?: number) => void; removeFromCart: (id: string) => void; increaseQuantity: (id: string) => void; decreaseQuantity: (id: string) => void; clearCart: () => void; count: number; subtotal: number; };
const CartContext = createContext<CartApi | undefined>(undefined);
const CART_KEY = 'ya-cart-v1';

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => { try { return JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') as CartLine[]; } catch { return []; } });
  useEffect(() => localStorage.setItem(CART_KEY, JSON.stringify(lines)), [lines]);
  const api = useMemo<CartApi>(() => {
    const addToCart = (id: string, quantity = 1) => setLines((old) => { const line = old.find((item) => item.productId === id); return line ? old.map((item) => item.productId === id ? { ...item, quantity: item.quantity + quantity } : item) : [...old, { productId: id, quantity }]; });
    return { lines, addToCart, removeFromCart: (id) => setLines((old) => old.filter((item) => item.productId !== id)), increaseQuantity: (id) => addToCart(id), decreaseQuantity: (id) => setLines((old) => old.flatMap((item) => item.productId !== id ? [item] : item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : [])), clearCart: () => setLines([]), count: lines.reduce((sum, item) => sum + item.quantity, 0), subtotal: lines.reduce((sum, item) => sum + (productById(item.productId)?.price ?? 0) * item.quantity, 0) };
  }, [lines]);
  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}
export const useCart = () => { const context = useContext(CartContext); if (!context) throw new Error('useCart debe usarse dentro de CartProvider'); return context; };
const ORDERS_KEY = 'ya-orders-v1';
export const loadOrders = (): LocalOrder[] => { try { return JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '[]') as LocalOrder[]; } catch { return []; } };
export const saveOrder = (order: LocalOrder) => localStorage.setItem(ORDERS_KEY, JSON.stringify([order, ...loadOrders()]));