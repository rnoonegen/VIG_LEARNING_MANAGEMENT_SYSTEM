import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/ui';

/** Page title block. The serif carries the hierarchy; actions sit to the right. */
export function PageHeader({
  title,
  description,
  action,
  backTo,
  backLabel = 'Back',
  eyebrow,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  backTo?: string;
  backLabel?: string;
  eyebrow?: string;
}) {
  return (
    <header className="mb-6">
      {backTo ? (
        <Link
          to={backTo}
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-violet hover:underline"
        >
          <ChevronLeft size={14} />
          {backLabel}
        </Link>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-violet">{eyebrow}</p>
          ) : null}
          <h1>{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-sm text-ink-2">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mb-8', className)}>
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-[15px] font-semibold uppercase tracking-wide text-ink-2 [font-family:var(--font-sans)]">
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Horizontal tab strip. Scrolls rather than wrapping on narrow screens. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: T; label: string; count?: number }>;
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="scroll-x mb-5 border-b border-line">
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              'touch-target relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors',
              active === tab.key ? 'text-violet' : 'text-ink-2 hover:text-ink',
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className="ml-1.5 text-xs text-ink-3">{tab.count}</span>
            ) : null}
            {active === tab.key ? (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-violet" />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Definition-style key/value row used across profile overviews. */
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{value ?? '—'}</dd>
    </div>
  );
}

export function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-lavender font-medium text-violet"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials || '·'}
    </span>
  );
}
