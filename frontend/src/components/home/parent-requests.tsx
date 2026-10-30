'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { useT } from '@/components/i18n-provider';

type Req = { id: string; parent: { name: string; email: string } };

/** Shown to students when a parent has asked to follow their progress. */
export function ParentRequests() {
  const t = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const { data } = useQuery({ queryKey: ['parent-requests'], queryFn: () => api<Req[]>('/parent-requests') });
  if (!data?.length) return null;
  const act = async (id: string, what: 'accept' | 'decline') => {
    await api(`/parent-requests/${id}/${what}`, { method: 'POST' });
    await qc.invalidateQueries({ queryKey: ['parent-requests'] });
    router.refresh();
  };
  return (
    <div className="mb-6 flex flex-col gap-3">
      {data.map((r) => (
        <div key={r.id} className="rounded-xl border border-[#e3c98f] bg-[#f6ecd6] px-4 py-3 text-[15px] text-[#5e4410]">
          <p><b>{r.parent.name}</b> ({r.parent.email}) {t('wants to be linked as your parent. They would see your progress, quiz scores and assignments, and could buy packages for you.')} {t('They will also get emails about your assignments, grades and weekly progress.')}</p>
          <div className="mt-3 flex gap-2">
            <Button className="min-h-9 py-1.5" onClick={() => act(r.id, 'accept')}>{t('Accept')}</Button>
            <Button variant="secondary" className="min-h-9 py-1.5" onClick={() => act(r.id, 'decline')}>{t('Decline')}</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
