import { Router } from 'express';
import { categoryController, productController } from './catalog.controller';
import { asyncHandler } from '../../lib/http';
import { validate, idParam } from '../../middleware/validate';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/rbac';
import { auditLog } from '../../middleware/audit';
import { createCategorySchema, listCategoryQuery, updateCategorySchema } from './category.schema';
import { createProductSchema, listProductQuery, relatedQuery, updateProductSchema } from './product.schema';

// --------------------------------------------------------------- categories ---
export const categoryRouter = Router();

categoryRouter.get('/', validate({ query: listCategoryQuery }), asyncHandler(categoryController.list));
categoryRouter.get('/:id', validate({ params: idParam }), asyncHandler(categoryController.get));

const adminCategory = [requireAuth, requireAdmin, auditLog(undefined, 'Category')] as const;
categoryRouter.post('/', ...adminCategory, validate({ body: createCategorySchema }), asyncHandler(categoryController.create));
categoryRouter.patch('/:id', ...adminCategory, validate({ params: idParam, body: updateCategorySchema }), asyncHandler(categoryController.update));
categoryRouter.delete('/:id', ...adminCategory, validate({ params: idParam }), asyncHandler(categoryController.remove));

// ----------------------------------------------------------------- products ---
export const productRouter = Router();

// Specific paths must be registered before `/:id` or they would be swallowed by it.
productRouter.get('/suggest', asyncHandler(productController.suggest));
productRouter.get('/filters', asyncHandler(productController.filterMeta));

productRouter.get('/', optionalAuth, validate({ query: listProductQuery }), asyncHandler(productController.list));
productRouter.get('/:id', optionalAuth, validate({ params: idParam }), asyncHandler(productController.get));
productRouter.get('/:id/related', validate({ params: idParam, query: relatedQuery }), asyncHandler(productController.related));

const adminProduct = [requireAuth, requireAdmin, auditLog(undefined, 'Product')] as const;
productRouter.post('/', ...adminProduct, validate({ body: createProductSchema }), asyncHandler(productController.create));
productRouter.patch('/:id', ...adminProduct, validate({ params: idParam, body: updateProductSchema }), asyncHandler(productController.update));
productRouter.patch('/:id/featured', ...adminProduct, validate({ params: idParam }), asyncHandler(productController.toggleFeatured));
productRouter.delete('/:id', ...adminProduct, validate({ params: idParam }), asyncHandler(productController.remove));
