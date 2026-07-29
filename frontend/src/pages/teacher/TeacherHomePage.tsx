import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import type { TeacherHomeDto } from '@vig/shared';
import { get } from '@/lib/api';
import { Section } from '@/components/ui/Layout';
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
            These classes have finished but have no saved record yet.
          </p>
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
