'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { egp } from '@/lib/format';
import { Badge, Button, Card, PageTitle } from '@/components/ui';
import { CourseForm, blank, courseBody, fromPackage } from '@/components/course-form';
import { TRACK_LABEL, type Package } from '@/lib/types';

export default function AdminCoursesPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['packages', 'all'], queryFn: () => api<Package[]>('/packages?all=1') });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['packages'] });

  const togglePublished = async (p: Package) => { await api(`/packages/${p.id}`, { method: 'PATCH', json: { isPublished: !p.isPublished } }); refresh(); };
  const remove = async (p: Package) => {
    if (!confirm(`Delete "${p.name}" and all of its sessions permanently?`)) return;
    try { await api(`/packages/${p.id}`, { method: 'DELETE' }); setNotice({ ok: true, text: `"${p.name}" was deleted.` }); refresh(); }
    catch (e) { setNotice({ ok: false, text: (e as Error).message }); }
  };

  return (
    <>
      <PageTitle title="Courses" sub="Add, edit, hide or delete what students can buy." action={<Button onClick={() => setOpen(!open)}>{open ? 'Close' : 'New course'}</Button>} />
      {notice && <p role="status" className={notice.ok ? 'mb-4 rounded-lg bg-[#e1eee6] px-4 py-3 text-[15px] text-[#2f6449]' : 'mb-4 rounded-lg bg-[#f7e1df] px-4 py-3 text-[15px] text-danger'}>{notice.text}</p>}
      {open && (
        <Card className="mb-6">
          <CourseForm initial={blank} submitLabel="Create course" onSubmit={async (v) => { await api('/packages', { method: 'POST', json: courseBody(v) }); setOpen(false); refresh(); }} />
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.map((p) => (
          <Card key={p.id} className="relative flex flex-col gap-3">
            {editing === p.id ? (
              <CourseForm initial={fromPackage(p)} submitLabel="Save changes" onCancel={() => setEditing(null)}
                onSubmit={async (v) => { await api(`/packages/${p.id}`, { method: 'PATCH', json: courseBody(v) }); setEditing(null); setNotice({ ok: true, text: 'Saved.' }); refresh(); }} />
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div><div className="text-sm text-muted">{TRACK_LABEL[p.track]}</div><h2 className="text-lg font-bold"><Link href={`/dashboard/admin/packages/${p.id}`} className="after:absolute after:inset-0 hover:underline">{p.name}</Link></h2></div>
                  {p.isPublished ? <Badge tone="good">Published</Badge> : <Badge>Hidden</Badge>}
                </div>
                <p className="text-[15px] text-[#4a4945]">{p.description}</p>
                <div className="font-mono text-[15px]">{egp(p.priceOneTime)}{p.priceMonthly ? ` · ${egp(p.priceMonthly)}/mo` : ''}</div>
                <div className="text-sm text-muted">{p._count?.sessions ?? 0} sessions · {p._count?.enrollments ?? 0} students{p.installmentsAllowed ? ' · installments' : ''}</div>
                <div className="relative z-10 mt-auto flex flex-wrap gap-2 pt-1">
                  <Button variant="secondary" onClick={() => setEditing(p.id)}>Edit</Button>
                  <Link href={`/dashboard/admin/sessions?package=${p.id}`} className="inline-flex min-h-11 items-center rounded-[10px] border border-line bg-white px-4 text-[15px] font-semibold hover:border-ink">Sessions</Link>
                  <Button variant="ghost" onClick={() => togglePublished(p)}>{p.isPublished ? 'Hide from shop' : 'Publish'}</Button>
                  <Button variant="danger" onClick={() => remove(p)} aria-label={`Delete ${p.name}`}>Delete</Button>
                </div>
              </>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
