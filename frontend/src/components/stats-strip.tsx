'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from './i18n-provider';

type Stats = {
  points: number; streak: number; bestStreak: number; activeToday: boolean; level: number; levelFloor: number; levelCeil: number;
  breakdown: { lessons: number; liveClasses: number; quizzes: number; assignments: number };
};

const Flame = ({ lit }: { lit: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden className={lit ? 'text-[#c9791b]' : 'text-muted'}>
    <path d="M12 2s5 4.5 5 9.5a5 5 0 0 1-10 0c0-1.7.8-3 1.5-3.8.3 1.2 1 2 2 2.3C10 7 11 4 12 2zm0 20a3.5 3.5 0 0 1-3.5-3.5c0-1.7 1.3-2.6 2-3.9.4.9 1.2 1.2 1.7 1.2 1.1 0 3.3 1.1 3.3 3.2A3.5 3.5 0 0 1 12 22z" />
  </svg>
);

/**
 * Small row: day streak, points and level. Computed on the server from what the student already did.
 * Pass childId to show a child's numbers to their parent.
 */
export function StatsStrip({ childId }: { childId?: string }) {
  const t = useT();
  const { data } = useQuery({ queryKey: ['stats', childId ?? 'me'], queryFn: () => api<Stats>(childId ? `/progress/stats/${childId}` : '/progress/stats'), staleTime: 60_000 });
  if (!data) return <div className="h-[62px] animate-pulse rounded-xl bg-black/5" />;
  const span = Math.max(1, data.levelCeil - data.levelFloor);
  const pct = Math.min(100, Math.round(((data.points - data.levelFloor) / span) * 100));
  const b = data.breakdown;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-line bg-white px-4 py-3" title={t('Points: lessons {a}, live classes {b}, quizzes {c}, assignments {d}', { a: b.lessons, b: b.liveClasses, c: b.quizzes, d: b.assignments })}>
      <div className="flex items-center gap-2">
        <Flame lit={data.streak > 0} />
        <div className="leading-tight">
          <div className="font-mono text-lg font-bold">{data.streak}</div>
          <div className="text-xs text-muted">{data.streak === 1 ? t('day in a row') : t('days in a row')}</div>
        </div>
      </div>
      <div className="leading-tight">
        <div className="font-mono text-lg font-bold">{data.points}</div>
        <div className="text-xs text-muted">{t('points')}</div>
      </div>
      <div className="min-w-40 flex-1">
        <div className="mb-1 flex justify-between text-xs text-muted"><span>{t('Level {n}', { n: data.level })}</span><span className="font-mono">{data.levelCeil - data.points} {t('to level {n}', { n: data.level + 1 })}</span></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-(--accent-soft)"><div className="h-full rounded-full bg-(--accent) transition-[width] duration-700" style={{ width: `${pct}%` }} /></div>
      </div>
      {!data.activeToday && data.streak > 0 && <span className="text-xs text-muted">{t('Do something today to keep your streak')}</span>}
    </div>
  );
}
