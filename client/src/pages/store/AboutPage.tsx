import { Link } from 'react-router-dom';
import { Award, Leaf, MapPin, ShieldCheck, Truck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductImage } from '@/components/product/ProductImage';

const VALUES = [
  { icon: <Leaf />, title: 'Farm-first sourcing', body: 'We work directly with farmers we know by name, within a 40km radius of our dairy.' },
  { icon: <ShieldCheck />, title: 'No shortcuts on quality', body: 'Pasteurised the same day it is collected. No preservatives, no chemical additives, ever.' },
  { icon: <Truck />, title: 'Cold chain, always', body: 'Insulated crates and temperature logging from the dairy to your doorstep.' },
  { icon: <Users />, title: 'Community-owned', body: 'A portion of every order supports the farming families who supply us.' },
];

const STATS = [
  { value: '15+', label: 'Years in dairy' },
  { value: '200+', label: 'Partner farms' },
  { value: '50,000+', label: 'Happy customers' },
  { value: '99.2%', label: 'On-time delivery' },
];

export default function AboutPage() {
  return (
    <div>
      {/* --- hero --- */}
      <section className="relative h-[320px] overflow-hidden sm:h-[400px]">
        <ProductImage
          src="https://images.unsplash.com/photo-1500595046743-cd271d694d30?auto=format&fit=crop&w=1600&q=70"
          alt=""
          className="size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
        <div className="container absolute inset-0 flex flex-col justify-end pb-12">
          <h1 className="max-w-xl font-display text-3xl font-bold text-white sm:text-4xl">
            A dairy business built on trust, not scale.
          </h1>
          <p className="mt-3 max-w-lg text-white/85">
            Thuthi Dairy Private Limited started with one delivery route and a promise: milk that reaches you the way
            it left the farm.
          </p>
        </div>
      </section>

      {/* --- stats --- */}
      <section className="container -mt-8 relative z-10">
        <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-6 shadow-lift sm:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-display text-2xl font-bold text-primary sm:text-3xl">{stat.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --- story --- */}
      <section className="container mt-16 grid gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">Our story</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Thuthi Dairy began as a single milk route serving a handful of families in Coimbatore who wanted milk that
            hadn't spent days in cold storage. We built relationships with local dairy farmers first, and the
            distribution network second — a decision that still shapes how we operate today.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Every product we sell — from our everyday toned milk to our slow-cooked bilona ghee — is made in small
            batches, tested for quality, and delivered within hours of being ready. We don't chase shelf life; we
            chase freshness.
          </p>
          <Button asChild className="mt-6">
            <Link to="/products">Explore our products</Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ProductImage
            src="https://images.unsplash.com/photo-1544967082-d9d25d867d66?auto=format&fit=crop&w=500&q=70"
            alt=""
            className="aspect-square rounded-xl object-cover shadow-soft"
          />
          <ProductImage
            src="https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=500&q=70"
            alt=""
            className="mt-8 aspect-square rounded-xl object-cover shadow-soft"
          />
        </div>
      </section>

      {/* --- values --- */}
      <section className="container mt-16">
        <h2 className="mb-8 text-center font-display text-2xl font-bold tracking-tight">What we stand for</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((value) => (
            <div key={value.title} className="rounded-xl border border-border bg-card p-5 text-center shadow-soft">
              <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">
                {value.icon}
              </span>
              <h3 className="mt-4 font-semibold">{value.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{value.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --- location --- */}
      <section className="container my-16">
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center shadow-soft sm:flex-row sm:text-left">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MapPin className="size-6" />
          </span>
          <div>
            <h3 className="font-display text-lg font-bold">Visit our processing facility</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Thuthiyur Road, Coimbatore, Tamil Nadu 641004 · Open for scheduled tours on weekends
            </p>
          </div>
          <span className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-semibold text-success sm:flex">
            <Award className="size-3.5" />
            FSSAI Certified
          </span>
        </div>
      </section>
    </div>
  );
}
