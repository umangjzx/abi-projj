import type { Coupon } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/ApiError';
import { toDecimal, toNumber } from '../../lib/money';
import { computeCouponDiscount } from '../cart/pricing';
import { pageMeta, type PageParams } from '../../lib/http';

export const couponService = {
  /**
   * Full eligibility check: existence, active flag, window, global usage cap,
   * per-user cap and minimum order value. Throws a customer-readable reason.
   */
  async validateForUser(code: string, userId: string, subtotal: number): Promise<Coupon> {
    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon) throw ApiError.notFound('That coupon code does not exist');
    if (!coupon.isActive) throw ApiError.badRequest('This coupon is no longer active');

    const now = new Date();
    if (coupon.startsAt > now) throw ApiError.badRequest('This coupon is not valid yet');
    if (coupon.expiresAt && coupon.expiresAt < now) throw ApiError.badRequest('This coupon has expired');

    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw ApiError.badRequest('This coupon has reached its usage limit');
    }

    const minOrder = toNumber(coupon.minOrderValue);
    if (subtotal < minOrder) {
      throw ApiError.badRequest(`Add items worth ₹${(minOrder - subtotal).toFixed(2)} more to use this coupon (minimum order ₹${minOrder.toFixed(2)})`);
    }

    const usedByUser = await prisma.couponRedemption.count({ where: { couponId: coupon.id, userId } });
    if (usedByUser >= coupon.perUserLimit) {
      throw ApiError.badRequest('You have already used this coupon');
    }

    return coupon;
  },

  async preview(code: string, userId: string, subtotal: number) {
    const coupon = await this.validateForUser(code, userId, subtotal);
    return {
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      value: toNumber(coupon.value),
      discount: computeCouponDiscount(subtotal, coupon),
    };
  },

  /** Coupons the customer could actually use right now, for the cart drawer. */
  async availableFor(userId: string, subtotal: number) {
    const now = new Date();
    const coupons = await prisma.coupon.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      orderBy: { minOrderValue: 'asc' },
      take: 20,
    });

    const redemptions = await prisma.couponRedemption.groupBy({
      by: ['couponId'],
      where: { userId, couponId: { in: coupons.map((c) => c.id) } },
      _count: true,
    });
    const usedMap = new Map(redemptions.map((r) => [r.couponId, r._count]));

    return coupons
      .filter((c) => (usedMap.get(c.id) ?? 0) < c.perUserLimit)
      .filter((c) => c.usageLimit === null || c.usedCount < c.usageLimit)
      .map((c) => {
        const minOrder = toNumber(c.minOrderValue);
        const eligible = subtotal >= minOrder;
        return {
          code: c.code,
          description: c.description,
          discountType: c.discountType,
          value: toNumber(c.value),
          minOrderValue: minOrder,
          maxDiscount: c.maxDiscount ? toNumber(c.maxDiscount) : null,
          expiresAt: c.expiresAt,
          eligible,
          potentialDiscount: eligible ? computeCouponDiscount(subtotal, c) : 0,
          amountNeeded: eligible ? 0 : Number((minOrder - subtotal).toFixed(2)),
        };
      });
  },

  // ------------------------------------------------------------------ admin ---

  async list(filters: { search?: string; status?: 'active' | 'expired' | 'scheduled' | 'all' }, page: PageParams) {
    const now = new Date();
    const where: Record<string, unknown> = {};

    if (filters.search) {
      where.OR = [
        { code: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.status === 'active') {
      Object.assign(where, { isActive: true, startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] });
    } else if (filters.status === 'expired') {
      Object.assign(where, { expiresAt: { lt: now } });
    } else if (filters.status === 'scheduled') {
      Object.assign(where, { startsAt: { gt: now } });
    }

    const [rows, total] = await Promise.all([
      prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page.skip,
        take: page.take,
        include: { _count: { select: { redemptions: true } } },
      }),
      prisma.coupon.count({ where }),
    ]);

    return {
      items: rows.map((c) => ({
        id: c.id,
        code: c.code,
        description: c.description,
        discountType: c.discountType,
        value: toNumber(c.value),
        minOrderValue: toNumber(c.minOrderValue),
        maxDiscount: c.maxDiscount ? toNumber(c.maxDiscount) : null,
        usageLimit: c.usageLimit,
        usedCount: c.usedCount,
        perUserLimit: c.perUserLimit,
        startsAt: c.startsAt,
        expiresAt: c.expiresAt,
        isActive: c.isActive,
        redemptionCount: c._count.redemptions,
        status: !c.isActive
          ? 'inactive'
          : c.startsAt > now
            ? 'scheduled'
            : c.expiresAt && c.expiresAt < now
              ? 'expired'
              : 'active',
      })),
      meta: pageMeta(total, page),
    };
  },

  async create(input: Record<string, any>) {
    const code = String(input.code).toUpperCase().trim();
    const exists = await prisma.coupon.findUnique({ where: { code } });
    if (exists) throw ApiError.conflict('A coupon with this code already exists');

    if (input.discountType === 'PERCENTAGE' && Number(input.value) > 100) {
      throw ApiError.badRequest('A percentage discount cannot exceed 100');
    }

    return prisma.coupon.create({
      data: {
        code,
        description: input.description || null,
        discountType: input.discountType,
        value: toDecimal(input.value),
        minOrderValue: toDecimal(input.minOrderValue ?? 0),
        maxDiscount: input.maxDiscount ? toDecimal(input.maxDiscount) : null,
        usageLimit: input.usageLimit ?? null,
        perUserLimit: input.perUserLimit ?? 1,
        startsAt: input.startsAt ? new Date(input.startsAt) : new Date(),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        isActive: input.isActive ?? true,
      },
    });
  },

  async update(id: string, input: Record<string, any>) {
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('Coupon not found');

    const data: Record<string, unknown> = {};
    if (input.code) {
      const code = String(input.code).toUpperCase().trim();
      const clash = await prisma.coupon.findFirst({ where: { code, NOT: { id } } });
      if (clash) throw ApiError.conflict('A coupon with this code already exists');
      data.code = code;
    }
    if (input.description !== undefined) data.description = input.description || null;
    if (input.discountType !== undefined) data.discountType = input.discountType;
    if (input.value !== undefined) data.value = toDecimal(input.value);
    if (input.minOrderValue !== undefined) data.minOrderValue = toDecimal(input.minOrderValue);
    if (input.maxDiscount !== undefined) data.maxDiscount = input.maxDiscount ? toDecimal(input.maxDiscount) : null;
    if (input.usageLimit !== undefined) data.usageLimit = input.usageLimit ?? null;
    if (input.perUserLimit !== undefined) data.perUserLimit = input.perUserLimit;
    if (input.startsAt !== undefined) data.startsAt = new Date(input.startsAt);
    if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    return prisma.coupon.update({ where: { id }, data });
  },

  async remove(id: string) {
    const redemptions = await prisma.couponRedemption.count({ where: { couponId: id } });
    if (redemptions > 0) {
      // Keep the row so past orders still show which coupon was used.
      await prisma.coupon.update({ where: { id }, data: { isActive: false } });
      return { softDeleted: true, message: 'Coupon has been redeemed before, so it was deactivated instead of deleted.' };
    }
    await prisma.coupon.delete({ where: { id } });
    return { softDeleted: false, message: 'Coupon deleted.' };
  },
};
