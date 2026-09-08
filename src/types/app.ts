// ==============================================================================
// TIPOS DE LA APLICACIÓN YA
// Compatible al 100% con la app mock existente y con el esquema real de Supabase
// ==============================================================================

// --- 1. MODELO FRONTEND ACTUAL (MOCK COMPATIBLE) ---
export type CategorySlug = 'energeticas' | 'bebidas' | 'snacks' | 'dulces' | 'hielo' | 'comida' | 'mas';

export type Product = {
  id: string;
  slug: string;
  name: string;
  price: number;
  estimatedCost: number;
  category: CategorySlug;
  image: string;
  description: string;
  active: boolean;
  inStock: boolean;
  internalInstructions: string;
};

export type CartLine = {
  productId: string;
  quantity: number;
};

export type Address = {
  name: string;
  phone?: string;
  street: string;
  number: string;
  floor: string;
  postalCode: string;
  city: string;
  notes?: string;
};

export type OrderStatus =
  | 'received'
  | 'preparing'
  | 'shopping'
  | 'sourcing'
  | 'ready'
  | 'prepared'
  | 'delivering'
  | 'delivered'
  | 'cancelled';

export type LocalOrder = {
  id: string;
  createdAt: string;
  lines: CartLine[];
  address: Address;
  payment: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
};

// --- 2. ENTIDADES DE BASE DE DATOS SUPABASE ---

export type UserRole = 'customer' | 'admin' | 'courier';

export type DbProfile = {
  id: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

export type DbCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  image: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type StockMode = 'in_stock' | 'out_of_stock' | 'on_demand';

export type DbProduct = {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  price: number;
  estimated_cost: number | null;
  active: boolean;
  stock_mode: StockMode;
  stock_quantity: number;
  internal_courier_notes: string | null;
  suggested_purchase_locations: string | null;
  created_at: string;
  updated_at: string;
};

export type DbAddress = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  street: string;
  number: string;
  floor_door: string | null;
  postal_code: string;
  city: string;
  notes: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type PaymentMethod = 'card' | 'apple_pay' | 'google_pay' | 'bizum' | 'cash';
export type PaymentStatus = 'pending' | 'authorized' | 'paid' | 'failed' | 'refunded';

export type DbOrder = {
  id: string;
  order_number: string;
  user_id: string | null;
  address_id: string | null;
  delivery_zone_id: string | null;
  courier_id: string | null;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  total: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  notes: string | null;
  delivery_address_snapshot?: Address | null;
  created_at: string;
  updated_at: string;
};

export type DbOrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  created_at: string;
};

export type DbCourier = {
  id: string;
  profile_id: string;
  vehicle_type: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type DbDeliveryZone = {
  id: string;
  name: string;
  city: string;
  active: boolean;
  delivery_fee: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DbSchedule = {
  id: string;
  day_of_week: number;
  opening_time: string;
  closing_time: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type DiscountType = 'fixed' | 'percentage';

export type DbPromotion = {
  id: string;
  code: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  minimum_order: number;
  active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
};
