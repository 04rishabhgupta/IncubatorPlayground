# Deploying Startup Floor Connect

Production runs on **Vercel** (the Next.js app) and **Supabase** (database, auth, realtime, storage).
Follow the steps in order; each one says how to check it worked.

## 1. Supabase project

The hosted project is already set up (all migrations in `supabase/migrations` are applied with
`npm run db:push`). Before going live:

1. **Migrations:** `npx supabase migration list` shows every local migration on the remote too.
2. **Auth → URL Configuration:**
   - **Site URL:** your production URL, e.g. `https://floor.example.org`.
   - **Redirect URLs:** add `https://floor.example.org/**` (keep `http://localhost:3001/**` for development).
   - These must match `NEXT_PUBLIC_SITE_URL` in Vercel, or confirmation and reset links go to the wrong place.
3. **Auth → Emails → SMTP Settings** (required for real users): Supabase's built-in sender only reaches
   your project team and is rate-limited. With Resend: host `smtp.resend.com`, port `465`, user `resend`,
   password = a Resend API key, sender on a domain verified in Resend.
4. **Auth → Emails → Templates** (recommended, so links work on any device):
   - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/settings/password`
5. **First super admin:** register a normal account on the live site, then in the SQL editor:
   `update public.profiles set role = 'super_admin' where email = 'you@example.com';`
   Further admins can then be made from `/admin/users`.

## 2. Vercel project

Either connect the GitHub repository in the Vercel dashboard (**Add New → Project → Import**), or use
the CLI from the project folder:

```bash
npx vercel login           # once, opens the browser
npx vercel link            # create or pick the Vercel project
npx vercel env add …       # see the table below, for "production" (and "preview" if you use it)
npx vercel deploy --prod
```

Framework preset: **Next.js** (detected). Build command `npm run build`, Node.js **20 or newer**.
Pick a function region close to the Supabase project's region.

### Environment variables

| Variable                               | Value                                                            | Exposure    |
| -------------------------------------- | ---------------------------------------------------------------- | ----------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://<project-ref>.supabase.co`                              | public      |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → publishable key                    | public      |
| `SUPABASE_SECRET_KEY`                  | Project Settings → API Keys → secret key                         | server only |
| `NEXT_PUBLIC_SITE_URL`                 | the production URL, no trailing slash                            | public      |
| `NEXT_PUBLIC_DEFAULT_TIMEZONE`         | `Asia/Kolkata`                                                   | public      |
| `RESEND_API_KEY`                       | Resend API key (`re_…`), for contact-form and appointment emails | server only |
| `EMAIL_FROM`                           | e.g. `Startup Floor Connect <noreply@example.org>` (verified)    | server only |

`NEXT_PUBLIC_*` values are built into the browser bundle; never put a secret in one. Without
`RESEND_API_KEY`/`EMAIL_FROM` the app still works and delivers contact messages in the app only.

## 3. After deploying

1. `https://<your-domain>/api/health` returns `{"status":"ok","database":"reachable"}`.
2. Register a test visitor with a real inbox: the confirmation email arrives and its link signs you in.
3. Sign in as the super admin: `/admin` loads; approve a company and place it on the floor.
4. Open a company profile as a visitor: **Message** opens a chat; the company sees it live.
5. Send the contact form: with Resend configured the company's business email receives it.

## Security notes

- Row Level Security protects every table; the app never relies on the UI for authorization.
- `SUPABASE_SECRET_KEY` and `RESEND_API_KEY` are only read by server code (`src/lib/env.server.ts`).
- Responses carry security headers (`next.config.ts`): no framing, no MIME sniffing, a strict referrer
  policy and no access to camera, microphone or location.
- Never run the end-to-end tests (`npm run test:e2e`) against production: they create and delete test
  accounts. Use a development Supabase project for them.
