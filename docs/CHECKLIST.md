# Development checklist

Legend: `[x]` done and verified · `[ ]` not started · `[~]` partially done

## Phase 1 — Foundation

- [x] Inspect repository (empty, branch `main`, remote `origin`)
- [x] Next.js 16 + React 19 + TypeScript (strict) + Tailwind CSS 4 scaffold
- [x] Folder structure and design tokens
- [x] Validated environment config (public vs server-only) and `.env.example`
- [x] Supabase clients: browser, server, admin (server-only), proxy session refresh
- [x] Migrations: core schema, security (RLS, grants, guard triggers), storage buckets, realtime publication
- [x] Seed: building, Floor 1 layout, 4 offices + boardroom + reception, industries
- [x] Generated database types (`npm run db:types:offline`)
- [x] Database security tests (PGlite) and unit tests
- [x] Health check route `/api/health`
- [x] Lint, typecheck, tests and production build pass
- [x] Apply migrations to the Supabase Cloud project and verify (seed, RLS, keys, `/api/health`)
- [x] Fix: grant the service role access to public tables (migration `20261013090000`)

## Phase 2 — Authentication and roles

- [x] Visitor registration (name, email, password) with email confirmation
- [x] Company registration: account + company + review request created atomically by the signup trigger; status `pending`
- [x] Logo upload at registration (PNG/JPEG/WebP ≤ 2 MB, validated by file content)
- [x] Login, logout, password reset, resend confirmation; `/auth/confirm` handles PKCE and token-hash links
- [x] Profile management (`/settings`) and password change (`/settings/password`)
- [x] Role-aware header and dashboards: `/account` (visitor), `/company`, `/admin` (read-only overview)
- [x] Route protection: optimistic proxy redirect + server-side session/role checks (DAL) + RLS
- [x] Open-redirect protection for `?next=`; no account enumeration in login/reset/register
- [x] Super admin bootstrap documented; never grantable via signup metadata (tested)
- [x] Playwright E2E suite against Supabase Cloud (25 tests, desktop + mobile)
- [ ] Configure SMTP (e.g. Resend) in Supabase Auth so real users can receive confirmation emails
- [ ] Manually test a real sign-up and password reset end-to-end once SMTP is configured

## Phase 3 — Company directory

- [x] Public directory (`/directory`): approved companies only, name search (wildcards escaped), industry filter, URL-synced, empty/loading/error states
- [x] Public company profile (`/companies/[slug]`): about, services, team, availability (Unknown when unset), contact, office; owners/admins can preview non-public profiles
- [x] Company dashboard: profile editing (`/company/profile`), services, logo upload/replace/remove via RLS-scoped storage
- [x] Admin: company list with status tabs and search, review page with registration history; approve / reject / suspend / reinstate with required reasons
- [x] Status changes atomically resolve the registration request and notify the company (DB trigger); rejected companies can resubmit
- [x] Notifications page and unread badge in the header
- [x] Tests: review workflow DB tests, E2E lifecycle (pending → rejected → resubmitted → approved → edited → suspended → reinstated)
- [ ] Admin user management (list/search users, change roles) — moved to Phase 8

## Phase 4 — Interactive floor map

- [x] Floor plan loaded from Supabase (`getFloorPlan`) and validated against the geometry schemas; error/empty states
- [x] SVG renderer: walls, corridors, common areas, entrance, offices (occupied/vacant), meeting room, reception
- [x] Hover tooltip, selected and dimmed states, availability dot + text label, legend
- [x] Custom zoom & pan (no library): wheel at cursor, drag, pinch, double-click, buttons, keyboard (+ − 0, arrows)
- [x] Selection in the URL (`?company=`, `?space=`) via the History API: deep links and back button
- [x] Side panel: searchable/filterable company list ↔ map highlight; company details (availability, team, contact)
- [x] Responsive: side-by-side on desktop, map + panel stacked on mobile; no horizontal scroll
- [x] Accessibility: offices are focusable buttons with descriptive names, Enter/Space selects, Esc clears, live region
- [x] Homepage is the floor map; `/directory` stays as the list; profiles link to "View on floor map"
- [x] Admin placement tool (`/admin/floor`): assign / move (vacant offices only) / remove, rename spaces, capacity
- [x] Companies notified when their office is assigned, changed or removed (DB trigger)
- [x] Tests: viewport/label unit tests, placement DB tests, E2E for map, keyboard, zoom/pan, deep links, admin placement

