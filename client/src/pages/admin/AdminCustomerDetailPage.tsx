import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Mail, Phone, ShoppingBag, Star } from 'lucide-react';
import { cn, formatCurrency, formatDate, initials, ORDER_STATUS_STYLES, SEGMENT_STYLES } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/primitives';
import { ErrorState, PageLoader } from '@/components/ui/feedback';
import { StatCard } from '@/components/admin/StatCard';
import { api } from '@/lib/api';
import type { Segment } from '@/types';

interface CustomerDetail {
  profile: { id: string; name: string; email: string; phone: string | null; segment: Segment; isActive: boolean; emailVerified: boolean; createdAt: string };
  stats: {
    totalOrders: number;
    totalSpent: number;
    averageOrderValue: number;
    firstOrderAt: string | null;
    lastOrderAt: string | null;
    daysSinceLastOrder: number | null;
    wishlistItems: number;
    reviewsWritten: number;
    orderFrequencyDays: number | null;
  };
  ordersByStatus: Record<string, number>;
  recentOrders: { id: string; orderNumber: string; status: string; total: number; itemCount: number; placedAt: string }[];
  favouriteProducts: { productId: string; name: string; units: number; revenue: number }[];
  categoryMix: { name: string; units: number; revenue: number }[];
  reviews: { id: string; title: string | null; comment: string; rating: number | null; product: { name: string; slug: string }; createdAt: string }[];
  addresses: { id: string; label: string; city: string; state: string; isDefault: boolean }[];
}

export default function AdminCustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'customer', id],
    queryFn: () => api.get<CustomerDetail>(`/customers/${id}`),
  });

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error ?? new Error('Customer not found')} onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Link to="/admin/customers" className="hover:text-foreground">Customers</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">{data.profile.name}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-4">
        <Avatar className="size-16">
          <AvatarFallback className="text-lg">{initials(data.profile.name)}</AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-bold">{data.profile.name}</h1>
            <Badge className={cn(SEGMENT_STYLES[data.profile.segment])} variant="outline">
              {data.profile.segment.replace('_', ' ')}
            </Badge>
            {!data.profile.isActive && <Badge variant="destructive">Deactivated</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Mail className="size-3.5" />
              {data.profile.email}
            </span>
            {data.profile.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="size-3.5" />
                {data.profile.phone}
              </span>
            )}
            <span>Joined {formatDate(data.profile.createdAt, 'long')}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total orders" value={data.stats.totalOrders} />
        <StatCard label="Total spent" value={formatCurrency(data.stats.totalSpent)} />
        <StatCard label="Avg. order value" value={formatCurrency(data.stats.averageOrderValue)} />
        <StatCard label="Last order" value={data.stats.lastOrderAt ? formatDate(data.stats.lastOrderAt) : 'Never'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card shadow-soft">
          <div className="flex items-center gap-2 border-b border-border p-5">
            <ShoppingBag className="size-4" />
            <h2 className="font-display text-sm font-bold">Recent orders</h2>
          </div>
          <div className="divide-y divide-border">
            {data.recentOrders.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              data.recentOrders.map((order) => (
                <Link key={order.id} to={`/admin/orders/${order.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/40">
                  <div>
                    <p className="text-sm font-medium">{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(order.placedAt)}</p>
                  </div>
                  <Badge className={cn(ORDER_STATUS_STYLES[order.status])} variant="outline" size="sm">
                    {order.status.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-sm font-semibold">{formatCurrency(order.total)}</span>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-soft">
          <div className="border-b border-border p-5">
            <h2 className="font-display text-sm font-bold">Favourite products</h2>
          </div>
          <div className="divide-y divide-border">
            {data.favouriteProducts.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No purchase history yet.</p>
            ) : (
              data.favouriteProducts.map((product) => (
                <div key={product.productId} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.units} units</p>
                  </div>
                  <span className="text-sm font-semibold">{formatCurrency(product.revenue)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-soft">
        <div className="flex items-center gap-2 border-b border-border p-5">
          <Star className="size-4" />
          <h2 className="font-display text-sm font-bold">Reviews written</h2>
        </div>
        <div className="divide-y divide-border">
          {data.reviews.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No reviews yet.</p>
          ) : (
            data.reviews.map((review) => (
              <div key={review.id} className="p-4">
                <p className="text-sm font-medium">{review.product.name}</p>
                {review.title && <p className="mt-0.5 text-sm">{review.title}</p>}
                <p className="mt-1 text-sm text-muted-foreground">{review.comment}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
