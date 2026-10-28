'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, Card, Empty, Input, PageTitle, Progress } from '@/components/ui';
import { TRACK_LABEL } from '@/lib/types';
import type { AdminAssignmentRow } from '@/lib/types';

export default function AdminAssignmentsPage() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['admin-assignments'], queryFn: () => api<AdminAssignmentRow[]>('/admin/assignments') });
  const list = (data ?? []).filter((a) => !q || `${a.title} ${a.session.title} ${a.package.name}`.toLowerCase().includes(q.toLowerCase()));
  const toGrade = (data ?? []).reduce((n, a) => n + a.toGrade, 0);

  return (
    <>
      <PageTitle title="Assignments" sub={toGrade ? `${toGrade} submission${toGrade > 1 ? 's' : ''} waiting to be graded.` : 'All assignments and how much work has come in.'} />
      <Input placeholder="Search assignment, session or package" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4 max-w-sm" />
      {isLoading ? <div className="h-40 animate-pulse rounded-(--radius-card) bg-black/5" /> : !list.length ? <Empty>No assignments found. Add one when you create a session.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((a) => (
            <Link key={a.id} href={`/dashboard/admin/assignments/${a.id}`} className="block transition hover:-translate-y-0.5">
              <Card className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Badge tone="accent">{TRACK_LABEL[a.package.track]}</Badge>
                    <h2 className="mt-2 truncate font-mono text-lg font-bold tracking-[-0.02em]">{a.title}</h2>
                    <p className="truncate text-sm text-muted">{a.package.name} · {a.session.title}</p>
                  </div>
                  {a.toGrade > 0 ? <Badge tone="warn">{a.toGrade} to grade</Badge> : a.submitted > 0 ? <Badge tone="good">All graded</Badge> : <Badge>No work yet</Badge>}
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-sm"><span>{a.submitted} of {a.students} students submitted</span><span className="font-mono">{a.students ? Math.round((a.submitted / a.students) * 100) : 0}%</span></div>
                  <Progress value={a.students ? (a.submitted / a.students) * 100 : 0} />
                </div>
                <div className="mt-auto flex flex-wrap justify-between gap-2 text-sm text-muted">
                  <span>Due {fmtDate(a.dueAt)}</span>
                  <span>{a.averageScore !== null ? `Average ${a.averageScore} / ${a.maxScore}` : `Max ${a.maxScore}`}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
