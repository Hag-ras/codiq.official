'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { egp } from '@/lib/format';
import { Badge, Button, Card, Field, Input, PageTitle, Select, Textarea } from '@/components/ui';
import { TRACK_LABEL, type Package, type Track } from '@/lib/types';

const blank = { name: '', track: 'KIDS' as Track, description: '', priceOneTime: '', priceMonthly: '', installmentsAllowed: true };
type Values = typeof blank;
const fromPackage = (p: Package): Values => ({
  name: p.name, track: p.track, description: p.description, priceOneTime: String(p.priceOneTime / 100),
  priceMonthly: p.priceMonthly ? String(p.priceMonthly / 100) : '', installmentsAllowed: p.installmentsAllowed,
});

function CourseForm({ initial, submitLabel, onSubmit, onCancel }: { initial: Values; submitLabel: string; onSubmit: (v: Values) => Promise<void>; onCancel?: () => void }) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV({ ...v, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => {
      e.preventDefault(); setError(''); setBusy(true);
      try { await onSubmit(v); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
    }}>
      <Field label="Name"><Input value={v.name} onChange={set('name')} minLength={2} required /></Field>
      <Field label="Track"><Select value={v.track} onChange={set('track')}>{(['KIDS', 'SCHOOL', 'COLLEGE'] as const).map((t) => <option key={t} value={t}>{TRACK_LABEL[t]}</option>)}</Select></Field>
      <div className="sm:col-span-2"><Field label="Description"><Textarea rows={2} value={v.description} onChange={set('description')} required /></Field></div>
      <Field label="One-time price (EGP)"><Input type="number" min={0} step="any" value={v.priceOneTime} onChange={set('priceOneTime')} required /></Field>
      <Field label="Monthly price (EGP)" hint="Leave empty for one-time only"><Input type="number" min={0} step="any" value={v.priceMonthly} onChange={set('priceMonthly')} /></Field>
      <label className="flex min-h-11 items-center gap-2 text-[15px] sm:col-span-2">
        <input type="checkbox" checked={v.installmentsAllowed} onChange={set('installmentsAllowed')} className="size-4 accent-ink" /> Allow installments (valU, Souhoola, banks)
      </label>
      {error && <p className="rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button>{onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}</div>
    </form>
  );
}

const body = (v: Values) => ({
  name: v.name, track: v.track, description: v.description, priceOneTime: Math.round(Number(v.priceOneTime) * 100),
  priceMonthly: v.priceMonthly ? Math.round(Number(v.priceMonthly) * 100) : undefined, installmentsAllowed: v.installmentsAllowed,
});

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
          <CourseForm initial={blank} submitLabel="Create course" onSubmit={async (v) => { await api('/packages', { method: 'POST', json: body(v) }); setOpen(false); refresh(); }} />
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.map((p) => (
          <Card key={p.id} className="flex flex-col gap-3">
            {editing === p.id ? (
              <CourseForm initial={fromPackage(p)} submitLabel="Save changes" onCancel={() => setEditing(null)}
                onSubmit={async (v) => { await api(`/packages/${p.id}`, { method: 'PATCH', json: body(v) }); setEditing(null); setNotice({ ok: true, text: 'Saved.' }); refresh(); }} />
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div><div className="text-sm text-muted">{TRACK_LABEL[p.track]}</div><h2 className="text-lg font-bold">{p.name}</h2></div>
                  {p.isPublished ? <Badge tone="good">Published</Badge> : <Badge>Hidden</Badge>}
                </div>
                <p className="text-[15px] text-[#4a4945]">{p.description}</p>
                <div className="font-mono text-[15px]">{egp(p.priceOneTime)}{p.priceMonthly ? ` · ${egp(p.priceMonthly)}/mo` : ''}</div>
                <div className="text-sm text-muted">{p._count?.sessions ?? 0} sessions · {p._count?.enrollments ?? 0} students{p.installmentsAllowed ? ' · installments' : ''}</div>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
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
