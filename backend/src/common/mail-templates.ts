/** Branded HTML emails (inline styles only, because email clients ignore most CSS). English and Arabic. */
export type Lang = 'en' | 'ar';
export const asLang = (v: unknown): Lang => (v === 'ar' ? 'ar' : 'en');

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The English text is the key; {name} placeholders are filled from vars. A missing Arabic string falls back to English. */
const AR: Record<string, string> = {
  'Think it. Code it. · Codiq': 'فكّر. اكتب كود. · كوديك',
  "If the button doesn't work, copy this link:": 'لو الزرار مش شغّال، انسخ الرابط ده:',
  'You can turn these emails off in Profile > Email notifications.': 'تقدر توقف الإيميلات دي من الملف الشخصي > إشعارات الإيميل.',
  'Hi {name},': 'أهلًا {name}،',
  'Open my dashboard': 'افتح لوحة التحكم',
  // account
  'Reset your Codiq password': 'إعادة تعيين كلمة مرور كوديك',
  'Open this link within an hour to choose a new password:': 'افتح الرابط ده خلال ساعة عشان تختار كلمة مرور جديدة:',
  "If you didn't ask for this, you can ignore this email.": 'لو إنت ما طلبتش ده، تجاهل الإيميل.',
  'Reset your password': 'إعادة تعيين كلمة المرور',
  "Use the button below within an hour to choose a new password. If you didn't ask for this, you can ignore this email.": 'استخدم الزرار تحت خلال ساعة عشان تختار كلمة مرور جديدة. ولو إنت ما طلبتش ده، تجاهل الإيميل.',
  'Choose a new password': 'اختار كلمة مرور جديدة',
  'Welcome to Codiq': 'أهلًا بيك في كوديك',
  'Welcome to Codiq. We teach you how to learn and understand, not just how to copy code.': 'أهلًا بيك في كوديك. بنعلّمك إزاي تتعلّم وتفهم، مش بس تنسخ الكود.',
  'Welcome! At Codiq we teach you how to learn and understand, not just how to copy code.': 'أهلًا بيك! في كوديك بنعلّمك إزاي تتعلّم وتفهم، مش بس تنسخ الكود.',
  // receipt
  'Payment received: {pkg}': 'تم استلام الدفع: {pkg}', 'Payment received': 'تم استلام الدفع',
  'We received your payment.': 'استلمنا دفعتك.', 'Package': 'الباقة', 'For': 'لـ', 'Amount': 'المبلغ', 'Method': 'الطريقة', 'Date': 'التاريخ', 'Reference': 'المرجع', 'Access until': 'الوصول حتى',
  'Thank you! Your payment went through and access is now active.': 'شكرًا! تمت عملية الدفع والوصول شغّال دلوقتي.',
  // live reminders
  'Starting soon: {title}': 'هتبدأ قريب: {title}', 'Tomorrow: {title}': 'بكرة: {title}',
  "{who} live class starts in about an hour": '{who} هتبدأ كمان حوالي ساعة', "{who} live class is tomorrow": '{who} هتكون بكرة',
  'Your': 'حصتك', "{name}'s": 'حصة {name}', 'Class': 'الحصة', 'Starts': 'بتبدأ', '(Cairo time)': '(بتوقيت القاهرة)',
  'Join the class': 'ادخل الحصة', 'Open class page': 'افتح صفحة الحصة',
  // renewal
  '{who} monthly plan has ended': 'انتهت الباقة الشهرية {who}', '{who} monthly plan ends tomorrow': 'الباقة الشهرية {who} بتنتهي بكرة', '{who} monthly plan ends in {n} days': 'الباقة الشهرية {who} بتنتهي بعد {n} أيام',
  'Your plan': 'بتاعتك', "{name}'s plan": 'بتاعة {name}',
  'Access to the classes is paused. Renew to continue where you stopped; your progress is saved.': 'الوصول للحصص متوقف. جدّد عشان تكمّل من حيث وقفت، ومستواك محفوظ.',
  'We will charge your saved card automatically, so there is nothing to do.': 'هنسحب من كارتك المحفوظ تلقائيًا، فمش مطلوب منك حاجة.',
  'Renew before it ends so classes are not interrupted.': 'جدّد قبل ما تنتهي عشان الحصص ماتتوقفش.',
  'Ended': 'انتهت', 'Ends': 'بتنتهي', 'Plan ended: {pkg}': 'انتهت الباقة: {pkg}', 'Renew {pkg}: ends tomorrow': 'جدّد {pkg}: بتنتهي بكرة', 'Renew {pkg}: {n} days left': 'جدّد {pkg}: فاضل {n} أيام',
  'Billing': 'الفواتير', 'See billing': 'افتح الفواتير', 'Renew now': 'جدّد دلوقتي',
  // parent events
  'See progress': 'شوف المستوى',
  'new assignment: {title}': 'تكليف جديد: {title}', '{student} has a new assignment in {pkg}.': 'عند {student} تكليف جديد في {pkg}.',
  'Assignment': 'التكليف', 'Lesson': 'الدرس', 'Due': 'آخر ميعاد', 'No due date': 'من غير ميعاد', 'Marks': 'الدرجة الكاملة',
  'graded: {title}': 'اتصحّح: {title}', "{student}'s assignment was graded.": 'اتصحّح تكليف {student}.', 'Grade': 'الدرجة', 'Feedback': 'تعليق المدرّس',
  'quiz result: {score}%': 'نتيجة كويز: {score}٪', '{student} finished a quiz and passed.': '{student} خلّص كويز وعدّاه.', '{student} finished a quiz and did not pass yet.': '{student} خلّص كويز ولسه ما عدّاهوش.',
  'Quiz': 'الكويز', 'Score': 'النتيجة', 'Pass mark': 'درجة النجاح', 'Result': 'الحالة', 'Passed': 'ناجح', 'Not passed': 'لسه',
  // digest
  "{name}'s week on Codiq": 'أسبوع {name} على كوديك', "Your children's week on Codiq": 'أسبوع أولادك على كوديك', 'The week on Codiq': 'الأسبوع على كوديك',
  'Here are the last 7 days.': 'دي آخر ٧ أيام.', 'Lessons completed': 'دروس خلّصها', 'Live classes attended': 'حصص لايف حضرها', 'Assignments handed in': 'تكاليف سلّمها',
  'Quiz: {title}': 'كويز: {title}', 'Graded: {title}': 'تصحيح: {title}', 'Day streak': 'أيام متتالية', 'Points': 'النقاط', 'Next live class': 'الحصة اللايف الجاية', 'Overdue': 'متأخر',
  '{n} day': '{n} يوم', '{n} days': '{n} أيام', 'Open full report': 'افتح التقرير الكامل', 'Full report': 'التقرير الكامل',
  // certificate
  'Congratulations! Your certificate: {pkg}': 'مبروك! شهادتك: {pkg}', 'You finished the course!': 'خلّصت الكورس!',
  'You finished every session in {pkg}. Your certificate is ready to download:': 'خلّصت كل حصص {pkg}. شهادتك جاهزة للتحميل:',
  'You completed every session in {pkg}. Your certificate is ready.': 'خلّصت كل حصص {pkg}. شهادتك جاهزة.', 'Download certificate': 'حمّل الشهادة',
};
const tr = (lang: Lang, s: string, v?: Record<string, string | number>) => {
  let out = lang === 'ar' ? (AR[s] ?? s) : s;
  if (v) for (const [k, x] of Object.entries(v)) out = out.replaceAll(`{${k}}`, String(x));
  return out;
};

