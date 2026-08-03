/**
 * Zod contracts shared by the API route boundary and the React forms.
 *
 * The API validates every body/query against these; the web app derives its form
 * types from the same objects. One definition, both sides of the wire.
 */

import { z } from 'zod';
import {
  ATTENDANCE_STATUSES,
  CURRICULUM_STATUSES,
  DEV_CATEGORIES,
  DEV_STAGES,
  ROLES,
  SKILL_STATUSES,
  STUDENT_STATUSES,
} from './enums.js';
import { PARENT_RELATIONSHIPS } from './naming.js';

// --- Primitives -------------------------------------------------------------

export const uuid = z.string().uuid();
export const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a time in HH:MM form');
export const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD form');
export const weekday = z.number().int().min(0).max(6);

const timeRange = z
  .object({ startTime: hhmm, endTime: hhmm })
  .refine((r) => r.startTime < r.endTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

// --- Auth (M1) --------------------------------------------------------------

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z
      .string()
      .min(8, 'Use at least 8 characters')
      .regex(/[a-zA-Z]/, 'Include at least one letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({ username: z.string().min(1) });

export const createUserSchema = z.object({
  // School-issued names carry case (P26NagVen), so it is preserved on the way in
  // and ignored on the way back: sign-in matches without regard to case.
  username: z
    .string()
    .min(3, 'Use at least 3 characters')
    .regex(/^[A-Za-z0-9._-]+$/, 'Letters, numbers, dot, underscore and hyphen only'),
  fullName: z.string().min(1, 'Full name is required'),
  role: z.enum(ROLES),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateSettingsSchema = z.object({
  fullName: z.string().min(1).optional(),
  language: z.string().min(2).optional(),
});

// --- Curriculum (M2) --------------------------------------------------------

export const createSubjectSchema = z.object({
  name: z.string().min(1, 'Subject name is required'),
  colorToken: z.string().optional(),
});

export const createLevelSchema = z.object({
  name: z.string().min(1, 'Level name is required'),
});

/** A heading inside a level. */
export const createTopicSchema = z.object({
  name: z.string().min(1, 'Heading is required'),
});

/** A sub-heading inside a heading — what a student is ticked off against. */
export const createSkillSchema = z.object({
  name: z.string().min(1, 'Sub-heading is required'),
  description: z.string().optional(),
  learningGoal: z.string().optional(),
});

/**
 * Coverage: one tick per student per sub-heading. The whole grid is sent, and
 * only the entries that actually changed become history rows.
 */
export const putCoverageSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: uuid,
        skillId: uuid,
        covered: z.boolean(),
      }),
    )
    .max(2000),
});
export type PutCoverageInput = z.infer<typeof putCoverageSchema>;

export const updateCurriculumNodeSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  learningGoal: z.string().optional(),
  colorToken: z.string().optional(),
  displayOrder: z.number().int().optional(),
  status: z.enum(CURRICULUM_STATUSES).optional(),
});

export const reorderSchema = z.object({
  orderedIds: z.array(uuid).min(1),
});

// --- Teachers (M3) ----------------------------------------------------------

export const createTeacherSchema = z.object({
  username: createUserSchema.shape.username,
  fullName: z.string().min(1),
  notes: z.string().optional(),
});

/**
 * Editing a teacher. The username is their sign-in name, so changing it changes
 * how they log in — the form says so, and the API keeps the auth account in step.
 */
export const updateTeacherSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').optional(),
  username: createUserSchema.shape.username.optional(),
  notes: z.string().optional(),
});

/**
 * A teacher is never deleted. Their records — class notes, learning updates,
 * observations — are the school's history of a child, so deactivation removes
 * access and leaves everything they wrote in place. ARCHIVED is deliberately not
 * offered here.
 */
export const setTeacherStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

/** The avatars bucket accepts still images only, up to 5 MB (013_storage_buckets.sql). */
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export const avatarUploadUrlSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.enum(AVATAR_MIME_TYPES, {
    errorMap: () => ({ message: 'Use a JPEG, PNG or WebP image.' }),
  }),
});

export const setAvatarSchema = z.object({
  storagePath: z.string().min(1),
});

export const capabilitySchema = z.object({
  subjectId: uuid,
  minLevelOrder: z.number().int().min(0),
  maxLevelOrder: z.number().int().min(0),
  isPrimary: z.boolean().default(false),
});

export const putCapabilitiesSchema = z.object({
  capabilities: z.array(capabilitySchema),
});

export const availabilitySlotSchema = z.object({
  weekday,
  startTime: hhmm,
  endTime: hhmm,
});

export const putAvailabilitySchema = z.object({
  slots: z.array(availabilitySlotSchema),
});

