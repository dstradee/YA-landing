import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  fetchActiveCategories,
  fetchActiveProducts,
  subscribeToCatalogChanges,
  type CatalogCategory,
} from '../lib/catalog';
import { products as fallbackProducts, categories as fallbackCategories, euro } from '../data/products';
import type { Product } from '../types/app';

interface CatalogContextType {
  categories: CatalogCategory[];
  products: Product[];
  loading: boolean;
  error: string | null;
  refreshCatalog: () => Promise<void>;
  getProductById: (id: string) => Product | undefined;
  getProductsByCategory: (categorySlug: string) => Product[];
  searchProducts: (query: string) => Product[];
}

const CatalogContext = createContext<CatalogContextType | undefined>(undefined);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<CatalogCategory[]>(() =>
    fallbackCategories.map((c, i) => ({
      id: c.slug,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      description: c.description,
      sort_order: i + 1,
      active: true,
    }))
  );
  const [products, setProducts] = useState<Product[]>(fallbackProducts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [catList, prodList] = await Promise.all([
        fetchActiveCategories(),
        fetchActiveProducts(),
      ]);

      if (catList && catList.length > 0) {
        setCategories(catList);
      }
      if (prodList && prodList.length > 0) {
        setProducts(prodList);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar catálogo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleInventoryUpdated = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (customEvt?.detail?.product_id && customEvt.detail.new_stock !== undefined) {
        const prodId = customEvt.detail.product_id;
        const newStock = Number(customEvt.detail.new_stock);
        setProducts((prev) =>
          prev.map((p) => {
            if (p.id === prodId || p.slug === prodId) {
              const isAvailable =
                p.active &&
                (p.stockMode === 'on_demand' ||
                  (p.stockMode === 'in_stock' && newStock > 0));
              return {
                ...p,
                stockQuantity: newStock,
                inStock: isAvailable,
              };
            }
            return p;
          })
        );
      }
      loadData();
    };
    window.addEventListener('ya-inventory-updated', handleInventoryUpdated);

    // Supabase Realtime listener para actualización en tiempo real sin recargar
    const unsubscribe = subscribeToCatalogChanges((payload) => {
      if (payload?.table === 'products' && payload.eventType === 'UPDATE' && payload.new) {
        const raw = payload.new;
        setProducts((prev) => {
          const index = prev.findIndex((p) => p.id === raw.id || p.slug === raw.slug);
          if (index === -1) {
            loadData();
            return prev;
          }
          const existing = prev[index];
          const isAvailable =
            Boolean(raw.active) &&
            (raw.stock_mode === 'on_demand' ||
              (raw.stock_mode === 'in_stock' &&
                (raw.stock_quantity === undefined || Number(raw.stock_quantity) > 0)));

          const updated: Product = {
            ...existing,
            name: raw.name ?? existing.name,
            price: raw.price !== undefined ? Number(raw.price) : existing.price,
            active: raw.active !== undefined ? Boolean(raw.active) : existing.active,
            image: raw.image || existing.image,
            description: raw.description ?? existing.description,
            stockMode: raw.stock_mode ?? existing.stockMode,
            stockQuantity:
              raw.stock_quantity !== undefined ? Number(raw.stock_quantity) : existing.stockQuantity,
            minStock:
              raw.min_stock !== undefined ? Number(raw.min_stock) : existing.minStock,
            inStock: isAvailable,
          };
          const next = [...prev];
          next[index] = updated;
          return next;
        });
      } else {
        loadData();
      }
    });

    return () => {
      window.removeEventListener('ya-inventory-updated', handleInventoryUpdated);
      unsubscribe();
    };
  }, []);

  const getProductById = (id: string): Product | undefined => {
    return products.find((p) => p.id === id || p.slug === id);
  };

  const getProductsByCategory = (categorySlug: string): Product[] => {
    return products.filter((p) => p.category === categorySlug && p.active);
  };

  const searchProducts = (query: string): Product[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products.filter(
      (p) =>
        p.active &&
        (p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q))
    );
  };

  return (
    <CatalogContext.Provider
      value={{
        categories,
        products,
        loading,
        error,
        refreshCatalog: loadData,
        getProductById,
        getProductsByCategory,
        searchProducts,
      }}
    >
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) {
    throw new Error('useCatalog debe usarse dentro de CatalogProvider');
  }
  return context;
}

export { euro };
