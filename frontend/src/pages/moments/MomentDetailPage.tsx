import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarRange, Images, UserPlus, Users } from 'lucide-react';
import type { MomentEntryDto } from '@vig/shared';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { asToken, cn, TOKEN_STYLES } from '@/lib/ui';
import { EntryFormModal } from './EntryFormModal';
import { DeleteEntryConfirm } from './MomentDeleteDialogs';
import { MomentEntryCard, MomentEntryDetail } from './MomentEntryCard';
import { folderPath, formatDateRange, useMoment } from './momentsApi';

/**
 * One moment, and the children inside it.
 *
 * The same page serves all three roles. A parent reaches it through their own
 * child and the API returns only that child's entries, so nothing here needs to
 * know which role is looking — `canManage` decides what can be changed and the
 * rest simply renders what arrived.
 *
 * Back goes to the folder this moment is filed in, not to the folder list —
 * you came from the subject, so that is where "back" belongs.
 *
 * This page manages entries only. Editing or deleting the moment itself is done
 * from its card in the folder, where it is one action on one card rather than a
 * page you must first open and then leave.
 */
export function MomentDetailPage({ basePath }: { basePath: string }) {
  const { momentId = '' } = useParams();

  const [addingEntry, setAddingEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MomentEntryDto | null>(null);
  const [openEntry, setOpenEntry] = useState<MomentEntryDto | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<MomentEntryDto | null>(null);

  const { data: moment, isLoading, isError, refetch } = useMoment(momentId);

  if (isLoading) return <LoadingState rows={4} label="Loading this moment" />;
  if (isError || !moment) return <ErrorState onRetry={() => void refetch()} />;

  const token = asToken(moment.subject.colorToken);
  const backTo = folderPath(basePath, moment.subject.id);
  const addButton = (
    <Button icon={<UserPlus size={16} />} onClick={() => setAddingEntry(true)}>
      Add Students
    </Button>
  );

  return (
    <div>
      <PageHeader
        backTo={backTo}
        backLabel={moment.subject.name}
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
      </div>

      {moment.entries.length === 0 ? (
        <EmptyState
          icon={<UserPlus size={26} />}
          title={moment.canManage ? 'No students added yet' : 'Nothing here yet'}
          description={
            moment.canManage
              ? 'Write up one child on their own, or a group together. A child can be in as many entries as they took part in — the group dance and the solo speech both belong here.'
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
              onDelete={() => setDeletingEntry(entry)}
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

      {openEntry ? (
        <MomentEntryDetail
          entry={openEntry}
          canManage={moment.canManage}
          onClose={() => setOpenEntry(null)}
          onEdit={() => {
            setEditingEntry(openEntry);
            setOpenEntry(null);
          }}
          onDelete={() => {
            setDeletingEntry(openEntry);
            setOpenEntry(null);
          }}
        />
      ) : null}

      {deletingEntry ? (
        <DeleteEntryConfirm
          collectionId={moment.id}
          entry={deletingEntry}
          onDone={() => setDeletingEntry(null)}
          onCancel={() => setDeletingEntry(null)}
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
