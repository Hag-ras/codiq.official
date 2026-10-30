# Codiq platform

**Think it. Code it.** Codiq is a programming school for Egypt with three tracks: **Kids** (ages 8–16), **School** (the Egyptian secondary curriculum, age 15) and **College**. This repository is the whole product: the public website, the student, parent and instructor areas, the admin dashboard, live support chat, payments and the API behind them.

All screenshots below were taken from the running app with the demo accounts from the seed (see [Demo accounts](#demo-accounts)). The demo database has courses and users but no payments yet, which is why revenue shows 0.

- [What is in the website](#what-is-in-the-website)
- [Who can do what](#who-can-do-what)
- [Features that apply everywhere](#features-that-apply-everywhere)
- [Stack](#stack) · [Run locally](#run-locally) · [Demo accounts](#demo-accounts)
- [Authentication](#authentication-and-authorization) · [Payments](#payments) · [Sessions](#sessions) · [Tests](#tests) · [Deploy](#deploy)

---

## What is in the website

### 1. Public site

**Landing page.** The brand hero with the animated terminal, the three tracks with their starting prices, and how it works. Signed-in visitors skip it and land on their own dashboard.

![Landing page](docs/screenshots/landing.png)

**Packages.** Every course grouped by track, with one-time and monthly pricing and installments where a course allows them. Filters by track and billing type.

![Packages](docs/screenshots/pricing.png)

**Checkout.** Pick card, mobile wallet, installments or InstaPay, apply a coupon, and see the final price before paying.

![Checkout](docs/screenshots/checkout.png)

### 2. Sign up and log in

Email and password, or **Continue with Google**. Sign-up asks whether you are a student or a parent. A neural network with signals running through it and drifting code symbols animates behind the form (the public pages have a light rain of 0s and 1s instead). Typing in a field fires a signal.

![Log in](docs/screenshots/login.png)

![Sign up](docs/screenshots/signup.png)

Password reset is a single-use link that expires in one hour.

![Forgot password](docs/screenshots/forgot-password.png)

### 3. Live chat with Codiq

The floating **Chat with us** button is on every page, for everyone except admins and assistants (they answer from the inbox). Visitors who are not logged in can ask about prices without an account: name, optional phone or email and a first question start a chat. Signed-in people keep one conversation across the site and dashboard. It runs over WebSockets with typing indicators and unread counts, and there is no email in the loop.

![Chat widget](docs/screenshots/chat-widget.png)

### 4. Student area

Home shows progress, what is up next and a to-do list. **Courses** lists what the student is enrolled in, **Sessions** lists every session with its status, **Billing** shows payments, and **Profile** holds name, phone, photo and password.

![Student home](docs/screenshots/student-home.png)

![My courses](docs/screenshots/student-courses.png)

![Sessions](docs/screenshots/student-sessions.png)

![Billing](docs/screenshots/student-billing.png)

![Profile](docs/screenshots/student-profile.png)

![Support chat page](docs/screenshots/student-support-chat.png)

A student also sees a banner when a parent asks to link to them, and can accept or decline it.

### 5. Parent area

Parents see each child's progress, quiz scores and the next live class, and can pay for packages. **A child must already have an account.** The parent enters the child's email, and the child approves the link from their own dashboard. Nobody can be linked without saying yes.

![Parent home](docs/screenshots/parent-home.png)

![Child progress report](docs/screenshots/parent-child-progress.png)

![Packages for parents](docs/screenshots/parent-catalog.png)

![Parent billing](docs/screenshots/parent-billing.png)

### 6. Instructor area

Instructors see their own sessions and the work waiting to be graded, with score and feedback. They have **no access to billing or payments**.

![Instructor home](docs/screenshots/instructor-home.png)

![Grading](docs/screenshots/instructor-grading.png)

### 7. Assistant inbox

Assistants and admins answer all visitor and user chats in one inbox: open and resolved conversations, unread counts, typing indicator, and **mark resolved**. A new message reopens a resolved chat. Assistants can also grade every session, and have no access to billing.

![Support inbox](docs/screenshots/assistant-inbox.png)

### 8. Admin dashboard

Admins run the school. The whole `/admin` area is checked against the database on every request, not only the login token.

**Overview.** Revenue, users, active enrollments, active students by track, recent payments and new sign-ups.

![Admin overview](docs/screenshots/admin-overview.png)

**Analytics.** Revenue over time, by payment method and track, a payment funnel, top courses, new students over time and enrollment health. Rows open the payment log behind them.

![Analytics](docs/screenshots/admin-analytics.png)

**Courses.** Every package, with the title as the link into the course. **New course** and **Edit** are one click away.

![Courses](docs/screenshots/admin-packages.png)

**Course detail.** One course in full: the instructors, the enrolled students with their contact data and progress, and the payment log for that course. Edit it in place.

![Course detail](docs/screenshots/admin-course-detail.png)

**Sessions.** Add recorded or live sessions. Videos can be a YouTube link (embedded with progress tracking) or an uploaded file.

![Sessions](docs/screenshots/admin-sessions.png)

![New session](docs/screenshots/admin-session-new.png)

**Assignments.** Every assignment with how much work has come in, and a detail page with two tables: students who submitted, and students who did not.

![Assignments](docs/screenshots/admin-assignments.png)

![Assignment detail](docs/screenshots/admin-assignment-detail.png)

**Payments.** All payments, with approve and reject for InstaPay receipts.

![Payments](docs/screenshots/admin-payments.png)

**Coupons.** Percentage or fixed-amount codes, with a redemption limit, an expiry date, and an optional restriction to one course or track.

![Coupons](docs/screenshots/admin-coupons.png)

**Users and team.** Add, edit or delete accounts. The role dropdown changes anyone's role, and every change asks "are you sure?" first. The page also lists what each role can do.

![Users and team](docs/screenshots/admin-users.png)

![Role change confirmation](docs/screenshots/admin-users-role-popup.png)

---

## Who can do what

| | Visitor | Student | Parent | Instructor | Assistant | Admin |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Browse packages, chat with Codiq | ● | ● | ● | ● | | |
| Watch recordings, join live classes | | ● | | ● | ● | ● |
| Submit assignments and quizzes | | ● | | | | |
| Pay for packages | | ● | ● | | | |
| See children's progress | | | ● | | | |
| Host live classes, own sessions | | | | ● | | ● |
| Grade work | | | | own sessions | all sessions | ● |
| Answer chats in the inbox | | | | | ● | ● |
| Billing and payments | | own | own | none | none | ● |
| Courses, sessions, coupons, users | | | | | | ● |

---

## Features that apply everywhere

**Light and dark mode, English and Arabic.** Buttons at the top right switch theme and language. The theme is set before the first paint, so there is no flash. Arabic switches the whole layout to right-to-left.

| Dark mode | Arabic (right-to-left) |
|---|---|
| ![Landing, dark](docs/screenshots/landing-dark.png) | ![Landing, Arabic](docs/screenshots/landing-arabic.png) |

| Student home, dark | Login, Arabic |
|---|---|
| ![Student home, dark](docs/screenshots/student-home-dark.png) | ![Login, Arabic](docs/screenshots/login-arabic.png) |

**Phones.** Everything is responsive; the dashboard gets a bottom tab bar.

<img src="docs/screenshots/mobile-student-home.png" alt="Student home on a phone" width="300">

**Motion (GSAP).** Hero text and the terminal enter in sequence and tilt toward the mouse, sections reveal on scroll, buttons are slightly magnetic, and a thin blue bar at the top shows scroll progress. Login and sign-up show a neural network with signals; the public pages (landing, pricing, checkout) have a light rain of 0s and 1s falling down the screen, and the dashboards stay plain. Everything respects "reduce motion".

**Brand.** Ink `#1c1d21`, paper `#f5f3ee`, blue `#2b62b3` (`#7fa8e3` on dark); track colours Kids blue, School green `#3d7a5a`, College violet `#6a4c9c`. JetBrains Mono for headings and the logo, DM Sans for text, Noto Sans Arabic for Arabic.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| API | **NestJS 11** + **Prisma 6** + **PostgreSQL 16** | Modules, guards and DTO validation suit role-based rules; Prisma gives typed queries and migrations |
| Web | **Next.js 15** (App Router) + **Tailwind CSS 4** + **TanStack Query** + **React Hook Form / Zod** + **GSAP** | One app for the public site (SSR, SEO) and the dashboards |
| Live support | **socket.io** (WebSockets) | Chat for visitors, users and staff, with no email |
| Live classes | **LiveKit** | Video, audio, screen share and chat; recording to S3 through Egress |
| Files | **S3-compatible** storage (rustfs locally, Cloudflare R2 in production) | Browser uploads go straight to storage with signed URLs |
| Videos | **YouTube** (embedded) or uploaded files | Start with YouTube, move to storage later |
| Payments | **Paymob** (card, wallets, installments) and **InstaPay** (receipt plus admin approval); **Fawry** is built but switched off | Covers how Egyptian families pay |
| Email | **Resend** | Password reset and receipts |
| Database host | **Supabase** (PostgreSQL) | Production database |

```
codiq-platform/
├─ docker-compose.yml    Postgres, rustfs (S3), LiveKit for development
├─ render.yaml           Render blueprint for the API
├─ backend/              NestJS API   → http://localhost:4000/api
├─ frontend/             Next.js web  → http://localhost:3000
└─ docs/                 SETUP-KEYS.md, DEPLOY.md, DATABASE.md, screenshots/
```

---

## Run locally

```bash
docker compose up -d

cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npm run db:seed
npm run start:dev

cd ../frontend
cp .env.example .env.local      # JWT_ACCESS_SECRET must match the backend's
npm install
npm run dev
```

The site is at http://localhost:3000 and the API at http://localhost:4000/api. Every key you need, and where to get it, is in [docs/SETUP-KEYS.md](docs/SETUP-KEYS.md). `npm run check:env` in `backend` tells you what is missing.

### Demo accounts

Password for all of them: `Password123!`. The login page has one-click buttons for them in development.

| Role | Email |
|---|---|
| Admin | `sara@codiq.app` |
| Assistant | `lina@codiq.app` |
| Instructor | `karim@codiq.app` |
| Parent | `nour@codiq.app` (parent of Malak and Ali) |
| Student, Kids | `malak@codiq.app` |
| Student, School | `ali@codiq.app` |
| Student, College | `omar@codiq.app` |

**Never run the seed in production**, and delete or change these accounts before going live.

---

## Authentication and authorization

- **argon2** password hashes. **JWT access token** (15 minutes) and a **rotating refresh token** (30 days, hash stored in the database), both in `httpOnly` `SameSite=Lax` cookies.
- The browser calls `/api/*` on the Next.js origin, which rewrites to NestJS, so cookies stay first-party. The chat WebSocket connects straight to the API (`NEXT_PUBLIC_WS_URL`).
- **Roles:** `STUDENT`, `PARENT`, `INSTRUCTOR`, `ASSISTANT`, `ADMIN`.
  - API: a global `JwtAuthGuard` (opt out with `@Public()`), `RolesGuard` with `@Roles(...)` that re-reads the role from the database, and `AdminAreaGuard`, which locks every `/admin` path to database-verified admins.
  - Resource checks in `AccessService`: admin sees everything; an instructor their own sessions; a student their active enrollments; a parent their linked children.
  - Web: `middleware.ts` checks the token, refreshes it quietly, and redirects by role. This is for convenience only; the API is the source of truth.
- Nobody can register as admin from the site. The first admin is set in the database.
- Changing a user's role clears their refresh token, so it takes effect at their next login.
- Chat limits: visitors get 3 new chats per IP per hour, 300 messages per chat, 2000 characters per message, and 30 events per minute per socket.

## Payments

| Method | Flow | Confirmation |
|---|---|---|
| Card, mobile wallet (Vodafone Cash, Orange, Etisalat, WE), installments | `POST /payments/checkout` creates a Paymob intention, then redirects to Paymob checkout and back to `/checkout/result` | Paymob webhook, HMAC-SHA512 verified |
| InstaPay | Shows the address and amount; the student uploads the receipt and reference | Admin approves in **Payments** |
| Fawry | Built, **switched off** until `FAWRY_MERCHANT_CODE` and `NEXT_PUBLIC_ENABLE_FAWRY=1` are set | Fawry notification, SHA-256 verified |

`markPaid` is idempotent and creates or extends the enrollment: lifetime for one-time, +30 days per payment for monthly. Coupons are applied before the payment is created and priced on the server. Paymob's fees are charged by Paymob and are not added by this app, so price courses with them in mind.

## Sessions

Each session belongs to a package and has:

- **Video:** a YouTube link or an uploaded MP4 (signed playback with progress tracking), or one recorded automatically from a live class.
- **Live class:** a LiveKit room named after the session. It opens 15 minutes before the start time. Students join with camera and mic off, and raise hand uses participant attributes.
- **Materials:** any files, downloaded through signed URLs.
- **Assignment:** text and/or file submission, graded with a score and feedback.
- **Quiz:** multiple choice, auto-graded. Correct answers stay hidden until the student submits.

## Tests

Run these from `backend` against a running API.

```bash
npm run test:flow     # about 80 checks: login for every role, chat, parent link, coupons, payments, access
npm run test:access   # who can reach which route
npm run test:guard    # admin area is locked to database-verified admins
npm run check:env     # database, storage and which keys are missing
```

`test:flow` creates its own data and cleans it up afterwards.

## Deploy

The web app goes on **Vercel**; the API goes on **Render** (it needs a Node process that stays up and allows WebSockets) with a **Supabase** database. Put both under one parent domain, for example `codiq.com` and `api.codiq.com`, so the login cookies reach the API.

- [docs/DEPLOY.md](docs/DEPLOY.md): every value you must set, where it goes, and the pre-launch checklist.
- [docs/SETUP-KEYS.md](docs/SETUP-KEYS.md): how to get each key (Supabase, Google, Paymob, Resend, LiveKit, R2, YouTube).
- `render.yaml`: the Render blueprint for the API, with secrets left for you to fill in.

Production notes:

- Set `NODE_ENV=production` so cookies are `Secure`. Behind a proxy, forward `X-Forwarded-For` and WebSocket upgrades.
- LiveKit Egress is a separate service; LiveKit Cloud includes it.
- Add error tracking (Sentry), rate limits for webhooks, and Postgres backups.
