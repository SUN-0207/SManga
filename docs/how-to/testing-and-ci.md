# Testing and CI

This guide covers the local test setup (vitest), the pre-commit hook (lefthook +
Biome), and the GitHub Actions CI pipeline that builds Docker images and deploys to
production via Watchtower.

Related docs:
- Local dev: [`docs/operations.md`](../operations.md)
- Deploy & rollback: [`docs/home-runbook.md`](../home-runbook.md), [`docs/deploy.md`](../deploy.md)
- Architecture: [`docs/architecture/07-deployment-view.md`](../architecture/07-deployment-view.md)

---

## 1. Running tests locally

The monorepo uses [vitest](https://vitest.dev/) across all packages.

### Run all tests

```powershell
pnpm test
```

This runs `pnpm -r --workspace-concurrency=1 test` — tests in all packages,
one package at a time (concurrency=1 prevents Postgres port conflicts: only
`@smanga/db` spins up a real test database via testcontainers, and serial
execution keeps it from clashing with itself across reruns).

### Run tests for a single package

```powershell
pnpm --filter @smanga/db       test
pnpm --filter @smanga/crawler  test
pnpm --filter @smanga/shared   test
pnpm --filter @smanga/api      test
```

### Watch mode (during active development)

```powershell
pnpm test:watch
```

Runs vitest in watch mode at the workspace root.

---

## 2. What the tests cover

| Package | Test files | Type |
|---|---|---|
| `@smanga/crawler` | `tests/truyenfull-parsers.test.ts` | Fixture-driven HTML parser (static) |
| `@smanga/crawler` | `tests/registry.test.ts` | Adapter registration / resolution |
| `@smanga/crawler` | `tests/rate-limit.test.ts` | Token bucket timing |
| `@smanga/crawler` | `tests/cover.test.ts` | Cover download helpers |
| `@smanga/db` | (db integration tests) | Schema + migration (testcontainers Postgres) |
| `@smanga/api` | (module tests) | NestJS service unit tests |
| `@smanga/shared` | (schema tests) | Zod contract validation |

Crawler parser tests are **fixture-driven**: committed HTML snapshots live under
`packages/crawler/src/sources/<id>/__fixtures__/`.  They run without a network
connection.  Re-capture fixtures when the live site changes and tests break (see
[`docs/how-to/add-a-new-crawler-source.md`](./add-a-new-crawler-source.md)).

---

## 3. Pre-commit hook (lefthook)

`lefthook` is installed by `pnpm install` via the root `prepare` script.  It runs
two checks in parallel on every `git commit`:

```yaml
# lefthook.yml (root)
pre-commit:
  parallel: true
  commands:
    lint:
      glob: "*.{ts,tsx,js,jsx,json,jsonc}"
      run: pnpm exec biome check --no-errors-on-unmatched {staged_files}

    typecheck:
      glob: "*.{ts,tsx}"
      run: pnpm typecheck
```

- **lint** — runs [Biome](https://biomejs.dev/) on all staged TS/JS/JSON files.
- **typecheck** — runs `pnpm typecheck` (= `pnpm -r typecheck`) across the entire
  monorepo.  Cannot be scoped to staged files without losing cross-package type
  guarantees.  Takes ~10–15 s on a warm cache.

### Skipping the hook once

```powershell
$env:LEFTHOOK = "0"; git commit -m "…"
# or
git commit --no-verify -m "…"
```

Use sparingly.  The CI gate runs the same checks.

### Biome on Windows / PowerShell — the `$slug` caveat

Biome's CLI uses positional glob arguments.  On Windows PowerShell, a path
containing `$` (e.g. `apps/frontend/src/$slug/`) is expanded by the shell before
Biome receives it, mangling the argument.

**Workaround:** run Biome manually on the affected file with a quoted path:

```powershell
pnpm exec biome check --write 'apps/frontend/src/$slug/page.tsx'
```

Use single quotes in PowerShell to prevent `$` expansion.  The lefthook hook
passes `{staged_files}` as individual arguments, so it is only affected by paths
that literally contain `$` — this is rare in normal development but occurs with
TanStack Router's file-based routing convention.

---

## 4. Typecheck

```powershell
pnpm typecheck
```

Runs `tsc --noEmit` in each package that has a `typecheck` script.  Packages that
consume `@smanga/db` require `"allowImportingTsExtensions": true` and
`"noEmit": true` in their `tsconfig.json` to handle the `.ts` intra-schema imports
(see `CLAUDE.md` §7 and §1).

---

## 5. Lint

```powershell
pnpm lint          # check only (no writes)
pnpm format        # auto-fix formatting
```

Biome configuration is at the workspace root (`biome.json`).  It covers lint +
format for all `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, and `.jsonc` files.

---

## 6. CI pipeline

The CI runs on GitHub Actions on every push and pull-request targeting `main`.
Configuration: `.github/workflows/ci.yml`.

### What runs

```
CI workflow (ubuntu-latest, timeout 15m)
├── services: postgres:16-alpine + redis:7-alpine
├── steps:
│   ├── pnpm install --frozen-lockfile
│   ├── pnpm lint          (Biome)
│   ├── pnpm typecheck
│   ├── pnpm test          (vitest, all packages)
│   ├── pnpm --filter @smanga/api build
│   └── pnpm --filter @smanga/frontend build
```

Environment variables injected by CI:

| Variable | CI value |
|---|---|
| `DATABASE_URL` | `postgres://smanga:smanga_dev@localhost:5432/smanga` |
| `REDIS_URL` | `redis://localhost:6379` |
| `JWT_SECRET` | `ci-test-secret-32-bytes-of-padding-here-ok-ok` |

### Concurrency

CI uses a concurrency group per workflow+ref with `cancel-in-progress: true`.  A
new push to a branch cancels any in-progress run for that branch.

---

## 7. Docker image build and deploy

Configuration: `.github/workflows/build-images.yml`.

### Trigger

Runs on every push to `main` when any of these paths change:

```
apps/api/**
apps/frontend/**
packages/**
pnpm-lock.yaml
.github/workflows/build-images.yml
```

Also has a `workflow_dispatch` trigger for manual retries from the Actions tab.

### What it does

```
Build & Push Images workflow
├── job: api
│   └── docker/build-push-action → ghcr.io/<owner>/smanga-api:latest
│                                 → ghcr.io/<owner>/smanga-api:<sha>
└── job: frontend
    └── docker/build-push-action → ghcr.io/<owner>/smanga-frontend:latest
                                  → ghcr.io/<owner>/smanga-frontend:<sha>
```

Images are pushed to **GitHub Container Registry (GHCR)** using the repo's
`GITHUB_TOKEN` — no additional secret is needed.

### Deployment flow

![testing-and-ci — diagram 1](../diagrams/how-to-testing-and-ci-1.svg)

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
sequenceDiagram
  participant Dev as Developer
  participant GH as GitHub Actions
  participant GHCR as GHCR
  participant WT as Watchtower (laptop)
  participant Prod as Running containers

  Dev->>GH: git push main
  GH->>GH: CI passes (lint+typecheck+test+build)
  GH->>GHCR: push smanga-api:latest + smanga-frontend:latest
  WT->>GHCR: poll every 5 min (check for new digest)
  WT->>Prod: pull new image, restart container
  Note over Prod: api boot runs `pnpm --filter @smanga/db migrate`<br/>via the prod compose command override, then main.js
```

</details>

Watchtower on the production laptop polls GHCR every 5 minutes.  When a new
`:latest` digest is detected it pulls the image and restarts the container.
Migrations run automatically on every API container boot — **not** via the Dockerfile
(whose `CMD` is just `node apps/api/dist/main.js`), but via the prod compose `command`
override in `deploy/home/docker-compose.prod.yml`, which is literally
`sh -c "pnpm --filter @smanga/db migrate && node apps/api/dist/main.js"`.

For manual override (force pull, rollback), see [`docs/home-runbook.md`](../home-runbook.md).

---

## 8. Additional workflows

| Workflow | File | Purpose |
|---|---|---|
| Crawler health probe | `.github/workflows/crawler-health-probe.yml` | Scheduled probe to verify the crawler can reach source sites |
| Dependabot rebase | `.github/workflows/dependabot-rebase-all.yml` | Auto-rebase Dependabot PRs |
| GHCR vacuum | `.github/workflows/ghcr-vacuum.yml` | Prune old image tags from GHCR |
| Stale | `.github/workflows/stale.yml` | Mark stale issues/PRs |

---

## 9. Quick reference

```powershell
pnpm test                              # all tests
pnpm --filter @smanga/crawler test     # crawler tests only
pnpm typecheck                         # TS across monorepo
pnpm lint                              # Biome lint check
pnpm format                            # Biome auto-fix
LEFTHOOK=0 git commit -m "…"          # skip pre-commit (bash)
$env:LEFTHOOK = "0"; git commit -m "…" # skip pre-commit (PowerShell)
```
