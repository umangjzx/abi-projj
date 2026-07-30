/**
 * Database seed.
 *
 * Produces a demo-ready dataset:
 *   * roles + one admin + 18 customers with distinct buying profiles
 *   * 6 dairy categories, 23 products, 55+ variants with inventory
 *   * ~12 months of synthetic order history with weekday and seasonal shape,
 *     so every analytics chart, the forecast and all six recommendation
 *     strategies have real signal to work with
 *   * ratings, reviews, browsing history, coupons, offers and notifications
 *   * pre-computed product affinities and daily analytics snapshots
 *
 * Idempotent: it wipes the transactional tables it owns before inserting, so
 * `npm run db:seed` can be re-run safely.
 *
 *   npm run db:seed
 */
import { PrismaClient, Prisma, type OrderStatus, type PaymentMethod } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { CATEGORIES, CUSTOMER_SEEDS, COUPON_SEEDS, OFFER_SEEDS, REVIEW_TEMPLATES } from './seed-data';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
//  Deterministic pseudo-random generator.
//  A fixed seed means every developer and every CI run gets the *same* demo
//  numbers, which makes the dashboards reproducible and screenshots stable.
// ---------------------------------------------------------------------------
let rngState = 42;
const random = () => {
  rngState = (rngState * 1_664_525 + 1_013_904_223) % 4_294_967_296;
  return rngState / 4_294_967_296;
};
const randInt = (min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const chance = (probability: number) => random() < probability;

const DAY_MS = 86_400_000;
const MONTHS_OF_HISTORY = 12;

const slugify = (input: string) =>
  input.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');

const sku = (...parts: (string | number)[]) =>
  parts.map((p) => String(p).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)).join('-');

const money = (value: number) => new Prisma.Decimal(value.toFixed(2));
const round2 = (value: number) => Math.round(value * 100) / 100;

// Mirrors env defaults; the seed does not load the app's config module.
const DELIVERY_FEE = 25;
const FREE_DELIVERY_THRESHOLD = 499;
const TAX_PERCENT = 5;

async function main() {
  console.log('\n🥛  Seeding Thuthi Dairy database\n');

  await reset();
  const roles = await seedRoles();
  const admin = await seedAdmin(roles.adminRoleId);
  const customers = await seedCustomers(roles.customerRoleId);
  const catalogue = await seedCatalogue();
  const coupons = await seedCoupons();
  await seedOffers(catalogue);
  const orders = await seedOrders(customers, catalogue, coupons, admin.id);
  await seedReviewsAndRatings(customers, catalogue, orders);
  await seedBrowsingHistory(customers, catalogue);
  await seedAffinities();
  await seedRecommendationTelemetry(customers, catalogue);
  await seedCarts(customers, catalogue);
  await seedNotifications(customers);
  await seedAnalyticsSnapshots();
  await recomputeAggregates();

  await summary();
}

// ---------------------------------------------------------------------- reset ---

async function reset() {
  process.stdout.write('  Clearing existing data... ');
  // Order matters: children before parents, because several FKs are restrictive.
  await prisma.$transaction([
    prisma.recommendationEvent.deleteMany(),
    prisma.recommendation.deleteMany(),
    prisma.productAffinity.deleteMany(),
    prisma.analyticsSnapshot.deleteMany(),
    prisma.activityLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.recentlyViewed.deleteMany(),
    prisma.review.deleteMany(),
    prisma.rating.deleteMany(),
    prisma.wishlistItem.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.cart.deleteMany(),
    prisma.couponRedemption.deleteMany(),
    prisma.orderStatusEvent.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.inventoryMovement.deleteMany(),
    prisma.order.deleteMany(),
    prisma.inventory.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.productImage.deleteMany(),
    prisma.offer.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.coupon.deleteMany(),
    prisma.address.deleteMany(),
    prisma.otpToken.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
    prisma.role.deleteMany(),
  ]);
  console.log('done');
}

// ---------------------------------------------------------------------- roles ---

async function seedRoles() {
  const admin = await prisma.role.create({
    data: {
      name: 'ADMIN',
      label: 'Administrator',
      description: 'Full access to catalogue, orders, customers, analytics and reports.',
      // '*' is the wildcard grant honoured by requirePermission().
      permissions: ['*'],
    },
  });

  const customer = await prisma.role.create({
    data: {
      name: 'CUSTOMER',
      label: 'Customer',
      description: 'Can shop, place orders, review products and manage their own profile.',
      permissions: [
        'product:read',
        'cart:write',
        'order:create',
        'order:read:own',
        'review:write',
        'wishlist:write',
        'profile:write',
      ],
    },
  });

  console.log('  ✓ Roles');
  return { adminRoleId: admin.id, customerRoleId: customer.id };
}

async function seedAdmin(roleId: string) {
  const admin = await prisma.user.create({
    data: {
      name: 'Thuthi Dairy Admin',
      email: 'admin@thuthidairy.com',
      passwordHash: await bcrypt.hash('Admin@123', 10),
      phone: '9840000000',
      roleId,
      emailVerified: true,
      segment: 'ACTIVE',
    },
  });
  console.log('  ✓ Admin account            admin@thuthidairy.com / Admin@123');
  return admin;
}

interface SeededCustomer {
  id: string;
  name: string;
  email: string;
  profile: string;
  addressId: string;
  shipTo: Prisma.InputJsonValue;
  joinedAt: Date;
}

