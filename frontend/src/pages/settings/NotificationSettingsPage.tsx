import { ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Section } from '@/components/ui/Layout';
import { PushSettings } from '@/components/PushSettings';

/**
 * What reaches you, and where.
 *
 * How much reaches you is not a preference — notification volume is a product
 * rule (BR-14): one weekly update for a parent, scheduling and class-record
 * matters for a teacher, operational issues for an admin. This page controls
 * the channel, not the rule, and says so rather than offering switches that do
 * nothing.
 */
export function NotificationSettingsPage() {
  return (
    <div>
      <Section title="On this device">
        <PushSettings />
      </Section>

      <Section title="In the app">
        <Card>
          <CardHeader
            title="Notifications"
            description="Everything sent to you, newest first."
            action={
              <ButtonLink to="/notifications" variant="secondary" size="sm">
                Open
              </ButtonLink>
            }
          />
          <p className="text-xs text-ink-2">
            You are notified only about things you need to act on. There is no digest to tune and no
            marketing to switch off.
          </p>
        </Card>
      </Section>
    </div>
  );
}
