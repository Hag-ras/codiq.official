/* Run: npm run check:env. Tests each integration and says what is missing. Never prints secrets. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { GetObjectCommand, PutObjectCommand, S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const env = process.env;
const ok = (m: string) => console.log(`  OK    ${m}`);
const bad = (m: string) => console.log(`  FAIL  ${m}`);
const skip = (m: string) => console.log(`  TODO  ${m}`);

async function database() {
  console.log('Database');
  const url = env.DATABASE_URL ?? '';
  const host = url.match(/@([^:/]+)/)?.[1] ?? '?';
  const prisma = new PrismaClient();
  try {
    const n = await prisma.user.count();
    ok(`connected to ${host} (${n} users)${/localhost|127\.0\.0\.1/.test(host) ? ' [local]' : ' [hosted]'}`);
    if (host.includes('pooler') && !url.includes('pgbouncer=true')) bad('pooled Supabase URL should end with ?pgbouncer=true');
    if (!env.DIRECT_URL) bad('DIRECT_URL is missing (needed for migrations)');
  } catch (e) {
    bad(`cannot connect: ${(e as Error).message.split('\n').slice(-2).join(' ')}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function storage() {
  console.log('Video storage (S3 / Cloudflare R2)');
  const need = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'].filter((k) => !env[k]);
  if (need.length) return skip(`missing ${need.join(', ')}`);
  const s3 = new S3Client({
    endpoint: env.S3_ENDPOINT, region: env.S3_REGION ?? 'us-east-1', forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: env.S3_ACCESS_KEY!, secretAccessKey: env.S3_SECRET_KEY! },
  });
  const Key = `healthcheck/${Date.now()}.txt`;
  try {
    const put = await getSignedUrl(s3, new PutObjectCommand({ Bucket: env.S3_BUCKET, Key, ContentType: 'text/plain' }), { expiresIn: 60 });
    const r = await fetch(put, { method: 'PUT', body: 'ok', headers: { 'Content-Type': 'text/plain' } });
    if (!r.ok) throw new Error(`presigned upload returned ${r.status}`);
    const got = await fetch(await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key }), { expiresIn: 60 }));
    if ((await got.text()) !== 'ok') throw new Error('download did not match');
    await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key }));
    ok(`upload + signed download work on bucket "${env.S3_BUCKET}" (${new URL(env.S3_ENDPOINT!).host})`);
    skip('browser uploads also need CORS on the bucket, see docs/SETUP-KEYS.md section 3');
  } catch (e) {
    bad((e as Error).message);
  }
}

function keys(title: string, names: string[], hint: string) {
  console.log(title);
  const missing = names.filter((k) => !env[k]);
  if (!missing.length) ok('all variables set');
  else skip(`missing ${missing.join(', ')} ${hint}`);
}

(async () => {
  await database();
  await storage();
  keys('Google sign-in', ['GOOGLE_CLIENT_ID'], '(docs/SETUP-KEYS.md section 2)');
  keys('Paymob (cards, wallets, installments)', ['PAYMOB_SECRET_KEY', 'PAYMOB_PUBLIC_KEY', 'PAYMOB_HMAC_SECRET', 'PAYMOB_CARD_INTEGRATION_ID'], '(docs/SETUP-KEYS.md section 4)');
  keys('Fawry (optional)', ['FAWRY_MERCHANT_CODE', 'FAWRY_SECURE_KEY'], '(optional, add later)');
  const secrets = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].filter((k) => !env[k] || env[k]!.startsWith('change-me'));
  console.log('Security');
  secrets.length ? bad(`${secrets.join(', ')} still use the placeholder, set long random values before going live`) : ok('JWT secrets are set');
})();
