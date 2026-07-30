import * as React from 'react';
import { ImageOff, Milk } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProductImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string | null | undefined;
  alt: string;
  /** Rendered when the image is missing or fails to load. */
  fallbackIcon?: React.ReactNode;
}

/**
 * Product image with skeleton-to-image fade and a graceful fallback.
 *
 * Seed data points at remote placeholder images, so a broken or blocked URL is
 * a realistic scenario -- without this the storefront would show browser-default
 * broken-image icons.
 */
export function ProductImage({ src, alt, className, fallbackIcon, ...props }: ProductImageProps) {
  const [state, setState] = React.useState<'loading' | 'loaded' | 'error'>(src ? 'loading' : 'error');

  // A card can be recycled onto a different product as a list re-renders.
  React.useEffect(() => {
    setState(src ? 'loading' : 'error');
  }, [src]);

  if (state === 'error') {
    return (
      <div
        className={cn('flex size-full items-center justify-center bg-muted text-muted-foreground/60', className)}
        role="img"
        aria-label={alt}
      >
        {fallbackIcon ?? (src ? <ImageOff className="size-7" /> : <Milk className="size-8" />)}
      </div>
    );
  }

  return (
    <>
      {state === 'loading' && <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden="true" />}
      <img
        src={src ?? undefined}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setState('loaded')}
        onError={() => setState('error')}
        className={cn('transition-opacity duration-500', state === 'loaded' ? 'opacity-100' : 'opacity-0', className)}
        {...props}
      />
    </>
  );
}