## Phase 4R — Floor explorer revisited (before Phase 7)

- [x] 4R.1 Geometry v2 (walls by kind, doors, windows, fixtures, area info), backward compatible
- [x] 4R.1 Furniture symbol library (26 symbols) and layered, memoised renderer; labels with halos
- [x] 4R.1 Admin renderer preview with sample data (`/admin/floor/preview`); render + geometry tests
- [x] 4R.1 polish: solid walls with masked openings, doors hinged on the wall face, framed glazing, size-aware furniture, label plates clear of furniture, screen-pixel text, three detail levels
- [x] 4R.2 Floor 1 redesign (data migration, ids 101–104 unchanged), office seats from team order, status chips, zoom-dependent labels
- [x] 4R.2 follow-up: apply migration `20261017090000` to the hosted project (`npm run db:push`)
- [ ] 4R.2 follow-up: replace placeholder measurements with the building's real plan (waiting for drawings)
- [x] 4R.3 Clickable areas, keyboard room navigation, wider search, richer list cards
- [x] 4R.4 Floor tabs + building panel, floor tagline/description, admin floor management
- [x] 4R.5 Startup stage / team size / tech stack, FITT Incubation Team, announcements, requested office
- [x] 4R.5 follow-up: apply migration `20261021090000` to the hosted project
- [ ] 4R.5 follow-up: add the real FITT team in `/admin/fitt-team`
- [x] 4R.6 Admin layout JSON editor with live preview, validation and history; occupancy overview
- [ ] 4R.7 Full regression, docs

## Phase 5 — Availability

- [x] Company-level availability (Available / Busy / Unavailable / Unknown) with an optional note and last-updated time
- [x] "Unknown" clears the stored status; availability is labelled as self-reported (no presence or slot implied)
- [x] Team member records (non-login): add, edit, hide from public, accepts-appointments flag, reorder, remove
- [x] Per-member availability with last-updated time
- [x] Live updates on the floor map, profiles and directory via Supabase Realtime (refresh re-reads data under RLS)
- [x] Hidden team members never appear on public views, even to their own company
- [x] Tests: availability/team DB tests (RLS, stamping, Unknown, cascade, realtime publication), E2E incl. a live-update test

## Phase 6 — Appointments

- [x] Booking form (`/companies/[slug]/book`): optional representative, date, duration, start time, in person / online, purpose
- [x] Booking rules: 08:00–20:00 building time, ≥ 1 hour notice, ≤ 60 days ahead, 15/30/45/60/90/120 min, 15-minute grid
- [x] Times stored in UTC, chosen and shown in the building's time zone (DST-safe conversion, unit tested)
- [x] Representative's booked times disabled in the form (`get_busy_times`, no private details exposed)
- [x] Double-booking warnings: visitor overlapping their own meetings; overlapping general company meetings
- [x] Overlapping accepted meetings for the same representative blocked by the exclusion constraint (+ inbox warning)
- [x] Limits: max 3 pending requests per user per company, no duplicate pending request
- [x] Company inbox (`/company/appointments`): accept (meeting link / location), decline, cancel, complete; live refresh
- [x] My appointments (`/account/appointments`) for every signed-in user, with cancellation and reason
- [x] Company accounts can book other companies; never their own
- [x] Notifications for request, acceptance, decline and cancellation (DB trigger)
- [x] Admin monitoring (`/admin/appointments`) with status counts
- [x] Tests: time-zone/rules/conflict unit tests, booking DB tests (rules, limits, notifications, privacy), E2E for the full loop
- [ ] Email copies of appointment notifications (Phase 7, Resend)

## Phase 7 — Communication

- [ ] Start-conversation RPC (security definer)
- [ ] Chat UI: conversation list, history, realtime delivery, timestamps, unread state
- [ ] Message notifications (de-duplicated)
- [ ] Email contact form through Resend (server action, rate-limited, logged)

## Phase 8 — Testing and deployment

- [ ] Admin user management: list/search users, change roles
- [ ] End-to-end tests of the main workflows
- [ ] RLS tests against a real Supabase instance
- [ ] Responsive / accessibility pass
- [ ] Vercel + Supabase production configuration, auth redirect URLs, SMTP
