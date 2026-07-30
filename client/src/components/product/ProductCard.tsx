import * as React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, ShoppingCart, Sparkles, Star } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCart } from '@/hooks/useCart';
import { useToggleWishlist, useWishlistIds } from '@/hooks/useWishlist';
import { useAuth } from '@/context/AuthContext';
import { trackRecommendation } from '@/hooks/useCatalog';
import { ProductImage } from './ProductImage';
import type { Product } from '@/types';

export interface ProductCardProps {
  product: Product;
  /** Shows the "why we picked this" chip when the product came from a recommendation. */
  showReason?: boolean;
  className?: string;
  index?: number;
}

export function ProductCard({ product, showReason = true, className, index = 0 }: ProductCardProps) {
  const { isAuthenticated } = useAuth();
  const { addItem } = useCart();
  const { has } = useWishlistIds();
  const toggleWishlist = useToggleWishlist();

  const variant = product.defaultVariant;
  const inWishlist = has(product.id);
  const discount = variant?.discountPercent ?? 0;
  const recommendation = product.recommendation;

  const handleAddToCart = (event: React.MouseEvent) => {
    // The card is wrapped in a Link; stop the click from navigating.
    event.preventDefault();
    event.stopPropagation();

    if (!variant) return;
    addItem.mutate({ variantId: variant.id, quantity: 1 });

    if (recommendation) {
      trackRecommendation({
        productId: product.id,
        strategy: recommendation.strategy,
        placement: recommendation.placement,
        event: 'ADD_TO_CART',
      });
    }
  };

  const handleWishlist = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    toggleWishlist.mutate(product.id);
  };

  const handleCardClick = () => {
    if (recommendation) {
      trackRecommendation({
        productId: product.id,
        strategy: recommendation.strategy,
        placement: recommendation.placement,
        event: 'CLICK',
      });
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      // Stagger is capped so a 60-item grid does not take seconds to appear.
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.32) }}
      className={cn('group h-full', className)}
    >
      <Link
        to={`/products/${product.slug}`}
        onClick={handleCardClick}
        className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <ProductImage
            src={product.primaryImage}
            alt={product.name}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
          />

          {/* --- corner badges --- */}
          <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
            {discount > 0 && <Badge variant="destructive" size="sm">{discount}% off</Badge>}
            {product.isFeatured && <Badge variant="default" size="sm">Featured</Badge>}
            {!product.inStock && <Badge variant="muted" size="sm">Out of stock</Badge>}
            {product.inStock && variant?.isLowStock && (
              <Badge variant="warning" size="sm">Only {variant.stock} left</Badge>
            )}
          </div>

          <button
            type="button"
            onClick={handleWishlist}
            disabled={!isAuthenticated || toggleWishlist.isPending}
            aria-label={inWishlist ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
            aria-pressed={inWishlist}
            title={isAuthenticated ? undefined : 'Sign in to save items'}
            className={cn(
              'absolute right-2.5 top-2.5 flex size-8 items-center justify-center rounded-full backdrop-blur-sm transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              inWishlist
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-background/85 text-muted-foreground hover:bg-background hover:text-destructive',
              !isAuthenticated && 'cursor-not-allowed opacity-55',
            )}
          >
            <Heart className={cn('size-4', inWishlist && 'fill-current')} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-primary">
              {product.category?.name}
            </span>
            {product.ratingCount > 0 && (
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                <Star className="size-3 fill-amber-400 text-amber-400" />
                {product.avgRating.toFixed(1)}
                <span className="text-muted-foreground/70">({product.ratingCount})</span>
              </span>
            )}
          </div>

          <h3 className="line-clamp-2 font-display text-[15px] font-semibold leading-snug">{product.name}</h3>

          {product.shortDescription && (
            <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{product.shortDescription}</p>
          )}

          {showReason && recommendation && (
            <p className="flex items-start gap-1.5 rounded-md bg-accent/60 px-2 py-1.5 text-[11px] font-medium text-accent-foreground">
              <Sparkles className="mt-px size-3 shrink-0" />
              <span className="line-clamp-1">{recommendation.reason}</span>
            </p>
          )}

          {/* mt-auto pins the price row to the bottom so cards align in a grid */}
          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-lg font-bold">{formatCurrency(product.minPrice)}</span>
                {variant && variant.mrp > variant.price && (
                  <span className="text-xs text-muted-foreground line-through">{formatCurrency(variant.mrp)}</span>
                )}
              </div>
              <p className="truncate text-[11px] text-muted-foreground">
                {variant?.packSize ?? variant?.name}
                {product.variants.length > 1 && ` · ${product.variants.length} sizes`}
              </p>
            </div>

            <Button
              size="sm"
              onClick={handleAddToCart}
              disabled={!product.inStock || !isAuthenticated || addItem.isPending}
              loading={addItem.isPending && addItem.variables?.variantId === variant?.id}
              title={
                !product.inStock ? 'Out of stock' : !isAuthenticated ? 'Sign in to add items to your cart' : 'Add to cart'
              }
              className="shrink-0"
            >
              {!addItem.isPending && <ShoppingCart />}
              <span className="sr-only sm:not-sr-only">Add</span>
            </Button>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}
