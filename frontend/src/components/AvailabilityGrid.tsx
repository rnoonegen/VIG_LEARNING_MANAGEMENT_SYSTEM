import { WEEKDAY_LABELS, type AvailabilitySlotDto } from '@vig/shared';
import { Input, Toggle } from '@/components/ui/Field';

export interface DayAvailability {
  weekday: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
}

/** Turns the API's slot list into a full seven-day editable week. */
export function toDayRows(slots: Array<Pick<AvailabilitySlotDto, 'weekday' | 'startTime' | 'endTime'>>): DayAvailability[] {
  return WEEKDAY_LABELS.map((_, weekday) => {
    const existing = slots.find((s) => s.weekday === weekday);
    return {
      weekday,
      enabled: Boolean(existing),
      startTime: existing?.startTime ?? '09:00',
      endTime: existing?.endTime ?? '15:00',
    };
  });
}

/** Only enabled days become slots; a disabled day means "not available". */
export function fromDayRows(rows: DayAvailability[]) {
  return rows
    .filter((r) => r.enabled)
    .map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime }));
}

/**
 * The weekly availability editor, shared by teachers and students.
 *
 * Availability is the boundary of possible times, not the timetable itself
 * (BR-05) — the helper text says so, because the two are easy to conflate.
 */
export function AvailabilityGrid({
  rows,
  onChange,
  disabled,
}: {
  rows: DayAvailability[];
  onChange: (rows: DayAvailability[]) => void;
  disabled?: boolean;
}) {
  const update = (weekday: number, patch: Partial<DayAvailability>) => {
    onChange(rows.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)));
  };

  // Monday-first, matching the school week.
  const ordered = [...rows].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7));

  return (
    <div className="flex flex-col gap-2">
      {ordered.map((row) => (
        <div
          key={row.weekday}
          className="flex flex-wrap items-center gap-3 rounded-[12px] border border-line bg-card px-3 py-2.5"
        >
          <div className="flex min-w-[110px] items-center gap-3">
            <Toggle
              checked={row.enabled}
              onChange={(next) => update(row.weekday, { enabled: next })}
              label={`${WEEKDAY_LABELS[row.weekday]} availability`}
              disabled={disabled}
            />
            <span className="text-sm font-medium text-ink">{WEEKDAY_LABELS[row.weekday]}</span>
          </div>

          {row.enabled ? (
            <div className="flex flex-1 items-center gap-2">
              <Input
                type="time"
                value={row.startTime}
                onChange={(e) => update(row.weekday, { startTime: e.target.value })}
                disabled={disabled}
                aria-label={`${WEEKDAY_LABELS[row.weekday]} start time`}
                className="max-w-[130px]"
              />
              <span className="text-xs text-ink-3">to</span>
              <Input
                type="time"
                value={row.endTime}
                onChange={(e) => update(row.weekday, { endTime: e.target.value })}
                disabled={disabled}
                aria-label={`${WEEKDAY_LABELS[row.weekday]} end time`}
                className="max-w-[130px]"
              />
            </div>
          ) : (
            <span className="flex-1 text-xs text-ink-3">Not available</span>
          )}
        </div>
      ))}
    </div>
  );
}
