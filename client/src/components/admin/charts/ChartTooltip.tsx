import type { TooltipProps } from 'recharts';
import { formatCurrency, formatNumber } from '@/lib/utils';

export interface ChartTooltipProps extends TooltipProps<number, string> {
  /** Maps a dataKey to a formatter -- defaults to plain number formatting. */
  formatters?: Record<string, (value: number) => string>;
  labelFormatter?: (label: string) => string;
}

/** Consistent, theme-aware tooltip for every Recharts chart in the admin panel. */
export function ChartTooltip({ active, payload, label, formatters, labelFormatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-lift">
      {label !== undefined && (
        <p className="mb-1.5 font-semibold text-popover-foreground">{labelFormatter ? labelFormatter(String(label)) : label}</p>
      )}
      <div className="space-y-1">
        {payload.map((entry) => {
          const formatter = entry.dataKey ? formatters?.[String(entry.dataKey)] : undefined;
          const value = typeof entry.value === 'number' ? (formatter ? formatter(entry.value) : formatNumber(entry.value)) : entry.value;
          return (
            <div key={entry.dataKey} className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium text-popover-foreground">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const currencyFormatter = formatCurrency;
export const numberFormatter = formatNumber;
