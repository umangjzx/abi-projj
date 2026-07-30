import { prisma } from '../../lib/prisma';
import { round2, toNumber } from '../../lib/money';
import { REVENUE_STATUSES } from '../orders/order.service';
import { analyticsService } from '../analytics/analytics.service';
import { recommendationAnalytics } from '../recommendations/recommendation.analytics';
import type { DateRange } from '../analytics/range';
import { toISODate } from '../analytics/range';

export type ReportType = 'sales' | 'customers' | 'products' | 'inventory' | 'revenue' | 'recommendations';

export interface ReportColumn {
  key: string;
  label: string;
  /** Drives number formatting and column alignment in Excel/PDF. */
  type?: 'text' | 'number' | 'currency' | 'percent' | 'date';
  width?: number;
}

export interface ReportPayload {
  type: ReportType;
  title: string;
  subtitle: string;
  generatedAt: Date;
  range: { from: Date; to: Date };
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  /** Headline figures printed above the table. */
  summary: { label: string; value: string }[];
}

/**
 * Builds a report as a neutral, tabular payload. The three exporters (CSV,
 * Excel, PDF) all consume this same structure, so a new report only has to be
 * defined once here to be available in every format.
 */
export const reportService = {
  async build(type: ReportType, range: DateRange): Promise<ReportPayload> {
    switch (type) {
      case 'sales':
        return this.salesReport(range);
      case 'customers':
        return this.customerReport(range);
      case 'products':
        return this.productReport(range);
      case 'inventory':
        return this.inventoryReport(range);
      case 'revenue':
        return this.revenueReport(range);
      case 'recommendations':
        return this.recommendationReport(range);
    }
  },

  async salesReport(range: DateRange): Promise<ReportPayload> {
    const orders = await prisma.order.findMany({
      where: { placedAt: { gte: range.from, lte: range.to } },
      orderBy: { placedAt: 'desc' },
      include: {
        user: { select: { name: true, email: true } },
        payment: { select: { method: true, status: true } },
        coupon: { select: { code: true } },
        _count: { select: { items: true } },
      },
    });

    const realised = orders.filter((o) => REVENUE_STATUSES.includes(o.status));
    const revenue = realised.reduce((sum, o) => sum + toNumber(o.total), 0);

    return {
      type: 'sales',
      title: 'Sales Report',
      subtitle: `${orders.length} order(s) placed between ${fmt(range.from)} and ${fmt(range.to)}`,
      generatedAt: new Date(),
      range,
      summary: [
        { label: 'Total orders', value: String(orders.length) },
        { label: 'Realised orders', value: String(realised.length) },
        { label: 'Gross revenue', value: inr(revenue) },
        { label: 'Average order value', value: inr(realised.length ? revenue / realised.length : 0) },
        { label: 'Discounts given', value: inr(orders.reduce((s, o) => s + toNumber(o.discount), 0)) },
        { label: 'Cancelled / returned', value: String(orders.length - realised.length) },
      ],
      columns: [
        { key: 'orderNumber', label: 'Order #', width: 20 },
        { key: 'placedAt', label: 'Date', type: 'date', width: 14 },
        { key: 'customer', label: 'Customer', width: 24 },
        { key: 'email', label: 'Email', width: 28 },
        { key: 'items', label: 'Items', type: 'number', width: 8 },
        { key: 'subtotal', label: 'Subtotal', type: 'currency', width: 13 },
        { key: 'discount', label: 'Discount', type: 'currency', width: 12 },
        { key: 'deliveryFee', label: 'Delivery', type: 'currency', width: 11 },
        { key: 'tax', label: 'GST', type: 'currency', width: 11 },
        { key: 'total', label: 'Total', type: 'currency', width: 14 },
        { key: 'status', label: 'Status', width: 16 },
        { key: 'payment', label: 'Payment', width: 14 },
        { key: 'coupon', label: 'Coupon', width: 14 },
      ],
      rows: orders.map((o) => ({
        orderNumber: o.orderNumber,
        placedAt: o.placedAt,
        customer: o.user.name,
        email: o.user.email,
        items: o._count.items,
        subtotal: toNumber(o.subtotal),
        discount: toNumber(o.discount),
        deliveryFee: toNumber(o.deliveryFee),
        tax: toNumber(o.tax),
        total: toNumber(o.total),
        status: o.status.replace(/_/g, ' '),
        payment: `${o.payment?.method ?? '-'} / ${o.payment?.status ?? '-'}`,
        coupon: o.coupon?.code ?? '-',
      })),
    };
  },

  async customerReport(range: DateRange): Promise<ReportPayload> {
    const customers = await prisma.user.findMany({
      where: { role: { name: 'CUSTOMER' } },
      orderBy: { totalSpent: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        segment: true,
        totalOrders: true,
        totalSpent: true,
        emailVerified: true,
        createdAt: true,
        lastLoginAt: true,
        addresses: { where: { isDefault: true }, take: 1, select: { city: true, state: true } },
        orders: {
          where: { status: { in: REVENUE_STATUSES } },
          orderBy: { placedAt: 'desc' },
          take: 1,
          select: { placedAt: true },
        },
      },
    });

    const inRange = customers.filter((c) => c.createdAt >= range.from && c.createdAt <= range.to);
    const repeat = customers.filter((c) => c.totalOrders > 1);

    return {
      type: 'customers',
      title: 'Customer Report',
      subtitle: `${customers.length} registered customer(s); ${inRange.length} joined in the selected period`,
      generatedAt: new Date(),
      range,
      summary: [
        { label: 'Total customers', value: String(customers.length) },
        { label: 'New in period', value: String(inRange.length) },
        { label: 'Repeat customers', value: String(repeat.length) },
        {
          label: 'Repeat rate',
          value: `${customers.length ? round2((repeat.length / customers.length) * 100) : 0}%`,
        },
        { label: 'Lifetime revenue', value: inr(customers.reduce((s, c) => s + toNumber(c.totalSpent), 0)) },
        {
          label: 'Average LTV',
          value: inr(customers.length ? customers.reduce((s, c) => s + toNumber(c.totalSpent), 0) / customers.length : 0),
        },
      ],
      columns: [
        { key: 'name', label: 'Customer', width: 24 },
        { key: 'email', label: 'Email', width: 30 },
        { key: 'phone', label: 'Phone', width: 15 },
        { key: 'city', label: 'City', width: 16 },
        { key: 'segment', label: 'Segment', width: 12 },
        { key: 'orders', label: 'Orders', type: 'number', width: 9 },
        { key: 'spent', label: 'Total spent', type: 'currency', width: 15 },
        { key: 'aov', label: 'Avg order', type: 'currency', width: 14 },
        { key: 'joinedAt', label: 'Joined', type: 'date', width: 13 },
        { key: 'lastOrderAt', label: 'Last order', type: 'date', width: 13 },
        { key: 'verified', label: 'Verified', width: 10 },
      ],
      rows: customers.map((c) => ({
        name: c.name,
        email: c.email,
        phone: c.phone ?? '-',
        city: c.addresses[0] ? `${c.addresses[0].city}, ${c.addresses[0].state}` : '-',
        segment: c.segment,
        orders: c.totalOrders,
        spent: toNumber(c.totalSpent),
        aov: c.totalOrders > 0 ? round2(toNumber(c.totalSpent) / c.totalOrders) : 0,
        joinedAt: c.createdAt,
        lastOrderAt: c.orders[0]?.placedAt ?? null,
        verified: c.emailVerified ? 'Yes' : 'No',
      })),
    };
  },

  async productReport(range: DateRange): Promise<ReportPayload> {
    const performance = await analyticsService.productPerformance(range, 1000);
    const combined = new Map<string, (typeof performance.bestSelling)[number]>();
    for (const row of [...performance.bestSelling, ...performance.leastSelling]) combined.set(row.productId, row);

    const rows = [...combined.values()].sort((a, b) => b.revenue - a.revenue);

    return {
      type: 'products',
      title: 'Product Performance Report',
      subtitle: `${rows.length} product(s), ${fmt(range.from)} to ${fmt(range.to)}`,
      generatedAt: new Date(),
      range,
      summary: [
        { label: 'Products analysed', value: String(rows.length) },
        { label: 'Products with sales', value: String(performance.totalProductsSold) },
        { label: 'Products with no sales', value: String(performance.noSales) },
        { label: 'Units sold', value: String(rows.reduce((s, r) => s + r.unitsSold, 0)) },
        { label: 'Revenue', value: inr(rows.reduce((s, r) => s + r.revenue, 0)) },
      ],
      columns: [
        { key: 'name', label: 'Product', width: 32 },
        { key: 'category', label: 'Category', width: 18 },
        { key: 'unitsSold', label: 'Units sold', type: 'number', width: 12 },
        { key: 'revenue', label: 'Revenue', type: 'currency', width: 15 },
        { key: 'orderCount', label: 'Orders', type: 'number', width: 10 },
        { key: 'stock', label: 'Stock', type: 'number', width: 10 },
        { key: 'views', label: 'Views', type: 'number', width: 10 },
        { key: 'conversionRate', label: 'View→buy %', type: 'percent', width: 13 },
        { key: 'avgRating', label: 'Rating', type: 'number', width: 9 },
      ],
      rows: rows.map((r) => ({
        name: r.name,
        category: r.category?.name ?? '-',
        unitsSold: r.unitsSold,
        revenue: r.revenue,
        orderCount: r.orderCount,
        stock: r.stock,
        views: r.views,
        conversionRate: r.conversionRate,
        avgRating: r.avgRating,
      })),
    };
  },

  async inventoryReport(range: DateRange): Promise<ReportPayload> {
    const [rows, summary] = await Promise.all([
      prisma.inventory.findMany({
        orderBy: { stock: 'asc' },
        include: {
          variant: {
            include: { product: { select: { name: true, isActive: true, category: { select: { name: true } } } } },
          },
        },
      }),
      prisma.inventory.count(),
    ]);

    const active = rows.filter((r) => r.variant.isActive && r.variant.product.isActive);
    const stockValue = active.reduce((sum, r) => sum + r.stock * toNumber(r.variant.price), 0);

    return {
      type: 'inventory',
      title: 'Inventory Report',
      subtitle: `${active.length} active SKU(s) of ${summary} tracked, as at ${fmt(new Date())}`,
      generatedAt: new Date(),
      range,
      summary: [
        { label: 'Active SKUs', value: String(active.length) },
        { label: 'Total units in stock', value: String(active.reduce((s, r) => s + r.stock, 0)) },
        { label: 'Stock valuation', value: inr(stockValue) },
        { label: 'Out of stock', value: String(active.filter((r) => r.stock <= 0).length) },
        {
          label: 'Below threshold',
          value: String(active.filter((r) => r.stock > 0 && r.stock <= r.lowStockThreshold).length),
        },
      ],
      columns: [
        { key: 'product', label: 'Product', width: 30 },
        { key: 'variant', label: 'Variant', width: 16 },
        { key: 'sku', label: 'SKU', width: 20 },
        { key: 'category', label: 'Category', width: 18 },
        { key: 'stock', label: 'Stock', type: 'number', width: 9 },
        { key: 'reserved', label: 'Reserved', type: 'number', width: 11 },
        { key: 'available', label: 'Available', type: 'number', width: 11 },
        { key: 'threshold', label: 'Threshold', type: 'number', width: 11 },
        { key: 'price', label: 'Unit price', type: 'currency', width: 13 },
        { key: 'stockValue', label: 'Stock value', type: 'currency', width: 15 },
        { key: 'status', label: 'Status', width: 12 },
        { key: 'restockedAt', label: 'Last restock', type: 'date', width: 14 },
      ],
      rows: active.map((r) => ({
        product: r.variant.product.name,
        variant: r.variant.name,
        sku: r.variant.sku,
        category: r.variant.product.category.name,
        stock: r.stock,
        reserved: r.reserved,
        available: Math.max(0, r.stock - r.reserved),
        threshold: r.lowStockThreshold,
        price: toNumber(r.variant.price),
        stockValue: round2(r.stock * toNumber(r.variant.price)),
        status: r.stock <= 0 ? 'Out of stock' : r.stock <= r.lowStockThreshold ? 'Low' : 'Healthy',
        restockedAt: r.restockedAt,
      })),
    };
  },

  async revenueReport(range: DateRange): Promise<ReportPayload> {
    const [series, categories, payments, kpis] = await Promise.all([
      analyticsService.salesSeries(range),
      analyticsService.categoryPerformance(range),
      analyticsService.paymentBreakdown(range),
      analyticsService.kpis(range),
    ]);

    return {
      type: 'revenue',
      title: 'Revenue Report',
      subtitle: `Revenue by ${series.granularity}, ${fmt(range.from)} to ${fmt(range.to)}`,
      generatedAt: new Date(),
      range,
      summary: [
        { label: 'Revenue', value: inr(kpis.revenue.value) },
        { label: 'Previous period', value: inr(kpis.revenue.previous) },
        { label: 'Change', value: `${kpis.revenue.change > 0 ? '+' : ''}${kpis.revenue.change}%` },
        { label: 'Orders', value: String(kpis.orders.value) },
        { label: 'Average order value', value: inr(kpis.averageOrderValue.value) },
        { label: 'Units sold', value: String(kpis.unitsSold.value) },
        { label: 'Top category', value: categories[0]?.name ?? '-' },
        { label: 'Top payment method', value: payments[0]?.method ?? '-' },
      ],
      columns: [
        { key: 'date', label: 'Period', width: 14 },
        { key: 'revenue', label: 'Revenue', type: 'currency', width: 16 },
        { key: 'orders', label: 'Orders', type: 'number', width: 11 },
        { key: 'units', label: 'Units', type: 'number', width: 11 },
        { key: 'aov', label: 'Avg order value', type: 'currency', width: 17 },
      ],
      rows: series.series.map((row) => ({
        date: row.date,
        revenue: row.revenue,
        orders: row.orders,
        units: row.units,
        aov: row.orders > 0 ? round2(row.revenue / row.orders) : 0,
      })),
    };
  },

  async recommendationReport(range: DateRange): Promise<ReportPayload> {
    const performance = await recommendationAnalytics.performance(range);

    return {
      type: 'recommendations',
      title: 'Recommendation Performance Report',
      subtitle: `Funnel by strategy, ${fmt(range.from)} to ${fmt(range.to)}`,
      generatedAt: new Date(),
      range,
      summary: [
        { label: 'Impressions', value: String(performance.totals.impressions) },
        { label: 'Clicks', value: String(performance.totals.clicks) },
        { label: 'Added to cart', value: String(performance.totals.addToCarts) },
        { label: 'Purchases', value: String(performance.totals.purchases) },
        { label: 'Click-through rate', value: `${performance.totals.clickThroughRate}%` },
        { label: 'Conversion rate', value: `${performance.totals.conversionRate}%` },
        { label: 'Best strategy', value: performance.bestStrategy ?? 'Not enough data' },
      ],
      columns: [
        { key: 'strategy', label: 'Strategy', width: 30 },
        { key: 'impressions', label: 'Impressions', type: 'number', width: 14 },
        { key: 'clicks', label: 'Clicks', type: 'number', width: 11 },
        { key: 'addToCarts', label: 'Added to cart', type: 'number', width: 15 },
        { key: 'purchases', label: 'Purchases', type: 'number', width: 12 },
        { key: 'clickThroughRate', label: 'CTR %', type: 'percent', width: 11 },
        { key: 'cartRate', label: 'Cart rate %', type: 'percent', width: 13 },
        { key: 'conversionRate', label: 'Conversion %', type: 'percent', width: 14 },
      ],
      rows: performance.byStrategy.map((r) => ({
        strategy: String(r.strategy).replace(/_/g, ' '),
        impressions: r.impressions,
        clicks: r.clicks,
        addToCarts: r.addToCarts,
        purchases: r.purchases,
        clickThroughRate: r.clickThroughRate,
        cartRate: r.cartRate,
        conversionRate: r.conversionRate,
      })),
    };
  },
};

const fmt = (date: Date) => date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const inr = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export { toISODate };
