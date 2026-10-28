import { redirect } from 'next/navigation';
import { serverApi } from '@/lib/server-api';
import { DashboardNav } from '@/components/dashboard-nav';
import { Preferences } from '@/components/preferences';
import type { Me } from '@/lib/types';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const me = await serverApi<Me>('/auth/me');
  if (!me) redirect('/login?next=/dashboard');
  return (
    <div data-track={me.role === 'STUDENT' ? me.track ?? undefined : undefined} className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <DashboardNav me={me} />
      <main className="min-w-0 px-5 pt-6 pb-28 md:px-10 md:pt-10 md:pb-12">
        <div className="mx-auto max-w-5xl">
          <Preferences className="mb-4 hidden justify-end md:flex" />
          <div className="page-enter">{children}</div>
        </div>
      </main>
    </div>
  );
}
