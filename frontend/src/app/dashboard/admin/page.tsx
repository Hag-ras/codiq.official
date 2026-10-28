'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { egp, fmtDate } from '@/lib/format';
import { Badge, Card, Empty, PageTitle, Progress } from '@/components/ui';
import { Avatar } from '@/components/avatar';
import { TRACK_LABEL } from '@/lib/types';
import type { AdminStats, Track } from '@/lib/types';

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleString('en-GB', { month: 'short' });

function Stat({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <Card className="h-full">
      <div className="text-[13px] font-semibold text-muted">{label}</div>
      <div className="mt-1 font-mono text-[28px] font-bold tracking-[-0.03em]">{value}</div>
      {sub && <div className="mt-0.5 text-sm text-muted">{sub}</div>}
    </Card>
  );
  return href ? <Link href={href} className="block transition hover:-translate-y-0.5">{body}</Link> : body;
}

export default function AdminOverviewPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-stats'], queryFn: () => api<AdminStats>('/admin/stats'), refetchInterval: 60_000 });
  if (isLoading) return <div className="h-64 animate-pulse rounded-(--radius-card) bg-black/5" />;
  if (error || !data) return <Empty>Couldn't load the overview. Check that the API is running.</Empty>;

  const thisMonth = data.revenue.byMonth.at(-1)?.amount ?? 0;
  const max = Math.max(1, ...data.revenue.byMonth.map((m) => m.amount));
  const tracks = Object.keys(data.enrollments.byTrack) as Track[];
  const totalEnr = Math.max(1, data.enrollments.active);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Overview" sub="How Codiq is doing right now." />

      {data.payments.awaitingReview > 0 && (
        <Link href="/dashboard/admin/payments" className="flex items-center justify-between gap-3 rounded-(--radius-card) bg-ink px-5 py-4 text-paper">
          <span className="text-[15px] font-semibold">{data.payments.awaitingReview} InstaPay receipt{data.payments.awaitingReview > 1 ? 's' : ''} waiting for your review</span>
          <span className="text-sm font-semibold text-clay-light">Review now →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total revenue" value={egp(data.revenue.total)} sub={`${data.revenue.paidPayments} paid payments`} href="/dashboard/admin/payments" />
        <Stat label="This month" value={egp(thisMonth)} />
        <Stat label="Users" value={String(data.users.total)} sub={`+${data.users.newLast30Days} in 30 days`} href="/dashboard/admin/users" />
        <Stat label="Active enrollments" value={String(data.enrollments.active)} sub={`${data.content.packages} packages · ${data.content.sessions} sessions`} href="/dashboard/admin/packages" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-[15px] font-semibold">Revenue, last 6 months</h2>
          <div className="flex h-44 items-end gap-3" role="img" aria-label="Revenue by month">
            {data.revenue.byMonth.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="font-mono text-xs text-muted">{m.amount ? Math.round(m.amount / 100).toLocaleString('en-US') : ''}</span>
                <div className="w-full rounded-t-md bg-clay" style={{ height: `${Math.max(m.amount ? 4 : 1, (m.amount / max) * 100)}%`, opacity: m.amount ? 1 : 0.25 }} />
                <span className="text-xs font-semibold text-muted">{monthLabel(m.month)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Amounts in EGP, by payment date.</p>
        </Card>

        <Card>
          <h2 className="mb-4 text-[15px] font-semibold">Active students by track</h2>
          <div className="flex flex-col gap-4">
            {tracks.map((t) => (
              <div key={t} data-track={t}>
                <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{TRACK_LABEL[t]}</span><span className="font-mono text-muted">{data.enrollments.byTrack[t]}</span></div>
                <Progress value={(data.enrollments.byTrack[t] / totalEnr) * 100} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden p-0 lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-5 pb-3"><h2 className="text-[15px] font-semibold">Recent payments</h2><Link href="/dashboard/admin/payments" className="text-sm font-semibold text-muted hover:text-ink">All payments</Link></div>
          {!data.recentPayments.length ? <p className="px-5 pb-5 text-[15px] text-muted">No payments yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-[15px]">
                <tbody className="divide-y divide-line border-t border-line">
                  {data.recentPayments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-3">{p.payer.name}<div className="text-sm text-muted">{p.package.name}</div></td>
                      <td className="px-2 py-3 text-sm text-muted">{p.method}<div>{fmtDate(p.createdAt)}</div></td>
                      <td className="px-2 py-3 font-mono">{egp(p.amount)}</td>
                      <td className="px-5 py-3 text-right"><Badge tone={p.status === 'PAID' ? 'good' : p.status === 'FAILED' ? 'bad' : 'warn'}>{p.status.replace('_', ' ').toLowerCase()}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-semibold">New sign-ups</h2><Link href="/dashboard/admin/users" className="text-sm font-semibold text-muted hover:text-ink">All users</Link></div>
          <ul className="flex flex-col gap-3">
            {data.recentUsers.map((u) => (
              <li key={u.id} className="flex items-center gap-3">
                <Avatar name={u.name} src={u.avatar} size={36} />
                <div className="min-w-0 flex-1"><div className="truncate text-[15px] font-semibold">{u.name}</div><div className="truncate text-sm text-muted">{u.email}</div></div>
                <Badge>{u.role.toLowerCase()}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
