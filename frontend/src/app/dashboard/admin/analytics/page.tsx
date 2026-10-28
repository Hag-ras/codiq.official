'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { egp, fmtDate } from '@/lib/format';
import { Badge, Button, Card, Empty, Input, PageTitle, Progress, Select, cx } from '@/components/ui';
import { Avatar } from '@/components/avatar';
import { BarChart, Delta, HBars } from '@/components/charts';
import { TRACK_LABEL } from '@/lib/types';
import type { CourseAnalytics, PayStatus, RevenueAnalytics, StudentAnalytics, StudentPaymentDetail, StudentPayments } from '@/lib/types';

const TABS = [['revenue', 'Revenue'], ['students', 'Students'], ['courses', 'Courses'], ['payers', 'Student payments']] as const;
type Tab = (typeof TABS)[number][0];
const RANGES = [['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['12m', 'Last 12 months']] as const;
const METHOD: Record<string, string> = { CARD: 'Card', WALLET: 'Wallet', INSTALLMENTS: 'Installments', FAWRY: 'Fawry', INSTAPAY: 'InstaPay' };
const k = (piasters: number) => Math.round(piasters / 100).toLocaleString('en-US');

function Stat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return <Card><div className="text-[13px] font-semibold text-muted">{label}</div><div className="mt-1 font-mono text-[26px] font-bold tracking-[-0.03em]">{value}</div>{sub && <div className="mt-0.5">{sub}</div>}</Card>;
}
const Loading = () => <div className="h-56 animate-pulse rounded-(--radius-card) bg-black/5" />;

function Revenue({ range }: { range: string }) {
  const { data, isLoading } = useQuery({ queryKey: ['an-revenue', range], queryFn: () => api<RevenueAnalytics>(`/admin/analytics/revenue?range=${range}`) });
  if (isLoading || !data) return <Loading />;
  const t = data.totals;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Revenue" value={egp(t.revenue)} sub={<Delta now={t.revenue} before={t.previousRevenue} />} />
        <Stat label="Paid orders" value={String(t.paidCount)} sub={<Delta now={t.paidCount} before={t.previousPaidCount} />} />
        <Stat label="Average order" value={egp(t.averageOrder)} />
        <Stat label="Discounts given" value={egp(t.discountsGiven)} sub={<span className="text-sm text-muted">{t.couponOrders} order{t.couponOrders === 1 ? '' : 's'} with a coupon</span>} />
      </div>
      <Card>
        <h2 className="mb-4 text-[15px] font-semibold">Revenue over time <span className="font-normal text-muted">(EGP)</span></h2>
        <BarChart data={data.series.map((s) => ({ label: s.label, value: s.revenue }))} format={(n) => `${k(n)} EGP`} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card><h2 className="mb-4 text-[15px] font-semibold">By payment method</h2><HBars rows={data.byMethod.map((m) => ({ label: METHOD[m.method] ?? m.method, value: m.revenue, sub: `${m.count} order${m.count === 1 ? '' : 's'}` }))} format={(n) => `${k(n)} EGP`} /></Card>
        <Card><h2 className="mb-4 text-[15px] font-semibold">By track</h2><HBars rows={data.byTrack.map((m) => ({ label: TRACK_LABEL[m.track], value: m.revenue, sub: `${m.count}` }))} format={(n) => `${k(n)} EGP`} /></Card>
        <Card>
          <h2 className="mb-4 text-[15px] font-semibold">Payment funnel</h2>
          <div className="font-mono text-[28px] font-bold">{data.funnel.successRate === null ? '—' : `${data.funnel.successRate}%`}</div>
          <p className="mb-3 text-sm text-muted">of {data.funnel.attempts} attempts were paid</p>
          <div className="flex flex-wrap gap-2"><Badge tone="good">{data.funnel.paid} paid</Badge><Badge tone="warn">{data.funnel.pending} pending</Badge><Badge tone="warn">{data.funnel.awaitingReview} to review</Badge><Badge tone="bad">{data.funnel.failed} failed</Badge></div>
        </Card>
      </div>
      <Card><h2 className="mb-4 text-[15px] font-semibold">Top courses by revenue</h2><HBars rows={data.byPackage.slice(0, 8).map((p) => ({ label: p.name, value: p.revenue, sub: `${p.count} order${p.count === 1 ? '' : 's'}` }))} format={(n) => `${k(n)} EGP`} /></Card>
    </div>
  );
}

