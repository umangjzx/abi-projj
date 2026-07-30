import { cn } from '@/lib/utils';

export interface HeatmapCell {
  day: string;
  dayIndex: number;
  hour: number;
  orders: number;
  revenue: number;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Order-density heat map: weekday x hour. Colour intensity is scaled against
 * the busiest single cell so the pattern stays readable regardless of overall
 * volume.
 */
export function Heatmap({ cells, maxOrders }: { cells: HeatmapCell[]; maxOrders: number }) {
  const byKey = new Map(cells.map((c) => [`${c.dayIndex}-${c.hour}`, c]));

  const intensity = (orders: number) => {
    if (maxOrders <= 0 || orders === 0) return 0;
    return Math.max(0.08, orders / maxOrders);
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="mb-1 flex gap-1 pl-12">
          {Array.from({ length: 24 }).map((_, hour) => (
            <div key={hour} className="w-6 flex-1 text-center text-[9px] text-muted-foreground">
              {hour % 3 === 0 ? hour : ''}
            </div>
          ))}
        </div>
        {DAYS.map((day, dayIndex) => (
          <div key={day} className="flex items-center gap-1">
            <div className="w-11 shrink-0 text-right text-[10px] font-medium text-muted-foreground">{day}</div>
            <div className="flex flex-1 gap-1">
              {Array.from({ length: 24 }).map((_, hour) => {
                const cell = byKey.get(`${dayIndex}-${hour}`);
                const alpha = intensity(cell?.orders ?? 0);
                return (
                  <div
                    key={hour}
                    title={`${day} ${hour}:00 — ${cell?.orders ?? 0} orders`}
                    className={cn('aspect-square flex-1 rounded-sm transition-colors', alpha === 0 && 'bg-muted')}
                    style={alpha > 0 ? { backgroundColor: `hsl(var(--chart-1) / ${alpha})` } : undefined}
                  />
                );
              })}
            </div>
          </div>
        ))}
        <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
          <span>Less</span>
          {[0.15, 0.4, 0.65, 0.9].map((alpha) => (
            <div key={alpha} className="size-3 rounded-sm" style={{ backgroundColor: `hsl(var(--chart-1) / ${alpha})` }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
