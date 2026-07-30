import { Prisma } from '@prisma/client';

/**
 * Money helpers. All persisted amounts are `Decimal(12,2)`; these convert to
 * and from JS numbers at the API boundary only, and always round half-up to
 * paise so totals reconcile with the printed invoice.
 */
export const toDecimal = (value: number | string | Prisma.Decimal): Prisma.Decimal =>
  new Prisma.Decimal(typeof value === 'number' ? value.toFixed(2) : value);

export const toNumber = (value: Prisma.Decimal | number | string | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
};

export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export const percentOf = (amount: number, percent: number): number => round2((amount * percent) / 100);

/** ₹1,23,456.00 -- Indian digit grouping, used by PDF/Excel exports. */
export const formatINR = (value: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

/** Safe percentage change that does not divide by zero. */
export const pctChange = (current: number, previous: number): number => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return round2(((current - previous) / previous) * 100);
};
