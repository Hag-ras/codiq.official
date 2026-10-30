'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, ButtonLink, Card, Empty, PageTitle, Progress } from '@/components/ui';
import { CertificateButton, useCertificates } from '@/components/certificate-button';
import { useT } from '@/components/i18n-provider';
import { TRACK_LABEL } from '@/lib/types';
import type { MyCourse } from '@/lib/types';

export default function MyCoursesPage() {
  const t = useT();
  const { data, isLoading } = useQuery({ queryKey: ['my-courses'], queryFn: () => api<MyCourse[]>('/account/my-courses') });
  const { data: certs } = useCertificates();
  return (
    <>
      <PageTitle title={t('My courses')} sub={t("Everything you're enrolled in, and how far you've got.")} action={<ButtonLink href="/dashboard/catalog" variant="ghost">{t('Browse packages')}</ButtonLink>} />
      {isLoading ? <div className="h-40 animate-pulse rounded-(--radius-card) bg-black/5" /> : !data?.length ? (
        <Empty>{t("You're not enrolled in anything yet.")} <Link href="/dashboard/catalog" className="font-semibold text-ink underline">{t('Browse packages')}</Link> {t('to get started.')}</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((c) => (
            <Card key={c.enrollmentId} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div><Badge tone="accent">{t(TRACK_LABEL[c.track])}</Badge><h2 className="mt-2 font-mono text-xl font-bold tracking-[-0.02em]">{c.name}</h2></div>
                <Badge tone={c.activeUntil ? 'warn' : 'good'}>{c.activeUntil ? t('Until {date}', { date: fmtDate(c.activeUntil) }) : t('Lifetime access')}</Badge>
              </div>
              <p className="text-[15px] text-muted">{c.description}</p>
              <div>
                <div className="mb-1 flex justify-between text-sm"><span>{t('{done} of {total} sessions done', { done: c.completedSessions, total: c.totalSessions })}</span><span className="font-mono">{c.percent}%</span></div>
                <Progress value={c.percent} />
              </div>
              <CertificateButton row={certs?.find((r) => r.packageId === c.packageId)} />
              <ButtonLink href="/dashboard/sessions" className="mt-1 self-start">{t('Continue learning')}</ButtonLink>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
