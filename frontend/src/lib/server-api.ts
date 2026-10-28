import { cookies } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:4000';

/** Server Components: forward the user's cookies to the API. Returns null on any error. */
export async function serverApi<T>(path: string): Promise<T | null> {
  const jar = await cookies();
  const res = await fetch(`${API}/api${path}`, { headers: { cookie: jar.toString() }, cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return null;
  return res.json();
}

/** Public, cacheable data such as the package catalogue. */
export async function publicApi<T>(path: string, revalidate = 60): Promise<T> {
  const res = await fetch(`${API}/api${path}`, { next: { revalidate } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
