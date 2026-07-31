# Valmiki LMS System — Implementation Plan v1.1

**Status:** Approved, in delivery · **Date:** 2026-07-27
**Sources of truth (priority order):** `VIG Developer Document` > `Teacher Parent Portal Features` > `Product Design System Brand Guidelines`

### Decisions log (v1.1)

| # | Decision | Effect |
|---|---|---|
| D1 | Product name is **Valmiki LMS System**. VIG = Valmiki International Gurukulam (the institution). The boards' "LittlePath" wordmark is superseded. | All UI copy, page titles, PWA manifest, PDF header, login screen |
| D2 | **Forgot password → admin-mediated.** User taps "Forgot password", the system raises a notification to admins, admin resets, admin shares the new temporary password out-of-band. No email/SMS verification. | New `PASSWORD_RESET_REQUEST` notification + 2 endpoints (§1.1 F21) |
| D3 | **PWA + service worker + VAPID built now**; actual web-push *delivery* stays behind `FEATURE_WEB_PUSH` and is the flagged follow-up. In-app notification centre is the launch channel. | M13 |
| D4 | **All AI is deferred to Phase 2.** Every AI touchpoint ships as a working manual path with the integration seam already in place. See `DEFERRED-AI.md`. | §8, M7, M11 |

> **AI status: DEFERRED.** No AI is wired in this build. Every place AI will eventually plug in is listed in [`DEFERRED-AI.md`](./DEFERRED-AI.md) and marked in code with `// TODO(AI-PHASE-2)`. The manual equivalent works end-to-end in the meantime, so nothing in the product is blocked on it.

---

## 0. Executive summary

Valmiki LMS System is a homeschool learning portal for **Valmiki International Gurukulam (VIG)**. Three roles (Admin, Teacher, Parent), 16 locked flows, <10 teachers. AI deferred to Phase 2.

The product is one information cycle:

```
Admin builds structure → Admin schedules → Teacher teaches → Teacher records (voice)
→ AI drafts → Teacher approves → Student record updates → Parent sees approved story
```

Two architectural invariants drive everything:

1. **The Class Occurrence is the single anchor.** Attendance, class note, student observations, learning updates, development observations and moments all hang off one occurrence. No duplicate class histories.
2. **AI drafts; humans approve.** Nothing AI-generated is persisted to a student record or the schedule until a human explicitly confirms. Parents never see a draft.

Delivery is **13 modules**, one at a time, each with schema → API → UI → tests, gated on your approval.

---

## 1. Requirements

### 1.1 Functional scope (in MVP)

| # | Capability | Role | Source |
|---|---|---|---|
| F1 | Username/password login, no OTP, forced first-login password change | All | Flow 08 |
| F2 | Basic settings (profile, password, notifications, language, timezone); role not user-editable | All | Flow 08 |
| F3 | Curriculum CRUD: Subject → Level → Topic → Skill, ordering, active/archive | Admin | Flow 03 |
| F4 | Level completion with impact preview + carry-forward | Admin | Flow 03/14 |
| F5 | Teacher management: capabilities (subject + level range), weekly availability, dated exceptions | Admin | Flow 10 |
| F6 | Student management: basic details, subjects & levels, weekly availability, parent access, status, archive | Admin | Flow 09 |
| F7 | Schedule week/day view, add class, recurrence | Admin | Flow 15 |
| F8 | Class scheduling: structured request → valid options (Best Match) → review → confirm. *Natural-language entry deferred — AI-PHASE-2* | Admin | Flow 06 |
| F9 | Rescheduling: select affected classes → proposed moves → confirm & apply. *Voice/NL entry deferred — AI-PHASE-2* | Admin | Flow 15 |
| F10 | Admin Home: today's classes + grouped Needs Attention + calm empty states | Admin | Flow 01/05 |
| F11 | Setup checklist in dependency order (Curriculum → Teachers → Students → Schedule) | Admin | Flow 04 |
| F12 | Teacher Home: today's classes, class records due, upcoming | Teacher | Flow 05/16 |
| F13 | Class record flow: open class → previous context → attendance → **typed class note + per-student observations** → optional updates → final review → atomic save. *Voice note + AI draft deferred — AI-PHASE-2* | Teacher | Flow 07/16 |
| F14 | Student Learning Map: per-student skill statuses (To Learn / Learning / Needs Support / Mastered) with note/evidence | Admin/Teacher | Flow 14 |
| F15 | Development: areas under Personality/Emotional/Physical, stages (Emerging/Developing/Consistent), evidence timeline | Admin/Teacher | Flow 13 |
| F16 | Moments: media gallery, add/tag, auto-filled class context, one media → many students | Admin/Teacher | Flow 12 |
| F17 | Parent Portal: Home, Learning, Development, Moments (read-only, linked child only) | Parent | Flow 11 |
| F18 | Weekly Update: Overview / Learning / Development / Moments + teacher note + PDF | Parent | Flow 02 |
| F19 | Notifications: parent 1/week; teacher scheduling + class-record; admin operational issues + password-reset requests | All | §8 |
| F20 | Explicit empty, loading, error and offline states everywhere | All | Flow 04 |
| F21 | **Forgot password (admin-mediated):** user requests → admins notified → admin resets → temp password shown once to admin → shared out-of-band → forced change on next login | All | D2 |
| F22 | **PWA:** installable manifest, service worker, offline shell, push subscription registered (delivery behind `FEATURE_WEB_PUSH`) | All | D3 |

