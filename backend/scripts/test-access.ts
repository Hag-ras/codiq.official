/*
 * Proves that only admins can use admin routes. Run with the API up and the demo data seeded:
 *   npm run test:access          (API_URL defaults to http://localhost:4000)
 * Tries every admin-only route as: nobody, student, parent, instructor, admin. Exits 1 on any leak.
 */
import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';

const API = process.env.API_URL ?? 'http://localhost:4000';
const PW = 'Password123!';
const prisma = new PrismaClient();

const ADMIN_ONLY: [method: string, path: string][] = [
  ['GET', '/admin/stats'], ['GET', '/admin/analytics/revenue'], ['GET', '/admin/analytics/students'], ['GET', '/admin/analytics/courses'], ['GET', '/admin/analytics/student-payments'], ['GET', '/admin/analytics/student-payments/x'], ['GET', '/admin/courses/x'], ['GET', '/admin/coupons'], ['POST', '/admin/coupons'], ['POST', '/admin/coupons/generate'], ['PATCH', '/admin/coupons/x'], ['DELETE', '/admin/coupons/x'], ['GET', '/admin/assignments'], ['GET', '/admin/assignments/x'], ['PATCH', '/users/x'], ['DELETE', '/users/x'], ['GET', '/users'], ['POST', '/users'], ['PATCH', '/users/x/role'],
  ['GET', '/payments'], ['GET', '/payments/x/receipt'], ['PATCH', '/payments/x/approve'], ['PATCH', '/payments/x/reject'],
  ['POST', '/packages'], ['PATCH', '/packages/x'], ['DELETE', '/packages/x'],
  ['GET', '/sessions'], ['POST', '/sessions'], ['PATCH', '/sessions/x'], ['DELETE', '/sessions/x'],
];

async function login(email: string) {
  const r = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW }) });
  if (!r.ok) throw new Error(`login failed for ${email}: ${r.status}`);
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
const call = async (cookie: string | null, [method, path]: [string, string]) =>
  (await fetch(`${API}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: method === 'GET' || method === 'DELETE' ? undefined : '{}' })).status;

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`); if (!ok) failures++; };

(async () => {
  const actors: [string, string | null][] = [['nobody (no login)', null], ['student', 'malak@codiq.app'], ['parent', 'nour@codiq.app'], ['instructor', 'karim@codiq.app']];
  for (const [name, email] of actors) {
    const cookie = email ? await login(email) : null;
    const bad: string[] = [];
    for (const r of ADMIN_ONLY) {
      const s = await call(cookie, r);
      const expected = cookie ? 403 : 401;
      // Instructors may edit the content of their OWN sessions now: for a session that doesn't exist that is a 404, never a 2xx
      // (editing someone else's session is covered by test:features)
      const instructorOwnRoute = name === 'instructor' && r[0] === 'PATCH' && r[1] === '/sessions/x';
      if (instructorOwnRoute ? ![403, 404].includes(s) : s !== expected) bad.push(`${r[0]} ${r[1]} -> ${s}`);
    }
    console.log(`${name}`);
    check(`blocked on all ${ADMIN_ONLY.length} admin routes`, !bad.length, bad.join('; '));
  }

  console.log('admin');
  const adminCookie = await login('sara@codiq.app');
  check('GET /admin/stats allowed', (await call(adminCookie, ['GET', '/admin/stats'])) === 200);
  check('GET /users allowed', (await call(adminCookie, ['GET', '/users'])) === 200);

  console.log('demoted admin keeps an old token');
  const tmp = `tmp-admin-${Date.now()}@codiq.app`;
  const argon2 = await import('argon2');
  const u = await prisma.user.create({ data: { email: tmp, name: 'Temp Admin', role: Role.ADMIN, passwordHash: await argon2.hash(PW) } });
  try {
    const cookie = await login(tmp);
    check('admin token works before demotion', (await call(cookie, ['GET', '/admin/stats'])) === 200);
    await prisma.user.update({ where: { id: u.id }, data: { role: Role.STUDENT } });
    check('same token is refused right after demotion', (await call(cookie, ['GET', '/admin/stats'])) === 403);
  } finally {
    await prisma.user.delete({ where: { id: u.id } });
  }

  console.log('assistant (a promoted student)');
  const argon = await import('argon2');
  const asst = await prisma.user.create({ data: { email: `tmp-asst-${Date.now()}@codiq.app`, name: 'Temp Assistant', role: Role.ASSISTANT, passwordHash: await argon.hash(PW) } });
  try {
    const ac = await login(asst.email);
    const leaks: string[] = [];
    for (const r of ADMIN_ONLY) { const st = await call(ac, r); if (st !== 403) leaks.push(`${r[0]} ${r[1]} -> ${st}`); }
    check(`assistant blocked on all ${ADMIN_ONLY.length} admin routes`, !leaks.length, leaks.join('; '));
    check('assistant CAN open the grading queue', (await call(ac, ['GET', '/submissions'])) === 200);
    check('assistant cannot create sessions', (await call(ac, ['POST', '/sessions'])) === 403);
  } finally {
    await prisma.user.delete({ where: { id: asst.id } });
  }

  console.log('lockout protection');
  const me = await prisma.user.findUniqueOrThrow({ where: { email: 'sara@codiq.app' } });
  const r = await fetch(`${API}/api/users/${me.id}/role`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ role: 'STUDENT' }) });
  check('an admin cannot demote themselves', r.status === 400);
  const still = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  check('admin role unchanged in the database', still.role === Role.ADMIN);

  console.log('privilege escalation');
  const reg = await fetch(`${API}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Evil', email: `evil-${Date.now()}@x.com`, password: 'Password123!', accountType: 'ADMIN' }) });
  check('cannot register as ADMIN', reg.status === 400);

  await prisma.$disconnect();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll access checks passed');
  process.exit(failures ? 1 : 0);
})();
