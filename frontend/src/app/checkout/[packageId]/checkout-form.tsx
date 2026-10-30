'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api, uploadFile } from '@/lib/api';
import { egp } from '@/lib/format';
import { Button, Card, Field, Input, Select, cx } from '@/components/ui';
import { useT } from '@/components/i18n-provider';
import { TRACK_LABEL, type Billing, type Me, type Package, type PayMethod } from '@/lib/types';

const METHODS: { id: PayMethod; name: string; note: string }[] = [
  { id: 'CARD', name: 'Debit / credit card', note: 'Visa, Mastercard, Meeza. Secured with 3-D Secure.' },
  { id: 'WALLET', name: 'Mobile wallet', note: 'Vodafone Cash, Orange, Etisalat, WE Pay.' },
  { id: 'INSTALLMENTS', name: 'Installments', note: 'valU, Souhoola or bank plans. Approval in minutes.' },
  { id: 'FAWRY', name: 'Fawry', note: 'Get a reference code and pay at any Fawry outlet or in the Fawry app.' },
  { id: 'INSTAPAY', name: 'InstaPay', note: 'Transfer from your bank app, then upload the receipt.' },
];

type Quote = { code: string; discount: number; finalAmount: number; label: string };
type Result =
  | { free: true; method: PayMethod; paymentId: string; amount: 0 }
  | { method: 'FAWRY'; paymentId: string; amount: number; fawryReference: string; expiresAt: string }
  | { method: 'INSTAPAY'; paymentId: string; amount: number; instapayAddress: string }
  | { method: 'CARD' | 'WALLET' | 'INSTALLMENTS'; paymentId: string; amount: number; redirectUrl: string };

