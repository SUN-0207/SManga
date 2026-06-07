import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    setupFiles: ['reflect-metadata'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@smanga/db': path.resolve(__dirname, '../../packages/db/src/index.ts'),
      '@smanga/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@smanga/crawler': path.resolve(__dirname, '../../packages/crawler/src/index.ts'),
    },
  },
});
