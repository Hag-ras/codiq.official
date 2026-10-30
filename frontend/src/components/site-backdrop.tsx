'use client';
import { usePathname } from 'next/navigation';
import { AuthBackdrop } from '@/components/auth-backdrop';
import { BinaryRain } from '@/components/binary-rain';

const AUTH_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password'];
const is = (path: string, bases: string[]) => bases.some((p) => path === p || path.startsWith(p + '/'));

/** Login and sign-up get the neural network; every other page, dashboards included, gets a light rain of 0s and 1s. */
export function SiteBackdrop() {
  const path = usePathname();
  return is(path, AUTH_PATHS) ? <AuthBackdrop /> : <BinaryRain />;
}
