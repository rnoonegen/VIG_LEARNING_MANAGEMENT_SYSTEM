import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { ParentHomeDto } from '@vig/shared';
import { formatShortDate } from '@vig/shared';
import { get } from '@/lib/api';
import { Avatar, Section } from '@/components/ui/Layout';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { ButtonLink } from '@/components/ui/Button';
import { SkillStatusChip, StageChip, SubjectBadge } from '@/components/ui/Chip';
import { useAuth } from '@/app/AuthProvider';
import { useSelectedChild } from './useChild';
import { ChildSwitcher } from './ChildSwitcher';

/**
 * Parent Home is a concise summary of one child, not a wall of school data
 * (Flow 11). Everything here links into a deeper section; nothing here is a
 * draft, and there is no schedule.
 */
export function ParentHomePage() {
  const { user } = useAuth();
  const { children, child: selected, select } = useSelectedChild();

  const { data, isLoading, isError, refetch } = useQuery({
    // Home is per-child, so the selection is part of the key — switching child
    // refetches rather than showing the previous child's summary.
    queryKey: ['parent', 'home', selected?.id],
    queryFn: () => get<ParentHomeDto>('/parent/home', selected ? { childId: selected.id } : undefined),
    enabled: Boolean(selected),
  });

  if (!selected) return <LoadingState rows={5} />;

  // The switcher stays mounted while the newly chosen child loads — blanking the
  // control you just used is disorienting, and it makes switching back harder
  // than it should be.
  const header = (
    <>
      <header className="mb-6">
        <h1>Good morning, {user?.fullName.split(' ')[0]}</h1>
      </header>
      <ChildSwitcher children={children} selectedId={selected.id} onSelect={select} />
    </>
  );

  if (isLoading) {
    return (
      <div>
        {header}
        <LoadingState rows={4} />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div>
        {header}
        <ErrorState onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div>
      {header}

      {/* Child card. The subjects are here because a parent's first question is
          "what is my child studying?" — and a subject the school adds later has
          to show up without waiting for progress to be recorded against it. */}
      <Card className="mb-5" tone="lavender">
        <div className="flex items-center gap-3.5">
          <Avatar name={data.child.fullName} url={data.child.avatarUrl} size={52} />
          <div className="min-w-0">
            <p className="text-base font-semibold text-ink">{data.child.fullName}</p>
            <p className="text-xs text-ink-2">{data.child.gradeLabel ?? 'Student'}</p>
          </div>
        </div>

        {data.child.subjectLevels.length > 0 ? (
          <div className="mt-4 border-t border-violet/20 pt-3.5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet">Studying</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {data.child.subjectLevels.map((sl) => (
                <SubjectBadge
                  key={sl.subjectId}
                  name={sl.subjectName}
                  colorToken={sl.colorToken}
                  sublabel={sl.levelName}
                />
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      {/* Weekly update CTA — the one thing we ask a parent to come back for. */}
      <Section title="This week">
        {data.latestWeeklyUpdate ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  <Sparkles size={15} className="text-violet" />
                  {data.child.fullName.split(' ')[0]}'s weekly update is ready
                </p>
                <p className="mt-0.5 text-xs text-ink-2">
                  {formatShortDate(new Date(data.latestWeeklyUpdate.weekStart))} –{' '}
                  {formatShortDate(new Date(data.latestWeeklyUpdate.weekEnd))}
                </p>
              </div>
              <ButtonLink
                to={`/parent/weekly-updates/${data.latestWeeklyUpdate.id}`}
                size="sm"
                icon={<ArrowRight size={14} />}
              >
                View Weekly Update
              </ButtonLink>
            </div>
          </Card>
        ) : (
          <EmptyState
            title="No weekly update yet"
            description="Your first weekly update will arrive once classes have been recorded."
          />
        )}
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Recently covered" />
          {data.learningNow.length === 0 ? (
            <p className="text-sm text-ink-2">
              Nothing recorded yet. This fills in as teachers tick off what has been covered in class.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.learningNow.map((item, index) => (
                <li key={index} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <SubjectBadge name={item.subjectName} colorToken={item.colorToken} />
                    <span className="mt-0.5 block truncate text-xs text-ink-2">{item.skillName}</span>
                  </span>
                  <SkillStatusChip status={item.status} />
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/parent/learning"
            className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-violet hover:underline"
          >
            View all Learning <ArrowRight size={13} />
          </Link>
        </Card>

        <Card>
          <CardHeader title="Development snapshot" />
          {data.developmentSnapshot.length === 0 ? (
            <p className="text-sm text-ink-2">No development observations yet.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {data.developmentSnapshot.map((item) => (
                <li key={item.areaName} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink">{item.areaName}</span>
                  <StageChip stage={item.stage} />
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/parent/development"
            className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-violet hover:underline"
          >
            View all Development <ArrowRight size={13} />
          </Link>
        </Card>
      </div>

      {data.recentMoment ? (
        <Section title="Recent moment" className="mt-8">
          <Card padded={false} className="overflow-hidden">
            {data.recentMoment.media[0]?.url ? (
              <img
                src={data.recentMoment.media[0].url}
                alt=""
                className="aspect-[16/9] w-full object-cover"
              />
            ) : null}
            <div className="p-4">
              <p className="text-sm font-medium text-ink">{data.recentMoment.title}</p>
              <p className="mt-0.5 text-xs text-ink-2">
                {formatShortDate(new Date(data.recentMoment.capturedOn))}
                {data.recentMoment.subjectName ? ` · ${data.recentMoment.subjectName}` : ''}
              </p>
              <Link
                to="/parent/moments"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet hover:underline"
              >
                View all Moments <ArrowRight size={13} />
              </Link>
            </div>
          </Card>
        </Section>
      ) : null}
    </div>
  );
}
