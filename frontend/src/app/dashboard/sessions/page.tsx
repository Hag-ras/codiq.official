'use client';
import Link from 'next/link';
import { useMine } from '@/components/home/student-home';
import { fmtDate } from '@/lib/format';
import { Badge, Empty, PageTitle } from '@/components/ui';
import type { SessionSummary } from '@/lib/types';
import { useT } from '@/components/i18n-provider';

function status(s: SessionSummary, t: ReturnType<typeof useT>) {
  if (s.isLiveNow) return <Badge tone="live">● {t('Live now')}</Badge>;
  if (s.completed) return <Badge tone="good">{t('Done')}</Badge>;
  if (s.type === 'LIVE' && s.startsAt && new Date(s.startsAt) > new Date()) return <Badge>{fmtDate(s.startsAt, true)}</Badge>;
  return <Badge tone="accent">{s.hasRecording ? t('Watch') : t('Recording soon')}</Badge>;
}

export default function SessionsPage() {
  const t = useT();
  const { data, isLoading } = useMine();
  const groups = new Map<string, SessionSummary[]>();
  data?.sessions.forEach((s) => groups.set(s.packageName, [...(groups.get(s.packageName) ?? []), s]));

  return (
    <>
      <PageTitle title={t('Sessions')} sub={t('Recordings, materials, assignments and quizzes')} />
      {isLoading ? null : !groups.size ? (
        <Empty>{t('No sessions yet.')} <Link href="/pricing" className="underline">{t('Browse packages')}</Link>.</Empty>
      ) : (
        [...groups].map(([pkg, list]) => (
          <section key={pkg} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">{pkg}</h2>
            <ul className="overflow-hidden rounded-(--radius-card) border border-line bg-white">
              {list.map((s) => (
                <li key={s.id} className="border-b border-line last:border-0">
                  <Link href={`/dashboard/sessions/${s.id}`} className="grid min-h-16 grid-cols-[36px_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-paper">
                    <span className="font-mono text-sm text-muted">{String(s.order).padStart(2, '0')}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{s.title}</span>
                      <span className="flex flex-wrap gap-x-3 text-sm text-muted">
                        <span>{s.type === 'LIVE' ? t('Live') : t('Recorded')} · {s.durationMin} {t('min')}</span>
                        {s.submission ? <span>{t('Assignment')} {s.submission.status === 'GRADED' ? `${s.submission.score} ${t('pts')}` : t('submitted')}</span> : s.dueAt ? <span>{t('Assignment due {date}', { date: fmtDate(s.dueAt) })}</span> : null}
                        {s.quizScore !== null && <span>{t('Quiz')} {s.quizScore}%</span>}
                      </span>
                    </span>
                    {status(s, t)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
