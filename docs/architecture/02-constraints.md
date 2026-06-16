# 2. Constraints

← back to [architecture index](00-index.md)

These are the fixed conditions the architecture must live within. They are not goals to
optimise; they are non-negotiable boundaries that explain *why* later sections look the way
they do. Most flow from one root fact: SManga is a **single-author hobby project** run as
cheaply as possible.

## 2.1 Organisational and budget constraints

| Constraint | Implication |
|------------|-------------|
| **Single author / operator.** One person (`son.cu@opswat.com`) develops, deploys, and operates everything. | Favour conventions and automation over process. The whole stack must be understandable and recoverable by one person; nothing relies on a team. Drives quality goal #4 (operational simplicity). |
| **~$3/month running cost target.** Effectively the laptop's electricity. | No managed cloud (no Vercel/Railway/Neon/Upstash — that stack from Plan 6 was retired; the Hetzner VPS option from Plan 8 was never executed). Self-host on a home laptop behind a free Cloudflare Tunnel (Plan 9). Cover images live as `bytea` in Postgres instead of paid object storage. |
| **Hobby reliability, no SLA.** Best-effort uptime. | Residential-ISP downtime and single-machine failure are accepted risks (see [§09](09-quality-and-risks.md)). |

## 2.2 Deployment / environment constraints

| Constraint | Implication |
|------------|-------------|
| **Self-host on a home laptop** (Ubuntu, hostname `sunny-server`), exposed via Cloudflare Tunnel → Caddy → a 5-container Docker Compose stack (`postgres17`, `redis7`, `api`, `frontend`, `watchtower`). | No public IP, no port-forwarding; the tunnel is the only ingress. Caddy terminates inside; Cloudflare provides TLS and edge cache. Detailed in [§07](07-deployment-view.md). |
| **Single environment — production only.** There is **no staging tier and no PR-preview environment.** | No pre-merge URL, no rollback-to-staging path. Push to `main` deploys straight to prod (`smanga.shop`) via GHCR + Watchtower, so a bad push can take the live site down. Verify changes locally (and via Playwright where UI is affected) before pushing. Any future staging must be re-introduced on a different stack. |
| **Auto-deploy on push to `main`.** GitHub Actions builds `ghcr.io/sun-0207/smanga-{api,frontend}:latest`; Watchtower on the laptop polls every ~5 min and pulls + restarts. | The deploy pipeline, not a human, ships changes — there is no manual gate between merge and prod. Migrations therefore run **idempotently on every API boot** (Drizzle journal table guards re-runs) rather than as a separate deploy step. |

## 2.3 Development-environment constraints (Windows)

The primary development machine is **Windows 11 with PowerShell** (the project's `CLAUDE.md`
and the local-dev runbook are written for it). This imposes day-to-day constraints:

| Constraint | Implication |
|------------|-------------|
| **PowerShell, not bash, is the dev shell.** | Commands in the docs use PowerShell syntax (`$env:VAR = "…"` to set environment variables, `curl.exe` rather than the `curl` alias, etc.). |
| **Local API port is `3010`, not `3001`.** The default `PORT` is `3001` (`apps/api/src/config/env.ts`), but on the dev laptop OPSWAT corporate software holds `:3001`, so local dev runs the API on `PORT=3010`. | Local-dev instructions set `PORT=3010`; the frontend dev proxy in `apps/frontend/vite.config.ts` points at it. That `vite.config.ts` change is a **local-only dev tweak and is intentionally left uncommitted.** |
| **Biome lint can choke on `$`-containing paths.** TanStack Router file routes use `$slug`-style filenames; the lefthook pre-commit Biome step can skip or mishandle them on Windows. | When a `$slug` route file needs linting, run Biome on it explicitly (`pnpm exec biome check --write '<path>'`) rather than relying on the pre-commit hook. See the testing/CI how-to: [`docs/how-to/testing-and-ci.md`](../how-to/testing-and-ci.md). |
| **Native modules avoided.** Auth hashing uses `bcryptjs` (pure JS), not `bcrypt`. | No platform-specific native build steps; the same code runs on the Windows dev box and the Ubuntu laptop without recompilation. |

## 2.4 Technical / convention constraints

These are codified in `CLAUDE.md` ("Hard-won workarounds"); the architecture must respect
them. The most load-bearing:

| Constraint | Implication |
|------------|-------------|
| **Drizzle schema cross-imports use `.ts` extensions.** Inside `packages/db/src/schema/*.ts`, cross-schema imports use `.ts` (not `.js`), because drizzle-kit's CJS bundler cannot resolve `.js` ESM specifiers back to TS source. | Consumer tsconfigs need `"allowImportingTsExtensions": true, "noEmit": true`. Do not "fix" these back to `.js`. |
| **`drizzle.config.ts` `schema:` is an explicit array**, not a glob or the barrel file. | Adding a schema file means appending its path to that array. |
| **The NestJS app builds with a custom `webpack.config.js`** to bundle the `@smanga/*` workspace packages with their `.ts` imports; the default tsc builder fails. | Adding a workspace package means updating the alias list in `apps/api/webpack.config.js`. See [ADR 0007](../adr/0007-webpack-ts-workspace-bundling.md). |
| **Chapter content is gzipped `bytea`**; `contentByteSize` stores the *uncompressed* length. | Always decompress on read (server-side); never ungzip client-side. See [§08](08-crosscutting-concepts.md). |
| **Vietnamese search relies on a Postgres `immutable_unaccent(text)` wrapper** over a `pg_trgm` GIN index, because the built-in `unaccent()` is `STABLE` (not `IMMUTABLE`) and cannot back an index directly. | Search queries go through the wrapper. See [ADR 0008](../adr/0008-immutable-unaccent-search-index.md). |

> **Sources:** `CLAUDE.md` (state-of-play, hard-won workarounds, what-not-to-do),
> `apps/api/src/config/env.ts` (default `PORT` = 3001), `apps/api/src/main.ts`
> (migration/boot behaviour, dotenv preload), `package.json` (`engines.node >= 20`,
> `bcryptjs`/Biome/lefthook tooling), and the deploy assets under `deploy/home/`
> (5-container compose, Watchtower, image names) summarised in [§07](07-deployment-view.md).
