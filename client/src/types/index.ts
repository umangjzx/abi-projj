/**
 * Shapes returned by the API. These mirror the server's serializers -- when a
 * serializer changes, change the matching interface here.
 */

export type Role = 'CUSTOMER' | 'ADMIN';
export type Segment = 'NEW' | 'ACTIVE' | 'LOYAL' | 'AT_RISK' | 'CHURNED';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PACKED'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';

export type PaymentMethod = 'COD' | 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export type RecommendationStrategy =
  | 'PURCHASE_HISTORY'
  | 'CATEGORY_AFFINITY'
  | 'FREQUENTLY_BOUGHT_TOGETHER'
  | 'POPULAR'
  | 'COLLABORATIVE'
  | 'RECENTLY_VIEWED'
  | 'TRENDING';

export type RecommendationPlacement =
  | 'HOME'
  | 'PRODUCT_DETAIL'
  | 'CART'
  | 'CHECKOUT'
  | 'CUSTOMER_DASHBOARD'
  | 'SEARCH';

// -------------------------------------------------------------------- identity ---

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  totalOrders: number;
  totalSpent: number;
  segment: Segment;
  createdAt: string;
  role: { name: Role; label: string; permissions: string[] };
}

export interface Address {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
}

// ------------------------------------------------------------------- catalogue ---

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  children?: Category[];
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  price: number;
  mrp: number;
  discountPercent: number;
  unit: string;
  packSize: string | null;
  weightGram: number | null;
  isDefault: boolean;
  isActive: boolean;
  stock: number;
  inStock: boolean;
  isLowStock: boolean;
  lowStockThreshold: number;
}

export interface ProductImage {
  id: string;
  url: string;
  alt: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  shortDescription: string | null;
  description: string;
  brand: string;
  attributes: Record<string, string | number | boolean>;
  tags: string[];
  isActive: boolean;
  isFeatured: boolean;
  avgRating: number;
  ratingCount: number;
  reviewCount: number;
  soldCount: number;
  viewCount: number;
  createdAt: string;
  category: { id: string; name: string; slug: string } | null;
  images: ProductImage[];
  primaryImage: string | null;
  variants: ProductVariant[];
  defaultVariant: ProductVariant | null;
  minPrice: number;
  maxPrice: number;
  totalStock: number;
  inStock: boolean;
  /** Present only on products served by the recommendation endpoints. */
  recommendation?: {
    strategy: RecommendationStrategy;
    score: number;
    reason: string;
    placement: RecommendationPlacement;
  };
  viewedAt?: string;
  wishlistItemId?: string;
}

// ------------------------------------------------------------------------ cart ---

export interface PriceBreakdown {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
  itemCount: number;
  savings: number;
  freeDeliveryEligible: boolean;
  amountToFreeDelivery: number;
}

export interface CartItem {
  id: string;
  quantity: number;
  variant: { id: string; name: string; sku: string; price: number; mrp: number; unit: string; packSize: string | null };
  product: { id: string; name: string; slug: string; image: string | null; category: { id: string; name: string; slug: string } };
  lineTotal: number;
  availableStock: number;
  isAvailable: boolean;
  exceedsStock: boolean;
}

export interface Cart {
  id: string;
  items: CartItem[];
  coupon: { id: string; code: string; description: string | null; discountType: 'PERCENTAGE' | 'FLAT'; value: number } | null;
  pricing: PriceBreakdown;
  config: { deliveryFee: number; freeDeliveryThreshold: number; taxPercent: number };
  hasIssues: boolean;
}

export interface AvailableCoupon {
  code: string;
  description: string | null;
  discountType: 'PERCENTAGE' | 'FLAT';
  value: number;
  minOrderValue: number;
  maxDiscount: number | null;
  expiresAt: string | null;
  eligible: boolean;
  potentialDiscount: number;
  amountNeeded: number;
}

