'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { Button, Field, Input, Select, cx } from '@/components/ui';
import { GoogleButton, OrDivider } from '@/components/google-button';
import { TRACK_AUDIENCE, TRACK_LABEL } from '@/lib/types';

const schema = z
  .object({
    accountType: z.enum(['STUDENT', 'PARENT']),
    name: z.string().min(2, 'Enter your full name'),
    email: z.string().email('Enter a valid email'),
    phone: z.string().regex(/^01[0125]\d{8}$/, 'Use an Egyptian mobile like 01012345678').or(z.literal('')),
    password: z.string().min(8, 'At least 8 characters'),
    track: z.enum(['KIDS', 'SCHOOL', 'COLLEGE']).optional(),
  })
  .refine((v) => v.accountType === 'PARENT' || !!v.track, { path: ['track'], message: 'Choose a track' });
type Values = z.infer<typeof schema>;

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/dashboard';
  const fromGoogle = params.get('google') === '1';
  const [error, setError] = useState('');
  const { register, handleSubmit, watch, setValue, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { accountType: 'STUDENT', phone: '', track: 'KIDS' },
  });
  const type = watch('accountType');
  const track = watch('track');

  const onSubmit = handleSubmit(async ({ phone, ...v }) => {
    setError('');
    try {
      await api('/auth/register', { method: 'POST', json: { ...v, phone: phone || undefined, track: v.accountType === 'STUDENT' ? v.track : undefined } });
      router.replace(next);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  });

  return (
    <>
      <h1 className="font-mono text-2xl font-bold tracking-[-0.03em]">Create an account</h1>
      <p className="mt-1 mb-6 text-[15px] text-muted">
        Already have one? <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-ink underline">Log in</Link>
      </p>
      {fromGoogle && (
        <p className="mb-4 rounded-lg bg-[#f6ecd6] px-3 py-2 text-sm text-[#7a5a17]">
          We couldn't find a Codiq account for that Google email. Choose student or parent below, then continue with Google.
        </p>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-paper p-1">
          {(['STUDENT', 'PARENT'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setValue('accountType', t)}
              className={cx('min-h-10 rounded-lg text-sm font-semibold', type === t ? 'bg-white shadow-sm' : 'text-muted')}>
              {t === 'STUDENT' ? "I'm a student" : "I'm a parent"}
            </button>
          ))}
        </div>
        <Field label="Full name" error={formState.errors.name?.message}><Input autoComplete="name" {...register('name')} /></Field>
        <Field label="Email" error={formState.errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
        <Field label="Mobile (optional)" error={formState.errors.phone?.message} hint="Used for Fawry and wallet payments">
          <Input inputMode="numeric" placeholder="01012345678" {...register('phone')} />
        </Field>
        <Field label="Password" error={formState.errors.password?.message}><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
        {type === 'STUDENT' && (
          <Field label="Track" error={formState.errors.track?.message}>
            <Select {...register('track')}>
              {(['KIDS', 'SCHOOL', 'COLLEGE'] as const).map((t) => <option key={t} value={t}>{TRACK_LABEL[t]} — {TRACK_AUDIENCE[t]}</option>)}
            </Select>
          </Field>
        )}
        {type === 'PARENT' && <p className="text-sm text-muted">You can add your children from your dashboard after signing up.</p>}
        {error && <p className="rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={formState.isSubmitting}>{formState.isSubmitting ? 'Creating…' : 'Create account'}</Button>
      </form>
      <OrDivider />
      <GoogleButton text="signup_with" next={next} extra={{ accountType: type, track: type === 'STUDENT' ? track : undefined }} />
    </>
  );
}

export default function SignupPage() {
  return <Suspense><SignupForm /></Suspense>;
}
