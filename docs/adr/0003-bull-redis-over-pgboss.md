# ADR 0003 — Bull + Redis for the job queue (replaces pg-boss)

- **Status:** Accepted — **supersedes** the original pg-boss design (`docs/superpowers/specs/2026-05-28-smanga-design.md` § "Vì sao pg-boss thay vì BullMQ/Inngest").
- **Date:** Plan 4 (NestJS rework)
- **Sources:** `CLAUDE.md` § "Architectural decisions (the why)" and workaround #10; `apps/api/package.json` (`@nestjs/bull`, `bull`, `ioredis`); the `jobs` module under `apps/api/src/modules/`.

## Context

The crawler runs as background work: discover a story's chapters, then crawl each chapter (rate-limited fetch → parse → gzip → persist). This needs a job queue with retries, backoff, priorities, deduplication, and a dead-letter path.

The **original** design (`2026-05-28-smanga-design.md`) chose **pg-boss** on top of Postgres, with the stated rationale "no extra service — one fewer than Redis." That design also predated the NestJS rework and assumed a Next.js + standalone `crawler-worker` topology.

When Plan 4 reworked the stack onto NestJS, the canonical NestJS queue integration is **Bull** (via `@nestjs/bull`), and the reference project (`manga-crawler`) the owner was modelling also used Bull/Redis.

## Decision

Use **Bull** (backed by **Redis 7**) as the job queue, wired through `@nestjs/bull`. Redis is added as a service (`redis:7-alpine` in the prod compose). The crawler runs as **Bull processors inside `apps/api`**, not a separate worker service.

pg-boss is removed; the standalone `services/crawler-worker` is deleted.

## Consequences

**Easier**

- First-class NestJS integration: queues and processors are NestJS providers.
- Mature primitives for retries/backoff, job priorities (auto-crawl enqueues at the lowest priority), repeatable jobs (the smart auto-crawl feeder runs on a `*/1` cron), and idempotent/chunked enqueue.
- Matches the reference project, reducing novel risk.

**Harder / trade-offs**

- **One more service** to run and back up — Redis. The original pg-boss rationale ("no Redis") is the explicit cost we accepted.
- Redis adds operational tuning: the prod compose runs it with `--appendonly yes`, `--maxmemory 768mb`, and `--maxmemory-policy noeviction` so a flood errors writes rather than OOM-killing Postgres.
- A Bull/TLS connection fix was required during Plan 7 (noted in project memory) — Bull's Redis client config is sensitive to the connection URL.

## Alternatives considered

- **pg-boss** (the original choice) — rejected on rework. Its only advantage was avoiding Redis; the NestJS-idiomatic path and reference-project alignment outweighed the extra service. pg-boss's column-naming quirks (`CLAUDE.md` workaround #10, now obsolete) were also a maintenance papercut.
- **BullMQ / Inngest** — the original spec noted BullMQ is only needed above ~10k jobs/hour, which SManga does not approach; plain Bull via `@nestjs/bull` was sufficient and is what the integration provides.
