import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, Users } from 'lucide-react';
import type { StudentSummaryDto } from '@vig/shared';
import { get } from '@/lib/api';
import { Avatar, PageHeader } from '@/components/ui/Layout';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { SubjectBadge } from '@/components/ui/Chip';

/**
 * One list, two audiences.
 *
 * The API scopes the result in the repository query — an admin sees every
 * student, a teacher only those in their own classes — so this component does no
 * filtering of its own.
 */
export function StudentsPage({ basePath, canManage }: { basePath: string; canManage?: boolean }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['students'],
    queryFn: () => get<StudentSummaryDto[]>('/students'),
  });

  return (
    <div>
      <PageHeader
        title="Students"
        description={
          canManage
            ? 'Manage students and their learning levels across subjects.'
            : 'Students in your classes.'
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
              : 'Students appear here once you have classes scheduled with them.'
          }
          action={
            canManage ? (
              <ButtonLink to="/admin/students/new" icon={<Plus size={16} />}>
                Add Student
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {data?.map((student) => (
            <Card key={student.id} padded={false}>
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
                    {student.subjectLevels.length === 0 ? (
                      <span className="text-xs text-warning">No subjects assigned yet</span>
                    ) : (
                      student.subjectLevels.map((sl) => (
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

                <ChevronRight size={16} className="shrink-0 text-ink-3" />
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
