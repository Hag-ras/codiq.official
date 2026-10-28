'use client';
import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, openSignedUrl, uploadFile } from '@/lib/api';
import { fmtDate, fmtSize } from '@/lib/format';
import { Badge, Button, ButtonLink, Card, Empty, Textarea, cx } from '@/components/ui';
import type { SessionDetail } from '@/lib/types';
import { YouTubePlayer } from '@/components/youtube-player';

type Tab = 'video' | 'materials' | 'assignment' | 'quiz';

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: s, error } = useQuery({ queryKey: ['session', id], queryFn: () => api<SessionDetail>(`/sessions/${id}`) });
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<{ role: string }>('/auth/me') });
  const [tab, setTab] = useState<Tab>('video');
  const isStudent = me?.role === 'STUDENT';

  if (error) return <Empty>{(error as Error).message}</Empty>;
  if (!s) return <div className="h-60 animate-pulse rounded-xl bg-black/5" />;

  const tabs: [Tab, string][] = [
    ['video', s.type === 'LIVE' && !s.hasRecording ? 'Live class' : 'Recording'],
    ['materials', `Materials (${s.materials.length})`],
    ...(s.assignment ? [['assignment', 'Assignment'] as [Tab, string]] : []),
    ...(s.quiz ? [['quiz', 'Quiz'] as [Tab, string]] : []),
  ];

  return (
    <>
      <Link href="/dashboard/sessions" className="text-sm font-semibold text-muted hover:text-ink">← {s.package.name}</Link>
      <h1 className="mt-2 font-mono text-[26px] font-bold tracking-[-0.03em]">{s.order}. {s.title}</h1>
      <p className="mt-1 text-[15px] text-muted">
        {s.type === 'LIVE' ? `Live · ${fmtDate(s.startsAt, true)}` : 'Recorded'} · {s.durationMin} min{s.instructor ? ` · ${s.instructor.name}` : ''}
      </p>

      <div className="mt-6 mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={cx('-mb-px min-h-11 shrink-0 border-b-2 px-3 text-[15px] font-semibold', tab === t ? 'border-(--accent) text-ink' : 'border-transparent text-muted')}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'video' && <VideoTab s={s} isStudent={isStudent} />}
      {tab === 'materials' && (s.materials.length ? (
        <ul className="overflow-hidden rounded-(--radius-card) border border-line bg-white">
          {s.materials.map((m) => (
            <li key={m.id} className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-4 last:border-0">
              <span className="min-w-0"><span className="block truncate font-semibold">{m.name}</span><span className="text-sm text-muted">{fmtSize(m.sizeBytes)}</span></span>
              <Button variant="secondary" onClick={() => openSignedUrl(`/materials/${m.id}/download`)}>Download</Button>
            </li>
          ))}
        </ul>
      ) : <Empty>No materials for this session.</Empty>)}
      {tab === 'assignment' && s.assignment && <AssignmentTab s={s} isStudent={isStudent} />}
      {tab === 'quiz' && s.quiz && <QuizTab s={s} isStudent={isStudent} />}
    </>
  );
}

function VideoTab({ s, isStudent }: { s: SessionDetail; isStudent: boolean }) {
  const { data } = useQuery({ queryKey: ['recording', s.id], queryFn: () => api<{ url?: string; youtubeId?: string }>(`/sessions/${s.id}/recording`), enabled: s.hasRecording, staleTime: 50 * 60_000 });
  const lastSent = useRef(0);

  if (!s.hasRecording)
    return (
      <Card className="flex flex-col items-start gap-3">
        {s.isLiveNow ? <Badge tone="live">● Live now</Badge> : <Badge>{fmtDate(s.startsAt, true)}</Badge>}
        <p className="text-[15px] text-[#4a4945]">
          {s.isLiveNow ? 'The class is running. Join with camera and mic, or just watch and chat.' : 'The classroom opens 15 minutes before start. The recording will appear here after class.'}
        </p>
        {s.isLiveNow && <ButtonLink href={`/live/${s.id}`} variant="accent">Join class</ButtonLink>}
      </Card>
    );

  const report = (el: HTMLVideoElement, completed = false) => {
    if (!isStudent) return;
    const t = Math.floor(el.currentTime);
    if (!completed && t - lastSent.current < 15) return;
    lastSent.current = t;
    api(`/sessions/${s.id}/progress`, { method: 'POST', json: { watchedSeconds: t, completed: completed || el.currentTime / el.duration > 0.9 } }).catch(() => null);
  };

  return (
    <div className="overflow-hidden rounded-(--radius-card) bg-night">
      {data?.youtubeId ? (
        <YouTubePlayer videoId={data.youtubeId} onProgress={(t, done) => { api(`/sessions/${s.id}/progress`, { method: 'POST', json: { watchedSeconds: t, completed: done } }).catch(() => null); }} />
      ) : data?.url ? (
        <video src={data.url} controls playsInline controlsList="nodownload" className="aspect-video w-full"
          onTimeUpdate={(e) => report(e.currentTarget)} onEnded={(e) => report(e.currentTarget, true)} />
      ) : (
        <div className="aspect-video w-full animate-pulse" />
      )}
    </div>
  );
}

