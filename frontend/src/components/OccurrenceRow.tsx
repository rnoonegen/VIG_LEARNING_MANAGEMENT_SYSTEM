import { Link } from 'react-router-dom';
import { ChevronRight, Users } from 'lucide-react';
import type { OccurrenceDto } from '@vig/shared';
import { formatInstantTime } from '@vig/shared';
import { asToken, cn, TOKEN_STYLES } from '@/lib/ui';
import { Pill } from '@/components/ui/Chip';

/**
 * One class in a timetable. Used on Admin Home, Teacher Home and the day view —
 * the same row everywhere so a class reads identically wherever it appears.
 */
export function OccurrenceRow({ occurrence, to }: { occurrence: OccurrenceDto; to?: string }) {
  const token = asToken(occurrence.colorToken);

  const body = (
    <>
      <div className="w-[68px] shrink-0 text-xs font-medium text-ink-2">
        {formatInstantTime(new Date(occurrence.scheduledStart))}
      </div>

      <span className={cn('h-8 w-1 shrink-0 rounded-full', TOKEN_STYLES[token].bar)} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {occurrence.subjectName}
          <span className="ml-2 text-xs font-normal text-ink-3">{occurrence.levelName}</span>
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink-2">
          <Users size={12} className="shrink-0" />
          {occurrence.studentNames.join(', ') || 'No students'} · {occurrence.teacherName}
        </p>
      </div>

      {occurrence.hasClassRecord ? (
        <Pill token="green">Complete</Pill>
      ) : occurrence.status === 'CANCELLED' ? (
        <Pill token="muted">Cancelled</Pill>
      ) : null}

      {to ? <ChevronRight size={16} className="shrink-0 text-ink-3" /> : null}
    </>
  );

  const className =
    'flex w-full items-center gap-3 rounded-[12px] border border-line bg-card px-3 py-3 text-left';

  if (!to) return <div className={className}>{body}</div>;

  return (
    <Link to={to} className={cn(className, 'touch-target transition-colors hover:bg-lavender-2')}>
      {body}
    </Link>
  );
}
