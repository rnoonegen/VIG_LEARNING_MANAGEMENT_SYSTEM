import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, BellOff } from 'lucide-react';
import { get } from '@/lib/api';
import {
  hasLocalPushSubscription,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  type PushStatus,
} from '@/lib/pwa';
import { Button } from './ui/Button';
import { Card, CardHeader } from './ui/Card';

/**
 * Device-level notification opt-in (F22 / D3).
 *
 * What arrives is fixed by BR-14 and is not configurable here — parents get one
 * push a week, teachers get scheduling and class-record notices, admins get
 * operational issues. This screen only answers "does this device get them".
 */
export function PushSettings() {
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ['push-status'],
    queryFn: () => get<PushStatus>('/notifications/push/status'),
  });

  useEffect(() => {
    void hasLocalPushSubscription().then(setSubscribed);
  }, []);

  if (!pushSupported()) {
    return (
      <Card>
        <CardHeader title="Notifications on this device" />
        <p className="text-xs text-ink-2">
          This browser does not support push notifications. You will still see everything in the
          notification centre when you open the app.
        </p>
      </Card>
    );
  }

  async function enable() {
    if (!status?.publicKey) return;
    setBusy(true);
    setMessage(null);

    const outcome = await subscribeToPush(status.publicKey);
    setBusy(false);

    if (outcome === 'subscribed') {
      setSubscribed(true);
      setMessage('This device will receive notifications.');
      return;
    }
    setMessage(
      outcome === 'denied'
        ? 'Notifications are blocked for this site. Allow them in your browser settings, then try again.'
        : 'Could not turn on notifications. Please try again.',
    );
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    await unsubscribeFromPush();
    setSubscribed(false);
    setBusy(false);
    setMessage('This device will no longer receive notifications.');
  }

  return (
    <Card>
      <CardHeader
        title="Notifications on this device"
        description={
          subscribed
            ? 'This device is registered for notifications.'
            : 'Get notified without keeping the app open.'
        }
        action={
          <Button
            variant={subscribed ? 'secondary' : 'primary'}
            size="sm"
            disabled={busy}
            icon={subscribed ? <BellOff size={15} /> : <Bell size={15} />}
            onClick={subscribed ? disable : enable}
          >
            {busy ? 'Working…' : subscribed ? 'Turn off' : 'Turn on'}
          </Button>
        }
      />

      {/* Registration is collected now; delivery waits on FEATURE_WEB_PUSH (D3).
          Saying so is better than a switch that silently does nothing. */}
      {status && !status.enabled ? (
        <p className="text-xs text-ink-2">
          Your school has not enabled push delivery yet. You can register this device now — the
          notification centre in the app is up to date either way.
        </p>
      ) : null}

      {message ? <p className="mt-2 text-xs text-ink-2">{message}</p> : null}
    </Card>
  );
}
