import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, MapPin, TrendingDown, TrendingUp } from 'lucide-react';
import { CHART_COLORS, cn, formatCompact, formatCurrency, formatCurrencyCompact, formatDate, formatPercent } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { Alert, ErrorState, StatCardSkeleton } from '@/components/ui/feedback';
import { StatCard } from '@/components/admin/StatCard';
import { ChartCard } from '@/components/admin/charts/ChartCard';
import { ChartTooltip } from '@/components/admin/charts/ChartTooltip';
import { DateRangePicker, type RangePeriod } from '@/components/admin/DateRangePicker';
import { Heatmap } from '@/components/admin/charts/Heatmap';
import {
  useCategoryPerformance,
  useCustomerClusters,
  useCustomerGrowth,
  useCustomerLocations,
  useCustomerRfm,
  useCustomerSegments,
  useForecast,
  useOrderHeatmap,
  useOrderStatusBreakdown,
  usePaymentBreakdown,
  useProductDemand,
  useProductPerformance,
  useRetention,
  useSalesSeries,
  useSeasonalTrends,
  useTopCustomers,
} from '@/hooks/useAdmin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function MarketAnalysisPage() {
  const [period, setPeriod] = React.useState<RangePeriod>('30d');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Market analysis</h1>
          <p className="text-sm text-muted-foreground">Deep-dive into sales, products, customers and forecasts</p>
        </div>
        <DateRangePicker value={period} onChange={setPeriod} />
      </div>

      <Tabs defaultValue="sales">
        <TabsList className="flex-wrap">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          <SalesTab period={period} />
        </TabsContent>
        <TabsContent value="products">
          <ProductsTab period={period} />
        </TabsContent>
        <TabsContent value="customers">
          <CustomersTab period={period} />
        </TabsContent>
        <TabsContent value="forecast">
          <ForecastTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ==================================================================== sales ===

