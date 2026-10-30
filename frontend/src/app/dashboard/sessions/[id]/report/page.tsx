'use client';
import Link from 'next/link';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, Button, Card, Empty, PageTitle } from '@/components/ui';

type Person = {
  userId: string; name: string; role: string; present: boolean; firstJoinAt: string | null; lastSeenAt: string | null; joins: number;
  attendedSeconds: number; activeSeconds: number; camSeconds: number; micSeconds: number; interactions: number; attendancePct: number; engagementPct: number;
};
type Report = { session: { title: string; startsAt: string | null; durationMin: number }; classStart: string | null; classEnd: string | null; classSeconds: number; people: Person[] };

const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
const span = (sec: number) => {
  if (sec < 60) return sec ? `${sec}s` : '0 min';
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};
const tone = (pct: number) => (pct >= 70 ? '#3d7a5a' : pct >= 40 ? '#c28a12' : '#b3402a');

function Pct({ value, absent }: { value: number; absent?: boolean }) {
  if (absent) return <span className="text-muted">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-[#ece9e2]"><div className="h-full rounded-full" style={{ width: `${value}%`, background: tone(value) }} /></div>
      <span className="w-10 font-mono text-sm font-semibold">{value}%</span>
    </div>
  );
}

function csv(r: Report) {
  const head = ['Name', 'Role', 'Joined', 'Left', 'Time in class (min)', 'Attendance %', 'Engagement %', 'Camera on (min)', 'Mic on (min)', 'Interactions', 'Times joined'];
  const rows = r.people.map((p) => [p.name, p.role, clock(p.firstJoinAt), clock(p.lastSeenAt), Math.round(p.attendedSeconds / 60), p.attendancePct, p.engagementPct, Math.round(p.camSeconds / 60), Math.round(p.micSeconds / 60), p.interactions, p.joins]);
  const text = [head, ...rows].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  a.download = `${r.session.title.replace(/[^\w]+/g, '-')}-attendance.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, isLoading } = useQuery({ queryKey: ['live-report', id], queryFn: () => api<Report>(`/live/${id}/report`), refetchInterval: 30_000 });

  if (error) return <Empty>{(error as Error).message}</Empty>;
  if (isLoading || !data) return <div className="h-60 animate-pulse rounded-xl bg-black/5" />;

  const students = data.people.filter((p) => p.role === 'STUDENT');
  const here = students.filter((p) => p.present);
  const avg = here.length ? Math.round(here.reduce((a, p) => a + p.engagementPct, 0) / here.length) : 0;
  const sorted = [...data.people].sort((a, b) => Number(b.present) - Number(a.present) || b.engagementPct - a.engagementPct);

  return (
    <>
      <Link href={`/dashboard/sessions/${id}`} className="mb-3 inline-block text-sm font-semibold text-muted hover:text-ink">← {data.session.title}</Link>
      <PageTitle title="Attendance & engagement" sub={`${data.session.title} · ${fmtDate(data.session.startsAt, true)}`}
        action={<Button variant="secondary" onClick={() => csv(data)} disabled={!data.people.length}>Download CSV</Button>} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Class length', data.classSeconds ? span(data.classSeconds) : '—', data.classStart ? `${clock(data.classStart)} – ${clock(data.classEnd)}` : 'Nobody has joined yet'],
          ['Students came', `${here.length} / ${students.length}`, students.length ? `${students.length - here.length} absent` : 'No enrolled students'],
          ['Average engagement', here.length ? `${avg}%` : '—', 'Students who came'],
          ['Interactions', String(here.reduce((a, p) => a + p.interactions, 0)), 'Chats, hands, strokes, code runs'],
        ].map(([label, value, sub]) => (
          <Card key={label}><div className="text-sm text-muted">{label}</div><div className="mt-1 font-mono text-2xl font-bold">{value}</div><div className="mt-1 text-sm text-muted">{sub}</div></Card>
        ))}
      </div>

      {!data.people.length ? <Empty>Nobody has joined this class yet. The report fills in while the class is running.</Empty> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[920px] text-left text-[15px]">
            <thead className="border-b border-line text-sm text-muted">
              <tr>{['#', 'Name', 'Joined', 'Left', 'Time in class', 'Attendance', 'Engagement', 'Camera', 'Mic', 'Actions'].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sorted.map((p, i) => (
                <tr key={p.userId} className={p.present ? '' : 'bg-[#faf8f4] text-muted'}>
                  <td className="px-4 py-3 font-mono text-muted">{i + 1}</td>
                  <td className="px-4 py-3"><span className="font-semibold text-ink">{p.name}</span>{p.role !== 'STUDENT' && <span className="ms-2"><Badge>{p.role.toLowerCase()}</Badge></span>}{!p.present && <span className="ms-2"><Badge tone="bad">absent</Badge></span>}</td>
                  <td className="px-4 py-3 font-mono">{clock(p.firstJoinAt)}</td>
                  <td className="px-4 py-3 font-mono">{clock(p.lastSeenAt)}{p.joins > 1 && <span className="ms-1 text-xs text-muted" title="Left and came back">↻{p.joins - 1}</span>}</td>
                  <td className="px-4 py-3">{p.present ? span(p.attendedSeconds) : '—'}</td>
                  <td className="px-4 py-3"><Pct value={p.attendancePct} absent={!p.present} /></td>
                  <td className="px-4 py-3"><Pct value={p.engagementPct} absent={!p.present} /></td>
                  <td className="px-4 py-3">{p.present ? span(p.camSeconds) : '—'}</td>
                  <td className="px-4 py-3">{p.present ? span(p.micSeconds) : '—'}</td>
                  <td className="px-4 py-3 font-mono">{p.present ? p.interactions : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Card className="mt-5 text-[15px]">
        <h2 className="mb-2 font-semibold">How engagement is measured</h2>
        <p className="text-muted">
          Each person&apos;s browser reports every 30 seconds. The score out of 100 is: <b className="text-ink">60%</b> attention (time the class tab was open and in focus),
          {' '}<b className="text-ink">15%</b> camera on, <b className="text-ink">10%</b> microphone on (talking for a quarter of the class counts as full),
          and <b className="text-ink">15%</b> participation (5 chat messages, raised hands, whiteboard strokes or code runs count as full).
          Everything is compared with the length of the whole class, so arriving late or leaving early lowers the score. &ldquo;Left&rdquo; is the last time the person was seen, within 30 seconds.
          Admins watching quietly are not counted.
        </p>
      </Card>
    </>
  );
}
