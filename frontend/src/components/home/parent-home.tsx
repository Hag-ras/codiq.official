'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, Button, ButtonLink, Card, Empty, Field, Input, PageTitle, Progress } from '@/components/ui';
import { TRACK_LABEL, type Track } from '@/lib/types';
import { useT } from '@/components/i18n-provider';

type Child = {
  id: string; name: string; email: string; track: Track;
  packages: { id: string; name: string; billing: string; activeUntil: string | null }[];
  sessionsTotal: number; sessionsCompleted: number; liveAttended: number;
  recentQuizzes: { score: number; createdAt: string; quiz: { title: string } }[];
  recentSubmissions: { status: string; score: number | null; assignment: { title: string; maxScore: number } }[];
  nextLive: { id: string; title: string; startsAt: string } | null;
};

export function ParentHome() {
  const t = useT();
  const { data, isLoading } = useQuery({ queryKey: ['children'], queryFn: () => api<Child[]>('/parents/children') });
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageTitle title={t('Your children')} sub={t('Progress, quiz scores and upcoming classes')} action={<Button variant="secondary" onClick={() => setAdding((v) => !v)}>{t('Link a child')}</Button>} />
      {adding && <LinkChild onDone={() => setAdding(false)} />}
      <PendingRequests />
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-black/5" />
      ) : !data?.length ? (
        <Empty>{t("Link your child's Codiq student account to buy packages for them and follow their progress. They need to sign up first.")}</Empty>
      ) : (
        <div className="stagger grid gap-5 md:grid-cols-2">
          {data.map((c) => (
            <Card key={c.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold"><Link href={`/dashboard/children/${c.id}`} className="hover:underline">{c.name}</Link></h2>
                  <p className="text-sm text-muted">{TRACK_LABEL[c.track]} · {c.packages.map((p) => p.name).join(', ') || t('No package yet')}</p>
                </div>
                {!c.packages.length && <ButtonLink href="/pricing" variant="secondary">{t('Buy')}</ButtonLink>}
              </div>
              {c.sessionsTotal > 0 && (
                <div>
                  <div className="mb-1.5 flex justify-between text-sm"><span>{t('Sessions completed')}</span><span className="font-mono">{c.sessionsCompleted}/{c.sessionsTotal}</span></div>
                  <Progress value={(c.sessionsCompleted / c.sessionsTotal) * 100} />
                  <p className="mt-2 text-sm text-muted">{t('Attended {n} live classes', { n: c.liveAttended })}</p>
                </div>
              )}
              {c.packages.length > 0 && <ButtonLink href={`/dashboard/children/${c.id}`} variant="secondary" className="self-start">{t('Full progress report')}</ButtonLink>}
              {c.nextLive && <p className="rounded-lg bg-paper px-3 py-2 text-sm">{t('Next live class:')} <b>{c.nextLive.title}</b>, {fmtDate(c.nextLive.startsAt, true)}</p>}
              {(c.recentQuizzes.length > 0 || c.recentSubmissions.length > 0) && (
                <ul className="flex flex-col divide-y divide-line border-t border-line text-sm">
                  {c.recentQuizzes.slice(0, 3).map((q, i) => (
                    <li key={`q${i}`} className="flex justify-between py-2"><span>{q.quiz.title}</span><Badge tone={q.score >= 60 ? 'good' : 'warn'}>{q.score}%</Badge></li>
                  ))}
                  {c.recentSubmissions.slice(0, 3).map((s, i) => (
                    <li key={`s${i}`} className="flex justify-between py-2">
                      <span>{s.assignment.title}</span>
                      {s.status === 'GRADED' ? <Badge tone="good">{s.score}/{s.assignment.maxScore}</Badge> : <Badge>{t('Waiting for grade')}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
      <p className="mt-6 text-sm text-muted">{t('Need to pay or renew? Go to')} <Link href="/dashboard/billing" className="underline">{t('Billing')}</Link>.</p>
    </>
  );
}

type LinkRequest = { id: string; status: 'PENDING' | 'DECLINED'; student: { name: string; email: string } };

function LinkChild({ onDone }: { onDone: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const [guardian, setGuardian] = useState(false);

  return (
    <Card className="mb-6">
      <p className="mb-4 text-[15px] text-[#4a4945]">{t('Your child needs their own Codiq student account first. Enter the email they signed up with. They will see your request in their dashboard, and you can follow their progress once they accept.')}</p>
      <form
        className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault(); setError(''); setSent('');
          try {
            const r = await api<{ studentName: string }>('/parents/children', { method: 'POST', json: { email, confirmGuardian: guardian } });
            setSent(t('Request sent to {name}. They need to accept it from their dashboard.', { name: r.studentName }));
            setEmail('');
            await qc.invalidateQueries({ queryKey: ['link-requests'] });
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <div className="flex-1"><Field label={t("Child's email")}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field></div>
        <div className="flex gap-2"><Button type="submit" disabled={!guardian}>{t('Send request')}</Button><Button type="button" variant="ghost" onClick={onDone}>{t('Close')}</Button></div>
        <label className="flex basis-full items-start gap-2.5 text-sm leading-relaxed sm:order-last">
          <input type="checkbox" className="mt-1 size-4 shrink-0 accent-(--color-clay)" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} />
          <span>{t("I'm this child's parent or legal guardian, and I agree to the")} <Link href="/privacy" target="_blank" className="font-semibold underline">{t('Privacy Policy')}</Link>.</span>
        </label>
      </form>
      {error && <p role="alert" className="mt-3 rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger">{error}</p>}
      {sent && <p role="status" className="mt-3 rounded-lg bg-[#e1eee6] px-3 py-2 text-sm text-[#2f6449]">{sent}</p>}
    </Card>
  );
}

function PendingRequests() {
  const t = useT();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['link-requests'], queryFn: () => api<LinkRequest[]>('/parents/children/requests') });
  if (!data?.length) return null;
  return (
    <div className="mb-6 flex flex-col gap-2">
      {data.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 text-[15px]">
          <span><b>{r.student.name}</b> <span className="text-muted">({r.student.email})</span> · {r.status === 'PENDING' ? t('waiting for them to accept') : t('declined your request')}</span>
          <Button variant="ghost" className="min-h-9 py-1.5" onClick={async () => { await api(`/parents/children/requests/${r.id}`, { method: 'DELETE' }); qc.invalidateQueries({ queryKey: ['link-requests'] }); }}>{r.status === 'PENDING' ? t('Cancel') : t('Dismiss')}</Button>
        </div>
      ))}
    </div>
  );
}
