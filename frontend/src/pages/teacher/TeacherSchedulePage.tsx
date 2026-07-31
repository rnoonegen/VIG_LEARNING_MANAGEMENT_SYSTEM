import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type { OccurrenceDto } from '@vig/shared';
import { addDays, formatShortDate, startOfWeek, toDateKey } from '@vig/shared';
import { get } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { OccurrenceRow } from '@/components/OccurrenceRow';

/**
 * A teacher's own timetable. The API scopes by teacher, so this is the same
 * schedule endpoint the admin uses with no client-side filtering.
 */
export function TeacherSchedulePage() {
  const [params, setParams] = useSearchParams();
  const selectedDate = params.get('date') ?? toDateKey(new Date());
  const weekStart = useMemo(() => startOfWeek(new Date(selectedDate), 1), [selectedDate]);
  const weekEnd = addDays(weekStart, 6);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['schedule', 'teacher', toDateKey(weekStart)],
    queryFn: () =>
      get<OccurrenceDto[]>('/schedule', { from: toDateKey(weekStart), to: toDateKey(weekEnd) }),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, OccurrenceDto[]>();
    for (let i = 0; i < 7; i += 1) map.set(toDateKey(addDays(weekStart, i)), []);
    for (const occurrence of data ?? []) {
      map.get(occurrence.scheduledStart.slice(0, 10))?.push(occurrence);
    }
    return map;
  }, [data, weekStart]);

  return (
    <div>
      <PageHeader title="My schedule" description="Classes assigned to you." />

      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setParams({ date: toDateKey(addDays(weekStart, -7)) })}
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
            onClick={() => setParams({ date: toDateKey(addDays(weekStart, 7)) })}
            aria-label="Next week"
            className="touch-target flex items-center justify-center rounded-full text-ink-2 hover:bg-lavender"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <Button variant="secondary" size="sm" onClick={() => setParams({ date: toDateKey(new Date()) })}>
          Today
        </Button>
      </div>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<CalendarDays size={26} />}
          title="No classes this week"
          description="Classes appear here once an administrator schedules them."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {[...byDay.entries()].map(([dateKey, occurrences]) =>
            occurrences.length === 0 ? null : (
              <section key={dateKey}>
                <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-2 [font-family:var(--font-sans)]">
                  {formatShortDate(new Date(dateKey))}
                  {dateKey === toDateKey(new Date()) ? <span className="ml-2 text-violet">Today</span> : null}
                </h2>
                <div className="flex flex-col gap-2">
                  {occurrences.map((occurrence) => (
                    <div key={occurrence.id} className="flex flex-col gap-1">
                      <OccurrenceRow occurrence={occurrence} to={`/teacher/class/${occurrence.id}`} />
                      {/* Ticking off coverage without reopening the whole record. */}
                      <Link
                        to={`/teacher/class/${occurrence.id}/progress`}
                        className="self-end text-xs font-medium text-violet hover:underline"
                      >
                        Mark what was covered
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            ),
          )}
        </div>
      )}
    </div>
  );
}
