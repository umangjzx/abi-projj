import { Router } from 'express';
import { z } from 'zod';
import { reportService, type ReportType } from './report.service';
import { toCsv, toExcel, toPdf } from './report.exporters';
import { asyncHandler, ok } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { reportLimiter } from '../../middleware/security';
import { recordActivity } from '../../middleware/audit';
import { parseRange, toISODate } from '../analytics/range';

export const reportRouter = Router();
reportRouter.use(requireAuth, requireAdmin);

const REPORT_TYPES = ['sales', 'customers', 'products', 'inventory', 'revenue', 'recommendations'] as const;

const reportQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  period: z.enum(['7d', '30d', '90d', '6m', '12m', 'mtd', 'ytd']).optional(),
});

const exportQuery = reportQuery.extend({
  format: z.enum(['pdf', 'excel', 'csv']).default('pdf'),
});

/** Lists the available reports so the admin UI is not hard-coded. */
reportRouter.get('/', (_req, res) =>
  ok(res, [
    { type: 'sales', title: 'Sales Report', description: 'Order-level sales with totals, discounts, payment and status.' },
    { type: 'revenue', title: 'Revenue Report', description: 'Revenue trend by period with AOV and unit volumes.' },
    { type: 'products', title: 'Product Report', description: 'Units sold, revenue, views and view-to-buy conversion per product.' },
    { type: 'customers', title: 'Customer Report', description: 'Registered customers with lifetime value and segments.' },
    { type: 'inventory', title: 'Inventory Report', description: 'Stock on hand, valuation and low-stock status per SKU.' },
    {
      type: 'recommendations',
      title: 'Recommendation Performance Report',
      description: 'Impression → click → cart → purchase funnel by strategy.',
    },
  ]),
);

/** JSON preview, so the UI can render the report on screen before exporting. */
reportRouter.get(
  '/:type',
  validate({ params: z.object({ type: z.enum(REPORT_TYPES) }), query: reportQuery }),
  asyncHandler(async (req, res) => {
    const range = parseRange(req.query as Record<string, unknown>);
    return ok(res, await reportService.build(req.params.type as ReportType, range));
  }),
);

reportRouter.get(
  '/:type/export',
  reportLimiter,
  validate({ params: z.object({ type: z.enum(REPORT_TYPES) }), query: exportQuery }),
  asyncHandler(async (req, res) => {
    const type = req.params.type as ReportType;
    const format = (req.query as unknown as { format: 'pdf' | 'excel' | 'csv' }).format;
    const range = parseRange(req.query as Record<string, unknown>);

    const report = await reportService.build(type, range);
    const filename = `thuthi-${type}-report-${toISODate(range.from)}-to-${toISODate(range.to)}`;

    void recordActivity({
      userId: req.user!.sub,
      actorEmail: req.user!.email,
      action: 'report.export',
      entity: 'Report',
      meta: { type, format, from: toISODate(range.from), to: toISODate(range.to), rows: report.rows.length },
    });

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return res.send(toCsv(report));
    }

    if (format === 'excel') {
      const buffer = await toExcel(report);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      res.setHeader('Content-Length', buffer.byteLength);
      return res.send(buffer);
    }

    const buffer = await toPdf(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    res.setHeader('Content-Length', buffer.byteLength);
    return res.send(buffer);
  }),
);
