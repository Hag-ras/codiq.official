'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { egp } from '@/lib/format';
import { ButtonLink, Logo } from '@/components/ui';
import type { Payment } from '@/lib/types';

function Result() {
  const id = useSearchParams().get('paymentId');
  // Paymob redirects here before (or after) the webhook lands, so poll until it settles.
  const { data } = useQuery({
    queryKey: ['payment', id],
    queryFn: () => api<Payment>(`/payments/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' ? 2500 : false),
  });

  const status = data?.status;
  const view =
    status === 'PAID'
      ? { title: 'You are enrolled', body: `${data!.package.name} is unlocked. Your first session is waiting in the dashboard.` }
      : status === 'FAILED'
        ? { title: 'Payment did not go through', body: 'No money was taken. You can try again or pick another method.' }
        : status === 'AWAITING_REVIEW'
          ? { title: 'Under review', body: 'We are confirming your InstaPay transfer.' }
          : { title: 'Confirming payment…', body: 'This usually takes a few seconds.' };

  return (
    <div className="flex min-h-dvh flex-col items-center px-5 py-10">
      <Link href="/" className="mb-10"><Logo size={26} /></Link>
      <div className="w-full max-w-[440px] rounded-2xl border border-line bg-white p-7 text-center">
        <h1 className="font-mono text-2xl font-bold tracking-[-0.03em]">{view.title}</h1>
        <p className="mt-2 text-[15px] text-[#4a4945]">{view.body}</p>
        {data && <p className="mt-4 font-mono text-sm text-muted">{egp(data.amount)} · {data.method.toLowerCase()} · #{data.id.slice(-8)}</p>}
        <div className="mt-6 flex justify-center gap-3">
          {status === 'FAILED' ? <ButtonLink href="/pricing">Try again</ButtonLink> : <ButtonLink href="/dashboard">Go to dashboard</ButtonLink>}
        </div>
      </div>
    </div>
  );
}

export default function CheckoutResultPage() {
  return <Suspense><Result /></Suspense>;
}
