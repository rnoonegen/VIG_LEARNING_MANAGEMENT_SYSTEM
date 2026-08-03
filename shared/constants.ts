/**
 * Single-source constants for meaning-carrying colour and copy.
 *
 * Design System §8 requires a stable mapping: a user must never encounter the
 * same colour meaning "Mastered" in one view and "Needs Support" in another.
 * Every status chip, badge and legend in the app reads from these maps.
 */

import type {
  AttendanceStatus,
  DevCategory,
  DevStage,
  NotificationType,
  Role,
  SkillStatus,
} from './enums.js';

/** Semantic colour tokens defined in frontend/src/styles/tokens.css. */
export type SemanticToken = 'violet' | 'orange' | 'blue' | 'green' | 'pink' | 'red' | 'navy' | 'muted';

/**
 * Subject → colour. Taken from the supplied boards (Design System §8).
 * Subjects created beyond these four fall back to `DEFAULT_SUBJECT_COLOR`.
 */
export const SUBJECT_COLORS: Record<string, SemanticToken> = {
  Mathematics: 'violet',
  English: 'orange',
  Science: 'blue',
  Telugu: 'green',
};

export const DEFAULT_SUBJECT_COLOR: SemanticToken = 'violet';

export function subjectColor(subjectName: string): SemanticToken {
  return SUBJECT_COLORS[subjectName] ?? DEFAULT_SUBJECT_COLOR;
}

/**
 * Coverage is a two-state question: has this child been taken through this
 * sub-heading, or not. The teacher ticks a box; there is no scale to interpret.
 *
 * The stored enum keeps four values because `learning_updates` is append-only
 * history and older rows may hold any of them — but only these two are ever
 * written now, and only these two are ever shown.
 */
export const COVERED_STATUS = 'MASTERED' as const satisfies SkillStatus;
export const NOT_COVERED_STATUS = 'TO_LEARN' as const satisfies SkillStatus;

export function isCovered(status: SkillStatus | null | undefined): boolean {
  return status === COVERED_STATUS;
}

/** Learning-state → colour + label. Stable across Admin, Teacher and Parent. */
export const SKILL_STATUS_META: Record<
  SkillStatus,
  { label: string; color: SemanticToken; icon: string }
> = {
  TO_LEARN: { label: 'Not yet covered', color: 'muted', icon: 'circle' },
  // Retained for history written before coverage became two-state.
  LEARNING: { label: 'In progress', color: 'blue', icon: 'play' },
  NEEDS_SUPPORT: { label: 'Needs support', color: 'orange', icon: 'alert' },
  MASTERED: { label: 'Covered', color: 'green', icon: 'check' },
};

export const DEV_STAGE_META: Record<DevStage, { label: string; color: SemanticToken; icon: string }> = {
  EMERGING: { label: 'Emerging', color: 'pink', icon: 'sprout' },
  DEVELOPING: { label: 'Developing', color: 'orange', icon: 'trend' },
  CONSISTENT: { label: 'Consistent', color: 'green', icon: 'check' },
};

export const ATTENDANCE_META: Record<
  AttendanceStatus,
  { label: string; color: SemanticToken; short: string }
> = {
  PRESENT: { label: 'Present', color: 'green', short: 'P' },
  ABSENT: { label: 'Absent', color: 'red', short: 'A' },
  LATE: { label: 'Late', color: 'orange', short: 'L' },
};

export const DEV_CATEGORY_LABELS: Record<DevCategory, string> = {
  PERSONALITY: 'Personality',
  EMOTIONAL: 'Emotional',
  PHYSICAL: 'Physical',
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  TEACHER: 'Teacher',
  PARENT: 'Parent',
};

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  WEEKLY_UPDATE_READY: 'Weekly update ready',
  SCHEDULE_CHANGED: 'Schedule changed',
  // Covers both readings: a record still owed, and one whose deadline passed.
  // The title carries which; a label saying "due" under "missed 1 class record"
  // contradicts it.
  CLASS_RECORD_DUE: 'Class record',
  AVAILABILITY_CONFLICT: 'Availability conflict',
  TEACHER_AVAILABILITY_CHANGE: 'Teacher availability change',
  STUDENT_AVAILABILITY_CHANGE: 'Student availability change',
  INCOMPLETE_SETUP: 'Incomplete setup',
  PASSWORD_RESET_REQUEST: 'Password reset request',
  LEAVE_REQUESTED: 'Leave request',
  LEAVE_DECIDED: 'Leave request answered',
};

/** Weekday index → label. Index 0 is Sunday, matching Date#getDay(). */
export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Development areas seeded from the supplied boards (Q11 default: seeded but
 * admin-editable).
 */
export const SEED_DEVELOPMENT_AREAS: Array<{
  category: DevCategory;
  name: string;
  description: string;
}> = [
  {
    category: 'PERSONALITY',
    name: 'Confidence',
    description: 'Willingness to attempt, present and stand behind their own thinking.',
  },
  {
    category: 'PERSONALITY',
    name: 'Independence',
    description: 'Starting and sustaining work without prompting.',
  },
  {
    category: 'PERSONALITY',
    name: 'Curiosity',
    description: 'Asking questions and exploring beyond what was set.',
  },
  {
    category: 'EMOTIONAL',
    name: 'Self-regulation',
    description: 'Managing frustration and staying with difficult tasks.',
  },
  {
    category: 'EMOTIONAL',
    name: 'Resilience',
    description: 'Recovering from mistakes and trying again.',
  },
  {
    category: 'EMOTIONAL',
    name: 'Communication',
    description: 'Expressing ideas and needs clearly to adults and peers.',
  },
  {
    category: 'PHYSICAL',
    name: 'Collaboration',
    description: 'Working alongside others during group and practical activities.',
  },
];

/** Minimum touch target required by Design System §10, in pixels. */
export const MIN_TOUCH_TARGET_PX = 44;
