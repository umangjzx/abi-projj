import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Search, TrendingUp, X } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useSuggestions } from '@/hooks/useCatalog';
import { ProductImage } from '@/components/product/ProductImage';

const RECENT_KEY = 'thuthi-recent-searches';
const MAX_RECENT = 5;

export interface SearchBarProps {
  autoFocus?: boolean;
  onNavigate?: () => void;
  className?: string;
}

/**
 * Smart search with a debounced typeahead.
 *
 * Keyboard support is the important part: ↑/↓ move through results, Enter opens
 * the highlighted one (or runs a full search), Escape closes. Without it the
 * dropdown is unusable without a mouse.
 */
export function SearchBar({ autoFocus, onNavigate, className }: SearchBarProps) {
  const navigate = useNavigate();
  const [term, setTerm] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const [recent, setRecent] = React.useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  });

  // Debounce so a fast typist triggers one request, not one per keystroke.
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 280);
    return () => clearTimeout(timer);
  }, [term]);

  const { data, isFetching } = useSuggestions(debounced);

  const results = React.useMemo(
    () => [
      ...(data?.categories ?? []).map((c) => ({ kind: 'category' as const, id: c.id, label: c.name, href: `/products?category=${c.slug}` })),
      ...(data?.products ?? []).map((p) => ({
        kind: 'product' as const,
        id: p.id,
        label: p.name,
        href: `/products/${p.slug}`,
        image: p.image,
        category: p.category,
        price: p.price,
      })),
    ],
    [data],
  );

  React.useEffect(() => setHighlighted(-1), [results]);

  // Close when focus or a click leaves the component.
  React.useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const rememberSearch = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 2) return;
    const next = [trimmed, ...recent.filter((r) => r.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* private mode -- recent searches just will not persist */
    }
  };

  const go = (href: string, searchTerm?: string) => {
    if (searchTerm) rememberSearch(searchTerm);
    setOpen(false);
    onNavigate?.();
    navigate(href);
  };

  const submitSearch = () => {
    const trimmed = term.trim();
    if (!trimmed) return;
    go(`/products?q=${encodeURIComponent(trimmed)}`, trimmed);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % Math.max(1, results.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => (current <= 0 ? results.length - 1 : current - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = results[highlighted];
      if (selected) go(selected.href, term);
      else submitSearch();
    }
  };

  const showRecent = open && term.trim().length < 2 && recent.length > 0;
  const showResults = open && term.trim().length >= 2;

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div className="relative">
        <Input
          type="search"
          role="combobox"
          aria-expanded={showResults || showRecent}
          aria-controls="search-suggestions"
          aria-autocomplete="list"
          autoFocus={autoFocus}
          placeholder="Search milk, curd, paneer, ghee…"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          icon={<Search />}
          className="pr-9"
        />
        {term && (
          <button
            type="button"
            onClick={() => {
              setTerm('');
              setOpen(false);
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}
        {isFetching && (
          <Loader2 className="absolute right-8 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {(showResults || showRecent) && (
        <div
          id="search-suggestions"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-lift"
        >
          {showRecent && (
            <>
              <p className="flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Recent searches
                <button
                  type="button"
                  onClick={() => {
                    setRecent([]);
                    localStorage.removeItem(RECENT_KEY);
                  }}
                  className="normal-case tracking-normal hover:text-foreground"
                >
                  Clear
                </button>
              </p>
              {recent.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => go(`/products?q=${encodeURIComponent(item)}`, item)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent"
                >
                  <TrendingUp className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{item}</span>
                </button>
              ))}
            </>
          )}

          {showResults && results.length === 0 && !isFetching && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matches for “{term}”. Try a broader term.
            </p>
          )}

          {showResults &&
            results.map((result, index) => (
              <Link
                key={`${result.kind}-${result.id}`}
                to={result.href}
                role="option"
                aria-selected={index === highlighted}
                onClick={() => rememberSearch(term)}
                onMouseEnter={() => setHighlighted(index)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors',
                  index === highlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                )}
              >
                {result.kind === 'product' ? (
                  <>
                    <span className="relative size-9 shrink-0 overflow-hidden rounded-md bg-muted">
                      <ProductImage src={result.image} alt="" className="size-full object-cover" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{result.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{result.category}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold">{formatCurrency(result.price)}</span>
                  </>
                ) : (
                  <>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Search className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{result.label}</span>
                      <span className="block text-xs text-muted-foreground">Browse category</span>
                    </span>
                  </>
                )}
              </Link>
            ))}

          {showResults && term.trim().length >= 2 && (
            <button
              type="button"
              onClick={submitSearch}
              className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-border px-2 py-2.5 text-left text-sm font-medium text-primary hover:bg-accent"
            >
              <Search className="size-4" />
              See all results for “{term}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
