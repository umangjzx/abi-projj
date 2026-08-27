import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/ApiError';
import { slugify, buildSku } from '../../lib/slug';
import { toDecimal } from '../../lib/money';
import { env } from '../../config/env';
import { productInclude, serializeProduct } from './catalog.serializer';
import type { ListProductQuery } from './product.schema';
import { pageMeta, type PageParams } from '../../lib/http';
import { deleteImage } from '../../lib/storage';
import { buildTfidfIndex, searchTfidf, fuzzyMatch, tokenize, type TfidfDocument } from '../../lib/tfidf';

/** Maps the public `sort` value onto a Prisma orderBy clause. */
function buildOrderBy(sort: ListProductQuery['sort'], hasQuery: boolean): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'newest':
      return [{ createdAt: 'desc' }];
    case 'rating':
      return [{ avgRating: 'desc' }, { ratingCount: 'desc' }];
    case 'popular':
      return [{ soldCount: 'desc' }, { viewCount: 'desc' }];
    case 'name-asc':
      return [{ name: 'asc' }];
    // Price lives on the variant, so price sorts are applied after fetch --
    // see `sortByPrice`.
    case 'price-asc':
    case 'price-desc':
      return [{ name: 'asc' }];
    case 'relevance':
    default:
      return hasQuery
        ? [{ soldCount: 'desc' }, { avgRating: 'desc' }]
        : [{ isFeatured: 'desc' }, { soldCount: 'desc' }, { createdAt: 'desc' }];
  }
}

