'use client';
import Link from 'next/link';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, Card, Empty, PageTitle, Progress } from '@/components/ui';
import { TRACK_LABEL, type Track } from '@/lib/types';

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

const ASSIGN_BADGE = {
  GRADED: (a: { score: number | null; maxScore: number }) => <Badge tone="good">{a.score} / {a.maxScore}</Badge>,
  SUBMITTED: () => <Badge tone="warn">Waiting for grade</Badge>,
  MISSING: () => <Badge tone="bad">Missing</Badge>,
  TODO: () => <Badge>To do</Badge>,
};

export default function ChildProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error } = useQuery({ queryKey: ['child-progress', id], queryFn: () => api<Report>(`/parents/children/${id}/progress`) });
  if (isLoading) return <div className="h-40 animate-pulse rounded-(--radius-card) bg-black/5" />;
  if (error || !data) return <Empty>We couldn't find that child. <Link href="/dashboard" className="font-semibold underline">Back to your children</Link></Empty>;

  return (
    <>
      <Link href="/dashboard" className="mb-3 inline-block text-sm font-semibold text-muted hover:text-ink">← Your children</Link>
      <PageTitle title={data.child.name} sub={`${TRACK_LABEL[data.child.track]} · ${data.child.email}`} />
      {!data.packages.length ? <Empty>No active package yet. <Link href="/dashboard/catalog" className="font-semibold underline">Browse packages</Link></Empty> : (
        <div className="flex flex-col gap-8">
          {data.packages.map((p) => (
            <section key={p.id}>
              <Card className="mb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="font-mono text-lg font-bold">{p.name}</h2>
                  <span className="text-sm text-muted">{p.billing === 'MONTHLY' && p.activeUntil ? `Paid until ${fmtDate(p.activeUntil)}` : 'Lifetime access'}</span>
                </div>
                <div className="mt-3 mb-1.5 flex justify-between text-sm"><span>Sessions completed</span><span className="font-mono">{p.sessionsCompleted}/{p.sessionsTotal}</span></div>
                <Progress value={p.sessionsTotal ? (p.sessionsCompleted / p.sessionsTotal) * 100 : 0} />
                <p className="mt-2 text-sm text-muted">Attended {p.liveAttended} live class{p.liveAttended === 1 ? '' : 'es'}</p>
              </Card>
              <Card className="overflow-x-auto p-0">
                <table className="w-full min-w-[720px] text-left text-[15px]">
                  <thead className="border-b border-line text-sm text-muted"><tr>
                    <th className="px-4 py-3 font-semibold">Session</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Quiz</th><th className="px-4 py-3 font-semibold">Assignment</th>
                  </tr></thead>
                  <tbody>
                    {p.sessions.map((s) => (
                      <tr key={s.id} className="border-b border-line align-top last:border-0">
                        <td className="px-4 py-3"><div className="font-semibold">{s.order}. {s.title}</div><div className="text-sm text-muted">{s.type === 'LIVE' ? `Live${s.startsAt ? ` · ${fmtDate(s.startsAt, true)}` : ''}` : 'Recorded'}</div></td>
                        <td className="px-4 py-3">
                          {s.completed ? <Badge tone="good">Completed</Badge> : s.minutesWatched > 0 ? <Badge tone="warn">In progress</Badge> : <Badge>Not started</Badge>}
                          {s.type === 'LIVE' && <div className="mt-1 text-sm text-muted">{s.attendedLive ? 'Attended live' : 'Not attended'}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm">{s.quiz ? (s.quiz.bestScore === null ? <Badge>Not taken</Badge> : <><Badge tone={s.quiz.bestScore >= s.quiz.passScore ? 'good' : 'warn'}>{s.quiz.bestScore}%</Badge><div className="mt-1 text-muted">{s.quiz.attempts} attempt{s.quiz.attempts === 1 ? '' : 's'}</div></>) : '—'}</td>
                        <td className="px-4 py-3 text-sm">
                          {s.assignment ? (<>{ASSIGN_BADGE[s.assignment.state](s.assignment)}<div className="mt-1 text-muted">{s.assignment.title}{s.assignment.dueAt ? ` · due ${fmtDate(s.assignment.dueAt)}` : ''}</div>{s.assignment.feedback && <div className="mt-1">“{s.assignment.feedback}”</div>}</>) : '—'}
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
