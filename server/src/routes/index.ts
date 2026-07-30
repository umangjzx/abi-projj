import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { categoryRouter, productRouter } from '../modules/catalog/catalog.routes';
import { cartRouter } from '../modules/cart/cart.routes';
import { couponRouter } from '../modules/coupons/coupon.routes';
import { addressRouter } from '../modules/customers/address.routes';
import { wishlistRouter } from '../modules/customers/wishlist.routes';
import { customerRouter } from '../modules/customers/customer.routes';
import { orderRouter } from '../modules/orders/order.routes';
import { inventoryRouter } from '../modules/inventory/inventory.routes';
import { reviewRouter } from '../modules/reviews/review.routes';
import { recommendationRouter } from '../modules/recommendations/recommendation.routes';
import { analyticsRouter } from '../modules/analytics/analytics.routes';
import { reportRouter } from '../modules/reports/report.routes';
import { offerRouter } from '../modules/offers/offer.routes';
import { notificationRouter } from '../modules/notifications/notification.routes';
import { uploadRouter } from '../modules/uploads/upload.routes';
import { adminRouter } from '../modules/admin/activity.routes';
import { ok } from '../lib/http';

/**
 * API surface. Each module owns its own router and applies its own auth guards,
 * so this file stays a plain mount table.
 */
export const apiRouter = Router();

apiRouter.get('/', (_req, res) =>
  ok(res, {
    service: 'Thuthi Dairy API',
    version: '1.0.0',
    endpoints: {
      auth: '/auth',
      products: '/products',
      categories: '/categories',
      cart: '/cart',
      wishlist: '/wishlist',
      addresses: '/addresses',
      orders: '/orders',
      coupons: '/coupons',
      offers: '/offers',
      reviews: '/reviews',
      recommendations: '/recommendations',
      inventory: '/inventory  (admin)',
      customers: '/customers  (admin)',
      analytics: '/analytics  (admin)',
      reports: '/reports  (admin)',
      notifications: '/notifications',
      uploads: '/uploads  (admin)',
      admin: '/admin  (admin)',
    },
  }),
);

apiRouter.use('/auth', authRouter);
apiRouter.use('/categories', categoryRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/cart', cartRouter);
apiRouter.use('/wishlist', wishlistRouter);
apiRouter.use('/addresses', addressRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/coupons', couponRouter);
apiRouter.use('/offers', offerRouter);
apiRouter.use('/reviews', reviewRouter);
apiRouter.use('/recommendations', recommendationRouter);
apiRouter.use('/notifications', notificationRouter);

// Admin-scoped modules (each router applies requireAdmin internally).
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/customers', customerRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/reports', reportRouter);
apiRouter.use('/uploads', uploadRouter);
apiRouter.use('/admin', adminRouter);
