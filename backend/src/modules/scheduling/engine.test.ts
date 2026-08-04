import { describe, expect, it } from 'vitest';
import {
  diagnoseNoOptions,
  findValidSlots,
  validateMove,
  type SchedulingSnapshot,
  type SlotRequest,
} from './engine.js';

/**
 * BR-06 — schedule validity = teacher capability ∧ teacher availability ∧
 * student availability ∧ no conflict.
 *
 * The engine is pure (AD-07), so each rule is switched off one at a time and the
 * option is expected to disappear. Day 4 of the delivery plan calls this the
 * single biggest risk in the build; these are its regression net.
 */

const MON_TO_FRI = [1, 2, 3, 4, 5];

/** Priya teaches Mathematics levels 5–7, Mon–Fri 08:30–14:30. */
function priya(overrides: Partial<SchedulingSnapshot['teachers'][number]> = {}) {
  return {
    teacherId: 'teacher-priya',
    fullName: 'Priya Sharma',
    capabilities: [
      { subjectId: 'maths', minLevelOrder: 5, maxLevelOrder: 7, isPrimary: true },
    ],
    availability: MON_TO_FRI.map((weekday) => ({
      weekday,
      startTime: '08:30',
      endTime: '14:30',
    })),
    exceptions: [],
    ...overrides,
  };
}

/** Aarav is available Mon–Fri 09:00–15:00. */
function aarav(overrides: Partial<SchedulingSnapshot['students'][number]> = {}) {
  return {
    studentId: 'student-aarav',
    fullName: 'Aarav Sharma',
    availability: MON_TO_FRI.map((weekday) => ({
      weekday,
      startTime: '09:00',
      endTime: '15:00',
    })),
    ...overrides,
  };
}

function snapshot(overrides: Partial<SchedulingSnapshot> = {}): SchedulingSnapshot {
  return {
    teachers: [priya()],
    students: [aarav()],
    booked: [],
    levelOrder: 6,
    ...overrides,
  };
}

/** "Mathematics, Aarav + Priya, twice a week, mornings, 1 hour" (Day 4 exit criteria). */
const REQUEST: SlotRequest = {
  studentIds: ['student-aarav'],
  subjectId: 'maths',
  levelId: 'maths-l6',
  timesPerWeek: 2,
  durationMinutes: 60,
  timePreference: 'MORNING',
  // A Monday.
  startDate: '2026-08-03',
};

describe('findValidSlots — the happy path', () => {
  it('returns ranked options inside the teacher’s availability', () => {
    const options = findValidSlots(REQUEST, snapshot());

    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      // Priya is free 08:30–14:30; a 60-minute class must fit inside that.
      expect(option.startTime >= '08:30').toBe(true);
      expect(option.endTime <= '14:30').toBe(true);
      expect(option.daysOfWeek).toHaveLength(2);
      expect(option.teacherId).toBe('teacher-priya');
    }
  });

  it('marks exactly one option as the Best Match', () => {
    const options = findValidSlots(REQUEST, snapshot());
    expect(options.filter((o) => o.isBestMatch)).toHaveLength(1);
    // Highest score sorts first.
    expect(options[0]!.isBestMatch).toBe(true);
  });

  it('honours the morning preference in its ranking', () => {
    const options = findValidSlots(REQUEST, snapshot());
    expect(options[0]!.startTime < '12:00').toBe(true);
  });

  it('caps the option list rather than returning every permutation', () => {
    expect(findValidSlots(REQUEST, snapshot()).length).toBeLessThanOrEqual(5);
  });
});

describe('findValidSlots — capability filter', () => {
  it('excludes a free teacher who cannot teach the subject', () => {
    const meera = priya({
      teacherId: 'teacher-meera',
      fullName: 'Meera Rao',
      capabilities: [{ subjectId: 'english', minLevelOrder: 4, maxLevelOrder: 6, isPrimary: true }],
    });
    // "VIG should not recommend Meera for Aarav's Mathematics class simply
    // because she is free."
    expect(findValidSlots(REQUEST, snapshot({ teachers: [meera] }))).toEqual([]);
  });

  it('excludes a teacher whose level range does not cover the request', () => {
    const junior = priya({
      capabilities: [{ subjectId: 'maths', minLevelOrder: 1, maxLevelOrder: 4, isPrimary: true }],
    });
    expect(findValidSlots(REQUEST, snapshot({ teachers: [junior] }))).toEqual([]);
  });

  it('respects an explicitly requested teacher', () => {
    const other = priya({ teacherId: 'teacher-other', fullName: 'Other Teacher' });
    const options = findValidSlots(
      { ...REQUEST, teacherId: 'teacher-other' },
      snapshot({ teachers: [priya(), other] }),
    );
    expect(options.every((o) => o.teacherId === 'teacher-other')).toBe(true);
  });
});

