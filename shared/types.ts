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
  UserStatus,
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

// --- Curriculum authoring (Subject → Level → Heading → Sub-heading) ---------

/**
 * A heading or sub-heading, with the trace of who wrote it. Admin and the
 * assigned teacher both write to the same list, so authorship is part of the
 * record rather than an afterthought.
 */
export interface CurriculumEntryDto {
  id: string;
  name: string;
  displayOrder: number;
  addedByName: string | null;
  addedAt: string;
}

export interface SubHeadingDto extends CurriculumEntryDto {
  description: string | null;
}

export interface HeadingDto extends CurriculumEntryDto {
  subHeadings: SubHeadingDto[];
}

export interface CurriculumLevelDto {
  id: string;
  name: string;
  displayOrder: number;
  /** True when the caller may add headings under this level. */
  canAuthor: boolean;
  headings: HeadingDto[];
}

export interface CurriculumSubjectDto {
  id: string;
  name: string;
  colorToken: string;
  displayOrder: number;
  /** Renaming the subject and its levels is structural — admin only. */
  canRename: boolean;
  teacherNames: string[];
  levels: CurriculumLevelDto[];
}

// --- Coverage — what a student has been taken through ------------------------

export interface CoverageStudentDto {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface CoverageDto {
  occurrenceId: string;
  subjectName: string;
  colorToken: string;
  levelName: string;
  scheduledStart: string;
  students: CoverageStudentDto[];
  headings: Array<{
    id: string;
    name: string;
    subHeadings: Array<{ id: string; name: string }>;
  }>;
  /** studentId → sub-heading ids already covered, across all classes. */
  covered: Record<string, string[]>;
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
  status: UserStatus;
  avatarUrl: string | null;
  notes: string | null;
  capabilities: CapabilityDto[];
  availability: AvailabilitySlotDto[];
  exceptions: ExceptionDto[];
  /** Classes still on the calendar for them — what deactivation leaves behind. */
  upcomingClassCount: number;
}

export interface TeacherSummaryDto {
  id: string;
  userId: string;
  fullName: string;
  username: string;
  status: UserStatus;
  avatarUrl: string | null;
  /**
   * What they are assigned to teach. The ids and level orders are here so a
   * caller can tell whether this teacher covers a specific subject and level —
   * scheduling must not offer a teacher the engine will then reject.
   */
  subjects: Array<{
    subjectId: string;
    name: string;
    levelRange: string;
    colorToken: string;
    minLevelOrder: number;
    maxLevelOrder: number;
  }>;
  availableToday: string | null;
}

/**
 * Reactivation issues fresh credentials, because deactivation destroyed the old
 * ones. The password is in the response body once and never again (AD-09).
 */
export interface TeacherStatusResultDto {
  teacher: TeacherDto;
  credentials: { username: string; tempPassword: string } | null;
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
  /**
   * Set for a teacher: the subset of `subjectLevels` they are assigned to teach
   * this child. Absent for an admin or a parent, who are not scoped by subject.
   */
  taughtSubjectLevels?: StudentSubjectLevelDto[];
  /**
   * Set for a teacher: whether this child is already on their schedule. False
   * means the subject is theirs but no class has been created yet.
   */
  hasScheduledClass?: boolean;
}

export interface StudentDto extends StudentSummaryDto {
  dateOfBirth: string | null;
  joinedAt: string | null;
  notes: string | null;
  availability: AvailabilitySlotDto[];
  parents: Array<{
    parentId: string;
    userId: string;
    fullName: string;
    /** Their sign-in name, so the admin can pass on or reset credentials. */
    username: string;
    relationship: string | null;
  }>;
  /** True once the student has subjects, a level per subject and availability. */
  setupComplete: boolean;
}

/** A class this student is in — who teaches them, and when. */
export interface StudentClassDto {
  classId: string;
  subjectId: string;
  subjectName: string;
  colorToken: string;
  levelId: string;
  levelName: string;
  teacherId: string;
  teacherName: string;
  daysOfWeek: number[];
  startTime: string;
  durationMinutes: number;
  /** The next scheduled occurrence, or null once the class has run its course. */
  nextOccurrence: string | null;
  studentCount: number;
}

/** An existing class the student could be added to, rather than creating another. */
export interface JoinableClassDto {
  classId: string;
  teacherId: string;
  teacherName: string;
  daysOfWeek: number[];
  startTime: string;
  durationMinutes: number;
  studentCount: number;
  /** Non-empty means the join is refused; the reasons say why. */
  blockers: string[];
  /** Accepted with a caveat — the same caveat Needs Attention reports. */
  warnings: string[];
}

/**
 * Who teaches this child, per subject.
 *
 * A subject assigned but with no class is the gap between "the school says they
 * study this" and "somebody is actually teaching it" — so it is reported here as
 * a first-class result, not inferred from an empty list.
 */
export interface StudentTeachingDto {
  classes: StudentClassDto[];
  unassigned: Array<{
    subjectId: string;
    subjectName: string;
    colorToken: string;
    levelId: string;
    levelName: string;
    joinable: JoinableClassDto[];
  }>;
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

/**
 * Where a class stands for recording: not yet startable, writable now, written,
 * or past its deadline and permanently unwritten (BR-01/BR-19).
 */
export type RecordState = 'NOT_YET_OPEN' | 'OPEN' | 'CLOSED' | 'SAVED';

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
  /** Whether this class can still be recorded, and whether it already was. */
  recordState: RecordState;
  /** When recording closes for this class — the teacher's deadline. */
  recordClosesAt: string;
}

export interface ClassContextDto {
  occurrence: OccurrenceDto;
  students: Array<{ id: string; fullName: string; avatarUrl: string | null }>;
  previousRecord: {
    id: string;
    occurrenceDate: string;
    overallClassNote: string;
  } | null;
  /** Sub-headings for this class's level, grouped under their heading. */
  headings: Array<{
    id: string;
    name: string;
    subHeadings: Array<{ id: string; name: string }>;
  }>;
  /** studentId → sub-heading ids already covered, so the grid opens pre-ticked. */
  covered: Record<string, string[]>;
  developmentAreas: Array<{ id: string; name: string; category: DevCategory }>;
  /**
   * Whether this class can be recorded right now. The page renders from this
   * rather than letting a teacher fill in a form the API will then refuse.
   */
  record: {
    state: RecordState;
    opensAt: string;
    closesAt: string;
    /**
     * The deadline as the school reads it, e.g. "9:00 AM on 6 Aug 2026".
     * Built server-side: clock times are stored as school-local wall clock in UTC
     * fields (BR-20), so rendering the instant in the browser's or the school's
     * zone would shift a 9:00 AM cutoff to a different hour.
     */
    closesAtLabel: string;
    savedAt: string | null;
  };
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
  /** Finished, unwritten, and still inside the deadline — actionable now. */
  recordsDue: OccurrenceDto[];
  upcoming: OccurrenceDto[];
  /**
   * Classes whose recording deadline passed with nothing written. Shown to the
   * teacher as a standing count, because the work cannot be recovered and the
   * only thing left is to not repeat it.
   */
  missedRecords: {
    total: number;
    /** The most recent few, newest first. */
    recent: OccurrenceDto[];
  };
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
  /**
   * What the school has this child studying right now. A subject added by the
   * admin shows here immediately, before any progress has been recorded against
   * it — otherwise a parent has no way to know the subject exists.
   */
  subjectLevels: StudentSubjectLevelDto[];
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