async function seedCustomers(roleId: string): Promise<SeededCustomer[]> {
  const passwordHash = await bcrypt.hash('Customer@123', 10);
  const customers: SeededCustomer[] = [];

  for (const [index, seed] of CUSTOMER_SEEDS.entries()) {
    // Spread sign-ups across the history window so the customer-growth chart
    // has a real curve; 'new' profiles join in the last few weeks.
    const daysAgo = seed.profile === 'new' ? randInt(3, 25) : randInt(40, MONTHS_OF_HISTORY * 30);
    const joinedAt = new Date(Date.now() - daysAgo * DAY_MS);

    const user = await prisma.user.create({
      data: {
        name: seed.name,
        email: seed.email,
        passwordHash,
        phone: seed.phone,
        roleId,
        emailVerified: true,
        createdAt: joinedAt,
        lastLoginAt: new Date(Date.now() - randInt(0, 20) * DAY_MS),
      },
    });

    const address = await prisma.address.create({
      data: {
        userId: user.id,
        label: index % 4 === 0 ? 'Work' : 'Home',
        fullName: seed.name,
        phone: seed.phone,
        line1: `${randInt(1, 180)}, ${pick(['Gandhi Street', 'Nehru Nagar', 'Anna Salai', 'Kamaraj Road', 'Bharathi Street', 'Lake View Road'])}`,
        line2: pick(['Near Water Tank', 'Opposite Post Office', 'Above Sri Stores', '2nd Floor']),
        landmark: pick(['Next to the temple', 'Beside the bus stop', 'Near the market', 'Opposite the school']),
        city: seed.city,
        state: seed.state,
        pincode: seed.pincode,
        isDefault: true,
        createdAt: joinedAt,
      },
    });

    customers.push({
      id: user.id,
      name: user.name,
      email: user.email,
      profile: seed.profile,
      addressId: address.id,
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
      joinedAt,
    });
  }

  console.log(`  ✓ ${customers.length} customers          (password for all: Customer@123)`);
  return customers;
}

// ------------------------------------------------------------------ catalogue ---

interface SeededVariant {
  id: string;
  name: string;
  sku: string;
  price: number;
  mrp: number;
}

interface SeededProduct {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  categoryName: string;
  image: string;
  popularity: number;
  seasonality: number;
  variants: SeededVariant[];
}

async function seedCatalogue(): Promise<SeededProduct[]> {
  const products: SeededProduct[] = [];
  let categoryOrder = 0;
  // `sku()` truncates to 6 chars per part, so two products sharing a name
  // prefix (e.g. "Paneer Tikka..." / "Paneer Yoghurt...") collide on the
  // unique constraint. Track what has been issued this run and disambiguate
  // with a numeric suffix rather than letting the catalogue's word choices
  // dictate SKU uniqueness.
  const usedProductSkus = new Set<string>();

  const uniqueSku = (base: string): string => {
    if (!usedProductSkus.has(base)) {
      usedProductSkus.add(base);
      return base;
    }
    let n = 2;
    while (usedProductSkus.has(`${base}-${n}`)) n++;
    const candidate = `${base}-${n}`;
    usedProductSkus.add(candidate);
    return candidate;
  };

  for (const categorySeed of CATEGORIES) {
    const category = await prisma.category.create({
      data: {
        name: categorySeed.name,
        slug: slugify(categorySeed.name),
        description: categorySeed.description,
        imageUrl: categorySeed.image,
        sortOrder: categoryOrder++,
      },
    });

    for (const productSeed of categorySeed.products) {
      const product = await prisma.product.create({
        data: {
          name: productSeed.name,
          slug: slugify(productSeed.name),
          sku: uniqueSku(sku(productSeed.name, 'TD')),
          shortDescription: productSeed.shortDescription,
          description: productSeed.description,
          categoryId: category.id,
          brand: 'Butterman',
          attributes: productSeed.attributes as Prisma.InputJsonValue,
          tags: productSeed.tags,
          isFeatured: productSeed.isFeatured ?? false,
          // Stagger creation dates so "New arrivals" is meaningful.
          createdAt: new Date(Date.now() - randInt(10, 300) * DAY_MS),
          images: {
            create: [{ url: productSeed.image, alt: productSeed.name, isPrimary: true, sortOrder: 0 }],
          },
        },
      });

      const variants: SeededVariant[] = [];

      for (const [index, variantSeed] of productSeed.variants.entries()) {
        const variant = await prisma.productVariant.create({
          data: {
            productId: product.id,
            name: variantSeed.name,
            sku: sku(productSeed.name, variantSeed.name),
            price: money(variantSeed.price),
            mrp: money(variantSeed.mrp),
            unit: variantSeed.unit,
            packSize: variantSeed.packSize,
            weightGram: variantSeed.weightGram,
            isDefault: variantSeed.isDefault ?? index === 0,
          },
        });

        await prisma.inventory.create({
          data: {
            variantId: variant.id,
            stock: variantSeed.stock,
            lowStockThreshold: Math.max(10, Math.round(variantSeed.stock * 0.12)),
            restockedAt: new Date(Date.now() - randInt(0, 6) * DAY_MS),
          },
        });

        await prisma.inventoryMovement.create({
          data: {
            variantId: variant.id,
            type: 'PURCHASE',
            quantity: variantSeed.stock,
            balance: variantSeed.stock,
            reason: 'Opening stock',
          },
        });

        variants.push({
          id: variant.id,
          name: variant.name,
          sku: variant.sku,
          price: variantSeed.price,
          mrp: variantSeed.mrp,
        });
      }

      products.push({
        id: product.id,
        name: product.name,
        slug: product.slug,
        categoryId: category.id,
        categoryName: category.name,
        image: productSeed.image,
        popularity: productSeed.popularity,
        seasonality: productSeed.seasonality ?? 1,
        variants,
      });
    }
  }

  const variantCount = products.reduce((sum, p) => sum + p.variants.length, 0);
  console.log(`  ✓ ${CATEGORIES.length} categories, ${products.length} products, ${variantCount} variants`);
  return products;
}

