import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges conditional class names and resolves conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ------------------------------------------------------------------ formatting ---

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const inrCompact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const formatCurrency = (value: number | null | undefined) => inrFormatter.format(value ?? 0);

/** ₹1.2L / ₹45.8K -- for KPI tiles and chart axes where space is tight. */
export const formatCurrencyCompact = (value: number | null | undefined) => inrCompact.format(value ?? 0);

export const formatNumber = (value: number | null | undefined) =>
  new Intl.NumberFormat('en-IN').format(value ?? 0);

export const formatCompact = (value: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value ?? 0);

export const formatPercent = (value: number | null | undefined, digits = 1) =>
  `${(value ?? 0).toFixed(digits)}%`;

export function formatDate(value: string | Date | null | undefined, style: 'short' | 'long' | 'full' = 'short') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  if (style === 'full') {
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (style === 'long') {
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  }
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** "3 days ago" / "in 2 hours" -- falls back to a date beyond a month. */
export function formatRelative(value: string | Date | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);

  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;

  if (absMs < minute) return 'just now';

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (absMs < hour) return rtf.format(Math.round(diffMs / minute), 'minute');
  if (absMs < day) return rtf.format(Math.round(diffMs / hour), 'hour');
  if (absMs < 30 * day) return rtf.format(Math.round(diffMs / day), 'day');
  return formatDate(date);
}

/** Turns SCREAMING_SNAKE enum values into readable labels. */
export const humanize = (value: string | null | undefined) =>
  !value ? '' : value.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

export const initials = (name: string | null | undefined) =>
  !name
    ? '?'
    : name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');

export const discountPercent = (mrp: number, price: number) =>
  mrp > 0 && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

/** Trailing-edge debounce, used by the search box and filter sliders. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, delay = 300) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Drops empty values so the URL never carries `?q=&category=`. */
export function toQueryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','));
      continue;
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const ORDER_STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  CONFIRMED: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
  PACKED: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300',
  SHIPPED: 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
  OUT_FOR_DELIVERY: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300',
  DELIVERED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  CANCELLED: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
  RETURNED: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
};

export const SEGMENT_STYLES: Record<string, string> = {
  NEW: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
  ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  LOYAL: 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
  AT_RISK: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  CHURNED: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
};

export const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
];
