import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDays, Check, ChevronRight, CircleDashed } from 'lucide-react';
import type { AdminHomeDto } from '@vig/shared';
import { get } from '@/lib/api';
import { useAuth } from '@/app/AuthProvider';
import { Card } from '@/components/ui/Card';
import { Section } from '@/components/ui/Layout';
import { AllClear, EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { ButtonLink } from '@/components/ui/Button';
import { AttentionCard } from '@/components/AttentionCard';
import { OccurrenceRow } from '@/components/OccurrenceRow';
import { cn } from '@/lib/ui';

/**
 * Admin Home is an operational summary, not a dashboard of statistics (Flow 01).
 * Today's classes, what is blocking them, and — while the school is still being
 * set up — the next step in dependency order.
 */
export function AdminHomePage() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['home', 'admin'],
    queryFn: () => get<AdminHomeDto>('/home/admin'),
  });

  if (isLoading) return <LoadingState rows={5} label="Loading your school overview" />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <div>
      <header className="mb-7">
        <h1>Good morning, {data.greetingName.split(' ')[0]}</h1>
        <p className="mt-1.5 text-sm text-ink-2">{data.today}</p>
      </header>

      {!data.setupComplete ? <SetupChecklist steps={data.setupSteps} /> : null}

      <Section title="Needs Attention">
        {data.attention.length === 0 ? (
          <AllClear
            title="Everything looks good"
            description="No scheduling or setup issues need your attention."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {data.attention.map((issue) => (
              <AttentionCard key={issue.groupKey} issue={issue} />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Today"
        action={
          <Link to="/admin/schedule" className="text-xs font-medium text-violet hover:underline">
            View full schedule →
          </Link>
        }
      >
        {data.todaysClasses.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={26} />}
            title="No classes scheduled today"
            description="Everything is in order."
            action={
              user?.role === 'ADMIN' ? (
                <ButtonLink to="/admin/schedule/new" variant="secondary" size="sm">
                  Schedule a class
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {data.todaysClasses.map((occurrence) => (
              <OccurrenceRow
                key={occurrence.id}
                occurrence={occurrence}
                to={`/admin/schedule?date=${occurrence.scheduledStart.slice(0, 10)}`}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/**
 * Setup runs in dependency order: Curriculum → Teachers → Students → Schedule
 * (F11). The next incomplete step is the one highlighted, because a scheduling
 * screen with no curriculum is not a screen worth reaching.
 */
function SetupChecklist({ steps }: { steps: AdminHomeDto['setupSteps'] }) {
  const nextIndex = steps.findIndex((s) => !s.complete);

  return (
    <Card className="mb-8" tone="lavender">
      <div className="mb-4">
        <h2 className="text-lg">Let's get started</h2>
        <p className="mt-1 text-sm text-ink-2">
          Set up the essentials so classes can begin. Follow this order for the smoothest setup.
        </p>
      </div>

      <ol className="flex flex-col gap-2">
        {steps.map((step, index) => {
          const isNext = index === nextIndex;
          return (
            <li key={step.key}>
              <Link
                to={step.actionHref}
                className={cn(
                  'touch-target flex items-center gap-3 rounded-[12px] border px-4 py-3 transition-colors',
                  step.complete
                    ? 'border-success/25 bg-success-bg'
                    : isNext
                      ? 'border-violet bg-card'
                      : 'border-line bg-card opacity-70',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    step.complete ? 'bg-success text-white' : isNext ? 'bg-violet text-white' : 'bg-lavender text-violet',
                  )}
                >
                  {step.complete ? <Check size={14} strokeWidth={3} /> : index + 1}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{step.title}</span>
                  <span className="block truncate text-xs text-ink-2">{step.description}</span>
                </span>

                {step.complete ? (
                  <span className="shrink-0 text-xs font-medium text-success">Set up</span>
                ) : isNext ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-violet">
                    {step.actionLabel}
                    <ChevronRight size={14} />
                  </span>
                ) : (
                  <CircleDashed size={16} className="shrink-0 text-ink-3" />
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
