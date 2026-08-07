import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { BellOff } from 'lucide-react';
import type { NotificationPrefsDto } from '@vig/shared';
import { errorMessage, get, patch } from '@/lib/api';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Field';
import { Section } from '@/components/ui/Layout';
import { ErrorState } from '@/components/ui/States';
import { PushSettings } from '@/components/PushSettings';

/**
 * What reaches you, and where.
 *
 * Two switches, and the order matters: the account switch is the one a person
 * means when they say "turn notifications off" — it follows them to whatever
 * device they sign in on — and the device switch below it only answers whether
 * *this* browser accepts push.
 *
 * With the account switch off, the device section says it is stopped instead of
 * offering the choice. Two things were wrong before this: a disabled "Turn on"
 * button is a control that exists only to refuse, and removing the section
 * outright left a silence where the confirmation should be — the state a person
 * has just asked for should be visible, not inferred from a missing card. So
 * the section stays, the button goes, and what is left says plainly that this
 * device is not being notified. The choice becomes real again, with whatever
 * this browser was already registered as, the moment notifications are back on.
 *
 * Off is a mute, not an unsubscribe. Everything sent still lands in the
 * notification centre; what stops is the interruption. That distinction is
 * stated on the page because the alternative — silently discarding a password
 * reset an admin is waiting on — is not a setting anybody would want.
 *
 * How *much* reaches you remains a product rule, not a preference (BR-14): one
 * weekly update for a parent, scheduling and class-record matters for a
 * teacher, operational issues for an admin. This page does not offer per-item
 * switches, because there is no volume here worth tuning.
 */
export function NotificationSettingsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: prefs, isLoading, isError, refetch } = useQuery({
    queryKey: ['notification-prefs'],
    queryFn: () => get<NotificationPrefsDto>('/notifications/preferences'),
  });

  const save = useMutation({
    mutationFn: (notificationsEnabled: boolean) =>
      patch<NotificationPrefsDto>('/notifications/preferences', { notificationsEnabled }),
    // The switch has to move under the finger, so the cache is written first and
    // rolled back if the request fails — a toggle that waits on a round trip
    // reads as broken and gets pressed twice.
    onMutate: async (next) => {
      setError(null);
      await queryClient.cancelQueries({ queryKey: ['notification-prefs'] });
      const previous = queryClient.getQueryData<NotificationPrefsDto>(['notification-prefs']);
      queryClient.setQueryData<NotificationPrefsDto>(['notification-prefs'], {
        notificationsEnabled: next,
      });
      return { previous };
    },
    onError: (err, _next, context) => {
      if (context?.previous) queryClient.setQueryData(['notification-prefs'], context.previous);
      setError(errorMessage(err));
    },
    // The bell in the shell counts server-side and is muted with the account, so
    // it is re-read rather than left showing a badge the setting just turned off.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    // Then settle the switch against what was actually stored. The optimistic
    // value is a guess held only in this tab; re-reading it means a write that
    // half-succeeded shows the truth here rather than on the next visit.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notification-prefs'] }),
  });

  const enabled = prefs?.notificationsEnabled ?? true;

  return (
    <div>
      <Section title="Your account">
        {/* A switch drawn from a failed read would show "on" and be wrong half
            the time, so the setting is not offered until its value is known. */}
        {isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : (
          <Card>
            <CardHeader
              title="Notifications"
              description={
                enabled
                  ? 'You will be notified when something needs your attention.'
                  : 'Notifications are off. Nothing will interrupt you on any device.'
              }
              action={
                <Toggle
                  checked={enabled}
                  disabled={isLoading || save.isPending}
                  label="Notifications"
                  showState
                  onChange={(next) => save.mutate(next)}
                />
              }
            />
            <p className="text-xs text-ink-2">
              {enabled
                ? 'This applies everywhere you are signed in.'
                : 'Everything sent to you is still kept in the app — open Notifications any time to see what arrived while you were muted.'}
            </p>
            {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
          </Card>
        )}
      </Section>

      <Section title="On this device">
        {enabled ? (
          <PushSettings />
        ) : (
          <Card>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lavender-2 text-ink-3">
                <BellOff size={18} />
              </span>
              <div className="min-w-0">
                <h3>Notifications are stopped</h3>
                <p className="mt-1 text-sm text-ink-2">
                  This device will not be notified while notifications are off.
                </p>
                <p className="mt-2 text-xs text-ink-3">
                  Turn them back on above to choose whether this device receives them.
                </p>
              </div>
            </div>
          </Card>
        )}
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