export const productService = {
  async list(query: ListProductQuery, page: PageParams) {
    const priceSort = query.sort === 'price-asc' || query.sort === 'price-desc';

    // A free-text query is ranked with TF-IDF rather than a database
    // `ILIKE` scan: the whole (non-text) filtered candidate set is fetched,
    // scored against the query in memory, and only then paginated. At a few
    // hundred SKUs this is cheap and gives real relevance ranking -- e.g. a
    // product whose name AND description both say "fresh milk" outranks one
    // that only mentions "milk" once deep in an ingredients list, which a
    // substring match cannot express.
    if (query.q && query.q.trim()) {
      const where = await buildProductWhere(query, { skipTextFilter: true });
      const candidates = await prisma.product.findMany({ where, include: productInclude });

      const documents: TfidfDocument[] = candidates.map((product) => ({
        id: product.id,
        // Repeating a field's tokens is a cheap way to weight it: the name
        // matters far more to relevance than one line buried in the
        // description, without needing a separate weighted-sum step.
        tokens: [
          ...tokenize(product.name),
          ...tokenize(product.name),
          ...tokenize(product.name),
          ...tokenize(product.brand),
          ...tokenize(product.shortDescription ?? ''),
          ...tokenize(product.description),
          ...product.tags.flatMap((t) => tokenize(t)),
          ...tokenize(product.category.name),
        ],
      }));

      const index = buildTfidfIndex(documents);
      // BM25 first; if nothing matches lexically (usually a typo), fall back to
      // trigram fuzzy matching so "chesse" still finds "cheese" instead of
      // returning an empty page.
      let ranked = searchTfidf(query.q, index);
      if (ranked.length === 0) ranked = fuzzyMatch(query.q, index);
      const scoreById = new Map(ranked.map((r) => [r.id, r.score]));

      const matched = candidates
        .filter((product) => scoreById.has(product.id))
        .map((product) => ({ product, score: scoreById.get(product.id)! }));

      // 'relevance' (the default when searching) sorts by TF-IDF score;
      // any other explicit sort re-orders the already-relevant subset by
      // that criterion instead, matching how real storefront search behaves.
      if (query.sort === 'relevance' || !query.sort) {
        matched.sort((a, b) => b.score - a.score || b.product.soldCount - a.product.soldCount);
      } else if (priceSort) {
        const serialized = matched.map((m) => serializeProduct(m.product));
        serialized.sort((a, b) => (query.sort === 'price-asc' ? a.minPrice - b.minPrice : b.minPrice - a.minPrice));
        return { items: serialized.slice(page.skip, page.skip + page.take), meta: pageMeta(serialized.length, page) };
      } else {
        const collator = (a: (typeof matched)[number], b: (typeof matched)[number]) => {
          switch (query.sort) {
            case 'newest':
              return b.product.createdAt.getTime() - a.product.createdAt.getTime();
            case 'rating':
              return b.product.avgRating - a.product.avgRating || b.product.ratingCount - a.product.ratingCount;
            case 'popular':
              return b.product.soldCount - a.product.soldCount || b.product.viewCount - a.product.viewCount;
            case 'name-asc':
              return a.product.name.localeCompare(b.product.name);
            default:
              return 0;
          }
        };
        matched.sort(collator);
      }

      const items = matched.slice(page.skip, page.skip + page.take).map((m) => serializeProduct(m.product));
      return { items, meta: pageMeta(matched.length, page) };
    }

    const where = await buildProductWhere(query, { skipTextFilter: false });

    // Price ordering cannot be expressed as a Prisma orderBy across the
    // variant relation, so for those two sorts we page in memory over the
    // filtered set. The catalogue is small (hundreds of SKUs) so this is
    // cheaper than a raw query, and the filter still runs in the database.
    if (priceSort) {
      const all = await prisma.product.findMany({ where, include: productInclude });
      const serialized = all.map(serializeProduct);
      serialized.sort((a, b) =>
        query.sort === 'price-asc' ? a.minPrice - b.minPrice : b.minPrice - a.minPrice,
      );
      const items = serialized.slice(page.skip, page.skip + page.take);
      return { items, meta: pageMeta(serialized.length, page) };
    }

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: buildOrderBy(query.sort, false),
        skip: page.skip,
        take: page.take,
      }),
      prisma.product.count({ where }),
    ]);

    return { items: rows.map(serializeProduct), meta: pageMeta(total, page) };
  },

  async getBySlugOrId(identifier: string, opts: { includeInactive?: boolean } = {}) {
    const product = await prisma.product.findFirst({
      where: {
        OR: [{ slug: identifier }, { id: identifier }],
        ...(opts.includeInactive ? {} : { isActive: true }),
      },
      include: productInclude,
    });
    if (!product) throw ApiError.notFound('Product not found');
    return serializeProduct(product);
  },

  /**
   * Increments the view counter and records the product in the customer's
   * "recently viewed" list. Deliberately fire-and-forget from the controller's
   * point of view: a telemetry failure must not break product pages.
   */
  async trackView(productId: string, userId?: string) {
    await prisma.product.update({ where: { id: productId }, data: { viewCount: { increment: 1 } } });
    if (!userId) return;
    await prisma.recentlyViewed.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: { viewedAt: new Date(), viewCount: { increment: 1 } },
    });
  },

  /** Same-category products, ranked by popularity, excluding the current one. */
  async related(productId: string, limit: number) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { categoryId: true, tags: true },
    });
    if (!product) throw ApiError.notFound('Product not found');

    const rows = await prisma.product.findMany({
      where: {
        id: { not: productId },
        isActive: true,
        OR: [{ categoryId: product.categoryId }, ...(product.tags.length ? [{ tags: { hasSome: product.tags } }] : [])],
      },
      include: productInclude,
      orderBy: [{ soldCount: 'desc' }, { avgRating: 'desc' }],
      take: limit,
    });
    return rows.map(serializeProduct);
  },

  /** Lightweight typeahead: names, categories and tags in one payload. */
  async suggest(term: string, limit = 8) {
    if (term.trim().length < 2) return { products: [], categories: [] };

    const [products, categories] = await Promise.all([
      prisma.product.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { tags: { has: term.toLowerCase() } },
            { brand: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          slug: true,
          images: { where: { isPrimary: true }, take: 1, select: { url: true } },
          category: { select: { name: true } },
          variants: { where: { isActive: true }, orderBy: { price: 'asc' }, take: 1, select: { price: true } },
        },
        orderBy: [{ soldCount: 'desc' }],
        take: limit,
      }),
      prisma.category.findMany({
        where: { isActive: true, name: { contains: term, mode: 'insensitive' } },
        select: { id: true, name: true, slug: true },
        take: 4,
      }),
    ]);

    return {
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        image: p.images[0]?.url ?? null,
        category: p.category.name,
        price: p.variants[0] ? Number(p.variants[0].price.toString()) : 0,
      })),
      categories,
    };
  },

  async priceBounds() {
    const agg = await prisma.productVariant.aggregate({
      where: { isActive: true, product: { isActive: true } },
      _min: { price: true },
      _max: { price: true },
    });
    return {
      min: Math.floor(Number(agg._min.price?.toString() ?? 0)),
      max: Math.ceil(Number(agg._max.price?.toString() ?? 1000)),
    };
  },

  // ------------------------------------------------------------- admin CRUD ---

  async create(input: Record<string, any>) {
    await assertCategory(input.categoryId);
    const slug = await uniqueProductSlug(input.name);
    const sku = await uniqueSku(buildSku(input.name, input.brand));

    // A product, its images, variants and inventory rows are created in one
    // transaction so a partial catalogue entry can never be persisted.
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: input.name,
          slug,
          sku,
          shortDescription: input.shortDescription || null,
          description: input.description,
          categoryId: input.categoryId,
          brand: input.brand ?? 'Butterman',
          attributes: input.attributes ?? {},
          tags: (input.tags ?? []).map((t: string) => t.toLowerCase()),
          isActive: input.isActive ?? true,
          isFeatured: input.isFeatured ?? false,
        },
      });

      await writeImages(tx, created.id, input.images ?? []);
      await writeVariants(tx, created.id, created.name, input.variants ?? []);
      return created;
    });

    return this.getBySlugOrId(product.id, { includeInactive: true });
  },

  async update(id: string, input: Record<string, any>) {
    const existing = await prisma.product.findUnique({
      where: { id },
      include: { images: true, variants: { include: { inventory: true } } },
    });
    if (!existing) throw ApiError.notFound('Product not found');
    if (input.categoryId) await assertCategory(input.categoryId);

    await prisma.$transaction(async (tx) => {
      const data: Prisma.ProductUpdateInput = {};
      if (input.name !== undefined) {
        data.name = input.name;
        data.slug = await uniqueProductSlug(input.name, id);
      }
      if (input.shortDescription !== undefined) data.shortDescription = input.shortDescription || null;
      if (input.description !== undefined) data.description = input.description;
      if (input.categoryId !== undefined) data.category = { connect: { id: input.categoryId } };
      if (input.brand !== undefined) data.brand = input.brand;
      if (input.attributes !== undefined) data.attributes = input.attributes;
      if (input.tags !== undefined) data.tags = input.tags.map((t: string) => t.toLowerCase());
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.isFeatured !== undefined) data.isFeatured = input.isFeatured;

      await tx.product.update({ where: { id }, data });

      if (input.images) {
        const keptUrls = new Set(input.images.map((i: any) => i.url));
        const removed = existing.images.filter((img) => !keptUrls.has(img.url));
        await tx.productImage.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
        // Remove the blobs too, but only after the DB rows are gone.
        for (const img of removed) void deleteImage(img.publicId);
        await tx.productImage.deleteMany({ where: { productId: id, url: { in: [...keptUrls] as string[] } } });
        await writeImages(tx, id, input.images);
      }

      if (input.variants) {
        const incomingIds = new Set(input.variants.filter((v: any) => v.id).map((v: any) => v.id));
        const orphans = existing.variants.filter((v) => !incomingIds.has(v.id));

        for (const orphan of orphans) {
          // A variant that appears on a historical order cannot be deleted
          // without breaking that order; deactivate it instead.
          const sold = await tx.orderItem.count({ where: { variantId: orphan.id } });
          if (sold > 0) {
            await tx.productVariant.update({ where: { id: orphan.id }, data: { isActive: false } });
          } else {
            await tx.productVariant.delete({ where: { id: orphan.id } });
          }
        }

        await writeVariants(tx, id, input.name ?? existing.name, input.variants);
      }
    });

    return this.getBySlugOrId(id, { includeInactive: true });
  },

  async remove(id: string) {
    const soldCount = await prisma.orderItem.count({ where: { productId: id } });
    if (soldCount > 0) {
      // Preserve referential integrity for revenue reports: soft delete.
      await prisma.product.update({ where: { id }, data: { isActive: false, isFeatured: false } });
      return { softDeleted: true, message: 'Product has order history, so it was deactivated instead of deleted.' };
    }

    const images = await prisma.productImage.findMany({ where: { productId: id }, select: { publicId: true } });
    await prisma.product.delete({ where: { id } });
    for (const img of images) void deleteImage(img.publicId);
    return { softDeleted: false, message: 'Product deleted.' };
  },

  async toggleFeatured(id: string, isFeatured: boolean) {
    await prisma.product.update({ where: { id }, data: { isFeatured } });
    return this.getBySlugOrId(id, { includeInactive: true });
  },

  /**
   * Recomputes the denormalised rating aggregates from the ratings table.
   * Called whenever a rating or review is written or removed.
   */
  async refreshRatingAggregates(productId: string) {
    const [ratingAgg, reviewCount] = await Promise.all([
      prisma.rating.aggregate({ where: { productId }, _avg: { value: true }, _count: true }),
      prisma.review.count({ where: { productId, status: 'APPROVED' } }),
    ]);

    await prisma.product.update({
      where: { id: productId },
      data: {
        avgRating: Number((ratingAgg._avg.value ?? 0).toFixed(2)),
        ratingCount: ratingAgg._count,
        reviewCount,
      },
    });
  },
};

