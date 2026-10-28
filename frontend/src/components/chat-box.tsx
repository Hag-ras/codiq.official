'use client';
import { useEffect, useRef, useState } from 'react';
import { chatSocket, send, timeLabel, type ChatMessage } from '@/lib/chat';
import { Button, cx } from './ui';
import { useT } from '@/components/i18n-provider';

/** The message list and the composer. Callers own the messages; this only renders and sends. */
export function ChatBox({ messages, mine, onSend, typing, disabled, placeholder }: {
  messages: ChatMessage[]; mine: (m: ChatMessage) => boolean; onSend: (body: string) => Promise<unknown>; typing?: boolean; disabled?: boolean; placeholder?: string;
}) {
  const t = useT();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const end = useRef<HTMLDivElement>(null);
  const lastTyping = useRef(0);

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length, typing]);
  useEffect(() => {
    const s = chatSocket();
    const up = () => setOnline(true), down = () => setOnline(false);
    setOnline(s.connected);
    s.on('connect', up); s.on('disconnect', down); s.on('connect_error', down);
    return () => { s.off('connect', up); s.off('disconnect', down); s.off('connect_error', down); };
  }, []);

  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError('');
    try { await onSend(body); setText(''); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!online && <p role="status" className="bg-[#f6ecd6] px-4 py-2 text-center text-sm text-[#7a5a17]">{t('Reconnecting…')}</p>}
      <div className="flex min-h-[260px] flex-1 flex-col gap-2 overflow-y-auto p-4" aria-live="polite">
        {!messages.length && <p className="m-auto text-center text-sm text-muted">{t('No messages yet. Say hello.')}</p>}
        {messages.map((m) => (
          <div key={m.id} className={cx('max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px]', mine(m) ? 'self-end bg-ink text-paper' : 'self-start bg-paper', 'animate-msg')}>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
            <p className={cx('mt-0.5 text-[11px]', mine(m) ? 'text-[#b4b2ac]' : 'text-muted')}>{timeLabel(m.createdAt)}</p>
          </div>
        ))}
        {typing && <p className="self-start px-2 text-sm text-muted">{t('typing…')}</p>}
        <div ref={end} />
      </div>
      {error && <p className="mx-4 mb-2 rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger">{error}</p>}
      <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <textarea
          rows={1} value={text} maxLength={2000} disabled={disabled} placeholder={placeholder ?? t('Write a message')} aria-label={t('Message')}
          className="min-h-11 flex-1 resize-none rounded-[10px] border border-line bg-white px-3 py-2.5 text-[15px] outline-none focus:border-ink"
          onChange={(e) => {
            setText(e.target.value);
            if (Date.now() - lastTyping.current > 2000) { lastTyping.current = Date.now(); void send('chat:typing', {}).catch(() => null); }
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }}
        />
        <Button type="submit" disabled={busy || disabled || !text.trim()}>{t('Send')}</Button>
      </form>
    </div>
  );
}
