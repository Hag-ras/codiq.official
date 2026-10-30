import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

type Role = 'STUDENT' | 'PARENT' | 'INSTRUCTOR' | 'ASSISTANT' | 'ADMIN';
const ALL: Role[] = ['STUDENT', 'PARENT', 'INSTRUCTOR', 'ASSISTANT', 'ADMIN'];

// Most specific prefix first. The API enforces the same rules; this is for UX.
const RULES: [string, Role[]][] = [
  ['/dashboard/admin', ['ADMIN']],
  ['/dashboard/teach', ['INSTRUCTOR', 'ADMIN']],
  ['/dashboard/grading', ['INSTRUCTOR', 'ASSISTANT', 'ADMIN']],
  ['/dashboard/children', ['PARENT']],
  ['/dashboard/support', ['STUDENT', 'PARENT', 'INSTRUCTOR']],
  ['/dashboard/inbox', ['ADMIN', 'ASSISTANT']],
  ['/dashboard/billing', ['STUDENT', 'PARENT']],
  ['/dashboard/courses', ['STUDENT']],
  ['/dashboard/catalog', ['STUDENT', 'PARENT']],
  ['/checkout', ['STUDENT', 'PARENT']],
  ['/live', ['STUDENT', 'INSTRUCTOR', 'ASSISTANT', 'ADMIN']],
  ['/dashboard', ALL],
];

const API = process.env.API_URL ?? 'http://localhost:4000';
const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);

async function roleFrom(token?: string): Promise<Role | null> {
  if (!token) return null;
  try {
    return (await jwtVerify(token, secret)).payload.role as Role;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const rule = RULES.find(([p]) => pathname.startsWith(p));
  if (!rule) return NextResponse.next();

  const role = await roleFrom(req.cookies.get('access_token')?.value);
  if (!role) {
    // Access token expired: try a silent refresh before sending to login
    if (req.cookies.get('refresh_token')) {
      const r = await fetch(`${API}/api/auth/refresh`, { method: 'POST', headers: { cookie: req.headers.get('cookie') ?? '' } }).catch(() => null);
      if (r?.ok) {
        const res = NextResponse.redirect(req.nextUrl);
        r.headers.getSetCookie().forEach((c) => res.headers.append('set-cookie', c));
        return res;
      }
    }
    // Not signed in (or the session is dead): drop stale cookies so the public home page works again
    const res = NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname + search)}`, req.url));
    res.cookies.delete('access_token');
    res.cookies.delete('refresh_token');
    return res;
  }
  if (!rule[1].includes(role)) return NextResponse.redirect(new URL('/dashboard?denied=1', req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/dashboard/:path*', '/checkout/:path*', '/live/:path*'] };
