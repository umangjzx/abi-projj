import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/ApiError';
import { asyncHandler, created, noContent, ok, pageParams, pageMeta } from '../../lib/http';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/rbac';
import { validate, idParam, safeText } from '../../middleware/validate';
import { auditLog } from '../../middleware/audit';
import { productService } from '../catalog/product.service';
import { REVENUE_STATUSES } from '../orders/order.service';

export const reviewRouter = Router();

const reviewBody = z.object({
  productId: z.string().min(1),
  rating: z.coerce.number().int().min(1, 'Rating must be between 1 and 5').max(5),
  title: safeText(100).optional().or(z.literal('')),
  comment: safeText(1500, 5),
});

const listQuery = z.object({
  productId: z.string().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'all']).optional().default('APPROVED'),
  sort: z.enum(['newest', 'oldest', 'highest', 'lowest', 'helpful']).optional().default('newest'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

const ORDER_BY = {
  newest: [{ createdAt: 'desc' as const }],
  oldest: [{ createdAt: 'asc' as const }],
  highest: [{ rating: { value: 'desc' as const } }],
  lowest: [{ rating: { value: 'asc' as const } }],
  helpful: [{ helpfulCount: 'desc' as const }, { createdAt: 'desc' as const }],
};

const serialize = (review: any) => ({
  id: review.id,
  title: review.title,
  comment: review.comment,
  rating: review.rating?.value ?? null,
  status: review.status,
  helpfulCount: review.helpfulCount,
  isVerified: review.isVerified,
  adminReply: review.adminReply,
  createdAt: review.createdAt,
  author: { id: review.user.id, name: review.user.name, avatarUrl: review.user.avatarUrl },
  product: review.product ? { id: review.product.id, name: review.product.name, slug: review.product.slug } : undefined,
});

const reviewInclude = {
  user: { select: { id: true, name: true, avatarUrl: true } },
  rating: { select: { value: true } },
  product: { select: { id: true, name: true, slug: true } },
} as const;

// -------------------------------------------------------------- public list ---

reviewRouter.get(
  '/',
  optionalAuth,
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    // Only admins may look at unapproved reviews.
    const status = req.user?.role === 'ADMIN' ? q.status : 'APPROVED';

    const where = {
      ...(q.productId ? { productId: q.productId } : {}),
      ...(status !== 'all' ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' } : {}),
      ...(q.rating ? { rating: { value: q.rating } } : {}),
    };

    const page = pageParams(req.query as Record<string, unknown>, q.limit, 50);

    const [rows, total, distribution] = await Promise.all([
      prisma.review.findMany({ where, include: reviewInclude, orderBy: ORDER_BY[q.sort], skip: page.skip, take: page.take }),
      prisma.review.count({ where }),
      q.productId
        ? prisma.rating.groupBy({ by: ['value'], where: { productId: q.productId }, _count: true })
        : Promise.resolve([]),
    ]);

    const breakdown = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: distribution.find((d) => d.value === star)?._count ?? 0,
    }));

    return ok(res, rows.map(serialize), { ...pageMeta(total, page), distribution: breakdown });
  }),
);

// ---------------------------------------------------------- customer writes ---

reviewRouter.post(
  '/',
  requireAuth,
  auditLog('review.create', 'Review'),
  validate({ body: reviewBody }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.sub;
    const { productId, rating, title, comment } = req.body;

    const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw ApiError.notFound('Product not found');

    const existing = await prisma.review.findUnique({ where: { userId_productId: { userId, productId } } });
    if (existing) throw ApiError.conflict('You have already reviewed this product. Edit your existing review instead.');

    // Verified-purchase badge, and the order it came from for traceability.
    const purchase = await prisma.orderItem.findFirst({
      where: { productId, order: { userId, status: { in: REVENUE_STATUSES } } },
      select: { orderId: true },
    });

    const review = await prisma.$transaction(async (tx) => {
      const ratingRow = await tx.rating.upsert({
        where: { userId_productId: { userId, productId } },
        create: { userId, productId, value: rating },
        update: { value: rating },
      });

      return tx.review.create({
        data: {
          userId,
          productId,
          ratingId: ratingRow.id,
          orderId: purchase?.orderId ?? null,
          title: title || null,
          comment,
          isVerified: Boolean(purchase),
          status: 'APPROVED',
        },
        include: reviewInclude,
      });
    });

    await productService.refreshRatingAggregates(productId);
    return created(res, serialize(review));
  }),
);

