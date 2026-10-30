import Link from 'next/link';
import { cookies } from 'next/headers';
import { ButtonLink, Logo } from './ui';
import { Preferences } from './preferences';
import { getT } from '@/lib/i18n-server';

export async function SiteHeader() {
  const t = await getT();
  const signedIn = (await cookies()).has('refresh_token');
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
        <Link href="/" aria-label="Codiq home"><Logo /></Link>
        <nav className="hidden items-center gap-7 text-[15px] md:flex">
          <Link href="/#tracks" className="hover:text-clay">{t('Tracks')}</Link>
          <Link href="/pricing" className="hover:text-clay">{t('Packages')}</Link>
          <Link href="/#how" className="hover:text-clay">{t('How it works')}</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Preferences className="me-1" />
          {signedIn ? (
            <ButtonLink href="/dashboard">{t('Dashboard')}</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost">{t('Log in')}</ButtonLink>
              <ButtonLink href="/signup">{t('Get started')}</ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export async function SiteFooter() {
  const t = await getT();
  return (
    <>
    <footer className="mt-24 bg-night text-day">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-10">
        <div className="flex flex-col gap-2">
          <Logo dark />
          <span className="font-mono text-sm text-[#b4b2ac]">{t('Think it. Code it.')}</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#b4b2ac]">
          <Link href="/pricing" className="hover:text-day">{t('Packages')}</Link>
          <Link href="/login" className="hover:text-day">{t('Log in')}</Link>
          <Link href="/terms" className="hover:text-day">{t('Terms')}</Link>
          <Link href="/privacy" className="hover:text-day">{t('Privacy')}</Link>
          <span>© {new Date().getFullYear()} Codiq</span>
        </div>
      </div>
    </footer>
    </>
  );
}
