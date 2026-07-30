import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { pctChange, round2, toNumber } from '../../lib/money';
import { REVENUE_STATUSES } from '../orders/order.service';
import { fillSeries, granularityFor, toISODate, type DateRange } from './range';

/**
 * Market analysis engine. Every figure the admin dashboard shows is produced
 * here.
 *
 * Two implementation notes:
 *   * Time series use raw `date_trunc` SQL because Prisma's groupBy cannot
 *     bucket by day/week/month. They are parameterised (`${}` in a Prisma
 *     tagged template is a bind parameter, not string interpolation), so they
 *     are not an injection surface.
 *   * "Revenue" always means orders in REVENUE_STATUSES -- cancelled and
 *     returned orders are excluded so the dashboard never overstates income.
 */

const REVENUE_FILTER = { status: { in: REVENUE_STATUSES } } as const;

export const analyticsService = {
  // ------------------------------------------------------------------- KPIs ---

  async kpis(range: DateRange) {
    const [current, previous, customers, prevCustomers, pending, completed, lifetime] = await Promise.all([
      prisma.order.aggregate({
        where: { ...REVENUE_FILTER, placedAt: { gte: range.from, lte: range.to } },
        _sum: { total: true, discount: true },
        _count: true,
        _avg: { total: true },
      }),
      prisma.order.aggregate({
        where: { ...REVENUE_FILTER, placedAt: { gte: range.previousFrom, lte: range.previousTo } },
        _sum: { total: true },
        _count: true,
        _avg: { total: true },
      }),
      prisma.user.count({ where: { role: { name: 'CUSTOMER' }, createdAt: { gte: range.from, lte: range.to } } }),
      prisma.user.count({
        where: { role: { name: 'CUSTOMER' }, createdAt: { gte: range.previousFrom, lte: range.previousTo } },
      }),
      prisma.order.count({ where: { status: { in: ['PENDING', 'CONFIRMED', 'PACKED'] } } }),
      prisma.order.count({ where: { status: 'DELIVERED' } }),
      Promise.all([
        prisma.user.count({ where: { role: { name: 'CUSTOMER' } } }),
        prisma.product.count({ where: { isActive: true } }),
        prisma.order.count(),
        prisma.order.aggregate({ where: REVENUE_FILTER, _sum: { total: true } }),
      ]),
    ]);

    const [totalCustomers, totalProducts, totalOrders, allTimeRevenue] = lifetime;

    const revenue = toNumber(current._sum.total);
    const prevRevenue = toNumber(previous._sum.total);
    const units = await prisma.orderItem.aggregate({
      where: { order: { ...REVENUE_FILTER, placedAt: { gte: range.from, lte: range.to } } },
      _sum: { quantity: true },
    });

    return {
      revenue: { value: revenue, previous: prevRevenue, change: pctChange(revenue, prevRevenue) },
      orders: { value: current._count, previous: previous._count, change: pctChange(current._count, previous._count) },
      averageOrderValue: {
        value: round2(toNumber(current._avg.total)),
        previous: round2(toNumber(previous._avg.total)),
        change: pctChange(toNumber(current._avg.total), toNumber(previous._avg.total)),
      },
      newCustomers: { value: customers, previous: prevCustomers, change: pctChange(customers, prevCustomers) },
      unitsSold: { value: units._sum.quantity ?? 0, previous: 0, change: 0 },
      discountGiven: { value: toNumber(current._sum.discount), previous: 0, change: 0 },
      pendingOrders: pending,
      completedOrders: completed,
      totals: {
        customers: totalCustomers,
        products: totalProducts,
        orders: totalOrders,
        revenue: toNumber(allTimeRevenue._sum.total),
      },
    };
  },

  // ---------------------------------------------------------- sales over time ---

  /** Revenue / order / unit series, bucketed to suit the range length. */
  async salesSeries(range: DateRange) {
    const granularity = granularityFor(range.days);

    const rows = await prisma.$queryRaw<{ bucket: Date; revenue: Prisma.Decimal; orders: bigint; units: bigint }[]>`
      SELECT
        date_trunc(${granularity}, o."placedAt") AS bucket,
        COALESCE(SUM(o."total"), 0)             AS revenue,
        COUNT(DISTINCT o."id")                  AS orders,
        COALESCE(SUM(oi."quantity"), 0)         AS units
      FROM orders o
      LEFT JOIN order_items oi ON oi."orderId" = o."id"
      WHERE o."placedAt" BETWEEN ${range.from} AND ${range.to}
        AND o."status" = ANY(${REVENUE_STATUSES}::"OrderStatus"[])
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const mapped = rows.map((r) => ({
      date: toISODate(new Date(r.bucket)),
      revenue: round2(toNumber(r.revenue)),
      orders: Number(r.orders),
      units: Number(r.units),
    }));

    return {
      granularity,
      series: fillSeries(mapped, range.from, range.to, granularity, { revenue: 0, orders: 0, units: 0 }),
    };
  },

  /** Month-by-month revenue for the last N months -- the seasonality view. */
  async monthlySales(months = 12) {
    const from = new Date();
    from.setMonth(from.getMonth() - (months - 1));
    from.setDate(1);
    from.setHours(0, 0, 0, 0);

    const rows = await prisma.$queryRaw<{ bucket: Date; revenue: Prisma.Decimal; orders: bigint }[]>`
      SELECT date_trunc('month', "placedAt") AS bucket,
             COALESCE(SUM("total"), 0)       AS revenue,
             COUNT(*)                        AS orders
      FROM orders
      WHERE "placedAt" >= ${from}
        AND "status" = ANY(${REVENUE_STATUSES}::"OrderStatus"[])
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return rows.map((r) => {
      const date = new Date(r.bucket);
      return {
        date: toISODate(date),
        month: date.toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
        revenue: round2(toNumber(r.revenue)),
        orders: Number(r.orders),
      };
    });
  },

  /**
   * Seasonal index by calendar month across all history: 100 = average month.
   * Tells the business which months genuinely over- or under-perform.
   */
  async seasonalTrends() {
    const rows = await prisma.$queryRaw<{ month: number; revenue: Prisma.Decimal; orders: bigint }[]>`
      SELECT EXTRACT(MONTH FROM "placedAt")::int AS month,
             COALESCE(SUM("total"), 0)           AS revenue,
             COUNT(*)                            AS orders
      FROM orders
      WHERE "status" = ANY(${REVENUE_STATUSES}::"OrderStatus"[])
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const revenues = rows.map((r) => toNumber(r.revenue));
    const average = revenues.length ? revenues.reduce((a, b) => a + b, 0) / revenues.length : 0;

    return names.map((name, index) => {
      const row = rows.find((r) => r.month === index + 1);
      const revenue = row ? toNumber(row.revenue) : 0;
      return {
        month: name,
        monthNumber: index + 1,
        revenue: round2(revenue),
        orders: row ? Number(row.orders) : 0,
        seasonalIndex: average > 0 ? round2((revenue / average) * 100) : 0,
      };
    });
  },

  /**
   * Order density by weekday x hour -- the heat map that tells operations when
   * to staff the packing line.
   */
  async orderHeatmap(range: DateRange) {
    const rows = await prisma.$queryRaw<{ dow: number; hour: number; orders: bigint; revenue: Prisma.Decimal }[]>`
      SELECT EXTRACT(DOW  FROM "placedAt")::int AS dow,
             EXTRACT(HOUR FROM "placedAt")::int AS hour,
             COUNT(*)                           AS orders,
             COALESCE(SUM("total"), 0)          AS revenue
      FROM orders
      WHERE "placedAt" BETWEEN ${range.from} AND ${range.to}
        AND "status" = ANY(${REVENUE_STATUSES}::"OrderStatus"[])
      GROUP BY 1, 2
    `;

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const lookup = new Map(rows.map((r) => [`${r.dow}-${r.hour}`, r]));
    const cells: { day: string; dayIndex: number; hour: number; orders: number; revenue: number }[] = [];

    for (let dow = 0; dow < 7; dow++) {
      for (let hour = 0; hour < 24; hour++) {
        const row = lookup.get(`${dow}-${hour}`);
        cells.push({
          day: days[dow],
          dayIndex: dow,
          hour,
          orders: row ? Number(row.orders) : 0,
          revenue: row ? round2(toNumber(row.revenue)) : 0,
        });
      }
    }

    return { cells, maxOrders: Math.max(1, ...cells.map((c) => c.orders)) };
  },

  // ------------------------------------------------------------------ products ---

  async productPerformance(range: DateRange, limit = 10) {
    const grouped = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: { ...REVENUE_FILTER, placedAt: { gte: range.from, lte: range.to } } },
      _sum: { quantity: true, lineTotal: true },
      _count: true,
    });

    const products = await prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        soldCount: true,
        avgRating: true,
        viewCount: true,
        category: { select: { id: true, name: true } },
        images: { where: { isPrimary: true }, take: 1, select: { url: true } },
        variants: { where: { isActive: true }, select: { inventory: { select: { stock: true } } } },
      },
    });

    const salesMap = new Map(grouped.map((g) => [g.productId, g]));

    const rows = products.map((p) => {
      const sales = salesMap.get(p.id);
      const unitsSold = sales?._sum.quantity ?? 0;
      const revenue = round2(toNumber(sales?._sum.lineTotal));
      const stock = p.variants.reduce((sum, v) => sum + (v.inventory?.stock ?? 0), 0);

      return {
        productId: p.id,
        name: p.name,
        slug: p.slug,
        image: p.images[0]?.url ?? null,
        category: p.category,
        unitsSold,
        revenue,
        orderCount: sales?._count ?? 0,
        stock,
        avgRating: round2(p.avgRating),
        views: p.viewCount,
        // Views that turned into a sale -- the demand-quality signal.
        conversionRate: p.viewCount > 0 ? round2((unitsSold / p.viewCount) * 100) : 0,
      };
    });

    const withSales = rows.filter((r) => r.unitsSold > 0).sort((a, b) => b.revenue - a.revenue);

    return {
      bestSelling: withSales.slice(0, limit),
      // Products that exist and are in stock but are not moving -- the
      // actionable "least selling" list, not just a reverse sort.
      leastSelling: rows
        .filter((r) => r.stock > 0)
        .sort((a, b) => a.unitsSold - b.unitsSold || b.stock - a.stock)
        .slice(0, limit),
      noSales: rows.filter((r) => r.unitsSold === 0).length,
      totalProductsSold: withSales.length,
    };
  },

  /** Demand ranking with a simple velocity figure (units per day). */
  async productDemand(range: DateRange, limit = 15) {
    const grouped = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: { ...REVENUE_FILTER, placedAt: { gte: range.from, lte: range.to } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });

    if (!grouped.length) return [];

    const products = await prisma.product.findMany({
      where: { id: { in: grouped.map((g) => g.productId) } },
      select: {
        id: true,
        name: true,
        category: { select: { name: true } },
        variants: { where: { isActive: true }, select: { inventory: { select: { stock: true } } } },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return grouped.map((g) => {
      const product = byId.get(g.productId);
      const units = g._sum.quantity ?? 0;
      const velocity = round2(units / range.days);
      const stock = product?.variants.reduce((sum, v) => sum + (v.inventory?.stock ?? 0), 0) ?? 0;

      return {
        productId: g.productId,
        name: product?.name ?? 'Unknown',
        category: product?.category.name ?? '-',
        unitsSold: units,
        dailyVelocity: velocity,
        stock,
        // How long current stock lasts at the observed rate.
        daysOfCover: velocity > 0 ? Math.round(stock / velocity) : null,
        needsRestock: velocity > 0 && stock / velocity < 7,
      };
    });
  },

  async categoryPerformance(range: DateRange) {
    const rows = await prisma.$queryRaw<
      { categoryId: string; name: string; revenue: Prisma.Decimal; units: bigint; orders: bigint }[]
    >`
      SELECT c."id"                        AS "categoryId",
             c."name"                      AS name,
             COALESCE(SUM(oi."lineTotal"), 0) AS revenue,
             COALESCE(SUM(oi."quantity"), 0)  AS units,
             COUNT(DISTINCT o."id")           AS orders
      FROM categories c
      LEFT JOIN products p     ON p."categoryId" = c."id"
      LEFT JOIN order_items oi ON oi."productId" = p."id"
      LEFT JOIN orders o       ON o."id" = oi."orderId"
                              AND o."placedAt" BETWEEN ${range.from} AND ${range.to}
                              AND o."status" = ANY(${REVENUE_STATUSES}::"OrderStatus"[])
      GROUP BY c."id", c."name"
      ORDER BY revenue DESC
    `;

    const total = rows.reduce((sum, r) => sum + toNumber(r.revenue), 0);

    return rows.map((r) => ({
      categoryId: r.categoryId,
      name: r.name,
      revenue: round2(toNumber(r.revenue)),
      units: Number(r.units),
      orders: Number(r.orders),
      share: total > 0 ? round2((toNumber(r.revenue) / total) * 100) : 0,
    }));
  },

  // ----------------------------------------------------------------- customers ---

  /** New sign-ups per bucket plus a running cumulative total. */
  async customerGrowth(range: DateRange) {
    const granularity = granularityFor(range.days);

    const [rows, priorTotal] = await Promise.all([
      prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
        SELECT date_trunc(${granularity}, u."createdAt") AS bucket, COUNT(*) AS count
        FROM users u
        JOIN roles r ON r."id" = u."roleId"
        WHERE r."name" = 'CUSTOMER' AND u."createdAt" BETWEEN ${range.from} AND ${range.to}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.user.count({ where: { role: { name: 'CUSTOMER' }, createdAt: { lt: range.from } } }),
    ]);

    const mapped = rows.map((r) => ({ date: toISODate(new Date(r.bucket)), newCustomers: Number(r.count) }));
    const filled = fillSeries(mapped, range.from, range.to, granularity, { newCustomers: 0 });

    let cumulative = priorTotal;
    return filled.map((row) => {
      cumulative += row.newCustomers;
      return { ...row, totalCustomers: cumulative };
    });
  },

  /**
   * Retention snapshot: how many customers ordered more than once, and how much
   * more the repeat cohort is worth.
   */
  async retention() {
    const [totals, repeatRows] = await Promise.all([
      prisma.user.count({ where: { role: { name: 'CUSTOMER' } } }),
      prisma.order.groupBy({ by: ['userId'], where: REVENUE_FILTER, _count: true, _sum: { total: true } }),
    ]);

    const buyers = repeatRows.length;
    const repeat = repeatRows.filter((r) => r._count > 1);
    const oneTime = buyers - repeat.length;

    const repeatRevenue = repeat.reduce((sum, r) => sum + toNumber(r._sum.total), 0);
    const totalRevenue = repeatRows.reduce((sum, r) => sum + toNumber(r._sum.total), 0);

    return {
      totalCustomers: totals,
      customersWhoOrdered: buyers,
      repeatCustomers: repeat.length,
      oneTimeCustomers: oneTime,
      neverOrdered: totals - buyers,
      repeatRate: buyers > 0 ? round2((repeat.length / buyers) * 100) : 0,
      repeatRevenueShare: totalRevenue > 0 ? round2((repeatRevenue / totalRevenue) * 100) : 0,
      averageOrdersPerCustomer: buyers > 0 ? round2(repeatRows.reduce((s, r) => s + r._count, 0) / buyers) : 0,
      lifetimeValue: buyers > 0 ? round2(totalRevenue / buyers) : 0,
    };
  },

  async topCustomers(range: DateRange, limit = 10) {
    const grouped = await prisma.order.groupBy({
      by: ['userId'],
      where: { ...REVENUE_FILTER, placedAt: { gte: range.from, lte: range.to } },
      _sum: { total: true },
      _count: true,
      orderBy: { _sum: { total: 'desc' } },
      take: limit,
    });

    if (!grouped.length) return [];

    const users = await prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.userId) } },
      select: { id: true, name: true, email: true, phone: true, segment: true, createdAt: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return grouped.map((g, index) => {
      const user = byId.get(g.userId);
      return {
        rank: index + 1,
        userId: g.userId,
        name: user?.name ?? 'Unknown',
        email: user?.email ?? '-',
        phone: user?.phone ?? null,
        segment: user?.segment ?? 'NEW',
        joinedAt: user?.createdAt ?? null,
        orders: g._count,
        spent: round2(toNumber(g._sum.total)),
        averageOrderValue: g._count > 0 ? round2(toNumber(g._sum.total) / g._count) : 0,
      };
    });
  },

  /** Revenue by delivery city, read out of the frozen `shipTo` snapshot. */
  async customerLocations(range: DateRange, limit = 12) {
    const rows = await prisma.$queryRaw<{ city: string; state: string; orders: bigint; revenue: Prisma.Decimal }[]>`
      SELECT COALESCE("shipTo"->>'city',  'Unknown') AS city,
             COALESCE("shipTo"->>'state', 'Unknown') AS state,
             COUNT(*)                                AS orders,
             COALESCE(SUM("total"), 0)               AS revenue
      FROM orders
      WHERE "placedAt" BETWEEN ${range.from} AND ${range.to}
        AND "status" = ANY(${REVENUE_STATUSES}::"OrderStatus"[])
      GROUP BY 1, 2
      ORDER BY revenue DESC
      LIMIT ${limit}
    `;

    const total = rows.reduce((sum, r) => sum + toNumber(r.revenue), 0);

    return rows.map((r) => ({
      city: r.city,
      state: r.state,
      orders: Number(r.orders),
      revenue: round2(toNumber(r.revenue)),
      share: total > 0 ? round2((toNumber(r.revenue) / total) * 100) : 0,
    }));
  },

  async customerSegments() {
    const rows = await prisma.user.groupBy({
      by: ['segment'],
      where: { role: { name: 'CUSTOMER' } },
      _count: true,
      _sum: { totalSpent: true },
    });

    const order = ['NEW', 'ACTIVE', 'LOYAL', 'AT_RISK', 'CHURNED'];
    return order.map((segment) => {
      const row = rows.find((r) => r.segment === segment);
      return {
        segment,
        customers: row?._count ?? 0,
        revenue: round2(toNumber(row?._sum.totalSpent)),
      };
    });
  },

  // ------------------------------------------------------------------- orders ---

  async orderStatusBreakdown(range: DateRange) {
    const rows = await prisma.order.groupBy({
      by: ['status'],
      where: { placedAt: { gte: range.from, lte: range.to } },
      _count: true,
      _sum: { total: true },
    });

    const total = rows.reduce((sum, r) => sum + r._count, 0);

    return rows
      .map((r) => ({
        status: r.status,
        label: r.status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()),
        count: r._count,
        value: round2(toNumber(r._sum.total)),
        share: total > 0 ? round2((r._count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  },

  async paymentBreakdown(range: DateRange) {
    const rows = await prisma.payment.groupBy({
      by: ['method', 'status'],
      where: { order: { placedAt: { gte: range.from, lte: range.to } } },
      _count: true,
      _sum: { amount: true },
    });

    const byMethod = new Map<string, { method: string; count: number; amount: number; paid: number }>();
    for (const row of rows) {
      const entry = byMethod.get(row.method) ?? { method: row.method, count: 0, amount: 0, paid: 0 };
      entry.count += row._count;
      entry.amount += toNumber(row._sum.amount);
      if (row.status === 'PAID') entry.paid += toNumber(row._sum.amount);
      byMethod.set(row.method, entry);
    }

    return [...byMethod.values()]
      .map((v) => ({ ...v, amount: round2(v.amount), paid: round2(v.paid) }))
      .sort((a, b) => b.amount - a.amount);
  },

  // ----------------------------------------------------------------- forecast ---

  /**
   * Sales forecast. Ordinary least-squares trend line over daily revenue,
   * multiplied by a day-of-week seasonality index derived from the same window.
   *
   * This is intentionally a transparent statistical model rather than a black
   * box: R-squared is returned alongside the numbers so the admin can see how
   * much to trust it, and the confidence band widens with the residual spread.
   */
  async forecast(daysAhead = 14, lookbackDays = 90) {
    const from = new Date(Date.now() - lookbackDays * 86_400_000);

    const rows = await prisma.$queryRaw<{ bucket: Date; revenue: Prisma.Decimal }[]>`
      SELECT date_trunc('day', "placedAt") AS bucket, COALESCE(SUM("total"), 0) AS revenue
      FROM orders
      WHERE "placedAt" >= ${from}
        AND "status" = ANY(${REVENUE_STATUSES}::"OrderStatus"[])
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const history = rows.map((r) => ({ date: new Date(r.bucket), revenue: toNumber(r.revenue) }));

    if (history.length < 7) {
      return {
        sufficientData: false,
        message: 'At least 7 days of sales history are needed to produce a forecast.',
        history: history.map((h) => ({ date: toISODate(h.date), revenue: round2(h.revenue) })),
        forecast: [],
        model: null,
      };
    }

    // --- least squares fit: revenue = intercept + slope * dayIndex ---
    const n = history.length;
    const xs = history.map((_, i) => i);
    const ys = history.map((h) => h.revenue);
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;

    const covariance = xs.reduce((sum, x, i) => sum + (x - meanX) * (ys[i] - meanY), 0);
    const varianceX = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0) || 1;
    const slope = covariance / varianceX;
    const intercept = meanY - slope * meanX;

    const predict = (x: number) => intercept + slope * x;

    // --- goodness of fit ---
    const ssTotal = ys.reduce((sum, y) => sum + (y - meanY) ** 2, 0);
    const ssResidual = ys.reduce((sum, y, i) => sum + (y - predict(i)) ** 2, 0);
    const rSquared = ssTotal > 0 ? Math.max(0, 1 - ssResidual / ssTotal) : 0;
    const stdError = Math.sqrt(ssResidual / Math.max(1, n - 2));

    // --- day-of-week seasonality ---
    const dowTotals = new Array(7).fill(0);
    const dowCounts = new Array(7).fill(0);
    history.forEach((h) => {
      dowTotals[h.date.getDay()] += h.revenue;
      dowCounts[h.date.getDay()] += 1;
    });
    const dowIndex = dowTotals.map((total, i) => {
      if (!dowCounts[i] || meanY === 0) return 1;
      return total / dowCounts[i] / meanY;
    });

    const lastDate = history[history.length - 1].date;
    const forecast: { date: string; predicted: number; lower: number; upper: number; dayOfWeek: string }[] = [];

    for (let i = 1; i <= daysAhead; i++) {
      const date = new Date(lastDate);
      date.setDate(date.getDate() + i);

      const trend = predict(n - 1 + i);
      const seasonal = dowIndex[date.getDay()] || 1;
      const predicted = Math.max(0, trend * seasonal);
      // ~95% band, widening with the forecast horizon.
      const margin = 1.96 * stdError * Math.sqrt(1 + i / n);

      forecast.push({
        date: toISODate(date),
        predicted: round2(predicted),
        lower: round2(Math.max(0, predicted - margin)),
        upper: round2(predicted + margin),
        dayOfWeek: date.toLocaleDateString('en-IN', { weekday: 'short' }),
      });
    }

    const projectedTotal = forecast.reduce((sum, f) => sum + f.predicted, 0);
    const recentTotal = ys.slice(-daysAhead).reduce((a, b) => a + b, 0);

    return {
      sufficientData: true,
      history: history.map((h) => ({ date: toISODate(h.date), revenue: round2(h.revenue) })),
      forecast,
      model: {
        method: 'Least-squares linear trend with day-of-week seasonality',
        slopePerDay: round2(slope),
        rSquared: round2(rSquared),
        confidence: rSquared > 0.6 ? 'high' : rSquared > 0.3 ? 'moderate' : 'low',
        observations: n,
      },
      summary: {
        projectedRevenue: round2(projectedTotal),
        comparablePastRevenue: round2(recentTotal),
        expectedChange: pctChange(projectedTotal, recentTotal),
        projectedDailyAverage: round2(projectedTotal / daysAhead),
        trend: slope > 0 ? 'growing' : slope < 0 ? 'declining' : 'flat',
      },
    };
  },

  // ------------------------------------------------- daily snapshot roll-ups ---

  /**
   * Writes one day's metrics into `analytics_snapshots`. Idempotent, so the
   * nightly job can safely re-run and a backfill can replay history.
   */
  async writeDailySnapshot(day: Date) {
    const from = new Date(day);
    from.setHours(0, 0, 0, 0);
    const to = new Date(day);
    to.setHours(23, 59, 59, 999);

    const [orders, units, newCustomers, cancelled, returningRows] = await Promise.all([
      prisma.order.aggregate({
        where: { ...REVENUE_FILTER, placedAt: { gte: from, lte: to } },
        _sum: { total: true },
        _count: true,
        _avg: { total: true },
      }),
      prisma.orderItem.aggregate({
        where: { order: { ...REVENUE_FILTER, placedAt: { gte: from, lte: to } } },
        _sum: { quantity: true },
      }),
      prisma.user.count({ where: { role: { name: 'CUSTOMER' }, createdAt: { gte: from, lte: to } } }),
      prisma.order.count({ where: { status: { in: ['CANCELLED', 'RETURNED'] }, placedAt: { gte: from, lte: to } } }),
      prisma.order.groupBy({
        by: ['userId'],
        where: { ...REVENUE_FILTER, placedAt: { gte: from, lte: to } },
        _count: true,
      }),
    ]);

    // A "returning" buyer today is one with prior orders before this day.
    const returningCount = returningRows.length
      ? await prisma.order.groupBy({
          by: ['userId'],
          where: { ...REVENUE_FILTER, userId: { in: returningRows.map((r) => r.userId) }, placedAt: { lt: from } },
          _count: true,
        })
      : [];

    const metrics: [string, number][] = [
      ['REVENUE', toNumber(orders._sum.total)],
      ['ORDERS', orders._count],
      ['UNITS_SOLD', units._sum.quantity ?? 0],
      ['NEW_CUSTOMERS', newCustomers],
      ['RETURNING_CUSTOMERS', returningCount.length],
      ['AVERAGE_ORDER_VALUE', round2(toNumber(orders._avg.total))],
      ['CANCELLED_ORDERS', cancelled],
    ];

    const dateOnly = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));

    // '' is the "whole business, no break-down" dimension -- see the schema
    // comment on AnalyticsSnapshot.dimension for why it is not null.
    for (const [metric, value] of metrics) {
      await prisma.analyticsSnapshot.upsert({
        where: { date_metric_dimension: { date: dateOnly, metric: metric as never, dimension: '' } },
        create: { date: dateOnly, metric: metric as never, dimension: '', value: new Prisma.Decimal(value) },
        update: { value: new Prisma.Decimal(value) },
      });
    }

    return { date: toISODate(from), metrics: Object.fromEntries(metrics) };
  },

  async snapshots(range: DateRange, metric?: string) {
    const rows = await prisma.analyticsSnapshot.findMany({
      where: {
        date: { gte: range.from, lte: range.to },
        ...(metric ? { metric: metric as never } : {}),
      },
      orderBy: { date: 'asc' },
    });

    return rows.map((r) => ({
      date: toISODate(r.date),
      metric: r.metric,
      dimension: r.dimension || null,
      value: toNumber(r.value),
    }));
  },
};
