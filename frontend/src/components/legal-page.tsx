import { SiteFooter, SiteHeader } from './site';
import { getLegal } from '@/lib/legal';
import { getLang } from '@/lib/i18n-server';
import Link from 'next/link';

export async function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const lang = await getLang();
  const doc = getLegal(kind, lang);
  const other = kind === 'terms' ? { href: '/privacy', label: lang === 'ar' ? 'سياسة الخصوصية' : 'Privacy Policy' } : { href: '/terms', label: lang === 'ar' ? 'شروط الاستخدام' : 'Terms of Use' };
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 pt-14">
        <h1 className="font-mono text-[clamp(30px,5vw,44px)] font-bold tracking-[-0.04em]">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted">{doc.updated}</p>
        <p className="mt-6 text-[17px] leading-relaxed">{doc.intro}</p>
        {doc.sections.map((s) => (
          <section key={s.h} className="mt-8">
            <h2 className="text-xl font-bold">{s.h}</h2>
            {s.p.map((p) => <p key={p} className="mt-3 text-[16px] leading-relaxed text-[#4a4945] dark:text-[#c9c6bd]">{p}</p>)}
          </section>
        ))}
        <p className="mt-10 border-t border-line pt-6 text-sm"><Link href={other.href} className="font-semibold underline">{other.label}</Link></p>
      </main>
      <SiteFooter />
    </>
  );
}
