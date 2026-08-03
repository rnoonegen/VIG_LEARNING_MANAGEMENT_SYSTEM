import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Inbox } from 'lucide-react';
import type { TeacherLeaveRequestDto, TeacherMonthDto } from '@vig/shared';
import { errorMessage, get, patch } from '@/lib/api';
import { PageHeader, Section } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AllClear, ErrorState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Field, Textarea } from '@/components/ui/Field';
import { LeaveList, MonthPicker, leaveDates } from '@/components/TeacherMonth';

/**
 * Teacher attendance, for the admin (F5).
 *
 * Two jobs on one screen: answer the leave that is waiting, and read what each
 * teacher's month came to. Both are derived from the calendar and the answered
 * requests — there is no register anybody has to keep (AD-06).
 */
export function TeacherAttendancePage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const pending = useQuery({
    queryKey: ['teachers', 'leave', 'PENDING'],
    queryFn: () => get<TeacherLeaveRequestDto[]>('/teachers/leave', { status: 'PENDING' }),
  });

  const months = useQuery({
    queryKey: ['teachers', 'attendance', month],
    queryFn: () => get<TeacherMonthDto[]>('/teachers/attendance', { month }),
  });

  return (
    <div>
      <PageHeader
        title="Teacher Attendance"
        description="Leave waiting on you, and how each teacher's month is going."
      />

      <PendingLeave requests={pending.data ?? []} loading={pending.isLoading} />

      <Section title="This month" action={<MonthPicker value={month} onChange={setMonth} />}>
        {months.isLoading ? (
          <LoadingState rows={4} />
        ) : months.isError ? (
          <ErrorState onRetry={() => void months.refetch()} />
        ) : (
          <MonthTable rows={months.data ?? []} />
        )}
      </Section>
    </div>
  );
}

function PendingLeave({ requests, loading }: { requests: TeacherLeaveRequestDto[]; loading: boolean }) {
  const [deciding, setDeciding] = useState<{ request: TeacherLeaveRequestDto; approve: boolean } | null>(
    null,
  );

  return (
    <Section title={`Leave awaiting review${requests.length ? ` · ${requests.length}` : ''}`}>
      <Card>
        {loading ? (
          <LoadingState rows={2} />
        ) : requests.length === 0 ? (
          <AllClear title="Nothing waiting" description="Every leave request has been answered." />
        ) : (
          <LeaveList
            requests={requests}
            showTeacher
            emptyText="Nothing waiting."
            renderAction={(request) => (
              <>
                <Button size="sm" onClick={() => setDeciding({ request, approve: true })}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDeciding({ request, approve: false })}
                >
                  Decline
                </Button>
              </>
            )}
          />
        )}
      </Card>

      {deciding ? (
        <DecisionModal
          request={deciding.request}
          approve={deciding.approve}
          onClose={() => setDeciding(null)}
        />
      ) : null}
    </Section>
  );
}

/**
 * Approving does not cancel the classes already booked on those dates — it makes
 * them a scheduling issue on Admin Home (BR-06). The dialog says so before the
 * decision, rather than leaving it to be discovered.
 */
function DecisionModal({
  request,
  approve,
  onClose,
}: {
  request: TeacherLeaveRequestDto;
  approve: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const decide = useMutation({
    mutationFn: () =>
      patch(`/teachers/leave/${request.id}`, {
        status: approve ? 'APPROVED' : 'REJECTED',
        decisionNote: note.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['teachers'] });
      await queryClient.invalidateQueries({ queryKey: ['home'] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={approve ? `Approve leave for ${request.teacherName}?` : `Decline leave for ${request.teacherName}?`}
      description={leaveDates(request)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={decide.isPending}>
            Cancel
          </Button>
          <Button
            variant={approve ? 'primary' : 'danger'}
            onClick={() => decide.mutate()}
            disabled={decide.isPending}
          >
            {decide.isPending ? 'Saving…' : approve ? 'Approve' : 'Decline'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm text-ink-2">
        <p className="rounded-[12px] bg-lavender-2 px-3 py-2.5 text-xs">
          <span className="font-medium text-ink">Their reason:</span> {request.reason}
        </p>

        {approve ? (
          <>
            <p className="text-xs">
              They will be marked unavailable on {request.days === 1 ? 'that date' : 'those dates'} and
              will not be offered new classes in that time.
            </p>

            {request.affectedClassCount > 0 ? (
              <p className="rounded-[12px] bg-warning-bg px-3 py-2.5 text-xs">
                {request.affectedClassCount} class
                {request.affectedClassCount === 1 ? ' is' : 'es are'} already scheduled then. Approving
                does not cancel {request.affectedClassCount === 1 ? 'it' : 'them'} — you will find{' '}
                {request.affectedClassCount === 1 ? 'it' : 'them'} on Admin Home to reschedule or
                reassign.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-xs">
            Nothing on the schedule changes. They are told, so say why below if it helps.
          </p>
        )}

        <Field
          label={approve ? 'Note' : 'Why not'}
          htmlFor="leave-decision-note"
          hint={approve ? 'Optional. They will see it.' : 'They will see this.'}
          error={error}
        >
          <Textarea
            id="leave-decision-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={approve ? 'Enjoy the break' : 'We have nobody to cover Thursday'}
          />
        </Field>
      </div>
    </Modal>
  );
}

/** One row per teacher: what they taught, and what they were away for. */
function MonthTable({ rows }: { rows: TeacherMonthDto[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <Inbox size={16} className="text-ink-3" />
          No teachers yet.
        </p>
      </Card>
    );
  }

  return (
    <Card padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-2">
              <th className="px-4 py-2.5 font-semibold">Teacher</th>
              <th className="px-3 py-2.5 text-right font-semibold">Classes taken</th>
              <th className="px-3 py-2.5 text-right font-semibold">Days taught</th>
              <th className="px-3 py-2.5 text-right font-semibold">Leave days</th>
              <th className="px-3 py-2.5 text-right font-semibold">Working days</th>
              <th className="px-3 py-2.5 text-right font-semibold">Records owed</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.teacherId} className="border-b border-line last:border-0 hover:bg-lavender-2">
                <td className="px-4 py-3 font-medium text-ink">{row.teacherName}</td>
                <td className="px-3 py-3 text-right text-ink">{row.classesTaken}</td>
                <td className="px-3 py-3 text-right text-ink-2">{row.daysTaught}</td>
                <td className="px-3 py-3 text-right text-ink-2">
                  {row.leaveDays}
                  {row.pendingLeaveDays > 0 ? (
                    <span className="ml-1 text-warning">+{row.pendingLeaveDays}?</span>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-right text-ink-2">{row.workingDays}</td>
                <td
                  className={`px-3 py-3 text-right ${row.recordsOutstanding > 0 ? 'font-medium text-warning' : 'text-ink-2'}`}
                >
                  {row.recordsOutstanding}
                </td>
                <td className="px-3 py-3 text-right">
                  <Link
                    to={`/admin/teachers/${row.teacherId}`}
                    className="inline-flex items-center text-ink-3 hover:text-violet"
                    aria-label={`Open ${row.teacherName}`}
                  >
                    <ChevronRight size={16} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-line px-4 py-2.5 text-xs text-ink-2">
        Classes taken counts every class that has already run this month. A figure like{' '}
        <span className="text-warning">+1?</span> under leave is a request still waiting on you.
      </p>
    </Card>
  );
}
