# Deployment

Three separately hosted pieces. The API does not serve the frontend — it returns
404 for anything outside `/api/v1` — so the two are joined by exactly two
settings: `VITE_API_URL` on the frontend and `CORS_ORIGIN` on the API.

| Piece | Runs on | Notes |
| --- | --- | --- |
| Postgres, Auth, Storage | Supabase | Data API stays **disabled**; Express is the only writer |
| API | Render (free plan) | Long-running Node process |
| Web app | Vercel | Static SPA build |

Railway no longer has a standing free tier — it offers trial credit and then
bills. Render's free web service is genuinely free but **sleeps after ~15
minutes idle** and cold-starts in roughly 30–60 seconds. For a school portal in
evaluation that is usually an acceptable trade; upgrade the plan when it is not.

---

## Repository prerequisites

Three things had to be true before any host could build this. All are now in the
repository, but they are worth understanding because they explain the config.

**1 · The API runs TypeScript directly.** `@vig/shared` publishes raw `.ts`
(`main: ./index.ts`), so there is no compiled output and `tsx` executes the
server at runtime. That is why `tsx` sits in backend **dependencies**, not
devDependencies — hosts set `NODE_ENV=production`, npm then skips dev
dependencies, and the service would die on boot with `tsx: not found`.

**2 · The Prisma client must be generated during the build.** There is no
`postinstall` hook, so `npx prisma generate --schema database/schema.prisma`
belongs in every build command. Install with `--include=dev` so the Prisma CLI
is actually present.

**3 · Install at the repository root.** Both apps consume the `@vig/shared`
workspace. Setting a host's "root directory" to `backend/` or `frontend/` breaks
that link.

---

## 1 · Supabase

Create a **new project**, separate from development. Then:

1. Settings → Database → copy the **pooler** string (port `6543`) and the
   **direct** string (port `5432`).
2. Settings → API → copy the Project URL, the `anon` key and the `service_role`
   key.
3. Confirm the **Data API is disabled**. Authorisation lives in the service
   layer; RLS is deny-all as defence in depth, not as the access model.

## 2 · Schema

From your machine, with a local `.env` pointed at the **production** database:

```bash
npm run setup:check      # validates credentials, changes nothing
npm run schema:apply     # applies database/supabase/schema/*.sql in order
npm run db:generate
```

This creates the tables, the deny-all policies and the private `moments`
storage bucket.

## 3 · The first administrator

> **Do not run `npm run db:seed` against production.** It creates four demo
> accounts sharing the password `Valmiki@2026`, which is hardcoded in
> `database/seed.ts` and therefore public in this repository.

Account creation in the app requires an existing admin, so a fresh database
needs one bootstrapped:

```bash
ADMIN_PASSWORD='<a strong password>' \
  npm run admin:create -- --username anjali --name "Anjali Rao"
```

The password comes from the environment rather than a flag so it stays out of
shell history. Add `--must-change` to force a replacement at first sign-in when
someone other than the account holder runs it. Every other account is then
created from **Accounts** inside the app.

### Promoting a development database to production

Supabase's free plan allows two active projects, so a separate production
project is not always possible. When the development database has to become the
live one, the seeded accounts are the problem: `anjali`, `priya`, `meera` and
`ananya` all hold `Valmiki@2026`, and that string is public in this repository.
Rotate every one of them before the site is reachable:

```bash
npm run password:set -- --username priya --random     # prints a new password once
NEW_PASSWORD='<chosen>' npm run password:set -- --username anjali
```

`--random` generates the password, prints it once and requires the holder to
replace it at first sign-in. Use it for accounts you hand to someone else; set
`NEW_PASSWORD` for your own.

Verify nothing is left on the shared password by signing in with
`Valmiki@2026` — it must fail for every account.

Be aware of what sharing one database means: local development then runs against
live school data. Point `.env` at production only for the commands above, and
keep a separate `.env` for day-to-day work.

## 4 · API on Render

New → Blueprint → point at this repository. `render.yaml` supplies the build
command, start command, health check and the non-secret variables. Render will
prompt for the rest:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase pooler string, port `6543` |
| `DIRECT_URL` | Supabase direct string, port `5432` |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key — server only |
| `CORS_ORIGIN` | The Vercel URL from step 5 |

`PORT` is injected by Render. `AUTH_EMAIL_DOMAIN` is pinned in `render.yaml` and
**must match** whatever the accounts were created with — it forms each user's
login alias, so changing it locks everyone out.

Note the API URL Render gives you, e.g. `https://vig-lms-api.onrender.com`.

## 5 · Frontend on Vercel

Add New → Project → import the repository. Leave the root directory at the
repository root; `vercel.json` supplies the build command, output directory and
the SPA rewrite that stops deep links 404ing.

One environment variable:

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | `https://<your-render-host>/api/v1` — including the `/api/v1` |

Vite inlines this **at build time**. Changing it later requires a redeploy, not
just a settings change.

## 6 · Close the loop

Set `CORS_ORIGIN` on Render to the Vercel URL and redeploy the API.

Then verify `https://<api-host>/api/v1/health`:

```json
{ "status": "ok", "database": "up", "supabase": "configured" }
```

`degraded` or `missing credentials` means the environment variables did not
land. Finally, sign in as the admin and create a teacher — that exercises
Postgres, Auth and the service layer in one action.

---

## GitHub Actions

`.github/workflows/ci.yml` typechecks, runs the unit tests and builds the
frontend on every push and pull request. It needs **no secrets**.

`.github/workflows/deploy.yml` deploys after CI passes. Each job skips itself
with a notice when its secrets are absent, so it is harmless until you connect
the services.

Add these under **Settings → Secrets and variables → Actions → New repository
secret**:

| Secret | Where to get it | Needed for |
| --- | --- | --- |
| `VERCEL_TOKEN` | vercel.com → Account Settings → Tokens → Create | Frontend deploy |
| `VERCEL_ORG_ID` | Vercel project → Settings → General (or `.vercel/project.json` after `vercel link`) | Frontend deploy |
| `VERCEL_PROJECT_ID` | Same place as `VERCEL_ORG_ID` | Frontend deploy |
| `RENDER_DEPLOY_HOOK_URL` | Render service → Settings → Deploy Hook → Copy | API deploy |

That is the complete list. Nothing else belongs in GitHub secrets:

- **Database and Supabase credentials** go in the Render dashboard, not GitHub.
  The API reads them at runtime; CI never touches a database.
- **`VITE_API_URL`** goes in Vercel, because Vercel runs the build.
- **`ADMIN_PASSWORD`** is only ever a local shell variable for step 3.

If you enable Vercel's or Render's own GitHub integration, both services deploy
on push by themselves and `deploy.yml` becomes redundant — pick one mechanism
rather than running both, or every push deploys twice.

---

## Rotating a leaked credential

If a `service_role` key is exposed: Supabase → Settings → API → roll the key,
then update `SUPABASE_SERVICE_ROLE_KEY` in Render and redeploy. It grants full
database access and bypasses RLS, so treat exposure as urgent.
