import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarSearch, ListFilter, Sparkles, X } from 'lucide-react';
import type { MomentCollectionDto } from '@vig/shared';
import { isOthersFolder } from '@vig/shared';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { MomentCard } from './MomentCard';
import { DeleteMomentConfirm } from './MomentDeleteDialogs';
import { MomentFormModal } from './MomentFormModal';
import { formatDateRange, useMomentFolders, useMoments } from './momentsApi';

/**
 * What is inside one folder.
 *
 * The folder is the filter, so there are no subject chips here — everything on
 * this page is already the same subject. A moment opened from here is created
 * in this folder too: the author chose it by walking in.
 *
 * The same page serves an admin, a teacher and a parent. Scope lives in the API:
 * a teacher's folder holds the moments they opened, a parent's holds the ones
 * their child appears in.
 */
export function MomentFolderPage({
  basePath,
  studentId,
  canCreate = true,
}: {
  basePath: string;
  /** Set on the parent view, to narrow the folder to one child. */
  studentId?: string;
  canCreate?: boolean;
}) {
  const { folderId = '' } = useParams();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MomentCollectionDto | null>(null);
  const [deleting, setDeleting] = useState<MomentCollectionDto | null>(null);

  // The name and colour come from the folder list, which is already in cache
  // after the page you clicked through from — so this costs nothing in the
  // normal path and still works on a cold link.
  const { data: folders } = useMomentFolders(studentId ? { studentId } : undefined);
  const folder = folders?.find((f) => f.id === folderId);

  // Both ends are optional and independent: "from March" and "up to March" are
  // both useful searches, so neither waits for the other to be filled in.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const rangeValid = !from || !to || to >= from;
  const searching = Boolean(from || to);

  const clearDates = () => {
    setFrom('');
    setTo('');
  };

  // Collapsed, the control still has to say what it is doing — a filter you
  // cannot see is a list that looks broken.
  const rangeLabel = !searching
    ? 'Filter by date'
    : from && to
      ? formatDateRange(from, to)
      : from
        ? `From ${formatDateRange(from, from)}`
        : `Until ${formatDateRange(to, to)}`;

  const { data, isLoading, isError, refetch } = useMoments({
    subjectId: folderId,
    ...(studentId ? { studentId } : {}),
    // An invalid pair is not sent — the field explains itself instead of the
    // list silently emptying.
    ...(rangeValid && from ? { from } : {}),
    ...(rangeValid && to ? { to } : {}),
  });

  const newMomentButton = canCreate ? (
    <Button icon={<Sparkles size={16} />} onClick={() => setCreating(true)}>
      New Moment
    </Button>
  ) : undefined;

  // Nothing to filter, and nothing filtered: an empty folder says so plainly.
  const showFilterControl = !isLoading && !isError && ((data?.length ?? 0) > 0 || searching);

  return (
    <div>
      <PageHeader
        backTo={basePath}
        backLabel="All folders"
        eyebrow={isOthersFolder(folderId) ? 'Admin only' : 'Subject'}
        title={folder?.name ?? 'Moments'}
        description={
          isOthersFolder(folderId)
            ? 'Festivals, trips and everything that belongs to no single subject. Nobody else can see this folder.'
            : folder
              ? `The moments filed under ${folder.name}.`
              : undefined
        }
        action={newMomentButton}
      />

      {/* The filter stays folded away until it is wanted. An empty folder should
          answer "there is nothing here", not open with two date boxes asking to
          narrow down nothing — so the control only appears once there is
          something to narrow, or once a filter is already on. */}
      {showFilterControl ? (
        <div className="mb-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<ListFilter size={14} />}
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              aria-controls="moment-date-filter"
            >
              {rangeLabel}
            </Button>

            {/* Clearing is reachable while folded, so an active filter never
                requires opening the panel just to switch it off. */}
            {searching ? (
              <Button variant="secondary" size="sm" icon={<X size={14} />} onClick={clearDates}>
                Clear
              </Button>
            ) : null}
          </div>

          {filtersOpen ? (
            <div
              id="moment-date-filter"
              className="mt-3 rounded-[14px] border border-line bg-card p-4"
            >
              <div className="flex flex-wrap items-start gap-3">
                {/* The inputs are full-width by design, so the width is set on a
                    wrapper rather than fought with on the control itself. */}
                <div className="w-44">
                  <Field label="From" htmlFor="moment-from">
                    <Input
                      id="moment-from"
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </Field>
                </div>
                <div className="w-44">
                  <Field
                    label="To"
                    htmlFor="moment-to"
                    error={rangeValid ? null : 'The end cannot be before the start'}
                  >
                    <Input
                      id="moment-to"
                      type="date"
                      value={to}
                      invalid={!rangeValid}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </Field>
                </div>
              </div>

              {/* Containment, not overlap: said out loud, because a date filter
                  that silently drops a long moment reads as a bug, not a rule. */}
              <p className="mt-2 text-xs text-ink-3">
                A moment shows when it starts and ends within these dates. One that runs past
                either end is left out.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <LoadingState rows={4} label="Loading moments" />
      ) : isError || !data ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        searching ? (
          <EmptyState
            icon={<CalendarSearch size={26} />}
            title="No moments in those dates"
            description="Nothing in this folder starts and ends inside the dates you chose. A moment that runs past either end will not show — widen the dates, or clear them to see everything filed here."
            action={
              <Button variant="secondary" icon={<X size={15} />} onClick={clearDates}>
                Clear dates
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Sparkles size={26} />}
            title="Nothing filed here yet"
            description={
              canCreate
                ? 'A moment is a heading, a stretch of dates and a subject — then one entry for each child who was part of it.'
                : 'When a teacher writes up a moment in this subject, it will appear here.'
            }
            action={newMomentButton}
          />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((moment) => (
            <MomentCard
              key={moment.id}
              moment={moment}
              to={`${basePath}/${moment.id}`}
              // A moment someone else opened is read-only, so it gets no
              // controls at all rather than controls that would be refused.
              onEdit={moment.canManage ? () => setEditing(moment) : undefined}
              onDelete={moment.canManage ? () => setDeleting(moment) : undefined}
            />
          ))}
        </div>
      )}

      {creating ? (
        <MomentFormModal
          // Opened from inside a folder, so that is where it is filed — the
          // author already answered "which subject?" by being here.
          folderId={folderId}
          onClose={() => setCreating(false)}
          onCreated={(id) => navigate(`${basePath}/${id}`)}
        />
      ) : null}

      {editing ? (
        <MomentFormModal moment={editing} onClose={() => setEditing(null)} />
      ) : null}

      {deleting ? (
        <DeleteMomentConfirm
          collectionId={deleting.id}
          heading={deleting.heading}
          // Deleting from the list leaves you in the list — the moment simply
          // stops being there, which the invalidated query already handles.
          onDone={() => setDeleting(null)}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
