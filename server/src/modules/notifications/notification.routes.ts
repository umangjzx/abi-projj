import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ok, pageParams, pageMeta } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { validate, idParam } from '../../middleware/validate';

export const notificationRouter = Router();
notificationRouter.use(requireAuth);

/**
 * A customer sees notifications addressed to them; an admin additionally sees
 * the shared ADMIN audience feed (new orders, low stock).
 */
const scopeFor = (req: { user?: { sub: string; role: string } }) =>
  req.user!.role === 'ADMIN'
    ? { OR: [{ userId: req.user!.sub }, { audience: 'ADMIN' as const }] }
    : { userId: req.user!.sub, audience: 'USER' as const };

notificationRouter.get(
  '/',
  validate({
    query: z.object({
      unreadOnly: z.coerce.boolean().optional().default(false),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(50).optional().default(20),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { unreadOnly: boolean; limit: number };
    const where = { ...scopeFor(req), ...(q.unreadOnly ? { isRead: false } : {}) };
    const page = pageParams(req.query as Record<string, unknown>, q.limit, 50);

    const [rows, total, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: page.skip, take: page.take }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...scopeFor(req), isRead: false } }),
    ]);

    return ok(res, rows, { ...pageMeta(total, page), unread });
  }),
);

notificationRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) =>
    ok(res, { unread: await prisma.notification.count({ where: { ...scopeFor(req), isRead: false } }) }),
  ),
);

notificationRouter.patch(
  '/:id/read',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    // updateMany + the scope filter means a user cannot mark someone else's
    // notification as read by guessing an id.
    const { count } = await prisma.notification.updateMany({
      where: { id: req.params.id, ...scopeFor(req) },
      data: { isRead: true, readAt: new Date() },
    });
    return ok(res, { updated: count });
  }),
);

notificationRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const { count } = await prisma.notification.updateMany({
      where: { ...scopeFor(req), isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return ok(res, { updated: count });
  }),
);

notificationRouter.delete(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { count } = await prisma.notification.deleteMany({ where: { id: req.params.id, ...scopeFor(req) } });
    return ok(res, { deleted: count });
  }),
);
