import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChartSkeleton } from '@/components/ui/feedback';

export interface ChartCardProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  height?: number;
  className?: string;
  children: React.ReactNode;
}

/** Consistent chrome for every chart on the analytics dashboard. */
export function ChartCard({
  title,
  description,
  action,
  isLoading,
  isEmpty,
  emptyMessage = 'No data available for the selected period',
  height = 300,
  className,
  children,
}: ChartCardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-5 shadow-soft', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-bold">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>

      {isLoading ? (
        <ChartSkeleton height={height} />
      ) : isEmpty ? (
        <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
          {emptyMessage}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
