import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ProductCardSkeleton } from '@/components/ui/feedback';
import { ProductCard } from './ProductCard';
import type { Product } from '@/types';

export interface ProductRailProps {
  title: string;
  description?: string;
  products: Product[] | undefined;
  isLoading?: boolean;
  viewAllHref?: string;
  icon?: React.ReactNode;
  /** Horizontal scroller (default) or a responsive grid. */
  layout?: 'rail' | 'grid';
  /** Whether cards show the "why we picked this" chip. Defaults to true. */
  showReason?: boolean;
  className?: string;
}

/**
 * A titled row of products. Horizontal scrolling on mobile with snap points is
 * what keeps a 12-product row usable on a phone; arrow buttons appear only when
 * there is actually something to scroll to.
 */
export function ProductRail({
  title,
  description,
  products,
  isLoading,
  viewAllHref,
  icon,
  layout = 'rail',
  showReason = true,
  className,
}: ProductRailProps) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const syncArrows = React.useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    setCanScrollLeft(node.scrollLeft > 8);
    // 8px slack absorbs sub-pixel rounding at the end of the track.
    setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 8);
  }, []);

  React.useEffect(() => {
    syncArrows();
    const node = scroller.current;
    if (!node) return;

    node.addEventListener('scroll', syncArrows, { passive: true });
    window.addEventListener('resize', syncArrows);
    return () => {
      node.removeEventListener('scroll', syncArrows);
      window.removeEventListener('resize', syncArrows);
    };
  }, [syncArrows, products]);

  const scrollBy = (direction: -1 | 1) => {
    const node = scroller.current;
    if (!node) return;
    node.scrollBy({ left: direction * Math.max(280, node.clientWidth * 0.8), behavior: 'smooth' });
  };

  // Nothing to show and nothing loading -- render nothing rather than an empty heading.
  if (!isLoading && (!products || products.length === 0)) return null;

  return (
    <section className={cn('space-y-4', className)} aria-labelledby={`rail-${slug(title)}`}>
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2
            id={`rail-${slug(title)}`}
            className="flex items-center gap-2 font-display text-xl font-bold tracking-tight sm:text-2xl"
          >
            {icon && <span className="text-primary [&_svg]:size-5">{icon}</span>}
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {layout === 'rail' && (canScrollLeft || canScrollRight) && (
            <div className="hidden items-center gap-1.5 sm:flex">
              <Button variant="outline" size="icon-sm" onClick={() => scrollBy(-1)} disabled={!canScrollLeft} aria-label="Scroll left">
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => scrollBy(1)} disabled={!canScrollRight} aria-label="Scroll right">
                <ChevronRight />
              </Button>
            </div>
          )}
          {viewAllHref && (
            <Button variant="ghost" size="sm" asChild>
              <Link to={viewAllHref}>
                View all
                <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      </header>

      {layout === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
            : products?.map((product, index) => (
                <ProductCard key={product.id} product={product} index={index} showReason={showReason} />
              ))}
        </div>
      ) : (
        <div
          ref={scroller}
          className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2"
        >
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="w-[240px] shrink-0 snap-start sm:w-[268px]">
                  <ProductCardSkeleton />
                </div>
              ))
            : products?.map((product, index) => (
                <div key={product.id} className="w-[240px] shrink-0 snap-start sm:w-[268px]">
                  <ProductCard product={product} index={index} showReason={showReason} />
                </div>
              ))}
        </div>
      )}
    </section>
  );
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
