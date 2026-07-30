import * as React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface State {
  error: Error | null;
}

/**
 * Last-resort boundary. A render-time exception anywhere in the tree would
 * otherwise unmount the whole app and leave a blank white page, which gives the
 * user no way to recover and no clue what happened.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In a real deployment this is where Sentry/Datadog would be called.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" />
          </div>
          <h1 className="font-display text-xl font-bold">Something broke on this page</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            An unexpected error stopped this screen from rendering. Reloading usually clears it.
          </p>

          {import.meta.env.DEV && (
            <pre className="mt-5 max-h-48 overflow-auto rounded-lg bg-muted p-3 text-left text-[11px] leading-relaxed text-muted-foreground">
              {error.message}
              {error.stack ? `\n\n${error.stack.split('\n').slice(1, 6).join('\n')}` : ''}
            </pre>
          )}

          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={() => window.location.reload()}>
              <RotateCcw />
              Reload page
            </Button>
            <Button variant="outline" onClick={this.reset}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
