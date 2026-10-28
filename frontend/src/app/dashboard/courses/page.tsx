'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, ButtonLink, Card, Empty, PageTitle, Progress } from '@/components/ui';
import { TRACK_LABEL } from '@/lib/types';
import type { MyCourse } from '@/lib/types';

export default function MyCoursesPage() {
  const { data, isLoading } = useQuery({ queryKey: ['my-courses'], queryFn: () => api<MyCourse[]>('/account/my-courses') });
  return (
    <>
      <PageTitle title="My courses" sub="Everything you're enrolled in, and how far you've got." action={<ButtonLink href="/dashboard/catalog" variant="ghost">Browse packages</ButtonLink>} />
      {isLoading ? <div className="h-40 animate-pulse rounded-(--radius-card) bg-black/5" /> : !data?.length ? (
        <Empty>You're not enrolled in anything yet. <Link href="/dashboard/catalog" className="font-semibold text-ink underline">Browse packages</Link> to get started.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((c) => (
            <Card key={c.enrollmentId} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div><Badge tone="accent">{TRACK_LABEL[c.track]}</Badge><h2 className="mt-2 font-mono text-xl font-bold tracking-[-0.02em]">{c.name}</h2></div>
                <Badge tone={c.activeUntil ? 'warn' : 'good'}>{c.activeUntil ? `Until ${fmtDate(c.activeUntil)}` : 'Lifetime access'}</Badge>
              </div>
              <p className="text-[15px] text-muted">{c.description}</p>
              <div>
                <div className="mb-1 flex justify-between text-sm"><span>{c.completedSessions} of {c.totalSessions} sessions done</span><span className="font-mono">{c.percent}%</span></div>
                <Progress value={c.percent} />
              </div>
              <ButtonLink href="/dashboard/sessions" className="mt-1 self-start">Continue learning</ButtonLink>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
