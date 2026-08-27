import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toQueryString } from '@/lib/utils';
import type {
  AdminCustomerRow,
  CategoryPerformance,
  CustomerGrowthPoint,
  DashboardOverview,
  Forecast,
  InventoryRow,
  InventorySummary,
  ProductPerformanceRow,
  RecommendationFunnel,
  Retention,
  SalesPoint,
  StockAlert,
  TopCustomer,
} from '@/types';
import type { RangePeriod } from '@/components/admin/DateRangePicker';

export const adminKeys = {
  dashboard: (period: RangePeriod) => ['admin', 'dashboard', period] as const,
  kpis: (period: RangePeriod) => ['admin', 'kpis', period] as const,
  sales: (period: RangePeriod) => ['admin', 'sales', period] as const,
  monthlySales: (months: number) => ['admin', 'sales', 'monthly', months] as const,
  seasonal: ['admin', 'seasonal'] as const,
  heatmap: (period: RangePeriod) => ['admin', 'heatmap', period] as const,
  products: (period: RangePeriod, limit: number) => ['admin', 'products', period, limit] as const,
  demand: (period: RangePeriod) => ['admin', 'demand', period] as const,
  categories: (period: RangePeriod) => ['admin', 'categories', period] as const,
  growth: (period: RangePeriod) => ['admin', 'growth', period] as const,
  retention: ['admin', 'retention'] as const,
  segments: ['admin', 'segments'] as const,
  topCustomers: (period: RangePeriod) => ['admin', 'top-customers', period] as const,
  locations: (period: RangePeriod) => ['admin', 'locations', period] as const,
  orderStatus: (period: RangePeriod) => ['admin', 'order-status', period] as const,
  payments: (period: RangePeriod) => ['admin', 'payments', period] as const,
  forecast: (days: number) => ['admin', 'forecast', days] as const,
  inventorySummary: ['admin', 'inventory-summary'] as const,
  inventoryAlerts: ['admin', 'inventory-alerts'] as const,
  customers: (params: Record<string, unknown>) => ['admin', 'customers', params] as const,
  recPerformance: (period: RangePeriod) => ['admin', 'rec-performance', period] as const,
};

export function useDashboard(period: RangePeriod) {
  return useQuery({
    queryKey: adminKeys.dashboard(period),
    queryFn: () => api.get<DashboardOverview>(`/analytics/dashboard?period=${period}`),
    placeholderData: keepPreviousData,
  });
}

export function useSalesSeries(period: RangePeriod) {
  return useQuery({
    queryKey: adminKeys.sales(period),
    queryFn: () => api.get<{ granularity: string; series: SalesPoint[] }>(`/analytics/sales?period=${period}`),
    placeholderData: keepPreviousData,
  });
}

export function useMonthlySales(months = 12) {
  return useQuery({
    queryKey: adminKeys.monthlySales(months),
    queryFn: () => api.get<{ date: string; month: string; revenue: number; orders: number }[]>(`/analytics/sales/monthly?months=${months}`),
  });
}

export function useSeasonalTrends() {
  return useQuery({
    queryKey: adminKeys.seasonal,
    queryFn: () => api.get<{ month: string; revenue: number; orders: number; seasonalIndex: number }[]>('/analytics/seasonal'),
  });
}

export function useOrderHeatmap(period: RangePeriod) {
  return useQuery({
    queryKey: adminKeys.heatmap(period),
    queryFn: () =>
      api.get<{ cells: { day: string; dayIndex: number; hour: number; orders: number; revenue: number }[]; maxOrders: number }>(
        `/analytics/heatmap?period=${period}`,
      ),
    placeholderData: keepPreviousData,
  });
}

export function useProductPerformance(period: RangePeriod, limit = 10) {
  return useQuery({
    queryKey: adminKeys.products(period, limit),
    queryFn: () =>
      api.get<{ bestSelling: ProductPerformanceRow[]; leastSelling: ProductPerformanceRow[]; noSales: number; totalProductsSold: number }>(
        `/analytics/products?period=${period}&limit=${limit}`,
      ),
    placeholderData: keepPreviousData,
  });
}

export function useProductDemand(period: RangePeriod) {
  return useQuery({
    queryKey: adminKeys.demand(period),
    queryFn: () =>
      api.get<
        { productId: string; name: string; category: string; unitsSold: number; dailyVelocity: number; stock: number; daysOfCover: number | null; needsRestock: boolean }[]
      >(`/analytics/products/demand?period=${period}`),
    placeholderData: keepPreviousData,
  });
}

export function useCategoryPerformance(period: RangePeriod) {
  return useQuery({
    queryKey: adminKeys.categories(period),
    queryFn: () => api.get<CategoryPerformance[]>(`/analytics/categories?period=${period}`),
    placeholderData: keepPreviousData,
  });
}

export function useCustomerGrowth(period: RangePeriod) {
  return useQuery({
    queryKey: adminKeys.growth(period),
    queryFn: () => api.get<CustomerGrowthPoint[]>(`/analytics/customers/growth?period=${period}`),
    placeholderData: keepPreviousData,
  });
}

export function useRetention() {
  return useQuery({ queryKey: adminKeys.retention, queryFn: () => api.get<Retention>('/analytics/customers/retention') });
}

export function useCustomerSegments() {
  return useQuery({
    queryKey: adminKeys.segments,
    queryFn: () => api.get<{ segment: string; customers: number; revenue: number }[]>('/analytics/customers/segments'),
  });
}

export function useTopCustomers(period: RangePeriod, limit = 10) {
  return useQuery({
    queryKey: adminKeys.topCustomers(period),
    queryFn: () => api.get<TopCustomer[]>(`/analytics/customers/top?period=${period}&limit=${limit}`),
    placeholderData: keepPreviousData,
  });
}

