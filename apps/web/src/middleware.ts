import NextAuth from 'next-auth';
import { authConfig } from '@/server/auth.config';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isAdminRoute = req.nextUrl.pathname.startsWith('/admin');
  const isAdminApi = req.nextUrl.pathname.startsWith('/api/admin');
  if (!isAdminRoute && !isAdminApi) return;

  const session = req.auth;
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session) {
    const signInUrl = new URL('/dang-nhap', req.nextUrl);
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
    return Response.redirect(signInUrl);
  }
  if (role !== 'admin') {
    if (isAdminApi) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    return Response.redirect(new URL('/', req.nextUrl));
  }
});

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
