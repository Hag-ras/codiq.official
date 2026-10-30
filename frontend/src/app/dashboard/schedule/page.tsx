'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Button, Card, Empty, PageTitle, cx } from '@/components/ui';
import { useLang, useT } from '@/components/i18n-provider';

type Item = {
  id: string; title: string; startsAt: string; endsAt: string; durationMin: number; packageName: string; track: string;
  instructorName: string | null; forChildren: string[] | null; isLiveNow: boolean; isPast: boolean;
};

const DAY = 86_400_000;
/** Egypt's week starts on Saturday. */
const WEEK_START = 6;
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function SchedulePage() {
  const t = useT();
  const lang = useLang();
  const locale = lang === 'ar' ? 'ar-EG' : 'en-GB';
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  // The grid always shows whole weeks, so it starts before the 1st and ends after the last day
  const { days, from, to } = useMemo(() => {
    const first = new Date(cursor);
    const lead = (first.getDay() - WEEK_START + 7) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const total = Math.ceil((lead + last.getDate()) / 7) * 7;
    const list = Array.from({ length: total }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    return { days: list, from: start, to: new Date(start.getFullYear(), start.getMonth(), start.getDate() + total) };
  }, [cursor]);

  const { data, isLoading } = useQuery({
    queryKey: ['schedule', from.toISOString()],
    queryFn: () => api<Item[]>(`/schedule?from=${from.toISOString()}&to=${to.toISOString()}`),
  });

  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    data?.forEach((i) => { const k = key(new Date(i.startsAt)); m.set(k, [...(m.get(k) ?? []), i]); });
    return m;
  }, [data]);

  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 31 + i).toLocaleDateString(locale, { weekday: 'short' })); // 31 Oct 2026 is a Saturday
  const month = cursor.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const todayKey = key(new Date());
  const inMonth = (d: Date) => d.getMonth() === cursor.getMonth();
  const monthItems = (data ?? []).filter((i) => new Date(i.startsAt).getMonth() === cursor.getMonth());

  const chip = (i: Item) => (
    <Link key={i.id} href={`/dashboard/sessions/${i.id}`}
      className={cx('block rounded-md border px-1.5 py-1 text-xs leading-tight hover:brightness-95',
        i.isLiveNow ? 'border-[#e8b4ae] bg-[#f7e1df] text-[#8a2a22]' : i.isPast ? 'border-line bg-paper text-muted' : 'border-transparent bg-(--accent-soft) text-ink')}
      title={`${i.title} · ${i.packageName}${i.forChildren ? ` · ${i.forChildren.join(', ')}` : ''}`}>
      <span className="font-mono font-semibold">{time(i.startsAt)}</span> <span className="break-words">{i.title}</span>
      {i.forChildren && <span className="block truncate text-[11px] opacity-75">{i.forChildren.join(', ')}</span>}
    </Link>
  );

  return (
    <>
      <PageTitle title={t('Schedule')} sub={t('Live classes in your calendar. Times are in your device time zone.')}
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="min-h-10 px-3" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label={t('Previous month')}>‹</Button>
            <Button variant="secondary" className="min-h-10" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>{t('Today')}</Button>
            <Button variant="secondary" className="min-h-10 px-3" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label={t('Next month')}>›</Button>
          </div>
        } />
      <h2 className="mb-3 font-mono text-xl font-bold">{month}</h2>

      {isLoading ? <div className="h-72 animate-pulse rounded-(--radius-card) bg-black/5" /> : (
        <>
          {/* Phones: a list is easier to read than a seven-column grid */}
          <div className="flex flex-col gap-3 md:hidden">
            {!monthItems.length ? <Empty>{t('No live classes this month.')}</Empty> : [...byDay].filter(([, v]) => monthItems.includes(v[0])).map(([k, list]) => (
              <Card key={k} className="p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  {new Date(list[0].startsAt).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })}
                  {k === todayKey && <Badge tone="accent">{t('Today')}</Badge>}
                </div>
                <div className="flex flex-col gap-1.5">{list.map(chip)}</div>
              </Card>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-(--radius-card) border border-line bg-white md:block">
            <div className="grid grid-cols-7 border-b border-line bg-paper text-center text-sm font-semibold text-muted">
              {weekdays.map((w) => <div key={w} className="py-2">{w}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const k = key(d), list = byDay.get(k) ?? [];
                return (
                  <div key={k} className={cx('min-h-28 border-e border-b border-line p-1.5 [&:nth-child(7n)]:border-e-0', !inMonth(d) && 'bg-paper/60')}>
                    <div className={cx('mb-1 grid size-6 place-items-center rounded-full text-xs font-semibold', k === todayKey ? 'bg-(--accent) text-(--on-accent)' : inMonth(d) ? 'text-ink' : 'text-muted')}>{d.getDate()}</div>
                    <div className="flex flex-col gap-1">{list.map(chip)}</div>
                  </div>
                );
              })}
            </div>
          </div>
          {!monthItems.length && <p className="mt-3 hidden text-sm text-muted md:block">{t('No live classes this month.')}</p>}
        </>
      )}
    </>
  );
}
