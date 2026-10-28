# Codiq: getting your keys

I can't create accounts or API keys for you, so this is the step-by-step for each one. Paste the values into
`backend/.env` and `frontend/.env.local` (never into chat, never into git; both files are in `.gitignore`).
After each step run `cd backend && npm run check:env`: it tests the connection and tells you what's still missing.

Do them in this order: 1 Supabase, 2 Google, 3 Cloudflare R2, 4 Paymob, 5 Email (Resend).

---

## 1. Supabase (database)

1. Go to https://supabase.com, sign in, **New project**. Pick a region close to Egypt (for example Frankfurt) and save the database password.
2. Open the project, click **Connect** (top bar). Under **ORM** / **Prisma** copy the two connection strings.
3. In `backend/.env`:
   ```
   # pooled (Supavisor, port 6543): used by the running API
   DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
   # direct or session pooler (port 5432): used only for migrations
   DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
   ```
   If your password has special characters (`@ # / :`), URL-encode them.
4. Create the tables and demo data:
   ```bash
   cd backend
   npx prisma migrate deploy     # applies prisma/migrations
   npm run db:seed               # optional demo accounts (do NOT seed production)
   npm run check:env
   ```
5. Supabase is used as plain Postgres here. Our own login stays in charge, so you don't need Supabase Auth.

---

## 2. Google sign-in (OAuth client ID)

