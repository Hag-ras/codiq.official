'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { chatSocket, send, type ChatMessage, type ThreadSummary } from '@/lib/chat';
import { ChatBox } from '@/components/chat-box';
import { Avatar } from '@/components/avatar';
import { Badge, Button, Card, Empty, PageTitle, cx } from '@/components/ui';

export default function InboxPage() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [filter, setFilter] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingId, setTypingId] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  activeRef.current = activeId;

  const loadList = useCallback(async () => { setThreads(await api<ThreadSummary[]>('/support/inbox').catch(() => [])); }, []);
  const open = useCallback(async (id: string) => {
    setActiveId(id);
    const r = await api<{ thread: ThreadSummary; messages: ChatMessage[] }>(`/support/inbox/${id}`).catch(() => null);
    if (!r || activeRef.current !== id) return;
    setMessages(r.messages);
    if (r.thread.unreadForStaff) void send('chat:read', { threadId: id }).catch(() => null);
  }, []);

  useEffect(() => {
    void loadList();
    const s = chatSocket();
    const onThread = (t: ThreadSummary) => setThreads((cur) => [t, ...cur.filter((x) => x.id !== t.id)].sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt)));
    const onMessage = ({ threadId, message }: { threadId: string; message: ChatMessage }) => {
      if (threadId !== activeRef.current) return;
      setMessages((cur) => (cur.some((m) => m.id === message.id) ? cur : [...cur, message]));
      if (!message.fromStaff) void send('chat:read', { threadId }).catch(() => null);
    };
    const onTyping = ({ userId }: { userId: string }) => {
      setTypingId(userId); clearTimeout(typingTimer.current); typingTimer.current = setTimeout(() => setTypingId(null), 3000);
    };
    const onConnect = () => { void loadList(); if (activeRef.current) void open(activeRef.current); };
    s.on('chat:thread', onThread); s.on('chat:message', onMessage); s.on('chat:typing', onTyping); s.on('connect', onConnect);
    return () => { s.off('chat:thread', onThread); s.off('chat:message', onMessage); s.off('chat:typing', onTyping); s.off('connect', onConnect); clearTimeout(typingTimer.current); };
  }, [loadList, open]);

  const shown = threads.filter((t) => t.status === filter);
  const active = threads.find((t) => t.id === activeId) ?? null;
  const waiting = threads.reduce((n, t) => n + (t.status === 'OPEN' && t.unreadForStaff ? 1 : 0), 0);

  return (
    <>
      <PageTitle title="Support inbox" sub={waiting ? `${waiting} conversation${waiting > 1 ? 's' : ''} waiting for a reply.` : 'Live chats with parents and students.'} />
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div className={cx('flex flex-col gap-3', active && 'max-md:hidden')}>
          <div className="flex gap-2">
            {(['OPEN', 'RESOLVED'] as const).map((f) => (
              <Button key={f} variant={filter === f ? 'primary' : 'secondary'} className="min-h-9 py-1.5" onClick={() => setFilter(f)}>{f === 'OPEN' ? 'Open' : 'Resolved'}</Button>
            ))}
          </div>
          {!shown.length ? <Empty>No {filter === 'OPEN' ? 'open' : 'resolved'} conversations.</Empty> : (
            <div className="flex flex-col gap-2">
              {shown.map((t) => (
                <button key={t.id} onClick={() => void open(t.id)} className={cx('flex items-center gap-3 rounded-xl border bg-white p-3 text-left hover:border-ink', t.id === activeId ? 'border-ink' : 'border-line')}>
                  <Avatar name={t.user.name} src={t.user.avatar} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{t.user.name}</span>{t.unreadForStaff > 0 && <Badge tone="accent">{t.unreadForStaff}</Badge>}</div>
                    <p className="truncate text-sm text-muted">{t.last ? `${t.last.fromStaff ? 'You: ' : ''}${t.last.body}` : '—'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {active ? (
          <Card className="flex h-[72dvh] flex-col overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Button variant="ghost" className="min-h-9 py-1.5 md:hidden" onClick={() => setActiveId(null)} aria-label="Back to list">←</Button>
                <Avatar name={active.user.name} src={active.user.avatar} size={36} />
                <div className="min-w-0"><div className="truncate font-semibold">{active.user.name} <span className="text-sm font-normal text-muted">· {active.user.role.toLowerCase()}</span></div>
                  <div className="truncate text-sm text-muted">{active.user.email}{active.user.phone ? ` · ${active.user.phone}` : ''}</div></div>
              </div>
              <Button variant="secondary" className="min-h-9 py-1.5" onClick={() => void send('chat:resolve', { threadId: active.id, resolved: active.status === 'OPEN' })}>
                {active.status === 'OPEN' ? 'Mark resolved' : 'Reopen'}
              </Button>
            </div>
            <ChatBox messages={messages} typing={typingId === active.user.id} mine={(m) => m.fromStaff} onSend={(body) => send('chat:reply', { threadId: active.id, body })} placeholder={`Reply to ${active.user.name}`} />
          </Card>
        ) : <div className="max-md:hidden"><Empty>Pick a conversation to read and reply.</Empty></div>}
      </div>
    </>
  );
}
