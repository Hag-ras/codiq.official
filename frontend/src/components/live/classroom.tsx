'use client';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Track } from 'livekit-client';
import type { Participant } from 'livekit-client';
import { Chat, ParticipantTile, VideoConference, useChat, useDataChannel, useIsMuted, useLocalParticipant, useParticipantInfo, useParticipants, useTracks } from '@livekit/components-react';
import { api, uploadFile } from '@/lib/api';
import { cx } from '@/components/ui';
import { Board, type Laser } from './board';
import { CodePanel } from './code';
import { openPdf, renderPage } from './pdf';
import { TOPIC, chunk, decode, encode, type El, type Lang, type Msg, type View } from './types';

type Boards = Record<string, El[]>;
type Act = { t: 'add'; k: string; e: El[] } | { t: 'del'; k: string; ids: string[] } | { t: 'clear'; k: string };
function reducer(s: Boards, a: Act): Boards {
  const cur = s[a.k] ?? [];
  if (a.t === 'clear') return { ...s, [a.k]: [] };
  if (a.t === 'del') return { ...s, [a.k]: cur.filter((e) => !a.ids.includes(e.id)) };
  const map = new Map(cur.map((e) => [e.id, e]));
  a.e.forEach((e) => map.set(e.id, e));
  return { ...s, [a.k]: Array.from(map.values()) };
}

const meta = (metadata?: string): { role?: string; cohost?: boolean } => { try { return JSON.parse(metadata ?? '{}'); } catch { return {}; } };
/** The instructor or an admin. */
const isTrueHost = (metadata?: string) => { const r = meta(metadata).role; return r === 'INSTRUCTOR' || r === 'ADMIN'; };
/** Has host controls in the class: a true host or a promoted co-host. */
const isHostRole = (metadata?: string) => isTrueHost(metadata) || !!meta(metadata).cohost;
type Material = { id: string; name: string; mimeType: string };

/**
 * The live classroom: video, whiteboard (with optional PDF slides) and code editor, kept in sync over the
 * LiveKit data channel. The host decides what everyone sees; students follow, and can look around on their own.
 * Only hosts (or anyone, while the host allows drawing) can change the board. Monitors only listen.
 */
