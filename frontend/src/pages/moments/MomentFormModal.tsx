import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { MomentCollectionDto } from '@vig/shared';
import { toDateKey } from '@vig/shared';
import { errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { asToken, cn, TOKEN_STYLES } from '@/lib/ui';
import { useCreateMoment, useMomentSubjects, useUpdateMoment } from './momentsApi';

/**
 * Opening a moment, or editing the frame around one already open.
 *
 * The subject list is whatever the caller may file under — every subject for an
 * admin, only the ones they were given to teach for a teacher (BR-05). It is
 * fetched rather than filtered here, so the rule lives in one place.
 */
export function MomentFormModal({
  moment,
  onClose,
  onCreated,
}: {
  /** Present when editing; absent when opening a new moment. */
  moment?: MomentCollectionDto;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const today = toDateKey(new Date());
  const [heading, setHeading] = useState(moment?.heading ?? '');
  const [description, setDescription] = useState(moment?.description ?? '');
  const [startDate, setStartDate] = useState(moment?.startDate ?? today);
  const [endDate, setEndDate] = useState(moment?.endDate ?? today);
  const [subjectId, setSubjectId] = useState(moment?.subject.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const { data: subjects, isLoading: loadingSubjects } = useMomentSubjects();
  const create = useCreateMoment();
  const update = useUpdateMoment(moment?.id ?? '');
  const saving = create.isPending || update.isPending;

  const datesValid = endDate >= startDate;
  const ready = heading.trim().length > 0 && subjectId !== '' && datesValid && !saving;

  const submit = async () => {
    setError(null);
    const body = {
      heading: heading.trim(),
      description: description.trim() || undefined,
      startDate,
      endDate,
      subjectId,
    };

    try {
      if (moment) {
        await update.mutateAsync({ ...body, description: description.trim() || null });
      } else {
        const created = await create.mutateAsync(body);
        onCreated?.(created.id);
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={moment ? 'Edit moment' : 'New moment'}
      description={
        moment
          ? 'Change the heading, the dates or the subject this moment sits under.'
          : 'Frame the moment first. You add the children one at a time once it exists.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={!ready}
            icon={saving ? <Loader2 size={15} className="animate-spin" /> : undefined}
          >
            {saving ? 'Saving…' : moment ? 'Save changes' : 'Create moment'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Heading" htmlFor="moment-heading" required error={error}>
          <Input
            id="moment-heading"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            placeholder="Ganesh Chaturthi craft week"
            maxLength={140}
            autoFocus
          />
        </Field>

        <Field
          label="Description"
          htmlFor="moment-description"
          hint="Optional. What was this about, and why does it matter?"
        >
          <Textarea
            id="moment-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="The children shaped their own idols and wrote about what the festival means at home."
            maxLength={2000}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" htmlFor="moment-start" required>
            <Input
              id="moment-start"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                // A start pushed past the end drags the end with it, rather than
                // leaving the form in a state it will only complain about later.
                if (e.target.value > endDate) setEndDate(e.target.value);
              }}
            />
          </Field>

          <Field
            label="End date"
            htmlFor="moment-end"
            required
            error={datesValid ? null : 'The end date cannot be before the start date'}
          >
            <Input
              id="moment-end"
              type="date"
              min={startDate}
              value={endDate}
              invalid={!datesValid}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Subject"
          required
          hint={
            loadingSubjects
              ? 'Loading the subjects you can use…'
              : subjects && subjects.length === 0
                ? 'You have not been assigned a subject yet, so a moment cannot be filed.'
                : undefined
          }
        >
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Subject">
            {subjects?.map((subject) => {
              const token = asToken(subject.colorToken);
              const active = subjectId === subject.id;
              return (
                <button
                  key={subject.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSubjectId(subject.id)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors',
                    active
                      ? TOKEN_STYLES[token].chip
                      : 'border-line bg-card text-ink-2 hover:bg-lavender-2',
                  )}
                >
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', TOKEN_STYLES[token].dot)} />
                  {subject.name}
                  {active ? <Check size={13} strokeWidth={3} /> : null}
                </button>
              );
            })}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
