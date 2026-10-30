import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SiteFooter, SiteHeader } from '@/components/site';
import { ButtonLink } from '@/components/ui';
import { Reveal } from '@/components/reveal';
import { LandingMotion } from '@/components/landing-motion';
import { getT } from '@/lib/i18n-server';
import { publicApi } from '@/lib/server-api';
import { egp } from '@/lib/format';
import { TRACK_AUDIENCE, TRACK_LABEL, type Package, type Track } from '@/lib/types';

const TRACKS: { id: Track; color: string; learn: string }[] = [
  { id: 'KIDS', color: '#2b62b3', learn: 'Scratch, Python, games and animations. Short, hands-on classes.' },
  { id: 'SCHOOL', color: '#3d7a5a', learn: 'The Ministry programming curriculum, exam practice and past papers.' },
  { id: 'COLLEGE', color: '#6a4c9c', learn: 'Web development, data structures and algorithms, real projects.' },
];

const STEPS = [
  ['Pick a package', 'Choose a track and pay once or monthly.'],
  ['Pay your way', 'Card, Fawry, mobile wallet, InstaPay or installments.'],
  ['Learn live or recorded', 'Join the live classroom or watch any session again.'],
  ['Practise every session', 'Each session has materials, an assignment and a quiz.'],
];

export default async function Landing() {
  // Signed-in users get their own dashboard (student, parent, instructor, assistant or admin) as the home page.
  if ((await cookies()).has('refresh_token')) redirect('/dashboard');
  const t = await getT();
  const packages = await publicApi<Package[]>('/packages').catch(() => [] as Package[]);
  const from = (t: Track) => {
    const p = packages.filter((x) => x.track === t).map((x) => x.priceMonthly ?? x.priceOneTime);
    return p.length ? Math.min(...p) : null;
  };

  return (
    <>
      <SiteHeader />
      <main>
        <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pt-16 pb-20 md:grid-cols-[1.1fr_1fr] md:pt-24">
          <div data-parallax="90" className="pointer-events-none absolute inset-0" aria-hidden>
            <span className="blob -top-10 -start-20 size-72 bg-clay" />
            <span className="blob end-0 top-40 size-64 bg-[#6a4c9c]" style={{ animationDelay: '-6s' }} />
          </div>
          <div data-hero className="relative flex flex-col gap-6">
            <span className="font-mono text-[13px] tracking-[0.08em] text-muted">KIDS · SCHOOL · COLLEGE</span>
            <h1 data-hero-title className="font-mono text-[clamp(44px,8vw,84px)] leading-[0.98] font-bold tracking-[-0.045em]">
              {t('Think it.')}<br /><span data-shine className="text-shine inline-block">{t('Code it.')}</span>
            </h1>
            <p className="max-w-[520px] text-lg leading-relaxed text-[#4a4945]">
              {t('Live and recorded programming classes for kids aged 8–16, secondary students on the Egyptian curriculum, and college students. Every session comes with materials, an assignment and a quiz.')}
            </p>
            <div className="flex flex-wrap gap-3">
              <span data-magnetic className="inline-block"><ButtonLink href="/pricing">{t('See packages')}</ButtonLink></span>
              <span data-magnetic className="inline-block"><ButtonLink href="/signup" variant="secondary">{t('Create an account')}</ButtonLink></span>
            </div>
          </div>
          <div dir="ltr" data-tilt className="relative rounded-2xl bg-night p-6 font-mono text-[14px] leading-8 text-day shadow-[0_30px_60px_-30px_rgba(0,0,0,.5)] md:text-[15px]">
            <div className="mb-3 flex gap-1.5"><i className="size-2.5 rounded-full bg-[#3a3b41]" /><i className="size-2.5 rounded-full bg-[#3a3b41]" /><i className="size-2.5 rounded-full bg-[#3a3b41]" /></div>
            <div><span className="text-clay-light">$</span> codiq --tracks</div>
            {TRACKS.map((tr, i) => (
              <div key={tr.id} className="term-line grid grid-cols-[90px_1fr] gap-2 text-[#b4b2ac]" style={{ animationDelay: `${0.4 + i * 0.5}s` }}>
                <span style={{ color: tr.color === '#2b62b3' ? '#7fa8e3' : tr.color === '#3d7a5a' ? '#7fb898' : '#a898d6' }}>{tr.id.toLowerCase()}</span>
                <span>{TRACK_AUDIENCE[tr.id].toLowerCase()}</span>
              </div>
            ))}
            <div className="flex items-center gap-2"><span className="text-clay-light">$</span><span className="inline-block h-5 w-2.5 animate-blink bg-clay-light" /></div>
          </div>
        </section>

        <section id="tracks" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-12">
          <Reveal><h2 className="mb-8 font-mono text-3xl font-bold tracking-[-0.03em]">{t('Three tracks, one school')}</h2></Reveal>
          <div className="grid gap-5 md:grid-cols-3">
            {TRACKS.map((tr, i) => (
              <Reveal key={tr.id} delay={i * 90}>
                <div className="lift flex h-full flex-col gap-4 rounded-2xl border border-line bg-white p-6">
                  <span className="size-4 rounded-[4px]" style={{ background: tr.color }} />
                  <div>
                    <h3 className="text-xl font-bold">{t(TRACK_LABEL[tr.id])}</h3>
                    <p className="text-sm text-muted">{t(TRACK_AUDIENCE[tr.id])}</p>
                  </div>
                  <p className="flex-1 text-[15px] leading-relaxed text-[#4a4945]">{t(tr.learn)}</p>
                  <div className="flex items-center justify-between border-t border-line pt-4">
                    <span className="text-sm text-muted">{from(tr.id) !== null ? `${t('From')} ${egp(from(tr.id)!)}` : ''}</span>
                    <Link href={`/pricing?track=${tr.id}`} className="text-[15px] font-semibold hover:text-clay">{t('View packages')} →</Link>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-12">
          <Reveal><h2 className="mb-8 font-mono text-3xl font-bold tracking-[-0.03em]">{t('How it works')}</h2></Reveal>
          <ol data-steps className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, d], i) => (
              <li key={title}>
                <Reveal delay={i * 100} className="flex h-full flex-col gap-2 border-t-2 border-ink pt-4">
                  <span className="font-mono text-sm text-clay">0{i + 1}</span>
                  <span className="text-lg font-bold">{t(title)}</span>
                  <span className="text-[15px] text-[#4a4945]">{t(d)}</span>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <SiteFooter />
      <LandingMotion />
    </>
  );
}
