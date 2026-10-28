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

      <h2 className="mb-3 font-mono text-lg font-bold">Submissions ({data.submissions.length})</h2>
      {!data.submissions.length ? <Empty>Nobody has submitted yet.</Empty> : (
        <div className="flex flex-col gap-4">
          {data.submissions.map((s) => (
            <Card key={s.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={s.student.name} src={s.student.avatar} size={40} />
                  <div><div className="font-semibold">{s.student.name}</div><div className="text-sm text-muted">{s.student.email} · submitted {fmtDate(s.submittedAt, true)}</div></div>
                </div>
                {s.status === 'GRADED' ? <Badge tone="good">{s.score} / {data.maxScore}</Badge> : <Badge tone="warn">Waiting for grade</Badge>}
              </div>
              {s.text && <p className="rounded-lg bg-paper p-3 text-[15px] whitespace-pre-line">{s.text}</p>}
              {s.hasFile && <Button variant="secondary" className="self-start" onClick={() => openSignedUrl(`/submissions/${s.id}/file`)}>Open {s.fileName ?? 'file'}</Button>}
              {s.feedback && <p className="text-sm text-muted"><span className="font-semibold text-ink">Feedback:</span> {s.feedback}</p>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
