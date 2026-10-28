'use client';
import { usePathname } from 'next/navigation';
import { AuthBackdrop } from '@/components/auth-backdrop';
import { SortBackdrop } from '@/components/sort-backdrop';

const AUTH_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password'];

/** Login and sign-up get the neural network; every other page gets bars that keep sorting themselves. */
export function SiteBackdrop() {
  const path = usePathname();
  return AUTH_PATHS.some((p) => path === p || path.startsWith(p + '/')) ? <AuthBackdrop /> : <SortBackdrop />;
}
