import { z } from 'zod';
import { safeText } from '../../middleware/validate';

export const productSortValues = [
  'relevance',
  'newest',
  'price-asc',
  'price-desc',
  'rating',
  'popular',
  'name-asc',
] as const;

/** Storefront search + filter contract, shared with the client via docs/API.md. */
export const listProductQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(60).optional().default(12),
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().optional(),
  categories: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined)),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  inStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  featured: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  tags: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined)),
  sort: z.enum(productSortValues).optional().default('relevance'),
  includeInactive: z.coerce.boolean().optional().default(false),
});

export type ListProductQuery = z.infer<typeof listProductQuery>;

const variantInput = z.object({
  id: z.string().optional(),
  name: safeText(60, 1),
  price: z.coerce.number().positive('Price must be greater than zero'),
  mrp: z.coerce.number().positive('MRP must be greater than zero'),
  unit: z.string().trim().max(20).optional().default('pc'),
  packSize: z.string().trim().max(40).optional(),
  weightGram: z.coerce.number().int().min(0).optional(),
  isDefault: z.coerce.boolean().optional().default(false),
  isActive: z.coerce.boolean().optional().default(true),
  stock: z.coerce.number().int().min(0).optional().default(0),
  lowStockThreshold: z.coerce.number().int().min(0).optional().default(15),
});

const imageInput = z.object({
  url: z.string().url(),
  publicId: z.string().optional(),
  alt: z.string().max(160).optional(),
  isPrimary: z.coerce.boolean().optional().default(false),
  sortOrder: z.coerce.number().int().min(0).optional().default(0),
});

export const createProductSchema = z
  .object({
    name: safeText(120, 2),
    shortDescription: safeText(200).optional().or(z.literal('')),
    description: safeText(4000, 10),
    categoryId: z.string().min(1, 'Category is required'),
    brand: safeText(60).optional().default('Butterman'),
    attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().default({}),
    tags: z.array(z.string().trim().max(30)).max(15).optional().default([]),
    isActive: z.coerce.boolean().optional().default(true),
    isFeatured: z.coerce.boolean().optional().default(false),
    images: z.array(imageInput).max(8).optional().default([]),
    variants: z.array(variantInput).min(1, 'At least one variant (pack size) is required'),
  })
  .superRefine((data, ctx) => {
    // A price above MRP would render a negative discount badge on the storefront.
    data.variants.forEach((v, i) => {
      if (v.price > v.mrp) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants', i, 'price'],
          message: 'Selling price cannot exceed MRP',
        });
      }
    });
    const names = data.variants.map((v) => v.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['variants'], message: 'Variant names must be unique' });
    }
  });

export const updateProductSchema = z.object({
  name: safeText(120, 2).optional(),
  shortDescription: safeText(200).optional().or(z.literal('')),
  description: safeText(4000, 10).optional(),
  categoryId: z.string().min(1).optional(),
  brand: safeText(60).optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  tags: z.array(z.string().trim().max(30)).max(15).optional(),
  isActive: z.coerce.boolean().optional(),
  isFeatured: z.coerce.boolean().optional(),
  images: z.array(imageInput).max(8).optional(),
  variants: z.array(variantInput).min(1).optional(),
});

export const relatedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional().default(8),
});
