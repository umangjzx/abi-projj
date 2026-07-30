import { Prisma, type Segment } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/ApiError';
import { round2, toNumber } from '../../lib/money';
import { pageMeta, type PageParams } from '../../lib/http';
import { REVENUE_STATUSES } from '../orders/order.service';

const DAY_MS = 86_400_000;

/**
 * Customer management and RFM-style segmentation.
 *
 * Segments are derived from recency and frequency rather than hand-assigned:
 *   NEW      registered, no completed order yet
 *   ACTIVE   ordered within the last 45 days
 *   LOYAL    5+ orders and active within 60 days
 *   AT_RISK  last order 45-120 days ago
 *   CHURNED  no order in more than 120 days
 */
export const customerService = {
  async list(
    filters: { search?: string; segment?: Segment; sort?: 'recent' | 'spend' | 'orders' | 'name'; active?: boolean },
    page: PageParams,
  ) {
    const where: Prisma.UserWhereInput = {
      role: { name: 'CUSTOMER' },
      ...(filters.segment ? { segment: filters.segment } : {}),
      ...(filters.active !== undefined ? { isActive: filters.active } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { email: { contains: filters.search, mode: 'insensitive' } },
              { phone: { contains: filters.search } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.UserOrderByWithRelationInput =
      filters.sort === 'spend'
        ? { totalSpent: 'desc' }
        : filters.sort === 'orders'
          ? { totalOrders: 'desc' }
          : filters.sort === 'name'
            ? { name: 'asc' }
            : { createdAt: 'desc' };

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy,
        skip: page.skip,
        take: page.take,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatarUrl: true,
          isActive: true,
          emailVerified: true,
          segment: true,
          totalOrders: true,
          totalSpent: true,
          createdAt: true,
          lastLoginAt: true,
          addresses: { where: { isDefault: true }, take: 1, select: { city: true, state: true } },
          _count: { select: { orders: true, reviews: true, wishlist: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      items: rows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        avatarUrl: u.avatarUrl,
        isActive: u.isActive,
        emailVerified: u.emailVerified,
        segment: u.segment,
        totalOrders: u.totalOrders,
        totalSpent: toNumber(u.totalSpent),
        averageOrderValue: u.totalOrders > 0 ? round2(toNumber(u.totalSpent) / u.totalOrders) : 0,
        location: u.addresses[0] ? `${u.addresses[0].city}, ${u.addresses[0].state}` : null,
        joinedAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        counts: u._count,
      })),
      meta: pageMeta(total, page),
    };
  },

  /** Full 360-degree customer view for the admin detail page. */
  async detail(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        isActive: true,
        emailVerified: true,
        segment: true,
        totalOrders: true,
        totalSpent: true,
        createdAt: true,
        lastLoginAt: true,
        role: { select: { name: true } },
        addresses: { orderBy: { isDefault: 'desc' } },
      },
    });

    if (!user || user.role.name !== 'CUSTOMER') throw ApiError.notFound('Customer not found');

    const [orders, byStatus, topProducts, categoryMix, reviews, wishlistCount] = await Promise.all([
      prisma.order.findMany({
        where: { userId },
        orderBy: { placedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          itemCount: true,
          placedAt: true,
          payment: { select: { method: true, status: true } },
        },
      }),
      prisma.order.groupBy({ by: ['status'], where: { userId }, _count: true }),
      prisma.orderItem.groupBy({
        by: ['productId', 'productName'],
        where: { order: { userId, status: { in: REVENUE_STATUSES } } },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
      prisma.$queryRaw<{ name: string; units: bigint; revenue: Prisma.Decimal }[]>`
        SELECT c."name" AS name,
               SUM(oi."quantity")  AS units,
               SUM(oi."lineTotal") AS revenue
        FROM order_items oi
        JOIN orders o     ON o."id" = oi."orderId"
        JOIN products p   ON p."id" = oi."productId"
        JOIN categories c ON c."id" = p."categoryId"
        WHERE o."userId" = ${userId}
          AND o."status" = ANY(${REVENUE_STATUSES}::"OrderStatus"[])
        GROUP BY 1
        ORDER BY revenue DESC
      `,
      prisma.review.findMany({
        where: { userId },
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          comment: true,
          createdAt: true,
          rating: { select: { value: true } },
          product: { select: { name: true, slug: true } },
        },
      }),
      prisma.wishlistItem.count({ where: { userId } }),
    ]);

    const realised = orders.filter((o) => REVENUE_STATUSES.includes(o.status));
    const firstOrder = await prisma.order.findFirst({
      where: { userId, status: { in: REVENUE_STATUSES } },
      orderBy: { placedAt: 'asc' },
      select: { placedAt: true },
    });

    const lastOrderAt = realised[0]?.placedAt ?? null;
    const daysSinceLastOrder = lastOrderAt ? Math.floor((Date.now() - lastOrderAt.getTime()) / DAY_MS) : null;

    return {
      profile: {
        ...user,
        totalSpent: toNumber(user.totalSpent),
        role: user.role.name,
      },
      stats: {
        totalOrders: user.totalOrders,
        totalSpent: toNumber(user.totalSpent),
        averageOrderValue: user.totalOrders > 0 ? round2(toNumber(user.totalSpent) / user.totalOrders) : 0,
        firstOrderAt: firstOrder?.placedAt ?? null,
        lastOrderAt,
        daysSinceLastOrder,
        wishlistItems: wishlistCount,
        reviewsWritten: reviews.length,
        // Average gap between orders -- the reorder cadence.
        orderFrequencyDays:
          firstOrder && user.totalOrders > 1
            ? Math.round((Date.now() - firstOrder.placedAt.getTime()) / DAY_MS / user.totalOrders)
            : null,
      },
      ordersByStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      recentOrders: orders.map((o) => ({ ...o, total: toNumber(o.total) })),
      favouriteProducts: topProducts.map((p) => ({
        productId: p.productId,
        name: p.productName,
        units: p._sum.quantity ?? 0,
        revenue: round2(toNumber(p._sum.lineTotal)),
      })),
      categoryMix: categoryMix.map((c) => ({
        name: c.name,
        units: Number(c.units),
        revenue: round2(toNumber(c.revenue)),
      })),
      reviews: reviews.map((r) => ({
        id: r.id,
        title: r.title,
        comment: r.comment,
        rating: r.rating?.value ?? null,
        product: r.product,
        createdAt: r.createdAt,
      })),
      addresses: user.addresses,
    };
  },

  async setActive(userId: string, isActive: boolean) {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!user) throw ApiError.notFound('Customer not found');
    // Guard rail: the admin UI must not be able to lock out an administrator.
    if (user.role.name === 'ADMIN') throw ApiError.forbidden('Administrator accounts cannot be deactivated here');

    await prisma.user.update({ where: { id: userId }, data: { isActive } });
    // Deactivation must also end any live session.
    if (!isActive) {
      await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return { id: userId, isActive };
  },

  /**
   * Recomputes every customer's segment. Run nightly; also exposed to the admin
   * so segments can be refreshed on demand after a data import.
   */
  async recomputeSegments() {
    const customers = await prisma.user.findMany({
      where: { role: { name: 'CUSTOMER' } },
      select: {
        id: true,
        segment: true,
        createdAt: true,
        orders: {
          where: { status: { in: REVENUE_STATUSES } },
          orderBy: { placedAt: 'desc' },
          select: { placedAt: true },
        },
      },
    });

    const now = Date.now();
    const updates: { id: string; segment: Segment }[] = [];

    for (const customer of customers) {
      const orderCount = customer.orders.length;
      const lastOrder = customer.orders[0]?.placedAt;
      const daysSince = lastOrder ? (now - lastOrder.getTime()) / DAY_MS : null;

      let segment: Segment;
      if (orderCount === 0) segment = 'NEW';
      else if (daysSince === null) segment = 'NEW';
      else if (orderCount >= 5 && daysSince <= 60) segment = 'LOYAL';
      else if (daysSince <= 45) segment = 'ACTIVE';
      else if (daysSince <= 120) segment = 'AT_RISK';
      else segment = 'CHURNED';

      if (segment !== customer.segment) updates.push({ id: customer.id, segment });
    }

    // Sequential rather than a single query because each row gets its own value.
    for (const update of updates) {
      await prisma.user.update({ where: { id: update.id }, data: { segment: update.segment } });
    }

    return { evaluated: customers.length, updated: updates.length };
  },

  /**
   * Recomputes the denormalised totalOrders / totalSpent counters from the
   * order table. A repair task -- normally the order service keeps them fresh.
   */
  async resyncCounters() {
    const grouped = await prisma.order.groupBy({
      by: ['userId'],
      where: { status: { in: REVENUE_STATUSES } },
      _count: true,
      _sum: { total: true },
    });

    const map = new Map(grouped.map((g) => [g.userId, g]));
    const customers = await prisma.user.findMany({ where: { role: { name: 'CUSTOMER' } }, select: { id: true } });

    let updated = 0;
    for (const customer of customers) {
      const stats = map.get(customer.id);
      await prisma.user.update({
        where: { id: customer.id },
        data: {
          totalOrders: stats?._count ?? 0,
          totalSpent: stats?._sum.total ?? new Prisma.Decimal(0),
        },
      });
      updated += 1;
    }

    return { updated };
  },
};
