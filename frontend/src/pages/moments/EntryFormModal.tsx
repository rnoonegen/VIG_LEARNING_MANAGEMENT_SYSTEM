import { useMemo, useState } from 'react';
import {
  Check,
  ImagePlus,
  Link2,
  Loader2,
  Plus,
  Search,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import type { MomentEntryDto } from '@vig/shared';
import { errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/Layout';
import { cn } from '@/lib/ui';
import {
  uploadMomentPhoto,
  useAddEntry,
  useMomentStudents,
  useUpdateEntry,
} from './momentsApi';

interface LinkDraft {
  label: string;
  url: string;
}

/**
 * An entry inside a moment — written once, for as many children as it applies to.
 *
 * Most of what happens in a class happens to a group: the same photo, the same
 * sentence about what they built. So the form is filled in once and the children
 * it was written for are ticked off together, with "Select all" for the whole
 * class. Each one still gets their own entry, editable on its own afterwards.
 *
 * Editing is single by design: an entry belongs to one child and never moves, so
 * editing offers everything except who it belongs to. Children already placed in
 * this moment stay visible in the list but cannot be picked — a name that
 * disappeared would read as a missing child rather than as one already written
 * up.
 */
export function EntryFormModal({
  collectionId,
  entry,
  onClose,
}: {
  collectionId: string;
  /** Present when editing an existing entry. */
  entry?: MomentEntryDto;
  onClose: () => void;
}) {
  const editing = Boolean(entry);

  const [studentIds, setStudentIds] = useState<string[]>(entry ? [entry.student.id] : []);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState(entry?.title ?? '');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [videoUrl, setVideoUrl] = useState(entry?.videoUrl ?? '');
  const [links, setLinks] = useState<LinkDraft[]>(
    entry?.referenceLinks.map((l) => ({ label: l.label ?? '', url: l.url })) ?? [],
  );

  // A photo already uploaded shows its signed URL; a newly chosen one shows the
  // local file, because the bucket is private and has no public preview.
  const [photo, setPhoto] = useState<{ path: string | null; previewUrl: string } | null>(
    entry?.photoUrl ? { path: null, previewUrl: entry.photoUrl } : null,
  );
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: students, isLoading: loadingStudents } = useMomentStudents(collectionId, !editing);
  const add = useAddEntry(collectionId);
  const update = useUpdateEntry(collectionId);
  const saving = add.isPending || update.isPending || uploading;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students ?? [];
    return (students ?? []).filter((s) => s.fullName.toLowerCase().includes(term));
  }, [students, search]);

  // "Select all" means everyone the search is currently showing who is still
  // free to add — not the whole school behind a filter the user cannot see.
  const selectable = useMemo(() => filtered.filter((s) => !s.takenByEntryId), [filtered]);
  const allSelected = selectable.length > 0 && selectable.every((s) => studentIds.includes(s.id));

  const available = (students ?? []).filter((s) => !s.takenByEntryId).length;
  const hasMedia = Boolean(photo || pendingFile || videoUrl.trim());
  const ready = studentIds.length > 0 && title.trim().length > 0 && hasMedia && !saving;

  const toggleStudent = (id: string) =>
    setStudentIds((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id],
    );

  const toggleAll = () =>
    setStudentIds((current) =>
      allSelected
        ? current.filter((id) => !selectable.some((s) => s.id === id))
        : [...new Set([...current, ...selectable.map((s) => s.id)])],
    );

  const chooseFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file for the photo.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('That photo is larger than 10 MB. Choose a smaller one.');
      return;
    }
    setError(null);
    setPendingFile(file);
    setPhoto({ path: null, previewUrl: URL.createObjectURL(file) });
  };

  const submit = async () => {
    setError(null);
    try {
      // The bytes go straight to the private bucket, and only the path it comes
      // back with is sent on to the API (AD-04).
      let photoPath: string | null | undefined;
      if (pendingFile) {
        setUploading(true);
        photoPath = await uploadMomentPhoto(pendingFile);
        setUploading(false);
      } else if (editing && !photo) {
        photoPath = null; // Cleared during this edit.
      }

      const referenceLinks = links
        .filter((l) => l.url.trim())
        .map((l) => ({ label: l.label.trim() || undefined, url: l.url.trim() }));

      if (editing && entry) {
        await update.mutateAsync({
          entryId: entry.id,
          body: {
            title: title.trim(),
            description: description.trim() || null,
            videoUrl: videoUrl.trim() || null,
            ...(photoPath !== undefined ? { photoPath } : {}),
            referenceLinks,
          },
        });
      } else {
        await add.mutateAsync({
          studentIds,
          title: title.trim(),
          description: description.trim() || undefined,
          photoPath: photoPath ?? undefined,
          videoUrl: videoUrl.trim() || undefined,
          referenceLinks,
        });
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
      wide
      title={editing ? `Edit ${entry?.student.fullName.split(' ')[0]}'s entry` : 'Add students'}
      description={
        editing
          ? 'The child an entry belongs to is fixed. Everything else can change.'
          : 'Write it up once and choose everyone it applies to — each child gets their own entry, which you can edit separately afterwards.'
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
                : editing
                  ? 'Save changes'
                  : studentIds.length > 1
                    ? `Add ${studentIds.length} entries`
                    : 'Add entry'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* --- Who --- */}
        {editing && entry ? (
          <div className="flex items-center gap-3 rounded-[14px] border border-line bg-lavender-2 px-4 py-3">
            <Avatar name={entry.student.fullName} url={entry.student.avatarUrl} size={38} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{entry.student.fullName}</p>
              <p className="text-[11px] text-ink-3">This entry belongs to them</p>
            </div>
          </div>
        ) : (
          <Field
            label="Which students?"
            required
            hint={
              loadingStudents
                ? 'Loading students…'
                : available === 0
                  ? 'Every student you can add already has an entry in this moment.'
                  : studentIds.length > 0
                    ? `${studentIds.length} selected of ${available} still to add`
                    : `${available} student${available === 1 ? '' : 's'} still to add`
            }
          >
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                  />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name"
                    className="pl-9"
                    aria-label="Search students"
                  />
                </div>

                {/* Named for what it will do next, and for how many — "Select all"
                    over a filtered list has to say what "all" currently means. */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={toggleAll}
                  disabled={selectable.length === 0}
                  className="shrink-0"
                >
                  {allSelected
                    ? 'Clear all'
                    : search.trim()
                      ? `Select these ${selectable.length}`
                      : `Select all ${selectable.length}`}
                </Button>
              </div>

              <div
                role="group"
                aria-label="Students in this entry"
                className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-[12px] border border-line p-1.5"
              >
                {filtered.map((student) => {
                  const taken = Boolean(student.takenByEntryId);
                  const active = studentIds.includes(student.id);
                  return (
                    <button
                      key={student.id}
                      type="button"
                      role="checkbox"
                      aria-checked={active}
                      disabled={taken}
                      onClick={() => toggleStudent(student.id)}
                      className={cn(
                        'touch-target flex items-center gap-3 rounded-[10px] border px-2.5 py-2 text-left transition-colors',
                        active
                          ? 'border-violet bg-lavender'
                          : taken
                            ? 'cursor-not-allowed border-transparent opacity-55'
                            : 'border-transparent hover:bg-lavender-2',
                      )}
                    >
                      {/* A box rather than a tick-when-chosen: the empty state has
                          to show that more than one name can go in. */}
                      <span
                        aria-hidden
                        className={cn(
                          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border transition-colors',
                          taken
                            ? 'border-line bg-lavender-2'
                            : active
                              ? 'border-violet bg-violet text-white'
                              : 'border-line bg-card',
                        )}
                      >
                        {active ? <Check size={12} strokeWidth={3} /> : null}
                      </span>

                      <Avatar name={student.fullName} url={student.avatarUrl} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {student.fullName}
                        </span>
                        {student.gradeLabel ? (
                          <span className="block text-[11px] text-ink-3">{student.gradeLabel}</span>
                        ) : null}
                      </span>
                      {taken ? (
                        <span className="shrink-0 rounded-full bg-lavender-2 px-2 py-1 text-[10px] font-medium text-ink-3">
                          Already added
                        </span>
                      ) : null}
                    </button>
                  );
                })}

                {!loadingStudents && filtered.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-ink-3">
                    No student matches “{search}”.
                  </p>
                ) : null}
              </div>

              {studentIds.length > 1 ? (
                <p className="text-[11px] text-ink-3">
                  The title, photo, video and links below are written once and saved to all{' '}
                  {studentIds.length} entries. You can edit any of them separately afterwards.
                </p>
              ) : null}
            </div>
          </Field>
        )}

        {/* --- Media --- */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Photo" hint="One image, up to 10 MB.">
            {photo ? (
              <div className="relative overflow-hidden rounded-[12px] border border-line">
                <img src={photo.previewUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setPhoto(null);
                    setPendingFile(null);
                  }}
                  aria-label="Remove photo"
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-navy/60 text-white backdrop-blur transition-colors hover:bg-danger"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <label
                className={cn(
                  'flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 rounded-[12px]',
                  'border border-dashed border-line bg-lavender-2 text-center transition-colors hover:border-violet/50 hover:bg-lavender',
                )}
              >
                <ImagePlus size={22} className="text-violet" />
                <span className="text-xs font-medium text-ink">Choose a photo</span>
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

          <Field
            label="Video link"
            htmlFor="entry-video"
            hint="Optional. Paste the link to a video hosted elsewhere."
          >
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Video
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                />
                <Input
                  id="entry-video"
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://…"
                  className="pl-9"
                />
              </div>
              {!hasMedia ? (
                <p className="text-[11px] text-ink-3">Add a photo or a video link — one is enough.</p>
              ) : null}
            </div>
          </Field>
        </div>

        {/* --- What happened --- */}
        <Field label="Title" htmlFor="entry-title" required>
          <Input
            id="entry-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Painted her own idol"
            maxLength={140}
          />
        </Field>

        <Field
          label="Description"
          htmlFor="entry-description"
          hint="Optional. What did they do, and what did you notice?"
        >
          <Textarea
            id="entry-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="She worked on the base for two sessions and asked to stay back to finish the detail."
            maxLength={4000}
          />
        </Field>

        {/* --- Reference links --- */}
        <Field label="Reference links" hint="Optional. Up to ten — a worksheet, a song, a recipe.">
          <div className="flex flex-col gap-2">
            {links.map((link, index) => (
              <div key={index} className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={link.label}
                  onChange={(e) =>
                    setLinks(links.map((l, i) => (i === index ? { ...l, label: e.target.value } : l)))
                  }
                  placeholder="Label (optional)"
                  className="sm:w-2/5"
                  aria-label={`Link ${index + 1} label`}
                />
                <div className="relative flex-1">
                  <Link2
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                  />
                  <Input
                    type="url"
                    value={link.url}
                    onChange={(e) =>
                      setLinks(links.map((l, i) => (i === index ? { ...l, url: e.target.value } : l)))
                    }
                    placeholder="https://…"
                    className="pl-9"
                    aria-label={`Link ${index + 1} address`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setLinks(links.filter((_, i) => i !== index))}
                  aria-label={`Remove link ${index + 1}`}
                  className="touch-target flex items-center justify-center rounded-[10px] border border-line px-3 text-ink-3 transition-colors hover:border-danger/40 hover:bg-danger-bg hover:text-danger sm:w-11"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}

            {links.length < 10 ? (
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => setLinks([...links, { label: '', url: '' }])}
                className="self-start"
              >
                Add a link
              </Button>
            ) : null}
          </div>
        </Field>

        {error ? (
          <p className="rounded-[10px] bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>
        ) : null}
      </div>
    </Modal>
  );
}
