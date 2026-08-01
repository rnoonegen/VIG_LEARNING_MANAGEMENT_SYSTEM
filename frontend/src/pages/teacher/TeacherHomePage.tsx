import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays } from 'lucide-react';
import type { TeacherHomeDto } from '@vig/shared';
import { formatShortDate } from '@vig/shared';
import { get } from '@/lib/api';
import { Section } from '@/components/ui/Layout';
import { Card } from '@/components/ui/Card';
import { AllClear, EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { OccurrenceRow } from '@/components/OccurrenceRow';

/**
 * Teacher Home is a work queue for the day, not a dashboard (Flow 05).
 *
 * What is on, what still needs a record, what is coming — so the next action is
 * obvious without searching a general calendar.
 */
export function TeacherHomePage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['home', 'teacher'],
    queryFn: () => get<TeacherHomeDto>('/home/teacher'),
  });

  if (isLoading) return <LoadingState rows={5} label="Loading today's classes" />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <div>
      <header className="mb-7">
        <h1>Good morning, {data.greetingName.split(' ')[0]}</h1>
        <p className="mt-1.5 text-sm text-ink-2">{data.today}</p>
      </header>

      {data.recordsDue.length > 0 ? (
        <Section title="Class records due">
          <div className="flex flex-col gap-2">
            {data.recordsDue.map((occurrence) => (
              <OccurrenceRow
                key={occurrence.id}
                occurrence={occurrence}
                to={`/teacher/class/${occurrence.id}`}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-2">
            These classes have finished but have no saved record yet. Each closes at 9:00 AM the morning
            after the class.
          </p>
        </Section>
      ) : null}

      {/* Missed records are not a work queue — the deadline has gone and the
          classes cannot be written up. The count is the message. */}
      {data.missedRecords.total > 0 ? (
        <Section title="Missed class records">
          <Card tone="warning">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <AlertTriangle size={16} className="shrink-0 text-warning" />
              {data.missedRecords.total} {data.missedRecords.total === 1 ? 'class was' : 'classes were'}{' '}
              never recorded
            </p>
            <p className="mt-1 text-xs text-ink-2">
              The deadline passed on {data.missedRecords.total === 1 ? 'this class' : 'these classes'}, so
              they can no longer be recorded. Your administrator has been notified.
            </p>

            <ul className="mt-3 flex flex-col gap-1.5">
              {data.missedRecords.recent.map((o) => (
                <li key={o.id} className="flex justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-ink">
                    {o.subjectName} · {o.levelName}
                  </span>
                  <span className="shrink-0 text-ink-3">
                    {formatShortDate(new Date(o.scheduledStart))}
                  </span>
                </li>
              ))}
              {data.missedRecords.total > data.missedRecords.recent.length ? (
                <li className="text-xs text-ink-3">
                  and {data.missedRecords.total - data.missedRecords.recent.length} more
                </li>
              ) : null}
            </ul>
          </Card>
        </Section>
      ) : null}

      <Section title="Today">
        {data.todaysClasses.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={26} />}
            title="No classes scheduled today"
            description="Everything is in order."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {data.todaysClasses.map((occurrence) => (
              <OccurrenceRow
                key={occurrence.id}
                occurrence={occurrence}
                to={`/teacher/class/${occurrence.id}`}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Upcoming">
        {data.upcoming.length === 0 ? (
          <AllClear title="You're all caught up" description="Nothing else scheduled this week." />
        ) : (
          <div className="flex flex-col gap-2">
            {data.upcoming.map((occurrence) => (
              <OccurrenceRow key={occurrence.id} occurrence={occurrence} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
