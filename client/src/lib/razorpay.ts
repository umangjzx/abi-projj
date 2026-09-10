/**
 * Thin wrapper around Razorpay's Checkout script. Loaded lazily (not bundled)
 * because it's only needed on the checkout / order-detail pages, and
 * Razorpay only serves it from their own CDN.
 */

interface RazorpayHandlerResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpayHandlerResponse) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
let loadPromise: Promise<void> | null = null;

function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.onload = () => resolve();
      script.onerror = () => {
        loadPromise = null;
        reject(new Error('Could not load the payment gateway. Check your connection and try again.'));
      };
      document.body.appendChild(script);
    });
  }
  return loadPromise;
}

export async function openRazorpayCheckout(options: RazorpayOptions): Promise<void> {
  await loadCheckoutScript();
  if (!window.Razorpay) throw new Error('Payment gateway failed to load');
  new window.Razorpay(options).open();
}
