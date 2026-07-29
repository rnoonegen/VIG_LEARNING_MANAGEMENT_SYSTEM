# Valmiki LMS System — One-Week Delivery Schedule

**Window:** Day 1 = **Mon 27 Jul 2026** → Day 7 = **Sun 2 Aug 2026**
**Team assumed:** 2 engineers — **BE** (backend-leaning) and **FE** (frontend-leaning), working in parallel from Day 1.
**Scope:** 16 flows, AI deferred (see [`DEFERRED-AI.md`](./DEFERRED-AI.md)).

> ⚠️ **Days 6 and 7 land on Sat 1 / Sun 2 Aug.** If the team doesn't work weekends, shift to **Mon 3 / Tue 4 Aug** — the day contents are unchanged, the calendar just stretches to 9 elapsed days. Flag this now rather than on Friday.

> ⚠️ **This is an aggressive schedule.** Seven working days for 16 flows, three role portals and a responsive PWA is tight even with AI removed. It is achievable because the schema is designed up front (§5 of the plan) and the two tracks never block each other — but it has no slack. §4 below is the cut list, in the order I'd cut.

---

## Daily rhythm

| Time | |
|---|---|
| 09:00–09:15 | Standup — yesterday's exit criteria confirmed, today's contracts agreed |
| 09:15–13:00 | Block A (3h45) |
| 13:00–14:00 | Break |
| 14:00–17:30 | Block B (3h30) |
| 17:30–18:00 | Integration + demo checkpoint against the day's exit criteria |

**Contract-first rule.** BE's first task each morning is to publish that day's Zod schemas and DTO types into `packages/shared`. FE codes against those types immediately, with MSW mocks if the endpoint isn't live yet. This is what keeps the two tracks from blocking each other — it is not optional.

---

## Day 1 — Mon 27 Jul · Foundation + Auth backbone
**Modules:** M0, M1 (start)

### BE
| Time | Task | Output |
|---|---|---|
| 09:15–10:45 | pnpm workspace + Turborepo; `apps/api`, `apps/web`, `packages/shared`, `packages/config`; shared tsconfig / eslint / prettier | Repo builds, `pnpm dev` runs both apps |
| 10:45–13:00 | Supabase staging project; Prisma init (pooler + `DIRECT_URL`); **schema part 1** — school_settings, users, teachers, parents, parent_students, students, subjects, levels, topics, skills | First migration applied |
| 14:00–15:45 | **Schema part 2** — capabilities, availabilities, exceptions, student_subject_levels, student_skill_progress, learning_updates, level_completions, classes, class_students, class_occurrences, attendance | Second migration applied |
| 15:45–17:30 | **Schema part 3** — class_records, student_observations, development_*, moments_*, weekly_updates_*, notifications, ai_usage_log, audit_log; `seed.ts` (school settings + 1 admin) | Full schema live; RLS deny-all enabled; `GET /health` green |

### FE
| Time | Task | Output |
|---|---|---|
| 09:15–10:30 | Vite + React 19 + TS + Tailwind v4 + shadcn init; path aliases | App boots |
| 10:30–13:00 | `tokens.css` from Design System §14; Tailwind `@theme`; typography scale (Georgia display / Inter sans); subject-colour and learning-state constant maps | Design tokens usable everywhere |
| 14:00–15:45 | System-state components: `EmptyState`, `LoadingState` (skeletons), `ErrorState`, `OfflineBanner`, `StatusChip` (icon + label + colour), `SubjectBadge`, `StageChip` | Component gallery route renders all states |
| 15:45–17:30 | React Router role-gated trees; `AdminShell` (left rail), `TeacherShell`, `ParentShell`, `MobileTabBar`; Axios client + interceptors; TanStack Query provider | Shells render at 375 / 768 / 1280 px |

**Exit criteria:** repo builds and runs; full database schema migrated; three role shells render responsively with placeholder pages; health check green.

