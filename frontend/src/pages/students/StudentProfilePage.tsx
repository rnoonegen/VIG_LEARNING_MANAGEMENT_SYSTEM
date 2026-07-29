import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';
import type { StudentDto } from '@vig/shared';
import { formatShortDate, WEEKDAY_SHORT } from '@vig/shared';
import { errorMessage, get, put } from '@/lib/api';
import { Avatar, DetailRow, PageHeader, Section, Tabs } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Pill, SubjectBadge } from '@/components/ui/Chip';
import { LearningMap } from '@/components/LearningMap';
import { DevelopmentPanel } from '@/components/DevelopmentPanel';
import { MomentsGrid } from '@/components/MomentsGrid';
import { AvailabilityGrid, fromDayRows, toDayRows, type DayAvailability } from '@/components/AvailabilityGrid';

type Tab = 'overview' | 'learning' | 'development' | 'moments' | 'history';

/**
 * The long-term record for one child.
 *
 * Viewing and editing are kept apart: administrative controls live behind
 * Manage Student so the profile reads as a record, not a form (Flow 09).
 */
export function StudentProfilePage({ basePath, canManage }: { basePath: string; canManage?: boolean }) {
  const { studentId = '' } = useParams();
  const [tab, setTab] = useState<Tab>('overview');
  const [managing, setManaging] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['students', studentId],
    queryFn: () => get<StudentDto>(`/students/${studentId}`),
  });

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        backTo={basePath}
        backLabel="Back to Students"
        title={data.fullName}
        action={
          canManage ? (
            <Button variant="secondary" icon={<Settings2 size={15} />} onClick={() => setManaging(true)}>
              Manage Student
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Avatar name={data.fullName} url={data.avatarUrl} size={56} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{data.fullName}</p>
          <p className="text-xs text-ink-2">
            {[data.gradeLabel, data.dateOfBirth ? `Born ${formatShortDate(new Date(data.dateOfBirth))}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Pill token={data.status === 'ACTIVE' ? 'green' : 'muted'}>{data.status.toLowerCase()}</Pill>
        {!data.setupComplete ? <Pill token="orange">Setup incomplete</Pill> : null}
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'learning', label: 'Learning' },
          { key: 'development', label: 'Development' },
          { key: 'moments', label: 'Moments' },
          { key: 'history', label: 'History' },
        ]}
      />

      {tab === 'overview' ? <Overview student={data} /> : null}
      {tab === 'learning' ? (
        <LearningMap studentId={studentId} editable canChangeLevel={canManage} />
      ) : null}
      {tab === 'development' ? <DevelopmentPanel studentId={studentId} editable /> : null}
      {tab === 'moments' ? <MomentsGrid endpoint={`/students/${studentId}/moments`} /> : null}
      {tab === 'history' ? <History studentId={studentId} /> : null}

      {managing ? (
        <ManageStudentModal student={data} onClose={() => setManaging(false)} />
      ) : null}
    </div>
  );
}

function Overview({ student }: { student: StudentDto }) {
  return (
    <>
      <Section title="Subject levels">
        <Card>
          {student.subjectLevels.length === 0 ? (
            <p className="text-sm text-warning">
              No subjects assigned yet. This student cannot be scheduled until they have at least one.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {student.subjectLevels.map((sl) => (
                <div key={sl.subjectId} className="flex items-center justify-between gap-3">
                  <SubjectBadge name={sl.subjectName} colorToken={sl.colorToken} />
                  <span className="text-sm font-medium text-ink">{sl.levelName}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Section>

      <Section title="Weekly availability">
        <Card>
          {student.availability.length === 0 ? (
            <p className="text-sm text-warning">No availability set. Scheduling has nothing to work with.</p>
          ) : (
            <dl>
              {student.availability.map((slot) => (
                <DetailRow
                  key={slot.id}
                  label={WEEKDAY_SHORT[slot.weekday]!}
                  value={`${slot.startTime} – ${slot.endTime}`}
                />
              ))}
            </dl>
          )}
        </Card>
      </Section>

      <Section title="Parent access">
        <Card>
          {student.parents.length === 0 ? (
            <p className="text-sm text-ink-2">No parent account linked yet.</p>
          ) : (
            <dl>
              {student.parents.map((p) => (
                <DetailRow key={p.parentId} label={p.relationship ?? 'Parent'} value={p.fullName} />
              ))}
            </dl>
          )}
        </Card>
      </Section>
    </>
  );
}

interface HistoryPayload {
  learning: Array<{ id: string; at: string; subjectName: string; skillName: string; newStatus: string; authorName: string }>;
  development: Array<{ id: string; at: string; areaName: string; observation: string; observerName: string }>;
  levelChanges: Array<{ id: string; at: string; subjectName: string; fromLevel: string; toLevel: string | null }>;
  classRecords: Array<{ id: string; at: string; subjectName: string; levelName: string; note: string }>;
}

/** History preserves what changed, when and by whom — never a destructive overwrite. */
function History({ studentId }: { studentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['students', studentId, 'history'],
    queryFn: () => get<HistoryPayload>(`/students/${studentId}/history`),
  });

  if (isLoading) return <LoadingState rows={4} />;
  if (!data) return null;

  return (
    <>
      {data.levelChanges.length > 0 ? (
        <Section title="Level changes">
          <Card>
            <ul className="flex flex-col gap-2">
              {data.levelChanges.map((lc) => (
                <li key={lc.id} className="flex justify-between gap-3 text-sm">
                  <span className="text-ink">
                    {lc.subjectName}: {lc.fromLevel} → {lc.toLevel ?? 'stayed'}
                  </span>
                  <span className="shrink-0 text-xs text-ink-3">{formatShortDate(new Date(lc.at))}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}

      <Section title="Recent class notes">
        <Card>
          {data.classRecords.length === 0 ? (
            <p className="text-sm text-ink-2">No saved class records yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.classRecords.map((r) => (
                <li key={r.id} className="border-l-2 border-lavender pl-3">
                  <p className="text-sm text-ink">{r.note}</p>
                  <p className="mt-0.5 text-[11px] text-ink-3">
                    {r.subjectName} · {r.levelName} · {formatShortDate(new Date(r.at))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>

      <Section title="Learning updates">
        <Card>
          {data.learning.length === 0 ? (
            <p className="text-sm text-ink-2">No learning updates yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.learning.slice(0, 20).map((l) => (
                <li key={l.id} className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink">
                    {l.subjectName} · {l.skillName}
                  </span>
                  <span className="shrink-0 text-xs text-ink-3">
                    {l.newStatus.replace('_', ' ').toLowerCase()} · {formatShortDate(new Date(l.at))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </>
  );
}

/** Configuration lives here, deliberately separate from the read-only profile. */
function ManageStudentModal({ student, onClose }: { student: StudentDto; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<DayAvailability[]>(toDayRows(student.availability));
  const [error, setError] = useState<string | null>(null);

  const saveAvailability = useMutation({
    mutationFn: () => put(`/students/${student.id}/availability`, { slots: fromDayRows(rows) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Manage student"
      description="Update this student's administrative information."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => saveAvailability.mutate()} disabled={saveAvailability.isPending}>
            {saveAvailability.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <CardHeader
        title="Weekly availability"
        description="When this child can attend classes. Scheduling treats anything outside these windows as invalid."
      />
      <AvailabilityGrid rows={rows} onChange={setRows} />
      {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
    </Modal>
  );
}
