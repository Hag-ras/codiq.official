'use client';
import { io, type Socket } from 'socket.io-client';
import { api } from './api';

export type ChatMessage = { id: string; threadId: string; senderId: string; fromStaff: boolean; body: string; createdAt: string };
export type ThreadSummary = {
  id: string; status: 'OPEN' | 'RESOLVED'; lastMessageAt: string; unreadForStaff: number; unreadForUser: number;
  user: { id: string; name: string; email: string; phone: string | null; role: string; avatar: string | null }; // role is "visitor" for people who are not logged in
  last: { body: string; fromStaff: boolean } | null;
};

export const GUEST_KEY_STORAGE = 'codiq_guest_chat';
export const getGuestKey = () => { try { return localStorage.getItem(GUEST_KEY_STORAGE); } catch { return null; } };
export const saveGuestKey = (k: string) => { try { localStorage.setItem(GUEST_KEY_STORAGE, k); } catch { /* private mode: the chat still works until the page closes */ } };

let socket: Socket | null = null;
let refreshing = false;

/** One shared connection. The access_token cookie authenticates it; when that has expired we refresh it and retry. */
export function chatSocket(): Socket {
  if (socket) return socket;
  const s = io(process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000', { withCredentials: true, transports: ['websocket'], reconnectionDelayMax: 5000, auth: (cb) => cb({ guestKey: getGuestKey() }) });
  s.on('connect_error', async (err) => {
    if (err.message !== 'unauthorized' || refreshing) return;
    refreshing = true;
    try { await api('/auth/me'); s.connect(); } catch { /* signed out: the page will redirect */ } finally { refreshing = false; }
  });
  socket = s;
  return s;
}

export function send(event: string, payload: object): Promise<{ guestKey?: string }> {
  return new Promise((resolve, reject) => {
    chatSocket().timeout(8000).emit(event, payload, (err: Error | null, res?: { ok: boolean; error?: string; guestKey?: string }) => {
      if (err) reject(new Error('No connection. Check your internet and try again.'));
      else if (!res?.ok) reject(new Error(res?.error ?? 'Could not send'));
      else resolve(res);
    });
  });
}

export const timeLabel = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
