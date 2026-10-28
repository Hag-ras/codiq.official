'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { chatSocket, send, type ChatMessage } from '@/lib/chat';
import { ChatBox } from '@/components/chat-box';
import { Badge, Card, PageTitle } from '@/components/ui';
import { useT } from '@/components/i18n-provider';

type History = { thread: { id: string; status: 'OPEN' | 'RESOLVED'; unreadForUser: number } | null; messages: ChatMessage[] };

export default function SupportChatPage() {
  const t = useT();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED' | null>(null);
  const [typing, setTyping] = useState(false);
  const [meId, setMeId] = useState('');
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let live = true;
    const s = chatSocket();
    const load = async () => {
      const h = await api<History>('/support/chat').catch(() => null);
      if (!live || !h) return;
      setMessages(h.messages); setStatus(h.thread?.status ?? null);
      if (h.thread?.unreadForUser) void send('chat:read', {}).catch(() => null);
    };
    void load();
    api<{ id: string }>('/auth/me').then((m) => live && setMeId(m.id)).catch(() => null);
    const onMessage = ({ message }: { message: ChatMessage }) => {
      setMessages((cur) => (cur.some((m) => m.id === message.id) ? cur : [...cur, message]));
      if (message.fromStaff) { setTyping(false); void send('chat:read', {}).catch(() => null); }
    };
    const onThread = (t: { status: 'OPEN' | 'RESOLVED' }) => setStatus(t.status);
    const onTyping = () => { setTyping(true); clearTimeout(typingTimer.current); typingTimer.current = setTimeout(() => setTyping(false), 3000); };
    s.on('chat:message', onMessage); s.on('chat:thread', onThread); s.on('chat:typing', onTyping); s.on('connect', load);
    return () => { live = false; s.off('chat:message', onMessage); s.off('chat:thread', onThread); s.off('chat:typing', onTyping); s.off('connect', load); clearTimeout(typingTimer.current); };
  }, []);

  return (
    <>
      <PageTitle title={t('Chat with Codiq')} sub={t("Ask about a payment, your child's progress or anything else. Our team replies here.")} action={status === 'RESOLVED' ? <Badge tone="good">{t('Resolved')}</Badge> : undefined} />
      <Card className="flex h-[70dvh] max-w-2xl flex-col overflow-hidden p-0">
        <ChatBox messages={messages} typing={typing} mine={(m) => !m.fromStaff && (!meId || m.senderId === meId)} onSend={(body) => send('chat:send', { body })} placeholder={t('Write to the Codiq team')} />
      </Card>
      {status === 'RESOLVED' && <p className="mt-3 max-w-2xl text-sm text-muted">{t('This conversation was marked resolved. Send a new message to reopen it.')}</p>}
    </>
  );
}