import crypto from 'node:crypto';
import { Prisma, type OrderStatus, type PaymentMethod } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/ApiError';
import { buildOrderNumber } from '../../lib/slug';
import { toDecimal, toNumber, formatINR } from '../../lib/money';
import { logger } from '../../lib/logger';
import { sendMail, mailTemplates } from '../../lib/mailer';
import { pageMeta, type PageParams } from '../../lib/http';
import { env } from '../../config/env';
import { razorpay } from '../../lib/razorpay';
import { cartService } from '../cart/cart.service';
import { inventoryService } from '../inventory/inventory.service';
import { recommendationService } from '../recommendations/recommendation.service';

/**
 * Allowed status transitions. Anything not listed is rejected, which stops an
 * admin from, say, moving a delivered order back to pending and corrupting the
 * revenue numbers.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['OUT_FOR_DELIVERY', 'RETURNED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

/** Statuses that count as realised revenue in analytics and reports. */
export const REVENUE_STATUSES: OrderStatus[] = ['CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

const orderInclude = {
  items: true,
  payment: true,
  coupon: { select: { code: true, discountType: true, value: true } },
  statusEvents: { orderBy: { createdAt: 'asc' as const }, include: { actor: { select: { name: true } } } },
  user: { select: { id: true, name: true, email: true, phone: true } },
} as const;

function serializeOrder(order: any) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    subtotal: toNumber(order.subtotal),
    discount: toNumber(order.discount),
    deliveryFee: toNumber(order.deliveryFee),
    tax: toNumber(order.tax),
    total: toNumber(order.total),
    itemCount: order.itemCount,
    shipTo: order.shipTo,
    notes: order.notes,
    placedAt: order.placedAt,
    confirmedAt: order.confirmedAt,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    cancelReason: order.cancelReason,
    coupon: order.coupon ? { code: order.coupon.code, discountType: order.coupon.discountType, value: toNumber(order.coupon.value) } : null,
    customer: order.user ?? null,
    payment: order.payment
      ? {
          id: order.payment.id,
          method: order.payment.method,
          status: order.payment.status,
          amount: toNumber(order.payment.amount),
          transactionRef: order.payment.transactionRef,
          paidAt: order.payment.paidAt,
          // Only surface gateway details while there is still a payment to
          // collect -- the client needs these to open Razorpay Checkout.
          ...(order.payment.status === 'PENDING' && order.payment.method !== 'COD'
            ? {
                razorpayOrderId: (order.payment.gatewayResponse as Record<string, unknown> | null)?.razorpayOrderId as
                  | string
                  | undefined,
                razorpayKeyId: env.razorpayEnabled ? env.RAZORPAY_KEY_ID : undefined,
              }
            : {}),
        }
      : null,
    items: (order.items ?? []).map((item: any) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      variantName: item.variantName,
      sku: item.sku,
      unitPrice: toNumber(item.unitPrice),
      mrp: toNumber(item.mrp),
      quantity: item.quantity,
      lineTotal: toNumber(item.lineTotal),
      imageUrl: item.imageUrl,
    })),
    timeline: (order.statusEvents ?? []).map((e: any) => ({
      status: e.status,
      note: e.note,
      at: e.createdAt,
      by: e.actor?.name ?? 'System',
    })),
  };
}

