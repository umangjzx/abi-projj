import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, Package, Search, Settings2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/primitives';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState, StatCardSkeleton, TableSkeleton } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Pagination } from '@/components/ui/table';
import { StatCard } from '@/components/admin/StatCard';
import { ProductImage } from '@/components/product/ProductImage';
import { useAdminInventory, useInventorySummary } from '@/hooks/useAdmin';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import type { InventoryRow } from '@/types';

export default function AdminInventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = React.useState(searchParams.get('search') ?? '');
  const [adjustTarget, setAdjustTarget] = React.useState<InventoryRow | null>(null);
  const [adjustQty, setAdjustQty] = React.useState('');
  const [adjustType, setAdjustType] = React.useState<'PURCHASE' | 'DAMAGE' | 'ADJUSTMENT'>('PURCHASE');
  const [adjustReason, setAdjustReason] = React.useState('');

  const page = Number(searchParams.get('page') ?? '1');
  const status = (searchParams.get('status') as 'all' | 'low' | 'out' | 'healthy') ?? 'all';

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSearchParams((p) => {
        if (search) p.set('search', search);
        else p.delete('search');
        p.delete('page');
        return p;
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: summary, isLoading: summaryLoading } = useInventorySummary();
  const { data, isLoading, error, refetch } = useAdminInventory({
    page,
    limit: 20,
    status,
    search: searchParams.get('search') ?? undefined,
  });

  const adjust = useMutation({
    mutationFn: () =>
      api.post(`/inventory/${adjustTarget!.variantId}/adjust`, {
        quantity: Number(adjustQty),
        type: adjustType,
        reason: adjustReason || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'inventory-summary'] });
      setAdjustTarget(null);
      setAdjustQty('');
      setAdjustReason('');
      toast.success('Stock adjusted');
    },
    onError: (err: ApiError) => toast.error('Could not adjust stock', err.message),
  });

  const rows = data?.data;
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl font-bold">Inventory</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {summaryLoading || !summary ? (
          Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Tracked SKUs" value={summary.trackedVariants} icon={<Boxes />} />
            <StatCard label="Total units" value={summary.totalUnits} />
            <StatCard label="Stock value" value={formatCurrency(summary.stockValue)} />
            <StatCard label="Low stock" value={summary.lowStock} className={summary.lowStock > 0 ? 'border-warning/40' : undefined} />
            <StatCard label="Out of stock" value={summary.outOfStock} className={summary.outOfStock > 0 ? 'border-destructive/40' : undefined} />
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input icon={<Search />} placeholder="Search SKU, product…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select
          value={status}
          onValueChange={(value) =>
            setSearchParams((p) => {
              if (value === 'all') p.delete('status');
              else p.set('status', value);
              p.delete('page');
              return p;
            })
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock levels</SelectItem>
            <SelectItem value="healthy">Healthy</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
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
        ) : rows?.length === 0 ? (
          <EmptyState icon={<Package />} title="No inventory records found" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows?.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="size-9 shrink-0 overflow-hidden rounded-lg bg-muted">
                        <ProductImage src={row.product.image} alt={row.product.name} className="size-full object-cover" />
                      </span>
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm font-medium">{row.product.name}</p>
                        <p className="text-xs text-muted-foreground">{row.variantName}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.sku}</TableCell>
                  <TableCell className="font-medium">{row.stock}</TableCell>
                  <TableCell>{row.available}</TableCell>
                  <TableCell>{formatCurrency(row.stockValue)}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === 'out' ? 'destructive' : row.status === 'low' ? 'warning' : 'success'} size="sm">
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => setAdjustTarget(row)} aria-label="Adjust stock">
                      <Settings2 />
                    </Button>
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

      <Dialog open={Boolean(adjustTarget)} onOpenChange={(open) => !open && setAdjustTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust stock — {adjustTarget?.product.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Current stock: {adjustTarget?.stock}</p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select value={adjustType} onValueChange={(v) => setAdjustType(v as typeof adjustType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PURCHASE">Restock (add)</SelectItem>
                  <SelectItem value="DAMAGE">Damage / loss (remove)</SelectItem>
                  <SelectItem value="ADJUSTMENT">Manual adjustment (+/-)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Quantity {adjustType === 'ADJUSTMENT' ? '(use negative to subtract)' : ''}
              </label>
              <Input type="number" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} placeholder="e.g. 50" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Reason (optional)</label>
              <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="e.g. Weekly restock" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>
              Cancel
            </Button>
            <Button disabled={!adjustQty || Number(adjustQty) === 0} onClick={() => adjust.mutate()} loading={adjust.isPending}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
