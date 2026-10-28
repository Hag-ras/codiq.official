'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';
import { GoogleButton, OrDivider } from '@/components/google-button';
import { useT } from '@/components/i18n-provider';

const schema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Enter your password') });

const DEMO = [
  ['Student (kids)', 'malak@codiq.app'],
  ['Student (college)', 'omar@codiq.app'],
  ['Parent', 'nour@codiq.app'],
  ['Instructor', 'karim@codiq.app'],
  ['Admin', 'sara@codiq.app'],
];

function LoginForm() {
  const t = useT();
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/dashboard';
  const [error, setError] = useState('');
  const { register, handleSubmit, setValue, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (v) => {
    setError('');
    try {
      await api('/auth/login', { method: 'POST', json: v });
      router.replace(next.startsWith('/') ? next : '/dashboard');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  });

  return (
    <>
      <h1 className="font-mono text-2xl font-bold tracking-[-0.03em]">{t('Log in')}</h1>
      <p className="mt-1 mb-6 text-[15px] text-muted">
        {t('New to Codiq?')} <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold text-ink underline">{t('Create an account')}</Link>
      </p>
      <GoogleButton text="signin_with" next={next} onNeedsProfile={() => router.push(`/signup?google=1&next=${encodeURIComponent(next)}`)} />
      <OrDivider />
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label={t('Email')} error={formState.errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
        <Field label={t('Password')} error={formState.errors.password?.message}><Input type="password" autoComplete="current-password" {...register('password')} /></Field>
        <Link href="/forgot-password" className="-mt-1 self-end text-sm font-semibold text-muted hover:text-ink">{t('Forgot password?')}</Link>
        {error && <p className="rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={formState.isSubmitting}>{formState.isSubmitting ? t('Logging in…') : t('Log in')}</Button>
      </form>
      {process.env.NODE_ENV !== 'production' && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Demo accounts · Password123!</p>
          <div className="flex flex-wrap gap-2">
            {DEMO.map(([label, email]) => (
              <button key={email} type="button" className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-ink"
                onClick={() => { setValue('email', email); setValue('password', 'Password123!'); }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
