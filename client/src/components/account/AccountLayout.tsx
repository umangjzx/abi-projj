import { NavLink, Outlet } from 'react-router-dom';
import { Bell, Heart, LayoutDashboard, Package, Star, User as UserIcon } from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/badge';
import { SEGMENT_STYLES } from '@/lib/utils';

const NAV = [
  { to: '/account', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/account/orders', label: 'My Orders', icon: Package },
  { to: '/account/wishlist', label: 'Wishlist', icon: Heart },
  { to: '/account/reviews', label: 'My Reviews', icon: Star },
  { to: '/account/notifications', label: 'Notifications', icon: Bell },
  { to: '/account/profile', label: 'Profile & Addresses', icon: UserIcon },
];

export function AccountLayout() {
  const { user } = useAuth();

  return (
    <div className="container py-8">
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
                <AvatarFallback className="text-sm">{initials(user?.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-display font-semibold">{user?.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            {user?.segment && (
              <Badge className={cn('mt-3 w-fit', SEGMENT_STYLES[user.segment])} variant="outline">
                {user.segment.replace('_', ' ')}
              </Badge>
            )}
          </div>

          <nav className="mt-4 space-y-1 rounded-xl border border-border bg-card p-2 shadow-soft" aria-label="Account">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
