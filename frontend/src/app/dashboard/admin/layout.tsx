import { redirect } from 'next/navigation';
import { serverApi } from '@/lib/server-api';
import type { Me } from '@/lib/types';

/**
 * Second lock on every /dashboard/admin page. The middleware already checks the token's role;
 * this asks the API (which reads the CURRENT role from the database), so a demoted admin is
 * turned away even while their old token is still valid. The API enforces the same rule.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await serverApi<Me>('/auth/me');
  if (!me) redirect('/login?next=/dashboard/admin');
  if (me.role !== 'ADMIN') redirect('/dashboard?denied=1');
  return <>{children}</>;
}
