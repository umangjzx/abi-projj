import { Check } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import type { OrderTracking } from '@/types';

/**
 * Horizontal stepper for order status. Renders nothing but a plain message for
 * cancelled/returned orders since a linear progress bar would misleadingly
 * imply the order is still advancing toward delivery.
 */
export function OrderTracker({ tracking }: { tracking: OrderTracking }) {
  if (tracking.isTerminal) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center">
        <p className="font-semibold text-destructive">
          This order was {tracking.status === 'CANCELLED' ? 'cancelled' : 'returned'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center justify-between">
        {tracking.stages.map((stage, index) => (
          <div key={stage.status} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {index > 0 && (
                <div className={cn('h-0.5 flex-1', tracking.stages[index - 1].complete ? 'bg-primary' : 'bg-border')} />
              )}
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                  stage.complete
                    ? 'border-primary bg-primary text-primary-foreground'
                    : stage.current
                      ? 'border-primary text-primary animate-pulse'
                      : 'border-border text-muted-foreground',
                )}
              >
                {stage.complete ? <Check className="size-4" /> : index + 1}
              </span>
              {index < tracking.stages.length - 1 && (
                <div className={cn('h-0.5 flex-1', stage.complete ? 'bg-primary' : 'bg-border')} />
              )}
            </div>
            <p className={cn('mt-2 text-center text-[11px] font-medium', stage.complete || stage.current ? 'text-foreground' : 'text-muted-foreground')}>
              {stage.label}
            </p>
            {stage.at && <p className="text-center text-[10px] text-muted-foreground">{formatDate(stage.at)}</p>}
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Estimated delivery: <span className="font-medium text-foreground">{formatDate(tracking.estimatedDelivery, 'long')}</span>
      </p>
    </div>
  );
}
