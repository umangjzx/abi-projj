import * as React from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star, Trash2 } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, PageLoader } from '@/components/ui/feedback';
import { ProductImage } from '@/components/product/ProductImage';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import type { Review } from '@/types';

interface PendingReview {
  productId: string;
  name: string;
  slug: string;
  image: string | null;
}

export default function MyReviewsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['reviews', 'mine'],
    queryFn: () => api.get<{ reviews: Review[]; pending: PendingReview[] }>('/reviews/mine'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/reviews/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', 'mine'] });
      toast.success('Review deleted');
    },
    onError: (err: ApiError) => toast.error('Could not delete review', err.message),
  });

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">My reviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">Reviews you've written, and products awaiting your feedback.</p>
      </div>

      {data?.pending && data.pending.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-base font-bold">Awaiting your review</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.pending.map((item) => (
              <Link
                key={item.productId}
                to={`/products/${item.slug}#reviews`}
                className="flex items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3.5 transition-colors hover:bg-primary/10"
              >
                <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                  <ProductImage src={item.image} alt={item.name} className="size-full object-cover" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium">{item.name}</p>
                  <p className="text-xs font-medium text-primary">Write a review →</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-base font-bold">Your reviews</h2>
        {!data?.reviews || data.reviews.length === 0 ? (
          <EmptyState icon={<Star />} title="No reviews yet" description="Reviews you write on products will appear here." />
        ) : (
          <div className="space-y-3">
            {data.reviews.map((review) => (
              <div key={review.id} className="rounded-xl border border-border bg-card p-4 shadow-soft">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link to={`/products/${review.product?.slug}`} className="font-semibold hover:text-primary">
                      {review.product?.name}
                    </Link>
                    <div className="mt-1 flex items-center gap-2">
                      {review.rating && (
                        <span className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={cn('size-3.5', i < review.rating! ? 'fill-amber-400 text-amber-400' : 'text-muted')} />
                          ))}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
                      {review.status === 'PENDING' && (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning">Pending moderation</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => remove.mutate(review.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete review"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {review.title && <p className="mt-2 font-medium">{review.title}</p>}
                <p className="mt-1 text-sm text-muted-foreground">{review.comment}</p>
                {review.adminReply && (
                  <div className="mt-3 rounded-lg bg-muted/50 p-3">
                    <p className="text-xs font-semibold text-primary">Response from Thuthi Dairy</p>
                    <p className="mt-1 text-sm text-muted-foreground">{review.adminReply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
