import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Minus, Plus, ShoppingBag, Tag, Trash2, X } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, EmptyState, PageLoader } from '@/components/ui/feedback';
import { ProductImage } from '@/components/product/ProductImage';
import { ProductRail } from '@/components/product/ProductRail';
import { useCart, useAvailableCoupons } from '@/hooks/useCart';
import { useRecommendations } from '@/hooks/useCatalog';
import { useAuth } from '@/context/AuthContext';

export default function CartPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { cart, isLoading, updateItem, removeItem, applyCoupon, removeCoupon } = useCart();
  const { data: availableCoupons } = useAvailableCoupons();
  const { data: cartRecs } = useRecommendations('CART', {
    productIds: cart?.items.map((i) => i.product.id) ?? [],
    enabled: Boolean(cart?.items.length),
    limit: 6,
  });

  const [couponCode, setCouponCode] = React.useState('');

  if (authLoading) return <PageLoader />;

  if (!isAuthenticated) {
    return (
      <div className="container py-16">
        <EmptyState
          icon={<ShoppingBag />}
          title="Sign in to view your cart"
          description="Create an account or sign in to add items and check out."
          action={
            <Button asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (isLoading) return <PageLoader label="Loading your cart" />;

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container py-16">
        <EmptyState
          icon={<ShoppingBag />}
          title="Your cart is empty"
          description="Add some farm-fresh products to get started."
          action={
            <Button asChild>
              <Link to="/products">Start shopping</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const handleApplyCoupon = () => {
    if (!couponCode.trim()) return;
    applyCoupon.mutate(couponCode.trim().toUpperCase(), { onSuccess: () => setCouponCode('') });
  };

  return (
    <div className="container py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Your cart</h1>
      <p className="mt-1 text-sm text-muted-foreground">{cart.pricing.itemCount} item(s) in your cart</p>

      {cart.hasIssues && (
        <Alert variant="warning" icon={<AlertTriangle />} className="mt-4">
          Some items in your cart need attention before you can check out — see below.
        </Alert>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* --- items --- */}
        <div className="space-y-3">
          {cart.items.map((item) => (
            <div
              key={item.id}
              className={cn(
                'flex gap-4 rounded-xl border bg-card p-4 shadow-soft',
                !item.isAvailable || item.exceedsStock ? 'border-destructive/40' : 'border-border',
              )}
            >
              <Link to={`/products/${item.product.slug}`} className="size-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:size-24">
                <ProductImage src={item.product.image} alt={item.product.name} className="size-full object-cover" />
              </Link>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to={`/products/${item.product.slug}`} className="line-clamp-1 font-semibold hover:text-primary">
                      {item.product.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{item.variant.packSize ?? item.variant.name}</p>
                  </div>
                  <button
                    onClick={() => removeItem.mutate(item.id)}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remove ${item.product.name} from cart`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {!item.isAvailable ? (
                  <p className="mt-1.5 text-xs font-medium text-destructive">No longer available — please remove this item</p>
                ) : item.exceedsStock ? (
                  <p className="mt-1.5 text-xs font-medium text-destructive">Only {item.availableStock} left — reduce quantity</p>
                ) : null}

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center rounded-lg border border-input">
                    <button
                      onClick={() => updateItem.mutate({ itemId: item.id, quantity: item.quantity - 1 })}
                      className="flex size-8 items-center justify-center text-muted-foreground hover:text-foreground"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
                    <button
                      onClick={() => updateItem.mutate({ itemId: item.id, quantity: item.quantity + 1 })}
                      disabled={item.quantity >= item.availableStock}
                      className="flex size-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                      aria-label="Increase quantity"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>

                  <div className="text-right">
                    <p className="font-display font-bold">{formatCurrency(item.lineTotal)}</p>
                    {item.variant.mrp > item.variant.price && (
                      <p className="text-xs text-muted-foreground line-through">
                        {formatCurrency(item.variant.mrp * item.quantity)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* --- summary --- */}
        <div className="h-fit space-y-4 rounded-xl border border-border bg-card p-5 shadow-soft lg:sticky lg:top-20">
          <h2 className="font-display text-base font-bold">Order summary</h2>

          {/* --- coupon --- */}
          {cart.coupon ? (
            <div className="flex items-center justify-between rounded-lg bg-success/10 px-3 py-2.5 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-success">
                <Tag className="size-3.5" />
                {cart.coupon.code}
              </span>
              <button onClick={() => removeCoupon.mutate()} className="text-muted-foreground hover:text-foreground" aria-label="Remove coupon">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Coupon code"
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                />
                <Button variant="outline" onClick={handleApplyCoupon} loading={applyCoupon.isPending}>
                  Apply
                </Button>
              </div>
              {availableCoupons && availableCoupons.filter((c) => c.eligible).length > 0 && (
                <div className="space-y-1.5">
                  {availableCoupons
                    .filter((c) => c.eligible)
                    .slice(0, 2)
                    .map((coupon) => (
                      <button
                        key={coupon.code}
                        onClick={() => applyCoupon.mutate(coupon.code)}
                        className="flex w-full items-center justify-between rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-left text-xs hover:bg-primary/10"
                      >
                        <span className="font-medium text-primary">{coupon.code}</span>
                        <span className="text-muted-foreground">Save {formatCurrency(coupon.potentialDiscount)}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 border-t border-border pt-4 text-sm">
            <Row label="Subtotal" value={formatCurrency(cart.pricing.subtotal)} />
            {cart.pricing.discount > 0 && <Row label="Discount" value={`− ${formatCurrency(cart.pricing.discount)}`} valueClass="text-success" />}
            <Row
              label="Delivery"
              value={cart.pricing.deliveryFee === 0 ? 'FREE' : formatCurrency(cart.pricing.deliveryFee)}
              valueClass={cart.pricing.deliveryFee === 0 ? 'text-success' : undefined}
            />
            <Row label={`GST (${cart.config.taxPercent}%)`} value={formatCurrency(cart.pricing.tax)} />
          </div>

          {!cart.pricing.freeDeliveryEligible && cart.pricing.amountToFreeDelivery > 0 && (
            <p className="rounded-lg bg-accent/60 px-3 py-2 text-xs text-accent-foreground">
              Add {formatCurrency(cart.pricing.amountToFreeDelivery)} more for free delivery
            </p>
          )}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="font-display text-base font-bold">Total</span>
            <span className="font-display text-xl font-bold">{formatCurrency(cart.pricing.total)}</span>
          </div>

          <Button
            size="lg"
            className="w-full"
            disabled={cart.hasIssues}
            onClick={() => navigate('/checkout')}
          >
            Proceed to checkout
            <ArrowRight />
          </Button>

          {cart.pricing.savings > 0 && (
            <p className="text-center text-xs font-medium text-success">You're saving {formatCurrency(cart.pricing.savings)} on this order!</p>
          )}
        </div>
      </div>

      {cartRecs && cartRecs.length > 0 && (
        <div className="mt-14">
          <ProductRail title="Add these to your order" products={cartRecs} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium', valueClass)}>{value}</span>
    </div>
  );
}
