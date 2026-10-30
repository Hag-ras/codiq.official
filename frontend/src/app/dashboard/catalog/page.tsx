'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { egp } from '@/lib/format';
import { Badge, ButtonLink, Card, Empty, PageTitle, cx } from '@/components/ui';
import { TRACK_AUDIENCE, TRACK_LABEL } from '@/lib/types';
import type { CatalogPackage, Track } from '@/lib/types';
import { useT } from '@/components/i18n-provider';

const TRACKS: (Track | '')[] = ['', 'KIDS', 'SCHOOL', 'COLLEGE'];

export default function CatalogPage() {
  const t = useT();
  const [track, setTrack] = useState<Track | ''>('');
  const { data, isLoading } = useQuery({ queryKey: ['catalog'], queryFn: () => api<CatalogPackage[]>('/account/catalog') });
  const list = (data ?? []).filter((p) => !track || p.track === track);
  return (
    <>
      <PageTitle title={t('Browse packages')} sub={t('Pick a package, pay once or monthly, and it unlocks right away.')} />
      <div className="mb-4 flex flex-wrap gap-2">
        {TRACKS.map((tk) => (
          <button key={tk || 'all'} onClick={() => setTrack(tk)} className={cx('min-h-10 rounded-full border px-4 text-sm font-semibold', track === tk ? 'border-ink bg-ink text-paper' : 'border-line bg-white')}>
            {tk ? t(TRACK_LABEL[tk]) : t('All')}
          </button>
        ))}
      </div>
      {isLoading ? <div className="h-40 animate-pulse rounded-(--radius-card) bg-black/5" /> : !list.length ? <Empty>{t('No packages here yet.')}</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((p) => (
            <Card key={p.id} className="flex flex-col gap-3" >
              <div data-track={p.track} className="flex items-start justify-between gap-2">
                <div><Badge tone="accent">{t(TRACK_LABEL[p.track])}</Badge><h2 className="mt-2 font-mono text-xl font-bold tracking-[-0.02em]">{p.name}</h2></div>
                {p.enrolled && <Badge tone="good">{t('Enrolled')}</Badge>}
              </div>
              <p className="text-sm text-muted">{t(TRACK_AUDIENCE[p.track])} · {p._count?.sessions ?? 0} {t('sessions')}</p>
              <p className="text-[15px]">{p.description}</p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="font-mono">{egp(p.priceOneTime)}{p.priceMonthly ? <span className="text-sm text-muted"> {t('or')} {egp(p.priceMonthly)}/{t('mo')}</span> : null}</div>
                {p.enrolled ? <ButtonLink href="/dashboard/sessions" variant="ghost">{t('Open')}</ButtonLink> : <ButtonLink href={`/checkout/${p.id}`}>{t('Enroll')}</ButtonLink>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
