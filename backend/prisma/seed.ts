import { PrismaClient, Role, Track, SessionType, BillingType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const day = 86_400_000;

async function main() {
  // The seed creates accounts with a well-known password. Never on a live site, unless someone insists.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    throw new Error('Refusing to seed: NODE_ENV is production. The demo accounts use a public password. Set ALLOW_SEED=true only if you really mean it.');
  }
  const passwordHash = await argon2.hash('Password123!');
  const user = (email: string, name: string, role: Role, extra: object = {}) =>
    prisma.user.upsert({ where: { email }, update: {}, create: { email, name, role, passwordHash, ...extra } });

  await user('sara@codiq.app', 'Sara Mostafa', Role.ADMIN);
  const karim = await user('karim@codiq.app', 'Karim Fathy', Role.INSTRUCTOR);
  await user('lina@codiq.app', 'Lina Samir', Role.ASSISTANT);
  const nour = await user('nour@codiq.app', 'Nour Hassan', Role.PARENT, { phone: '01012345678' });
  const malak = await user('malak@codiq.app', 'Malak Hassan', Role.STUDENT, { track: Track.KIDS, parentId: nour.id });
  const ali = await user('ali@codiq.app', 'Ali Hassan', Role.STUDENT, { track: Track.SCHOOL, parentId: nour.id });
  const omar = await user('omar@codiq.app', 'Omar Adel', Role.STUDENT, { track: Track.COLLEGE });

  const pkgs = [
    { slug: 'scratch-starter', name: 'Scratch Starter', track: Track.KIDS, description: 'Block coding, games and animations.', priceOneTime: 120000, priceMonthly: 45000, installmentsAllowed: false },
    { slug: 'python-explorers', name: 'Python Explorers', track: Track.KIDS, description: 'First real code: turtle art, quizzes and small games.', priceOneTime: 180000, priceMonthly: 60000, installmentsAllowed: true },
    { slug: 'secondary-1-programming', name: 'Secondary 1 Programming', track: Track.SCHOOL, description: 'Ministry curriculum, exam practice and past papers.', priceOneTime: 150000, priceMonthly: 40000, installmentsAllowed: true },
    { slug: 'web-development', name: 'Web Development', track: Track.COLLEGE, description: 'HTML, CSS, JavaScript, React and a final project.', priceOneTime: 350000, priceMonthly: 110000, installmentsAllowed: true },
    { slug: 'data-structures', name: 'Data Structures & Algorithms', track: Track.COLLEGE, description: 'Interview-level problem solving in C++ or Python.', priceOneTime: 300000, priceMonthly: 95000, installmentsAllowed: true },
  ];
  const byslug: Record<string, string> = {};
  for (const p of pkgs) byslug[p.slug] = (await prisma.package.upsert({ where: { slug: p.slug }, update: {}, create: p })).id;

  const quiz = [
    { text: 'What does a for loop do?', options: ['Repeats code', 'Stops the program', 'Draws a circle', 'Saves a file'], correctIndex: 0 },
    { text: 'What prints? for i in range(3): print(i)', options: ['1 2 3', '0 1 2', '0 1 2 3', '3'], correctIndex: 1 },
  ];
  const sessions: [string, string, SessionType, number][] = [
    ['python-explorers', 'Meet Python', SessionType.RECORDED, -10],
    ['python-explorers', 'Variables and input', SessionType.RECORDED, -6],
    ['python-explorers', 'Loops with turtle', SessionType.LIVE, 0],
    ['web-development', 'How the web works', SessionType.RECORDED, -8],
    ['web-development', 'CSS layout with flexbox', SessionType.LIVE, 1],
    ['secondary-1-programming', 'Algorithms and flowcharts', SessionType.RECORDED, -5],
  ];
  const counters: Record<string, number> = {};
  for (const [slug, title, type, offset] of sessions) {
    const order = (counters[slug] = (counters[slug] ?? 0) + 1);
    const exists = await prisma.session.findUnique({ where: { packageId_order: { packageId: byslug[slug], order } } });
    if (exists) continue;
    await prisma.session.create({
      data: {
        packageId: byslug[slug], order, title, type, durationMin: 60, instructorId: karim.id,
        startsAt: new Date(Date.now() + offset * day),
        assignment: { create: { title: `${title} practice`, brief: 'Complete the exercise from the slides and upload your file.', dueAt: new Date(Date.now() + (offset + 4) * day) } },
        quiz: { create: { title: `${title} quiz`, questions: { create: quiz.map((q, i) => ({ ...q, order: i + 1 })) } } },
      },
    });
  }

  const enroll = (userId: string, slug: string, billing: BillingType) =>
    prisma.enrollment.upsert({
      where: { userId_packageId: { userId, packageId: byslug[slug] } }, update: {},
      create: { userId, packageId: byslug[slug], billing, activeUntil: billing === BillingType.MONTHLY ? new Date(Date.now() + 30 * day) : null },
    });
  await enroll(malak.id, 'python-explorers', BillingType.ONE_TIME);
  await enroll(ali.id, 'secondary-1-programming', BillingType.MONTHLY);
  await enroll(omar.id, 'web-development', BillingType.ONE_TIME);
  console.log('Seeded. All demo accounts use password: Password123!');
}

main().finally(() => prisma.$disconnect());
