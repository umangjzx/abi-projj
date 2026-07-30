import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Search } from 'lucide-react';
import { formatDate, toQueryString } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/primitives';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Pagination } from '@/components/ui/table';
import { api } from '@/lib/api';

interface ActivityRow {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  at: string;
  actor: string;
  actorRole: string | null;
}

const METHOD_COLORS: Record<string, string> = {
  POST: 'text-success',
  PATCH: 'text-sky-600 dark:text-sky-400',
  PUT: 'text-sky-600 dark:text-sky-400',
  DELETE: 'text-destructive',
};

export default function AdminActivityPage() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [entity, setEntity] = React.useState('all');

  const filters = { page, limit: 25, action: search || undefined, entity: entity !== 'all' ? entity : undefined };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'activity', filters],
    queryFn: () => api.list<ActivityRow[]>(`/admin/activity${toQueryString(filters)}`),
  });

  const rows = data?.data;
  const meta = data?.meta;
  const entities = (meta?.entities as string[] | undefined) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-xl font-bold">
          <Activity className="size-5" />
          Activity log
        </h1>
        <p className="text-sm text-muted-foreground">Audit trail of every administrative action</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input icon={<Search />} placeholder="Search action…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="max-w-xs" />
        <Select value={entity} onValueChange={(v) => { setEntity(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {entities.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
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
            <TableSkeleton rows={10} cols={5} />
          </div>
        ) : rows?.length === 0 ? (
          <EmptyState icon={<Activity />} title="No activity recorded" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows?.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.action}</TableCell>
                  <TableCell className="text-muted-foreground">{row.entity ?? '-'}</TableCell>
                  <TableCell>
                    <p>{row.actor}</p>
                    {row.actorRole && (
                      <Badge variant="outline" size="sm" className="mt-0.5">
                        {row.actorRole}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{row.method && <span className={METHOD_COLORS[row.method]}>{row.method}</span>}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(row.at, 'full')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {meta && meta.totalPages! > 1 && (
          <div className="border-t border-border p-4">
            <Pagination page={meta.page!} totalPages={meta.totalPages!} total={meta.total} limit={meta.limit} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
