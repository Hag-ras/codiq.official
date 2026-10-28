'use client';
import { usePathname } from 'next/navigation';
import { ChatWidget } from './chat-widget';

const STAFF = ['ADMIN', 'ASSISTANT'];
/**
 * The floating "Chat with us" button, on every page for everyone except admins and assistants (they answer chats from the inbox).
 * `role` is only used to decide whether to show it: the API still enforces who can do what.
 */
export function ChatLauncher({ role }: { role: string | null }) {
  const path = usePathname();
  if (role && STAFF.includes(role)) return null;
  // The dashboard has a bottom tab bar on phones, so lift the button above it there.
  return <ChatWidget raised={path.startsWith('/dashboard')} />;
}
