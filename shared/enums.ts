/**
 * Enum values mirrored from prisma/schema.prisma.
 *
 * They are redeclared here rather than re-exported from @prisma/client so the
 * browser bundle never pulls in the Prisma runtime. The API imports these too,
 * which keeps a single spelling of every value across both sides of the wire.
 */

export const ROLES = ['ADMIN', 'TEACHER', 'PARENT'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const STUDENT_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const CURRICULUM_STATUSES = ['ACTIVE', 'REVIEW', 'ARCHIVED'] as const;
export type CurriculumStatus = (typeof CURRICULUM_STATUSES)[number];

export const SKILL_STATUSES = ['TO_LEARN', 'LEARNING', 'NEEDS_SUPPORT', 'MASTERED'] as const;
export type SkillStatus = (typeof SKILL_STATUSES)[number];

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const DEV_CATEGORIES = ['PERSONALITY', 'EMOTIONAL', 'PHYSICAL'] as const;
export type DevCategory = (typeof DEV_CATEGORIES)[number];

export const DEV_STAGES = ['EMERGING', 'DEVELOPING', 'CONSISTENT'] as const;
export type DevStage = (typeof DEV_STAGES)[number];

export const OCCURRENCE_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED'] as const;
export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];

export const CLASS_RECORD_STATUSES = [
  'DRAFT',
  'TRANSCRIBING',
  'PROCESSING',
  'IN_REVIEW',
  'SAVED',
  'FAILED',
] as const;
export type ClassRecordStatus = (typeof CLASS_RECORD_STATUSES)[number];

export const UPDATE_SOURCES = ['CLASS_RECORD', 'TEACHER_MANUAL', 'ADMIN_MANUAL'] as const;
export type UpdateSource = (typeof UPDATE_SOURCES)[number];

export const MOMENT_SOURCES = ['CLASS_RECORD', 'MANUAL'] as const;
export type MomentSource = (typeof MOMENT_SOURCES)[number];

export const WEEKLY_UPDATE_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type WeeklyUpdateStatus = (typeof WEEKLY_UPDATE_STATUSES)[number];

export const WEEKLY_UPDATE_ITEM_TYPES = ['LEARNING', 'DEVELOPMENT', 'MOMENT', 'CLASS_NOTE'] as const;
export type WeeklyUpdateItemType = (typeof WEEKLY_UPDATE_ITEM_TYPES)[number];

export const NOTIFICATION_TYPES = [
  'WEEKLY_UPDATE_READY',
  'SCHEDULE_CHANGED',
  'CLASS_RECORD_DUE',
  'AVAILABILITY_CONFLICT',
  'TEACHER_AVAILABILITY_CHANGE',
  'STUDENT_AVAILABILITY_CHANGE',
  'INCOMPLETE_SETUP',
  'PASSWORD_RESET_REQUEST',
  'LEAVE_REQUESTED',
  'LEAVE_DECIDED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * A teacher's leave, from asking to answered.
 *
 * Leave is the one thing a teacher cannot grant themselves: the weekly week is
 * theirs to state, but taking a day out of it needs the school's agreement.
 */
export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

/** Phase-2 AI workflows. The log ships now and stays empty until then (§2.3). */
export const AI_WORKFLOWS = [
  'VOICE_TRANSCRIPTION',
  'VOICE_EXTRACTION',
  'SCHEDULE_INTERPRET',
  'SCHEDULE_CHANGE',
] as const;
export type AiWorkflow = (typeof AI_WORKFLOWS)[number];

export const ATTENTION_TYPES = [
  'TEACHER_UNAVAILABLE',
  'STUDENT_UNAVAILABLE',
  'SCHEDULE_CONFLICT',
  'INCOMPLETE_STUDENT_SETUP',
  'CLASS_RECORD_OVERDUE',
  'SETUP_INCOMPLETE',
  'PASSWORD_RESET_REQUEST',
] as const;
export type AttentionType = (typeof ATTENTION_TYPES)[number];
