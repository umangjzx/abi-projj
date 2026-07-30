import { prisma } from '../../lib/prisma';
import { round2, toNumber } from '../../lib/money';
import { REVENUE_STATUSES } from '../orders/order.service';
import type { DateRange } from './range';

export type AbcClass = 'A' | 'B' | 'C';

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
}

/**
 * ABC (Pareto) inventory analysis.
 *
 * Ranks every SKU by revenue contribution over the period, then walks the
 * ranked list accumulating each SKU's share of total revenue:
 *   - Class A: SKUs whose cumulative share reaches 80% -- the "vital few"
 *     that deserve tight stock control and priority reordering.
 *   - Class B: the next slice up to 95% cumulative -- worth monitoring.
 *   - Class C: the remaining long tail -- low individual impact, usually
 *     safe to hold looser stock policies for.
 *
 * This is the classic 80/15/5 Pareto split; thresholds are configurable per
 * call because different catalogues (and different store policies) reasonably
 * want a stricter or looser cut.
 */
export const abcService = {
  async classify(
    range: DateRange,
    thresholds: { classA: number; classB: number } = { classA: 80, classB: 95 },
  ): Promise<{ rows: AbcRow[]; summary: { class: AbcClass; skuCount: number; revenue: number; revenueShare: number }[] }> {
    const [salesByVariant, allVariants] = await Promise.all([
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
    ]);

    const salesMap = new Map(salesByVariant.map((s) => [s.variantId, s]));
    const totalRevenue = salesByVariant.reduce((sum, s) => sum + toNumber(s._sum.lineTotal), 0);

    // Variants with zero sales in the window still show up (as zero-revenue
    // Class C) so the report reflects the whole catalogue, not just movers.
    const ranked = allVariants
      .map((variant) => {
        const sales = salesMap.get(variant.id);
        return {
          variantId: variant.id,
          sku: variant.sku,
          productName: variant.product.name,
          variantName: variant.name,
          category: variant.product.category.name,
          revenue: round2(toNumber(sales?._sum.lineTotal)),
          unitsSold: sales?._sum.quantity ?? 0,
          stock: variant.inventory?.stock ?? 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    let cumulative = 0;
    const rows: AbcRow[] = ranked.map((row) => {
      const revenueShare = totalRevenue > 0 ? round2((row.revenue / totalRevenue) * 100) : 0;
      cumulative = totalRevenue > 0 ? cumulative + revenueShare : 0;
      const cumulativeShare = round2(Math.min(100, cumulative));

      const cls: AbcClass =
        row.revenue === 0 ? 'C' : cumulativeShare <= thresholds.classA ? 'A' : cumulativeShare <= thresholds.classB ? 'B' : 'C';

      return { ...row, revenueShare, cumulativeShare, class: cls };
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

    return { rows, summary };
  },
};
