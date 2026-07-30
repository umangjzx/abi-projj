import { prisma } from '../../lib/prisma';
import { toNumber, round2 } from '../../lib/money';
import { analyticsService } from './analytics.service';
import { inventoryService } from '../inventory/inventory.service';
import { recommendationAnalytics } from '../recommendations/recommendation.analytics';
import type { DateRange } from './range';

/**
 * Composes the admin landing dashboard in a single round trip. Everything runs
 * in parallel so the page paints in roughly the time of its slowest query
 * rather than the sum of all of them.
 */
export const dashboardService = {
  async overview(range: DateRange) {
    const [
      kpis,
      sales,
      orderStatus,
      categoryPerformance,
      products,
      customerGrowth,
      retention,
      topCustomers,
      inventorySummary,
      lowStockAlerts,
      recommendationPerformance,
      recentOrders,
      recentActivity,
      paymentBreakdown,
    ] = await Promise.all([
      analyticsService.kpis(range),
      analyticsService.salesSeries(range),
      analyticsService.orderStatusBreakdown(range),
      analyticsService.categoryPerformance(range),
      analyticsService.productPerformance(range, 6),
      analyticsService.customerGrowth(range),
      analyticsService.retention(),
      analyticsService.topCustomers(range, 5),
      inventoryService.summary(),
      inventoryService.lowStockAlerts(6),
      recommendationAnalytics.performance(range),
      this.recentOrders(6),
      this.recentActivity(8),
      analyticsService.paymentBreakdown(range),
    ]);

    return {
      kpis,
      sales,
      orderStatus,
      categoryPerformance,
      bestSellingProducts: products.bestSelling,
      leastSellingProducts: products.leastSelling,
      customerGrowth,
      retention,
      topCustomers,
      inventory: { summary: inventorySummary, alerts: lowStockAlerts },
      recommendations: {
        totals: recommendationPerformance.totals,
        byStrategy: recommendationPerformance.byStrategy,
        bestStrategy: recommendationPerformance.bestStrategy,
      },
      recentOrders,
      recentActivity,
      paymentBreakdown,
      generatedAt: new Date().toISOString(),
    };
  },

  async recentOrders(limit = 8) {
    const rows = await prisma.order.findMany({
      orderBy: { placedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        itemCount: true,
        placedAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      total: toNumber(o.total),
      itemCount: o.itemCount,
      placedAt: o.placedAt,
      customer: o.user,
    }));
  },

  /** The "Recent activities" feed, sourced from the audit trail. */
  async recentActivity(limit = 10) {
    const rows = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        method: true,
        path: true,
        statusCode: true,
        createdAt: true,
        actorEmail: true,
        user: { select: { name: true, role: { select: { name: true } } } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      method: row.method,
      path: row.path,
      statusCode: row.statusCode,
      at: row.createdAt,
      actor: row.user?.name ?? row.actorEmail ?? 'System',
      actorRole: row.user?.role.name ?? null,
      description: describeActivity(row.action, row.entity),
    }));
  },

  /** Customer-facing dashboard: their stats, orders and personalised picks. */
  async customerOverview(userId: string) {
    const [user, orderAgg, recentOrders, wishlistCount, reviewCount, byStatus] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { name: true, email: true, segment: true, totalOrders: true, totalSpent: true, createdAt: true },
      }),
      prisma.order.aggregate({
        where: { userId, status: { in: ['CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'] } },
        _sum: { total: true, discount: true },
        _avg: { total: true },
        _count: true,
      }),
      prisma.order.findMany({
        where: { userId },
        orderBy: { placedAt: 'desc' },
        take: 5,
        select: { id: true, orderNumber: true, status: true, total: true, itemCount: true, placedAt: true },
      }),
      prisma.wishlistItem.count({ where: { userId } }),
      prisma.review.count({ where: { userId } }),
      prisma.order.groupBy({ by: ['status'], where: { userId }, _count: true }),
    ]);

    const favouriteCategory = await prisma.$queryRaw<{ name: string; units: bigint }[]>`
      SELECT c."name" AS name, SUM(oi."quantity") AS units
      FROM order_items oi
      JOIN orders o    ON o."id" = oi."orderId"
      JOIN products p  ON p."id" = oi."productId"
      JOIN categories c ON c."id" = p."categoryId"
      WHERE o."userId" = ${userId}
      GROUP BY 1
      ORDER BY units DESC
      LIMIT 1
    `;

    return {
      profile: {
        name: user.name,
        email: user.email,
        segment: user.segment,
        memberSince: user.createdAt,
      },
      stats: {
        totalOrders: orderAgg._count,
        totalSpent: toNumber(orderAgg._sum.total),
        totalSaved: toNumber(orderAgg._sum.discount),
        averageOrderValue: round2(toNumber(orderAgg._avg.total)),
        wishlistItems: wishlistCount,
        reviewsWritten: reviewCount,
        favouriteCategory: favouriteCategory[0]?.name ?? null,
      },
      ordersByStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      recentOrders: recentOrders.map((o) => ({ ...o, total: toNumber(o.total) })),
      activeOrders: recentOrders.filter((o) =>
        ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY'].includes(o.status),
      ).length,
    };
  },
};

function describeActivity(action: string, entity: string | null): string {
  const map: Record<string, string> = {
    'auth.register': 'New customer registered',
    'order.place': 'Placed a new order',
    'order.updateStatus': 'Updated an order status',
    'order.cancel': 'Cancelled an order',
    'inventory.adjust': 'Adjusted stock levels',
    'inventory.threshold': 'Changed a low-stock threshold',
  };
  if (map[action]) return map[action];

  const [method] = action.split(' ');
  const verb = { POST: 'Created', PATCH: 'Updated', PUT: 'Updated', DELETE: 'Deleted' }[method];
  return verb && entity ? `${verb} a ${entity.toLowerCase()}` : action;
}
