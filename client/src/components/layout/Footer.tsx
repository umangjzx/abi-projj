import { Link } from 'react-router-dom';
import { Clock, Facebook, Instagram, Mail, MapPin, Milk, Phone, ShieldCheck, Truck, Twitter } from 'lucide-react';
import { useCategories } from '@/hooks/useCatalog';

const TRUST_POINTS = [
  { icon: <Truck />, title: 'Before-breakfast delivery', body: 'Order by 10 pm, at your door by 6 am.' },
  { icon: <ShieldCheck />, title: 'Cold chain maintained', body: 'Insulated, temperature-logged crates.' },
  { icon: <Clock />, title: 'Same-day fresh', body: 'Nothing sits in a warehouse overnight.' },
  { icon: <Milk />, title: 'No preservatives', body: 'Pasteurised, never chemically treated.' },
];

export function Footer() {
  const { data: categories } = useCategories();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border bg-card">
      {/* --- trust strip --- */}
      <div className="border-b border-border">
        <div className="container grid gap-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_POINTS.map((point) => (
            <div key={point.title} className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">
                {point.icon}
              </span>
              <div>
                <p className="text-sm font-semibold">{point.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{point.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="container grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-4">
        {/* --- brand --- */}
        <div>
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Milk className="size-5" />
            </span>
            <span className="font-display text-[17px] font-extrabold tracking-tight">Thuthi Dairy</span>
          </Link>
          <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
            A dairy business built on short supply chains. We collect from farms we know, pasteurise the same day, and
            deliver before you wake up.
          </p>
          <div className="mt-5 flex items-center gap-2">
            {[
              { icon: <Facebook className="size-4" />, label: 'Facebook' },
              { icon: <Instagram className="size-4" />, label: 'Instagram' },
              { icon: <Twitter className="size-4" />, label: 'Twitter' },
            ].map((social) => (
              <a
                key={social.label}
                href="#"
                aria-label={social.label}
                className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {social.icon}
              </a>
            ))}
          </div>
        </div>

        {/* --- shop --- */}
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Shop</h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <Link to="/products" className="text-muted-foreground transition-colors hover:text-primary">
                All products
              </Link>
            </li>
            {categories?.slice(0, 6).map((category) => (
              <li key={category.id}>
                <Link
                  to={`/products?category=${category.slug}`}
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* --- account & help --- */}
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Your account</h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            {[
              { to: '/account', label: 'Dashboard' },
              { to: '/account/orders', label: 'Track an order' },
              { to: '/account/wishlist', label: 'Wishlist' },
              { to: '/account/profile', label: 'Profile & addresses' },
              { to: '/offers', label: 'Offers & coupons' },
              { to: '/about', label: 'About us' },
            ].map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-muted-foreground transition-colors hover:text-primary">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* --- contact --- */}
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Get in touch</h3>
          <ul className="mt-4 space-y-3 text-[13px]">
            <li className="flex gap-2.5 text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Thuthi Dairy Private Limited
                <br />
                Thuthiyur Road, Coimbatore
                <br />
                Tamil Nadu 641004, India
              </span>
            </li>
            <li>
              <a href="tel:+914222345678" className="flex items-center gap-2.5 text-muted-foreground hover:text-primary">
                <Phone className="size-4 shrink-0 text-primary" />
                +91 422 234 5678
              </a>
            </li>
            <li>
              <a
                href="mailto:support@thuthidairy.com"
                className="flex items-center gap-2.5 text-muted-foreground hover:text-primary"
              >
                <Mail className="size-4 shrink-0 text-primary" />
                support@thuthidairy.com
              </a>
            </li>
            <li className="flex gap-2.5 text-muted-foreground">
              <Clock className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Orders: 24×7 online
                <br />
                Support: 8 am – 8 pm daily
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="container flex flex-col items-center justify-between gap-3 py-5 text-[12px] text-muted-foreground sm:flex-row">
          <p>© {year} Thuthi Dairy Private Limited. All rights reserved.</p>
          <p className="flex items-center gap-4">
            <span>Privacy policy</span>
            <span>Terms of service</span>
            <span>FSSAI Lic. 10012345678901</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
