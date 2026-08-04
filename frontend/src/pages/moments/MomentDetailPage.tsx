import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarRange, Images, Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import type { MomentEntryDto } from '@vig/shared';
import { errorMessage } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { asToken, cn, TOKEN_STYLES } from '@/lib/ui';
import { EntryFormModal } from './EntryFormModal';
import { MomentEntryCard, MomentEntryDetail } from './MomentEntryCard';
import { MomentFormModal } from './MomentFormModal';
import { formatDateRange, useDeleteEntry, useDeleteMoment, useMoment } from './momentsApi';

/**
 * One moment, and the children inside it.
 *
 * The same page serves all three roles. A parent reaches it through their own
 * child and the API returns only that child's entries, so nothing here needs to
 * know which role is looking — `canManage` decides what can be changed and the
 * rest simply renders what arrived.
 */
export function MomentDetailPage({ backTo }: { backTo: string }) {
  const { momentId = '' } = useParams();
  const navigate = useNavigate();

  const [addingEntry, setAddingEntry] = useState(false);
  const [editingMoment, setEditingMoment] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MomentEntryDto | null>(null);
  const [openEntry, setOpenEntry] = useState<MomentEntryDto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<'moment' | MomentEntryDto | null>(null);

  const { data: moment, isLoading, isError, refetch } = useMoment(momentId);

  if (isLoading) return <LoadingState rows={4} label="Loading this moment" />;
  if (isError || !moment) return <ErrorState onRetry={() => void refetch()} />;

  const token = asToken(moment.subject.colorToken);
  const addButton = (
    <Button icon={<UserPlus size={16} />} onClick={() => setAddingEntry(true)}>
      Add Student
    </Button>
  );

  return (
    <div>
      <PageHeader
        backTo={backTo}
        backLabel="All moments"
        eyebrow={moment.subject.name}
        title={moment.heading}
        description={moment.description ?? undefined}
        action={moment.canManage ? addButton : undefined}
      />

      {/* The frame around the moment: when it ran, who opened it, how full it is. */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Stat icon={<CalendarRange size={13} />}>
          {formatDateRange(moment.startDate, moment.endDate)}
        </Stat>
        <Stat icon={<Images size={13} />}>
          {moment.entryCount} {moment.entryCount === 1 ? 'entry' : 'entries'}
        </Stat>
        <Stat icon={<Users size={13} />}>Opened by {moment.createdBy.name}</Stat>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium',
            TOKEN_STYLES[token].chip,
          )}
        >
          <span className={cn('h-2 w-2 rounded-full', TOKEN_STYLES[token].dot)} />
          {moment.subject.name}
        </span>

        {moment.canManage ? (
          <span className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={() => setEditingMoment(true)}>
              Edit
            </Button>
            <Button variant="secondary" size="sm" icon={<Trash2 size={13} />} onClick={() => setConfirmDelete('moment')}>
              Delete
            </Button>
          </span>
        ) : null}
      </div>

      {moment.entries.length === 0 ? (
        <EmptyState
          icon={<UserPlus size={26} />}
          title={moment.canManage ? 'No students added yet' : 'Nothing here yet'}
          description={
            moment.canManage
              ? 'Add the children one at a time. Each gets their own photo, video, notes and links — and each child can only be added once.'
              : 'Photos and notes from this moment will appear here once they are added.'
          }
          action={moment.canManage ? addButton : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {moment.entries.map((entry) => (
            <MomentEntryCard
              key={entry.id}
              entry={entry}
              canManage={moment.canManage}
              onOpen={() => setOpenEntry(entry)}
              onEdit={() => setEditingEntry(entry)}
              onDelete={() => setConfirmDelete(entry)}
            />
          ))}
        </div>
      )}

      {addingEntry ? (
        <EntryFormModal collectionId={moment.id} onClose={() => setAddingEntry(false)} />
      ) : null}

      {editingEntry ? (
        <EntryFormModal
          collectionId={moment.id}
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
        />
      ) : null}

      {editingMoment ? (
        <MomentFormModal moment={moment} onClose={() => setEditingMoment(false)} />
      ) : null}

      {openEntry ? (
        <MomentEntryDetail
          entry={openEntry}
          canManage={moment.canManage}
          onClose={() => setOpenEntry(null)}
          onEdit={() => {
            setEditingEntry(openEntry);
            setOpenEntry(null);
          }}
        />
      ) : null}

      {confirmDelete ? (
        <DeleteConfirm
          target={confirmDelete}
          collectionId={moment.id}
          momentHeading={moment.heading}
          onDone={() => {
            setConfirmDelete(null);
            if (confirmDelete === 'moment') navigate(backTo, { replace: true });
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      ) : null}
    </div>
  );
}

function Stat({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1.5 text-[11px] text-ink-2">
      <span className="text-ink-3">{icon}</span>
      {children}
    </span>
  );
}

/**
 * Deleting takes the photographs with it, so the sentence says what is lost
 * rather than asking a bare "are you sure?".
 */
function DeleteConfirm({
  target,
  collectionId,
  momentHeading,
  onDone,
  onCancel,
}: {
  target: 'moment' | MomentEntryDto;
  collectionId: string;
  momentHeading: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const deleteMoment = useDeleteMoment();
  const deleteEntry = useDeleteEntry(collectionId);
  const isMoment = target === 'moment';
  const pending = deleteMoment.isPending || deleteEntry.isPending;

  const run = async () => {
    setError(null);
    try {
      if (isMoment) await deleteMoment.mutateAsync(collectionId);
      else await deleteEntry.mutateAsync(target.id);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title={isMoment ? 'Delete this moment?' : 'Remove this entry?'}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            Keep it
          </Button>
          <Button variant="danger" onClick={() => void run()} disabled={pending}>
            {pending ? 'Deleting…' : isMoment ? 'Delete moment' : 'Remove entry'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">
        {isMoment ? (
          <>
            “{momentHeading}” and every student entry inside it will be deleted, along with their
            photos. This cannot be undone.
          </>
        ) : (
          <>
            {target.student.fullName}’s entry — “{target.title}” — will be deleted, along with its
            photo. They can be added to this moment again afterwards.
          </>
        )}
      </p>
      {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
    </Modal>
  );
}
