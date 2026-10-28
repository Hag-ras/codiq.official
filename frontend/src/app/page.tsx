import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/site';
import { ButtonLink } from '@/components/ui';
import { publicApi } from '@/lib/server-api';
import { egp } from '@/lib/format';
import { TRACK_AUDIENCE, TRACK_LABEL, type Package, type Track } from '@/lib/types';

const TRACKS: { id: Track; color: string; learn: string }[] = [
  { id: 'KIDS', color: '#ae593a', learn: 'Scratch, Python, games and animations. Short, hands-on classes.' },
  { id: 'SCHOOL', color: '#3d7a5a', learn: 'The Ministry programming curriculum, exam practice and past papers.' },
  { id: 'COLLEGE', color: '#3b5f9e', learn: 'Web development, data structures and algorithms, real projects.' },
];

const STEPS = [
  ['Pick a package', 'Choose a track and pay once or monthly.'],
  ['Pay your way', 'Card, Fawry, mobile wallet, InstaPay or installments.'],
  ['Learn live or recorded', 'Join the live classroom or watch any session again.'],
  ['Practise every session', 'Each session has materials, an assignment and a quiz.'],
];

export default async function Landing() {
  const packages = await publicApi<Package[]>('/packages').catch(() => [] as Package[]);
  const from = (t: Track) => {
    const p = packages.filter((x) => x.track === t).map((x) => x.priceMonthly ?? x.priceOneTime);
    return p.length ? Math.min(...p) : null;
  };

  return (
    <>
      <SiteHeader />
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-16 pb-20 md:grid-cols-[1.1fr_1fr] md:pt-24">
          <div className="flex flex-col gap-6">
            <span className="font-mono text-[13px] tracking-[0.08em] text-muted">KIDS · SCHOOL · COLLEGE</span>
            <h1 className="font-mono text-[clamp(44px,8vw,84px)] leading-[0.98] font-bold tracking-[-0.045em]">
              Think it.<br />Code it.
            </h1>
            <p className="max-w-[520px] text-lg leading-relaxed text-[#4a4945]">
              Live and recorded programming classes for kids aged 8–16, secondary students on the Egyptian curriculum, and college students.
              Every session comes with materials, an assignment and a quiz.
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/pricing">See packages</ButtonLink>
              <ButtonLink href="/signup" variant="secondary">Create an account</ButtonLink>
            </div>
          </div>
          <div className="rounded-2xl bg-ink p-6 font-mono text-[14px] leading-8 text-paper shadow-[0_30px_60px_-30px_rgba(0,0,0,.5)] md:text-[15px]">
            <div className="mb-3 flex gap-1.5"><i className="size-2.5 rounded-full bg-[#3a3b41]" /><i className="size-2.5 rounded-full bg-[#3a3b41]" /><i className="size-2.5 rounded-full bg-[#3a3b41]" /></div>
            <div><span className="text-clay-light">$</span> codiq --tracks</div>
            {TRACKS.map((t) => (
              <div key={t.id} className="grid grid-cols-[90px_1fr] gap-2 text-[#b4b2ac]">
                <span style={{ color: t.color === '#ae593a' ? '#d4896e' : t.color === '#3d7a5a' ? '#7fb898' : '#8fa9d6' }}>{t.id.toLowerCase()}</span>
                <span>{TRACK_AUDIENCE[t.id].toLowerCase()}</span>
              </div>
            ))}
            <div className="flex items-center gap-2"><span className="text-clay-light">$</span><span className="inline-block h-5 w-2.5 animate-blink bg-clay-light" /></div>
          </div>
        </section>

        <section id="tracks" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-12">
          <h2 className="mb-8 font-mono text-3xl font-bold tracking-[-0.03em]">Three tracks, one school</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {TRACKS.map((t) => (
              <div key={t.id} className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6">
                <span className="size-4 rounded-[4px]" style={{ background: t.color }} />
                <div>
                  <h3 className="text-xl font-bold">{TRACK_LABEL[t.id]}</h3>
                  <p className="text-sm text-muted">{TRACK_AUDIENCE[t.id]}</p>
                </div>
                <p className="flex-1 text-[15px] leading-relaxed text-[#4a4945]">{t.learn}</p>
                <div className="flex items-center justify-between border-t border-line pt-4">
                  <span className="text-sm text-muted">{from(t.id) !== null ? `From ${egp(from(t.id)!)}` : ''}</span>
                  <Link href={`/pricing?track=${t.id}`} className="text-[15px] font-semibold hover:text-clay">View packages →</Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-12">
          <h2 className="mb-8 font-mono text-3xl font-bold tracking-[-0.03em]">How it works</h2>
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex flex-col gap-2 border-t-2 border-ink pt-4">
                <span className="font-mono text-sm text-clay">0{i + 1}</span>
                <span className="text-lg font-bold">{t}</span>
                <span className="text-[15px] text-[#4a4945]">{d}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