### 1.2 Explicitly out of scope (V2)

Parent schedule view · Ask Teacher / messaging · global search · library integration · advanced analytics · homework/assignments · OTP login · offline editing.

### 1.3 Deferred to Phase 2 — AI (D4)

Voice recording & transcription · AI class-note extraction · AI-proposed learning updates · AI-proposed development observations · natural-language class scheduling · voice rescheduling. Full inventory, integration seams and re-entry plan: [`DEFERRED-AI.md`](./DEFERRED-AI.md).

### 1.3 Non-functional

- Responsive desktop + phone from one codebase, matching the 16 boards. Reflow, do not miniaturize.
- Server-side role authorization on **every** endpoint (never trust the client role).
- Modern password hashing (delegated to Supabase Auth / bcrypt) + forced temp-password replacement.
- Object storage for media; DB stores references + metadata only.
- AI output is untrusted draft data until confirmed.
- Preserve author / source / timestamps on all learning, development and class-record history.
- WCAG AA contrast; status never encoded by colour alone; 44×44 px minimum touch targets.
- Optimise for small-school scale. No premature enterprise complexity.

---

## 2. Roles & permission matrix

| Resource | Admin | Teacher | Parent |
|---|---|---|---|
| Curriculum | CRUD | read | — |
| Teachers | CRUD | read self | — |
| Students | CRUD | read assigned | read linked child |
| Availability (teacher/student) | CRUD | read/edit own | — |
| Schedule / classes | CRUD | read own | — |
| Class occurrence + attendance | read all | CRUD own | — |
| Class record / voice note | read all | CRUD own | — |
| Learning Map | CRUD | update for own students | read linked child |
| Development | CRUD | add observation, update stage (own students) | read linked child |
| Moments | CRUD | create/tag own classes | read linked child |
| Weekly Update | read/regenerate | — | read linked child |
| Notifications | own | own | own |
| Settings | own | own | own |

Enforcement: `requireRole()` + resource-scoped guards (`assertTeacherOwnsOccurrence`, `assertParentLinkedToStudent`). Parent and teacher scoping is applied in the **repository query**, not just a middleware check — no unscoped `findMany` on student data.

---

## 3. Business rules (locked)

**BR-01** Class Occurrence is the anchor for attendance, class note, observations, learning updates, development observations and moments.
**BR-02** Overall Class Note is always preserved, even when every optional update is skipped.
**BR-03** AI never mutates schedule or records before explicit confirmation.
**BR-04** No AI on dashboards, learning calculations, development stages, moments, notifications or auth.
**BR-05** Availability is a constraint; the timetable is a booking; attendance is what actually happened. Three different things.
**BR-06** Schedule validity = teacher capability ∧ teacher availability ∧ student availability ∧ no conflict. Exceptions override recurring availability on their date.
**BR-07** Curriculum defines what exists; the Learning Map defines where the student is. Skill status belongs to the student, not the curriculum.
**BR-08** Level change preserves history: previous level stays queryable; unfinished skills may be carried forward.
**BR-09** Learning/Development changes are append-only with author/date/source. Never destructive overwrite.
**BR-10** Development is evidence over time, not a score. Stage change is human judgement, never automatic.
**BR-11** One Moment = one media object with many student links. Never duplicate the media per student.
**BR-12** Historical occurrences/records are immutable when future schedule, level or availability changes.
**BR-13** Parent sees only approved outcomes for linked children. No drafts, no operational machinery.
**BR-14** Parents: exactly one push per week. Teachers: scheduling + class-record only. Admin: actionable operational issues.
**BR-15** Absent students must not receive AI-generated observations.
**BR-16** Grouped Needs Attention: one root cause = one issue, with drill-down to affected classes.
**BR-17** Archive, never hard-delete, anything with history.
**BR-18** Signing the Parent Agreement is media consent. No separate consent form or per-moment consent gate.
**BR-19** Class-record save is atomic across all its parts, or leaves a recoverable failure state.
**BR-20** Dates/times are explicit and rendered in the configured school timezone.

---

## 4. System architecture

