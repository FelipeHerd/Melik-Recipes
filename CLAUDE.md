# Melik Recipes

React 19 + TanStack Start (SSR, file-based routing) on Vite 8 + Nitro, self-hosted
on Docker. Formerly built on Lovable with a Supabase backend — both are gone.
Postgres via Kysely, a custom JWT auth stack, local-disk file storage with
HMAC-signed URLs, and OpenAI for the Chef AI assistant.

## Architecture map

- `src/routes/*` — file-based pages, plus a few public API routes under
  `src/routes/api/public/` (file-serving, cron hooks).
- `src/lib/*.functions.ts` — TanStack Start server functions (`createServerFn`).
  This is the business-logic layer; components call these directly, and the
  framework turns them into RPC calls from the client. Most of the app's
  logic lives here.
- `src/lib/*.server.ts` — server-only helpers, never imported at module scope
  from a `*.functions.ts` file (see "Gotchas" below for why).
- `src/lib/db.server.ts` — the single Kysely/Postgres client (`db`), plus
  `toJsonb()` and `isoOrNull()` helpers (see Gotchas).
- `src/lib/auth/*` — JWT issuance/verification, session storage, authorization.
- `src/lib/storage/*` — local-disk file storage + signed URLs + thumbnails.
- `src/lib/cron/*` — the in-process scheduler and job bodies.

## Database schema

Single source of truth: `db/init/001_schema.sql`, mounted into the postgres
container at first boot. There is no migration history — this file is the
final schema state, authored from Supabase's old migration history when the
app was migrated off Supabase (no data migration was needed; the app was
pre-launch at the time).

