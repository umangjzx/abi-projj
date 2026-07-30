import { z } from 'zod';
import { safeText } from '../../middleware/validate';

export const createCategorySchema = z.object({
  name: safeText(60, 2),
  description: safeText(500).optional().or(z.literal('')),
  imageUrl: z.string().url().optional().or(z.literal('')),
  parentId: z.string().optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).optional().default(0),
  isActive: z.coerce.boolean().optional().default(true),
});

export const updateCategorySchema = createCategorySchema.partial();

export const listCategoryQuery = z.object({
  includeInactive: z.coerce.boolean().optional().default(false),
  tree: z.coerce.boolean().optional().default(false),
  withCounts: z.coerce.boolean().optional().default(true),
});