```
┌──────────────────────────────┐
│ Browser (React 19 + Vite)    │  Vercel
│ Admin / Teacher / Parent SPA │
└───────┬──────────────┬───────┘
        │ REST (Axios) │ direct signed upload
        │  Bearer JWT  │
┌───────▼──────────────┼───────┐
│ Express API (TS)     │       │  Railway
│ routes → controllers │       │
│   → services         │       │
│   → repositories     │       │
│ + AI adapters        │       │
└───┬────────┬─────────┼───────┘
    │ Prisma │ REST    │
┌───▼────────▼─────────▼───────┐
│ Supabase                     │
│  Postgres · Auth · Storage   │
└──────────────────────────────┘
              │
   ┌──────────┴───────────┐
   │ STT provider         │  (Whisper / Deepgram — see §9)
   │ Claude API (extract) │
   └──────────────────────┘
```

### 4.1 Key architectural decisions

**AD-01 — Express is the only writer to Postgres.** The frontend never talks to Supabase's data API. Prisma connects via the pooler (`:6543`, pgbouncer) with a `DIRECT_URL` (`:5432`) for migrations. RLS stays *enabled with deny-all* on every table as defence-in-depth; the Supabase data API is disabled. Authorization lives in the service layer where the business rules already are (spec §9: "server-side role authorization").

**AD-02 — Supabase Auth with a server-mediated username login.** The spec locks username + password with no OTP; Supabase Auth is email-keyed. Resolution: each user row stores a `username` and a synthetic, non-routable email (`<username>@users.littlepath.internal`). `POST /auth/login` takes `{username, password}`, resolves username → email in `users`, calls `signInWithPassword` **server-side**, and returns the session. Benefits: generic invalid-login error (no user enumeration), `must_change_password` gate enforced before any other route, role never trusted from the client.

**AD-03 — JWT verification via JWKS.** Express verifies the Supabase access token with `jose` against the project JWKS, then loads the user row (short-TTL in-process cache) for role + status. Role is *not* read from the token alone — a disabled user is rejected on the next request, not on token expiry.

**AD-04 — Media never proxies through the API.** Upload: client asks Express for a signed upload URL (after an authz check) → uploads directly to a **private** Supabase Storage bucket → confirms to Express, which writes the metadata row. Read: Express issues short-lived signed URLs only after verifying the caller may see that student.

**AD-05 — Occurrences are materialised.** A class row holds the recurrence; a background job materialises `class_occurrences` for a rolling 120-day horizon and extends nightly. Materialised rows are what attendance, records and the schedule grid read. Past occurrences are immutable; editing a class regenerates only future, un-recorded ones.

**AD-06 — Needs Attention is derived, not stored.** A pure `AttentionService` recomputes grouped issues from current state on each Home request (cheap at this scale) and returns a deterministic `groupKey` per root cause. Nothing to keep in sync; an issue disappears the moment its cause is resolved. Only *dismissals* (if we add them) would be persisted.

**AD-07 — The constraint engine is a pure function.** `findValidSlots(request, snapshot) → SlotOption[]` takes an in-memory snapshot (capabilities, availabilities, exceptions, existing occurrences) and does no I/O. Fully unit-testable, deterministic, and reusable for both "find options" and "validate a proposed move".

**AD-08 — AI behind interfaces (Phase 2 seam, built now).** `ITranscriptionProvider`, `IClassNoteExtractor`, `ISchedulingInterpreter` are defined in this build with `Manual*` implementations that pass through operator-entered data. Phase 2 swaps the implementation in the DI container — no call-site changes. `ai_usage_log` and `GET /admin/ai-usage` ship now and stay empty until then.

**AD-09 — Forgot password is an operational issue, not an auth channel (D2).** `POST /auth/forgot-password` is unauthenticated, strictly rate-limited (5/hour/IP), and always returns the same generic success regardless of whether the username exists — no user enumeration. On a real match it inserts a `PASSWORD_RESET_REQUEST` notification for every active admin and surfaces the request in Needs Attention. `POST /admin/users/:id/reset-password` generates a temporary password, returns it **once** in the response body (never stored in plaintext, never logged, never re-retrievable), and sets `must_change_password = true`. The admin passes it to the user out-of-band.

---

## 5. Database schema (PostgreSQL / Prisma)

### 5.1 Enums

