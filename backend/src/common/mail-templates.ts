/** Branded HTML emails (inline styles only, because email clients ignore most CSS). */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(title: string, bodyHtml: string, button?: { label: string; url: string }) {
  const btn = button
    ? `<p style="margin:28px 0"><a href="${esc(button.url)}" style="background:#1c1d21;color:#f5f3ee;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;display:inline-block">${esc(button.label)}</a></p>
       <p style="font-size:13px;color:#6b6a66;word-break:break-all">If the button doesn't work, copy this link:<br>${esc(button.url)}</p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f5f3ee;font-family:Arial,Helvetica,sans-serif;color:#1c1d21">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e4e0d8">
      <tr><td style="padding:28px 32px 0;font-family:'Courier New',monospace;font-size:26px;font-weight:700;letter-spacing:-1px">codiq<span style="color:#2b62b3">&#9608;</span></td></tr>
      <tr><td style="padding:20px 32px 32px;font-size:16px;line-height:1.6">
        <h1 style="font-size:22px;margin:0 0 12px">${esc(title)}</h1>
        ${bodyHtml}${btn}
      </td></tr>
      <tr><td style="padding:16px 32px;border-top:1px solid #e4e0d8;font-size:12px;color:#6b6a66">Think it. Code it. · Codiq</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export interface MailContent { subject: string; text: string; html: string }

export const resetPasswordMail = (name: string, link: string): MailContent => ({
  subject: 'Reset your Codiq password',
  text: `Hi ${name},\n\nOpen this link within an hour to choose a new password:\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
  html: layout('Reset your password', `<p>Hi ${esc(name)},</p><p>Use the button below within an hour to choose a new password. If you didn't ask for this, you can ignore this email.</p>`, { label: 'Choose a new password', url: link }),
});

export const welcomeMail = (name: string, url: string): MailContent => ({
  subject: 'Welcome to Codiq',
  text: `Hi ${name},\n\nWelcome to Codiq. We teach you how to learn and understand, not just how to copy code.\nOpen your dashboard: ${url}`,
  html: layout('Welcome to Codiq', `<p>Hi ${esc(name)},</p><p>Welcome! At Codiq we teach you how to <b>learn and understand</b>, not just how to copy code.</p>`, { label: 'Open my dashboard', url }),
});

export interface ReceiptInput {
  name: string; packageName: string; studentName: string; amountEgp: string; method: string; reference: string; paidAt: string; dashboardUrl: string; monthlyUntil?: string;
}
export const paymentReceiptMail = (r: ReceiptInput): MailContent => {
  const rows: [string, string][] = [
    ['Package', r.packageName], ['For', r.studentName], ['Amount', r.amountEgp], ['Method', r.method], ['Date', r.paidAt], ['Reference', r.reference],
    ...(r.monthlyUntil ? ([['Access until', r.monthlyUntil]] as [string, string][]) : []),
  ];
  const table = `<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e0d8;margin-top:8px">${rows
    .map(([k, v]) => `<tr><td style="padding:9px 0;border-bottom:1px solid #e4e0d8;color:#6b6a66;font-size:14px">${esc(k)}</td><td style="padding:9px 0;border-bottom:1px solid #e4e0d8;text-align:right;font-weight:700;font-size:14px">${esc(v)}</td></tr>`)
    .join('')}</table>`;
  return {
    subject: `Payment received: ${r.packageName}`,
    text: `Hi ${r.name},\n\nWe received your payment.\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nOpen your dashboard: ${r.dashboardUrl}`,
    html: layout('Payment received', `<p>Hi ${esc(r.name)}, thank you! Your payment went through and access is now active.</p>${table}`, { label: 'Open my dashboard', url: r.dashboardUrl }),
  };
};

/** Small label/value table used by the reminder and grade emails. */
const facts = (rows: [string, string][]) =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e0d8;margin-top:8px">${rows
    .map(([k, v]) => `<tr><td style="padding:9px 0;border-bottom:1px solid #e4e0d8;color:#6b6a66;font-size:14px">${esc(k)}</td><td style="padding:9px 0;border-bottom:1px solid #e4e0d8;text-align:right;font-weight:700;font-size:14px">${esc(v)}</td></tr>`)
    .join('')}</table>`;
const plain = (rows: [string, string][]) => rows.map(([k, v]) => `${k}: ${v}`).join('\n');
const OFF = 'You can turn these emails off in Profile > Email notifications.';

/** Date and time in Egypt, for example "Sat 31 Oct, 18:00". */
export const cairoTime = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

export interface LiveReminderInput { name: string; studentName: string; isParent: boolean; sessionTitle: string; packageName: string; startsAt: Date; soon: boolean; url: string }
export const liveReminderMail = (r: LiveReminderInput): MailContent => {
  const who = r.isParent ? `${r.studentName}'s` : 'Your';
  const when = r.soon ? 'starts in about an hour' : 'is tomorrow';
  const rows: [string, string][] = [['Class', r.sessionTitle], ['Package', r.packageName], ['Starts', `${cairoTime(r.startsAt)} (Cairo time)`]];
  return {
    subject: `${r.soon ? 'Starting soon' : 'Tomorrow'}: ${r.sessionTitle}`,
    text: `Hi ${r.name},\n\n${who} live class ${when}.\n${plain(rows)}\n\n${r.isParent ? 'Open the class page' : 'Join the class'}: ${r.url}\n\n${OFF}`,
    html: layout(`${who} live class ${when}`, `<p>Hi ${esc(r.name)},</p>${facts(rows)}<p style="font-size:13px;color:#6b6a66">${OFF}</p>`, { label: r.isParent ? 'Open class page' : 'Join the class', url: r.url }),
  };
};

