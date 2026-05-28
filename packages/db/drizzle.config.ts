import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './src/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://smanga:smanga_dev@localhost:5432/smanga',
  },
  casing: 'snake_case',
});
