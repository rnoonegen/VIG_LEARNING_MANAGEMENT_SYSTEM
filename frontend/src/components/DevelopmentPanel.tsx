import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { DevCategory, DevelopmentAreaDto, DevelopmentObservationDto, DevStage } from '@vig/shared';
import { DEV_CATEGORIES, DEV_CATEGORY_LABELS, DEV_STAGE_META, DEV_STAGES, formatShortDate } from '@vig/shared';
import { errorMessage, get, patch, post } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { StageChip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Tabs } from '@/components/ui/Layout';
import { cn } from '@/lib/ui';

/**
 * Development is evidence over time, not a score (BR-10).
 *
 * The stage is shown, but the observations underneath it are what explain it —
 * so the timeline, not the label, gets the visual weight.
 */
export function DevelopmentPanel({
  studentId,
  editable,
  basePath = `/students/${'{id}'}/development`,
}: {
  studentId: string;
  editable?: boolean;
  /** Parents read through /parent/students/:id/development instead. */
  basePath?: string;
}) {
  const url = basePath.replace('{id}', studentId);
  const [category, setCategory] = useState<DevCategory>('PERSONALITY');
  const [openArea, setOpenArea] = useState<DevelopmentAreaDto | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['development', studentId, url],
    queryFn: () => get<DevelopmentAreaDto[]>(url),
  });

  if (isLoading) return <LoadingState rows={4} />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  const areas = data.filter((a) => a.category === category);

  return (
    <>
      <Tabs
        active={category}
        onChange={setCategory}
        tabs={DEV_CATEGORIES.map((c) => ({
          key: c,
          label: DEV_CATEGORY_LABELS[c],
          count: data.filter((a) => a.category === c).length,
        }))}
      />

      {areas.length === 0 ? (
        <EmptyState
          title="No areas in this category yet"
          description="Development areas are defined by the school and observed over time."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {areas.map((area) => (
            <Card key={area.areaId} padded={false}>
              <button
                type="button"
                onClick={() => setOpenArea(area)}
                className="touch-target flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-lavender-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-medium text-ink">{area.name}</span>
                    <StageChip stage={area.currentStage} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-ink-2">
                    {area.latestObservation
                      ? `"${area.latestObservation.observation}"`
                      : 'No observations recorded yet.'}
                  </p>
                  {area.latestObservation ? (
                    <p className="mt-1 text-[11px] text-ink-3">
                      {formatShortDate(new Date(area.latestObservation.observedOn))} ·{' '}
                      {area.latestObservation.observerName} · {area.observationCount}{' '}
                      {area.observationCount === 1 ? 'observation' : 'observations'}
                    </p>
                  ) : null}
                </div>
              </button>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-ink-3">
        Stages reflect observations over time, not a test or a score.
      </p>

      {openArea ? (
        <AreaDetail
          studentId={studentId}
          area={openArea}
          basePath={url}
          editable={editable}
          onClose={() => setOpenArea(null)}
        />
      ) : null}
    </>
  );
}

function AreaDetail({
  studentId,
  area,
  basePath,
  editable,
  onClose,
}: {
  studentId: string;
  area: DevelopmentAreaDto;
  basePath: string;
  editable?: boolean;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['development', studentId, area.areaId],
    queryFn: () =>
      get<{ area: DevelopmentAreaDto; observations: DevelopmentObservationDto[] }>(
        `${basePath}/${area.areaId}`,
      ),
  });

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={area.name}
      description={area.description ?? undefined}
      footer={
        editable ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button icon={<Plus size={15} />} onClick={() => setAdding(true)}>
              Add Observation
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose} fullWidth>
            Close
          </Button>
        )
      }
    >
      <div className="mb-4 flex items-center justify-between gap-3 rounded-[12px] bg-lavender px-4 py-3">
        <span className="text-xs text-ink-2">Current stage</span>
        <StageChip stage={data?.area.currentStage ?? area.currentStage} />
      </div>

      {isLoading ? (
        <LoadingState rows={3} />
      ) : data && data.observations.length > 0 ? (
        <ol className="flex flex-col gap-3">
          {data.observations.map((obs) => (
            <li key={obs.id} className="border-l-2 border-lavender pl-4">
              <p className="text-sm text-ink">{obs.observation}</p>
              <p className="mt-1 text-[11px] text-ink-3">
                {formatShortDate(new Date(obs.observedOn))} · {obs.observerName}
                {obs.classContext ? ` · ${obs.classContext}` : ''}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-[12px] bg-lavender-2 px-4 py-6 text-center text-sm text-ink-2">
          No observations yet. Teacher observations from class records appear here.
        </p>
      )}

      {adding ? (
        <AddObservation
          studentId={studentId}
          areaId={area.areaId}
          basePath={basePath}
          currentStage={data?.area.currentStage ?? area.currentStage}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </Modal>
  );
}

function AddObservation({
  studentId,
  areaId,
  basePath,
  currentStage,
  onClose,
}: {
  studentId: string;
  areaId: string;
  basePath: string;
  currentStage: DevStage;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [observation, setObservation] = useState('');
  const [observedOn, setObservedOn] = useState(new Date().toISOString().slice(0, 10));
  const [stage, setStage] = useState<DevStage>(currentStage);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      await post(`${basePath}/${areaId}/observations`, { observation, observedOn });
      // The stage only moves if a human decides the evidence justifies it (BR-10).
      if (stage !== currentStage) {
        await patch(`${basePath}/${areaId}/stage`, { stage });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['development', studentId] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Add observation"
      description="Record something meaningful you actually saw."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!observation.trim() || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Observation" htmlFor="observation" required error={error}>
          <Textarea
            id="observation"
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder="Took the lead in helping a classmate understand the maths problem today."
            autoFocus
          />
        </Field>

        <Field label="Date" htmlFor="observed-on">
          <Input
            id="observed-on"
            type="date"
            value={observedOn}
            onChange={(e) => setObservedOn(e.target.value)}
          />
        </Field>

        <Field
          label="Update stage"
          hint="Optional. Only change this if the evidence genuinely justifies it."
        >
          <div className="flex flex-col gap-2">
            {DEV_STAGES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setStage(option)}
                className={cn(
                  'touch-target flex items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left',
                  stage === option ? 'border-violet bg-lavender' : 'border-line bg-card',
                )}
              >
                <StageChip stage={option} />
                <span className="text-xs text-ink-2">{DEV_STAGE_META[option].label}</span>
                {option === currentStage ? (
                  <span className="ml-auto text-[11px] text-ink-3">Current</span>
                ) : null}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
