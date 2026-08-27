import { prisma } from '../../lib/prisma';
import { round2, toNumber } from '../../lib/money';
import { REVENUE_STATUSES } from '../orders/order.service';
import type { DateRange } from './range';

export type AbcClass = 'A' | 'B' | 'C';
export type XyzClass = 'X' | 'Y' | 'Z';

export interface AbcRow {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  category: string;
  revenue: number;
  unitsSold: number;
  stock: number;
  revenueShare: number;
  cumulativeShare: number;
  class: AbcClass;
  /** Coefficient of variation of weekly demand (std / mean). */
  demandCv: number;
  /** Demand-stability class from `demandCv`. */
  xyzClass: XyzClass;
  /** Combined cell, e.g. "AX" = high value + steady demand. */
  combinedClass: `${AbcClass}${XyzClass}`;
}

/**
 * ABC (Pareto) + XYZ (demand-variability) inventory analysis.
 *
 * ---- ABC: how much each SKU is worth ----
 * Ranks every SKU by revenue contribution over the period, then walks the
 * ranked list accumulating each SKU's share of total revenue:
 *   - Class A: SKUs whose cumulative share reaches 80% -- the "vital few".
 *   - Class B: the next slice up to 95% cumulative -- worth monitoring.
 *   - Class C: the remaining long tail -- low individual impact.
 * This is the classic 80/15/5 Pareto split; thresholds are configurable.
 *
 * The cumulative share is accumulated from *raw* revenue and only rounded for
 * display -- rounding each row's share to two places and then summing hundreds
 * of them lets the error compound and drifts the A/B cut-offs.
 *
 * ---- XYZ: how predictable that SKU's demand is ----
 * For each SKU, weekly units sold across the period give a demand series; its
 * coefficient of variation (CV = standard deviation / mean) is the stability
 * measure:
 *   - Class X: CV <= 0.5  -- steady, safe to run lean, easy to forecast.
 *   - Class Y: 0.5 < CV <= 1.0 -- variable (trend/seasonal), needs buffer.
 *   - Class Z: CV > 1.0   -- erratic/sporadic, forecast with caution.
 *
 * ---- The 3x3 matrix ----
 * Crossing them gives an action grid. AX (high value, steady) is where
 * just-in-time and tight reorder points pay off most; AZ (high value, erratic)
 * needs generous safety stock because a stockout is both likely and expensive;
 * CZ (low value, erratic) is usually make-to-order or delist.
 */
