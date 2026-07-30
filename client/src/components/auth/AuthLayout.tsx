import { Link } from 'react-router-dom';
import { Milk, ShieldCheck, Sparkles, Truck } from 'lucide-react';

const HIGHLIGHTS = [
  { icon: <Truck />, text: 'Farm-fresh delivery before 6 am' },
  { icon: <Sparkles />, text: 'Personalised recommendations from day one' },
  { icon: <ShieldCheck />, text: 'Secure checkout, every time' },
];

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="mb-8 flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Milk className="size-5" />
            </span>
            <span className="font-display text-[17px] font-extrabold tracking-tight">Thuthi Dairy</span>
          </Link>

          <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>

          <div className="mt-8">{children}</div>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-teal-600 to-emerald-700 lg:flex lg:flex-col lg:justify-end lg:p-12">
        <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_2px_2px,white_1.5px,transparent_0)] [background-size:28px_28px]" />
        <div className="relative">
          <p className="font-display text-3xl font-bold leading-tight text-white">
            Farm fresh dairy, <br /> delivered before breakfast.
          </p>
          <div className="mt-8 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <div key={item.text} className="flex items-center gap-3 text-white/90">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm [&_svg]:size-4">
                  {item.icon}
                </span>
                <span className="text-sm font-medium">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
