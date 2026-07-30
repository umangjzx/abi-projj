import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Heart, Package, Sparkles, Star, Wallet } from 'lucide-react';
import { cn, formatCurrency, formatDate, ORDER_STATUS_STYLES } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { PageLoader, ErrorState } from '@/components/ui/feedback';
import { ProductRail } from '@/components/product/ProductRail';
import { api } from '@/lib/api';
import { useRecommendations } from '@/hooks/useCatalog';
import type { CustomerOverview } from '@/types';

export default function CustomerDashboard() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['customer-overview'],
    queryFn: () => api.get<CustomerOverview>('/analytics/me'),
  });

  const { data: recommendations, isLoading: recsLoading } = useRecommendations('CUSTOMER_DASHBOARD', { limit: 8 });

  if (isLoading) return <PageLoader label="Loading your dashboard" />;
  if (error || !data) return <ErrorState error={error ?? new Error('Could not load dashboard')} onRetry={() => refetch()} />;

  const stats = [
    { label: 'Total orders', value: data.stats.totalOrders, icon: <Package />, href: '/account/orders' },
    { label: 'Total spent', value: formatCurrency(data.stats.totalSpent), icon: <Wallet /> },
    { label: 'Total saved', value: formatCurrency(data.stats.totalSaved), icon: <Sparkles /> },
    { label: 'Wishlist items', value: data.stats.wishlistItems, icon: <Heart />, href: '/account/wishlist' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Welcome back, {data.profile.name.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Member since {formatDate(data.profile.memberSince, 'long')}
          {data.stats.favouriteCategory && ` · Loves ${data.stats.favouriteCategory}`}
        </p>
      </div>

      {/* --- stat cards --- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => {
          const Card = (
            <div className="h-full rounded-xl border border-border bg-card p-4 shadow-soft transition-shadow hover:shadow-card">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">
                {stat.icon}
              </span>
              <p className="mt-3 font-display text-xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          );
          return stat.href ? (
            <Link key={stat.label} to={stat.href}>
              {Card}
            </Link>
          ) : (
            <div key={stat.label}>{Card}</div>
          );
        })}
      </div>

      {/* --- recent orders --- */}
      <div className="rounded-xl border border-border bg-card shadow-soft">
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="font-display text-base font-bold">Recent orders</h2>
          <Link to="/account/orders" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            View all
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {data.recentOrders.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">You haven't placed any orders yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {data.recentOrders.map((order) => (
              <Link key={order.id} to={`/account/orders/${order.id}`} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40">
                <div>
                  <p className="text-sm font-semibold">{order.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {order.itemCount} item(s) · {formatDate(order.placedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{formatCurrency(order.total)}</span>
                  <Badge className={cn('shrink-0', ORDER_STATUS_STYLES[order.status])} variant="outline">
                    {order.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* --- personalised recommendations --- */}
      <ProductRail
        title="Recommended for you"
        icon={<Sparkles />}
        products={recommendations}
        isLoading={recsLoading}
        viewAllHref="/products"
      />

      {data.stats.reviewsWritten === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4">
          <Star className="size-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            You haven't written any reviews yet.{' '}
            <Link to="/account/reviews" className="font-medium text-primary hover:underline">
              Share your feedback
            </Link>{' '}
            on products you've bought.
          </p>
        </div>
      )}
    </div>
  );
}