export interface MailContent { subject: string; text: string; html: string }

function layout(lang: Lang, title: string, bodyHtml: string, button?: { label: string; url: string }) {
  const rtl = lang === 'ar';
  const btn = button
    ? `<p style="margin:28px 0"><a href="${esc(button.url)}" style="background:#1c1d21;color:#f5f3ee;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;display:inline-block">${esc(button.label)}</a></p>
       <p style="font-size:13px;color:#6b6a66;word-break:break-all">${esc(tr(lang, "If the button doesn't work, copy this link:"))}<br>${esc(button.url)}</p>`
    : '';
  return `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><body style="margin:0;background:#f5f3ee;font-family:${rtl ? "'Segoe UI',Tahoma," : ''}Arial,Helvetica,sans-serif;color:#1c1d21">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e4e0d8">
      <tr><td dir="ltr" style="padding:28px 32px 0;font-family:'Courier New',monospace;font-size:26px;font-weight:700;letter-spacing:-1px;text-align:${rtl ? 'right' : 'left'}">codiq<span style="color:#2b62b3">&#9608;</span></td></tr>
      <tr><td style="padding:20px 32px 32px;font-size:16px;line-height:1.6;text-align:${rtl ? 'right' : 'left'}">
        <h1 style="font-size:22px;margin:0 0 12px">${esc(title)}</h1>
        ${bodyHtml}${btn}
      </td></tr>
      <tr><td style="padding:16px 32px;border-top:1px solid #e4e0d8;font-size:12px;color:#6b6a66;text-align:${rtl ? 'right' : 'left'}">${esc(tr(lang, 'Think it. Code it. · Codiq'))}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

/** Label/value table. */
const facts = (lang: Lang, rows: [string, string][]) =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e0d8;margin-top:8px">${rows
    .map(([k, v]) => `<tr><td style="padding:9px 0;border-bottom:1px solid #e4e0d8;color:#6b6a66;font-size:14px;text-align:${lang === 'ar' ? 'right' : 'left'}">${esc(k)}</td><td style="padding:9px 0;border-bottom:1px solid #e4e0d8;text-align:${lang === 'ar' ? 'left' : 'right'};font-weight:700;font-size:14px">${esc(v)}</td></tr>`)
    .join('')}</table>`;
const plain = (rows: [string, string][]) => rows.map(([k, v]) => `${k}: ${v}`).join('\n');
const off = (lang: Lang) => tr(lang, 'You can turn these emails off in Profile > Email notifications.');
const small = (t: string) => `<p style="font-size:13px;color:#6b6a66">${esc(t)}</p>`;
const hi = (lang: Lang, name: string) => tr(lang, 'Hi {name},', { name });

/** Date and time in Egypt, for example "Sat 31 Oct, 18:00". */
export const cairoTime = (d: Date, lang: Lang = 'en') =>
  new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

// ---- Account emails ----
export const resetPasswordMail = (name: string, link: string, lang: Lang = 'en'): MailContent => ({
  subject: tr(lang, 'Reset your Codiq password'),
  text: `${hi(lang, name)}\n\n${tr(lang, 'Open this link within an hour to choose a new password:')}\n${link}\n\n${tr(lang, "If you didn't ask for this, you can ignore this email.")}`,
  html: layout(lang, tr(lang, 'Reset your password'), `<p>${esc(hi(lang, name))}</p><p>${esc(tr(lang, "Use the button below within an hour to choose a new password. If you didn't ask for this, you can ignore this email."))}</p>`, { label: tr(lang, 'Choose a new password'), url: link }),
});

export const welcomeMail = (name: string, url: string, lang: Lang = 'en'): MailContent => ({
  subject: tr(lang, 'Welcome to Codiq'),
  text: `${hi(lang, name)}\n\n${tr(lang, 'Welcome to Codiq. We teach you how to learn and understand, not just how to copy code.')}\n${tr(lang, 'Open my dashboard')}: ${url}`,
  html: layout(lang, tr(lang, 'Welcome to Codiq'), `<p>${esc(hi(lang, name))}</p><p>${esc(tr(lang, 'Welcome! At Codiq we teach you how to learn and understand, not just how to copy code.'))}</p>`, { label: tr(lang, 'Open my dashboard'), url }),
});

export interface ReceiptInput {
  name: string; packageName: string; studentName: string; amountEgp: string; method: string; reference: string; paidAt: string; dashboardUrl: string; monthlyUntil?: string; lang?: Lang;
}
export const paymentReceiptMail = (r: ReceiptInput): MailContent => {
  const lang = r.lang ?? 'en';
  const rows: [string, string][] = [
    [tr(lang, 'Package'), r.packageName], [tr(lang, 'For'), r.studentName], [tr(lang, 'Amount'), r.amountEgp], [tr(lang, 'Method'), r.method], [tr(lang, 'Date'), r.paidAt], [tr(lang, 'Reference'), r.reference],
    ...(r.monthlyUntil ? ([[tr(lang, 'Access until'), r.monthlyUntil]] as [string, string][]) : []),
  ];
  return {
    subject: tr(lang, 'Payment received: {pkg}', { pkg: r.packageName }),
    text: `${hi(lang, r.name)}\n\n${tr(lang, 'We received your payment.')}\n${plain(rows)}\n\n${tr(lang, 'Open my dashboard')}: ${r.dashboardUrl}`,
    html: layout(lang, tr(lang, 'Payment received'), `<p>${esc(hi(lang, r.name))} ${esc(tr(lang, 'Thank you! Your payment went through and access is now active.'))}</p>${facts(lang, rows)}`, { label: tr(lang, 'Open my dashboard'), url: r.dashboardUrl }),
  };
};

// ---- Reminders ----
export interface LiveReminderInput { name: string; studentName: string; isParent: boolean; sessionTitle: string; packageName: string; startsAt: Date; soon: boolean; url: string; lang?: Lang }
export const liveReminderMail = (r: LiveReminderInput): MailContent => {
  const lang = r.lang ?? 'en';
  const who = r.isParent ? tr(lang, "{name}'s", { name: r.studentName }) : tr(lang, 'Your');
  const heading = lang === 'ar'
    ? (r.soon ? `${who} هتبدأ كمان حوالي ساعة` : `${who} هتكون بكرة`)
    : `${who} live class ${r.soon ? 'starts in about an hour' : 'is tomorrow'}`;
  const rows: [string, string][] = [[tr(lang, 'Class'), r.sessionTitle], [tr(lang, 'Package'), r.packageName], [tr(lang, 'Starts'), `${cairoTime(r.startsAt, lang)} ${tr(lang, '(Cairo time)')}`]];
  const label = r.isParent ? tr(lang, 'Open class page') : tr(lang, 'Join the class');
  return {
    subject: tr(lang, r.soon ? 'Starting soon: {title}' : 'Tomorrow: {title}', { title: r.sessionTitle }),
    text: `${hi(lang, r.name)}\n\n${heading}.\n${plain(rows)}\n\n${label}: ${r.url}\n\n${off(lang)}`,
    html: layout(lang, heading, `<p>${esc(hi(lang, r.name))}</p>${facts(lang, rows)}${small(off(lang))}`, { label, url: r.url }),
  };
};

export interface RenewalInput { name: string; studentName: string; isParent: boolean; packageName: string; until: Date; daysLeft: number; expired: boolean; autoRenew: boolean; url: string; lang?: Lang }
export const renewalMail = (r: RenewalInput): MailContent => {
  const lang = r.lang ?? 'en';
  const who = r.isParent ? (lang === 'ar' ? `${r.studentName}` : `${r.studentName}'s`) : (lang === 'ar' ? '' : 'Your');
  const ar = lang === 'ar';
  const owner = ar ? (r.isParent ? `بتاعة ${r.studentName}` : 'بتاعتك') : '';
  const title = ar
    ? (r.expired ? `الباقة الشهرية ${owner} انتهت` : r.daysLeft <= 1 ? `الباقة الشهرية ${owner} بتنتهي بكرة` : `الباقة الشهرية ${owner} بتنتهي بعد ${r.daysLeft} أيام`)
    : (r.expired ? `${who} monthly plan has ended` : r.daysLeft <= 1 ? `${who} monthly plan ends tomorrow` : `${who} monthly plan ends in ${r.daysLeft} days`);
  const note = tr(lang, r.expired
    ? 'Access to the classes is paused. Renew to continue where you stopped; your progress is saved.'
    : r.autoRenew ? 'We will charge your saved card automatically, so there is nothing to do.' : 'Renew before it ends so classes are not interrupted.');
  const rows: [string, string][] = [[tr(lang, 'Package'), r.packageName], [tr(lang, r.expired ? 'Ended' : 'Ends'), cairoTime(r.until, lang)]];
  const subject = r.expired ? tr(lang, 'Plan ended: {pkg}', { pkg: r.packageName }) : r.daysLeft <= 1 ? tr(lang, 'Renew {pkg}: ends tomorrow', { pkg: r.packageName }) : tr(lang, 'Renew {pkg}: {n} days left', { pkg: r.packageName, n: r.daysLeft });
  return {
    subject,
    text: `${hi(lang, r.name)}\n\n${title}.\n${plain(rows)}\n\n${note}\n${tr(lang, 'Billing')}: ${r.url}\n\n${off(lang)}`,
    html: layout(lang, title, `<p>${esc(hi(lang, r.name))}</p>${facts(lang, rows)}<p>${esc(note)}</p>${small(off(lang))}`, { label: r.autoRenew && !r.expired ? tr(lang, 'See billing') : tr(lang, 'Renew now'), url: r.url }),
  };
};

// ---- Emails to a parent when something happens ----
interface ParentBase { lang?: Lang; parentName: string; studentName: string; url: string }
const parentMail = (lang: Lang, b: ParentBase, subject: string, heading: string, intro: string, rows: [string, string][]): MailContent => ({
  subject,
  text: `${hi(lang, b.parentName)}\n\n${intro}\n${plain(rows)}\n\n${tr(lang, 'See progress')}: ${b.url}\n\n${off(lang)}`,
  html: layout(lang, heading, `<p>${esc(hi(lang, b.parentName))}</p><p>${esc(intro)}</p>${facts(lang, rows)}${small(off(lang))}`, { label: tr(lang, 'See progress'), url: b.url }),
});

export const assignmentNewMail = (b: ParentBase & { title: string; lesson: string; packageName: string; dueAt: Date | null; maxScore: number }) => {
  const lang = b.lang ?? 'en';
  const heading = tr(lang, 'new assignment: {title}', { title: b.title });
  return parentMail(lang, b, `${b.studentName}: ${heading}`, heading, tr(lang, '{student} has a new assignment in {pkg}.', { student: b.studentName, pkg: b.packageName }),
    [[tr(lang, 'Assignment'), b.title], [tr(lang, 'Lesson'), b.lesson], [tr(lang, 'Due'), b.dueAt ? cairoTime(b.dueAt, lang) : tr(lang, 'No due date')], [tr(lang, 'Marks'), String(b.maxScore)]]);
};
export const assignmentGradedMail = (b: ParentBase & { title: string; score: number; maxScore: number; feedback: string | null }) => {
  const lang = b.lang ?? 'en';
  const heading = tr(lang, 'graded: {title}', { title: b.title });
  return parentMail(lang, b, `${b.studentName}: ${heading}`, heading, tr(lang, "{student}'s assignment was graded.", { student: b.studentName }),
    [[tr(lang, 'Assignment'), b.title], [tr(lang, 'Grade'), `${b.score} / ${b.maxScore}`], ...(b.feedback ? ([[tr(lang, 'Feedback'), b.feedback]] as [string, string][]) : [])]);
};
export const quizResultMail = (b: ParentBase & { quizTitle: string; score: number; passScore: number }) => {
  const lang = b.lang ?? 'en';
  const passed = b.score >= b.passScore;
  const heading = tr(lang, 'quiz result: {score}%', { score: b.score });
  return parentMail(lang, b, `${b.studentName}: ${heading}`, heading,
    tr(lang, passed ? '{student} finished a quiz and passed.' : '{student} finished a quiz and did not pass yet.', { student: b.studentName }),
    [[tr(lang, 'Quiz'), b.quizTitle], [tr(lang, 'Score'), `${b.score}%`], [tr(lang, 'Pass mark'), `${b.passScore}%`], [tr(lang, 'Result'), tr(lang, passed ? 'Passed' : 'Not passed')]]);
};

// ---- Weekly summary ----
export interface DigestChild {
  name: string; classesDone: number; liveAttended: number; quizzes: { title: string; score: number }[]; submitted: number; graded: { title: string; score: number; max: number }[];
  streak: number; points: number; nextLive: { title: string; startsAt: Date } | null; overdue: string[];
}
export const weeklyDigestMail = (parentName: string, kids: DigestChild[], url: string, lang: Lang = 'en'): MailContent => {
  const blocks = kids.map((k) => {
    const rows: [string, string][] = [
      [tr(lang, 'Lessons completed'), String(k.classesDone)],
      [tr(lang, 'Live classes attended'), String(k.liveAttended)],
      [tr(lang, 'Assignments handed in'), String(k.submitted)],
      ...k.quizzes.map((q): [string, string] => [tr(lang, 'Quiz: {title}', { title: q.title }), `${q.score}%`]),
      ...k.graded.map((g): [string, string] => [tr(lang, 'Graded: {title}', { title: g.title }), `${g.score} / ${g.max}`]),
      [tr(lang, 'Day streak'), tr(lang, k.streak === 1 ? '{n} day' : '{n} days', { n: k.streak })],
      [tr(lang, 'Points'), String(k.points)],
      ...(k.nextLive ? ([[tr(lang, 'Next live class'), `${k.nextLive.title}, ${cairoTime(k.nextLive.startsAt, lang)}`]] as [string, string][]) : []),
      ...(k.overdue.length ? ([[tr(lang, 'Overdue'), k.overdue.join(', ')]] as [string, string][]) : []),
    ];
    return { name: k.name, rows };
  });
  return {
    subject: kids.length === 1 ? tr(lang, "{name}'s week on Codiq", { name: kids[0].name }) : tr(lang, "Your children's week on Codiq"),
    text: `${hi(lang, parentName)}\n\n${tr(lang, 'Here are the last 7 days.')}\n\n${blocks.map((b) => `${b.name}\n${plain(b.rows)}`).join('\n\n')}\n\n${tr(lang, 'Full report')}: ${url}\n\n${off(lang)}`,
    html: layout(lang, tr(lang, 'The week on Codiq'), `<p>${esc(hi(lang, parentName))} ${esc(tr(lang, 'Here are the last 7 days.'))}</p>${blocks.map((b) => `<h2 style="font-size:17px;margin:22px 0 0">${esc(b.name)}</h2>${facts(lang, b.rows)}`).join('')}${small(off(lang))}`, { label: tr(lang, 'Open full report'), url }),
  };
};

export const certificateMail = (name: string, packageName: string, url: string, lang: Lang = 'en'): MailContent => ({
  subject: tr(lang, 'Congratulations! Your certificate: {pkg}', { pkg: packageName }),
  text: `${hi(lang, name)}\n\n${tr(lang, 'You finished every session in {pkg}. Your certificate is ready to download:', { pkg: packageName })}\n${url}`,
  html: layout(lang, tr(lang, 'You finished the course!'), `<p>${esc(hi(lang, name))}</p><p>${esc(tr(lang, 'You completed every session in {pkg}. Your certificate is ready.', { pkg: packageName }))}</p>`, { label: tr(lang, 'Download certificate'), url }),
});
