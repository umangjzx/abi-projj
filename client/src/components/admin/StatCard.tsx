import * as React from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  /** Inverts colour semantics for metrics where a rise is bad (e.g. cancellations). */
  invertColor?: boolean;
  className?: string;
}

/** KPI tile used across the admin dashboard and analytics pages. */
export function StatCard({ label, value, change, changeLabel, icon, invertColor, className }: StatCardProps) {
  const isPositive = (change ?? 0) > 0;
  const isNeutral = !change || change === 0;
  const isGood = invertColor ? !isPositive : isPositive;

  return (
    <div className={cn('rounded-xl border border-border bg-card p-5 shadow-soft', className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
      </div>
      <p className="mt-2 font-display text-2xl font-bold tracking-tight">{value}</p>
      {change !== undefined && (
        <div className="mt-2 flex items-center gap-1 text-xs font-medium">
          <span
            className={cn(
              'flex items-center gap-0.5 rounded-full px-1.5 py-0.5',
              isNeutral
                ? 'bg-muted text-muted-foreground'
                : isGood
                  ? 'bg-success/10 text-success'
                  : 'bg-destructive/10 text-destructive',
            )}
          >
            {isNeutral ? <Minus className="size-3" /> : isPositive ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            {Math.abs(change).toFixed(1)}%
          </span>
          <span className="text-muted-foreground">{changeLabel ?? 'vs previous period'}</span>
        </div>
      )}
    </div>
  );
}
