import * as React from 'react';
import { Star, ThumbsUp } from 'lucide-react';
import { cn, formatDate, initials } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/primitives';
import { Badge } from '@/components/ui/badge';
import { Skeleton, EmptyState } from '@/components/ui/feedback';
import { Pagination } from '@/components/ui/table';
import { useProductReviews } from '@/hooks/useCatalog';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/toast';

export function ReviewList({ productId }: { productId: string }) {
  const { isAuthenticated } = useAuth();
  const toast = useToast();
  const [page, setPage] = React.useState(1);
  const [sort, setSort] = React.useState('newest');
  const [helpfulClicked, setHelpfulClicked] = React.useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useProductReviews(productId, page, sort);
  const reviews = data?.data;
  const distribution = data?.meta?.distribution as { star: number; count: number }[] | undefined;
  const totalReviews = distribution?.reduce((sum, d) => sum + d.count, 0) ?? 0;

  const markHelpful = async (reviewId: string) => {
    if (helpfulClicked.has(reviewId)) return;
    try {
      await api.post(`/reviews/${reviewId}/helpful`);
      setHelpfulClicked((prev) => new Set(prev).add(reviewId));
      refetch();
    } catch {
      toast.error('Could not mark as helpful');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* --- rating distribution --- */}
      {distribution && totalReviews > 0 && (
        <div className="mb-6 space-y-1.5 rounded-xl border border-border bg-card p-4">
          {distribution.map((row) => (
            <div key={row.star} className="flex items-center gap-2.5 text-sm">
              <span className="flex w-8 items-center gap-1 text-muted-foreground">
                {row.star} <Star className="size-3 fill-amber-400 text-amber-400" />
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-amber-400"
                  style={{ width: `${totalReviews > 0 ? (row.count / totalReviews) * 100 : 0}%` }}
                />
              </div>
              <span className="w-8 text-right text-xs text-muted-foreground">{row.count}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold">Customer reviews</h3>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Most recent</SelectItem>
            <SelectItem value="helpful">Most helpful</SelectItem>
            <SelectItem value="highest">Highest rated</SelectItem>
            <SelectItem value="lowest">Lowest rated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!reviews || reviews.length === 0 ? (
        <EmptyState
          icon={<Star />}
          title="No reviews yet"
          description="Be the first to share what you think about this product."
          className="rounded-xl border border-dashed border-border py-10"
        />
      ) : (
        <div className="space-y-5">
          {reviews.map((review) => (
            <article key={review.id} className="border-b border-border pb-5 last:border-0">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
                  {initials(review.author.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{review.author.name}</p>
                    {review.isVerified && (
                      <Badge variant="success" size="sm">
                        Verified purchase
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    {review.rating && (
                      <span className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={cn('size-3.5', i < review.rating! ? 'fill-amber-400 text-amber-400' : 'text-muted')} />
                        ))}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
                  </div>
                  {review.title && <p className="mt-2 font-medium">{review.title}</p>}
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{review.comment}</p>

                  {review.adminReply && (
                    <div className="mt-3 rounded-lg bg-muted/50 p-3">
                      <p className="text-xs font-semibold text-primary">Response from Thuthi Dairy</p>
                      <p className="mt-1 text-sm text-muted-foreground">{review.adminReply}</p>
                    </div>
                  )}

                  <button
                    onClick={() => markHelpful(review.id)}
                    disabled={!isAuthenticated || helpfulClicked.has(review.id)}
                    className={cn(
                      'mt-2.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed',
                      helpfulClicked.has(review.id) && 'text-primary',
                    )}
                  >
                    <ThumbsUp className="size-3.5" />
                    Helpful ({review.helpfulCount + (helpfulClicked.has(review.id) ? 1 : 0)})
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {data?.meta && data.meta.totalPages! > 1 && (
        <Pagination className="mt-6" page={data.meta.page!} totalPages={data.meta.totalPages!} onPageChange={setPage} />
      )}
    </div>
  );
}
