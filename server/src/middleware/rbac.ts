import type { NextFunction, Request, Response } from 'express';
import type { RoleName } from '@prisma/client';
import { ApiError } from '../lib/ApiError';

/**
 * Role gate. `requireRole('ADMIN')` is the coarse check used by the admin
 * router; `requirePermission` allows finer scopes to be granted per role
 * without changing code.
 */
export function requireRole(...roles: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`This action requires the ${roles.join(' or ')} role`));
    }
    return next();
  };
}

export const requireAdmin = requireRole('ADMIN');

export function requirePermission(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    // Wildcard grant, used by the built-in ADMIN role.
    if (req.user.permissions.includes('*')) return next();
    const missing = permissions.filter((p) => !req.user!.permissions.includes(p));
    if (missing.length) {
      return next(ApiError.forbidden(`Missing permission: ${missing.join(', ')}`));
    }
    return next();
  };
}

/**
 * Ownership guard for customer-scoped resources: allows the request when the
 * caller owns the record, or when the caller is an admin.
 */
export function requireSelfOrAdmin(getOwnerId: (req: Request) => string | undefined) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (req.user.role === 'ADMIN') return next();
    if (getOwnerId(req) === req.user.sub) return next();
    return next(ApiError.forbidden());
  };
}
