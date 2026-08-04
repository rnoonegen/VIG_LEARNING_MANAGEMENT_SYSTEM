import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, UserCheck, UserMinus, X } from 'lucide-react';
import type { AssignableStudentDto, ParentDto } from '@vig/shared';
import { formatShortDate, PARENT_RELATIONSHIPS } from '@vig/shared';
import { del, errorMessage, get, patch, post, put } from '@/lib/api';
import { Avatar, DetailRow, PageHeader, Section } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select } from '@/components/ui/Field';
import { Pill } from '@/components/ui/Chip';
import { PhotoPicker } from '@/components/PhotoPicker';
import { ContactFields, contactFromDto } from '@/components/ContactFields';
import { TempPasswordModal } from '../teachers/TeachersPage';

/**
 * One family's account: who they are, which children it shows, and whether it
 * can be signed into.
 */
export function ParentProfilePage() {
  const { parentId = '' } = useParams();
  const [editing, setEditing] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; tempPassword: string } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['parents', parentId],
    queryFn: () => get<ParentDto>(`/parents/${parentId}`),
  });

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  const active = data.status === 'ACTIVE';

  return (
    <div>
      <PageHeader backTo="/admin/parents" backLabel="Back to Parents" title={data.fullName} />

      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <AvatarEditor parent={data} />

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">{data.fullName}</p>
            <p className="font-mono text-xs text-ink-2">{data.username}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pill token={active ? 'green' : 'muted'}>{active ? 'Active' : 'Inactive'}</Pill>
              {data.mustChangePassword ? <Pill token="orange">Password pending</Pill> : null}
            </div>
          </div>

          <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={() => setEditing(true)}>
            Edit details
          </Button>
        </div>

        {!active ? (
          <p className="mt-4 rounded-[12px] bg-lavender-2 px-4 py-3 text-xs text-ink-2">
            This parent cannot sign in. Everything the school recorded about their children is kept.
          </p>
        ) : null}
      </Card>

      <Section title="Details">
        <Card>
          <dl>
            <DetailRow label="Username" value={<span className="font-mono">{data.username}</span>} />
            <DetailRow label="Mobile number" value={data.mobileNumber ?? '—'} />
            <DetailRow label="Email" value={data.email ?? '—'} />
            <DetailRow label="Blood group" value={data.bloodGroup ?? '—'} />
            <DetailRow label="Emergency contact" value={data.emergencyContact ?? '—'} />
            <DetailRow label="Address" value={data.address ?? '—'} />
            <DetailRow
              label="Relationship"
              value={data.children.find((c) => c.relationship)?.relationship ?? '—'}
            />
            <DetailRow label="Account created" value={formatShortDate(new Date(data.createdAt))} />
          </dl>
        </Card>
      </Section>

      <Children parent={data} />
      <Account parent={data} onCredentials={setCredentials} />

      {editing ? <EditParentModal parent={data} onClose={() => setEditing(false)} /> : null}

      {credentials ? (
        <TempPasswordModal
          created={credentials}
          title="Access restored"
          onClose={() => setCredentials(null)}
        />
      ) : null}
    </div>
  );
}

