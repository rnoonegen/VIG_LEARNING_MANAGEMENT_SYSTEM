import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { ROLE_LABELS } from '@vig/shared';
import type { MyProfileDto } from '@vig/shared';
import { del, errorMessage, get, patch, put } from '@/lib/api';
import { useAuth } from '@/app/AuthProvider';
import { Section } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { PhotoPicker } from '@/components/PhotoPicker';
import { ContactFields, contactFromDto, EMPTY_CONTACT, type ContactForm } from '@/components/ContactFields';

/**
 * Your own profile.
 *
 * The photo and the contact block are yours to change. Your name and your
 * sign-in name are not: the username is built from the name and issued by the
 * school (T26PriSha), so the two move together and only an administrator moves
 * them. They are shown, greyed, with the reason — a field that silently refuses
 * an edit is worse than one that explains itself.
 *
 * An administrator has no teacher or parent record, so there is no contact
 * block to fill in and the page shows their account details alone.
 */

export function ProfileSettingsPage() {
  const { refreshUser } = useAuth();
  const [form, setForm] = useState<ContactForm>(EMPTY_CONTACT);
  const [language, setLanguage] = useState('en');
  const [photo, setPhoto] = useState<{ path: string; previewUrl: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['profile'],
    queryFn: () => get<MyProfileDto>('/profile'),
  });

  // Seeded once the profile arrives, and again if it is refetched — the fields
  // are only ever edited here, so overwriting them cannot lose a keystroke.
  useEffect(() => {
    if (!data) return;
    setForm(contactFromDto(data.contact));
    setLanguage(data.language);
    setPhoto(data.avatarUrl ? { path: '', previewUrl: data.avatarUrl } : null);
  }, [data]);

  const save = useMutation({
    mutationFn: () => patch<MyProfileDto>('/profile', { ...form, language }),
    onSuccess: async () => {
      // The rail shows the name and photo from the session, so it is re-read.
      await refreshUser();
      await refetch();
      setSaved(true);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  /**
   * The photo saves on its own, the moment it is chosen. Waiting for the Save
   * button would leave an uploaded object that the record does not point at if
   * the page were closed in between.
   */
  const savePhoto = useMutation({
    mutationFn: async (next: { path: string; previewUrl: string } | null) => {
      if (next) return put<MyProfileDto>('/profile/avatar', { storagePath: next.path });
      return del<MyProfileDto>('/profile/avatar');
    },
    onSuccess: async () => {
      await refreshUser();
      await refetch();
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <div>
      <Section title="Photo">
        <Card>
          <PhotoPicker
            name={data.fullName}
            uploadUrlEndpoint="/profile/avatar-upload-url"
            value={photo}
            onChange={(next) => {
              setPhoto(next);
              savePhoto.mutate(next);
            }}
          />
        </Card>
      </Section>

      <Section title="Your name">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="First name"
              hint="Set by your school. Ask an administrator to change it."
            >
              <Input value={data.firstName ?? ''} readOnly disabled className="bg-lavender-2" />
            </Field>
            <Field label="Last name">
              <Input value={data.lastName ?? ''} readOnly disabled className="bg-lavender-2" />
            </Field>
            <Field label="Username" hint="Your sign-in name. It is built from your name.">
              <Input value={data.username} readOnly disabled className="bg-lavender-2" />
            </Field>
            <Field label="Role">
              <Input value={ROLE_LABELS[data.role]} readOnly disabled className="bg-lavender-2" />
            </Field>
          </div>
        </Card>
      </Section>

      {data.contact ? (
        <Section title="Contact details">
          <Card>
            <ContactFields
              idPrefix="profile"
              value={form}
              onChange={(next) => {
                setForm(next);
                setSaved(false);
              }}
            />
          </Card>
        </Section>
      ) : null}

      <Section title="Preferences">
        <Card>
          <Field label="Language" htmlFor="profile-language">
            <Select
              id="profile-language"
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                setSaved(false);
              }}
            >
              <option value="en">English</option>
              <option value="te">Telugu</option>
              <option value="hi">Hindi</option>
            </Select>
          </Field>
        </Card>
      </Section>

      {error ? <p className="mb-3 text-xs text-danger">{error}</p> : null}

      <Button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        icon={saved ? <Check size={15} /> : undefined}
      >
        {save.isPending ? 'Saving…' : saved ? 'Saved' : 'Save Changes'}
      </Button>
    </div>
  );
}
