import { createContext, useContext, useEffect, useMemo, useState, type ReactNode, useCallback } from 'react';
import { useCatalog } from './CatalogContext';
import type {
  CartLine,
  CartPackSelection,
  LocalOrder,
  DbCommercialSettings,
  DbDiscount,
  DbPromotion,
  PackWithDetails,
} from '../types/app';
import {
  calculateCartPricing,
  DEFAULT_COMMERCIAL_SETTINGS,
  type CartPricingSummary,
} from '../lib/pricing';
import { getCommercialSettings } from '../lib/commercialSettings';
import { fetchActiveDiscounts } from '../lib/adminDiscounts';
import { fetchActivePromotions } from '../lib/adminPromotions';
import { fetchActivePacks } from '../lib/adminPacks';

type CartApi = {
  lines: CartLine[];
  addToCart: (id: string, quantity?: number) => void;
  addPackToCart: (pack: PackWithDetails, selections?: CartPackSelection[], quantity?: number) => void;
  removeFromCart: (lineIdOrProductId: string) => void;
  increaseQuantity: (lineIdOrProductId: string) => void;
  decreaseQuantity: (lineIdOrProductId: string) => void;
  clearCart: () => void;
  count: number;
  subtotal: number;
  // Motor Comercial Phase 3B
  pricing: CartPricingSummary;
  commercialSettings: DbCommercialSettings;
  activePacks: PackWithDetails[];
  packs: PackWithDetails[];
  activeDiscounts: DbDiscount[];
  activePromotions: DbPromotion[];
  refreshCommercialData: () => Promise<void>;
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
  const { products } = useCatalog();
  const [lines, setLines] = useState<CartLine[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') as CartLine[];
    } catch {
      return [];
    }
  });

  const [commercialSettings, setCommercialSettings] = useState<DbCommercialSettings>(
    DEFAULT_COMMERCIAL_SETTINGS
  );
  const [activePacks, setActivePacks] = useState<PackWithDetails[]>([]);
  const [activeDiscounts, setActiveDiscounts] = useState<DbDiscount[]>([]);
  const [activePromotions, setActivePromotions] = useState<DbPromotion[]>([]);

  const refreshCommercialData = useCallback(async () => {
    try {
      const [settings, packs, discounts, promotions] = await Promise.all([
        getCommercialSettings(),
        fetchActivePacks(),
        fetchActiveDiscounts(),
        fetchActivePromotions(),
      ]);
      setCommercialSettings(settings);
      setActivePacks(packs);
      setActiveDiscounts(discounts);
      setActivePromotions(promotions);
    } catch (err) {
      console.warn('Error refreshing commercial data:', err);
    }
  }, []);

  useEffect(() => {
    refreshCommercialData();
  }, [refreshCommercialData]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(lines));
    } catch {
      // Ignore quota errors
    }
  }, [lines]);

  const api = useMemo<CartApi>(() => {
    // Añadir producto regular al carrito
    const addToCart = (id: string, quantity = 1) =>
      setLines((old) => {
        const existingIdx = old.findIndex(
          (item) => !item.isPack && (item.productId === id || item.lineId === id)
        );
        if (existingIdx !== -1) {
          const updated = [...old];
          updated[existingIdx] = {
            ...updated[existingIdx],
            quantity: updated[existingIdx].quantity + quantity,
          };
          return updated;
        }
        return [
          ...old,
          {
            lineId: `prod-${id}`,
            productId: id,
            quantity,
            isPack: false,
          },
        ];
      });

    // Añadir Pack (cerrado o configurable) al carrito
    const addPackToCart = (
      pack: PackWithDetails,
      selections: CartPackSelection[] = [],
      quantity = 1
    ) => {
      setLines((old) => {
        // Generar una clave determinista basada en el pack y las selecciones
        const selKey = selections
          .map((s) => `${s.groupId}:${s.productId}`)
          .sort()
          .join('|');
        const lineId = `pack-${pack.id}-${selKey || 'fixed'}`;

        const existingIdx = old.findIndex((item) => item.lineId === lineId);
        if (existingIdx !== -1) {
          const updated = [...old];
          updated[existingIdx] = {
            ...updated[existingIdx],
            quantity: updated[existingIdx].quantity + quantity,
          };
          return updated;
        }

        return [
          ...old,
          {
            lineId,
            productId: pack.slug || pack.id,
            packId: pack.id,
            isPack: true,
            packName: pack.name,
            packType: pack.pack_type,
            packImage: pack.image || '📦',
            unitPrice: pack.price,
            packSelections: selections,
            quantity,
          },
        ];
      });
    };

    const removeFromCart = (lineIdOrProductId: string) =>
      setLines((old) =>
        old.filter(
          (item) =>
            item.lineId !== lineIdOrProductId &&
            item.productId !== lineIdOrProductId &&
            item.packId !== lineIdOrProductId
        )
      );

    const increaseQuantity = (lineIdOrProductId: string) =>
      setLines((old) =>
        old.map((item) =>
          item.lineId === lineIdOrProductId ||
          item.productId === lineIdOrProductId ||
          item.packId === lineIdOrProductId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );

    const decreaseQuantity = (lineIdOrProductId: string) =>
      setLines((old) =>
        old.flatMap((item) => {
          if (
            item.lineId === lineIdOrProductId ||
            item.productId === lineIdOrProductId ||
            item.packId === lineIdOrProductId
          ) {
            return item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : [];
          }
          return [item];
        })
      );

    const clearCart = () => setLines([]);

    const count = lines.reduce((sum, item) => sum + item.quantity, 0);

    // Motor de cálculo comercial determinista (Phase 3B)
    const pricing = calculateCartPricing({
      cartLines: lines,
      products,
      packs: activePacks,
      discounts: activeDiscounts,
      promotions: activePromotions,
      settings: commercialSettings,
    });

    return {
      lines,
      addToCart,
      addPackToCart,
      removeFromCart,
      increaseQuantity,
      decreaseQuantity,
      clearCart,
      count,
      subtotal: pricing.subtotal,
      pricing,
      commercialSettings,
      activePacks,
      packs: activePacks,
      activeDiscounts,
      activePromotions,
      refreshCommercialData,
    };
  }, [
    lines,
    products,
    activePacks,
    activeDiscounts,
    activePromotions,
    commercialSettings,
    refreshCommercialData,
  ]);

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
