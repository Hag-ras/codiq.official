'use client';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, uploadFile } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, Button, Card, Field, Input, PageTitle } from '@/components/ui';
import { Avatar, toSquareJpeg } from '@/components/avatar';
import type { Profile } from '@/lib/types';

const profileSchema = z.object({
  name: z.string().min(2, 'Enter your full name'),
  phone: z.string().regex(/^01[0125]\d{8}$/, 'Use an Egyptian mobile like 01012345678').or(z.literal('')),
});
const pwSchema = z.object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: z.string().min(8, 'At least 8 characters') });

function AvatarCard({ me }: { me: Profile }) {
  const qc = useQueryClient();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['profile'] }); router.refresh(); };

  const pick = async (file?: File) => {
    if (!file) return;
    setError(''); setBusy(true);
    try {
      if (!file.type.startsWith('image/')) throw new Error('Please choose an image file');
      const square = await toSquareJpeg(file);
      const { key } = await uploadFile(square, 'avatar');
      await api('/account/avatar', { method: 'PUT', json: { key } });
      refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const remove = async () => {
    setBusy(true); setError('');
    try { await api('/account/avatar', { method: 'DELETE' }); refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Card className="flex flex-wrap items-center gap-5">
      <Avatar name={me.name} src={me.avatar} size={96} />
      <div className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Profile picture</h2>
        <p className="text-sm text-muted">JPEG, PNG or WebP. We crop it to a circle from the middle of the image.</p>
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} aria-label="Choose a profile picture" />
          <Button onClick={() => input.current?.click()} disabled={busy}>{busy ? 'Uploading…' : me.avatar ? 'Change picture' : 'Upload picture'}</Button>
          {me.avatar && <Button variant="ghost" onClick={remove} disabled={busy}>Remove</Button>}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Card>
  );
}

function ProfileForm({ me }: { me: Profile }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: { name: me.name, phone: me.phone ?? '' } });
  const onSubmit = handleSubmit(async (v) => {
    setMsg(null);
    try {
      await api('/account/profile', { method: 'PATCH', json: { name: v.name, phone: v.phone || undefined } });
      qc.invalidateQueries({ queryKey: ['profile'] });
      setMsg({ ok: true, text: 'Saved' });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  });
  return (
    <Card>
      <h2 className="mb-4 text-[15px] font-semibold">Your details</h2>
      <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4" noValidate>
        <Field label="Full name" error={formState.errors.name?.message}><Input autoComplete="name" {...register('name')} /></Field>
        <Field label="Email" hint="Your email can't be changed here"><Input value={me.email} disabled readOnly /></Field>
        <Field label="Mobile" error={formState.errors.phone?.message} hint="Used for Fawry and wallet payments"><Input inputMode="numeric" placeholder="01012345678" {...register('phone')} /></Field>
        {msg && <p className={msg.ok ? 'text-sm text-[#2f6449]' : 'rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger'}>{msg.text}</p>}
        <Button type="submit" disabled={formState.isSubmitting} className="self-start">Save changes</Button>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { register, handleSubmit, reset, formState } = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema) });
  const onSubmit = handleSubmit(async (v) => {
    setMsg(null);
    try {
      await api('/account/change-password', { method: 'POST', json: v });
      reset();
      setMsg({ ok: true, text: 'Password changed. You will be asked to log in again.' });
      setTimeout(() => { router.replace('/login'); router.refresh(); }, 1500);
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  });
  return (
    <Card>
      <h2 className="mb-4 text-[15px] font-semibold">Change password</h2>
      <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4" noValidate>
        <Field label="Current password" error={formState.errors.currentPassword?.message}><Input type="password" autoComplete="current-password" {...register('currentPassword')} /></Field>
        <Field label="New password" error={formState.errors.newPassword?.message}><Input type="password" autoComplete="new-password" {...register('newPassword')} /></Field>
        {msg && <p className={msg.ok ? 'text-sm text-[#2f6449]' : 'rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger'}>{msg.text}</p>}
        <Button type="submit" disabled={formState.isSubmitting} className="self-start">Change password</Button>
      </form>
    </Card>
  );
}

export default function ProfilePage() {
  const { data } = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/account/profile') });
  if (!data) return <div className="h-40 animate-pulse rounded-(--radius-card) bg-black/5" />;
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Profile" sub={`${data.role.toLowerCase()} · member since ${fmtDate(data.createdAt)}`} action={data.hasGoogle ? <Badge tone="good">Google linked</Badge> : undefined} />
      <AvatarCard me={data} />
      <ProfileForm key={data.id + data.name} me={data} />
      <PasswordForm />
    </div>
  );
}
