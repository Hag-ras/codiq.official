'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, uploadFile } from '@/lib/api';
import { fmtSize } from '@/lib/format';
import { Badge, Button, Card, Empty, Field, Input, PageTitle, Select, Textarea, cx } from '@/components/ui';
import { YouTubePlayer } from '@/components/youtube-player';
import type { SessionDetail } from '@/lib/types';

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
const TABS = ['Details', 'Video', 'Materials', 'Assignment', 'Quiz'] as const;
type Tab = (typeof TABS)[number];

export default function EditSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  // The same editor serves admins (/dashboard/admin/...) and instructors editing their own sessions (/dashboard/teach/...)
  const teach = usePathname().startsWith('/dashboard/teach');
  const back = teach ? '/dashboard/sessions' : '/dashboard/admin/sessions';
  const { data: s, isLoading } = useQuery({ queryKey: ['session-edit', id], queryFn: () => api<SessionDetail>(`/sessions/${id}`) });
  const [tab, setTab] = useState<Tab>('Details');
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (TABS.includes(t as Tab)) setTab(t as Tab);
  }, []);
  const refresh = () => qc.invalidateQueries({ queryKey: ['session-edit', id] });

  if (isLoading) return <div className="h-40 animate-pulse rounded-(--radius-card) bg-black/5" />;
  if (!s) return <Empty>Session not found. <Link href={back} className="font-semibold underline">Back to sessions</Link></Empty>;

  const hasVideo = s.hasRecording;
  const counts: Partial<Record<Tab, string>> = {
    Video: hasVideo ? '✓' : '', Materials: s.materials.length ? String(s.materials.length) : '',
    Assignment: s.assignment ? '✓' : '', Quiz: s.quiz ? String(s.quiz.questions.length) : '',
  };

  return (
    <>
      <Link href={back} className="mb-3 inline-block text-sm font-semibold text-muted hover:text-ink">← {teach ? 'My sessions' : 'All sessions'}</Link>
      <PageTitle title={s.title} sub={`${s.package.name} · session ${s.order} · ${s.type === 'LIVE' ? 'live class' : 'recorded'}`}
        action={<Link href={`/dashboard/sessions/${s.id}`} className="text-sm font-semibold hover:underline">View as student →</Link>} />
      <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cx('-mb-px flex min-h-11 items-center gap-2 border-b-2 px-4 text-[15px] font-semibold whitespace-nowrap',
              tab === t ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink')}>
            {t}{counts[t] && <span className="rounded-full bg-accent-soft px-2 font-mono text-xs">{counts[t]}</span>}
          </button>
        ))}
      </div>
      {tab === 'Details' && <DetailsTab s={s} onSaved={refresh} canAssign={!teach} />}
      {tab === 'Video' && <VideoTab s={s} onSaved={refresh} />}
      {tab === 'Materials' && <MaterialsTab s={s} onSaved={refresh} />}
      {tab === 'Assignment' && <AssignmentTab s={s} onSaved={refresh} />}
      {tab === 'Quiz' && <QuizTab s={s} onSaved={refresh} />}
    </>
  );
}

type TabProps = { s: SessionDetail; onSaved: () => void };

function Notice({ error, ok }: { error: string; ok: string }) {
  if (error) return <p className="rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger">{error}</p>;
  if (ok) return <p className="rounded-lg bg-[#e4f0e9] px-3 py-2 text-sm text-[#2f6148]">{ok}</p>;
  return null;
}

function useSave(onSaved: () => void) {
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setError(''); setOk(''); setBusy(true);
    try { await fn(); setOk(done); onSaved(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return { error, ok, busy, run };
}

function DetailsTab({ s, onSaved, canAssign }: TabProps & { canAssign: boolean }) {
  const { data: staff } = useQuery({ queryKey: ['users', 'INSTRUCTOR'], queryFn: () => api<{ id: string; name: string }[]>('/users?role=INSTRUCTOR'), enabled: canAssign });
  const [v, setV] = useState({ title: s.title, description: s.description ?? '', startsAt: toLocal(s.startsAt), durationMin: String(s.durationMin), instructorId: s.instructor?.id ?? '' });
  const { error, ok, busy, run } = useSave(onSaved);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Card>
      <form className="grid max-w-2xl gap-4 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        run(() => api(`/sessions/${s.id}`, { method: 'PATCH', json: {
          title: v.title, description: v.description,
          ...(s.type === 'LIVE' && v.startsAt ? { startsAt: new Date(v.startsAt).toISOString() } : {}),
          durationMin: Number(v.durationMin), ...(canAssign && v.instructorId ? { instructorId: v.instructorId } : {}),
        } }), 'Details saved');
      }}>
        <div className="sm:col-span-2"><Field label="Title"><Input value={v.title} onChange={set('title')} minLength={2} required /></Field></div>
        <div className="sm:col-span-2"><Field label="Description"><Textarea rows={3} value={v.description} onChange={set('description')} /></Field></div>
        {s.type === 'LIVE' && <Field label="Starts at"><Input type="datetime-local" value={v.startsAt} onChange={set('startsAt')} required /></Field>}
        <Field label="Duration (minutes)"><Input type="number" min={5} value={v.durationMin} onChange={set('durationMin')} required /></Field>
        {canAssign && <Field label="Instructor"><Select value={v.instructorId} onChange={set('instructorId')}><option value="">Not assigned</option>{staff?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></Field>}
        <div className="sm:col-span-2"><Notice error={error} ok={ok} /></div>
        <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</Button></div>
      </form>
    </Card>
  );
}

