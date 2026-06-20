# Pipeline & Prod-Safety Hardening — Design Spec

> **Status:** APPROVED 2026-06-19 — ready for an implementation plan.
> **Origin:** the highest-real-risk cluster from the 2026-06-19 repo-health audit (see [[project_smanga_perf_2026-06-19]] for the perf sibling). All four fixes are config/CI/dependency changes — **no application behavior or UI change**.

## Problem

SManga is trunk-based with no staging tier: a push to `main` → CI + image-build run **in parallel and independently** → Watchtower deploys the new image to prod (`smanga.shop`) within ~5 min. Four gaps make a careless push or environment drift able to break prod or hide failures:

1. **`build-images.yml` does not depend on CI.** A lint/type/test failure in `ci.yml` does not stop the image build+push; the broken image ships to prod. The CI "gate" is a parallel observer for direct pushes, not a gate.
2. **Postgres version drift:** CI + dev + the migration testcontainer run `postgres:16-alpine`; prod runs `postgres:17-alpine`. A migration can pass CI and break on the prod deploy, with no staging to catch it.
3. **CVE-bearing deps on real surfaces:** `vitest@2.1.4` (2 critical CVEs — RCE + arbitrary file read via the dev UI server) and `undici@6.21.0` (direct dep in `packages/crawler`, the live outbound HTTP client; high CVEs — WebSocket DoS, SameSite downgrade).
4. **lefthook silently skips `$`-route files on Windows:** the `lint` hook passes `{staged_files}` as args; PowerShell expands `$`, biome matches nothing, `--no-errors-on-unmatched` exits 0 — so the hook false-passes and CI (Linux, whole-repo `biome check .`) catches what the hook missed. Documented friction that has bitten a push.

## Goal

Make the deploy pipeline a real gate, eliminate the env drift + CVEs, and stop the hook false-pass — with zero change to application behavior. Reduce the most likely paths to a prod incident.

## Decisions (locked)

- **Gate via merge:** fold the image builds into `ci.yml` as jobs gated `needs: [test]` (chosen over a cross-workflow `workflow_run`). Delete `build-images.yml`.
- **Align dev/CI/test Postgres to 17** (match prod).
- **`vitest → ^3.2.6`, `undici → ^6.27.0`** (stay on undici 6.x to avoid the 7.x dispatch-API break; vitest 3.x has no breaking API for the current tests).
- **lefthook `lint` → whole-repo `pnpm lint`** (CI parity).
- Scope = a single implementation plan. No app/UI/schema change.

## Fix 1 — Gate image build on CI (merge into `ci.yml`)

Restructure `.github/workflows/ci.yml` into a gated pipeline; **delete `.github/workflows/build-images.yml`**.

