/**
 * Read-model DTOs — the shapes the API returns and the web app renders.
 *
 * Write shapes live in schemas.ts (Zod); these are the responses, which need no
 * runtime validation on the client.
 */

import type {
  AiWorkflow,
  AttendanceStatus,
  AttentionType,
  ClassRecordStatus,
  DevCategory,
  DevStage,
  NotificationType,
  OccurrenceStatus,
  Role,
  SkillStatus,
  StudentStatus,
  UpdateSource,
  WeeklyUpdateItemType,
  WeeklyUpdateStatus,
} from './enums.js';

// --- Envelope ---------------------------------------------------------------

export interface ApiSuccess<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

// --- Auth -------------------------------------------------------------------

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
  language: string;
  avatarUrl: string | null;
  /** Present for teachers; the Teacher row id, not the User id. */
  teacherId: string | null;
  /** Present for parents; the Parent row id. */
  parentId: string | null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string | null;
  user: SessionUser;
}

// --- Curriculum -------------------------------------------------------------

export interface SkillDto {
  id: string;
  name: string;
  description: string | null;
  learningGoal: string | null;
  displayOrder: number;
  status: string;
}

export interface TopicDto {
  id: string;
  name: string;
  displayOrder: number;
  status: string;
  skillCount: number;
  skills?: SkillDto[];
}

export interface LevelDto {
  id: string;
  name: string;
  displayOrder: number;
  status: string;
  topicCount: number;
  skillCount: number;
  topics?: TopicDto[];
}

export interface SubjectDto {
  id: string;
  name: string;
  colorToken: string;
  displayOrder: number;
  status: string;
  levelCount: number;
  levels?: LevelDto[];
}

// --- Teachers ---------------------------------------------------------------

export interface CapabilityDto {
  id: string;
  subjectId: string;
  subjectName: string;
  minLevelOrder: number;
  maxLevelOrder: number;
  minLevelName: string | null;
  maxLevelName: string | null;
  isPrimary: boolean;
}

