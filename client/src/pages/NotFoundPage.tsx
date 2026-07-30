import { Link } from 'react-router-dom';
import { Home, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-8xl font-black text-primary/20">404</p>
      <h1 className="mt-2 font-display text-2xl font-bold">This page has gone off the boil</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The page you're looking for doesn't exist or may have moved. Let's get you back to something fresh.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link to="/">
            <Home />
            Back home
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/products">
            <Search />
            Browse products
          </Link>
        </Button>
      </div>
    </div>
  );
}