// ---------------------------------------------------------------------- orders ---

export interface OrderItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  unitPrice: number;
  mrp: number;
  quantity: number;
  lineTotal: number;
  imageUrl: string | null;
}

export interface ShipTo {
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
  itemCount: number;
  shipTo: ShipTo;
  notes: string | null;
  placedAt: string;
  confirmedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  coupon: { code: string; discountType: string; value: number } | null;
  customer: { id: string; name: string; email: string; phone: string | null } | null;
  payment: {
    id: string;
    method: PaymentMethod;
    status: PaymentStatus;
    amount: number;
    transactionRef: string | null;
    paidAt: string | null;
  } | null;
  items: OrderItem[];
  timeline: { status: OrderStatus; note: string | null; at: string; by: string }[];
}

export interface OrderTracking {
  orderNumber: string;
  status: OrderStatus;
  isTerminal: boolean;
  placedAt: string;
  estimatedDelivery: string;
  stages: { status: OrderStatus; label: string; complete: boolean; current: boolean; at: string | null; index: number }[];
  timeline: { status: OrderStatus; note: string | null; at: string; by: string }[];
  items: OrderItem[];
  shipTo: ShipTo;
  total: number;
}

// --------------------------------------------------------------------- reviews ---

export interface Review {
  id: string;
  title: string | null;
  comment: string;
  rating: number | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  helpfulCount: number;
  isVerified: boolean;
  adminReply: string | null;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
  product?: { id: string; name: string; slug: string };
}

// ---------------------------------------------------------------------- offers ---

export interface Offer {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  bannerUrl: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  type: 'BANNER' | 'CATEGORY_DISCOUNT' | 'PRODUCT_DISCOUNT' | 'COMBO';
  discountPercent: number | null;
  priority: number;
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
  category: { id: string; name: string; slug: string } | null;
  product: { id: string; name: string; slug: string } | null;
}

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: 'PERCENTAGE' | 'FLAT';
  value: number;
  minOrderValue: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number;
  startsAt: string;
  expiresAt: string | null;
  isActive: boolean;
  redemptionCount: number;
  status: 'active' | 'scheduled' | 'expired' | 'inactive';
}

// --------------------------------------------------------------- notifications ---

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

// ------------------------------------------------------------------- analytics ---

export interface KpiValue {
  value: number;
  previous: number;
  change: number;
}

export interface DashboardKpis {
  revenue: KpiValue;
  orders: KpiValue;
  averageOrderValue: KpiValue;
  newCustomers: KpiValue;
  unitsSold: KpiValue;
  discountGiven: KpiValue;
  pendingOrders: number;
  completedOrders: number;
  totals: { customers: number; products: number; orders: number; revenue: number };
}

export interface SalesPoint {
  date: string;
  revenue: number;
  orders: number;
  units: number;
}

export interface CategoryPerformance {
  categoryId: string;
  name: string;
  revenue: number;
  units: number;
  orders: number;
  share: number;
}

export interface ProductPerformanceRow {
  productId: string;
  name: string;
  slug: string;
  image: string | null;
  category: { id: string; name: string } | null;
  unitsSold: number;
  revenue: number;
  orderCount: number;
  stock: number;
  avgRating: number;
  views: number;
  conversionRate: number;
}

export interface CustomerGrowthPoint {
  date: string;
  newCustomers: number;
  totalCustomers: number;
}

export interface Retention {
  totalCustomers: number;
  customersWhoOrdered: number;
  repeatCustomers: number;
  oneTimeCustomers: number;
  neverOrdered: number;
  repeatRate: number;
  repeatRevenueShare: number;
  averageOrdersPerCustomer: number;
  lifetimeValue: number;
}

export interface TopCustomer {
  rank: number;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  segment: Segment;
  joinedAt: string | null;
  orders: number;
  spent: number;
  averageOrderValue: number;
}

