'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { useT } from './i18n-provider';

export type CertRow = { packageId: string; name: string; done: number; total: number; certificate: { serial: string; issuedAt: string } | null };

/** Certificates of a student (or of a child, for a parent), keyed by package. */
export function useCertificates(childId?: string) {
  return useQuery({ queryKey: ['certificates', childId ?? 'me'], queryFn: () => api<CertRow[]>(childId ? `/certificates/child/${childId}` : '/certificates') });
}

export function CertificateButton({ row, childId }: { row?: CertRow; childId?: string }) {
  const t = useT();
  if (!row) return null;
  if (!row.certificate)
    return <p className="text-sm text-muted">{t('Certificate: finish all {n} sessions to get it ({done} done).', { n: row.total, done: row.done })}</p>;
  const href = `/api/certificates/${row.packageId}/pdf${childId ? `?studentId=${childId}` : ''}`;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <a href={href} download className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-(--accent) px-4 text-[15px] font-semibold text-(--on-accent) hover:brightness-95">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" /></svg>
        {t('Download certificate')}
      </a>
      <span className="text-sm text-muted">{row.certificate.serial} · {fmtDate(row.certificate.issuedAt)}</span>
    </div>
  );
}