/** The photo goes straight to the private bucket; only the path reaches us. */
function AvatarEditor({ parent }: { parent: ParentDto }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['parents'] });
  };

  const save = useMutation({
    mutationFn: (next: { path: string } | null) =>
      next ? put(`/parents/${parent.id}/avatar`, { storagePath: next.path }) : del(`/parents/${parent.id}/avatar`),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div>
      <PhotoPicker
        name={parent.fullName}
        uploadUrlEndpoint="/parents/avatar-upload-url"
        value={parent.avatarUrl ? { path: '', previewUrl: parent.avatarUrl } : null}
        onChange={(next) => save.mutate(next)}
        size={64}
      />
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function EditParentModal({ parent, onClose }: { parent: ParentDto; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState(parent.firstName ?? '');
  const [lastName, setLastName] = useState(parent.lastName ?? '');
  const [contact, setContact] = useState(contactFromDto(parent));
  const [relationship, setRelationship] = useState(
    parent.children.find((c) => c.relationship)?.relationship ?? PARENT_RELATIONSHIPS[0],
  );
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      patch(`/parents/${parent.id}`, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...contact,
        relationship,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['parents'] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit details"
      description="Their name as it appears across VIG, and how the school reaches them."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!firstName.trim() || !lastName.trim() || save.isPending}
          >
            {save.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="edit-parent-first" required>
            <Input
              id="edit-parent-first"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Last name" htmlFor="edit-parent-last" required>
            <Input id="edit-parent-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>

        <ContactFields idPrefix="edit-parent" value={contact} onChange={setContact} mobileRequired />

        {error ? <p className="text-xs text-danger">{error}</p> : null}

        <Field label="Relationship" htmlFor="edit-parent-relationship">
          <Select
            id="edit-parent-relationship"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
          >
            {PARENT_RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>

        <p className="rounded-[12px] bg-lavender-2 px-3 py-2.5 text-xs text-ink-2">
          The username stays as it is. Renaming an account changes how they sign in, so it is done from
          Accounts.
        </p>
      </div>
    </Modal>
  );
}

/**
 * Which children this account shows.
 *
 * Removing one ends their sight of that child from the next request onwards.
 * Nothing recorded about the child is touched (BR-09).
 */
function Children({ parent }: { parent: ParentDto }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: assignable } = useQuery({
    queryKey: ['parents', 'assignable-students', parent.id],
    queryFn: () => get<AssignableStudentDto[]>('/parents/assignable-students', { parentId: parent.id }),
  });

  const relationship = parent.children.find((c) => c.relationship)?.relationship;

  const save = useMutation({
    mutationFn: (studentIds: string[]) =>
      put(`/parents/${parent.id}/students`, { studentIds, relationship }),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['parents'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const linkedIds = parent.children.map((c) => c.id);
  const available = (assignable ?? []).filter((s) => !linkedIds.includes(s.id));

  return (
    <Section title="Children">
      <Card>
        <CardHeader
          title="Linked children"
          description="This account shows approved updates for these children, and nobody else's."
        />

        {parent.children.length === 0 ? (
          <p className="text-sm text-warning">
            No children linked. This account can sign in but will see nothing.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {parent.children.map((child) => (
              <li
                key={child.id}
                className="flex items-center gap-3 rounded-[12px] border border-line px-3 py-2"
              >
                <Avatar name={child.fullName} url={child.avatarUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{child.fullName}</p>
                  <p className="text-xs text-ink-3">{child.relationship ?? '—'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => save.mutate(linkedIds.filter((id) => id !== child.id))}
                  disabled={save.isPending}
                  aria-label={`Remove ${child.fullName}`}
                  className="touch-target flex items-center justify-center rounded-full text-ink-3 hover:bg-danger-bg hover:text-danger"
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <Field label="Add a child" htmlFor="parent-add-child" hint="Only children without a parent account are listed.">
            <Select
              id="parent-add-child"
              value=""
              disabled={available.length === 0 || save.isPending}
              onChange={(e) => {
                if (e.target.value) save.mutate([...linkedIds, e.target.value]);
              }}
            >
              <option value="">
                {available.length === 0 ? 'No unassigned students left' : 'Select a student…'}
              </option>
              {available.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                  {s.gradeLabel ? ` · ${s.gradeLabel}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
        </div>
      </Card>
    </Section>
  );
}

/**
 * A parent account is never deleted (BR-09). Deactivating removes the sign-in;
 * reactivating issues a fresh temporary password, because deactivation
 * destroyed the old one.
 */
function Account({
  parent,
  onCredentials,
}: {
  parent: ParentDto;
  onCredentials: (credentials: { username: string; tempPassword: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState(false);
  const active = parent.status === 'ACTIVE';

  const change = useMutation({
    mutationFn: () =>
      patch<{ credentials: { username: string; tempPassword: string } | null }>(
        `/parents/${parent.id}/status`,
        { status: active ? 'INACTIVE' : 'ACTIVE' },
      ),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['parents'] });
      if (result.credentials) onCredentials(result.credentials);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const resetPassword = useMutation({
    mutationFn: () =>
      post<{ username: string; tempPassword: string }>(`/admin/users/${parent.userId}/reset-password`),
    onSuccess: (result) => {
      setReset(true);
      onCredentials(result);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Section title="Account">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          {active ? (
            <Button
              variant="danger"
              size="sm"
              icon={<UserMinus size={13} />}
              onClick={() => change.mutate()}
              disabled={change.isPending}
            >
              Deactivate Parent
            </Button>
          ) : (
            <Button
              size="sm"
              icon={<UserCheck size={13} />}
              onClick={() => change.mutate()}
              disabled={change.isPending}
            >
              Reactivate Parent
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => resetPassword.mutate()}
            disabled={!active || resetPassword.isPending || reset}
          >
            {reset ? 'Password reset' : 'Reset password'}
          </Button>
        </div>

        <p className="mt-3 max-w-xl text-xs text-ink-2">
          {active
            ? 'Deactivating removes their sign-in straight away. Everything the school recorded about their children stays exactly where it is.'
            : 'Reactivating issues a new temporary password, shown once. Pass it to them directly.'}
        </p>

        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      </Card>
    </Section>
  );
}