```
Role                ADMIN | TEACHER | PARENT
UserStatus          ACTIVE | INACTIVE | ARCHIVED
StudentStatus       ACTIVE | INACTIVE | ARCHIVED
CurriculumStatus    ACTIVE | REVIEW | ARCHIVED
SkillStatus         TO_LEARN | LEARNING | NEEDS_SUPPORT | MASTERED
AttendanceStatus    PRESENT | ABSENT | LATE
DevCategory         PERSONALITY | EMOTIONAL | PHYSICAL
DevStage            EMERGING | DEVELOPING | CONSISTENT
OccurrenceStatus    SCHEDULED | COMPLETED | CANCELLED
ClassRecordStatus   DRAFT | TRANSCRIBING | PROCESSING | IN_REVIEW | SAVED | FAILED
UpdateSource        CLASS_RECORD | TEACHER_MANUAL | ADMIN_MANUAL
NotificationType    WEEKLY_UPDATE_READY | SCHEDULE_CHANGED | CLASS_RECORD_DUE |
                    AVAILABILITY_CONFLICT | TEACHER_AVAILABILITY_CHANGE |
                    STUDENT_AVAILABILITY_CHANGE | INCOMPLETE_SETUP
AttentionType       TEACHER_UNAVAILABLE | STUDENT_UNAVAILABLE | SCHEDULE_CONFLICT |
                    INCOMPLETE_STUDENT_SETUP | CLASS_RECORD_OVERDUE | SETUP_INCOMPLETE
AiWorkflow          VOICE_TRANSCRIPTION | VOICE_EXTRACTION | SCHEDULE_INTERPRET | SCHEDULE_CHANGE
```

### 5.2 Tables

**Identity**
- `school_settings` — singleton: name, timezone (`Asia/Kolkata`), week_start_day, weekly_update_day, weekly_update_time, ai_monthly_budget_cents
- `users` — id (= Supabase auth uid), username ᵁ, email_alias ᵁ, role, status, full_name, avatar_path, must_change_password, language, created_at
- `teachers` — id, user_id ᵁ, notes
- `parents` — id, user_id ᵁ
- `parent_students` — parent_id, student_id, relationship · PK(parent_id, student_id)
- `students` — id, full_name, date_of_birth, grade_label, joined_at, status, avatar_path, notes

**Curriculum**
- `subjects` — id, name ᵁ, color_token, display_order, status
- `levels` — id, subject_id, name, display_order, status · ᵁ(subject_id, name)
- `topics` — id, level_id, name, display_order, status
- `skills` — id, topic_id, name, description, learning_goal, display_order, status

**Capability & availability**
- `teacher_capabilities` — id, teacher_id, subject_id, min_level_order, max_level_order, is_primary
- `teacher_availability` — id, teacher_id, weekday(0–6), start_time, end_time
- `teacher_availability_exceptions` — id, teacher_id, date, is_available, all_day, start_time?, end_time?, reason
- `student_availability` — id, student_id, weekday, start_time, end_time

**Student learning state**
- `student_subject_levels` — id, student_id, subject_id, level_id, is_current, started_at, completed_at · ᵁ(student_id, subject_id) where is_current
- `student_skill_progress` — id, student_id, skill_id, status, updated_by, updated_at · ᵁ(student_id, skill_id) *(current state)*
- `learning_updates` — id, student_id, skill_id, previous_status, new_status, note, evidence_path?, source, class_record_id?, author_id, created_at *(append-only history)*
- `level_completions` — id, student_id, subject_id, from_level_id, to_level_id?, carried_forward_skill_ids[], confirmed_by, confirmed_at

**Scheduling**
- `classes` — id, subject_id, level_id, teacher_id, days_of_week[], start_time, duration_minutes, start_date, end_date?, timezone, status, created_by
- `class_students` — class_id, student_id · PK both
- `class_occurrences` — id, class_id, scheduled_start ᵗᶻ, scheduled_end ᵗᶻ, teacher_id (snapshot), status, cancelled_reason · ᵁ(class_id, scheduled_start) · idx(scheduled_start), idx(teacher_id, scheduled_start)
- `attendance` — id, occurrence_id, student_id, status, note · ᵁ(occurrence_id, student_id)
- `scheduling_requests` — id, admin_id, raw_text, interpreted (jsonb), status, created_at
- `schedule_change_proposals` — id, request_id, moves (jsonb), status, applied_at, applied_by

**Class record**
- `class_records` — id, occurrence_id ᵁ, author_id, overall_class_note, transcript, audio_path, language_detected, status, ai_model, ai_cost_micros, created_at, saved_at
- `student_observations` — id, class_record_id, student_id, observation, is_ai_generated, was_edited

**Development**
- `development_areas` — id, category, name, description, display_order, status *(school catalogue)*
- `student_development_areas` — id, student_id, area_id, current_stage, updated_at · ᵁ(student_id, area_id)
- `development_observations` — id, student_id, area_id, observation, observed_on, observer_id, class_record_id?, source, created_at
- `development_stage_changes` — id, student_id, area_id, from_stage, to_stage, changed_by, observation_id?, created_at

**Moments**
- `moments` — id, title, caption, subject_id?, class_occurrence_id?, captured_on, created_by, source
- `moment_media` — id, moment_id, storage_path, thumbnail_path, mime_type, width, height, duration_ms, size_bytes, display_order
- `moment_students` — moment_id, student_id · PK both

