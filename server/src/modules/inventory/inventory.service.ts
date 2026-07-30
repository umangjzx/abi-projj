import { Prisma, type InventoryMovementType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/ApiError';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { sendMail, mailTemplates } from '../../lib/mailer';
import { pageMeta, type PageParams } from '../../lib/http';
import { toNumber } from '../../lib/money';

export interface StockChange {
  variantId: string;
  quantity: number;
  type: InventoryMovementType;
  reason?: string;
  orderId?: string;
  actorId?: string;
}

export const inventoryService = {
  /**
   * Applies a signed stock delta and appends a ledger row, inside the caller's
   * transaction. Positive quantities add stock, negative remove it.
   *
   * Uses a conditional `updateMany` for decrements so two concurrent checkouts
   * cannot both pass a read-then-write check and oversell -- the second update
   * matches zero rows and we fail loudly.
   */
  async applyChange(tx: Prisma.TransactionClient, change: StockChange) {
    const inventory = await tx.inventory.findUnique({
      where: { variantId: change.variantId },
      include: { variant: { select: { name: true, product: { select: { name: true } } } } },
    });
    if (!inventory) throw ApiError.notFound('Inventory record not found for this variant');

    const label = `${inventory.variant.product.name} (${inventory.variant.name})`;

    if (change.quantity < 0) {
      const needed = Math.abs(change.quantity);
      const updated = await tx.inventory.updateMany({
        where: { variantId: change.variantId, stock: { gte: needed } },
        data: { stock: { decrement: needed } },
      });
      if (updated.count === 0) {
        throw ApiError.conflict(`Insufficient stock for ${label} -- only ${inventory.stock} left`);
      }
    } else if (change.quantity > 0) {
      await tx.inventory.update({
        where: { variantId: change.variantId },
        data: { stock: { increment: change.quantity }, restockedAt: new Date() },
      });
    }

    const fresh = await tx.inventory.findUniqueOrThrow({ where: { variantId: change.variantId } });

    await tx.inventoryMovement.create({
      data: {
        variantId: change.variantId,
        type: change.type,
        quantity: change.quantity,
        balance: fresh.stock,
        reason: change.reason ?? null,
        orderId: change.orderId ?? null,
        actorId: change.actorId ?? null,
      },
    });

    return { stock: fresh.stock, lowStockThreshold: fresh.lowStockThreshold, label };
  },

  /**
   * Raises admin notifications for anything that has fallen to or below its
   * threshold. Called after order placement and manual adjustments; runs
   * outside the transaction so a mail hiccup cannot roll back a sale.
   */
  async checkLowStock(variantIds: string[]) {
    if (!variantIds.length) return;

    try {
      const rows = await prisma.inventory.findMany({
        where: { variantId: { in: variantIds } },
        include: { variant: { select: { id: true, name: true, product: { select: { id: true, name: true } } } } },
      });

      const breached = rows.filter((r) => r.stock <= r.lowStockThreshold);
      if (!breached.length) return;

      const notifications = breached.map((r) => ({
        audience: 'ADMIN' as const,
        type: r.stock === 0 ? ('OUT_OF_STOCK' as const) : ('LOW_STOCK' as const),
        title: r.stock === 0 ? 'Out of stock' : 'Low stock alert',
        message: `${r.variant.product.name} (${r.variant.name}) has ${r.stock} unit(s) remaining.`,
        link: `/admin/inventory?variant=${r.variant.id}`,
        meta: { variantId: r.variant.id, productId: r.variant.product.id, stock: r.stock },
      }));

      await prisma.notification.createMany({ data: notifications as never });

      await sendMail({
        to: env.MAIL_FROM.replace(/.*<|>.*/g, '') || 'admin@thuthidairy.com',
        ...mailTemplates.lowStock(
          breached.map((r) => ({ name: `${r.variant.product.name} (${r.variant.name})`, stock: r.stock })),
        ),
      });
    } catch (err) {
      logger.warn({ err }, 'low stock check failed');
    }
  },

  // ------------------------------------------------------------------ admin ---

  async list(
    filters: { search?: string; status?: 'all' | 'low' | 'out' | 'healthy'; categoryId?: string },
    page: PageParams,
  ) {
    const where: Prisma.InventoryWhereInput = {
      variant: {
        ...(filters.search
          ? {
              OR: [
                { sku: { contains: filters.search, mode: 'insensitive' } },
                { name: { contains: filters.search, mode: 'insensitive' } },
                { product: { name: { contains: filters.search, mode: 'insensitive' } } },
              ],
            }
          : {}),
        ...(filters.categoryId ? { product: { categoryId: filters.categoryId } } : {}),
      },
    };

    if (filters.status === 'out') where.stock = { lte: 0 };
    else if (filters.status === 'healthy') where.stock = { gt: env.LOW_STOCK_THRESHOLD };

    const [rows, total] = await Promise.all([
      prisma.inventory.findMany({
        where,
        orderBy: { stock: 'asc' },
        skip: page.skip,
        take: page.take,
        include: {
          variant: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  category: { select: { id: true, name: true } },
                  images: { where: { isPrimary: true }, take: 1, select: { url: true } },
                },
              },
            },
          },
        },
      }),
      prisma.inventory.count({ where }),
    ]);

    let items = rows.map((r) => ({
      id: r.id,
      variantId: r.variantId,
      variantName: r.variant.name,
      sku: r.variant.sku,
      price: toNumber(r.variant.price),
      product: {
        id: r.variant.product.id,
        name: r.variant.product.name,
        slug: r.variant.product.slug,
        image: r.variant.product.images[0]?.url ?? null,
        category: r.variant.product.category,
      },
      stock: r.stock,
      reserved: r.reserved,
      available: Math.max(0, r.stock - r.reserved),
      lowStockThreshold: r.lowStockThreshold,
      warehouse: r.warehouse,
      restockedAt: r.restockedAt,
      stockValue: Number((r.stock * toNumber(r.variant.price)).toFixed(2)),
      status: r.stock <= 0 ? 'out' : r.stock <= r.lowStockThreshold ? 'low' : 'healthy',
    }));

    // `low` compares against each row's own threshold, which is a column
    // comparison Prisma cannot express in a where clause -- filter after fetch.
    if (filters.status === 'low') items = items.filter((i) => i.status === 'low');

    return { items, meta: pageMeta(total, page) };
  },

  async summary() {
    const rows = await prisma.inventory.findMany({
      include: { variant: { select: { price: true, isActive: true } } },
    });

    const active = rows.filter((r) => r.variant.isActive);
    const outOfStock = active.filter((r) => r.stock <= 0).length;
    const lowStock = active.filter((r) => r.stock > 0 && r.stock <= r.lowStockThreshold).length;
    const stockValue = active.reduce((sum, r) => sum + r.stock * toNumber(r.variant.price), 0);
    const totalUnits = active.reduce((sum, r) => sum + r.stock, 0);

    return {
      trackedVariants: active.length,
      totalUnits,
      outOfStock,
      lowStock,
      healthy: active.length - outOfStock - lowStock,
      stockValue: Number(stockValue.toFixed(2)),
    };
  },

  async adjust(
    variantId: string,
    input: { quantity: number; type: InventoryMovementType; reason?: string },
    actorId: string,
  ) {
    if (input.quantity === 0) throw ApiError.badRequest('Quantity must not be zero');

    // ADJUSTMENT accepts the signed value as given; the other types have an
    // inherent direction so the sign is derived rather than trusted.
    const signed =
      input.type === 'ADJUSTMENT'
        ? input.quantity
        : input.type === 'PURCHASE' || input.type === 'RETURN'
          ? Math.abs(input.quantity)
          : -Math.abs(input.quantity);

    const result = await prisma.$transaction((tx) =>
      inventoryService.applyChange(tx, {
        variantId,
        quantity: signed,
        type: input.type,
        reason: input.reason,
        actorId,
      }),
    );

    void inventoryService.checkLowStock([variantId]);
    return result;
  },

  async setThreshold(variantId: string, lowStockThreshold: number) {
    return prisma.inventory.update({ where: { variantId }, data: { lowStockThreshold } });
  },

  async movements(filters: { variantId?: string; type?: InventoryMovementType }, page: PageParams) {
    const where: Prisma.InventoryMovementWhereInput = {
      ...(filters.variantId ? { variantId: filters.variantId } : {}),
      ...(filters.type ? { type: filters.type } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page.skip,
        take: page.take,
        include: {
          variant: { select: { name: true, sku: true, product: { select: { name: true } } } },
          actor: { select: { name: true, email: true } },
          order: { select: { orderNumber: true } },
        },
      }),
      prisma.inventoryMovement.count({ where }),
    ]);

    return {
      items: rows.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity,
        balance: m.balance,
        reason: m.reason,
        createdAt: m.createdAt,
        product: m.variant.product.name,
        variant: m.variant.name,
        sku: m.variant.sku,
        orderNumber: m.order?.orderNumber ?? null,
        actor: m.actor ? { name: m.actor.name, email: m.actor.email } : null,
      })),
      meta: pageMeta(total, page),
    };
  },

  /** Variants at or below threshold, used by the dashboard alert widget. */
  async lowStockAlerts(limit = 10) {
    const rows = await prisma.inventory.findMany({
      where: { variant: { isActive: true, product: { isActive: true } } },
      orderBy: { stock: 'asc' },
      take: 100,
      include: {
        variant: {
          select: {
            id: true,
            name: true,
            sku: true,
            product: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    return rows
      .filter((r) => r.stock <= r.lowStockThreshold)
      .slice(0, limit)
      .map((r) => ({
        variantId: r.variant.id,
        productId: r.variant.product.id,
        productName: r.variant.product.name,
        variantName: r.variant.name,
        sku: r.variant.sku,
        stock: r.stock,
        lowStockThreshold: r.lowStockThreshold,
        severity: r.stock <= 0 ? ('critical' as const) : ('warning' as const),
      }));
  },
};
