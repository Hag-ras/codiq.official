import Link from 'next/link';
import { cookies } from 'next/headers';
import { ButtonLink, Logo } from './ui';

export async function SiteHeader() {
  const signedIn = (await cookies()).has('refresh_token');
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
        <Link href="/" aria-label="Codiq home"><Logo /></Link>
        <nav className="hidden items-center gap-7 text-[15px] md:flex">
          <Link href="/#tracks" className="hover:text-clay">Tracks</Link>
          <Link href="/pricing" className="hover:text-clay">Packages</Link>
          <Link href="/#how" className="hover:text-clay">How it works</Link>
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <ButtonLink href="/dashboard">Dashboard</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost">Log in</ButtonLink>
              <ButtonLink href="/signup">Get started</ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-ink text-paper">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-10">
        <div className="flex flex-col gap-2">
          <Logo dark />
          <span className="font-mono text-sm text-[#b4b2ac]">Think it. Code it.</span>
        </div>
        <div className="flex gap-6 text-sm text-[#b4b2ac]">
          <Link href="/pricing" className="hover:text-paper">Packages</Link>
          <Link href="/login" className="hover:text-paper">Log in</Link>
          <span>© {new Date().getFullYear()} Codiq</span>
        </div>
      </div>
    </footer>
  );
}
