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
  extra?: { accountType?: 'STUDENT' | 'PARENT'; track?: string };
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
      <p className="rounded-lg border border-dashed border-line px-3 py-2 text-center text-sm text-muted">
        Google sign-in is not set up yet (add NEXT_PUBLIC_GOOGLE_CLIENT_ID).
      </p>
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
