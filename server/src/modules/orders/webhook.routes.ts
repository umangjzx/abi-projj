import { Router } from 'express';
import { orderService } from './order.service';
import { ApiError } from '../../lib/ApiError';
import { asyncHandler, ok } from '../../lib/http';

/**
 * Razorpay calls this directly (no session, no CORS, no CSRF token) --
 * signature verification in orderService.handleGatewayWebhook is what
 * authenticates the request instead of `requireAuth`.
 */
export const webhookRouter = Router();

webhookRouter.post(
  '/razorpay',
  asyncHandler(async (req, res) => {
    if (!req.rawBody) throw ApiError.badRequest('Missing request body');
    await orderService.handleGatewayWebhook(req.rawBody, req.header('x-razorpay-signature'));
    return ok(res, { received: true });
  }),
);
