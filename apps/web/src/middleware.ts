import { NextResponse } from 'next/server';
import type { NextMiddleware } from 'next/server';
import { auth } from '@/server/auth';

const middleware = auth((req) => {
  const isAdminRoute = req.nextUrl.pathname.startsWith('/admin');
  const isAdminApi = req.nextUrl.pathname.startsWith('/api/admin');
  if (!isAdminRoute && !isAdminApi) return NextResponse.next();

  const session = req.auth;
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session) {
    const signInUrl = new URL('/dang-nhap', req.nextUrl);
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }
  if (role !== 'admin') {
    if (isAdminApi) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/', req.nextUrl));
  }
  return NextResponse.next();
}) as NextMiddleware;

export default middleware;

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
