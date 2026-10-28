/** Public path of a user's profile picture, or null if they have none (the UI then shows initials). */
export function avatarSrc(u: { id: string; avatarKey: string | null; avatarUrl: string | null }): string | null {
  if (u.avatarKey) return `/api/avatars/${u.id}?v=${encodeURIComponent(u.avatarKey.slice(-20))}`;
  return u.avatarUrl ?? null;
}