async function seedCoupons() {
  const coupons = [];
  for (const seed of COUPON_SEEDS) {
    coupons.push(
      await prisma.coupon.create({
        data: {
          code: seed.code,
          description: seed.description,
          discountType: seed.discountType,
          value: money(seed.value),
          minOrderValue: money(seed.minOrderValue),
          maxDiscount: 'maxDiscount' in seed && seed.maxDiscount ? money(seed.maxDiscount) : null,
          usageLimit: seed.usageLimit ?? null,
          perUserLimit: seed.perUserLimit,
          startsAt: new Date(Date.now() - 120 * DAY_MS),
          expiresAt: new Date(Date.now() + 120 * DAY_MS),
        },
      }),
    );
  }
  console.log(`  ✓ ${coupons.length} coupons`);
  return coupons;
}

async function seedOffers(products: SeededProduct[]) {
  const gheeProduct = products.find((p) => p.name.includes('Bilona'));
  const beverages = products.find((p) => p.categoryName === 'Beverages');

  for (const [index, seed] of OFFER_SEEDS.entries()) {
    await prisma.offer.create({
      data: {
        ...seed,
        productId: seed.type === 'PRODUCT_DISCOUNT' ? (gheeProduct?.id ?? null) : null,
        categoryId: seed.type === 'CATEGORY_DISCOUNT' ? (beverages?.categoryId ?? null) : null,
        startsAt: new Date(Date.now() - (index + 1) * 10 * DAY_MS),
        endsAt: new Date(Date.now() + 60 * DAY_MS),
      },
    });
  }
  console.log(`  ✓ ${OFFER_SEEDS.length} promotional offers`);
}

// --------------------------------------------------------------------- orders ---

/** How many orders each profile places over the history window, and how recently. */
const PROFILES: Record<string, { orders: [number, number]; basketSize: [number, number]; recencyBias: number }> = {
  loyal: { orders: [14, 22], basketSize: [3, 6], recencyBias: 1.0 },
  regular: { orders: [6, 12], basketSize: [2, 5], recencyBias: 0.9 },
  occasional: { orders: [2, 5], basketSize: [1, 3], recencyBias: 0.7 },
  churned: { orders: [3, 6], basketSize: [2, 4], recencyBias: 0.15 },
  new: { orders: [1, 2], basketSize: [1, 3], recencyBias: 1.0 },
};

/**
 * Products that genuinely go together in an Indian dairy basket. Seeding these
 * co-purchases is what gives "frequently bought together" real, sensible pairs
 * instead of noise.
 */
const BASKET_AFFINITIES: [string, string][] = [
  ['Toned Fresh Milk', 'Thick Set Curd'],
  ['Toned Fresh Milk', 'Table Butter'],
  ['Full Cream Milk', 'Fresh Malai Paneer'],
  ['Thick Set Curd', 'Masala Buttermilk'],
  ['Fresh Malai Paneer', 'Table Butter'],
  ['Bilona Cow Ghee', 'Mysore Pak'],
  ['Processed Cheese Slices', 'Table Butter'],
  ['Mozzarella Cheese Block', 'Processed Cheese Slices'],
  ['Sweet Lassi', 'Masala Buttermilk'],
  ['Kulfi Ice Cream', 'Sweet Lassi'],
  ['A2 Desi Cow Milk', 'Bilona Cow Ghee'],
  ['Greek Yoghurt', 'Fruit Yoghurt'],
];

interface SeededOrder {
  id: string;
  userId: string;
  productIds: string[];
  placedAt: Date;
  status: OrderStatus;
}

