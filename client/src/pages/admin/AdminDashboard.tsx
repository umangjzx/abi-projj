import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, ArrowRight, Boxes, IndianRupee, Package, ShoppingBag, Sparkles, Users } from 'lucide-react';
import { CHART_COLORS, cn, formatCompact, formatCurrency, formatCurrencyCompact, formatDate, ORDER_STATUS_STYLES } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState, StatCardSkeleton } from '@/components/ui/feedback';
import { StatCard } from '@/components/admin/StatCard';
import { ChartCard } from '@/components/admin/charts/ChartCard';
import { ChartTooltip } from '@/components/admin/charts/ChartTooltip';
import { DateRangePicker, type RangePeriod } from '@/components/admin/DateRangePicker';
import { useDashboard } from '@/hooks/useAdmin';

export default function AdminDashboard() {
  const [period, setPeriod] = React.useState<RangePeriod>('30d');
  const { data, isLoading, error, refetch } = useDashboard(period);

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground">Real-time snapshot of your business</p>
        </div>
        <DateRangePicker value={period} onChange={setPeriod} />
      </div>

      {/* --- KPI row --- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isLoading || !data ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Revenue" value={formatCurrency(data.kpis.revenue.value)} change={data.kpis.revenue.change} icon={<IndianRupee />} />
            <StatCard label="Orders" value={formatCompact(data.kpis.orders.value)} change={data.kpis.orders.change} icon={<ShoppingBag />} />
            <StatCard label="New customers" value={formatCompact(data.kpis.newCustomers.value)} change={data.kpis.newCustomers.change} icon={<Users />} />
            <StatCard label="Avg. order value" value={formatCurrency(data.kpis.averageOrderValue.value)} change={data.kpis.averageOrderValue.change} icon={<Package />} />
          </>
        )}
      </div>

      {/* --- alerts row --- */}
      {data && (data.inventory.summary.outOfStock > 0 || data.inventory.summary.lowStock > 0) && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/8 p-4">
          <AlertTriangle className="size-5 shrink-0 text-warning" />
          <p className="text-sm">
            <span className="font-semibold">{data.inventory.summary.outOfStock} out of stock</span> and{' '}
            <span className="font-semibold">{data.inventory.summary.lowStock} running low</span>.
          </p>
          <Button variant="outline" size="sm" asChild className="ml-auto shrink-0">
            <Link to="/admin/inventory?status=low">
              View inventory
              <ArrowRight />
            </Link>
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* --- sales trend --- */}
        <ChartCard title="Sales trend" description={`Revenue and orders (${data?.sales.granularity ?? '...'})`} isLoading={isLoading} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data?.sales.series}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis tickFormatter={(v) => formatCurrencyCompact(v)} tickLine={false} axisLine={false} width={64} />
              <Tooltip
                content={
                  <ChartTooltip
                    formatters={{ revenue: formatCurrency }}
                    labelFormatter={(l) => formatDate(l, 'long')}
                  />
                }
              />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke={CHART_COLORS[0]} fill="url(#revenueGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* --- order status --- */}
        <ChartCard title="Order status" description="Distribution this period" isLoading={isLoading} isEmpty={data?.orderStatus.length === 0}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data?.orderStatus} dataKey="count" nameKey="label" innerRadius={55} outerRadius={80} paddingAngle={2}>
                {data?.orderStatus.map((_, index) => (
                  <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {data?.orderStatus.slice(0, 6).map((status, index) => (
              <div key={status.status} className="flex items-center gap-1.5 text-xs">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                <span className="truncate text-muted-foreground">{status.label}</span>
                <span className="ml-auto font-medium">{status.count}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* --- category performance --- */}
        <ChartCard title="Category performance" isLoading={isLoading} isEmpty={data?.categoryPerformance.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data?.categoryPerformance} layout="vertical" margin={{ left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => formatCurrencyCompact(v)} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={90} tickLine={false} axisLine={false} fontSize={11} />
              <Tooltip content={<ChartTooltip formatters={{ revenue: formatCurrency }} />} />
              <Bar dataKey="revenue" name="Revenue" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* --- customer growth --- */}
        <ChartCard title="Customer growth" isLoading={isLoading} isEmpty={data?.customerGrowth.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data?.customerGrowth}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<ChartTooltip labelFormatter={(l) => formatDate(l, 'long')} />} />
              <Area type="monotone" dataKey="newCustomers" name="New customers" stroke={CHART_COLORS[2]} fill={CHART_COLORS[2]} fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* --- recent orders --- */}
        <div className="rounded-xl border border-border bg-card shadow-soft lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h3 className="font-display text-sm font-bold">Recent orders</h3>
            <Link to="/admin/orders" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-border">
            {data?.recentOrders.map((order) => (
              <Link key={order.id} to={`/admin/orders/${order.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{order.orderNumber}</p>
                  <p className="truncate text-xs text-muted-foreground">{order.customer.name}</p>
                </div>
                <Badge className={cn('shrink-0', ORDER_STATUS_STYLES[order.status])} variant="outline" size="sm">
                  {order.status.replace(/_/g, ' ')}
                </Badge>
                <span className="shrink-0 text-sm font-semibold">{formatCurrency(order.total)}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* --- recommendation performance mini --- */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 font-display text-sm font-bold">
              <Sparkles className="size-4 text-primary" />
              Recommendations
            </h3>
            <Link to="/admin/recommendations" className="text-xs font-medium text-primary hover:underline">
              Details
            </Link>
          </div>
          {data && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Impressions</span>
                <span className="font-semibold">{formatCompact(data.recommendations.totals.impressions)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Click-through rate</span>
                <span className="font-semibold">{data.recommendations.totals.clickThroughRate}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Conversion rate</span>
                <span className="font-semibold">{data.recommendations.totals.conversionRate}%</span>
              </div>
              {data.recommendations.bestStrategy && (
                <div className="mt-2 rounded-lg bg-primary/8 p-2.5 text-xs">
                  <span className="text-muted-foreground">Best performer: </span>
                  <span className="font-semibold text-primary">{data.recommendations.bestStrategy.replace(/_/g, ' ')}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* --- top customers + activity --- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card shadow-soft">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h3 className="font-display text-sm font-bold">Top customers</h3>
            <Link to="/admin/customers" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-border">
            {data?.topCustomers.map((customer) => (
              <Link key={customer.userId} to={`/admin/customers/${customer.userId}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/40">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    #{customer.rank}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{customer.name}</p>
                    <p className="text-xs text-muted-foreground">{customer.orders} orders</p>
                  </div>
                </div>
                <span className="text-sm font-semibold">{formatCurrency(customer.spent)}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-soft">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h3 className="flex items-center gap-1.5 font-display text-sm font-bold">
              <Boxes className="size-4" />
              Low stock alerts
            </h3>
            <Link to="/admin/inventory" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-border">
            {data?.inventory.alerts.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">All stock levels are healthy.</p>
            ) : (
              data?.inventory.alerts.map((alert) => (
                <div key={alert.variantId} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{alert.productName}</p>
                    <p className="text-xs text-muted-foreground">{alert.variantName}</p>
                  </div>
                  <Badge variant={alert.severity === 'critical' ? 'destructive' : 'warning'} size="sm">
                    {alert.stock} left
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
