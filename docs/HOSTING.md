# Hosting: Vercel (web) + Render (API) + any PostgreSQL

```
Browser ──► Vercel (Next.js, /frontend)
              │  /api/* is proxied to the API (so login cookies stay first-party)
              ▼
            Render (NestJS, /backend, always on, WebSocket for the support chat)
              ├──► PostgreSQL (Supabase now; Aiven, Neon... later)
              ├──► Cloudflare R2 (files)   ├──► LiveKit Cloud (live classes)
              └──► Resend (email)          └──► Paymob / Fawry (payments)
```

## 1. Database (do this first)
Create a PostgreSQL 15+ database anywhere. Copy two addresses (see the comments in `backend/.env.production.example` for pooled vs direct). The migrations are plain SQL, so the first deploy creates every table: the Render blueprint runs `prisma migrate deploy` before each release.

Create the first admin once the tables exist (nobody can register as admin on purpose):
```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'you@your-domain.com';
```
(Register normally on the site first, then run that.) Never run `db:seed` in production.

## 2. API on Render
1. Render > New > **Blueprint**, pick the GitHub repo. It reads `render.yaml` (service `codiq-api`, Frankfurt, **Starter plan**).
2. Fill every variable marked "sync: false" (values in `docs/DEPLOY.md` and `SETUP-KEYS.md`). Set `FRONTEND_URL=https://<your web domain>` and `API_PUBLIC_URL=https://<your api domain>`.
3. Add a custom domain such as `api.your-domain.com` (Settings > Custom Domains) and point DNS at it.
4. Check `https://api.your-domain.com/api/packages` returns JSON.

Why not the free plan: it sleeps after 15 minutes without traffic. That breaks the support chat connection, stops the reminder emails and webhook retries (they run in the API process), and makes the first visitor wait about a minute.

## 3. Web on Vercel
1. Vercel > Add New > Project > import the repo, set **Root Directory = `frontend`**. Framework: Next.js (auto).
2. Environment variables (Production):
   | Name | Value |
   |---|---|
   | `API_URL` | `https://api.your-domain.com` (server side proxy and middleware) |
   | `NEXT_PUBLIC_WS_URL` | `https://api.your-domain.com` (browser, support chat) |
   | `JWT_ACCESS_SECRET` | exactly the same value as on Render |
   | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | your Google client id |
   | `NEXT_PUBLIC_CONTACT_EMAIL` | shown on the Terms and Privacy pages |
3. Add your domain (`your-domain.com`). Keep the web app and the API under the **same parent domain** so the chat's cookie reaches the API.
4. Vercel's free Hobby plan is for non-commercial use. A business site needs the Pro plan.

## 4. After both are live
- Google Cloud: add `https://your-domain.com` to Authorised JavaScript origins.
- Paymob: set the transaction callback to `https://api.your-domain.com/api/payments/webhooks/paymob`.
- Cloudflare R2: add your domain to the bucket CORS policy.
- Resend: verify the domain and set `MAIL_FROM`.
- Run `npm run check:env` in `backend` with production variables (from your own computer, using the production values), then one real sandbox payment.
- Turn on database backups at your provider.

## Moving the database (Supabase to Aiven, or anywhere else)
The code uses plain PostgreSQL through Prisma: no Supabase auth, storage, policies or extensions. So a move is a data copy plus two settings. Plan about 30 minutes with a short pause for writes.

1. Create the new database. Note the new address (include `?sslmode=require`).
2. **Stop writes**: on Render, suspend the API (or put the site in maintenance) so nothing changes during the copy.
3. Copy the data (from any computer with `pg_dump` and `psql` version 15+):
   ```bash
   pg_dump --no-owner --no-privileges --format=custom "$OLD_DIRECT_URL" -f codiq.dump
   pg_restore --no-owner --no-privileges --dbname "$NEW_DIRECT_URL" codiq.dump
   ```
   Use the **direct** address for the old database, not the pooler. If the restore warns about the `_prisma_migrations` table, that is fine: it carries the migration history over.
4. Check the copy: `DATABASE_URL="$NEW_DIRECT_URL" DIRECT_URL="$NEW_DIRECT_URL" npx prisma migrate status` should say "Database schema is up to date", and compare a few row counts (`SELECT count(*) FROM "User";`).
5. In Render, change `DATABASE_URL` and `DIRECT_URL` to the new database (same value in both if the new provider has no pooler; no `pgbouncer=true`). Resume the API. It restarts with the new database.
6. Test login, a payment record and a live class. Keep the old database for a week as a fallback, then delete it.

Things that can differ between providers (and are already handled by the two settings): SSL (`sslmode=require`), pooling (pgbouncer flag), and connection limits (keep `connection_limit=5` on a small plan, or use the provider's pooler).