export interface PlaceOrderInput {
  addressId: string;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export const orderService = {
  /**
   * Checkout. Everything below happens in a single database transaction:
   * validate cart -> freeze the address -> decrement stock -> create the order,
   * items and payment -> redeem the coupon -> clear the cart. If any step
   * fails, nothing is persisted and no stock is lost.
   */
  async place(userId: string, input: PlaceOrderInput) {
    const { cart, serialized } = await cartService.getForCheckout(userId);

    const address = await prisma.address.findUnique({ where: { id: input.addressId } });
    if (!address || address.userId !== userId) throw ApiError.badRequest('Select a valid delivery address');

    const { pricing } = serialized;

    const order = await prisma.$transaction(
      async (tx) => {
        // Per-day sequence for the human-readable order number.
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const todayCount = await tx.order.count({ where: { placedAt: { gte: dayStart } } });
        const orderNumber = buildOrderNumber(new Date(), todayCount + 1);

        const createdOrder = await tx.order.create({
          data: {
            orderNumber,
            userId,
            addressId: address.id,
            couponId: cart.couponId,
            status: 'PENDING',
            subtotal: toDecimal(pricing.subtotal),
            discount: toDecimal(pricing.discount),
            deliveryFee: toDecimal(pricing.deliveryFee),
            tax: toDecimal(pricing.tax),
            total: toDecimal(pricing.total),
            itemCount: pricing.itemCount,
            notes: input.notes ?? null,
            shipTo: {
              label: address.label,
              fullName: address.fullName,
              phone: address.phone,
              line1: address.line1,
              line2: address.line2,
              landmark: address.landmark,
              city: address.city,
              state: address.state,
              pincode: address.pincode,
              country: address.country,
            },
            items: {
              create: serialized.items.map((item) => ({
                productId: item.product.id,
                variantId: item.variant.id,
                productName: item.product.name,
                variantName: item.variant.name,
                sku: item.variant.sku,
                unitPrice: toDecimal(item.variant.price),
                mrp: toDecimal(item.variant.mrp),
                quantity: item.quantity,
                lineTotal: toDecimal(item.lineTotal),
                imageUrl: item.product.image,
              })),
            },
            statusEvents: { create: { status: 'PENDING', note: 'Order placed', actorId: userId } },
            payment: {
              create: {
                method: input.paymentMethod,
                // COD is collected on delivery. Online methods are captured
                // via Razorpay once the customer completes checkout (see the
                // gateway-order call below) and confirmed by verifyPayment /
                // the webhook -- unless Razorpay isn't configured, in which
                // case they're simulated as captured immediately so local
                // dev works without signing up for a gateway.
                status: input.paymentMethod === 'COD' || env.razorpayEnabled ? 'PENDING' : 'PAID',
                amount: toDecimal(pricing.total),
                paidAt: input.paymentMethod === 'COD' || env.razorpayEnabled ? null : new Date(),
                transactionRef:
                  input.paymentMethod === 'COD' || env.razorpayEnabled
                    ? null
                    : `SIM-${orderNumber}-${Date.now().toString(36).toUpperCase()}`,
              },
            },
          },
        });

        // Decrement stock item by item; a conditional update inside
        // applyChange makes overselling impossible under concurrency.
        for (const item of serialized.items) {
          await inventoryService.applyChange(tx, {
            variantId: item.variant.id,
            quantity: -item.quantity,
            type: 'SALE',
            reason: `Order ${orderNumber}`,
            orderId: createdOrder.id,
            actorId: userId,
          });
          await tx.product.update({
            where: { id: item.product.id },
            data: { soldCount: { increment: item.quantity } },
          });
        }

        if (cart.couponId) {
          await tx.coupon.update({ where: { id: cart.couponId }, data: { usedCount: { increment: 1 } } });
          await tx.couponRedemption.create({
            data: { couponId: cart.couponId, userId, orderId: createdOrder.id, discount: toDecimal(pricing.discount) },
          });
        }

        // Refresh the denormalised customer counters used for segmentation.
        await tx.user.update({
          where: { id: userId },
          data: { totalOrders: { increment: 1 }, totalSpent: { increment: toDecimal(pricing.total) } },
        });

        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        await tx.cart.update({ where: { id: cart.id }, data: { couponId: null } });

        return createdOrder;
      },
      { timeout: 20_000 },
    );

    if (input.paymentMethod !== 'COD' && env.razorpayEnabled) {
      await createGatewayOrder(order.id, order.orderNumber, pricing.total);
    }

    // ------------------------------------------------------------ side effects ---
    // Deliberately outside the transaction: none of these should be able to
    // roll back a completed sale.
    const customer = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } });

    void (async () => {
      try {
        await prisma.notification.create({
          data: {
            userId,
            type: 'ORDER_PLACED',
            title: 'Order placed successfully',
            message: `Your order ${order.orderNumber} for ${formatINR(pricing.total)} has been received.`,
            link: `/account/orders/${order.id}`,
          },
        });
        await prisma.notification.create({
          data: {
            audience: 'ADMIN',
            type: 'ORDER_PLACED',
            title: 'New order received',
            message: `${customer.name} placed order ${order.orderNumber} (${formatINR(pricing.total)}).`,
            link: `/admin/orders/${order.id}`,
          },
        });
        await sendMail({
          to: customer.email,
          ...mailTemplates.orderPlaced(customer.name, order.orderNumber, formatINR(pricing.total), pricing.itemCount),
        });
        await inventoryService.checkLowStock(serialized.items.map((i) => i.variant.id));
        // Attribute the purchase to any recommendation the customer saw, and
        // refresh their personalised slots now that intent has changed.
        await recommendationService.trackPurchase(userId, serialized.items.map((i) => i.product.id));
        await recommendationService.invalidateForUser(userId);
      } catch (err) {
        logger.error({ err, orderId: order.id }, 'post-order side effects failed');
      }
    })();

    await recommendationService.updateAffinities(serialized.items.map((i) => i.product.id)).catch((err) =>
      logger.warn({ err }, 'affinity update failed'),
    );

    return this.getById(order.id, userId);
  },

  async getById(orderId: string, requesterId?: string, isAdmin = false) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!order) throw ApiError.notFound('Order not found');
    if (!isAdmin && requesterId && order.userId !== requesterId) throw ApiError.forbidden();
    return serializeOrder(order);
  },

  async getByNumber(orderNumber: string, requesterId?: string, isAdmin = false) {
    const order = await prisma.order.findUnique({ where: { orderNumber }, include: orderInclude });
    if (!order) throw ApiError.notFound('Order not found');
    if (!isAdmin && requesterId && order.userId !== requesterId) throw ApiError.forbidden();
    return serializeOrder(order);
  },

  async listForUser(userId: string, filters: { status?: OrderStatus }, page: PageParams) {
    const where: Prisma.OrderWhereInput = { userId, ...(filters.status ? { status: filters.status } : {}) };

    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { placedAt: 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      prisma.order.count({ where }),
    ]);

    return { items: rows.map(serializeOrder), meta: pageMeta(total, page) };
  },

  async listAll(
    filters: { status?: OrderStatus; search?: string; from?: string; to?: string; userId?: string },
    page: PageParams,
  ) {
    const where: Prisma.OrderWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.from || filters.to
        ? {
            placedAt: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: endOfDay(filters.to) } : {}),
            },
          }
        : {}),
      ...(filters.search
        ? {
            OR: [
              { orderNumber: { contains: filters.search, mode: 'insensitive' } },
              { user: { name: { contains: filters.search, mode: 'insensitive' } } },
              { user: { email: { contains: filters.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total, statusCounts] = await Promise.all([
      prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { placedAt: 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      prisma.order.count({ where }),
      prisma.order.groupBy({ by: ['status'], _count: true }),
    ]);

    return {
      items: rows.map(serializeOrder),
      meta: {
        ...pageMeta(total, page),
        statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
      },
    };
  },

  /**
   * Admin status change. Enforces the transition table, stamps the matching
   * timestamp, restores stock on cancel/return and notifies the customer.
   */
  async updateStatus(orderId: string, status: OrderStatus, actorId: string, note?: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, payment: true } });
    if (!order) throw ApiError.notFound('Order not found');

    if (order.status === status) throw ApiError.badRequest(`Order is already ${status.toLowerCase().replace(/_/g, ' ')}`);

    if (!TRANSITIONS[order.status].includes(status)) {
      throw ApiError.badRequest(
        `Cannot move an order from ${order.status.replace(/_/g, ' ').toLowerCase()} to ${status.replace(/_/g, ' ').toLowerCase()}. ` +
          `Allowed next: ${TRANSITIONS[order.status].join(', ') || 'none (final state)'}.`,
      );
    }

    const restoresStock = status === 'CANCELLED' || status === 'RETURNED';

    await prisma.$transaction(async (tx) => {
      const timestamps: Partial<Record<string, Date>> = {};
      if (status === 'CONFIRMED') timestamps.confirmedAt = new Date();
      if (status === 'SHIPPED') timestamps.shippedAt = new Date();
      if (status === 'DELIVERED') timestamps.deliveredAt = new Date();
      if (status === 'CANCELLED') timestamps.cancelledAt = new Date();

      await tx.order.update({
        where: { id: orderId },
        data: { status, ...timestamps, ...(status === 'CANCELLED' && note ? { cancelReason: note } : {}) },
      });

      await tx.orderStatusEvent.create({ data: { orderId, status, note: note ?? null, actorId } });

      if (restoresStock) {
        for (const item of order.items) {
          await inventoryService.applyChange(tx, {
            variantId: item.variantId,
            quantity: item.quantity,
            type: status === 'RETURNED' ? 'RETURN' : 'ADJUSTMENT',
            reason: `${status === 'RETURNED' ? 'Return' : 'Cancellation'} of order ${order.orderNumber}`,
            orderId,
            actorId,
          });
          await tx.product.update({
            where: { id: item.productId },
            data: { soldCount: { decrement: Math.min(item.quantity, 2_147_483_647) } },
          });
        }

        // Reverse the customer's lifetime counters so segmentation stays honest.
        await tx.user.update({
          where: { id: order.userId },
          data: { totalOrders: { decrement: 1 }, totalSpent: { decrement: order.total } },
        });

        if (order.payment && order.payment.status === 'PAID') {
          await tx.payment.update({
            where: { id: order.payment.id },
            data: { status: 'REFUNDED', refundedAt: new Date() },
          });
        }
      }

      // COD is captured when the parcel is handed over.
      if (status === 'DELIVERED' && order.payment?.method === 'COD' && order.payment.status === 'PENDING') {
        await tx.payment.update({ where: { id: order.payment.id }, data: { status: 'PAID', paidAt: new Date() } });
      }
    });

    void (async () => {
      try {
        const customer = await prisma.user.findUniqueOrThrow({
          where: { id: order.userId },
          select: { name: true, email: true },
        });
        await prisma.notification.create({
          data: {
            userId: order.userId,
            type: 'ORDER_STATUS',
            title: `Order ${order.orderNumber} updated`,
            message: `Your order is now ${status.replace(/_/g, ' ').toLowerCase()}.`,
            link: `/account/orders/${orderId}`,
          },
        });
        await sendMail({ to: customer.email, ...mailTemplates.orderStatus(customer.name, order.orderNumber, status) });
      } catch (err) {
        logger.warn({ err, orderId }, 'order status notification failed');
      }
    })();

    return this.getById(orderId, undefined, true);
  },

  /** Customer-initiated cancellation, only while the order is still packable. */
  async cancelByCustomer(orderId: string, userId: string, reason?: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { userId: true, status: true } });
    if (!order) throw ApiError.notFound('Order not found');
    if (order.userId !== userId) throw ApiError.forbidden();

    if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
      throw ApiError.badRequest(
        'This order has already been packed and can no longer be cancelled online. Please contact support.',
      );
    }

    return this.updateStatus(orderId, 'CANCELLED', userId, reason ?? 'Cancelled by customer');
  },

  /**
   * Confirms an online payment right after the customer completes the
   * Razorpay Checkout popup. This is a convenience path so the browser can
   * move straight to the confirmation page -- `handleGatewayWebhook` below
   * is the source of truth and will independently mark the same payment PAID
   * even if the customer closes the tab before this ever runs.
   */
  async verifyPayment(
    orderId: string,
    userId: string,
    input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  ) {
    if (!env.razorpayEnabled) throw ApiError.badRequest('Online payments are not available right now');

    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!order) throw ApiError.notFound('Order not found');
    if (order.userId !== userId) throw ApiError.forbidden();
    if (!order.payment || order.payment.method === 'COD') throw ApiError.badRequest('This order has no online payment to verify');
    if (order.payment.status === 'PAID') return this.getById(orderId, userId);

    const expected = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
      .digest('hex');
    const valid =
      expected.length === input.razorpaySignature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.razorpaySignature));

    if (!valid) {
      await prisma.payment.update({ where: { id: order.payment.id }, data: { status: 'FAILED' } });
      throw ApiError.badRequest('Payment verification failed');
    }

    await prisma.payment.update({
      where: { id: order.payment.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        transactionRef: input.razorpayPaymentId,
        gatewayResponse: {
          ...(order.payment.gatewayResponse as Record<string, unknown> | null),
          razorpayPaymentId: input.razorpayPaymentId,
          razorpaySignature: input.razorpaySignature,
        },
      },
    });

    return this.getById(orderId, userId);
  },

  /** Re-issues a Razorpay order for a still-unpaid order, e.g. after the customer closed the checkout popup. */
  async retryPayment(orderId: string, userId: string) {
    if (!env.razorpayEnabled) throw ApiError.badRequest('Online payments are not available right now');

    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!order) throw ApiError.notFound('Order not found');
    if (order.userId !== userId) throw ApiError.forbidden();
    if (!order.payment || order.payment.method === 'COD') throw ApiError.badRequest('This order does not need an online payment');
    // FAILED is retryable (a declined card, a bad signature) -- PAID/REFUNDED are not.
    if (!['PENDING', 'FAILED'].includes(order.payment.status)) {
      throw ApiError.badRequest(`Payment is already ${order.payment.status.toLowerCase()}`);
    }

    await prisma.payment.update({ where: { id: order.payment.id }, data: { status: 'PENDING' } });
    await createGatewayOrder(order.id, order.orderNumber, toNumber(order.payment.amount));
    return this.getById(orderId, userId);
  },

  /**
   * Razorpay webhook. This is the authoritative payment source: unlike
   * verifyPayment (which relies on the customer's browser calling back), it
   * fires from Razorpay's servers even if the checkout tab was closed.
   */
  async handleGatewayWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!env.razorpayEnabled || !env.RAZORPAY_WEBHOOK_SECRET) throw ApiError.badRequest('Webhook not configured');
    if (!signature) throw ApiError.badRequest('Missing signature');

    const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
    const valid = expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    if (!valid) throw ApiError.badRequest('Invalid webhook signature');

    const event = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      payload?: { payment?: { entity?: { id: string; order_id: string } } };
    };

    const entity = event.payload?.payment?.entity;
    if (!entity) return; // An event type we don't act on.

    const payment = await prisma.payment.findFirst({
      where: { gatewayResponse: { path: ['razorpayOrderId'], equals: entity.order_id } },
    });
    if (!payment) {
      logger.warn({ razorpayOrderId: entity.order_id }, 'Razorpay webhook for an unknown order');
      return;
    }

    if (event.event === 'payment.captured' && payment.status !== 'PAID') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          transactionRef: entity.id,
          gatewayResponse: { ...(payment.gatewayResponse as Record<string, unknown> | null), razorpayPaymentId: entity.id },
        },
      });
    } else if (event.event === 'payment.failed' && payment.status === 'PENDING') {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    }
  },

  /** Public-facing tracking summary for the order tracking page. */
  async track(orderNumber: string, requesterId?: string, isAdmin = false) {
    const order = await this.getByNumber(orderNumber, requesterId, isAdmin);

    const stages: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    const reached = new Set(order.timeline.map((t: { status: string }) => t.status));
    const terminal = order.status === 'CANCELLED' || order.status === 'RETURNED';

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      isTerminal: terminal,
      placedAt: order.placedAt,
      estimatedDelivery: order.deliveredAt ?? estimateDelivery(order.placedAt),
      stages: terminal
        ? []
        : stages.map((stage, index) => ({
            status: stage,
            label: STAGE_LABELS[stage],
            complete: reached.has(stage),
            current: order.status === stage,
            at: order.timeline.find((t: { status: string }) => t.status === stage)?.at ?? null,
            index,
          })),
      timeline: order.timeline,
      items: order.items,
      shipTo: order.shipTo,
      total: order.total,
    };
  },

  async stats(userId: string) {
    const [agg, byStatus, lastOrder] = await Promise.all([
      prisma.order.aggregate({
        where: { userId, status: { in: REVENUE_STATUSES } },
        _sum: { total: true },
        _count: true,
        _avg: { total: true },
      }),
      prisma.order.groupBy({ by: ['status'], where: { userId }, _count: true }),
      prisma.order.findFirst({ where: { userId }, orderBy: { placedAt: 'desc' }, select: { placedAt: true } }),
    ]);

    return {
      totalOrders: agg._count,
      totalSpent: toNumber(agg._sum.total),
      averageOrderValue: toNumber(agg._avg.total),
      lastOrderAt: lastOrder?.placedAt ?? null,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    };
  },
};

