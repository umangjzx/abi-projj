import { Router } from 'express';
import { z } from 'zod';
import { recommendationService } from './recommendation.service';
import { recommendationAnalytics } from './recommendation.analytics';
import { recommendationEval } from './recommendation.eval';
import { asyncHandler, ok } from '../../lib/http';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { prisma } from '../../lib/prisma';
import { productInclude, serializeProduct } from '../catalog/catalog.serializer';
import { parseRange } from '../analytics/range';

export const recommendationRouter = Router();

const PLACEMENTS = ['HOME', 'PRODUCT_DETAIL', 'CART', 'CHECKOUT', 'CUSTOMER_DASHBOARD', 'SEARCH'] as const;
const STRATEGIES = [
  'PURCHASE_HISTORY',
  'CATEGORY_AFFINITY',
  'FREQUENTLY_BOUGHT_TOGETHER',
  'POPULAR',
  'COLLABORATIVE',
  'RECENTLY_VIEWED',
  'TRENDING',
] as const;

const feedQuery = z.object({
  placement: z.enum(PLACEMENTS).optional().default('HOME'),
  limit: z.coerce.number().int().min(1).max(24).optional().default(8),
  productIds: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined)),
  excludeIds: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined)),
});

/**
 * The single personalised feed endpoint. Works for anonymous visitors too --
 * they simply get the non-personalised strategies.
 */
recommendationRouter.get(
  '/',
  optionalAuth,
  validate({ query: feedQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof feedQuery>;
    return ok(
      res,
      await recommendationService.getFor({
        userId: req.user?.sub,
        placement: q.placement,
        limit: q.limit,
        productIds: q.productIds,
        excludeIds: q.excludeIds,
      }),
    );
  }),
);

/** Homepage rails: featured / best sellers / trending / new arrivals in one call. */
recommendationRouter.get(
  '/home',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const [featured, bestSellers, newArrivals, trending, personalised] = await Promise.all([
      prisma.product
        .findMany({ where: { isActive: true, isFeatured: true }, include: productInclude, take: 8, orderBy: { soldCount: 'desc' } })
        .then((rows) => rows.map(serializeProduct)),
      prisma.product
        .findMany({ where: { isActive: true }, include: productInclude, take: 8, orderBy: [{ soldCount: 'desc' }, { avgRating: 'desc' }] })
        .then((rows) => rows.map(serializeProduct)),
      prisma.product
        .findMany({ where: { isActive: true }, include: productInclude, take: 8, orderBy: { createdAt: 'desc' } })
        .then((rows) => rows.map(serializeProduct)),
      hydrate(await recommendationService.trending(8)),
      req.user
        ? recommendationService.getFor({ userId: req.user.sub, placement: 'HOME', limit: 8 })
        : Promise.resolve([]),
    ]);

    return ok(res, { featured, bestSellers, newArrivals, trending, personalised });
  }),
);

/** Recently viewed list for the signed-in customer. */
recommendationRouter.get(
  '/recently-viewed',
  requireAuth,
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(20).optional().default(10) }) }),
  asyncHandler(async (req, res) => {
    const rows = await prisma.recentlyViewed.findMany({
      where: { userId: req.user!.sub },
      orderBy: { viewedAt: 'desc' },
      take: Number(req.query.limit),
      include: { product: { include: productInclude } },
    });

    return ok(
      res,
      rows.filter((r) => r.product.isActive).map((r) => ({ ...serializeProduct(r.product), viewedAt: r.viewedAt })),
    );
  }),
);

recommendationRouter.delete(
  '/recently-viewed',
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.recentlyViewed.deleteMany({ where: { userId: req.user!.sub } });
    return ok(res, { message: 'Browsing history cleared' });
  }),
);

/** Funnel telemetry from the client (fire-and-forget). */
recommendationRouter.post(
  '/track',
  optionalAuth,
  validate({
    body: z.object({
      productId: z.string().min(1),
      strategy: z.enum(STRATEGIES),
      placement: z.enum(PLACEMENTS),
      event: z.enum(['CLICK', 'ADD_TO_CART']),
    }),
  }),
  asyncHandler(async (req, res) => {
    await recommendationService.trackEvent({ userId: req.user?.sub, ...req.body });
    return ok(res, { tracked: true });
  }),
);

// -------------------------------------------------------- admin monitoring ---

const adminOnly = [requireAuth, requireAdmin] as const;

recommendationRouter.get(
  '/admin/performance',
  ...adminOnly,
  asyncHandler(async (req, res) =>
    ok(res, await recommendationAnalytics.performance(parseRange(req.query as Record<string, unknown>))),
  ),
);

recommendationRouter.get(
  '/admin/slots',
  ...adminOnly,
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).optional().default(50) }) }),
  asyncHandler(async (req, res) => ok(res, await recommendationAnalytics.activeSlots(Number(req.query.limit)))),
);

recommendationRouter.get(
  '/admin/affinities',
  ...adminOnly,
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(100).optional().default(20) }) }),
  asyncHandler(async (req, res) => ok(res, await recommendationAnalytics.topAffinities(Number(req.query.limit)))),
);

recommendationRouter.get('/admin/coverage', ...adminOnly, asyncHandler(async (_req, res) => ok(res, await recommendationAnalytics.coverage())));

/**
 * Offline evaluation: temporal hold-out, Precision/Recall/MAP/NDCG @K plus
 * coverage, diversity and popularity-bias, with MOST_POPULAR and RANDOM
 * baselines to compare against.
 */
recommendationRouter.get(
  '/admin/evaluate',
  ...adminOnly,
  validate({
    query: z.object({
      k: z.coerce.number().int().min(1).max(50).optional().default(10),
      testFraction: z.coerce.number().min(0.1).max(0.5).optional().default(0.2),
    }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await recommendationEval.run({ k: Number(req.query.k), testFraction: Number(req.query.testFraction) })),
  ),
);

/** Manual model rebuild, for after a bulk import. */
recommendationRouter.post(
  '/admin/rebuild',
  ...adminOnly,
  asyncHandler(async (_req, res) => {
    const pairs = await recommendationService.rebuildAllAffinities();
    const expired = await recommendationService.clearExpired();
    return ok(res, { message: 'Recommendation model rebuilt', affinityPairs: pairs, expiredSlotsRemoved: expired });
  }),
);

async function hydrate(candidates: { productId: string; score: number; strategy: string; reason: string }[]) {
  if (!candidates.length) return [];
  const products = await prisma.product.findMany({
    where: { id: { in: candidates.map((c) => c.productId) }, isActive: true },
    include: productInclude,
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return candidates
    .filter((c) => byId.has(c.productId))
    .map((c) => ({
      ...serializeProduct(byId.get(c.productId)),
      recommendation: { strategy: c.strategy, score: Number(c.score.toFixed(4)), reason: c.reason, placement: 'HOME' },
    }));
}