export function CheckoutForm({ pkg, me, initialBilling }: { pkg: Package; me: Me; initialBilling: Billing }) {
  const t = useT();
  const [billing, setBilling] = useState<Billing>(initialBilling);
  const [method, setMethod] = useState<PayMethod>('CARD');
  const [studentId, setStudentId] = useState(me.children[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [code, setCode] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [couponError, setCouponError] = useState('');
  const [checking, setChecking] = useState(false);

  // Only methods whose keys are set on the server are offered (so nobody can pick Fawry before it exists)
  const { data: enabled } = useQuery({ queryKey: ['pay-methods'], queryFn: () => api<Record<PayMethod, boolean>>('/payments/methods'), staleTime: 5 * 60_000 });
  const baseAmount = billing === 'ONE_TIME' ? pkg.priceOneTime : pkg.priceMonthly!;
  const amount = quote ? quote.finalAmount : baseAmount;
  const methods = METHODS.filter((m) => (m.id !== 'INSTALLMENTS' || (billing === 'ONE_TIME' && pkg.installmentsAllowed)) && (enabled ? enabled[m.id] : m.id !== 'FAWRY'));
  useEffect(() => { if (methods.length && !methods.some((m) => m.id === method)) setMethod(methods[0].id); }, [methods, method]);
  const isParent = me.role === 'PARENT';

  async function applyCoupon() {
    setCouponError(''); setChecking(true);
    try {
      setQuote(await api<Quote>('/coupons/validate', { method: 'POST', json: { code, packageId: pkg.id, billing } }));
    } catch (e) {
      setQuote(null); setCouponError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }
  const clearCoupon = () => { setQuote(null); setCode(''); setCouponError(''); };

  async function pay() {
    setError('');
    setBusy(true);
    try {
      const r = await api<Result>('/payments/checkout', {
        method: 'POST',
        json: { packageId: pkg.id, billing, method, studentId: isParent ? studentId : undefined, couponCode: quote?.code },
      });
      if ('free' in r) return void setResult(r);
      if ('redirectUrl' in r) return void (window.location.href = r.redirectUrl);
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-6 md:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col gap-6">
        {result && 'free' in result ? (
          <Card>
            <h2 className="text-xl font-bold">{t("You're in!")}</h2>
            <p className="mt-1 text-[15px] text-[#4a4945]">{t('Your code covered the full price, so the course is already unlocked.')}</p>
            <Link href="/dashboard" className="mt-4 inline-block font-semibold underline">{t('Go to dashboard')}</Link>
          </Card>
        ) : result?.method === 'FAWRY' ? (
          <FawryPanel r={result} />
        ) : result?.method === 'INSTAPAY' ? (
          <InstapayPanel r={result} />
        ) : (
          <>
            {pkg.priceMonthly && (
              <Card>
                <h2 className="mb-3 font-semibold">{t('Billing')}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(['ONE_TIME', 'MONTHLY'] as const).map((b) => (
                    <Option key={b} active={billing === b} onClick={() => { setBilling(b); clearCoupon(); if (b === 'MONTHLY' && method === 'INSTALLMENTS') setMethod('CARD'); }}
                      title={b === 'ONE_TIME' ? t('Pay once') : t('Monthly')} sub={b === 'ONE_TIME' ? `${egp(pkg.priceOneTime)} · ${t('full package')}` : `${egp(pkg.priceMonthly!)} / ${t('month')} · ${t('renew any time')}`} />
                  ))}
                </div>
              </Card>
            )}
            {isParent && (
              <Card>
                <Field label={t('Who is this for?')}>
                  {me.children.length ? (
                    <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                      {me.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  ) : (
                    <p className="font-normal text-muted">{t('Add a child first in')} <Link href="/dashboard" className="underline">{t('your dashboard')}</Link>.</p>
                  )}
                </Field>
              </Card>
            )}
            <Card>
              <h2 className="mb-3 font-semibold">{t('Payment method')}</h2>
              {enabled && !methods.length && <p className="mb-3 rounded-lg bg-[#f6ecd6] px-3 py-2 text-sm text-[#7a5a17]">{t('No payment method is switched on yet. Please contact us in the chat.')}</p>}
              <div className="flex flex-col gap-2.5">
                {methods.map((m) => <Option key={m.id} active={method === m.id} onClick={() => setMethod(m.id)} title={t(m.name)} sub={t(m.note)} />)}
              </div>
              {method === 'INSTALLMENTS' && <p className="mt-3 text-sm text-muted">{t("You'll choose the provider and number of months on the next screen.")}</p>}
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">{t('Discount code')}</h2>
              {quote ? (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-[#e1eee6] px-3 py-2.5 text-[15px] text-[#2f6449]">
                  <span><b className="font-mono">{quote.code}</b> · {quote.label} (−{egp(quote.discount)})</span>
                  <button type="button" onClick={clearCoupon} className="text-sm font-semibold underline">{t('Remove')}</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('Enter code')} className="font-mono uppercase" aria-label={t('Discount code')}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (code.trim()) applyCoupon(); } }} />
                  <Button type="button" variant="secondary" onClick={applyCoupon} disabled={!code.trim() || checking}>{checking ? t('Checking…') : t('Apply')}</Button>
                </div>
              )}
              {couponError && <p className="mt-2 text-sm text-danger">{couponError}</p>}
            </Card>
            {error && <p className="rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger">{error}</p>}
            <Button onClick={pay} disabled={busy || (isParent && !studentId)} className="w-full">
              {busy ? t('Please wait…') : amount === 0 ? t('Get it for free') : method === 'FAWRY' ? t('Get Fawry code') : method === 'INSTAPAY' ? t('Continue to InstaPay') : `${t('Pay')} ${egp(amount)}`}
            </Button>
          </>
        )}
      </div>

      <Card className="md:sticky md:top-6">
        <span className="text-sm font-semibold text-muted">{t(TRACK_LABEL[pkg.track])}</span>
        <h2 className="mt-1 text-xl font-bold">{pkg.name}</h2>
        <p className="mt-1 text-[15px] text-[#4a4945]">{pkg.description}</p>
        <ul className="mt-4 flex flex-col gap-1.5 border-t border-line pt-4 text-sm text-[#4a4945]">
          <li>{t('{n} sessions, live and recorded', { n: pkg.sessions?.length ?? 0 })}</li>
          <li>{t('Materials, assignment and quiz for each session')}</li>
        </ul>
        {quote && (
          <div className="mt-4 flex justify-between border-t border-line pt-4 text-sm text-[#4a4945]"><span>{t('Price')}</span><span className="font-mono">{egp(baseAmount)}</span></div>
        )}
        {quote && <div className="flex justify-between pt-1 text-sm text-[#2f6449]"><span>{t('Code')} {quote.code}</span><span className="font-mono">−{egp(quote.discount)}</span></div>}
        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
          <span className="font-semibold">{t('Total')}</span>
          <span className="font-mono text-2xl font-bold">{egp(amount)}</span>
        </div>
        {billing === 'MONTHLY' && <p className="mt-1 text-right text-sm text-muted">{t('billed every 30 days')}</p>}
      </Card>
    </div>
  );
}

function Option({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cx('flex min-h-14 items-start gap-3 rounded-xl border p-3.5 text-left transition', active ? 'border-ink bg-paper' : 'border-line hover:border-[#c9c3b8]')}>
      <span className={cx('mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full border-2', active ? 'border-ink' : 'border-[#c9c3b8]')}>
        {active && <span className="size-2 rounded-full bg-ink" />}
      </span>
      <span className="flex flex-col">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-muted">{sub}</span>
      </span>
    </button>
  );
}