async function seedOrders(
  customers: SeededCustomer[],
  products: SeededProduct[],
  coupons: { id: string; code: string; discountType: string; value: Prisma.Decimal; minOrderValue: Prisma.Decimal; maxDiscount: Prisma.Decimal | null }[],
  adminId: string,
): Promise<SeededOrder[]> {
  const productByName = new Map(products.map((p) => [p.name, p]));
  const orders: SeededOrder[] = [];
  const stockDeltas = new Map<string, number>();
  const couponUsage = new Map<string, number>();
  const perDaySequence = new Map<string, number>();

  // Popularity-weighted pool so bestsellers really do sell more.
  const weightedPool: SeededProduct[] = [];
  for (const product of products) {
    const weight = Math.max(1, Math.round(product.popularity / 8));
    for (let i = 0; i < weight; i++) weightedPool.push(product);
  }

  for (const customer of customers) {
    const profile = PROFILES[customer.profile] ?? PROFILES.regular;
    const orderCount = randInt(profile.orders[0], profile.orders[1]);
    // Never place an order before the customer registered.
    const maxDaysAgo = Math.min(MONTHS_OF_HISTORY * 30, Math.floor((Date.now() - customer.joinedAt.getTime()) / DAY_MS));
    if (maxDaysAgo < 1) continue;

    for (let i = 0; i < orderCount; i++) {
      // recencyBias skews churned customers' orders towards the far past.
      const skew = Math.pow(random(), 1 / Math.max(0.15, profile.recencyBias));
      const daysAgo = Math.max(1, Math.round(maxDaysAgo * (1 - skew * profile.recencyBias)));
      const placedAt = buildTimestamp(daysAgo);

      // ---- build the basket ----
      const basketSize = randInt(profile.basketSize[0], profile.basketSize[1]);
      const chosen = new Map<string, SeededProduct>();

      const anchor = pickSeasonal(weightedPool, placedAt);
      chosen.set(anchor.id, anchor);

      // Pull in a genuine companion product ~55% of the time.
      const companions = BASKET_AFFINITIES.filter(([a, b]) => a === anchor.name || b === anchor.name);
      if (companions.length && chance(0.55)) {
        const [a, b] = pick(companions);
        const companionName = a === anchor.name ? b : a;
        const companion = productByName.get(companionName);
        if (companion) chosen.set(companion.id, companion);
      }

      while (chosen.size < basketSize) {
        const candidate = pickSeasonal(weightedPool, placedAt);
        chosen.set(candidate.id, candidate);
        if (chosen.size > 8) break;
      }

      // ---- price the basket ----
      const items = [...chosen.values()].map((product) => {
        const variant = pick(product.variants);
        const quantity = randInt(1, product.categoryName === 'Milk' ? 4 : 2);
        return {
          product,
          variant,
          quantity,
          lineTotal: round2(variant.price * quantity),
        };
      });

      const subtotal = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));

      // ---- coupon (about 1 order in 4) ----
      let coupon: (typeof coupons)[number] | null = null;
      let discount = 0;
      if (chance(0.26)) {
        const eligible = coupons.filter((c) => subtotal >= Number(c.minOrderValue.toString()));
        if (eligible.length) {
          const candidate = pick(eligible);
          const used = couponUsage.get(`${candidate.id}:${customer.id}`) ?? 0;
          if (used < 2) {
            coupon = candidate;
            const value = Number(candidate.value.toString());
            const raw = candidate.discountType === 'PERCENTAGE' ? (subtotal * value) / 100 : value;
            const cap = candidate.maxDiscount ? Number(candidate.maxDiscount.toString()) : Infinity;
            discount = round2(Math.min(raw, cap, subtotal));
            couponUsage.set(`${candidate.id}:${customer.id}`, used + 1);
          }
        }
      }

      const discounted = round2(subtotal - discount);
      const deliveryFee = discounted >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
      const tax = round2((discounted * TAX_PERCENT) / 100);
      const total = round2(discounted + deliveryFee + tax);

      // ---- status: age-appropriate, with a realistic failure rate ----
      const status = resolveStatus(daysAgo);
      const paymentMethod = pick(['UPI', 'UPI', 'UPI', 'COD', 'COD', 'CARD', 'NETBANKING', 'WALLET'] as PaymentMethod[]);

      const dayKey = placedAt.toISOString().slice(0, 10);
      const sequence = (perDaySequence.get(dayKey) ?? 0) + 1;
      perDaySequence.set(dayKey, sequence);
      const orderNumber = `TD-${dayKey.replace(/-/g, '')}-${String(sequence).padStart(4, '0')}`;

      const order = await prisma.order.create({
        data: {
          orderNumber,
          userId: customer.id,
          addressId: customer.addressId,
          couponId: coupon?.id ?? null,
          status,
          subtotal: money(subtotal),
          discount: money(discount),
          deliveryFee: money(deliveryFee),
          tax: money(tax),
          total: money(total),
          itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
          shipTo: customer.shipTo,
          placedAt,
          createdAt: placedAt,
          ...buildStatusTimestamps(status, placedAt),
          items: {
            create: items.map((item) => ({
              productId: item.product.id,
              variantId: item.variant.id,
              productName: item.product.name,
              variantName: item.variant.name,
              sku: item.variant.sku,
              unitPrice: money(item.variant.price),
              mrp: money(item.variant.mrp),
              quantity: item.quantity,
              lineTotal: money(item.lineTotal),
              imageUrl: item.product.image,
            })),
          },
          payment: {
            create: {
              method: paymentMethod,
              status:
                status === 'CANCELLED' || status === 'RETURNED'
                  ? paymentMethod === 'COD'
                    ? 'PENDING'
                    : 'REFUNDED'
                  : paymentMethod === 'COD' && status !== 'DELIVERED'
                    ? 'PENDING'
                    : 'PAID',
              amount: money(total),
              paidAt: paymentMethod === 'COD' && status !== 'DELIVERED' ? null : placedAt,
              transactionRef: paymentMethod === 'COD' ? null : `SIM-${orderNumber}-${randInt(100000, 999999)}`,
              createdAt: placedAt,
            },
          },
          statusEvents: { create: buildStatusEvents(status, placedAt, customer.id, adminId) },
        },
      });

      if (coupon) {
        await prisma.couponRedemption.create({
          data: { couponId: coupon.id, userId: customer.id, orderId: order.id, discount: money(discount), createdAt: placedAt },
        });
        await prisma.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
      }

      // Only realised orders consume stock (cancelled/returned are restored).
      if (!['CANCELLED', 'RETURNED'].includes(status)) {
        for (const item of items) {
          stockDeltas.set(item.variant.id, (stockDeltas.get(item.variant.id) ?? 0) + item.quantity);
        }
      }

      orders.push({
        id: order.id,
        userId: customer.id,
        productIds: items.map((i) => i.product.id),
        placedAt,
        status,
      });
    }
  }

  // Apply the accumulated stock consumption in one pass, with ledger rows.
  for (const [variantId, consumed] of stockDeltas) {
    const inventory = await prisma.inventory.findUnique({ where: { variantId } });
    if (!inventory) continue;
    // Keep a little stock on the shelf, and let a few SKUs run low/out so the
    // inventory alerts screen has something real to show.
    const remaining = Math.max(0, inventory.stock - Math.round(consumed * 0.35));
    await prisma.inventory.update({ where: { variantId }, data: { stock: remaining } });
    await prisma.inventoryMovement.create({
      data: {
        variantId,
        type: 'SALE',
        quantity: -Math.round(consumed * 0.35),
        balance: remaining,
        reason: 'Cumulative sales (seed)',
      },
    });
  }

  // Force a handful of low/out-of-stock SKUs for the alerts demo.
  const someVariants = await prisma.inventory.findMany({ take: 6, orderBy: { stock: 'asc' } });
  for (const [index, inventory] of someVariants.entries()) {
    await prisma.inventory.update({
      where: { id: inventory.id },
      data: { stock: index < 2 ? 0 : randInt(2, Math.max(3, inventory.lowStockThreshold - 1)) },
    });
  }

  console.log(`  ✓ ${orders.length} orders across ${MONTHS_OF_HISTORY} months`);
  return orders;
}

