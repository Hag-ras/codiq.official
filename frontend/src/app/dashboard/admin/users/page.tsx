'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, Button, Card, Field, Input, PageTitle, Select } from '@/components/ui';
import { Avatar } from '@/components/avatar';
import { TRACK_LABEL } from '@/lib/types';
import type { AdminUser, Role, Track } from '@/lib/types';

const ROLES: Role[] = ['STUDENT', 'PARENT', 'INSTRUCTOR', 'ASSISTANT', 'ADMIN'];
const ROLE_NAME: Record<Role, string> = { STUDENT: 'Student', PARENT: 'Parent', INSTRUCTOR: 'Instructor', ASSISTANT: 'Assistant', ADMIN: 'Admin' };
const PERMS: [string, Role[]][] = [
  ['Watch recordings, join live classes', ['STUDENT', 'INSTRUCTOR', 'ASSISTANT', 'ADMIN']],
  ['Submit assignments and quizzes', ['STUDENT']],
  ['Pay for packages', ['STUDENT', 'PARENT']],
  ["See children's progress", ['PARENT']],
  ['Host live classes', ['INSTRUCTOR', 'ADMIN']],
  ['Grade work (assistants: every session)', ['INSTRUCTOR', 'ASSISTANT', 'ADMIN']],
  ['Create sessions and packages', ['ADMIN']],
  ['Manage users, roles, payments, assignments', ['ADMIN']],
];

