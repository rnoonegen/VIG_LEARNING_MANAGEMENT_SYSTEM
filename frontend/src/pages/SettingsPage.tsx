import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Check, LogOut } from 'lucide-react';
import { ROLE_LABELS } from '@vig/shared';
import type { SessionUser } from '@vig/shared';
import { errorMessage, patch } from '@/lib/api';
import { useAuth } from '@/app/AuthProvider';
import { DetailRow, PageHeader, Section } from '@/components/ui/Layout';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { Pill } from '@/components/ui/Chip';
import { PushSettings } from '@/components/PushSettings';

/** Basic settings only. Role is never user-editable (Flow 08). */
export function SettingsPage() {
  const { user, setUser, signOut } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [language, setLanguage] = useState(user?.language ?? 'en');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => patch<SessionUser>('/auth/settings', { fullName, language }),
    onSuccess: (updated) => {
      setUser(updated);
      setSaved(true);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" description="Manage your basic account information." />

      <Section title="Profile">
        <Card>
          <div className="flex flex-col gap-4">
            <Field label="Full name" htmlFor="settings-name">
              <Input
                id="settings-name"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setSaved(false);
                }}
              />
            </Field>

            <Field label="Username" hint="Set by your school and cannot be changed here.">
              <Input value={user.username} readOnly disabled className="bg-lavender-2" />
            </Field>

            <Field label="Language" htmlFor="settings-language">
              <Select
                id="settings-language"
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

            {error ? <p className="text-xs text-danger">{error}</p> : null}

            <div>
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                icon={saved ? <Check size={15} /> : undefined}
              >
                {save.isPending ? 'Saving…' : saved ? 'Saved' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </Card>
      </Section>

      <Section title="Account">
        <Card>
          <dl>
            <DetailRow label="Role" value={<Pill token="violet">{ROLE_LABELS[user.role]}</Pill>} />
            <DetailRow label="Time zone" value="GMT+05:30 Asia/Kolkata" />
          </dl>
        </Card>
      </Section>

      <Section title="Notifications">
        <PushSettings />
      </Section>

      <Section title="Security">
        <Card>
          <CardHeader
            title="Password"
            description="Choose a new password for your account."
            action={
              <ButtonLink to="/change-password" variant="secondary" size="sm">
                Change Password
              </ButtonLink>
            }
          />
          <p className="text-xs text-ink-2">
            If you have forgotten your password, your school administrator can reset it for you.
          </p>
        </Card>
      </Section>

      <Section title="Session">
        <Card>
          <Button
            variant="secondary"
            icon={<LogOut size={15} />}
            onClick={async () => {
              await signOut();
              navigate('/login', { replace: true });
            }}
          >
            Log out
          </Button>
        </Card>
      </Section>
    </div>
  );
}
