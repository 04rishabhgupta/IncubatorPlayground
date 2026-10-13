# Startup Floor Connect

An interactive 2D virtual startup floor. Visitors explore a top-down map of the office floor,
discover the companies in each office, and connect with them through live chat, email and
appointment requests.

> **Status:** Phases 1–6 (foundation, authentication and roles, company directory and admin approval, interactive floor map, availability, appointments) are complete. See [docs/CHECKLIST.md](docs/CHECKLIST.md) for
> progress and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design, data model and
> permission model.

New to the codebase? Start with [docs/LEARNING.md](docs/LEARNING.md): concepts explained with links
to the files that use them, plus step-by-step walkthroughs of key flows.

## Tech stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Realtime, Storage) ·
Resend · Vercel

## Prerequisites

- Node.js 20.9+ (developed on Node 24)
- One of:
  - **Supabase Cloud project** (no Docker required), or
  - **Docker Desktop**, to run Supabase locally with `npm run db:start`

## Setup

```bash
npm install
cp .env.example .env.local      # then fill in the values
```

### Option A: Supabase Cloud

1. Create a project at [supabase.com](https://supabase.com).
2. Copy **Project URL**, **Publishable key** and **Secret key** (Project Settings → API Keys) into
   `.env.local`.
3. Link the project and apply the migrations:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npm run db:push
   ```

4. Load the reference data (floor, offices, industries) by running `supabase/seed.sql` in the
   dashboard's SQL editor.
5. In Authentication → URL Configuration, set **Site URL** to `http://localhost:3000` and add
   `http://localhost:3000/**` to the redirect URLs.

### Option B: local Supabase (Docker)

```bash
npm run db:start        # prints the local API URL and keys; copy them into .env.local
npm run db:reset        # applies migrations + seed.sql
```

The local Studio runs at <http://127.0.0.1:54323>, and confirmation emails are captured at
<http://127.0.0.1:54324>.

### Run the app

```bash
npm run dev
```

Open <http://localhost:3000>. To check the database connection, open <http://localhost:3000/api/health>:
it returns `{"status":"ok","database":"reachable"}` once Supabase is configured.

### Configure authentication emails

Sign-up confirmation and password-reset emails are sent by Supabase Auth.

1. **Email delivery.** Supabase's built-in email service only delivers to your project team's
   addresses and is heavily rate-limited, so real users cannot register until you add an SMTP provider.
   Under Authentication → Emails → SMTP Settings, enter your provider's details. For Resend:
   host `smtp.resend.com`, port `465`, username `resend`, password = a Resend API key, and a sender
   on a verified domain.
2. **Email templates (recommended).** The default links only work in the browser that started the
   sign-up. To make them work on any device, set these links under Authentication → Emails → Templates:
   - **Confirm signup:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
   - **Reset password:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/settings/password`

   `/auth/confirm` handles both link styles, so this step is optional.

### Create the first super admin

Super admin is never granted through signup. Register a normal account, then run this in the SQL
editor:

```sql
update public.profiles set role = 'super_admin' where email = 'you@example.com';
```

## Scripts

| Script                     | What it does                                                               |
| -------------------------- | -------------------------------------------------------------------------- |
| `npm run dev`              | Start the dev server                                                       |
| `npm run build` / `start`  | Production build / serve                                                   |
| `npm run lint`             | ESLint                                                                     |
| `npm run typecheck`        | Generate Next route types, then `tsc --noEmit`                             |
| `npm test`                 | Unit tests + database security tests                                       |
| `npm run test:e2e`         | Build, then run browser tests against the Supabase project in `.env.local` |
| `npm run check`            | lint + typecheck + test + build (run before pushing)                       |
| `npm run db:start/stop`    | Local Supabase (Docker)                                                    |
| `npm run db:reset`         | Re-apply migrations and seed locally                                       |
| `npm run db:push`          | Apply migrations to the linked project                                     |
| `npm run db:types`         | Generate `src/types/database.ts` from the linked project                   |
| `npm run db:types:offline` | Generate the same types from the migrations (no Docker or project)         |

## Database tests

`tests/db` runs the real migrations and seed on [PGlite](https://pglite.dev) (Postgres compiled to
WebAssembly). A small shim stands in for Supabase's roles, `auth.uid()` and storage tables. The tests
act as anonymous users, visitors, company accounts and admins, and check the RLS policies, guard
triggers, appointment workflow and conflict constraint. They need no Docker and no network. They
complement, but do not replace, testing against a real Supabase instance.

## End-to-end tests

`npm run test:e2e` builds the app and drives it in Chromium with [Playwright](https://playwright.dev),
on desktop and mobile viewports. It runs against the Supabase project in `.env.local`, so use a
development project, never production:

- Global setup creates confirmed visitor, company and super-admin accounts through the admin API
  (no emails are sent).
- The tests cover sign-in, role-based redirects, protected routes, profile and password forms,
  registration validation, and RLS checks against the real database.
- Teardown deletes every account and company created during the run.

First run only: `npx playwright install chromium`.

A brand-new sign-up through the UI sends a real email, so test it by hand with your own address
once SMTP is configured.

## Security notes

- Row Level Security is enabled on every table. Authorization never relies on the UI.
- `SUPABASE_SECRET_KEY` and `RESEND_API_KEY` are server-only (`src/lib/env.server.ts` imports
  `server-only`). Never prefix them with `NEXT_PUBLIC_`.
- `.env*` files are git-ignored, except `.env.example`.

## Project layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#folder-structure).
