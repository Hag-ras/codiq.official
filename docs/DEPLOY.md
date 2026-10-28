# Keys and settings needed to build and deploy

Where each value goes: **API** = `backend/.env` (set as environment variables on the API host), **WEB** = `frontend/.env.local` (environment variables on the web host). Steps for getting each key are in `SETUP-KEYS.md`.

## Must have before launch
| # | Value | Goes in | Where to get it |
|---|---|---|---|
| 1 | `DATABASE_URL` (pooled) and `DIRECT_URL` (direct) | API | Supabase: Project Settings, Database |
| 2 | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (different random strings, 48+ chars) | API; the access one also in WEB | Generate: `openssl rand -base64 48`. The web app's `JWT_ACCESS_SECRET` must be identical to the API's |
| 3 | `FRONTEND_URL` (for example `https://codiq.com`) | API | Your web domain |
| 4 | `API_URL` (server to server) and `NEXT_PUBLIC_WS_URL` (browser WebSocket for the support chat) | WEB | Your API domain, for example `https://api.codiq.com` |
| 5 | `API_PUBLIC_URL` (the API's public address for payment webhooks) | API | Same API domain |
| 6 | (optional while videos are on YouTube) `S3_ENDPOINT`, `S3_REGION=auto`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | API | Cloudflare R2 bucket and API token (also set the bucket CORS) |
| 7 | `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_CARD_INTEGRATION_ID`, `PAYMOB_WALLET_INTEGRATION_ID`, `PAYMOB_INSTALLMENT_INTEGRATION_IDS` | API | Paymob dashboard. Also set the transaction webhook to `https://<api>/api/payments/webhooks/paymob` |
| 8 | `GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (same value) | API and WEB | Google Cloud OAuth "Web application"; add your domain to the authorised JavaScript origins |
| 9 | `RESEND_API_KEY`, `MAIL_FROM` (an address on a domain you verified in Resend) | API | Resend: API Keys, Domains |
| 10 | `LIVEKIT_URL`, `LIVEKIT_HTTP_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | API | LiveKit Cloud project (replaces the local dev server) |
| 11 | `INSTAPAY_ADDRESS` | API | Your real InstaPay address |
| 12 | `NODE_ENV=production` | API and WEB | |

## Fawry (skipped for now)
Fawry is switched off: the option is hidden at checkout, and the API refuses it while `FAWRY_MERCHANT_CODE` is empty. To turn it on later, set the three Fawry values on the API and `NEXT_PUBLIC_ENABLE_FAWRY=1` on the web app.

`FAWRY_BASE_URL` (production URL from Fawry), `FAWRY_MERCHANT_CODE`, `FAWRY_SECURE_KEY`. Skip these and hide the Fawry option otherwise.

## Hosting
- **Web** (Next.js): Vercel or any Node host.
- **API** (NestJS + WebSocket): a host that keeps a Node process running and allows WebSockets, such as Render, Railway or Fly.io. It cannot run as serverless functions.
- **Same parent domain**: put the web app and the API under one parent domain (`codiq.com` and `api.codiq.com`). The login cookies must reach the API, otherwise the live chat cannot sign in.
- Run `npm run db:deploy` once against the production database, then create the first admin by hand (`UPDATE "User" SET role = 'ADMIN' WHERE email = '...'`). Nobody can register as admin from the site, on purpose.
- Behind a proxy or load balancer, make sure it forwards `X-Forwarded-For` (the visitor chat limits new chats per IP) and WebSocket upgrades.

## Check before going live
1. `npm run check:env` in `backend` (database, storage and which keys are missing).
2. `npm run test:flow`, `npm run test:access` and `npm run test:guard` against a staging copy.
3. One real Paymob sandbox card payment and a webhook delivery.
4. Delete or change the demo accounts (`*@codiq.app`, password `Password123!`) and do not run the seed in production.
