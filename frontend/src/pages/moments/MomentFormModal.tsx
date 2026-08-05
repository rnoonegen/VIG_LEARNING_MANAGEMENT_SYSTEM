import { useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import type { MomentCollectionDto } from '@vig/shared';
import { toDateKey } from '@vig/shared';
import { errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { cn } from '@/lib/ui';
import { uploadMomentPhoto, useCreateMoment, useUpdateMoment } from './momentsApi';

/**
 * Opening a moment, or editing the frame around one already open.
 *
 * There is no folder picker. A new moment is only ever opened from inside a
 * folder, so the folder is already chosen — asking again would be asking the
 * user to repeat where they are standing. An existing moment keeps the folder it
 * was filed in; moving one between subjects is not something this form does.
 *
 * Whether the caller may file under that folder at all is still checked by the
 * API (BR-05 for a teacher, admin-only for Others), so the rule lives in one
 * place rather than being enforced by which chips got rendered.
 */
export function MomentFormModal({
  moment,
  folderId,
  onClose,
  onCreated,
}: {
  /** Present when editing; absent when opening a new moment. */
  moment?: MomentCollectionDto;
  /** The folder being created in. Required when opening a new moment. */
  folderId?: string;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const today = toDateKey(new Date());
  const [heading, setHeading] = useState(moment?.heading ?? '');
  const [description, setDescription] = useState(moment?.description ?? '');
  const [startDate, setStartDate] = useState(moment?.startDate ?? today);
  const [endDate, setEndDate] = useState(moment?.endDate ?? today);
  const [error, setError] = useState<string | null>(null);

  // An already-saved cover shows its signed URL; a newly chosen one shows the
  // local file, because the bucket is private and has no public preview.
  const [cover, setCover] = useState<string | null>(moment?.coverPhotoUrl ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const create = useCreateMoment();
  const update = useUpdateMoment(moment?.id ?? '');
  const saving = create.isPending || update.isPending || uploading;

  const datesValid = endDate >= startDate;
  const ready = heading.trim().length > 0 && datesValid && !saving;

  const chooseFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file for the cover.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('That image is larger than 10 MB. Choose a smaller one.');
      return;
    }
    setError(null);
    setPendingFile(file);
    setCover(URL.createObjectURL(file));
  };

  const submit = async () => {
    setError(null);
    const body = {
      heading: heading.trim(),
      description: description.trim() || undefined,
      startDate,
      endDate,
    };

    try {
      // The bytes go straight to the private bucket, and only the path it comes
      // back with is sent on to the API (AD-04).
      let coverPath: string | null | undefined;
      if (pendingFile) {
        setUploading(true);
        coverPath = await uploadMomentPhoto(pendingFile);
        setUploading(false);
      } else if (moment && !cover) {
        coverPath = null; // Cleared during this edit.
      }

      if (moment) {
        // No subjectId: editing changes the frame, never where it is filed.
        await update.mutateAsync({
          ...body,
          description: description.trim() || null,
          ...(coverPath !== undefined ? { coverPath } : {}),
        });
      } else {
        const created = await create.mutateAsync({
          ...body,
          subjectId: folderId,
          coverPath: coverPath ?? undefined,
        });
        onCreated?.(created.id);
      }
      onClose();
    } catch (err) {
      setUploading(false);
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
          ? 'Change the heading, the description or the dates this moment covers.'
          : 'Frame the moment first. You add the children to it once it exists.'
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
            {uploading
              ? 'Uploading…'
              : saving
                ? 'Saving…'
                : moment
                  ? 'Save changes'
                  : 'Create moment'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* The cover is the moment's own picture. It is what the card shows —
            the children's entry photos stay inside their own entries (023). */}
        <Field label="Cover image" hint="Optional. One image, up to 10 MB. This is what the moment's card shows.">
          {cover ? (
            <div className="relative overflow-hidden rounded-[12px] border border-line">
              <img src={cover} alt="" className="aspect-[16/9] w-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  setCover(null);
                  setPendingFile(null);
                }}
                aria-label="Remove cover image"
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-navy/60 text-white backdrop-blur transition-colors hover:bg-danger"
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            <label
              className={cn(
                'flex aspect-[16/9] cursor-pointer flex-col items-center justify-center gap-2 rounded-[12px]',
                'border border-dashed border-line bg-lavender-2 text-center transition-colors hover:border-violet/50 hover:bg-lavender',
              )}
            >
              <ImagePlus size={22} className="text-violet" />
              <span className="text-xs font-medium text-ink">Choose a cover image</span>
              <span className="text-[11px] text-ink-3">JPEG, PNG or WebP</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  chooseFile(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </Field>

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

      </div>
    </Modal>
  );
}
