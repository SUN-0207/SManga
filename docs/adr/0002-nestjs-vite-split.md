# ADR 0002 — NestJS API + Vite/React SPA split (replaces the Next.js full-stack)

- **Status:** Accepted — **supersedes** the Plans 1–3 Next.js full-stack architecture.
- **Date:** Plan 4 (NestJS rework)
- **Sources:** `CLAUDE.md` § "Architectural decisions (the why)" and § "Monorepo layout"; `apps/api/src/main.ts`; `apps/api/src/app.module.ts`; `apps/api/package.json`.

## Context

Plans 1–3 built SManga as a **Next.js full-stack** application (`apps/web`) with a separate `services/crawler-worker`. As the product grew (admin operator flows, a Bull-based crawler, an explicit REST surface with Swagger), the owner wanted a clearer separation between the backend and the reader/admin frontend: independent build and deploy units, conventional backend structure (modules, providers, guards, pipes), and a documented API contract.

## Decision

Split into two apps in the monorepo:

- **`apps/api`** — NestJS 11. Owns auth, sources, stories, chapters, covers, jobs (Bull queue + crawler processors), comments, engagement, recommendations, and app-settings modules. Exposes a versioned REST surface under `/api/v1` with Swagger at `/api/docs`, plus non-versioned SEO routes (`/sitemap*.xml`, `/robots.txt`).
- **`apps/frontend`** — Vite + React 19 SPA. Reader pages + admin pages, talking to the API over HTTP.

The legacy `apps/web` (Next.js) and `services/crawler-worker` were deleted in Plan 4 Task 13. The crawler became a **library** (`packages/crawler`) consumed by both `apps/api` (queue processors) and `apps/cli`.

## Consequences

**Easier**

- Backend and frontend scale and deploy independently (two container images, `smanga-api` and `smanga-frontend`).
- NestJS conventions (DI, guards, interceptors, pipes) make auth, validation, and queue wiring idiomatic.
- A typed, Swagger-documented API contract is the single integration point.

**Harder / trade-offs**

- The split discarded roughly half of the Plan 2–3 UI work (an accepted, deliberate cost).
- NestJS bundling the `.ts` workspace packages required a **custom webpack config** ([ADR 0007](0007-webpack-ts-workspace-bundling.md)).
- Two dev servers to run locally (`pnpm dev:api` on `:3001`, `pnpm dev:frontend` on `:3000`); on Windows the API uses `PORT=3010` because OPSWAT holds `:3001`.

## Alternatives considered

- **Keep the Next.js full-stack (Plans 1–3)** — rejected. The owner preferred explicit BE/FE separation for clarity and independent scaling over Next.js's co-located server/client model.
- **Next.js for the frontend only** — not chosen; a plain Vite SPA is lighter and the SEO needs are met by server-rendered sitemaps/robots from the API plus Cloudflare edge caching, not by Next.js SSR.

## Notes

The Edge-runtime workarounds from the old Auth.js/Next.js setup (split middleware, `serverExternalPackages`, Edge-safe bcrypt) are all **obsolete** under this ADR — NestJS uses passport-jwt with no Edge-runtime constraints, and `bcryptjs` (pure JS).
