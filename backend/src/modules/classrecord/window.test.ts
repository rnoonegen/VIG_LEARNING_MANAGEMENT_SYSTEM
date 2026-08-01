import { describe, expect, it } from 'vitest';
import { MAX_WINDOW_MS, MIN_WINDOW_MS, recordState, recordWindow, recordWindowState } from './window.js';

/**
 * One record per class, written between the class and the next morning.
 *
 * The rule exists to keep a class record close to the class it describes, so the
 * boundaries are the whole point: the instant it opens, the instant it closes,
 * and the fact that a saved record ignores the clock entirely.
 */

/** Wednesday 2026-08-05, 09:00. */
const CLASS_START = new Date('2026-08-05T09:00:00.000Z');
const at = (iso: string) => new Date(iso);

describe('recordWindow', () => {
  it('opens at the class start and closes at 09:00 the next morning', () => {
    const { opensAt, closesAt } = recordWindow(CLASS_START);
    expect(opensAt.toISOString()).toBe('2026-08-05T09:00:00.000Z');
    expect(closesAt.toISOString()).toBe('2026-08-06T09:00:00.000Z');
  });

  it('gives a late class a shorter window, not a later cutoff', () => {
    const { closesAt } = recordWindow(at('2026-08-05T23:30:00.000Z'));
    expect(closesAt.toISOString()).toBe('2026-08-06T09:00:00.000Z');
  });

  it('rolls the cutoff over a month boundary', () => {
    const { closesAt } = recordWindow(at('2026-07-31T18:00:00.000Z'));
    expect(closesAt.toISOString()).toBe('2026-08-01T09:00:00.000Z');
  });

  it('keeps every window inside the bounds the query filters rely on', () => {
    for (const hour of [0, 6, 9, 13, 18, 23]) {
      const start = at(`2026-08-05T${String(hour).padStart(2, '0')}:00:00.000Z`);
      const length = +recordWindow(start).closesAt - +start;
      expect(length).toBeGreaterThanOrEqual(MIN_WINDOW_MS);
      expect(length).toBeLessThanOrEqual(MAX_WINDOW_MS);
    }
  });
});

describe('recordWindowState', () => {
  it('is not open before the class starts', () => {
    expect(recordWindowState(CLASS_START, at('2026-08-05T08:59:59.000Z'))).toBe('NOT_YET_OPEN');
  });

  it('opens exactly at the class start', () => {
    expect(recordWindowState(CLASS_START, CLASS_START)).toBe('OPEN');
  });

  it('stays open during the class and overnight', () => {
    expect(recordWindowState(CLASS_START, at('2026-08-05T09:30:00.000Z'))).toBe('OPEN');
    expect(recordWindowState(CLASS_START, at('2026-08-06T02:00:00.000Z'))).toBe('OPEN');
    expect(recordWindowState(CLASS_START, at('2026-08-06T08:59:59.000Z'))).toBe('OPEN');
  });

  it('closes at the cutoff, not a moment after', () => {
    expect(recordWindowState(CLASS_START, at('2026-08-06T09:00:00.000Z'))).toBe('CLOSED');
  });

  it('stays closed for good', () => {
    expect(recordWindowState(CLASS_START, at('2026-09-01T09:00:00.000Z'))).toBe('CLOSED');
  });
});

describe('recordState — a saved record is final', () => {
  it('reports SAVED while the window is still open, so it cannot be written twice', () => {
    expect(recordState(CLASS_START, 'SAVED', at('2026-08-05T10:00:00.000Z'))).toBe('SAVED');
  });

  it('reports SAVED long after the window closed', () => {
    expect(recordState(CLASS_START, 'SAVED', at('2026-09-01T09:00:00.000Z'))).toBe('SAVED');
  });

  it('treats an abandoned draft as unwritten', () => {
    expect(recordState(CLASS_START, 'DRAFT', at('2026-08-05T10:00:00.000Z'))).toBe('OPEN');
    expect(recordState(CLASS_START, 'IN_REVIEW', at('2026-08-06T10:00:00.000Z'))).toBe('CLOSED');
  });

  it('treats no record at all as unwritten', () => {
    expect(recordState(CLASS_START, null, at('2026-08-05T10:00:00.000Z'))).toBe('OPEN');
  });
});
