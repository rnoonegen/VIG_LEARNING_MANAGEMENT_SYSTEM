import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Image as ImageIcon, Play } from 'lucide-react';
import type { MomentDto } from '@vig/shared';
import { formatShortDate } from '@vig/shared';
import { get } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Pill, SubjectBadge } from '@/components/ui/Chip';

/**
 * Moments are photos and videos with educational context, not a generic school
 * feed (Flow 12). Every tile keeps its subject, date and class so a parent knows
 * what they are looking at.
 *
 * Media is the focal point here, so the surrounding chrome stays restrained
 * (Design System §7).
 */
export function MomentsGrid({
  endpoint,
  emptyTitle = 'No moments yet',
  emptyDescription = 'Photos and videos from classes will appear here.',
  emptyAction,
}: {
  endpoint: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}) {
  const [open, setOpen] = useState<MomentDto | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['moments', endpoint],
    queryFn: () => get<MomentDto[]>(endpoint),
  });

  if (isLoading) return <LoadingState rows={3} />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;
  if (data.length === 0) {
    return (
      <EmptyState
        icon={<ImageIcon size={26} />}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data.map((moment) => {
          const cover = moment.media[0];
          return (
            <button
              key={moment.id}
              type="button"
              onClick={() => setOpen(moment)}
              className="group overflow-hidden rounded-[16px] border border-line bg-card text-left"
            >
              <span className="relative block aspect-[4/3] overflow-hidden bg-lavender">
                {cover?.url ? (
                  cover.isVideo ? (
                    <>
                      <video src={cover.url} className="h-full w-full object-cover" muted playsInline />
                      <span className="absolute inset-0 flex items-center justify-center bg-navy/20">
                        <Play size={26} className="text-white" fill="white" />
                      </span>
                    </>
                  ) : (
                    <img
                      src={cover.url}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                    />
                  )
                ) : (
                  <span className="flex h-full items-center justify-center text-violet">
                    <ImageIcon size={24} />
                  </span>
                )}

                {moment.subjectName ? (
                  <span className="absolute left-2 top-2">
                    <Pill token={moment.colorToken ?? 'violet'}>{moment.subjectName}</Pill>
                  </span>
                ) : null}
              </span>

              <span className="block px-3 py-2.5">
                <span className="block truncate text-xs font-medium text-ink">{moment.title}</span>
                <span className="block truncate text-[11px] text-ink-3">
                  {formatShortDate(new Date(moment.capturedOn))} ·{' '}
                  {moment.students.map((s) => s.fullName.split(' ')[0]).join(', ')}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {open ? <MomentDetail moment={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function MomentDetail({ moment, onClose }: { moment: MomentDto; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} wide title={moment.title}>
      <div className="flex flex-col gap-4">
        {moment.media.map((media) =>
          media.isVideo ? (
            <video key={media.id} src={media.url} controls className="w-full rounded-[12px] bg-navy" />
          ) : (
            <img key={media.id} src={media.url} alt="" className="w-full rounded-[12px]" />
          ),
        )}

        <Card padded={false} className="p-4">
          {moment.subjectName ? (
            <div className="mb-2">
              <SubjectBadge name={moment.subjectName} colorToken={moment.colorToken} />
            </div>
          ) : null}

          {moment.caption ? <p className="text-sm text-ink">{moment.caption}</p> : null}

          <dl className="mt-3 flex flex-col gap-1.5 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">Date</dt>
              <dd className="text-ink">{formatShortDate(new Date(moment.capturedOn))}</dd>
            </div>
            {moment.classContext ? (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">Class</dt>
                <dd className="text-ink">{moment.classContext}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">Added by</dt>
              <dd className="text-ink">{moment.createdByName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">Students</dt>
              <dd className="text-right text-ink">{moment.students.map((s) => s.fullName).join(', ')}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </Modal>
  );
}
