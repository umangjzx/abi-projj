import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { PageLoader, EmptyState } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

/**
 * Requires a signed-in user. Remembers where the visitor was heading so login
 * can send them back there instead of dumping them on the home page.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // The session is restored asynchronously on first load; redirecting before it
  // resolves would sign out anyone who refreshes a protected page.
  if (isLoading) return <PageLoader label="Checking your session" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  return <>{children}</>;
}

/** Requires the ADMIN role. Shows an explicit refusal rather than a 404. */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageLoader label="Checking your permissions" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  if (!isAdmin) {
    return (
      <div className="container py-20">
        <EmptyState
          icon={<ShieldAlert />}
          title="Administrator access only"
          description="Your account does not have permission to open the admin panel. If you believe this is a mistake, contact the store owner."
          action={
            <Button asChild>
              <Link to="/">Back to the store</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * For login/register: sends an already-signed-in visitor to where they belong
 * rather than showing them a sign-in form again.
 */
export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();

  if (isLoading) return <PageLoader />;
  if (isAuthenticated) return <Navigate to={isAdmin ? '/admin' : '/account'} replace />;

  return <>{children}</>;
}
