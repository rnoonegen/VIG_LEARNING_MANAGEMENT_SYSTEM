import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { CurriculumLevelDto, CurriculumSubjectDto, HeadingDto } from '@vig/shared';
import { formatShortDate, SCHOOL_TIMEZONE } from '@vig/shared';
import { errorMessage, get, patch, post } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Field';
import { SubjectBadge } from '@/components/ui/Chip';

/**
 * The whole curriculum on one page.
 *
 * Subject → four levels → headings → sub-headings, each layer expandable in
 * place. The previous four drill-down pages hid the one thing that matters when
 * you are writing a curriculum: the shape of what is already there.
 *
 * Who may write what is decided by the API and arrives with the data —
 * `canRename` for structure, `canAuthor` per level for content — so a teacher is
 * never shown a button that would be refused.
 */
export function CurriculumTree({ scope }: { scope: 'all' | 'mine' }) {
  const queryClient = useQueryClient();
  const [addingSubject, setAddingSubject] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['curriculum', 'tree', scope],
    queryFn: () =>
      get<CurriculumSubjectDto[]>('/curriculum/tree', scope === 'mine' ? { mine: true } : undefined),
  });

  const isAdmin = scope === 'all';

  return (
    <div>
      <PageHeader
        title="Curriculum"
        description={
          isAdmin
            ? 'Each subject has four levels. Headings and sub-headings under a level are written by you or by the teacher assigned to it.'
            : 'The subjects you teach. Add the headings and sub-headings you cover, and they become what you tick students off against.'
        }
        action={
          isAdmin ? (
            <Button icon={<Plus size={16} />} onClick={() => setAddingSubject(true)}>
              Add Subject
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : data && data.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={26} />}
          title={isAdmin ? 'Build your curriculum' : 'No subjects assigned to you yet'}
          description={
            isAdmin
              ? 'Add a subject and it arrives with four levels ready to fill in. Everything else — what a teacher can teach, where a student is, what gets ticked off in class — builds on this.'
              : 'Once an administrator assigns you a subject, its levels appear here for you to fill in.'
          }
          action={
            isAdmin ? (
              <Button icon={<Plus size={16} />} onClick={() => setAddingSubject(true)}>
                Add Your First Subject
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {data?.map((subject) => (
            <SubjectCard key={subject.id} subject={subject} scope={scope} />
          ))}
        </div>
      )}

      {addingSubject ? (
        <AddSubjectModal
          onClose={() => setAddingSubject(false)}
          onCreated={async () => {
            await queryClient.invalidateQueries({ queryKey: ['curriculum'] });
            setAddingSubject(false);
          }}
        />
      ) : null}
    </div>
  );
}

function SubjectCard({ subject, scope }: { subject: CurriculumSubjectDto; scope: 'all' | 'mine' }) {
  // A teacher opens on their own subject; an admin scanning several starts closed.
  const [open, setOpen] = useState(scope === 'mine');
  const [renaming, setRenaming] = useState(false);

  const subHeadingCount = subject.levels.reduce(
    (sum, level) => sum + level.headings.reduce((n, h) => n + h.subHeadings.length, 0),
    0,
  );

  return (
    <Card padded={false}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="touch-target flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown size={16} className="shrink-0 text-ink-3" />
          ) : (
            <ChevronRight size={16} className="shrink-0 text-ink-3" />
          )}
          <span className="min-w-0">
            <SubjectBadge name={subject.name} colorToken={subject.colorToken} />
            <span className="mt-0.5 block text-xs text-ink-2">
              {subject.levels.length} levels · {subHeadingCount} sub-headings
              {subject.teacherNames.length > 0 ? ` · ${subject.teacherNames.join(', ')}` : ' · no teacher assigned'}
            </span>
          </span>
        </button>

        {subject.canRename ? (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            aria-label={`Rename ${subject.name}`}
            className="touch-target flex items-center justify-center rounded-full text-ink-3 hover:bg-lavender hover:text-violet"
          >
            <Pencil size={14} />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="border-t border-line px-4 py-3">
          <div className="flex flex-col gap-2">
            {subject.levels.map((level) => (
              <LevelBlock key={level.id} level={level} canRename={subject.canRename} />
            ))}
          </div>
        </div>
      ) : null}

      {renaming ? (
        <RenameModal
          title="Rename subject"
          label="Subject name"
          current={subject.name}
          url={`/curriculum/subjects/${subject.id}`}
          onClose={() => setRenaming(false)}
        />
      ) : null}
    </Card>
  );
}