reviewRouter.patch(
  '/:id',
  requireAuth,
  auditLog('review.update', 'Review'),
  validate({
    params: idParam,
    body: z.object({
      rating: z.coerce.number().int().min(1).max(5).optional(),
      title: safeText(100).optional().or(z.literal('')),
      comment: safeText(1500, 5).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) throw ApiError.notFound('Review not found');
    if (review.userId !== req.user!.sub) throw ApiError.forbidden();

    const updated = await prisma.$transaction(async (tx) => {
      if (req.body.rating !== undefined) {
        await tx.rating.upsert({
          where: { userId_productId: { userId: review.userId, productId: review.productId } },
          create: { userId: review.userId, productId: review.productId, value: req.body.rating },
          update: { value: req.body.rating },
        });
      }
      return tx.review.update({
        where: { id: review.id },
        data: {
          ...(req.body.title !== undefined ? { title: req.body.title || null } : {}),
          ...(req.body.comment !== undefined ? { comment: req.body.comment } : {}),
        },
        include: reviewInclude,
      });
    });

    await productService.refreshRatingAggregates(review.productId);
    return ok(res, serialize(updated));
  }),
);

reviewRouter.delete(
  '/:id',
  requireAuth,
  auditLog('review.delete', 'Review'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) throw ApiError.notFound('Review not found');
    // The author can delete their own; an admin can delete any.
    if (review.userId !== req.user!.sub && req.user!.role !== 'ADMIN') throw ApiError.forbidden();

    await prisma.$transaction([
      prisma.review.delete({ where: { id: review.id } }),
      prisma.rating.deleteMany({ where: { userId: review.userId, productId: review.productId } }),
    ]);

    await productService.refreshRatingAggregates(review.productId);
    return noContent(res);
  }),
);

/** Reviews written by the signed-in customer, plus products awaiting a review. */
reviewRouter.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.sub;

    const [mine, purchased] = await Promise.all([
      prisma.review.findMany({ where: { userId }, include: reviewInclude, orderBy: { createdAt: 'desc' } }),
      prisma.orderItem.findMany({
        where: { order: { userId, status: 'DELIVERED' } },
        distinct: ['productId'],
        select: {
          productId: true,
          productName: true,
          imageUrl: true,
          product: { select: { slug: true, isActive: true } },
        },
      }),
    ]);

    const reviewedIds = new Set(mine.map((r) => r.productId));

    return ok(res, {
      reviews: mine.map(serialize),
      pending: purchased
        .filter((p) => !reviewedIds.has(p.productId) && p.product.isActive)
        .map((p) => ({ productId: p.productId, name: p.productName, slug: p.product.slug, image: p.imageUrl })),
    });
  }),
);

reviewRouter.post(
  '/:id/helpful',
  requireAuth,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const review = await prisma.review.update({
      where: { id: req.params.id },
      data: { helpfulCount: { increment: 1 } },
      select: { helpfulCount: true },
    });
    return ok(res, review);
  }),
);

// ---------------------------------------------------------- admin moderation ---

reviewRouter.patch(
  '/:id/moderate',
  requireAuth,
  requireAdmin,
  auditLog('review.moderate', 'Review'),
  validate({
    params: idParam,
    body: z.object({
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
      adminReply: safeText(600).optional().or(z.literal('')),
    }),
  }),
  asyncHandler(async (req, res) => {
    const review = await prisma.review.update({
      where: { id: req.params.id },
      data: {
        ...(req.body.status ? { status: req.body.status } : {}),
        ...(req.body.adminReply !== undefined ? { adminReply: req.body.adminReply || null } : {}),
      },
      include: reviewInclude,
    });

    // Approval status feeds the public review count aggregate.
    if (req.body.status) await productService.refreshRatingAggregates(review.productId);
    return ok(res, serialize(review));
  }),
);
