import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeacherCreatedDto } from '@vig/shared';
import { accountUsername } from '@vig/shared';
import { errorMessage, post } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { PhotoPicker } from '@/components/PhotoPicker';
import { TempPasswordModal } from './TeachersPage';
import { UsernamePreview } from '../students/AddStudentPage';

/**
 * Adding a teacher (F5 / Flow 10).
 *
 * The same details the school collects for a parent or a child, and the same
 * school-issued sign-in name (T26PriSha) — the admin does not pick it. What the
 * teacher can teach and when they are free are set from their profile
 * afterwards, so adding them stays one short form.
 */
export function AddTeacherPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [photo, setPhoto] = useState<{ path: string; previewUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; tempPassword: string } | null>(null);

  // A preview of the sign-in name. The API issues the real one — only it can
  // see that the name is already somebody's.
  const username = accountUsername('T', firstName, lastName);

  const create = useMutation({
    mutationFn: () =>
      post<TeacherCreatedDto>('/teachers', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dateOfBirth || undefined,
        address: address.trim() || undefined,
        avatarPath: photo?.path,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['teachers'] });
      setCreated({ username: result.username, tempPassword: result.tempPassword });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const complete = firstName.trim().length > 0 && lastName.trim().length > 0;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader backTo="/admin/teachers" backLabel="Back to Teachers" title="Add Teacher" />

      <Card>
        <CardHeader
          title="Teacher details"
          description="Who they are and how to reach them. This also creates their sign-in account."
        />

        <div className="flex flex-col gap-4">
          <PhotoPicker
            name={`${firstName} ${lastName}`.trim()}
            uploadUrlEndpoint="/teachers/avatar-upload-url"
            value={photo}
            onChange={setPhoto}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="teacher-first-name" required>
              <Input
                id="teacher-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Priya"
                autoFocus
              />
            </Field>
            <Field label="Last name" htmlFor="teacher-last-name" required>
              <Input
                id="teacher-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Sharma"
              />
            </Field>
          </div>

          <Field label="Date of birth" htmlFor="teacher-dob" hint="Optional.">
            <Input
              id="teacher-dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          </Field>

          <Field label="Address" htmlFor="teacher-address" hint="Optional.">
            <Textarea
              id="teacher-address"
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="14 MG Road, Bengaluru 560001"
            />
          </Field>

          <UsernamePreview
            username={username}
            caption="Their sign-in name, issued by VIG. A temporary password is shown once, after the account is created."
          />

          <p className="rounded-[12px] bg-lavender-2 px-3 py-2.5 text-xs text-ink-2">
            Subjects and weekly availability are set afterwards, from this teacher's profile. Until a
            subject is assigned, they will not be offered when scheduling.
          </p>
        </div>

        {error ? <p className="mt-4 text-xs text-danger">{error}</p> : null}

        <div className="mt-6 flex justify-between gap-2 border-t border-line pt-5">
          <Button variant="secondary" onClick={() => navigate('/admin/teachers')}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!complete || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create Teacher'}
          </Button>
        </div>
      </Card>

      {created ? (
        <TempPasswordModal
          created={created}
          title="Teacher account created"
          onClose={() => navigate('/admin/teachers', { replace: true })}
        />
      ) : null}
    </div>
  );
}
