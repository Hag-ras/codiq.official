import { redirect } from 'next/navigation';
import { serverApi } from '@/lib/server-api';
import { StudentHome } from '@/components/home/student-home';
import { ParentHome } from '@/components/home/parent-home';
import { ParentRequests } from '@/components/home/parent-requests';
import { InstructorHome } from '@/components/home/instructor-home';
import type { Me } from '@/lib/types';

export default async function DashboardHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const me = (await serverApi<Me>('/auth/me'))!;
  const { denied } = await searchParams;
  if (me.role === 'ADMIN') redirect('/dashboard/admin');
  return (
    <>
      {denied && (
        <p className="mb-6 rounded-xl bg-[#f6ecd6] px-4 py-3 text-[15px] text-[#7a5a17]">That page isn't available for your account, so we brought you home.</p>
      )}
      {me.role === 'STUDENT' && <><ParentRequests /><StudentHome me={me} /></>}
      {me.role === 'PARENT' && <ParentHome />}
      {(me.role === 'INSTRUCTOR' || me.role === 'ASSISTANT') && <InstructorHome me={me} />}
    </>
  );
}
