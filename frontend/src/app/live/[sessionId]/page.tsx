'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Classroom } from '@/components/live/classroom';
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useParticipantInfo, useParticipants } from '@livekit/components-react';
import '@livekit/components-styles';
import { api } from '@/lib/api';
import { Logo } from '@/components/ui';
import type { SessionDetail } from '@/lib/types';

export default function LivePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { data: session } = useQuery({ queryKey: ['session', sessionId], queryFn: () => api<SessionDetail>(`/sessions/${sessionId}`) });
  // ?monitor=1 lets admins and assistants watch without being seen or heard.
  const [monitor, setMonitor] = useState<boolean | null>(null);
  useEffect(() => { setMonitor(new URLSearchParams(window.location.search).get('monitor') === '1'); }, []);
  const { data: conn, error } = useQuery({
    queryKey: ['live-token', sessionId, monitor],
    queryFn: () => api<{ token: string; url: string; isHost: boolean; monitor: boolean }>(`/live/${sessionId}/token${monitor ? '?monitor=1' : ''}`),
    enabled: monitor !== null,
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
          <TopBar title={session?.title ?? 'Live class'} sessionId={sessionId} isHost={conn.isHost} monitor={conn.monitor} />
          <Classroom sessionId={sessionId} isHost={conn.isHost} monitor={conn.monitor} materials={session?.materials ?? []} onMaterialAdded={() => qc.invalidateQueries({ queryKey: ['session', sessionId] })} />
          <RoomAudioRenderer />
        </LiveKitRoom>
      ) : (
        <div className="grid flex-1 place-items-center text-[#b4b2ac]">Connecting to the classroom…</div>
      )}
    </div>
  );
}

function TopBar({ title, sessionId, isHost, monitor }: { title: string; sessionId: string; isHost: boolean; monitor: boolean }) {
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const [hand, setHand] = useState(false);
  const [recording, setRecording] = useState<'idle' | 'starting' | 'on'>('idle');
  const info = useParticipantInfo({ participant: localParticipant });
  const cohost = (() => { try { return !!JSON.parse(info.metadata ?? '{}').cohost; } catch { return false; } })();
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
        {monitor && <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">👁 Monitoring quietly</span>}
        {!isHost && !cohost && !monitor && (
          <button onClick={toggleHand} className="min-h-10 rounded-[10px] bg-white/10 px-4 text-sm font-semibold hover:bg-white/20">
            {hand ? 'Lower hand' : 'Raise hand'}
          </button>
        )}
        {(isHost || cohost) && (
          <>
          <button disabled={recording !== 'idle'} className="min-h-10 rounded-[10px] bg-white/10 px-4 text-sm font-semibold hover:bg-white/20 disabled:opacity-60"
            onClick={async () => {
              setRecording('starting');
              try { await api(`/live/${sessionId}/recording/start`, { method: 'POST' }); setRecording('on'); } catch { setRecording('idle'); }
            }}>
            {recording === 'on' ? '● Recording' : recording === 'starting' ? 'Starting…' : 'Record class'}
          </button>
          <button className="min-h-10 rounded-[10px] bg-[#b3402a] px-4 text-sm font-semibold text-white hover:brightness-110"
            onClick={async () => {
              if (!confirm('End the class for everyone? Nobody but a host can come back in.')) return;
              await api(`/live/${sessionId}/end`, { method: 'POST' }).catch((e) => alert((e as Error).message));
            }}>
            End class
          </button>
          </>
        )}
      </div>
    </div>
  );
}
