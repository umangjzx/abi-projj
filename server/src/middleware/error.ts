import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { ApiError } from '../lib/ApiError';
import { logger } from '../lib/logger';
import { env } from '../config/env';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

/**
 * Terminal error handler. Translates framework/ORM/validation errors into the
 * uniform `{ success:false, error }` envelope and makes sure internal details
 * (stack traces, SQL, constraint names) never leak in production.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const mapped = mapError(err);

  const logPayload = {
    err,
    method: req.method,
    path: req.originalUrl,
    statusCode: mapped.statusCode,
    userId: req.user?.sub,
  };

  if (mapped.statusCode >= 500) logger.error(logPayload, mapped.message);
  else logger.warn({ ...logPayload, err: undefined, message: mapped.message }, 'request rejected');

  res.status(mapped.statusCode).json({
    success: false,
    error: {
      code: mapped.code,
      message: mapped.message,
      ...(mapped.details !== undefined ? { details: mapped.details } : {}),
      ...(!env.isProd && mapped.statusCode >= 500 && err instanceof Error ? { stack: err.stack } : {}),
    },
  });
}

function mapError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (err instanceof ZodError) {
    return ApiError.unprocessable(
      'Validation failed',
      err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }

  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large (maximum 5 MB)'
        : err.code === 'LIMIT_FILE_COUNT'
          ? 'Too many files uploaded'
          : `Upload error: ${err.message}`;
    return ApiError.badRequest(message);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) return mapPrismaError(err);

  if (err instanceof Prisma.PrismaClientValidationError) {
    return ApiError.badRequest('The request contained invalid or incomplete data');
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return new ApiError(503, 'Database is unavailable. Check DATABASE_URL and that PostgreSQL is running.', 'DB_UNAVAILABLE');
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return ApiError.badRequest('Request body is not valid JSON');
  }

  return ApiError.internal(err instanceof Error && !env.isProd ? err.message : 'Something went wrong');
}

function mapPrismaError(err: Prisma.PrismaClientKnownRequestError): ApiError {
  const target = Array.isArray(err.meta?.target)
    ? (err.meta!.target as string[]).join(', ')
    : String(err.meta?.target ?? 'field');

  switch (err.code) {
    case 'P2002':
      return ApiError.conflict(`A record with this ${humanise(target)} already exists`);
    case 'P2003':
      return ApiError.badRequest('Referenced record does not exist');
    case 'P2014':
      return ApiError.badRequest('This change would break a required relation');
    case 'P2025':
      return ApiError.notFound('Record not found');
    case 'P2000':
      return ApiError.badRequest(`Value for ${humanise(target)} is too long`);
    default:
      return ApiError.internal(env.isProd ? 'Database error' : `Database error ${err.code}: ${err.message}`);
  }
}

const humanise = (field: string) =>
  field
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