function AssignmentTab({ s, isStudent }: { s: SessionDetail; isStudent: boolean }) {
  const a = s.assignment!;
  const sub = a.mySubmission;
  const qc = useQueryClient();
  const [text, setText] = useState(sub?.text ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <div className="grid gap-5 md:grid-cols-[1.2fr_1fr]">
      <Card>
        <h2 className="text-lg font-bold">{a.title}</h2>
        <p className="mt-1 text-sm text-muted">{a.dueAt ? `Due ${fmtDate(a.dueAt, true)}` : 'No deadline'} · {a.maxScore} points</p>
        <p className="mt-4 text-[15px] leading-relaxed whitespace-pre-line text-[#4a4945]">{a.brief}</p>
      </Card>
      {isStudent && (
        <Card className="flex flex-col gap-4">
          {sub?.status === 'GRADED' ? (
            <>
              <div className="flex items-center justify-between"><h3 className="font-semibold">Graded</h3><Badge tone="good">{sub.score}/{a.maxScore}</Badge></div>
              {sub.feedback && <p className="rounded-lg bg-paper p-3 text-[15px]">{sub.feedback}</p>}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Your answer</h3>
                {sub && <Badge tone="accent">Submitted {fmtDate(sub.submittedAt)}</Badge>}
              </div>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your answer or notes for your teacher" />
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
              {sub?.fileName && !file && <p className="text-sm text-muted">Attached: {sub.fileName}</p>}
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button variant="accent" disabled={busy || (!text.trim() && !file && !sub?.fileName)}
                onClick={async () => {
                  setBusy(true); setError('');
                  try {
                    const up = file ? await uploadFile(file, 'submission') : null;
                    await api(`/sessions/${s.id}/submissions`, { method: 'POST', json: { text, ...(up ? { fileKey: up.key, fileName: up.name } : {}) } });
                    await qc.invalidateQueries({ queryKey: ['session', s.id] });
                    setFile(null);
                  } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
                }}>
                {busy ? 'Submitting…' : sub ? 'Resubmit' : 'Submit'}
              </Button>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

function QuizTab({ s, isStudent }: { s: SessionDetail; isStudent: boolean }) {
  const q = s.quiz!;
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<number[]>(() => q.lastAttempt?.answers ?? Array(q.questions.length).fill(-1));
  const [result, setResult] = useState<{ score: number; passed: boolean; correct: number[] } | null>(
    q.lastAttempt ? { score: q.lastAttempt.score, passed: q.lastAttempt.score >= q.passScore, correct: q.questions.map((x) => x.correctIndex ?? -1) } : null,
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!isStudent) setResult({ score: 0, passed: true, correct: q.questions.map((x) => x.correctIndex ?? -1) }); }, [isStudent, q]);
  const locked = !!result;

  return (
    <div className="flex flex-col gap-4">
      {result && isStudent && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-3xl font-bold">{result.score}%</div>
            <div className="text-sm text-muted">{result.passed ? 'Passed' : `Pass mark is ${q.passScore}%`}</div>
          </div>
          <Button variant="secondary" onClick={() => { setResult(null); setAnswers(Array(q.questions.length).fill(-1)); }}>Try again</Button>
        </Card>
      )}
      {q.questions.map((question, qi) => (
        <Card key={question.id}>
          <p className="mb-3 font-semibold"><span className="mr-2 font-mono text-muted">{qi + 1}.</span>{question.text}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {question.options.map((o, oi) => {
              const picked = answers[qi] === oi;
              const right = locked && result!.correct[qi] === oi;
              const wrong = locked && picked && !right;
              return (
                <button key={oi} disabled={locked} onClick={() => setAnswers(answers.map((a, i) => (i === qi ? oi : a)))}
                  className={cx('flex min-h-12 items-center gap-3 rounded-xl border px-3 text-left text-[15px] transition',
                    right ? 'border-[#3d7a5a] bg-[#e1eee6]' : wrong ? 'border-danger bg-[#f7e1df]' : picked ? 'border-(--accent) bg-(--accent-soft)' : 'border-line hover:border-[#c9c3b8]')}>
                  <span className="font-mono text-sm text-muted">{'ABCDEF'[oi]}</span>{o}
                </button>
              );
            })}
          </div>
        </Card>
      ))}
      {isStudent && !locked && (
        <Button variant="accent" disabled={busy || answers.includes(-1)} className="self-start"
          onClick={async () => {
            setBusy(true);
            try {
              setResult(await api(`/sessions/${s.id}/quiz/attempts`, { method: 'POST', json: { answers } }));
              qc.invalidateQueries({ queryKey: ['sessions', 'mine'] });
            } finally { setBusy(false); }
          }}>
          Submit quiz
        </Button>
      )}
    </div>
  );
}
