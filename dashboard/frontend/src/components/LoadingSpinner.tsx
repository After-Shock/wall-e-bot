import { Skeleton } from '@/components/ui/skeleton';

interface LoadingSpinnerProps {
  /** Screen-reader text (and visible caption for the inline spinner) */
  message?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Render a page-shaped skeleton instead of a spinner */
  fullScreen?: boolean;
}

/** Placeholder shaped like a settings page: header row plus a few cards. */
function PageSkeleton({ message }: { message?: string }) {
  return (
    <div className="max-w-4xl space-y-6" role="status" aria-label={message ?? 'Loading'}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72 max-w-[50vw]" />
          </div>
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      {[3, 2, 4].map((lines, i) => (
        <div key={i} className="card space-y-3">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: lines }, (_, j) => (
            <Skeleton key={j} className={`h-9 ${j % 2 ? 'w-2/3' : 'w-full'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function LoadingSpinner({ message, size = 'md', fullScreen = false }: LoadingSpinnerProps) {
  if (fullScreen) return <PageSkeleton message={message} />;

  const sizeClasses = {
    sm: 'h-6 w-6 border-2',
    md: 'h-12 w-12 border-2',
    lg: 'h-16 w-16 border-[3px]',
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div
        className={`animate-spin rounded-full border-y-primary border-x-transparent ${sizeClasses[size]}`}
        role="status"
        aria-label={message ?? 'Loading'}
      />
      {message && <p className="text-muted-foreground text-sm">{message}</p>}
    </div>
  );
}
