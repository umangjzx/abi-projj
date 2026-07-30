import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toQueryString } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import type {
  Category,
  Notification,
  Offer,
  Order,
  Product,
  RecommendationPlacement,
  Review,
} from '@/types';

export interface ProductFilters {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  featured?: boolean;
  tags?: string[];
  sort?: string;
}

export const catalogKeys = {
  products: (filters: ProductFilters) => ['products', filters] as const,
  product: (idOrSlug: string) => ['product', idOrSlug] as const,
  related: (id: string) => ['product', id, 'related'] as const,
  categories: (tree: boolean) => ['categories', { tree }] as const,
  filterMeta: ['products', 'filter-meta'] as const,
  suggest: (term: string) => ['products', 'suggest', term] as const,
  reviews: (productId: string, page: number, sort: string) => ['reviews', productId, page, sort] as const,
  offers: ['offers', 'active'] as const,
  recommendations: (placement: string, extra?: string) => ['recommendations', placement, extra] as const,
  home: ['recommendations', 'home'] as const,
  recentlyViewed: ['recommendations', 'recently-viewed'] as const,
  orders: (page: number, status?: string) => ['orders', page, status] as const,
  order: (id: string) => ['order', id] as const,
  notifications: ['notifications'] as const,
};

export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: catalogKeys.products(filters),
    queryFn: () => api.list<Product[]>(`/products${toQueryString(filters as Record<string, unknown>)}`),
    // Keeps the previous page visible while the next one loads, so the grid
    // does not collapse to a spinner on every pagination click.
    placeholderData: keepPreviousData,
  });
}

export function useProduct(idOrSlug: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.product(idOrSlug ?? ''),
    queryFn: () => api.get<Product>(`/products/${idOrSlug}`),
    enabled: Boolean(idOrSlug),
  });
}

export function useRelatedProducts(productId: string | undefined, limit = 8) {
  return useQuery({
    queryKey: catalogKeys.related(productId ?? ''),
    queryFn: () => api.get<Product[]>(`/products/${productId}/related?limit=${limit}`),
    enabled: Boolean(productId),
  });
}

export function useCategories(tree = false) {
  return useQuery({
    queryKey: catalogKeys.categories(tree),
    queryFn: () => api.get<Category[]>(`/categories?tree=${tree}&withCounts=true`),
    // The category list rarely changes; cache it aggressively.
    staleTime: 5 * 60_000,
  });
}

export function useFilterMeta() {
  return useQuery({
    queryKey: catalogKeys.filterMeta,
    queryFn: () =>
      api.get<{ priceRange: { min: number; max: number }; categories: Category[]; ratings: number[] }>('/products/filters'),
    staleTime: 5 * 60_000,
  });
}

export interface Suggestions {
  products: { id: string; name: string; slug: string; image: string | null; category: string; price: number }[];
  categories: { id: string; name: string; slug: string }[];
}

export function useSuggestions(term: string) {
  return useQuery({
    queryKey: catalogKeys.suggest(term),
    queryFn: () => api.get<Suggestions>(`/products/suggest?q=${encodeURIComponent(term)}`),
    // The API returns nothing under two characters -- don't spend a request.
    enabled: term.trim().length >= 2,
    staleTime: 60_000,
  });
}

export function useProductReviews(productId: string | undefined, page = 1, sort = 'newest') {
  return useQuery({
    queryKey: catalogKeys.reviews(productId ?? '', page, sort),
    queryFn: () => api.list<Review[]>(`/reviews?productId=${productId}&page=${page}&sort=${sort}&limit=6`),
    enabled: Boolean(productId),
    placeholderData: keepPreviousData,
  });
}

export function useActiveOffers() {
  return useQuery({
    queryKey: catalogKeys.offers,
    queryFn: () => api.get<Offer[]>('/offers/active'),
    staleTime: 5 * 60_000,
  });
}

export interface HomeRails {
  featured: Product[];
  bestSellers: Product[];
  newArrivals: Product[];
  trending: Product[];
  personalised: Product[];
}

export function useHomeRails() {
  return useQuery({
    queryKey: catalogKeys.home,
    queryFn: () => api.get<HomeRails>('/recommendations/home'),
    staleTime: 2 * 60_000,
  });
}

export function useRecommendations(
  placement: RecommendationPlacement,
  options: { limit?: number; productIds?: string[]; excludeIds?: string[]; enabled?: boolean } = {},
) {
  const query = toQueryString({
    placement,
    limit: options.limit ?? 8,
    productIds: options.productIds,
    excludeIds: options.excludeIds,
  });

  return useQuery({
    queryKey: catalogKeys.recommendations(placement, query),
    queryFn: () => api.get<Product[]>(`/recommendations${query}`),
    enabled: options.enabled ?? true,
    staleTime: 2 * 60_000,
  });
}

export function useRecentlyViewed(limit = 10) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: catalogKeys.recentlyViewed,
    queryFn: () => api.get<Product[]>(`/recommendations/recently-viewed?limit=${limit}`),
    enabled: isAuthenticated,
  });
}

export function useOrders(page = 1, status?: string) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: catalogKeys.orders(page, status),
    queryFn: () => api.list<Order[]>(`/orders${toQueryString({ page, status, limit: 8 })}`),
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.order(id ?? ''),
    queryFn: () => api.get<Order>(`/orders/${id}`),
    enabled: Boolean(id),
  });
}

export function useNotifications() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: catalogKeys.notifications,
    queryFn: () => api.list<Notification[]>('/notifications?limit=15'),
    enabled: isAuthenticated,
    // Polled so the bell badge updates without a manual refresh.
    refetchInterval: 90_000,
  });
}

/**
 * Fire-and-forget recommendation funnel telemetry. Never throws: a blocked
 * analytics request must not break a product click.
 */
export function trackRecommendation(input: {
  productId: string;
  strategy: string;
  placement: string;
  event: 'CLICK' | 'ADD_TO_CART';
}) {
  void api.post('/recommendations/track', input).catch(() => undefined);
}
