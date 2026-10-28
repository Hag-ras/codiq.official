'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LiveKitRoom, RoomAudioRenderer, VideoConference, useLocalParticipant, useParticipants } from '@livekit/components-react';
import '@livekit/components-styles';
import { api } from '@/lib/api';
import { Logo } from '@/components/ui';
import type { SessionDetail } from '@/lib/types';

export default function LivePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const { data: session } = useQuery({ queryKey: ['session', sessionId], queryFn: () => api<SessionDetail>(`/sessions/${sessionId}`) });
  const { data: conn, error } = useQuery({
    queryKey: ['live-token', sessionId],
    queryFn: () => api<{ token: string; url: string; isHost: boolean }>(`/live/${sessionId}/token`),
    staleTime: Infinity,
  });

  if (error)
    return (
      <div className="grid min-h-dvh place-items-center bg-night p-6 text-center text-day">
        <div><p className="mb-4 text-lg">{(error as Error).message}</p><Link href="/dashboard" className="underline">Back to dashboard</Link></div>
      </div>
    );

  return (
    <div className="flex h-dvh flex-col bg-[#111214] text-day" data-lk-theme="default">
      {conn ? (
        <LiveKitRoom serverUrl={conn.url} token={conn.token} connect video={conn.isHost} audio={conn.isHost}
          onDisconnected={() => router.push(`/dashboard/sessions/${sessionId}`)} className="flex min-h-0 flex-1 flex-col">
          <TopBar title={session?.title ?? 'Live class'} sessionId={sessionId} isHost={conn.isHost} />
          <div className="min-h-0 flex-1"><VideoConference /></div>
          <RoomAudioRenderer />
        </LiveKitRoom>
      ) : (
        <div className="grid flex-1 place-items-center text-[#b4b2ac]">Connecting to the classroom…</div>
      )}
    </div>
  );
}

function TopBar({ title, sessionId, isHost }: { title: string; sessionId: string; isHost: boolean }) {
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const [hand, setHand] = useState(false);
  const [recording, setRecording] = useState<'idle' | 'starting' | 'on'>('idle');
  const hands = participants.filter((p) => p.attributes?.hand === 'up');

  const toggleHand = async () => {
    await localParticipant.setAttributes({ hand: hand ? '' : 'up' });
    setHand(!hand);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-4">
        <Logo dark size={18} />
        <span className="truncate text-[15px] font-semibold">{title}</span>
        <span className="text-sm text-[#b4b2ac]">{participants.length} in class</span>
      </div>
      <div className="flex items-center gap-2">
        {hands.length > 0 && (
          <span className="rounded-full bg-clay px-3 py-1 text-sm font-semibold">
            ✋ {hands.map((p) => p.name?.split(' ')[0]).join(', ')}
          </span>
        )}
        {!isHost && (
          <button onClick={toggleHand} className="min-h-10 rounded-[10px] bg-white/10 px-4 text-sm font-semibold hover:bg-white/20">
            {hand ? 'Lower hand' : 'Raise hand'}
          </button>
        )}
        {isHost && (
          <button disabled={recording !== 'idle'} className="min-h-10 rounded-[10px] bg-white/10 px-4 text-sm font-semibold hover:bg-white/20 disabled:opacity-60"
            onClick={async () => {
              setRecording('starting');
              try { await api(`/live/${sessionId}/recording/start`, { method: 'POST' }); setRecording('on'); } catch { setRecording('idle'); }
            }}>
            {recording === 'on' ? '● Recording' : recording === 'starting' ? 'Starting…' : 'Record class'}
          </button>
        )}
      </div>
    </div>
  );
}
