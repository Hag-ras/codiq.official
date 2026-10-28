'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Logo, cx } from './ui';
import { Avatar } from './avatar';
import type { Me, Role } from '@/lib/types';

const NAV: Record<Role, [href: string, label: string][]> = {
  STUDENT: [['/dashboard', 'Home'], ['/dashboard/courses', 'Courses'], ['/dashboard/sessions', 'Sessions'], ['/dashboard/billing', 'Billing'], ['/dashboard/profile', 'Profile']],
  PARENT: [['/dashboard', 'Children'], ['/dashboard/catalog', 'Packages'], ['/dashboard/billing', 'Billing'], ['/dashboard/profile', 'Profile']],
  INSTRUCTOR: [['/dashboard', 'Teaching'], ['/dashboard/grading', 'Grading'], ['/dashboard/profile', 'Profile']],
  ASSISTANT: [['/dashboard', 'Sessions'], ['/dashboard/grading', 'Grading'], ['/dashboard/profile', 'Profile']],
  ADMIN: [
    ['/dashboard/admin', 'Overview'],
    ['/dashboard/admin/analytics', 'Analytics'],
    ['/dashboard/admin/packages', 'Courses'],
    ['/dashboard/admin/sessions', 'Sessions'],
    ['/dashboard/admin/payments', 'Payments'],
    ['/dashboard/admin/coupons', 'Coupons'],
    ['/dashboard/admin/assignments', 'Assignments'],
    ['/dashboard/admin/users', 'Users & team'],
    ['/dashboard/profile', 'Profile'],
  ],
};
const ROLE_LABEL: Record<Role, string> = { STUDENT: 'Student', PARENT: 'Parent', INSTRUCTOR: 'Instructor', ASSISTANT: 'Assistant', ADMIN: 'Admin' };

export function DashboardNav({ me }: { me: Me }) {
  const path = usePathname();
  const router = useRouter();
  const items = NAV[me.role];
  const active = (href: string) => (href === '/dashboard' || href === '/dashboard/admin' ? path === href : path.startsWith(href));
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => null);
    router.replace('/login');
    router.refresh();
  };

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-paper px-4 py-6 md:flex">
        <Link href="/" className="mb-8 px-2"><Logo /></Link>
        <nav className="flex flex-col gap-1">
          {items.map(([href, label]) => (
            <Link key={href} href={href}
              className={cx('flex min-h-11 items-center rounded-[10px] px-3 text-[15px] font-semibold', active(href) ? 'bg-ink text-paper' : 'text-[#4a4945] hover:bg-black/5')}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 border-t border-line px-2 pt-4">
          <Link href="/dashboard/profile" className="flex items-center gap-3 rounded-[10px] hover:bg-black/5" aria-label="Your profile">
            <Avatar name={me.name} src={me.avatar} size={40} />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold">{me.name}</div>
              <div className="text-sm text-muted">{ROLE_LABEL[me.role]}</div>
            </div>
          </Link>
          <button onClick={logout} className="self-start text-sm font-semibold text-muted hover:text-ink">Log out</button>
        </div>
      </aside>

      {/* Mobile: top bar + bottom tabs */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-paper px-5 py-3 md:hidden">
        <Link href="/"><Logo size={20} /></Link>
        <button onClick={logout} className="min-h-11 text-sm font-semibold text-muted">Log out</button>
      </header>
      <nav className={cx('fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden', items.length > 5 ? 'flex overflow-x-auto' : 'grid')}
        style={items.length > 5 ? undefined : { gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}>
        {items.map(([href, label]) => (
          <Link key={href} href={href}
            className={cx('flex min-h-14 items-center justify-center px-1 text-center text-[13px] font-semibold', items.length > 5 && 'min-w-[96px] shrink-0', active(href) ? 'text-(--accent)' : 'text-muted')}>
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
