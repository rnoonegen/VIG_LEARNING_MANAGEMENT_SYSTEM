import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, Images, Search, Sparkles, Users } from 'lucide-react';
import type { MomentFolderDto } from '@vig/shared';
import { Input } from '@/components/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { asToken, cn, TOKEN_STYLES } from '@/lib/ui';
import { folderPath, formatDateRange, useMomentFolders } from './momentsApi';

/**
 * Moments, opened as folders.
 *
 * The page used to be a flat wall of every moment in the school, which is fine
 * on the first day and unreadable by the third term. The curriculum already
 * gives the school its filing cabinet, so the cabinet is what you land on: one
 * card per subject, plus "Others" for what belongs to no subject at all.
 *
 * The same grid serves staff and parents. What is counted inside each folder is
 * decided by the API — a parent's card counts their own child's entries and
 * nobody else's — so this component never asks who is looking.
 */
export function MomentFolderGrid({
  basePath,
  studentId,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  basePath: string;
  /** Set on the parent view, to count only that child's moments. */
  studentId?: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
}) {
  const params = studentId ? { studentId } : undefined;
  const { data, isLoading, isError, refetch } = useMomentFolders(params);
  const [search, setSearch] = useState('');

  // The whole folder list is already here, so the search filters in place rather
  // than going back to the server for a set it is holding.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter((f) => f.name.toLowerCase().includes(term));
  }, [data, search]);

  if (isLoading) return <LoadingState rows={3} label="Loading folders" />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles size={26} />}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div>
      {/* A search box over three folders is furniture, not help. */}
      {data.length > 3 ? (
        <div className="relative mb-5 max-w-sm">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subjects"
            className="pl-9"
            aria-label="Search subjects"
          />
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={<Search size={26} />}
          title={`No subject matches “${search.trim()}”`}
          description="Check the spelling, or clear the search to see every folder again."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((folder) => (
            <MomentFolderCard key={folder.id} folder={folder} basePath={basePath} />
          ))}
        </div>
      )}
    </div>
  );
}

export function MomentFolderCard({
  folder,
  basePath,
}: {
  folder: MomentFolderDto;
  basePath: string;
}) {
  const token = asToken(folder.colorToken);
  const empty = folder.momentCount === 0;

  return (
    <Link
      to={folderPath(basePath, folder.id)}
      className={cn(
        'group flex flex-col overflow-hidden rounded-[18px] border border-line bg-card',
        'transition-all duration-200 hover:-translate-y-0.5 hover:border-violet/40 hover:shadow-[0_12px_28px_-16px_rgba(17,22,92,0.35)]',
      )}
    >
      <Cover folder={folder} />

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="flex items-center gap-1.5">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', TOKEN_STYLES[token].dot)} />
          <h3 className="min-w-0 flex-1 truncate text-[17px] leading-snug">{folder.name}</h3>
        </span>

        {folder.isOthers ? (
          <p className="text-xs leading-relaxed text-ink-2">
            Festivals, trips and everything that belongs to no single subject. Only you can see
            this folder.
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-2.5">
          {empty ? (
            <span className="text-[11px] text-ink-3">Nothing filed here yet</span>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-[11px] text-ink-2">
                <Images size={13} className="shrink-0 text-ink-3" />
                {folder.momentCount} {folder.momentCount === 1 ? 'moment' : 'moments'}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-ink-2">
                <Users size={13} className="shrink-0 text-ink-3" />
                {folder.entryCount}
              </span>
            </>
          )}
        </div>

        {folder.latestStartDate ? (
          <span className="text-[11px] text-ink-3">
            Latest {formatDateRange(folder.latestStartDate, folder.latestStartDate)}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * A strip of what is inside, or — when the folder is empty — a tinted panel in
 * the subject's own colour. An untouched subject should look like somewhere to
 * put something, not like something that failed to load.
 */
function Cover({ folder }: { folder: MomentFolderDto }) {
  const token = asToken(folder.colorToken);
  const photos = folder.previewPhotoUrls;

  if (photos.length === 0) {
    return (
      <div className="relative flex aspect-[16/7] items-center justify-center overflow-hidden bg-lavender-2">
        <span
          aria-hidden
          className={cn(
            'absolute -right-8 -top-10 h-32 w-32 rounded-full opacity-[0.18] blur-2xl',
            TOKEN_STYLES[token].bar,
          )}
        />
        <span className={cn('relative', TOKEN_STYLES[token].text)}>
          <FolderOpen size={26} />
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid aspect-[16/7] gap-0.5 overflow-hidden bg-lavender',
        photos.length === 1 ? 'grid-cols-1' : photos.length === 2 ? 'grid-cols-2' : 'grid-cols-3',
      )}
    >
      {photos.map((url, index) => (
        <img
          key={index}
          src={url}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />
      ))}
    </div>
  );
}