- Keep the existing `test` job (lint → typecheck → test → build api → build frontend) unchanged; it runs on PR + push as today.
- Add `permissions: { contents: read, packages: write }` at the workflow level (the test job only needs read; the image jobs need `packages: write` to push to GHCR).
- Add `workflow_dispatch:` so a manual rebuild is still possible (replaces `build-images.yml`'s manual trigger).
- Add a **`changes` job** using `dorny/paths-filter@v3` that outputs whether any image-relevant path changed (`apps/api/**`, `apps/frontend/**`, `packages/**`, `pnpm-lock.yaml`) — preserving today's docs-only-skip optimization.
- Add **`image-api`** and **`image-frontend`** jobs, each:
  - `needs: [test, changes]`
  - `if: github.ref == 'refs/heads/main' && needs.changes.outputs.images == 'true'` (build only on main, only after tests pass, only when relevant paths changed)
  - Body identical to today's `build-images.yml` jobs: lowercase-owner step, `docker/setup-buildx-action@v4`, `docker/login-action@v4` (ghcr.io, `github.actor` / `secrets.GITHUB_TOKEN`), `docker/build-push-action@v7` with the same `file`, `tags` (`:latest` + `:${{ github.sha }}`), and `cache-from`/`cache-to` gha scopes (`smanga-api` / `smanga-frontend`).

Net behavior: on a main push, images build **only after** `test` is green → a broken push never reaches prod. Deploy latency grows by ~the test-job runtime (~2 min) — the accepted safety trade. PRs run `test` only (no image push), as today.

## Fix 2 — Align Postgres 16 → 17

Change `postgres:16-alpine` → `postgres:17-alpine` in exactly three places:
- `.github/workflows/ci.yml` (`services.postgres.image`)
- `docker-compose.dev.yml` (`postgres` service image)
- `packages/db/tests/setup.ts` (`new PostgreSqlContainer('postgres:17-alpine')`)

CI + the testcontainer are ephemeral (fresh each run) → trivial. **The local dev DB has a persistent volume**, and Postgres refuses to start on a data dir from a different major version — so the local dev DB must be **re-initialized once**: stop the stack, remove the postgres volume, `pnpm db:migrate` + `pnpm db:seed`. The dev data is fully recreatable; this is a documented one-time local step, not a code concern. (No prod change — prod is already 17.)

## Fix 3 — Patch CVE-bearing dependencies

- **vitest → `^3.2.6`** in every `package.json` that pins `2.1.4` (root + `apps/frontend` + `packages/crawler` + `packages/db` + `packages/shared`, and `apps/api` if it pins it — the plan greps to enumerate). Clears the RCE + file-read CVEs (dev-server/UI only, but flagged against the lockfile). No breaking API for the existing `describe/it/expect` tests; vitest 3 pulls Vite 6 which also clears the transitive esbuild CORS advisory.
- **undici → `^6.27.0`** as the direct pin in `packages/crawler/package.json`, **plus** a root `pnpm.overrides` entry `"undici": "^6.27.0"` to lift the transitive copy pulled via cheerio. Clears the high CVEs on the crawler's live outbound fetch path. The crawler uses undici's `request()`/`Pool` API — unchanged across 6.21→6.27.
- *(Optional hygiene, low-risk freebie:)* remove the deprecated `@types/bull` from `apps/api` (bull 4.x ships its own types).
- **Verify:** `pnpm install`, then `pnpm -r test` (the 30 unit/integration + the 86 api tests) all green, and `pnpm -r typecheck` clean. Re-run `pnpm audit` to confirm the critical/high count drops.

## Fix 4 — Fix the lefthook `$`-path skip

In `lefthook.yml`, change the `lint` command from
`run: pnpm exec biome check --no-errors-on-unmatched {staged_files}`
to
`run: pnpm lint`
(keep the `glob: "*.{ts,tsx,js,jsx,json,jsonc}"` so the step only fires when relevant files are staged, but it then lints the **whole repo** — exactly what CI runs). This removes the per-file `$`-expansion bug, the silent skip, and the manual `biome check --write '<$path>'` dance; the hook can no longer pass something CI will fail. Biome is ms-fast; the `typecheck` hook already runs whole-repo, so this is consistent.

## Testing / Verification

- **Local:** `pnpm -r test` + `pnpm -r typecheck` green after the dep bumps; `pnpm audit` critical/high count drops; commit a `$`-route file and confirm the lefthook lint now runs whole-repo (no silent skip).
- **CI (on push):** the merged `ci.yml` runs green; confirm `image-api`/`image-frontend` are **gated** — they appear only on the main push after `test` succeeds, and are skipped on a docs-only push (changes filter) and on PRs (`if ref==main`).
- **Gate proof:** reason + structure (a failed `test` job means `needs: [test]` blocks the image jobs). Optionally, a deliberate throwaway branch/PR with a lint error confirms `test` fails and no image builds — but on `main` we won't intentionally break; the `needs` semantics are the guarantee.
- **Deploy:** a normal post-merge deploy lands via Watchtower as before (just later).

## Boundaries

- **Always:** commit only the files each task lists (explicit `git add`); never commit `apps/frontend/vite.config.ts` (permanent local proxy edit); commit messages end with the `Co-Authored-By` trailer; do NOT push without explicit instruction. The local dev-DB re-init (Fix 2) is a manual operator step, not committed.
- **Ask first:** any change to the `test` job's existing steps; any undici 7.x or other major bump beyond the listed ones; touching prod compose/Caddy.
- **Never:** weaken CI (e.g. `continue-on-error` on the gate); push a broken pipeline; rewrite git history for the (non-leaked) on-disk PAT.

## Acceptance criteria

1. `build-images.yml` is gone; `ci.yml` builds + pushes the api/frontend images only as jobs `needs: [test]`, only on `main`, only when image-relevant paths changed — and a failing `test` job prevents any image push.
2. PRs still run `test` only (no image push); docs-only main pushes skip the image jobs.
3. CI, `docker-compose.dev.yml`, and the migration testcontainer all use `postgres:17-alpine`; the migration suite passes on PG17.
4. `vitest` is `^3.2.6` and `undici` is `^6.27.0` (direct + override) everywhere; `pnpm -r test` + `pnpm -r typecheck` are green; `pnpm audit` shows the critical/high CVEs cleared.
5. The lefthook `lint` hook runs whole-repo `pnpm lint`; editing a `$`-route file no longer silently passes a lint error the CI would catch.
6. No application/UI/schema behavior changed.