**Parent-facing & system**
- `weekly_updates` — id, student_id, week_start (date), week_end, summary_text, teacher_note, status (DRAFT|PUBLISHED), generated_at, published_at · ᵁ(student_id, week_start)
- `weekly_update_items` — id, weekly_update_id, item_type (LEARNING|DEVELOPMENT|MOMENT|CLASS_NOTE), ref_id, highlight_text, display_order
- `notifications` — id, recipient_user_id, type, title, body, payload (jsonb), read_at, created_at · idx(recipient_user_id, created_at)
- `ai_usage_log` — id, workflow, provider, model, input_tokens, output_tokens, audio_seconds, cost_micros, occurrence_id?, user_id, created_at
- `audit_log` — id, actor_id, action, entity, entity_id, before (jsonb), after (jsonb), created_at

ᵁ = unique · ᵗᶻ = `timestamptz` (UTC stored, school timezone rendered)

### 5.3 Integrity notes

- Every history table (`learning_updates`, `development_observations`, `class_records`) is **insert-only**; corrections create a new row.
- `student_skill_progress` is a projection of `learning_updates` kept in the same transaction — fast reads, replayable truth.
- `class_occurrences` snapshots `teacher_id` so a later teacher reassignment does not rewrite history (BR-12).
- Deletes are soft everywhere history exists (`status = ARCHIVED`).

---

## 6. API design (`/api/v1`)

Envelope: `{ data, meta? }` on success; `{ error: { code, message, details? } }` on failure. Zod validates every body/query at the route boundary using schemas shared with the frontend.

| Group | Endpoints |
|---|---|
| **Auth** | `POST /auth/login` · `POST /auth/logout` · `POST /auth/refresh` · `POST /auth/change-password` · `GET /auth/me` |
| **Admin users** | `POST /admin/users` (create with temp password) · `PATCH /admin/users/:id/status` · `POST /admin/users/:id/reset-password` |
| **Curriculum** | `GET /curriculum/tree?mine` (whole Subject → Level → Heading → Sub-heading tree) · `GET/POST /subjects` (a new subject arrives with L1–L4) · `GET/PATCH /subjects/:id` · `POST /subjects/:id/levels` · `PATCH /levels/:id` · `POST /levels/:id/topics` · `PATCH /topics/:id` · `POST /topics/:id/skills` · `PATCH /skills/:id` · `POST /:kind/:id/archive` · `PATCH /:parent/:id/reorder`<br>Structure (subjects, levels) is admin-only; headings and sub-headings may also be written by the teacher assigned to that subject and level range, and carry their author and timestamp. |
| **Teachers** | `GET/POST /teachers` · `GET/PATCH /teachers/:id` · `PATCH /teachers/:id/status` (deactivate/reactivate — never delete) · `POST /teachers/:id/avatar-upload-url` · `PUT/DELETE /teachers/:id/avatar` · `GET/PUT /teachers/:id/capabilities` · `GET/PUT /teachers/:id/availability` · `GET/POST /teachers/:id/exceptions` · `DELETE /exceptions/:id` |
| **Students** | `GET/POST /students` · `GET/PATCH /students/:id` · `PUT /students/:id/subject-levels` · `PUT /students/:id/availability` · `PUT /students/:id/parent-access` · `PATCH /students/:id/status` · `GET /students/:id/history` |
| **Learning** | `GET /students/:id/learning` · `GET /students/:id/learning/:subjectId` · `PATCH /students/:id/skills/:skillId` · `GET/PUT /occurrences/:id/coverage` (per-student ticks for a class) · `GET /students/:id/level-change/preview` · `POST /students/:id/level-change` |
| **Development** | `GET/POST /development/areas` · `GET /students/:id/development` · `GET /students/:id/development/:areaId` · `POST /students/:id/development/:areaId/observations` · `PATCH /students/:id/development/:areaId/stage` |
| **Moments** | `GET /moments` (filters) · `POST /moments/upload-url` · `POST /moments` · `GET/PATCH /moments/:id` · `GET /students/:id/moments` |
| **Schedule** | `GET /schedule?from&to&view` · `POST /classes` · `GET/PATCH /classes/:id` · `POST /classes/:id/cancel` · `GET /occurrences/:id` |
| **AI scheduling** | `POST /schedule/interpret` · `POST /schedule/options` · `POST /schedule/confirm` · `POST /schedule/change/interpret` · `POST /schedule/change/apply` |
| **Home / attention** | `GET /home/admin` · `GET /home/teacher` · `GET /home/parent` · `GET /attention` · `GET /setup/progress` |
| **Class record** | `GET /teacher/occurrences?date` · `GET /occurrences/:id/context` · `PUT /occurrences/:id/attendance` · `POST /occurrences/:id/record` (creates DRAFT + signed audio upload URL) · `POST /class-records/:id/process` · `GET /class-records/:id` · `PATCH /class-records/:id` · `POST /class-records/:id/save` |
| **Parent** | `GET /parent/children` · `GET /parent/students/:id/learning` · `.../development` · `.../moments` · `GET /parent/weekly-updates` · `GET /parent/weekly-updates/:id` · `GET /parent/weekly-updates/:id/pdf` |
| **Notifications** | `GET /notifications` · `PATCH /notifications/:id/read` · `POST /notifications/read-all` |
| **Ops** | `GET /health` · `GET /admin/ai-usage` |