function LevelBlock({ level, canRename }: { level: CurriculumLevelDto; canRename: boolean }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);

  const subHeadingCount = level.headings.reduce((n, h) => n + h.subHeadings.length, 0);

  return (
    <div className="rounded-[12px] border border-line">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="touch-target flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown size={14} className="shrink-0 text-ink-3" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-ink-3" />
          )}
          <span className="text-sm font-medium text-ink">{level.name}</span>
          <span className="text-xs text-ink-2">
            {level.headings.length} {level.headings.length === 1 ? 'heading' : 'headings'} ·{' '}
            {subHeadingCount} sub
          </span>
        </button>

        {canRename ? (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            aria-label={`Rename ${level.name}`}
            className="touch-target flex items-center justify-center rounded-full text-ink-3 hover:bg-lavender hover:text-violet"
          >
            <Pencil size={13} />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="border-t border-line px-3 py-3">
          {level.headings.length === 0 ? (
            <p className="mb-3 text-xs text-ink-3">
              Nothing here yet. A heading is a chunk of the level; sub-headings are what a student is
              ticked off against.
            </p>
          ) : (
            <ul className="mb-3 flex flex-col gap-2">
              {level.headings.map((heading) => (
                <HeadingRow key={heading.id} heading={heading} canAuthor={level.canAuthor} />
              ))}
            </ul>
          )}

          {level.canAuthor ? (
            <Button variant="secondary" size="sm" icon={<Plus size={13} />} onClick={() => setAdding(true)}>
              Add Heading
            </Button>
          ) : (
            <p className="text-xs text-ink-3">Only the teacher assigned to this level can add to it.</p>
          )}
        </div>
      ) : null}

      {renaming ? (
        <RenameModal
          title="Rename level"
          label="Level name"
          current={level.name}
          url={`/curriculum/levels/${level.id}`}
          onClose={() => setRenaming(false)}
        />
      ) : null}

      {adding ? (
        <AddEntryModal
          title="Add heading"
          label="Heading"
          description={`A section of ${level.name}. Sub-headings go underneath it.`}
          placeholder="Fractions"
          url={`/curriculum/levels/${level.id}/topics`}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}

function HeadingRow({ heading, canAuthor }: { heading: HeadingDto; canAuthor: boolean }) {
  // Collapses like a subject and a level do, so a long level reads as a list of
  // headings rather than a wall of every sub-heading at once.
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const count = heading.subHeadings.length;

  return (
    <li className="rounded-[10px] bg-lavender-2 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          {open ? (
            <ChevronDown size={13} className="mt-1 shrink-0 text-ink-3" />
          ) : (
            <ChevronRight size={13} className="mt-1 shrink-0 text-ink-3" />
          )}
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">{heading.name}</span>
            <span className="text-[11px] text-ink-2">
              {count} {count === 1 ? 'sub-heading' : 'sub-headings'}
            </span>
            <Stamp entry={heading} />
          </span>
        </button>

        {canAuthor ? (
          <>
            <button
              type="button"
              onClick={() => setRenaming(true)}
              aria-label={`Rename ${heading.name}`}
              className="touch-target flex items-center justify-center rounded-full text-ink-3 hover:text-violet"
            >
              <Pencil size={13} />
            </button>
            <ArchiveButton kind="topics" id={heading.id} label={heading.name} />
          </>
        ) : null}
      </div>

      {open ? (
        <>
          {count > 0 ? (
            <ul className="mt-2 flex flex-col gap-1 border-l border-line pl-3">
              {heading.subHeadings.map((sub) => (
                <li key={sub.id} className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink">{sub.name}</span>
                    <Stamp entry={sub} />
                  </span>
                  {canAuthor ? <ArchiveButton kind="skills" id={sub.id} label={sub.name} /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-ink-3">
              No sub-headings yet. These are what a student is ticked off against.
            </p>
          )}

          {canAuthor ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-violet hover:underline"
            >
              <Plus size={12} />
              Add sub-heading
            </button>
          ) : null}
        </>
      ) : null}

      {adding ? (
        <AddEntryModal
          title="Add sub-heading"
          label="Sub-heading"
          description={`Under ${heading.name}. This is what a teacher ticks a student off against.`}
          placeholder="Adding unlike denominators"
          url={`/curriculum/topics/${heading.id}/skills`}
          // Stay open afterwards, so what was just added is visible.
          onClose={() => {
            setAdding(false);
            setOpen(true);
          }}
        />
      ) : null}

      {renaming ? (
        <RenameModal
          title="Rename heading"
          label="Heading"
          current={heading.name}
          url={`/curriculum/topics/${heading.id}`}
          onClose={() => setRenaming(false)}
        />
      ) : null}
    </li>
  );
}

/** Who wrote this, and when — the trace the school asked for. */
function Stamp({ entry }: { entry: { addedByName: string | null; addedAt: string } }) {
  return (
    <span className="mt-0.5 block text-[11px] text-ink-3">
      {entry.addedByName ? `Added by ${entry.addedByName}` : 'Added'} ·{' '}
      {/* createdAt — a real instant, so it renders in the school's timezone. */}
      {formatShortDate(new Date(entry.addedAt), SCHOOL_TIMEZONE)}
    </span>
  );
}

/** Archiving, not deleting: a student may already be ticked against it (BR-17). */
function ArchiveButton({ kind, id, label }: { kind: 'topics' | 'skills'; id: string; label: string }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const archive = useMutation({
    mutationFn: () => post(`/curriculum/${kind}/${id}/archive`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['curriculum'] });
      setConfirming(false);
    },
  });

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${label}`}
        className="touch-target flex items-center justify-center rounded-full text-ink-3 hover:text-danger"
      >
        <Trash2 size={13} />
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => archive.mutate()}
        disabled={archive.isPending}
        aria-label={`Confirm removing ${label}`}
        className="touch-target flex items-center justify-center rounded-full text-danger hover:bg-danger-bg"
      >
        <Check size={14} />
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        aria-label="Cancel"
        className="touch-target flex items-center justify-center rounded-full text-ink-3 hover:text-ink"
      >
        <X size={14} />
      </button>
    </span>
  );
}

function AddSubjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => post('/curriculum/subjects', { name: name.trim() }),
    onSuccess: onCreated,
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Add subject"
      description="It arrives with four levels — Valmiki, Vasishta, Vishwamitra, Vishwakarma — which you can rename."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            {create.isPending ? 'Adding…' : 'Add Subject'}
          </Button>
        </>
      }
    >
      <Field
        label="Subject name"
        htmlFor="subject-name"
        required
        error={error}
        hint="For example: Mathematics, English, Science, Telugu."
      >
        <Input
          id="subject-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mathematics"
          autoFocus
        />
      </Field>
    </Modal>
  );
}

function AddEntryModal({
  title,
  label,
  description,
  placeholder,
  url,
  onClose,
}: {
  title: string;
  label: string;
  description: string;
  placeholder: string;
  url: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Adding several in a row is the normal case when writing a curriculum.
  const [addedCount, setAddedCount] = useState(0);

  const create = useMutation({
    mutationFn: () => post(url, { name: name.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['curriculum'] });
      setAddedCount((n) => n + 1);
      setName('');
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {addedCount > 0 ? 'Done' : 'Cancel'}
          </Button>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            {create.isPending ? 'Adding…' : 'Add'}
          </Button>
        </>
      }
    >
      <Field
        label={label}
        htmlFor="curriculum-entry"
        required
        error={error}
        hint={addedCount > 0 ? `${addedCount} added. Keep typing to add another.` : undefined}
      >
        <Input
          id="curriculum-entry"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) create.mutate();
          }}
          placeholder={placeholder}
          autoFocus
        />
      </Field>
    </Modal>
  );
}

function RenameModal({
  title,
  label,
  current,
  url,
  onClose,
}: {
  title: string;
  label: string;
  current: string;
  url: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => patch(url, { name: name.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['curriculum'] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!name.trim() || name.trim() === current || save.isPending}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <Field label={label} htmlFor="rename-entry" required error={error}>
        <Input
          id="rename-entry"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim() && name.trim() !== current) save.mutate();
          }}
          autoFocus
        />
      </Field>
    </Modal>
  );
}

/** Shared by the admin and teacher routes; only the scope differs. */
export const AdminCurriculumPage = () => <CurriculumTree scope="all" />;
export const TeacherCurriculumPage = () => <CurriculumTree scope="mine" />;
