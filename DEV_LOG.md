# Codiq platform: development log (2026-10-19)

Everything done in this session, in order, with the result of each step.

## 0. Install and build (earlier)
- `npm install` in `backend/` and `frontend/`; `npx prisma generate`; `nest build` and `next build` both passed first time. No code errors to fix.

## 1. Local infrastructure
- Started Docker Postgres 16. The existing volume held only the 6 seeded demo users and 0 payments, and had a migration that was missing from the repo, so I reset the **local** database and created the first real migration (`backend/prisma/migrations/…_init`). Re-seeded the demo data.
- Replaced MinIO in `docker-compose.yml` with **rustfs** (S3-compatible). MinIO's public image can no longer be pulled. Added a `storage-init` service that creates the `codiq` bucket. Verified: signed upload + download work.
- Added `.gitignore` (env files, node_modules, dist, .next).

## 2. Supabase
- `prisma/schema.prisma`: added `directUrl = env("DIRECT_URL")` (pooled URL for the API, direct URL for migrations).
- `.env.example` documents both URLs. Added `npm run db:deploy` (`prisma migrate deploy`).
- Not connected: needs your Supabase project. Steps in `docs/SETUP-KEYS.md` section 1.

## 3. Google register and login
- Backend: `POST /api/auth/google` verifies Google's ID token with `google-auth-library` against `GOOGLE_CLIENT_ID`. Existing email: logged in (and linked). New email without an account type: returns `needsProfile` so the UI asks student/parent first. Google-only accounts get an unusable random password.
- Schema: `User.googleId` (unique) and `User.avatarUrl`.
- Frontend: `components/google-button.tsx` ("Continue with Google") on both `/login` and `/signup`. Shows a clear hint while `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is empty.
- Tested: the endpoint returns 503 "not configured" without the client ID, as designed. Not tested with a real Google token (no client ID yet).

## 4. Admin dashboard
- Backend: `GET /api/admin/stats` (ADMIN only): users, new users in 30 days, active enrollments by track, revenue total and per month (6 months), payments waiting for review, recent payments, recent sign-ups.
- Frontend: new `/dashboard/admin` overview (stat cards, revenue chart, students by track, recent payments, new sign-ups, banner for InstaPay receipts awaiting review). Admins now land here after login. Existing pages kept: sessions, packages, payments, users and roles.
- Tested live: admin gets the data, a student gets 403 from the API and a redirect from the page. Page text confirmed in the browser.

## 5. Student pages
- Backend (`/api/account/...`): `profile` (get/update), `change-password`, `my-courses` (progress per package), `catalog` (published packages flagged "enrolled").
- Frontend: `/dashboard/courses` (my courses with progress), `/dashboard/catalog` (browse and enroll, also for parents), `/dashboard/profile` (details and change password). Navigation and role rules in `middleware.ts` updated for every role.
- Already existing: home, sessions list and player, billing, checkout, live classroom, assignments and quizzes.
- Tested: every page returns 200 for the right role and redirects the wrong role.

## 6. Video cloud (Cloudflare R2)
- `StorageService` now works with R2: disabled the AWS SDK's automatic checksums on presigned uploads, which R2 rejects.
- Added `npm run check:env`: tests the database and storage (upload + signed download), and reports which keys are missing. Never prints secrets.
- Fixed a build bug found along the way: `nest build` wrote to `dist/src/main.js`, so `npm start` and `start:prod` could not find `dist/main`. `tsconfig.json` now includes only `src`.
- Not connected: needs your R2 bucket and token. Steps and the bucket CORS policy are in `docs/SETUP-KEYS.md` section 3.

## 7. Payment gateway (Paymob)
- Already coded earlier (cards, wallets, installments, Fawry, InstaPay). I reviewed `providers.ts` and the webhook handler and changed nothing.
- I cannot create a Paymob account or API keys. Where to find each key and how to set the webhook are in `docs/SETUP-KEYS.md` section 4.
- Not verified: the live Paymob request and response (needs your sandbox keys). Test one card payment before launch.

## 8. Email provider (Resend)
- `MailService` now sends through Resend (`RESEND_API_KEY`, `MAIL_FROM`). Empty key = log only. Failures are logged, never thrown.
- Branded HTML emails (`src/common/mail-templates.ts`): welcome (email and Google sign-up), password reset, payment receipt (sent once when a payment becomes PAID, not on repeated webhooks).
- Tested against a local fake Resend server: correct URL, bearer key, sender, recipient, subject and reset link. Not tested against real Resend (no key yet).

## 9. Admin authorization
- Audited every route: all admin routes already had `@Roles(ADMIN)`; no route was open by mistake.
- Hardened: `RolesGuard` now reads the user's current role from the database, so a demoted admin's old token stops working immediately (before: up to 15 minutes). New server-side check in `app/dashboard/admin/layout.tsx`.
- An admin can't demote themselves and the last admin can't be demoted. Role changes and admin creation are logged.
- InstaPay approve/reject now only works on receipts awaiting review (before: an admin endpoint could mark any payment paid).
- `npm run test:access` checks all 15 admin routes as nobody, student, parent, instructor and admin, plus the demoted-token and lockout cases. All pass.

## 10. Admin upgrade (2026-10-28)
- **Analytics** (`/dashboard/admin/analytics`, tabs): Revenue (trend vs previous period, by method / track / course, payment funnel, discounts given), Students (sign-ups, conversion to paying, enrollment health), Courses (revenue, completion, average quiz and grade), Student payments (searchable table, click a student for their full payment history). Ranges: 30 days, 90 days, 12 months.
- **Courses** (`/dashboard/admin/packages`): create, edit, hide/publish, delete (delete only when nobody has bought it). New session edit page; the sessions list links to it and can be filtered by course.
- **Team**: new ASSISTANT role (views all sessions, grades work, joins live classes; can't touch content, users, payments or admin pages). Users page: add team member, edit, delete, and one-click "Make assistant" / "Back to student".
- **Coupons** (`/dashboard/admin/coupons`): single codes or a bulk generator (up to 200, optional prefix), percent or fixed EGP off, uses per code, expiry, limit to one course or track, turn on/off, CSV export. Checkout has a discount-code box; a 100% code unlocks the course without a gateway. A use is reserved atomically at checkout and given back if the payment fails. Used codes can't be deleted, only turned off.
- **Admin authorization**: `AdminAreaGuard` locks every URL with an `admin` path segment to admins, even if a developer forgets `@Roles` or marks the route `@Public()` (checked against the database role; case, slashes, dots and encoding tricks are normalised). Verified with a temporary unprotected `/admin` route: anonymous 401, student 403, and a `@Public()` admin route fails closed (401 for everyone).
- Tests: `npm run test:guard` (19 URL cases) and `npm run test:access` (29 admin routes x 5 kinds of users, demoted token, assistant, lockout). All pass.

## 11. Course detail, parents and support (2026-10-28)
- **Course detail** (`/dashboard/admin/packages/[id]`, API `GET /admin/courses/:id`): instructors (from the course's sessions), enrolled students with phone, parent, plan, progress and status, full payment log, inline edit. The course title on the Courses page is the link.
- **Assignments**: the detail page has a Submitted table and a Not submitted table (active enrolled students with no submission).
- **Users & team**: Make admin / Remove admin buttons (the same safeguards: no self-demotion, never zero admins).
- **Parents**: `GET /parents/children/:id/progress` (only for the parent's own child) and `/dashboard/children/[id]`: per package, every session with completion, live attendance, quiz best score and assignment state (graded, waiting, missing, to do).
- **Support = live chat over WebSocket (no email)**: tables `SupportThread` and `SupportChatMessage` (migration `support_live_chat`), socket.io on the API port (`src/support/support.module.ts`). Parents chat at `/dashboard/support` (and through the floating "Chat with us" button); admins and assistants answer in `/dashboard/inbox` (open/resolved, unread counts, typing indicator, mark resolved; a new message reopens a resolved chat). The socket is authenticated by the `access_token` cookie, staff actions re-check the role in the database on every event, and a minute timer drops sockets whose role changed. 30 events per minute per socket, 2000 characters per message. The web app connects straight to the API (`NEXT_PUBLIC_WS_URL`), because Next's rewrites don't proxy WebSockets reliably. In production the web app and API must share a parent domain so the cookie reaches the API.
- **Chat for everyone**: students, parents and instructors chat at `/dashboard/support`; the floating "Chat with us" button is on every page except for admins and assistants. The parent home no longer has its own "Chat with support" button. Visitors who are not logged in use the floating button (migration `support_guest_chat`): name, optional phone/email and a first question start a chat, and a secret key kept in the browser lets them reload and continue. Visitor sockets can only start one chat (max 3 new chats per IP per hour, 300 messages per chat) and never reach other conversations. Behind a proxy, make sure it sets `X-Forwarded-For`. Staff see visitors in the inbox with the role "visitor". Stale login cookies are cleared by the middleware so the public home page works again.
- **Linking a child**: a parent can no longer create student accounts. The child must already have a student account; the parent enters their email (`POST /parents/children`) and the student accepts or declines in their own dashboard (`/parent-requests`, table `ParentLinkRequest`, migration `parent_link_requests`). Nothing is shared before acceptance. Unknown email or a non-student account: 404; already linked to this or another parent: 409. 10 requests per minute.
- **Home page**: signed-in users visiting `/` go straight to their own dashboard. Logged-out visitors see the public site.
- Login and signup show a "Continue with Google" button even before the key is set (it explains what is missing).
- `npm run test:access` extended with the new admin routes. All pass.

## 12. Theme, language, motion and the full-flow test (2026-10-28)
- **Dark mode**: toggle (sun/moon) top right on the public site, auth pages and dashboard; remembered in `localStorage`, defaults to the system setting, set before first paint (no flash). ink and paper swap roles via CSS variables; the footer, hero terminal, banners and video stay dark in both themes (`bg-night`).
- **Arabic**: `EN / ع` button next to it. Cookie `lang`, server-rendered `lang` and `dir="rtl"`, Noto Sans Arabic. Strings are wrapped in `t('English text')` and translated in `src/lib/ar.ts`; a missing translation falls back to English. Translated: public site, pricing, auth pages, dashboard menu, student home, parent home, linking, support chat and the visitor chat widget. Still English: the admin pages, billing, checkout, sessions, profile and grading screens.
- **Motion**: hero glow and gradient text, typing terminal, scroll reveal, staggered cards, hover lift, button shine, theme icon spin, chat pop and message slide-in, a pulsing chat button. All of it is switched off for people who prefer reduced motion.
- **Pointer**: every clickable element shows the hand cursor.
- **`npm run test:flow`**: visitor chat, sign-ups, child linking, course creation, free coupon checkout, learning, grading, parent report, admin views, support chat for four roles, access rules, pages per role, language and theme, then cleanup (about 80 checks).
- `docs/DEPLOY.md`: every key and setting needed to deploy.

## 13. Keys and YouTube videos (2026-10-28)
- New random `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` written to `backend/.env` (the access secret also to `frontend/.env.local`, identical). Both files are git-ignored. Everyone was logged out once.
- Supabase: the only project on the account is `chemistry-platform` (unrelated), and creating a new one was blocked, so the database is still local. Nothing was written to the other project.
- **YouTube videos**: `Session.youtubeId` (migration `session_youtube`). Admin pastes a YouTube link (watch, youtu.be, embed, shorts or id) when creating or editing a recorded session; students get an embedded player (youtube-nocookie) that also records watch progress. A file upload still works and YouTube wins if both are set.
- `docs/SETUP-KEYS.md` sections 6 (Fawry) and 7 (YouTube) added.

## 14. Supabase project and deploy files (2026-10-28)
- Created the Supabase project **codiq** (ref `dteofilfyddowqkfzfzv`, eu-central-1, $0/month plan) and applied the whole schema through the Supabase connector as migration `codiq_initial_schema`: 16 tables, row level security ON for all of them with no policies, so the Supabase REST API exposes nothing. The API reaches the database directly with its own role. The `chemistry-platform` projects on Supabase and Vercel were not touched.
- The database password cannot be read through the connector. After setting it, run these once from `backend` with the production `DIRECT_URL`, so Prisma knows the tables already exist: `npx prisma migrate resolve --applied <name>` for each folder in `prisma/migrations`. After that `npm run db:deploy` works for future changes.
- `backend/.env.production.example` and `render.yaml` (Render blueprint for the API) added.

## 15. Fawry switched off
The Fawry option is hidden at checkout (shown only when `NEXT_PUBLIC_ENABLE_FAWRY=1`) and the API refuses Fawry payments while `FAWRY_MERCHANT_CODE` is empty. The code and webhook are kept for later.

## Results
- `backend`: `npm run build` OK. `frontend`: `npm run build` OK (24 routes).
- `npm run check:env`: database OK, storage OK, Google / Paymob / Fawry waiting for your keys, JWT secrets still placeholders.

## What you need to do
1. Create the 4 sets of keys in `docs/SETUP-KEYS.md` (Supabase, Google, R2, Paymob), paste them into `backend/.env` and `frontend/.env.local`, then run `npm run check:env`.
2. Replace the JWT placeholder secrets before launch.
3. Test one Paymob sandbox card payment end to end.

## Not built (still on the list in CLAUDE.md)
Redis/BullMQ, a real email provider (password-reset mails only log to the console), scheduled renewal reminders, queued webhooks, monthly card auto-charge.

## 16. Mobile app (2026-10-30)
- New `mobile/` folder: Expo SDK 58 + Expo Router app for Android and iOS covering every role on the website (visitor, student, parent, instructor, assistant, admin). See `mobile/README.md`.
- Backend (backward compatible): `X-Client: mobile` makes auth endpoints also return tokens in the body; refresh/logout accept the refresh token in the body; the support socket accepts `auth.token`; `GOOGLE_CLIENT_ID` can list several client IDs. The website is unchanged.
- Checked: `tsc --noEmit`, Android bundle export, web preview against the running API (login, student home, sessions, session page, admin overview, analytics, session editor), socket login with a bearer token. Not tested on a device or on iOS.
