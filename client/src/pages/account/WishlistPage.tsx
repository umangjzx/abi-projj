import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ProductCardSkeleton } from '@/components/ui/feedback';
import { ProductCard } from '@/components/product/ProductCard';
import { useWishlist } from '@/hooks/useWishlist';

export default function WishlistPage() {
  const { data: products, isLoading, error, refetch } = useWishlist();

  return (
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight">My wishlist</h1>
      <p className="mt-1 text-sm text-muted-foreground">Products you've saved for later.</p>

      <div className="mt-6">
        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : products?.length === 0 ? (
          <EmptyState
            icon={<Heart />}
            title="Your wishlist is empty"
            description="Save products you love by tapping the heart icon."
            action={
              <Button asChild>
                <Link to="/products">Browse products</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {products?.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} showReason={false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
