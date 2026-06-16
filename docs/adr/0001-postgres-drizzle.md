# ADR 0001 — Postgres + Drizzle ORM as the system of record

- **Status:** Accepted
- **Date:** 2026-05-28 (Plan 1 foundation)
- **Sources:** `CLAUDE.md` § "Architectural decisions (the why)"; design spec `docs/superpowers/specs/2026-05-28-smanga-design.md`; `packages/db/src/schema/*.ts`; `packages/db/src/client.ts`; `packages/db/drizzle.config.ts`.

## Context

SManga's domain is heavily relational: a story has many chapters, many sources (`story_source`), and many genres (`story_genre`); users have reading progress, bookmarks, ratings, views, and comments. These are join-heavy relationships with referential-integrity needs (cascade deletes on `story_genre`/`story_source`, restrict on `source`).

The reader-facing search must work for **Vietnamese**, where users type without diacritics and expect accent-insensitive matches. That requires full-text / fuzzy search over normalized text.

We also wanted a single, self-hostable system of record (the project later runs on a home laptop — see [ADR 0006](0006-laptop-self-host-cloudflare-tunnel.md)) rather than a managed document store.

## Decision

Use **PostgreSQL** as the single source of truth and **Drizzle ORM** as the typed query layer and migration tool.

- Schema is defined in TypeScript under `packages/db/src/schema/` and compiled to SQL migrations by drizzle-kit (`packages/db/src/migrations/`).
- The Postgres extensions `pg_trgm` and `unaccent` are enabled in migration `0001_pale_salo.sql`, supporting accent-insensitive trigram search (see [ADR 0008](0008-immutable-unaccent-search-index.md)).
- The Drizzle client is created in `packages/db/src/client.ts` over the `postgres` (postgres.js) driver.

## Consequences

**Easier**

- Joins, foreign keys, and transactional integrity come for free.
- One database serves app data, search (via `pg_trgm`), and cover blobs (see [ADR 0005](0005-cover-bytea-in-postgres.md)).
- Drizzle gives end-to-end TypeScript types from schema to query, and deterministic migrations tracked in a journal table so re-running on boot is idempotent.

**Harder / trade-offs**

- Drizzle's `.ts`-extension import convention inside `packages/db/src/schema/` is unusual and must be respected (drizzle-kit's CJS bundler cannot resolve `.js` ESM imports back to TS source). Documented in `CLAUDE.md` workaround #1.
- `drizzle.config.ts` lists the schema files as an **explicit array** (not a glob, not the barrel) — a new schema file must be appended there (`CLAUDE.md` workaround #2).
- Postgres `unaccent()` is `STABLE`, not `IMMUTABLE`, so it cannot be indexed directly — handled by the `immutable_unaccent` wrapper ([ADR 0008](0008-immutable-unaccent-search-index.md)).

## Alternatives considered

- **MongoDB + Prisma** — rejected. The domain is relational with many many-to-many joins; a document store would push join logic into application code, and Vietnamese accent-insensitive full-text search is far more natural with `pg_trgm + unaccent` than with Mongo text indexes.
- **A managed hosted database (e.g. Neon)** — used during Plan 6 but later retired; the project moved to a self-hosted Postgres container on the laptop ([ADR 0006](0006-laptop-self-host-cloudflare-tunnel.md)).
