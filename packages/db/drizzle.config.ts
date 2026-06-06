import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './src/schema/enums.ts',
    './src/schema/source.ts',
    './src/schema/story.ts',
    './src/schema/chapter.ts',
    './src/schema/auth.ts',
    './src/schema/user-data.ts',
    './src/schema/app-setting.ts',
    './src/schema/engagement.ts', // Plan D: rating table
    './src/schema/comment.ts', // Plan E: comments + reactions + notifications
  ],
  out: './src/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://smanga:smanga_dev@localhost:5432/smanga',
  },
  casing: 'snake_case',
});
