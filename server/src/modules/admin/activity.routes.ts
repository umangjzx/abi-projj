import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ok, pageParams, pageMeta } from '../../lib/http';
import { requireAuth, requireActiveAccount } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { env } from '../../config/env';
import { pricingConfig } from '../cart/pricing';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin, requireActiveAccount);

/**
 * Audit trail / activity log. Read-only by design: rows are written by the
 * audit middleware and there is deliberately no endpoint to edit or delete
 * them, which is what makes the trail trustworthy.
 */
adminRouter.get(
  '/activity',
  validate({
    query: z.object({
      userId: z.string().optional(),
      entity: z.string().optional(),
      action: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(30),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as {
      userId?: string;
      entity?: string;
      action?: string;
      from?: string;
      to?: string;
      limit: number;
    };

    const where = {
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.action ? { action: { contains: q.action, mode: 'insensitive' as const } } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: endOfDay(q.to) } : {}),
            },
          }
        : {}),
    };

    const page = pageParams(req.query as Record<string, unknown>, q.limit, 100);

    const [rows, total, entities] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page.skip,
        take: page.take,
        include: { user: { select: { name: true, email: true, role: { select: { name: true } } } } },
      }),
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({ distinct: ['entity'], select: { entity: true }, where: { entity: { not: null } } }),
    ]);

    return ok(
      res,
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        method: row.method,
        path: row.path,
        statusCode: row.statusCode,
        ip: row.ip,
        userAgent: row.userAgent,
        meta: row.meta,
        at: row.createdAt,
        actor: row.user
          ? { name: row.user.name, email: row.user.email, role: row.user.role.name }
          : { name: 'System', email: row.actorEmail, role: null },
      })),
      { ...pageMeta(total, page), entities: entities.map((e) => e.entity).filter(Boolean) },
    );
  }),
);

/** Effective runtime configuration, so the admin can verify a deployment. */
adminRouter.get('/settings', (_req, res) =>
  ok(res, {
    environment: env.NODE_ENV,
    pricing: pricingConfig,
    lowStockThreshold: env.LOW_STOCK_THRESHOLD,
    emailProvider: env.mailEnabled ? 'smtp' : 'console (SMTP not configured)',
    imageProvider: env.cloudinaryEnabled ? 'cloudinary' : 'local disk',
    emailVerificationRequired: env.REQUIRE_EMAIL_VERIFICATION,
    accessTokenTtl: env.JWT_ACCESS_EXPIRES_IN,
    refreshTokenTtl: env.JWT_REFRESH_EXPIRES_IN,
  }),
);

function endOfDay(value: string): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}
