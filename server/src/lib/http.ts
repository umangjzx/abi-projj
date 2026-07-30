import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Uniform success envelope so the client never has to guess a shape. */
export interface Meta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export function ok<T>(res: Response, data: T, meta?: Meta, status = 200) {
  return res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function created<T>(res: Response, data: T, meta?: Meta) {
  return ok(res, data, meta, 201);
}

export function noContent(res: Response) {
  return res.status(204).send();
}

/**
 * Wraps an async handler so a rejected promise reaches Express' error
 * middleware instead of becoming an unhandled rejection.
 */
export const asyncHandler =
  <T extends RequestHandler>(fn: T): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export interface PageParams {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

/** Normalises `?page=&limit=` with sane bounds (limit is capped to protect the DB). */
export function pageParams(query: Record<string, unknown>, defaultLimit = 12, maxLimit = 100): PageParams {
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(String(query.limit ?? defaultLimit), 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function pageMeta(total: number, { page, limit }: PageParams): Meta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