export const createExceptionSchema = z
  .object({
    date: dateKey,
    isAvailable: z.boolean(),
    allDay: z.boolean().default(true),
    startTime: hhmm.optional(),
    endTime: hhmm.optional(),
    reason: z.string().optional(),
  })
  .refine((v) => v.allDay || (v.startTime && v.endTime), {
    message: 'A partial-day exception needs a start and end time',
    path: ['startTime'],
  });

// --- Students (M4) ----------------------------------------------------------

export const subjectLevelSchema = z.object({
  subjectId: uuid,
  levelId: uuid,
});

/**
 * Adding a child collects who they are and what they study — nothing else.
 * Availability and parent access are set from the profile afterwards, so
 * enrolling is two short steps rather than a five-step wizard.
 */
export const createStudentSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: dateKey.optional(),
  gradeLabel: z.string().optional(),
  notes: z.string().optional(),
  /** Uploaded straight to the private bucket first; only the path arrives here. */
  avatarPath: z.string().min(1).optional(),
  subjectLevels: z.array(subjectLevelSchema).default([]),
  availability: z.array(availabilitySlotSchema).default([]),
  parent: z
    .object({
      // Either link an existing parent account, or create one inline.
      parentUserId: uuid.optional(),
      username: createUserSchema.shape.username.optional(),
      fullName: z.string().min(1).optional(),
      relationship: z.string().optional(),
    })
    .optional(),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  fullName: z.string().min(1).optional(),
  dateOfBirth: dateKey.nullable().optional(),
  gradeLabel: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const putSubjectLevelsSchema = z.object({
  subjectLevels: z.array(subjectLevelSchema),
});

export const putParentAccessSchema = z.object({
  parentUserId: uuid.optional(),
  username: createUserSchema.shape.username.optional(),
  fullName: z.string().min(1).optional(),
  relationship: z.string().optional(),
});

export const updateStudentStatusSchema = z.object({
  status: z.enum(STUDENT_STATUSES),
});

// --- Parents (M4) -----------------------------------------------------------

/** Forgiving on formatting, strict on there being a number to ring. */
export const mobileNumber = z
  .string()
  .min(7, 'Enter a contact number')
  .max(20)
  .regex(/^[0-9+()\-\s]+$/, 'Digits, spaces, +, - and brackets only');

/**
 * A parent account is created against the children it can see (BR-13). The
 * username is issued by the API, not chosen here — the format is fixed and
 * collisions are only visible server-side.
 */
export const createParentSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  mobileNumber,
  relationship: z.enum(PARENT_RELATIONSHIPS),
  avatarPath: z.string().min(1).optional(),
  studentIds: z.array(uuid).min(1, 'Choose at least one student'),
});
export type CreateParentInput = z.infer<typeof createParentSchema>;

export const updateParentSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  mobileNumber: mobileNumber.optional(),
  relationship: z.enum(PARENT_RELATIONSHIPS).optional(),
  username: createUserSchema.shape.username.optional(),
});

export const putParentStudentsSchema = z.object({
  studentIds: z.array(uuid),
  relationship: z.enum(PARENT_RELATIONSHIPS).optional(),
});

export const setParentStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

// --- Scheduling (M5) --------------------------------------------------------

/**
 * The structured scheduling request.
 *
 * TODO(AI-PHASE-2): Phase 2 adds a `rawText` variant that ISchedulingInterpreter
 * parses into exactly this shape — see docs/DEFERRED-AI.md §2.1. The form is the
 * structured request, so the downstream engine contract does not change.
 */
export const scheduleOptionsSchema = z.object({
  studentIds: z.array(uuid).min(1, 'Pick at least one student'),
  subjectId: uuid,
  levelId: uuid,
  teacherId: uuid.optional(),
  timesPerWeek: z.number().int().min(1).max(7).default(2),
  durationMinutes: z.number().int().min(15).max(240).default(60),
  timePreference: z.enum(['MORNING', 'AFTERNOON', 'ANY']).default('ANY'),
  startDate: dateKey,
  endDate: dateKey.optional(),
});
export type ScheduleOptionsInput = z.infer<typeof scheduleOptionsSchema>;

export const confirmScheduleSchema = z.object({
  studentIds: z.array(uuid).min(1),
  subjectId: uuid,
  levelId: uuid,
  teacherId: uuid,
  daysOfWeek: z.array(weekday).min(1),
  startTime: hhmm,
  durationMinutes: z.number().int().min(15).max(240),
  startDate: dateKey,
  endDate: dateKey.optional(),
});
export type ConfirmScheduleInput = z.infer<typeof confirmScheduleSchema>;

export const cancelOccurrenceSchema = z.object({
  reason: z.string().optional(),
});

/**
 * Adding a child to a class that already runs.
 *
 * The alternative — a second class for the same subject, level and teacher —
 * splits one group's history in two, so joining is the normal path and creating
 * a class is for when none fits.
 */
