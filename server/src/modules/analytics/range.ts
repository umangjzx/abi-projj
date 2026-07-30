export interface DateRange {
  from: Date;
  to: Date;
  /** Same-length window immediately before `from`, for period-over-period deltas. */
  previousFrom: Date;
  previousTo: Date;
  days: number;
}

const DAY_MS = 86_400_000;

/**
 * Normalises `?from=&to=&period=` into an inclusive range plus the matching
 * previous period. Defaults to the last 30 days.
 *
 * `period` accepts 7d / 30d / 90d / 6m / 12m / mtd / ytd and wins over
 * explicit from/to when supplied.
 */
export function parseRange(query: Record<string, unknown>): DateRange {
  const now = new Date();
  let to = endOfDay(now);
  let from: Date;

  const period = typeof query.period === 'string' ? query.period : undefined;

  if (period) {
    from = startOfDay(resolvePeriod(period, now));
  } else if (typeof query.from === 'string' && query.from) {
    from = startOfDay(new Date(query.from));
    if (typeof query.to === 'string' && query.to) to = endOfDay(new Date(query.to));
  } else {
    from = startOfDay(new Date(now.getTime() - 29 * DAY_MS));
  }

  // Guard against a reversed range from a mis-set date picker.
  if (from > to) [from, to] = [startOfDay(to), endOfDay(from)];

  const span = Math.max(DAY_MS, to.getTime() - from.getTime());
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - span);

  return {
    from,
    to,
    previousFrom,
    previousTo,
    days: Math.max(1, Math.round(span / DAY_MS)),
  };
}

function resolvePeriod(period: string, now: Date): Date {
  switch (period) {
    case '7d':
      return new Date(now.getTime() - 6 * DAY_MS);
    case '30d':
      return new Date(now.getTime() - 29 * DAY_MS);
    case '90d':
      return new Date(now.getTime() - 89 * DAY_MS);
    case '6m': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      return d;
    }
    case '12m': {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d;
    }
    case 'mtd':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'ytd':
      return new Date(now.getFullYear(), 0, 1);
    default:
      return new Date(now.getTime() - 29 * DAY_MS);
  }
}

export const startOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const endOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

/** Chooses a sensible bucket size so a 12-month chart is not 365 points wide. */
export const granularityFor = (days: number): 'day' | 'week' | 'month' =>
  days <= 45 ? 'day' : days <= 180 ? 'week' : 'month';

export const toISODate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Fills gaps in a time series so charts show real zeros instead of
 * interpolating across days with no orders.
 */
export function fillSeries<T extends Record<string, number>>(
  rows: { date: string }[] & Array<{ date: string } & Partial<T>>,
  from: Date,
  to: Date,
  granularity: 'day' | 'week' | 'month',
  zero: T,
): (T & { date: string })[] {
  const existing = new Map(rows.map((r) => [r.date, r]));
  const out: (T & { date: string })[] = [];
  const cursor = new Date(from);

  if (granularity === 'month') cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);

  let guard = 0;
  while (cursor <= to && guard++ < 800) {
    const key = toISODate(cursor);
    out.push({ ...zero, ...(existing.get(key) as T | undefined), date: key });

    if (granularity === 'day') cursor.setDate(cursor.getDate() + 1);
    else if (granularity === 'week') cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }

  return out;
}