function Students({ range }: { range: string }) {
  const { data, isLoading } = useQuery({ queryKey: ['an-students', range], queryFn: () => api<StudentAnalytics>(`/admin/analytics/students?range=${range}`) });
  if (isLoading || !data) return <Loading />;
  const t = data.totals, e = data.enrollments, totalE = Math.max(1, e.active + e.expired + e.cancelled);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Students" value={String(t.students)} sub={<span className="text-sm text-muted">+{t.newInRange} in this period</span>} />
        <Stat label="Paying students" value={String(t.payingStudents)} sub={<span className="text-sm text-muted">{t.conversionRate}% of all students</span>} />
        <Stat label="Active learners" value={String(t.activeLearners)} sub={<span className="text-sm text-muted">watched or attended something</span>} />
        <Stat label="Active enrollments" value={String(e.active)} sub={<span className="text-sm text-muted">{e.expired} expired</span>} />
      </div>
      <Card><h2 className="mb-4 text-[15px] font-semibold">New students over time</h2><BarChart data={data.series.map((s) => ({ label: s.label, value: s.count }))} format={(n) => `${n} new`} color="bg-ink" /></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="mb-4 text-[15px] font-semibold">Students by track</h2><HBars rows={data.byTrack.map((b) => ({ label: TRACK_LABEL[b.track], value: b.count }))} format={(n) => String(n)} /></Card>
        <Card>
          <h2 className="mb-4 text-[15px] font-semibold">Enrollment health</h2>
          <Progress value={(e.active / totalE) * 100} />
          <div className="mt-3 flex flex-wrap gap-2"><Badge tone="good">{e.active} active</Badge><Badge tone="warn">{e.expired} expired (monthly, not renewed)</Badge><Badge>{e.cancelled} cancelled</Badge></div>
        </Card>
      </div>
    </div>
  );
}

