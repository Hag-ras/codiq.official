'use client';
import { useState } from 'react';
import { ButtonLink, cx } from './ui';
import { useT } from './i18n-provider';
import { egp } from '@/lib/format';
import { TRACK_LABEL, type Billing, type Package, type Track } from '@/lib/types';

const COLORS: Record<Track, string> = { KIDS: '#2b62b3', SCHOOL: '#3d7a5a', COLLEGE: '#6a4c9c' };

export function PricingGrid({ packages, initialTrack }: { packages: Package[]; initialTrack?: Track }) {
  const t = useT();
  const [billing, setBilling] = useState<Billing>('ONE_TIME');
  const [track, setTrack] = useState<Track | 'ALL'>(initialTrack ?? 'ALL');
  const list = packages.filter((p) => (track === 'ALL' || p.track === track) && (billing === 'ONE_TIME' || p.priceMonthly));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {(['ALL', 'KIDS', 'SCHOOL', 'COLLEGE'] as const).map((tk) => (
            <button key={tk} onClick={() => setTrack(tk)}
              className={cx('min-h-10 rounded-full border px-4 text-sm font-semibold', track === tk ? 'border-ink bg-ink text-paper' : 'border-line bg-white')}>
              {tk === 'ALL' ? t('All') : t(TRACK_LABEL[tk].replace('Codiq ', ''))}
            </button>
          ))}
        </div>
        <div className="flex rounded-full border border-line bg-white p-1">
          {(['ONE_TIME', 'MONTHLY'] as const).map((b) => (
            <button key={b} onClick={() => setBilling(b)}
              className={cx('min-h-9 rounded-full px-4 text-sm font-semibold', billing === b ? 'bg-ink text-paper' : 'text-muted')}>
              {b === 'ONE_TIME' ? t('One-time') : t('Monthly')}
            </button>
          ))}
        </div>
      </div>

      <div className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3" key={`${track}-${billing}`}>
        {list.map((p) => {
          const price = billing === 'ONE_TIME' ? p.priceOneTime : p.priceMonthly!;
          return (
            <div key={p.id} className="lift flex flex-col gap-4 rounded-2xl border border-line bg-white p-6">
              <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: COLORS[p.track] }}>
                <i className="size-2.5 rounded-[3px]" style={{ background: COLORS[p.track] }} />
                {t(TRACK_LABEL[p.track])}
              </span>
              <div>
                <h2 className="text-xl font-bold">{p.name}</h2>
                <p className="mt-1 text-[15px] text-[#4a4945]">{p.description}</p>
              </div>
              <div className="mt-auto">
                <div className="font-mono text-3xl font-bold tracking-[-0.03em]">{egp(price)}</div>
                <div className="text-sm text-muted">
                  {billing === 'ONE_TIME' ? t('one-time') : t('per month')} · {p._count?.sessions ?? 0} {t('sessions')}
                  {billing === 'ONE_TIME' && p.installmentsAllowed ? ` · ${t('installments available')}` : ''}
                </div>
              </div>
              <ButtonLink href={`/checkout/${p.id}?billing=${billing}`}>{t('Enroll')}</ButtonLink>
            </div>
          );
        })}
      </div>
    </div>
  );
}
