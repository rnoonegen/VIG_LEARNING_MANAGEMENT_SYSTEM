import { ExternalLink, Film, ImageOff, Link2, Pencil, PlayCircle, Trash2 } from 'lucide-react';
import type { MomentEntryDto } from '@vig/shared';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/ui';
import { IconAction } from './IconAction';

/**
 * One child inside a moment.
 *
 * The photo is the card, with the child's name riding on a scrim across the
 * bottom so a parent scanning the page recognises their own child before
 * reading a word. Manage controls only appear for someone who can actually use
 * them, and only on hover or focus, so they never compete with the photograph.
 */
export function MomentEntryCard({
  entry,
  canManage,
  onOpen,
  onEdit,
  onDelete,
}: {
  entry: MomentEntryDto;
  canManage: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-[16px] border border-line bg-card transition-shadow hover:shadow-[0_12px_28px_-18px_rgba(17,22,92,0.4)]">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <span className="relative block aspect-[4/3] overflow-hidden bg-lavender">
          {entry.photoUrl ? (
            <img
              src={entry.photoUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-1.5 text-violet">
              {entry.videoUrl ? <Film size={26} /> : <ImageOff size={24} />}
              <span className="text-[11px] font-medium">
                {entry.videoUrl ? 'Video only' : 'No media'}
              </span>
            </span>
          )}

          {entry.videoUrl ? (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-navy/55 px-2 py-1 text-[10px] font-medium text-white backdrop-blur">
              <PlayCircle size={12} />
              Video
            </span>
          ) : null}

          {/* The name sits on the image, so it needs its own contrast rather
              than borrowing the photograph's. */}
          <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-navy/85 via-navy/45 to-transparent px-3 pb-2.5 pt-8">
            <Avatar name={entry.student.fullName} url={entry.student.avatarUrl} size={26} />
            <span className="truncate text-xs font-semibold text-white">
              {entry.student.fullName}
            </span>
          </span>
        </span>

        <span className="block px-3.5 py-3">
          <span className="line-clamp-1 block text-sm font-medium text-ink">{entry.title}</span>
          {entry.description ? (
            <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-ink-2">
              {entry.description}
            </span>
          ) : null}
          {entry.referenceLinks.length ? (
            <span className="mt-2 flex items-center gap-1 text-[11px] text-ink-3">
              <Link2 size={12} />
              {entry.referenceLinks.length} link{entry.referenceLinks.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </span>
      </button>

      {canManage ? (
        <div
          className={cn(
            'absolute left-2 top-2 flex gap-1 opacity-0 transition-opacity',
            'group-hover:opacity-100 focus-within:opacity-100',
          )}
        >
          <IconAction label={`Edit ${entry.student.fullName}'s entry`} onClick={onEdit}>
            <Pencil size={14} />
          </IconAction>
          <IconAction
            label={`Remove ${entry.student.fullName}'s entry`}
            onClick={onDelete}
            danger
          >
            <Trash2 size={14} />
          </IconAction>
        </div>
      ) : null}
    </div>
  );
}

/** The entry at full size: the photo, everything written about it, every link. */
export function MomentEntryDetail({
  entry,
  canManage,
  onClose,
  onEdit,
}: {
  entry: MomentEntryDto;
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={entry.title}
      description={entry.student.fullName}
      footer={
        canManage ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button icon={<Pencil size={15} />} onClick={onEdit}>
              Edit entry
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {entry.photoUrl ? (
          <img
            src={entry.photoUrl}
            alt=""
            className="max-h-[55vh] w-full rounded-[14px] bg-lavender object-contain"
          />
        ) : null}

        {entry.videoUrl ? (
          <a
            href={entry.videoUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-3 rounded-[14px] border border-line bg-lavender-2 px-4 py-3 transition-colors hover:border-violet/40 hover:bg-lavender"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet text-white">
              <PlayCircle size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">Watch the video</span>
              <span className="block truncate text-[11px] text-ink-3">{entry.videoUrl}</span>
            </span>
            <ExternalLink size={15} className="shrink-0 text-ink-3" />
          </a>
        ) : null}

        {entry.description ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{entry.description}</p>
        ) : null}

        {entry.referenceLinks.length ? (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-2">
              Reference links
            </p>
            <div className="flex flex-wrap gap-2">
              {entry.referenceLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-xs text-ink-2 transition-colors hover:border-violet/40 hover:bg-lavender hover:text-violet"
                >
                  <Link2 size={12} className="shrink-0" />
                  <span className="truncate">{link.label || link.url}</span>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <p className="border-t border-line pt-3 text-[11px] text-ink-3">
          Added by {entry.createdByName}
        </p>
      </div>
    </Modal>
  );
}
