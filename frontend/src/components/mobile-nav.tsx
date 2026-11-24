'use client';
import { useState } from 'react';
import Link from 'next/link';

export type NavItem = { href: string; label: string };

/** Hamburger menu for small screens (hidden from md up, where the header shows the links inline). */
export function MobileNav({ items, label }: { items: NavItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={label}
        className="grid size-10 place-items-center rounded-full border border-line bg-white text-ink transition active:scale-95"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <>
          <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <nav className="absolute end-0 top-12 z-40 flex w-56 flex-col rounded-2xl border border-line bg-white p-2 text-[16px] shadow-xl">
            {items.map(i => (
              <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 font-medium hover:bg-black/5">
                {i.label}
              </Link>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
