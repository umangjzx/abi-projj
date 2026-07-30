import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Package } from 'lucide-react';
import { cn, formatCurrency, formatDate, ORDER_STATUS_STYLES } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/primitives';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/feedback';
import { Pagination } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useOrders } from '@/hooks/useCatalog';
import { ProductImage } from '@/components/product/ProductImage';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All orders' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PACKED', label: 'Packed' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'RETURNED', label: 'Returned' },
];

export default function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') ?? '1');
  const status = searchParams.get('status') ?? undefined;

  const { data, isLoading, error, refetch } = useOrders(page, status);
  const orders = data?.data;
  const meta = data?.meta;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">My orders</h1>
        <Select
          value={status ?? 'all'}
          onValueChange={(value) =>
            setSearchParams((p) => {
              if (value === 'all') p.delete('status');
              else p.set('status', value);
              p.delete('page');
              return p;
            })
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <TableSkeleton rows={5} cols={1} />
      ) : orders?.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="No orders found"
          description={status ? 'No orders match this filter.' : "You haven't placed any orders yet."}
          action={
            <Button asChild>
              <Link to="/products">Start shopping</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {orders?.map((order) => (
              <Link
                key={order.id}
                to={`/account/orders/${order.id}`}
                className="block rounded-xl border border-border bg-card p-4 shadow-soft transition-shadow hover:shadow-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">Placed on {formatDate(order.placedAt, 'long')}</p>
                  </div>
                  <Badge className={cn(ORDER_STATUS_STYLES[order.status])} variant="outline">
                    {order.status.replace(/_/g, ' ')}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  {order.items.slice(0, 5).map((item) => (
                    <span key={item.id} className="size-11 shrink-0 overflow-hidden rounded-lg bg-muted">
                      <ProductImage src={item.imageUrl} alt={item.productName} className="size-full object-cover" />
                    </span>
                  ))}
                  {order.items.length > 5 && (
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium text-muted-foreground">
                      +{order.items.length - 5}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-xs text-muted-foreground">{order.itemCount} item(s)</span>
                  <span className="font-display font-bold">{formatCurrency(order.total)}</span>
                </div>
              </Link>
            ))}
          </div>

          {meta && meta.totalPages! > 1 && (
            <Pagination
              className="mt-6"
              page={meta.page!}
              totalPages={meta.totalPages!}
              total={meta.total}
              limit={meta.limit}
              onPageChange={(next) => setSearchParams((p) => (p.set('page', String(next)), p))}
            />
          )}
        </>
      )}
    </div>
  );
}
