'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { egp, fmtDate } from '@/lib/format';
import { Badge, ButtonLink, Empty, PageTitle } from '@/components/ui';
import type { Payment, PayStatus } from '@/lib/types';
import { useT } from '@/components/i18n-provider';

const STATUS: Record<PayStatus, [string, 'good' | 'warn' | 'bad' | 'neutral']> = {
  PAID: ['Paid', 'good'], PENDING: ['Pending', 'warn'], AWAITING_REVIEW: ['Under review', 'warn'], FAILED: ['Failed', 'bad'], REFUNDED: ['Refunded', 'neutral'],
};
const METHOD: Record<string, string> = { CARD: 'Card', WALLET: 'Mobile wallet', INSTALLMENTS: 'Installments', FAWRY: 'Fawry', INSTAPAY: 'InstaPay' };

export default function BillingPage() {
  const t = useT();
  const { data, isLoading } = useQuery({ queryKey: ['payments', 'mine'], queryFn: () => api<Payment[]>('/payments/mine') });
  return (
    <>
      <PageTitle title={t('Billing')} sub={t('Your payments and receipts')} action={<ButtonLink href="/pricing" variant="secondary">{t('Buy or renew')}</ButtonLink>} />
      {isLoading ? null : !data?.length ? <Empty>{t('No payments yet.')}</Empty> : (
        <div className="overflow-x-auto rounded-(--radius-card) border border-line bg-white">
          <table className="w-full min-w-[640px] text-left text-[15px]">
            <thead className="border-b border-line text-sm text-muted">
              <tr><th className="px-4 py-3 font-semibold">{t('Date')}</th><th className="px-4 py-3 font-semibold">{t('Package')}</th><th className="px-4 py-3 font-semibold">{t('Method')}</th><th className="px-4 py-3 font-semibold">{t('Amount')}</th><th className="px-4 py-3 font-semibold">{t('Status')}</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">{fmtDate(p.createdAt)}</td>
                  <td className="px-4 py-3">{p.package.name}{p.student ? <span className="text-muted"> · {p.student.name}</span> : null}<div className="text-sm text-muted">{p.billing === 'MONTHLY' ? t('Monthly') : t('One-time')}</div></td>
                  <td className="px-4 py-3">{t(METHOD[p.method])}{p.method === 'FAWRY' && p.status === 'PENDING' && p.providerRef ? <div className="font-mono text-sm">{p.providerRef}</div> : null}</td>
                  <td className="px-4 py-3 font-mono">{egp(p.amount)}</td>
                  <td className="px-4 py-3"><Badge tone={STATUS[p.status][1]}>{t(STATUS[p.status][0])}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
