import { cx } from './ui';

/** Vertical bars over time. `format` is used for the value above the bar on hover and for screen readers. */
export function BarChart({ data, format, height = 176, color = 'bg-clay' }: { data: { label: string; value: number }[]; format: (n: number) => string; height?: number; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const dense = data.length > 14;
  const every = Math.ceil(data.length / 6);
  return (
    <div role="img" aria-label={`Bar chart, ${data.length} points. Highest ${format(max)}`}>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((d) => (
          <div key={d.label} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${d.label}: ${format(d.value)}`}>
            <div className={cx('w-full rounded-t-[3px]', color)} style={{ height: `${d.value ? Math.max(3, (d.value / max) * 100) : 1}%`, opacity: d.value ? 1 : 0.2 }} />
            <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-paper group-hover:block">{format(d.value)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px] text-[11px] text-muted">
        {data.map((d, i) => (
          <span key={d.label} className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap">{!dense || i % every === 0 ? d.label.slice(dense ? 5 : 5) : ''}</span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal share bars: label, bar, value. */
export function HBars({ rows, format }: { rows: { label: string; value: number; sub?: string }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-[15px] text-muted">No data in this period.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm"><span className="truncate font-semibold">{r.label}{r.sub && <span className="font-normal text-muted"> · {r.sub}</span>}</span><span className="shrink-0 font-mono">{format(r.value)}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-[#ece9e2]"><div className="h-full rounded-full bg-clay" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return <span className="text-sm text-muted">{now ? 'new' : '—'}</span>;
  const pct = Math.round(((now - before) / before) * 100);
  return <span className={cx('text-sm font-semibold', pct >= 0 ? 'text-[#2f6449]' : 'text-danger')}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct)}% vs previous</span>;
}
