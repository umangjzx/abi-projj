import * as React from 'react';
import { useToast } from '@/components/ui/toast';

const STORAGE_KEY = 'thuthi-compare';
const MAX_ITEMS = 4;

interface CompareContextValue {
  ids: string[];
  count: number;
  has: (productId: string) => boolean;
  toggle: (productId: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
  isFull: boolean;
}

const CompareContext = React.createContext<CompareContextValue | null>(null);

export function useCompare() {
  const context = React.useContext(CompareContext);
  if (!context) throw new Error('useCompare must be used inside <CompareProvider>');
  return context;
}

/**
 * Product comparison list. Held client-side in localStorage rather than on the
 * server: it is a transient browsing aid, works for anonymous visitors, and
 * needs no round trip to toggle.
 */
export function CompareProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();

  const [ids, setIds] = React.useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      // Guard against hand-edited or corrupted storage.
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string').slice(0, MAX_ITEMS) : [];
    } catch {
      return [];
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // Storage can be full or blocked in private mode -- comparison still works
      // for this session, it just will not persist.
    }
  }, [ids]);

  const toggle = React.useCallback(
    (productId: string) => {
      setIds((current) => {
        if (current.includes(productId)) return current.filter((id) => id !== productId);
        if (current.length >= MAX_ITEMS) {
          toast.warning(`You can compare up to ${MAX_ITEMS} products`, 'Remove one to add another.');
          return current;
        }
        return [...current, productId];
      });
    },
    [toast],
  );

  const value = React.useMemo<CompareContextValue>(
    () => ({
      ids,
      count: ids.length,
      has: (productId: string) => ids.includes(productId),
      toggle,
      remove: (productId: string) => setIds((current) => current.filter((id) => id !== productId)),
      clear: () => setIds([]),
      isFull: ids.length >= MAX_ITEMS,
    }),
    [ids, toggle],
  );

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}
