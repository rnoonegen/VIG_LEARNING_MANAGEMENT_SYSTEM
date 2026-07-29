import type { SemanticToken } from '@vig/shared';

/** Minimal class-name joiner. Falsy values drop out. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/**
 * Semantic token → Tailwind classes.
 *
 * Colour meaning is centralised here so a status never renders green in one view
 * and orange in another (Design System §8). Components ask for a token, never a
 * hex value or a raw utility class.
 */
export const TOKEN_STYLES: Record<SemanticToken, { chip: string; dot: string; text: string; bar: string }> = {
  violet: {
    chip: 'bg-lavender text-violet border-violet/25',
    dot: 'bg-violet',
    text: 'text-violet',
    bar: 'bg-violet',
  },
  blue: {
    chip: 'bg-info-bg text-info border-info/25',
    dot: 'bg-info',
    text: 'text-info',
    bar: 'bg-info',
  },
  green: {
    chip: 'bg-success-bg text-success border-success/25',
    dot: 'bg-success',
    text: 'text-success',
    bar: 'bg-success',
  },
  orange: {
    chip: 'bg-warning-bg text-warning border-warning/25',
    dot: 'bg-warning',
    text: 'text-warning',
    bar: 'bg-warning',
  },
  red: {
    chip: 'bg-danger-bg text-danger border-danger/25',
    dot: 'bg-danger',
    text: 'text-danger',
    bar: 'bg-danger',
  },
  pink: {
    chip: 'bg-pink-bg text-pink border-pink/25',
    dot: 'bg-pink',
    text: 'text-pink',
    bar: 'bg-pink',
  },
  navy: {
    chip: 'bg-lavender-2 text-navy border-line',
    dot: 'bg-navy',
    text: 'text-navy',
    bar: 'bg-navy',
  },
  muted: {
    chip: 'bg-lavender-2 text-ink-3 border-line',
    dot: 'bg-ink-3',
    text: 'text-ink-3',
    bar: 'bg-ink-3',
  },
};

/** Subject colour tokens arrive from the API as plain strings. */
export function asToken(value: string | null | undefined): SemanticToken {
  const known: SemanticToken[] = ['violet', 'blue', 'green', 'orange', 'red', 'pink', 'navy', 'muted'];
  return known.includes(value as SemanticToken) ? (value as SemanticToken) : 'violet';
}
