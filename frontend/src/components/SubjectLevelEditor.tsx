import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import type { SubjectDto } from '@vig/shared';
import { get } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';

export interface SubjectLevelDraft {
  subjectId: string;
  levelId: string;
}

/**
 * What a child studies and where they are in it, shared by the Add Student wizard
 * and the admin's Manage Student editor.
 *
 * The curriculum grows after a child is enrolled — a subject added later has to be
 * addable to an existing student, not only to a new one (BR-07). One editor for
 * both entry points is what keeps that true.
 */
export function SubjectLevelEditor({
  value,
  onChange,
  subjects,
}: {
  value: SubjectLevelDraft[];
  onChange: (next: SubjectLevelDraft[]) => void;
  subjects: SubjectDto[];
}) {
  const taken = value.map((v) => v.subjectId);
  const unused = subjects.filter((s) => !taken.includes(s.id));

  return (
    <div className="flex flex-col gap-3">
      {value.map((row, index) => (
        <SubjectLevelRow
          key={`${row.subjectId}-${index}`}
          row={row}
          // A subject already on the list is not offered again, so a child cannot
          // end up on two levels of the same subject.
          options={subjects.filter((s) => s.id === row.subjectId || !taken.includes(s.id))}
          onChange={(next) => onChange(value.map((v, i) => (i === index ? next : v)))}
          onRemove={() => onChange(value.filter((_, i) => i !== index))}
        />
      ))}

      {unused.length > 0 ? (
        <div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => onChange([...value, { subjectId: unused[0]!.id, levelId: '' }])}
          >
            Add subject
          </Button>
        </div>
      ) : null}

      {subjects.length === 0 ? (
        <p className="rounded-[12px] bg-warning-bg px-3 py-2.5 text-xs text-ink-2">
          There are no subjects in the curriculum yet. Add one under Curriculum first.
        </p>
      ) : value.length === 0 ? (
        <p className="rounded-[12px] bg-warning-bg px-3 py-2.5 text-xs text-ink-2">
          A student needs at least one subject before they can be scheduled.
        </p>
      ) : null}
    </div>
  );
}

function SubjectLevelRow({
  row,
  options,
  onChange,
  onRemove,
}: {
  row: SubjectLevelDraft;
  options: SubjectDto[];
  onChange: (next: SubjectLevelDraft) => void;
  onRemove: () => void;
}) {
  // The list endpoint carries only a level count; the levels themselves come from
  // the single-subject read.
  const { data: subject, isLoading } = useQuery({
    queryKey: ['curriculum', 'subject', row.subjectId],
    queryFn: () => get<SubjectDto>(`/curriculum/subjects/${row.subjectId}`),
    enabled: Boolean(row.subjectId),
  });

  const levels = subject?.levels ?? [];

  // A subject archived after this student was assigned to it is no longer in the
  // active list, but it is still what they are on — so it stays selectable rather
  // than silently becoming a blank row.
  const selectable = options.some((s) => s.id === row.subjectId) || !subject ? options : [...options, subject];

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[12px] border border-line p-3">
      <div className="min-w-[150px] flex-1">
        <Field label="Subject">
          <Select
            value={row.subjectId}
            aria-label="Subject"
            // Changing the subject clears the level: a level belongs to one
            // subject, so the old choice cannot carry over.
            onChange={(e) => onChange({ subjectId: e.target.value, levelId: '' })}
          >
            {selectable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="min-w-[150px] flex-1">
        <Field
          label="Current level"
          error={!isLoading && levels.length === 0 ? 'This subject has no levels yet.' : null}
        >
          <Select
            value={row.levelId}
            aria-label="Current level"
            invalid={!row.levelId}
            onChange={(e) => onChange({ ...row, levelId: e.target.value })}
          >
            <option value="">{isLoading ? 'Loading…' : 'Select…'}</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove subject"
        className="touch-target mb-1 flex items-center justify-center rounded-full text-ink-3 hover:bg-danger-bg hover:text-danger"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
