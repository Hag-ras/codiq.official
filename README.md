# Codiq platform

Programming school platform for three tracks: kids (8–16), Egyptian secondary curriculum (15), and college.

## Stack

| Layer | Choice | Why |
|---|---|---|
| API | **NestJS 11** + **Prisma 6** + **PostgreSQL 16** | Modules, guards and DTO validation suit role-based rules; Prisma gives typed queries and migrations |
| Web | **Next.js 15** (App Router) + **Tailwind CSS 4** + **TanStack Query** + **React Hook Form/Zod** | One app for the public site (SSR, SEO) and the dashboards; responsive for desktop and mobile |
| Live classes | **LiveKit** (self-host or LiveKit Cloud) | Video, audio, screen share and chat out of the box; recording to S3 via Egress |
| Files | **S3-compatible** storage (MinIO locally, Cloudflare R2 or AWS S3 in prod) | Browser uploads directly with signed URLs; videos and materials never go through the API |
| Payments | **Paymob** (card, wallets, installments), **Fawry** (reference codes), **InstaPay** (receipt + admin approval) | Covers how Egyptian families actually pay |

```
codiq-platform/
├─ docker-compose.yml    Postgres, MinIO, LiveKit (dev)
├─ backend/              NestJS API  → http://localhost:4000/api
└─ frontend/             Next.js web → http://localhost:3000
```

## Run locally

```bash
docker compose up -d

cd backend
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run start:dev

cd ../frontend
cp .env.example .env.local      # JWT_ACCESS_SECRET must match the backend
npm install
npm run dev
```

Demo accounts (password `Password123!`): `malak@` kids student, `omar@` college student, `nour@` parent, `karim@` instructor, `sara@` admin — all `@codiq.app`. The login page has one-click buttons for them in development.

## Authentication and authorization

- **argon2** password hashes. **JWT access token** (15 min) and **rotating refresh token** (30 days, hash stored in DB), both in `httpOnly` `SameSite=Lax` cookies.
- The browser calls `/api/*` on the Next.js origin; Next rewrites to NestJS, so cookies stay first-party.
- **Roles**: `STUDENT`, `PARENT`, `INSTRUCTOR`, `ADMIN`.
  - API: global `JwtAuthGuard` (opt out with `@Public()`), `RolesGuard` with `@Roles(...)`.
  - Resource checks in `AccessService.assertSessionAccess`: admin → everything; instructor → their own sessions; student → active enrollment in the package; parent → a linked child is enrolled.
  - Web: `middleware.ts` verifies the access token, silently refreshes, and redirects by role. This is only for UX; the API is the source of truth.
- Password reset: single-use token (SHA-256 stored), 1-hour expiry, logs out every device. Wire `MailService` to Resend, SES or Postmark.
- Changing a user's role clears their refresh token, so it takes effect on next login.

## Payments

| Method | Flow | Confirmation |
|---|---|---|
| Card, mobile wallet, installments | `POST /payments/checkout` → Paymob Intention → redirect to Paymob Unified Checkout → back to `/checkout/result` | Paymob webhook (HMAC-SHA512 verified) |
| Fawry | API creates a reference code, valid 48h; student pays at any outlet or app | Fawry V2 notification (SHA-256 signature verified) |
| InstaPay | Show the IPA address and amount; student uploads the receipt and reference | Admin approves in **Payments** |

`markPaid` is idempotent and creates or extends the enrollment: lifetime for one-time, +30 days per payment for monthly.

Before going live:
1. Create Paymob integrations (card, wallet, valU and others) and set the IDs in `.env`. Set the webhook to `{API_PUBLIC_URL}/api/payments/webhooks/paymob`.
2. Get Fawry production keys and set the notification URL to `/api/payments/webhooks/fawry`.
3. Check both providers' current docs for the exact field names used in `payments/providers.ts`. They are written against the published Intention API and FawryPay V2, but providers change details.
4. Monthly auto-charge: currently students renew manually, which is the only option for Fawry and wallets. For cards, add Paymob card tokenization and a scheduled job.

## Sessions

Each session belongs to a package and has:
- **Recording**: uploaded MP4 (signed URL playback with progress tracking), or produced automatically when the instructor clicks **Record class** (LiveKit Egress → S3 → webhook sets `videoKey`).
- **Live class**: LiveKit room named after the session id. The classroom opens 15 minutes before the start time. Raise hand uses participant attributes. Students join with camera and mic off.
- **Materials**: any files, downloaded through signed URLs.
- **Assignment**: text and/or file submission; instructors grade with score and feedback.
- **Quiz**: multiple choice, auto-graded; correct answers are hidden until the student has submitted.

Admins add sessions at `/dashboard/admin/sessions/new` and packages at `/dashboard/admin/packages`.

## Production notes

- Set `NODE_ENV=production` so cookies are `Secure`. Serve web and API under one domain, or keep the rewrite.
- LiveKit Egress runs as a separate service (`livekit/egress`); LiveKit Cloud includes it.
- For large video libraries, Bunny Stream or Cloudflare Stream add adaptive streaming and DRM-style protection. Swap `StorageService.downloadUrl` for their signed playback URLs.
- Add rate limits for webhooks per provider IP, error tracking (Sentry), and backups for Postgres.
