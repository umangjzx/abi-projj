import * as React from 'react';
import { Star, X } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Checkbox, Label, Slider } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import type { Category } from '@/types';

export interface FilterState {
  categories: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock: boolean;
}

export interface ProductFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  priceRange?: { min: number; max: number };
  categories?: Category[];
  isLoading?: boolean;
  className?: string;
}

/** Sidebar filter panel shared between the desktop rail and the mobile sheet. */
export function ProductFilters({ filters, onChange, priceRange, categories, isLoading, className }: ProductFiltersProps) {
  const bounds = priceRange ?? { min: 0, max: 2000 };
  const [priceDraft, setPriceDraft] = React.useState<[number, number]>([
    filters.minPrice ?? bounds.min,
    filters.maxPrice ?? bounds.max,
  ]);

  React.useEffect(() => {
    setPriceDraft([filters.minPrice ?? bounds.min, filters.maxPrice ?? bounds.max]);
  }, [filters.minPrice, filters.maxPrice, bounds.min, bounds.max]);

  const toggleCategory = (slug: string) => {
    onChange({
      ...filters,
      categories: filters.categories.includes(slug)
        ? filters.categories.filter((c) => c !== slug)
        : [...filters.categories, slug],
    });
  };

  const activeCount =
    filters.categories.length +
    (filters.minRating ? 1 : 0) +
    (filters.inStock ? 1 : 0) +
    (filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0);

  const clearAll = () => onChange({ categories: [], inStock: false });

  if (isLoading) {
    return (
      <div className={cn('space-y-6', className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="w-full justify-start text-muted-foreground">
          <X className="size-3.5" />
          Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
        </Button>
      )}

      {/* --- categories --- */}
      <div>
        <h3 className="mb-3 text-sm font-semibold">Category</h3>
        <div className="space-y-2.5">
          {categories?.map((category) => (
            <label key={category.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
              <Checkbox
                checked={filters.categories.includes(category.slug)}
                onCheckedChange={() => toggleCategory(category.slug)}
              />
              <span className="flex-1 text-muted-foreground">{category.name}</span>
              <span className="text-xs text-muted-foreground/70">{category.productCount}</span>
            </label>
          ))}
        </div>
      </div>

      {/* --- price --- */}
      <div>
        <h3 className="mb-3 text-sm font-semibold">Price range</h3>
        <Slider
          min={bounds.min}
          max={bounds.max}
          step={10}
          value={priceDraft}
          onValueChange={(value) => setPriceDraft(value as [number, number])}
          onValueCommit={(value) => onChange({ ...filters, minPrice: value[0], maxPrice: value[1] })}
        />
        <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatCurrency(priceDraft[0])}</span>
          <span>{formatCurrency(priceDraft[1])}</span>
        </div>
      </div>

      {/* --- rating --- */}
      <div>
        <h3 className="mb-3 text-sm font-semibold">Customer rating</h3>
        <div className="space-y-2">
          {[4, 3, 2, 1].map((rating) => (
            <button
              key={rating}
              onClick={() => onChange({ ...filters, minRating: filters.minRating === rating ? undefined : rating })}
              className={cn(
                'flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
                filters.minRating === rating ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
              )}
            >
              <span className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={cn('size-3.5', i < rating ? 'fill-amber-400 text-amber-400' : 'text-muted')} />
                ))}
              </span>
              <span className="text-muted-foreground">& up</span>
            </button>
          ))}
        </div>
      </div>

      {/* --- availability --- */}
      <div>
        <Label className="flex cursor-pointer items-center gap-2.5 text-sm font-normal">
          <Checkbox checked={filters.inStock} onCheckedChange={(checked) => onChange({ ...filters, inStock: Boolean(checked) })} />
          In stock only
        </Label>
      </div>
    </div>
  );
}
