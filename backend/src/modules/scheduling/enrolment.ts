/**
 * Whether a child can join a class that already exists.
 */

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
 *
 * A child's own weekly availability used to raise a warning here. The school
 * does not record one, so the only timing question left is the hard one: are
 * they already somewhere else.
 */

export interface JoinCheckInput {
  studentName: string;
  /** The class being joined. */
  klass: { subjectName: string; levelId: string; levelName: string };
  /** The student's current level in that subject, or null if they do not study it. */
  current: { levelId: string; levelName: string } | null;
  /** Upcoming occurrences of the class the student would inherit. */
  occurrences: Array<{ start: Date; end: Date }>;
  /** Occurrences the student is already booked into, excluding this class. */
  booked: Array<{ start: Date; end: Date }>;
}

export interface JoinCheck {
  blockers: string[];
  warnings: string[];
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

  return { blockers, warnings };
}
