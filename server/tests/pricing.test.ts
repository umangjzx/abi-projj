/**
 * Unit tests for the pricing engine -- pure functions, no database required.
 * Run with: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePricing, computeCouponDiscount } from '../src/modules/cart/pricing';

const flatCoupon = {
  id: 'c1',
  code: 'FLAT50',
  description: null,
  discountType: 'FLAT' as const,
  value: { toString: () => '50' } as never,
  minOrderValue: { toString: () => '0' } as never,
  maxDiscount: null,
  usageLimit: null,
  usedCount: 0,
  perUserLimit: 1,
  startsAt: new Date(),
  expiresAt: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const percentCoupon = {
  ...flatCoupon,
  code: 'TEN',
  discountType: 'PERCENTAGE' as const,
  value: { toString: () => '10' } as never,
  maxDiscount: { toString: () => '30' } as never,
};

test('computePricing sums line totals correctly', () => {
  const result = computePricing([
    { unitPrice: 27, quantity: 2 },
    { unitPrice: 92, quantity: 1 },
  ]);
  assert.equal(result.subtotal, 146);
  assert.equal(result.itemCount, 3);
});

test('computePricing waives delivery above the free threshold', () => {
  const below = computePricing([{ unitPrice: 100, quantity: 1 }]);
  const above = computePricing([{ unitPrice: 600, quantity: 1 }]);
  assert.ok(below.deliveryFee > 0);
  assert.equal(above.deliveryFee, 0);
  assert.equal(above.freeDeliveryEligible, true);
});

test('computePricing applies GST on the discounted subtotal, not the raw one', () => {
  const result = computePricing([{ unitPrice: 1000, quantity: 1 }], flatCoupon);
  // (1000 - 50) * 5% = 47.5
  assert.equal(result.discount, 50);
  assert.equal(result.tax, 47.5);
});

test('computeCouponDiscount caps a percentage discount at maxDiscount', () => {
  const discount = computeCouponDiscount(1000, percentCoupon);
  // 10% of 1000 = 100, but capped at 30
  assert.equal(discount, 30);
});

test('computeCouponDiscount never exceeds the subtotal', () => {
  const discount = computeCouponDiscount(20, flatCoupon);
  // FLAT50 on a ₹20 subtotal must not produce a negative total
  assert.equal(discount, 20);
});

test('computePricing reports zero delivery and tax for an empty cart', () => {
  const result = computePricing([]);
  assert.equal(result.subtotal, 0);
  assert.equal(result.deliveryFee, 0);
  assert.equal(result.total, 0);
});
