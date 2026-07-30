import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/toast';
import type { AvailableCoupon, Cart } from '@/types';

export const cartKeys = {
  all: ['cart'] as const,
  coupons: ['cart', 'coupons'] as const,
};

/**
 * Cart state. The server owns the cart for signed-in customers, so this is a
 * thin React Query wrapper: every mutation returns the whole recomputed cart,
 * which we write straight into the cache. That keeps the displayed total and
 * the total the server will charge in lockstep.
 */
export function useCart() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const query = useQuery({
    queryKey: cartKeys.all,
    queryFn: () => api.get<Cart>('/cart'),
    enabled: isAuthenticated,
    staleTime: 15_000,
  });

  const write = (cart: Cart) => queryClient.setQueryData(cartKeys.all, cart);

  const addItem = useMutation({
    mutationFn: ({ variantId, quantity = 1 }: { variantId: string; quantity?: number }) =>
      api.post<Cart>('/cart/items', { variantId, quantity }),
    onSuccess: (cart) => {
      write(cart);
      toast.success('Added to cart');
    },
    onError: (error: ApiError) => toast.error('Could not add to cart', error.message),
  });

  const updateItem = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      api.patch<Cart>(`/cart/items/${itemId}`, { quantity }),
    onSuccess: write,
    onError: (error: ApiError) => toast.error('Could not update quantity', error.message),
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.delete<Cart>(`/cart/items/${itemId}`),
    onSuccess: (cart) => {
      write(cart);
      toast.info('Removed from cart');
    },
    onError: (error: ApiError) => toast.error('Could not remove item', error.message),
  });

  const clear = useMutation({
    mutationFn: () => api.delete<Cart>('/cart'),
    onSuccess: write,
  });

  const applyCoupon = useMutation({
    mutationFn: (code: string) => api.post<Cart>('/cart/coupon', { code }),
    onSuccess: (cart) => {
      write(cart);
      queryClient.invalidateQueries({ queryKey: cartKeys.coupons });
      toast.success('Coupon applied', `You saved ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(cart.pricing.discount)}`);
    },
    onError: (error: ApiError) => toast.error('Coupon not applied', error.message),
  });

  const removeCoupon = useMutation({
    mutationFn: () => api.delete<Cart>('/cart/coupon'),
    onSuccess: (cart) => {
      write(cart);
      queryClient.invalidateQueries({ queryKey: cartKeys.coupons });
    },
  });

  return {
    cart: query.data,
    items: query.data?.items ?? [],
    pricing: query.data?.pricing,
    itemCount: query.data?.pricing.itemCount ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    addItem,
    updateItem,
    removeItem,
    clear,
    applyCoupon,
    removeCoupon,
    isMutating:
      addItem.isPending || updateItem.isPending || removeItem.isPending || applyCoupon.isPending || removeCoupon.isPending,
  };
}

export function useAvailableCoupons() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: cartKeys.coupons,
    queryFn: () => api.get<AvailableCoupon[]>('/coupons/available'),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}