export interface InventorySummary {
  trackedVariants: number;
  totalUnits: number;
  outOfStock: number;
  lowStock: number;
  healthy: number;
  stockValue: number;
}

export interface StockAlert {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  stock: number;
  lowStockThreshold: number;
  severity: 'critical' | 'warning';
}

export interface RecommendationFunnel {
  strategy: string;
  placement: string;
  impressions: number;
  clicks: number;
  addToCarts: number;
  purchases: number;
  clickThroughRate: number;
  cartRate: number;
  conversionRate: number;
}

export interface DashboardOverview {
  kpis: DashboardKpis;
  sales: { granularity: 'day' | 'week' | 'month'; series: SalesPoint[] };
  orderStatus: { status: OrderStatus; label: string; count: number; value: number; share: number }[];
  categoryPerformance: CategoryPerformance[];
  bestSellingProducts: ProductPerformanceRow[];
  leastSellingProducts: ProductPerformanceRow[];
  customerGrowth: CustomerGrowthPoint[];
  retention: Retention;
  topCustomers: TopCustomer[];
  inventory: { summary: InventorySummary; alerts: StockAlert[] };
  recommendations: {
    totals: { impressions: number; clicks: number; addToCarts: number; purchases: number; clickThroughRate: number; cartRate: number; conversionRate: number };
    byStrategy: RecommendationFunnel[];
    bestStrategy: string | null;
  };
  recentOrders: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    total: number;
    itemCount: number;
    placedAt: string;
    customer: { id: string; name: string; email: string };
  }[];
  recentActivity: {
    id: string;
    action: string;
    entity: string | null;
    at: string;
    actor: string;
    actorRole: string | null;
    description: string;
    statusCode: number | null;
  }[];
  paymentBreakdown: { method: string; count: number; amount: number; paid: number }[];
  generatedAt: string;
}

export interface Forecast {
  sufficientData: boolean;
  message?: string;
  history: { date: string; revenue: number }[];
  forecast: { date: string; predicted: number; lower: number; upper: number; dayOfWeek: string }[];
  model: {
    method: string;
    slopePerDay: number;
    rSquared: number;
    confidence: 'high' | 'moderate' | 'low';
    observations: number;
  } | null;
  summary?: {
    projectedRevenue: number;
    comparablePastRevenue: number;
    expectedChange: number;
    projectedDailyAverage: number;
    trend: 'growing' | 'declining' | 'flat';
  };
}

export interface CustomerOverview {
  profile: { name: string; email: string; segment: Segment; memberSince: string };
  stats: {
    totalOrders: number;
    totalSpent: number;
    totalSaved: number;
    averageOrderValue: number;
    wishlistItems: number;
    reviewsWritten: number;
    favouriteCategory: string | null;
  };
  ordersByStatus: Record<string, number>;
  recentOrders: { id: string; orderNumber: string; status: OrderStatus; total: number; itemCount: number; placedAt: string }[];
  activeOrders: number;
}

export interface InventoryRow {
  id: string;
  variantId: string;
  variantName: string;
  sku: string;
  price: number;
  product: { id: string; name: string; slug: string; image: string | null; category: { id: string; name: string } };
  stock: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  warehouse: string;
  restockedAt: string | null;
  stockValue: number;
  status: 'out' | 'low' | 'healthy';
}

export interface AdminCustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  emailVerified: boolean;
  segment: Segment;
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  location: string | null;
  joinedAt: string;
  lastLoginAt: string | null;
  counts: { orders: number; reviews: number; wishlist: number };
}

export interface ReportDefinition {
  type: string;
  title: string;
  description: string;
}

export interface ReportPayload {
  type: string;
  title: string;
  subtitle: string;
  generatedAt: string;
  columns: { key: string; label: string; type?: 'text' | 'number' | 'currency' | 'percent' | 'date'; width?: number }[];
  rows: Record<string, unknown>[];
  summary: { label: string; value: string }[];
}
