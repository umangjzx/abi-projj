import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/ApiError';
import { slugify } from '../../lib/slug';

export const categoryService = {
  async list(opts: { includeInactive?: boolean; tree?: boolean; withCounts?: boolean }) {
    const where = opts.includeInactive ? {} : { isActive: true };

    const categories = await prisma.category.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: opts.withCounts
        ? { _count: { select: { products: { where: { isActive: true } } } } }
        : undefined,
    });

    const mapped = categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      imageUrl: c.imageUrl,
      parentId: c.parentId,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      productCount: (c as { _count?: { products: number } })._count?.products ?? 0,
      children: [] as unknown[],
    }));

    if (!opts.tree) return mapped;

    // Build the parent/child hierarchy in one pass rather than N queries.
    const byId = new Map(mapped.map((c) => [c.id, c]));
    const roots: typeof mapped = [];
    for (const category of mapped) {
      if (category.parentId && byId.has(category.parentId)) {
        byId.get(category.parentId)!.children.push(category);
      } else {
        roots.push(category);
      }
    }
    return roots;
  },

  async getBySlugOrId(identifier: string) {
    const category = await prisma.category.findFirst({
      where: { OR: [{ slug: identifier }, { id: identifier }] },
      include: {
        children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        _count: { select: { products: { where: { isActive: true } } } },
      },
    });
    if (!category) throw ApiError.notFound('Category not found');
    return { ...category, productCount: category._count.products };
  },

  async create(input: Record<string, any>) {
    const slug = await this.uniqueSlug(input.name);
    if (input.parentId) await this.assertExists(input.parentId);

    return prisma.category.create({
      data: {
        name: input.name,
        slug,
        description: input.description || null,
        imageUrl: input.imageUrl || null,
        parentId: input.parentId || null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      },
    });
  },

  async update(id: string, input: Record<string, any>) {
    await this.assertExists(id);

    if (input.parentId) {
      if (input.parentId === id) throw ApiError.badRequest('A category cannot be its own parent');
      await this.assertExists(input.parentId);
      // Prevent A -> B -> A cycles, which would make the tree builder loop.
      if (await this.isDescendant(input.parentId, id)) {
        throw ApiError.badRequest('That parent would create a circular category hierarchy');
      }
    }

    const data: Record<string, unknown> = { ...input };
    if (input.name) data.slug = await this.uniqueSlug(input.name, id);
    if (input.description !== undefined) data.description = input.description || null;
    if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl || null;
    if (input.parentId !== undefined) data.parentId = input.parentId || null;

    return prisma.category.update({ where: { id }, data });
  },

  async remove(id: string) {
    const [productCount, childCount] = await Promise.all([
      prisma.product.count({ where: { categoryId: id } }),
      prisma.category.count({ where: { parentId: id } }),
    ]);

    // Refuse rather than cascade -- deleting a category with live products
    // would orphan order history reporting.
    if (productCount > 0) {
      throw ApiError.conflict(
        `This category still has ${productCount} product(s). Move or delete them first, or deactivate the category instead.`,
      );
    }
    if (childCount > 0) throw ApiError.conflict(`This category has ${childCount} sub-category(ies). Remove them first.`);

    await prisma.category.delete({ where: { id } });
  },

  async assertExists(id: string) {
    const exists = await prisma.category.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw ApiError.notFound('Category not found');
  },

  /** Walks up from `candidateId` looking for `ancestorId`. */
  async isDescendant(candidateId: string, ancestorId: string): Promise<boolean> {
    let cursor: string | null = candidateId;
    let guard = 0;
    while (cursor && guard++ < 20) {
      const node: { parentId: string | null } | null = await prisma.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      if (!node?.parentId) return false;
      if (node.parentId === ancestorId) return true;
      cursor = node.parentId;
    }
    return false;
  },

  async uniqueSlug(name: string, excludeId?: string) {
    const base = slugify(name);
    let slug = base;
    let n = 1;
    // Loop until the slug is free, skipping the record being updated.
    for (;;) {
      const clash = await prisma.category.findFirst({
        where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
        select: { id: true },
      });
      if (!clash) return slug;
      slug = `${base}-${++n}`;
    }
  },
};
