import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Scale, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompare } from '@/context/CompareContext';

/**
 * Floating bar summarising the comparison list. Appears only when something is
 * selected, and hides itself on the comparison page where it would be redundant.
 */
export function CompareTray() {
  const { ids, count, clear } = useCompare();
  const { pathname } = useLocation();

  const visible = count > 0 && pathname !== '/compare';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2"
          role="region"
          aria-label="Product comparison"
        >
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-lift">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Scale className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {count} product{count === 1 ? '' : 's'} to compare
              </p>
              <p className="text-[12px] text-muted-foreground">
                {count < 2 ? 'Add at least one more to compare' : 'Ready to compare side by side'}
              </p>
            </div>
            <Button size="sm" asChild disabled={count < 2}>
              <Link to="/compare">Compare</Link>
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={clear} aria-label="Clear comparison list">
              <X />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
