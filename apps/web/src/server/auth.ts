import NextAuth, { type NextAuthResult } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { account, session, user, verificationToken } from '@smanga/db/schema';
import { getDb } from './db';
import { env } from '@/lib/env';
import { authConfig } from './auth.config';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const nextAuth: NextAuthResult = NextAuth({
  ...authConfig,
  secret: env.AUTH_SECRET,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: DrizzleAdapter(getDb(), {
    usersTable: user,
    // @auth/drizzle-adapter 1.7.2 types expect snake_case property names
    // (refresh_token, access_token, etc.) on the account table, but our Drizzle
    // schema uses camelCase mapped to snake_case DB columns. Cast is safe at
    // runtime since the adapter reads DB column names, not TS property names.
    accountsTable: account as any,
    sessionsTable: session,
    verificationTokensTable: verificationToken,
  }),
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const db = getDb();
        const [row] = await db.select().from(user).where(eq(user.email, parsed.data.email)).limit(1);
        if (!row || !row.passwordHash) return null;
        const ok = await bcrypt.compare(parsed.data.password, row.passwordHash);
        if (!ok) return null;
        return { id: row.id, email: row.email, name: row.name ?? null, role: row.role };
      },
    }),
    ...(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET
      ? [Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET })]
      : []),
  ],
});

export const handlers: NextAuthResult['handlers'] = nextAuth.handlers;
export const auth: NextAuthResult['auth'] = nextAuth.auth;
export const signIn: NextAuthResult['signIn'] = nextAuth.signIn;
export const signOut: NextAuthResult['signOut'] = nextAuth.signOut;
