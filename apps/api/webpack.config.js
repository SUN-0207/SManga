const path = require('node:path');

const PACKAGES_ROOT = path.join(__dirname, '../../packages');

/**
 * Custom webpack config for apps/api.
 *
 * The workspace packages (packages/db, packages/shared, packages/crawler) are
 * ESM TypeScript packages with .ts extension imports. Two problems to solve:
 *
 * 1. ForkTsCheckerWebpackPlugin runs a full type-check that fails on the
 *    workspace packages' .ts imports and subpath exports. We strip it out
 *    since `tsc --noEmit` (the typecheck script) is the authoritative check.
 *
 * 2. resolve.alias maps @smanga/* to absolute .ts source paths so webpack
 *    bundles them inline instead of treating them as external CJS modules.
 *
 * 3. The ts-loader rule gets happyPackMode so per-file diagnostics are
 *    suppressed (no TS5097 / TS2307 from workspace internals).
 */
module.exports = function webpackConfig(options) {
  // Drop ForkTsCheckerWebpackPlugin — it type-checks with tsconfig.build.json
  // which rejects .ts-extension imports. Type safety is from `tsc --noEmit`.
  const cleanPlugins = (options.plugins || []).filter(
    (p) => p.constructor && p.constructor.name !== 'ForkTsCheckerWebpackPlugin',
  );

  // Patch the ts-loader rule: enable happyPackMode to bypass per-file
  // diagnostics, and widen the exclude so @smanga/* packages are bundled.
  const patchedRules = (options.module?.rules || []).map((rule) => {
    const usesArray = Array.isArray(rule.use);
    const hasTsLoader = usesArray && rule.use.some((u) => (u.loader || '').includes('ts-loader'));
    if (!hasTsLoader) return rule;

    return {
      ...rule,
      // Include workspace packages (they're NOT in node_modules on disk after
      // symlink resolution, but we explicitly allow @smanga anyway)
      exclude: (modulePath) =>
        modulePath.includes('node_modules') &&
        !modulePath.includes('@smanga'),
      use: rule.use.map((u) => {
        if (!(u.loader || '').includes('ts-loader')) return u;
        return {
          ...u,
          options: {
            ...(u.options || {}),
            // happyPackMode suppresses all ts-loader diagnostics
            happyPackMode: true,
            transpileOnly: true,
          },
        };
      }),
    };
  });

  // Allow @smanga/* workspace packages to be bundled inline (they ship .ts
  // source, not compiled JS, so they can't be treated as CJS externals).
  const patchedExternals = (options.externals || []).map((ext) => {
    if (typeof ext !== 'function') return ext;
    return function smangaAwareExternal(ctx, cb) {
      if (ctx.request && ctx.request.startsWith('@smanga/')) return cb();
      return ext(ctx, cb);
    };
  });

  return {
    ...options,
    externals: patchedExternals,
    plugins: cleanPlugins,
    module: {
      ...(options.module || {}),
      rules: patchedRules,
    },
    resolve: {
      ...(options.resolve || {}),
      extensions: ['.ts', '.js'],
      // Remove TsconfigPathsPlugin — we use explicit alias entries below
      plugins: [],
      alias: {
        // @/ is a PREFIX alias — must NOT have $ (used as @/config/env etc.)
        '@': path.join(__dirname, 'src'),
        // Workspace packages: exact-match ($) prevents @smanga/db from
        // greedily matching @smanga/db/schema and appending '/schema' to the
        // target (webpack prefix-alias behaviour).
        '@smanga/db$': path.join(PACKAGES_ROOT, 'db/src/index.ts'),
        '@smanga/db/schema': path.join(PACKAGES_ROOT, 'db/src/schema/index.ts'),
        '@smanga/db/client': path.join(PACKAGES_ROOT, 'db/src/client.ts'),
        '@smanga/shared$': path.join(PACKAGES_ROOT, 'shared/src/index.ts'),
        '@smanga/crawler$': path.join(PACKAGES_ROOT, 'crawler/src/index.ts'),
      },
    },
  };
};
