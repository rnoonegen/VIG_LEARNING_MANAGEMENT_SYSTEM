import { describe, expect, it } from 'vitest';
import { expandOccurrences } from './service.js';
import { combineDateAndTime } from './engine.js';

/**
 * AD-05 / Q9 — occurrences are materialised from a fixed weekly pattern with a
 * start and optional end date. No RRULE, no holiday calendar in MVP.
 *
 * The delivery plan's risk register calls out recurrence edge cases (end dates,
 * mid-week edits, horizon boundaries) explicitly; this is that safety net.
 * Asia/Kolkata has no DST, so UTC arithmetic is sound here (BR-20).
 */

// 2026-08-03 is a Monday.
const MONDAY = new Date('2026-08-03T00:00:00.000Z');

function mathsClass(overrides: Partial<Parameters<typeof expandOccurrences>[0]> = {}) {
  return {
    // Monday and Wednesday, 09:00, one hour.
    daysOfWeek: [1, 3],
    startTime: '09:00',
    durationMinutes: 60,
    startDate: MONDAY,
    endDate: null,
    ...overrides,
  };
}

describe('expandOccurrences', () => {
  it('lands only on the chosen weekdays', () => {
    const slots = expandOccurrences(mathsClass(), MONDAY, 14);
    for (const slot of slots) {
      expect([1, 3]).toContain(slot.start.getUTCDay());
    }
  });

  it('produces one occurrence per chosen day per week', () => {
    // Two weeks × two days.
    expect(expandOccurrences(mathsClass(), MONDAY, 14)).toHaveLength(4);
  });

  it('applies the start time and duration', () => {
    const [first] = expandOccurrences(mathsClass(), MONDAY, 7);
    expect(first!.start.toISOString()).toBe('2026-08-03T09:00:00.000Z');
    expect(first!.end.toISOString()).toBe('2026-08-03T10:00:00.000Z');
  });

  it('handles a duration that crosses the hour boundary', () => {
    const [first] = expandOccurrences(
      mathsClass({ startTime: '09:45', durationMinutes: 90 }),
      MONDAY,
      7,
    );
    expect(first!.end.toISOString()).toBe('2026-08-03T11:15:00.000Z');
  });

  it('never starts before the class start date', () => {
    // Asked to expand from a week earlier than the class begins.
    const from = new Date('2026-07-27T00:00:00.000Z');
    const slots = expandOccurrences(mathsClass(), from, 21);
    expect(slots[0]!.start >= MONDAY).toBe(true);
  });

  it('stops at the end date', () => {
    const slots = expandOccurrences(
      // Ends on the Wednesday of the first week.
      mathsClass({ endDate: new Date('2026-08-05T00:00:00.000Z') }),
      MONDAY,
      60,
    );
    expect(slots).toHaveLength(2);
    expect(slots.at(-1)!.start.toISOString()).toBe('2026-08-05T09:00:00.000Z');
  });

  it('respects the horizon rather than running forever', () => {
    const slots = expandOccurrences(mathsClass(), MONDAY, 120);
    // ~17 weeks × 2 days.
    expect(slots.length).toBeGreaterThan(30);
    expect(slots.length).toBeLessThan(40);

    const last = slots.at(-1)!.start;
    const horizonEnd = new Date(MONDAY);
    horizonEnd.setUTCDate(horizonEnd.getUTCDate() + 120);
    expect(last <= horizonEnd).toBe(true);
  });

  it('returns nothing when the end date precedes the start', () => {
    const slots = expandOccurrences(
      mathsClass({ endDate: new Date('2026-07-01T00:00:00.000Z') }),
      MONDAY,
      30,
    );
    expect(slots).toEqual([]);
  });

  it('returns nothing for an empty weekday pattern', () => {
    expect(expandOccurrences(mathsClass({ daysOfWeek: [] }), MONDAY, 30)).toEqual([]);
  });

  it('produces strictly increasing, non-overlapping instants', () => {
    const slots = expandOccurrences(mathsClass(), MONDAY, 28);
    for (let i = 1; i < slots.length; i += 1) {
      expect(+slots[i]!.start).toBeGreaterThan(+slots[i - 1]!.start);
      expect(+slots[i]!.start).toBeGreaterThanOrEqual(+slots[i - 1]!.end);
    }
  });

  it('supports a Sunday pattern (weekday 0)', () => {
    const slots = expandOccurrences(mathsClass({ daysOfWeek: [0] }), MONDAY, 14);
    expect(slots).toHaveLength(2);
    expect(slots.every((s) => s.start.getUTCDay() === 0)).toBe(true);
  });
});

describe('combineDateAndTime', () => {
  it('replaces the clock time without shifting the date', () => {
    const result = combineDateAndTime(new Date('2026-08-03T23:45:00.000Z'), '09:30');
    expect(result.toISOString()).toBe('2026-08-03T09:30:00.000Z');
  });

  it('treats a missing minute component as zero', () => {
    expect(combineDateAndTime(MONDAY, '14').toISOString()).toBe('2026-08-03T14:00:00.000Z');
  });
});
