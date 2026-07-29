import { describe, expect, it } from 'vitest';
import {
  isAvailableFor,
  mergeRanges,
  resolveAvailability,
  subtractRanges,
  type DatedException,
  type RecurringSlot,
} from './availability.js';

/**
 * BR-05 / BR-06 — availability is a constraint, and a dated exception overrides
 * the recurring weekly rule on its date and only on its date.
 *
 * This is the rule the whole scheduler rests on, so it is tested directly rather
 * than only through findValidSlots().
 */

// Priya's normal week: Mon–Fri, 08:30–14:30 (spec Part I §F).
const PRIYA: RecurringSlot[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startTime: '08:30',
  endTime: '14:30',
}));

// 2026-08-07 is a Friday; 2026-08-14 is the Friday after.
const FRI_7_AUG = new Date('2026-08-07T00:00:00.000Z');
const FRI_14_AUG = new Date('2026-08-14T00:00:00.000Z');
const SUN_9_AUG = new Date('2026-08-09T00:00:00.000Z');

describe('mergeRanges', () => {
  it('merges overlapping and adjacent windows', () => {
    expect(
      mergeRanges([
        { startTime: '09:00', endTime: '11:00' },
        { startTime: '10:00', endTime: '12:00' },
        { startTime: '12:00', endTime: '13:00' },
      ]),
    ).toEqual([{ startTime: '09:00', endTime: '13:00' }]);
  });

  it('keeps genuinely separate windows apart', () => {
    expect(
      mergeRanges([
        { startTime: '14:00', endTime: '15:00' },
        { startTime: '09:00', endTime: '10:00' },
      ]),
    ).toEqual([
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '14:00', endTime: '15:00' },
    ]);
  });
});

describe('subtractRanges', () => {
  it('splits a window when the block sits inside it', () => {
    expect(
      subtractRanges(
        [{ startTime: '09:00', endTime: '17:00' }],
        [{ startTime: '12:00', endTime: '13:00' }],
      ),
    ).toEqual([
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '13:00', endTime: '17:00' },
    ]);
  });

  it('removes the window entirely when fully covered', () => {
    expect(
      subtractRanges(
        [{ startTime: '09:00', endTime: '10:00' }],
        [{ startTime: '08:00', endTime: '11:00' }],
      ),
    ).toEqual([]);
  });
});

describe('resolveAvailability', () => {
  it('falls back to the recurring pattern when no exception applies', () => {
    expect(resolveAvailability(PRIYA, [], FRI_7_AUG)).toEqual([
      { startTime: '08:30', endTime: '14:30' },
    ]);
  });

  it('returns nothing on a weekday with no recurring window', () => {
    expect(resolveAvailability(PRIYA, [], SUN_9_AUG)).toEqual([]);
  });

  it('an all-day unavailable exception clears the day outright', () => {
    const exceptions: DatedException[] = [
      { date: FRI_7_AUG, isAvailable: false, allDay: true, startTime: null, endTime: null },
    ];
    expect(resolveAvailability(PRIYA, exceptions, FRI_7_AUG)).toEqual([]);
  });

  it('a partial unavailable exception subtracts only that slice', () => {
    // "On August 7 she is unavailable until noon" (spec Part I §F).
    const exceptions: DatedException[] = [
      { date: FRI_7_AUG, isAvailable: false, allDay: false, startTime: '08:30', endTime: '12:00' },
    ];
    expect(resolveAvailability(PRIYA, exceptions, FRI_7_AUG)).toEqual([
      { startTime: '12:00', endTime: '14:30' },
    ]);
  });

  it('an available exception replaces the recurring pattern for that date', () => {
    const exceptions: DatedException[] = [
      { date: SUN_9_AUG, isAvailable: true, allDay: false, startTime: '10:00', endTime: '12:00' },
    ];
    // Sunday normally has nothing; the grant creates a window.
    expect(resolveAvailability(PRIYA, exceptions, SUN_9_AUG)).toEqual([
      { startTime: '10:00', endTime: '12:00' },
    ]);
  });

  it('leaves every other date untouched — BR-06', () => {
    const exceptions: DatedException[] = [
      { date: FRI_7_AUG, isAvailable: false, allDay: true, startTime: null, endTime: null },
    ];
    // "Her normal future Fridays remain unchanged."
    expect(resolveAvailability(PRIYA, exceptions, FRI_14_AUG)).toEqual([
      { startTime: '08:30', endTime: '14:30' },
    ]);
  });
});

describe('isAvailableFor', () => {
  it('requires the whole window to fit, not merely overlap', () => {
    expect(
      isAvailableFor(PRIYA, [], FRI_7_AUG, { startTime: '14:00', endTime: '15:00' }),
    ).toBe(false);
    expect(
      isAvailableFor(PRIYA, [], FRI_7_AUG, { startTime: '13:00', endTime: '14:00' }),
    ).toBe(true);
  });

  it('honours the exception on the exception date', () => {
    const exceptions: DatedException[] = [
      { date: FRI_7_AUG, isAvailable: false, allDay: false, startTime: '08:30', endTime: '12:00' },
    ];
    const morning = { startTime: '09:00', endTime: '10:00' };
    const afternoon = { startTime: '13:00', endTime: '14:00' };

    expect(isAvailableFor(PRIYA, exceptions, FRI_7_AUG, morning)).toBe(false);
    expect(isAvailableFor(PRIYA, exceptions, FRI_7_AUG, afternoon)).toBe(true);
    // The following Friday is unaffected.
    expect(isAvailableFor(PRIYA, exceptions, FRI_14_AUG, morning)).toBe(true);
  });
});
