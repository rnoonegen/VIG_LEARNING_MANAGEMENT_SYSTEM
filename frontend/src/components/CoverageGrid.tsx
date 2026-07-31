import { Fragment } from 'react';
import type { CoverageDto } from '@vig/shared';
import { Avatar } from '@/components/ui/Layout';
import { cn } from '@/lib/ui';

/**
 * What each child was taken through, as a grid.
 *
 * Sub-headings down the side, the students in the class across the top, a tick
 * where the two meet. It is deliberately the same component in the class-record
 * flow and on the standalone page, so a teacher ticking after the fact sees
 * exactly what they saw during the class.
 *
 * Ticks already saved from earlier classes arrive pre-filled — the teacher marks
 * what is new rather than restating the term.
 */
export interface CoverageState {
  /** `${studentId}:${skillId}` for every ticked box. */
  ticked: Set<string>;
}

export function coverageKey(studentId: string, skillId: string): string {
  return `${studentId}:${skillId}`;
}

/** Turns the API's per-student arrays into the flat set the grid toggles. */
export function toTickedSet(covered: Record<string, string[]>): Set<string> {
  const ticked = new Set<string>();
  for (const [studentId, skillIds] of Object.entries(covered)) {
    for (const skillId of skillIds) ticked.add(coverageKey(studentId, skillId));
  }
  return ticked;
}

/** Every cell in the grid, which is what the API expects on save. */
export function toEntries(
  students: Array<{ id: string }>,
  headings: Array<{ subHeadings: Array<{ id: string }> }>,
  ticked: Set<string>,
): Array<{ studentId: string; skillId: string; covered: boolean }> {
  return students.flatMap((student) =>
    headings.flatMap((heading) =>
      heading.subHeadings.map((sub) => ({
        studentId: student.id,
        skillId: sub.id,
        covered: ticked.has(coverageKey(student.id, sub.id)),
      })),
    ),
  );
}

export function CoverageGrid({
  students,
  headings,
  ticked,
  onToggle,
  emptyHint,
}: {
  students: Array<{ id: string; fullName: string; avatarUrl: string | null }>;
  headings: CoverageDto['headings'];
  ticked: Set<string>;
  onToggle: (studentId: string, skillId: string) => void;
  emptyHint?: string;
}) {
  if (headings.length === 0 || headings.every((h) => h.subHeadings.length === 0)) {
    return (
      <p className="rounded-[12px] bg-lavender-2 px-4 py-3 text-sm text-ink-2">
        {emptyHint ??
          'This level has no sub-headings yet. Add them under Curriculum and they will appear here.'}
      </p>
    );
  }

  if (students.length === 0) {
    return <p className="text-sm text-ink-2">No students are in this class.</p>;
  }

  return (
    <div className="scroll-x -mx-1 px-1">
      <table className="w-full min-w-max border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-card px-2 pb-3 text-left align-bottom">
              <span className="text-xs font-medium text-ink-2">Sub-heading</span>
            </th>
            {students.map((student) => (
              <th key={student.id} className="px-2 pb-3 align-bottom">
                <span className="flex w-16 flex-col items-center gap-1">
                  <Avatar name={student.fullName} url={student.avatarUrl} size={28} />
                  <span className="w-16 truncate text-center text-[11px] text-ink-2">
                    {student.fullName.split(' ')[0]}
                  </span>
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {headings.map((heading) => (
            <Fragment key={heading.id}>
              <tr>
                <td
                  colSpan={students.length + 1}
                  className="sticky left-0 bg-lavender-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2"
                >
                  {heading.name}
                </td>
              </tr>

              {heading.subHeadings.map((sub) => (
                <tr key={sub.id} className="border-b border-line last:border-0">
                  <td className="sticky left-0 z-10 max-w-[220px] bg-card px-2 py-2 text-sm text-ink">
                    {sub.name}
                  </td>
                  {students.map((student) => {
                    const checked = ticked.has(coverageKey(student.id, sub.id));
                    return (
                      <td key={student.id} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          aria-label={`${sub.name} — ${student.fullName}`}
                          onClick={() => onToggle(student.id, sub.id)}
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-[8px] border transition-colors',
                            checked
                              ? 'border-success bg-success text-white'
                              : 'border-line bg-card text-transparent hover:border-violet',
                          )}
                        >
                          <CheckMark />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CheckMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
