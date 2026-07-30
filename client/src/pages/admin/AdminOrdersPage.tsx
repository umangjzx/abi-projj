import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ShoppingBag } from 'lucide-react';
import { cn, formatCurrency, formatDate, ORDER_STATUS_STYLES, toQueryString } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/primitives';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Pagination } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Order } from '@/types';

const STATUS_OPTIONS = ['all', 'PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED'];

export default function AdminOrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = React.useState(searchParams.get('search') ?? '');

  const page = Number(searchParams.get('page') ?? '1');
  const status = searchParams.get('status') ?? undefined;

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSearchParams((p) => {
        if (search) p.set('search', search);
        else p.delete('search');
        p.delete('page');
        return p;
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = { page, limit: 20, status, search: searchParams.get('search') ?? undefined };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'orders', filters],
    queryFn: () => api.list<Order[]>(`/orders/all${toQueryString(filters)}`),
  });

  const orders = data?.data;
  const meta = data?.meta;
  const statusCounts = (meta?.statusCounts as Record<string, number>) ?? {};

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl font-bold">Orders</h1>

      <div className="flex flex-wrap gap-3">
        <Input icon={<Search />} placeholder="Search order # or customer…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
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
              <SelectItem key={option} value={option}>
                {option === 'all' ? `All orders (${Object.values(statusCounts).reduce((a, b) => a + b, 0)})` : `${option.replace(/_/g, ' ')} (${statusCounts[option] ?? 0})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-soft">
        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="p-5">
            <TableSkeleton rows={8} cols={6} />
          </div>
        ) : orders?.length === 0 ? (
          <EmptyState icon={<ShoppingBag />} title="No orders found" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders?.map((order) => (
                <TableRow key={order.id} className="cursor-pointer">
                  <TableCell>
                    <Link to={`/admin/orders/${order.id}`} className="font-medium text-primary hover:underline">
                      {order.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{order.customer?.name}</p>
                    <p className="text-xs text-muted-foreground">{order.customer?.email}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(order.placedAt)}</TableCell>
                  <TableCell>{order.itemCount}</TableCell>
                  <TableCell className="font-semibold">{formatCurrency(order.total)}</TableCell>
                  <TableCell>
                    <Badge className={cn(ORDER_STATUS_STYLES[order.status])} variant="outline" size="sm">
                      {order.status.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {meta && meta.totalPages! > 1 && (
          <div className="border-t border-border p-4">
            <Pagination page={meta.page!} totalPages={meta.totalPages!} total={meta.total} limit={meta.limit} onPageChange={(next) => setSearchParams((p) => (p.set('page', String(next)), p))} />
          </div>
        )}
      </div>
    </div>
  );
}
