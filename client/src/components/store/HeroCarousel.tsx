import * as React from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProductImage } from '@/components/product/ProductImage';
import { Button } from '@/components/ui/button';
import type { Offer } from '@/types';

const FALLBACK_SLIDES: Offer[] = [
  {
    id: 'fallback-1',
    title: 'Farm to doorstep before sunrise',
    subtitle: 'Order by 10pm, delivered by 6am',
    description: 'Milk collected in the evening reaches your door before breakfast.',
    bannerUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=1400&q=70',
    ctaLabel: 'Shop milk',
    ctaHref: '/products?category=milk',
    type: 'BANNER',
    discountPercent: null,
    priority: 0,
    startsAt: new Date().toISOString(),
    endsAt: null,
    isActive: true,
    category: null,
    product: null,
  },
];

/**
 * Auto-advancing hero carousel driven by the active-offers endpoint. Pauses on
 * hover/focus so a promo doesn't scroll away mid-read, and exposes manual
 * controls for anyone who prefers not to wait.
 */
export function HeroCarousel({ offers }: { offers?: Offer[] }) {
  const slides = offers && offers.length > 0 ? offers : FALLBACK_SLIDES;
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => setIndex((i) => (i >= slides.length ? 0 : i)), [slides.length]);

  React.useEffect(() => {
    if (paused || slides.length <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(timer);
  }, [paused, slides.length]);

  const go = (delta: 1 | -1) => setIndex((i) => (i + delta + slides.length) % slides.length);
  const slide = slides[index];

  return (
    <div
      className="group relative h-[280px] overflow-hidden rounded-2xl shadow-lift sm:h-[360px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      role="region"
      aria-roledescription="carousel"
      aria-label="Promotions"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={slide.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0"
        >
          <ProductImage src={slide.bannerUrl} alt="" className="size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent sm:bg-gradient-to-r" />

          <div className="absolute inset-0 flex flex-col justify-end p-6 sm:justify-center sm:p-12">
            <div className="max-w-md">
              {slide.discountPercent && (
                <span className="mb-2 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
                  {slide.discountPercent}% OFF
                </span>
              )}
              <h2 className="font-display text-2xl font-bold leading-tight text-white sm:text-4xl">{slide.title}</h2>
              {slide.subtitle && <p className="mt-1.5 text-sm font-medium text-white/85 sm:text-base">{slide.subtitle}</p>}
              {slide.description && <p className="mt-2 hidden text-sm text-white/75 sm:block">{slide.description}</p>}
              {slide.ctaLabel && (
                <Button size="lg" variant="secondary" asChild className="mt-5">
                  <Link to={slide.ctaHref ?? '/products'}>{slide.ctaLabel}</Link>
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {slides.length > 1 && (
        <>
          <button
            onClick={() => go(-1)}
            aria-label="Previous slide"
            className="absolute left-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-white/25 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            onClick={() => go(1)}
            aria-label="Next slide"
            className="absolute right-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-white/25 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <ChevronRight className="size-5" />
          </button>

          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index}
                className={cn('h-1.5 rounded-full bg-white/50 transition-all', i === index ? 'w-6 bg-white' : 'w-1.5')}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
