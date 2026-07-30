import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, Heart, Minus, Plus, Scale, Share2, ShieldCheck, ShoppingCart, Star, Truck } from 'lucide-react';
import { cn, discountPercent, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { PageLoader, ErrorState } from '@/components/ui/feedback';
import { ProductImage } from '@/components/product/ProductImage';
import { ProductRail } from '@/components/product/ProductRail';
import { ReviewList } from '@/components/store/ReviewList';
import { WriteReviewForm } from '@/components/store/WriteReviewForm';
import { useProduct, useRelatedProducts, useRecommendations } from '@/hooks/useCatalog';
import { useCart } from '@/hooks/useCart';
import { useToggleWishlist, useWishlistIds } from '@/hooks/useWishlist';
import { useCompare } from '@/context/CompareContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/toast';
import type { ProductVariant } from '@/types';

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated } = useAuth();

  const { data: product, isLoading, error, refetch } = useProduct(slug);
  const { addItem } = useCart();
  const { has } = useWishlistIds();
  const toggleWishlist = useToggleWishlist();
  const compare = useCompare();

  const [selectedVariantId, setSelectedVariantId] = React.useState<string | null>(null);
  const [quantity, setQuantity] = React.useState(1);
  const [activeImage, setActiveImage] = React.useState(0);

  React.useEffect(() => {
    if (product) {
      setSelectedVariantId(product.defaultVariant?.id ?? product.variants[0]?.id ?? null);
      setQuantity(1);
      setActiveImage(0);
    }
  }, [product?.id]);

  const { data: related } = useRelatedProducts(product?.id, 8);
  const { data: fbtProducts } = useRecommendations('PRODUCT_DETAIL', {
    productIds: product ? [product.id] : [],
    enabled: Boolean(product),
    limit: 6,
  });

  if (isLoading) return <PageLoader label="Loading product" />;
  if (error || !product) return <ErrorState error={error ?? new Error('Product not found')} onRetry={() => refetch()} className="container py-16" />;

  const variant: ProductVariant | undefined = product.variants.find((v) => v.id === selectedVariantId) ?? product.defaultVariant ?? product.variants[0];
  const discount = variant ? discountPercent(variant.mrp, variant.price) : 0;
  const inWishlist = has(product.id);
  const inCompare = compare.has(product.id);

  const handleAddToCart = () => {
    if (!variant) return;
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/products/${product.slug}` } });
      return;
    }
    addItem.mutate({ variantId: variant.id, quantity });
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: product.name, url });
      } catch {
        /* user cancelled the native share sheet */
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    }
  };

  return (
    <div className="container py-8">
      {/* --- breadcrumb --- */}
      <nav className="mb-6 flex items-center gap-1.5 text-[13px] text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-foreground">Home</Link>
        <ChevronRight className="size-3.5" />
        <Link to="/products" className="hover:text-foreground">Products</Link>
        {product.category && (
          <>
            <ChevronRight className="size-3.5" />
            <Link to={`/products?category=${product.category.slug}`} className="hover:text-foreground">
              {product.category.name}
            </Link>
          </>
        )}
        <ChevronRight className="size-3.5" />
        <span className="truncate text-foreground">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* --- gallery --- */}
        <div>
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted shadow-soft">
            <ProductImage
              src={product.images[activeImage]?.url ?? product.primaryImage}
              alt={product.name}
              className="size-full object-cover"
            />
            {discount > 0 && (
              <Badge variant="destructive" className="absolute left-3 top-3">
                {discount}% OFF
              </Badge>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="mt-3 flex gap-2.5">
              {product.images.map((image, index) => (
                <button
                  key={image.id}
                  onClick={() => setActiveImage(index)}
                  aria-label={`View image ${index + 1}`}
                  aria-current={index === activeImage}
                  className={cn(
                    'size-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors',
                    index === activeImage ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100',
                  )}
                >
                  <ProductImage src={image.url} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* --- details --- */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link to={`/products?category=${product.category?.slug}`} className="text-xs font-semibold uppercase tracking-wide text-primary">
                {product.category?.name}
              </Link>
              <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">{product.name}</h1>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button variant="outline" size="icon" onClick={handleShare} aria-label="Share this product">
                <Share2 />
              </Button>
              <Button
                variant={inCompare ? 'default' : 'outline'}
                size="icon"
                onClick={() => compare.toggle(product.id)}
                aria-pressed={inCompare}
                aria-label={inCompare ? 'Remove from comparison' : 'Add to comparison'}
              >
                <Scale />
              </Button>
              <Button
                variant={inWishlist ? 'default' : 'outline'}
                size="icon"
                onClick={() => toggleWishlist.mutate(product.id)}
                disabled={!isAuthenticated}
                aria-pressed={inWishlist}
                aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
              >
                <Heart className={cn(inWishlist && 'fill-current')} />
              </Button>
            </div>
          </div>

          {product.ratingCount > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <span className="flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                <Star className="size-3.5 fill-current" />
                {product.avgRating.toFixed(1)}
              </span>
              <span className="text-sm text-muted-foreground">{product.ratingCount} ratings · {product.reviewCount} reviews</span>
            </div>
          )}

          {product.shortDescription && <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{product.shortDescription}</p>}

          {/* --- price --- */}
          <div className="mt-5 flex items-baseline gap-3">
            <span className="font-display text-3xl font-bold">{formatCurrency(variant?.price)}</span>
            {variant && variant.mrp > variant.price && (
              <>
                <span className="text-lg text-muted-foreground line-through">{formatCurrency(variant.mrp)}</span>
                <Badge variant="destructive">{discount}% off</Badge>
              </>
            )}
          </div>

          {/* --- variant picker --- */}
          {product.variants.length > 1 && (
            <div className="mt-6">
              <p className="mb-2 text-sm font-semibold">Pack size</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariantId(v.id)}
                    disabled={!v.isActive}
                    className={cn(
                      'rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors',
                      v.id === variant?.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-input hover:border-primary/50',
                      !v.isActive && 'cursor-not-allowed opacity-40',
                    )}
                  >
                    {v.packSize ?? v.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* --- stock status --- */}
          <div className="mt-4">
            {!variant?.inStock ? (
              <Badge variant="muted">Out of stock</Badge>
            ) : variant.isLowStock ? (
              <Badge variant="warning">Only {variant.stock} left — order soon</Badge>
            ) : (
              <Badge variant="success">In stock</Badge>
            )}
          </div>

          {/* --- quantity + add to cart --- */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-lg border border-input">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="flex size-10 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
              >
                <Minus className="size-4" />
              </button>
              <span className="w-10 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                {quantity}
              </span>
              <button
                onClick={() => setQuantity((q) => Math.min(variant?.stock ?? 10, q + 1))}
                className="flex size-10 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                disabled={quantity >= (variant?.stock ?? 10)}
                aria-label="Increase quantity"
              >
                <Plus className="size-4" />
              </button>
            </div>

            <Button
              size="lg"
              className="flex-1 sm:flex-none"
              onClick={handleAddToCart}
              disabled={!variant?.inStock}
              loading={addItem.isPending}
            >
              {!addItem.isPending && <ShoppingCart />}
              Add to cart
            </Button>
          </div>

          {/* --- trust points --- */}
          <div className="mt-6 grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/40 p-4">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Truck className="size-4 shrink-0 text-primary" />
              Free delivery above ₹499
            </div>
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0 text-primary" />
              Quality assured
            </div>
          </div>

          {/* --- attributes --- */}
          {Object.keys(product.attributes).length > 0 && (
            <dl className="mt-6 divide-y divide-border rounded-xl border border-border">
              {Object.entries(product.attributes).map(([key, value]) => (
                <div key={key} className="flex justify-between px-4 py-2.5 text-sm">
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd className="font-medium">{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {/* --- description / reviews tabs --- */}
      <div className="mt-14">
        <Tabs defaultValue="description">
          <TabsList>
            <TabsTrigger value="description">Description</TabsTrigger>
            <TabsTrigger value="reviews">Reviews ({product.reviewCount})</TabsTrigger>
          </TabsList>
          <TabsContent value="description">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground"
            >
              {product.description}
            </motion.p>
          </TabsContent>
          <TabsContent value="reviews">
            <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
              <ReviewList productId={product.id} />
              <WriteReviewForm productId={product.id} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* --- frequently bought together --- */}
      {fbtProducts && fbtProducts.length > 0 && (
        <div className="mt-14">
          <ProductRail title="Frequently bought together" products={fbtProducts} />
        </div>
      )}

      {/* --- related --- */}
      {related && related.length > 0 && (
        <div className="mt-14">
          <ProductRail title="You may also like" products={related} showReason={false} />
        </div>
      )}
    </div>
  );
}
