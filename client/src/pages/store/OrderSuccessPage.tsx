import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Download, Package, Receipt } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageLoader, ErrorState } from '@/components/ui/feedback';
import { useOrder } from '@/hooks/useCatalog';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

export default function OrderSuccessPage() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading, error, refetch } = useOrder(id);
  const toast = useToast();

  const downloadInvoice = async () => {
    if (!order) return;
    try {
      await api.download(`/orders/${order.id}/invoice`, `invoice-${order.orderNumber}.pdf`);
    } catch {
      toast.error('Could not download invoice');
    }
  };

  if (isLoading) return <PageLoader />;
  if (error || !order) return <ErrorState error={error ?? new Error('Order not found')} onRetry={() => refetch()} className="container py-16" />;

  return (
    <div className="container max-w-2xl py-16 text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="mx-auto flex size-20 items-center justify-center rounded-full bg-success/10 text-success"
      >
        <CheckCircle2 className="size-10" />
      </motion.div>

      <h1 className="mt-6 font-display text-2xl font-bold sm:text-3xl">Order placed successfully!</h1>
      <p className="mt-2 text-muted-foreground">
        Thank you for your order. We've sent a confirmation to your email and will notify you as it progresses.
      </p>

      <div className="mt-8 rounded-xl border border-border bg-card p-6 text-left shadow-soft">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <p className="text-xs text-muted-foreground">Order number</p>
            <p className="font-display text-lg font-bold">{order.orderNumber}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Placed on</p>
            <p className="font-medium">{formatDate(order.placedAt, 'long')}</p>
          </div>
        </div>

        <div className="space-y-2.5 py-4">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {item.productName} ({item.variantName}) × {item.quantity}
              </span>
              <span className="font-medium">{formatCurrency(item.lineTotal)}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <span className="font-display font-bold">Total paid</span>
          <span className="font-display text-lg font-bold">{formatCurrency(order.total)}</span>
        </div>

        <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{order.shipTo.fullName}</p>
          <p>
            {order.shipTo.line1}, {order.shipTo.city}, {order.shipTo.state} {order.shipTo.pincode}
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link to={`/account/orders/${order.id}`}>
            <Package />
            Track order
          </Link>
        </Button>
        <Button variant="outline" onClick={downloadInvoice}>
          <Download />
          Download invoice
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/products">
            <Receipt />
            Continue shopping
          </Link>
        </Button>
      </div>
    </div>
  );
}
