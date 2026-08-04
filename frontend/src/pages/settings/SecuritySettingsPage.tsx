import { ROLE_LABELS } from '@vig/shared';
import { useAuth } from '@/app/AuthProvider';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { DetailRow, Section } from '@/components/ui/Layout';
import { Pill } from '@/components/ui/Chip';

/**
 * Password and session.
 *
 * There is no email or SMS channel to reset through (D2): a forgotten password
 * goes to an administrator, who resets it and hands over the temporary one in
 * person. The wording here matches what actually happens, so nobody waits for a
 * mail that was never going to arrive.
 */
export function SecuritySettingsPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div>
      <Section title="Password">
        <Card>
          <CardHeader
            title="Change your password"
            description="Choose a new password for your account."
            action={
              <ButtonLink to="/change-password" variant="secondary" size="sm">
                Change Password
              </ButtonLink>
            }
          />
          <p className="text-xs text-ink-2">
            Forgotten it? Your school administrator can reset it and give you a temporary one — there
            is no reset email.
          </p>
        </Card>
      </Section>

      <Section title="Account">
        <Card>
          <dl>
            <DetailRow label="Username" value={user.username} />
            <DetailRow label="Role" value={<Pill token="violet">{ROLE_LABELS[user.role]}</Pill>} />
            <DetailRow label="Time zone" value="GMT+05:30 Asia/Kolkata" />
          </dl>
        </Card>
      </Section>
    </div>
  );
}
