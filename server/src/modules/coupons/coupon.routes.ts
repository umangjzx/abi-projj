import { Router } from 'express';
import { z } from 'zod';
import { couponService } from './coupon.service';
import { asyncHandler, created, ok, pageParams } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/rbac';
import { validate, idParam, safeText } from '../../middleware/validate';
import { auditLog } from '../../middleware/audit';
import { cartService } from '../cart/cart.service';

export const couponRouter = Router();

const couponBody = z.object({
  code: z.string().trim().toUpperCase().min(3).max(30).regex(/^[A-Z0-9_-]+$/, 'Use letters, numbers, hyphen or underscore only'),
  description: safeText(200).optional().or(z.literal('')),
  discountType: z.enum(['PERCENTAGE', 'FLAT']),
  value: z.coerce.number().positive(),
  minOrderValue: z.coerce.number().min(0).optional().default(0),
  maxDiscount: z.coerce.number().positive().optional().nullable(),
  usageLimit: z.coerce.number().int().positive().optional().nullable(),
  perUserLimit: z.coerce.number().int().min(1).optional().default(1),
  startsAt: z.string().optional(),
  expiresAt: z.string().optional().nullable(),
  isActive: z.coerce.boolean().optional().default(true),
});

// ------------------------------------------------------------- customer side ---

/** Coupons the signed-in customer can apply to their current cart. */
couponRouter.get(
  '/available',
  requireAuth,
  asyncHandler(async (req, res) => {
    const cart = await cartService.get(req.user!.sub);
    return ok(res, await couponService.availableFor(req.user!.sub, cart.pricing.subtotal));
  }),
);

couponRouter.post(
  '/preview',
  requireAuth,
  validate({ body: z.object({ code: z.string().trim().toUpperCase().min(3) }) }),
  asyncHandler(async (req, res) => {
    const cart = await cartService.get(req.user!.sub);
    return ok(res, await couponService.preview(req.body.code, req.user!.sub, cart.pricing.subtotal));
  }),
);

// ---------------------------------------------------------------- admin side ---

const adminOnly = [requireAuth, requireAdmin] as const;
const audited = auditLog(undefined, 'Coupon');

couponRouter.get(
  '/',
  ...adminOnly,
  validate({
    query: z.object({
      search: z.string().trim().optional(),
      status: z.enum(['active', 'expired', 'scheduled', 'all']).optional().default('all'),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { search?: string; status: 'active' | 'expired' | 'scheduled' | 'all'; limit: number };
    const { items, meta } = await couponService.list(q, pageParams(req.query as Record<string, unknown>, q.limit));
    return ok(res, items, meta);
  }),
);

couponRouter.post('/', ...adminOnly, audited, validate({ body: couponBody }), asyncHandler(async (req, res) => created(res, await couponService.create(req.body))));

couponRouter.patch(
  '/:id',
  ...adminOnly,
  audited,
  validate({ params: idParam, body: couponBody.partial() }),
  asyncHandler(async (req, res) => ok(res, await couponService.update(req.params.id, req.body))),
);

couponRouter.delete(
  '/:id',
  ...adminOnly,
  audited,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await couponService.remove(req.params.id))),
);
