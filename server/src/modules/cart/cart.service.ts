import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/ApiError';
import { toNumber } from '../../lib/money';
import { computePricing, pricingConfig } from './pricing';
import { couponService } from '../coupons/coupon.service';

const cartInclude = {
  coupon: true,
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      variant: {
        include: {
          inventory: true,
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
              images: { where: { isPrimary: true }, take: 1, select: { url: true } },
              category: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      },
    },
  },
} as const;

async function getOrCreateCart(userId: string) {
  const existing = await prisma.cart.findUnique({ where: { userId }, include: cartInclude });
  if (existing) return existing;
  await prisma.cart.create({ data: { userId } });
  return prisma.cart.findUniqueOrThrow({ where: { userId }, include: cartInclude });
}

function serializeCart(cart: Awaited<ReturnType<typeof getOrCreateCart>>) {
  const items = cart.items.map((item) => {
    const available = Math.max(0, (item.variant.inventory?.stock ?? 0) - (item.variant.inventory?.reserved ?? 0));
    const price = toNumber(item.variant.price);
    const mrp = toNumber(item.variant.mrp);
    // A product can be deactivated or sell out after it was added to the cart;
    // the client renders these flags instead of failing at checkout.
    const isAvailable = item.variant.isActive && item.variant.product.isActive && available > 0;

    return {
      id: item.id,
      quantity: item.quantity,
      variant: {
        id: item.variant.id,
        name: item.variant.name,
        sku: item.variant.sku,
        price,
        mrp,
        unit: item.variant.unit,
        packSize: item.variant.packSize,
      },
      product: {
        id: item.variant.product.id,
        name: item.variant.product.name,
        slug: item.variant.product.slug,
        image: item.variant.product.images[0]?.url ?? null,
        category: item.variant.product.category,
      },
      lineTotal: Number((price * item.quantity).toFixed(2)),
      availableStock: available,
      isAvailable,
      exceedsStock: item.quantity > available,
    };
  });

  const priceable = items.filter((i) => i.isAvailable).map((i) => ({ unitPrice: i.variant.price, quantity: i.quantity }));
  const mrpLines = items.filter((i) => i.isAvailable).map((i) => ({ unitPrice: i.variant.mrp, quantity: i.quantity }));
  const pricing = computePricing(priceable, cart.coupon, mrpLines);

  return {
    id: cart.id,
    items,
    coupon: cart.coupon
      ? {
          id: cart.coupon.id,
          code: cart.coupon.code,
          description: cart.coupon.description,
          discountType: cart.coupon.discountType,
          value: toNumber(cart.coupon.value),
        }
      : null,
    pricing,
    config: pricingConfig,
    hasIssues: items.some((i) => !i.isAvailable || i.exceedsStock),
  };
}

export const cartService = {
  async get(userId: string) {
    return serializeCart(await getOrCreateCart(userId));
  },

  async addItem(userId: string, variantId: string, quantity: number) {
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { inventory: true, product: { select: { isActive: true, name: true } } },
    });

    if (!variant || !variant.isActive || !variant.product.isActive) {
      throw ApiError.notFound('This product is no longer available');
    }

    const available = Math.max(0, (variant.inventory?.stock ?? 0) - (variant.inventory?.reserved ?? 0));
    if (available <= 0) throw ApiError.conflict(`${variant.product.name} is out of stock`);

    const cart = await getOrCreateCart(userId);
    const existing = cart.items.find((i) => i.variantId === variantId);
    const desired = (existing?.quantity ?? 0) + quantity;

    if (desired > available) {
      throw ApiError.conflict(
        `Only ${available} unit(s) of ${variant.product.name} (${variant.name}) are available` +
          (existing ? ` and you already have ${existing.quantity} in your cart` : ''),
      );
    }

    await prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      create: { cartId: cart.id, variantId, quantity },
      update: { quantity: desired },
    });

    return this.get(userId);
  },

  async updateItem(userId: string, itemId: string, quantity: number) {
    const cart = await getOrCreateCart(userId);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw ApiError.notFound('Cart item not found');

    if (quantity <= 0) {
      await prisma.cartItem.delete({ where: { id: itemId } });
      return this.get(userId);
    }

    const available = Math.max(0, (item.variant.inventory?.stock ?? 0) - (item.variant.inventory?.reserved ?? 0));
    if (quantity > available) throw ApiError.conflict(`Only ${available} unit(s) available`);

    await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
    return this.get(userId);
  },

  async removeItem(userId: string, itemId: string) {
    const cart = await getOrCreateCart(userId);
    if (!cart.items.some((i) => i.id === itemId)) throw ApiError.notFound('Cart item not found');
    await prisma.cartItem.delete({ where: { id: itemId } });
    return this.get(userId);
  },

  async clear(userId: string) {
    const cart = await getOrCreateCart(userId);
    await prisma.$transaction([
      prisma.cartItem.deleteMany({ where: { cartId: cart.id } }),
      prisma.cart.update({ where: { id: cart.id }, data: { couponId: null } }),
    ]);
    return this.get(userId);
  },

  async applyCoupon(userId: string, code: string) {
    const cart = await getOrCreateCart(userId);
    const serialized = serializeCart(cart);

    if (serialized.pricing.subtotal <= 0) throw ApiError.badRequest('Add items to your cart before applying a coupon');

    const coupon = await couponService.validateForUser(code, userId, serialized.pricing.subtotal);
    await prisma.cart.update({ where: { id: cart.id }, data: { couponId: coupon.id } });
    return this.get(userId);
  },

  async removeCoupon(userId: string) {
    const cart = await getOrCreateCart(userId);
    await prisma.cart.update({ where: { id: cart.id }, data: { couponId: null } });
    return this.get(userId);
  },

  /** Used by checkout: the raw cart plus a re-validated price breakdown. */
  async getForCheckout(userId: string) {
    const cart = await getOrCreateCart(userId);
    const serialized = serializeCart(cart);

    if (!serialized.items.length) throw ApiError.badRequest('Your cart is empty');

    const unavailable = serialized.items.filter((i) => !i.isAvailable);
    if (unavailable.length) {
      throw ApiError.conflict(
        `These items are no longer available: ${unavailable.map((i) => i.product.name).join(', ')}. Please remove them to continue.`,
      );
    }

    const short = serialized.items.filter((i) => i.exceedsStock);
    if (short.length) {
      throw ApiError.conflict(
        `Stock changed for: ${short.map((i) => `${i.product.name} (${i.availableStock} left)`).join(', ')}. Please update the quantities.`,
      );
    }

    // Re-validate the coupon at checkout time -- it may have expired or hit its
    // usage limit while sitting in the cart.
    if (cart.coupon) {
      try {
        await couponService.validateForUser(cart.coupon.code, userId, serialized.pricing.subtotal);
      } catch {
        await prisma.cart.update({ where: { id: cart.id }, data: { couponId: null } });
        throw ApiError.conflict('The coupon on your cart is no longer valid and has been removed. Please review your total.');
      }
    }

    return { cart, serialized };
  },
};
