'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, openSignedUrl } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, Button, Card, Empty, Input, PageTitle, cx } from '@/components/ui';

type Sub = {
  id: string; text: string | null; fileName: string | null; fileKey: string | null; status: 'SUBMITTED' | 'GRADED'; score: number | null; feedback: string | null; submittedAt: string;
  student: { name: string };
  assignment: { title: string; maxScore: number; session: { id: string; title: string; package: { name: string } } };
};

export default function GradingPage() {
  const [status, setStatus] = useState<'SUBMITTED' | 'GRADED'>('SUBMITTED');
  const { data, isLoading } = useQuery({ queryKey: ['submissions', status], queryFn: () => api<Sub[]>(`/submissions?status=${status}`) });

  return (
    <>
      <PageTitle title="Grading" sub="Assignments from your sessions" action={
        <div className="flex rounded-full border border-line bg-white p-1">
          {(['SUBMITTED', 'GRADED'] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={cx('min-h-9 rounded-full px-4 text-sm font-semibold', status === s ? 'bg-ink text-paper' : 'text-muted')}>
              {s === 'SUBMITTED' ? 'To grade' : 'Graded'}
            </button>
          ))}
        </div>
      } />
      {isLoading ? null : !data?.length ? <Empty>{status === 'SUBMITTED' ? 'Nothing waiting. All caught up.' : 'No graded work yet.'}</Empty> : (
        <div className="flex flex-col gap-4">{data.map((s) => <GradeRow key={s.id} s={s} />)}</div>
      )}
    </>
  );
}

function GradeRow({ s }: { s: Sub }) {
  const qc = useQueryClient();
  const [score, setScore] = useState(s.score?.toString() ?? '');
  const [feedback, setFeedback] = useState(s.feedback ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <Card className="grid gap-4 md:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{s.student.name}</span>
          <span className="text-sm text-muted">· {s.assignment.session.package.name} · {s.assignment.session.title}</span>
        </div>
        <p className="mt-1 text-sm text-muted">{s.assignment.title} · submitted {fmtDate(s.submittedAt, true)}</p>
        {s.text && <p className="mt-3 rounded-lg bg-paper p-3 text-[15px] whitespace-pre-line">{s.text}</p>}
        {s.fileKey && <Button variant="secondary" className="mt-3" onClick={() => openSignedUrl(`/submissions/${s.id}/file`)}>Open {s.fileName ?? 'file'}</Button>}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Input type="number" min={0} max={s.assignment.maxScore} value={score} onChange={(e) => setScore(e.target.value)} className="w-24" aria-label="Score" />
          <span className="text-sm text-muted">/ {s.assignment.maxScore}</span>
          {s.status === 'GRADED' && <Badge tone="good">Graded</Badge>}
        </div>
        <Input placeholder="Feedback for the student" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button disabled={busy || score === ''} onClick={async () => {
          setBusy(true); setError('');
          try {
            await api(`/submissions/${s.id}/grade`, { method: 'PATCH', json: { score: Number(score), feedback: feedback || undefined } });
            qc.invalidateQueries({ queryKey: ['submissions'] });
          } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}>{s.status === 'GRADED' ? 'Update grade' : 'Return grade'}</Button>
      </div>
    </Card>
  );
}