---

## Day 2 — Tue 28 Jul · Auth complete + Curriculum
**Modules:** M1 (finish), M2

### BE
| Time | Task | Output |
|---|---|---|
| 09:15–11:15 | Express middleware stack: JWKS JWT verify, `requireRole`, resource guards, Zod validate, error handler, rate limiter, helmet. Auth service: username→email resolve, login, logout, refresh, `/auth/me` | Login returns a session; role enforced server-side |
| 11:15–13:00 | `must_change_password` gate (blocks all non-auth routes); `POST /auth/change-password`; `POST /admin/users` (temp password); **`POST /auth/forgot-password`** (rate-limited, generic response, raises `PASSWORD_RESET_REQUEST` to all admins); **`POST /admin/users/:id/reset-password`** (temp password returned once) | D2 loop working end-to-end |
| 14:00–15:45 | Curriculum service + repository: subjects → levels → topics → skills CRUD, `display_order` reorder, archive semantics | Contracts published to `shared` |
| 15:45–17:30 | Curriculum routes; unit tests: ordering, archive-not-delete, level-name uniqueness per subject | Curriculum API complete |

### FE
| Time | Task | Output |
|---|---|---|
| 09:15–11:00 | Login page (username, password visibility toggle, generic invalid-login error, "Need help accessing your account?"); **Forgot Password** screen + confirmation state | Flow 08 screens 1–4 |
| 11:00–13:00 | First-login **Create a new password** (strength meter, confirm, requirements hint); Settings shell — Profile / Change Password / Notifications / Language / Time Zone; role shown read-only | Flow 08 screens 5–6 |
| 14:00–15:45 | Curriculum Home (subject cards) + Subject Overview (levels list) + Add Subject / Add Level dialogs | Flow 03 screens 1–2 |
| 15:45–17:30 | Level Overview (topics), Topic & Skills view, Skill Detail edit sheet, reorder UI | Flow 03 screens 3–5 |

**Exit criteria:** admin logs in with a temp password, is forced to change it, and builds a complete curriculum (Mathematics → Level 6 → Fractions → 4 skills). A parent taps Forgot Password and the admin sees the request in their notifications.

---

## Day 3 — Wed 29 Jul · Teachers + Students
**Modules:** M3, M4

### BE
| Time | Task | Output |
|---|---|---|
| 09:15–11:00 | Teacher CRUD; teaching capabilities (subject + min/max level order); capability→level resolution helper | Contracts published |
| 11:00–13:00 | Regular weekly availability; dated exceptions; **`resolveAvailability(person, date)`** — exception overrides recurring — with its unit test suite | The rule the scheduler depends on, proven |
| 14:00–15:45 | Student CRUD, subject/level assignment (per-subject current level), weekly availability | Contracts published |
| 15:45–17:30 | Parent access linking, status/archive, student profile aggregate endpoint (`GET /students/:id` → overview + current levels + parent) | Flow 09 API complete |

### FE
| Time | Task | Output |
|---|---|---|
| 09:15–11:00 | Teachers list; Teacher Profile Overview (teaching summary, today, upcoming exceptions) | Flow 10 screens 1–2 |
| 11:00–13:00 | Teaching Capabilities editor; **Weekly Availability grid** (day toggles + time ranges); Add Exception dialog; save confirmation | Flow 10 screens 3–6 |
| 14:00–15:45 | Students list (with per-subject level chips); Student Profile Overview tab; Manage Student menu | Flow 09 screens 1–3 |
| 15:45–17:30 | **Add Student wizard** — 5 steps: Basic Details → Subjects & Levels → Weekly Availability → Parent Access → Review & Create | Flow 09 screens 4–6 |

**Exit criteria:** a teacher exists with capabilities, a weekly availability pattern and a one-day exception; a student exists with per-subject levels, availability and a linked parent account. The scheduler now has real data to work with.

---

