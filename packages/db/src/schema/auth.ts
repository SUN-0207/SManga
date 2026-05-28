import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { userRoleEnum } from './enums.ts';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  image: text('image'),
  passwordHash: text('password_hash'),
  role: userRoleEnum('role').notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable(
  'account',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    expiresAt: integer('expires_at'),
    tokenType: text('token_type'),
    scope: text('scope'),
    idToken: text('id_token'),
    sessionState: text('session_state'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.provider, t.providerAccountId] }) }),
);

export const session = pgTable('session', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

export const verificationToken = pgTable(
  'verification_token',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.identifier, t.token] }) }),
);

export type User = typeof user.$inferSelect;