export interface AvailabilitySlotDto {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface ExceptionDto {
  id: string;
  date: string;
  isAvailable: boolean;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

export interface TeacherDto {
  id: string;
  userId: string;
  fullName: string;
  username: string;
  status: string;
  notes: string | null;
  capabilities: CapabilityDto[];
  availability: AvailabilitySlotDto[];
  exceptions: ExceptionDto[];
}

export interface TeacherSummaryDto {
  id: string;
  userId: string;
  fullName: string;
  username: string;
  status: string;
  subjects: Array<{ name: string; levelRange: string; colorToken: string }>;
  availableToday: string | null;
}

// --- Students ---------------------------------------------------------------

export interface StudentSubjectLevelDto {
  subjectId: string;
  subjectName: string;
  colorToken: string;
  levelId: string;
  levelName: string;
  levelOrder: number;
}

export interface StudentSummaryDto {
  id: string;
  fullName: string;
  gradeLabel: string | null;
  status: StudentStatus;
  avatarUrl: string | null;
  subjectLevels: StudentSubjectLevelDto[];
}

export interface StudentDto extends StudentSummaryDto {
  dateOfBirth: string | null;
  joinedAt: string | null;
  notes: string | null;
  availability: AvailabilitySlotDto[];
  parents: Array<{ parentId: string; userId: string; fullName: string; relationship: string | null }>;
  /** True once the student has subjects, a level per subject and availability. */
  setupComplete: boolean;
}

// --- Scheduling -------------------------------------------------------------

export interface SlotOptionDto {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isBestMatch: boolean;
  score: number;
  checks: Array<{ label: string; passed: boolean }>;
}

export interface OccurrenceDto {
  id: string;
  classId: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: OccurrenceStatus;
  subjectName: string;
  colorToken: string;
  levelName: string;
  teacherId: string;
  teacherName: string;
  studentNames: string[];
  hasClassRecord: boolean;
  classRecordStatus: ClassRecordStatus | null;
}

export interface ClassContextDto {
  occurrence: OccurrenceDto;
  students: Array<{ id: string; fullName: string; avatarUrl: string | null }>;
  previousRecord: {
    id: string;
    occurrenceDate: string;
    overallClassNote: string;
  } | null;
  /** Skills available for a learning update, scoped to this class's level. */
  skills: Array<{ id: string; name: string; topicName: string }>;
  developmentAreas: Array<{ id: string; name: string; category: DevCategory }>;
}

// --- Home & attention -------------------------------------------------------

export interface AttentionIssueDto {
  groupKey: string;
  type: AttentionType;
  title: string;
  detail: string;
  severity: 'danger' | 'warning' | 'info';
  actionLabel: string;
  actionHref: string;
  affected: Array<{ id: string; label: string; sublabel: string; href: string }>;
}

export interface SetupStepDto {
  key: 'CURRICULUM' | 'TEACHERS' | 'STUDENTS' | 'SCHEDULE';
  title: string;
  description: string;
  complete: boolean;
  actionLabel: string;
  actionHref: string;
  count: number;
}

export interface AdminHomeDto {
  greetingName: string;
  today: string;
  setupComplete: boolean;
  setupSteps: SetupStepDto[];
  todaysClasses: OccurrenceDto[];
  attention: AttentionIssueDto[];
}

export interface TeacherHomeDto {
  greetingName: string;
  today: string;
  todaysClasses: OccurrenceDto[];
  recordsDue: OccurrenceDto[];
  upcoming: OccurrenceDto[];
}

// --- Learning ---------------------------------------------------------------

export interface SkillProgressDto {
  skillId: string;
  skillName: string;
  status: SkillStatus;
  updatedAt: string | null;
}

export interface TopicProgressDto {
  topicId: string;
  topicName: string;
  skills: SkillProgressDto[];
}

export interface SubjectLearningDto {
  subjectId: string;
  subjectName: string;
  colorToken: string;
  levelId: string;
  levelName: string;
  topics: TopicProgressDto[];
  counts: Record<SkillStatus, number>;
}

export interface LearningUpdateDto {
  id: string;
  skillName: string;
  subjectName: string;
  previousStatus: SkillStatus | null;
  newStatus: SkillStatus;
  note: string | null;
  source: UpdateSource;
  authorName: string;
  createdAt: string;
}

export interface LevelChangePreviewDto {
  subjectId: string;
  subjectName: string;
  currentLevelId: string;
  currentLevelName: string;
  nextLevelId: string | null;
  nextLevelName: string | null;
  counts: Record<SkillStatus, number>;
  unfinishedSkills: Array<{ id: string; name: string; status: SkillStatus }>;
}

// --- Development ------------------------------------------------------------

export interface DevelopmentAreaDto {
  areaId: string;
  name: string;
  category: DevCategory;
  description: string | null;
  currentStage: DevStage;
  observationCount: number;
  latestObservation: {
    id: string;
    observation: string;
    observedOn: string;
    observerName: string;
  } | null;
}

export interface DevelopmentObservationDto {
  id: string;
  observation: string;
  observedOn: string;
  observerName: string;
  source: UpdateSource;
  classContext: string | null;
}

// --- Moments ----------------------------------------------------------------

export interface MomentDto {
  id: string;
  title: string;
  caption: string | null;
  capturedOn: string;
  subjectName: string | null;
  colorToken: string | null;
  classContext: string | null;
  createdByName: string;
  students: Array<{ id: string; fullName: string }>;
  media: Array<{ id: string; url: string; mimeType: string; isVideo: boolean }>;
}

// --- Parent -----------------------------------------------------------------

export interface ParentChildDto {
  id: string;
  fullName: string;
  gradeLabel: string | null;
  avatarUrl: string | null;
  relationship: string | null;
}

export interface ParentHomeDto {
  child: ParentChildDto;
  latestWeeklyUpdate: { id: string; weekStart: string; weekEnd: string; status: WeeklyUpdateStatus } | null;
  learningNow: Array<{ subjectName: string; colorToken: string; skillName: string; status: SkillStatus }>;
  developmentSnapshot: Array<{ areaName: string; stage: DevStage }>;
  recentMoment: MomentDto | null;
}

export interface WeeklyUpdateItemDto {
  id: string;
  itemType: WeeklyUpdateItemType;
  refId: string | null;
  highlightText: string;
  displayOrder: number;
}

export interface WeeklyUpdateDto {
  id: string;
  studentId: string;
  studentName: string;
  weekStart: string;
  weekEnd: string;
  summaryText: string;
  teacherNote: string | null;
  status: WeeklyUpdateStatus;
  publishedAt: string | null;
  learning: WeeklyUpdateItemDto[];
  development: WeeklyUpdateItemDto[];
  classNotes: WeeklyUpdateItemDto[];
  moments: MomentDto[];
}

// --- Notifications ----------------------------------------------------------

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

// --- Attendance -------------------------------------------------------------

export interface AttendanceEntryDto {
  studentId: string;
  fullName: string;
  status: AttendanceStatus | null;
  note: string | null;
}

// --- Web push (D3 / F22) ----------------------------------------------------

export interface PushStatusDto {
  /** False until FEATURE_WEB_PUSH is turned on — the UI explains rather than fails. */
  enabled: boolean;
  /** VAPID public key, or null when the server has no keypair configured. */
  publicKey: string | null;
  /** How many devices this user currently has registered. */
  subscriptions: number;
}

// --- AI usage & budget (Ops, spec §6) ---------------------------------------

export interface AiUsageWorkflowDto {
  workflow: AiWorkflow;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  audioSeconds: number;
  costMicros: number;
}

export interface AiUsageReportDto {
  /** 'deferred' until Phase 2 wires a provider — the log stays empty by design. */
  status: 'deferred' | 'active';
  from: string;
  to: string;
  totalCostMicros: number;
  budgetCents: number;
  /** Share of the monthly budget consumed, 0–1+. */
  budgetUsed: number;
  /** True past 80% of budget — the soft alert in spec §8.3. */
  alert: boolean;
  byWorkflow: AiUsageWorkflowDto[];
}
