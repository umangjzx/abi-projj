import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/ApiError';
import { asyncHandler, created, noContent, ok } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { validate, idParam } from '../../middleware/validate';
import { productInclude, serializeProduct } from '../catalog/catalog.serializer';

export const wishlistRouter = Router();
wishlistRouter.use(requireAuth);

wishlistRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await prisma.wishlistItem.findMany({
      where: { userId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
      include: { product: { include: productInclude } },
    });

    return ok(
      res,
      rows
        // A product may have been deactivated after being wishlisted.
        .filter((r) => r.product.isActive)
        .map((r) => ({ wishlistItemId: r.id, addedAt: r.createdAt, ...serializeProduct(r.product) })),
    );
  }),
);

/** Just the ids, for cheap heart-icon state across listing pages. */
wishlistRouter.get(
  '/ids',
  asyncHandler(async (req, res) => {
    const rows = await prisma.wishlistItem.findMany({
      where: { userId: req.user!.sub },
      select: { productId: true },
    });
    return ok(res, rows.map((r) => r.productId));
  }),
);

wishlistRouter.post(
  '/',
  validate({ body: z.object({ productId: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.sub;
    const { productId } = req.body;

    const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, isActive: true } });
    if (!product || !product.isActive) throw ApiError.notFound('Product not found');

    // Idempotent: adding twice is a no-op rather than an error.
    const item = await prisma.wishlistItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });

    return created(res, { id: item.id, productId, added: true });
  }),
);

/** Convenience toggle so the client needs one call for the heart button. */
wishlistRouter.post(
  '/toggle',
  validate({ body: z.object({ productId: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.sub;
    const { productId } = req.body;

    const existing = await prisma.wishlistItem.findUnique({ where: { userId_productId: { userId, productId } } });

    if (existing) {
      await prisma.wishlistItem.delete({ where: { id: existing.id } });
      return ok(res, { productId, inWishlist: false });
    }

    const product = await prisma.product.findUnique({ where: { id: productId }, select: { isActive: true } });
    if (!product?.isActive) throw ApiError.notFound('Product not found');

    await prisma.wishlistItem.create({ data: { userId, productId } });
    return ok(res, { productId, inWishlist: true });
  }),
);

wishlistRouter.delete(
  '/:productId',
  validate({ params: z.object({ productId: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    await prisma.wishlistItem
      .delete({ where: { userId_productId: { userId: req.user!.sub, productId: req.params.productId } } })
      .catch(() => {
        throw ApiError.notFound('That product is not in your wishlist');
      });
    return noContent(res);
  }),
);

wishlistRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    const { count } = await prisma.wishlistItem.deleteMany({ where: { userId: req.user!.sub } });
    return ok(res, { removed: count });
  }),
);