function EditUser({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ name: user.name, email: user.email, phone: user.phone ?? '', track: (user.track ?? '') as Track | '', newPassword: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      await api(`/users/${user.id}`, {
        method: 'PATCH',
        json: { name: v.name, email: v.email, ...(v.phone ? { phone: v.phone } : {}), ...(v.track ? { track: v.track } : {}), ...(v.newPassword ? { newPassword: v.newPassword } : {}) },
      });
      onSaved();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Edit ${user.name}`} onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="max-h-dvh w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl">
        <div className="mb-5 flex items-center gap-3">
          <Avatar name={user.name} src={user.avatar} size={48} />
          <div className="min-w-0"><h2 className="font-mono text-lg font-bold">Edit user</h2><p className="truncate text-sm text-muted">{user.role.toLowerCase()} · joined {fmtDate(user.createdAt)}</p></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><Input value={v.name} minLength={2} onChange={(e) => setV({ ...v, name: e.target.value })} required /></Field>
          <Field label="Email" hint="Changing it logs the user out everywhere"><Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} required /></Field>
          <Field label="Mobile"><Input inputMode="numeric" placeholder="01012345678" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
          {user.role === 'STUDENT' && (
            <Field label="Track">
              <Select value={v.track} onChange={(e) => setV({ ...v, track: e.target.value as Track })}>
                <option value="">Not set</option>
                {(['KIDS', 'SCHOOL', 'COLLEGE'] as const).map((t) => <option key={t} value={t}>{TRACK_LABEL[t]}</option>)}
              </Select>
            </Field>
          )}
          <div className="sm:col-span-2">
            <Field label="Set a new password (optional)" hint="At least 8 characters. Leave empty to keep the current one">
              <Input type="text" autoComplete="off" minLength={8} value={v.newPassword} onChange={(e) => setV({ ...v, newPassword: e.target.value })} />
            </Field>
          </div>
        </div>
        {error && <p className="mt-4 rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </form>
    </div>
  );
}

type Confirm = { title: string; body: string; confirmLabel: string; danger?: boolean; run: () => Promise<void> };

/** A real dialog instead of window.confirm(), which some browsers block or silently dismiss. */
function ConfirmDialog({ c, onClose }: { c: Confirm; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-2xl bg-white p-6 sm:rounded-2xl">
        <h2 id="confirm-title" className="font-mono text-lg font-bold">{c.title}</h2>
        <p className="mt-2 text-[15px] whitespace-pre-line text-[#4a4945]">{c.body}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={c.danger ? 'danger' : 'primary'} disabled={busy} autoFocus onClick={async () => { setBusy(true); try { await c.run(); } finally { setBusy(false); onClose(); } }}>{busy ? 'Working…' : c.confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

const roleWarning = (u: AdminUser, to: Role) =>
  to === 'ADMIN'
    ? `Are you sure you want to make ${u.name} (${u.email}) an ADMIN?\n\nAdmins can see and change everything: users, payments, courses, coupons and support chats.`
    : u.role === 'ADMIN'
      ? `Are you sure you want to remove admin access from ${u.name} (${u.email})?\n\nThey will become ${ROLE_NAME[to].toLowerCase() === 'instructor' ? 'an instructor' : `a ${ROLE_NAME[to].toLowerCase()}`} and lose access to the admin area.`
      : `Are you sure you want to change ${u.name} (${u.email}) from ${ROLE_NAME[u.role].toLowerCase()} to ${ROLE_NAME[to].toLowerCase()}?\n\nThey will need to log in again.`;

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const { data } = useQuery({ queryKey: ['users', role, q], queryFn: () => api<AdminUser[]>(`/users?${new URLSearchParams({ ...(role && { role }), ...(q && { q }) })}`) });
  const [adding, setAdding] = useState(false);
  const [nu, setNu] = useState({ name: '', email: '', password: '', role: 'INSTRUCTOR' as Role });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [confirming, setConfirming] = useState<Confirm | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });

  const applyRole = async (u: AdminUser, to: Role) => {
    try { await api(`/users/${u.id}/role`, { method: 'PATCH', json: { role: to } }); setNotice({ ok: true, text: `${u.name} is now ${ROLE_NAME[to].toLowerCase()}.` }); }
    catch (e) { setNotice({ ok: false, text: (e as Error).message }); }
    refresh();
  };
  const askRole = (u: AdminUser, to: Role) => {
    if (to === u.role) return;
    setConfirming({ title: to === 'ADMIN' ? 'Make admin?' : 'Change role?', body: roleWarning(u, to), confirmLabel: to === 'ADMIN' ? 'Yes, make admin' : 'Yes, change role', danger: to === 'ADMIN' || u.role === 'ADMIN', run: () => applyRole(u, to) });
  };

  const remove = (u: AdminUser) =>
    setConfirming({
      title: 'Delete user?', confirmLabel: 'Yes, delete', danger: true,
      body: `Are you sure you want to permanently delete ${u.name} (${u.email})?\n\nTheir enrollments, progress and submissions are deleted too. This can't be undone.`,
      run: async () => {
        try { await api(`/users/${u.id}`, { method: 'DELETE' }); setNotice({ ok: true, text: `${u.name} was deleted.` }); refresh(); }
        catch (e) { setNotice({ ok: false, text: (e as Error).message }); }
      },
    });

  return (
    <>
      <PageTitle title="Users & team" sub="Add, edit or delete accounts, and promote a student to assistant." action={<Button variant="secondary" onClick={() => setAdding(!adding)}>Add team member</Button>} />
      {notice && <p className={notice.ok ? 'mb-4 rounded-lg bg-[#e1eee6] px-4 py-3 text-[15px] text-[#2f6449]' : 'mb-4 rounded-lg bg-[#f7e1df] px-4 py-3 text-[15px] text-danger'} role="status">{notice.text}</p>}
      {adding && (
        <Card className="mb-6">
          <form className="grid gap-4 sm:grid-cols-4" onSubmit={async (e) => {
            e.preventDefault(); setError('');
            try { await api('/users', { method: 'POST', json: nu }); setAdding(false); refresh(); }
            catch (err) { setError((err as Error).message); }
          }}>
            <Field label="Name"><Input value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} required /></Field>
            <Field label="Email"><Input type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} required /></Field>
            <Field label="Temporary password"><Input value={nu.password} minLength={8} onChange={(e) => setNu({ ...nu, password: e.target.value })} required /></Field>
            <Field label="Role"><Select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as Role })}><option value="INSTRUCTOR">Instructor</option><option value="ASSISTANT">Assistant</option><option value="ADMIN">Admin</option></Select></Field>
            {error && <p className="text-sm text-danger sm:col-span-4">{error}</p>}
            <div className="sm:col-span-4"><Button type="submit">Create account</Button></div>
          </form>
        </Card>
      )}
      <div className="mb-4 flex flex-wrap gap-3">
        <Input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={role} onChange={(e) => setRole(e.target.value)} className="max-w-[180px]"><option value="">All roles</option>{ROLES.map((r) => <option key={r} value={r}>{ROLE_NAME[r]}</option>)}</Select>
      </div>
      <div className="mb-10 overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[960px] text-left text-[15px]">
          <thead className="border-b border-line text-sm text-muted"><tr>{['User', 'Joined', 'Packages', 'Role', ''].map((h, i) => <th key={i} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {data?.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} src={u.avatar} size={40} />
                    <div className="min-w-0"><div className="truncate font-semibold">{u.name}</div><div className="truncate text-sm text-muted">{u.email}</div></div>
                  </div>
                </td>
                <td className="px-4 py-3">{fmtDate(u.createdAt)}</td>
                <td className="px-4 py-3 font-mono">{u._count.enrollments}</td>
                <td className="px-4 py-2">
                  <Select value={u.role} className="min-h-9 py-1.5" aria-label={`Role for ${u.name}`} onChange={(e) => askRole(u, e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_NAME[r]}</option>)}</Select>
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-2">
                    {(u.role === 'STUDENT' || u.role === 'ASSISTANT') && (
                      <Button variant="ghost" className="min-h-9 py-1.5" onClick={() => askRole(u, u.role === 'STUDENT' ? 'ASSISTANT' : 'STUDENT')}>
                        {u.role === 'STUDENT' ? 'Make assistant' : 'Back to student'}
                      </Button>
                    )}
                    <Button variant="secondary" className="min-h-9 py-1.5" onClick={() => setEditing(u)} aria-label={`Edit ${u.name}`}>Edit</Button>
                    <Button variant="danger" className="min-h-9 py-1.5" onClick={() => remove(u)} aria-label={`Delete ${u.name}`}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirming && <ConfirmDialog c={confirming} onClose={() => setConfirming(null)} />}
      {editing && <EditUser user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setNotice({ ok: true, text: 'Saved.' }); refresh(); }} />}

      <h2 className="mb-3 font-mono text-lg font-bold">What each role can do</h2>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[640px] text-left text-[15px]">
          <thead className="border-b border-line text-sm text-muted"><tr><th className="px-4 py-3 font-semibold">Permission</th>{ROLES.map((r) => <th key={r} className="px-4 py-3 text-center font-semibold">{r[0] + r.slice(1).toLowerCase()}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {PERMS.map(([p, roles]) => (
              <tr key={p}><td className="px-4 py-3">{p}</td>{ROLES.map((r) => <td key={r} className="px-4 py-3 text-center">{roles.includes(r) ? <span className="inline-block size-2.5 rounded-full bg-clay" aria-label="Yes" /> : <span className="text-[#c9c3b8]">—</span>}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
