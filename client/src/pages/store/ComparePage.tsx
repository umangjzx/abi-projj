import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { Scale, ShoppingCart, Star, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, PageLoader } from '@/components/ui/feedback';
import { ProductImage } from '@/components/product/ProductImage';
import { useCompare } from '@/context/CompareContext';
import { useCart } from '@/hooks/useCart';
import { api } from '@/lib/api';
import type { Product } from '@/types';

export default function ComparePage() {
  const { ids, remove, clear } = useCompare();
  const { addItem } = useCart();

  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['product', id],
      queryFn: () => api.get<Product>(`/products/${id}`),
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const products = queries.map((q) => q.data).filter((p): p is Product => Boolean(p));

  if (ids.length === 0) {
    return (
      <div className="container py-16">
        <EmptyState
          icon={<Scale />}
          title="Nothing to compare yet"
          description="Add products to your comparison list from any product card or page."
          action={
            <Button asChild>
              <Link to="/products">Browse products</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (isLoading) return <PageLoader label="Loading products" />;

  // Attribute keys the union across all compared products carries.
  const attributeKeys = [...new Set(products.flatMap((p) => Object.keys(p.attributes)))];

  const rows: { label: string; render: (p: Product) => React.ReactNode }[] = [
    { label: 'Price', render: (p) => <span className="font-display text-lg font-bold">{formatCurrency(p.minPrice)}</span> },
    {
      label: 'Rating',
      render: (p) =>
        p.ratingCount > 0 ? (
          <span className="flex items-center gap-1">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            {p.avgRating.toFixed(1)} ({p.ratingCount})
          </span>
        ) : (
          <span className="text-muted-foreground">No ratings</span>
        ),
    },
    { label: 'Category', render: (p) => p.category?.name ?? '—' },
    { label: 'Brand', render: (p) => p.brand },
    {
      label: 'Availability',
      render: (p) => (p.inStock ? <span className="text-success">In stock</span> : <span className="text-destructive">Out of stock</span>),
    },
    ...attributeKeys.map((key) => ({
      label: key,
      render: (p: Product) => String(p.attributes[key] ?? '—'),
    })),
  ];

  return (
    <div className="container py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Compare products</h1>
          <p className="mt-1 text-sm text-muted-foreground">{products.length} product(s) side by side</p>
        </div>
        <Button variant="outline" size="sm" onClick={clear}>
          Clear all
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className="w-40 p-3 text-left text-xs font-semibold uppercase text-muted-foreground">Product</th>
              {products.map((product) => (
                <th key={product.id} className="p-3 align-top">
                  <div className="relative w-48">
                    <button
                      onClick={() => remove(product.id)}
                      className="absolute -right-1 -top-1 z-10 flex size-6 items-center justify-center rounded-full bg-card text-muted-foreground shadow-soft hover:text-destructive"
                      aria-label={`Remove ${product.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    <Link to={`/products/${product.slug}`}>
                      <div className="aspect-square overflow-hidden rounded-lg bg-muted">
                        <ProductImage src={product.primaryImage} alt={product.name} className="size-full object-cover" />
                      </div>
                      <p className="mt-2 line-clamp-2 text-left text-sm font-semibold">{product.name}</p>
                    </Link>
                    <Button
                      size="sm"
                      className="mt-2 w-full"
                      disabled={!product.inStock}
                      onClick={() => product.defaultVariant && addItem.mutate({ variantId: product.defaultVariant.id })}
                    >
                      <ShoppingCart />
                      Add to cart
                    </Button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.label} className={index % 2 === 0 ? 'bg-muted/30' : undefined}>
                <td className="p-3 text-sm font-semibold text-muted-foreground">{row.label}</td>
                {products.map((product) => (
                  <td key={product.id} className="p-3 text-sm">
                    {row.render(product)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
