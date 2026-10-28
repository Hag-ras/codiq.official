export const egp = (piasters: number) => `${(piasters / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} EGP`;

export const fmtDate = (d: string | Date | null, withTime = false) =>
  d
    ? new Date(d).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', ...(withTime ? { hour: 'numeric', minute: '2-digit', hour12: true } : {}),
      })
    : '—';

export const fmtSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
