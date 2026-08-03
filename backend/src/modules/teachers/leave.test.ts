import { describe, expect, it } from 'vitest';
import { datesCovered, leaveDayCount } from './leave.js';
import { monthRange } from './attendance.js';

/**
 * Leave is counted in days and read a month at a time, so the boundaries are the
 * whole game: an inclusive range that is off by one silently miscounts somebody's
 * attendance, and a month that starts an hour early drags the previous month's
 * last class into it.
 */

const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

describe('datesCovered', () => {
  it('includes both ends of the range', () => {
    expect(datesCovered(day('2026-08-12'), day('2026-08-14'))).toEqual([
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
    ]);
  });

  it('is one date when the leave is a single day', () => {
    expect(datesCovered(day('2026-08-12'), day('2026-08-12'))).toEqual(['2026-08-12']);
  });

  it('crosses a month end without losing or repeating a day', () => {
    expect(datesCovered(day('2026-08-30'), day('2026-09-02'))).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
  });

  it('handles a leap day', () => {
    expect(datesCovered(day('2028-02-28'), day('2028-03-01'))).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });
});

describe('leaveDayCount', () => {
  it('counts every whole day in the range', () => {
    expect(leaveDayCount({ fromDate: day('2026-08-12'), toDate: day('2026-08-14'), allDay: true })).toBe(3);
  });

  it('counts a part-day as a half, however the dates read', () => {
    expect(leaveDayCount({ fromDate: day('2026-08-12'), toDate: day('2026-08-12'), allDay: false })).toBe(0.5);
  });
});

describe('monthRange', () => {
  it('is half-open: the first of the month up to, not including, the next', () => {
    const range = monthRange('2026-08');
    expect(range.start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('rolls the year over in December', () => {
    expect(monthRange('2026-12').end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('labels the month the way the school reads it', () => {
    expect(monthRange('2026-08').label).toBe('August 2026');
  });
});
