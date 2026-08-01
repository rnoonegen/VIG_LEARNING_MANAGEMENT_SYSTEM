import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, Users } from 'lucide-react';
import type { StudentSubjectLevelDto, StudentSummaryDto } from '@vig/shared';
import { get } from '@/lib/api';
import { Avatar, PageHeader, Section } from '@/components/ui/Layout';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Pill, SubjectBadge } from '@/components/ui/Chip';

/**
 * One list, two audiences.
 *
 * The API scopes the result in the repository query — an admin sees every
 * student, a teacher only their own — so this component does no filtering of its
 * own. What it does do is follow the shape of the answer: an admin is looking at
 * a roster, a teacher is looking at "who am I teaching, and in what" (F6), so a
 * teacher's list is grouped by subject.
 */
export function StudentsPage({ basePath, canManage }: { basePath: string; canManage?: boolean }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['students'],
    queryFn: () => get<StudentSummaryDto[]>('/students'),
  });

  // The teacher-scoped fields are only present when a teacher asked.
  const teacherView = Boolean(data?.some((s) => s.taughtSubjectLevels !== undefined));

  return (
    <div>
      <PageHeader
        title="Students"
        description={
          canManage
            ? 'Manage students and their learning levels across subjects.'
            : 'The students you teach, grouped by subject.'
        }
        action={
          canManage ? (
            <ButtonLink to="/admin/students/new" icon={<Plus size={16} />}>
              Add Student
            </ButtonLink>
          ) : undefined
        }
      />

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : data && data.length === 0 ? (
        <EmptyState
          icon={<Users size={26} />}
          title={canManage ? 'Add your first student' : 'No students yet'}
          description={
            canManage
              ? 'Add children and what they are learning so you can start building their learning journey.'
              : 'Students appear here once the school assigns you a subject they study, or schedules a class with you.'
          }
          action={
            canManage ? (
              <ButtonLink to="/admin/students/new" icon={<Plus size={16} />}>
                Add Student
              </ButtonLink>
            ) : undefined
          }
        />
      ) : teacherView ? (
        <BySubject students={data ?? []} basePath={basePath} />
      ) : (
        <div className="flex flex-col gap-2">
          {data?.map((student) => (
            <StudentRow key={student.id} student={student} basePath={basePath} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A teacher's students, one section per subject they hold.
 *
 * A child studying two of their subjects appears under both — the question being
 * answered is "who is in front of me for this subject", not "list each child once".
 */
function BySubject({ students, basePath }: { students: StudentSummaryDto[]; basePath: string }) {
  const groups = new Map<string, { subject: StudentSubjectLevelDto; students: StudentSummaryDto[] }>();
  const unmatched: StudentSummaryDto[] = [];

  for (const student of students) {
    const taught = student.taughtSubjectLevels ?? [];
    if (taught.length === 0) {
      // In one of their classes, but the subject sits outside their capabilities.
      unmatched.push(student);
      continue;
    }
    for (const sl of taught) {
      const group = groups.get(sl.subjectId);
      if (group) group.students.push(student);
      else groups.set(sl.subjectId, { subject: sl, students: [student] });
    }
  }

  return (
    <>
      {[...groups.values()].map(({ subject, students: inSubject }) => (
        <Section
          key={subject.subjectId}
          title={`${subject.subjectName} · ${inSubject.length} ${inSubject.length === 1 ? 'student' : 'students'}`}
        >
          <div className="flex flex-col gap-2">
            {inSubject.map((student) => (
              <StudentRow
                key={student.id}
                student={student}
                basePath={basePath}
                subjectId={subject.subjectId}
              />
            ))}
          </div>
        </Section>
      ))}

      {unmatched.length > 0 ? (
        <Section title="Also in your classes">
          <div className="flex flex-col gap-2">
            {unmatched.map((student) => (
              <StudentRow key={student.id} student={student} basePath={basePath} />
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function StudentRow({
  student,
  basePath,
  subjectId,
}: {
  student: StudentSummaryDto;
  basePath: string;
  /** Set inside a subject group: show that subject's level, not every subject. */
  subjectId?: string;
}) {
  const shown = subjectId
    ? student.subjectLevels.filter((sl) => sl.subjectId === subjectId)
    : (student.taughtSubjectLevels ?? student.subjectLevels);

  return (
    <Card padded={false}>
      <Link
        to={`${basePath}/${student.id}`}
        className="touch-target flex items-center gap-3 px-4 py-3.5 hover:bg-lavender-2"
      >
        <Avatar name={student.fullName} url={student.avatarUrl} size={44} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">
            {student.fullName}
            {student.gradeLabel ? (
              <span className="ml-2 text-xs font-normal text-ink-3">{student.gradeLabel}</span>
            ) : null}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {shown.length === 0 ? (
              <span className="text-xs text-warning">No subjects assigned yet</span>
            ) : (
              shown.map((sl) => (
                <SubjectBadge
                  key={sl.subjectId}
                  name={sl.subjectName}
                  colorToken={sl.colorToken}
                  sublabel={sl.levelName}
                />
              ))
            )}
          </div>
        </div>

        {/* Theirs to teach, but nothing on the calendar yet — the admin still has
            a class to create. */}
        {student.hasScheduledClass === false ? <Pill token="orange">Not scheduled</Pill> : null}

        <ChevronRight size={16} className="shrink-0 text-ink-3" />
      </Link>
    </Card>
  );
}
