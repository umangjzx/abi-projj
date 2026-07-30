import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Building2, CreditCard, MapPin, Plus, Smartphone, Wallet } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Alert, PageLoader } from '@/components/ui/feedback';
import { Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCart } from '@/hooks/useCart';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { AddressForm } from '@/components/account/AddressForm';
import type { Address, Order, PaymentMethod } from '@/types';

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: 'UPI', label: 'UPI', icon: <Smartphone />, hint: 'Google Pay, PhonePe, Paytm' },
  { value: 'CARD', label: 'Credit / Debit Card', icon: <CreditCard />, hint: 'Visa, Mastercard, RuPay' },
  { value: 'NETBANKING', label: 'Net Banking', icon: <Building2 />, hint: 'All major banks' },
  { value: 'WALLET', label: 'Wallet', icon: <Wallet />, hint: 'Paytm, Amazon Pay' },
  { value: 'COD', label: 'Cash on Delivery', icon: <Banknote />, hint: 'Pay when your order arrives' },
];

export default function CheckoutPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { cart, isLoading: cartLoading } = useCart();

  const { data: addresses, isLoading: addressesLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api.get<Address[]>('/addresses'),
  });

  const [selectedAddressId, setSelectedAddressId] = React.useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>('UPI');
  const [notes, setNotes] = React.useState('');
  const [addressDialogOpen, setAddressDialogOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (addresses && addresses.length > 0 && !selectedAddressId) {
      setSelectedAddressId(addresses.find((a) => a.isDefault)?.id ?? addresses[0].id);
    }
  }, [addresses, selectedAddressId]);

  const placeOrder = useMutation({
    mutationFn: () =>
      api.post<Order>('/orders', { addressId: selectedAddressId, paymentMethod, notes: notes.trim() || undefined }),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order placed!', `Order ${order.orderNumber} is confirmed.`);
      navigate(`/order-confirmed/${order.id}`);
    },
    onError: (err: ApiError) => setError(err.message),
  });

  // Redirecting during render (instead of an effect) triggers React's
  // "Cannot update a component while rendering a different component"
  // warning, since navigate() ultimately calls setState on the router. It
  // also must not fire once an order has been placed: the success handler's
  // cache invalidation briefly reports zero cart items while this component
  // is still mounted and about to navigate away, which would otherwise race
  // the intended navigate-to-confirmation and bounce the customer to /cart.
  const cartIsEmpty =
    !cartLoading && (!cart || cart.items.length === 0) && !placeOrder.isSuccess && !placeOrder.isPending;
  React.useEffect(() => {
    if (cartIsEmpty) navigate('/cart', { replace: true });
  }, [cartIsEmpty, navigate]);

  if (cartLoading || addressesLoading) return <PageLoader label="Preparing checkout" />;
  if (cartIsEmpty || !cart) return null;

  const handlePlaceOrder = () => {
    setError(null);
    if (!selectedAddressId) {
      setError('Please select or add a delivery address.');
      return;
    }
    placeOrder.mutate();
  };

  return (
    <div className="container max-w-5xl py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Checkout</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {error && <Alert variant="error">{error}</Alert>}

          {/* --- delivery address --- */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-base font-bold">
                <MapPin className="size-4" />
                Delivery address
              </h2>
              <Button variant="outline" size="sm" onClick={() => setAddressDialogOpen(true)}>
                <Plus />
                Add new
              </Button>
            </div>

            {!addresses || addresses.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                No saved addresses yet. Add one to continue.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {addresses.map((address) => (
                  <label
                    key={address.id}
                    className={cn(
                      'cursor-pointer rounded-lg border p-3.5 text-sm transition-colors',
                      selectedAddressId === address.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                    )}
                  >
                    <input
                      type="radio"
                      name="address"
                      value={address.id}
                      checked={selectedAddressId === address.id}
                      onChange={() => setSelectedAddressId(address.id)}
                      className="sr-only"
                    />
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{address.label}</span>
                      {address.isDefault && <span className="text-[10px] font-semibold uppercase text-primary">Default</span>}
                    </div>
                    <p className="mt-1 text-muted-foreground">{address.fullName}</p>
                    <p className="text-muted-foreground">
                      {address.line1}, {address.city}, {address.state} {address.pincode}
                    </p>
                    <p className="mt-1 text-muted-foreground">{address.phone}</p>
                  </label>
                ))}
              </div>
            )}
          </section>

          {/* --- payment method --- */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
            <h2 className="mb-4 font-display text-base font-bold">Payment method</h2>
            <div className="space-y-2.5">
              {PAYMENT_METHODS.map((method) => (
                <label
                  key={method.value}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border p-3.5 transition-colors',
                    paymentMethod === method.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                  )}
                >
                  <input
                    type="radio"
                    name="payment"
                    value={method.value}
                    checked={paymentMethod === method.value}
                    onChange={() => setPaymentMethod(method.value)}
                    className="sr-only"
                  />
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
                    {method.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{method.label}</p>
                    <p className="text-xs text-muted-foreground">{method.hint}</p>
                  </div>
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded-full border-2',
                      paymentMethod === method.value ? 'border-primary' : 'border-input',
                    )}
                  >
                    {paymentMethod === method.value && <span className="size-2 rounded-full bg-primary" />}
                  </span>
                </label>
              ))}
            </div>
          </section>

          {/* --- notes --- */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
            <h2 className="mb-3 font-display text-base font-bold">Delivery notes (optional)</h2>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={300}
              placeholder="E.g. leave with the security guard, ring the bell twice…"
            />
          </section>
        </div>

        {/* --- summary --- */}
        <div className="h-fit space-y-4 rounded-xl border border-border bg-card p-5 shadow-soft lg:sticky lg:top-20">
          <h2 className="font-display text-base font-bold">Order summary</h2>

          <div className="max-h-64 space-y-2.5 overflow-y-auto">
            {cart.items.map((item) => (
              <div key={item.id} className="flex justify-between gap-2 text-sm">
                <span className="line-clamp-1 text-muted-foreground">
                  {item.product.name} × {item.quantity}
                </span>
                <span className="shrink-0 font-medium">{formatCurrency(item.lineTotal)}</span>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(cart.pricing.subtotal)}</span>
            </div>
            {cart.pricing.discount > 0 && (
              <div className="flex justify-between text-success">
                <span>Discount {cart.coupon && `(${cart.coupon.code})`}</span>
                <span>− {formatCurrency(cart.pricing.discount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivery</span>
              <span className={cart.pricing.deliveryFee === 0 ? 'text-success' : ''}>
                {cart.pricing.deliveryFee === 0 ? 'FREE' : formatCurrency(cart.pricing.deliveryFee)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">GST ({cart.config.taxPercent}%)</span>
              <span>{formatCurrency(cart.pricing.tax)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="font-display text-base font-bold">Total</span>
            <span className="font-display text-xl font-bold">{formatCurrency(cart.pricing.total)}</span>
          </div>

          <Button size="lg" className="w-full" onClick={handlePlaceOrder} loading={placeOrder.isPending}>
            Place order
          </Button>
        </div>
      </div>

      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a new address</DialogTitle>
          </DialogHeader>
          <AddressForm
            onSuccess={(address) => {
              setAddressDialogOpen(false);
              setSelectedAddressId(address.id);
              queryClient.invalidateQueries({ queryKey: ['addresses'] });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
