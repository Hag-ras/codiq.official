import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/site';
import { publicApi } from '@/lib/server-api';
import { getT, getLang } from '@/lib/i18n-server';

type Result = { valid: false } | { valid: true; name: string; course: string; issuedAt: string };

export const metadata = { title: 'Verify a certificate · Codiq' };

export default async function VerifyPage({ params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  const t = await getT();
  const lang = await getLang();
  const r = await publicApi<Result>(`/certificates/verify/${encodeURIComponent(serial)}`).catch(() => null);
  const date = r?.valid ? new Date(r.issuedAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-5 pt-14">
        <h1 className="font-mono text-[clamp(28px,5vw,40px)] font-bold tracking-[-0.04em]">{t('Certificate check')}</h1>
        <p className="mt-1 font-mono text-sm text-muted">{serial.toUpperCase()}</p>
        {!r ? (
          <p className="mt-8 rounded-xl bg-[#f6ecd6] px-4 py-3 text-[#7a5a17]">{t('We could not check this right now. Please try again in a moment.')}</p>
        ) : r.valid ? (
          <div className="mt-8 rounded-(--radius-card) border border-[#b9d8c6] bg-[#e4f0e9] p-6 text-[#1f4a35]">
            <p className="text-sm font-semibold tracking-wide uppercase">✓ {t('This certificate is real')}</p>
            <p className="mt-3 text-2xl font-bold">{r.name}</p>
            <p className="mt-1">{t('completed every session of')} <b>{r.course}</b></p>
            <p className="mt-3 text-sm">{t('Issued on {date}', { date })}</p>
          </div>
        ) : (
          <p className="mt-8 rounded-xl bg-[#f7e1df] px-4 py-3 text-danger">{t('No certificate has this number. Check that you typed it exactly as printed.')}</p>
        )}
        <p className="mt-8 text-sm"><Link href="/" className="font-semibold underline">codiq</Link></p>
      </main>
      <SiteFooter />
    </>
  );
}
