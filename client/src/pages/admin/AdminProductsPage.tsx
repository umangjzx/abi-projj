import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Package, Plus, Search, Star, Trash2 } from 'lucide-react';
import { cn, formatCurrency, toQueryString } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/primitives';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Pagination } from '@/components/ui/table';
import { ProductImage } from '@/components/product/ProductImage';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useCategories } from '@/hooks/useCatalog';
import type { Product } from '@/types';

export default function AdminProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = React.useState(searchParams.get('q') ?? '');
  const [deleteTarget, setDeleteTarget] = React.useState<Product | null>(null);

  const page = Number(searchParams.get('page') ?? '1');
  const category = searchParams.get('category') ?? undefined;
  const { data: categories } = useCategories();

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSearchParams((p) => {
        if (search) p.set('q', search);
        else p.delete('q');
        p.delete('page');
        return p;
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = {
    page,
    limit: 20,
    q: searchParams.get('q') ?? undefined,
    category,
    includeInactive: true,
    sort: 'newest' as const,
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'products', filters],
    queryFn: () => api.list<Product[]>(`/products${toQueryString(filters)}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<{ softDeleted: boolean; message: string }>(`/products/${id}`),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      toast.success(result.softDeleted ? 'Product deactivated' : 'Product deleted', result.message);
      setDeleteTarget(null);
    },
    onError: (err: ApiError) => toast.error('Could not delete product', err.message),
  });

  const products = data?.data;
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold">Products</h1>
        <Button asChild>
          <Link to="/admin/products/new">
            <Plus />
            Add product
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input icon={<Search />} placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select
          value={category ?? 'all'}
          onValueChange={(value) =>
            setSearchParams((p) => {
              if (value === 'all') p.delete('category');
              else p.set('category', value);
              p.delete('page');
              return p;
            })
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories?.map((cat) => (
              <SelectItem key={cat.id} value={cat.slug}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-soft">
        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="p-5">
            <TableSkeleton rows={8} cols={6} />
          </div>
        ) : products?.length === 0 ? (
          <EmptyState icon={<Package />} title="No products found" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products?.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                        <ProductImage src={product.primaryImage} alt={product.name} className="size-full object-cover" />
                      </span>
                      <div className="min-w-0">
                        <p className="line-clamp-1 font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.sku}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{product.category?.name}</TableCell>
                  <TableCell>{formatCurrency(product.minPrice)}{product.minPrice !== product.maxPrice && `–${formatCurrency(product.maxPrice)}`}</TableCell>
                  <TableCell>
                    <span className={cn(product.totalStock === 0 && 'font-medium text-destructive')}>{product.totalStock}</span>
                  </TableCell>
                  <TableCell>
                    {product.ratingCount > 0 ? (
                      <span className="flex items-center gap-1">
                        <Star className="size-3.5 fill-amber-400 text-amber-400" />
                        {product.avgRating.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.isActive ? 'success' : 'muted'} size="sm">
                      {product.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    {product.isFeatured && (
                      <Badge variant="outline" size="sm" className="ml-1">
                        Featured
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" asChild>
                        <Link to={`/admin/products/${product.id}/edit`} aria-label="Edit product">
                          <Edit />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(product)} aria-label="Delete product">
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {meta && meta.totalPages! > 1 && (
          <div className="border-t border-border p-4">
            <Pagination page={meta.page!} totalPages={meta.totalPages!} total={meta.total} limit={meta.limit} onPageChange={(next) => setSearchParams((p) => (p.set('page', String(next)), p))} />
          </div>
        )}
      </div>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
            <DialogDescription>
              If this product has order history, it will be deactivated instead of permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleteTarget && remove.mutate(deleteTarget.id)} loading={remove.isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