function SalesTab({ period }: { period: RangePeriod }) {
  const { data: sales, isLoading: salesLoading, error, refetch } = useSalesSeries(period);
  const { data: seasonal, isLoading: seasonalLoading } = useSeasonalTrends();
  const { data: heatmap, isLoading: heatmapLoading } = useOrderHeatmap(period);
  const { data: orderStatus, isLoading: statusLoading } = useOrderStatusBreakdown(period);
  const { data: payments, isLoading: paymentsLoading } = usePaymentBreakdown(period);

  if (error) return <ErrorState error={error} onRetry={() => refetch()} className="mt-6" />;

  return (
    <div className="mt-6 space-y-6">
      <ChartCard title="Revenue & orders" description={`Bucketed by ${sales?.granularity ?? '...'}`} isLoading={salesLoading} isEmpty={sales?.series.length === 0}>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={sales?.series}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} tickLine={false} axisLine={false} minTickGap={40} />
            <YAxis yAxisId="revenue" tickFormatter={(v) => formatCurrencyCompact(v)} tickLine={false} axisLine={false} width={64} />
            <YAxis yAxisId="orders" orientation="right" tickLine={false} axisLine={false} width={40} />
            <Tooltip content={<ChartTooltip formatters={{ revenue: formatCurrency }} labelFormatter={(l) => formatDate(l, 'long')} />} />
            <Bar yAxisId="orders" dataKey="orders" name="Orders" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} barSize={18} opacity={0.7} />
            <Line yAxisId="revenue" type="monotone" dataKey="revenue" name="Revenue" stroke={CHART_COLORS[0]} strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Seasonal trends" description="Index of 100 = average month, across all history" isLoading={seasonalLoading}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={seasonal}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<ChartTooltip formatters={{ seasonalIndex: (v) => `${v.toFixed(0)}` }} />} />
              <Bar dataKey="seasonalIndex" name="Seasonal index" radius={[4, 4, 0, 0]}>
                {seasonal?.map((row, i) => (
                  <Cell key={i} fill={row.seasonalIndex >= 100 ? CHART_COLORS[0] : CHART_COLORS[4]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Order status breakdown" isLoading={statusLoading} isEmpty={orderStatus?.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={orderStatus} dataKey="count" nameKey="label" innerRadius={60} outerRadius={90} paddingAngle={2}>
                {orderStatus?.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Order density heat map" description="When your customers order — weekday × hour" isLoading={heatmapLoading}>
        <Heatmap cells={heatmap?.cells ?? []} maxOrders={heatmap?.maxOrders ?? 1} />
      </ChartCard>

      <ChartCard title="Payment method breakdown" isLoading={paymentsLoading} isEmpty={payments?.length === 0}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={payments}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="method" tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(v) => formatCurrencyCompact(v)} tickLine={false} axisLine={false} width={64} />
            <Tooltip content={<ChartTooltip formatters={{ amount: formatCurrency, paid: formatCurrency }} />} />
            <Bar dataKey="amount" name="Total value" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ================================================================= products ===

function ProductsTab({ period }: { period: RangePeriod }) {
  const { data: performance, isLoading } = useProductPerformance(period, 8);
  const { data: categories, isLoading: categoriesLoading } = useCategoryPerformance(period);
  const { data: demand, isLoading: demandLoading } = useProductDemand(period);

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <h3 className="mb-4 font-display text-sm font-bold">Best selling products</h3>
          <RankedProductList products={performance?.bestSelling} isLoading={isLoading} icon={<TrendingUp className="size-3.5 text-success" />} />
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <h3 className="mb-4 font-display text-sm font-bold">Least selling products</h3>
          <RankedProductList products={performance?.leastSelling} isLoading={isLoading} icon={<TrendingDown className="size-3.5 text-destructive" />} />
        </div>
      </div>

      <ChartCard title="Category performance" isLoading={categoriesLoading} isEmpty={categories?.length === 0}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={categories}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} angle={-15} textAnchor="end" height={50} />
            <YAxis tickFormatter={(v) => formatCurrencyCompact(v)} tickLine={false} axisLine={false} width={64} />
            <Tooltip content={<ChartTooltip formatters={{ revenue: formatCurrency }} />} />
            <Bar dataKey="revenue" name="Revenue" radius={[4, 4, 0, 0]}>
              {categories?.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="rounded-xl border border-border bg-card shadow-soft">
        <div className="border-b border-border p-5">
          <h3 className="font-display text-sm font-bold">Product demand & stock coverage</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Daily sales velocity vs. days of stock remaining</p>
        </div>
        {demandLoading ? (
          <div className="p-5">
            <StatCardSkeleton />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {demand?.map((row) => (
              <div key={row.productId} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.category} · {row.dailyVelocity}/day
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{row.stock} in stock</p>
                  {row.daysOfCover !== null && (
                    <p className={cn('text-xs', row.needsRestock ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                      {row.daysOfCover} days of cover
                    </p>
                  )}
                </div>
                {row.needsRestock && <AlertTriangle className="size-4 shrink-0 text-warning" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RankedProductList({
  products,
  isLoading,
  icon,
}: {
  products?: { productId: string; name: string; category: { name: string } | null; revenue: number; unitsSold: number }[];
  isLoading?: boolean;
  icon: React.ReactNode;
}) {
  if (isLoading) return <StatCardSkeleton />;
  if (!products || products.length === 0) return <p className="text-sm text-muted-foreground">No data available.</p>;

  return (
    <div className="space-y-3">
      {products.map((product, index) => (
        <div key={product.productId} className="flex items-center gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{product.name}</p>
            <p className="text-xs text-muted-foreground">{product.category?.name ?? '-'}</p>
          </div>
          <div className="flex items-center gap-1.5 text-right">
            {icon}
            <div>
              <p className="text-sm font-semibold">{formatCurrency(product.revenue)}</p>
              <p className="text-xs text-muted-foreground">{product.unitsSold} sold</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ================================================================ customers ===

function CustomersTab({ period }: { period: RangePeriod }) {
  const { data: growth, isLoading: growthLoading } = useCustomerGrowth(period);
  const { data: retention, isLoading: retentionLoading } = useRetention();
  const { data: segments, isLoading: segmentsLoading } = useCustomerSegments();
  const { data: topCustomers, isLoading: topLoading } = useTopCustomers(period, 8);
  const { data: locations, isLoading: locationsLoading } = useCustomerLocations(period);

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {retentionLoading || !retention ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Repeat rate" value={formatPercent(retention.repeatRate)} />
            <StatCard label="Repeat customers" value={formatCompact(retention.repeatCustomers)} />
            <StatCard label="Avg. lifetime value" value={formatCurrency(retention.lifetimeValue)} />
            <StatCard label="Avg. orders / customer" value={retention.averageOrdersPerCustomer.toFixed(1)} />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Customer growth" isLoading={growthLoading} isEmpty={growth?.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={growth}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<ChartTooltip labelFormatter={(l) => formatDate(l, 'long')} />} />
              <Area type="monotone" dataKey="totalCustomers" name="Total customers" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.12} strokeWidth={2} />
              <Area type="monotone" dataKey="newCustomers" name="New customers" stroke={CHART_COLORS[2]} fill={CHART_COLORS[2]} fillOpacity={0.12} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Customer segments" isLoading={segmentsLoading}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={segments} dataKey="customers" nameKey="segment" innerRadius={60} outerRadius={90} paddingAngle={2}>
                {segments?.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card shadow-soft">
          <div className="border-b border-border p-5">
            <h3 className="font-display text-sm font-bold">Top customers</h3>
          </div>
          {topLoading ? (
            <div className="p-5">
              <StatCardSkeleton />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {topCustomers?.map((customer) => (
                <Link key={customer.userId} to={`/admin/customers/${customer.userId}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/40">
                  <div>
                    <p className="text-sm font-semibold">{customer.name}</p>
                    <p className="text-xs text-muted-foreground">{customer.orders} orders</p>
                  </div>
                  <span className="text-sm font-semibold">{formatCurrency(customer.spent)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card shadow-soft">
          <div className="flex items-center gap-2 border-b border-border p-5">
            <MapPin className="size-4" />
            <h3 className="font-display text-sm font-bold">Revenue by location</h3>
          </div>
          {locationsLoading ? (
            <div className="p-5">
              <StatCardSkeleton />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {locations?.map((location) => (
                <div key={`${location.city}-${location.state}`} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium">{location.city}</p>
                    <p className="text-xs text-muted-foreground">{location.state}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatCurrency(location.revenue)}</p>
                    <p className="text-xs text-muted-foreground">{location.share}% of revenue</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CustomerClusteringPanel />
      <CustomerRfmTable />
    </div>
  );
}

/**
 * K-Means clustering over min-max-scaled Recency/Frequency/Monetary features.
 * Unlike the rule-based segments above (fixed thresholds), the groups here
 * are discovered from the actual distribution of this store's customers --
 * each cluster is labelled from its centroid so the result stays readable.
 */
function CustomerClusteringPanel() {
  const { data, isLoading, error, refetch } = useCustomerClusters(4);

  return (
    <ChartCard
      title="Customer clustering (K-Means)"
      description="Groups discovered from Recency, Frequency & Monetary behaviour — not fixed thresholds"
      isLoading={isLoading}
      isEmpty={!error && data?.clusters.length === 0}
      height={220}
    >
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data?.clusters.map((cluster) => (
            <div key={cluster.clusterIndex} className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{cluster.label}</p>
                <Badge variant="outline" size="sm">
                  {cluster.size} customer{cluster.size === 1 ? '' : 's'}
                </Badge>
              </div>
              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Avg. recency</dt>
                  <dd className="font-medium">{cluster.avgRecencyDays}d</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Avg. orders</dt>
                  <dd className="font-medium">{cluster.avgFrequency}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Avg. spend</dt>
                  <dd className="font-medium">{formatCurrency(cluster.avgMonetary)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  );
}

/** Recency/Frequency/Monetary quintile scoring (1-5 each) and the resulting named segment. */
function CustomerRfmTable() {
  const { data, isLoading, error, refetch } = useCustomerRfm();
  const top = React.useMemo(() => [...(data ?? [])].sort((a, b) => b.rfmScore - a.rfmScore).slice(0, 12), [data]);

  return (
    <div className="rounded-xl border border-border bg-card shadow-soft">
      <div className="border-b border-border p-5">
        <h3 className="font-display text-sm font-bold">RFM scoring</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Recency, Frequency and Monetary value quintile-scored 1 (worst) – 5 (best), top 12 by combined score
        </p>
      </div>
      {error ? (
        <div className="p-5">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <div className="p-5">
          <StatCardSkeleton />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Recency</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Monetary</TableHead>
              <TableHead>RFM score</TableHead>
              <TableHead>Segment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top.map((row) => (
              <TableRow key={row.userId}>
                <TableCell>
                  <p className="text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.email}</p>
                </TableCell>
                <TableCell>
                  {row.recencyScore}/5 <span className="text-xs text-muted-foreground">({row.recencyDays}d)</span>
                </TableCell>
                <TableCell>
                  {row.frequencyScore}/5 <span className="text-xs text-muted-foreground">({row.frequency})</span>
                </TableCell>
                <TableCell>
                  {row.monetaryScore}/5 <span className="text-xs text-muted-foreground">({formatCurrency(row.monetary)})</span>
                </TableCell>
                <TableCell className="font-semibold">{row.rfmScore}/15</TableCell>
                <TableCell>
                  <Badge variant="outline" size="sm">
                    {row.segment}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ================================================================= forecast ===

function ForecastTab() {
  const [days, setDays] = React.useState(14);
  const { data: forecast, isLoading } = useForecast(days);

  const combined = React.useMemo(() => {
    if (!forecast) return [];
    const history = forecast.history.map((h) => ({ date: h.date, actual: h.revenue }));
    const projected = forecast.forecast.map((f) => ({ date: f.date, predicted: f.predicted, lower: f.lower, upper: f.upper }));
    return [...history, ...projected];
  }, [forecast]);

  if (isLoading) {
    return (
      <div className="mt-6">
        <StatCardSkeleton />
      </div>
    );
  }

  if (!forecast?.sufficientData) {
    return (
      <Alert variant="info" className="mt-6" title="Not enough data yet">
        {forecast?.message ?? 'At least 7 days of sales history are needed to produce a forecast.'}
      </Alert>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {[7, 14, 30].map((option) => (
            <button
              key={option}
              onClick={() => setDays(option)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                days === option ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >
              {option} days
            </button>
          ))}
        </div>
        {forecast.model && (
          <Badge variant={forecast.model.confidence === 'high' ? 'success' : forecast.model.confidence === 'moderate' ? 'warning' : 'muted'}>
            {forecast.model.confidence} confidence (R² {forecast.model.rSquared})
          </Badge>
        )}
      </div>

      {forecast.summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Projected revenue" value={formatCurrency(forecast.summary.projectedRevenue)} />
          <StatCard label="vs. comparable period" value={formatCurrency(forecast.summary.comparablePastRevenue)} change={forecast.summary.expectedChange} />
          <StatCard label="Daily average" value={formatCurrency(forecast.summary.projectedDailyAverage)} />
          <StatCard label="Trend" value={forecast.summary.trend} />
        </div>
      )}

      <ChartCard title="Revenue forecast" description={forecast.model?.method}>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={combined}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} tickLine={false} axisLine={false} minTickGap={40} />
            <YAxis tickFormatter={(v) => formatCurrencyCompact(v)} tickLine={false} axisLine={false} width={64} />
            <Tooltip content={<ChartTooltip formatters={{ actual: formatCurrency, predicted: formatCurrency, upper: formatCurrency, lower: formatCurrency }} labelFormatter={(l) => formatDate(l, 'long')} />} />
            <Area type="monotone" dataKey="upper" name="Upper bound" stroke="none" fill={CHART_COLORS[0]} fillOpacity={0.08} />
            <Area type="monotone" dataKey="lower" name="Lower bound" stroke="none" fill="hsl(var(--background))" fillOpacity={1} />
            <Line type="monotone" dataKey="actual" name="Actual revenue" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="predicted" name="Forecast" stroke={CHART_COLORS[3]} strokeWidth={2} strokeDasharray="5 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
