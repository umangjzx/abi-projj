import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, z } from 'zod';
import { ApiError } from '../lib/ApiError';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates and *replaces* the request parts with their parsed output, so
 * downstream handlers receive coerced, trimmed, strongly-typed values. This is
 * the single choke point for input validation -- combined with Prisma's
 * parameterised queries it is what closes off SQL injection and mass
 * assignment.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as Request['params'];
      if (schemas.query) req.query = schemas.query.parse(req.query) as Request['query'];
      if (schemas.body) req.body = schemas.body.parse(req.body);
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        const fieldErrors = err.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        }));
        return next(ApiError.unprocessable('Validation failed', fieldErrors));
      }
      return next(err);
    }
  };
}

// ------------------------------------------------------------- shared bits ---

/** cuid()s are what Prisma generates for every primary key in this schema. */
export const idParam = z.object({ id: z.string().min(1, 'id is required') });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(12),
});

export const dateRangeQuery = z.object({
  from: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  to: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

/**
 * Strips characters commonly used in stored-XSS payloads from free-text fields
 * that are rendered back to other users (reviews, product copy). React escapes
 * output already; this is defence in depth for any non-React consumer such as
 * the PDF/Excel exports.
 */
export const safeText = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .transform((v) => v.replace(/<\/?[a-z][^>]*>/gi, '').replace(/javascript:/gi, ''));

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a number');

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');

export const pincodeSchema = z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code');

export const otpSchema = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');