export function Classroom({ sessionId, isHost: trueHost, monitor, materials, onMaterialAdded }: {
  sessionId: string; isHost: boolean; monitor: boolean; materials: Material[]; onMaterialAdded: () => void;
}) {
  const { localParticipant } = useLocalParticipant();
  // Co-hosts get the same board, slide and code controls as the host while they are promoted.
  const myInfo = useParticipantInfo({ participant: localParticipant });
  const isHost = trueHost || !!meta(myInfo.metadata).cohost;
  const [asked, setAsked] = useState<{ what: 'mic' | 'cam'; n: string } | null>(null);
  const [toast, setToast] = useState('');
  const [view, setView] = useState<View>('class');
  const [allow, setAllow] = useState(false);
  const [slides, setSlides] = useState<{ id: string; name: string } | null>(null);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [bg, setBg] = useState<{ src: string; ratio: number } | null>(null);
  const [slideError, setSlideError] = useState('');
  const [boards, dispatch] = useReducer(reducer, {} as Boards);
  const [shared, setShared] = useState<{ lang: Lang; code: string } | null>(null);
  const [lasers, setLasers] = useState<Record<string, Laser>>({});
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState(false);
  const count = useParticipants().length;

  // Attendance heartbeat: tells the server every 30s that this person is here, focused, and what they did.
  const { chatMessages } = useChat();
  const chatRef = useRef(chatMessages); chatRef.current = chatMessages;
  const acts = useRef(0);
  const counted = useRef(new Set<string>());
  useEffect(() => {
    if (monitor) return;
    let chatSeen = 0, handWas = false;
    const beat = () => {
      const sent = chatRef.current.filter((m) => m.from?.isLocal).length;
      const hand = localParticipant.attributes?.hand === 'up';
      const n = acts.current + Math.max(0, sent - chatSeen) + (hand && !handWas ? 1 : 0);
      chatSeen = sent; handWas = hand; acts.current = 0;
      api(`/live/${sessionId}/heartbeat`, { method: 'POST', json: {
        active: document.visibilityState === 'visible' && document.hasFocus(),
        cam: localParticipant.isCameraEnabled, mic: localParticipant.isMicrophoneEnabled, interactions: Math.min(30, n),
      } }).catch(() => null);
    };
    beat();
    const t = setInterval(beat, 30_000);
    return () => clearInterval(t);
  }, [monitor, sessionId, localParticipant]);

  const key = slides ? `s:${slides.id}:${page}` : 'board';
  const canDraw = !monitor && (isHost || allow);

  // Latest state for answering "sync" requests from people who just joined.
  const live = useRef({ view, allow, slides, page, boards, shared });
  live.current = { view, allow, slides, page, boards, shared };

  const { send: rawSend } = useDataChannel(TOPIC, (msg) => {
    const m = decode(msg.payload); if (!m) return;
    const from = msg.from;
    const fromHost = isHostRole(from?.metadata);
    const maySketch = fromHost || live.current.allow;
    switch (m.t) {
      case 'sync': {
        if (monitor || !from) return;
        const reply = () => {
          const s = live.current;
          const to = { destinationIdentities: [from.identity] };
          if (isHost) {
            post({ t: 'view', v: s.view }, to); post({ t: 'allow', v: s.allow }, to);
            if (s.shared) post({ t: 'code', on: true, lang: s.shared.lang, code: s.shared.code }, to);
          }
          post({ t: 'slides', m: s.slides, n: s.page }, to);
          Object.entries(s.boards).forEach(([k, els]) => chunk(els).forEach((c) => post({ t: 'add', k, e: c }, to)));
        };
        if (isHost) reply(); else if (fromHost) setTimeout(reply, 150 + Math.random() * 1400); // students help a host who reloaded
        return;
      }
      case 'view': if (fromHost && !isHost) setView(m.v); return;
      case 'allow': if (fromHost) setAllow(m.v); return;
      case 'slides': if (fromHost) { setSlides(m.m); setPage(m.n); } return;
      case 'page': if (fromHost) setPage(m.n); return;
      case 'ask': if (fromHost) setAsked({ what: m.what, n: m.n }); return;
      case 'code': if (fromHost) setShared(m.on ? { lang: m.lang, code: m.code } : null); return;
      case 'add': if (maySketch) dispatch({ t: 'add', k: m.k, e: m.e }); return;
      case 'del': if (maySketch) dispatch({ t: 'del', k: m.k, ids: m.ids }); return;
      case 'clear': if (maySketch) dispatch({ t: 'clear', k: m.k }); return;
      case 'laser': if (maySketch && from) setLasers((l) => ({ ...l, [from.identity]: { x: m.x, y: m.y, n: m.n, at: Date.now() } })); return;
    }
  });
  const post = useCallback((m: Msg, opts: { destinationIdentities?: string[]; reliable?: boolean } = {}) => {
    if (monitor) return;
    void rawSend(encode(m), { reliable: m.t !== 'laser', topic: TOPIC, ...opts }).catch(() => null);
  }, [rawSend, monitor]);

  // Ask for the current state once, when joining.
  useEffect(() => { if (!monitor) { const t = setTimeout(() => post({ t: 'sync' }), 600); return () => clearTimeout(t); } }, [monitor, post]);

  // Lasers fade after a moment.
  useEffect(() => {
    const t = setInterval(() => setLasers((l) => { const now = Date.now(); const keep = Object.entries(l).filter(([, v]) => now - v.at < 1400); return keep.length === Object.keys(l).length ? l : Object.fromEntries(keep); }), 400);
    return () => clearInterval(t);
  }, []);

  // Slides: load the page image for whatever the host is showing.
  useEffect(() => {
    let off = false;
    setSlideError('');
    if (!slides) { setBg(null); setNumPages(0); return; }
    openPdf(slides.id).then((d) => { if (!off) setNumPages(d.numPages); }).catch(() => { if (!off) setSlideError('Could not open the slides'); });
    renderPage(slides.id, page).then((r) => { if (!off) setBg(r); }).catch(() => { if (!off) setSlideError('Could not open the slides'); });
    return () => { off = true; };
  }, [slides, page]);

  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 3500); };
  const moderate = async (action: string, userId?: string, okMsg = 'Done') => {
    try { await api(`/live/${sessionId}/moderate`, { method: 'POST', json: { action, userId } }); say(okMsg); } catch (e) { say((e as Error).message); }
  };
  const ask = (identity: string, what: 'mic' | 'cam', name: string) => {
    post({ t: 'ask', what, n: (localParticipant.name ?? 'The host').split(' ')[0] }, { destinationIdentities: [identity] });
    say(`Asked ${name.split(' ')[0]} to ${what === 'mic' ? 'unmute' : 'turn on the camera'}`);
  };
  const tools: Tools | null = isHost && !monitor ? { trueHost, moderate, ask } : null;

  const changeView = (v: View) => { setView(v); if (isHost) post({ t: 'view', v }); };
  const upsert = (e: El) => { if (!counted.current.has(e.id)) { counted.current.add(e.id); acts.current += 1; } dispatch({ t: 'add', k: key, e: [e] }); post({ t: 'add', k: key, e: [e] }); };
  const remove = (ids: string[]) => { dispatch({ t: 'del', k: key, ids }); post({ t: 'del', k: key, ids }); };
  const clear = () => { dispatch({ t: 'clear', k: key }); post({ t: 'clear', k: key }); };
  const laser = (x: number, y: number) => {
    const n = (localParticipant.name ?? 'Me').split(' ')[0];
    setLasers((l) => ({ ...l, me: { x, y, n, at: Date.now() } }));
    post({ t: 'laser', x, y, n });
  };
  const share = (m: { id: string; name: string } | null) => { setSlides(m); setPage(1); post({ t: 'slides', m, n: 1 }); };
  const goto = (n: number) => { const p = Math.max(1, Math.min(numPages || 1, n)); setPage(p); post({ t: 'page', n: p }); };
  const toggleAllow = () => { setAllow(!allow); post({ t: 'allow', v: !allow }); };
  const shareCode = useCallback((on: boolean, lang: Lang, code: string) => { post({ t: 'code', on, lang, code: code.slice(0, 12000) }); }, [post]);

  const uploadSlides = async (f: File | undefined) => {
    if (!f) return;
    if (f.type !== 'application/pdf') { setSlideError('Slides must be a PDF. In PowerPoint, use File → Export → PDF.'); return; }
    setBusy(true); setSlideError('');
    try {
      const r = await uploadFile(f, 'material');
      const m = await api<{ id: string }>(`/sessions/${sessionId}/materials`, { method: 'POST', json: { name: r.name, fileKey: r.key, sizeBytes: r.size, mimeType: r.type } });
      onMaterialAdded();
      share({ id: m.id, name: r.name });
    } catch (e) { setSlideError((e as Error).message); } finally { setBusy(false); }
  };

  const pdfs = materials.filter((m) => m.mimeType === 'application/pdf');
  const lasersList = useMemo(() => Object.values(lasers), [lasers]);

  const tab = (v: View, label: string) => (
    <button key={v} role="tab" aria-selected={view === v} onClick={() => changeView(v)}
      className={cx('min-h-10 rounded-lg px-4 text-sm font-semibold', view === v ? 'bg-white text-ink' : 'bg-white/10 text-white hover:bg-white/20')}>{label}</button>
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {asked && (
        <div role="alertdialog" className="absolute top-3 left-1/2 z-30 flex w-[min(92vw,460px)] -translate-x-1/2 items-center gap-3 rounded-xl bg-white p-3 text-ink shadow-xl">
          <span className="flex-1 text-[15px]"><b>{asked.n}</b> asks you to {asked.what === 'mic' ? 'unmute your microphone' : 'turn on your camera'}.</span>
          <button className="min-h-10 rounded-lg bg-clay px-4 text-sm font-bold text-white" onClick={() => { void (asked.what === 'mic' ? localParticipant.setMicrophoneEnabled(true) : localParticipant.setCameraEnabled(true)).catch(() => say('Allow camera and microphone access in your browser first')); setAsked(null); }}>
            {asked.what === 'mic' ? 'Unmute' : 'Turn on'}
          </button>
          <button className="min-h-10 rounded-lg px-3 text-sm font-semibold text-muted hover:text-ink" onClick={() => setAsked(null)}>Not now</button>
        </div>
      )}
      {toast && <div role="status" className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-black/85 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2" role="tablist">
        {tab('class', 'Class')}{tab('board', 'Whiteboard')}{tab('code', 'Code')}
        {!isHost && view !== 'class' && <span className="ms-2 hidden text-sm text-white/60 sm:inline">The instructor can switch this view</span>}
        {view === 'class' && (
          <button aria-pressed={people} onClick={() => setPeople(!people)} className={cx('ms-auto min-h-10 rounded-lg px-4 text-sm font-semibold', people ? 'bg-white text-ink' : 'bg-white/10 text-white hover:bg-white/20')}>
            People ({count})
          </button>
        )}
        {isHost && !monitor && view === 'board' && (
          <label className="ms-auto flex cursor-pointer items-center gap-2 text-sm text-white/80">
            <input type="checkbox" checked={allow} onChange={toggleAllow} className="size-4 accent-[#4f86d6]" /> Students can draw
          </label>
        )}
      </div>

      {view === 'class' ? (
        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 min-w-0 flex-1"><VideoConference /></div>
          {people && <aside className="hidden w-72 shrink-0 overflow-y-auto border-s border-white/10 p-3 sm:block"><People tools={tools} /></aside>}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            {view === 'board' && (
              <>
                {(isHost && !monitor) || slides ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {isHost && !monitor ? (
                      <>
                        <select aria-label="Slides" value={slides?.id ?? ''} onChange={(e) => { const m = pdfs.find((x) => x.id === e.target.value); share(m ? { id: m.id, name: m.name } : null); }}
                          className="min-h-9 max-w-60 rounded-lg bg-white/10 px-2 font-semibold text-white">
                          <option value="" className="text-ink">Blank board</option>
                          {pdfs.map((m) => <option key={m.id} value={m.id} className="text-ink">{m.name}</option>)}
                        </select>
                        <label className={cx('flex min-h-9 cursor-pointer items-center rounded-lg bg-white/10 px-3 font-semibold hover:bg-white/20', busy && 'pointer-events-none opacity-60')}>
                          {busy ? 'Uploading…' : 'Upload slides (PDF)'}
                          <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => { void uploadSlides(e.target.files?.[0]); e.target.value = ''; }} />
                        </label>
                      </>
                    ) : slides && <span className="font-semibold">{slides.name}</span>}
                    {slides && numPages > 0 && (
                      <span className="flex items-center gap-1">
                        {isHost && !monitor && <button aria-label="Previous slide" disabled={page <= 1} onClick={() => goto(page - 1)} className="grid size-9 place-items-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30">‹</button>}
                        <span className="px-2 font-mono">{page} / {numPages}</span>
                        {isHost && !monitor && <button aria-label="Next slide" disabled={page >= numPages} onClick={() => goto(page + 1)} className="grid size-9 place-items-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30">›</button>}
                      </span>
                    )}
                    {slideError && <span className="text-[#f08a7a]">{slideError}</span>}
                  </div>
                ) : null}
                <Board els={boards[key] ?? []} bg={bg?.src ?? null} bgRatio={bg?.ratio ?? 16 / 9} canDraw={canDraw} lasers={lasersList} boardKey={key}
                  onUpsert={upsert} onRemove={remove} onClear={clear} onLaser={laser} />
              </>
            )}
            {view === 'code' && <CodePanel isHost={isHost && !monitor} shared={shared} onShare={shareCode} onRun={() => { acts.current += 1; }} />}
          </div>
          <Side tools={tools} />
        </div>
      )}
    </div>
  );
}