`POST /class-records/:id/save` is the one genuinely transactional endpoint: attendance + class note + observations + accepted learning updates + accepted development observations + moment links, all in one Prisma `$transaction`, or nothing (BR-19).

---

## 7. Frontend architecture

```
apps/web/src/
  app/            router, providers (QueryClient, Auth, Theme), error boundaries
  routes/         role-gated route trees: admin/ teacher/ parent/ auth/
  layouts/        AdminShell (left rail) · TeacherShell · ParentShell · MobileTabBar
  features/
    auth/ curriculum/ teachers/ students/ schedule/ class-record/
    learning/ development/ moments/ parent/ notifications/ home/
      ├── api/         typed hooks over Axios + TanStack Query
      ├── components/
      ├── hooks/
      ├── schemas/     re-exported from @littlepath/shared
      └── pages/
  components/
    ui/           shadcn primitives
    patterns/     StatusChip, AttentionCard, EmptyState, LoadingState,
                  ErrorState, OfflineBanner, SubjectBadge, StageChip,
                  AvailabilityGrid, RecordStepper
  lib/            axios client + interceptors, queryClient, dates (tz), format, cn
  styles/         tokens.css (design-system §14) + tailwind theme
```

**Design system → code.** Section 14 tokens become CSS custom properties consumed by Tailwind v4 `@theme`:

```css
@theme {
  --color-brand-navy: #11165C;   --color-brand-violet: #5B2CCB;
  --color-brand-violet-hover: #4B22B5;
  --color-surface-canvas: #FCFBFF; --color-surface-card: #FFFFFF;
  --color-surface-lavender: #F3EEFF; --color-surface-lavender-2: #FAF8FF;
  --color-border-default: #E7E3F0;
  --color-text-primary: #11165C; --color-text-secondary: #5F6080;
  --color-text-muted: #8D8DA5;
  --color-success: #3FA45B; --color-success-bg: #EDF8EF;
  --color-info: #3F83E8;    --color-info-bg: #EDF5FF;
  --color-warning: #F29A38; --color-warning-bg: #FFF5E8;
  --color-danger: #F05B5B;  --color-danger-bg: #FFF0F0;
  --color-pink: #E95D86;    --color-pink-bg: #FFF1F6;
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px;
  --radius-xl: 20px; --radius-2xl: 24px; --radius-pill: 999px;
  --font-display: Georgia, 'Times New Roman', serif;
  --font-sans: Inter, 'Segoe UI', system-ui, sans-serif;
}
```

Spacing uses Tailwind's native 4px scale (`space.1`→`p-1` … `space.12`→`p-12`), so no custom spacing tokens are needed.

**Enforced UI rules.** Subject colour mapping is a single constant (`Mathematics → violet, English → orange, Science → blue, Telugu → green`). Learning-state → colour is a single constant. `StatusChip` always renders icon + label + colour, so status survives grayscale (§10). Serif is reserved for `Display/H1/H2/H3`; a lint rule keeps it out of table cells and metadata.

**Repo layout (pnpm workspaces + Turborepo):**

```
littlepath/
  apps/web/     React 19 + Vite
  apps/api/     Express + TS
  packages/shared/   Zod schemas, DTO types, enums, constants (single source for both sides)
  packages/config/   eslint, tsconfig, prettier, tailwind preset
  prisma/       schema.prisma, migrations, seed.ts
  docs/
```

`apps/api` layering: `routes → controllers → services → repositories → prisma`. Controllers do no business logic; services do no HTTP; repositories do no rules. Dependency injection via a small container so services take interfaces (`IStorageProvider`, `ITranscriptionProvider`, `IClock`) — makes the constraint engine and the class-record save path testable without a database.

---

## 8. AI architecture — ⚠️ DEFERRED TO PHASE 2 (D4)

> **Nothing in this section is built in the one-week delivery.** It is retained as the Phase-2 specification. What ships instead: the teacher types the class note and per-student observations directly, and the admin fills a structured scheduling form. Both paths write through the *same* services and endpoints AI will later feed, so Phase 2 is an input-source change, not a rework. See [`DEFERRED-AI.md`](./DEFERRED-AI.md) for the seam-by-seam inventory.

### 8.1 Voice → class record

```
audio (client) ─signed URL→ Supabase Storage
      │
      ├─1─ ITranscriptionProvider.transcribe(path)  → transcript + language
      │       Whisper (or Deepgram) — must handle English / Telugu / Hindi
      │
      └─2─ IClassNoteExtractor.extract({ transcript, roster, attendance,
                                         subject, level, topics, skills })
              Claude, structured output (Zod → JSON schema, strict)
              →  { overallClassNote,
                   studentObservations[{studentId, observation}],
                   proposedLearningUpdates[{studentId, skillId, newStatus, rationale}],
                   proposedDevelopmentObservations[{studentId, areaId, observation}] }
```

