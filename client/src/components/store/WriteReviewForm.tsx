import * as React from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { Alert } from '@/components/ui/feedback';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/toast';

export function WriteReviewForm({ productId }: { productId: string }) {
  const { isAuthenticated } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [rating, setRating] = React.useState(0);
  const [hoverRating, setHoverRating] = React.useState(0);
  const [title, setTitle] = React.useState('');
  const [comment, setComment] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);

  const mutation = useMutation({
    mutationFn: () => api.post('/reviews', { productId, rating, title: title || undefined, comment }),
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ['reviews', productId] });
      queryClient.invalidateQueries({ queryKey: ['product'] });
      toast.success('Review submitted', 'Thank you for sharing your feedback!');
    },
    onError: (err: ApiError) => setError(err.message),
  });

  if (!isAuthenticated) {
    return (
      <div className="h-fit rounded-xl border border-dashed border-border p-5 text-center">
        <p className="text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>{' '}
          to write a review.
        </p>
      </div>
    );
  }

  if (submitted) {
    return (
      <Alert variant="success" title="Review submitted" className="h-fit">
        Thanks for your feedback — it helps other customers decide.
      </Alert>
    );
  }

  return (
    <div className="h-fit rounded-xl border border-border bg-card p-5 shadow-soft">
      <h3 className="font-display text-sm font-bold">Write a review</h3>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (rating === 0) {
            setError('Please select a rating.');
            return;
          }
          mutation.mutate();
        }}
        className="mt-4 space-y-4"
      >
        {error && <Alert variant="error">{error}</Alert>}

        <div>
          <Label>Your rating</Label>
          <div className="mt-1.5 flex gap-1" onMouseLeave={() => setHoverRating(0)}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                onMouseEnter={() => setHoverRating(value)}
                aria-label={`Rate ${value} out of 5`}
                className="p-0.5"
              >
                <Star
                  className={cn(
                    'size-6 transition-colors',
                    value <= (hoverRating || rating) ? 'fill-amber-400 text-amber-400' : 'text-muted',
                  )}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="review-title">Title (optional)</Label>
          <Input id="review-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Sum up your experience" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="review-comment">Your review</Label>
          <Textarea
            id="review-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            minLength={5}
            maxLength={1500}
            required
            placeholder="What did you like or dislike?"
          />
        </div>

        <Button type="submit" className="w-full" loading={mutation.isPending}>
          Submit review
        </Button>
      </form>
    </div>
  );
}
