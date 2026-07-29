# Valmiki LMS System

Homeschool learning portal for **Valmiki International Gurukulam (VIG)**.
Three roles (Admin, Teacher, Parent), 16 locked flows, AI deferred to Phase 2 (D4).

Sources of truth, in priority order: `VIG Developer Document` → `Teacher Parent Portal Features` → `Product Design System Brand Guidelines`.

---

## Layout

The three tiers are separate packages. Nothing reaches across a boundary except
through `shared/`, which holds the wire contracts both sides agree on.

```
VIG_LMS/
├── frontend/     React 19 · TypeScript · Vite · Tailwind v4
├── backend/      Node · Express · TypeScript
├── database/     SQL schema files (source of truth), Prisma client schema, seed
├── shared/       Zod schemas, DTO types, enums, constants  (@vig/shared)
└── docs/         Implementation plan, week-1 schedule, deferred-AI inventory
```

`shared/` is a workspace package imported as `@vig/shared`. It is intentionally
outside `backend/` and `frontend/` so neither tier depends on the other's
internals — the frontend never imports backend source, and the backend never
imports frontend source.

**Backend layering:** `routes → controllers → services → repositories → prisma`.
Controllers hold no business logic; services do no HTTP.

---

## Setup

Requires Node ≥ 20.

```bash
npm install
cp .env.example .env      # then fill in the values below
npm run setup             # applies the SQL schema, syncs Prisma, seeds demo data
npm run dev               # backend :4000 · frontend :3000
```

`npm run setup` is preflight-checked and safe to re-run. It applies
`database/supabase/schema/*.sql` in order, syncs `schema.prisma` from the
result, and seeds. Use `npm run setup:check` to validate credentials without
changing anything.

### What you need to supply

| Variable | Where to find it |
| --- | --- |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (**pooler**, port `6543`) |
| `DIRECT_URL` | Same page, **session pooler**, port `5432` — schema changes only |
| `SUPABASE_URL` | Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Settings → API → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → `service_role` (**server only, never shipped to the browser**) |

Until these are set the API still starts: `/api/v1/health` reports `degraded`,
and sign-in and media return a clear `503` rather than crashing.

### Supabase usage

- **Auth** — username + password with no OTP (F1). Supabase Auth is email-keyed,
  so each user carries a synthetic non-routable alias `<username>@<AUTH_EMAIL_DOMAIN>`
  (AD-02). `POST /auth/login` resolves username → alias and signs in **server-side**;
  the browser never talks to Supabase directly.
- **Postgres** — Express is the only writer (AD-01). Prisma connects through the
  pooler; RLS stays enabled deny-all as defence in depth, and the Supabase data
  API is disabled. Authorization lives in the service layer with the business rules.
- **Storage** — media never proxies through the API (AD-04). The client requests a
  signed upload URL, uploads directly to a private bucket, then confirms; reads
  are short-lived signed URLs issued only after a permission check.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Backend and frontend together |
| `npm run typecheck` | All four packages |
| `npm test` | Business-rule unit tests (Vitest) |
| `npm run build` | Production frontend build |
| `npm run schema:apply` | Apply `database/supabase/schema/*.sql` in order |
| `npm run db:pull` | Re-sync `schema.prisma` + client from the live database |
| `npm run db:seed` / `db:studio` | Seed demo data · browse the database |
| `npm run admin:create` | Create one administrator — the production bootstrap |
| `npm run password:set` | Set or regenerate one account's password |
| `npm run icons` | Regenerate PWA icons |
| `npm run grep:ai` | List every `TODO(AI-PHASE-2)` seam |

---

## Deployment

Supabase for Postgres, Auth and Storage · Render for the API · Vercel for the
web app. `render.yaml` and `vercel.json` configure both hosts from this
repository, and `.github/workflows/` typecheck, test and deploy on push.

Full runbook, including the exact GitHub secrets to add:
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

> `npm run db:seed` creates demo accounts on a shared password that is public in
> this repository. Never run it against production — use `npm run admin:create`
> to bootstrap a single real administrator instead.

---

## Tests

`npm test` covers the locked business rules — the pure logic that everything
else is built on:

| Area | Rule |
| --- | --- |
| Availability resolution | BR-05/BR-06 — exceptions override recurrence on their date only |
| Constraint engine | BR-06 — capability ∧ teacher availability ∧ student availability ∧ no conflict |
| Recurrence expansion | AD-05/Q9 — fixed weekly pattern, end dates, horizon bounds |
| Needs Attention grouping | BR-16 — one root cause = one issue, with drill-down |
| Level completion | BR-08 — unfinished skills identified for carry-forward |
| Permission guards | §2/BR-13 — parent and teacher scoping applied in the query |
| Notification rules | BR-14 — parent gets exactly one push type; roles cannot cross |

Integration tests (atomic class-record save) and Playwright E2E for the four
Part IV stories are the remaining test work.

---

## AI status: deferred (D4)

No AI is wired. Every touchpoint ships as a working manual path with the seam in
place — `ITranscriptionProvider`, `IClassNoteExtractor`, `ISchedulingInterpreter`
are defined with `Manual*`/`Noop*` implementations, and Phase 2 swaps the
registration in the container without touching a route or service.

`ai_usage_log` and `GET /api/v1/admin/ai-usage` ship now and stay empty until
then; the endpoint reports spend against `aiMonthlyBudgetCents` with the 80%
soft alert from §8.3. Full inventory: [`docs/DEFERRED-AI.md`](docs/DEFERRED-AI.md).

---

## PWA (F22 / D3)

Installable manifest, offline shell, and an install prompt. The service worker is
network-first for navigation (falling back to the cached shell), cache-first for
hashed assets, and **never** caches `/api/` — stale school data is worse than no
data, and Flow 04 forbids implying offline editing.

Push **subscriptions** are collected from day one so the device estate is warm;
**delivery** stays behind `FEATURE_WEB_PUSH`. To turn it on: generate a keypair
with `npx web-push generate-vapid-keys`, set `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY`, flip the flag, and wire the transport at the single marked
call site in `backend/src/modules/notifications/push.ts`.

The icon set is a **placeholder** violet mark, generated by `npm run icons`. The
institutional VIG logo must not be recoloured or redrawn to match the product
palette (Brand Guidelines §1), so the real artwork replaces those files when it
arrives.