// ------------------------------------------------------------------ helpers ---

async function buildProductWhere(
  query: ListProductQuery,
  opts: { skipTextFilter: boolean } = { skipTextFilter: false },
): Promise<Prisma.ProductWhereInput> {
  const and: Prisma.ProductWhereInput[] = [];

  if (!query.includeInactive) and.push({ isActive: true });
  if (query.featured !== undefined) and.push({ isFeatured: query.featured });

  // When ranking with TF-IDF (see productService.list), the text match is
  // done in memory against the full non-text-filtered candidate set instead
  // -- a DB substring filter here would just be redundant, and would also
  // wrongly exclude products TF-IDF considers relevant via a SKU/tag match.
  if (query.q && !opts.skipTextFilter) {
    and.push({
      OR: [
        { name: { contains: query.q, mode: 'insensitive' } },
        { shortDescription: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
        { brand: { contains: query.q, mode: 'insensitive' } },
        { sku: { contains: query.q, mode: 'insensitive' } },
        { tags: { has: query.q.toLowerCase() } },
        { category: { name: { contains: query.q, mode: 'insensitive' } } },
      ],
    });
  }

  // `category` accepts a slug or an id and includes that category's children.
  const categoryKeys = query.categories ?? (query.category ? [query.category] : []);
  if (categoryKeys.length) {
    const matched = await prisma.category.findMany({
      where: { OR: [{ slug: { in: categoryKeys } }, { id: { in: categoryKeys } }] },
      select: { id: true },
    });
    const ids = matched.map((m) => m.id);
    const children = ids.length
      ? await prisma.category.findMany({ where: { parentId: { in: ids } }, select: { id: true } })
      : [];
    and.push({ categoryId: { in: [...ids, ...children.map((c) => c.id)] } });
  }

  if (query.tags?.length) and.push({ tags: { hasSome: query.tags.map((t) => t.toLowerCase()) } });
  if (query.minRating !== undefined) and.push({ avgRating: { gte: query.minRating } });

  // Price and stock filters are expressed against the variant relation so a
  // product qualifies when *any* of its variants matches.
  const variantWhere: Prisma.ProductVariantWhereInput = { isActive: true };
  let hasVariantFilter = false;

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    variantWhere.price = {
      ...(query.minPrice !== undefined ? { gte: toDecimal(query.minPrice) } : {}),
      ...(query.maxPrice !== undefined ? { lte: toDecimal(query.maxPrice) } : {}),
    };
    hasVariantFilter = true;
  }

  if (query.inStock !== undefined) {
    variantWhere.inventory = query.inStock ? { stock: { gt: 0 } } : { stock: { lte: 0 } };
    hasVariantFilter = true;
  }

  if (hasVariantFilter) and.push({ variants: { some: variantWhere } });

  return and.length ? { AND: and } : {};
}

