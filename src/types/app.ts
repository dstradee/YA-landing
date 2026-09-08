export type CategorySlug = 'energeticas' | 'bebidas' | 'snacks' | 'dulces' | 'hielo' | 'comida' | 'mas';
export type Product = { id: string; slug: string; name: string; price: number; estimatedCost: number; category: CategorySlug; image: string; description: string; active: boolean; inStock: boolean; internalInstructions: string };
export type CartLine = { productId: string; quantity: number };
export type Address = { name: string; street: string; number: string; floor: string; postalCode: string; city: string };
export type OrderStatus = 'received' | 'preparing' | 'shopping' | 'ready' | 'delivering' | 'delivered';
export type LocalOrder = { id: string; createdAt: string; lines: CartLine[]; address: Address; payment: string; subtotal: number; deliveryFee: number; total: number; status: OrderStatus };