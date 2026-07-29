import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, GraduationCap, KeyRound, Plus } from 'lucide-react';
import type { TeacherSummaryDto } from '@vig/shared';
import { errorMessage, get, post } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Avatar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Field';
import { Pill, SubjectBadge } from '@/components/ui/Chip';

interface CreatedTeacher {
  teacherId: string;
  username: string;
  tempPassword: string;
}

/** Fewer than ten teachers — the list stays deliberately simple (Flow 10). */
export function TeachersPage() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<CreatedTeacher | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['teachers'],
    queryFn: () => get<TeacherSummaryDto[]>('/teachers'),
  });

  return (
    <div>
      <PageHeader
        title="Teachers"
        description="Manage teaching capabilities and availability."
        action={
          <Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>
            Add Teacher
          </Button>
        }
      />

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
            <Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>
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
                <Avatar name={teacher.fullName} size={40} />

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
                    {teacher.availableToday ? `Available today · ${teacher.availableToday}` : 'Not available today'}
                  </p>
                </div>

                {teacher.availableToday ? <Pill token="green">Available</Pill> : <Pill token="muted">Off</Pill>}
                <ChevronRight size={16} className="shrink-0 text-ink-3" />
              </Link>
            </Card>
          ))}
        </div>
      )}

      {adding ? (
        <AddTeacherModal
          onClose={() => setAdding(false)}
          onCreated={async (result) => {
            await queryClient.invalidateQueries({ queryKey: ['teachers'] });
            setAdding(false);
            setCreated(result);
          }}
        />
      ) : null}

      {created ? <TempPasswordModal created={created} onClose={() => setCreated(null)} /> : null}
    </div>
  );
}

function AddTeacherModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (result: CreatedTeacher) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => post<CreatedTeacher>('/teachers', { fullName: fullName.trim(), username: username.trim() }),
    onSuccess: onCreated,
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Add teacher"
      description="This creates their sign-in account and a temporary password."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!fullName.trim() || !username.trim() || create.isPending}>
            {create.isPending ? 'Creating…' : 'Add Teacher'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Full name" htmlFor="teacher-name" required>
          <Input
            id="teacher-name"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              // Suggest a username, but let the admin override it.
              if (!username) setUsername(e.target.value.trim().toLowerCase().split(' ')[0] ?? '');
            }}
            placeholder="Priya Sharma"
            autoFocus
          />
        </Field>

        <Field
          label="Username"
          htmlFor="teacher-username"
          required
          error={error}
          hint="Lowercase letters, numbers, dot, underscore and hyphen only."
        >
          <Input
            id="teacher-username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="priya"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
      </div>
    </Modal>
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
