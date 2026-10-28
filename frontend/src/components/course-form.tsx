'use client';
import { useState } from 'react';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { TRACK_LABEL, type Package, type Track } from '@/lib/types';

export const blank = { name: '', track: 'KIDS' as Track, description: '', priceOneTime: '', priceMonthly: '', installmentsAllowed: true };
export type Values = typeof blank;
export const fromPackage = (p: Package): Values => ({
  name: p.name, track: p.track, description: p.description, priceOneTime: String(p.priceOneTime / 100),
  priceMonthly: p.priceMonthly ? String(p.priceMonthly / 100) : '', installmentsAllowed: p.installmentsAllowed,
});

export function CourseForm({ initial, submitLabel, onSubmit, onCancel }: { initial: Values; submitLabel: string; onSubmit: (v: Values) => Promise<void>; onCancel?: () => void }) {
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

export const courseBody = (v: Values) => ({
  name: v.name, track: v.track, description: v.description, priceOneTime: Math.round(Number(v.priceOneTime) * 100),
  priceMonthly: v.priceMonthly ? Math.round(Number(v.priceMonthly) * 100) : undefined, installmentsAllowed: v.installmentsAllowed,
});

