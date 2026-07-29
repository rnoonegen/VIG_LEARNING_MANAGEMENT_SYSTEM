# ⚠️ DEFERRED TO PHASE 2 — AI Integration

**Decision D4 (2026-07-27):** All AI is deferred. The one-week build ships every flow with a working **manual** path. This document is the complete list of what is *not* built and exactly where each piece plugs in later.

**Nothing in the product is blocked by this.** Each AI feature is an *input source* for a service that already exists and already works. Phase 2 swaps the input source; it does not rework the flow, the schema, or the UI shell.

---

## 1. What is missing, and what ships instead

| # | AI feature (Phase 2) | What ships now instead | Flow |
|---|---|---|---|
| **AI-1** | Voice recording of the class note | *No recording step.* Teacher goes straight from Attendance to the note screen | 07, 16 |
| **AI-2** | Speech-to-text (English / Telugu / Hindi) | — (nothing to transcribe) | 07, 16 |
| **AI-3** | Split one recording into Overall Class Note + per-student observations | Teacher **types** the Overall Class Note, then types an observation per present student (each optional except the class note) | 07, 16 |
| **AI-4** | AI-proposed Learning Updates (student + skill + new status) | Teacher picks student → skill → new status from the Learning Map picker inside the Optional Updates step | 07, 14, 16 |
| **AI-5** | AI-proposed Development Observations (student + area + text) | Teacher picks student → development area → types the observation in the Optional Updates step | 07, 13, 16 |
| **AI-6** | AI "Processing your voice note…" progress screen | Not rendered. Stepper goes Attendance → Class Note → Optional Updates → Final Review | 07 |
| **AI-7** | Natural-language class scheduling ("Schedule Aarav for Maths with Priya twice a week…") | Structured **Add Class** form: student(s), subject, level, teacher, frequency, duration, time preference, start date | 06 |
| **AI-8** | "We understood your request" interpretation-review screen | Not rendered — the form *is* the structured request, already reviewable and editable | 06 |
| **AI-9** | Voice/NL rescheduling ("Priya is unavailable Friday morning, move her classes…") | Admin opens the Needs Attention issue → sees affected classes → clicks Find New Slots → engine proposes moves | 15 |
| **AI-10** | AI-written "Week at a glance" narrative | Templated assembly from approved learning/development items (Q4 default — already deterministic and in scope) | 02 |

### Deliberately **not** deferred

These read as "AI" on the boards but are plain deterministic code and **ship this week**:

- **The scheduling constraint engine** — capability filter, availability intersection, exception override, conflict detection, recurring-pattern search, Best Match ranking. This is the actual intelligence in scheduling; the AI only ever parsed the sentence.
- **Needs Attention grouping** — rule-based detection and root-cause grouping.
- **Weekly Update item selection** — deterministic query over approved records.
- **Learning-state projection** — `learning_updates` → `student_skill_progress`.

---

## 2. Integration seams (already in the code)

Phase 2 is a DI container change plus UI additions. Nothing below gets rewritten.

### 2.1 Provider interfaces — defined now, manual implementations wired

```ts
// apps/api/src/ai/contracts.ts        ← exists in week 1
export interface ITranscriptionProvider {
  transcribe(audioPath: string): Promise<{ transcript: string; language: string; seconds: number }>;
}

export interface IClassNoteExtractor {
  extract(input: ExtractionInput): Promise<ClassRecordDraft>;
}

export interface ISchedulingInterpreter {
  interpret(rawText: string): Promise<SchedulingRequestDraft>;
}
```

