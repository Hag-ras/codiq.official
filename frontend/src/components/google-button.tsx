'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
let scriptPromise: Promise<void> | null = null;
function loadGoogle() {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

type GoogleResult = { needsProfile: true; name: string; email: string } | { needsProfile: false };

/**
 * "Continue with Google". `extra` is sent along on first sign-up (accountType, track).
 * If Google reports a brand-new email and no accountType was sent, `onNeedsProfile` is called.
 */
export function GoogleButton({
  next = '/dashboard', extra, onNeedsProfile, text = 'continue_with',
}: {
  next?: string;
  extra?: { accountType?: 'STUDENT' | 'PARENT'; track?: string; acceptTerms?: boolean; language?: string };
  onNeedsProfile?: () => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const latest = useRef({ next, extra, onNeedsProfile });
  latest.current = { next, extra, onNeedsProfile };

  useEffect(() => {
    if (!CLIENT_ID || !box.current) return;
    let cancelled = false;
    loadGoogle()
      .then(() => {
        if (cancelled || !box.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async ({ credential }) => {
            setError('');
            try {
              const res = await api<GoogleResult>('/auth/google', { method: 'POST', json: { credential, ...latest.current.extra } });
              if (res.needsProfile) return latest.current.onNeedsProfile?.();
              const n = latest.current.next;
              router.replace(n.startsWith('/') ? n : '/dashboard');
              router.refresh();
            } catch (e) {
              setError((e as Error).message);
            }
          },
        });
        window.google.accounts.id.renderButton(box.current, { theme: 'outline', size: 'large', width: 360, text, shape: 'rectangular', logo_alignment: 'left' });
      })
      .catch((e) => setError((e as Error).message));
    return () => { cancelled = true; };
  }, [router, text]);

  if (!CLIENT_ID)
    return (
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => setError('Google sign-in is not switched on yet. The site owner needs to add the Google client ID (see docs/SETUP-KEYS.md).')}
          className="flex min-h-11 items-center justify-center gap-3 rounded-[10px] border border-line bg-white px-4 text-[15px] font-semibold hover:border-ink">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
          Continue with Google
        </button>
        {error && <p className="rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger">{error}</p>}
      </div>
    );
  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={box} className="flex min-h-11 justify-center" />
      {error && <p className="w-full rounded-lg bg-[#f7e1df] px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-muted uppercase">
      <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
    </div>
  );
}
