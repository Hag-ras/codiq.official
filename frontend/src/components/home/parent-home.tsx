'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, Button, ButtonLink, Card, Empty, Field, Input, PageTitle, Progress, Select } from '@/components/ui';
import { TRACK_LABEL, type Track } from '@/lib/types';

type Child = {
  id: string; name: string; email: string; track: Track;
  packages: { id: string; name: string; billing: string; activeUntil: string | null }[];
  sessionsTotal: number; sessionsCompleted: number; liveAttended: number;
  recentQuizzes: { score: number; createdAt: string; quiz: { title: string } }[];
  recentSubmissions: { status: string; score: number | null; assignment: { title: string; maxScore: number } }[];
  nextLive: { id: string; title: string; startsAt: string } | null;
};

export function ParentHome() {
  const { data, isLoading } = useQuery({ queryKey: ['children'], queryFn: () => api<Child[]>('/parents/children') });
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageTitle title="Your children" sub="Progress, quiz scores and upcoming classes" action={<Button variant="secondary" onClick={() => setAdding((v) => !v)}>Add child</Button>} />
      {adding && <AddChild onDone={() => setAdding(false)} />}
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-black/5" />
      ) : !data?.length ? (
        <Empty>Add your child's account to buy a package for them and follow their progress.</Empty>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {data.map((c) => (
            <Card key={c.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{c.name}</h2>
                  <p className="text-sm text-muted">{TRACK_LABEL[c.track]} · {c.packages.map((p) => p.name).join(', ') || 'No package yet'}</p>
                </div>
                {!c.packages.length && <ButtonLink href="/pricing" variant="secondary">Buy</ButtonLink>}
              </div>
              {c.sessionsTotal > 0 && (
                <div>
                  <div className="mb-1.5 flex justify-between text-sm"><span>Sessions completed</span><span className="font-mono">{c.sessionsCompleted}/{c.sessionsTotal}</span></div>
                  <Progress value={(c.sessionsCompleted / c.sessionsTotal) * 100} />
                  <p className="mt-2 text-sm text-muted">Attended {c.liveAttended} live classes</p>
                </div>
              )}
              {c.nextLive && <p className="rounded-lg bg-paper px-3 py-2 text-sm">Next live class: <b>{c.nextLive.title}</b>, {fmtDate(c.nextLive.startsAt, true)}</p>}
              {(c.recentQuizzes.length > 0 || c.recentSubmissions.length > 0) && (
                <ul className="flex flex-col divide-y divide-line border-t border-line text-sm">
                  {c.recentQuizzes.slice(0, 3).map((q, i) => (
                    <li key={`q${i}`} className="flex justify-between py-2"><span>{q.quiz.title}</span><Badge tone={q.score >= 60 ? 'good' : 'warn'}>{q.score}%</Badge></li>
                  ))}
                  {c.recentSubmissions.slice(0, 3).map((s, i) => (
                    <li key={`s${i}`} className="flex justify-between py-2">
                      <span>{s.assignment.title}</span>
                      {s.status === 'GRADED' ? <Badge tone="good">{s.score}/{s.assignment.maxScore}</Badge> : <Badge>Waiting for grade</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
      <p className="mt-6 text-sm text-muted">Need to pay or renew? Go to <Link href="/dashboard/billing" className="underline">Billing</Link>.</p>
    </>
  );
}

function AddChild({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ name: '', email: '', password: '', track: 'KIDS' as Track });
  const [error, setError] = useState('');
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  return (
    <Card className="mb-6">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/parents/children', { method: 'POST', json: v });
            await qc.invalidateQueries({ queryKey: ['children'] });
            onDone();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <Field label="Child's name"><Input value={v.name} onChange={set('name')} required /></Field>
        <Field label="Track">
          <Select value={v.track} onChange={set('track')}>
            {(['KIDS', 'SCHOOL', 'COLLEGE'] as const).map((t) => <option key={t} value={t}>{TRACK_LABEL[t]}</option>)}
          </Select>
        </Field>
        <Field label="Login email" hint="Your child logs in with this"><Input type="email" value={v.email} onChange={set('email')} required /></Field>
        <Field label="Password"><Input type="password" minLength={8} value={v.password} onChange={set('password')} required /></Field>
        {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}
        <div className="flex gap-2 sm:col-span-2"><Button type="submit">Add child</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
      </form>
    </Card>
  );
}
