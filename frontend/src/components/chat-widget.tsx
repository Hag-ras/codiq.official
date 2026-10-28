'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { chatSocket, getGuestKey, saveGuestKey, send, type ChatMessage } from '@/lib/chat';
import { ChatBox } from './chat-box';
import { Button, Field, Input, Textarea } from './ui';
import { useT } from '@/components/i18n-provider';

type History = { thread: { id: string; status: string; unreadForUser: number } | null; messages: ChatMessage[] };
type Mode = { kind: 'loading' } | { kind: 'user'; id: string } | { kind: 'guest' };

/** Signed-in people keep one conversation across the site and dashboard. Everyone else gets a visitor chat. */
async function detectMode(): Promise<Mode> {
  const me = () => api<{ id: string }>('/auth/me');
  try { return { kind: 'user', id: (await me()).id }; } catch { /* maybe only the 15 minute token expired */ }
  try {
    if ((await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })).ok) return { kind: 'user', id: (await me()).id };
  } catch { /* offline */ }
  return { kind: 'guest' };
}

/** Floating "Chat with us" button. `raised` lifts it above the dashboard's bottom tab bar on phones. */
export function ChatWidget({ raised = false }: { raised?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: 'loading' });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasGuestChat, setHasGuestChat] = useState(false);
  const [typing, setTyping] = useState(false);
  const [unread, setUnread] = useState(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const openRef = useRef(open);
  openRef.current = open;

  const load = useCallback(async (m: Mode) => {
    const h = m.kind === 'user'
      ? await api<History>('/support/chat').catch(() => null)
      : await fetch('/api/support/guest-chat', { headers: { 'x-guest-key': getGuestKey() ?? '' } }).then((r) => (r.ok ? (r.json() as Promise<History>) : null)).catch(() => null);
    if (!h) return;
    setMessages(h.messages); setHasGuestChat(m.kind === 'guest' && !!h.thread);
    setUnread(h.thread?.unreadForUser ?? 0);
  }, []);

  // Open on first click only: don't touch the network (or the socket) for people who never chat
  useEffect(() => {
    if (!open || mode.kind !== 'loading') return;
    let live = true;
    void detectMode().then(async (m) => { if (!live) return; setMode(m); await load(m); });
    return () => { live = false; };
  }, [open, mode.kind, load]);

  useEffect(() => {
    if (mode.kind === 'loading') return;
    const s = chatSocket();
    const onMessage = ({ message }: { message: ChatMessage }) => {
      setMessages((cur) => (cur.some((m) => m.id === message.id) ? cur : [...cur, message]));
      if (message.fromStaff) { setTyping(false); if (openRef.current) void send('chat:read', {}).catch(() => null); else setUnread((n) => n + 1); }
    };
    const onTyping = () => { setTyping(true); clearTimeout(typingTimer.current); typingTimer.current = setTimeout(() => setTyping(false), 3000); };
    const onConnect = () => void load(mode);
    s.on('chat:message', onMessage); s.on('chat:typing', onTyping); s.on('connect', onConnect);
    return () => { s.off('chat:message', onMessage); s.off('chat:typing', onTyping); s.off('connect', onConnect); clearTimeout(typingTimer.current); };
  }, [mode, load]);

  useEffect(() => { if (open && unread && mode.kind !== 'loading') { setUnread(0); void send('chat:read', {}).catch(() => null); } }, [open, unread, mode.kind]);

  return (
    <div className={`fixed end-6 z-30 flex flex-col items-end gap-3 sm:end-10 ${raised ? 'bottom-24 md:bottom-10' : 'bottom-8 sm:bottom-10'}`}>
      {open && (
        <div role="dialog" aria-label={t('Chat with Codiq')} className="animate-pop flex h-[min(540px,calc(100dvh-110px))] w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
          <div className="flex items-center justify-between bg-night px-4 py-3 text-day">
            <div><div className="font-mono font-bold">{t('Chat with Codiq')}</div><div className="text-xs text-[#b4b2ac]">{t('Ask us about prices, tracks or anything else')}</div></div>
            <button onClick={() => setOpen(false)} aria-label={t('Close chat')} className="grid size-9 place-items-center rounded-full text-xl hover:bg-white/10">×</button>
          </div>
          {mode.kind === 'loading' ? <div className="m-auto text-sm text-muted">{t('Connecting…')}</div>
            : mode.kind === 'guest' && !hasGuestChat ? <GuestStart onStarted={() => { setHasGuestChat(true); void load(mode); }} />
            : <ChatBox messages={messages} typing={typing} mine={(m) => !m.fromStaff} onSend={async (body) => { await send('chat:send', { body }); }} placeholder={t('Write a message')} />}
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-label={open ? t('Close chat') : t('Chat with us')} aria-expanded={open}
        className={`relative flex min-h-12 items-center gap-2 rounded-full bg-clay px-5 font-semibold text-white shadow-lg hover:opacity-90 ${open ? '' : 'animate-ring'}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
        {t('Chat with us')}
        {unread > 0 && !open && <span className="absolute -top-1 -end-1 grid size-6 place-items-center rounded-full bg-ink text-xs">{unread}</span>}
      </button>
    </div>
  );
}

function GuestStart({ onStarted }: { onStarted: () => void }) {
  const t = useT();
  const [v, setV] = useState({ name: '', contact: '', body: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError('');
      try { const r = await send('chat:start', v); if (r.guestKey) saveGuestKey(r.guestKey); onStarted(); }
      catch (err) { setError((err as Error).message); } finally { setBusy(false); }
    }}>
      <p className="text-sm text-muted">{t("No account needed. Tell us who you are and what you'd like to know, and the team will answer here.")}</p>
      <Field label={t('Your name')}><Input value={v.name} minLength={2} maxLength={60} onChange={(e) => setV({ ...v, name: e.target.value })} required /></Field>
      <Field label={t('Phone or email')} hint={t('Optional, in case we get disconnected')}><Input value={v.contact} maxLength={100} onChange={(e) => setV({ ...v, contact: e.target.value })} /></Field>
      <Field label={t('Your question')}><Textarea rows={3} value={v.body} maxLength={2000} onChange={(e) => setV({ ...v, body: e.target.value })} required /></Field>
      {error && <p className="rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={busy}>{busy ? t('Sending…') : t('Start chat')}</Button>
    </form>
  );
}
