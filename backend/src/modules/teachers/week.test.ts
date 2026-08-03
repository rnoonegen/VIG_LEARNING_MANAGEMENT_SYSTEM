import { describe, expect, it } from 'vitest';
import { weekLabel, weekStartOf, windowHours } from './week.js';

/**
 * The running week is read by both portals, so its edges are the whole game: a
 * week that starts on the wrong day puts somebody's leave in the wrong week, and
 * a label that hides the month makes "3 – 9" ambiguous twelve times a year.
 */

const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

describe('weekStartOf', () => {
  it('snaps back to Monday from midweek', () => {
    // 2026-08-05 is a Wednesday.
    expect(weekStartOf(day('2026-08-05')).toISOString().slice(0, 10)).toBe('2026-08-03');
  });

  it('leaves a Monday where it is', () => {
    expect(weekStartOf(day('2026-08-03')).toISOString().slice(0, 10)).toBe('2026-08-03');
  });

  it('keeps Sunday in the week that is ending, not the one starting', () => {
    // 2026-08-09 is a Sunday — the last day of the week beginning 3 Aug.
    expect(weekStartOf(day('2026-08-09')).toISOString().slice(0, 10)).toBe('2026-08-03');
  });

  it('crosses a month end without moving the Monday', () => {
    // 2026-09-02 is a Wednesday; its Monday is in August.
    expect(weekStartOf(day('2026-09-02')).toISOString().slice(0, 10)).toBe('2026-08-31');
  });

  it('discards the time of day, so "now" and midnight agree', () => {
    expect(weekStartOf(new Date('2026-08-05T18:45:00.000Z')).toISOString()).toBe(
      '2026-08-03T00:00:00.000Z',
    );
  });
});

describe('weekLabel', () => {
  it('names the month once when the week sits inside one', () => {
    expect(weekLabel(day('2026-08-03'), day('2026-08-09'))).toBe('3 – 9 Aug 2026');
  });

  // "Sept" rather than "Sep" is en-GB's own short form — the same one
  // formatShortDate produces, so dates read alike wherever they appear.
  it('names both months when the week straddles them', () => {
    expect(weekLabel(day('2026-08-31'), day('2026-09-06'))).toBe('31 Aug – 6 Sept 2026');
  });

  it('names both years across a new year', () => {
    expect(weekLabel(day('2026-12-28'), day('2027-01-03'))).toBe('28 Dec 2026 – 3 Jan 2027');
  });
});

describe('windowHours', () => {
  it('adds the windows up', () => {
    expect(
      windowHours([
        { startTime: '09:00', endTime: '11:00' },
        { startTime: '13:00', endTime: '16:00' },
      ]),
    ).toBe(5);
  });

  it('keeps a half hour rather than rounding it away', () => {
    expect(windowHours([{ startTime: '09:00', endTime: '10:30' }])).toBe(1.5);
  });

  it('is zero for a day with nothing on it', () => {
    expect(windowHours([])).toBe(0);
  });
});
