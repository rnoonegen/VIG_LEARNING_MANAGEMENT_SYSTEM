import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Download, Heart, Image as ImageIcon, Sparkles } from 'lucide-react';
import type { WeeklyUpdateDto } from '@vig/shared';
import { formatShortDate } from '@vig/shared';
import { get } from '@/lib/api';
import { PageHeader, Tabs } from '@/components/ui/Layout';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/States';

type Tab = 'overview' | 'learning' | 'development' | 'moments';

/**
 * The weekly update — a parent-friendly story assembled from the week's approved
 * class records, not a raw dump of every teacher note (Flow 02).
 *
 * Everything shown here has already been saved and approved by a teacher; a
 * parent never sees a draft (BR-13).
 */
export function WeeklyUpdatePage() {
  const { updateId = '' } = useParams();
  const [tab, setTab] = useState<Tab>('overview');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['weekly-update', updateId],
    queryFn: () => get<WeeklyUpdateDto>(`/parent/weekly-updates/${updateId}`),
  });

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        backTo="/parent"
        backLabel="Back to Home"
        title={`${data.studentName.split(' ')[0]}'s Week`}
        description={`${formatShortDate(new Date(data.weekStart))} – ${formatShortDate(new Date(data.weekEnd))}`}
        action={<DownloadPdfButton update={data} />}
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'learning', label: 'Learning', count: data.learning.length },
          { key: 'development', label: 'Development', count: data.development.length },
          { key: 'moments', label: 'Moments', count: data.moments.length },
        ]}
      />

      {tab === 'overview' ? (
        <>
          <Card className="mb-4" tone="lavender">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet text-white">
                <Sparkles size={16} />
              </span>
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-violet">
                  This week at a glance
                </p>
                <p className="text-sm leading-relaxed text-ink">{data.summaryText}</p>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <HighlightCard
              icon={<BookOpen size={15} className="text-success" />}
              title="Learning highlights"
              items={data.learning.map((i) => i.highlightText)}
              empty="No learning updates were recorded this week."
            />
            <HighlightCard
              icon={<Heart size={15} className="text-pink" />}
              title="Development highlights"
              items={data.development.map((i) => i.highlightText)}
              empty="No development observations were recorded this week."
            />
          </div>

          {data.teacherNote ? (
            <Card className="mt-4" tone="success">
              <CardHeader title="Teacher's note" />
              <p className="text-sm leading-relaxed text-ink">{data.teacherNote}</p>
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'learning' ? (
        <Card>
          <CardHeader
            title="Learning this week"
            description="The academically meaningful changes teachers approved."
          />
          {data.learning.length === 0 ? (
            <p className="text-sm text-ink-2">No learning updates this week.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {data.learning.map((item) => (
                <li key={item.id} className="border-l-2 border-success/40 pl-3 text-sm text-ink">
                  {item.highlightText}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === 'development' ? (
        <Card>
          <CardHeader
            title="Development this week"
            description="Evidence and context, rather than a score."
          />
          {data.development.length === 0 ? (
            <p className="text-sm text-ink-2">No development observations this week.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {data.development.map((item) => (
                <li key={item.id} className="border-l-2 border-pink/40 pl-3 text-sm text-ink">
                  {item.highlightText}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === 'moments' ? (
        data.moments.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 py-10 text-center">
            <ImageIcon size={24} className="text-violet" />
            <p className="text-sm text-ink-2">No moments were captured this week.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.moments.map((moment) => (
              <Card key={moment.id} padded={false} className="overflow-hidden">
                {moment.media[0]?.url ? (
                  <img src={moment.media[0].url} alt="" className="aspect-[4/3] w-full object-cover" />
                ) : null}
                <div className="px-3 py-2.5">
                  <p className="truncate text-xs font-medium text-ink">{moment.title}</p>
                  <p className="truncate text-[11px] text-ink-3">
                    {formatShortDate(new Date(moment.capturedOn))}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

/**
 * Download PDF (F18).
 *
 * react-pdf is pulled in on click, not on page load — it is far larger than the
 * page itself and most visits never download.
 */
function DownloadPdfButton({ update }: { update: WeeklyUpdateDto }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download() {
    setBusy(true);
    setFailed(false);
    try {
      const { renderWeeklyUpdatePdf, pdfFilename } = await import('./weeklyUpdatePdf');
      const blob = await renderWeeklyUpdatePdf(update);

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = pdfFilename(update);
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking immediately can race the download in Safari; a tick is enough.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('[weekly-update] PDF generation failed', error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <Button variant="secondary" size="sm" icon={<Download size={14} />} disabled={busy} onClick={download}>
        {busy ? 'Preparing…' : 'Download PDF'}
      </Button>
      {failed ? <p className="mt-1 text-[11px] text-danger">Could not create the PDF.</p> : null}
    </div>
  );
}

function HighlightCard({
  icon,
  title,
  items,
  empty,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <Card>
      <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-2">
        {icon}
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-ink-2">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.slice(0, 5).map((text, index) => (
            <li key={index} className="text-sm leading-relaxed text-ink">
              {text}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
