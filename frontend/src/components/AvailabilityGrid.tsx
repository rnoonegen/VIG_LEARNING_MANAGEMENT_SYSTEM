import { Plus, X } from 'lucide-react';
import { WEEKDAY_LABELS, formatTime12h, toMinutes, type AvailabilitySlotDto } from '@vig/shared';
import { Input, Toggle } from '@/components/ui/Field';

export interface TimeWindow {
  startTime: string;
  endTime: string;
}

export interface DayAvailability {
  weekday: number;
  /** Empty means "not available that day". */
  windows: TimeWindow[];
}

type Slot = Pick<AvailabilitySlotDto, 'weekday' | 'startTime' | 'endTime'>;

/** Monday-first, matching the school week. */
function schoolWeekOrder(a: number, b: number): number {
  return ((a + 6) % 7) - ((b + 6) % 7);
}

/** Turns the API's flat slot list into a full seven-day editable week. */
export function toDayRows(slots: Slot[]): DayAvailability[] {
  return WEEKDAY_LABELS.map((_, weekday) => ({
    weekday,
    windows: slots
      .filter((s) => s.weekday === weekday)
      .map((s) => ({ startTime: s.startTime, endTime: s.endTime }))
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)),
  }));
}

/** Back to the flat list the API stores — one row per window, not per day. */
export function fromDayRows(rows: DayAvailability[]): Slot[] {
  return rows.flatMap((r) => r.windows.map((w) => ({ weekday: r.weekday, ...w })));
}

/**
 * What is wrong with the week, in the words the person editing it would use.
 *
 * Overlaps would be merged silently by the scheduler, and a backwards window
 * would be rejected by the API — both are better said here, before saving.
 */
export function availabilityProblems(rows: DayAvailability[]): string[] {
  const problems: string[] = [];

  for (const row of [...rows].sort((a, b) => schoolWeekOrder(a.weekday, b.weekday))) {
    const day = WEEKDAY_LABELS[row.weekday];
    const sorted = [...row.windows].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

    if (sorted.some((w) => toMinutes(w.endTime) <= toMinutes(w.startTime))) {
      problems.push(`${day}: a time must end after it starts.`);
    }

    for (let i = 1; i < sorted.length; i += 1) {
      if (toMinutes(sorted[i]!.startTime) < toMinutes(sorted[i - 1]!.endTime)) {
        problems.push(`${day}: two times overlap.`);
        break;
      }
    }
  }

  return problems;
}

/** A sensible next window: an hour after the last one ends, or 09:00–11:00. */
function nextWindow(windows: TimeWindow[]): TimeWindow {
  const last = [...windows].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)).at(-1);
  if (!last) return { startTime: '09:00', endTime: '11:00' };

  const start = Math.min(toMinutes(last.endTime) + 60, 22 * 60);
  const end = Math.min(start + 120, 23 * 60 + 59);
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { startTime: hhmm(start), endTime: hhmm(end) };
}

/**
 * The weekly availability editor, shared by teachers and students.
 *
 * A day holds as many windows as the person actually has — Monday 9–11 and
 * 12–1 is two windows, not one long morning — because the gap between them is
 * time no class may be scheduled in.
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
  const setWindows = (weekday: number, windows: TimeWindow[]) => {
    onChange(rows.map((r) => (r.weekday === weekday ? { ...r, windows } : r)));
  };

  const ordered = [...rows].sort((a, b) => schoolWeekOrder(a.weekday, b.weekday));

  return (
    <div className="flex flex-col gap-2">
      {ordered.map((row) => {
        const available = row.windows.length > 0;
        const label = WEEKDAY_LABELS[row.weekday];

        return (
          <div key={row.weekday} className="rounded-[12px] border border-line bg-card px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-[120px] items-center gap-3">
                <Toggle
                  checked={available}
                  onChange={(next) => setWindows(row.weekday, next ? [nextWindow([])] : [])}
                  label={`${label} availability`}
                  disabled={disabled}
                />
                <span className="text-sm font-medium text-ink">{label}</span>
              </div>

              {available ? null : <span className="flex-1 text-xs text-ink-3">Not available</span>}
            </div>

            {available ? (
              <div className="mt-2.5 flex flex-col gap-2 sm:pl-[132px]">
                {row.windows.map((window, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={window.startTime}
                      onChange={(e) =>
                        setWindows(
                          row.weekday,
                          row.windows.map((w, i) => (i === index ? { ...w, startTime: e.target.value } : w)),
                        )
                      }
                      disabled={disabled}
                      aria-label={`${label} start time ${index + 1}`}
                      className="max-w-[130px]"
                    />
                    <span className="text-xs text-ink-3">to</span>
                    <Input
                      type="time"
                      value={window.endTime}
                      onChange={(e) =>
                        setWindows(
                          row.weekday,
                          row.windows.map((w, i) => (i === index ? { ...w, endTime: e.target.value } : w)),
                        )
                      }
                      disabled={disabled}
                      aria-label={`${label} end time ${index + 1}`}
                      className="max-w-[130px]"
                    />

                    {/* Removing the last window is how a day becomes unavailable,
                        so the toggle and this button never disagree. */}
                    <button
                      type="button"
                      onClick={() => setWindows(row.weekday, row.windows.filter((_, i) => i !== index))}
                      disabled={disabled}
                      aria-label={`Remove ${label} time ${index + 1}`}
                      className="touch-target flex items-center justify-center rounded-full text-ink-3 hover:bg-danger-bg hover:text-danger disabled:hover:bg-transparent disabled:hover:text-ink-3"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}

                {!disabled ? (
                  <button
                    type="button"
                    onClick={() => setWindows(row.weekday, [...row.windows, nextWindow(row.windows)])}
                    className="flex items-center gap-1.5 self-start rounded-[10px] px-1 py-1 text-xs font-medium text-violet hover:underline"
                  >
                    <Plus size={13} />
                    Add another time on {label}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The same week, read-only — for whoever is looking at availability they do not
 * own. It reads as a statement rather than a disabled form, because it is one.
 */
export function AvailabilitySummary({ slots }: { slots: Slot[] }) {
  const rows = toDayRows(slots);

  return (
    <ul className="flex flex-col gap-2">
      {[...rows]
        .sort((a, b) => schoolWeekOrder(a.weekday, b.weekday))
        .map((row) => (
          <li
            key={row.weekday}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] border border-line px-3 py-2.5"
          >
            <span className="min-w-[100px] text-sm font-medium text-ink">
              {WEEKDAY_LABELS[row.weekday]}
            </span>

            {row.windows.length === 0 ? (
              <span className="text-xs text-ink-3">Not available</span>
            ) : (
              <span className="flex flex-wrap gap-1.5">
                {row.windows.map((w, index) => (
                  <span
                    key={index}
                    className="rounded-full bg-lavender-2 px-2.5 py-1 text-xs font-medium text-ink-2"
                  >
                    {formatTime12h(w.startTime)} – {formatTime12h(w.endTime)}
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
    </ul>
  );
}
