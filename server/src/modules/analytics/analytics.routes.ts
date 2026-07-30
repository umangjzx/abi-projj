import { Router } from 'express';
import { z } from 'zod';
import { analyticsService } from './analytics.service';
import { dashboardService } from './dashboard.service';
import { parseRange } from './range';
import { asyncHandler, ok } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';

export const analyticsRouter = Router();

const rangeQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  period: z.enum(['7d', '30d', '90d', '6m', '12m', 'mtd', 'ytd']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

// ------------------------------------------------------ customer dashboard ---
// Registered before the admin guard so customers can reach their own overview.

analyticsRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => ok(res, await dashboardService.customerOverview(req.user!.sub))),
);

// -------------------------------------------------------------- admin only ---

analyticsRouter.use(requireAuth, requireAdmin);

const withRange = (handler: (range: ReturnType<typeof parseRange>, req: any) => Promise<unknown>) =>
  asyncHandler(async (req, res) => ok(res, await handler(parseRange(req.query as Record<string, unknown>), req)));

analyticsRouter.get('/dashboard', validate({ query: rangeQuery }), withRange((range) => dashboardService.overview(range)));

analyticsRouter.get('/kpis', validate({ query: rangeQuery }), withRange((range) => analyticsService.kpis(range)));

analyticsRouter.get('/sales', validate({ query: rangeQuery }), withRange((range) => analyticsService.salesSeries(range)));

analyticsRouter.get(
  '/sales/monthly',
  validate({ query: z.object({ months: z.coerce.number().int().min(3).max(36).optional().default(12) }) }),
  asyncHandler(async (req, res) => ok(res, await analyticsService.monthlySales(Number(req.query.months)))),
);

analyticsRouter.get('/seasonal', asyncHandler(async (_req, res) => ok(res, await analyticsService.seasonalTrends())));

analyticsRouter.get('/heatmap', validate({ query: rangeQuery }), withRange((range) => analyticsService.orderHeatmap(range)));

analyticsRouter.get(
  '/products',
  validate({ query: rangeQuery }),
  withRange((range, req) => analyticsService.productPerformance(range, Number(req.query.limit ?? 10))),
);

analyticsRouter.get(
  '/products/demand',
  validate({ query: rangeQuery }),
  withRange((range, req) => analyticsService.productDemand(range, Number(req.query.limit ?? 15))),
);

analyticsRouter.get('/categories', validate({ query: rangeQuery }), withRange((range) => analyticsService.categoryPerformance(range)));

analyticsRouter.get('/customers/growth', validate({ query: rangeQuery }), withRange((range) => analyticsService.customerGrowth(range)));

analyticsRouter.get('/customers/retention', asyncHandler(async (_req, res) => ok(res, await analyticsService.retention())));

analyticsRouter.get('/customers/segments', asyncHandler(async (_req, res) => ok(res, await analyticsService.customerSegments())));

analyticsRouter.get(
  '/customers/top',
  validate({ query: rangeQuery }),
  withRange((range, req) => analyticsService.topCustomers(range, Number(req.query.limit ?? 10))),
);

analyticsRouter.get(
  '/customers/locations',
  validate({ query: rangeQuery }),
  withRange((range, req) => analyticsService.customerLocations(range, Number(req.query.limit ?? 12))),
);

analyticsRouter.get('/orders/status', validate({ query: rangeQuery }), withRange((range) => analyticsService.orderStatusBreakdown(range)));

analyticsRouter.get('/payments', validate({ query: rangeQuery }), withRange((range) => analyticsService.paymentBreakdown(range)));

analyticsRouter.get(
  '/forecast',
  validate({
    query: z.object({
      days: z.coerce.number().int().min(3).max(60).optional().default(14),
      lookback: z.coerce.number().int().min(14).max(365).optional().default(90),
    }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await analyticsService.forecast(Number(req.query.days), Number(req.query.lookback))),
  ),
);

analyticsRouter.get(
  '/snapshots',
  validate({ query: rangeQuery.extend({ metric: z.string().optional() }) }),
  withRange((range, req) => analyticsService.snapshots(range, req.query.metric as string | undefined)),
);

/** Manual roll-up trigger, useful right after seeding. */
analyticsRouter.post(
  '/snapshots/rebuild',
  validate({ query: z.object({ days: z.coerce.number().int().min(1).max(400).optional().default(90) }) }),
  asyncHandler(async (req, res) => {
    const days = Number(req.query.days);
    const written: string[] = [];
    for (let i = 0; i < days; i++) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const result = await analyticsService.writeDailySnapshot(day);
      written.push(result.date);
    }
    return ok(res, { message: `Rebuilt ${written.length} daily snapshot(s)`, days: written.length });
  }),
);
