import Link from 'next/link';
import { Logo } from '@/components/ui';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-5 py-10">
      <Link href="/" className="mb-10" aria-label="Codiq home"><Logo size={26} /></Link>
      <div className="w-full max-w-[440px] rounded-2xl border border-line bg-white p-7">{children}</div>
    </div>
  );
}
