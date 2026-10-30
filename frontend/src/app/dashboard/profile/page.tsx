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
import { useT } from '@/components/i18n-provider';
import Link from 'next/link';

const profileSchema = z.object({
  name: z.string().min(2, 'Enter your full name'),
  phone: z.string().regex(/^01[0125]\d{8}$/, 'Use an Egyptian mobile like 01012345678').or(z.literal('')),
});
const pwSchema = z.object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: z.string().min(8, 'At least 8 characters') });

function AvatarCard({ me }: { me: Profile }) {
  const t = useT();
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
        <h2 className="text-[15px] font-semibold">{t('Profile picture')}</h2>
        <p className="text-sm text-muted">{t('JPEG, PNG or WebP. We crop it to a circle from the middle of the image.')}</p>
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} aria-label="Choose a profile picture" />
          <Button onClick={() => input.current?.click()} disabled={busy}>{busy ? t('Uploading…') : me.avatar ? t('Change picture') : t('Upload picture')}</Button>
          {me.avatar && <Button variant="ghost" onClick={remove} disabled={busy}>{t('Remove')}</Button>}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Card>
  );
}

function ProfileForm({ me }: { me: Profile }) {
  const t = useT();
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: { name: me.name, phone: me.phone ?? '' } });
  const onSubmit = handleSubmit(async (v) => {
    setMsg(null);
    try {
      await api('/account/profile', { method: 'PATCH', json: { name: v.name, phone: v.phone || undefined } });
      qc.invalidateQueries({ queryKey: ['profile'] });
      setMsg({ ok: true, text: t('Saved') });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  });
  return (
    <Card>
      <h2 className="mb-4 text-[15px] font-semibold">{t('Your details')}</h2>
      <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4" noValidate>
        <Field label={t('Full name')} error={formState.errors.name?.message ? t(formState.errors.name.message) : undefined}><Input autoComplete="name" {...register('name')} /></Field>
        <Field label={t('Email')} hint={t("Your email can't be changed here")}><Input value={me.email} disabled readOnly /></Field>
        <Field label={t('Mobile')} error={formState.errors.phone?.message ? t(formState.errors.phone.message) : undefined} hint={t('Used for Fawry and wallet payments')}><Input inputMode="numeric" placeholder="01012345678" {...register('phone')} /></Field>
        {msg && <p className={msg.ok ? 'text-sm text-[#2f6449]' : 'rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger'}>{msg.text}</p>}
        <Button type="submit" disabled={formState.isSubmitting} className="self-start">{t('Save changes')}</Button>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const t = useT();
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { register, handleSubmit, reset, formState } = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema) });
  const onSubmit = handleSubmit(async (v) => {
    setMsg(null);
    try {
      await api('/account/change-password', { method: 'POST', json: v });
      reset();
      setMsg({ ok: true, text: t('Password changed. You will be asked to log in again.') });
      setTimeout(() => { router.replace('/login'); router.refresh(); }, 1500);
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  });
  return (
    <Card>
      <h2 className="mb-4 text-[15px] font-semibold">{t('Change password')}</h2>
      <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4" noValidate>
        <Field label={t('Current password')} error={formState.errors.currentPassword?.message ? t(formState.errors.currentPassword.message) : undefined}><Input type="password" autoComplete="current-password" {...register('currentPassword')} /></Field>
        <Field label={t('New password')} error={formState.errors.newPassword?.message ? t(formState.errors.newPassword.message) : undefined}><Input type="password" autoComplete="new-password" {...register('newPassword')} /></Field>
        {msg && <p className={msg.ok ? 'text-sm text-[#2f6449]' : 'rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger'}>{msg.text}</p>}
        <Button type="submit" disabled={formState.isSubmitting} className="self-start">{t('Change password')}</Button>
      </form>
    </Card>
  );
}

function NotificationsCard({ me }: { me: Profile }) {
  const t = useT();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try { await api('/account/profile', { method: 'PATCH', json: { emailNotifications: !me.emailNotifications } }); await qc.invalidateQueries({ queryKey: ['profile'] }); }
    finally { setBusy(false); }
  };
  const isParent = me.role === 'PARENT';
  return (
    <Card>
      <h2 className="mb-1 text-[15px] font-semibold">{t('Email notifications')}</h2>
      <p className="mb-4 max-w-xl text-sm text-muted">
        {isParent ? t('Weekly progress summary, new assignments, grades and quiz results of your children, class reminders and plan renewal reminders.') : t('Reminders before live classes and before your monthly plan ends.')}{' '}
        {t('Password and payment emails are always sent.')}
      </p>
      <label className="flex w-fit items-center gap-3 text-[15px] font-semibold">
        <input type="checkbox" role="switch" className="size-5 accent-(--color-clay)" checked={me.emailNotifications} disabled={busy} onChange={toggle} />
        {me.emailNotifications ? t('On') : t('Off')}
      </label>
    </Card>
  );
}

function PrivacyCard({ me }: { me: Profile }) {
  const t = useT();
  return (
    <Card>
      <h2 className="mb-2 text-[15px] font-semibold">{t('Terms and privacy')}</h2>
      <ul className="flex flex-col gap-1 text-sm text-muted">
        <li>{me.termsAcceptedAt ? t('You accepted the Terms and Privacy Policy on {date}.', { date: fmtDate(me.termsAcceptedAt) }) : t('Your account was created before we asked for this.')}</li>
        {me.role === 'STUDENT' && me.guardianConsentAt && <li>{t('Your parent or guardian confirmed on {date} that they are responsible for your account.', { date: fmtDate(me.guardianConsentAt) })}</li>}
      </ul>
      <p className="mt-3 flex gap-4 text-sm font-semibold">
        <Link href="/terms" className="underline">{t('Terms of Use')}</Link><Link href="/privacy" className="underline">{t('Privacy Policy')}</Link>
      </p>
      <p className="mt-3 text-sm text-muted">{t('To see, correct or delete your data, write to us in the chat (the button at the bottom of the page).')}</p>
    </Card>
  );
}

export default function ProfilePage() {
  const t = useT();
  const { data } = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/account/profile') });
  if (!data) return <div className="h-40 animate-pulse rounded-(--radius-card) bg-black/5" />;
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t('Profile')} sub={t('{role} · member since {date}', { role: t(data.role.toLowerCase()), date: fmtDate(data.createdAt) })} action={data.hasGoogle ? <Badge tone="good">{t('Google linked')}</Badge> : undefined} />
      <AvatarCard me={data} />
      <ProfileForm key={data.id + data.name} me={data} />
      <NotificationsCard me={data} />
      <PasswordForm />
      <PrivacyCard me={data} />
    </div>
  );
}
