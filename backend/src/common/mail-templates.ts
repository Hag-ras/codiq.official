/** Branded HTML emails (inline styles only, because email clients ignore most CSS). */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(title: string, bodyHtml: string, button?: { label: string; url: string }) {
  const btn = button
    ? `<p style="margin:28px 0"><a href="${esc(button.url)}" style="background:#1c1d21;color:#f5f3ee;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;display:inline-block">${esc(button.label)}</a></p>
       <p style="font-size:13px;color:#6b6a66;word-break:break-all">If the button doesn't work, copy this link:<br>${esc(button.url)}</p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f5f3ee;font-family:Arial,Helvetica,sans-serif;color:#1c1d21">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e4e0d8">
      <tr><td style="padding:28px 32px 0;font-family:'Courier New',monospace;font-size:26px;font-weight:700;letter-spacing:-1px">codiq<span style="color:#ae593a">&#9608;</span></td></tr>
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
