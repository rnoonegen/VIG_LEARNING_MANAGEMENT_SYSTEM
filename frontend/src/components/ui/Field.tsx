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

/**
 * Labelled on/off control used across the availability grids.
 *
 * On is violet, like every other interactive state in the product — green is
 * reserved for something having gone well, and a switch being on is not that.
 *
 * The knob is placed from `left`, not left to fall where the button's centred
 * text would have put it: a static position inside a `<button>` is centred, so
 * sliding it 22px from there threw it clear of the track and over whatever label
 * sat alongside — the knob vanished against the white card and ate the first
 * letter of the word next to it.
 *
 * `showState` writes ON / OFF into the track, for a switch that is the whole
 * point of the screen it sits on rather than one cell of a grid. Knob position
 * alone is a convention, and a convention has to be known before it can be
 * read — on a setting somebody visits once a year, the word is worth the width.
 * It stays opt-in because the availability grids place dozens of these at once,
 * where the same word repeated forty times is noise and the extra 24px is a
 * column that no longer fits.
 */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  showState = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  showState?: boolean;
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
        'relative h-6 shrink-0 overflow-hidden rounded-full border transition-colors disabled:opacity-50',
        showState ? 'w-[68px]' : 'w-11',
        checked ? 'border-violet bg-violet' : 'border-line bg-lavender-2',
      )}
    >
      {/* The word sits opposite the knob, so the two never collide as it slides.
          Off is ink-2 rather than white or ink-3: the off track is #faf8ff, so
          white is invisible on it and ink-3 reaches only 3.1:1 — under AA for
          text this small. ink-2 is 5.9:1 and still reads as the quieter state. */}
      {showState ? (
        <span
          className={cn(
            'pointer-events-none absolute inset-y-0 flex items-center text-[10px] font-semibold uppercase tracking-wider',
            checked ? 'left-3 text-white' : 'right-3 text-ink-2',
          )}
        >
          {checked ? 'On' : 'Off'}
        </span>
      ) : null}

      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform',
          checked ? (showState ? 'translate-x-[44px]' : 'translate-x-[20px]') : 'translate-x-0',
        )}
      />
    </button>
  );
}
