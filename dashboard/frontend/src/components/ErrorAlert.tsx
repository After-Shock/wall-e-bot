import { AlertCircle, XCircle, RefreshCw } from 'lucide-react';

/**
 * Reusable error alert component
 * Displays error messages with optional retry functionality
 */

interface ErrorAlertProps {
  /** Error message to display */
  message: string;
  /** Optional detailed error information */
  details?: string;
  /** Optional retry callback */
  onRetry?: () => void;
  /** Variant style */
  variant?: 'error' | 'warning';
  /** Whether to show as a full-page error */
  fullScreen?: boolean;
}

export default function ErrorAlert({
  message,
  details,
  onRetry,
  variant = 'error',
  fullScreen = false
}: ErrorAlertProps) {
  const variantStyles = {
    error: {
      container: 'bg-red-500/10 border-red-500/50',
      icon: 'text-red-500',
      text: 'text-red-400',
      IconComponent: XCircle,
    },
    warning: {
      container: 'bg-yellow-500/10 border-yellow-500/50',
      icon: 'text-yellow-500',
      text: 'text-yellow-400',
      IconComponent: AlertCircle,
    },
  };

  const style = variantStyles[variant];
  const Icon = style.IconComponent;

  const content = (
    <div className={`rounded-lg border p-4 ${style.container}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${style.icon}`} />

        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold mb-1 ${style.text}`}>
            {variant === 'error' ? 'Error' : 'Warning'}
          </h3>
          <p className="text-discord-light text-sm mb-2">{message}</p>

          {details && (
            <details className="mt-2">
              <summary className="text-xs text-discord-light cursor-pointer hover:text-white">
                Show details
              </summary>
              <pre className="mt-2 text-xs bg-discord-darker rounded p-2 overflow-auto">
                {details}
              </pre>
            </details>
          )}

          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 flex items-center gap-2 text-sm text-discord-blurple hover:text-discord-blurple-light transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="max-w-md w-full">
          {content}
        </div>
      </div>
    );
  }

  return content;
}
