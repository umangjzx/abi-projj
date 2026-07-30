import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/ApiError';
import { verifyAccessToken, type AccessTokenPayload } from '../lib/tokens';
import { prisma } from '../lib/prisma';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  // Cookie fallback supports same-site browser flows without JS access to the token.
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.accessToken;
  return cookieToken ?? null;
}

/** Rejects the request unless a valid, non-expired access token is present. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(ApiError.unauthorized('Please sign in to continue'));
  req.user = verifyAccessToken(token);
  return next();
}

/**
 * Attaches `req.user` when a token happens to be present but never fails.
 * Used by endpoints that personalise their response for signed-in visitors
 * (home page recommendations, product detail) yet stay public.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    req.user = verifyAccessToken(token);
  } catch {
    // An expired token on a public route is not an error -- serve anonymously.
  }
  return next();
}

/**
 * Verifies the account still exists and is active. Applied to sensitive admin
 * routes so a deactivated user cannot keep operating with an unexpired token.
 */
export async function requireActiveAccount(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized());
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { isActive: true },
  });
  if (!user) return next(ApiError.unauthorized('Account no longer exists'));
  if (!user.isActive) return next(ApiError.forbidden('This account has been deactivated'));
  return next();
}
