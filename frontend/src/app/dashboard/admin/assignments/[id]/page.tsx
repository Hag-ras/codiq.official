'use client';
import Link from 'next/link';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, openSignedUrl } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, Button, ButtonLink, Card, Empty, PageTitle } from '@/components/ui';
import { Avatar } from '@/components/avatar';
import { TRACK_LABEL } from '@/lib/types';
import type { AdminAssignmentDetail } from '@/lib/types';

export default function AdminAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-assignment', id], queryFn: () => api<AdminAssignmentDetail>(`/admin/assignments/${id}`) });
  if (isLoading) return <div className="h-40 animate-pulse rounded-(--radius-card) bg-black/5" />;
  if (error || !data) return <Empty>Assignment not found. <Link href="/dashboard/admin/assignments" className="font-semibold underline">Back to assignments</Link></Empty>;

  const toGrade = data.submissions.filter((s) => s.status === 'SUBMITTED').length;
  return (
    <>
      <Link href="/dashboard/admin/assignments" className="mb-3 inline-block text-sm font-semibold text-muted hover:text-ink">← All assignments</Link>
      <PageTitle title={data.title} sub={`${TRACK_LABEL[data.package.track]} · ${data.package.name} · ${data.session.title}`}
        action={toGrade ? <ButtonLink href="/dashboard/grading">Grade {toGrade} submission{toGrade > 1 ? 's' : ''}</ButtonLink> : undefined} />
      <Card className="mb-6">
        <p className="text-[15px] whitespace-pre-line">{data.brief}</p>
        <p className="mt-3 text-sm text-muted">Due {fmtDate(data.dueAt, true)} · max score {data.maxScore}{data.session.instructorName ? ` · instructor ${data.session.instructorName}` : ''}</p>
      </Card>

      <h2 className="mb-3 font-mono text-lg font-bold">Submitted ({data.submissions.length})</h2>
      {!data.submissions.length ? <Empty>Nobody has submitted yet.</Empty> : (
        <Card className="mb-8 overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-left text-[15px]">
            <thead className="border-b border-line text-sm text-muted"><tr>
              <th className="px-4 py-3 font-semibold">Student</th><th className="px-4 py-3 font-semibold">Submitted</th><th className="px-4 py-3 font-semibold">Work</th>
              <th className="px-4 py-3 font-semibold">Grade</th><th className="px-4 py-3 font-semibold">Feedback</th>
            </tr></thead>
            <tbody>
              {data.submissions.map((s) => (
                <tr key={s.id} className="border-b border-line align-top last:border-0">
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={s.student.name} src={s.student.avatar} size={36} /><div><div className="font-semibold">{s.student.name}</div><div className="text-sm text-muted">{s.student.email}</div></div></div></td>
                  <td className="px-4 py-3 text-sm">{fmtDate(s.submittedAt, true)}{data.dueAt && new Date(s.submittedAt) > new Date(data.dueAt) && <div className="text-danger">Late</div>}</td>
                  <td className="max-w-xs px-4 py-3 text-sm">
                    {s.text && <p className="line-clamp-3 whitespace-pre-line">{s.text}</p>}
                    {s.hasFile && <Button variant="secondary" className="mt-1 min-h-9 py-1.5" onClick={() => openSignedUrl(`/submissions/${s.id}/file`)}>Open {s.fileName ?? 'file'}</Button>}
                    {!s.text && !s.hasFile && '—'}
                  </td>
                  <td className="px-4 py-3">{s.status === 'GRADED' ? <Badge tone="good">{s.score} / {data.maxScore}</Badge> : <Badge tone="warn">Waiting for grade</Badge>}</td>
                  <td className="max-w-[220px] px-4 py-3 text-sm text-muted">{s.feedback ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <h2 className="mb-3 font-mono text-lg font-bold">Not submitted ({data.notSubmitted.length})</h2>
      {!data.notSubmitted.length ? <Empty>Every enrolled student has submitted.</Empty> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-left text-[15px]">
            <thead className="border-b border-line text-sm text-muted"><tr>
              <th className="px-4 py-3 font-semibold">Student</th><th className="px-4 py-3 font-semibold">Phone</th><th className="px-4 py-3 font-semibold">Status</th>
            </tr></thead>
            <tbody>
              {data.notSubmitted.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={u.name} src={u.avatar} size={36} /><div><div className="font-semibold">{u.name}</div><div className="text-sm text-muted">{u.email}</div></div></div></td>
                  <td className="px-4 py-3 font-mono text-sm">{u.phone ?? '—'}</td>
                  <td className="px-4 py-3">{data.dueAt && new Date(data.dueAt) < new Date() ? <Badge tone="bad">Overdue</Badge> : <Badge tone="warn">Not yet</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
