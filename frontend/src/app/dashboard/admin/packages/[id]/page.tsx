'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { egp, fmtDate } from '@/lib/format';
import { Avatar } from '@/components/avatar';
import { Badge, Button, ButtonLink, Card, Empty, PageTitle } from '@/components/ui';
import { CourseForm, courseBody, fromPackage } from '@/components/course-form';
import { TRACK_LABEL, type AdminCourseDetail, type PayStatus } from '@/lib/types';

const TONE: Record<PayStatus, 'good' | 'warn' | 'bad' | 'neutral'> = { PAID: 'good', PENDING: 'warn', AWAITING_REVIEW: 'warn', FAILED: 'bad', REFUNDED: 'neutral' };

function Stat({ label, value }: { label: string; value: string | number }) {
  return <Card><div className="text-sm text-muted">{label}</div><div className="mt-1 font-mono text-2xl font-bold">{value}</div></Card>;
}

export default function AdminCourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-course', id], queryFn: () => api<AdminCourseDetail>(`/admin/courses/${id}`) });
  if (isLoading) return <div className="h-40 animate-pulse rounded-(--radius-card) bg-black/5" />;
  if (error || !data) return <Empty>Course not found. <Link href="/dashboard/admin/packages" className="font-semibold underline">Back to courses</Link></Empty>;

  return (
    <>
      <Link href="/dashboard/admin/packages" className="mb-3 inline-block text-sm font-semibold text-muted hover:text-ink">← All courses</Link>
      <PageTitle title={data.name} sub={`${TRACK_LABEL[data.track]} · ${egp(data.priceOneTime)}${data.priceMonthly ? ` · ${egp(data.priceMonthly)}/mo` : ''} · ${data.isPublished ? 'Published' : 'Hidden'}`}
        action={<div className="flex gap-2"><Button onClick={() => setEditing(!editing)}>{editing ? 'Close' : 'Edit course'}</Button><ButtonLink href={`/dashboard/admin/sessions?package=${data.id}`} variant="secondary">Manage sessions</ButtonLink><ButtonLink href="/dashboard/admin/packages" variant="ghost">New course</ButtonLink></div>} />
      {editing && (
        <Card className="mb-6">
          <CourseForm submitLabel="Save changes" onCancel={() => setEditing(false)}
            initial={fromPackage({ name: data.name, track: data.track, description: data.description, priceOneTime: data.priceOneTime, priceMonthly: data.priceMonthly, installmentsAllowed: data.installmentsAllowed } as never)}
            onSubmit={async (v) => { await api(`/packages/${data.id}`, { method: 'PATCH', json: courseBody(v) }); setEditing(false); qc.invalidateQueries({ queryKey: ['admin-course', id] }); qc.invalidateQueries({ queryKey: ['packages'] }); }} />
        </Card>
      )}
      <p className="mb-6 max-w-3xl text-[15px] text-[#4a4945]">{data.description}</p>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Revenue" value={egp(data.totals.revenue)} />
        <Stat label="Students" value={data.totals.students} />
        <Stat label="Paid payments" value={data.totals.paidPayments} />
        <Stat label="Waiting / pending" value={data.totals.pending} />
      </div>

      <h2 className="mb-3 font-mono text-lg font-bold">Instructors ({data.instructors.length})</h2>
      {!data.instructors.length ? <Empty>No instructor is assigned to any session yet.</Empty> : (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.instructors.map((i) => (
            <Card key={i.id} className="flex items-center gap-3">
              <Avatar name={i.name} src={i.avatar} size={44} />
              <div className="min-w-0"><div className="font-semibold">{i.name}</div><div className="truncate text-sm text-muted">{i.email}</div><div className="text-sm text-muted">{i.sessions} of {data.totals.sessions} sessions</div></div>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-3 font-mono text-lg font-bold">Enrolled students ({data.students.length})</h2>
      {!data.students.length ? <Empty>Nobody is enrolled yet.</Empty> : (
        <Card className="mb-8 overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-left text-[15px]">
            <thead className="border-b border-line text-sm text-muted"><tr>
              <th className="px-4 py-3 font-semibold">Student</th><th className="px-4 py-3 font-semibold">Phone</th><th className="px-4 py-3 font-semibold">Parent</th>
              <th className="px-4 py-3 font-semibold">Plan</th><th className="px-4 py-3 font-semibold">Progress</th><th className="px-4 py-3 font-semibold">Enrolled</th><th className="px-4 py-3 font-semibold">Status</th>
            </tr></thead>
            <tbody>
              {data.students.map((s) => (
                <tr key={s.enrollmentId} className="border-b border-line last:border-0 align-top">
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={s.name} src={s.avatar} size={36} /><div><div className="font-semibold">{s.name}</div><div className="text-sm text-muted">{s.email}</div></div></div></td>
                  <td className="px-4 py-3 font-mono text-sm">{s.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-sm">{s.parent ? <>{s.parent.name}<div className="text-muted">{s.parent.phone ?? s.parent.email}</div></> : '—'}</td>
                  <td className="px-4 py-3 text-sm">{s.billing === 'MONTHLY' ? 'Monthly' : 'One-time'}</td>
                  <td className="px-4 py-3 font-mono text-sm">{s.completedSessions} / {data.totals.sessions}</td>
                  <td className="px-4 py-3 text-sm">{fmtDate(s.enrolledAt)}{s.activeUntil && <div className="text-muted">until {fmtDate(s.activeUntil)}</div>}</td>
                  <td className="px-4 py-3">{s.active ? <Badge tone="good">Active</Badge> : <Badge>Expired</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <h2 className="mb-3 font-mono text-lg font-bold">Payments log ({data.payments.length})</h2>
      {!data.payments.length ? <Empty>No payments for this course yet.</Empty> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-left text-[15px]">
            <thead className="border-b border-line text-sm text-muted"><tr>
              <th className="px-4 py-3 font-semibold">Date</th><th className="px-4 py-3 font-semibold">Student</th><th className="px-4 py-3 font-semibold">Paid by</th>
              <th className="px-4 py-3 font-semibold">Method</th><th className="px-4 py-3 font-semibold">Coupon</th><th className="px-4 py-3 text-right font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Status</th>
            </tr></thead>
            <tbody>
              {data.payments.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-sm">{fmtDate(p.createdAt, true)}</td>
                  <td className="px-4 py-3 font-semibold">{p.student.name}</td>
                  <td className="px-4 py-3 text-sm">{p.payer.name}<div className="text-muted">{p.payer.email}</div></td>
                  <td className="px-4 py-3 text-sm">{p.method}{p.billing === 'MONTHLY' ? ' · monthly' : ''}</td>
                  <td className="px-4 py-3 font-mono text-sm">{p.coupon ? `${p.coupon.code} (−${egp(p.discountAmount)})` : '—'}</td>
                  <td className="px-4 py-3 text-right font-mono">{egp(p.amount)}</td>
                  <td className="px-4 py-3"><Badge tone={TONE[p.status]}>{p.status.replace('_', ' ').toLowerCase()}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
