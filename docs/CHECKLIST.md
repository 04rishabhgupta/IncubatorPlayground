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

## Phase 5 — Availability

- [ ] Company-level availability with last-updated timestamp
- [ ] Team member records (CRUD)
- [ ] Per-member availability; _Unknown_ when never set
- [ ] Live availability updates on the map (Realtime)

## Phase 6 — Appointments

- [ ] Booking form (company, optional representative, date, time, duration, purpose, type)
- [ ] Server-side validation and conflict errors mapped to friendly messages
- [ ] Company request inbox: accept / reject / complete / cancel
- [ ] Visitor appointment list: cancel
- [ ] Notifications to both parties

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
