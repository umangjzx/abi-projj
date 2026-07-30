import * as React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Clock, ShieldCheck, Sparkles, Star, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductRail } from '@/components/product/ProductRail';
import { useActiveOffers, useCategories } from '@/hooks/useCatalog';
import { useHomeRails } from '@/hooks/useCatalog';
import { useAuth } from '@/context/AuthContext';
import { ProductImage } from '@/components/product/ProductImage';
import { HeroCarousel } from '@/components/store/HeroCarousel';
import { CategoryStrip } from '@/components/store/CategoryStrip';
import { ReviewsMarquee } from '@/components/store/ReviewsMarquee';

const TRUST_STRIP = [
  { icon: <Truck />, title: 'Before-breakfast delivery', body: 'Order by 10pm, delivered by 6am' },
  { icon: <ShieldCheck />, title: 'Quality guaranteed', body: 'Farm-fresh, no preservatives' },
  { icon: <Clock />, title: 'Same-day collection', body: 'Nothing sits overnight' },
  { icon: <Star />, title: '4.7 average rating', body: 'From 1,000+ reviews' },
];

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const { data: offers } = useActiveOffers();
  const { data: categories } = useCategories();
  const { data: rails, isLoading: railsLoading } = useHomeRails();

  return (
    <div className="pb-16">
      <section className="container pt-6">
        <HeroCarousel offers={offers} />
      </section>

      {/* --- trust strip --- */}
      <section className="container mt-8">
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 shadow-soft sm:grid-cols-4 sm:p-5">
          {TRUST_STRIP.map((item) => (
            <div key={item.title} className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">
                {item.icon}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{item.title}</p>
                <p className="truncate text-[12px] text-muted-foreground">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* --- categories --- */}
      <section className="container mt-12">
        <h2 className="mb-4 font-display text-xl font-bold tracking-tight sm:text-2xl">Shop by category</h2>
        <CategoryStrip categories={categories} />
      </section>

      {/* --- personalised recommendations --- */}
      {isAuthenticated && (rails?.personalised?.length ?? 0) > 0 && (
        <section className="container mt-12">
          <ProductRail
            title="Picked for you"
            description="Based on what you order and browse"
            icon={<Sparkles />}
            products={rails?.personalised}
            isLoading={railsLoading}
          />
        </section>
      )}

      {/* --- featured --- */}
      <section className="container mt-12">
        <ProductRail
          title="Featured products"
          description="Our most-loved items this month"
          products={rails?.featured}
          isLoading={railsLoading}
          viewAllHref="/products?featured=true"
        />
      </section>

      {/* --- promo banner --- */}
      <section className="container mt-12">
        <PromoBanner />
      </section>

      {/* --- best sellers --- */}
      <section className="container mt-12">
        <ProductRail
          title="Best sellers"
          description="What everyone is ordering right now"
          products={rails?.bestSellers}
          isLoading={railsLoading}
          viewAllHref="/products?sort=popular"
        />
      </section>

      {/* --- trending --- */}
      <section className="container mt-12">
        <ProductRail
          title="Trending this fortnight"
          products={rails?.trending}
          isLoading={railsLoading}
          viewAllHref="/products?sort=relevance"
        />
      </section>

      {/* --- new arrivals --- */}
      <section className="container mt-12">
        <ProductRail
          title="New arrivals"
          products={rails?.newArrivals}
          isLoading={railsLoading}
          viewAllHref="/products?sort=newest"
        />
      </section>

      {/* --- reviews --- */}
      <section className="mt-14">
        <ReviewsMarquee />
      </section>

      {/* --- CTA --- */}
      {!isAuthenticated && (
        <section className="container mt-14">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-teal-600 to-emerald-700 px-6 py-10 text-center sm:px-12 sm:py-14"
          >
            <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_2px_2px,white_1.5px,transparent_0)] [background-size:28px_28px]" />
            <div className="relative">
              <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">Get ₹50 off your first order</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-white/85">
                Sign up in under a minute and use code <span className="font-semibold">WELCOME50</span> at checkout.
              </p>
              <Button size="lg" variant="secondary" asChild className="mt-6">
                <Link to="/register">
                  Create your account
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          </motion.div>
        </section>
      )}
    </div>
  );
}

function PromoBanner() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link
        to="/products?category=butter-ghee"
        className="group relative flex h-44 items-end overflow-hidden rounded-xl bg-amber-950 p-6 shadow-soft"
      >
        <ProductImage
          src="https://images.unsplash.com/photo-1631206753348-db44968fd440?auto=format&fit=crop&w=900&q=60"
          alt=""
          className="absolute inset-0 size-full object-cover opacity-70 transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="relative">
          <p className="font-display text-lg font-bold text-white">Bilona Ghee, hand-churned</p>
          <p className="text-sm text-white/80">30 litres of milk in every litre</p>
        </div>
      </Link>
      <Link
        to="/products?category=beverages"
        className="group relative flex h-44 items-end overflow-hidden rounded-xl bg-sky-950 p-6 shadow-soft"
      >
        <ProductImage
          src="https://images.unsplash.com/photo-1553909489-cd47e0907980?auto=format&fit=crop&w=900&q=60"
          alt=""
          className="absolute inset-0 size-full object-cover opacity-70 transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="relative">
          <p className="font-display text-lg font-bold text-white">Beat the heat</p>
          <p className="text-sm text-white/80">Lassi, buttermilk & flavoured milk</p>
        </div>
      </Link>
    </div>
  );
}
