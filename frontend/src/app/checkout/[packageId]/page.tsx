import { redirect } from 'next/navigation';
import { serverApi } from '@/lib/server-api';
import { CheckoutForm } from './checkout-form';
import type { Billing, Me, Package } from '@/lib/types';
import Link from 'next/link';
import { Logo } from '@/components/ui';

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ packageId: string }>; searchParams: Promise<{ billing?: Billing }> }) {
  const { packageId } = await params;
  const { billing } = await searchParams;
  const [pkg, me] = await Promise.all([serverApi<Package>(`/packages/${packageId}`), serverApi<Me>('/auth/me')]);
  if (!me) redirect(`/login?next=/checkout/${packageId}`);
  if (!pkg) redirect('/pricing');

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <Link href="/"><Logo /></Link>
          <Link href="/pricing" className="text-sm font-semibold text-muted hover:text-ink">← Back to packages</Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="mb-8 font-mono text-3xl font-bold tracking-[-0.03em]">Checkout</h1>
        <CheckoutForm pkg={pkg} me={me} initialBilling={billing === 'MONTHLY' && pkg.priceMonthly ? 'MONTHLY' : 'ONE_TIME'} />
      </main>
    </div>
  );
}
