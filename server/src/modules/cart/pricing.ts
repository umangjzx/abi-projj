import type { Coupon } from '@prisma/client';
import { env } from '../../config/env';
import { round2, toNumber, percentOf } from '../../lib/money';

export interface PriceableLine {
  unitPrice: number;
  quantity: number;
}

export interface PriceBreakdown {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
  itemCount: number;
  savings: number;
  freeDeliveryEligible: boolean;
  amountToFreeDelivery: number;
}

/**
 * Single source of truth for order totals, used by the cart preview, checkout
 * and invoice generation alike. Keeping one implementation is what guarantees
 * the price the customer saw is the price they are charged.
 *
 * Order of operations (matches the printed invoice):
 *   1. subtotal   = sum(unitPrice x quantity)
 *   2. discount   = coupon applied to the subtotal, capped at maxDiscount
 *   3. delivery   = flat fee, waived above the free-delivery threshold
 *   4. tax        = TAX_PERCENT of the discounted subtotal (not of delivery)
 *   5. total      = subtotal - discount + delivery + tax
 */
export function computePricing(
  lines: PriceableLine[],
  coupon?: Coupon | null,
  mrpLines: PriceableLine[] = [],
): PriceBreakdown {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0));
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  const mrpTotal = round2(mrpLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0));
  const catalogueSavings = mrpTotal > subtotal ? round2(mrpTotal - subtotal) : 0;

  const discount = coupon ? computeCouponDiscount(subtotal, coupon) : 0;
  const discountedSubtotal = round2(subtotal - discount);

  const freeDeliveryEligible = discountedSubtotal >= env.FREE_DELIVERY_THRESHOLD;
  const deliveryFee = itemCount === 0 || freeDeliveryEligible ? 0 : round2(env.DELIVERY_FEE);

  const tax = percentOf(discountedSubtotal, env.TAX_PERCENT);
  const total = round2(discountedSubtotal + deliveryFee + tax);

  return {
    subtotal,
    discount,
    deliveryFee,
    tax,
    total,
    itemCount,
    savings: round2(catalogueSavings + discount),
    freeDeliveryEligible,
    amountToFreeDelivery: freeDeliveryEligible ? 0 : round2(env.FREE_DELIVERY_THRESHOLD - discountedSubtotal),
  };
}

export function computeCouponDiscount(subtotal: number, coupon: Coupon): number {
  const raw =
    coupon.discountType === 'PERCENTAGE'
      ? percentOf(subtotal, toNumber(coupon.value))
      : toNumber(coupon.value);

  const capped = coupon.maxDiscount ? Math.min(raw, toNumber(coupon.maxDiscount)) : raw;
  // A discount can never exceed the subtotal -- that would produce a negative total.
  return round2(Math.max(0, Math.min(capped, subtotal)));
}

export const pricingConfig = {
  deliveryFee: env.DELIVERY_FEE,
  freeDeliveryThreshold: env.FREE_DELIVERY_THRESHOLD,
  taxPercent: env.TAX_PERCENT,
};
