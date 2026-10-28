import Link from 'next/link';
import { Logo } from '@/components/ui';
import { Preferences } from '@/components/preferences';
import { AuthCard } from '@/components/auth-motion';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <Preferences className="absolute end-4 top-4" />
      <Link href="/" className="mb-8" aria-label="Codiq home"><Logo size={28} /></Link>
      <AuthCard>{children}</AuthCard>
    </div>
  );
}
