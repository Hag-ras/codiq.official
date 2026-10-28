import { SiteFooter, SiteHeader } from '@/components/site';
import { PricingGrid } from '@/components/pricing-grid';
import { publicApi } from '@/lib/server-api';
import type { Package, Track } from '@/lib/types';

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ track?: Track }> }) {
  const { track } = await searchParams;
  const packages = await publicApi<Package[]>('/packages').catch(() => [] as Package[]);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pt-14">
        <h1 className="font-mono text-[clamp(34px,5vw,52px)] font-bold tracking-[-0.04em]">Packages</h1>
        <p className="mt-2 mb-8 max-w-xl text-[17px] text-[#4a4945]">
          Every session includes a recording, materials, an assignment and a quiz. Pay once or monthly; installments on selected packages.
        </p>
        <PricingGrid packages={packages} initialTrack={track} />
      </main>
      <SiteFooter />
    </>
  );
}
