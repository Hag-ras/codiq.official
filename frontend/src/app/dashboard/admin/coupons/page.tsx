'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { egp, fmtDate } from '@/lib/format';
import { Badge, Button, Card, Empty, Field, Input, PageTitle, Select, cx } from '@/components/ui';
import { TRACK_LABEL } from '@/lib/types';
import type { AdminCoupon, Package, Track } from '@/lib/types';

const blank = { mode: 'single' as 'single' | 'bulk', code: '', prefix: '', count: '10', description: '', type: 'PERCENT' as 'PERCENT' | 'FIXED', value: '10', maxRedemptions: '', expiresAt: '', packageId: '', track: '' as Track | '' };

const label = (c: Pick<AdminCoupon, 'type' | 'value'>) => (c.type === 'PERCENT' ? `${c.value}% off` : `${egp(c.value)} off`);
const state = (c: AdminCoupon) => !c.active ? ['Off', 'neutral'] as const : c.expiresAt && new Date(c.expiresAt) < new Date() ? ['Expired', 'bad'] as const : c.maxRedemptions !== null && c.redeemedCount >= c.maxRedemptions ? ['Used up', 'warn'] as const : ['Active', 'good'] as const;

export default function CouponsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['coupons'], queryFn: () => api<AdminCoupon[]>('/admin/coupons') });
  const { data: packages } = useQuery({ queryKey: ['packages', 'all'], queryFn: () => api<Package[]>('/packages?all=1') });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(blank);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [generated, setGenerated] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const refresh = () => qc.invalidateQueries({ queryKey: ['coupons'] });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setNotice(''); setGenerated([]); setBusy(true);
    const common = {
      type: v.type, value: v.type === 'FIXED' ? Math.round(Number(v.value) * 100) : Number(v.value),
      description: v.description || undefined, maxRedemptions: v.maxRedemptions ? Number(v.maxRedemptions) : undefined,
      expiresAt: v.expiresAt ? new Date(`${v.expiresAt}T23:59:59`).toISOString() : undefined, packageId: v.packageId || undefined, track: v.track || undefined,
    };
    try {
      if (v.mode === 'single') {
        const c = await api<AdminCoupon>('/admin/coupons', { method: 'POST', json: { ...common, code: v.code || undefined, prefix: v.code ? undefined : v.prefix || undefined } });
        setNotice(`Created ${c.code}`); setGenerated([c.code]);
      } else {
        const r = await api<{ count: number; codes: string[] }>('/admin/coupons/generate', { method: 'POST', json: { ...common, count: Number(v.count), prefix: v.prefix || undefined } });
        setNotice(`Generated ${r.count} codes`); setGenerated(r.codes);
      }
      refresh();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => setNotice('Copied to clipboard'));
  const csv = () => {
    const rows = ['code,discount,max_uses,expires', ...(data ?? []).map((c) => [c.code, label(c), c.maxRedemptions ?? 'unlimited', c.expiresAt ? c.expiresAt.slice(0, 10) : ''].join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    a.download = 'codiq-coupons.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
  const toggle = async (c: AdminCoupon) => { await api(`/admin/coupons/${c.id}`, { method: 'PATCH', json: { active: !c.active } }); refresh(); };
  const remove = async (c: AdminCoupon) => {
    if (!confirm(`Delete ${c.code}?`)) return;
    try { await api(`/admin/coupons/${c.id}`, { method: 'DELETE' }); refresh(); } catch (err) { setNotice((err as Error).message); }
  };

  return (
    <>
      <PageTitle title="Coupons" sub="Create discount codes one by one, or generate a batch to share."
        action={<div className="flex gap-2"><Button variant="secondary" onClick={csv} disabled={!data?.length}>Export CSV</Button><Button onClick={() => setOpen(!open)}>{open ? 'Close' : 'New coupon'}</Button></div>} />
      {notice && <p role="status" className="mb-4 rounded-lg bg-[#e1eee6] px-4 py-3 text-[15px] text-[#2f6449]">{notice}</p>}

      {open && (
        <Card className="mb-6">
          <div className="mb-4 grid max-w-sm grid-cols-2 gap-1 rounded-xl bg-paper p-1">
            {(['single', 'bulk'] as const).map((m) => <button key={m} type="button" onClick={() => setV({ ...v, mode: m })} className={cx('min-h-10 rounded-lg text-sm font-semibold', v.mode === m ? 'bg-white shadow-sm' : 'text-muted')}>{m === 'single' ? 'One code' : 'Generate a batch'}</button>)}
          </div>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
            {v.mode === 'single' ? (
              <>
                <Field label="Code" hint="Leave empty to generate one"><Input value={v.code} onChange={set('code')} placeholder="SUMMER25" className="font-mono uppercase" /></Field>
                {!v.code && <Field label="Prefix (optional)"><Input value={v.prefix} onChange={set('prefix')} placeholder="EID" maxLength={12} className="font-mono uppercase" /></Field>}
              </>
            ) : (
              <>
                <Field label="How many codes" hint="1 to 200"><Input type="number" min={1} max={200} value={v.count} onChange={set('count')} required /></Field>
                <Field label="Prefix (optional)" hint="Codes look like EID-7K2M9Q"><Input value={v.prefix} onChange={set('prefix')} placeholder="EID" maxLength={12} className="font-mono uppercase" /></Field>
              </>
            )}
            <Field label="Discount type"><Select value={v.type} onChange={set('type')}><option value="PERCENT">Percentage off</option><option value="FIXED">Fixed amount off (EGP)</option></Select></Field>
            <Field label={v.type === 'PERCENT' ? 'Percent (1-100)' : 'Amount (EGP)'} hint={v.type === 'PERCENT' && v.value === '100' ? '100% makes the course free' : undefined}><Input type="number" min={1} max={v.type === 'PERCENT' ? 100 : undefined} value={v.value} onChange={set('value')} required /></Field>
            <Field label="Uses per code" hint="Empty = unlimited"><Input type="number" min={1} value={v.maxRedemptions} onChange={set('maxRedemptions')} placeholder={v.mode === 'bulk' ? '1' : ''} /></Field>
            <Field label="Expires on" hint="Empty = never"><Input type="date" value={v.expiresAt} onChange={set('expiresAt')} /></Field>
            <Field label="Only for course"><Select value={v.packageId} onChange={set('packageId')}><option value="">Any course</option>{packages?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Only for track"><Select value={v.track} onChange={set('track')}><option value="">Any track</option>{(['KIDS', 'SCHOOL', 'COLLEGE'] as const).map((t) => <option key={t} value={t}>{TRACK_LABEL[t]}</option>)}</Select></Field>
            <div className="sm:col-span-3"><Field label="Note (only you see this)"><Input value={v.description} onChange={set('description')} placeholder="Eid campaign, Instagram giveaway…" /></Field></div>
            {error && <p className="rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger sm:col-span-3">{error}</p>}
            <div className="sm:col-span-3"><Button type="submit" disabled={busy}>{busy ? 'Working…' : v.mode === 'single' ? 'Create coupon' : `Generate ${v.count || ''} codes`}</Button></div>
          </form>
          {generated.length > 0 && (
            <div className="mt-5 rounded-xl bg-paper p-4">
              <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">{generated.length} new code{generated.length > 1 ? 's' : ''}</span><Button variant="secondary" onClick={() => copy(generated.join('\n'))}>Copy all</Button></div>
              <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">{generated.map((c) => <code key={c} className="rounded-md bg-white px-2 py-1 font-mono text-sm">{c}</code>)}</div>
            </div>
          )}
        </Card>
      )}

      {isLoading ? <div className="h-40 animate-pulse rounded-(--radius-card) bg-black/5" /> : !data?.length ? <Empty>No coupons yet. Create your first one above.</Empty> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[900px] text-left text-[15px]">
            <thead className="border-b border-line text-sm text-muted"><tr>{['Code', 'Discount', 'Applies to', 'Used', 'Expires', 'Status', ''].map((h, i) => <th key={i} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {data.map((c) => {
                const [text, tone] = state(c);
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3"><button onClick={() => copy(c.code)} className="font-mono font-bold hover:text-clay" title="Copy code">{c.code}</button>{c.description && <div className="text-sm text-muted">{c.description}</div>}</td>
                    <td className="px-4 py-3">{label(c)}</td>
                    <td className="px-4 py-3 text-sm">{c.packageName ?? (c.track ? TRACK_LABEL[c.track] : 'Any course')}</td>
                    <td className="px-4 py-3 font-mono">{c.redeemedCount}{c.maxRedemptions !== null ? ` / ${c.maxRedemptions}` : ''}{c.discountTotal > 0 && <div className="text-xs text-muted">saved {egp(c.discountTotal)}</div>}</td>
                    <td className="px-4 py-3">{c.expiresAt ? fmtDate(c.expiresAt) : '—'}</td>
                    <td className="px-4 py-3"><Badge tone={tone}>{text}</Badge></td>
                    <td className="px-4 py-2"><div className="flex justify-end gap-2"><Button variant="secondary" className="min-h-9 py-1.5" onClick={() => toggle(c)}>{c.active ? 'Turn off' : 'Turn on'}</Button><Button variant="danger" className="min-h-9 py-1.5" onClick={() => remove(c)} aria-label={`Delete ${c.code}`}>Delete</Button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
