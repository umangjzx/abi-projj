/**
 * Loading, empty and error states. Having one implementation of each keeps
 * every screen consistent and means a page never has to invent its own.
 */
import * as React from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { ApiError } from '@/lib/api';

// -------------------------------------------------------------------- Skeleton ---

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-md bg-muted', className)}
      aria-hidden="true"
      {...props}
    >
      {/* A travelling highlight reads as "loading" more clearly than a pulse. */}
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-background/45 to-transparent" />
    </div>
  );
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2">
      <Loader2 className={cn('size-4 animate-spin text-muted-foreground', className)} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <Loader2 className="size-7 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{label}…</p>
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2.5 p-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="flex items-center justify-between pt-1.5">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-3">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton key={colIndex} className={cn('h-9', colIndex === 0 ? 'flex-[2]' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-32" />
      <Skeleton className="mt-3 h-3 w-20" />
    </div>
  );
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="flex items-end gap-2 px-2" style={{ height }}>
      {/* Deterministic heights -- a random pattern flickers on every re-render. */}
      {[45, 68, 38, 82, 56, 74, 48, 90, 62, 52, 78, 42].map((value, index) => (
        <Skeleton key={index} className="flex-1 rounded-t-md" style={{ height: `${value}%` }} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ EmptyState ---

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground [&_svg]:size-6">
        {icon ?? <Inbox />}
      </div>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ ErrorState ---

/**
 * Renders a caught query error. Distinguishes a genuine network failure from a
 * server-side rejection, because the useful next action differs.
 */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const isApiError = error instanceof ApiError;
  const isOffline = !isApiError && error instanceof Error && /fetch|network/i.test(error.message);

  const message = isApiError
    ? error.message
    : isOffline
      ? 'Could not reach the server. Check that the API is running and your connection is active.'
      : error instanceof Error
        ? error.message
        : 'An unexpected error occurred.';

  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)} role="alert">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive [&_svg]:size-6">
        {isOffline ? <WifiOff /> : <AlertTriangle />}
      </div>
      <h3 className="font-display text-base font-semibold">
        {isApiError && error.status === 403
          ? 'You do not have access to this'
          : isApiError && error.status === 404
            ? 'Not found'
            : isOffline
              ? 'Connection problem'
              : 'Something went wrong'}
      </h3>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          <RefreshCw />
          Try again
        </Button>
      )}
    </div>
  );
}

// --------------------------------------------------------------- inline alerts ---

const alertStyles = {
  info: 'border-primary/25 bg-primary/8 text-foreground',
  success: 'border-success/30 bg-success/10 text-foreground',
  warning: 'border-warning/35 bg-warning/10 text-foreground',
  error: 'border-destructive/30 bg-destructive/10 text-foreground',
};

export function Alert({
  variant = 'info',
  title,
  children,
  icon,
  className,
}: {
  variant?: keyof typeof alertStyles;
  title?: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-lg border p-3.5 text-sm', alertStyles[variant], className)}
    >
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn('text-[13px] leading-relaxed', title && 'mt-0.5 text-muted-foreground')}>{children}</div>}
      </div>
    </div>
  );
}
