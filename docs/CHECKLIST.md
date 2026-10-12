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
- [ ] Apply migrations to a real Supabase project (requires project credentials or Docker)

## Phase 2 — Authentication and roles

- [ ] Visitor registration (name, email, password) with email confirmation
- [ ] Company registration (account and company details; status `pending`), logo upload
- [ ] Login, logout, password reset
- [ ] Profile management
- [ ] Role-aware navigation and route protection (server-side checks)
- [ ] Super admin bootstrap documented and tested

## Phase 3 — Company directory

- [ ] Public directory: approved only, search by name, filter by industry
- [ ] Company public profile page
- [ ] Company dashboard: edit profile, services, logo
- [ ] Admin: approve / reject / suspend, with registration review history
- [ ] Notifications on company status change

## Phase 4 — Interactive floor map

- [ ] SVG renderer from `floor_layouts` + `floor_spaces`
- [ ] Hover, selected and availability states; accessible (keyboard, labels)
- [ ] Zoom and pan; responsive on mobile
- [ ] Company details panel
- [ ] Directory ↔ map selection sync
- [ ] Admin: assign / move companies between offices

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

- [ ] End-to-end tests of the main workflows
- [ ] RLS tests against a real Supabase instance
- [ ] Responsive / accessibility pass
- [ ] Vercel + Supabase production configuration, auth redirect URLs, SMTP
