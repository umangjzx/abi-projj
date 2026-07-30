import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Package, PercentCircle, ShieldAlert, Star, Trash2 } from 'lucide-react';
import { cn, formatRelative } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, PageLoader } from '@/components/ui/feedback';
import { useNotifications } from '@/hooks/useCatalog';
import { api } from '@/lib/api';

const ICONS: Record<string, React.ReactNode> = {
  ORDER_PLACED: <Package />,
  ORDER_STATUS: <Package />,
  LOW_STOCK: <ShieldAlert />,
  OUT_OF_STOCK: <ShieldAlert />,
  NEW_OFFER: <PercentCircle />,
  REVIEW: <Star />,
  ACCOUNT: <Bell />,
  SYSTEM: <Bell />,
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useNotifications();

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  if (isLoading) return <PageLoader />;

  const notifications = data?.data;
  const unread = (data?.meta?.unread as number | undefined) ?? 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">{unread} unread notification(s)</p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()}>
            Mark all as read
          </Button>
        )}
      </div>

      {!notifications || notifications.length === 0 ? (
        <EmptyState icon={<BellOff />} title="No notifications" description="You're all caught up!" />
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => {
            const content = (
              <div
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4 transition-colors',
                  notification.isRead ? 'border-border bg-card' : 'border-primary/30 bg-primary/5',
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">
                  {ICONS[notification.type] ?? <Bell />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{notification.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{notification.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatRelative(notification.createdAt)}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    remove.mutate(notification.id);
                  }}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Delete notification"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );

            return notification.link ? (
              <Link key={notification.id} to={notification.link} onClick={() => !notification.isRead && markRead.mutate(notification.id)}>
                {content}
              </Link>
            ) : (
              <div key={notification.id} onClick={() => !notification.isRead && markRead.mutate(notification.id)}>
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