function VideoTab({ s, onSaved }: TabProps) {
  const [url, setUrl] = useState(s.youtubeId ? `https://youtu.be/${s.youtubeId}` : '');
  const [uploading, setUploading] = useState(false);
  const { error, ok, busy, run } = useSave(onSaved);
  const id = url.trim() ? /^[A-Za-z0-9_-]{11}$/.test(url.trim()) ? url.trim() : /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/.exec(url)?.[1] : null;
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">YouTube lecture</h2>
        <Field label="YouTube link" hint="Upload the lecture to YouTube as Unlisted, then paste the link. Watch, youtu.be, shorts and live links all work. Leave empty and save to remove it.">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/..." />
        </Field>
        {id && (
          <div className="overflow-hidden rounded-xl border border-line"><YouTubePlayer videoId={id} /></div>
        )}
        {url.trim() && !id && <p className="text-sm text-danger">That does not look like a YouTube link.</p>}
        <Notice error={error} ok={ok} />
        <div><Button disabled={busy || (!!url.trim() && !id)} onClick={() => run(() => api(`/sessions/${s.id}`, { method: 'PATCH', json: { youtubeUrl: url } }), url.trim() ? 'Video saved' : 'Video removed')}>{busy ? 'Saving…' : 'Save video'}</Button></div>
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Or upload a video file</h2>
        <Input type="file" accept="video/*" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setUploading(true);
          await run(async () => { const r = await uploadFile(f, 'recording'); await api(`/sessions/${s.id}`, { method: 'PATCH', json: { videoKey: r.key } }); }, 'Video file uploaded');
          setUploading(false);
        }} />
        {uploading && <p className="text-sm text-muted">Uploading video…</p>}
        <p className="text-sm text-muted">{s.type === 'LIVE' ? 'Live classes are recorded automatically; use this to replace the recording.' : 'A YouTube link takes priority over an uploaded file.'}</p>
      </Card>
    </div>
  );
}

function MaterialsTab({ s, onSaved }: TabProps) {
  const [uploading, setUploading] = useState(false);
  const { error, ok, run } = useSave(onSaved);
  return (
    <Card className="flex max-w-2xl flex-col gap-4">
      <div>
        <h2 className="font-semibold">Presentations, PDFs and files</h2>
        <p className="text-sm text-muted">Slides, worksheets and anything else students should download for this session.</p>
      </div>
      <Input type="file" multiple onChange={async (e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (!files.length) return;
        setUploading(true);
        await run(async () => {
          for (const f of files) {
            const r = await uploadFile(f, 'material');
            await api(`/sessions/${s.id}/materials`, { method: 'POST', json: { name: r.name, fileKey: r.key, sizeBytes: r.size, mimeType: r.type } });
          }
        }, files.length === 1 ? 'File added' : `${files.length} files added`);
        setUploading(false);
      }} />
      {uploading && <p className="text-sm text-muted">Uploading…</p>}
      <Notice error={error} ok={ok} />
      {!s.materials.length ? <Empty>No files yet.</Empty> : (
        <ul className="flex flex-col gap-2">
          {s.materials.map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded-lg bg-paper px-3 py-2 text-[15px]">
              <span>{m.name} <span className="text-muted">· {fmtSize(m.sizeBytes)}</span></span>
              <button className="text-sm font-semibold text-danger hover:underline" onClick={() => {
                if (confirm(`Remove "${m.name}"?`)) run(() => api(`/sessions/${s.id}/materials/${m.id}`, { method: 'DELETE' }), 'File removed');
              }}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AssignmentTab({ s, onSaved }: TabProps) {
  const a = s.assignment;
  const [v, setV] = useState({ title: a?.title ?? '', brief: a?.brief ?? '', dueAt: toLocal(a?.dueAt ?? null), maxScore: String(a?.maxScore ?? 10) });
  const { error, ok, busy, run } = useSave(onSaved);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Card>
      <form className="grid max-w-2xl gap-4 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        run(() => api(`/sessions/${s.id}/assignment`, { method: 'PUT', json: {
          title: v.title, brief: v.brief, maxScore: Number(v.maxScore), ...(v.dueAt ? { dueAt: new Date(v.dueAt).toISOString() } : {}),
        } }), 'Assignment saved');
      }}>
        <div className="sm:col-span-2"><Field label="Title"><Input value={v.title} onChange={set('title')} minLength={2} required /></Field></div>
        <Field label="Due"><Input type="datetime-local" value={v.dueAt} onChange={set('dueAt')} /></Field>
        <Field label="Points"><Input type="number" min={1} value={v.maxScore} onChange={set('maxScore')} required /></Field>
        <div className="sm:col-span-2"><Field label="Instructions"><Textarea rows={5} value={v.brief} onChange={set('brief')} required /></Field></div>
        <div className="sm:col-span-2"><Notice error={error} ok={ok} /></div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : a ? 'Save assignment' : 'Add assignment'}</Button>
          {a && <Button type="button" variant="ghost" onClick={() => {
            if (confirm('Delete this assignment? All submissions and grades for it will be removed.')) run(() => api(`/sessions/${s.id}/assignment`, { method: 'DELETE' }), 'Assignment deleted');
          }}>Delete</Button>}
        </div>
      </form>
    </Card>
  );
}