export interface RenewalInput { name: string; studentName: string; isParent: boolean; packageName: string; until: Date; daysLeft: number; expired: boolean; autoRenew: boolean; url: string }
export const renewalMail = (r: RenewalInput): MailContent => {
  const who = r.isParent ? `${r.studentName}'s` : 'Your';
  const title = r.expired ? `${who} monthly plan has ended` : r.daysLeft <= 1 ? `${who} monthly plan ends tomorrow` : `${who} monthly plan ends in ${r.daysLeft} days`;
  const note = r.expired
    ? 'Access to the classes is paused. Renew to continue where you stopped; your progress is saved.'
    : r.autoRenew ? 'We will charge your saved card automatically, so there is nothing to do.' : 'Renew before it ends so classes are not interrupted.';
  const rows: [string, string][] = [['Package', r.packageName], [r.expired ? 'Ended' : 'Ends', cairoTime(r.until)]];
  return {
    subject: r.expired ? `Plan ended: ${r.packageName}` : `Renew ${r.packageName}: ${r.daysLeft <= 1 ? 'ends tomorrow' : `${r.daysLeft} days left`}`,
    text: `Hi ${r.name},\n\n${title}.\n${plain(rows)}\n\n${note}\nBilling: ${r.url}\n\n${OFF}`,
    html: layout(title, `<p>Hi ${esc(r.name)},</p>${facts(rows)}<p>${esc(note)}</p><p style="font-size:13px;color:#6b6a66">${OFF}</p>`, { label: r.autoRenew && !r.expired ? 'See billing' : 'Renew now', url: r.url }),
  };
};

export interface ParentEventInput { parentName: string; studentName: string; heading: string; intro: string; rows: [string, string][]; url: string; button: string }
/** Used for "new assignment", "assignment graded" and "quiz result" emails to a parent. */
export const parentEventMail = (r: ParentEventInput): MailContent => ({
  subject: `${r.studentName}: ${r.heading}`,
  text: `Hi ${r.parentName},\n\n${r.intro}\n${plain(r.rows)}\n\n${r.button}: ${r.url}\n\n${OFF}`,
  html: layout(r.heading, `<p>Hi ${esc(r.parentName)},</p><p>${esc(r.intro)}</p>${facts(r.rows)}<p style="font-size:13px;color:#6b6a66">${OFF}</p>`, { label: r.button, url: r.url }),
});

export interface DigestChild {
  name: string; classesDone: number; liveAttended: number; quizzes: { title: string; score: number }[]; submitted: number; graded: { title: string; score: number; max: number }[];
  streak: number; points: number; nextLive: { title: string; startsAt: Date } | null; overdue: string[];
}
export const weeklyDigestMail = (parentName: string, kids: DigestChild[], url: string): MailContent => {
  const blocks = kids.map((k) => {
    const rows: [string, string][] = [
      ['Lessons completed', String(k.classesDone)],
      ['Live classes attended', String(k.liveAttended)],
      ['Assignments handed in', String(k.submitted)],
      ...k.quizzes.map((q): [string, string] => [`Quiz: ${q.title}`, `${q.score}%`]),
      ...k.graded.map((g): [string, string] => [`Graded: ${g.title}`, `${g.score} / ${g.max}`]),
      ['Day streak', `${k.streak} ${k.streak === 1 ? 'day' : 'days'}`],
      ['Points', String(k.points)],
      ...(k.nextLive ? ([['Next live class', `${k.nextLive.title}, ${cairoTime(k.nextLive.startsAt)}`]] as [string, string][]) : []),
      ...(k.overdue.length ? ([['Overdue', k.overdue.join(', ')]] as [string, string][]) : []),
    ];
    return { name: k.name, rows };
  });
  return {
    subject: `${kids.length === 1 ? `${kids[0].name}'s` : 'Your children\'s'} week on Codiq`,
    text: `Hi ${parentName},\n\nHere is the last 7 days.\n\n${blocks.map((b) => `${b.name}\n${plain(b.rows)}`).join('\n\n')}\n\nFull report: ${url}\n\n${OFF}`,
    html: layout('The week on Codiq', `<p>Hi ${esc(parentName)}, here are the last 7 days.</p>${blocks.map((b) => `<h2 style="font-size:17px;margin:22px 0 0">${esc(b.name)}</h2>${facts(b.rows)}`).join('')}<p style="font-size:13px;color:#6b6a66">${OFF}</p>`, { label: 'Open full report', url }),
  };
};

export const certificateMail = (name: string, packageName: string, url: string): MailContent => ({
  subject: `Congratulations! Your certificate: ${packageName}`,
  text: `Hi ${name},\n\nYou finished every session in ${packageName}. Your certificate is ready to download:\n${url}`,
  html: layout('You finished the course!', `<p>Hi ${esc(name)},</p><p>You completed every session in <b>${esc(packageName)}</b>. Your certificate is ready.</p>`, { label: 'Download certificate', url }),
});
