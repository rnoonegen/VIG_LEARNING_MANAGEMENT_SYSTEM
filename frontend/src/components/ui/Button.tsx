import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/ui';

type Variant = 'primary' | 'secondary' | 'tertiary' | 'danger';
type Size = 'sm' | 'md';

/**
 * One dominant primary action per decision area (Design System §2). Secondary and
 * tertiary carry the alternatives; `danger` is reserved for genuinely destructive
 * actions, never for "warning" states.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-violet text-white border-violet hover:bg-violet-hover disabled:bg-ink-3 disabled:border-ink-3',
  secondary: 'bg-card text-navy border-line hover:bg-lavender-2 disabled:text-ink-3',
  tertiary: 'bg-transparent text-violet border-transparent hover:bg-lavender disabled:text-ink-3',
  danger: 'bg-danger text-white border-danger hover:brightness-95 disabled:bg-ink-3 disabled:border-ink-3',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-[8px]',
  md: 'px-4 py-2.5 text-sm rounded-[12px] min-h-[44px]',
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  fullWidth?: boolean;
  children: ReactNode;
  className?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  fullWidth,
  className,
  children,
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 border font-medium transition-colors',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/** Same visual language as Button, but navigates. */
export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  icon,
  fullWidth,
  className,
  children,
}: CommonProps & { to: string }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center justify-center gap-2 border font-medium transition-colors',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
