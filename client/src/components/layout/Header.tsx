import * as React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Bell,
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  Milk,
  Moon,
  Package,
  ScaleIcon,
  Search,
  ShoppingCart,
  Sun,
  User as UserIcon,
  X,
} from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useCart } from '@/hooks/useCart';
import { useWishlistIds } from '@/hooks/useWishlist';
import { useCategories, useNotifications } from '@/hooks/useCatalog';
import { useCompare } from '@/context/CompareContext';
import { SearchBar } from './SearchBar';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/products', label: 'Shop' },
  { to: '/offers', label: 'Offers' },
  { to: '/about', label: 'About' },
];

export function Header() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { resolvedTheme, toggle } = useTheme();
  const { itemCount } = useCart();
  const { ids: wishlistIds } = useWishlistIds();
  const { count: compareCount } = useCompare();
  const { data: categories } = useCategories();
  const { data: notifications } = useNotifications();

  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  const unread = (notifications?.meta?.unread as number | undefined) ?? 0;

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // A drawer that survives navigation traps the user; close it on route change.
  React.useEffect(() => {
    if (!mobileOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const handleLogout = async () => {
    await logout();
    setMobileOpen(false);
    navigate('/');
  };

  return (
    <>
      <a href="#main" className="sr-only-focusable">
        Skip to main content
      </a>

      {/* Delivery promise strip */}
      <div className="hidden bg-primary text-primary-foreground md:block">
        <div className="container flex h-8 items-center justify-between text-[12px] font-medium">
          <p>Order before 10 pm · Delivered fresh by 6 am</p>
          <p className="flex items-center gap-4">
            <span>Free delivery above ₹499</span>
            <span aria-hidden="true">·</span>
            <a href="tel:+914222345678" className="hover:underline">
              +91 422 234 5678
            </a>
          </p>
        </div>
      </div>

      <header
        className={cn(
          'sticky top-0 z-40 w-full border-b border-border transition-shadow duration-200',
          scrolled ? 'glass shadow-soft' : 'bg-background',
        )}
      >
        <div className="container flex h-16 items-center gap-3">
          {/* --- brand --- */}
          <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="Thuthi Dairy home">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Milk className="size-5" />
            </span>
            <span className="hidden flex-col leading-none sm:flex">
              <span className="font-display text-[17px] font-extrabold tracking-tight">Thuthi Dairy</span>
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Farm fresh daily
              </span>
            </span>
          </Link>

          {/* --- desktop nav --- */}
          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  Categories
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuLabel>Shop by category</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {categories?.map((category) => (
                  <DropdownMenuItem key={category.id} asChild>
                    <Link to={`/products?category=${category.slug}`} className="flex justify-between">
                      <span>{category.name}</span>
                      <span className="text-xs text-muted-foreground">{category.productCount}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>

          {/* --- desktop search --- */}
          <div className="ml-auto hidden max-w-md flex-1 md:block">
            <SearchBar />
          </div>

          {/* --- actions --- */}
          <div className="ml-auto flex items-center gap-1 md:ml-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileSearchOpen((open) => !open)}
              aria-label="Search products"
              aria-expanded={mobileSearchOpen}
            >
              <Search />
            </Button>

            <Button variant="ghost" size="icon" onClick={toggle} aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}>
              {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
            </Button>

            {compareCount > 0 && (
              <Button variant="ghost" size="icon" asChild className="relative hidden sm:inline-flex">
                <Link to="/compare" aria-label={`Compare ${compareCount} products`}>
                  <ScaleIcon />
                  <CountBadge value={compareCount} />
                </Link>
              </Button>
            )}

            {isAuthenticated && (
              <>
                <Button variant="ghost" size="icon" asChild className="relative hidden sm:inline-flex">
                  <Link to="/account/wishlist" aria-label={`Wishlist, ${wishlistIds.length} items`}>
                    <Heart />
                    <CountBadge value={wishlistIds.length} />
                  </Link>
                </Button>

                <Button variant="ghost" size="icon" asChild className="relative">
                  <Link to="/account/notifications" aria-label={`Notifications, ${unread} unread`}>
                    <Bell />
                    <CountBadge value={unread} variant="destructive" />
                  </Link>
                </Button>
              </>
            )}

            <Button variant="ghost" size="icon" asChild className="relative">
              <Link to="/cart" aria-label={`Cart, ${itemCount} items`}>
                <ShoppingCart />
                <CountBadge value={itemCount} />
              </Link>
            </Button>

            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="ml-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" aria-label="Account menu">
                    <Avatar className="size-8">
                      {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
                      <AvatarFallback>{initials(user?.name)}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span className="truncate">{user?.name}</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">{user?.email}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  {isAdmin && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link to="/admin">
                          <LayoutDashboard />
                          Admin dashboard
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}

                  <DropdownMenuItem asChild>
                    <Link to="/account">
                      <LayoutDashboard />
                      My dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/account/orders">
                      <Package />
                      My orders
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/account/wishlist">
                      <Heart />
                      Wishlist
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/account/profile">
                      <UserIcon />
                      Profile & addresses
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={handleLogout}>
                    <LogOut />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="ml-1 hidden items-center gap-2 sm:flex">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/register">Sign up</Link>
                </Button>
              </div>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu />
            </Button>
          </div>
        </div>

        {/* --- mobile search drawer --- */}
        {mobileSearchOpen && (
          <div className="border-t border-border bg-background p-3 md:hidden">
            <SearchBar autoFocus onNavigate={() => setMobileSearchOpen(false)} />
          </div>
        )}
      </header>

      {/* --- mobile menu --- */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-0 flex h-full w-[86%] max-w-sm flex-col overflow-y-auto border-l border-border bg-background shadow-lift">
            <div className="flex items-center justify-between border-b border-border p-4">
              <span className="font-display font-bold">Menu</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X />
              </Button>
            </div>

            <nav className="flex-1 space-y-1 p-3" aria-label="Mobile">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-lg px-3 py-2.5 text-sm font-medium',
                      isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}

              <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Categories
              </p>
              {categories?.map((category) => (
                <Link
                  key={category.id}
                  to={`/products?category=${category.slug}`}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm hover:bg-muted"
                >
                  <span>{category.name}</span>
                  <span className="text-xs text-muted-foreground">{category.productCount}</span>
                </Link>
              ))}

              {isAuthenticated ? (
                <>
                  <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Account
                  </p>
                  {isAdmin && (
                    <Link to="/admin" onClick={() => setMobileOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-primary hover:bg-muted">
                      Admin dashboard
                    </Link>
                  )}
                  {[
                    { to: '/account', label: 'My dashboard' },
                    { to: '/account/orders', label: 'My orders' },
                    { to: '/account/wishlist', label: 'Wishlist' },
                    { to: '/account/profile', label: 'Profile & addresses' },
                  ].map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={() => setMobileOpen(false)}
                      className="block rounded-lg px-3 py-2.5 text-sm hover:bg-muted"
                    >
                      {link.label}
                    </Link>
                  ))}
                </>
              ) : (
                <div className="space-y-2 pt-4">
                  <Button className="w-full" asChild onClick={() => setMobileOpen(false)}>
                    <Link to="/register">Create an account</Link>
                  </Button>
                  <Button variant="outline" className="w-full" asChild onClick={() => setMobileOpen(false)}>
                    <Link to="/login">Sign in</Link>
                  </Button>
                </div>
              )}
            </nav>

            {isAuthenticated && (
              <div className="border-t border-border p-3">
                <Button variant="outline" className="w-full" onClick={handleLogout}>
                  <LogOut />
                  Sign out
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Small count bubble on an icon button. Renders nothing at zero. */
function CountBadge({ value, variant = 'default' }: { value: number; variant?: 'default' | 'destructive' }) {
  if (value <= 0) return null;
  return (
    <Badge
      variant={variant}
      size="sm"
      className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full p-0 text-[9px] tabular-nums"
    >
      {value > 99 ? '99+' : value}
    </Badge>
  );
}
