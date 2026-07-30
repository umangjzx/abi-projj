import type { RecommendationStrategy } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { round2 } from '../../lib/money';

/**
 * Powers the admin "Recommendation Monitoring" screen and the
 * "Recommendation Performance" report: an impression -> click -> add-to-cart ->
 * purchase funnel, sliced by strategy and by placement.
 */
export const recommendationAnalytics = {
  async performance(range: { from: Date; to: Date }) {
    const where = { createdAt: { gte: range.from, lte: range.to } };

    const [byStrategy, byPlacement, daily, topProducts] = await Promise.all([
      prisma.recommendationEvent.groupBy({ by: ['strategy', 'event'], where, _count: true }),
      prisma.recommendationEvent.groupBy({ by: ['placement', 'event'], where, _count: true }),
      prisma.$queryRaw<{ day: Date; event: string; count: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day, "event", COUNT(*) AS count
        FROM recommendation_events
        WHERE "createdAt" BETWEEN ${range.from} AND ${range.to}
        GROUP BY 1, 2
        ORDER BY 1 ASC
      `,
      prisma.recommendationEvent.groupBy({
        by: ['productId'],
        where: { ...where, event: 'PURCHASE' },
        _count: true,
        orderBy: { _count: { productId: 'desc' } },
        take: 10,
      }),
    ]);

    const strategyRows = buildFunnel(byStrategy, 'strategy');
    const placementRows = buildFunnel(byPlacement, 'placement');

    const productNames = topProducts.length
      ? await prisma.product.findMany({
          where: { id: { in: topProducts.map((p) => p.productId) } },
          select: { id: true, name: true, slug: true },
        })
      : [];
    const nameMap = new Map(productNames.map((p) => [p.id, p]));

    const totals = strategyRows.reduce(
      (acc, row) => ({
        impressions: acc.impressions + row.impressions,
        clicks: acc.clicks + row.clicks,
        addToCarts: acc.addToCarts + row.addToCarts,
        purchases: acc.purchases + row.purchases,
      }),
      { impressions: 0, clicks: 0, addToCarts: 0, purchases: 0 },
    );

    return {
      totals: {
        ...totals,
        clickThroughRate: rate(totals.clicks, totals.impressions),
        cartRate: rate(totals.addToCarts, totals.clicks),
        conversionRate: rate(totals.purchases, totals.impressions),
      },
      byStrategy: strategyRows,
      byPlacement: placementRows,
      timeline: buildTimeline(daily),
      topConvertingProducts: topProducts.map((p) => ({
        productId: p.productId,
        name: nameMap.get(p.productId)?.name ?? 'Unknown product',
        slug: nameMap.get(p.productId)?.slug ?? null,
        purchases: p._count,
      })),
      // The best performer by conversion rate, needs enough volume to be meaningful.
      bestStrategy:
        strategyRows.filter((r) => r.impressions >= 20).sort((a, b) => b.conversionRate - a.conversionRate)[0]?.strategy ??
        null,
    };
  },

  /** Slots currently materialised, for the monitoring table. */
  async activeSlots(limit = 50) {
    const rows = await prisma.recommendation.findMany({
      orderBy: { generatedAt: 'desc' },
      take: limit,
      include: {
        product: { select: { id: true, name: true, slug: true } },
        sourceProduct: { select: { name: true } },
        user: { select: { name: true, email: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      strategy: r.strategy,
      placement: r.placement,
      score: round2(r.score),
      reason: r.reason,
      generatedAt: r.generatedAt,
      expiresAt: r.expiresAt,
      product: r.product,
      sourceProduct: r.sourceProduct?.name ?? null,
      customer: r.user ? { name: r.user.name, email: r.user.email } : null,
    }));
  },

  /** Strongest co-occurrence pairs, so an admin can sanity-check the model. */
  async topAffinities(limit = 20) {
    const rows = await prisma.productAffinity.findMany({
      orderBy: [{ score: 'desc' }, { coOccurrence: 'desc' }],
      take: limit,
      include: {
        productA: { select: { name: true, slug: true } },
        productB: { select: { name: true, slug: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      productA: r.productA.name,
      productB: r.productB.name,
      coOccurrence: r.coOccurrence,
      score: round2(r.score),
      computedAt: r.computedAt,
    }));
  },

  async coverage() {
    const [totalProducts, recommendedProducts, totalCustomers, customersWithSlots] = await Promise.all([
      prisma.product.count({ where: { isActive: true } }),
      prisma.recommendation.findMany({ distinct: ['productId'], select: { productId: true } }),
      prisma.user.count({ where: { role: { name: 'CUSTOMER' } } }),
      prisma.recommendation.findMany({ distinct: ['userId'], where: { userId: { not: null } }, select: { userId: true } }),
    ]);

    return {
      catalogueCoverage: rate(recommendedProducts.length, totalProducts),
      customerCoverage: rate(customersWithSlots.length, totalCustomers),
      productsRecommended: recommendedProducts.length,
      totalProducts,
      customersServed: customersWithSlots.length,
      totalCustomers,
    };
  },
};

type GroupRow = { event: string; _count: number } & Record<string, unknown>;

function buildFunnel(rows: GroupRow[], key: 'strategy' | 'placement') {
  const map = new Map<string, { impressions: number; clicks: number; addToCarts: number; purchases: number }>();

  for (const row of rows) {
    const groupKey = String(row[key]);
    const entry = map.get(groupKey) ?? { impressions: 0, clicks: 0, addToCarts: 0, purchases: 0 };
    if (row.event === 'IMPRESSION') entry.impressions += row._count;
    if (row.event === 'CLICK') entry.clicks += row._count;
    if (row.event === 'ADD_TO_CART') entry.addToCarts += row._count;
    if (row.event === 'PURCHASE') entry.purchases += row._count;
    map.set(groupKey, entry);
  }

  return [...map.entries()]
    .map(([groupKey, v]) => ({
      [key]: groupKey as RecommendationStrategy,
      strategy: groupKey,
      placement: groupKey,
      ...v,
      clickThroughRate: rate(v.clicks, v.impressions),
      cartRate: rate(v.addToCarts, v.clicks),
      conversionRate: rate(v.purchases, v.impressions),
    }))
    .sort((a, b) => b.impressions - a.impressions) as (ReturnType<typeof buildFunnelRow>)[];
}

// Helper purely for the return type of buildFunnel.
function buildFunnelRow() {
  return {
    strategy: '' as string,
    placement: '' as string,
    impressions: 0,
    clicks: 0,
    addToCarts: 0,
    purchases: 0,
    clickThroughRate: 0,
    cartRate: 0,
    conversionRate: 0,
  };
}

function buildTimeline(rows: { day: Date; event: string; count: bigint }[]) {
  const byDay = new Map<string, { date: string; impressions: number; clicks: number; purchases: number }>();

  for (const row of rows) {
    const date = new Date(row.day).toISOString().slice(0, 10);
    const entry = byDay.get(date) ?? { date, impressions: 0, clicks: 0, purchases: 0 };
    const count = Number(row.count);
    if (row.event === 'IMPRESSION') entry.impressions += count;
    if (row.event === 'CLICK') entry.clicks += count;
    if (row.event === 'PURCHASE') entry.purchases += count;
    byDay.set(date, entry);
  }

  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const rate = (numerator: number, denominator: number) =>
  denominator === 0 ? 0 : round2((numerator / denominator) * 100);