const Mic = ({ off }: { off: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM6 11a6 6 0 0012 0M12 17v4" />{off && <path d="M4 4l16 16" />}
  </svg>
);
const Cam = ({ off }: { off: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 7h11v10H3zM14 11l7-4v10l-7-4" />{off && <path d="M4 4l16 16" />}
  </svg>
);

type Tools = {
  trueHost: boolean;
  moderate: (action: string, userId?: string, okMsg?: string) => void;
  ask: (identity: string, what: 'mic' | 'cam', name: string) => void;
};

function PersonRow({ p, n, tools }: { p: Participant; n: number; tools: Tools | null }) {
  const micOff = useIsMuted({ source: Track.Source.Microphone, participant: p });
  const camOff = useIsMuted({ source: Track.Source.Camera, participant: p });
  const [open, setOpen] = useState(false);
  const m = meta(p.metadata);
  const host = isTrueHost(p.metadata);
  const name = p.name || p.identity;
  const can = tools && !p.isLocal && !host && !(m.cohost && !tools.trueHost);
  const item = 'block w-full rounded px-3 py-2 text-start text-sm hover:bg-white/10';
  const run = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <li className="relative flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5">
      <span className="w-6 shrink-0 text-end font-mono text-white/50">{n}</span>
      <span className="min-w-0 flex-1 truncate font-semibold">{name}{p.isLocal && <span className="font-normal text-white/50"> (you)</span>}</span>
      {p.attributes?.hand === 'up' && <span title="Hand raised">✋</span>}
      {host ? <span className="rounded bg-clay px-1.5 text-[11px] font-bold">HOST</span> : m.cohost && <span className="rounded bg-[#6a4c9c] px-1.5 text-[11px] font-bold">CO-HOST</span>}
      <span className={cx('grid size-6 place-items-center rounded', micOff ? 'text-white/35' : 'bg-[#3d7a5a] text-white', p.isSpeaking && !micOff && 'ring-2 ring-white/70')} title={micOff ? 'Mic off' : 'Mic on'}><Mic off={micOff} /></span>
      <span className={cx('grid size-6 place-items-center rounded', camOff ? 'text-white/35' : 'bg-[#3d7a5a] text-white')} title={camOff ? 'Camera off' : 'Camera on'}><Cam off={camOff} /></span>
      {can && (
        <>
          <button aria-label={`Actions for ${name}`} aria-expanded={open} onClick={() => setOpen(!open)} className="grid size-7 place-items-center rounded hover:bg-white/15">⋯</button>
          {open && (
            <div role="menu" className="absolute end-0 top-9 z-20 w-56 rounded-lg bg-[#1d1f23] p-1 shadow-xl ring-1 ring-white/15">
              {micOff ? <button role="menuitem" className={item} onClick={run(() => tools.ask(p.identity, 'mic', name))}>Ask to unmute</button>
                : <button role="menuitem" className={item} onClick={run(() => tools.moderate('mute', p.identity, `${name.split(' ')[0]} muted`))}>Mute</button>}
              {camOff ? <button role="menuitem" className={item} onClick={run(() => tools.ask(p.identity, 'cam', name))}>Ask to turn on camera</button>
                : <button role="menuitem" className={item} onClick={run(() => tools.moderate('camera-off', p.identity, `${name.split(' ')[0]}'s camera stopped`))}>Turn off camera</button>}
              <button role="menuitem" className={item} onClick={run(() => tools.moderate('stop-share', p.identity, 'Screen share stopped'))}>Stop screen share</button>
              {tools.trueHost && (m.cohost
                ? <button role="menuitem" className={item} onClick={run(() => tools.moderate('uncohost', p.identity, `${name.split(' ')[0]} is no longer a co-host`))}>Remove co-host</button>
                : <button role="menuitem" className={item} onClick={run(() => tools.moderate('cohost', p.identity, `${name.split(' ')[0]} is now a co-host`))}>Make co-host</button>)}
              <button role="menuitem" className={cx(item, 'text-[#f08a7a]')} onClick={run(() => { if (confirm(`Remove ${name} from the class? They will not be able to rejoin.`)) tools.moderate('remove', p.identity, `${name.split(' ')[0]} was removed`); })}>Remove from class</button>
            </div>
          )}
        </>
      )}
    </li>
  );
}

/** Everyone in the room, numbered, with who has their camera and mic on. Hosts first. Hosts also get moderation menus. */
function People({ tools }: { tools: Tools | null }) {
  const all = useParticipants();
  const list = [...all].sort((a, b) => Number(isTrueHost(b.metadata)) - Number(isTrueHost(a.metadata)) || Number(!!meta(b.metadata).cohost) - Number(!!meta(a.metadata).cohost) || (a.name ?? '').localeCompare(b.name ?? ''));
  return (
    <div data-lk-theme="default">
      <div className="mb-2 flex items-center justify-between gap-2 px-2">
        <h2 className="text-sm font-semibold text-white/70">Participants ({all.length})</h2>
        {tools && all.length > 1 && <button onClick={() => { if (confirm('Mute everyone except hosts?')) tools.moderate('mute-all', undefined, 'Everyone muted'); }} className="rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20">Mute all</button>}
      </div>
      <ul>{list.map((p, i) => <PersonRow key={p.identity} p={p} n={i + 1} tools={tools} />)}</ul>
    </div>
  );
}

/** Next to the whiteboard and the code editor: a grid of who is on camera, plus people and chat tabs. */
function Side({ tools }: { tools: Tools | null }) {
  const [tab, setTab] = useState<'people' | 'chat'>('people');
  const count = useParticipants().length;
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }, { source: Track.Source.ScreenShare, withPlaceholder: false }], { onlySubscribed: false });
  const sorted = [...tracks].sort((a, b) => Number(b.source === Track.Source.ScreenShare) - Number(a.source === Track.Source.ScreenShare) || Number(isHostRole(b.participant.metadata)) - Number(isHostRole(a.participant.metadata)));
  const pill = (active: boolean) => cx('min-h-9 flex-1 rounded-lg px-3 text-sm font-semibold', active ? 'bg-white text-ink' : 'bg-white/10 text-white hover:bg-white/20');
  return (
    <aside data-lk-theme="default" className="flex h-72 shrink-0 gap-3 lg:h-auto lg:w-80 lg:flex-col">
      {sorted.length > 0 && (
        <div className="grid min-h-0 w-1/2 content-start gap-2 overflow-y-auto sm:grid-cols-2 lg:max-h-[40%] lg:w-full">
          {sorted.slice(0, 6).map((t) => <ParticipantTile key={`${t.participant.identity}-${t.source}`} trackRef={t} className="aspect-video min-h-0" />)}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex gap-2"><button className={pill(tab === 'people')} onClick={() => setTab('people')}>People ({count})</button><button className={pill(tab === 'chat')} onClick={() => setTab('chat')}>Chat</button></div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-white/5 p-1">{tab === 'people' ? <People tools={tools} /> : <Chat style={{ height: '100%' }} />}</div>
      </div>
    </aside>
  );
}
