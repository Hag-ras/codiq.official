'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLang, useT } from './i18n-provider';
import { LANG_COOKIE } from '@/lib/i18n';

/** Language (EN / ع) and light / dark switches. Meant for the top right corner. */
export function Preferences({ className = '' }: { className?: string }) {
  const router = useRouter();
  const lang = useLang();
  const t = useT();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => { setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'); }, []);

  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.add('theme-fade');
    document.documentElement.dataset.theme = next;
    setTimeout(() => document.documentElement.classList.remove('theme-fade'), 400);
    try { localStorage.setItem('theme', next); } catch { /* private mode: it just won't be remembered */ }
    setTheme(next);
  };
  const switchLang = () => {
    document.cookie = `${LANG_COOKIE}=${lang === 'ar' ? 'en' : 'ar'}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  const btn = 'grid size-10 place-items-center rounded-full border border-line bg-white text-[15px] font-semibold text-ink transition hover:scale-105 hover:border-ink active:scale-95';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button type="button" onClick={switchLang} className={btn} aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'} title={lang === 'ar' ? 'English' : 'العربية'}>
        {lang === 'ar' ? 'EN' : 'ع'}
      </button>
      <button type="button" onClick={flip} className={btn} aria-label={theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')} title={theme === 'dark' ? t('Light mode') : t('Dark mode')}>
        <svg key={theme} className="animate-spin-in" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {theme === 'dark' ? (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>) : (<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />)}
        </svg>
      </button>
    </div>
  );
}
