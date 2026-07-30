import type { Request, Response } from 'express';
import { z } from 'zod';
import { categoryService } from './category.service';
import { productService } from './product.service';
import { created, noContent, ok, pageParams } from '../../lib/http';
import { logger } from '../../lib/logger';
import type { ListProductQuery } from './product.schema';

export const categoryController = {
  async list(req: Request, res: Response) {
    const q = req.query as unknown as { includeInactive: boolean; tree: boolean; withCounts: boolean };
    return ok(res, await categoryService.list(q));
  },

  async get(req: Request, res: Response) {
    return ok(res, await categoryService.getBySlugOrId(req.params.id));
  },

  async create(req: Request, res: Response) {
    return created(res, await categoryService.create(req.body));
  },

  async update(req: Request, res: Response) {
    return ok(res, await categoryService.update(req.params.id, req.body));
  },

  async remove(req: Request, res: Response) {
    await categoryService.remove(req.params.id);
    return noContent(res);
  },
};

export const productController = {
  async list(req: Request, res: Response) {
    const query = req.query as unknown as ListProductQuery;
    // Non-admins can never see deactivated products, whatever they pass.
    if (req.user?.role !== 'ADMIN') query.includeInactive = false;
    const page = pageParams(req.query as Record<string, unknown>, query.limit, 60);
    const { items, meta } = await productService.list(query, page);
    return ok(res, items, meta);
  },

  async get(req: Request, res: Response) {
    const includeInactive = req.user?.role === 'ADMIN';
    const product = await productService.getBySlugOrId(req.params.id, { includeInactive });

    // Telemetry must never delay or fail the page render.
    void productService
      .trackView(product.id, req.user?.sub)
      .catch((err) => logger.warn({ err, productId: product.id }, 'failed to track product view'));

    return ok(res, product);
  },

  async related(req: Request, res: Response) {
    const { limit } = req.query as unknown as { limit: number };
    const product = await productService.getBySlugOrId(req.params.id, { includeInactive: true });
    return ok(res, await productService.related(product.id, limit));
  },

  async suggest(req: Request, res: Response) {
    const { q, limit } = z
      .object({ q: z.string().trim().max(120).default(''), limit: z.coerce.number().int().min(1).max(15).default(8) })
      .parse(req.query);
    return ok(res, await productService.suggest(q, limit));
  },

  async filterMeta(_req: Request, res: Response) {
    const [bounds, categories] = await Promise.all([
      productService.priceBounds(),
      categoryService.list({ withCounts: true }),
    ]);
    return ok(res, { priceRange: bounds, categories, ratings: [4, 3, 2, 1] });
  },

  async create(req: Request, res: Response) {
    return created(res, await productService.create(req.body));
  },

  async update(req: Request, res: Response) {
    return ok(res, await productService.update(req.params.id, req.body));
  },

  async remove(req: Request, res: Response) {
    return ok(res, await productService.remove(req.params.id));
  },

  async toggleFeatured(req: Request, res: Response) {
    const { isFeatured } = z.object({ isFeatured: z.coerce.boolean() }).parse(req.body);
    return ok(res, await productService.toggleFeatured(req.params.id, isFeatured));
  },
};
