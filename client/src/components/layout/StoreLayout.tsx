import { Outlet, useLocation } from 'react-router-dom';
import * as React from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { CompareTray } from './CompareTray';

/**
 * Chrome shared by every storefront route. Also owns the "scroll to top on
 * navigation" behaviour -- without it, following a link from halfway down a long
 * product grid lands the user mid-page on the next screen.
 */
export function StoreLayout() {
  const { pathname } = useLocation();

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <CompareTray />
    </div>
  );
}
