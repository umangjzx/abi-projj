/** URL-safe slug: lowercase, accent-stripped, hyphen separated. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Human-readable, sortable order number: TD-20260730-0007.
 * The date prefix makes support lookups easy; the sequence is scoped per day.
 */
export function buildOrderNumber(date: Date, sequence: number): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `TD-${y}${m}${d}-${String(sequence).padStart(4, '0')}`;
}

/** Deterministic SKU, e.g. MLK-TON-500ML. */
export function buildSku(...parts: (string | number | undefined | null)[]): string {
  return parts
    .filter((p) => p !== undefined && p !== null && String(p).length > 0)
    .map((p) =>
      String(p)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6),
    )
    .join('-');
}