describe('findValidSlots — the teacher is the only diary', () => {
  it('offers nothing when the teacher has no window that day', () => {
    const mondayOnly = priya({ availability: [{ weekday: 1, startTime: '09:00', endTime: '12:00' }] });
    const options = findValidSlots(
      { ...REQUEST, timesPerWeek: 1, timePreference: 'ANY' },
      snapshot({ teachers: [mondayOnly] }),
    );
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((o) => o.daysOfWeek.every((d) => d === 1))).toBe(true);
  });

  it('will not place a class that does not fit inside the window', () => {
    // 09:00–10:00 is an hour; a 90-minute class cannot fit in it.
    const narrow = priya({ availability: [{ weekday: 1, startTime: '09:00', endTime: '10:00' }] });
    const options = findValidSlots(
      { ...REQUEST, timesPerWeek: 1, durationMinutes: 90 },
      snapshot({ teachers: [narrow] }),
    );
    expect(options).toEqual([]);
  });

  it('a group class is not narrowed by who is in it', () => {
    // Students carry no availability, so adding one cannot remove an option.
    const diya = aarav({ studentId: 'student-diya', fullName: 'Diya Rao' });
    const alone = findValidSlots(REQUEST, snapshot({ students: [aarav()] }));
    const together = findValidSlots(
      { ...REQUEST, studentIds: ['student-aarav', 'student-diya'] },
      snapshot({ students: [aarav(), diya] }),
    );

    expect(together.length).toBe(alone.length);
  });

  it('returns nothing when a requested student is missing from the snapshot', () => {
    expect(
      findValidSlots({ ...REQUEST, studentIds: ['student-aarav', 'ghost'] }, snapshot()),
    ).toEqual([]);
  });
});

describe('findValidSlots — exceptions override the recurring rule', () => {
  it('drops a pattern whose dates hit an all-day unavailability', () => {
    // Block every Monday and Wednesday in the 4-week conflict horizon so no
    // Mon/Wed pattern can survive.
    const blocked = ['2026-08-03', '2026-08-05', '2026-08-10', '2026-08-12', '2026-08-17', '2026-08-19', '2026-08-24', '2026-08-26'];
    const teacher = priya({
      exceptions: blocked.map((date) => ({
        date,
        isAvailable: false,
        allDay: true,
        startTime: null,
        endTime: null,
      })),
    });

    const options = findValidSlots(REQUEST, snapshot({ teachers: [teacher] }));
    for (const option of options) {
      expect(option.daysOfWeek).not.toEqual([1, 3]);
    }
  });
});

describe('findValidSlots — conflict detection', () => {
  it('rejects a slot that collides with the teacher’s existing class', () => {
    // Fill Priya's whole Mon/Wed window across the horizon.
    const booked = [];
    for (let week = 0; week < 4; week += 1) {
      for (const dayOffset of [0, 2]) {
        const day = 3 + week * 7 + dayOffset;
        booked.push({
          teacherId: 'teacher-priya',
          studentIds: ['someone-else'],
          start: new Date(`2026-08-${String(day).padStart(2, '0')}T09:00:00.000Z`),
          end: new Date(`2026-08-${String(day).padStart(2, '0')}T15:00:00.000Z`),
        });
      }
    }

    const options = findValidSlots(REQUEST, snapshot({ booked }));
    for (const option of options) {
      expect(option.daysOfWeek).not.toEqual([1, 3]);
    }
  });

  it('ignores a booking that involves neither this teacher nor these students', () => {
    const unrelated = [
      {
        teacherId: 'teacher-someone',
        studentIds: ['student-other'],
        start: new Date('2026-08-03T09:00:00.000Z'),
        end: new Date('2026-08-03T15:00:00.000Z'),
      },
    ];
    expect(findValidSlots(REQUEST, snapshot({ booked: unrelated })).length).toBeGreaterThan(0);
  });
});