/**
 * Builds a realistic timestamp: weekends and early mornings are busier for a
 * dairy, so the heat map and day-of-week forecast seasonality look genuine.
 */
function buildTimestamp(daysAgo: number): Date {
  const date = new Date(Date.now() - daysAgo * DAY_MS);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  // Two peaks: early morning subscription-style orders and an evening top-up.
  const hour = chance(isWeekend ? 0.5 : 0.62) ? randInt(5, 10) : randInt(17, 22);
  date.setHours(hour, randInt(0, 59), randInt(0, 59), 0);
  return date;
}

/** Applies each product's seasonality factor to the month of the order. */
function pickSeasonal(pool: SeededProduct[], placedAt: Date): SeededProduct {
  const month = placedAt.getMonth();
  // Peak summer in South India: March-June (index 2-5).
  const summerFactor = month >= 2 && month <= 5 ? 1 : month >= 6 && month <= 8 ? 0.75 : 0.5;

  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = pick(pool);
    const bias = candidate.seasonality === 1 ? 1 : candidate.seasonality > 1 ? summerFactor * candidate.seasonality : (1.5 - summerFactor) * candidate.seasonality;
    if (random() < Math.min(1, bias)) return candidate;
  }
  return pick(pool);
}

function resolveStatus(daysAgo: number): OrderStatus {
  // ~6% of orders fail, whatever their age -- that is what makes the
  // cancellation and returns metrics non-zero.
  if (chance(0.045)) return 'CANCELLED';
  if (daysAgo > 5 && chance(0.018)) return 'RETURNED';

  if (daysAgo >= 4) return 'DELIVERED';
  if (daysAgo === 3) return chance(0.85) ? 'DELIVERED' : 'OUT_FOR_DELIVERY';
  if (daysAgo === 2) return pick(['DELIVERED', 'OUT_FOR_DELIVERY', 'SHIPPED'] as OrderStatus[]);
  if (daysAgo === 1) return pick(['SHIPPED', 'PACKED', 'OUT_FOR_DELIVERY'] as OrderStatus[]);
  return pick(['PENDING', 'CONFIRMED', 'PACKED'] as OrderStatus[]);
}

function buildStatusTimestamps(status: OrderStatus, placedAt: Date) {
  const at = (hours: number) => new Date(placedAt.getTime() + hours * 3_600_000);
  const reached = STATUS_ORDER.indexOf(status);

  return {
    confirmedAt: reached >= 1 && reached <= 5 ? at(1) : status === 'CANCELLED' || status === 'RETURNED' ? at(1) : null,
    shippedAt: reached >= 3 && reached <= 5 ? at(10) : status === 'RETURNED' ? at(10) : null,
    deliveredAt: status === 'DELIVERED' || status === 'RETURNED' ? at(20) : null,
    cancelledAt: status === 'CANCELLED' ? at(2) : null,
    cancelReason: status === 'CANCELLED' ? pick(['Customer requested cancellation', 'Address not reachable', 'Item unavailable', 'Duplicate order']) : null,
  };
}

const STATUS_ORDER: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

function buildStatusEvents(status: OrderStatus, placedAt: Date, customerId: string, adminId: string) {
  const events: { status: OrderStatus; note: string; actorId: string; createdAt: Date }[] = [
    { status: 'PENDING', note: 'Order placed', actorId: customerId, createdAt: placedAt },
  ];
  const at = (hours: number) => new Date(placedAt.getTime() + hours * 3_600_000);

  if (status === 'CANCELLED') {
    events.push({ status: 'CANCELLED', note: 'Order cancelled', actorId: customerId, createdAt: at(2) });
    return events;
  }

  const target = status === 'RETURNED' ? STATUS_ORDER.length - 1 : STATUS_ORDER.indexOf(status);
  const hours = [0, 1, 5, 10, 16, 20];

  for (let i = 1; i <= target; i++) {
    events.push({
      status: STATUS_ORDER[i],
      note: `Marked ${STATUS_ORDER[i].replace(/_/g, ' ').toLowerCase()}`,
      actorId: adminId,
      createdAt: at(hours[i]),
    });
  }

  if (status === 'RETURNED') {
    events.push({ status: 'RETURNED', note: 'Returned by customer', actorId: adminId, createdAt: at(40) });
  }

  return events;
}

// ------------------------------------------------------- reviews and ratings ---

