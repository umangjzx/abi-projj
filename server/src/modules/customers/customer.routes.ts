import { Router } from 'express';
import { z } from 'zod';
import { customerService } from './customer.service';
import { asyncHandler, ok, pageParams } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/rbac';
import { validate, idParam } from '../../middleware/validate';
import { auditLog } from '../../middleware/audit';

export const customerRouter = Router();

// Customer management is an admin capability; a customer's own data is served
// by /auth/me, /orders and /analytics/me.
customerRouter.use(requireAuth, requireAdmin);

const listQuery = z.object({
  search: z.string().trim().optional(),
  segment: z.enum(['NEW', 'ACTIVE', 'LOYAL', 'AT_RISK', 'CHURNED']).optional(),
  sort: z.enum(['recent', 'spend', 'orders', 'name']).optional().default('recent'),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

customerRouter.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const { items, meta } = await customerService.list(q, pageParams(req.query as Record<string, unknown>, q.limit, 100));
    return ok(res, items, meta);
  }),
);

customerRouter.get('/:id', validate({ params: idParam }), asyncHandler(async (req, res) => ok(res, await customerService.detail(req.params.id))));

customerRouter.patch(
  '/:id/status',
  auditLog('customer.setActive', 'User'),
  validate({ params: idParam, body: z.object({ isActive: z.coerce.boolean() }) }),
  asyncHandler(async (req, res) => ok(res, await customerService.setActive(req.params.id, req.body.isActive))),
);

customerRouter.post(
  '/segments/recompute',
  auditLog('customer.recomputeSegments', 'User'),
  asyncHandler(async (_req, res) => ok(res, await customerService.recomputeSegments())),
);

customerRouter.post(
  '/counters/resync',
  auditLog('customer.resyncCounters', 'User'),
  asyncHandler(async (_req, res) => ok(res, await customerService.resyncCounters())),
);
