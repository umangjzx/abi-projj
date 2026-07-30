import { Router } from 'express';
import { z } from 'zod';
import { orderService } from './order.service';
import { invoiceService } from './invoice.service';
import { asyncHandler, created, ok, pageParams } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/rbac';
import { validate, idParam, safeText } from '../../middleware/validate';
import { auditLog } from '../../middleware/audit';

export const orderRouter = Router();
orderRouter.use(requireAuth);

const ORDER_STATUS = [
  'PENDING',
  'CONFIRMED',
  'PACKED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
] as const;

const placeOrderSchema = z.object({
  addressId: z.string().min(1, 'Delivery address is required'),
  paymentMethod: z.enum(['COD', 'UPI', 'CARD', 'NETBANKING', 'WALLET']),
  notes: safeText(300).optional().or(z.literal('')),
});

const listQuery = z.object({
  status: z.enum(ORDER_STATUS).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

const adminListQuery = listQuery.extend({
  search: z.string().trim().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  userId: z.string().optional(),
});

// ------------------------------------------------------------- admin routes ---
// Registered before `/:id` so "all" is not parsed as an order id.

orderRouter.get(
  '/all',
  requireAdmin,
  validate({ query: adminListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof adminListQuery>;
    const { items, meta } = await orderService.listAll(q, pageParams(req.query as Record<string, unknown>, q.limit, 50));
    return ok(res, items, meta);
  }),
);

orderRouter.patch(
  '/:id/status',
  requireAdmin,
  auditLog('order.updateStatus', 'Order'),
  validate({
    params: idParam,
    body: z.object({ status: z.enum(ORDER_STATUS), note: safeText(300).optional() }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await orderService.updateStatus(req.params.id, req.body.status, req.user!.sub, req.body.note)),
  ),
);

// ---------------------------------------------------------- customer routes ---

orderRouter.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const { items, meta } = await orderService.listForUser(req.user!.sub, q, pageParams(req.query as Record<string, unknown>, q.limit, 50));
    return ok(res, items, meta);
  }),
);

orderRouter.get('/stats', asyncHandler(async (req, res) => ok(res, await orderService.stats(req.user!.sub))));

orderRouter.post(
  '/',
  auditLog('order.place', 'Order'),
  validate({ body: placeOrderSchema }),
  asyncHandler(async (req, res) => created(res, await orderService.place(req.user!.sub, req.body))),
);

orderRouter.get(
  '/track/:orderNumber',
  validate({ params: z.object({ orderNumber: z.string().min(4) }) }),
  asyncHandler(async (req, res) =>
    ok(res, await orderService.track(req.params.orderNumber, req.user!.sub, req.user!.role === 'ADMIN')),
  ),
);

orderRouter.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) =>
    ok(res, await orderService.getById(req.params.id, req.user!.sub, req.user!.role === 'ADMIN')),
  ),
);

orderRouter.get(
  '/:id/invoice',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const order = await orderService.getById(req.params.id, req.user!.sub, req.user!.role === 'ADMIN');
    const pdf = await invoiceService.build(order);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.orderNumber}.pdf"`);
    res.setHeader('Content-Length', pdf.byteLength);
    return res.send(pdf);
  }),
);

orderRouter.post(
  '/:id/cancel',
  auditLog('order.cancel', 'Order'),
  validate({ params: idParam, body: z.object({ reason: safeText(300).optional() }) }),
  asyncHandler(async (req, res) =>
    ok(res, await orderService.cancelByCustomer(req.params.id, req.user!.sub, req.body.reason)),
  ),
);
