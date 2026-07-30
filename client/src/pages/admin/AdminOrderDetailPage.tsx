import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Download, Mail, Phone } from 'lucide-react';
import { cn, formatCurrency, formatDate, ORDER_STATUS_STYLES } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/primitives';
import { Textarea } from '@/components/ui/input';
import { Alert, ErrorState, PageLoader } from '@/components/ui/feedback';
import { ProductImage } from '@/components/product/ProductImage';
import { useOrder } from '@/hooks/useCatalog';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import type { OrderStatus } from '@/types';

const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['OUT_FOR_DELIVERY', 'RETURNED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: order, isLoading, error, refetch } = useOrder(id);
  const [nextStatus, setNextStatus] = React.useState<OrderStatus | ''>('');
  const [note, setNote] = React.useState('');

  const updateStatus = useMutation({
    mutationFn: () => api.patch(`/orders/${id}/status`, { status: nextStatus, note: note || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      setNextStatus('');
      setNote('');
      toast.success('Order status updated');
    },
    onError: (err: ApiError) => toast.error('Could not update status', err.message),
  });

  const downloadInvoice = async () => {
    if (!order) return;
    try {
      await api.download(`/orders/${order.id}/invoice`, `invoice-${order.orderNumber}.pdf`);
    } catch {
      toast.error('Could not download invoice');
    }
  };

  if (isLoading) return <PageLoader />;
  if (error || !order) return <ErrorState error={error ?? new Error('Order not found')} onRetry={() => refetch()} />;

  const options = NEXT_STATUS[order.status];

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Link to="/admin/orders" className="hover:text-foreground">Orders</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">{order.orderNumber}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Placed on {formatDate(order.placedAt, 'long')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn(ORDER_STATUS_STYLES[order.status])} variant="outline">
            {order.status.replace(/_/g, ' ')}
          </Badge>
          <Button variant="outline" size="sm" onClick={downloadInvoice}>
            <Download />
            Invoice
          </Button>
        </div>
      </div>

      {options.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <h2 className="mb-3 font-display text-sm font-bold">Update status</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">New status</label>
              <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as OrderStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-10" placeholder="Reason or note for this change" />
            </div>
            <Button disabled={!nextStatus} onClick={() => updateStatus.mutate()} loading={updateStatus.isPending}>
              Update
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card shadow-soft">
            <div className="border-b border-border p-5">
              <h2 className="font-display text-sm font-bold">Items ({order.items.length})</h2>
            </div>
            <div className="divide-y divide-border">
              {order.items.map((item) => (
                <div key={item.id} className="flex gap-4 p-4">
                  <span className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <ProductImage src={item.imageUrl} alt={item.productName} className="size-full object-cover" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.variantName} · SKU {item.sku} · Qty {item.quantity}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold">{formatCurrency(item.lineTotal)}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2 border-t border-border p-5 text-sm">
              <Row label="Subtotal" value={formatCurrency(order.subtotal)} />
              {order.discount > 0 && <Row label={`Discount ${order.coupon ? `(${order.coupon.code})` : ''}`} value={`− ${formatCurrency(order.discount)}`} />}
              <Row label="Delivery" value={order.deliveryFee === 0 ? 'FREE' : formatCurrency(order.deliveryFee)} />
              <Row label="Tax" value={formatCurrency(order.tax)} />
              <div className="flex justify-between border-t border-border pt-2 font-display text-base font-bold">
                <span>Total</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-soft">
            <div className="border-b border-border p-5">
              <h2 className="font-display text-sm font-bold">Timeline</h2>
            </div>
            <div className="space-y-4 p-5">
              {order.timeline.map((event, index) => (
                <div key={index} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="size-2.5 shrink-0 rounded-full bg-primary" />
                    {index < order.timeline.length - 1 && <span className="w-px flex-1 bg-border" />}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-medium">{event.status.replace(/_/g, ' ')}</p>
                    {event.note && <p className="text-xs text-muted-foreground">{event.note}</p>}
                    <p className="text-xs text-muted-foreground">
                      {formatDate(event.at, 'full')} · by {event.by}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
            <h2 className="font-display text-sm font-bold">Customer</h2>
            <div className="mt-3">
              <Link to={`/admin/customers/${order.customer?.id}`} className="font-medium text-primary hover:underline">
                {order.customer?.name}
              </Link>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="size-3" />
                {order.customer?.email}
              </p>
              {order.customer?.phone && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="size-3" />
                  {order.customer.phone}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
            <h2 className="font-display text-sm font-bold">Delivery address</h2>
            <div className="mt-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{order.shipTo.fullName}</p>
              <p>{order.shipTo.line1}</p>
              {order.shipTo.line2 && <p>{order.shipTo.line2}</p>}
              <p>
                {order.shipTo.city}, {order.shipTo.state} {order.shipTo.pincode}
              </p>
              <p className="mt-1">{order.shipTo.phone}</p>
            </div>
          </div>

          {order.payment && (
            <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
              <h2 className="font-display text-sm font-bold">Payment</h2>
              <div className="mt-3 space-y-1.5 text-sm">
                <Row label="Method" value={order.payment.method} />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={order.payment.status === 'PAID' ? 'success' : 'outline'} size="sm">
                    {order.payment.status}
                  </Badge>
                </div>
                {order.payment.transactionRef && <Row label="Reference" value={order.payment.transactionRef} />}
              </div>
            </div>
          )}

          {order.cancelReason && (
            <Alert variant="warning" title="Cancellation reason">
              {order.cancelReason}
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
