/**
 * Wall-clock and calendar helpers shared by the constraint engine and the UI.
 *
 * Availability windows are wall-clock ranges in the school timezone with no date
 * component, so they are handled as "HH:MM" strings and compared as minutes past
 * midnight. Absolute instants (occurrences) are Date objects stored as timestamptz.
 */

/** Minutes past midnight for an "HH:MM" string. `"09:30"` → `570`. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m ?? 0);
}

/** Inverse of {@link toMinutes}. `570` → `"09:30"`. */
export function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** `"09:30"` → `"9:30 AM"`. Used everywhere a time is shown to a user. */
export function formatTime12h(hhmm: string): string {
  const total = toMinutes(hhmm);
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export interface TimeRange {
  startTime: string;
  endTime: string;
}

/** True when two wall-clock ranges share at least one minute. */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime);
}

/** True when `inner` sits entirely inside `outer`. */
export function rangeContains(outer: TimeRange, inner: TimeRange): boolean {
  return (
    toMinutes(outer.startTime) <= toMinutes(inner.startTime) &&
    toMinutes(outer.endTime) >= toMinutes(inner.endTime)
  );
}

/**
 * Intersection of two sets of wall-clock ranges — the windows where both parties
 * are free. Inputs need not be sorted or disjoint.
 */
export function intersectRanges(a: TimeRange[], b: TimeRange[]): TimeRange[] {
  const out: TimeRange[] = [];
  for (const x of a) {
    for (const y of b) {
      const start = Math.max(toMinutes(x.startTime), toMinutes(y.startTime));
      const end = Math.min(toMinutes(x.endTime), toMinutes(y.endTime));
      if (start < end) out.push({ startTime: toHHMM(start), endTime: toHHMM(end) });
    }
  }
  return out.sort((p, q) => toMinutes(p.startTime) - toMinutes(q.startTime));
}

// --- Calendar helpers -------------------------------------------------------

/** `YYYY-MM-DD` for a Date, using its UTC components. */
export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parses `YYYY-MM-DD` into a Date at UTC midnight. */
export function fromDateKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/** Monday-based start of the week containing `d`. */
export function startOfWeek(d: Date, weekStartDay = 1): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  const diff = (out.getUTCDay() - weekStartDay + 7) % 7;
  return addDays(out, -diff);
}

export function endOfWeek(d: Date, weekStartDay = 1): Date {
  return addDays(startOfWeek(d, weekStartDay), 6);
}

/**
 * Two kinds of Date flow through this app, and they render differently:
 *
 *   Schedule values — class times, recording deadlines, `@db.Date` columns.
 *     School-local wall clock written into UTC fields (combineDateAndTime uses
 *     setUTCHours), so the stored value already *is* the school's clock.
 *     Render in UTC; converting again applies the offset twice.
 *
 *   Real instants — savedAt, createdAt, confirmedAt, "now".
 *     Genuine points in time. Render in SCHOOL_TIMEZONE, passed explicitly.
 *
 * The default is UTC because the first kind is the overwhelming majority, and
 * because formatInstantTime defaults the same way — a row reading
 * `${formatShortDate(x)} · ${formatInstantTime(x)}` must not shift its date and
 * its time into different frames.
 */
export const SCHOOL_TIMEZONE = 'Asia/Kolkata';

/** "Thursday, 23 July" — the greeting date format used across the boards. */
export function formatLongDate(d: Date, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(d);
}

/** "23 Jul 2026" — compact form for metadata rows. */
export function formatShortDate(d: Date, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(d);
}

/**
 * Renders a scheduled instant as a clock time.
 *
 * Defaults to UTC, which looks wrong and is not: class times are school-local
 * wall clock written into UTC fields (combineDateAndTime uses setUTCHours), so
 * the stored value *is* the school's clock. Converting it into the school's
 * timezone would apply the offset a second time — a 9:00 AM class rendered as
 * 2:30 PM. Every caller passes a scheduled value, never a real instant.
 */
export function formatInstantTime(d: Date, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(d);
}