## Day 4 — Thu 30 Jul · Scheduling engine + calendar
**Modules:** M5 · **highest-risk day**

### BE
| Time | Task | Output |
|---|---|---|
| 09:15–12:00 | **Constraint engine** (pure, no I/O): capability filter → availability intersection → exception override → existing-occurrence conflict → recurring pattern search → Best Match ranking. Written test-first. | `findValidSlots()` + ~25 unit tests green |
| 12:00–13:00 | Occurrence materialisation: expand recurrence over a 120-day horizon; nightly extend job; idempotent on `(class_id, scheduled_start)` | Occurrences generated |
| 14:00–15:30 | Classes CRUD; `class_students`; cancel-occurrence; **edit regenerates future un-recorded occurrences only** (BR-12) | Flow 15 write API |
| 15:30–17:30 | `GET /schedule?from&to&view`; `GET /occurrences/:id`; `POST /schedule/options` (structured request → ranked slots) | Flow 06/15 read API |

### FE
| Time | Task | Output |
|---|---|---|
| 09:15–11:00 | Schedule **week grid** — time axis, day columns, subject-coloured class blocks, timezone footer | Flow 15 screen 1 |
| 11:00–13:00 | **Day view**, date navigation, Today, week/month/list toggle | Flow 15 screen 2 |
| 14:00–15:30 | **Add Class wizard** step 1 — structured request form (students, subject, level, teacher, frequency, duration, time preference, start date), wrapped in `SchedulingInputPanel mode="form"` | Flow 06 screens 2–3 substitute |
| 15:30–17:30 | Slot options list with **Best Match** badge and per-option constraint checks; Review & Confirm; Class Scheduled success screen | Flow 06 screens 4–7 |

**Exit criteria:** admin requests "Mathematics, Aarav + Priya, twice a week, mornings, 1 hour", gets ranked valid options that respect capability + both availabilities + the exception, confirms one, and sees the recurring class on the week grid.

---

## Day 5 — Fri 31 Jul · Home, Needs Attention, Class Record
**Modules:** M6, M7

### BE
| Time | Task | Output |
|---|---|---|
| 09:15–11:00 | **Attention engine**: teacher-unavailable, student-unavailable, schedule conflict, incomplete student setup, class-record overdue, setup incomplete → grouped by deterministic `groupKey` (BR-16) + unit tests | `GET /attention` |
| 11:00–13:00 | `GET /home/admin`, `GET /home/teacher`, `GET /setup/progress` (dependency-ordered checklist) | Flow 01/04/05 API |
| 14:00–15:30 | `GET /occurrences/:id/context` (roster + previous class record); `PUT /occurrences/:id/attendance`; class-record draft create + PATCH | Flow 07/16 API part 1 |
| 15:30–17:30 | **`POST /class-records/:id/save`** — one Prisma `$transaction`: attendance + class note + observations + learning updates (+ `student_skill_progress` projection) + development observations + moment links. Integration test including a forced mid-save failure → recoverable state (BR-19) | The product's spine, tested |

### FE
| Time | Task | Output |
|---|---|---|
| 09:15–11:00 | **Admin Home**: today's classes timeline + Needs Attention cards (grouped, with drill-down) + "Everything looks good" + "No classes scheduled today" | Flow 01 screens 1–4, Flow 05 |
| 11:00–13:00 | Brand-new / partially-configured Home with **setup checklist**; **Teacher Home** (today, class records due, upcoming) | Flow 04 screens 1–3, Flow 05 screen 5 |
| 14:00–15:30 | Open Class / before-class context (students, previous class record); **Attendance** screen (Present / Absent / Late per student, running tally, optional note) | Flow 07 screens 1–2, Flow 16 screens 2–3 |
| 15:30–17:30 | Class-record **stepper**: Overall Class Note (typed, required) → per-student Observations (typed, optional); `RecordSourceStep` placeholder slot mounted but empty | Flow 07/16, AI-3 manual substitute |

