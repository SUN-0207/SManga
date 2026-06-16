# ADR 0007 — Custom webpack config to bundle `.ts` workspace packages into the API

- **Status:** Accepted
- **Date:** Plan 4 (NestJS rework)
- **Sources:** `CLAUDE.md` workarounds #1, #5, #7, #14; `apps/api/webpack.config.js`; `apps/api/tsconfig.json` (`allowImportingTsExtensions: true`, `noEmit: true`).

## Context

`apps/api` (NestJS) depends on three workspace packages — `@smanga/db`, `@smanga/shared`, `@smanga/crawler` — that ship **TypeScript source** (not compiled JS) and use `.ts`-extension internal imports inside `packages/db/src/schema/` (required by drizzle-kit's bundler; [ADR 0001](0001-postgres-drizzle.md), `CLAUDE.md` workaround #1).

NestJS's default `tsc` builder fails on this: it cannot emit a runnable bundle that pulls `.ts`-source workspace packages, and its bundled `ForkTsCheckerWebpackPlugin` type-checks with `tsconfig.build.json`, which **rejects** `.ts`-extension imports.

## Decision

Use NestJS's **webpack builder** with an explicit custom config (`apps/api/webpack.config.js`) that:

1. **Drops `ForkTsCheckerWebpackPlugin`** — type safety comes from the separate `tsc --noEmit` typecheck script, which is the authoritative check.
2. **Aliases `@smanga/*` to absolute `.ts` source paths** (e.g. `@smanga/db$` → `packages/db/src/index.ts`, `@smanga/db/schema` → `.../schema/index.ts`) so webpack **bundles them inline** instead of treating them as external CJS modules. Exact-match (`$`) aliases prevent prefix greediness.
3. **Patches the ts-loader rule** with `happyPackMode` + `transpileOnly` and widens the `exclude` so `@smanga/*` is compiled even though it resolves under symlinks.
4. **In watch mode** adds `RunScriptWebpackPlugin` (`name: 'main.js'`, `autoRestart: true`) — `nest start --watch` rebuilds the bundle but does **not** restart the Node process under this config, so the plugin spawns and restarts `dist/main.js` on each successful rebuild (`CLAUDE.md` workaround #14).

Consumer tsconfigs (`apps/api/tsconfig.json`) set `allowImportingTsExtensions: true` and `noEmit: true` to typecheck through the db package's `.ts` schema imports (`CLAUDE.md` workaround #7).

## Consequences

**Easier**

- The API can consume `.ts`-source workspace packages directly, with no separate compile step for `packages/*`.
- Dev `--watch` truly hot-restarts the API on source change.
- One source of truth for types: `tsc --noEmit`.

**Harder / trade-offs**

- A bespoke, non-default build config to maintain. **Adding a new workspace package means updating the alias list** in `webpack.config.js` (`CLAUDE.md` workaround #5).
- Type-checking is decoupled from the bundle step (`transpileOnly`), so a broken type only surfaces in the explicit typecheck, not the build.
- If we ever switch off webpack mode in `nest-cli.json`, the `RunScriptWebpackPlugin` watch block can be removed.

## Alternatives considered

- **Default `tsc` builder** — rejected; fails on `.ts`-extension workspace imports and runs an incompatible fork-checker.
- **Pre-compile `packages/*` to JS** — rejected; the `.ts`-import convention is mandated by drizzle-kit ([ADR 0001](0001-postgres-drizzle.md)), and inline bundling avoids a publish/build dance for in-repo packages.