async function assertCategory(categoryId: string) {
  const exists = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!exists) throw ApiError.badRequest('The selected category does not exist');
}

async function uniqueProductSlug(name: string, excludeId?: string) {
  const base = slugify(name);
  let slug = base;
  let n = 1;
  for (;;) {
    const clash = await prisma.product.findFirst({
      where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    });
    if (!clash) return slug;
    slug = `${base}-${++n}`;
  }
}

async function uniqueSku(base: string) {
  let sku = base || 'TD-PROD';
  let n = 1;
  for (;;) {
    const clash = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
    if (!clash) return sku;
    sku = `${base}-${++n}`;
  }
}

async function writeImages(tx: Prisma.TransactionClient, productId: string, images: any[]) {
  if (!images.length) return;
  // Exactly one primary image, defaulting to the first if none was flagged.
  const hasPrimary = images.some((i) => i.isPrimary);
  await tx.productImage.createMany({
    data: images.map((img, index) => ({
      productId,
      url: img.url,
      publicId: img.publicId ?? null,
      alt: img.alt ?? null,
      sortOrder: img.sortOrder ?? index,
      isPrimary: hasPrimary ? Boolean(img.isPrimary) : index === 0,
    })),
  });
}

async function writeVariants(
  tx: Prisma.TransactionClient,
  productId: string,
  productName: string,
  variants: any[],
) {
  const hasDefault = variants.some((v) => v.isDefault);

  for (const [index, variant] of variants.entries()) {
    const isDefault = hasDefault ? Boolean(variant.isDefault) : index === 0;

    const payload = {
      name: variant.name,
      price: toDecimal(variant.price),
      mrp: toDecimal(variant.mrp),
      unit: variant.unit ?? 'pc',
      packSize: variant.packSize ?? null,
      weightGram: variant.weightGram ?? null,
      isDefault,
      isActive: variant.isActive ?? true,
    };

    if (variant.id) {
      await tx.productVariant.update({ where: { id: variant.id }, data: payload });
      await tx.inventory.upsert({
        where: { variantId: variant.id },
        create: {
          variantId: variant.id,
          stock: variant.stock ?? 0,
          lowStockThreshold: variant.lowStockThreshold ?? env.LOW_STOCK_THRESHOLD,
        },
        // Stock itself is only changed through the inventory module so an
        // accidental product edit cannot silently rewrite stock levels.
        update: { lowStockThreshold: variant.lowStockThreshold ?? env.LOW_STOCK_THRESHOLD },
      });
      continue;
    }

    const sku = await (async () => {
      let candidate = buildSku(productName, variant.name);
      let n = 1;
      for (;;) {
        const clash = await tx.productVariant.findUnique({ where: { sku: candidate }, select: { id: true } });
        if (!clash) return candidate;
        candidate = `${buildSku(productName, variant.name)}-${++n}`;
      }
    })();

    const createdVariant = await tx.productVariant.create({
      data: { ...payload, productId, sku },
    });

    await tx.inventory.create({
      data: {
        variantId: createdVariant.id,
        stock: variant.stock ?? 0,
        lowStockThreshold: variant.lowStockThreshold ?? env.LOW_STOCK_THRESHOLD,
        restockedAt: (variant.stock ?? 0) > 0 ? new Date() : null,
      },
    });

    if ((variant.stock ?? 0) > 0) {
      await tx.inventoryMovement.create({
        data: {
          variantId: createdVariant.id,
          type: 'PURCHASE',
          quantity: variant.stock,
          balance: variant.stock,
          reason: 'Initial stock',
        },
      });
    }
  }
}
