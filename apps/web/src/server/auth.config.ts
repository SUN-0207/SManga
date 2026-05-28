import type { NextAuthConfig } from 'next-auth';

/**
 * Lightweight auth config used by the Edge middleware.
 * Must NOT import native modules (bcrypt, pg, etc.).
 * The full auth config in auth.ts adds the credentials provider + db adapter.
 */
export const authConfig: NextAuthConfig = {
  pages: { signIn: '/dang-nhap' },
  providers: [],
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user: u }) {
      if (u) {
        token.role = (u as { role?: string }).role ?? 'user';
        token.uid = (u as { id?: string }).id ?? token.sub;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = (token.uid as string | undefined) ?? token.sub;
        (session.user as { role?: string }).role = (token.role as string | undefined) ?? 'user';
      }
      return session;
    },
  },
};
