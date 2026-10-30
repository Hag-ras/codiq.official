/*
 * Full-flow test, end to end through the real HTTP API, the live chat socket and the web pages.
 *   npm run test:flow        (API on API_URL, web app on WEB_URL; demo data seeded)
 * It creates its own throw-away users, course and coupon, walks the whole journey, and deletes everything at the end.
 * Journey: visitor chat -> sign-ups -> parent links child -> admin builds a course -> free checkout with a 100% coupon
 * -> student learns (progress, quiz, assignment) -> parent follows progress -> admin sees it in analytics and course detail
 * -> support chat for parent, student and assistant -> access rules -> language and theme -> cleanup.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { io, type Socket } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:4000';
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const PW = 'Password123!';
const tag = Date.now().toString(36);
const prisma = new PrismaClient();

let failures = 0;
let step = 0;
const check = (label: string, ok: boolean, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`); if (!ok) failures++; };
const section = (name: string) => console.log(`\n${++step}. ${name}`);

type Jar = string;
const cookieOf = (r: Response): Jar => r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
async function call(jar: Jar | null, method: string, path: string, body?: unknown) {
  const r = await fetch(`${API}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json };
}
async function login(email: string, password = PW): Promise<Jar> {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 5000)); continue; }
    if (!r.ok) throw new Error(`login failed for ${email}: ${r.status}`);
    return cookieOf(r);
  }
  throw new Error('login kept being rate limited');
}
async function register(name: string, email: string, type: 'STUDENT' | 'PARENT', track?: string): Promise<Jar> {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${API}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email, password: PW, accountType: type, acceptTerms: true, ...(track ? { track } : {}) }) });
    if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 5000)); continue; }
    if (r.status !== 201) throw new Error(`register ${email}: ${r.status} ${await r.text()}`);
    return cookieOf(r);
  }
  throw new Error('register kept being rate limited');
}
const conn = (cookie?: string, guestKey?: string) => new Promise<Socket>((res, rej) => {
  const s = io(API, { transports: ['websocket'], reconnection: false, extraHeaders: cookie ? { cookie } : {}, ...(guestKey ? { auth: { guestKey } } : {}) });
  s.on('connect', () => res(s)); s.on('connect_error', (e) => rej(e));
});
const emit = (s: Socket, ev: string, p: object) => new Promise<any>((r) => s.timeout(5000).emit(ev, p, (e: Error | null, a: any) => r(e ? { ok: false, error: 'timeout' } : a)));
const wait = (s: Socket, ev: string, ms = 3000) => new Promise<any>((r) => { const t = setTimeout(() => r(null), ms); s.once(ev, (d) => { clearTimeout(t); r(d); }); });
const page = async (jar: Jar | null, path: string, extra: Record<string, string> = {}) => {
  const r = await fetch(`${WEB}${path}`, { redirect: 'manual', headers: { ...(jar || extra.lang ? { cookie: [jar, extra.lang ? `lang=${extra.lang}` : ''].filter(Boolean).join('; ') } : {}) } });
  return { status: r.status, location: r.headers.get('location') ?? '', html: r.status === 200 ? await r.text() : '' };
};

const created = { users: [] as string[], packageId: '', couponId: '' };

async function main() {
  const sockets: Socket[] = [];
  try {
    // The demo accounts must have their demo roles (someone may have been experimenting on the Users page)
    await prisma.user.updateMany({ where: { email: 'lina@codiq.app' }, data: { role: 'ASSISTANT', refreshTokenHash: null } });
    await prisma.user.updateMany({ where: { email: { in: ['sara@codiq.app'] } }, data: { role: 'ADMIN' } });

    section('Visitor asks about prices (not logged in)');
    const adminJar = await login('sara@codiq.app');
    const adminSock = await conn(adminJar); sockets.push(adminSock);
    const visitor = await conn(); sockets.push(visitor);
    const seen = wait(adminSock, 'chat:message');
    const started = await emit(visitor, 'chat:start', { name: `Visitor ${tag}`, contact: '0100000000', body: 'How much is the college track?' });
    check('visitor starts a chat', started.ok && !!started.guestKey);
    const m = await seen; check('admin receives it live', !!m && m.message.body.includes('college'));
    const back = wait(visitor, 'chat:message');
    await emit(adminSock, 'chat:reply', { threadId: m.threadId, body: 'College packages start at 1,200 EGP.' });
    check('visitor receives the reply live', (await back)?.message.fromStaff === true);
    check('public pricing page loads for visitors', (await page(null, '/pricing')).status === 200);

    section('Sign-ups: a student and a parent');
    const studentEmail = `flow.student.${tag}@codiq.app`, parentEmail = `flow.parent.${tag}@codiq.app`;
    const studentJar = await register(`Flow Student ${tag}`, studentEmail, 'STUDENT', 'KIDS');
    const parentJar = await register(`Flow Parent ${tag}`, parentEmail, 'PARENT');
    const studentMe = (await call(studentJar, 'GET', '/auth/me')).json, parentMe = (await call(parentJar, 'GET', '/auth/me')).json;
    created.users.push(studentEmail, parentEmail);
    check('student and parent are signed in', studentMe?.role === 'STUDENT' && parentMe?.role === 'PARENT');
    check('nobody can register as admin', (await call(null, 'POST', '/auth/register', { name: 'X Y', email: `bad.${tag}@codiq.app`, password: PW, accountType: 'ADMIN' })).status === 400);

    section('Parent links the child (the child must exist first)');
    check('unknown email is refused', (await call(parentJar, 'POST', '/parents/children', { email: `nobody.${tag}@nowhere.io`, confirmGuardian: true })).status === 404);
    const req = await call(parentJar, 'POST', '/parents/children', { email: studentEmail, confirmGuardian: true });
    check('request sent for the existing student', req.status === 200 && req.json.status === 'PENDING');
    check('parent sees nothing before acceptance', ((await call(parentJar, 'GET', '/parents/children')).json as any[]).length === 0);
    const pending = (await call(studentJar, 'GET', '/parent-requests')).json as any[];
    check('student sees the request', pending.length === 1 && pending[0].parent.email === parentEmail);
    check('student accepts', (await call(studentJar, 'POST', `/parent-requests/${pending[0].id}/accept`, {})).status === 200);
    check('parent now sees the child', ((await call(parentJar, 'GET', '/parents/children')).json as any[]).some((c) => c.email === studentEmail));

    section('Admin builds a course with a session, quiz and assignment');
    const pkg = await call(adminJar, 'POST', '/packages', { name: `Flow Course ${tag}`, track: 'KIDS', description: 'End to end test course', priceOneTime: 50000, priceMonthly: 20000, installmentsAllowed: false });
    created.packageId = pkg.json?.id;
    check('course created', pkg.status === 201 && !!created.packageId);
    const karim = (await prisma.user.findUniqueOrThrow({ where: { email: 'karim@codiq.app' } })).id;
    const ses = await call(adminJar, 'POST', '/sessions', {
      packageId: created.packageId, title: 'Flow lesson 1', type: 'RECORDED', instructorId: karim, videoKey: 'recording/test.mp4',
      assignment: { title: 'Flow assignment', brief: 'Write hello world', dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), maxScore: 10 },
      quiz: { title: 'Flow quiz', passScore: 50, questions: [{ text: '1+1?', options: ['1', '2'], correctIndex: 1 }, { text: '2+2?', options: ['3', '4'], correctIndex: 1 }] },
    });
    check('session with assignment and quiz created', ses.status === 201, String(ses.status));
    const sessionId = ses.json?.id as string;
    check('course is hidden from nobody: shows in the public shop', ((await call(null, 'GET', '/packages')).json as any[]).some((p) => p.id === created.packageId));

    section('Coupon and free checkout');
    check('student without access cannot open the session', (await call(studentJar, 'GET', `/sessions/${sessionId}`)).status === 403);
    const coupon = await call(adminJar, 'POST', '/admin/coupons', { code: `FLOW${tag.toUpperCase()}`, type: 'PERCENT', value: 100, maxRedemptions: 1, packageId: created.packageId });
    created.couponId = coupon.json?.id;
    check('100% coupon created', coupon.status === 201);
    const quote = await call(parentJar, 'POST', '/coupons/validate', { code: coupon.json.code, packageId: created.packageId, billing: 'ONE_TIME' });
    check('coupon validates for the parent', quote.status === 200 && quote.json.finalAmount === 0, JSON.stringify(quote.json));
    const pay = await call(parentJar, 'POST', '/payments/checkout', { packageId: created.packageId, billing: 'ONE_TIME', method: 'CARD', studentId: studentMe.id, couponCode: coupon.json.code });
    check('parent checks out for the child, free', pay.status === 200 || pay.status === 201, JSON.stringify(pay.json).slice(0, 120));
    check('same coupon cannot be used twice', (await call(parentJar, 'POST', '/coupons/validate', { code: coupon.json.code, packageId: created.packageId, billing: 'ONE_TIME' })).status !== 200);

    section('Student learns');
    const mine = (await call(studentJar, 'GET', '/account/my-courses')).json as any[];
    check('course appears in my courses', mine.some((c) => c.id === created.packageId || c.name === `Flow Course ${tag}`));
    check('student can now open the session', (await call(studentJar, 'GET', `/sessions/${sessionId}`)).status === 200);
    check('progress saved', (await call(studentJar, 'POST', `/sessions/${sessionId}/progress`, { watchedSeconds: 600, completed: true })).status === 200);
    const quiz = await call(studentJar, 'POST', `/sessions/${sessionId}/quiz/attempts`, { answers: [1, 1] });
    check('quiz graded automatically (100%)', quiz.json?.score === 100);
    const adm = (await call(adminJar, 'GET', '/admin/assignments')).json as any[];
    const asg = adm.find((a) => a.session.id === sessionId);
    const before = (await call(adminJar, 'GET', `/admin/assignments/${asg.id}`)).json;
    check('admin sees the student under "not submitted"', before.notSubmitted.some((u: any) => u.email === studentEmail) && before.submissions.length === 0);
    check('student submits the assignment', (await call(studentJar, 'POST', `/sessions/${sessionId}/submissions`, { text: 'print("hello world")' })).status === 201);
    const subId = ((await call(adminJar, 'GET', `/admin/assignments/${asg.id}`)).json.submissions[0]).id;
    const instrJar = await login('karim@codiq.app');
    check('instructor grades it', (await call(instrJar, 'PATCH', `/submissions/${subId}/grade`, { score: 9, feedback: 'Nice work' })).status === 200);
    const after = (await call(adminJar, 'GET', `/admin/assignments/${asg.id}`)).json;
    check('admin now sees it as submitted and graded', after.notSubmitted.every((u: any) => u.email !== studentEmail) && after.submissions[0]?.status === 'GRADED');

    section('Parent follows progress');
    const prog = (await call(parentJar, 'GET', `/parents/children/${studentMe.id}/progress`)).json;
    const pp = prog.packages.find((p: any) => p.id === created.packageId);
    check('report shows session completed, quiz 100%, assignment graded', pp?.sessionsCompleted === 1 && pp.sessions[0].quiz.bestScore === 100 && pp.sessions[0].assignment.state === 'GRADED');
    check("another parent cannot read this child's report", (await call(await register(`Other Parent ${tag}`, `flow.other.${tag}@codiq.app`, 'PARENT'), 'GET', `/parents/children/${studentMe.id}/progress`)).status === 404);
    created.users.push(`flow.other.${tag}@codiq.app`);

    section('Admin sees it everywhere');
    const detail = (await call(adminJar, 'GET', `/admin/courses/${created.packageId}`)).json;
    check('course page: enrolled student with parent data', detail.students.some((s: any) => s.email === studentEmail && s.parent?.name === `Flow Parent ${tag}`));
    check('course page: instructor listed', detail.instructors.some((i: any) => i.email === 'karim@codiq.app'));
    check('course page: payment log has the coupon payment', detail.payments.some((p: any) => p.status === 'PAID' && p.coupon?.code === coupon.json.code && p.amount === 0));
    const rev = (await call(adminJar, 'GET', '/admin/analytics/courses')).status;
    check('analytics endpoints answer', rev === 200 && (await call(adminJar, 'GET', '/admin/analytics/revenue')).status === 200 && (await call(adminJar, 'GET', '/admin/stats')).status === 200);

    section('Support chat for every role');
    const pSock = await conn(parentJar), sSock = await conn(studentJar); sockets.push(pSock, sSock);
    const toStaff = wait(adminSock, 'chat:message');
    check('parent writes to support', (await emit(pSock, 'chat:send', { body: 'Can I get an invoice?' })).ok);
    const pm = await toStaff; check('admin receives the parent message', pm?.message.body.includes('invoice'));
    const toParent = wait(pSock, 'chat:message');
    await emit(adminSock, 'chat:reply', { threadId: pm.threadId, body: 'Sure, sending it.' });
    check('parent receives the reply', (await toParent)?.message.fromStaff === true);
    const toStaff2 = wait(adminSock, 'chat:message');
    check('student writes to support too', (await emit(sSock, 'chat:send', { body: 'I forgot how to submit' })).ok);
    check('admin receives the student message', (await toStaff2)?.message.body.includes('submit'));
    const lina = await login('lina@codiq.app');
    const aSock = await conn(lina); sockets.push(aSock);
    const toAsst = wait(aSock, 'chat:message');
    await emit(pSock, 'chat:send', { body: 'One more thing' });
    check('assistant sees new messages live and can reply', !!(await toAsst) && (await emit(aSock, 'chat:reply', { threadId: pm.threadId, body: 'Assistant here' })).ok);
    check('student cannot read the staff inbox', (await call(studentJar, 'GET', '/support/inbox')).status === 403);
    check('student cannot reply as staff', !(await emit(sSock, 'chat:reply', { threadId: pm.threadId, body: 'x' })).ok);

    section('Access rules');
    for (const [who, jar] of [['instructor', instrJar], ['assistant', lina]] as const) {
      const codes = await Promise.all(['/payments/mine', '/payments', '/account/catalog'].map(async (p) => (await call(jar, 'GET', p)).status));
      check(`${who} has no access to billing or the catalog`, codes.every((c) => c === 403), codes.join(','));
      check(`${who} has no access to the admin area`, (await call(jar, 'GET', '/admin/stats')).status === 403);
    }
    check('student has no access to admin endpoints', (await call(studentJar, 'GET', '/admin/stats')).status === 403 && (await call(studentJar, 'GET', '/users')).status === 403);
    check('anonymous gets 401 on admin', (await call(null, 'GET', '/admin/stats')).status === 401);
    check('assistant can grade but not manage users', (await call(lina, 'GET', '/submissions')).status === 200 && (await call(lina, 'GET', '/users')).status === 403);

    section('Website pages per role, language and theme');
    for (const [who, jar, path] of [['student', studentJar, '/dashboard'], ['student', studentJar, '/dashboard/courses'], ['student', studentJar, '/dashboard/support'], ['parent', parentJar, '/dashboard'], ['parent', parentJar, `/dashboard/children/${studentMe.id}`], ['parent', parentJar, '/dashboard/support'], ['instructor', instrJar, '/dashboard'], ['instructor', instrJar, '/dashboard/grading'], ['assistant', lina, '/dashboard/inbox'], ['admin', adminJar, '/dashboard/admin'], ['admin', adminJar, `/dashboard/admin/packages/${created.packageId}`], ['admin', adminJar, `/dashboard/admin/assignments/${asg.id}`], ['admin', adminJar, '/dashboard/admin/analytics'], ['admin', adminJar, '/dashboard/inbox']] as const) {
      const r = await page(jar, path); check(`${who} opens ${path.replace(/[a-z0-9]{20,}/g, ':id')}`, r.status === 200, String(r.status));
    }
    check('instructor is kept out of billing', (await page(instrJar, '/dashboard/billing')).location.includes('denied=1'));
    check('assistant is kept out of billing', (await page(lina, '/dashboard/billing')).location.includes('denied=1'));
    check('student is kept out of the admin area', (await page(studentJar, '/dashboard/admin')).location.includes('denied=1'));
    check('signed-in visitors land on their dashboard from /', (await page(parentJar, '/')).location.endsWith('/dashboard'));
    const ar = await page(null, '/', { lang: 'ar' });
    check('Arabic switches the page to RTL with Arabic text', ar.html.includes('dir="rtl"') && ar.html.includes('فكّر'));
    check('English is the default (LTR)', (await page(null, '/')).html.includes('dir="ltr"'));
    check('theme script and toggles are on the page', ar.html.includes("localStorage.getItem('theme')") && ar.html.includes('aria-label'));
  } finally {
    section('Cleanup');
    sockets.forEach((s) => s.close());
    try {
      await prisma.supportThread.deleteMany({ where: { OR: [{ guestName: { contains: tag } }, { user: { email: { contains: tag } } }, { user: { email: { in: ['sara@codiq.app', 'lina@codiq.app'] } } }] } });
      const ids = (await prisma.user.findMany({ where: { email: { in: created.users } }, select: { id: true } })).map((u) => u.id);
      await prisma.payment.deleteMany({ where: { OR: [{ payerId: { in: ids } }, { studentId: { in: ids } }] } });
      if (created.couponId) await prisma.coupon.deleteMany({ where: { id: created.couponId } });
      if (created.packageId) await prisma.package.deleteMany({ where: { id: created.packageId } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      check('test data removed', (await prisma.user.count({ where: { email: { contains: tag } } })) === 0);
    } catch (e) { check('cleanup', false, (e as Error).message); }
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nAll flow checks passed');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