Guardrails: absent students are removed from the roster passed to the model **and** filtered from the output (BR-15). Skill IDs are validated against the class's actual level. Every field lands in the review UI as editable/removable. Nothing persists until `POST /class-records/:id/save`.

### 8.2 Scheduling

`ISchedulingInterpreter` converts free text → `{ studentIds, subjectId, teacherId?, frequency, durationMinutes, timePreference, startDate }` with a confidence flag. **The AI only parses.** `SchedulingEngine.findValidSlots()` — pure, deterministic code — produces the options against capabilities, availabilities, exceptions and existing occurrences. Same split for rescheduling: AI identifies intent + affected classes; the engine validates every proposed move; admin confirms.

### 8.3 Budget

Model IDs and prices (per million tokens):

| Model | ID | Input | Output |
|---|---|---|---|
| Claude Opus 5 | `claude-opus-5` | $5 | $25 |
| Claude Sonnet 5 | `claude-sonnet-5` | $3 ($2 intro to 2026-08-31) | $15 ($10 intro) |
| Claude Haiku 4.5 | `claude-haiku-4-5` | $1 | $5 |

Claude has **no speech-to-text** — STT is a separate provider (Whisper ≈ $0.006/min, or Deepgram for stronger Telugu/Hindi code-switching).

Estimate at 5 teachers × 4 classes/day × 22 days ≈ **440 class records/month**, ~2 min audio each, ~3,000 input / ~1,200 output tokens per extraction:

| Configuration | STT | Extraction | Scheduling | **Total/mo** |
|---|---|---|---|---|
| Opus 5 | ~$6 | ~$20 | ~$2 | **~$28** |
| Sonnet 5 (intro) | ~$6 | ~$8 | ~$1 | **~$15** |
| Haiku 4.5 | ~$6 | ~$4 | ~$1 | **~$11** |

**Recommendation: Opus 5.** The extraction writes into a child's permanent academic record, and the cost fits the stated $30 budget — but with no headroom, so this is a decision for you (Q6). Prompt caching on the system prompt + curriculum context (512-token minimum on Opus 5) trims input cost further. `ai_usage_log` + `GET /admin/ai-usage` make spend visible, with a soft-alert at 80% and a configurable hard stop.

---

## 9. Module delivery plan

Each module ships: Prisma migration → service + repository → Zod contracts in `shared` → API routes → React feature → unit tests on rules → manual verification against its board. **You approve before I start the next one.**

| # | Module | Depends on | Flows |
|---|---|---|---|
| **M0** | Foundation: monorepo, Prisma, Supabase, CI, tokens, shells, system-state components | — | 04 |
| **M1** | Auth & settings: login, forced password change, JWT middleware, RBAC, admin user creation, **forgot-password → admin reset loop** | M0 | 08 |
| **M2** | Curriculum: Subject→Level→Topic→Skill, ordering, archive | M1 | 03 |
| **M3** | Teachers: profile, capabilities, availability, exceptions | M1 | 10 |
| **M4** | Students: add wizard, profile tabs, subject levels, availability, parent access, status | M2, M3 | 09 |
| **M5** | Scheduling: constraint engine, calendar, classes, occurrence materialisation | M3, M4 | 15 |
| **M6** | Home & Needs Attention: admin/teacher home, attention engine, setup checklist | M5 | 01, 05, 04 |
| **M7** | Class record (manual): context, attendance, typed class note, per-student observations, optional updates, final review, atomic save. *AI draft seam stubbed* | M5, M6 | 07, 16 |
| **M8** | Learning Map: skill statuses, level completion, carry-forward | M2, M4, M7 | 14 |
| **M9** | Development: areas, observations, stage changes, evidence timeline | M4, M7 | 13 |
| **M10** | Moments: upload, tagging, gallery, class auto-context | M4, M7 | 12 |
| **M11** | Reschedule flow: pick affected classes, engine revalidates, proposed-moves review, confirm & apply. *NL/voice entry stubbed* | M5 | 06, 15 |
| **M12** | Parent portal + weekly update: home, learning, development, moments, weekly update, PDF | M8, M9, M10 | 02, 11 |
| **M13** | Notifications, polish, deployment: rules, in-app centre, a11y pass, Vercel + Railway | all | 08 §8 |

---

## 10. One-week roadmap

Hour-by-hour, two-track daily schedule: **[`WEEK-1-SCHEDULE.md`](./WEEK-1-SCHEDULE.md)**.

