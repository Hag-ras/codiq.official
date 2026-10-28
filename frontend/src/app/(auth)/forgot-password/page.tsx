'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';
import { useT } from '@/components/i18n-provider';

export default function ForgotPasswordPage() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (sent)
    return (
      <>
        <h1 className="font-mono text-2xl font-bold tracking-[-0.03em]">{t('Check your inbox')}</h1>
        <p className="mt-2 text-[15px] text-[#4a4945]">{t('If an account exists for {email}, we sent a link to reset the password. It expires in one hour.', { email })}</p>
        <Link href="/login" className="mt-6 inline-block font-semibold underline">{t('Back to log in')}</Link>
      </>
    );

  return (
    <>
      <h1 className="font-mono text-2xl font-bold tracking-[-0.03em]">{t('Reset password')}</h1>
      <p className="mt-1 mb-6 text-[15px] text-muted">{t("Enter your email and we'll send you a reset link.")}</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await api('/auth/forgot-password', { method: 'POST', json: { email } }).catch(() => null);
          setSent(true);
        }}
      >
        <Field label={t('Email')}><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Button type="submit" disabled={busy}>{t('Send reset link')}</Button>
        <Link href="/login" className="text-center text-sm font-semibold text-muted hover:text-ink">{t('Back to log in')}</Link>
      </form>
    </>
  );
}
