'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (done)
    return (
      <>
        <h1 className="font-mono text-2xl font-bold tracking-[-0.03em]">Password updated</h1>
        <p className="mt-2 text-[15px] text-[#4a4945]">You've been signed out everywhere. Log in with your new password.</p>
        <Link href="/login" className="mt-6 inline-block font-semibold underline">Log in</Link>
      </>
    );

  return (
    <>
      <h1 className="mb-6 font-mono text-2xl font-bold tracking-[-0.03em]">Choose a new password</h1>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw.length < 8) return setError('At least 8 characters');
          if (pw !== pw2) return setError("Passwords don't match");
          try {
            await api('/auth/reset-password', { method: 'POST', json: { token, password: pw } });
            setDone(true);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <Field label="New password"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Repeat password"><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        {error && <p className="rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={!token}>Update password</Button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><ResetForm /></Suspense>;
}
