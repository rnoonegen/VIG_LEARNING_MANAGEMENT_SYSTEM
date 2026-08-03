import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ChevronRight, GraduationCap, KeyRound, Plus } from 'lucide-react';
import type { TeacherLeaveRequestDto, TeacherSummaryDto } from '@vig/shared';
import { get } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Avatar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Pill, SubjectBadge } from '@/components/ui/Chip';

/** Fewer than ten teachers — the list stays deliberately simple (Flow 10). */
export function TeachersPage() {
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['teachers'],
    queryFn: () => get<TeacherSummaryDto[]>('/teachers'),
  });

  return (
    <div>
      <PageHeader
        title="Teachers"
        description="Manage teaching capabilities, and review availability, leave and attendance."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              icon={<CalendarClock size={16} />}
              onClick={() => navigate('/admin/teachers/attendance')}
            >
              Attendance
            </Button>
            <Button icon={<Plus size={16} />} onClick={() => navigate('/admin/teachers/new')}>
              Add Teacher
            </Button>
          </div>
        }
      />

      <PendingLeaveBanner />

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : data && data.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={26} />}
          title="Add your teachers"
          description="Add teachers so classes can be designed and scheduled. VIG uses what each teacher can teach, and when, to find valid class times."
          action={
            <Button icon={<Plus size={16} />} onClick={() => navigate('/admin/teachers/new')}>
              Add Teacher
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {data?.map((teacher) => (
            <Card key={teacher.id} padded={false}>
              <Link
                to={`/admin/teachers/${teacher.id}`}
                className="touch-target flex items-center gap-3 px-4 py-3.5 hover:bg-lavender-2"
              >
                <Avatar name={teacher.fullName} url={teacher.avatarUrl} size={40} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{teacher.fullName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {teacher.subjects.length === 0 ? (
                      <span className="text-xs text-ink-3">No subjects assigned yet</span>
                    ) : (
                      teacher.subjects.map((s) => (
                        <SubjectBadge
                          key={s.name}
                          name={s.name}
                          colorToken={s.colorToken}
                          sublabel={s.levelRange}
                        />
                      ))
                    )}
                  </div>
                  <p className="mt-1 text-xs text-ink-2">
                    {teacher.status !== 'ACTIVE'
                      ? 'No access · past records kept'
                      : teacher.availableToday
                        ? `Available today · ${teacher.availableToday}`
                        : 'Not available today'}
                  </p>
                </div>

                {teacher.status !== 'ACTIVE' ? (
                  <Pill token="muted">Inactive</Pill>
                ) : teacher.availableToday ? (
                  <Pill token="green">Available</Pill>
                ) : (
                  <Pill token="muted">Unavailable</Pill>
                )}
                <ChevronRight size={16} className="shrink-0 text-ink-3" />
              </Link>
            </Card>
          ))}
        </div>
      )}

    </div>
  );
}

/**
 * Leave a teacher is waiting on an answer for.
 *
 * It sits at the top of the list because it is the one thing here that somebody
 * else is blocked on — a teacher cannot plan around a day off until it is
 * answered.
 */
function PendingLeaveBanner() {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['teachers', 'leave', 'PENDING'],
    queryFn: () => get<TeacherLeaveRequestDto[]>('/teachers/leave', { status: 'PENDING' }),
  });

  if (!data || data.length === 0) return null;

  return (
    <Card tone="warning" className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {data.length} leave {data.length === 1 ? 'request is' : 'requests are'} waiting for your
            answer
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-2">
            {data
              .slice(0, 3)
              .map((r) => r.teacherName)
              .join(', ')}
            {data.length > 3 ? ` and ${data.length - 3} more` : ''}
          </p>
        </div>
        <Button size="sm" onClick={() => navigate('/admin/teachers/attendance')}>
          Review
        </Button>
      </div>
    </Card>
  );
}

/**
 * The temporary password appears here and nowhere else — it is never stored in
 * plaintext and cannot be retrieved again (AD-09). The admin passes it on
 * directly.
 */
export function TempPasswordModal({
  created,
  onClose,
  title = 'Account created',
}: {
  created: { username: string; tempPassword: string };
  onClose: () => void;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description="Share these details with them directly. This password is shown only once."
      footer={
        <Button onClick={onClose} fullWidth>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-[12px] border border-line bg-lavender-2 px-4 py-3">
          <p className="text-xs text-ink-2">Username</p>
          <p className="mt-0.5 font-mono text-sm font-medium text-ink">{created.username}</p>
        </div>

        <div className="rounded-[12px] border border-violet bg-lavender px-4 py-3">
          <p className="text-xs text-ink-2">Temporary password</p>
          <p className="mt-0.5 font-mono text-sm font-medium text-ink">{created.tempPassword}</p>
        </div>

        <Button
          variant="secondary"
          icon={<KeyRound size={15} />}
          onClick={async () => {
            await navigator.clipboard.writeText(`${created.username} / ${created.tempPassword}`);
            setCopied(true);
          }}
        >
          {copied ? 'Copied' : 'Copy username and password'}
        </Button>

        <p className="text-xs text-ink-2">
          They will be asked to create their own password the first time they sign in.
        </p>
      </div>
    </Modal>
  );
}
