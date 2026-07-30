import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Download, X } from 'lucide-react';
import { cn, formatCurrency, formatDate, ORDER_STATUS_STYLES } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, ErrorState, PageLoader } from '@/components/ui/feedback';
import { ProductImage } from '@/components/product/ProductImage';
import { OrderTracker } from '@/components/store/OrderTracker';
import { useOrder } from '@/hooks/useCatalog';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import type { OrderTracking } from '@/types';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: order, isLoading, error, refetch } = useOrder(id);
  const { data: tracking } = useQuery({
    queryKey: ['order-tracking', order?.orderNumber],
    queryFn: () => api.get<OrderTracking>(`/orders/track/${order!.orderNumber}`),
    enabled: Boolean(order?.orderNumber),
  });

  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState('');

  const cancelOrder = useMutation({
    mutationFn: () => api.post(`/orders/${id}/cancel`, { reason: cancelReason || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-tracking'] });
      setCancelDialogOpen(false);
      toast.success('Order cancelled');
    },
    onError: (err: ApiError) => toast.error('Could not cancel order', err.message),
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

  const canCancel = ['PENDING', 'CONFIRMED'].includes(order.status);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Link to="/account/orders" className="hover:text-foreground">My orders</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">{order.orderNumber}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{order.orderNumber}</h1>
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
          {canCancel && (
            <Button variant="outline" size="sm" onClick={() => setCancelDialogOpen(true)}>
              <X />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {tracking && <OrderTracker tracking={tracking} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* --- items --- */}
        <div className="rounded-xl border border-border bg-card shadow-soft">
          <div className="border-b border-border p-5">
            <h2 className="font-display text-base font-bold">Items ({order.items.length})</h2>
          </div>
          <div className="divide-y divide-border">
            {order.items.map((item) => (
              <div key={item.id} className="flex gap-4 p-4">
                <Link to={`/products/${item.productId}`} className="size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                  <ProductImage src={item.imageUrl} alt={item.productName} className="size-full object-cover" />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.variantName} · Qty {item.quantity}
                  </p>
                </div>
                <p className="shrink-0 font-semibold">{formatCurrency(item.lineTotal)}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-border p-5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-success">
                <span>Discount {order.coupon && `(${order.coupon.code})`}</span>
                <span>− {formatCurrency(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Delivery</span>
              <span>{order.deliveryFee === 0 ? 'FREE' : formatCurrency(order.deliveryFee)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax</span>
              <span>{formatCurrency(order.tax)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-display text-base font-bold">
              <span>Total</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        {/* --- shipping + payment --- */}
        <div className="space-y-4">
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
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Method</span>
                  <span className="font-medium">{order.payment.method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={order.payment.status === 'PAID' ? 'success' : 'outline'} size="sm">
                    {order.payment.status}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {order.notes && (
            <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
              <h2 className="font-display text-sm font-bold">Delivery notes</h2>
              <p className="mt-2 text-sm text-muted-foreground">{order.notes}</p>
            </div>
          )}

          {order.cancelReason && (
            <Alert variant="warning" title="Cancellation reason">
              {order.cancelReason}
            </Alert>
          )}
        </div>
      </div>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this order?</DialogTitle>
            <DialogDescription>This action cannot be undone. Let us know why, if you'd like.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason (optional)"
            maxLength={300}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Keep order
            </Button>
            <Button variant="destructive" onClick={() => cancelOrder.mutate()} loading={cancelOrder.isPending}>
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
