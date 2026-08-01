import { describe, expect, it } from 'vitest';
import {
  combineDateAndTime,
} from '../modules/scheduling/engine.js';
import {
  formatInstantTime,
  formatLongDate,
  formatShortDate,
  SCHOOL_TIMEZONE,
} from '@vig/shared';

/**
 * Two frames, and the bug that comes from confusing them.
 *
 * Class times are school-local wall clock written into UTC fields, so they are
 * already in the school's clock; converting them into the school's timezone
 * applies the offset twice and a 9:00 AM class renders as 2:30 PM. Real instants
 * — savedAt, createdAt — are the opposite case and must be converted.
 *
 * This shipped once. These tests exist so it cannot ship again quietly.
 */

describe('scheduled values render in the frame they were stored in', () => {
  /** Exactly how the scheduler builds an occurrence's start (setUTCHours). */
  const nineAm = combineDateAndTime(new Date('2026-08-05T00:00:00.000Z'), '09:00');

  it('shows a 9:00 class as 9:00 AM, not shifted by the school offset', () => {
    expect(formatInstantTime(nineAm)).toBe('9:00 AM');
  });

  it('keeps the date of a late class on the day it was scheduled', () => {
    // 19:00 school time is 00:30 next day in Asia/Kolkata — the case that made
    // an evening class advertise itself on the wrong date.
    const sevenPm = combineDateAndTime(new Date('2026-08-05T00:00:00.000Z'), '19:00');
    expect(formatShortDate(sevenPm)).toBe('5 Aug 2026');
    expect(formatInstantTime(sevenPm)).toBe('7:00 PM');
  });

  it('renders the date and the time of one occurrence in the same frame', () => {
    // The pairing used across Needs Attention and every timetable row.
    const lateClass = combineDateAndTime(new Date('2026-12-31T00:00:00.000Z'), '23:00');
    expect(`${formatShortDate(lateClass)} · ${formatInstantTime(lateClass)}`).toBe(
      '31 Dec 2026 · 11:00 PM',
    );
  });

  it('treats a date-only column as the date it holds', () => {
    // @db.Date arrives as UTC midnight; a negative-offset school timezone would
    // otherwise roll it back a day.
    expect(formatShortDate(new Date('2026-08-05T00:00:00.000Z'))).toBe('5 Aug 2026');
  });
});

describe('real instants convert, when asked explicitly', () => {
  it('renders a genuine timestamp in the school timezone', () => {
    // 2026-08-05T20:00Z is already 06 Aug in Asia/Kolkata (+05:30).
    const savedAt = new Date('2026-08-05T20:00:00.000Z');
    expect(formatShortDate(savedAt, SCHOOL_TIMEZONE)).toBe('6 Aug 2026');
    // …and stays on the 5th if the caller forgets, which is why the call sites
    // that pass real instants name the timezone.
    expect(formatShortDate(savedAt)).toBe('5 Aug 2026');
  });

  it('formats the greeting date in the school timezone', () => {
    expect(formatLongDate(new Date('2026-08-05T20:00:00.000Z'), SCHOOL_TIMEZONE)).toBe(
      'Thursday 6 August',
    );
  });
});
