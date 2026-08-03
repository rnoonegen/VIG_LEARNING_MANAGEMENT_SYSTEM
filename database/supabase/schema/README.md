# SQL schema files

**These files are the source of truth for the database.** Numbered, applied in
order, hand-maintained. Prisma Migrate is not used in this project.

## How schema changes work

```
edit / add a .sql file  →  npm run schema:apply  →  npm run db:pull
                                                         ↓
                                          schema.prisma + Prisma Client
                                          re-synced from the real database
```

1. **Never edit a file that has already been applied anywhere.** Add a new
   numbered file instead — `015_add_student_notes.sql`, `016_…`. That is what
   makes the folder replayable against a fresh project.
2. Apply it: `npm run schema:apply` (or paste into the Supabase SQL Editor).
3. **Re-sync Prisma:** `npm run db:pull`. This runs `prisma db pull` to update
   `database/schema.prisma` from the live database, then regenerates the client.
   Skip it and the TypeScript types silently disagree with the real columns —
   the one failure mode of this setup, and it fails at runtime, not compile time.

`database/schema.prisma` is no longer the schema's source of truth. It exists
only to generate the Prisma Client the backend queries through, and it is
*derived from* the database via `db:pull`.

> **`db:pull` strips comments.** `prisma db pull` rewrites `schema.prisma` from
> the live database and drops every `//` comment — measured here as 61 lines
> down to 6, losing the notes explaining BR-09, BR-12, AD-02 and the rest.
> The structure is unaffected (verified: zero structural difference), but the
> reasoning is not recoverable from the database.
>
> So: after `db:pull`, check `git diff` on `schema.prisma` and restore any
> commentary it removed. If you only added a column, it is usually easier to
> hand-edit `schema.prisma` to match and skip the pull entirely — the pull is a
> convenience, and `prisma generate` is the only step that is actually required.

## The files

| File | Contents |
| --- | --- |
| `001_enums.sql` | 17 enumerated types |
| `002_identity.sql` | school, users, teachers, parents, students, push subscriptions |
| `003_curriculum.sql` | subject → level → topic → skill |
| `004_availability.sql` | teaching capability, weekly availability, dated exceptions |
| `005_learning.sql` | subject levels, skill progress, learning history, level completions |
| `006_scheduling.sql` | classes, occurrences, attendance, scheduling requests |
| `007_class_record.sql` | class records, student observations |
| `008_development.sql` | areas, stages, observations, stage changes |
| `009_moments.sql` | moments, media, student links |
| `010_parent_and_system.sql` | weekly updates, notifications, AI usage, audit log |
| `011_foreign_keys.sql` | all 58 foreign keys |
| `012_rls_deny_all.sql` | RLS enabled deny-all on every table (AD-01) |
| `013_storage_buckets.sql` | private `moments` and `avatars` buckets (AD-04) |
| `014_reference_data.sql` | school settings + development-area catalogue |
| `015_curriculum_authorship.sql` | author + timestamps on headings and sub-headings |
| `016_names_and_contacts.sql` | split names + issued account names, parent mobile |
| `017_teacher_details.sql` | teacher split name, date of birth, address |

Foreign keys live in one file applied last, so the 39 `CREATE TABLE` statements
have no ordering dependency between files. Keep that convention: put new tables
in a new numbered file, and their foreign keys at the end of that same file.

## Idempotency

Every statement is safe to re-run — `CREATE TABLE IF NOT EXISTS`, `DROP
CONSTRAINT IF EXISTS` before each `ADD`, `ON CONFLICT DO NOTHING`, and enums
wrapped in `DO $$ … EXCEPTION WHEN duplicate_object $$`. Re-applying the whole
folder against a live database changes nothing, which makes it both safe to
repeat and a way to verify a database still matches the schema.

Please preserve that property in new files. It is what allows `schema:apply` to
be run without first working out what state the target is in.

```bash
npm run schema:apply          # apply all files, in order, to DATABASE_URL
npm run schema:apply -- --dry # parse and count only, execute nothing
```

## Standing up a new Supabase project

1. Create the project. From **Settings → API** take the Project URL, publishable
   key and secret key; from **Settings → Database** take the connection strings.
2. Fill `.env` (see `.env.example`). Percent-encode any `@` in the password as
   `%40`. If the direct host is unreachable, use the **session pooler** on port
   5432 for `DIRECT_URL` — direct hosts are IPv6-only.
3. `npm run setup` — checks credentials, applies every file, syncs Prisma, seeds.

Or by hand: open each file in numeric order, paste into **SQL Editor → New
query**, Run. Go one at a time if the target is not empty, so a failure tells
you exactly which file broke. Then `npm run db:seed` for accounts — those cannot
be expressed as SQL, because every user is a real Supabase Auth user (AD-02).

## Why RLS has no policies

`012` enables row-level security on all 39 tables and defines **zero policies**.
That is deliberate, not unfinished.

Express is the only writer to Postgres (AD-01) and connects as the table owner,
which bypasses RLS. Nothing else should ever reach these tables — the Supabase
data API is not used, and the browser talks only to the Express API where the
role checks and resource scoping live. Enabling RLS with no policies therefore
costs the application nothing and closes the `anon` / `authenticated` path
completely.

Without it, student records are guarded only by the absence of `GRANT`s to the
API roles — one dashboard toggle away from exposure.

If you ever need a table readable directly by the browser, add an explicit
policy in a **new** numbered file and record why in its header. Never weaken
`012`.
