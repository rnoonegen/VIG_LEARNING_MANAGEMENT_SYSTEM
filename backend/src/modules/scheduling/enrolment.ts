import { toHHMM } from '@vig/shared';
import { isAvailableFor, type RecurringSlot } from './availability.js';

/**
 * Whether a child can join a class that already exists.
 *
 * Adding a subject to a student does not by itself put them in front of a
 * teacher — a class does. Rather than force a duplicate class per child, this is
 * the check for dropping them into a running one, and it is separated from the
 * database so the rules are testable on their own (AD-07, as with the engine).
 *
 * Blockers are things that would corrupt the record or are physically
 * impossible. Warnings are things the school may legitimately choose to accept;
 * Needs Attention keeps reporting them either way.
 */

export interface JoinCheckInput {
  studentName: string;
  /** The class being joined. */
  klass: { subjectName: string; levelId: string; levelName: string };
  /** The student's current level in that subject, or null if they do not study it. */
  current: { levelId: string; levelName: string } | null;
  studentAvailability: RecurringSlot[];
  /** Upcoming occurrences of the class the student would inherit. */
  occurrences: Array<{ start: Date; end: Date }>;
  /** Occurrences the student is already booked into, excluding this class. */
  booked: Array<{ start: Date; end: Date }>;
}

export interface JoinCheck {
  blockers: string[];
  warnings: string[];
}

function windowOf(start: Date, end: Date) {
  return {
    startTime: toHHMM(start.getUTCHours() * 60 + start.getUTCMinutes()),
    endTime: toHHMM(end.getUTCHours() * 60 + end.getUTCMinutes()),
  };
}

export function checkJoin(input: JoinCheckInput): JoinCheck {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // 1 — The subject has to be one they study. Coverage in the class record is
  //     ticked against this level's sub-headings, and a child's learning map only
  //     renders their current level — so a mismatch records work nobody can see.
  if (!input.current) {
    blockers.push(
      `${input.studentName} is not studying ${input.klass.subjectName}. Add the subject first.`,
    );
  } else if (input.current.levelId !== input.klass.levelId) {
    blockers.push(
      `${input.studentName} is on ${input.current.levelName} in ${input.klass.subjectName}; this class teaches ${input.klass.levelName}.`,
    );
  }

  // 2 — Being in two places at once is not a judgement call.
  const clashes = input.occurrences.filter((o) =>
    input.booked.some((b) => b.start < o.end && o.start < b.end),
  );
  if (clashes.length > 0) {
    blockers.push(
      `${input.studentName} is already booked for another class at this time (${clashes.length} ${
        clashes.length === 1 ? 'date' : 'dates'
      }).`,
    );
  }

  // 3 — Outside their stated availability is a decision for the school, not a
  //     hard stop: the same case already surfaces on Admin Home.
  const outside = input.occurrences.filter((o) => {
    const date = new Date(o.start);
    date.setUTCHours(0, 0, 0, 0);
    // Students have no dated exceptions in the model, so the weekly pattern is
    // the whole story here.
    return !isAvailableFor(input.studentAvailability, [], date, windowOf(o.start, o.end));
  });
  if (outside.length > 0) {
    warnings.push(
      `This class falls outside ${input.studentName}'s weekly availability on ${outside.length} ${
        outside.length === 1 ? 'date' : 'dates'
      }.`,
    );
  }

  return { blockers, warnings };
}
