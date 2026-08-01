/**
 * When a class may be recorded.
 *
 * A class record is written once, close to the class it describes. Opening at the
 * class's start time stops a record being filed for a class that has not happened;
 * closing the next morning stops one being reconstructed from memory a week later,
 * which is the point at which "what was covered" stops being evidence and starts
 * being guesswork (BR-01).
 *
 * Pure and I/O-free so the boundary conditions — a late class, the moment the
 * cutoff passes — are unit-tested rather than reasoned about.
 */

/** School-local hour the morning after the class, when recording closes. */
export const RECORD_CUTOFF_HOUR = 9;

/**
 * The shortest and longest a window can be, used to narrow database queries
 * before the exact rule is applied per row. A class starting at 23:59 closes
 * just over 9 hours later; one starting at 00:00 closes 33 hours later.
 */
export const MIN_WINDOW_MS = RECORD_CUTOFF_HOUR * 60 * 60 * 1000;
export const MAX_WINDOW_MS = (24 + RECORD_CUTOFF_HOUR) * 60 * 60 * 1000;

export type RecordWindowState = 'NOT_YET_OPEN' | 'OPEN' | 'CLOSED';

export interface RecordWindow {
  opensAt: Date;
  closesAt: Date;
}

/**
 * Clock times are stored as school-local wall clock in UTC fields throughout
 * (BR-20), so the cutoff is applied in the same frame the class was scheduled in.
 */
export function recordWindow(scheduledStart: Date): RecordWindow {
  const closesAt = new Date(scheduledStart);
  closesAt.setUTCDate(closesAt.getUTCDate() + 1);
  closesAt.setUTCHours(RECORD_CUTOFF_HOUR, 0, 0, 0);
  return { opensAt: new Date(scheduledStart), closesAt };
}

export function recordWindowState(scheduledStart: Date, now: Date): RecordWindowState {
  const { opensAt, closesAt } = recordWindow(scheduledStart);
  if (now < opensAt) return 'NOT_YET_OPEN';
  // The cutoff is exclusive: at exactly 09:00 the window has closed.
  return now < closesAt ? 'OPEN' : 'CLOSED';
}

/**
 * The states a teacher's own class record can be in, saved included.
 *
 * SAVED outranks the window: a record already written is done, whether or not
 * there is time left on the clock (BR-19 — one record per class).
 */
export type RecordState = RecordWindowState | 'SAVED';

export function recordState(
  scheduledStart: Date,
  classRecordStatus: string | null | undefined,
  now: Date,
): RecordState {
  if (classRecordStatus === 'SAVED') return 'SAVED';
  return recordWindowState(scheduledStart, now);
}

/** Human phrasing for the deadline, e.g. "9:00 AM on Sat 1 Aug". */
export function describeDeadline(closesAt: Date): string {
  const hour = closesAt.getUTCHours();
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const minutes = String(closesAt.getUTCMinutes()).padStart(2, '0');
  return `${twelve}:${minutes} ${suffix}`;
}
