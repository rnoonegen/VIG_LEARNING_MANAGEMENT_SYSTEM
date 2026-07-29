import type { ReactNode } from 'react';
import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { cn } from '@/lib/ui';

/**
 * Empty, loading, error and offline must look different from one another so a
 * user can tell "nothing here yet" from "still loading" from "it broke"
 * (Flow 04 — an explicitly locked requirement, never to be cut).
 */

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-lavender text-violet">
        {icon ?? <span className="text-2xl">✦</span>}
      </div>
      <h3>{title}</h3>
      {description ? <p className="max-w-sm text-sm text-ink-2">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </Card>
  );
}

/** Skeletons, not spinners — they preserve the shape of what is arriving. */
export function LoadingState({ rows = 3, label = 'Loading…' }: { rows?: number; label?: string }) {
  return (
    <Card>
      <span className="sr-only" role="status">
        {label}
      </span>
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-lavender" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 animate-pulse rounded-full bg-lavender" />
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-lavender-2" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ErrorState({
  title = 'Unable to load this',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <Card tone="danger" className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-bg text-danger">
        <TriangleAlert size={24} />
      </div>
      <h3>{title}</h3>
      <p className="max-w-sm text-sm text-ink-2">
        {message ?? 'Please check your connection and try again.'}
      </p>
      {onRetry ? (
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </Card>
  );
}

/**
 * Offline is surfaced, never worked around: the MVP does not support offline
 * editing and must not imply that it does (Flow 04).
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-center gap-2 bg-warning-bg px-4 py-2',
        'text-xs font-medium text-ink border-b border-warning/25',
      )}
    >
      <CloudOff size={14} className="text-warning" />
      You’re offline. Changes can’t be saved until your connection returns.
    </div>
  );
}

/** The calm all-clear. A healthy empty state is information, not an absence. */
export function AllClear({ title, description }: { title: string; description?: string }) {
  return (
    <Card tone="success" className="flex flex-col items-center gap-2 py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
        ✓
      </div>
      <p className="font-medium text-ink">{title}</p>
      {description ? <p className="text-sm text-ink-2">{description}</p> : null}
    </Card>
  );
}