async function seedReviewsAndRatings(customers: SeededCustomer[], products: SeededProduct[], orders: SeededOrder[]) {
  // Only customers who actually received a product may review it -- that is
  // what makes the "verified purchase" badge meaningful.
  const delivered = orders.filter((o) => o.status === 'DELIVERED');
  const eligible = new Map<string, Set<string>>();

  for (const order of delivered) {
    for (const productId of order.productIds) {
      const set = eligible.get(order.userId) ?? new Set<string>();
      set.add(productId);
      eligible.set(order.userId, set);
    }
  }

  let ratingCount = 0;
  let reviewCount = 0;

  for (const [userId, productIds] of eligible) {
    for (const productId of productIds) {
      // About 40% of delivered products get rated.
      if (!chance(0.4)) continue;

      const template = pick(REVIEW_TEMPLATES);
      const orderForProduct = delivered.find((o) => o.userId === userId && o.productIds.includes(productId));
      const createdAt = new Date((orderForProduct?.placedAt.getTime() ?? Date.now()) + randInt(2, 12) * DAY_MS);
      if (createdAt > new Date()) continue;

      const rating = await prisma.rating.create({
        data: { userId, productId, value: template.rating, createdAt, updatedAt: createdAt },
      });
      ratingCount += 1;

      // Two thirds of raters also write prose.
      if (chance(0.68)) {
        await prisma.review.create({
          data: {
            userId,
            productId,
            ratingId: rating.id,
            orderId: orderForProduct?.id ?? null,
            title: template.title,
            comment: template.comment,
            status: 'APPROVED',
            isVerified: true,
            helpfulCount: randInt(0, 24),
            createdAt,
            updatedAt: createdAt,
          },
        });
        reviewCount += 1;
      }
    }
  }

  // A couple of pending reviews so the moderation queue is not empty.
  const unreviewed = products.slice(0, 3);
  for (const [index, product] of unreviewed.entries()) {
    const customer = customers[customers.length - 1 - index];
    const already = await prisma.review.findUnique({
      where: { userId_productId: { userId: customer.id, productId: product.id } },
    });
    if (already) continue;

    await prisma.review.create({
      data: {
        userId: customer.id,
        productId: product.id,
        title: 'Waiting on moderation',
        comment: 'Just received my first order today, will update after using it for a week.',
        status: 'PENDING',
        isVerified: false,
      },
    });
    reviewCount += 1;
  }

  console.log(`  ✓ ${ratingCount} ratings, ${reviewCount} reviews`);
}

async function seedBrowsingHistory(customers: SeededCustomer[], products: SeededProduct[]) {
  let views = 0;
  let wishlisted = 0;

  for (const customer of customers) {
    const viewCount = randInt(3, 10);
    const seen = new Set<string>();

    for (let i = 0; i < viewCount; i++) {
      const product = pick(products);
      if (seen.has(product.id)) continue;
      seen.add(product.id);

      await prisma.recentlyViewed.create({
        data: {
          userId: customer.id,
          productId: product.id,
          viewedAt: new Date(Date.now() - randInt(0, 21) * DAY_MS),
          viewCount: randInt(1, 6),
        },
      });
      views += 1;

      if (chance(0.3)) {
        await prisma.wishlistItem.create({
          data: { userId: customer.id, productId: product.id, createdAt: new Date(Date.now() - randInt(0, 40) * DAY_MS) },
        });
        wishlisted += 1;
      }
    }
  }

  // Give the catalogue realistic view counters -- the product report's
  // view-to-buy conversion column depends on them.
  for (const product of products) {
    await prisma.product.update({
      where: { id: product.id },
      data: { viewCount: randInt(product.popularity * 3, product.popularity * 12) },
    });
  }

  console.log(`  ✓ ${views} recently-viewed rows, ${wishlisted} wishlist items`);
}

// ------------------------------------------------------- recommendation model ---

