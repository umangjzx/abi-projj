import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, Package, Search, Settings2 } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState, StatCardSkeleton, TableSkeleton } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Pagination } from '@/components/ui/table';
import { StatCard } from '@/components/admin/StatCard';
import { DateRangePicker, type RangePeriod } from '@/components/admin/DateRangePicker';
import { ProductImage } from '@/components/product/ProductImage';
import { useAbcAnalysis, useAdminInventory, useInventorySummary } from '@/hooks/useAdmin';
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

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock levels</TabsTrigger>
          <TabsTrigger value="abc">ABC analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-6">
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
        </TabsContent>

        <TabsContent value="abc">
          <AbcAnalysisPanel />
        </TabsContent>
      </Tabs>

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

/**
 * Pareto (ABC) + XYZ classification. ABC buckets each SKU by revenue
 * contribution — A (top ~80% of revenue), B (next ~15%), C (long tail). XYZ
 * buckets it by how predictable its weekly demand is — X (steady, CV ≤ 0.5),
 * Y (variable), Z (erratic, CV > 1). The 3×3 grid turns the two into stock
 * policy: AX = run lean, AZ = carry safety stock, CZ = make-to-order or delist.
 */
function AbcAnalysisPanel() {
  const [period, setPeriod] = React.useState<RangePeriod>('90d');
  const { data, isLoading, error, refetch } = useAbcAnalysis(period);

  const classBadge = { A: 'success', B: 'warning', C: 'muted' } as const;
  const xyzBadge = { X: 'success', Y: 'warning', Z: 'muted' } as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          SKUs ranked by revenue contribution — Class A drives the bulk of revenue and deserves the tightest stock control.
        </p>
        <DateRangePicker value={period} onChange={setPeriod} />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <TableSkeleton rows={8} cols={5} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {data.summary.map((s) => (
              <StatCard
                key={s.class}
                label={`Class ${s.class} — ${s.skuCount} SKU(s)`}
                value={formatCurrency(s.revenue)}
                changeLabel={`${s.revenueShare}% of revenue`}
                className={cn(
                  s.class === 'A' && 'border-success/40',
                  s.class === 'B' && 'border-warning/40',
                )}
              />
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
            <p className="text-sm font-semibold">ABC × XYZ matrix</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              SKU count (revenue) per cell — value down, demand predictability across.
            </p>
            <div className="mt-3 grid grid-cols-[auto_repeat(3,1fr)] gap-1 text-center text-xs">
              <div />
              {(['X', 'Y', 'Z'] as const).map((x) => (
                <div key={x} className="py-1 font-semibold text-muted-foreground">
                  {x} {x === 'X' ? '· steady' : x === 'Y' ? '· variable' : '· erratic'}
                </div>
              ))}
              {(['A', 'B', 'C'] as const).map((a) => (
                <React.Fragment key={a}>
                  <div className="flex items-center justify-center py-1 font-semibold text-muted-foreground">{a}</div>
                  {(['X', 'Y', 'Z'] as const).map((x) => {
                    const cell = data.matrix.find((m) => m.cell === `${a}${x}`);
                    return (
                      <div
                        key={x}
                        className={cn(
                          'rounded-md border border-border px-2 py-2',
                          a === 'A' && x === 'Z' && 'border-warning/50 bg-warning/5',
                          a === 'A' && x === 'X' && 'border-success/50 bg-success/5',
                        )}
                      >
                        <span className="font-semibold">{cell?.skuCount ?? 0}</span>
                        <span className="block text-[10px] text-muted-foreground">{formatCurrency(cell?.revenue ?? 0)}</span>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-soft">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Revenue share</TableHead>
                  <TableHead>Cumulative</TableHead>
                  <TableHead>Demand CV</TableHead>
                  <TableHead>Class</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.variantId}>
                    <TableCell>
                      <p className="line-clamp-1 text-sm font-medium">{row.productName}</p>
                      <p className="text-xs text-muted-foreground">{row.variantName} · {row.category}</p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.sku}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(row.revenue)}</TableCell>
                    <TableCell>{row.unitsSold}</TableCell>
                    <TableCell>{row.stock}</TableCell>
                    <TableCell>{row.revenueShare}%</TableCell>
                    <TableCell className="text-muted-foreground">{row.cumulativeShare}%</TableCell>
                    <TableCell className="text-muted-foreground">{row.demandCv.toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badge variant={classBadge[row.class]} size="sm">
                          {row.class}
                        </Badge>
                        <Badge variant={xyzBadge[row.xyzClass]} size="sm">
                          {row.xyzClass}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
