import { Link } from 'react-router-dom';
import { Copy, Percent, Tag } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageLoader } from '@/components/ui/feedback';
import { ProductImage } from '@/components/product/ProductImage';
import { useActiveOffers } from '@/hooks/useCatalog';
import { useAvailableCoupons } from '@/hooks/useCart';
import { useAuth } from '@/context/AuthContext';
import type { AvailableCoupon } from '@/types';
import { useToast } from '@/components/ui/toast';

export default function OffersPage() {
  const { isAuthenticated } = useAuth();
  const { data: offers, isLoading } = useActiveOffers();
  const { data: coupons } = useAvailableCoupons();
  const toast = useToast();

  const copyCoupon = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Copied "${code}"`, 'Paste it at checkout to apply.');
  };

  if (isLoading) return <PageLoader label="Loading offers" />;

  return (
    <div className="container py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Offers & coupons</h1>
      <p className="mt-1 text-sm text-muted-foreground">Save more on your favourite dairy products.</p>

      {/* --- promotional banners --- */}
      <section className="mt-8">
        {!offers || offers.length === 0 ? (
          <EmptyState icon={<Percent />} title="No active offers right now" description="Check back soon for new deals." />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {offers.map((offer) => (
              <Link
                key={offer.id}
                to={offer.ctaHref ?? '/products'}
                className="group relative flex h-48 flex-col justify-end overflow-hidden rounded-xl bg-muted p-5 shadow-soft"
              >
                <ProductImage
                  src={offer.bannerUrl}
                  alt=""
                  className="absolute inset-0 size-full object-cover opacity-75 transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                <div className="relative">
                  {offer.discountPercent && (
                    <Badge variant="destructive" className="mb-2">
                      {offer.discountPercent}% OFF
                    </Badge>
                  )}
                  <p className="font-display text-lg font-bold text-white">{offer.title}</p>
                  {offer.subtitle && <p className="text-sm text-white/85">{offer.subtitle}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* --- coupons --- */}
      <section className="mt-12">
        <h2 className="mb-4 font-display text-xl font-bold tracking-tight">Available coupons</h2>

        {!isAuthenticated ? (
          <EmptyState
            icon={<Tag />}
            title="Sign in to see your coupons"
            description="Personalised offers based on your cart appear here once you're signed in."
            action={
              <Button asChild>
                <Link to="/login">Sign in</Link>
              </Button>
            }
          />
        ) : !coupons || coupons.length === 0 ? (
          <EmptyState icon={<Tag />} title="No coupons available" description="Add items to your cart to unlock eligible coupons." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {coupons.map((coupon: AvailableCoupon) => (
              <div
                key={coupon.code}
                className={cn(
                  'relative overflow-hidden rounded-xl border-2 border-dashed p-4 shadow-soft',
                  coupon.eligible ? 'border-primary/40 bg-primary/5' : 'border-border bg-card opacity-70',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-bold text-primary">{coupon.code}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{coupon.description}</p>
                  </div>
                  <button
                    onClick={() => copyCoupon(coupon.code)}
                    className="shrink-0 rounded-lg border border-input p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Copy code ${coupon.code}`}
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Min. order {formatCurrency(coupon.minOrderValue)}</span>
                  {coupon.expiresAt && <span className="text-muted-foreground">Valid till {formatDate(coupon.expiresAt)}</span>}
                </div>

                {!coupon.eligible && (
                  <p className="mt-2 text-xs font-medium text-warning">
                    Add {formatCurrency(coupon.amountNeeded)} more to your cart to use this
                  </p>
                )}
                {coupon.eligible && (
                  <p className="mt-2 text-xs font-medium text-success">You save {formatCurrency(coupon.potentialDiscount)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