Summary — Day 1 Foundation + Auth · Day 2 Auth complete + Curriculum · Day 3 Teachers + Students · Day 4 Scheduling engine + calendar · Day 5 Home/Needs Attention + Class Record · Day 6 Learning Map + Development + Moments · Day 7 Parent portal + Weekly Update + Notifications + PWA + deploy.

---

## 11. Testing & acceptance

- **Unit (Vitest):** constraint engine, attention grouping, recurrence expansion, level-completion carry-forward, weekly-update selection, permission guards. These encode the business rules and are the regression net.
- **Integration (Supertest + test DB):** the atomic class-record save (including a deliberate mid-save failure → recoverable state), parent scoping, forced password change gate.
- **E2E (Playwright):** the four stories from Part IV of the business document — new school setup, one class through the whole product, what the parent sees, teacher becomes unavailable.
- **Acceptance:** the 10-item MVP checklist in Developer Spec §11 is the definition of done.

---

## 12. Open questions

Each has a **default I will proceed with** if you don't answer — no question blocks the start of M0/M1.

| # | Question | My default |
|---|---|---|
| ~~Q1~~ | **ANSWERED (D1).** Product name is **Valmiki LMS System**. | Logo artwork still needed — placeholder mark until supplied. |
| ~~Q2~~ | **ANSWERED (D2).** Forgot password notifies admins; admin resets and shares the password manually. No email/SMS. | Implemented as F21 / AD-09. |
| ~~Q3~~ | **ANSWERED (D3).** Responsive web + PWA + service worker + VAPID built now; push *delivery* behind `FEATURE_WEB_PUSH` as the flagged follow-up. | Implemented as F22 / M13. |
| **Q4** | **"Week at a glance" narrative.** The parent board shows a written paragraph. Spec §5 approves AI for *only* voice and scheduling. Is that paragraph AI-written or assembled? | **Templated assembly** from approved learning/development items. Cheap, deterministic, in-scope. Say the word and it becomes a third AI workflow (~+$3/mo). |
| **Q5** | **Weekly update publishing.** Auto-generated on a schedule, or does a human review before parents see it? Who writes the teacher note? | Auto-generate Friday 18:00 Asia/Kolkata as `DRAFT`, admin publishes (which fires the single weekly push). Teacher note is optional, added by the class teacher or admin before publish. |
| ~~Q6~~ | **DEFERRED (D4).** AI model choice moves to the Phase-2 kickoff. Cost table retained in §8.3. | — |
| ~~Q7~~ | **DEFERRED (D4).** Voice languages & audio retention move to Phase 2. | — |
| **Q8** | **Multi-child parents.** The parent home shows one child card. Can a parent be linked to several students? | Yes — schema supports it; UI adds a child switcher in the parent header. |
| **Q9** | **Recurrence complexity.** Fixed weekly pattern (days + time + duration), or full RRULE with terms/holidays? | Fixed weekly pattern with a start/end date. No holiday calendar in MVP; admin cancels individual occurrences. |
| **Q10** | **Editing a saved class record.** Allowed after save? Time-limited? | Editable by the authoring teacher for 48 hours, then admin-only; every edit appends to `audit_log` and never rewrites the original learning/development rows. |
| **Q11** | **Development areas catalogue.** Boards show Confidence, Independence, Curiosity, Communication, Collaboration, Resilience, Self-regulation. Fixed seed or admin-editable? | Seeded from the boards, **admin-editable** (add/rename/archive) — costs little and avoids a migration later. |
| **Q12** | **Level progression authority.** "An authorized user" moves a student to the next level. Admin only, or teachers too? | Admin only. Teachers update skill statuses; level change is a structural decision. |
| **Q13** | **PDF weekly report.** In MVP? Server-side (Puppeteer on Railway, +memory) or client-side (react-pdf)? | In MVP, **client-side react-pdf** — no headless-Chrome footprint on Railway, and the data is already loaded in the page. |
| **Q14** | **Typography.** The design system names Aptos, which isn't reliably available on the web. | **Inter** as the sans (the boards' rendering is consistent with it), Georgia as the serif per the spec. |
| **Q15** | **Environments.** One Supabase project or separate staging/production? Who owns the Vercel/Railway/Supabase accounts? | Two Supabase projects (staging + production), Vercel preview deploys per PR, Railway staging + production services. Need your accounts/credentials before M13. |

---

## 13. What I need from you

**Before Day 1 starts:**
1. **Supabase** — project created (or permission for me to create one) + connection strings and service key.
2. **Logo artwork** for Valmiki LMS System. A placeholder wordmark ships until it arrives; swapping it later is a 5-minute change.

**Before Day 7 (deploy):**
3. **Vercel + Railway accounts** (or permission to create under your org).

**Not needed at all this week:** Anthropic API key, STT provider key — deferred with the rest of Phase 2.

Remaining open questions Q4, Q5, Q8–Q15 all have working defaults and do not block any day. Overrule any of them at any point in the week; none is expensive to change before Day 7.