Week 1 registers `ManualClassNoteExtractor` (returns the teacher's typed payload unchanged as a `ClassRecordDraft`) and `NoopTranscriptionProvider` / `NoopSchedulingInterpreter` (throw `NotImplementedError`, never called because no route reaches them). Phase 2 registers the real ones in `apps/api/src/container.ts`. **No service, controller or route changes.**

### 2.2 The draft shape is already the contract

`ClassRecordDraft` — the object the review UI renders and `POST /class-records/:id/save` consumes — is identical whether a human typed it or a model produced it:

```ts
{
  overallClassNote: string;
  studentObservations: { studentId; observation; isAiGenerated: boolean }[];
  proposedLearningUpdates: { studentId; skillId; newStatus; rationale? }[];
  proposedDevelopmentObservations: { studentId; areaId; observation }[];
}
```

`isAiGenerated` and `was_edited` columns exist in `student_observations` from day one and are written `false` this week. This is the single most important seam: **the review-and-approve UI is built now**, so Phase 2 only changes where the draft's initial values come from.

### 2.3 Schema fields that exist now and stay empty

| Table.column | Week 1 value | Phase 2 |
|---|---|---|
| `class_records.transcript` | `NULL` | STT output |
| `class_records.audio_path` | `NULL` | Storage path |
| `class_records.language_detected` | `NULL` | STT detected language |
| `class_records.ai_model` | `NULL` | Model ID |
| `class_records.ai_cost_micros` | `NULL` | Per-record cost |
| `class_records.status` | `DRAFT → IN_REVIEW → SAVED` | adds `TRANSCRIBING`, `PROCESSING`, `FAILED` |
| `student_observations.is_ai_generated` | `false` | `true` for model-authored |
| `scheduling_requests.raw_text` | the form JSON, stringified | the admin's sentence |
| `ai_usage_log` (whole table) | empty | one row per AI call |

No migration is needed to turn AI on. That is intentional.

### 2.4 UI placeholders

- **Class record stepper** — a `RecordSourceStep` slot sits between Attendance and Class Note, rendering nothing this week. Phase 2 mounts the recorder + processing screen there.
- **Add Class wizard step 1** — the structured form is wrapped in a `SchedulingInputPanel` with a `mode` prop (`'form' | 'natural-language'`), hardcoded to `'form'`. Phase 2 adds the textarea + mic and the interpretation-review screen.
- **Needs Attention → Resolve** — routes to the manual reschedule screen. Phase 2 adds a "Describe the change" entry point alongside it.

Every one of these is marked in source with:

```ts
// TODO(AI-PHASE-2): <what goes here> — see docs/DEFERRED-AI.md §<n>
```

Run `pnpm grep:ai` (alias for `rg "TODO\(AI-PHASE-2\)"`) at any time for the live list.

---

## 3. Phase 2 re-entry checklist

When you're ready, this is the whole job:

1. Decide the model (§8.3 of the plan has the cost table: Opus 5 ~$28/mo, Sonnet 5 ~$15/mo, Haiku 4.5 ~$11/mo at ~440 records/month).
2. Choose an STT provider that handles English + Telugu + Hindi code-switching (Whisper ~$0.006/min, or Deepgram).
3. Answer deferred Q6 (model) and Q7 (languages, max recording length, audio retention period).
4. Implement `WhisperTranscriptionProvider` + `ClaudeClassNoteExtractor` + `ClaudeSchedulingInterpreter` against the existing interfaces.
5. Swap the registrations in `container.ts`.
6. Mount the three UI placeholders.
7. Enforce **BR-15**: absent students are stripped from the roster sent to the model *and* filtered from its output.
8. Turn on `ai_usage_log` reporting and the 80% budget alert.

**Estimated Phase 2 effort: 3–4 days**, because the review, approval, persistence and distribution machinery is already built and tested.

---

## 4. Business rules that still apply this week

Deferring AI does not weaken the governance rules — it makes them trivially true:

- **BR-03** (AI never mutates before confirmation) — nothing is AI-generated, and the confirm step still exists.
- **BR-13** (parents see approved outcomes only) — unchanged and fully enforced.
- **BR-02** (Overall Class Note always preserved) — enforced now; it is a required field.
- **BR-19** (atomic multi-part save) — built and integration-tested this week.

The approval layer is the product's spine. It ships first, on purpose, so that AI later plugs into a system that already knows how to say no.
