'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

type YTPlayer = {
  getCurrentTime: () => number; getDuration: () => number; getPlayerState: () => number; destroy: () => void;
  playVideo: () => void; pauseVideo: () => void; seekTo: (s: number, ahead: boolean) => void;
  setVolume: (v: number) => void; getVolume: () => number; mute: () => void; unMute: () => void; isMuted: () => boolean;
  setPlaybackRate: (r: number) => void; getVideoLoadedFraction: () => number;
};
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, o: Record<string, unknown>) => YTPlayer; PlayerState: { PLAYING: number; ENDED: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiReady: Promise<void> | null = null;
function loadApi() {
  apiReady ??= new Promise<void>((resolve, reject) => {
    if (window.YT?.Player) return resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { apiReady = null; reject(new Error('Could not load YouTube')); };
    document.head.appendChild(s);
  });
  return apiReady;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const fmt = (s: number) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(r).padStart(2, '0')}`;
};

const Icon = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={d} /></svg>
);
const PLAY = 'M8 5v14l11-7z';
const PAUSE = 'M6 5h4v14H6zM14 5h4v14h-4z';
const REPLAY = 'M12 5V2L7 6.5 12 11V8a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8z';
const VOL = 'M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z';
const MUTE = 'M3 9v6h4l5 5V4L7 9zm13.6 3 2.4-2.4-1.4-1.4-2.4 2.4-2.4-2.4-1.4 1.4 2.4 2.4-2.4 2.4 1.4 1.4 2.4-2.4 2.4 2.4 1.4-1.4z';
const FULL = 'M5 5h5v2H7v3H5zm9 0h5v5h-2V7h-3zM5 14h2v3h3v2H5zm12 0h2v5h-5v-2h3z';
const BACK = 'M11 5V1L6 6l5 5V7a6 6 0 1 1-6 6H3a8 8 0 1 0 8-8z';
const FWD = 'M13 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z';

/**
 * YouTube as storage, Codiq as the player: the iframe has YouTube's own controls switched off and sits under
 * our own control bar (play, seek, skip, speed, volume, fullscreen, keyboard shortcuts). Viewers never click
 * through to YouTube. It reports watch progress every 15 seconds like the file player does.
 */
export function YouTubePlayer({ videoId, startAt = 0, onProgress }: {
  videoId: string;
  /** Seconds to resume from (where the student stopped last time) */
  startAt?: number;
  /** `ended` is true only when the video played to the end (so the next visit starts from the beginning) */
  onProgress?: (seconds: number, completed: boolean, ended?: boolean) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const cb = useRef(onProgress);
  cb.current = onProgress;
  // Only the value at the first render counts: saving progress changes the prop but must not restart the video
  const resume = useRef(startAt > 5 ? Math.floor(startAt) : 0);
  const [resumeLeft, setResumeLeft] = useState(resume.current);

  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [state, setState] = useState(-1);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [idle, setIdle] = useState(false);
  const [full, setFull] = useState(false);
  const [failed, setFailed] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const playing = state === 1 || state === 3;
  const ended = state === 0;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    setReady(false); setStarted(false); setState(-1); setTime(resume.current); setDur(0); setFailed(false);
    void loadApi().then(() => {
      if (cancelled || !host.current || !window.YT) return;
      const mount = document.createElement('div');
      host.current.replaceChildren(mount);
      const p = new window.YT.Player(mount, {
        videoId, host: 'https://www.youtube-nocookie.com',
        playerVars: { ...(resume.current ? { start: resume.current } : {}), controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, playsinline: 1, cc_load_policy: 0 },
        events: {
          onReady: () => { if (cancelled) return; player.current = p; setReady(true); setDur(p.getDuration()); },
          onError: () => setFailed(true),
          onStateChange: (e: { data: number }) => {
            setState(e.data);
            if (e.data === 1) { setStarted(true); setResumeLeft(0); }
            if (e.data === 2) cb.current?.(Math.floor(p.getCurrentTime()), false); // paused: remember the spot
            if (e.data === 0) cb.current?.(Math.floor(p.getDuration()), true, true);
          },
        },
      });
      player.current = p;
      // One ticker drives the seek bar and the 15 second progress reports.
      let sinceReport = 0;
      timer = setInterval(() => {
        const d = p.getDuration?.() ?? 0, t = p.getCurrentTime?.() ?? 0;
        setTime(t); setDur(d); setBuffered(p.getVideoLoadedFraction?.() ?? 0);
        if (p.getPlayerState?.() === 1 && (sinceReport += 0.25) >= 15) {
          sinceReport = 0;
          cb.current?.(Math.floor(t), d > 0 && t / d > 0.9);
        }
      }, 250);
    }).catch(() => setFailed(true));
    return () => { cancelled = true; clearInterval(timer); try { player.current?.destroy(); } catch { /* already gone */ } player.current = null; };
  }, [videoId]);

  useEffect(() => {
    // Leaving the tab or closing it: save where they are
    const save = () => {
      const p = player.current;
      if (document.visibilityState === 'hidden' && p?.getPlayerState?.() === 1) cb.current?.(Math.floor(p.getCurrentTime()), false);
    };
    document.addEventListener('visibilitychange', save);
    return () => document.removeEventListener('visibilitychange', save);
  }, []);

  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === wrap.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const toggle = useCallback(() => {
    const p = player.current; if (!p || !ready) return;
    if (ended) { p.seekTo(0, true); p.playVideo(); } else if (state === 1 || state === 3) p.pauseVideo(); else p.playVideo();
  }, [ready, state, ended]);
  const seekBy = useCallback((d: number) => { const p = player.current; if (p) { const t = Math.min(Math.max(0, p.getCurrentTime() + d), p.getDuration()); p.seekTo(t, true); setTime(t); } }, []);
  const seekTo = (t: number) => { player.current?.seekTo(t, true); setTime(t); };
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen(); else void wrap.current?.requestFullscreen?.();
  }, []);
  const toggleMute = useCallback(() => {
    const p = player.current; if (!p) return;
    if (p.isMuted()) { p.unMute(); setMuted(false); } else { p.mute(); setMuted(true); }
  }, []);
  const pickSpeed = (r: number) => { player.current?.setPlaybackRate(r); setSpeed(r); setSpeedOpen(false); };

  const wake = () => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 2800);
  };
  useEffect(() => () => clearTimeout(idleTimer.current), []);

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') toggle();
    else if (k === 'arrowleft') seekBy(-5);
    else if (k === 'arrowright') seekBy(5);
    else if (k === 'j') seekBy(-10);
    else if (k === 'l') seekBy(10);
    else if (k === 'f') toggleFull();
    else if (k === 'm') toggleMute();
    else return;
    e.preventDefault(); wake();
  };

  const showBar = !playing || !idle || speedOpen;
  const pct = dur > 0 ? (time / dur) * 100 : 0;

  return (
    <div ref={wrap} tabIndex={0} onKeyDown={onKey} onMouseMove={wake} onMouseLeave={() => playing && setIdle(true)}
      className={`group relative aspect-video w-full bg-black outline-none select-none ${full ? 'h-dvh' : ''} ${playing && idle ? 'cursor-none' : ''}`}
      role="region" aria-label="Video player">
      <div ref={host} className="pointer-events-none absolute inset-0 [&_iframe]:size-full" />

      {/* poster before first play: also hides YouTube's own title bar */}
      {!started && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" className="absolute inset-0 size-full object-cover" />
      )}
      {/* dims YouTube's paused overlay (suggested videos) */}
      {!playing && started && <div className="absolute inset-0 bg-black/70" />}

      {/* click target: our player takes every click, never YouTube's */}
      <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle} onDoubleClick={toggleFull} className="absolute inset-0 cursor-pointer" />

      {failed && <p className="absolute inset-0 grid place-items-center bg-black p-6 text-center text-white/80">This video is not available. Ask your instructor to check the link.</p>}
      {!ready && !failed && <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="size-10 animate-spin rounded-full border-2 border-white/25 border-t-white" /></div>}
      {state === 3 && started && <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="size-12 animate-spin rounded-full border-2 border-white/25 border-t-white" /></div>}

      {ready && !playing && !failed && !started && resumeLeft > 0 && (
        <div className="absolute inset-x-0 bottom-16 flex justify-center px-3">
          <div className="flex items-center gap-3 rounded-full bg-black/80 py-1.5 ps-4 pe-1.5 text-sm text-white">
            <span>Continue from <b className="font-mono">{fmt(resumeLeft)}</b></span>
            <button type="button" onClick={() => { player.current?.seekTo(0, true); setTime(0); setResumeLeft(0); }} className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold hover:bg-white/25">Start over</button>
          </div>
        </div>
      )}

      {ready && !playing && !failed && (
        <button type="button" onClick={toggle} aria-label={ended ? 'Replay' : 'Play'}
          className="absolute top-1/2 left-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-clay text-white shadow-lg transition-transform hover:scale-105">
          <Icon d={ended ? REPLAY : PLAY} size={36} />
        </button>
      )}

      {/* control bar */}
      <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pt-10 pb-2 text-white transition-opacity duration-200 ${showBar && ready ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <div className="group/seek relative flex h-5 items-center">
          <div className="relative h-1 w-full rounded-full bg-white/25 transition-[height] group-hover/seek:h-1.5">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${buffered * 100}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-clay-light" style={{ width: `${pct}%` }} />
            <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow group-hover/seek:opacity-100" style={{ left: `${pct}%` }} />
          </div>
          <input type="range" min={0} max={Math.max(1, Math.floor(dur))} step={1} value={Math.floor(time)} aria-label="Seek"
            onChange={(e) => seekTo(Number(e.target.value))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </div>
        <div className="mt-1 flex items-center gap-1 sm:gap-2">
          <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="grid size-10 place-items-center rounded-lg hover:bg-white/15"><Icon d={playing ? PAUSE : ended ? REPLAY : PLAY} /></button>
          <button type="button" onClick={() => seekBy(-10)} aria-label="Back 10 seconds" className="grid size-10 place-items-center rounded-lg hover:bg-white/15"><Icon d={BACK} /></button>
          <button type="button" onClick={() => seekBy(10)} aria-label="Forward 10 seconds" className="grid size-10 place-items-center rounded-lg hover:bg-white/15"><Icon d={FWD} /></button>
          <span className="px-1 font-mono text-[13px] tabular-nums">{fmt(time)} / {fmt(dur)}</span>
          <span className="flex-1" />
          <div className="hidden items-center sm:flex">
            <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} className="grid size-10 place-items-center rounded-lg hover:bg-white/15"><Icon d={muted || volume === 0 ? MUTE : VOL} /></button>
            <input type="range" min={0} max={100} value={muted ? 0 : volume} aria-label="Volume"
              onChange={(e) => { const v = Number(e.target.value); player.current?.setVolume(v); setVolume(v); if (v > 0 && muted) { player.current?.unMute(); setMuted(false); } }}
              className="h-1 w-20 cursor-pointer accent-white" />
          </div>
          <div className="relative">
            <button type="button" onClick={() => setSpeedOpen(!speedOpen)} aria-label="Playback speed" aria-expanded={speedOpen}
              className="grid h-10 min-w-12 place-items-center rounded-lg px-2 font-mono text-[13px] font-bold hover:bg-white/15">{speed}x</button>
            {speedOpen && (
              <ul className="absolute right-0 bottom-11 z-10 min-w-24 overflow-hidden rounded-lg bg-black/90 py-1 shadow-lg">
                {SPEEDS.map((r) => (
                  <li key={r}><button type="button" onClick={() => pickSpeed(r)} className={`block w-full px-4 py-2 text-left font-mono text-[13px] hover:bg-white/15 ${r === speed ? 'font-bold text-clay-light' : ''}`}>{r}x</button></li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" onClick={toggleFull} aria-label={full ? 'Exit fullscreen' : 'Fullscreen'} className="grid size-10 place-items-center rounded-lg hover:bg-white/15"><Icon d={FULL} /></button>
        </div>
      </div>
    </div>
  );
}