export const addClassStudentsSchema = z.object({
  studentIds: z.array(uuid).min(1, 'Pick at least one student'),
  /**
   * Accepts the join despite a soft warning (outside their stated availability).
   * Hard blockers ignore this.
   */
  acceptWarnings: z.boolean().default(false),
});
export type AddClassStudentsInput = z.infer<typeof addClassStudentsSchema>;

/** Rescheduling: the admin picks affected occurrences, the engine revalidates. */
export const proposeMovesSchema = z.object({
  occurrenceIds: z.array(uuid).min(1),
});

export const applyMovesSchema = z.object({
  moves: z
    .array(
      z.object({
        occurrenceId: uuid,
        newStart: z.string().datetime(),
      }),
    )
    .min(1),
});

// --- Attendance & class record (M7) -----------------------------------------

export const putAttendanceSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: uuid,
        status: z.enum(ATTENDANCE_STATUSES),
        note: z.string().optional(),
      }),
    )
    .min(1),
});

/**
 * The class-record draft.
 *
 * This shape is deliberately identical whether a human typed it or (in Phase 2)
 * a model produced it — see docs/DEFERRED-AI.md §2.2. The review-and-approve UI
 * is built against it now, so enabling AI only changes where the initial values
 * come from.
 */
export const classRecordDraftSchema = z.object({
  overallClassNote: z.string().min(1, 'The class note is required'),
  studentObservations: z
    .array(
      z.object({
        studentId: uuid,
        observation: z.string(),
        isAiGenerated: z.boolean().default(false),
      }),
    )
    .default([]),
  proposedLearningUpdates: z
    .array(
      z.object({
        studentId: uuid,
        skillId: uuid,
        newStatus: z.enum(SKILL_STATUSES),
        note: z.string().optional(),
      }),
    )
    .default([]),
  proposedDevelopmentObservations: z
    .array(
      z.object({
        studentId: uuid,
        areaId: uuid,
        observation: z.string().min(1),
      }),
    )
    .default([]),
  momentIds: z.array(uuid).default([]),
});
export type ClassRecordDraft = z.infer<typeof classRecordDraftSchema>;

// --- Learning (M8) ----------------------------------------------------------

export const updateSkillStatusSchema = z.object({
  status: z.enum(SKILL_STATUSES),
  note: z.string().optional(),
});

export const levelChangeSchema = z.object({
  subjectId: uuid,
  toLevelId: uuid.optional(), // omitted means "stay on the current level"
  carriedForwardSkillIds: z.array(uuid).default([]),
});

// --- Development (M9) -------------------------------------------------------

export const createDevelopmentAreaSchema = z.object({
  category: z.enum(DEV_CATEGORIES),
  name: z.string().min(1),
  description: z.string().optional(),
});

export const createObservationSchema = z.object({
  observation: z.string().min(1, 'Describe what you saw'),
  observedOn: dateKey.optional(),
});

export const updateStageSchema = z.object({
  stage: z.enum(DEV_STAGES),
  observationId: uuid.optional(),
});

// --- Moments (M10) ----------------------------------------------------------

export const momentUploadUrlSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
});

export const createMomentSchema = z.object({
  title: z.string().min(1, 'Give this moment a title'),
  caption: z.string().optional(),
  subjectId: uuid.optional(),
  classOccurrenceId: uuid.optional(),
  capturedOn: dateKey.optional(),
  studentIds: z.array(uuid).min(1, 'Tag at least one student'),
  media: z
    .array(
      z.object({
        storagePath: z.string().min(1),
        mimeType: z.string().min(1),
        sizeBytes: z.number().int().optional(),
      }),
    )
    .min(1, 'Attach at least one photo or video'),
});
export type CreateMomentInput = z.infer<typeof createMomentSchema>;

// --- Weekly update (M12) ----------------------------------------------------

export const generateWeeklyUpdateSchema = z.object({
  studentId: uuid,
  weekStart: dateKey,
});

export const publishWeeklyUpdateSchema = z.object({
  teacherNote: z.string().optional(),
});

// --- Web push (D3 / F22) ----------------------------------------------------

/** Mirrors the browser's PushSubscription.toJSON() shape. */
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(400).optional(),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

// --- Query params -----------------------------------------------------------

export const scheduleQuerySchema = z.object({
  from: dateKey,
  to: dateKey,
});

/** Defaults to the current calendar month when the caller passes nothing. */
export const aiUsageQuerySchema = z.object({
  from: dateKey.optional(),
  to: dateKey.optional(),
});

export const momentsQuerySchema = z.object({
  studentId: uuid.optional(),
  subjectId: uuid.optional(),
  mediaType: z.enum(['all', 'photo', 'video']).default('all'),
});
