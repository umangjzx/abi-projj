import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RefreshCw, Sparkles, Target } from 'lucide-react';
import { CHART_COLORS, formatCompact, formatDate, formatPercent } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCardSkeleton, TableSkeleton } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '@/components/admin/StatCard';
import { ChartCard } from '@/components/admin/charts/ChartCard';
import { ChartTooltip } from '@/components/admin/charts/ChartTooltip';
import { DateRangePicker, type RangePeriod } from '@/components/admin/DateRangePicker';
import { useRecommendationPerformance } from '@/hooks/useAdmin';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

interface AffinityRow {
  id: string;
  productA: string;
  productB: string;
  coOccurrence: number;
  lift: number;
}

interface CoverageStats {
  catalogueCoverage: number;
  customerCoverage: number;
  productsRecommended: number;
  totalProducts: number;
  customersServed: number;
  totalCustomers: number;
}

export default function AdminRecommendationsPage() {
  const [period, setPeriod] = React.useState<RangePeriod>('30d');
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: performance, isLoading } = useRecommendationPerformance(period);
  const { data: affinities, isLoading: affinitiesLoading } = useQuery({
    queryKey: ['admin', 'recommendations', 'affinities'],
    queryFn: () => api.get<AffinityRow[]>('/recommendations/admin/affinities?limit=15'),
  });
  const { data: coverage } = useQuery({
    queryKey: ['admin', 'recommendations', 'coverage'],
    queryFn: () => api.get<CoverageStats>('/recommendations/admin/coverage'),
  });

  const rebuild = useMutation({
    mutationFn: () => api.post<{ message: string; affinityPairs: number; expiredSlotsRemoved: number }>('/recommendations/admin/rebuild'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'recommendations'] });
      toast.success('Model rebuilt', `${result.affinityPairs} affinity pairs computed.`);
    },
    onError: (err: ApiError) => toast.error('Rebuild failed', err.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl font-bold">
            <Sparkles className="size-5 text-primary" />
            Recommendation monitoring
          </h1>
          <p className="text-sm text-muted-foreground">Track how well each recommendation strategy performs</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker value={period} onChange={setPeriod} />
          <Button variant="outline" onClick={() => rebuild.mutate()} loading={rebuild.isPending}>
            <RefreshCw />
            Rebuild model
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isLoading || !performance ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Impressions" value={formatCompact(performance.totals.impressions)} icon={<Target />} />
            <StatCard label="Click-through rate" value={formatPercent(performance.totals.clickThroughRate)} />
            <StatCard label="Cart rate" value={formatPercent(performance.totals.cartRate)} />
            <StatCard label="Conversion rate" value={formatPercent(performance.totals.conversionRate)} />
          </>
        )}
      </div>

      {coverage && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Catalogue coverage" value={formatPercent(coverage.catalogueCoverage)} changeLabel={`${coverage.productsRecommended}/${coverage.totalProducts} products`} />
          <StatCard label="Customer coverage" value={formatPercent(coverage.customerCoverage)} changeLabel={`${coverage.customersServed}/${coverage.totalCustomers} customers`} />
        </div>
      )}

      <ChartCard title="Funnel over time" isLoading={isLoading} isEmpty={performance?.timeline.length === 0}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={performance?.timeline}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} tickLine={false} axisLine={false} minTickGap={40} />
            <YAxis tickLine={false} axisLine={false} width={40} />
            <Tooltip content={<ChartTooltip labelFormatter={(l) => formatDate(l, 'long')} />} />
            <Line type="monotone" dataKey="impressions" name="Impressions" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="clicks" name="Clicks" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="purchases" name="Purchases" stroke={CHART_COLORS[4]} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Performance by strategy" isLoading={isLoading} isEmpty={performance?.byStrategy.length === 0}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={performance?.byStrategy} layout="vertical" margin={{ left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="strategy" width={150} tickFormatter={(v) => String(v).replace(/_/g, ' ')} tickLine={false} axisLine={false} fontSize={11} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="conversionRate" name="Conversion %" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="rounded-xl border border-border bg-card shadow-soft">
        <div className="border-b border-border p-5">
          <h2 className="font-display text-sm font-bold">Strategy funnel detail</h2>
        </div>
        {isLoading ? (
          <div className="p-5">
            <TableSkeleton rows={7} cols={7} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Strategy</TableHead>
                <TableHead>Impressions</TableHead>
                <TableHead>Clicks</TableHead>
                <TableHead>Added to cart</TableHead>
                <TableHead>Purchases</TableHead>
                <TableHead>CTR</TableHead>
                <TableHead>Conversion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performance?.byStrategy.map((row) => (
                <TableRow key={row.strategy}>
                  <TableCell className="font-medium">
                    {row.strategy.replace(/_/g, ' ')}
                    {performance.bestStrategy === row.strategy && (
                      <Badge variant="success" size="sm" className="ml-2">
                        Best
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{formatCompact(row.impressions)}</TableCell>
                  <TableCell>{formatCompact(row.clicks)}</TableCell>
                  <TableCell>{formatCompact(row.addToCarts)}</TableCell>
                  <TableCell>{formatCompact(row.purchases)}</TableCell>
                  <TableCell>{formatPercent(row.clickThroughRate)}</TableCell>
                  <TableCell className="font-semibold">{formatPercent(row.conversionRate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-soft">
        <div className="border-b border-border p-5">
          <h2 className="font-display text-sm font-bold">Strongest product affinities</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ranked by <strong>lift</strong> — how many times more often the pair is bought together than their
            individual popularity predicts. Lift 1.0 = coincidence; only pairs above 1.0 power the widget.
          </p>
        </div>
        {affinitiesLoading ? (
          <div className="p-5">
            <TableSkeleton rows={6} cols={3} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product A</TableHead>
                <TableHead>Product B</TableHead>
                <TableHead>Co-occurrence</TableHead>
                <TableHead>Lift</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {affinities?.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.productA}</TableCell>
                  <TableCell>{row.productB}</TableCell>
                  <TableCell>{row.coOccurrence}</TableCell>
                  <TableCell className="font-semibold">{row.lift.toFixed(2)}×</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
