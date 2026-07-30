import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ProductImage } from '@/components/product/ProductImage';
import { Skeleton } from '@/components/ui/feedback';
import type { Category } from '@/types';

export function CategoryStrip({ categories }: { categories?: Category[] }) {
  if (!categories) {
    return (
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="w-28 shrink-0 space-y-2 sm:w-32">
            <Skeleton className="aspect-square rounded-2xl" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="no-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
      {categories.map((category, index) => (
        <motion.div
          key={category.id}
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: Math.min(index * 0.05, 0.3) }}
          className="w-28 shrink-0 sm:w-32"
        >
          <Link to={`/products?category=${category.slug}`} className="group block">
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted shadow-soft">
              <ProductImage
                src={category.imageUrl}
                alt={category.name}
                className="size-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            </div>
            <p className="mt-2 truncate text-center text-sm font-semibold">{category.name}</p>
            <p className="text-center text-[11px] text-muted-foreground">{category.productCount} items</p>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