**Exit criteria:** teacher opens today's class, sees who's in it and what happened last time, marks attendance, types the class note and two student observations, and saves. Admin Home shows a grouped "Priya is unavailable — 3 classes affected" issue that drills through to the affected classes.

---

## Day 6 — Sat 1 Aug · Learning Map, Development, Moments
**Modules:** M8, M9, M10

### BE
| Time | Task | Output |
|---|---|---|
| 09:15–10:30 | Learning Map read; skill status update — append `learning_updates` + project `student_skill_progress` in one transaction (BR-09) | Flow 14 API |
| 10:30–12:00 | Level completion **preview** (mastered / remaining counts) + confirm + carry-forward + history preservation (BR-08) + unit tests | Flow 03 screen 6, Flow 14 screen 6 |
| 12:00–13:00 | Development: areas catalogue (seeded from boards, admin-editable), observations, stage change + `development_stage_changes` audit | Flow 13 API |
| 14:00–15:30 | Moments: signed upload URL, create moment, tag many students to one media object (BR-11), gallery query with filters, signed read URLs | Flow 12 API |
| 15:30–16:45 | **Distribution wiring**: class-record save → learning updates + development observations + moment links land in the right places (Flow 07 §C) | One save updates three surfaces |
| 16:45–17:30 | Parent read endpoints, scoped in the repository layer: children, learning, development, moments | Flow 11 API |

### FE
| Time | Task | Output |
|---|---|---|
| 09:15–11:00 | **Student Learning Map**: subject tabs → current level → topics → skills with status chips; status distribution summary | Flow 14 screens 2–4 |
| 11:00–13:00 | Edit Skill sheet (status radio, note, evidence); **Move to Level 7** modal (level summary, carry-forward choice, confirm) | Flow 14 screens 5–6 |
| 14:00–15:30 | Development: student overview (areas by category with stages), Area Detail evidence history, Add Observation, Update Stage (optional) | Flow 13 screens 1–6 |
| 15:30–16:45 | Moments gallery/grid, Add Moment (upload → select students → title/caption → auto-filled context), Moment Detail | Flow 12 screens 1–6 |
| 16:45–17:30 | Class-record **Optional Updates** step (add learning update / add development observation / attach media) + **Final Review** + Saved confirmation | Flow 07 screens 6–8 |

**Exit criteria:** one saved class record demonstrably updates the student's Learning Map, appends a dated Development observation, and creates a tagged Moment — without the teacher visiting three modules.

---

## Day 7 — Sun 2 Aug · Parent portal, Weekly Update, Notifications, PWA, deploy
**Modules:** M12, M13

### BE
| Time | Task | Output |
|---|---|---|
| 09:15–10:30 | Weekly Update generator: item selection from approved records + **templated** Week at a Glance; Friday 18:00 Asia/Kolkata job; DRAFT → PUBLISH | Flow 02 API |
| 10:30–12:00 | Notification rules (BR-14): parent 1/week on publish · teacher scheduling + record-due · admin operational + password-reset requests; list / mark-read endpoints | Flow 02 screens 4–5 |
| 12:00–13:00 | VAPID keypair, push-subscription storage endpoints, send path behind `FEATURE_WEB_PUSH` (off) | D3 infrastructure |
| 14:00–15:30 | **Railway deploy** (staging + production): env config, migrations, CORS, rate limits, helmet, log redaction | API live |
| 15:30–16:30 | Demo seed data (curriculum, 2 teachers, 5 students, a week of classes and records); audit-log wiring | Demoable environment |
| 16:30–18:00 | Walk the **MVP acceptance checklist** (Dev Spec §11) + the four Part IV stories | Sign-off evidence |

