import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter as FilterIcon, LayoutGrid, List, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/primitives';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductCardSkeleton, EmptyState, ErrorState } from '@/components/ui/feedback';
import { Pagination } from '@/components/ui/table';
import { ProductFilters, type FilterState } from '@/components/store/ProductFilters';
import { useFilterMeta, useProducts, type ProductFilters as Filters } from '@/hooks/useCatalog';

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'popular', label: 'Most popular' },
];

export default function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = React.useState<'grid' | 'list'>('grid');
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);

  const page = Number(searchParams.get('page') ?? '1');
  const q = searchParams.get('q') ?? undefined;
  const sort = searchParams.get('sort') ?? 'relevance';
  const categories = searchParams.get('category') ? [searchParams.get('category')!] : [];
  const minPrice = searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined;
  const maxPrice = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined;
  const minRating = searchParams.get('minRating') ? Number(searchParams.get('minRating')) : undefined;
  const inStock = searchParams.get('inStock') === 'true';
  const featured = searchParams.get('featured') === 'true' ? true : undefined;

  const filters: FilterState = { categories, minPrice, maxPrice, minRating, inStock };

  const applyFilters = (next: FilterState) => {
    setSearchParams((params) => {
      params.delete('page');
      if (next.categories.length) params.set('category', next.categories[0]);
      else params.delete('category');
      if (next.minPrice !== undefined) params.set('minPrice', String(next.minPrice));
      else params.delete('minPrice');
      if (next.maxPrice !== undefined) params.set('maxPrice', String(next.maxPrice));
      else params.delete('maxPrice');
      if (next.minRating !== undefined) params.set('minRating', String(next.minRating));
      else params.delete('minRating');
      if (next.inStock) params.set('inStock', 'true');
      else params.delete('inStock');
      return params;
    });
  };

  const queryFilters: Filters = {
    page,
    limit: 24,
    q,
    category: categories[0],
    minPrice,
    maxPrice,
    minRating,
    inStock: inStock || undefined,
    featured,
    sort,
  };

  const { data: filterMeta, isLoading: filterMetaLoading } = useFilterMeta();
  const { data, isLoading, isFetching, error, refetch } = useProducts(queryFilters);

  const products = data?.data;
  const meta = data?.meta;
  const activeFilterCount = filters.categories.length + (filters.minRating ? 1 : 0) + (filters.inStock ? 1 : 0);

  return (
    <div className="container py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {q ? `Results for "${q}"` : featured ? 'Featured products' : 'All products'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {meta ? `${meta.total} product${meta.total === 1 ? '' : 's'} found` : 'Loading products…'}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* --- desktop filter sidebar --- */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-xl border border-border bg-card p-5 shadow-soft">
            <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-bold">
              <SlidersHorizontal className="size-4" />
              Filters
            </h2>
            <ProductFilters
              filters={filters}
              onChange={applyFilters}
              priceRange={filterMeta?.priceRange}
              categories={filterMeta?.categories}
              isLoading={filterMetaLoading}
            />
          </div>
        </aside>

        <div className="min-w-0">
          {/* --- toolbar --- */}
          <div className="mb-5 flex items-center justify-between gap-3">
            <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setMobileFiltersOpen(true)}>
              <FilterIcon />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{activeFilterCount}</span>
              )}
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <Select value={sort} onValueChange={(value) => setSearchParams((p) => (p.set('sort', value), p))}>
                <SelectTrigger className="w-[168px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="hidden items-center gap-0.5 rounded-lg border border-input p-0.5 sm:flex">
                <Button
                  variant={view === 'grid' ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  onClick={() => setView('grid')}
                  aria-label="Grid view"
                  aria-pressed={view === 'grid'}
                >
                  <LayoutGrid />
                </Button>
                <Button
                  variant={view === 'list' ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  onClick={() => setView('list')}
                  aria-label="List view"
                  aria-pressed={view === 'list'}
                >
                  <List />
                </Button>
              </div>
            </div>
          </div>

          {/* --- results --- */}
          {error ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : isLoading ? (
            <div className={cn('grid gap-4', view === 'grid' ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1')}>
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : products?.length === 0 ? (
            <EmptyState
              title="No products match your filters"
              description="Try adjusting your price range, removing a filter, or searching a different term."
              action={
                <Button variant="outline" onClick={() => applyFilters({ categories: [], inStock: false })}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <div
                className={cn(
                  'grid gap-4 transition-opacity',
                  isFetching && 'opacity-60',
                  view === 'grid' ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1',
                )}
              >
                {products?.map((product, index) => (
                  <ProductCard key={product.id} product={product} index={index} showReason={false} />
                ))}
              </div>

              {meta && meta.totalPages! > 1 && (
                <Pagination
                  className="mt-8"
                  page={meta.page!}
                  totalPages={meta.totalPages!}
                  total={meta.total}
                  limit={meta.limit}
                  onPageChange={(next) => {
                    setSearchParams((p) => (p.set('page', String(next)), p));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* --- mobile filter sheet --- */}
      <Dialog open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
          </DialogHeader>
          <ProductFilters
            filters={filters}
            onChange={applyFilters}
            priceRange={filterMeta?.priceRange}
            categories={filterMeta?.categories}
          />
          <DialogFooter>
            <Button className="w-full" onClick={() => setMobileFiltersOpen(false)}>
              Show {meta?.total ?? ''} results
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
