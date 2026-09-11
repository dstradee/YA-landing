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
  stockMode?: StockMode;
  stockQuantity?: number;
  minStock?: number;
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
  min_stock?: number;
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
  total_bonuses?: number;
  total_payout?: number;
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
    totalBonuses?: number;
    totalPayout?: number;
  };
  deliveredOrders?: CourierDeliveredOrderEarningsItem[];
  rewards?: CourierRewardHistoryItem[];
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
  earnings: number; // Ganancias netas por entregas de pedidos (4D)
  deliveredCount: number;
  avgPerDelivery: number;
  bonusEarnings?: number; // Recompensas y bonus conseguidos (4E)
  totalPayout?: number; // Remuneración total = entregas + bonus
};

export type CourierEarningsSummary = {
  today: CourierEarningsPeriodStats;
  thisWeek: CourierEarningsPeriodStats;
  thisMonth: CourierEarningsPeriodStats;
  allTime: CourierEarningsPeriodStats;
  totalBonusesCount?: number;
  totalBonusesAmount?: number;
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

// --- FASE 4E: INCENTIVOS Y RECOMPENSAS PARA REPARTIDORES ---

export type DbCourierIncentive = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  incentive_type: 'delivery_count';
  target_deliveries: number;
  bonus_amount: number;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DbCourierIncentiveReward = {
  id: string;
  incentive_id: string;
  courier_id: string;
  trigger_order_id: string | null;
  achieved_at: string;
  deliveries_count: number;
  bonus_amount: number;
  status: 'earned' | 'pending' | 'paid' | 'cancelled';
  notes?: string | null;
  created_at: string;
};

export type CourierIncentiveWithProgress = {
  id: string;
  name: string;
  description: string | null;
  incentive_type: string;
  target_deliveries: number;
  bonus_amount: number;
  active: boolean;
  start_at: string | null;
  end_at: string | null;
  is_expired: boolean;
  is_future: boolean;
  current_deliveries: number;
  remaining_deliveries: number;
  progress_percent: number;
  is_achieved: boolean;
  achieved_reward?: {
    id: string;
    bonus_amount: number;
    achieved_at: string;
    status: string;
    deliveries_count: number;
  } | null;
  status_badge: 'achieved' | 'in_progress' | 'expired' | 'upcoming';
};

export type CourierRewardHistoryItem = {
  id: string;
  incentive_id: string;
  incentive_name: string;
  target_deliveries: number;
  deliveries_count: number;
  bonus_amount: number;
  status: string;
  achieved_at: string;
  created_at: string;
  trigger_order_id?: string | null;
  courier_id?: string;
  courier_name?: string;
  courier_email?: string | null;
};

export type CourierIncentivesOverview = {
  incentives: CourierIncentiveWithProgress[];
  rewards: CourierRewardHistoryItem[];
  summary: {
    total_count: number;
    total_earned: number;
    today_earned: number;
    week_earned: number;
    month_earned: number;
  };
};

export type AdminIncentiveListItem = DbCourierIncentive & {
  total_rewards?: number;
  total_bonus_paid?: number;
};

export type AdminCourierIncentiveProgress = {
  courier_id: string;
  profile_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  available: boolean;
  incentive_id: string;
  incentive_name: string;
  target_deliveries: number;
  bonus_amount: number;
  deliveries_count: number;
  progress_percent: number;
  is_achieved: boolean;
  reward?: {
    id: string;
    bonus_amount: number;
    achieved_at: string;
    status: string;
  } | null;
};

export type AdminIncentivesOverview = {
  incentives: AdminIncentiveListItem[];
  couriers_progress: AdminCourierIncentiveProgress[];
  rewards: CourierRewardHistoryItem[];
  summary: {
    total_incentives: number;
    active_incentives: number;
    total_rewards: number;
    total_bonus_amount: number;
  };
};

// ==============================================================================
// 10. FASE 5 — SISTEMA DE INVENTARIO Y MOVIMIENTOS
// ==============================================================================

export type StockMovementType =
  | 'entry'
  | 'sale'
  | 'cancellation'
  | 'adjustment'
  | 'loss'
  | 'test_order';

export type DbStockMovement = {
  id: string;
  product_id: string;
  movement_type: StockMovementType;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  order_id: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  // Campos derivados / joins
  product_name?: string;
  product_slug?: string;
  order_number?: string;
  creator_email?: string;
};

export type InventorySummary = {
  total_products: number;
  in_stock_products: number;
  low_stock_products: number;
  out_of_stock_products: number;
  on_demand_products: number;
  total_units_in_stock: number;
  total_retail_value: number;
  total_cost_value: number;
  estimated_gross_profit: number;
};

// ==============================================================================
// 11. FASE 6 — SOURCING / ABASTECIMIENTO
// ==============================================================================

export type SourcingStatus = 'pending' | 'sourcing' | 'sourced' | 'unavailable' | 'cancelled';

export type DbSourcingItem = {
  id: string;
  order_id: string;
  order_item_id: string | null;
  product_id: string;
  product_name: string;
  quantity: number;
  status: SourcingStatus;
  is_test: boolean;
  supplier_name: string | null;
  supplier_reference: string | null;
  source_cost: number | null;
  notes: string | null;
  managed_by: string | null;
  created_at: string;
  updated_at: string;
  sourced_at: string | null;
  // Joins y campos enriquecidos para UI
  order_number?: string;
  order_status?: OrderStatus;
  order_created_at?: string;
  order_notes?: string | null;
  delivery_address?: any;
  product_slug?: string;
  product_image?: string | null;
  product_price?: number;
  product_estimated_cost?: number | null;
  suggested_purchase_locations?: string | null;
  internal_courier_notes?: string | null;
};

export type DbSourcingAuditLog = {
  id: string;
  sourcing_item_id: string;
  order_id: string;
  previous_status: SourcingStatus | null;
  new_status: SourcingStatus;
  supplier_name: string | null;
  source_cost: number | null;
  notes: string | null;
  changed_by: string | null;
  created_at: string;
};

export type SourcingSummary = {
  pending_count: number;
  sourcing_count: number;
  sourced_today_count: number;
  unavailable_count: number;
  orders_pending_sourcing: number;
};

// ==============================================================================
// 12. FASE 7 — INCIDENTS / INCIDENCIAS
// ==============================================================================

export type IncidentType =
  | 'product_unavailable'
  | 'partial_order'
  | 'wrong_product'
  | 'damaged_product'
  | 'missing_product'
  | 'preparation_issue'
  | 'delivery_issue'
  | 'customer_unavailable'
  | 'address_issue'
  | 'delay'
  | 'returned_order'
  | 'other';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'cancelled';

export type IncidentOrigin = 'admin' | 'courier' | 'system';

export type DbIncident = {
  id: string;
  incident_number: string;
  order_id: string;
  order_item_id: string | null;
  product_id: string | null;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  internal_notes: string | null;
  origin: IncidentOrigin;
  is_test: boolean;
  requires_refund_review: boolean;
  courier_id: string | null;
  reported_by: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;

  // Campos enriquecidos para UI
  order_number?: string;
  order_status?: OrderStatus;
  order_total?: number;
  order_is_test?: boolean;
  order_created_at?: string;
  customer_name?: string;
  customer_phone?: string | null;
  product_name?: string | null;
  courier_name?: string | null;
  reported_by_name?: string | null;
  resolved_by_name?: string | null;
};

export type DbIncidentAuditLog = {
  id: string;
  incident_id: string;
  order_id: string;
  action: string;
  previous_status: IncidentStatus | null;
  new_status: IncidentStatus | null;
  previous_severity: IncidentSeverity | null;
  new_severity: IncidentSeverity | null;
  notes: string | null;
  changed_by: string | null;
  changed_by_name?: string | null;
  created_at: string;
};

export type IncidentsSummary = {
  open_count: number;
  investigating_count: number;
  resolved_today_count: number;
  critical_count: number;
  affected_orders_count: number;
  requires_refund_review_count: number;
};

// ==============================================================================
// 10. MODELO FASE 8: NOTIFICACIONES Y PREFERENCIAS
// ==============================================================================
export type NotificationType =
  | 'order_received'
  | 'payment_confirmed'
  | 'order_preparing'
  | 'order_sourcing'
  | 'order_prepared'
  | 'order_delivering'
  | 'order_delivered'
  | 'order_cancelled'
  | 'courier_order_available'
  | 'courier_order_assigned'
  | 'courier_incident_alert'
  | 'order_incident'
  | 'admin_new_order'
  | 'admin_critical_incident'
  | 'admin_sourcing_needed'
  | 'promotion'
  | 'system_alert';

export type NotificationChannel = 'in_app' | 'email' | 'push' | 'sms' | 'whatsapp';

export type DbNotification = {
  id: string;
  user_id: string;
  order_id: string | null;
  incident_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  channel: NotificationChannel;
  read: boolean;
  read_at: string | null;
  is_test: boolean;
  data: Record<string, unknown>;
  created_at: string;
};

export type DbNotificationPreferences = {
  user_id: string;
  order_updates: boolean;
  important_alerts: boolean;
  promotions: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type NotificationsFetchResult = {
  notifications: DbNotification[];
  unread_count: number;
  total_count: number;
};

