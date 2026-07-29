import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Sparkles } from 'lucide-react';
import type { StudentSummaryDto, WeeklyUpdateDto } from '@vig/shared';
import { formatShortDate } from '@vig/shared';
import { errorMessage, get, post } from '@/lib/api';
import { PageHeader, Section } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Field, Textarea } from '@/components/ui/Field';
import { Pill } from '@/components/ui/Chip';

/**
 * Weekly updates are generated as drafts and published deliberately.
 *
 * Publishing is the single moment a family hears from us all week (BR-14), so it
 * is a human action — nothing auto-publishes to parents.
 */
export function WeeklyUpdatesPage() {
  const queryClient = useQueryClient();
  const [publishing, setPublishing] = useState<WeeklyUpdateDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: week } = useQuery({
    queryKey: ['weekly-updates', 'current-week'],
    queryFn: () => get<{ weekStart: string }>('/weekly-updates/current-week'),
  });

  const { data: students, isLoading } = useQuery({
    queryKey: ['students'],
    queryFn: () => get<StudentSummaryDto[]>('/students'),
  });

  const generateAll = useMutation({
    mutationFn: () => post<{ generated: number }>('/weekly-updates/generate-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weekly-updates'] }),
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div>
      <PageHeader
        title="Weekly updates"
        description="Assemble each child's week from approved records, then publish it to their parents."
        action={
          <Button
            icon={<Sparkles size={16} />}
            onClick={() => generateAll.mutate()}
            disabled={generateAll.isPending}
          >
            {generateAll.isPending ? 'Generating…' : 'Generate this week'}
          </Button>
        }
      />

      {week ? (
        <p className="mb-4 text-xs text-ink-2">
          Current week begins {formatShortDate(new Date(week.weekStart))}. Updates are assembled from saved
          class records — teachers' drafts are never included.
        </p>
      ) : null}

      {error ? <p className="mb-3 text-xs text-danger">{error}</p> : null}

      {isLoading ? (
        <LoadingState rows={4} />
      ) : students && students.length === 0 ? (
        <EmptyState title="No students yet" description="Add students before generating weekly updates." />
      ) : (
        <Section>
          <div className="flex flex-col gap-3">
            {students?.map((student) => (
              <StudentUpdates key={student.id} student={student} onPublish={setPublishing} />
            ))}
          </div>
        </Section>
      )}

      {publishing ? (
        <PublishModal update={publishing} onClose={() => setPublishing(null)} />
      ) : null}
    </div>
  );
}

function StudentUpdates({
  student,
  onPublish,
}: {
  student: StudentSummaryDto;
  onPublish: (update: WeeklyUpdateDto) => void;
}) {
  const { data } = useQuery({
    queryKey: ['weekly-updates', 'student', student.id],
    queryFn: () =>
      get<Array<{ id: string; weekStart: string; weekEnd: string; status: string; summaryText: string }>>(
        `/weekly-updates/students/${student.id}`,
      ),
  });

  const [openId, setOpenId] = useState<string | null>(null);

  const { data: detail } = useQuery({
    queryKey: ['weekly-updates', openId],
    queryFn: () => get<WeeklyUpdateDto>(`/weekly-updates/${openId}`),
    enabled: Boolean(openId),
  });

  return (
    <Card>
      <CardHeader title={student.fullName} description={student.gradeLabel ?? undefined} />

      {!data || data.length === 0 ? (
        <p className="text-sm text-ink-2">No updates generated yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.slice(0, 4).map((update) => (
            <li
              key={update.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  {formatShortDate(new Date(update.weekStart))} – {formatShortDate(new Date(update.weekEnd))}
                </p>
                <p className="mt-0.5 line-clamp-1 text-xs text-ink-2">{update.summaryText}</p>
              </div>

              <Pill token={update.status === 'PUBLISHED' ? 'green' : 'orange'}>
                {update.status.toLowerCase()}
              </Pill>

              {update.status === 'DRAFT' ? (
                <Button
                  size="sm"
                  icon={<Send size={13} />}
                  onClick={() => {
                    setOpenId(update.id);
                    if (detail?.id === update.id) onPublish(detail);
                  }}
                >
                  Review & publish
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {detail && detail.status === 'DRAFT' && openId === detail.id ? (
        <div className="mt-3">
          <Button size="sm" icon={<Send size={13} />} onClick={() => onPublish(detail)}>
            Publish {formatShortDate(new Date(detail.weekStart))} update
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function PublishModal({ update, onClose }: { update: WeeklyUpdateDto; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [teacherNote, setTeacherNote] = useState(update.teacherNote ?? '');
  const [error, setError] = useState<string | null>(null);

  const publish = useMutation({
    mutationFn: () =>
      post(`/weekly-updates/${update.id}/publish`, { teacherNote: teacherNote.trim() || undefined }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['weekly-updates'] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={`Publish ${update.studentName}'s update`}
      description="Publishing sends the one weekly notification to this child's parents."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => publish.mutate()} disabled={publish.isPending}>
            {publish.isPending ? 'Publishing…' : 'Publish & Notify'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Card tone="lavender">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-violet">
            Week at a glance
          </p>
          <p className="text-sm text-ink">{update.summaryText}</p>
        </Card>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Learning" value={update.learning.length} />
          <Stat label="Development" value={update.development.length} />
          <Stat label="Moments" value={update.moments.length} />
        </div>

        <Field label="Teacher's note" htmlFor="teacher-note" hint="Optional. Adds human context." error={error}>
          <Textarea
            id="teacher-note"
            value={teacherNote}
            onChange={(e) => setTeacherNote(e.target.value)}
            placeholder="Aarav is making steady progress and asking great questions. Keep encouraging his curiosity."
          />
        </Field>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[12px] border border-line px-4 py-3 text-center">
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className="text-[11px] text-ink-2">{label}</p>
    </div>
  );
}
