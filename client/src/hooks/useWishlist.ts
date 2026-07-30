import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/toast';
import type { Product } from '@/types';

export const wishlistKeys = {
  all: ['wishlist'] as const,
  ids: ['wishlist', 'ids'] as const,
};

/** Full wishlist with product payloads, for the wishlist page. */
export function useWishlist() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: wishlistKeys.all,
    queryFn: () => api.get<Product[]>('/wishlist'),
    enabled: isAuthenticated,
  });
}

/**
 * Just the ids, so every product card across the app can render its heart state
 * from one cached request instead of one per card.
 */
export function useWishlistIds() {
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: wishlistKeys.ids,
    queryFn: () => api.get<string[]>('/wishlist/ids'),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  return {
    ids: query.data ?? [],
    has: (productId: string) => (query.data ?? []).includes(productId),
    isLoading: query.isLoading,
  };
}

export function useToggleWishlist() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { isAuthenticated } = useAuth();

  return useMutation({
    mutationFn: (productId: string) => api.post<{ productId: string; inWishlist: boolean }>('/wishlist/toggle', { productId }),

    // Optimistic update: the heart must respond on the same frame it is
    // clicked, or the interaction feels broken.
    onMutate: async (productId) => {
      if (!isAuthenticated) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: wishlistKeys.ids });
      const previous = queryClient.getQueryData<string[]>(wishlistKeys.ids) ?? [];
      queryClient.setQueryData<string[]>(
        wishlistKeys.ids,
        previous.includes(productId) ? previous.filter((id) => id !== productId) : [...previous, productId],
      );
      return { previous };
    },

    onError: (error: ApiError, _productId, context) => {
      if (context?.previous) queryClient.setQueryData(wishlistKeys.ids, context.previous);
      toast.error('Could not update wishlist', error.message);
    },

    onSuccess: (result) => {
      toast.info(result.inWishlist ? 'Saved to wishlist' : 'Removed from wishlist');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: wishlistKeys.ids });
      queryClient.invalidateQueries({ queryKey: wishlistKeys.all });
    },
  });
}
