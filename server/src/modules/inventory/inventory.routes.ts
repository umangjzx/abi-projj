import { Router } from 'express';
import { z } from 'zod';
import { inventoryService } from './inventory.service';
import { asyncHandler, ok, pageParams } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/rbac';
import { validate, safeText } from '../../middleware/validate';
import { auditLog } from '../../middleware/audit';

export const inventoryRouter = Router();

// Inventory is admin-only in its entirety -- stock levels are commercially
// sensitive and are exposed to customers only as an in-stock boolean.
inventoryRouter.use(requireAuth, requireAdmin);

const listQuery = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['all', 'low', 'out', 'healthy']).optional().default('all'),
  categoryId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const adjustBody = z.object({
  quantity: z.coerce.number().int().refine((v) => v !== 0, 'Quantity must not be zero'),
  type: z.enum(['PURCHASE', 'RETURN', 'ADJUSTMENT', 'DAMAGE']),
  reason: safeText(200).optional(),
});

inventoryRouter.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const { items, meta } = await inventoryService.list(q, pageParams(req.query as Record<string, unknown>, q.limit, 100));
    return ok(res, items, meta);
  }),
);

inventoryRouter.get('/summary', asyncHandler(async (_req, res) => ok(res, await inventoryService.summary())));

inventoryRouter.get(
  '/alerts',
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(50).optional().default(10) }) }),
  asyncHandler(async (req, res) => ok(res, await inventoryService.lowStockAlerts(Number(req.query.limit)))),
);

inventoryRouter.get(
  '/movements',
  validate({
    query: z.object({
      variantId: z.string().optional(),
      type: z.enum(['PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'DAMAGE', 'RESERVE', 'RELEASE']).optional(),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { variantId?: string; type?: never; limit: number };
    const { items, meta } = await inventoryService.movements(q, pageParams(req.query as Record<string, unknown>, q.limit, 100));
    return ok(res, items, meta);
  }),
);

inventoryRouter.post(
  '/:variantId/adjust',
  auditLog('inventory.adjust', 'Inventory'),
  validate({ params: z.object({ variantId: z.string().min(1) }), body: adjustBody }),
  asyncHandler(async (req, res) =>
    ok(res, await inventoryService.adjust(req.params.variantId, req.body, req.user!.sub)),
  ),
);

inventoryRouter.patch(
  '/:variantId/threshold',
  auditLog('inventory.threshold', 'Inventory'),
  validate({
    params: z.object({ variantId: z.string().min(1) }),
    body: z.object({ lowStockThreshold: z.coerce.number().int().min(0).max(10_000) }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await inventoryService.setThreshold(req.params.variantId, req.body.lowStockThreshold)),
  ),
);
