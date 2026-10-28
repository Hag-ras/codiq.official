'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Card, Empty, Field, Input, PageTitle, Select, Textarea } from '@/components/ui';
import type { SessionDetail } from '@/lib/types';

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');

export default function EditSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: s, isLoading } = useQuery({ queryKey: ['session-edit', id], queryFn: () => api<SessionDetail>(`/sessions/${id}`) });
  const { data: staff } = useQuery({ queryKey: ['users', 'INSTRUCTOR'], queryFn: () => api<{ id: string; name: string }[]>('/users?role=INSTRUCTOR') });
  const [v, setV] = useState({ title: '', description: '', startsAt: '', durationMin: '60', instructorId: '', youtubeUrl: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (s) setV({ title: s.title, description: s.description ?? '', startsAt: toLocal(s.startsAt), durationMin: String(s.durationMin), instructorId: s.instructor?.id ?? '', youtubeUrl: s.youtubeId ? `https://youtu.be/${s.youtubeId}` : '' });
  }, [s]);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  if (isLoading) return <div className="h-40 animate-pulse rounded-(--radius-card) bg-black/5" />;
  if (!s) return <Empty>Session not found. <Link href="/dashboard/admin/sessions" className="font-semibold underline">Back to sessions</Link></Empty>;

  return (
    <>
      <Link href="/dashboard/admin/sessions" className="mb-3 inline-block text-sm font-semibold text-muted hover:text-ink">← All sessions</Link>
      <PageTitle title="Edit session" sub={`${s.package.name} · session ${s.order} · ${s.type === 'LIVE' ? 'live class' : 'recorded'}`} />
      <Card>
        <form className="grid max-w-2xl gap-4 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault(); setError(''); setBusy(true);
          try {
            await api(`/sessions/${id}`, { method: 'PATCH', json: {
              title: v.title, description: v.description,
              ...(s.type === 'LIVE' && v.startsAt ? { startsAt: new Date(v.startsAt).toISOString() } : {}),
              durationMin: Number(v.durationMin), ...(v.instructorId ? { instructorId: v.instructorId } : {}),
              ...(s.type === 'RECORDED' ? { youtubeUrl: v.youtubeUrl } : {}),
            } });
            router.push('/dashboard/admin/sessions'); router.refresh();
          } catch (err) { setError((err as Error).message); setBusy(false); }
        }}>
          <div className="sm:col-span-2"><Field label="Title"><Input value={v.title} onChange={set('title')} minLength={2} required /></Field></div>
          <div className="sm:col-span-2"><Field label="Description"><Textarea rows={3} value={v.description} onChange={set('description')} /></Field></div>
          {s.type === 'LIVE' && <Field label="Starts at"><Input type="datetime-local" value={v.startsAt} onChange={set('startsAt')} required /></Field>}
          <Field label="Duration (minutes)"><Input type="number" min={5} value={v.durationMin} onChange={set('durationMin')} required /></Field>
          <Field label="Instructor"><Select value={v.instructorId} onChange={set('instructorId')}><option value="">Not assigned</option>{staff?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></Field>
          {s.type === 'RECORDED' && <div className="sm:col-span-2"><Field label="YouTube link" hint="Unlisted YouTube video. Leave empty to remove it."><Input value={v.youtubeUrl} onChange={set('youtubeUrl')} placeholder="https://youtu.be/..." /></Field></div>}
          {error && <p className="rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button><Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button></div>
        </form>
        <p className="mt-4 text-sm text-muted">The uploaded video file, materials, assignment and quiz are kept as they are.</p>
      </Card>
    </>
  );
}
