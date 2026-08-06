import { useState } from 'react';
import type { MomentEntryDto } from '@vig/shared';
import { errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useDeleteEntry, useDeleteMoment } from './momentsApi';

/**
 * The two ways something gets thrown away in this section.
 *
 * Deleting takes the photographs with it, so each sentence says what is lost
 * rather than asking a bare "are you sure?". They live together here because a
 * moment is now deleted from the folder list while an entry is deleted from
 * inside the moment — two pages, one wording.
 */

export function DeleteMomentConfirm({
  collectionId,
  heading,
  onDone,
  onCancel,
}: {
  collectionId: string;
  heading: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const deleteMoment = useDeleteMoment();

  const run = async () => {
    setError(null);
    try {
      await deleteMoment.mutateAsync(collectionId);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <ConfirmShell
      title="Delete this moment?"
      confirmLabel="Delete moment"
      pending={deleteMoment.isPending}
      pendingLabel="Deleting…"
      error={error}
      onConfirm={run}
      onCancel={onCancel}
    >
      “{heading}” and every student entry inside it will be deleted, along with their photos. This
      cannot be undone.
    </ConfirmShell>
  );
}

export function DeleteEntryConfirm({
  collectionId,
  entry,
  onDone,
  onCancel,
}: {
  collectionId: string;
  entry: MomentEntryDto;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const deleteEntry = useDeleteEntry(collectionId);

  const run = async () => {
    setError(null);
    try {
      await deleteEntry.mutateAsync(entry.id);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // A group entry is one card covering several children, so removing it takes it
  // away from all of them — the sentence has to say so before it happens (024).
  const group = entry.kind === 'GROUP';
  const who = entry.students[0]?.fullName ?? 'This student';

  return (
    <ConfirmShell
      title={group ? 'Remove this group entry?' : 'Remove this entry?'}
      confirmLabel="Remove entry"
      pending={deleteEntry.isPending}
      pendingLabel="Deleting…"
      error={error}
      onConfirm={run}
      onCancel={onCancel}
    >
      {group ? (
        <>
          “{entry.title}” — the entry shared by all {entry.studentCount} students in it — will be
          deleted, along with its photo. Any other entries they are in stay as they are.
        </>
      ) : (
        <>
          {who}’s entry — “{entry.title}” — will be deleted, along with its photo. Any other entries
          they are in stay as they are.
        </>
      )}
    </ConfirmShell>
  );
}

function ConfirmShell({
  title,
  confirmLabel,
  pendingLabel,
  pending,
  error,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            Keep it
          </Button>
          <Button variant="danger" onClick={() => void onConfirm()} disabled={pending}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">{children}</p>
      {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
    </Modal>
  );
}
