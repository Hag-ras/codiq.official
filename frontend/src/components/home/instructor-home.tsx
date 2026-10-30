'use client';
import Link from 'next/link';
import { useMine } from './student-home';
import { fmtDate } from '@/lib/format';
import { Badge, ButtonLink, Card, Empty, PageTitle } from '@/components/ui';
import type { Me } from '@/lib/types';

export function InstructorHome({ me }: { me: Me }) {
  const { data, isLoading } = useMine();
  const sessions = data?.sessions ?? [];
  const live = sessions.filter((s) => s.isLiveNow);
  const upcoming = sessions.filter((s) => s.type === 'LIVE' && s.startsAt && new Date(s.startsAt) > new Date() && !s.isLiveNow);
  const pending = sessions.reduce((n, s) => n + s.pendingSubmissions, 0);

  return (
    <>
      <PageTitle title={`Teaching · ${me.name.split(' ')[0]}`} sub={`${sessions.length} sessions assigned to you`}
        action={<ButtonLink href="/dashboard/grading" variant="secondary">{pending} to grade</ButtonLink>} />
      {live.map((s) => (
        <div key={s.id} className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-(--radius-card) bg-night p-5 text-day">
          <div>
            <Badge tone="live">● Starting now</Badge>
            <div className="mt-2 text-lg font-bold">{s.title}</div>
            <div className="text-sm text-[#b4b2ac]">{s.packageName}</div>
          </div>
          <ButtonLink href={`/live/${s.id}`} variant="onDark">Start class</ButtonLink>
        </div>
      ))}
      {isLoading ? null : !sessions.length ? (
        <Empty>No sessions are assigned to you yet.</Empty>
      ) : (
        <Card className="p-0">
          <div className="border-b border-line px-5 py-3 font-semibold">Upcoming live classes</div>
          {upcoming.length ? (
            <ul className="divide-y divide-line">
              {upcoming.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <Link href={`/dashboard/sessions/${s.id}`} className="font-semibold hover:underline">{s.title}</Link>
                  <span className="text-sm text-muted">{s.packageName} · {fmtDate(s.startsAt, true)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-[15px] text-muted">None scheduled.</p>
          )}
        </Card>
      )}
    </>
  );
}
