import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: {
      '@smanga/shared': path.resolve(__dirname, '../shared/src/index.ts'),
      '@smanga/db/schema': path.resolve(__dirname, '../db/src/schema/index.ts'),
      '@smanga/db': path.resolve(__dirname, '../db/src/index.ts'),
    },
  },
});
