'use client';
import { useEffect, useRef } from 'react';

type YTPlayer = { getCurrentTime: () => number; getDuration: () => number; destroy: () => void };
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
    s.onerror = () => reject(new Error('Could not load YouTube'));
    document.head.appendChild(s);
  });
  return apiReady;
}

/** Embeds a YouTube video (privacy-enhanced domain) and reports watch progress like the file player does. */
export function YouTubePlayer({ videoId, onProgress }: { videoId: string; onProgress?: (seconds: number, completed: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef(onProgress);
  cb.current = onProgress;

  useEffect(() => {
    let player: YTPlayer | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    void loadApi().then(() => {
      if (cancelled || !host.current || !window.YT) return;
      const mount = document.createElement('div');
      host.current.replaceChildren(mount);
      player = new window.YT.Player(mount, {
        videoId, host: 'https://www.youtube-nocookie.com',
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onStateChange: (e: { data: number }) => {
            clearInterval(timer);
            if (e.data === window.YT!.PlayerState.PLAYING) {
              timer = setInterval(() => {
                if (!player) return;
                const t = player.getCurrentTime(), d = player.getDuration();
                cb.current?.(Math.floor(t), d > 0 && t / d > 0.9);
              }, 15_000);
            } else if (e.data === window.YT!.PlayerState.ENDED) cb.current?.(Math.floor(player?.getDuration() ?? 0), true);
          },
        },
      });
    }).catch(() => null);
    return () => { cancelled = true; clearInterval(timer); try { player?.destroy(); } catch { /* already gone */ } };
  }, [videoId]);

  return <div ref={host} className="aspect-video w-full [&_iframe]:size-full" />;
}
