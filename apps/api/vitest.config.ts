import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // unplugin-swc replaces Vite's default esbuild transform with SWC, which
  // honours emitDecoratorMetadata. This is required for NestJS DI (constructor
  // parameter types must be recorded via Reflect.metadata) in e2e tests.
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorMetadata: true, legacyDecorator: true },
        target: 'es2022',
      },
    }),
  ],
  test: {
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    setupFiles: ['reflect-metadata'],
    // Extend the default pattern to also pick up *.e2e-spec.ts files under test/.
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)', 'test/**/*.e2e-spec.?(c|m)[jt]s?(x)'],
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
