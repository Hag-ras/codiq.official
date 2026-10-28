export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;
function refresh() {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .finally(() => (refreshing = null));
  return refreshing;
}

type Init = Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit };

/** Client-side fetch to the NestJS API with silent token refresh on 401. */
export async function api<T>(path: string, init: Init = {}, retry = true): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    ...rest,
    credentials: 'include',
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refresh()) return api<T>(path, init, false);
    if (typeof window !== 'undefined') window.location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = Array.isArray(body.message) ? body.message[0] : body.message;
    throw new ApiError(res.status, msg ?? 'Something went wrong');
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export type UploadPurpose = 'material' | 'recording' | 'submission' | 'receipt' | 'avatar';

/** Presign, then PUT the file straight to storage. Returns the storage key. */
export async function uploadFile(file: File, purpose: UploadPurpose) {
  const contentType = file.type || 'application/octet-stream';
  const { key, url } = await api<{ key: string; url: string }>('/uploads/presign', {
    method: 'POST',
    json: { purpose, fileName: file.name, contentType },
  });
  const put = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } });
  if (!put.ok) throw new ApiError(put.status, 'Upload failed');
  return { key, name: file.name, size: file.size, type: contentType };
}

export async function openSignedUrl(path: string) {
  const { url } = await api<{ url: string }>(path);
  window.open(url, '_blank', 'noopener');
}
