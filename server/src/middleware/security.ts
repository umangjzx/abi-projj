import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { ApiError } from '../lib/ApiError';
import { safeEqual } from '../lib/tokens';

// ------------------------------------------------------------ rate limiting ---

const windowMs = env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;

const handler = (_req: Request, _res: Response, next: NextFunction) =>
  next(ApiError.tooMany());

/** Global limiter -- a blunt shield against scraping and accidental loops. */
export const globalLimiter = rateLimit({
  windowMs,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  skip: () => env.isTest,
});

/**
 * Tight limiter for credential endpoints. Keyed by IP *and* submitted email so
 * one attacker cannot lock every account out from a single address, and a
 * distributed attack still hits the per-account ceiling.
 */
export const authLimiter = rateLimit({
  windowMs,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  skip: () => env.isTest,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : 'anonymous';
    return `${normalizeIp(req.ip)}:${email}`;
  },
});

/**
 * Buckets IPv6 addresses by their /64 prefix. A single client is routinely
 * handed many addresses inside one /64, so keying on the full address would let
 * an attacker sidestep the limiter simply by rotating the low bits.
 */
function normalizeIp(ip: string | undefined): string {
  if (!ip) return 'unknown';
  // Unwrap IPv4-mapped IPv6 (::ffff:127.0.0.1) to the plain IPv4 form.
  const unmapped = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (!unmapped.includes(':')) return unmapped;
  return `${unmapped.split(':').slice(0, 4).join(':')}::/64`;
}

/** Report generation is expensive (PDF/Excel rendering) -- throttle separately. */
export const reportLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  skip: () => env.isTest,
});

// -------------------------------------------------------------------- CSRF ---

const CSRF_COOKIE = 'csrfToken';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Issues a double-submit CSRF token. The cookie is readable by JS so the SPA
 * can echo it back in a header; an attacker on another origin can neither read
 * the cookie nor set the custom header, so the pair cannot be forged.
 */
export function issueCsrfToken(req: Request, res: Response, next: NextFunction) {
  const existing = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE];
  if (!existing) {
    const token = crypto.randomBytes(24).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: env.isProd ? 'none' : 'lax',
      secure: env.isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    res.locals.csrfToken = token;
  } else {
    res.locals.csrfToken = existing;
  }
  next();
}

/**
 * Enforces the double-submit check. Only needed for cookie-authenticated,
 * state-changing routes (refresh/logout): Bearer-token requests are immune
 * because the browser will not attach the header cross-origin on its own.
 */
export function verifyCsrf(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method) || env.isTest) return next();

  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);

  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    return next(new ApiError(403, 'CSRF token missing or invalid', 'CSRF_FAILED'));
  }
  return next();
}

// -------------------------------------------------- request payload hygiene ---

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Strips prototype-polluting keys from parsed JSON before any handler touches
 * it. Cheap insurance against `{"__proto__":{"isAdmin":true}}` style payloads.
 */
export function sanitizePayload(req: Request, _res: Response, next: NextFunction) {
  const scrub = (value: unknown, depth = 0): void => {
    if (depth > 8 || value === null || typeof value !== 'object') return;
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (DANGEROUS_KEYS.has(key)) {
        delete (value as Record<string, unknown>)[key];
        continue;
      }
      scrub((value as Record<string, unknown>)[key], depth + 1);
    }
  };
  scrub(req.body);
  scrub(req.query);
  next();
}
