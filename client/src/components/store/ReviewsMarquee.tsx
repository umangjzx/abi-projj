import { Star } from 'lucide-react';
import { initials } from '@/lib/utils';

/**
 * Static social-proof strip on the home page. Deliberately not wired to the
 * live reviews API: this is marketing copy, not a data-bound "recent reviews"
 * feed (which lives on each product page instead).
 */
const TESTIMONIALS = [
  { name: 'Priya Raghavan', rating: 5, text: 'Genuinely fresh milk — the difference is obvious the moment you boil it.' },
  { name: 'Arun Kumar', rating: 5, text: 'Third month ordering and quality has not slipped once.' },
  { name: 'Ananya Iyer', rating: 4, text: 'The A2 ghee is worth every rupee. Tastes like my grandmother made it.' },
  { name: 'Karthik Rajan', rating: 5, text: 'Delivered before 6am, every single time. Never missed a slot.' },
  { name: 'Divya Krishnan', rating: 5, text: 'My kids only drink this milk now. No complaints from anyone at home.' },
  { name: 'Sneha Patel', rating: 4, text: 'Great paneer — soft and fresh, perfect for weekend cooking.' },
];

export function ReviewsMarquee() {
  // Duplicated once so the CSS animation can loop seamlessly at -50%.
  const items = [...TESTIMONIALS, ...TESTIMONIALS];

  return (
    <div className="overflow-hidden">
      <div className="container mb-5">
        <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">What our customers say</h2>
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent" />

        <div className="flex w-max animate-marquee gap-4 hover:[animation-play-state:paused]">
          {items.map((item, index) => (
            <div key={index} className="w-72 shrink-0 rounded-xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
                  {initials(item.name)}
                </span>
                <div>
                  <p className="text-sm font-semibold">{item.name}</p>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`size-3 ${i < item.rating ? 'fill-amber-400 text-amber-400' : 'text-muted'}`} />
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">"{item.text}"</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
