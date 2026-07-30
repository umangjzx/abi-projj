import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, created, ok, pageParams, pageMeta, noContent } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/rbac';
import { validate, idParam, safeText } from '../../middleware/validate';
import { auditLog } from '../../middleware/audit';
import { deleteImage } from '../../lib/storage';
import { ApiError } from '../../lib/ApiError';

export const offerRouter = Router();

const offerBody = z.object({
  title: safeText(100, 2),
  subtitle: safeText(160).optional().or(z.literal('')),
  description: safeText(500).optional().or(z.literal('')),
  bannerUrl: z.string().url().optional().or(z.literal('')),
  bannerPublicId: z.string().optional(),
  ctaLabel: safeText(40).optional().or(z.literal('')),
  ctaHref: z.string().max(200).optional().or(z.literal('')),
  type: z.enum(['BANNER', 'CATEGORY_DISCOUNT', 'PRODUCT_DISCOUNT', 'COMBO']).optional().default('BANNER'),
  discountPercent: z.coerce.number().int().min(1).max(90).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  priority: z.coerce.number().int().min(0).max(100).optional().default(0),
  startsAt: z.string().optional(),
  endsAt: z.string().optional().nullable(),
  isActive: z.coerce.boolean().optional().default(true),
});

const serialize = (offer: any) => ({
  id: offer.id,
  title: offer.title,
  subtitle: offer.subtitle,
  description: offer.description,
  bannerUrl: offer.bannerUrl,
  ctaLabel: offer.ctaLabel,
  ctaHref: offer.ctaHref,
  type: offer.type,
  discountPercent: offer.discountPercent,
  priority: offer.priority,
  startsAt: offer.startsAt,
  endsAt: offer.endsAt,
  isActive: offer.isActive,
  category: offer.category ? { id: offer.category.id, name: offer.category.name, slug: offer.category.slug } : null,
  product: offer.product ? { id: offer.product.id, name: offer.product.name, slug: offer.product.slug } : null,
});

const offerInclude = {
  category: { select: { id: true, name: true, slug: true } },
  product: { select: { id: true, name: true, slug: true } },
} as const;

/** Live offers for the storefront hero carousel and promo strips. */
offerRouter.get(
  '/active',
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const rows = await prisma.offer.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 12,
      include: offerInclude,
    });
    return ok(res, rows.map(serialize));
  }),
);

// ---------------------------------------------------------------- admin CRUD ---

const adminOnly = [requireAuth, requireAdmin] as const;
const audited = auditLog(undefined, 'Offer');

offerRouter.get(
  '/',
  ...adminOnly,
  validate({
    query: z.object({
      status: z.enum(['all', 'active', 'scheduled', 'expired']).optional().default('all'),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { status: string; limit: number };
    const now = new Date();
    const where =
      q.status === 'active'
        ? { isActive: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gte: now } }] }
        : q.status === 'scheduled'
          ? { startsAt: { gt: now } }
          : q.status === 'expired'
            ? { endsAt: { lt: now } }
            : {};

    const page = pageParams(req.query as Record<string, unknown>, q.limit, 100);
    const [rows, total] = await Promise.all([
      prisma.offer.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip: page.skip,
        take: page.take,
        include: offerInclude,
      }),
      prisma.offer.count({ where }),
    ]);

    return ok(res, rows.map(serialize), pageMeta(total, page));
  }),
);

offerRouter.post(
  '/',
  ...adminOnly,
  audited,
  validate({ body: offerBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof offerBody>;
    await assertTargets(body);

    const offer = await prisma.offer.create({
      data: {
        ...body,
        subtitle: body.subtitle || null,
        description: body.description || null,
        bannerUrl: body.bannerUrl || null,
        ctaLabel: body.ctaLabel || null,
        ctaHref: body.ctaHref || null,
        categoryId: body.categoryId || null,
        productId: body.productId || null,
        startsAt: body.startsAt ? new Date(body.startsAt) : new Date(),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
      },
      include: offerInclude,
    });

    return created(res, serialize(offer));
  }),
);

offerRouter.patch(
  '/:id',
  ...adminOnly,
  audited,
  validate({ params: idParam, body: offerBody.partial() }),
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<z.infer<typeof offerBody>>;
    await assertTargets(body);

    const data: Record<string, unknown> = { ...body };
    for (const key of ['subtitle', 'description', 'bannerUrl', 'ctaLabel', 'ctaHref', 'categoryId', 'productId'] as const) {
      if (body[key] !== undefined) data[key] = body[key] || null;
    }
    if (body.startsAt !== undefined) data.startsAt = new Date(body.startsAt);
    if (body.endsAt !== undefined) data.endsAt = body.endsAt ? new Date(body.endsAt) : null;

    const offer = await prisma.offer.update({ where: { id: req.params.id }, data, include: offerInclude });
    return ok(res, serialize(offer));
  }),
);

offerRouter.delete(
  '/:id',
  ...adminOnly,
  audited,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const offer = await prisma.offer.findUnique({ where: { id: req.params.id }, select: { bannerPublicId: true } });
    if (!offer) throw ApiError.notFound('Offer not found');

    await prisma.offer.delete({ where: { id: req.params.id } });
    void deleteImage(offer.bannerPublicId);
    return noContent(res);
  }),
);

/** Validates that a targeted category/product actually exists. */
async function assertTargets(body: { categoryId?: string | null; productId?: string | null }) {
  if (body.categoryId) {
    const exists = await prisma.category.findUnique({ where: { id: body.categoryId }, select: { id: true } });
    if (!exists) throw ApiError.badRequest('The selected category does not exist');
  }
  if (body.productId) {
    const exists = await prisma.product.findUnique({ where: { id: body.productId }, select: { id: true } });
    if (!exists) throw ApiError.badRequest('The selected product does not exist');
  }
}
