import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, Film, ImageOff, Link2, PlayCircle, Sparkles } from 'lucide-react';
import type { StudentMomentEntryDto } from '@vig/shared';
import { Section } from '@/components/ui/Layout';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { MomentsGrid } from '@/components/MomentsGrid';
import { asToken, cn, TOKEN_STYLES } from '@/lib/ui';
import { MomentEntryDetail } from './MomentEntryCard';
import { formatDateRange, useStudentMomentEntries } from './momentsApi';

/**
 * One child's moments, on their profile.
 *
 * A profile asks a narrower question than a folder does. The folder answers
 * "what did the class do", so it shows the moment; the profile asks "what did
 * this child do", so it shows the entry that was written for them — their photo,
 * their write-up — with the moment named underneath as context rather than
 * wrapped around it.
 *
 * The child's name is deliberately absent from these cards. Every card on this
 * page is the same child, and the page is titled with their name already.
 *
 * Two things are called a moment in this system, so both are here rather than
 * one silently standing in for the other:
 *
 *   Moments        the written-up kind, read through `/students/:id/moment-entries`.
 *   Class records  photos and videos captured while a class was being recorded,
 *                  which still live in the flat gallery.
 *
 * The class-record half disappears entirely when it is empty — a second
 * "nothing here" under the first one tells a reader nothing new.
 */
export function StudentMomentsSection({
  studentId,
  /** Where a moment opens under the role doing the looking — e.g. /admin/moments. */
  momentsBasePath,
}: {
  studentId: string;
  momentsBasePath: string;
}) {
  const [open, setOpen] = useState<StudentMomentEntryDto | null>(null);
  const { data, isLoading, isError, refetch } = useStudentMomentEntries(studentId);

  return (
    <div>
      <Section title="Moments">
        {isLoading ? (
          <LoadingState rows={3} label="Loading moments" />
        ) : isError || !data ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : data.length === 0 ? (
          <EmptyState
            icon={<Sparkles size={26} />}
            title="Nothing written up yet"
            description="When a teacher writes this child into a moment, their entry will appear here — the photo, what was written, and the moment it was part of."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                momentsBasePath={momentsBasePath}
                onOpen={() => setOpen(entry)}
              />
            ))}
          </div>
        )}
      </Section>

      <MomentsGrid
        heading="From class records"
        endpoint={`/students/${studentId}/moments`}
        hideWhenEmpty
      />

      {/* Read-only: a profile is a record, and an entry is edited inside the
          moment it belongs to, where the other children it was written for are
          in view. */}
      {open ? (
        <MomentEntryDetail entry={open} canManage={false} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}

/**
 * One entry as it reads on a profile: the photo, what was written, and the
 * moment it came from.
 *
 * The moment is a link out, so it sits outside the card's own button rather than
 * nested inside it — an anchor within a button is neither valid nor reachable by
 * keyboard.
 */
function EntryCard({
  entry,
  momentsBasePath,
  onOpen,
}: {
  entry: StudentMomentEntryDto;
  momentsBasePath: string;
  onOpen: () => void;
}) {
  const token = asToken(entry.moment.subject.colorToken);

  return (
    <div className="group flex flex-col overflow-hidden rounded-[16px] border border-line bg-card transition-shadow hover:shadow-[0_12px_28px_-18px_rgba(17,22,92,0.4)]">
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
        </span>

        <span className="block px-3.5 pb-3 pt-3">
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

      {/* Where it came from. Not chrome — without it an entry on a profile is a
          photograph with no account of the week it belongs to. */}
      <div className="mt-auto flex flex-col gap-1.5 border-t border-line px-3.5 py-2.5">
        <Link
          to={`${momentsBasePath}/${entry.moment.id}`}
          className="flex items-center gap-1.5 text-[11px] font-medium text-ink-2 hover:text-violet"
        >
          <span className={cn('h-2 w-2 shrink-0 rounded-full', TOKEN_STYLES[token].dot)} />
          <span className="truncate">{entry.moment.heading}</span>
        </Link>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
          <CalendarRange size={12} />
          {formatDateRange(entry.moment.startDate, entry.moment.endDate)}
        </span>
      </div>
    </div>
  );
}