/** Same algorithm as recommendationService.rebuildAllAffinities, run inline. */
async function seedAffinities() {
  const orders = await prisma.order.findMany({
    where: { status: { in: ['CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'] } },
    select: { items: { select: { productId: true } } },
  });

  const pairCounts = new Map<string, number>();
  const productCounts = new Map<string, number>();

  for (const order of orders) {
    const unique = [...new Set(order.items.map((i) => i.productId))];
    for (const id of unique) productCounts.set(id, (productCounts.get(id) ?? 0) + 1);
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const key = [unique[i], unique[j]].sort().join('|');
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const rows = [...pairCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([key, coOccurrence]) => {
      const [productAId, productBId] = key.split('|');
      const denominator = Math.max(1, Math.min(productCounts.get(productAId) ?? 1, productCounts.get(productBId) ?? 1));
      return { productAId, productBId, coOccurrence, score: Math.min(1, coOccurrence / denominator) };
    });

  if (rows.length) await prisma.productAffinity.createMany({ data: rows, skipDuplicates: true });
  console.log(`  ✓ ${rows.length} product affinity pairs`);
}

/**
 * Synthetic recommendation funnel telemetry, so the monitoring dashboard and
 * the performance report have a populated funnel on first load.
 */
async function seedRecommendationTelemetry(customers: SeededCustomer[], products: SeededProduct[]) {
  const strategies = ['PURCHASE_HISTORY', 'CATEGORY_AFFINITY', 'FREQUENTLY_BOUGHT_TOGETHER', 'POPULAR', 'COLLABORATIVE', 'RECENTLY_VIEWED', 'TRENDING'] as const;
  const placements = ['HOME', 'PRODUCT_DETAIL', 'CART', 'CHECKOUT', 'CUSTOMER_DASHBOARD'] as const;

  // Realistic funnel drop-off per strategy: personalised strategies convert
  // better than generic popularity.
  const ctr: Record<string, number> = {
    PURCHASE_HISTORY: 0.34,
    FREQUENTLY_BOUGHT_TOGETHER: 0.28,
    COLLABORATIVE: 0.22,
    CATEGORY_AFFINITY: 0.19,
    RECENTLY_VIEWED: 0.17,
    TRENDING: 0.13,
    POPULAR: 0.1,
  };

  const events: Prisma.RecommendationEventCreateManyInput[] = [];
  const slots: Prisma.RecommendationCreateManyInput[] = [];
  const slotKeys = new Set<string>();

  for (const customer of customers) {
    for (let i = 0; i < randInt(12, 30); i++) {
      const strategy = pick(strategies);
      const placement = pick(placements);
      const product = pick(products);
      const createdAt = new Date(Date.now() - randInt(0, 60) * DAY_MS - randInt(0, 23) * 3_600_000);

      events.push({ userId: customer.id, productId: product.id, strategy, placement, event: 'IMPRESSION', createdAt });

      if (chance(ctr[strategy])) {
        events.push({
          userId: customer.id,
          productId: product.id,
          strategy,
          placement,
          event: 'CLICK',
          createdAt: new Date(createdAt.getTime() + randInt(2, 90) * 1000),
        });

        if (chance(0.42)) {
          events.push({
            userId: customer.id,
            productId: product.id,
            strategy,
            placement,
            event: 'ADD_TO_CART',
            createdAt: new Date(createdAt.getTime() + randInt(90, 400) * 1000),
          });

          if (chance(0.55)) {
            events.push({
              userId: customer.id,
              productId: product.id,
              strategy,
              placement,
              event: 'PURCHASE',
              createdAt: new Date(createdAt.getTime() + randInt(400, 3600) * 1000),
            });
          }
        }
      }

      // Materialise a subset as live slots, respecting the composite unique key.
      const key = `${customer.id}|${product.id}|${strategy}|${placement}`;
      if (!slotKeys.has(key) && chance(0.4)) {
        slotKeys.add(key);
        slots.push({
          userId: customer.id,
          productId: product.id,
          strategy,
          placement,
          score: round2(0.35 + random() * 0.65),
          reason: REASONS[strategy],
          generatedAt: createdAt,
          expiresAt: new Date(Date.now() + 6 * 3_600_000),
        });
      }
    }
  }

  await prisma.recommendationEvent.createMany({ data: events });
  if (slots.length) await prisma.recommendation.createMany({ data: slots, skipDuplicates: true });

  console.log(`  ✓ ${events.length} recommendation events, ${slots.length} live slots`);
}

const REASONS: Record<string, string> = {
  PURCHASE_HISTORY: "You've ordered this before",
  CATEGORY_AFFINITY: 'Because you shop this category',
  FREQUENTLY_BOUGHT_TOGETHER: 'Often bought together',
  POPULAR: 'Bestseller',
  COLLABORATIVE: 'Customers like you also bought this',
  RECENTLY_VIEWED: 'Similar to something you viewed',
  TRENDING: 'Trending this fortnight',
};

// ----------------------------------------------------------- carts and inbox ---

async function seedCarts(customers: SeededCustomer[], products: SeededProduct[]) {
  let withItems = 0;

  for (const customer of customers) {
    const cart = await prisma.cart.create({ data: { userId: customer.id } });

    // Leave roughly a third of customers with an abandoned cart.
    if (!chance(0.33)) continue;

    const itemCount = randInt(1, 3);
    const used = new Set<string>();

    for (let i = 0; i < itemCount; i++) {
      const product = pick(products);
      const variant = pick(product.variants);
      if (used.has(variant.id)) continue;
      used.add(variant.id);

      await prisma.cartItem.create({ data: { cartId: cart.id, variantId: variant.id, quantity: randInt(1, 3) } });
    }
    withItems += 1;
  }

  console.log(`  ✓ ${customers.length} carts (${withItems} with items)`);
}

async function seedNotifications(customers: SeededCustomer[]) {
  const notifications: Prisma.NotificationCreateManyInput[] = [];

  for (const customer of customers.slice(0, 10)) {
    notifications.push({
      userId: customer.id,
      type: 'ORDER_STATUS',
      title: 'Your order was delivered',
      message: 'Thanks for shopping with Thuthi Dairy. Rate your products to help other customers.',
      link: '/account/orders',
      isRead: chance(0.5),
      createdAt: new Date(Date.now() - randInt(1, 14) * DAY_MS),
    });
  }

  notifications.push(
    {
      audience: 'ADMIN',
      type: 'LOW_STOCK',
      title: 'Low stock alert',
      message: 'Several SKUs have fallen below their reorder threshold.',
      link: '/admin/inventory?status=low',
      createdAt: new Date(Date.now() - 2 * 3_600_000),
    },
    {
      audience: 'ADMIN',
      type: 'SYSTEM',
      title: 'Database seeded',
      message: 'Demo dataset loaded with 12 months of order history.',
      link: '/admin',
      createdAt: new Date(),
    },
  );

  await prisma.notification.createMany({ data: notifications });
  console.log(`  ✓ ${notifications.length} notifications`);
}

// ------------------------------------------------------ analytics and totals ---

async function seedAnalyticsSnapshots() {
  const REVENUE = ['CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'] as OrderStatus[];
  let written = 0;

  for (let daysAgo = 0; daysAgo < 120; daysAgo++) {
    const from = new Date(Date.now() - daysAgo * DAY_MS);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setHours(23, 59, 59, 999);

    const [orders, units, newCustomers, cancelled] = await Promise.all([
      prisma.order.aggregate({
        where: { status: { in: REVENUE }, placedAt: { gte: from, lte: to } },
        _sum: { total: true },
        _count: true,
        _avg: { total: true },
      }),
      prisma.orderItem.aggregate({
        where: { order: { status: { in: REVENUE }, placedAt: { gte: from, lte: to } } },
        _sum: { quantity: true },
      }),
      prisma.user.count({ where: { role: { name: 'CUSTOMER' }, createdAt: { gte: from, lte: to } } }),
      prisma.order.count({ where: { status: { in: ['CANCELLED', 'RETURNED'] }, placedAt: { gte: from, lte: to } } }),
    ]);

    // Skip days with nothing at all -- fillSeries() renders the gap as zero.
    if (orders._count === 0 && newCustomers === 0) continue;

    const dateOnly = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
    const metrics: [string, number][] = [
      ['REVENUE', Number(orders._sum.total?.toString() ?? 0)],
      ['ORDERS', orders._count],
      ['UNITS_SOLD', units._sum.quantity ?? 0],
      ['NEW_CUSTOMERS', newCustomers],
      ['AVERAGE_ORDER_VALUE', round2(Number(orders._avg.total?.toString() ?? 0))],
      ['CANCELLED_ORDERS', cancelled],
    ];

    await prisma.analyticsSnapshot.createMany({
      data: metrics.map(([metric, value]) => ({
        date: dateOnly,
        metric: metric as never,
        dimension: '',
        value: new Prisma.Decimal(value),
      })),
      skipDuplicates: true,
    });
    written += metrics.length;
  }

  console.log(`  ✓ ${written} analytics snapshot rows`);
}

/** Brings all denormalised counters in line with the generated history. */
async function recomputeAggregates() {
  const REVENUE = ['CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'] as OrderStatus[];

  // --- product sold counts and rating aggregates ---
  const sold = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: { order: { status: { in: REVENUE } } },
    _sum: { quantity: true },
  });

  for (const row of sold) {
    await prisma.product.update({
      where: { id: row.productId },
      data: { soldCount: row._sum.quantity ?? 0 },
    });
  }

  const products = await prisma.product.findMany({ select: { id: true } });
  for (const product of products) {
    const [ratings, reviews] = await Promise.all([
      prisma.rating.aggregate({ where: { productId: product.id }, _avg: { value: true }, _count: true }),
      prisma.review.count({ where: { productId: product.id, status: 'APPROVED' } }),
    ]);
    await prisma.product.update({
      where: { id: product.id },
      data: {
        avgRating: Number((ratings._avg.value ?? 0).toFixed(2)),
        ratingCount: ratings._count,
        reviewCount: reviews,
      },
    });
  }

  // --- customer counters and segments ---
  const customerStats = await prisma.order.groupBy({
    by: ['userId'],
    where: { status: { in: REVENUE } },
    _count: true,
    _sum: { total: true },
  });

  const statsMap = new Map(customerStats.map((s) => [s.userId, s]));
  const customers = await prisma.user.findMany({
    where: { role: { name: 'CUSTOMER' } },
    select: {
      id: true,
      orders: { where: { status: { in: REVENUE } }, orderBy: { placedAt: 'desc' }, take: 1, select: { placedAt: true } },
    },
  });

  for (const customer of customers) {
    const stats = statsMap.get(customer.id);
    const orderCount = stats?._count ?? 0;
    const lastOrder = customer.orders[0]?.placedAt;
    const daysSince = lastOrder ? (Date.now() - lastOrder.getTime()) / DAY_MS : null;

    const segment =
      orderCount === 0 || daysSince === null
        ? 'NEW'
        : orderCount >= 5 && daysSince <= 60
          ? 'LOYAL'
          : daysSince <= 45
            ? 'ACTIVE'
            : daysSince <= 120
              ? 'AT_RISK'
              : 'CHURNED';

    await prisma.user.update({
      where: { id: customer.id },
      data: {
        totalOrders: orderCount,
        totalSpent: stats?._sum.total ?? new Prisma.Decimal(0),
        segment,
      },
    });
  }

  console.log('  ✓ Aggregates and customer segments recomputed');
}

