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

export type CartPackSelection = {
  groupId: string;
  groupName: string;
  productId: string;
  productName: string;
};

export type CartLine = {
  productId: string;
  quantity: number;
  // Extensiones Fase 3B
  lineId?: string;
  isPack?: boolean;
  packId?: string;
  packName?: string;
  packType?: PackType;
  packImage?: string;
  unitPrice?: number;
  packSelections?: CartPackSelection[];
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
  | 'payment_pending'
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
  email?: string | null;
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

export type PaymentMethod = 'card' | 'apple_pay' | 'google_pay' | 'bizum' | 'cash' | 'paypal' | 'test_order';
export type PaymentStatus = 'pending' | 'authorized' | 'paid' | 'failed' | 'cancelled' | 'refunded';

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
  discount_total?: number;
  promotion_id?: string | null;
  promotion_code?: string | null;
  promotion_discount?: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  payment_provider?: string | null;
  payment_order_id?: string | null;
  payment_capture_id?: string | null;
  payment_reference?: string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
  payment_metadata?: any;
  is_test?: boolean;
  notes: string | null;
  delivery_address_snapshot?: Address | null;
  delivered_at?: string | null;
  courier_assigned_at?: string | null;
  courier_accepted_at?: string | null;
  courier_commission_percent?: number | null;
  courier_fixed_fee?: number | null;
  courier_payout_total?: number | null;
  created_at: string;
  updated_at: string;
};

export type DbPayment = {
  id: string;
  order_id: string;
  user_id: string | null;
  provider: string;
  provider_order_id: string;
  provider_capture_id: string | null;
  payment_method: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  raw_payload?: any;
  error_detail?: string | null;
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
  is_pack?: boolean;
  pack_id?: string | null;
  discount_applied?: number;
  discount_amount?: number;
  pack_snapshot?: any;
  pack_selections_snapshot?: any;
  created_at: string;
};

export type DbCourier = {
  id: string;
  profile_id: string;
  vehicle_type: string | null;
  active: boolean;
  available: boolean;
  commission_percent: number;
  fixed_fee: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminCourierListItem = DbCourier & {
  full_name: string;
  email: string | null;
  phone: string | null;
  user_role: UserRole;
  orders_count?: number;
  delivered_count?: number;
  total_earnings?: number;
  today_earnings?: number;
};

export type AdminCourierDetail = {
  courier: DbCourier;
  profile: DbProfile;
  summary: {
    totalDeliveries: number;
    totalEarnings: number;
    todayEarnings?: number;
    weekEarnings?: number;
    monthEarnings?: number;
    avgPerDelivery?: number;
    rating: number | null;
  };
  deliveredOrders?: CourierDeliveredOrderEarningsItem[];
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
export type DiscountScope = 'product' | 'category';

export type DbDiscount = {
  id: string;
  name: string;
  description: string | null;
  scope: DiscountScope;
  product_id: string | null;
  category_id: string | null;
  discount_type: DiscountType;
  discount_value: number;
  active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  // Campos enriquecidos para UI
  product_name?: string;
  category_name?: string;
};

export type DbPromotion = {
  id: string;
  name?: string | null;
  code: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  minimum_order: number;
  active: boolean;
  is_automatic?: boolean;
  sort_order?: number;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at?: string;
};

export type DbCommercialSettings = {
  id: string;
  min_order_enabled: boolean;
  min_order_amount: number;
  free_shipping_enabled: boolean;
  free_shipping_threshold: number;
  standard_delivery_fee: number;
  created_at?: string;
  updated_at?: string;
};

// --- TIPOS DE PACKS (FASE 3B) ---
export type PackType = 'fixed' | 'configurable';

export type DbPack = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  pack_type: PackType;
  price: number;
  reference_price: number | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type DbPackItem = {
  id: string;
  pack_id: string;
  product_id: string;
  quantity: number;
  sort_order: number;
  created_at: string;
  product?: DbProduct | Product | null;
};

export type DbPackGroup = {
  id: string;
  pack_id: string;
  name: string;
  description: string | null;
  min_select: number;
  max_select: number;
  sort_order: number;
  created_at: string;
  options?: DbPackGroupOption[];
};

export type DbPackGroupOption = {
  id: string;
  group_id: string;
  product_id: string;
  default_selected: boolean;
  sort_order: number;
  created_at: string;
  product?: DbProduct | Product | null;
};

export type PackWithDetails = DbPack & {
  items?: DbPackItem[];
  groups?: (DbPackGroup & { options: DbPackGroupOption[] })[];
  calculated_savings?: number;
  is_available?: boolean;
};

// --- 3. TIPOS PARA PANEL ADMIN (PHASE 3A) ---

export type AdminDashboardStats = {
  totalOrders: number;
  todayOrders: number;
  pendingOrders: number;
  preparingOrders: number;
  deliveringOrders: number;
  deliveredOrders: number;
  totalRevenue: number;
  todayRevenue: number;
  totalCustomers: number;
  activeProducts: number;
  inactiveProducts: number;
  activeCategories: number;
};

export type AdminOrderListItem = DbOrder & {
  itemsCount: number;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
};

export type AdminOrderDetail = DbOrder & {
  customer: DbProfile | null;
  items: DbOrderItem[];
  payments?: DbPayment[];
};

export type AdminCustomerListItem = DbProfile & {
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
};

// --- FASE 4B: TIPOS DEL PANEL DEL REPARTIDOR ---

export type CourierOrderListItem = DbOrder & {
  itemsCount: number;
  customerName: string;
  customerPhone: string | null;
  deliveryAddress: Address | null;
};

export type CourierOrderDetail = DbOrder & {
  customerName: string;
  customerPhone: string | null;
  deliveryAddress: Address | null;
  items: DbOrderItem[];
};

export type CourierDaySummary = {
  assignedPending: number;
  inProgress: number;
  deliveredToday: number;
  totalDelivered: number;
};

// --- FASE 4D: CÁLCULO Y GESTIÓN DE GANANCIAS DE REPARTIDORES ---

export type CourierOrderEarningsCalculation = {
  earnings: number;
  hasCommissionConfigured: boolean;
  commissionPercent: number;
  fixedFee: number;
  commissionAmount: number;
  fixedFeeAmount: number;
  formulaText: string;
};

export type CourierEarningsPeriodStats = {
  earnings: number;
  deliveredCount: number;
  avgPerDelivery: number;
};

export type CourierEarningsSummary = {
  today: CourierEarningsPeriodStats;
  thisWeek: CourierEarningsPeriodStats;
  thisMonth: CourierEarningsPeriodStats;
  allTime: CourierEarningsPeriodStats;
};

export type CourierDeliveredOrderEarningsItem = {
  id: string;
  orderNumber: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  isTest: boolean;
  commissionPercent: number | null;
  fixedFee: number | null;
  payoutTotal: number;
  hasCommissionConfigured: boolean;
  deliveredAt: string | null;
  createdAt: string;
  customerName: string;
  customerPhone: string | null;
  deliveryAddress: Address | null;
  calculation: CourierOrderEarningsCalculation;
};


