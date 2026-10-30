import Link from 'next/link';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Logo({ size = 22, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-[3px] font-mono font-bold leading-none tracking-[-0.04em]" style={{ fontSize: size }}>
      <span className={dark ? 'text-day' : 'text-ink'}>codiq</span>
      <span
        aria-hidden
        className="animate-blink rounded-[1px]"
        style={{ width: size * 0.42, height: size * 0.86, background: dark ? '#7fa8e3' : '#2b62b3' }}
      />
    </span>
  );
}

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'btn-shine bg-ink text-paper hover:opacity-90',
  accent: 'bg-(--accent) text-white hover:brightness-110',
  secondary: 'bg-white text-ink border border-line hover:border-ink',
  ghost: 'text-ink hover:bg-black/5',
  danger: 'bg-white text-danger border border-danger/30 hover:bg-danger/5',
};
const btnBase = 'inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[15px] font-semibold transition disabled:opacity-50 disabled:pointer-events-none min-h-11';

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={cx(btnBase, variants[variant], className)} {...p} />;
}
export function ButtonLink({ href, variant = 'primary', className, children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return <Link href={href} className={cx(btnBase, variants[variant], className)}>{children}</Link>;
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#4a4945]">
      {label}
      {children}
      {hint && !error && <span className="font-normal text-muted">{hint}</span>}
      {error && <span className="font-normal text-danger">{error}</span>}
    </label>
  );
}
const inputCls = 'w-full rounded-[10px] border border-[#d9d4ca] bg-white px-3 py-2.5 text-[15px] font-normal text-ink outline-none focus:border-ink min-h-11';
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={4} {...p} className={cx(inputCls, p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, p.className)} />;

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-(--radius-card) border border-line bg-white p-5', className)}>{children}</div>;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'live'; children: ReactNode }) {
  const t = {
    neutral: 'bg-[#ece9e2] text-[#4a4945]',
    accent: 'bg-(--accent-soft) text-(--accent)',
    good: 'bg-[#e1eee6] text-[#2f6449]',
    warn: 'bg-[#f6ecd6] text-[#7a5a17]',
    bad: 'bg-[#f7e1df] text-danger',
    live: 'bg-clay text-white',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', t)}>{children}</span>;
}

export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-mono text-[26px] font-bold tracking-[-0.03em]">{title}</h1>
        {sub && <p className="mt-1 text-[15px] text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#ece9e2]">
      <div className="h-full rounded-full bg-(--accent) transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-(--radius-card) border border-dashed border-line p-8 text-center text-[15px] text-muted">{children}</div>;
}

export { cx };
