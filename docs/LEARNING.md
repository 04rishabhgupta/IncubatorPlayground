# Learning guide

This guide explains the ideas behind Startup Floor Connect and points to the files where each one is used.
Read it alongside the code. [ARCHITECTURE.md](ARCHITECTURE.md) is the short reference; this file explains
the _why_. It is updated at the end of every phase.

**Contents**

1. [The big picture](#1-the-big-picture)
2. [Next.js concepts](#2-nextjs-concepts)
3. [Supabase and Postgres concepts](#3-supabase-and-postgres-concepts)
4. [Security patterns](#4-security-patterns)
5. [The floor map](#5-the-floor-map)
6. [Appointments: time, overlaps and workflow](#6-appointments-time-overlaps-and-workflow)
7. [Testing strategy](#7-testing-strategy)
8. [Walkthroughs: what happens when…](#8-walkthroughs-what-happens-when)
9. [What each phase added](#9-what-each-phase-added)
10. [Glossary](#10-glossary)

---

## 1. The big picture

```
Browser ──HTTP──► Next.js on Vercel ──SQL over HTTPS──► Supabase (Postgres + Auth + Storage + Realtime)
   ▲                  │
   └── Realtime ◄─────┴── (WebSocket straight from Supabase to the browser)
```

- **Next.js** renders the pages and runs the "backend" code: Server Components and Server Actions.
- **Supabase** stores the data, signs users in, stores logos and pushes live changes.
- The most important rule in this project: **the database decides who may see or change what.**
  The UI hides buttons for convenience, but every rule is enforced again in Postgres (Row Level
  Security, guard triggers and constraints). A bug in a page can show the wrong button. It can't
  leak or corrupt data.

Folder map:

| Folder                 | What lives there                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `src/app/`             | Routes. Each folder is a URL; `page.tsx` is the page.                                      |
| `src/components/`      | Reusable UI. `ui/` holds generic pieces (buttons, fields); the other folders are features. |
| `src/lib/`             | Logic: data queries (`queries.ts`), mutations (`actions.ts`), validation, helpers.         |
| `supabase/migrations/` | The database, as ordered SQL files. **Source of truth for the schema and security.**       |
| `tests/`               | Unit tests and database tests (fast, no network).                                          |
| `e2e/`                 | Browser tests against a real build and the Supabase dev project.                           |

---

## 2. Next.js concepts

### App Router, layouts and route groups

A folder under `src/app` becomes a URL segment. `page.tsx` renders the page, and `layout.tsx` wraps all
pages below it.

- **Root layout:** [src/app/layout.tsx](../src/app/layout.tsx) adds the header and footer to every page.
- **Route groups:** folders in parentheses, such as `(auth)` and `(dashboard)`, group pages under a
  shared layout without adding anything to the URL. `src/app/(dashboard)/company/page.tsx` is served at `/company`.
- **Dynamic segments:** `[slug]` captures part of the URL. In
  [companies/[slug]/page.tsx](../src/app/companies/[slug]/page.tsx), `/companies/acme` gives `slug = "acme"`.

### Server Components vs Client Components

- By default a component is a **Server Component**. It runs only on the server, can read the
  database directly, and sends finished HTML to the browser, without shipping its JavaScript.
- A file starting with `"use client"` is a **Client Component**. It runs in the browser too and can
  use state (`useState`), effects and event handlers such as `onClick`.
- Rule of thumb in this project: pages fetch data on the server and pass plain data into small
  client components for interaction. The homepage is an example:
  [page.tsx](../src/app/page.tsx) (server) loads the floor and passes it to
  [floor-explorer.tsx](../src/components/floor/floor-explorer.tsx) (client).

### Cache Components, `<Suspense>` and `connection()`

Next 16 (with `cacheComponents: true` in [next.config.ts](../next.config.ts)) tries to **prerender**
as much of each page as possible ahead of time. Anything that depends on the request (cookies, the
signed-in user, URL search params) must be inside a `<Suspense>` boundary. Next then sends the
static shell instantly and streams the personal parts in afterwards.

- `loading.tsx` files are automatic Suspense boundaries for a whole route group, e.g.
  [(dashboard)/loading.tsx](<../src/app/(dashboard)/loading.tsx>).
- The header's user menu is wrapped in `<Suspense>` in
  [site-header.tsx](../src/components/layout/site-header.tsx), so the logo and navigation appear before the session is checked.
- `await connection()` says "this must run at request time". It is called inside the server
  Supabase client ([supabase/server.ts](../src/lib/supabase/server.ts)), because supabase-js reads the
  clock on every query, which Next would otherwise reject during prerendering. (We hit this as a real bug in Phase 2.)
- `unstable_rethrow(error)` in `catch` blocks lets Next's internal signals pass through. Without it,
  a `try/catch` around data loading would swallow them and log false errors (a Phase 3 bug).

### Server Actions and forms

A **Server Action** is an `async` function in a `"use server"` file that a form can call directly.
Next turns it into a secure HTTP endpoint for you. Example: [lib/auth/actions.ts](../src/lib/auth/actions.ts).

The pattern used everywhere:

```tsx
// client form
const [state, action] = useActionState(saveTeamMember, initialFormState);
<form action={action}> … {state.fieldErrors?.fullName} … </form>;

// server action
export async function saveTeamMember(_prev: FormState, formData: FormData): Promise<FormState> {
  // 1. who is calling? (ownCompany / getSession)   2. validate with zod
  // 3. write with the user's Supabase client (RLS applies)   4. revalidatePath(...)   5. return a FormState
}
```

- [lib/forms.ts](../src/lib/forms.ts) defines `FormState`: `status`, `message`, `fieldErrors`, and
  `values`, which refill the form after an error.
- **Treat every Server Action like a public API.** Anyone can call it with any data, so each one
  checks the caller and validates input with zod ([lib/validation/](../src/lib/validation/)).
- **Only export real actions from `"use server"` files.** Every export becomes callable from the
  browser. Shared helpers live in `server-only` modules instead, such as
  [companies/owner.ts](../src/lib/companies/owner.ts).
- React 19 resets a form after its action runs. Two consequences you'll see in the code:
  `<select>` elements need their value restored, as in
  [company-register-form.tsx](../src/components/auth/company-register-form.tsx). And a success message
  disappears if the component showing it unmounts, so the admin placement panel keeps one shared result
  ([floor-placement.tsx](../src/components/admin/floor-placement.tsx)).

### Refreshing data after a change

- `revalidatePath("/directory")` (server) marks pages as stale, so the next view re-reads data.
- `router.refresh()` (client) re-runs the current page's Server Components and merges the new result in,
  **without losing client state**. Live updates use it
  ([live-refresh.tsx](../src/components/realtime/live-refresh.tsx)).
- `window.history.pushState` changes the URL without reloading. The map stores its selection in
  `?company=…` this way, so links can be shared and the back button works
  ([floor-explorer.tsx](../src/components/floor/floor-explorer.tsx)).

### Proxy (formerly "middleware")

[src/proxy.ts](../src/proxy.ts) runs before every request. It refreshes the Supabase session cookie, and
redirects signed-out users away from `/account`, `/company`, `/admin`, `/settings` and `/notifications`.
This is only an **optimistic** check for nicer UX. The real checks happen in pages and in the database.

---

## 3. Supabase and Postgres concepts

### Three Supabase clients

| Client  | File                                                | Acts as                          | Used for                                                         |
| ------- | --------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| Browser | [supabase/client.ts](../src/lib/supabase/client.ts) | signed-in user (publishable key) | Realtime subscriptions                                           |
| Server  | [supabase/server.ts](../src/lib/supabase/server.ts) | signed-in user (from cookies)    | almost every query and action                                    |
| Admin   | [supabase/admin.ts](../src/lib/supabase/admin.ts)   | **service role: bypasses RLS**   | rare cases, e.g. saving a logo before the new user has a session |

The secret key is only read in [env.server.ts](../src/lib/env.server.ts), which imports `server-only`.
If a Client Component ever imports it, the build fails. That's how the secret is kept out of the browser.

### Authentication and sessions

- Supabase Auth issues a **JWT** (a signed token containing the user id), stored in cookies.
- `supabase.auth.getClaims()` verifies the token. [lib/auth/session.ts](../src/lib/auth/session.ts) wraps
  this in `getSession()`, `requireSession()` and `requireRole()`, which every protected page calls. The
  Next docs call this the "Data Access Layer".
- **Signup trigger:** when Supabase creates a row in `auth.users`, the function `handle_new_user`
  creates the matching `profiles` row. For company sign-ups it also creates the pending company and its
  registration request, **in the same transaction**: if any part fails, nothing is created
  ([company_signup migration](../supabase/migrations/20261013100000_company_signup.sql)).

### Row Level Security (RLS)

RLS attaches a `WHERE` clause to every query, decided by the database:

```sql
create policy "companies: public read approved" on public.companies
  for select to anon, authenticated using (status = 'approved');
```

- `using (…)` filters which rows you can read or update; `with check (…)` validates new or changed rows.
- `auth.uid()` is the id of the signed-in user, taken from their JWT.
- Grants (`grant select …`) decide which roles may touch a table at all, and policies then decide which
  rows. Both are in [security migration](../supabase/migrations/20261012100100_security.sql).
- **Lesson from Phase 1:** new Supabase projects don't grant the `service_role` access to your tables by
  default. Revoking everything and granting explicitly is safest, but you have to remember every role
  ([service_role_grants migration](../supabase/migrations/20261013090000_service_role_grants.sql)).

### SECURITY DEFINER helper functions

Policies often ask questions such as "does this user own that company?". Asking that with a normal
query inside a policy can loop back through RLS. Functions like `owns_company()` and `is_super_admin()` are
`SECURITY DEFINER`: they run with the function owner's rights, so they can look up the answer directly.
They always use `set search_path = ''` and fully qualified names, so they can't be tricked into using a
different table.

### Triggers

A trigger is a function the database runs automatically when a row changes. They do three jobs here:

| Kind                    | Example                                                                            | Why a trigger                                                              |
| ----------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Guard** (BEFORE)      | `guard_company_write` stops owners changing `status`, `slug` or office             | column-level rules RLS can't express                                       |
| **Stamp** (BEFORE)      | `stamp_availability` sets `updated_at` and `updated_by`                            | users can't forge "who/when"                                               |
| **Side effect** (AFTER) | `after_company_status_change` resolves the review request and notifies the company | it happens no matter which client made the change, in the same transaction |

### Constraints

Constraints are rules the data itself must obey; they can never be bypassed:

- `unique (space_id)`: one company per office. That's how "vacant offices only" is guaranteed, even if two admins click at the same moment.
- `check (status not in ('rejected','suspended') or status_reason is not null)`: rejecting or suspending needs a reason.
- **Exclusion constraint**: no two accepted appointments for the same person may overlap. See §6.

### Storage

Logos live in the `company-logos` bucket under `<company_id>/…`. Storage has its own RLS policies: only
the owner of that company id, or an admin, may write there
([storage migration](../supabase/migrations/20261012100200_storage_realtime.sql)).

### Realtime

Tables added to the `supabase_realtime` publication broadcast their changes. The browser subscribes, and
Supabase only delivers events for rows the subscriber may read under RLS. We use the event purely as a
"something changed" signal and then re-read through the server
([live-refresh.tsx](../src/components/realtime/live-refresh.tsx)).

---

## 4. Security patterns

| Risk                                  | How it's handled                                                                         | Where                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Users reading other people's data     | RLS on every table; tests prove it                                                       | `security.test.ts`, `availability.test.ts`                               |
| Self-promotion to admin               | Guard trigger; signup metadata can never grant `super_admin`                             | `guard_profile_update`, `handle_new_user`                                |
| Open redirect (`?next=https://evil`)  | Only same-site paths are accepted                                                        | `safeNextPath` in [roles.ts](../src/lib/auth/roles.ts)                   |
| Revealing which emails are registered | Login, reset and sign-up return the same response either way                             | [auth/actions.ts](../src/lib/auth/actions.ts)                            |
| Malicious "image" uploads             | Check the file's first bytes, not its claimed type; no SVG                               | [files.ts](../src/lib/files.ts)                                          |
| Search wildcard tricks (`%`)          | Escape LIKE wildcards                                                                    | `likePattern` in [companies/queries.ts](../src/lib/companies/queries.ts) |
| Secrets in the browser or in Git      | `server-only` imports; `.env*` git-ignored; secret scan before every push                | [env.server.ts](../src/lib/env.server.ts)                                |
| Two admins acting at once             | Updates include the expected current state (`.in("status", …)`, `.is("space_id", null)`) | [admin/actions.ts](../src/lib/admin/actions.ts)                          |

---

## 5. The floor map

### Why SVG and `viewBox`

SVG elements are real DOM nodes, so each office can be a focusable, clickable button with an accessible
name. The `viewBox` attribute is the window onto the drawing:
`viewBox="0 0 1200 800"` shows the whole floor; `viewBox="300 200 600 400"` shows a quarter of it,
twice as large. **Zooming and panning just change those four numbers.** Text stays sharp, because nothing
is scaled as an image.

- [lib/floor/viewport.ts](../src/lib/floor/viewport.ts) holds the pure maths: zoom around a point, pan,
  keep the view on the floor, and fit an office. These are tested in `tests/unit/viewport.test.ts`.
- [use-map-viewport.ts](../src/components/floor/use-map-viewport.ts) connects the maths to the mouse wheel,
  dragging, pinching and animation. A drag sets a flag so that releasing the mouse over an office doesn't select it.
- [floor-map.tsx](../src/components/floor/floor-map.tsx) only _draws_: given data and state, it returns
  SVG. The public explorer and the admin tool both reuse it.

### Data-driven geometry

The floor's walls, corridors and rooms are JSON in the database (`floor_layouts.geometry`,
`floor_spaces.shape`). [geometry.ts](../src/lib/floor/geometry.ts) defines the format with zod and checks
data before it's drawn. Adding a floor is a data task, not a code change (ARCHITECTURE.md → "Adding or editing a floor").

### Accessibility

Each office is `role="button"`, focusable with Tab and selectable with Enter or Space. Its label reads like
"Office 101, Acme Robotics, Available". The company list is an equivalent text alternative. Availability
always has a text label, never colour alone.

---

## 6. Appointments: time, overlaps and workflow

Phase 6 is about _time_: storing it correctly, preventing double bookings, and moving each request
through a fixed set of statuses.

### Storing time: UTC instants vs wall-clock time

There are two different things people call "a time":

- **An instant:** one exact moment, the same everywhere on Earth. Postgres `timestamptz` stores
  instants (internally in UTC). `appointments.starts_at` and `ends_at` are instants.
- **A wall-clock time:** what a clock on the wall shows, e.g. "10:30 on 14 Oct". It only means something
  together with a **time zone** such as `Asia/Kolkata` (an "IANA zone" name).

People book in _building_ time, because meetings happen at the building. So the form collects wall-clock
time, and the server converts it to an instant:

```ts
wallTimeToUtc({ date: "2026-10-14", time: "10:30" }, "Asia/Kolkata"); // → 2026-10-14T05:00:00Z
```

- [lib/appointments/time.ts](../src/lib/appointments/time.ts) does this with the built-in `Intl.DateTimeFormat`,
  which knows every zone's rules, including **daylight saving time** (DST). The trick is to guess the UTC
  offset, then check and correct once. Wall times that don't exist (e.g. 02:30 on a spring-forward night
  in New York) return `null`.
- `tests/unit/appointments.test.ts` checks India (+05:30, no DST), New York in summer and winter, the DST gap,
  and round trips in several zones.
- The **building's** zone comes from the database (`company_timezone()`), and the insert trigger writes it into
  `appointments.timezone`, ignoring whatever the client sent. Displays always add the zone label ("IST").

### Half-open ranges and the overlap test

A meeting from 10:00 to 11:00 occupies `[10:00, 11:00)`: it **includes the start and excludes the end**.
That's why a meeting at 11:00 can follow straight after. Two half-open ranges overlap exactly when:

```ts
aStart < bEnd && bStart < aEnd; // overlaps() in lib/appointments/rules.ts
```

Postgres writes the same idea as `tstzrange(starts_at, ends_at, '[)')` and the overlap operator `&&`.

### The exclusion constraint (the double-booking guarantee)

[core_schema migration](../supabase/migrations/20261012100000_core_schema.sql):

```sql
constraint appointments_no_overlap
  exclude using gist (member_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (status = 'accepted' and member_id is not null)
```

- A `unique` constraint says "no two rows may be **equal**". An **exclusion** constraint generalises that:
  "no two rows may make all these comparisons true". Here the comparisons are the same `member_id` (`=`)
  **and** overlapping time ranges (`&&`).
- `gist` is an index type that can answer "which ranges overlap this one?" quickly. The `btree_gist`
  extension lets the same index also compare ordinary values like `member_id`.
- The `where` clause makes it a **partial** constraint: only accepted meetings with a representative count.
  Pending requests may overlap freely; the slot is only taken when the company accepts.
- It holds even if two people accept at the same instant, because Postgres checks it inside the
  transaction. App code that first reads and then writes can't promise that (a "race condition").
- A violation has error code `23P01`, which `friendlyError()` in
  [lib/appointments/actions.ts](../src/lib/appointments/actions.ts) turns into a readable message.

### A status workflow as a state machine

A **state machine** is a fixed set of states plus the moves allowed between them:

```
 pending ──company accepts──► accepted ──company, after start──► completed
    │ company declines            │ either side cancels (with an optional reason)
    ├──► rejected                 ▼
    └──── requester cancels ──► cancelled
```

`guard_appointment_write` (latest version in
[cancellation_reason migration](../supabase/migrations/20261016100000_appointment_cancellation_reason.sql))
enforces this for every update. It also forbids changing the meeting details after submission, and stamps
`decided_by`/`cancelled_by` itself. A `cancellation_reason` can only be written in the same update that cancels.
Because the rule lives in the database, a modified client can't "accept" its own request or skip from
pending to completed.

> **Lesson from this phase:** the first version stored the requester's cancellation reason in
> `decision_note`, which is the _company's_ field, and the guard trigger correctly refused it. The fix was a
> data-model change (a separate column), not a weaker rule.

### Defence in depth for one booking

Each layer catches something the previous one can't:

| Layer                | Where                                                                                          | Catches                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Disabled options     | [booking-form.tsx](../src/components/appointments/booking-form.tsx)                            | Times outside the rules, or already booked, can't be picked       |
| Pure rules           | `checkSlot()` in [rules.ts](../src/lib/appointments/rules.ts)                                  | A tampered form; same rules, friendly messages                    |
| Busy-time check      | `requestAppointment` in [actions.ts](../src/lib/appointments/actions.ts)                       | A slot taken since the form loaded                                |
| Guard trigger        | [appointment_booking migration](../supabase/migrations/20261016090000_appointment_booking.sql) | Anything that skips the app: hours, grid, notice, horizon, limits |
| Exclusion constraint | core schema                                                                                    | Two accepted overlaps, even at the same instant                   |

The booking rules live in one TypeScript object (`BOOKING_RULES`) **and** in the trigger. If you change one,
change the other; the database tests will tell you if they disagree.

### Sharing just enough: `get_busy_times`

The booking form needs to know when a representative is busy, but visitors must not see _who_ booked or
_why_. The `SECURITY DEFINER` function `get_busy_times(member, from, to)` reads the private table and returns
**only** `starts_at` and `ends_at` for accepted meetings of public, bookable members, for at most 62 days.
This "narrow window onto private data" is a common pattern; RLS stays strict on the table itself.

### Notifications from the database

`after_appointment_change` inserts the right notification on every request, decision or cancellation.
Doing it in a trigger means it can't be forgotten in some code path, and it happens in the same
transaction as the change.

### Two UI patterns worth knowing

- **Redirect after a successful action (Post/Redirect/Get).** Accepting a request moves it out of the
  "Requests" tab, so a confirmation shown inside its card would vanish. Instead the action redirects to
  `/company/appointments?done=accepted` and the page shows the notice
  ([appointment-notice.tsx](../src/components/appointments/appointment-notice.tsx)). Refreshing the page can't
  resubmit the form either.
- **Controlled form + manual submit.** In the booking form, date, duration, time and representative depend on
  each other, so they live in React state. The form submits via `onSubmit` → `startTransition(() => action(formData))`
  instead of `<form action>`, which would trigger React's automatic reset and clear those fields after a
  validation error.

### Warnings vs rules

Not every clash is forbidden:

- Two **general** company meetings may overlap, because different people can attend.
- A visitor may book two companies at once.

[conflicts.ts](../src/lib/appointments/conflicts.ts) is a pure, unit-tested function that sorts clashes into
**blocked** (the database would refuse it; Accept is hidden) and **warning** (allowed, but shown).

---

## 7. Testing strategy

```
          ▲ slower, closer to real users
   E2E    │  e2e/*.spec.ts — Playwright drives Chromium (desktop + phone) against a production build
          │                   and the Supabase dev project. ~57 tests, ~2 min.
   DB     │  tests/db/*.test.ts — the real migrations run in PGlite (Postgres compiled to WebAssembly)
          │                   with a small Supabase shim; tests act as guest, visitor, company, admin.
   Unit   │  tests/unit/*.test.ts — pure functions: validation, zoom maths, redirects, file checks.
          ▼ faster, more precise
```

- **Why PGlite?** It runs real Postgres in-process with no Docker, so RLS, triggers and constraints can be
  tested in seconds ([tests/db/harness.ts](../tests/db/harness.ts)). The shim imitates Supabase's
  roles and `auth.uid()`. It can't catch Supabase-specific differences such as the service-role grants,
  which is why the E2E suite also checks the real project.
- **E2E data hygiene:** [global-setup.ts](../e2e/global-setup.ts) creates confirmed test accounts and
  companies through the admin API (no emails are sent), and [global-teardown.ts](../e2e/global-teardown.ts)
  deletes everything containing the run id. Specs that change shared data (such as office placement) put it back.
- **Did the test actually test something?** A few times a test was broken on purpose ("mutation check")
  to confirm it fails. A test that can't fail proves nothing.
- Commands: `npm test` (unit and DB), `npm run test:e2e` (build and browser), `npm run check` (everything before pushing).

---

## 8. Walkthroughs: what happens when…

### …a company registers

1. [company-register-form.tsx](../src/components/auth/company-register-form.tsx) submits to `registerCompany`.
2. [auth/actions.ts](../src/lib/auth/actions.ts) validates with zod, checks the logo's bytes, then calls
   `supabase.auth.signUp` with the company details as metadata.
3. Postgres runs `handle_new_user` in the same transaction, creating the profile (role `company`), the
   company (status always `pending`) and its registration request. Invalid data cancels the whole sign-up.
4. The logo is uploaded with the admin client to `company-logos/<company_id>/…`. There's no user session
   yet, and the target is the user Supabase just returned.
5. The user is sent to "Check your email" (or straight to `/company` if confirmation is off).

### …an admin approves a company

1. [review-panel.tsx](../src/components/admin/review-panel.tsx) submits `decision=approve` to `reviewCompany`.
2. [admin/actions.ts](../src/lib/admin/actions.ts) checks that the caller is `super_admin`, then runs
   `update companies set status='approved' where id=… and status in ('pending','rejected')`.
   That extra condition prevents a double review.
3. RLS allows it: the "companies: admin update" policy. `guard_company_write` stamps `reviewed_at` and `reviewed_by`.
4. `after_company_status_change` closes out the registration request and inserts a notification, in the same transaction.
5. `revalidatePath` refreshes the admin pages, the directory and the profile. The company now appears publicly, because the public read policy is `status = 'approved'`.

### …a visitor clicks an office on the map

1. The office's `<g role="button">` in [floor-map.tsx](../src/components/floor/floor-map.tsx) calls `onSelect`.
2. [floor-explorer.tsx](../src/components/floor/floor-explorer.tsx) checks that it wasn't a drag
   (`consumeDrag`), then calls `history.pushState("?company=acme")`.
3. `useSearchParams` sees the new URL, works out the selection, and the panel shows the details. There's no server round trip.
4. An effect calls `focus(bounds)`, which animates the `viewBox` towards the office.

### …a company changes its availability while you're looking at the map

1. [availability-form.tsx](../src/components/availability/availability-form.tsx) submits to
   `setCompanyAvailability`, which upserts `company_availability`. The `stamp_availability` trigger sets `updated_at` and `updated_by`.
2. Postgres publishes the change through Realtime.
3. Your browser's `LiveRefresh` subscription receives "something changed" and, after a short pause, calls `router.refresh()`.
4. The server re-runs `getFloorPlan` under _your_ permissions, and the map re-renders with the new status. Your zoom and selection stay put.

---

### …someone books an appointment and the company accepts

1. The visitor opens `/companies/<slug>/book`. [book/page.tsx](../src/app/companies/[slug]/book/page.tsx) requires
   a session, loads the bookable team and the building's time zone (`getBookingContext`), and loads the visitor's
   own upcoming meetings for the double-booking warning.
2. Choosing a representative and date calls `fetchBusyTimes` → `get_busy_times()`; taken start times are disabled.
3. Submitting runs `requestAppointment`: zod → `checkSlot()` → busy-time re-check → `insert` as the visitor.
4. In Postgres:
   - RLS checks that the requester is the visitor and the company is approved.
   - `guard_appointment_write` checks the booking rules, forces `status = 'pending'` and sets the building time zone.
   - `after_appointment_change` notifies the company.
   - Realtime tells the company's open inbox to refresh.
5. The company clicks **Accept** → `respondToAppointment`, which updates the row with `status = 'accepted'` only
   while it is still `pending`. The guard checks the transition, the exclusion constraint checks overlaps, and
   the trigger notifies the visitor.
6. The action redirects to `?done=accepted`; the visitor's "My appointments" refreshes live and shows the meeting link.

## 9. What each phase added

| Phase          | Concepts introduced                                                                                                     | Key files                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1 Foundation   | Migrations, RLS, grants, guard triggers, PGlite tests, validated env                                                    | `supabase/migrations/2026101210*`, `tests/db/harness.ts`, `src/lib/env*.ts`                                 |
| 2 Auth         | Supabase Auth with cookies, Data Access Layer, Server Actions, signup trigger, Playwright                               | `src/lib/auth/*`, `src/proxy.ts`, `src/app/(auth)/*`                                                        |
| 3 Directory    | Review workflow via triggers, notifications, Storage uploads, URL-synced filters                                        | `src/lib/companies/*`, `src/lib/admin/actions.ts`, `20261014090000_company_review.sql`                      |
| 4 Floor map    | SVG `viewBox` zoom/pan, pure viewport maths, History API selection, data-driven geometry                                | `src/lib/floor/*`, `src/components/floor/*`, `src/components/admin/floor-placement.tsx`                     |
| 5 Availability | Upserts, "no row = Unknown", Realtime + `router.refresh`, public vs owner views                                         | `src/lib/availability/*`, `src/components/availability/*`, `src/components/realtime/live-refresh.tsx`       |
| 6 Appointments | UTC vs wall time, DST, half-open ranges, exclusion constraint, state machine, privacy-preserving RPC, Post/Redirect/Get | `src/lib/appointments/*`, `src/components/appointments/*`, migrations `20261016090000` and `20261016100000` |

**Phase 7 preview:** sending email from the server (Resend), rate limiting, and real-time chat with read receipts.

---

## 10. Glossary

| Term                         | Meaning                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| **Migration**                | A numbered SQL file that changes the database. Applied in order and never edited once applied. |
| **RLS**                      | Row Level Security: Postgres filters rows per user, using policies.                            |
| **Policy**                   | One RLS rule (`using` for reads, `with check` for writes).                                     |
| **JWT**                      | Signed token proving who the user is; `auth.uid()` reads the user id from it.                  |
| **Service role**             | Supabase's all-powerful server key; bypasses RLS. Server-only.                                 |
| **SECURITY DEFINER**         | A function that runs with its owner's privileges, used for safe permission checks.             |
| **Trigger**                  | A function Postgres runs automatically on insert, update or delete.                            |
| **Exclusion constraint**     | Like `unique`, but for overlaps (e.g. time ranges) instead of equality.                        |
| **Server Component**         | A React component that runs only on the server.                                                |
| **Client Component**         | A React component with `"use client"`; runs in the browser for interactivity.                  |
| **Server Action**            | A server function that forms call directly; always validate and authorize inside.              |
| **Suspense**                 | A React boundary that shows a fallback while the content inside loads.                         |
| **Prerender**                | Rendering a page ahead of time; request-specific parts are deferred.                           |
| **Upsert**                   | Insert, or update if the row already exists (`on conflict … do update`).                       |
| **viewBox**                  | The visible rectangle of an SVG's coordinate space.                                            |
| **E2E test**                 | End-to-end: a real browser clicking through the real app.                                      |
| **Instant / `timestamptz`**  | One exact moment, stored in UTC; looks different on clocks in different zones.                 |
| **Wall-clock time**          | What a local clock shows ("10:30"); needs a time zone to become an instant.                    |
| **IANA time zone**           | A named set of offset rules, e.g. `Asia/Kolkata`, `America/New_York`.                          |
| **DST**                      | Daylight saving time; clocks jump, so some wall times repeat and others don't exist.           |
| **Half-open range `[a, b)`** | Includes `a`, excludes `b`, so back-to-back ranges don't overlap.                              |
| **GiST**                     | A Postgres index type for "overlaps / contains" questions on ranges and shapes.                |
| **State machine**            | A fixed set of states plus the allowed moves between them.                                     |
| **Race condition**           | A bug where the outcome depends on timing, e.g. two people accepting the same slot at once.    |
| **Post/Redirect/Get**        | After a form succeeds, redirect to a page that shows the result.                               |
