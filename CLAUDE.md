# Codiq — project context for Claude Code

Read this first. It summarises decisions made while designing Codiq, so you don't need the original chat.

## Company
- Name: **Codiq** (lowercase in the logo: `codiq`)
- Slogan: **Think it. Code it.**
- Three tracks:
  - KIDS: general programming, ages 8–16 (playful dashboard tone)
  - SCHOOL: Egyptian Ministry programming curriculum, age 15 / Secondary 1
  - COLLEGE: university students (calm dashboard tone)
- Positioning: we teach students **how to learn and understand**, not how to memorise code.
- Market: Egypt, prices in EGP (stored as piasters), English UI, Arabic (Egyptian) marketing copy.

## Brand (chosen logo: "Cursor")
- Wordmark: `codiq` in JetBrains Mono Bold, letter-spacing -0.04em, followed by a solid clay block cursor (width 0.42em, height 0.86em). Cursor may blink on screen (~1.1s, steps), solid in print.
- App icon: ink rounded square, paper "c" + clay cursor.
- Colors: ink `#1c1d21`, paper `#f5f3ee`, clay `#ae593a` (on dark `#d4896e`), track accents KIDS `#ae593a`, SCHOOL `#3d7a5a`, COLLEGE `#3b5f9e`.
- Type: JetBrains Mono (logo, headings), DM Sans (UI body).
- Avoid neon colors; keep everything simple.
- Brand assets: `../codiq-brand-kit-cursor/` (SVG/PNG logos, app icons, favicons, social).

## Stack (decided)
- Backend: NestJS 11 + Prisma 6 + PostgreSQL 16 (chosen over MongoDB: relational data, payment transactions, constraints, reporting).
- Frontend: Next.js 15 App Router + Tailwind 4 + TanStack Query + React Hook Form/Zod. Desktop and mobile.
- Live classes: LiveKit (video, chat, raise hand via participant attributes, recording via Egress to S3).
- Storage: S3-compatible (rustfs in dev, Cloudflare R2 in prod), signed upload/download URLs.
- Payments: Paymob (card, wallets, installments), Fawry (reference codes), InstaPay (receipt upload + admin approval). One-time and monthly billing.
- Auth: argon2, JWT access (15m) + rotating refresh (30d) in httpOnly cookies; roles STUDENT, PARENT, INSTRUCTOR, ADMIN; resource checks in `AccessService`.

## Status
Installed, built and smoke-tested locally (see `DEV_LOG.md`). Added: Google sign-in, admin overview dashboard, student pages (my courses, catalog, profile), Supabase-ready Prisma config, Cloudflare R2-compatible storage, `npm run check:env`. Local storage is rustfs (docker compose), not MinIO.
Waiting on the owner's keys: Supabase, Google client ID, R2, Paymob. Steps are in `docs/SETUP-KEYS.md`.

## Next tasks (agreed, not built)
1. **Redis + BullMQ** (add to docker-compose, NestJS queue module)
   - Shared rate limiting via Redis storage for `@nestjs/throttler`.
   - Cache package catalogue.
2. **Email** via a real provider (Resend or SES) through a queue: password reset, payment receipt.
3. **Scheduled jobs**: renewal reminders 3 days and 1 day before monthly `activeUntil`; expire PENDING Fawry payments older than 48h; reconcile stuck Paymob payments by querying Paymob.
4. **Webhooks**: persist raw webhook, return 200 immediately, process in a queue with retries.
5. Verify Paymob Intention API and FawryPay V2 field names against current docs; test in sandbox.
6. Monthly auto-charge for cards via Paymob card tokenization (currently manual renewal).

## Other files in this project
- `../Codiq Logo Concepts.dc.html`: the 5 logo concepts + slogan options (Cursor = 1c was chosen).
- `../Codiq Launch Script.dc.html`: Egyptian Arabic launch video script (75s + 15s version). Closing scene has a placeholder for the website link.
