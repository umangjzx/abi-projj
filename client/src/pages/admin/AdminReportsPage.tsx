import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileText, ScrollText, Table2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/primitives';
import { Alert, ErrorState, PageLoader, TableSkeleton } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DateRangePicker, type RangePeriod } from '@/components/admin/DateRangePicker';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import type { ReportDefinition, ReportPayload } from '@/types';

type ExportFormat = 'pdf' | 'excel' | 'csv';

const FORMAT_ICONS: Record<ExportFormat, React.ReactNode> = {
  pdf: <FileText />,
  excel: <FileSpreadsheet />,
  csv: <Table2 />,
};

export default function AdminReportsPage() {
  const toast = useToast();
  const [reportType, setReportType] = React.useState('sales');
  const [period, setPeriod] = React.useState<RangePeriod>('30d');
  const [exporting, setExporting] = React.useState<ExportFormat | null>(null);

  const { data: definitions } = useQuery({
    queryKey: ['admin', 'report-definitions'],
    queryFn: () => api.get<ReportDefinition[]>('/reports'),
  });

  const { data: report, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'report', reportType, period],
    queryFn: () => api.get<ReportPayload>(`/reports/${reportType}?period=${period}`),
  });

  const exportReport = async (format: ExportFormat) => {
    setExporting(format);
    try {
      await api.download(`/reports/${reportType}/export?period=${period}&format=${format}`, `${reportType}-report.${format === 'excel' ? 'xlsx' : format}`);
      toast.success('Export ready', 'Check your downloads folder.');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-display text-xl font-bold">
          <ScrollText className="size-5" />
          Reports
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(definitions ?? []).map((def) => (
                <SelectItem key={def.type} value={def.type}>
                  {def.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangePicker value={period} onChange={setPeriod} />
        </div>
      </div>

      {definitions?.find((d) => d.type === reportType) && (
        <Alert variant="info">{definitions.find((d) => d.type === reportType)?.description}</Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {(['pdf', 'excel', 'csv'] as ExportFormat[]).map((format) => (
          <Button key={format} variant="outline" onClick={() => exportReport(format)} loading={exporting === format} disabled={Boolean(exporting)}>
            {FORMAT_ICONS[format]}
            Export {format.toUpperCase()}
          </Button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading || !report ? (
        <PageLoader label="Building report" />
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="font-display text-lg font-bold">{report.title}</h2>
            <p className="text-sm text-muted-foreground">{report.subtitle}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {report.summary.map((item) => (
              <div key={item.label} className="rounded-lg border border-border bg-card p-3.5">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="mt-1 font-display text-lg font-bold">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
            {report.rows.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No data available for the selected period.</p>
            ) : (
              <div className="max-h-[600px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      {report.columns.map((col) => (
                        <TableHead key={col.key} className={col.type === 'currency' || col.type === 'number' || col.type === 'percent' ? 'text-right' : undefined}>
                          {col.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rows.slice(0, 200).map((row, index) => (
                      <TableRow key={index}>
                        {report.columns.map((col) => (
                          <TableCell key={col.key} className={col.type === 'currency' || col.type === 'number' || col.type === 'percent' ? 'text-right tabular-nums' : undefined}>
                            {formatCell(row[col.key], col.type)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {report.rows.length > 200 && (
              <p className="border-t border-border p-3 text-center text-xs text-muted-foreground">
                Showing first 200 of {report.rows.length} rows — export for the full dataset.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatCell(value: unknown, type?: string): string {
  if (value === null || value === undefined || value === '') return '-';
  if (type === 'currency') return formatCurrency(Number(value));
  if (type === 'percent') return `${Number(value).toFixed(2)}%`;
  if (type === 'date') return new Date(String(value)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return String(value);
}
