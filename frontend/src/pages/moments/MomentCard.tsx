import { Link } from 'react-router-dom';
import { CalendarRange, Images, Pencil, Trash2, Users } from 'lucide-react';
import type { MomentCollectionDto } from '@vig/shared';
import { asToken, cn, TOKEN_STYLES } from '@/lib/ui';
import { IconAction } from './IconAction';
import { formatDateRange, formatNameList } from './momentsApi';

/**
 * A moment at a glance.
 *
 * The photos inside are the reason anyone opens one, so they are the cover: up
 * to four arranged as a mosaic, with the heading and its context sitting below
 * on a calm white surface rather than over the top of the images. Media leads,
 * chrome stays restrained (Design System §7).
 *
 * The subject is not printed here. A card is only ever seen inside its own
 * folder, so naming the subject on every card in a grid of one subject is a
 * label that repeats what the page title already said.
 *
 * Editing and deleting live here rather than on the moment itself: they act on
 * the card as a whole, and doing them from the list means you never have to open
 * a moment just to correct its heading or throw it away.
 */
export function MomentCard({
  moment,
  to,
  onEdit,
  onDelete,
}: {
  moment: MomentCollectionDto;
  to: string;
  /** Both are given only when the caller may manage this moment. */
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const manageable = Boolean(onEdit && onDelete);

  return (
    // Not a <Link> wrapper: the manage buttons are interactive and may not be
    // nested inside an anchor. The heading's link is stretched across the card
    // instead, and the buttons sit above it.
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-[18px] border border-line bg-card',
        'transition-all duration-200 hover:-translate-y-0.5 hover:border-violet/40 hover:shadow-[0_12px_28px_-16px_rgba(17,22,92,0.35)]',
      )}
    >
      <Cover moment={moment} />

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-[17px] leading-snug">
          <Link
            to={to}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/60"
          >
            {moment.heading}
          </Link>
        </h3>

        {moment.description ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-ink-2">{moment.description}</p>
        ) : null}

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <CalendarRange size={13} />
            {formatDateRange(moment.startDate, moment.endDate)}
          </span>

          <div className="flex items-center justify-between gap-3 border-t border-line pt-2.5">
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-2">
              <Users size={13} className="shrink-0 text-ink-3" />
              <span className="truncate">{formatNameList(moment.studentNames)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-ink-2">
              <Images size={13} className="text-ink-3" />
              {moment.entryCount}
            </span>
          </div>
        </div>
      </div>

      {manageable ? (
        <div className="hover-actions absolute right-2 top-2 z-10 flex gap-1">
          <IconAction label={`Edit ${moment.heading}`} onClick={onEdit!}>
            <Pencil size={14} />
          </IconAction>
          <IconAction label={`Delete ${moment.heading}`} onClick={onDelete!} danger>
            <Trash2 size={14} />
          </IconAction>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The moment's own picture.
 *
 * This used to be a mosaic assembled from the children's entry photos, which put
 * private per-child photographs into browse chrome. It is now the one cover the
 * author chose — and when they chose none, a tinted panel in the subject's
 * colour rather than a grey box: "no cover yet" should look deliberate, not
 * broken.
 */
function Cover({ moment }: { moment: MomentCollectionDto }) {
  const token = asToken(moment.subject.colorToken);

  if (!moment.coverPhotoUrl) {
    return (
      <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-lavender-2">
        <span
          aria-hidden
          className={cn(
            'absolute -right-8 -top-10 h-36 w-36 rounded-full opacity-[0.18] blur-2xl',
            TOKEN_STYLES[token].bar,
          )}
        />
        <span
          aria-hidden
          className={cn(
            'absolute -bottom-12 -left-6 h-32 w-32 rounded-full opacity-[0.12] blur-2xl',
            TOKEN_STYLES[token].bar,
          )}
        />
        <span className={cn('relative flex flex-col items-center gap-1.5', TOKEN_STYLES[token].text)}>
          <Images size={26} />
          <span className="text-[11px] font-medium">No cover image</span>
        </span>
      </div>
    );
  }

  return (
    <div className="aspect-[16/10] overflow-hidden bg-lavender">
      <img
        src={moment.coverPhotoUrl}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
      />
    </div>
  );
}