const STAGE_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Order placed',
  CONFIRMED: 'Confirmed',
  PACKED: 'Packed',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

/**
 * Creates the Razorpay order for a freshly-placed (or retried) order and
 * stashes its id on the Payment row so the client can open Checkout.
 * Deliberately called outside any DB transaction -- it's a network call to a
 * third party, and a slow or failed gateway request must not roll back stock
 * decrements or hold a transaction's lock/timeout budget.
 */
async function createGatewayOrder(orderId: string, orderNumber: string, total: number): Promise<void> {
  try {
    const gatewayOrder = await razorpay().orders.create({
      amount: Math.round(total * 100), // Razorpay wants the amount in paise.
      currency: 'INR',
      receipt: orderNumber,
    });
    await prisma.payment.update({
      where: { orderId },
      data: { gatewayResponse: { razorpayOrderId: gatewayOrder.id } },
    });
  } catch (err) {
    logger.error({ err, orderId }, 'failed to create Razorpay order');
    // Payment stays PENDING with no razorpayOrderId; the client shows no
    // gateway popup, and the order detail page's "Complete payment" button
    // (retryPayment) lets the customer try again.
  }
}

/** Dairy is next-day delivery; two days if ordered after the 6pm cut-off. */
function estimateDelivery(placedAt: Date | string): Date {
  const date = new Date(placedAt);
  const days = date.getHours() >= 18 ? 2 : 1;
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return date;
}

export function endOfDay(value: string): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}
