'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, ButtonLink, Card, Empty, Progress } from '@/components/ui';
import type { Me, SessionSummary } from '@/lib/types';
import { useT } from '@/components/i18n-provider';
import { StatsStrip } from '@/components/stats-strip';

export type Mine = { packages: { id: string; name: string; billing: string; activeUntil: string | null }[]; sessions: SessionSummary[] };

export function useMine() {
  return useQuery({ queryKey: ['sessions', 'mine'], queryFn: () => api<Mine>('/sessions/mine') });
}

export function StudentHome({ me }: { me: Me }) {
  const t = useT();
  const { data, isLoading } = useMine();
  const playful = me.track === 'KIDS';
  const first = me.name.split(' ')[0];
  const hour = new Date().getHours();
  const greeting = playful ? t('Hi {name}! Ready to code?', { name: first }) : `${t(hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening')}, ${first}`;

  if (isLoading) return <div className="h-40 animate-pulse rounded-(--radius-card) bg-black/5" />;
  if (!data?.packages.length)
    return (
      <>
        <h1 className="mb-6 font-mono text-[28px] font-bold tracking-[-0.03em]">{greeting}</h1>
        <Empty>
          {t("You're not enrolled yet.")} <Link href="/pricing" className="font-semibold text-ink underline">{t('Pick a package')}</Link> {t('to unlock sessions.')}
        </Empty>
      </>
    );

  const s = data.sessions;
  const done = s.filter((x) => x.completed).length;
  const live = s.find((x) => x.isLiveNow);
  const next = s.find((x) => !x.completed && x.type === 'RECORDED' && x.hasRecording);
  const todos = [
    ...s.filter((x) => x.dueAt && !x.submission).map((x) => ({ id: x.id, label: `${t('Assignment')} · ${x.title}`, meta: `${t('Due')} ${fmtDate(x.dueAt)}` })),
    ...s.filter((x) => x.completed && x.quizScore === null).map((x) => ({ id: x.id, label: `${t('Quiz')} · ${x.title}`, meta: t('Not taken') })),
  ].slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-mono text-[28px] font-bold tracking-[-0.03em]">{greeting}</h1>
          <p className="mt-1 text-[15px] text-muted">{data.packages.map((p) => p.name).join(' · ')}</p>
        </div>
        {playful && <Badge tone="accent">{done} {t('sessions done')}</Badge>}
      </div>

      <StatsStrip />

      {live && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-(--radius-card) bg-night p-5 text-day">
          <div className="flex flex-col gap-1">
            <Badge tone="live">● {t('Live now')}</Badge>
            <span className="mt-1 text-lg font-bold">{live.title}</span>
            <span className="text-sm text-[#b4b2ac]">{live.instructorName ? `${t('with')} ${live.instructorName}` : live.packageName}</span>
          </div>
          <ButtonLink href={`/live/${live.id}`} variant="onDark">{playful ? t('Jump in') : t('Join class')}</ButtonLink>
        </div>
      )}

      <div className="stagger grid gap-5 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-semibold">{t('Progress')}</h2>
            <span className="font-mono text-sm text-muted">{done}/{s.length}</span>
          </div>
          <Progress value={(done / Math.max(1, s.length)) * 100} />
          {next && (
            <Link href={`/dashboard/sessions/${next.id}`} className="mt-5 flex items-center justify-between rounded-xl bg-(--accent-soft) p-4 hover:brightness-95">
              <span>
                <span className="block text-sm text-muted">{playful ? t('Up next') : t('Continue')}</span>
                <span className="font-semibold">{next.order}. {next.title}</span>
              </span>
              <span className="font-semibold text-(--accent)">{t('Watch')} →</span>
            </Link>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">{t('To do')}</h2>
          {todos.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {todos.map((td) => (
                <li key={td.label}>
                  <Link href={`/dashboard/sessions/${td.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2 hover:text-(--accent)">
                    <span className="text-[15px]">{td.label}</span>
                    <span className="shrink-0 text-sm text-muted">{td.meta}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] text-muted">{playful ? t('All done. Nice work!') : t('Nothing due.')}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