### FE
| Time | Task | Output |
|---|---|---|
| 09:15–10:30 | **Parent Home**: child card, weekly-update CTA, Learning Now, Development Snapshot, recent Moment, child switcher | Flow 11 screen 1, Flow 02 screen 2 |
| 10:30–12:00 | **Weekly Update**: Overview / Learning / Development / Moments tabs + teacher note; **Download PDF** (react-pdf) | Flow 02 screen 3 |
| 12:00–13:00 | Parent Learning / Development / Moments tabs (read-only) | Flow 11 screens 2–4 |
| 14:00–15:00 | Notification centre + unread badges for all three roles | Flow 02 screens 4–5 |
| 15:00–16:00 | **PWA**: manifest, icon set, Workbox service worker, offline shell, install prompt, push-subscription registration | D3 / F22 |
| 16:00–17:00 | Accessibility + responsive pass: 44×44 targets, WCAG AA contrast, keyboard nav, focus rings, reflow at 375 / 768 / 1280 | §10 compliance |
| 17:00–18:00 | **Vercel deploy** + smoke test of the four stories on production | Shipped |

**Exit criteria:** the full cycle runs on staging — admin sets up the school, schedules a class, teacher records it, parent receives and reads the weekly update — and the MVP acceptance checklist is green.

---

## 2. Critical path

```
Day 1 schema ──▶ Day 2 curriculum ──▶ Day 3 students+teachers ──▶ Day 4 ENGINE ──▶ Day 5 class record ──▶ Day 6 distribution ──▶ Day 7 parent
                                                                      ▲
                                                          single biggest risk
```

Everything downstream of **Day 4's constraint engine** depends on it. It is scheduled test-first in the freshest block of the day for that reason. If it isn't green by 12:00 Thursday, escalate the same morning — don't absorb it silently.

## 3. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Constraint engine overruns Day 4 | Medium | High — blocks Days 5–7 | Test-first, pure function, no I/O. FE builds the calendar against MSW mocks and is unblocked regardless. Hard escalation at Thu 12:00. |
| Atomic class-record save is fiddly (Day 5 PM) | Medium | High | Single Prisma `$transaction`, integration test written before the happy path. |
| Occurrence materialisation edge cases (DST, end dates, mid-week edits) | Medium | Medium | School timezone is fixed (`Asia/Kolkata`, no DST). Store `timestamptz`, render in school tz. |
| Supabase Storage + signed URL setup friction (Day 6) | Low | Medium | Spike it on Day 1 as part of setup; 30 min, not on the critical path. |
| Design fidelity to the boards slips under time pressure | High | Low–Medium | Tokens + shared components on Day 1 make fidelity the default. Accept minor deviation over missed function. |
| 7 consecutive days including a weekend | — | — | Confirm the calendar before Day 1 (see banner). |

## 4. Cut list — in the order I would cut

If we're behind on Day 6, cut from the top. Each is a deliberate, reversible reduction, not silent scope loss:

1. **PDF weekly report** — a "coming soon" toast. Half a day back.
2. **Level-completion carry-forward UI** — keep the API and the preview; admin picks carry-forward next sprint. Half a day.
3. **Moments video support** — photos only for launch. Quarter day.
4. **Web push infrastructure** (already flagged) — in-app notification centre only. Half a day.
5. **Notification centre UI** — badge counts only, full list next sprint. Quarter day.
6. **Development area admin editing** — ship the seeded catalogue read-only. Quarter day.

**Never cut:** the atomic save, parent data scoping, the forced-password-change gate, or the empty/loading/error/offline states. The first two are correctness, the third is security, and the fourth is an explicit locked requirement (Flow 04).

## 5. Solo-developer variant

One engineer instead of two: **12 working days**, same order. Merge each day's BE and FE tracks and run them consecutively — Days 1–2 become Days 1–3, Day 4 stays whole (engine morning, calendar afternoon, +1 day for the UI), Days 6–7 split into four. Do not compress by skipping the Day 1 token/component work; it is what makes Days 5–7 fast.
