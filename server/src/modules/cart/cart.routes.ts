import { Router } from 'express';
import { z } from 'zod';
import { cartService } from './cart.service';
import { asyncHandler, ok } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { validate, idParam } from '../../middleware/validate';

export const cartRouter = Router();

// The cart is always scoped to the signed-in user -- there is no anonymous cart
// on the server; the client keeps a guest cart in localStorage and merges it
// after login.
cartRouter.use(requireAuth);

const addItemSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
});

const updateItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).max(50),
});

const couponSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(30),
});

cartRouter.get('/', asyncHandler(async (req, res) => ok(res, await cartService.get(req.user!.sub))));

cartRouter.post(
  '/items',
  validate({ body: addItemSchema }),
  asyncHandler(async (req, res) => ok(res, await cartService.addItem(req.user!.sub, req.body.variantId, req.body.quantity), undefined, 201)),
);

cartRouter.patch(
  '/items/:id',
  validate({ params: idParam, body: updateItemSchema }),
  asyncHandler(async (req, res) => ok(res, await cartService.updateItem(req.user!.sub, req.params.id, req.body.quantity))),
);

cartRouter.delete(
  '/items/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await cartService.removeItem(req.user!.sub, req.params.id))),
);

cartRouter.delete('/', asyncHandler(async (req, res) => ok(res, await cartService.clear(req.user!.sub))));

cartRouter.post(
  '/coupon',
  validate({ body: couponSchema }),
  asyncHandler(async (req, res) => ok(res, await cartService.applyCoupon(req.user!.sub, req.body.code))),
);

cartRouter.delete('/coupon', asyncHandler(async (req, res) => ok(res, await cartService.removeCoupon(req.user!.sub))));
