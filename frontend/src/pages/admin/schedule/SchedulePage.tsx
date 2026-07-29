import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { OccurrenceDto } from '@vig/shared';
import { addDays, formatInstantTime, formatShortDate, startOfWeek, toDateKey, WEEKDAY_SHORT } from '@vig/shared';
import { get } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { OccurrenceRow } from '@/components/OccurrenceRow';
import { asToken, cn, TOKEN_STYLES } from '@/lib/ui';

/**
 * The operational timetable.
 *
 * Desktop gets the week at a glance; phones get a day-oriented agenda, because a
 * seven-column grid shrunk onto a phone is unreadable (Design System §11).
 */
export function SchedulePage() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'week' | 'day'>('week');

  const selectedDate = params.get('date') ?? toDateKey(new Date());
  const weekStart = useMemo(() => startOfWeek(new Date(selectedDate), 1), [selectedDate]);
  const weekEnd = addDays(weekStart, 6);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['schedule', toDateKey(weekStart)],
    queryFn: () =>
      get<OccurrenceDto[]>('/schedule', { from: toDateKey(weekStart), to: toDateKey(weekEnd) }),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, OccurrenceDto[]>();
    for (let i = 0; i < 7; i += 1) map.set(toDateKey(addDays(weekStart, i)), []);
    for (const occurrence of data ?? []) {
      const key = occurrence.scheduledStart.slice(0, 10);
      map.get(key)?.push(occurrence);
    }
    return map;
  }, [data, weekStart]);

  const shiftWeek = (delta: number) => {
    setParams({ date: toDateKey(addDays(weekStart, delta * 7)) });
  };

  return (
    <div>
      <PageHeader
        title="Schedule"
        description="Plan and manage classes across students and teachers."
        action={
          <ButtonLink to="/admin/schedule/new" icon={<Plus size={16} />}>
            Schedule Class
          </ButtonLink>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            aria-label="Previous week"
            className="touch-target flex items-center justify-center rounded-full text-ink-2 hover:bg-lavender"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[190px] text-center text-sm font-medium text-ink">
            {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
          </span>
          <button
            type="button"
            onClick={() => shiftWeek(1)}
            aria-label="Next week"
            className="touch-target flex items-center justify-center rounded-full text-ink-2 hover:bg-lavender"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setParams({ date: toDateKey(new Date()) })}>
            Today
          </Button>
          <div className="hidden rounded-[10px] border border-line p-0.5 md:flex">
            {(['week', 'day'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                className={cn(
                  'rounded-[8px] px-3 py-1.5 text-xs font-medium capitalize',
                  view === option ? 'bg-lavender text-violet' : 'text-ink-2',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<CalendarDays size={26} />}
          title="No classes this week"
          description="Schedule a class and it will appear here for everyone involved."
          action={
            <ButtonLink to="/admin/schedule/new" icon={<Plus size={16} />}>
              Schedule Class
            </ButtonLink>
          }
        />
      ) : (
        <>
          {/* Desktop week grid */}
          <div className={cn('scroll-x hidden', view === 'week' && 'md:block')}>
            <div className="grid min-w-[900px] grid-cols-7 gap-2">
              {[...byDay.entries()].map(([dateKey, occurrences], index) => {
                const isToday = dateKey === toDateKey(new Date());
                return (
                  <div key={dateKey} className="min-w-0">
                    <div
                      className={cn(
                        'mb-2 rounded-[10px] px-2 py-1.5 text-center',
                        isToday ? 'bg-lavender' : 'bg-transparent',
                      )}
                    >
                      <p className={cn('text-[11px] font-medium', isToday ? 'text-violet' : 'text-ink-3')}>
                        {WEEKDAY_SHORT[(index + 1) % 7]}
                      </p>
                      <p className={cn('text-sm font-semibold', isToday ? 'text-violet' : 'text-ink')}>
                        {new Date(dateKey).getUTCDate()}
                      </p>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {occurrences.map((occurrence) => (
                        <ClassBlock key={occurrence.id} occurrence={occurrence} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day agenda — always on mobile, and on desktop when Day is chosen */}
          <div className={cn('flex flex-col gap-5', view === 'week' && 'md:hidden')}>
            {[...byDay.entries()].map(([dateKey, occurrences]) => (
              <section key={dateKey}>
                <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-2 [font-family:var(--font-sans)]">
                  {formatShortDate(new Date(dateKey))}
                  {dateKey === toDateKey(new Date()) ? (
                    <span className="ml-2 text-violet">Today</span>
                  ) : null}
                </h2>

                {occurrences.length === 0 ? (
                  <p className="rounded-[12px] border border-dashed border-line px-4 py-3 text-xs text-ink-3">
                    No classes scheduled
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {occurrences.map((occurrence) => (
                      <OccurrenceRow key={occurrence.id} occurrence={occurrence} />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        </>
      )}

      <p className="mt-6 text-[11px] text-ink-3">All times shown in Asia/Kolkata (GMT+05:30).</p>
    </div>
  );
}

function ClassBlock({ occurrence }: { occurrence: OccurrenceDto }) {
  const token = asToken(occurrence.colorToken);
  return (
    <Card padded={false} className={cn('overflow-hidden border-l-2 p-2.5', TOKEN_STYLES[token].chip)}>
      <p className="text-[11px] font-semibold text-ink">{occurrence.subjectName}</p>
      <p className="mt-0.5 text-[10px] text-ink-2">
        {formatInstantTime(new Date(occurrence.scheduledStart))}
      </p>
      <p className="mt-0.5 truncate text-[10px] text-ink-2">
        {occurrence.studentNames.map((n) => n.split(' ')[0]).join(', ')}
      </p>
    </Card>
  );
}
