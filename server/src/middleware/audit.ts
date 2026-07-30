import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Body keys that must never reach the audit table. */
const SENSITIVE = new Set(['password', 'newPassword', 'currentPassword', 'confirmPassword', 'otp', 'token', 'refreshToken']);

function redact(body: unknown): unknown {
  if (!body || typeof body !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    out[key] = SENSITIVE.has(key) ? '[redacted]' : value;
  }
  return out;
}

/**
 * Records every mutating request that reaches an audited router into
 * `activity_logs`, which powers both the admin "Recent activities" feed and
 * the security audit trail.
 *
 * Writing happens on the response `finish` event so the real status code is
 * known and the audit insert never delays the response. Failures are logged
 * but deliberately swallowed -- auditing must not break the request.
 */
export function auditLog(action?: string, entity?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!MUTATING.has(req.method)) return next();

    const snapshot = {
      userId: req.user?.sub ?? null,
      actorEmail: req.user?.email ?? null,
      action: action ?? `${req.method} ${req.route?.path ?? req.path}`,
      entity: entity ?? null,
      entityId: (req.params?.id as string | undefined) ?? null,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      ip: req.ip ?? null,
      userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
      meta: redact(req.body) as object | undefined,
    };

    res.on('finish', () => {
      // Only successful mutations are interesting for the activity feed;
      // rejected attempts are already captured by the error logger.
      if (res.statusCode >= 400) return;
      prisma.activityLog
        .create({ data: { ...snapshot, statusCode: res.statusCode, meta: snapshot.meta as never } })
        .catch((err) => logger.warn({ err }, 'failed to write activity log'));
    });

    return next();
  };
}

/** Direct helper for service-layer events that are not tied to a request. */
export async function recordActivity(input: {
  userId?: string | null;
  actorEmail?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        userId: input.userId ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        meta: (input.meta ?? undefined) as never,
      },
    });
  } catch (err) {
    logger.warn({ err }, 'failed to record activity');
  }
}
