import { describe, expect, it } from 'vitest';
import { checkJoin, type JoinCheckInput } from './enrolment.js';

/**
 * Joining an existing class.
 *
 * The distinction under test is which failures are refusals and which are the
 * school's call: a level mismatch silently records a child's work where nobody
 * can see it, and being in two classes at once is impossible — but a class
 * outside their stated availability is a decision, and Needs Attention already
 * reports it either way.
 */

/** Monday 2026-03-02, 09:00–10:00 UTC. */
const MONDAY_9AM = { start: new Date('2026-03-02T09:00:00.000Z'), end: new Date('2026-03-02T10:00:00.000Z') };

function input(overrides: Partial<JoinCheckInput> = {}): JoinCheckInput {
  return {
    studentName: 'Aarav',
    klass: { subjectName: 'Sanskrit', levelId: 'level-1', levelName: 'Level 1' },
    current: { levelId: 'level-1', levelName: 'Level 1' },
    // Monday 08:00–15:00, which covers the class.
    studentAvailability: [{ weekday: 1, startTime: '08:00', endTime: '15:00' }],
    occurrences: [MONDAY_9AM],
    booked: [],
    ...overrides,
  };
}

describe('checkJoin', () => {
  it('accepts a child on the class’s level, free at that time', () => {
    expect(checkJoin(input())).toEqual({ blockers: [], warnings: [] });
  });

  it('refuses a child who does not study the subject at all', () => {
    const result = checkJoin(input({ current: null }));
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]).toMatch(/not studying Sanskrit/i);
  });

  it('refuses a level mismatch, naming both levels', () => {
    const result = checkJoin(
      input({ current: { levelId: 'level-3', levelName: 'Level 3' } }),
    );
    expect(result.blockers[0]).toMatch(/on Level 3/i);
    expect(result.blockers[0]).toMatch(/this class teaches Level 1/i);
  });

  it('refuses a double booking', () => {
    const result = checkJoin({
      ...input(),
      // Overlaps the second half of the class.
      booked: [{ start: new Date('2026-03-02T09:30:00.000Z'), end: new Date('2026-03-02T10:30:00.000Z') }],
    });
    expect(result.blockers[0]).toMatch(/already booked/i);
  });

  it('ignores a booking that merely abuts the class', () => {
    const result = checkJoin({
      ...input(),
      booked: [{ start: new Date('2026-03-02T10:00:00.000Z'), end: new Date('2026-03-02T11:00:00.000Z') }],
    });
    expect(result.blockers).toEqual([]);
  });

  it('warns rather than refuses when the class sits outside their availability', () => {
    const result = checkJoin(input({ studentAvailability: [{ weekday: 1, startTime: '13:00', endTime: '15:00' }] }));
    expect(result.blockers).toEqual([]);
    expect(result.warnings[0]).toMatch(/outside Aarav's weekly availability/i);
  });

  it('warns when a child has no availability on that weekday at all', () => {
    const result = checkJoin(input({ studentAvailability: [{ weekday: 2, startTime: '08:00', endTime: '15:00' }] }));
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });

  it('counts every affected date, not just the first', () => {
    const result = checkJoin(
      input({
        studentAvailability: [],
        occurrences: [
          MONDAY_9AM,
          { start: new Date('2026-03-09T09:00:00.000Z'), end: new Date('2026-03-09T10:00:00.000Z') },
        ],
      }),
    );
    expect(result.warnings[0]).toMatch(/2 dates/);
  });

  it('reports a level mismatch and a clash together rather than stopping at the first', () => {
    const result = checkJoin({
      ...input({ current: { levelId: 'level-3', levelName: 'Level 3' } }),
      booked: [MONDAY_9AM],
    });
    expect(result.blockers).toHaveLength(2);
  });
});
