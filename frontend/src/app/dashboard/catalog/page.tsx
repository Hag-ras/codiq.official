'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { egp } from '@/lib/format';
import { Badge, ButtonLink, Card, Empty, PageTitle, cx } from '@/components/ui';
import { TRACK_AUDIENCE, TRACK_LABEL } from '@/lib/types';
import type { CatalogPackage, Track } from '@/lib/types';

const TRACKS: (Track | '')[] = ['', 'KIDS', 'SCHOOL', 'COLLEGE'];

export default function CatalogPage() {
  const [track, setTrack] = useState<Track | ''>('');
  const { data, isLoading } = useQuery({ queryKey: ['catalog'], queryFn: () => api<CatalogPackage[]>('/account/catalog') });
  const list = (data ?? []).filter((p) => !track || p.track === track);
  return (
    <>
      <PageTitle title="Browse packages" sub="Pick a package, pay once or monthly, and it unlocks right away." />
      <div className="mb-4 flex flex-wrap gap-2">
        {TRACKS.map((t) => (
          <button key={t || 'all'} onClick={() => setTrack(t)} className={cx('min-h-10 rounded-full border px-4 text-sm font-semibold', track === t ? 'border-ink bg-ink text-paper' : 'border-line bg-white')}>
            {t ? TRACK_LABEL[t] : 'All'}
          </button>
        ))}
      </div>
      {isLoading ? <div className="h-40 animate-pulse rounded-(--radius-card) bg-black/5" /> : !list.length ? <Empty>No packages here yet.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((p) => (
            <Card key={p.id} className="flex flex-col gap-3" >
              <div data-track={p.track} className="flex items-start justify-between gap-2">
                <div><Badge tone="accent">{TRACK_LABEL[p.track]}</Badge><h2 className="mt-2 font-mono text-xl font-bold tracking-[-0.02em]">{p.name}</h2></div>
                {p.enrolled && <Badge tone="good">Enrolled</Badge>}
              </div>
              <p className="text-sm text-muted">{TRACK_AUDIENCE[p.track]} · {p._count?.sessions ?? 0} sessions</p>
              <p className="text-[15px]">{p.description}</p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="font-mono">{egp(p.priceOneTime)}{p.priceMonthly ? <span className="text-sm text-muted"> or {egp(p.priceMonthly)}/mo</span> : null}</div>
                {p.enrolled ? <ButtonLink href="/dashboard/sessions" variant="ghost">Open</ButtonLink> : <ButtonLink href={`/checkout/${p.id}`}>Enroll</ButtonLink>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
