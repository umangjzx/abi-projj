import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { cn, formatCurrency, formatDate, initials, SEGMENT_STYLES } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/primitives';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Avatar, AvatarFallback } from '@/components/ui/primitives';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Pagination } from '@/components/ui/table';
import { useAdminCustomers } from '@/hooks/useAdmin';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

const SEGMENTS = ['all', 'NEW', 'ACTIVE', 'LOYAL', 'AT_RISK', 'CHURNED'];

export default function AdminCustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = React.useState(searchParams.get('search') ?? '');

  const page = Number(searchParams.get('page') ?? '1');
  const segment = searchParams.get('segment') ?? undefined;

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

  const { data, isLoading, error, refetch } = useAdminCustomers({
    page,
    limit: 20,
    segment,
    search: searchParams.get('search') ?? undefined,
    sort: 'recent',
  });

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/customers/${id}/status`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] });
      toast.success('Customer status updated');
    },
    onError: (err: ApiError) => toast.error('Could not update status', err.message),
  });

  const customers = data?.data;
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl font-bold">Customers</h1>

      <div className="flex flex-wrap gap-3">
        <Input icon={<Search />} placeholder="Search name, email, phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select
          value={segment ?? 'all'}
          onValueChange={(value) =>
            setSearchParams((p) => {
              if (value === 'all') p.delete('segment');
              else p.set('segment', value);
              p.delete('page');
              return p;
            })
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEGMENTS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'all' ? 'All segments' : s.replace('_', ' ')}
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
        ) : customers?.length === 0 ? (
          <EmptyState icon={<Users />} title="No customers found" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Segment</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Total spent</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers?.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <Link to={`/admin/customers/${customer.id}`} className="flex items-center gap-3">
                      <Avatar className="size-9">
                        <AvatarFallback>{initials(customer.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium text-primary hover:underline">{customer.name}</p>
                        <p className="text-xs text-muted-foreground">{customer.email}</p>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn(SEGMENT_STYLES[customer.segment])} variant="outline" size="sm">
                      {customer.segment.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>{customer.totalOrders}</TableCell>
                  <TableCell className="font-semibold">{formatCurrency(customer.totalSpent)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(customer.joinedAt)}</TableCell>
                  <TableCell>
                    <Switch
                      checked={customer.isActive}
                      onCheckedChange={(checked) => setActive.mutate({ id: customer.id, isActive: checked })}
                      aria-label={`${customer.isActive ? 'Deactivate' : 'Activate'} ${customer.name}`}
                    />
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
    </div>
  );
}