export function useCustomerLocations(period: RangePeriod) {
  return useQuery({
    queryKey: adminKeys.locations(period),
    queryFn: () => api.get<{ city: string; state: string; orders: number; revenue: number; share: number }[]>(`/analytics/customers/locations?period=${period}`),
    placeholderData: keepPreviousData,
  });
}

export function useOrderStatusBreakdown(period: RangePeriod) {
  return useQuery({
    queryKey: adminKeys.orderStatus(period),
    queryFn: () => api.get<{ status: string; label: string; count: number; value: number; share: number }[]>(`/analytics/orders/status?period=${period}`),
    placeholderData: keepPreviousData,
  });
}

export function usePaymentBreakdown(period: RangePeriod) {
  return useQuery({
    queryKey: adminKeys.payments(period),
    queryFn: () => api.get<{ method: string; count: number; amount: number; paid: number }[]>(`/analytics/payments?period=${period}`),
    placeholderData: keepPreviousData,
  });
}

export function useForecast(days = 14) {
  return useQuery({
    queryKey: adminKeys.forecast(days),
    queryFn: () => api.get<Forecast>(`/analytics/forecast?days=${days}`),
  });
}

export function useInventorySummary() {
  return useQuery({ queryKey: adminKeys.inventorySummary, queryFn: () => api.get<InventorySummary>('/inventory/summary') });
}

export function useInventoryAlerts(limit = 10) {
  return useQuery({
    queryKey: adminKeys.inventoryAlerts,
    queryFn: () => api.get<StockAlert[]>(`/inventory/alerts?limit=${limit}`),
  });
}

export interface AdminInventoryFilters {
  search?: string;
  status?: 'all' | 'low' | 'out' | 'healthy';
  categoryId?: string;
  page?: number;
  limit?: number;
}

export function useAdminInventory(filters: AdminInventoryFilters) {
  return useQuery({
    queryKey: ['admin', 'inventory', filters],
    queryFn: () => api.list<InventoryRow[]>(`/inventory${toQueryString(filters as Record<string, unknown>)}`),
    placeholderData: keepPreviousData,
  });
}

export interface AdminCustomerFilters {
  search?: string;
  segment?: string;
  sort?: string;
  active?: boolean;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export function useAdminCustomers(filters: AdminCustomerFilters) {
  return useQuery({
    queryKey: adminKeys.customers(filters),
    queryFn: () => api.list<AdminCustomerRow[]>(`/customers${toQueryString(filters as Record<string, unknown>)}`),
    placeholderData: keepPreviousData,
  });
}

export function useRecommendationPerformance(period: RangePeriod) {
  return useQuery({
    queryKey: adminKeys.recPerformance(period),
    queryFn: () =>
      api.get<{
        totals: { impressions: number; clicks: number; addToCarts: number; purchases: number; clickThroughRate: number; cartRate: number; conversionRate: number };
        byStrategy: RecommendationFunnel[];
        byPlacement: RecommendationFunnel[];
        timeline: { date: string; impressions: number; clicks: number; purchases: number }[];
        topConvertingProducts: { productId: string; name: string; slug: string | null; purchases: number }[];
        bestStrategy: string | null;
      }>(`/recommendations/admin/performance?period=${period}`),
    placeholderData: keepPreviousData,
  });
}

// ------------------------------------------------------------- ABC & RFM ---

export type AbcClass = 'A' | 'B' | 'C';
export type XyzClass = 'X' | 'Y' | 'Z';

export interface AbcRow {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  category: string;
  revenue: number;
  unitsSold: number;
  stock: number;
  revenueShare: number;
  cumulativeShare: number;
  class: AbcClass;
  demandCv: number;
  xyzClass: XyzClass;
  combinedClass: `${AbcClass}${XyzClass}`;
}

export interface AbcResult {
  rows: AbcRow[];
  summary: { class: AbcClass; skuCount: number; revenue: number; revenueShare: number }[];
  xyzSummary: { class: XyzClass; skuCount: number; revenue: number }[];
  matrix: { cell: `${AbcClass}${XyzClass}`; skuCount: number; revenue: number }[];
}

export function useAbcAnalysis(period: RangePeriod) {
  return useQuery({
    queryKey: ['admin', 'abc', period],
    queryFn: () => api.get<AbcResult>(`/analytics/inventory/abc?period=${period}`),
    placeholderData: keepPreviousData,
  });
}

export interface CustomerRfm {
  userId: string;
  name: string;
  email: string;
  recencyDays: number;
  frequency: number;
  monetary: number;
  recencyScore: number;
  frequencyScore: number;
  monetaryScore: number;
  rfmScore: number;
  segment: string;
}

export function useCustomerRfm() {
  return useQuery({
    queryKey: ['admin', 'rfm'],
    queryFn: () => api.get<CustomerRfm[]>('/analytics/customers/rfm'),
  });
}

export interface CustomerCluster {
  clusterIndex: number;
  label: string;
  size: number;
  avgRecencyDays: number;
  avgFrequency: number;
  avgMonetary: number;
  members: { userId: string; name: string; email: string; segment: string }[];
}

export interface CustomerClusterResult {
  k: number;
  kSelection?: string;
  silhouette?: number;
  inertia: number;
  elbow?: { k: number; inertia: number; silhouette: number }[];
  clusters: CustomerCluster[];
}

/** Pass a `k` to force it; omit to let the server pick k by silhouette score. */
export function useCustomerClusters(k?: number) {
  return useQuery({
    queryKey: ['admin', 'clusters', k ?? 'auto'],
    queryFn: () =>
      api.get<CustomerClusterResult>(`/analytics/customers/clusters${k ? `?k=${k}` : ''}`),
  });
}
