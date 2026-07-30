import { Prisma } from '@prisma/client';
import { toNumber } from '../../lib/money';

/**
 * Prisma returns `Decimal` objects, which JSON.stringify renders as strings.
 * Every product payload passes through here so the client always receives
 * plain numbers and a pre-computed price range / stock summary instead of
 * having to derive them from variants.
 */
export function serializeVariant(variant: any) {
  const stock = variant.inventory ? variant.inventory.stock - variant.inventory.reserved : 0;
  const threshold = variant.inventory?.lowStockThreshold ?? 0;
  return {
    id: variant.id,
    name: variant.name,
    sku: variant.sku,
    price: toNumber(variant.price),
    mrp: toNumber(variant.mrp),
    discountPercent:
      toNumber(variant.mrp) > 0
        ? Math.round(((toNumber(variant.mrp) - toNumber(variant.price)) / toNumber(variant.mrp)) * 100)
        : 0,
    unit: variant.unit,
    packSize: variant.packSize,
    weightGram: variant.weightGram,
    isDefault: variant.isDefault,
    isActive: variant.isActive,
    stock: Math.max(0, stock),
    inStock: stock > 0,
    isLowStock: stock > 0 && stock <= threshold,
    lowStockThreshold: threshold,
  };
}

export function serializeProduct(product: any) {
  const variants = (product.variants ?? []).map(serializeVariant);
  const active = variants.filter((v: any) => v.isActive);
  const prices = active.map((v: any) => v.price);
  const totalStock = active.reduce((sum: number, v: any) => sum + v.stock, 0);
  const defaultVariant = active.find((v: any) => v.isDefault) ?? active[0] ?? null;
  const images = (product.images ?? []).map((img: any) => ({
    id: img.id,
    url: img.url,
    alt: img.alt ?? product.name,
    isPrimary: img.isPrimary,
    sortOrder: img.sortOrder,
  }));

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    shortDescription: product.shortDescription,
    description: product.description,
    brand: product.brand,
    attributes: product.attributes ?? {},
    tags: product.tags ?? [],
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    avgRating: Number(product.avgRating?.toFixed?.(2) ?? product.avgRating ?? 0),
    ratingCount: product.ratingCount ?? 0,
    reviewCount: product.reviewCount ?? 0,
    soldCount: product.soldCount ?? 0,
    viewCount: product.viewCount ?? 0,
    createdAt: product.createdAt,
    category: product.category
      ? { id: product.category.id, name: product.category.name, slug: product.category.slug }
      : null,
    images,
    primaryImage: images.find((i: any) => i.isPrimary)?.url ?? images[0]?.url ?? null,
    variants,
    defaultVariant,
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    totalStock,
    inStock: totalStock > 0,
  };
}

/**
 * Canonical include for any query whose result is passed to
 * `serializeProduct`. Not `as const`: Prisma's generated `orderBy` types are
 * mutable arrays, so a readonly literal would not be assignable.
 */
export const productInclude: Prisma.ProductInclude = {
  category: { select: { id: true, name: true, slug: true } },
  images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
  variants: {
    orderBy: [{ isDefault: 'desc' }, { price: 'asc' }],
    include: { inventory: true },
  },
};