function FawryPanel({ r }: { r: Extract<Result, { method: 'FAWRY' }> }) {
  const t = useT();
  return (
    <Card>
      <h2 className="text-xl font-bold">{t('Pay at Fawry')}</h2>
      <p className="mt-1 text-[15px] text-[#4a4945]">{t('Give this reference code at any Fawry outlet, or pay it from the Fawry or bank app.')}</p>
      <div className="my-5 rounded-xl bg-paper p-5 text-center">
        <div className="text-sm text-muted">{t('Reference code')}</div>
        <div className="font-mono text-3xl font-bold tracking-[0.08em]">{r.fawryReference}</div>
        <div className="mt-2 text-sm">{t('Amount')} {egp(r.amount)} · {t('valid until')} {new Date(r.expiresAt).toLocaleString('en-GB')}</div>
      </div>
      <p className="text-sm text-muted">{t('Your package unlocks automatically once Fawry confirms the payment.')}</p>
      <Link href={`/checkout/result?paymentId=${r.paymentId}`} className="mt-4 inline-block font-semibold underline">{t('Check payment status')}</Link>
    </Card>
  );
}

function InstapayPanel({ r }: { r: Extract<Result, { method: 'INSTAPAY' }> }) {
  const t = useT();
  const [file, setFile] = useState<File | null>(null);
  const [ref, setRef] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');

  if (state === 'done')
    return (
      <Card>
        <h2 className="text-xl font-bold">{t('Receipt received')}</h2>
        <p className="mt-1 text-[15px] text-[#4a4945]">{t("We'll confirm your transfer within a few working hours and unlock your package. You'll see it in Billing.")}</p>
        <Link href="/dashboard" className="mt-4 inline-block font-semibold underline">{t('Go to dashboard')}</Link>
      </Card>
    );

  return (
    <Card>
      <h2 className="text-xl font-bold">{t('Pay with InstaPay')}</h2>
      <ol className="mt-3 flex list-decimal flex-col gap-1 pl-5 text-[15px] text-[#4a4945]">
        <li>{t('Open your bank or InstaPay app.')}</li>
        <li>{t('Send')} <b>{egp(r.amount)}</b> {t('to')} <b className="font-mono">{r.instapayAddress}</b>.</li>
        <li>{t('Upload the confirmation screenshot below.')}</li>
      </ol>
      <div className="mt-5 flex flex-col gap-4">
        <Field label={t('Transfer reference number')}><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        <Field label={t('Receipt screenshot')}><Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          disabled={!file || !ref || state === 'busy'}
          onClick={async () => {
            setState('busy');
            try {
              const up = await uploadFile(file!, 'receipt');
              await api(`/payments/${r.paymentId}/instapay-receipt`, { method: 'POST', json: { receiptKey: up.key, senderReference: ref } });
              setState('done');
            } catch (e) {
              setError((e as Error).message);
              setState('idle');
            }
          }}
        >
          {state === 'busy' ? t('Uploading…') : t('Submit receipt')}
        </Button>
      </div>
    </Card>
  );
}