export const abcService = {
  async classify(
    range: DateRange,
    thresholds: { classA: number; classB: number } = { classA: 80, classB: 95 },
  ): Promise<{
    rows: AbcRow[];
    summary: { class: AbcClass; skuCount: number; revenue: number; revenueShare: number }[];
    xyzSummary: { class: XyzClass; skuCount: number; revenue: number }[];
    matrix: { cell: `${AbcClass}${XyzClass}`; skuCount: number; revenue: number }[];
  }> {
    // XYZ (demand variability) is measured over its own trailing window --
    // longer and coarser than the ABC revenue window -- so the CV has enough
    // non-zero periods to mean something.
    const XYZ_MONTHS = 6;
    const xyzFrom = new Date();
    xyzFrom.setMonth(xyzFrom.getMonth() - XYZ_MONTHS);
    xyzFrom.setHours(0, 0, 0, 0);

    const [salesByVariant, allVariants, weeklyRows] = await Promise.all([
      prisma.orderItem.groupBy({
        by: ['variantId'],
        where: { order: { status: { in: REVENUE_STATUSES }, placedAt: { gte: range.from, lte: range.to } } },
        _sum: { lineTotal: true, quantity: true },
      }),
      prisma.productVariant.findMany({
        where: { isActive: true, product: { isActive: true } },
        select: {
          id: true,
          sku: true,
          name: true,
          product: { select: { name: true, category: { select: { name: true } } } },
          inventory: { select: { stock: true } },
        },
      }),
      prisma.$queryRaw<{ variantId: string; bucket: Date; units: bigint }[]>`
        SELECT oi."variantId"                      AS "variantId",
               date_trunc('month', o."placedAt")   AS bucket,
               COALESCE(SUM(oi."quantity"), 0)     AS units
        FROM order_items oi
        JOIN orders o ON o."id" = oi."orderId"
        WHERE o."placedAt" >= ${xyzFrom}
          AND o."status" = ANY(${REVENUE_STATUSES}::"OrderStatus"[])
        GROUP BY 1, 2
        ORDER BY 2 ASC
      `,
    ]);

    const salesMap = new Map(salesByVariant.map((s) => [s.variantId, s]));
    const totalRevenue = salesByVariant.reduce((sum, s) => sum + toNumber(s._sum.lineTotal), 0);

    // XYZ needs a longer, coarser lens than the ABC revenue window: monthly
    // buckets over the trailing `XYZ_MONTHS`. Weekly buckets on this data are
    // mostly zeros, which makes every SKU look erratic. Build a *dense* series
    // (one slot per calendar month in the window) so gaps between sales show up
    // as the real zeros they are.
    const monthKeys: string[] = [];
    for (let i = 0; i < XYZ_MONTHS; i++) {
      const d = new Date(xyzFrom);
      d.setMonth(d.getMonth() + i);
      monthKeys.push(`${d.getFullYear()}-${d.getMonth()}`);
    }
    const monthIndex = new Map(monthKeys.map((key, i) => [key, i]));

    const monthlyByVariant = new Map<string, number[]>();
    for (const row of weeklyRows) {
      const d = new Date(row.bucket);
      const idx = monthIndex.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (idx === undefined) continue;
      const series = monthlyByVariant.get(row.variantId) ?? new Array(XYZ_MONTHS).fill(0);
      series[idx] = Number(row.units);
      monthlyByVariant.set(row.variantId, series);
    }

    const ranked = allVariants
      .map((variant) => {
        const sales = salesMap.get(variant.id);
        return {
          variantId: variant.id,
          sku: variant.sku,
          productName: variant.product.name,
          variantName: variant.name,
          category: variant.product.category.name,
          revenueRaw: toNumber(sales?._sum.lineTotal),
          revenue: round2(toNumber(sales?._sum.lineTotal)),
          unitsSold: sales?._sum.quantity ?? 0,
          stock: variant.inventory?.stock ?? 0,
          demandCv: demandCoefficientOfVariation(monthlyByVariant.get(variant.id) ?? []),
        };
      })
      .sort((a, b) => b.revenueRaw - a.revenueRaw);

    let cumulativeRaw = 0;
    const rows: AbcRow[] = ranked.map((row) => {
      cumulativeRaw += row.revenueRaw;
      const revenueShare = totalRevenue > 0 ? round2((row.revenueRaw / totalRevenue) * 100) : 0;
      const cumulativeShare = totalRevenue > 0 ? round2(Math.min(100, (cumulativeRaw / totalRevenue) * 100)) : 0;

      const cls: AbcClass =
        row.revenueRaw === 0
          ? 'C'
          : cumulativeShare <= thresholds.classA
            ? 'A'
            : cumulativeShare <= thresholds.classB
              ? 'B'
              : 'C';

      const xyzClass: XyzClass = row.demandCv <= 0.5 ? 'X' : row.demandCv <= 1.0 ? 'Y' : 'Z';

      const { revenueRaw, ...rest } = row;
      return { ...rest, revenueShare, cumulativeShare, class: cls, xyzClass, combinedClass: `${cls}${xyzClass}` };
    });

    const summary = (['A', 'B', 'C'] as AbcClass[]).map((cls) => {
      const inClass = rows.filter((r) => r.class === cls);
      const revenue = round2(inClass.reduce((sum, r) => sum + r.revenue, 0));
      return {
        class: cls,
        skuCount: inClass.length,
        revenue,
        revenueShare: totalRevenue > 0 ? round2((revenue / totalRevenue) * 100) : 0,
      };
    });

    const xyzSummary = (['X', 'Y', 'Z'] as XyzClass[]).map((cls) => {
      const inClass = rows.filter((r) => r.xyzClass === cls);
      return { class: cls, skuCount: inClass.length, revenue: round2(inClass.reduce((sum, r) => sum + r.revenue, 0)) };
    });

    const matrix = (['A', 'B', 'C'] as AbcClass[]).flatMap((a) =>
      (['X', 'Y', 'Z'] as XyzClass[]).map((x) => {
        const cell = `${a}${x}` as `${AbcClass}${XyzClass}`;
        const inCell = rows.filter((r) => r.combinedClass === cell);
        return { cell, skuCount: inCell.length, revenue: round2(inCell.reduce((sum, r) => sum + r.revenue, 0)) };
      }),
    );

    return { rows, summary, xyzSummary, matrix };
  },
};

/**
 * CV (std / mean) of a monthly demand series over the XYZ window.
 *
 * Zeros in months *after* the SKU first sold are real "no demand this month"
 * observations and stay in the series -- that is exactly the irregularity XYZ
 * is meant to catch. Months before the first sale are dropped, so a product
 * launched two months ago is not branded erratic for the four months it did
 * not yet exist. A SKU with fewer than two months of activity has no
 * meaningful variability figure and is reported as CV 0 (it will fall to the
 * ABC side of the grid).
 */
function demandCoefficientOfVariation(monthlyUnits: number[]): number {
  // `monthlyUnits` is already dense (one slot per month in the window). Drop
  // only the leading zeros -- the months before this SKU's first sale -- and
  // keep every zero after it, since those are genuine "no demand" months.
  const series = [...monthlyUnits];
  if (series.every((v) => v === 0)) return 0; // never sold in the window
  while (series.length && series[0] === 0) series.shift();

  // Sold in only one month of the window: from a planning view that is
  // sporadic, not "steady" -- push it into Z rather than a misleading X.
  if (series.length < 2) return 1.5;

  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  if (mean === 0) return 0;

  const variance = series.reduce((sum, v) => sum + (v - mean) ** 2, 0) / series.length;
  return round2(Math.sqrt(variance) / mean);
}