function Courses() {
  const { data, isLoading } = useQuery({ queryKey: ['an-courses'], queryFn: () => api<CourseAnalytics[]>('/admin/analytics/courses') });
  if (isLoading || !data) return <Loading />;
  if (!data.length) return <Empty>No courses yet.</Empty>;
  const pct = (n: number | null) => (n === null ? '—' : `${n}%`);
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full min-w-[860px] text-left text-[15px]">
        <thead className="border-b border-line text-sm text-muted"><tr>{['Course', 'Students', 'Revenue', 'Completion', 'Avg quiz', 'Avg grade'].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {data.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3"><div className="font-semibold">{c.name}</div><div className="text-sm text-muted">{TRACK_LABEL[c.track]} · {c.sessions} sessions {!c.isPublished && '· hidden'}</div></td>
              <td className="px-4 py-3 font-mono">{c.activeStudents}<span className="text-muted"> / {c.enrollments}</span></td>
              <td className="px-4 py-3 font-mono">{egp(c.revenue)}<div className="text-xs text-muted">{c.paidCount} paid</div></td>
              <td className="px-4 py-3"><div className="font-mono">{pct(c.completionRate)}</div>{c.completionRate !== null && <div className="mt-1 w-24"><Progress value={c.completionRate} /></div>}</td>
              <td className="px-4 py-3 font-mono">{pct(c.averageQuizScore)}</td>
              <td className="px-4 py-3 font-mono">{pct(c.averageGrade)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayerDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ['an-payer', id], queryFn: () => api<StudentPaymentDetail>(`/admin/analytics/student-payments/${id}`) });
  const tone = (s: PayStatus) => (s === 'PAID' ? 'good' : s === 'FAILED' ? 'bad' : 'warn');
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        {!data ? <Loading /> : (
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3"><Avatar name={data.student.name} src={data.student.avatar} size={48} /><div><h2 className="font-mono text-lg font-bold">{data.student.name}</h2><p className="text-sm text-muted">{data.student.email}</p></div></div>
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>
            <h3 className="mb-2 text-sm font-semibold text-muted">Access</h3>
            <div className="mb-5 flex flex-wrap gap-2">{data.enrollments.length ? data.enrollments.map((e, i) => <Badge key={i} tone={e.status === 'ACTIVE' ? 'good' : 'neutral'}>{e.package.name}{e.activeUntil ? ` · until ${fmtDate(e.activeUntil)}` : ' · lifetime'}</Badge>) : <span className="text-sm text-muted">No courses yet.</span>}</div>
            <h3 className="mb-2 text-sm font-semibold text-muted">Payments</h3>
            {!data.payments.length ? <Empty>No payments yet.</Empty> : (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[640px] text-left text-[15px]">
                  <thead className="border-b border-line text-sm text-muted"><tr>{['Date', 'Course', 'Method', 'Amount', 'Status'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line">
                    {data.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2">{fmtDate(p.createdAt, true)}</td>
                        <td className="px-3 py-2">{p.package.name}<div className="text-xs text-muted">paid by {p.payer.name}</div></td>
                        <td className="px-3 py-2">{METHOD[p.method]}{p.coupon && <div className="font-mono text-xs text-clay">{p.coupon.code}</div>}</td>
                        <td className="px-3 py-2 font-mono">{egp(p.amount)}{p.discountAmount > 0 && <div className="text-xs text-muted">saved {egp(p.discountAmount)}</div>}</td>
                        <td className="px-3 py-2"><Badge tone={tone(p.status)}>{p.status.replace('_', ' ').toLowerCase()}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Payers() {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('spent');
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['an-payers', q, sort, filter], queryFn: () => api<StudentPayments>(`/admin/analytics/student-payments?${new URLSearchParams({ sort, ...(q && { q }), ...(filter && { filter }) })}`) });
  return (
    <div className="flex flex-col gap-4">
      {data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Students listed" value={String(data.totals.students)} />
          <Stat label="Paying" value={String(data.totals.paying)} />
          <Stat label="Total paid" value={egp(data.totals.revenue)} />
          <Stat label="Average per paying student" value={egp(data.totals.average)} />
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-[190px]" aria-label="Filter"><option value="">All students</option><option value="paid">Paid at least once</option><option value="never">Never paid</option></Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="max-w-[190px]" aria-label="Sort"><option value="spent">Most paid</option><option value="recent">Latest payment</option><option value="name">Name</option></Select>
      </div>
      {isLoading || !data ? <Loading /> : !data.rows.length ? <Empty>No students match.</Empty> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[820px] text-left text-[15px]">
            <thead className="border-b border-line text-sm text-muted"><tr>{['Student', 'Total paid', 'Payments', 'Discounts', 'Last payment', 'Courses'].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {data.rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-paper" onClick={() => setOpen(r.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(r.id)} aria-label={`Open payments for ${r.name}`}>
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={r.name} src={r.avatar} size={36} /><div className="min-w-0"><div className="truncate font-semibold">{r.name}</div><div className="truncate text-sm text-muted">{r.email}</div></div></div></td>
                  <td className="px-4 py-3 font-mono">{egp(r.totalPaid)}</td>
                  <td className="px-4 py-3 font-mono">{r.payments}{r.failedPayments > 0 && <span className="ml-1 text-xs text-danger">({r.failedPayments} failed)</span>}</td>
                  <td className="px-4 py-3 font-mono">{r.discounts ? egp(r.discounts) : '—'}</td>
                  <td className="px-4 py-3">{fmtDate(r.lastPaymentAt)}</td>
                  <td className="px-4 py-3 font-mono">{r.courses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <PayerDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('revenue');
  const [range, setRange] = useState('30d');
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (t && TABS.some(([id]) => id === t)) setTab(t);
  }, []);
  const choose = (t: Tab) => { setTab(t); window.history.replaceState(null, '', `?tab=${t}`); };

  return (
    <>
      <PageTitle title="Analytics" sub="Revenue, students, courses and what each student has paid."
        action={(tab === 'revenue' || tab === 'students') && <Select value={range} onChange={(e) => setRange(e.target.value)} className="max-w-[190px]" aria-label="Time range">{RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>} />
      <div role="tablist" aria-label="Analytics sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => choose(id)}
            className={cx('min-h-11 shrink-0 border-b-2 px-4 text-[15px] font-semibold', tab === id ? 'border-clay text-ink' : 'border-transparent text-muted hover:text-ink')}>{label}</button>
        ))}
      </div>
      {tab === 'revenue' && <Revenue range={range} />}
      {tab === 'students' && <Students range={range} />}
      {tab === 'courses' && <Courses />}
      {tab === 'payers' && <Payers />}
    </>
  );
}
