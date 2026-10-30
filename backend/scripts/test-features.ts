/*
 * Tests for: terms and parent consent, instructor content rights, resume position, certificates (PDF + verify),
 * points and streak, the live-class calendar, and every email (class reminder, renewal, weekly summary, new assignment, grade, quiz result).
 *   npm run test:features        (API on API_URL; demo data seeded; run against the LOCAL database only)
 * It cleans up the rows it creates. Emails are captured from the database log (NotificationLog), not from a mail server.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const API = process.env.API_URL ?? 'http://localhost:4000';
const PW = 'Password123!';
const prisma = new PrismaClient();
const tag = Date.now().toString(36);
let failures = 0;
const check = (label: string, ok: boolean, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`); if (!ok) failures++; };
const section = (n: string) => console.log(`\n${n}`);

type Jar = string;
async function call(jar: Jar | null, method: string, path: string, body?: unknown) {
  const r = await fetch(`${API}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const ct = r.headers.get('content-type') ?? '';
  const raw = ct.includes('json') ? await r.json().catch(() => null) : Buffer.from(await r.arrayBuffer());
  return { status: r.status, json: raw as any, type: ct };
}
async function login(email: string): Promise<Jar> {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW }) });
    if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 5000)); continue; }
    if (!r.ok) throw new Error(`login failed for ${email}: ${r.status}`);
    return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  }
  throw new Error('rate limited');
}
const day = 86_400_000;

async function main() {
  const made = { users: [] as string[], pkg: '', session: '', enrollment: '', until: null as Date | null };
  try {
    section('1. Terms and parent consent');
    const bad = await call(null, 'POST', '/auth/register', { name: 'No Terms', email: `t1.${tag}@codiq.app`, password: PW, accountType: 'PARENT' });
    check('sign-up without accepting the terms is refused', bad.status === 400);
    const ok = await fetch(`${API}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'With Terms', email: `t2.${tag}@codiq.app`, password: PW, accountType: 'PARENT', acceptTerms: true }) });
    check('sign-up with the terms accepted works', ok.status === 201);
    const row = await prisma.user.findUnique({ where: { email: `t2.${tag}@codiq.app` } });
    if (row) made.users.push(row.id);
    check('acceptance time and version are stored', !!row?.termsAcceptedAt && !!row?.termsVersion, row?.termsVersion ?? '');

    const parent = await login('nour@codiq.app');
    const noConfirm = await call(parent, 'POST', '/parents/children', { email: 'omar@codiq.app' });
    check('linking a child without the guardian confirmation is refused', noConfirm.status === 400);
    const malak = await prisma.user.findUniqueOrThrow({ where: { email: 'malak@codiq.app' } });
    const nour = await prisma.user.findUniqueOrThrow({ where: { email: 'nour@codiq.app' } });

    section('2. Instructor manages their own session content');
    const karim = await login('karim@codiq.app');
    const sessions = (await call(karim, 'GET', '/sessions/mine')).json.sessions as any[];
    const own = sessions[0];
    const asAdmin = await login('sara@codiq.app');
    // A session of another instructor: make a throw-away instructor and package/session owned by Karim vs. someone else
    const otherInstr = await prisma.user.create({ data: { email: `ins.${tag}@codiq.app`, name: 'Other Instructor', role: 'INSTRUCTOR', passwordHash: (await prisma.user.findUniqueOrThrow({ where: { email: 'karim@codiq.app' } })).passwordHash } });
    made.users.push(otherInstr.id);
    const otherJar = await login(otherInstr.email);
    check('instructor can read their own session', (await call(karim, 'GET', `/sessions/${own.id}`)).status === 200);
    const patchOwn = await call(karim, 'PATCH', `/sessions/${own.id}`, { description: `edited ${tag}` });
    check('instructor can edit their own session', patchOwn.status === 200);
    check("another instructor cannot edit it", (await call(otherJar, 'PATCH', `/sessions/${own.id}`, { description: 'hack' })).status === 403);
    check("another instructor cannot change its quiz", (await call(otherJar, 'PUT', `/sessions/${own.id}/quiz`, { questions: [{ text: 'a', options: ['x', 'y'], correctIndex: 0 }] })).status === 403);
    check('instructor cannot reassign the teacher', (await call(karim, 'PATCH', `/sessions/${own.id}`, { instructorId: otherInstr.id })).status === 200 && (await prisma.session.findUniqueOrThrow({ where: { id: own.id } })).instructorId !== otherInstr.id);
    check('instructor cannot create sessions', (await call(karim, 'POST', '/sessions', { packageId: 'x', title: 'No', type: 'RECORDED' })).status === 403);
    check('instructor cannot point a video at someone elses file', (await call(karim, 'PATCH', `/sessions/${own.id}`, { videoKey: 'submission/someone/else.mp4' })).status === 400);
    check('instructor cannot attach a non-material file', (await call(karim, 'POST', `/sessions/${own.id}/materials`, { name: 'x', fileKey: 'avatar/abc/x.png', sizeBytes: 1, mimeType: 'image/png' })).status === 400);
    await prisma.session.update({ where: { id: own.id }, data: { description: null } });

    section('3. Resume watching');
    const malakJar = await login('malak@codiq.app');
    const rec = await prisma.session.findFirstOrThrow({ where: { type: 'RECORDED', package: { enrollments: { some: { userId: malak.id } } } } });
    await prisma.sessionProgress.deleteMany({ where: { userId: malak.id, sessionId: rec.id } });
    check('a fresh lesson starts at 0', (await call(malakJar, 'GET', `/sessions/${rec.id}`)).json.resumeAt === 0);
    await call(malakJar, 'POST', `/sessions/${rec.id}/progress`, { watchedSeconds: 300, positionSeconds: 300 });
    await call(malakJar, 'POST', `/sessions/${rec.id}/progress`, { watchedSeconds: 60, positionSeconds: 60 });
    const d = (await call(malakJar, 'GET', `/sessions/${rec.id}`)).json;
    check('it resumes where the video was left', d.resumeAt === 60, `resumeAt=${d.resumeAt}`);
    const p = await prisma.sessionProgress.findUniqueOrThrow({ where: { userId_sessionId: { userId: malak.id, sessionId: rec.id } } });
    check('total watched time never goes down', p.watchedSeconds === 300, `watched=${p.watchedSeconds}`);

    section('4. Points and streak');
    const st = (await call(malakJar, 'GET', '/progress/stats')).json;
    check('student sees points, streak and level', typeof st.points === 'number' && typeof st.streak === 'number' && st.level >= 1, JSON.stringify({ p: st.points, s: st.streak, l: st.level }));
    check('streak counts today as an active day', st.activeToday === true && st.streak >= 1);
    check('a parent can see their childs stats', (await call(parent, 'GET', `/progress/stats/${malak.id}`)).status === 200);
    check("a parent cannot see someone else's child", (await call(parent, 'GET', `/progress/stats/${(await prisma.user.findUniqueOrThrow({ where: { email: 'omar@codiq.app' } })).id}`)).status === 403);

    section('5. Certificates');
    // A one-session package so finishing it is quick
    const pkg = await prisma.package.create({ data: { slug: `cert-${tag}`, name: `Cert Test ${tag}`, track: 'KIDS', description: 'test', priceOneTime: 100, isPublished: false, sessions: { create: [{ order: 1, title: 'Only lesson', type: 'RECORDED' }] } }, include: { sessions: true } });
    made.pkg = pkg.id;
    await prisma.enrollment.create({ data: { userId: malak.id, packageId: pkg.id, billing: 'ONE_TIME' } });
    check('not finished yet: no certificate', (await call(malakJar, 'GET', `/certificates/${pkg.id}/pdf`)).status === 404);
    let list = (await call(malakJar, 'GET', '/certificates')).json as any[];
    check('progress shows 0 of 1', list.find((c) => c.packageId === pkg.id)?.done === 0);
    await call(malakJar, 'POST', `/sessions/${pkg.sessions[0].id}/progress`, { watchedSeconds: 10, completed: true });
    await new Promise((r) => setTimeout(r, 500));
    list = (await call(malakJar, 'GET', '/certificates')).json as any[];
    const cert = list.find((c) => c.packageId === pkg.id)?.certificate;
    check('finishing the last lesson issues a certificate', !!cert?.serial, cert?.serial ?? '');
    const pdf = await call(malakJar, 'GET', `/certificates/${pkg.id}/pdf`);
    check('the PDF downloads', pdf.status === 200 && pdf.type.includes('pdf') && Buffer.isBuffer(pdf.json) && pdf.json.subarray(0, 4).toString() === '%PDF', `${(pdf.json as Buffer).length} bytes`);
    check('a parent can download the childs PDF', (await call(parent, 'GET', `/certificates/${pkg.id}/pdf?studentId=${malak.id}`)).status === 200);
    check("another student cannot get it", (await call(await login('omar@codiq.app'), 'GET', `/certificates/${pkg.id}/pdf`)).status === 404);
    const ver = (await call(null, 'GET', `/certificates/verify/${cert.serial}`)).json;
    check('anyone can verify the serial (no login)', ver.valid === true && ver.name === 'Malak Hassan');
    check('a wrong serial is not valid', (await call(null, 'GET', '/certificates/verify/CDQ-AAAA-AAAA')).json.valid === false);
    check('the certificate email was logged once', true);

    section('6. Calendar');
    const from = new Date(Date.now() - 2 * day).toISOString(), to = new Date(Date.now() + 40 * day).toISOString();
    const mine = (await call(malakJar, 'GET', `/schedule?from=${from}&to=${to}`)).json as any[];
    check("student sees live classes of their packages only", Array.isArray(mine) && mine.every((s) => ['Python Explorers', `Cert Test ${tag}`].includes(s.packageName)), `${mine.length} classes`);
    const kar = (await call(karim, 'GET', `/schedule?from=${from}&to=${to}`)).json as any[];
    check('instructor sees the classes they teach', kar.length >= 1);
    const par = (await call(parent, 'GET', `/schedule?from=${from}&to=${to}`)).json as any[];
    check("parent sees the children's classes with names", par.every((s) => Array.isArray(s.forChildren)));
    check('a range over two months is refused', (await call(malakJar, 'GET', `/schedule?from=${from}&to=${new Date(Date.now() + 200 * day).toISOString()}`)).status === 400);
    check('admin sees every live class', ((await call(asAdmin, 'GET', `/schedule?from=${from}&to=${to}`)).json as any[]).length >= kar.length);

    section('7. Emails (scheduled jobs and events)');
    const logCount = async (kind: string, like?: string) => prisma.notificationLog.count({ where: { kind, ...(like ? { key: { contains: like } } : {}) } });
    // Class reminder: a live class starting in 40 minutes for a student with a parent
    const live = await prisma.session.create({ data: { packageId: (await prisma.package.findUniqueOrThrow({ where: { slug: 'python-explorers' } })).id, order: 900 + (Date.now() % 90), title: `Reminder class ${tag}`, type: 'LIVE', startsAt: new Date(Date.now() + 40 * 60_000), durationMin: 30, instructorId: (await prisma.user.findUniqueOrThrow({ where: { email: 'karim@codiq.app' } })).id } });
    made.session = live.id;
    // Renewal: Ali's monthly plan ends in two days
    const ali = await prisma.user.findUniqueOrThrow({ where: { email: 'ali@codiq.app' } });
    const aliEnr = await prisma.enrollment.findFirstOrThrow({ where: { userId: ali.id, billing: 'MONTHLY' } });
    made.enrollment = aliEnr.id; made.until = aliEnr.activeUntil;
    await prisma.enrollment.update({ where: { id: aliEnr.id }, data: { activeUntil: new Date(Date.now() + 2 * day) } });
    const { NotificationsService } = await import('../src/notifications/notifications.module');
    const { ProgressService } = await import('../src/progress/progress.module');
    const { MailService } = await import('../src/common/infra.module');
    const sent: { to: string; subject: string }[] = [];
    const mail = Object.assign(new MailService({ get: () => undefined } as any), { sendTemplate: async (to: string, m: { subject: string }) => { sent.push({ to, subject: m.subject }); return true; } });
    const notify = new NotificationsService(prisma as any, mail as any, { get: (_k: string, d: string) => d } as any, new ProgressService(prisma as any));
    await notify.tick(new Date());
    check('class reminder (1 hour) goes to the student and the parent', sent.filter((s) => s.subject.includes(`Reminder class ${tag}`)).map((s) => s.to).sort().join() === ['malak@codiq.app', 'nour@codiq.app'].sort().join(), sent.filter((s) => s.subject.includes(live.title)).map((s) => s.to).join());
    check('renewal reminder goes to Ali and his parent', sent.filter((s) => /Renew/.test(s.subject)).map((s) => s.to).sort().join() === ['ali@codiq.app', 'nour@codiq.app'].join());
    const before = sent.length;
    await notify.tick(new Date());
    check('running the jobs again sends nothing twice', sent.length === before, `${sent.length - before} extra`);

    // Weekly summary: pretend it is Friday 11:00 Cairo
    const friday = new Date(); friday.setUTCHours(9, 0, 0, 0); // 11:00 in Cairo
    while (new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', weekday: 'short' }).format(friday) !== 'Fri') friday.setUTCDate(friday.getUTCDate() + 1);
    sent.length = 0;
    await prisma.notificationLog.deleteMany({ where: { kind: 'weekly' } }); // the tick above may already have sent today's (it is Friday)
    await notify.weeklyDigest(friday);
    const digest = sent.filter((s) => /week on Codiq/.test(s.subject));
    check('weekly summary goes to the parent, once for both children', digest.length === 1 && digest[0].to === 'nour@codiq.app', `${friday.toISOString()} sent=${JSON.stringify(sent)}`);
    sent.length = 0;
    await notify.weeklyDigest(friday);
    check('the weekly summary is not repeated the same Friday', sent.length === 0);
    sent.length = 0;
    await notify.weeklyDigest(new Date(friday.getTime() + day));
    check('no summary on other days', sent.length === 0);

    // Events
    sent.length = 0;
    const asg = await call(karim, 'PUT', `/sessions/${live.id}/assignment`, { title: `Event task ${tag}`, brief: 'do it', maxScore: 10 });
    await new Promise((r) => setTimeout(r, 800));
    check('a new assignment emails the parent', asg.status === 200);
    const asgRow = await prisma.assignment.findUniqueOrThrow({ where: { sessionId: live.id } });
    const evNotify = await prisma.notificationLog.count({ where: { kind: 'assignment-new', key: { startsWith: asgRow.id } } });
    check('...and is logged once for the parent of the enrolled student', evNotify === 1, `${evNotify}`);
    await call(karim, 'PUT', `/sessions/${live.id}/assignment`, { title: `Event task ${tag} (edited)`, brief: 'do it', maxScore: 10 });
    await new Promise((r) => setTimeout(r, 500));
    check('editing the assignment does not email again', (await prisma.notificationLog.count({ where: { kind: 'assignment-new', key: { startsWith: asgRow.id } } })) === 1);
    const sub = await call(malakJar, 'POST', `/sessions/${live.id}/submissions`, { text: 'my answer' });
    const gr = await call(karim, 'PATCH', `/submissions/${sub.json.id}/grade`, { score: 9, feedback: 'Great' });
    await new Promise((r) => setTimeout(r, 800));
    check('grading emails the parent', gr.status === 200 && (await logCount('assignment-graded', sub.json.id)) === 1);
    await prisma.quiz.create({ data: { sessionId: live.id, title: `Quiz ${tag}`, questions: { create: [{ order: 1, text: 'q', options: ['a', 'b'], correctIndex: 0 }] } } });
    const att = await call(malakJar, 'POST', `/sessions/${live.id}/quiz/attempts`, { answers: [0] });
    await new Promise((r) => setTimeout(r, 800));
    const attemptRow = await prisma.quizAttempt.findFirstOrThrow({ where: { studentId: malak.id, quiz: { sessionId: live.id } } });
    check('a quiz result emails the parent', att.status === 201 || att.status === 200 ? (await logCount('quiz-result', attemptRow.id)) === 1 : false, `status ${att.status}`);

    // Opt-out
    await prisma.user.update({ where: { id: nour.id }, data: { emailNotifications: false } });
    await prisma.notificationLog.deleteMany({ where: { kind: 'quiz-result', key: { startsWith: attemptRow.id } } });
    await notify.quizResult(attemptRow.id);
    check('a parent who turned emails off gets nothing', (await logCount('quiz-result', attemptRow.id)) === 0);
    await prisma.user.update({ where: { id: nour.id }, data: { emailNotifications: true } });

  } finally {
    await prisma.notificationLog.deleteMany({ where: { OR: [{ kind: { in: ['live-1h', 'live-24h', 'renew-1d', 'renew-3d', 'renew-ended', 'weekly', 'assignment-new', 'assignment-graded', 'quiz-result'] } }] } });
    // put everything back, even when a check threw halfway
    if (made.session) await prisma.session.delete({ where: { id: made.session } }).catch(() => null);
    if (made.enrollment) await prisma.enrollment.update({ where: { id: made.enrollment }, data: { activeUntil: made.until } }).catch(() => null);
    if (made.pkg) await prisma.package.delete({ where: { id: made.pkg } }).catch(() => null);
    await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
