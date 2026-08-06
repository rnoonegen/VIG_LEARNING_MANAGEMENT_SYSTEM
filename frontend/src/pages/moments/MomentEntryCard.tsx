import { ExternalLink, Film, ImageOff, Link2, Pencil, PlayCircle, Trash2, Users } from 'lucide-react';
import type { MomentEntryDto } from '@vig/shared';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/ui';
import { IconAction } from './IconAction';
import { formatEntryAudience } from './momentsApi';

/** At most three faces on a card — past that it is a crowd, not a recognition aid. */
const FACES = 3;

/**
 * One entry inside a moment — a single child's, or a group's (024).
 *
 * The photo is the card, with the names riding on a scrim across the bottom so a
 * parent scanning the page recognises their own child before reading a word. A
 * group shows the first few faces and says how many more there are; a parent's
 * copy of that group names only their own child, so the count is doing the work
 * the missing names cannot.
 *
 * Manage controls only appear for someone who can actually use them, and only on
 * hover or focus, so they never compete with the photograph.
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
  const audience = formatEntryAudience(entry);
  const faces = entry.students.slice(0, FACES);

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

          <span className="absolute right-2 top-2 flex items-center gap-1.5">
            {entry.kind === 'GROUP' ? (
              <span className="flex items-center gap-1 rounded-full bg-violet/85 px-2 py-1 text-[10px] font-medium text-white backdrop-blur">
                <Users size={12} />
                Group of {entry.studentCount}
              </span>
            ) : null}
            {entry.videoUrl ? (
              <span className="flex items-center gap-1 rounded-full bg-navy/55 px-2 py-1 text-[10px] font-medium text-white backdrop-blur">
                <PlayCircle size={12} />
                Video
              </span>
            ) : null}
          </span>

          {/* The names sit on the image, so they need their own contrast rather
              than borrowing the photograph's. */}
          <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-navy/85 via-navy/45 to-transparent px-3 pb-2.5 pt-8">
            {/* Overlapped, so three faces cost roughly the width of one and a
                half and the name beside them keeps its room. */}
            <span className="flex shrink-0 items-center">
              {faces.map((student, index) => (
                <span
                  key={student.id}
                  className={cn('rounded-full ring-2 ring-navy/40', index > 0 && '-ml-2.5')}
                >
                  <Avatar name={student.fullName} url={student.avatarUrl} size={26} />
                </span>
              ))}
            </span>
            <span className="truncate text-xs font-semibold text-white">{audience}</span>
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
        <div className="hover-actions absolute left-2 top-2 flex gap-1">
          <IconAction label={`Edit the entry for ${audience}`} onClick={onEdit}>
            <Pencil size={14} />
          </IconAction>
          <IconAction label={`Remove the entry for ${audience}`} onClick={onDelete} danger>
            <Trash2 size={14} />
          </IconAction>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The entry at full size: the photo, everything written about it, every link.
 *
 * Editing and removing are offered here as well as on the card, because the
 * card's controls appear on hover — which is no offer at all on a touchscreen,
 * and easy to miss anywhere else. Opening the entry is how anyone gets a proper
 * look at it, so it is also where the two things you might then want to do live.
 */
export function MomentEntryDetail({
  entry,
  canManage,
  onClose,
  onEdit,
  onDelete,
}: {
  entry: MomentEntryDto;
  canManage: boolean;
  onClose: () => void;
  /** Absent where the entry is only being read, as on a student's profile. */
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const editable = canManage && Boolean(onEdit);
  const removable = canManage && Boolean(onDelete);
  // Everyone in the entry this reader is not allowed to name — a parent looking
  // at a group of twelve sees their own child and a count of the rest.
  const unnamed = Math.max(0, entry.studentCount - entry.students.length);
  const roster = entry.students.length > 1 || unnamed > 0;

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={entry.title}
      description={formatEntryAudience(entry)}
      footer={
        editable || removable ? (
          <>
            {/* Destructive first and visually apart from the primary action, so
                "remove" is never the button next to the one you meant. */}
            {removable ? (
              <Button
                variant="danger"
                icon={<Trash2 size={15} />}
                onClick={onDelete}
                className="sm:mr-auto"
              >
                Remove entry
              </Button>
            ) : null}
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {editable ? (
              <Button icon={<Pencil size={15} />} onClick={onEdit}>
                Edit entry
              </Button>
            ) : null}
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

        {/* A group's roster, in full. One name is already in the subtitle above,
            so it is not repeated as a list of one. */}
        {roster ? (
          <div className="flex flex-wrap items-center gap-2">
            {entry.students.map((student) => (
              <span
                key={student.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-lavender-2 py-1 pl-1 pr-3 text-xs text-ink-2"
              >
                <Avatar name={student.fullName} url={student.avatarUrl} size={22} />
                <span className="truncate">{student.fullName}</span>
              </span>
            ))}
            {unnamed > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-ink-3">
                <Users size={12} />
                and {unnamed} other{unnamed === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
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
