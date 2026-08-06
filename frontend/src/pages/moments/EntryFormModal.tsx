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
import type { MomentEntryDto, MomentEntryKind } from '@vig/shared';
import { errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
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
 * Most of what happens in a class happens to several children at once: the same
 * photo, the same sentence about what they built. So the form is filled in once
 * and the children it was written for are ticked off together, with "Select all"
 * for the whole class. What that becomes is the first question on the form (024):
 *
 *   Individual  an entry each — the default, because a moment is usually a
 *               record of what one child did, and each card can then be edited
 *               or removed without disturbing anyone else's.
 *   Group       one shared entry naming everyone in it. One card in the moment,
 *               not twelve copies of the same paragraph.
 *
 * The picker follows the choice: individual picks one child and switching names
 * replaces the pick, group ticks off as many as apply. So the dropdown is not a
 * label on the same list — it changes what the list does.
 *
 * Editing a group re-opens that list with everyone currently in it ticked, since
 * the roster is the part that most often needs fixing afterwards: someone was
 * away, someone was left off. An individual entry's child stays fixed — moving a
 * write-up to another child is not an edit of it.
 *
 * Nobody is ever barred from the list. A child already written up elsewhere in
 * this moment is marked with how many other entries they are in and can still be
 * picked — one Independence Day holds their group dance, their solo speech and
 * the choir, and all three are true (025).
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

  // Individual by default: one child, one write-up is the ordinary case, and a
  // group is the deliberate choice.
  const [kind, setKind] = useState<MomentEntryKind>('INDIVIDUAL');
  const [studentIds, setStudentIds] = useState<string[]>(
    entry ? entry.students.map((s) => s.id) : [],
  );
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

  // A group's roster is editable; an individual entry's child is not. Adding
  // always picks, so the list is fetched for everything except that one case.
  const group = editing ? entry?.kind === 'GROUP' : kind === 'GROUP';
  const picking = !editing || group;
  // Exactly one child, chosen by replacement rather than by ticking — the whole
  // point of choosing "individual" over "group".
  const single = !editing && kind === 'INDIVIDUAL';

  const { data: students, isLoading: loadingStudents } = useMomentStudents(collectionId, picking);
  const add = useAddEntry(collectionId);
  const update = useUpdateEntry(collectionId);
  const saving = add.isPending || update.isPending || uploading;

  /**
   * How many *other* entries of this moment already have this child in them.
   *
   * Shown, never enforced: a child can dance in the group, speak on their own
   * and sing in the choir, and all three belong in the same moment (025). While
   * editing, the entry being edited is not "other" — it is where they already
   * are, and it is already ticked.
   */
  const alsoIn = (student: { entryIds: string[] }) =>
    student.entryIds.filter((id) => id !== entry?.id).length;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students ?? [];
    return (students ?? []).filter((s) => s.fullName.toLowerCase().includes(term));
  }, [students, search]);

  // "Select all" means everyone the search is currently showing — not the whole
  // school behind a filter the user cannot see.
  const allSelected = filtered.length > 0 && filtered.every((s) => studentIds.includes(s.id));

  const available = students?.length ?? 0;
  const hasMedia = Boolean(photo || pendingFile || videoUrl.trim());
  // Two is the floor for a group, matching the API — a group of one is an
  // individual entry, and would read as one on the card.
  const enoughStudents = picking ? studentIds.length >= (group ? 2 : 1) : true;
  const ready = enoughStudents && title.trim().length > 0 && hasMedia && !saving;

  const toggleStudent = (id: string) =>
    setStudentIds((current) => {
      // Individual: the click moves the choice rather than adding to it. Clicking
      // the chosen name again clears it, so the pick is undoable without a second
      // control.
      if (single) return current[0] === id ? [] : [id];
      return current.includes(id) ? current.filter((s) => s !== id) : [...current, id];
    });

  const toggleAll = () =>
    setStudentIds((current) =>
      allSelected
        ? current.filter((id) => !filtered.some((s) => s.id === id))
        : [...new Set([...current, ...filtered.map((s) => s.id)])],
    );

  // Switching to individual keeps the first name ticked rather than clearing the
  // list — the usual reason to switch is realising it was one child after all.
  const changeKind = (next: MomentEntryKind) => {
    setKind(next);
    if (next === 'INDIVIDUAL') setStudentIds((current) => current.slice(0, 1));
  };

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
            // The full roster, and only for a group — an individual entry's
            // child is fixed and the API refuses the field there.
            ...(group ? { studentIds } : {}),
            title: title.trim(),
            description: description.trim() || null,
            videoUrl: videoUrl.trim() || null,
            ...(photoPath !== undefined ? { photoPath } : {}),
            referenceLinks,
          },
        });
      } else {
        await add.mutateAsync({
          kind,
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
      title={
        editing
          ? entry?.kind === 'GROUP'
            ? 'Edit this group entry'
            : `Edit ${entry?.students[0]?.fullName.split(' ')[0] ?? 'this'}'s entry`
          : 'Add students'
      }
      description={
        editing
          ? group
            ? 'Add anyone who was left out, take out anyone who was not there, and change what was written.'
            : 'Who this entry belongs to is fixed. Everything else can change.'
          : group
            ? 'One entry for everyone you choose — a single card in this moment, shared by all of them.'
            : 'One child, one card. Choose Group above to write several up together.'
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
                  : group
                    ? `Add group entry${studentIds.length > 1 ? ` for ${studentIds.length}` : ''}`
                    : 'Add entry'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* --- Who --- */}
        {editing && entry && !group ? (
          <div className="flex items-center gap-3 rounded-[14px] border border-line bg-lavender-2 px-4 py-3">
            <Avatar
              name={entry.students[0]?.fullName ?? ''}
              url={entry.students[0]?.avatarUrl ?? null}
              size={38}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                {entry.students[0]?.fullName ?? 'This student'}
              </p>
              <p className="text-[11px] text-ink-3">This entry belongs to them</p>
            </div>
          </div>
        ) : (
          <>
            {/* The first question on the form, because it changes what every
                answer below it produces — including how the list behaves. */}
            {editing ? null : (
              <Field
                label="Add as"
                htmlFor="entry-kind"
                hint={
                  group
                    ? 'One entry for everyone chosen — a single card, with all their names on it.'
                    : 'One child, one card. The list below picks a single student.'
                }
              >
                <Select
                  id="entry-kind"
                  value={kind}
                  onChange={(e) => changeKind(e.target.value as MomentEntryKind)}
                >
                  <option value="INDIVIDUAL">Individual — one entry for one student</option>
                  <option value="GROUP">Group — one entry shared by everyone</option>
                </Select>
              </Field>
            )}

            <Field
              label={single ? 'Which student?' : 'Which students?'}
              required
              hint={
                loadingStudents
                  ? 'Loading students…'
                  : available === 0
                    ? 'There are no students you can add here.'
                    : group && studentIds.length < 2
                      ? editing
                        ? 'A group needs at least two students. Remove the entry instead to take it out entirely.'
                        : 'A group needs at least two students — or switch back to individual.'
                      : single
                        ? studentIds.length === 1
                          ? 'Choosing another name moves the entry to them.'
                          : `Choose one of ${available}`
                        : `${studentIds.length} selected of ${available}`
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
                      over a filtered list has to say what "all" currently means.
                      Meaningless when only one name can be chosen. */}
                  {single ? null : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={toggleAll}
                      disabled={filtered.length === 0}
                      className="shrink-0"
                    >
                      {allSelected
                        ? 'Clear all'
                        : search.trim()
                          ? `Select these ${filtered.length}`
                          : `Select all ${filtered.length}`}
                    </Button>
                  )}
                </div>

                <div
                  role={single ? 'radiogroup' : 'group'}
                  aria-label="Students in this entry"
                  className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-[12px] border border-line p-1.5"
                >
                  {filtered.map((student) => {
                    const elsewhere = alsoIn(student);
                    const active = studentIds.includes(student.id);
                    return (
                      <button
                        key={student.id}
                        type="button"
                        role={single ? 'radio' : 'checkbox'}
                        aria-checked={active}
                        onClick={() => toggleStudent(student.id)}
                        className={cn(
                          'touch-target flex items-center gap-3 rounded-[10px] border px-2.5 py-2 text-left transition-colors',
                          active
                            ? 'border-violet bg-lavender'
                            : 'border-transparent hover:bg-lavender-2',
                        )}
                      >
                        {/* Round for a single choice, square for many — the shape
                            says how many names can go in before one has. */}
                        <span
                          aria-hidden
                          className={cn(
                            'flex h-[18px] w-[18px] shrink-0 items-center justify-center border transition-colors',
                            single ? 'rounded-full' : 'rounded-[6px]',
                            active ? 'border-violet bg-violet text-white' : 'border-line bg-card',
                          )}
                        >
                          {active ? (
                            single ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            ) : (
                              <Check size={12} strokeWidth={3} />
                            )
                          ) : null}
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
                        {/* Context, not a refusal — they can be in this one too.
                            Worth saying so the author knows before they tick. */}
                        {elsewhere > 0 ? (
                          <span className="shrink-0 rounded-full bg-lavender-2 px-2 py-1 text-[10px] font-medium text-ink-3">
                            In {elsewhere} other {elsewhere === 1 ? 'entry' : 'entries'}
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

                {group && studentIds.length > 1 ? (
                  <p className="text-[11px] text-ink-3">
                    The title, photo, video and links below belong to one entry, shared by all{' '}
                    {studentIds.length}. It appears once in this moment and on each of their
                    profiles.
                  </p>
                ) : null}
              </div>
            </Field>
          </>
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