describe('validateMove', () => {
  const base = {
    teacherId: 'teacher-priya',
    studentIds: ['student-aarav'],
    durationMinutes: 60,
  };

  it('accepts a move both parties are free for', () => {
    // Monday 10:00–11:00.
    const result = validateMove(
      { ...base, start: new Date('2026-08-03T10:00:00.000Z') },
      snapshot(),
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a move outside the teacher’s availability', () => {
    const result = validateMove(
      { ...base, start: new Date('2026-08-03T16:00:00.000Z') },
      snapshot(),
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/teacher is not available/i);
  });

  it('accepts a move the teacher is free for, whatever the hour suits the child', () => {
    // 08:30 is inside Priya's 08:30–14:30. A child has no diary to contradict it.
    const result = validateMove(
      { ...base, start: new Date('2026-08-03T08:30:00.000Z') },
      snapshot(),
    );
    expect(result.valid).toBe(true);
  });

  it('still rejects a move for a student who does not exist', () => {
    const result = validateMove(
      { ...base, studentIds: ['student-ghost'], start: new Date('2026-08-03T10:00:00.000Z') },
      snapshot(),
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/student not found/i);
  });

  it('rejects a move that clashes with another booking', () => {
    const booked = [
      {
        teacherId: 'teacher-priya',
        studentIds: ['student-other'],
        start: new Date('2026-08-03T10:00:00.000Z'),
        end: new Date('2026-08-03T11:00:00.000Z'),
      },
    ];
    const result = validateMove(
      { ...base, start: new Date('2026-08-03T10:00:00.000Z') },
      snapshot({ booked }),
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/clashes/i);
  });

  it('ignores the occurrence being moved when checking for clashes', () => {
    // Without the ignore, a class would always collide with itself.
    const self = {
      teacherId: 'teacher-priya',
      studentIds: ['student-aarav'],
      start: new Date('2026-08-03T10:00:00.000Z'),
      end: new Date('2026-08-03T11:00:00.000Z'),
    };
    const result = validateMove(
      { ...base, start: new Date('2026-08-03T10:00:00.000Z') },
      snapshot({ booked: [self] }),
      { start: self.start, end: self.end },
    );
    expect(result.valid).toBe(true);
  });

  it('rejects an unknown teacher rather than silently allowing the move', () => {
    const result = validateMove(
      { ...base, teacherId: 'ghost', start: new Date('2026-08-03T10:00:00.000Z') },
      snapshot(),
    );
    expect(result.valid).toBe(false);
  });
});

/**
 * An empty result has to say which constraint emptied it.
 *
 * "No valid times found" sends an admin hunting through availability when the
 * real cause was a missing teaching capability — the exact dead end that
 * prompted this: a teacher assigned Maths, asked to take science.
 */
describe('diagnoseNoOptions', () => {
  const LABELS = { subjectName: 'science', levelName: 'L1' };

  /** The reported case: the chosen teacher does not hold the subject at all. */
  it('names the missing capability when a specific teacher was chosen', () => {
    const request = { ...REQUEST, subjectId: 'science', teacherId: 'teacher-priya' };
    const state = snapshot({ levelOrder: 0 });

    expect(findValidSlots(request, state)).toEqual([]);

    const [first, second] = diagnoseNoOptions(request, state, LABELS);
    expect(first).toMatch(/Priya Sharma is not assigned to teach science at L1/i);
    expect(first).toMatch(/Teachers → Priya Sharma → Teaching/);
    // And says plainly that nobody else covers it either.
    expect(second).toMatch(/No teacher is assigned to science at L1 yet/i);
  });

  it('points at the teacher who can take it when one exists', () => {
    const ravi = {
      ...priya(),
      teacherId: 'teacher-ravi',
      fullName: 'Ravi Kumar',
      capabilities: [{ subjectId: 'science', minLevelOrder: 0, maxLevelOrder: 3, isPrimary: true }],
    };
    const request = { ...REQUEST, subjectId: 'science', teacherId: 'teacher-priya' };

    const reasons = diagnoseNoOptions(request, snapshot({ teachers: [priya(), ravi], levelOrder: 0 }), LABELS);
    expect(reasons[1]).toMatch(/Ravi Kumar can teach it/i);
  });

  it('reports that nobody holds the subject when no teacher was chosen', () => {
    const request = { ...REQUEST, subjectId: 'science' };
    const reasons = diagnoseNoOptions(request, snapshot({ levelOrder: 0 }), LABELS);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/No teacher is assigned to teach science at L1/i);
  });

  it('never blames a student for availability, because they have none', () => {
    const reasons = diagnoseNoOptions(REQUEST, snapshot({ students: [aarav()] }), LABELS);
    expect(reasons.join(' ')).not.toMatch(/Aarav Sharma has no weekly availability/i);
  });

  it('names the teacher whose availability is missing', () => {
    const reasons = diagnoseNoOptions(REQUEST, snapshot({ teachers: [priya({ availability: [] })] }), LABELS);
    expect(reasons[0]).toMatch(/Priya Sharma has no weekly availability set/i);
  });

  it('reports a window too short to hold the class', () => {
    // Priya is free for half an hour; the request asks for an hour.
    const reasons = diagnoseNoOptions(
      REQUEST,
      snapshot({
        teachers: [priya({ availability: [{ weekday: 1, startTime: '08:00', endTime: '08:30' }] })],
      }),
      LABELS,
    );
    expect(reasons[0]).toMatch(/no 60-minute window free/i);
  });

  it('reports too few days for the requested frequency', () => {
    // Monday only, but the request asks for twice a week.
    const reasons = diagnoseNoOptions(
      REQUEST,
      snapshot({
        teachers: [priya({ availability: [{ weekday: 1, startTime: '09:00', endTime: '12:00' }] })],
      }),
      LABELS,
    );
    expect(reasons[0]).toMatch(/only 1 day a week/i);
    expect(reasons[0]).toMatch(/asked for 2 times per week/i);
  });

  it('falls through to clashes once capability and availability are fine', () => {
    // Every candidate weekday is fully booked for Priya.
    const booked = MON_TO_FRI.flatMap((weekday) => {
      const day = new Date(Date.UTC(2026, 7, 2 + weekday));
      return [
        {
          teacherId: 'teacher-priya',
          studentIds: [] as string[],
          start: new Date(day.setUTCHours(9, 0, 0, 0)),
          end: new Date(new Date(day).setUTCHours(14, 30, 0, 0)),
        },
      ];
    });

    const reasons = diagnoseNoOptions(REQUEST, snapshot({ booked }), LABELS);
    expect(reasons[0]).toMatch(/already on the schedule|marked unavailable/i);
  });
});
