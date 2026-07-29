import type { ReactNode } from 'react';
import { cn } from '@/lib/ui';

/**
 * Default cards are white with a subtle border and generous padding. Selected
 * cards take a pale lavender fill and violet border; semantic cards use very pale
 * tints. Never a saturated full-card fill (Design System §6).
 */
export function Card({
  children,
  className,
  selected,
  tone,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  selected?: boolean;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'lavender';
  padded?: boolean;
}) {
  const TONES = {
    default: 'bg-card border-line',
    success: 'bg-success-bg border-success/20',
    warning: 'bg-warning-bg border-warning/20',
    danger: 'bg-danger-bg border-danger/20',
    info: 'bg-info-bg border-info/20',
    lavender: 'bg-lavender border-violet/20',
  } as const;

  return (
    <div
      className={cn(
        'rounded-[16px] border',
        selected ? 'bg-lavender border-violet' : TONES[tone ?? 'default'],
        padded && 'p-5 md:p-6',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="truncate">{title}</h3>
        {description ? <p className="mt-1 text-sm text-ink-2">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** A tappable row inside a list card. Keeps a 44px hit area even when dense. */
export function Row({
  children,
  onClick,
  selected,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}) {
  const base = cn(
    'flex w-full items-center gap-3 rounded-[12px] border px-4 py-3 text-left',
    selected ? 'border-violet bg-lavender' : 'border-line bg-card',
    onClick && 'transition-colors hover:bg-lavender-2 touch-target',
    className,
  );

  if (!onClick) return <div className={base}>{children}</div>;
  return (
    <button type="button" onClick={onClick} className={base}>
      {children}
    </button>
  );
}
