'use client';
import { useState } from 'react';
import { cx } from './ui';

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';

/** Circular profile picture. Falls back to the user's initials when there is no picture or it fails to load. */
export function Avatar({ name, src, size = 36, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const show = src && failed !== src;
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-(--accent-soft) font-mono font-bold text-(--accent) select-none', className)}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) }}
      aria-label={show ? undefined : name}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} width={size} height={size} referrerPolicy="no-referrer" onError={() => setFailed(src)} className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/** Crop to a centered square and shrink to `px`, so uploads are small and always round-friendly. */
export async function toSquareJpeg(file: File, px = 256): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, px, px);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
  if (!blob) throw new Error('Could not read that image');
  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
}
