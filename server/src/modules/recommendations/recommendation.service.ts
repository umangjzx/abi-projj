import {
  type RecommendationPlacement,
  type RecommendationStrategy,
  type RecommendationEventType,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { productInclude, serializeProduct } from '../catalog/catalog.serializer';
import { REVENUE_STATUSES } from '../orders/order.service';

// ============================================================================
//  Recommendation engine
//
//  Six complementary signals, blended per placement. All of them are computed
//  from data the shop already collects -- no external service and no training
//  step -- which keeps the system self-contained and explainable: every
//  suggestion carries a human-readable `reason`.
//
//    POPULAR                     global bestsellers, recency-weighted
//    TRENDING                    velocity: last 14 days vs the 14 before
//    PURCHASE_HISTORY            reorder prompts (dairy is highly repeat-buy)
//    CATEGORY_AFFINITY           unbought products in the customer's top
//                                categories
//    FREQUENTLY_BOUGHT_TOGETHER  item-to-item co-occurrence (pre-computed)
//    COLLABORATIVE               user-user cosine similarity over purchases
//    RECENTLY_VIEWED             siblings of what the customer just browsed
// ============================================================================

/** Blend weights per placement -- these decide the mix of the final list. */
const PLACEMENT_WEIGHTS: Record<RecommendationPlacement, Partial<Record<RecommendationStrategy, number>>> = {
  HOME: { PURCHASE_HISTORY: 1.0, CATEGORY_AFFINITY: 0.85, COLLABORATIVE: 0.8, TRENDING: 0.7, POPULAR: 0.6 },
  PRODUCT_DETAIL: { FREQUENTLY_BOUGHT_TOGETHER: 1.0, CATEGORY_AFFINITY: 0.75, COLLABORATIVE: 0.6, POPULAR: 0.4 },
  CART: { FREQUENTLY_BOUGHT_TOGETHER: 1.0, PURCHASE_HISTORY: 0.7, POPULAR: 0.5 },
  CHECKOUT: { FREQUENTLY_BOUGHT_TOGETHER: 1.0, POPULAR: 0.6 },
  CUSTOMER_DASHBOARD: { PURCHASE_HISTORY: 1.0, COLLABORATIVE: 0.9, CATEGORY_AFFINITY: 0.8, TRENDING: 0.5 },
  SEARCH: { CATEGORY_AFFINITY: 1.0, POPULAR: 0.7, TRENDING: 0.6 },
};

const DAY_MS = 86_400_000;

interface Candidate {
  productId: string;
  score: number;
  strategy: RecommendationStrategy;
  reason: string;
}

/**
 * Tacks a concrete, trust- or urgency-building clause onto a strategy's base
 * reason, using data the product already carries (rating, review count,
 * discount, stock) -- so "Bestseller" becomes "Bestseller -- rated 4.6★ by 82
 * customers" instead of a bare label with nothing behind it. Caps at two
 * clauses so it still reads as one sentence, not a wall of badges.
 */
function buildPersuasiveReason(base: string, product: ReturnType<typeof serializeProduct>): string {
  const clauses: string[] = [];

  if (product.avgRating >= 4.3 && product.ratingCount >= 3) {
    clauses.push(`rated ${product.avgRating}★ by ${product.ratingCount} customer${product.ratingCount === 1 ? '' : 's'}`);
  } else if (product.soldCount >= 50) {
    clauses.push(`${product.soldCount}+ already sold`);
  }

  const variant = product.defaultVariant;
  if (variant?.discountPercent >= 10) {
    clauses.push(`${variant.discountPercent}% off right now`);
  } else if (variant?.isLowStock) {
    clauses.push(`only ${variant.stock} left in stock`);
  }

  return clauses.length ? `${base} — ${clauses.join(', ')}` : base;
}

export const recommendationService = {
  // ------------------------------------------------------------- strategies ---

  /**
   * Global bestsellers with exponential recency decay (half-life 30 days), so a
   * product that sold well last week outranks one that sold well six months
   * ago. Rating acts as a mild tie-breaker.
   */
  async popular(limit: number, excludeIds: string[] = []): Promise<Candidate[]> {
    const since = new Date(Date.now() - 90 * DAY_MS);

    const items = await prisma.orderItem.findMany({
      where: {
        order: { placedAt: { gte: since }, status: { in: REVENUE_STATUSES } },
        product: { isActive: true, id: { notIn: excludeIds.length ? excludeIds : undefined } },
      },
      select: { productId: true, quantity: true, order: { select: { placedAt: true } } },
    });

    const scores = new Map<string, number>();
    const now = Date.now();
    for (const item of items) {
      const ageDays = (now - item.order.placedAt.getTime()) / DAY_MS;
      const decay = Math.pow(0.5, ageDays / 30);
      scores.set(item.productId, (scores.get(item.productId) ?? 0) + item.quantity * decay);
    }

    if (!scores.size) {
      // Cold start (a brand new shop): fall back to the catalogue's own
      // aggregates so the storefront is never empty.
      const fallback = await prisma.product.findMany({
        where: { isActive: true, id: { notIn: excludeIds.length ? excludeIds : undefined } },
        orderBy: [{ soldCount: 'desc' }, { avgRating: 'desc' }],
        take: limit,
        select: { id: true, soldCount: true },
      });
      return fallback.map((p, i) => ({
        productId: p.id,
        score: 1 - i / Math.max(1, fallback.length),
        strategy: 'POPULAR' as const,
        reason: 'Popular with our customers',
      }));
    }

    const max = Math.max(...scores.values());
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([productId, score]) => ({
        productId,
        score: score / max,
        strategy: 'POPULAR' as const,
        reason: 'Bestseller',
      }));
  },

  /** Sales velocity over the last 14 days compared with the 14 before it. */
  async trending(limit: number, excludeIds: string[] = []): Promise<Candidate[]> {
    const now = Date.now();
    const recentFrom = new Date(now - 14 * DAY_MS);
    const priorFrom = new Date(now - 28 * DAY_MS);

    const [recent, prior] = await Promise.all([
      prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: { placedAt: { gte: recentFrom }, status: { in: REVENUE_STATUSES } } },
        _sum: { quantity: true },
      }),
      prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: { placedAt: { gte: priorFrom, lt: recentFrom }, status: { in: REVENUE_STATUSES } } },
        _sum: { quantity: true },
      }),
    ]);

    const priorMap = new Map(prior.map((p) => [p.productId, p._sum.quantity ?? 0]));
    const excluded = new Set(excludeIds);

    const growth = recent
      .filter((r) => !excluded.has(r.productId))
      .map((r) => {
        const current = r._sum.quantity ?? 0;
        const previous = priorMap.get(r.productId) ?? 0;
        // +1 smoothing stops a single sale off a zero base from dominating.
        const lift = (current + 1) / (previous + 1);
        return { productId: r.productId, score: lift * Math.log1p(current), current };
      })
      .filter((g) => g.current >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (!growth.length) return [];
    const max = Math.max(...growth.map((g) => g.score));
    return growth.map((g) => ({
      productId: g.productId,
      score: g.score / max,
      strategy: 'TRENDING' as const,
      reason: 'Trending this fortnight',
    }));
  },

  /**
   * Reorder prompts. Dairy has a short consumption cycle, so a product the
   * customer bought repeatedly and recently is the single strongest signal.
   * Score combines frequency with "is it probably running out by now".
   */
  async purchaseHistory(userId: string, limit: number): Promise<Candidate[]> {
    const items = await prisma.orderItem.findMany({
      where: { order: { userId, status: { in: REVENUE_STATUSES } } },
      select: {
        productId: true,
        quantity: true,
        productName: true,
        order: { select: { placedAt: true } },
        product: { select: { isActive: true } },
      },
      orderBy: { order: { placedAt: 'desc' } },
      take: 400,
    });

    const stats = new Map<string, { count: number; qty: number; last: Date; name: string }>();
    for (const item of items) {
      if (!item.product.isActive) continue;
      const entry = stats.get(item.productId);
      if (entry) {
        entry.count += 1;
        entry.qty += item.quantity;
        if (item.order.placedAt > entry.last) entry.last = item.order.placedAt;
      } else {
        stats.set(item.productId, { count: 1, qty: item.quantity, last: item.order.placedAt, name: item.productName });
      }
    }

    const now = Date.now();
    const scored = [...stats.entries()].map(([productId, s]) => {
      const daysSince = (now - s.last.getTime()) / DAY_MS;
      // Peaks around a week after the last purchase, then tails off.
      const dueFactor = daysSince < 2 ? 0.3 : daysSince <= 21 ? 1 : Math.max(0.2, 1 - (daysSince - 21) / 60);
      return {
        productId,
        score: Math.log1p(s.count * 2 + s.qty) * dueFactor,
        strategy: 'PURCHASE_HISTORY' as const,
        reason: s.count > 1 ? `You've ordered this ${s.count} times` : 'Buy it again',
      };
    });

    if (!scored.length) return [];
    const max = Math.max(...scored.map((s) => s.score));
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => ({ ...s, score: s.score / max }));
  },

  /**
   * Products the customer has *not* bought, drawn from the categories they buy
   * most. This is what expands basket breadth rather than just repeating it.
   */
  async categoryAffinity(userId: string, limit: number): Promise<Candidate[]> {
    const purchased = await prisma.orderItem.findMany({
      where: { order: { userId, status: { in: REVENUE_STATUSES } } },
      select: { productId: true, quantity: true, product: { select: { categoryId: true, category: { select: { name: true } } } } },
    });

    if (!purchased.length) return [];

    const boughtIds = new Set(purchased.map((p) => p.productId));
    const categoryWeight = new Map<string, { weight: number; name: string }>();
    for (const item of purchased) {
      const entry = categoryWeight.get(item.product.categoryId);
      if (entry) entry.weight += item.quantity;
      else categoryWeight.set(item.product.categoryId, { weight: item.quantity, name: item.product.category.name });
    }

    const topCategories = [...categoryWeight.entries()].sort((a, b) => b[1].weight - a[1].weight).slice(0, 4);
    const totalWeight = topCategories.reduce((sum, [, v]) => sum + v.weight, 0) || 1;

    const results: Candidate[] = [];
    for (const [categoryId, { weight, name }] of topCategories) {
      const products = await prisma.product.findMany({
        where: { categoryId, isActive: true, id: { notIn: [...boughtIds] } },
        orderBy: [{ soldCount: 'desc' }, { avgRating: 'desc' }],
        take: Math.max(2, Math.ceil(limit / 2)),
        select: { id: true, avgRating: true },
      });

      products.forEach((product, index) => {
        const positional = 1 - index / Math.max(1, products.length);
        results.push({
          productId: product.id,
          score: (weight / totalWeight) * positional,
          strategy: 'CATEGORY_AFFINITY',
          reason: `Because you shop ${name}`,
        });
      });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  },

  /** Item-to-item co-occurrence, read from the pre-computed affinity table. */
  async frequentlyBoughtTogether(productIds: string[], limit: number): Promise<Candidate[]> {
    if (!productIds.length) return [];

    const affinities = await prisma.productAffinity.findMany({
      where: { OR: [{ productAId: { in: productIds } }, { productBId: { in: productIds } }] },
      orderBy: { score: 'desc' },
      take: limit * 6,
      include: {
        productA: { select: { id: true, name: true, isActive: true } },
        productB: { select: { id: true, name: true, isActive: true } },
      },
    });

    const seed = new Set(productIds);
    const scores = new Map<string, { score: number; reason: string }>();

    for (const affinity of affinities) {
      // The pair is stored once; the recommendation is whichever side is not
      // already in the basket.
      const isA = seed.has(affinity.productAId);
      const other = isA ? affinity.productB : affinity.productA;
      const source = isA ? affinity.productA : affinity.productB;
      if (!other.isActive || seed.has(other.id)) continue;

      const existing = scores.get(other.id);
      if (!existing || affinity.score > existing.score) {
        scores.set(other.id, { score: affinity.score, reason: `Often bought with ${source.name}` });
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([productId, v]) => ({
        productId,
        score: v.score,
        strategy: 'FREQUENTLY_BOUGHT_TOGETHER' as const,
        reason: v.reason,
      }));
  },

  /**
   * User-based collaborative filtering. Finds customers whose purchase sets
   * overlap with this one (cosine similarity over binary purchase vectors) and
   * recommends what they bought that this customer has not.
   *
   * Only neighbours that share at least two products are considered, which
   * keeps the suggestions meaningful on a modest dataset.
   */
  async collaborative(userId: string, limit: number): Promise<Candidate[]> {
    const mine = await prisma.orderItem.findMany({
      where: { order: { userId, status: { in: REVENUE_STATUSES } } },
      select: { productId: true },
      distinct: ['productId'],
    });

    const myProducts = new Set(mine.map((m) => m.productId));
    if (myProducts.size < 2) return [];

    // Everyone who bought at least one of the same products.
    const overlapping = await prisma.orderItem.findMany({
      where: {
        productId: { in: [...myProducts] },
        order: { status: { in: REVENUE_STATUSES }, userId: { not: userId } },
      },
      select: { productId: true, order: { select: { userId: true } } },
      take: 5000,
    });

    const neighbourProducts = new Map<string, Set<string>>();
    for (const row of overlapping) {
      const set = neighbourProducts.get(row.order.userId) ?? new Set<string>();
      set.add(row.productId);
      neighbourProducts.set(row.order.userId, set);
    }

    const candidateNeighbours = [...neighbourProducts.entries()].filter(([, set]) => set.size >= 2);
    if (!candidateNeighbours.length) return [];

    // Full baskets of the strongest neighbours only -- fetching everyone's
    // history would not scale.
    const neighbourIds = candidateNeighbours
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 40)
      .map(([id]) => id);

    const neighbourBaskets = await prisma.orderItem.findMany({
      where: { order: { userId: { in: neighbourIds }, status: { in: REVENUE_STATUSES } } },
      select: { productId: true, order: { select: { userId: true } }, product: { select: { isActive: true } } },
      distinct: ['productId', 'orderId'],
      take: 8000,
    });

    const baskets = new Map<string, Set<string>>();
    for (const row of neighbourBaskets) {
      if (!row.product.isActive) continue;
      const set = baskets.get(row.order.userId) ?? new Set<string>();
      set.add(row.productId);
      baskets.set(row.order.userId, set);
    }

    const scores = new Map<string, number>();
    for (const [, basket] of baskets) {
      const shared = [...basket].filter((p) => myProducts.has(p)).length;
      if (shared < 2) continue;

      // cosine(A,B) = |A ∩ B| / sqrt(|A| * |B|)
      const similarity = shared / Math.sqrt(myProducts.size * basket.size);

      for (const productId of basket) {
        if (myProducts.has(productId)) continue;
        scores.set(productId, (scores.get(productId) ?? 0) + similarity);
      }
    }

    if (!scores.size) return [];
    const max = Math.max(...scores.values());
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([productId, score]) => ({
        productId,
        score: score / max,
        strategy: 'COLLABORATIVE' as const,
        reason: 'Customers like you also bought this',
      }));
  },

  /** Siblings of recently viewed products, weighted by view recency. */
  async fromRecentlyViewed(userId: string, limit: number): Promise<Candidate[]> {
    const viewed = await prisma.recentlyViewed.findMany({
      where: { userId },
      orderBy: { viewedAt: 'desc' },
      take: 10,
      select: { productId: true, viewedAt: true, product: { select: { categoryId: true, name: true } } },
    });

    if (!viewed.length) return [];

    const viewedIds = new Set(viewed.map((v) => v.productId));
    const purchased = await prisma.orderItem.findMany({
      where: { order: { userId, status: { in: REVENUE_STATUSES } } },
      select: { productId: true },
      distinct: ['productId'],
    });
    const exclude = new Set([...viewedIds, ...purchased.map((p) => p.productId)]);

    const now = Date.now();
    const results: Candidate[] = [];

    for (const view of viewed.slice(0, 5)) {
      const recency = Math.pow(0.5, (now - view.viewedAt.getTime()) / (3 * DAY_MS));
      const siblings = await prisma.product.findMany({
        where: { categoryId: view.product.categoryId, isActive: true, id: { notIn: [...exclude] } },
        orderBy: [{ avgRating: 'desc' }, { soldCount: 'desc' }],
        take: 4,
        select: { id: true },
      });

      siblings.forEach((sibling, index) => {
        results.push({
          productId: sibling.id,
          score: recency * (1 - index / 5),
          strategy: 'RECENTLY_VIEWED',
          reason: `Similar to ${view.product.name}`,
        });
      });
    }

    // Keep the best score per product, since categories overlap between views.
    const best = new Map<string, Candidate>();
    for (const candidate of results) {
      const existing = best.get(candidate.productId);
      if (!existing || candidate.score > existing.score) best.set(candidate.productId, candidate);
    }

    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  },

  // ----------------------------------------------------------------- blending ---

  /**
   * Main entry point. Runs the strategies relevant to the placement in
   * parallel, blends them by weight, de-duplicates keeping the best-scoring
   * explanation, and hydrates the winners into full product payloads.
   */
  async getFor(opts: {
    userId?: string;
    placement: RecommendationPlacement;
    limit?: number;
    productIds?: string[];
    excludeIds?: string[];
  }) {
    const limit = opts.limit ?? 8;
    const weights = PLACEMENT_WEIGHTS[opts.placement];
    const pool = limit * 3;
    const exclude = opts.excludeIds ?? [];

    const tasks: Promise<Candidate[]>[] = [];

    for (const strategy of Object.keys(weights) as RecommendationStrategy[]) {
      switch (strategy) {
        case 'POPULAR':
          tasks.push(this.popular(pool, exclude));
          break;
        case 'TRENDING':
          tasks.push(this.trending(pool, exclude));
          break;
        case 'PURCHASE_HISTORY':
          if (opts.userId) tasks.push(this.purchaseHistory(opts.userId, pool));
          break;
        case 'CATEGORY_AFFINITY':
          if (opts.userId) tasks.push(this.categoryAffinity(opts.userId, pool));
          break;
        case 'COLLABORATIVE':
          if (opts.userId) tasks.push(this.collaborative(opts.userId, pool));
          break;
        case 'FREQUENTLY_BOUGHT_TOGETHER':
          if (opts.productIds?.length) tasks.push(this.frequentlyBoughtTogether(opts.productIds, pool));
          break;
        case 'RECENTLY_VIEWED':
          if (opts.userId) tasks.push(this.fromRecentlyViewed(opts.userId, pool));
          break;
      }
    }

    // A failing strategy must degrade the list, not break the page.
    const settled = await Promise.allSettled(tasks);
    const candidates = settled.flatMap((result) => {
      if (result.status === 'fulfilled') return result.value;
      logger.warn({ reason: result.reason }, 'recommendation strategy failed');
      return [];
    });

    const excludeSet = new Set([...exclude, ...(opts.productIds ?? [])]);
    const blended = new Map<string, Candidate>();

    for (const candidate of candidates) {
      if (excludeSet.has(candidate.productId)) continue;
      const weighted = candidate.score * (weights[candidate.strategy] ?? 0.5);
      const existing = blended.get(candidate.productId);

      if (!existing) {
        blended.set(candidate.productId, { ...candidate, score: weighted });
      } else {
        // Agreement between strategies is itself a signal: add a damped bonus
        // rather than simply taking the maximum.
        const merged = Math.max(existing.score, weighted) + Math.min(existing.score, weighted) * 0.35;
        blended.set(candidate.productId, {
          ...(weighted > existing.score ? candidate : existing),
          score: merged,
        });
      }
    }

    const winners = [...blended.values()].sort((a, b) => b.score - a.score).slice(0, limit);
    if (!winners.length) return [];

    const products = await prisma.product.findMany({
      where: { id: { in: winners.map((w) => w.productId) }, isActive: true },
      include: productInclude,
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    // A product may have been deactivated between scoring and hydration.
    const hydrated = winners
      .filter((w) => byId.has(w.productId))
      .map((w) => {
        const product = serializeProduct(byId.get(w.productId));
        return {
          ...product,
          recommendation: {
            strategy: w.strategy,
            score: Number(w.score.toFixed(4)),
            reason: buildPersuasiveReason(w.reason, product),
            placement: opts.placement,
          },
        };
      });

    // Persist the slots so the admin can audit what was served, and log
    // impressions for the performance report.
    void this.persist(opts.userId, opts.placement, hydrated, opts.productIds?.[0]).catch((err) =>
      logger.warn({ err }, 'failed to persist recommendations'),
    );

    return hydrated;
  },

  /** Upserts the served slots and records an IMPRESSION per item. */
  async persist(
    userId: string | undefined,
    placement: RecommendationPlacement,
    items: { id: string; recommendation: { strategy: RecommendationStrategy; score: number; reason: string } }[],
    sourceProductId?: string,
  ) {
    if (!items.length) return;

    // Anonymous visitors get impression telemetry but no stored slots (the
    // unique key is on userId).
    if (userId) {
      const expiresAt = new Date(Date.now() + 6 * 3_600_000);
      for (const item of items) {
        await prisma.recommendation.upsert({
          where: {
            userId_productId_strategy_placement: {
              userId,
              productId: item.id,
              strategy: item.recommendation.strategy,
              placement,
            },
          },
          create: {
            userId,
            productId: item.id,
            sourceProductId: sourceProductId ?? null,
            strategy: item.recommendation.strategy,
            placement,
            score: item.recommendation.score,
            reason: item.recommendation.reason,
            expiresAt,
          },
          update: {
            score: item.recommendation.score,
            reason: item.recommendation.reason,
            generatedAt: new Date(),
            expiresAt,
          },
        });
      }
    }

    await prisma.recommendationEvent.createMany({
      data: items.map((item) => ({
        userId: userId ?? null,
        productId: item.id,
        strategy: item.recommendation.strategy,
        placement,
        event: 'IMPRESSION' as const,
      })),
    });
  },

  /** Funnel telemetry: CLICK / ADD_TO_CART / PURCHASE. */
  async trackEvent(input: {
    userId?: string;
    productId: string;
    strategy: RecommendationStrategy;
    placement: RecommendationPlacement;
    event: RecommendationEventType;
  }) {
    await prisma.recommendationEvent.create({
      data: {
        userId: input.userId ?? null,
        productId: input.productId,
        strategy: input.strategy,
        placement: input.placement,
        event: input.event,
      },
    });
  },

  /**
   * Attributes a purchase to any recommendation the customer saw for that
   * product in the last 7 days. This is what makes the conversion column of
   * the performance report meaningful.
   */
  async trackPurchase(userId: string, productIds: string[]) {
    if (!productIds.length) return;
    const since = new Date(Date.now() - 7 * DAY_MS);

    const impressions = await prisma.recommendationEvent.findMany({
      where: { userId, productId: { in: productIds }, event: 'IMPRESSION', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      distinct: ['productId'],
      select: { productId: true, strategy: true, placement: true },
    });

    if (!impressions.length) return;

    await prisma.recommendationEvent.createMany({
      data: impressions.map((i) => ({
        userId,
        productId: i.productId,
        strategy: i.strategy,
        placement: i.placement,
        event: 'PURCHASE' as const,
      })),
    });
  },

  /**
   * Rebuilds item-to-item co-occurrence for the products in a just-placed
   * order. Confidence-style score: pair count / min(individual counts), which
   * is bounded to [0,1] and resistant to one runaway bestseller.
   */
  async updateAffinities(productIds: string[]) {
    const unique = [...new Set(productIds)];
    if (unique.length < 2) return;

    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        // Canonical ordering so each unordered pair has exactly one row.
        const [a, b] = [unique[i], unique[j]].sort();

        const affinity = await prisma.productAffinity.upsert({
          where: { productAId_productBId: { productAId: a, productBId: b } },
          create: { productAId: a, productBId: b, coOccurrence: 1, score: 0 },
          update: { coOccurrence: { increment: 1 }, computedAt: new Date() },
        });

        const [countA, countB] = await Promise.all([
          prisma.orderItem.count({ where: { productId: a } }),
          prisma.orderItem.count({ where: { productId: b } }),
        ]);

        const denominator = Math.max(1, Math.min(countA, countB));
        const score = Math.min(1, affinity.coOccurrence / denominator);
        await prisma.productAffinity.update({ where: { id: affinity.id }, data: { score } });
      }
    }
  },

  /** Full affinity rebuild from order history -- used by seed and the nightly job. */
  async rebuildAllAffinities() {
    const orders = await prisma.order.findMany({
      where: { status: { in: REVENUE_STATUSES } },
      select: { items: { select: { productId: true } } },
    });

    const pairCounts = new Map<string, number>();
    const productCounts = new Map<string, number>();

    for (const order of orders) {
      const unique = [...new Set(order.items.map((i) => i.productId))];
      for (const productId of unique) productCounts.set(productId, (productCounts.get(productId) ?? 0) + 1);

      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          const key = [unique[i], unique[j]].sort().join('|');
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }

    await prisma.productAffinity.deleteMany({});

    const rows = [...pairCounts.entries()]
      // A pair seen once is noise, not a pattern.
      .filter(([, count]) => count >= 2)
      .map(([key, coOccurrence]) => {
        const [productAId, productBId] = key.split('|');
        const denominator = Math.max(1, Math.min(productCounts.get(productAId) ?? 1, productCounts.get(productBId) ?? 1));
        return {
          productAId,
          productBId,
          coOccurrence,
          score: Math.min(1, coOccurrence / denominator),
        };
      });

    if (rows.length) await prisma.productAffinity.createMany({ data: rows, skipDuplicates: true });
    logger.info({ pairs: rows.length }, 'product affinities rebuilt');
    return rows.length;
  },

  /** Drops cached slots for a user after their intent changes (e.g. an order). */
  async invalidateForUser(userId: string) {
    await prisma.recommendation.deleteMany({ where: { userId } });
  },

  async clearExpired() {
    const { count } = await prisma.recommendation.deleteMany({
      where: { expiresAt: { not: null, lt: new Date() } },
    });
    return count;
  },
};
