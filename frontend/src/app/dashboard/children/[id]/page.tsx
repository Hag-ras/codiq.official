'use client';
import Link from 'next/link';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, Card, Empty, PageTitle, Progress } from '@/components/ui';
import { TRACK_LABEL, type Track } from '@/lib/types';
import { useT } from '@/components/i18n-provider';
import { StatsStrip } from '@/components/stats-strip';
import { CertificateButton, useCertificates } from '@/components/certificate-button';

type Report = {
  child: { id: string; name: string; email: string; track: Track };
  packages: {
    id: string; name: string; billing: string; activeUntil: string | null; sessionsTotal: number; sessionsCompleted: number; liveAttended: number;
    sessions: {
      id: string; order: number; title: string; type: string; startsAt: string | null; completed: boolean; attendedLive: boolean; minutesWatched: number;
      quiz: { title: string; passScore: number; attempts: number; bestScore: number | null } | null;
      assignment: { title: string; dueAt: string | null; maxScore: number; state: 'TODO' | 'SUBMITTED' | 'GRADED' | 'MISSING'; score: number | null; feedback: string | null } | null;
    }[];
  }[];
};

const assignBadge = (t: ReturnType<typeof useT>, a: { state: 'TODO' | 'SUBMITTED' | 'GRADED' | 'MISSING'; score: number | null; maxScore: number }) =>
  a.state === 'GRADED' ? <Badge tone="good">{a.score} / {a.maxScore}</Badge>
  : a.state === 'SUBMITTED' ? <Badge tone="warn">{t('Waiting for grade')}</Badge>
  : a.state === 'MISSING' ? <Badge tone="bad">{t('Missing')}</Badge> : <Badge>{t('To do')}</Badge>;

export default function ChildProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const { data: certs } = useCertificates(id);
  const { data, isLoading, error } = useQuery({ queryKey: ['child-progress', id], queryFn: () => api<Report>(`/parents/children/${id}/progress`) });
  if (isLoading) return <div className="h-40 animate-pulse rounded-(--radius-card) bg-black/5" />;
  if (error || !data) return <Empty>{t("We couldn't find that child.")} <Link href="/dashboard" className="font-semibold underline">{t('Back to your children')}</Link></Empty>;

  return (
    <>
      <Link href="/dashboard" className="mb-3 inline-block text-sm font-semibold text-muted hover:text-ink">← {t('Your children')}</Link>
      <PageTitle title={data.child.name} sub={`${t(TRACK_LABEL[data.child.track])} · ${data.child.email}`} />
      <div className="mb-6"><StatsStrip childId={id} /></div>
      {!data.packages.length ? <Empty>{t('No active package yet.')} <Link href="/dashboard/catalog" className="font-semibold underline">{t('Browse packages')}</Link></Empty> : (
        <div className="flex flex-col gap-8">
          {data.packages.map((p) => (
            <section key={p.id}>
              <Card className="mb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="font-mono text-lg font-bold">{p.name}</h2>
                  <span className="text-sm text-muted">{p.billing === 'MONTHLY' && p.activeUntil ? t('Paid until {date}', { date: fmtDate(p.activeUntil) }) : t('Lifetime access')}</span>
                </div>
                <div className="mt-3 mb-1.5 flex justify-between text-sm"><span>{t('Sessions completed')}</span><span className="font-mono">{p.sessionsCompleted}/{p.sessionsTotal}</span></div>
                <Progress value={p.sessionsTotal ? (p.sessionsCompleted / p.sessionsTotal) * 100 : 0} />
                <p className="mt-2 text-sm text-muted">{t('Attended {n} live classes', { n: p.liveAttended })}</p>
                <div className="mt-3"><CertificateButton row={certs?.find((r) => r.packageId === p.id)} childId={id} /></div>
              </Card>
              <Card className="overflow-x-auto p-0">
                <table className="w-full min-w-[720px] text-left text-[15px]">
                  <thead className="border-b border-line text-sm text-muted"><tr>
                    <th className="px-4 py-3 font-semibold">{t('Session')}</th><th className="px-4 py-3 font-semibold">{t('Status')}</th><th className="px-4 py-3 font-semibold">{t('Quiz')}</th><th className="px-4 py-3 font-semibold">{t('Assignment')}</th>
                  </tr></thead>
                  <tbody>
                    {p.sessions.map((s) => (
                      <tr key={s.id} className="border-b border-line align-top last:border-0">
                        <td className="px-4 py-3"><div className="font-semibold">{s.order}. {s.title}</div><div className="text-sm text-muted">{s.type === 'LIVE' ? `${t('Live')}${s.startsAt ? ` · ${fmtDate(s.startsAt, true)}` : ''}` : t('Recorded')}</div></td>
                        <td className="px-4 py-3">
                          {s.completed ? <Badge tone="good">{t('Completed')}</Badge> : s.minutesWatched > 0 ? <Badge tone="warn">{t('In progress')}</Badge> : <Badge>{t('Not started')}</Badge>}
                          {s.type === 'LIVE' && <div className="mt-1 text-sm text-muted">{s.attendedLive ? t('Attended live') : t('Not attended')}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm">{s.quiz ? (s.quiz.bestScore === null ? <Badge>{t('Not taken')}</Badge> : <><Badge tone={s.quiz.bestScore >= s.quiz.passScore ? 'good' : 'warn'}>{s.quiz.bestScore}%</Badge><div className="mt-1 text-muted">{t('{n} attempts', { n: s.quiz.attempts })}</div></>) : '—'}</td>
                        <td className="px-4 py-3 text-sm">
                          {s.assignment ? (<>{assignBadge(t, s.assignment)}<div className="mt-1 text-muted">{s.assignment.title}{s.assignment.dueAt ? ` · ${t('due {date}', { date: fmtDate(s.assignment.dueAt) })}` : ''}</div>{s.assignment.feedback && <div className="mt-1">“{s.assignment.feedback}”</div>}</>) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