async function summary() {
  const [products, variants, orders, revenue, customers, reviews, events, affinities] = await Promise.all([
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.order.count(),
    prisma.order.aggregate({
      where: { status: { in: ['CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'] } },
      _sum: { total: true },
    }),
    prisma.user.count({ where: { role: { name: 'CUSTOMER' } } }),
    prisma.review.count(),
    prisma.recommendationEvent.count(),
    prisma.productAffinity.count(),
  ]);

  const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

  console.log(`
╭──────────────────────────────────────────────────────────────╮
│  Seed complete                                               │
├──────────────────────────────────────────────────────────────┤
│  Products / variants     ${String(`${products} / ${variants}`).padEnd(36)}│
│  Customers               ${String(customers).padEnd(36)}│
│  Orders                  ${String(orders).padEnd(36)}│
│  Realised revenue        ${inr.format(Number(revenue._sum.total?.toString() ?? 0)).padEnd(36)}│
│  Reviews                 ${String(reviews).padEnd(36)}│
│  Recommendation events   ${String(events).padEnd(36)}│
│  Affinity pairs          ${String(affinities).padEnd(36)}│
├──────────────────────────────────────────────────────────────┤
│  Admin     admin@thuthidairy.com / Admin@123                 │
│  Customer  priya@example.com     / Customer@123              │
╰──────────────────────────────────────────────────────────────╯
`);
}

main()
  .catch((err) => {
    console.error('\n❌  Seed failed:\n', err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
