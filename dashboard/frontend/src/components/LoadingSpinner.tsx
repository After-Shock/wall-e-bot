/**
 * Reusable loading spinner component
 * Displays an animated spinner with optional message
 */

interface LoadingSpinnerProps {
  /** Optional message to display below the spinner */
  message?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to center in viewport */
  fullScreen?: boolean;
}

export default function LoadingSpinner({
  message,
  size = 'md',
  fullScreen = false
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-6 w-6 border-2',
    md: 'h-12 w-12 border-2',
    lg: 'h-16 w-16 border-3',
  };

  const content = (
    <div className="flex flex-col items-center justify-center gap-4">
      <div
        className={`animate-spin rounded-full border-t-discord-blurple border-b-discord-blurple border-r-transparent border-l-transparent ${sizeClasses[size]}`}
        role="status"
        aria-label="Loading"
      />
      {message && (
        <p className="text-discord-light text-sm">{message}</p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        {content}
      </div>
    );
  }

  return content;
}