type Q = { text: string; options: string[]; correctIndex: number };
const blankQ = (): Q => ({ text: '', options: ['', '', '', ''], correctIndex: 0 });

function QuizTab({ s, onSaved }: TabProps) {
  const quiz = s.quiz;
  const [title, setTitle] = useState(quiz?.title ?? '');
  const [passScore, setPassScore] = useState(String(quiz?.passScore ?? 60));
  const [qs, setQs] = useState<Q[]>(quiz?.questions.length ? quiz.questions.map((q) => ({ text: q.text, options: [...q.options], correctIndex: q.correctIndex ?? 0 })) : [blankQ()]);
  const { error, ok, busy, run } = useSave(onSaved);
  const patch = (i: number, fn: (q: Q) => Q) => setQs(qs.map((q, j) => (j === i ? fn(q) : q)));

  const save = () => {
    const questions = qs.filter((q) => q.text.trim()).map((q) => {
      const options = q.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
      return { text: q.text.trim(), options: options.map((x) => x.o), correctIndex: Math.max(0, options.findIndex((x) => x.i === q.correctIndex)) };
    });
    if (questions.some((q) => q.options.length < 2)) return run(async () => { throw new Error('Each question needs at least two options'); }, '');
    run(() => api(`/sessions/${s.id}/quiz`, { method: 'PUT', json: { title: title.trim() || undefined, passScore: Number(passScore), questions } }), 'Quiz saved');
  };

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label="Quiz title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${s.title} quiz`} /></Field>
        <Field label="Pass score (%)"><Input type="number" min={0} max={100} value={passScore} onChange={(e) => setPassScore(e.target.value)} /></Field>
      </Card>
      <Card className="flex flex-col gap-5">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Questions {quiz && <Badge>{quiz.questions.length} saved</Badge>}</h2><Button type="button" variant="secondary" onClick={() => setQs([...qs, blankQ()])}>Add question</Button></div>
        {qs.map((q, qi) => (
          <div key={qi} className="flex flex-col gap-3 border-t border-line pt-4 first:border-0 first:pt-0">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-muted">{qi + 1}.</span>
              <Input placeholder="Question" value={q.text} onChange={(e) => patch(qi, (x) => ({ ...x, text: e.target.value }))} />
              {qs.length > 1 && <button type="button" onClick={() => setQs(qs.filter((_, j) => j !== qi))} className="text-sm font-semibold text-danger">Remove</button>}
            </div>
            <div className="grid gap-2 pl-6 sm:grid-cols-2">
              {q.options.map((o, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <button type="button" aria-label="Mark as correct" onClick={() => patch(qi, (x) => ({ ...x, correctIndex: oi }))}
                    className={cx('grid size-8 shrink-0 place-items-center rounded-full border font-mono text-xs font-bold', q.correctIndex === oi ? 'border-[#3d7a5a] bg-[#3d7a5a] text-white' : 'border-line text-muted')}>
                    {'ABCDEF'[oi]}
                  </button>
                  <Input placeholder={`Option ${'ABCDEF'[oi]}`} value={o} onChange={(e) => patch(qi, (x) => ({ ...x, options: x.options.map((y, k) => (k === oi ? e.target.value : y)) }))} />
                </div>
              ))}
            </div>
            <p className="pl-6 text-sm text-muted">Tap a letter to mark the correct answer.</p>
          </div>
        ))}
      </Card>
      <Notice error={error} ok={ok} />
      <div className="flex gap-2">
        <Button disabled={busy} onClick={save}>{busy ? 'Saving…' : quiz ? 'Save quiz' : 'Add quiz'}</Button>
        {quiz && <Button variant="ghost" onClick={() => {
          if (confirm('Delete this quiz and all student attempts?')) run(() => api(`/sessions/${s.id}/quiz`, { method: 'DELETE' }), 'Quiz deleted');
        }}>Delete quiz</Button>}
      </div>
      <p className="text-sm text-muted">Saving replaces the questions. Past attempts are kept, but their answers match the old question order.</p>
    </div>
  );
}
