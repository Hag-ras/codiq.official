'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, ButtonLink, Empty, PageTitle, Select } from '@/components/ui';
import type { Package } from '@/lib/types';

type Row = { id: string; order: number; title: string; type: 'LIVE' | 'RECORDED'; startsAt: string | null; videoKey: string | null; package: { name: string }; instructor: { name: string } | null; _count: { materials: number } };

export default function AdminSessionsPage() {
  const [pkg, setPkg] = useState('');
  useEffect(() => { setPkg(new URLSearchParams(window.location.search).get('package') ?? ''); }, []);
  const qc = useQueryClient();
  const { data: packages } = useQuery({ queryKey: ['packages', 'all'], queryFn: () => api<Package[]>('/packages?all=1') });
  const { data, isLoading } = useQuery({ queryKey: ['admin-sessions', pkg], queryFn: () => api<Row[]>(`/sessions${pkg ? `?packageId=${pkg}` : ''}`) });

  return (
    <>
      <PageTitle title="Sessions" sub="Every session has a recording or live class, materials, an assignment and a quiz"
        action={<ButtonLink href="/dashboard/admin/sessions/new">New session</ButtonLink>} />
      <div className="mb-4 max-w-xs">
        <Select value={pkg} onChange={(e) => setPkg(e.target.value)} aria-label="Filter by package">
          <option value="">All packages</option>
          {packages?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
      {isLoading ? null : !data?.length ? <Empty>No sessions yet.</Empty> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[720px] text-left text-[15px]">
            <thead className="border-b border-line text-sm text-muted">
              <tr>{['#', 'Session', 'Package', 'Type', 'Instructor', ''].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-mono text-muted">{s.order}</td>
                  <td className="px-4 py-3"><Link href={`/dashboard/sessions/${s.id}`} className="font-semibold hover:underline">{s.title}</Link><div className="text-sm text-muted">{s._count.materials} materials</div></td>
                  <td className="px-4 py-3">{s.package.name}</td>
                  <td className="px-4 py-3">{s.type === 'LIVE' ? <Badge>Live · {fmtDate(s.startsAt, true)}</Badge> : <Badge tone={s.videoKey ? 'good' : 'warn'}>{s.videoKey ? 'Recorded' : 'No video'}</Badge>}</td>
                  <td className="px-4 py-3">{s.instructor?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link href={`/dashboard/admin/sessions/${s.id}/edit`} className="mr-4 text-sm font-semibold hover:underline">Edit</Link>
                    <button className="text-sm font-semibold text-danger hover:underline" onClick={async () => {
                      if (!confirm(`Delete "${s.title}"? Submissions and quiz results will be removed.`)) return;
                      await api(`/sessions/${s.id}`, { method: 'DELETE' });
                      qc.invalidateQueries({ queryKey: ['admin-sessions'] });
                    }}>Delete</button>
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
