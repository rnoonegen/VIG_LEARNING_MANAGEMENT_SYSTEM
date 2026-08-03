import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { AssignableStudentDto, ParentCreatedDto } from '@vig/shared';
import { accountUsername, PARENT_RELATIONSHIPS } from '@vig/shared';
import { errorMessage, get, post } from '@/lib/api';
import { Avatar, PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { LoadingState } from '@/components/ui/States';
import { PhotoPicker } from '@/components/PhotoPicker';
import { TempPasswordModal } from '../teachers/TeachersPage';
import { UsernamePreview } from '../students/AddStudentPage';

/**
 * Creating a parent account (F7 / BR-13).
 *
 * The account is made against the children it will show. The picker only offers
 * children who have no parent account yet — a child cannot be given two — and a
 * child added here drops out of the list, so the same name cannot be chosen
 * twice.
 */
export function AddParentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [relationship, setRelationship] = useState<string>(PARENT_RELATIONSHIPS[0]);
  const [photo, setPhoto] = useState<{ path: string; previewUrl: string } | null>(null);
  const [chosen, setChosen] = useState<AssignableStudentDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; tempPassword: string } | null>(null);

  const { data: students, isLoading } = useQuery({
    queryKey: ['parents', 'assignable-students'],
    queryFn: () => get<AssignableStudentDto[]>('/parents/assignable-students'),
  });

  // A preview of the sign-in name. The API issues the real one — only it can
  // see that the name is already somebody's.
  const username = accountUsername('P', firstName, lastName);

  const create = useMutation({
    mutationFn: () =>
      post<ParentCreatedDto>('/parents', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        mobileNumber: mobileNumber.trim(),
        relationship,
        avatarPath: photo?.path,
        studentIds: chosen.map((s) => s.id),
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['parents'] });
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      setCreated({ username: result.username, tempPassword: result.tempPassword });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  // Already added to this form, so no longer on offer.
  const available = (students ?? []).filter((s) => !chosen.some((c) => c.id === s.id));

  const complete =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    mobileNumber.trim().length >= 7 &&
    chosen.length > 0;

  if (isLoading) return <LoadingState rows={5} />;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader backTo="/admin/parents" backLabel="Back to Parents" title="Add Parent" />

      <Card>
        <CardHeader
          title="Parent details"
          description="Their name, how to reach them, and the children this account will show."
        />

        <div className="flex flex-col gap-4">
          <PhotoPicker
            name={`${firstName} ${lastName}`.trim()}
            uploadUrlEndpoint="/parents/avatar-upload-url"
            value={photo}
            onChange={setPhoto}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="parent-first-name" required>
              <Input
                id="parent-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Nagaraju"
                autoFocus
              />
            </Field>
            <Field label="Last name" htmlFor="parent-last-name" required>
              <Input
                id="parent-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Vengaldasu"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Mobile number"
              htmlFor="parent-mobile"
              required
              hint="How the school reaches this family."
            >
              <Input
                id="parent-mobile"
                type="tel"
                inputMode="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="+91 98765 43210"
              />
            </Field>

            <Field label="Relationship" htmlFor="parent-relationship" required>
              <Select
                id="parent-relationship"
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
          </div>

          <StudentPicker
            available={available}
            chosen={chosen}
            onAdd={(student) => setChosen([...chosen, student])}
            onRemove={(id) => setChosen(chosen.filter((s) => s.id !== id))}
            exhausted={(students ?? []).length === 0}
          />

          <UsernamePreview
            username={username}
            caption="Their sign-in name, issued by VIG. A temporary password is shown once, after the account is created."
          />
        </div>

        {error ? <p className="mt-4 text-xs text-danger">{error}</p> : null}

        <div className="mt-6 flex justify-between gap-2 border-t border-line pt-5">
          <Button variant="secondary" onClick={() => navigate('/admin/parents')}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!complete || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create Parent'}
          </Button>
        </div>
      </Card>

      {created ? (
        <TempPasswordModal
          created={created}
          title="Parent account created"
          onClose={() => navigate('/admin/parents', { replace: true })}
        />
      ) : null}
    </div>
  );
}

/**
 * Choose from every child who has no parent account yet.
 *
 * A chosen child leaves the dropdown and appears in the list below it, so the
 * two views together always account for the full roster.
 */
function StudentPicker({
  available,
  chosen,
  onAdd,
  onRemove,
  exhausted,
}: {
  available: AssignableStudentDto[];
  chosen: AssignableStudentDto[];
  onAdd: (student: AssignableStudentDto) => void;
  onRemove: (id: string) => void;
  exhausted: boolean;
}) {
  return (
    <Field
      label="Children"
      htmlFor="parent-student"
      required
      hint="Only children without a parent account are listed."
    >
      <Select
        id="parent-student"
        value=""
        disabled={available.length === 0}
        onChange={(e) => {
          const student = available.find((s) => s.id === e.target.value);
          if (student) onAdd(student);
        }}
      >
        <option value="">
          {exhausted
            ? 'Every student already has a parent account'
            : available.length === 0
              ? 'All available students added'
              : 'Select a student…'}
        </option>
        {available.map((s) => (
          <option key={s.id} value={s.id}>
            {s.fullName}
            {s.gradeLabel ? ` · ${s.gradeLabel}` : ''}
          </option>
        ))}
      </Select>

      {chosen.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {chosen.map((student) => (
            <li
              key={student.id}
              className="flex items-center gap-3 rounded-[12px] border border-line px-3 py-2"
            >
              <Avatar name={student.fullName} url={student.avatarUrl} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{student.fullName}</p>
                <p className="text-xs text-ink-3">
                  {[student.gradeLabel, student.username].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(student.id)}
                aria-label={`Remove ${student.fullName}`}
                className="touch-target flex items-center justify-center rounded-full text-ink-3 hover:bg-danger-bg hover:text-danger"
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Field>
  );
}
