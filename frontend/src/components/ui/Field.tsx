import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/ui';

/**
 * Inputs: white surface, 1px neutral border, label above the field, violet focus,
 * concise helper text directly below. Errors switch the border and helper to
 * danger red (Design System §6).
 */

const control =
  'w-full rounded-[12px] border bg-card px-3 py-2.5 text-sm text-ink placeholder:text-ink-3 ' +
  'min-h-[44px] transition-colors focus:border-violet';

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-2">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  invalid,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cn(control, invalid ? 'border-danger' : 'border-line', className)} {...rest} />;
}

export function Textarea({
  invalid,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      className={cn(control, 'min-h-[96px] resize-y', invalid ? 'border-danger' : 'border-line', className)}
      {...rest}
    />
  );
}

export function Select({
  invalid,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select className={cn(control, invalid ? 'border-danger' : 'border-line', className)} {...rest}>
      {children}
    </select>
  );
}

/** Labelled on/off control used across the availability grids. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50',
        checked ? 'border-success bg-success' : 'border-line bg-lavender-2',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}