Tables: `users` (replaces Supabase's `auth.users`), `password_reset_tokens`,
`profiles`, `recipes`, `user_roles` (source of truth for admin/dev checks —
`profiles.role` is a denormalized display copy kept in sync by the app layer
on role changes), `notifications`, `discover_chats`, `error_reports`,
`admin_audit_log`, `ai_usage`, `bakery_unlocks`, `presence_heartbeats`.

RLS and privilege-escalation triggers that Supabase used to enforce are gone
— the Node backend is now the only thing that ever runs SQL, so authorization
is enforced explicitly in `src/lib/auth/authorize.server.ts` instead (see
Gotchas). The one DB-level trigger kept is `protect_original_author` on
`recipes` (pure data integrity, not authorization).

To apply the schema outside Docker: `psql $DATABASE_URL -f db/init/001_schema.sql`.

## Auth model

- JWTs (`src/lib/auth/jwt.server.ts`) carry `{ sub, email, tokenVersion }` —
  deliberately **no role claim**. Role/premium/kiko-block status change
  often; every authorization check re-reads the DB per request rather than
  trusting a claim that could go stale between issuance and use.
- Passwords are hashed with `bcryptjs` (pure JS, not `bcrypt` — see the
  Docker section for why).
- "Sign out everywhere" works via `users.token_version`: bumping it
  invalidates every previously issued token, checked on every request in
  `require-auth.ts`.
- Client session state lives in `src/lib/auth/session-store.ts`
  (`localStorage`-backed, replaces Supabase's `onAuthStateChange`).
- **No email sending is wired up.** Signup auto-confirms accounts. Password
  reset (`requestPasswordReset` in `auth.functions.ts`) generates a token,
  logs it server-side, and stores it in `password_reset_tokens` — there's no
  admin UI surfacing pending tokens yet. Wire up real SMTP by filling in
  `src/lib/notifications/mailer.server.ts`'s `sendResetEmail`; no other code
  needs to change.
- Admin "impersonate user" issues a short-lived (5 min) token the admin
  panel swaps directly into the current tab's session — there's no email
  link step. The admin will need to log back in as themselves afterward.

## Storage model

Files live on disk under `UPLOADS_DIR` (`/data/uploads` in Docker — a named
volume), organized by bucket: `recipe-images/{userId}/{uuid}.{ext}` (plus
`recipe-images/thumbs/...` for pre-generated thumbnails), `avatars/avatar_{userId}.jpg`,
`chat-images/{userId}/{chatId}/{uuid}.{ext}`.

Access is always through an HMAC-signed, expiring URL
(`src/lib/storage/signed-url.server.ts`, secret in `STORAGE_SIGNING_SECRET`),
served by `src/routes/api/public/files/$bucket/$.ts` — the **only** route
with no JWT check, protected purely by the signature.

Thumbnails are generated once at **upload time** via `sharp`
(`src/lib/storage/thumbnail.server.ts`), not on-the-fly — local disk has no
live-transform API the way Supabase Storage did. If a thumbnail is missing
for an older path, signing falls back to the full-size original.

## Realtime (notifications)

The notification bell polls (`refetchInterval: 30_000` in
`NotificationsButton.tsx`) rather than pushing live updates over a
WebSocket. This was a deliberate scope decision during the Supabase
migration — a full Nitro WebSocket integration was left as a follow-up. If
you build it: `src/lib/realtime/` is the intended location, and every
`notifications` insert path (`sendNotification`, cron jobs, etc.) has a
`// TODO(realtime phase)` marker where a push call should go.

## Cron

Two jobs (`src/lib/cron/jobs.server.ts`): `runTrialExpiringReminder` and
`runMelikPlusRenew`, formerly triggered by Supabase's `pg_cron`. Now run via
an in-process `node-cron` scheduler (`src/lib/cron/scheduler.server.ts`,
started once from `src/server.ts`). The original HTTP routes
(`src/routes/api/public/hooks/*.ts`) still exist as a manual-trigger escape
hatch, gated by an `X-Cron-Secret` header matching `CRON_SECRET`.

## AI

Chef AI ("Kiko") calls OpenAI directly (`src/lib/ai-gateway.server.ts`,
`OPENAI_API_KEY`), replacing Lovable's AI Gateway. The request/response
shape was already OpenAI-compatible, so this was a URL/key swap — default
model is `gpt-4o-mini` (vision-capable, since chat messages can include
image blocks). ElevenLabs voice (`src/lib/voice.server.ts`) is unrelated to
this migration and unchanged.

## Dev commands

- `npm run dev` — Vite dev server. Needs `DATABASE_URL` pointing at a
  reachable Postgres with the schema applied.
- `npm run build` — production build (`.output/server/index.mjs` is the
  Node entry).
- `docker compose up --build` — full stack (app + postgres) using the
  Dockerfile and `docker-compose.yml` at the repo root.
- Single lockfile: `package-lock.json` (npm). `bun.lock`/`bunfig.toml` were
  removed — bun wasn't available when this was migrated; reintroduce only
  deliberately.

## Environment variables

See `.env.example` for the full list with descriptions. Summary:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Signs access tokens |
| `STORAGE_SIGNING_SECRET` | Signs file URLs |
| `CRON_SECRET` | Gates the manual cron HTTP routes |
| `UPLOADS_DIR` | Local file storage root |
| `OPENAI_API_KEY` | Chef AI |
| `APP_DOMAIN` | Whitelisted link domain in admin broadcast notifications |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_AGENT_ID` | Kiko voice assistant |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | docker-compose only |
| `APP_PORT` | Host port the app container publishes (default 3000) |

## Gotchas

- **jsonb columns need `JSON.stringify` before insert/update.** node-postgres
  does not auto-serialize JS arrays/objects for jsonb columns — a raw array
  gets bound as a Postgres `ARRAY` literal and fails with `invalid input
  syntax for type json` (verified against a live instance). Always use
  `toJsonb()` from `db.server.ts` when writing to `ingredients_json`,
  `instructions_json`, `messages`, or `metadata`.
- **`profiles.voice_usage_date` (a `date` column) needs its pg type parser
  disabled.** node-postgres's default `date` parser builds a `Date` object
  anchored to the *server's local timezone*, which can silently shift the
  calendar day depending on host TZ. `db.server.ts` disables this parser
  (oid 1082) so the column stays a plain `"YYYY-MM-DD"` string, matching
  what the app's lazy-reset logic (`voice.server.ts`) compares against.
- **timestamptz columns come back as JS `Date` objects, not ISO strings.**
  Supabase/PostgREST used to send ISO strings over the wire; several server
  functions convert back with `isoOrNull()` from `db.server.ts` before
  returning to the client. If you add a new endpoint returning a timestamp
  field, do the same conversion.
- **Never statically import a `*.server.ts` file from a `*.functions.ts`
  file (or anything else reachable from a route).** TanStack Start's
  import-protection treats the `.server.ts` filename suffix as an enforced
  boundary — a module with that suffix can never be *statically* imported
  from code that's part of the client bundle graph, even if the actual
  reference only executes server-side (e.g. inside a middleware's
  `.server()` callback). This is why `src/lib/auth/require-auth.ts` (the
  shared `requireAuth` middleware, imported at module scope by every
  `*.functions.ts` file) is deliberately **not** named `.server.ts`, and why
  its own `db`/`jwt` imports are dynamic (`await import(...)`) inside the
  `.server()` callback rather than static top-of-file imports. Every other
  server-only helper (`db.server.ts`, `authorize.server.ts`, etc.) is only
  ever reached via `await import(...)` inside a handler body — never a
  top-level `import`. Follow this pattern for any new server-only module.
- **Server *routes* (`createFileRoute(...).server.handlers`) don't get the
  same client-bundle stripping as `createServerFn` handlers.** A
  `createServerFn().handler(...)` body is specially transformed so the
  client bundle only keeps an RPC stub; a plain server route's handler body
  is not. If a server route needs to dynamically import a `.server.ts`
  module (see the two cron hook routes), wrap the handler in
  `createServerOnlyFn(...)` from `@tanstack/react-start` — otherwise the
  build fails with an import-protection error.
- **Username is immutable once set.** `claimUsername` in
  `username.functions.ts` only succeeds via `WHERE username IS NULL` —
  never write `profiles.username` through a generic update path.
- **`recipes.original_author` is frozen once set**, enforced by the
  `protect_original_author` DB trigger. Don't try to "fix" an author
  attribution by updating this column directly.
- **Bakery-unlock cadence lives in JS, not SQL.** The authoritative logic is
  `computeUnlockStats()` in `melik-plus.functions.ts` (6-month cadence). The
  old Supabase SQL RPC `my_bakery_unlocks_summary` had a divergent, stale
  3-month cadence and was intentionally not ported — don't resurrect it.
- **Admin-only profile/recipe columns must go through the sanitize helpers.**
  `sanitizeProfilePatch` / `sanitizeRecipePatch` /
  `sanitizeNotificationPatch` in `authorize.server.ts` strip privileged
  fields (`is_premium`, `role`, `is_official_melik`, `share_token`, etc.)
  unless the caller is an explicitly trusted internal context (cron jobs,
  admin CRM actions). These replace what Supabase's privilege-escalation
  triggers used to enforce at the DB level — there is no DB-level backstop
  anymore, so don't bypass them with a raw `db.updateTable(...)` on a
  user-supplied patch object.
- **`dev` role is not `admin`.** `isAdmin()` and `isDev()` in
  `authorize.server.ts` are separate checks; several admin panel actions
  (official recipe flags, impersonation, CRM writes) are admin-only and
  intentionally exclude `dev`.
- **`sharp`'s native binary can't be bundled by Nitro.** The Dockerfile
  copies `node_modules/sharp` and `node_modules/@img` directly from the
  build stage rather than trusting Nitro's traced-dependency install step,
  which picked the wrong libc variant in testing (a bug in the pinned nitro
  beta, `3.0.260903-beta`). If you upgrade nitro, sanity-check that a fresh
  `docker compose up --build` still finds a working `sharp` at runtime
  before removing that workaround.
- **Hardcoded `*.lovable.app` URLs remain in several routes' canonical/OG
  meta tags** (`auth.tsx`, `chef.tsx`, `descubrir.tsx`, `index.tsx`,
  `melik-bakery.tsx`, `__root.tsx`, `profile.tsx`, `sitemap[.]xml.ts`, and
  the CRM's admin notification composer). These weren't updated during the
  migration because the real self-hosted domain wasn't known yet — update
  them (and set `APP_DOMAIN` in `.env`, and the `Sitemap:` line in
  `public/robots.txt`) once it is.
