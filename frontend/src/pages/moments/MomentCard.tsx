import { Link } from 'react-router-dom';
import { CalendarRange, Images, Users } from 'lucide-react';
import type { MomentCollectionDto } from '@vig/shared';
import { asToken, cn, TOKEN_STYLES } from '@/lib/ui';
import { formatDateRange, formatNameList } from './momentsApi';

/**
 * A moment at a glance.
 *
 * The photos inside are the reason anyone opens one, so they are the cover: up
 * to four arranged as a mosaic, with the heading and its context sitting below
 * on a calm white surface rather than over the top of the images. Media leads,
 * chrome stays restrained (Design System §7).
 */
export function MomentCard({ moment, to }: { moment: MomentCollectionDto; to: string }) {
  const token = asToken(moment.subject.colorToken);

  return (
    <Link
      to={to}
      className={cn(
        'group flex flex-col overflow-hidden rounded-[18px] border border-line bg-card',
        'transition-all duration-200 hover:-translate-y-0.5 hover:border-violet/40 hover:shadow-[0_12px_28px_-16px_rgba(17,22,92,0.35)]',
      )}
    >
      <Cover moment={moment} />

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', TOKEN_STYLES[token].dot)} />
          <span className={TOKEN_STYLES[token].text}>{moment.subject.name}</span>
        </span>

        <h3 className="line-clamp-2 text-[17px] leading-snug">{moment.heading}</h3>

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
    </Link>
  );
}

/**
 * The mosaic.
 *
 * One photo fills the frame; two split it; three or more give the first the left
 * half and stack the rest down the right. An empty moment still needs a cover,
 * so it gets a tinted panel in the subject's colour rather than a grey box —
 * "nothing added yet" should look deliberate, not broken.
 */
function Cover({ moment }: { moment: MomentCollectionDto }) {
  const photos = moment.previewPhotoUrls;
  const token = asToken(moment.subject.colorToken);

  if (photos.length === 0) {
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
          <span className="text-[11px] font-medium">Nothing added yet</span>
        </span>
      </div>
    );
  }

  const [first, ...rest] = photos;

  return (
    <div className="aspect-[16/10] overflow-hidden bg-lavender">
      {photos.length === 1 ? (
        <Photo url={first!} className="h-full w-full" />
      ) : photos.length === 2 ? (
        <div className="grid h-full grid-cols-2 gap-0.5">
          {photos.map((url, i) => (
            <Photo key={i} url={url} className="h-full w-full" />
          ))}
        </div>
      ) : (
        <div className="grid h-full grid-cols-3 gap-0.5">
          <Photo url={first!} className="col-span-2 h-full w-full" />
          <div className="grid grid-rows-2 gap-0.5">
            {rest.slice(0, 2).map((url, i) => (
              <Photo key={i} url={url} className="h-full w-full" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Photo({ url, className }: { url: string; className?: string }) {
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      className={cn('object-cover transition-transform duration-300 group-hover:scale-[1.04]', className)}
    />
  );
}
