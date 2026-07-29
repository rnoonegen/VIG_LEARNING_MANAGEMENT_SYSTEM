import { toHHMM, toMinutes, type TimeRange } from '@vig/shared';

/**
 * Availability resolution — the rule the whole scheduler rests on.
 *
 * Availability is a constraint, not a booking (BR-05). A dated exception
 * overrides the recurring weekly pattern on its date, and never touches any other
 * date (BR-06). This function is pure so it can be unit-tested and reused both
 * for "find options" and for "revalidate a proposed move".
 */

export interface RecurringSlot {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface DatedException {
  date: Date | string;
  isAvailable: boolean;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
}

const FULL_DAY: TimeRange = { startTime: '00:00', endTime: '23:59' };

function dateKeyOf(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

/** Merges overlapping/adjacent ranges into a normalised, sorted list. */
export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  const out: Array<{ start: number; end: number }> = [];

  for (const r of sorted) {
    const start = toMinutes(r.startTime);
    const end = toMinutes(r.endTime);
    const last = out[out.length - 1];
    if (last && start <= last.end) {
      last.end = Math.max(last.end, end);
    } else {
      out.push({ start, end });
    }
  }
  return out.map((r) => ({ startTime: toHHMM(r.start), endTime: toHHMM(r.end) }));
}

/** Removes `blocked` from `base`, splitting ranges where a block sits inside one. */
export function subtractRanges(base: TimeRange[], blocked: TimeRange[]): TimeRange[] {
  let current = mergeRanges(base).map((r) => ({ start: toMinutes(r.startTime), end: toMinutes(r.endTime) }));

  for (const b of mergeRanges(blocked)) {
    const bs = toMinutes(b.startTime);
    const be = toMinutes(b.endTime);
    const next: Array<{ start: number; end: number }> = [];

    for (const c of current) {
      if (be <= c.start || bs >= c.end) {
        next.push(c); // no overlap
        continue;
      }
      if (bs > c.start) next.push({ start: c.start, end: bs });
      if (be < c.end) next.push({ start: be, end: c.end });
    }
    current = next;
  }

  return current.map((r) => ({ startTime: toHHMM(r.start), endTime: toHHMM(r.end) }));
}

/**
 * The windows a person is available on a specific date.
 *
 * Precedence: an all-day unavailable exception wins outright; otherwise
 * available-exceptions replace the recurring pattern for that date, and
 * unavailable-exceptions are subtracted from whatever remains.
 */
export function resolveAvailability(
  recurring: RecurringSlot[],
  exceptions: DatedException[],
  date: Date,
): TimeRange[] {
  const key = dateKeyOf(date);
  const todays = exceptions.filter((e) => dateKeyOf(e.date) === key);

  if (todays.some((e) => !e.isAvailable && e.allDay)) return [];

  const grants = todays.filter((e) => e.isAvailable);
  const blocks = todays.filter((e) => !e.isAvailable);

  const base: TimeRange[] = grants.length
    ? grants.map((e) =>
        e.allDay || !e.startTime || !e.endTime
          ? FULL_DAY
          : { startTime: e.startTime, endTime: e.endTime },
      )
    : recurring
        .filter((s) => s.weekday === date.getUTCDay())
        .map((s) => ({ startTime: s.startTime, endTime: s.endTime }));

  const blocked: TimeRange[] = blocks
    .filter((e) => e.startTime && e.endTime)
    .map((e) => ({ startTime: e.startTime!, endTime: e.endTime! }));

  return subtractRanges(base, blocked);
}

/** True when the person is free for the whole of `window` on `date`. */
export function isAvailableFor(
  recurring: RecurringSlot[],
  exceptions: DatedException[],
  date: Date,
  window: TimeRange,
): boolean {
  const available = resolveAvailability(recurring, exceptions, date);
  return available.some(
    (a) =>
      toMinutes(a.startTime) <= toMinutes(window.startTime) &&
      toMinutes(a.endTime) >= toMinutes(window.endTime),
  );
}