1. Go to https://console.cloud.google.com, create a project (for example "Codiq").
2. **APIs & Services → OAuth consent screen** (or *Google Auth Platform → Branding*): app name `Codiq`, your support email, logo from the brand kit. User type **External**. Publish it to **In production** when you launch, otherwise only listed test users can sign in.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
4. **Authorized JavaScript origins**: add each origin exactly (no paths, no trailing slash):
   - `http://localhost:3000` (and `http://localhost:3100` if you use that port)
   - `https://your-real-domain.com`
   Leave *Authorized redirect URIs* empty (the Google button doesn't use redirects).
5. Copy the **Client ID** (looks like `123456-abc.apps.googleusercontent.com`) into **both** files:
   - `backend/.env` → `GOOGLE_CLIENT_ID=...`
   - `frontend/.env.local` → `NEXT_PUBLIC_GOOGLE_CLIENT_ID=...`
   There is no client secret to store: the backend only verifies Google's signed ID token.
6. Restart both servers (the frontend variable is baked in at build time).

How it behaves: an existing email is logged in (and linked to Google); a new email is asked to choose student/parent first (on the sign-up page), then Google creates the account.

---

## 3. Cloudflare R2 (video storage)

1. Go to https://dash.cloudflare.com → **R2 Object Storage** (add a payment method; the free tier is 10 GB and there are **no download fees**).
2. **Create bucket** (for example `codiq-videos`). Keep it **private**.
3. **R2 → Manage API tokens → Create API token**, permission **Object Read & Write**, scope it to this bucket. Copy the **Access Key ID** and **Secret Access Key** (shown once). Your **Account ID** is on the R2 overview page.
4. In `backend/.env`:
   ```
   S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=codiq-videos
   S3_ACCESS_KEY=<Access Key ID>
   S3_SECRET_KEY=<Secret Access Key>
   ```
5. **Bucket → Settings → CORS policy** (needed because browsers upload straight to R2 with a signed URL):
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://your-real-domain.com"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
6. `npm run check:env` uploads and downloads a test file to confirm it works.

Locally you don't need R2: `docker compose up -d` starts an S3-compatible store (rustfs) and creates the `codiq` bucket.

---

## 4. Paymob (payments)

1. Sign up at https://paymob.com (Egypt). While your business is being verified you work in **Test mode**. Use test keys first.
2. Keys: **Settings → Account Info** → click *View* on **Secret Key** (`egy_sk_test_...`), **Public Key** (`egy_pk_test_...`). The **HMAC** secret is in the same area (some accounts show it under *Settings → Security* or *Developers → Webhooks*).
3. Integration IDs: **Developers → Payment Integrations**. Create/enable one for **Online Card**, one for **Mobile Wallet**, and (if offered) installments such as valU. Each has a numeric ID.
4. In `backend/.env`:
   ```
   PAYMOB_SECRET_KEY=egy_sk_test_...
   PAYMOB_PUBLIC_KEY=egy_pk_test_...
   PAYMOB_HMAC_SECRET=...
   PAYMOB_CARD_INTEGRATION_ID=123456
   PAYMOB_WALLET_INTEGRATION_ID=123457
   PAYMOB_INSTALLMENT_INTEGRATION_IDS=123458,123459
   ```
   Test keys must be used with test integration IDs (mixing modes is the most common error).
5. Webhook: Paymob must reach your API from the internet. Locally use a tunnel (`cloudflared tunnel --url http://localhost:4000`) and set `API_PUBLIC_URL` to that URL. The API already sends `notification_url` with every payment; in the dashboard also set the integration's **Transaction processed callback** to `{API_PUBLIC_URL}/api/payments/webhooks/paymob`.
6. Test with Paymob's test card numbers (listed in their docs under *Test cards*). A successful test flips the payment to PAID and creates the enrollment.
7. Not yet verified against live Paymob: the request and response fields in `backend/src/payments/providers.ts` follow the published Intention API, but I couldn't call Paymob without your keys. Test one card payment in sandbox before announcing anything.

Optional: **Fawry** (merchant code + secure key from Fawry onboarding) and **InstaPay** (just set `INSTAPAY_ADDRESS`; admins approve receipts at *Admin → Payments*).

---

## 5. Email (Resend)

1. Sign up at https://resend.com (free tier: 3,000 emails a month, 100 a day).
2. **API Keys → Create API key** (permission *Sending access*). Copy it (shown once).
3. **Domains → Add domain** (for example `codiq.app`), then add the DNS records Resend shows (SPF, DKIM) at your domain registrar and click **Verify**. Without a verified domain, Resend only delivers to your own account email.
4. In `backend/.env`:
   ```
   RESEND_API_KEY=re_...
   MAIL_FROM=Codiq <no-reply@codiq.app>
   ```
5. Test: use **Forgot password** on the login page with a real address.

What gets sent: welcome email on sign-up, password-reset link, and a payment receipt when a payment is confirmed (card, wallet, Fawry or approved InstaPay). With `RESEND_API_KEY` empty, emails are only printed in the API log. A failed send never blocks signup or a payment.

---

## 6. Fawry (pay at a Fawry outlet) — optional
1. Apply as a merchant at https://www.fawry.com (Fawry Pay / "Pay at Fawry" for online merchants), or ask your Paymob account manager, because Paymob can also issue Fawry codes and then you need nothing extra.
2. Fawry sends you staging (test) access first: a **Merchant Code** and a **Security Key**. Put them in `FAWRY_MERCHANT_CODE` and `FAWRY_SECURE_KEY`; `FAWRY_BASE_URL` stays on the staging address while testing.
3. For live, Fawry asks for business documents (commercial register, tax card, bank account) and gives you production keys and a production URL. Change `FAWRY_BASE_URL` to the production address they give you.
4. Give Fawry your callback URL: `https://<your-api>/api/payments/webhooks/fawry`.
If you skip Fawry, leave the three values empty and the option stays unusable; hide it in the checkout before launch.

## 7. Videos from YouTube (for now)
Upload each lesson to YouTube as **Unlisted** (not Private, because private videos will not play for students). In the admin, create or edit a recorded session and paste the link into **YouTube link**. Anyone who has the link can watch it, so it is weaker protection than the paid-course storage in section 3. Move to Cloudflare R2 when you need to protect paid content.

## Admin access rules
- Every URL with an `admin` path segment is locked to admins by a global guard (`AdminAreaGuard`), even if a route forgets `@Roles` or is marked public. Roles are read from the database, not the token, so a demoted admin loses access immediately.
- Admin pages check again on the server; non-admins are redirected.
- You can't register as admin; only an existing admin can create one. An admin can't demote themselves, and the last admin can't be demoted.
- Prove it any time: start the API, then `cd backend && npm run test:access`.

---

## Before going live
- Replace `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` with long random values (`openssl rand -hex 32`); the frontend's `JWT_ACCESS_SECRET` must match the backend.
- `NODE_ENV=production`, serve web and API over HTTPS, and set `FRONTEND_URL` and `API_PUBLIC_URL`.
- Switch Paymob to live keys, add your real domain to Google's authorized origins and R2's CORS, and don't run `db:seed` on production.
