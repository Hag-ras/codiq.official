'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, openSignedUrl } from '@/lib/api';
import { egp, fmtDate } from '@/lib/format';
import { Badge, Button, Empty, PageTitle, cx } from '@/components/ui';
import type { Payment, PayStatus } from '@/lib/types';

const TABS: [PayStatus | '', string][] = [['AWAITING_REVIEW', 'InstaPay to review'], ['PAID', 'Paid'], ['PENDING', 'Pending'], ['FAILED', 'Failed'], ['', 'All']];

export default function AdminPaymentsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<PayStatus | ''>('AWAITING_REVIEW');
  const { data } = useQuery({ queryKey: ['admin-payments', status], queryFn: () => api<Payment[]>(`/payments${status ? `?status=${status}` : ''}`) });
  const act = async (id: string, a: 'approve' | 'reject') => {
    await api(`/payments/${id}/${a}`, { method: 'PATCH' });
    qc.invalidateQueries({ queryKey: ['admin-payments'] });
  };

  return (
    <>
      <PageTitle title="Payments" sub="Card, wallet, installment and Fawry payments confirm automatically. InstaPay needs a manual check." />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([s, label]) => (
          <button key={label} onClick={() => setStatus(s)} className={cx('min-h-10 rounded-full border px-4 text-sm font-semibold', status === s ? 'border-ink bg-ink text-paper' : 'border-line bg-white')}>{label}</button>
        ))}
      </div>
      {!data?.length ? <Empty>Nothing here.</Empty> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[760px] text-left text-[15px]">
            <thead className="border-b border-line text-sm text-muted"><tr>{['Date', 'Payer', 'Package', 'Method', 'Amount', 'Status', ''].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {data.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">{fmtDate(p.createdAt, true)}</td>
                  <td className="px-4 py-3">{p.payer?.name}<div className="text-sm text-muted">{p.payer?.email}</div></td>
                  <td className="px-4 py-3">{p.package.name}{p.student && p.student.name !== p.payer?.name ? <div className="text-sm text-muted">for {p.student.name}</div> : null}</td>
                  <td className="px-4 py-3">{p.method}{p.providerRef ? <div className="font-mono text-xs text-muted">{p.providerRef}</div> : null}</td>
                  <td className="px-4 py-3 font-mono">{egp(p.amount)}{p.coupon && <div className="text-xs text-clay">{p.coupon.code} · −{egp(p.discountAmount ?? 0)}</div>}</td>
                  <td className="px-4 py-3"><Badge tone={p.status === 'PAID' ? 'good' : p.status === 'FAILED' ? 'bad' : 'warn'}>{p.status.replace('_', ' ').toLowerCase()}</Badge></td>
                  <td className="px-4 py-3">
                    {p.status === 'AWAITING_REVIEW' && (
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => openSignedUrl(`/payments/${p.id}/receipt`)}>Receipt</Button>
                        <Button variant="danger" onClick={() => act(p.id, 'reject')}>Reject</Button>
                        <Button onClick={() => act(p.id, 'approve')}>Approve</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
