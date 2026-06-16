# Architecture Decision Records (ADRs)

This directory holds the **Architecture Decision Records** for SManga — short documents that capture *why* a significant technical choice was made, what alternatives were weighed, and the consequences we accepted.

ADRs are immutable history. We do **not** rewrite a decision once it ships; if a later choice replaces an earlier one, we add a *new* ADR and mark the old one **Superseded** with a link. This gives a new developer the full reasoning trail, including the dead ends.

These records were **back-filled** from the real codebase and the design specs in `docs/superpowers/specs/`. Each one cites its source (a spec file, a `CLAUDE.md` section, or the code it describes), so every claim is verifiable.

## When to write an ADR

Write one when a decision is:

- **Hard to reverse** (database engine, the FE/BE split, the deploy target), or
- **Surprising** to a newcomer (cover bytes stored in Postgres, a custom webpack config, a SQL function named `immutable_unaccent`), or
- **Frequently re-litigated** ("why not just use a hosted queue?").

Routine, easily-changed choices (a utility library, a Tailwind token) do not need an ADR.

## Template (MADR-lite)

We use a lightweight [MADR](https://adr.github.io/madr/) shape. Each record has:

- **Status** — `Proposed` · `Accepted` · `Superseded by ADR-NNNN` · `Deprecated`.
- **Context** — the forces at play: requirements, constraints, the problem being solved.
- **Decision** — what we chose, stated plainly.
- **Consequences** — what becomes easier, what becomes harder, the trade-offs we live with.
- **Alternatives considered** — the options we rejected and why.

Copy `0001-postgres-drizzle.md` as a starting skeleton for a new record. Number the file with the next free 4-digit sequence and a kebab-case slug.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-postgres-drizzle.md) | Postgres + Drizzle ORM as the system of record | Accepted |
| [0002](0002-nestjs-vite-split.md) | NestJS API + Vite/React SPA split (replaces the Next.js full-stack) | Accepted (supersedes Plans 1–3) |
| [0003](0003-bull-redis-over-pgboss.md) | Bull + Redis for the job queue (replaces pg-boss) | Accepted (supersedes the original pg-boss design) |
| [0004](0004-cheerio-first-crawler.md) | Cheerio-first crawler with a Playwright escape hatch | Accepted |
| [0005](0005-cover-bytea-in-postgres.md) | Store cover images as `bytea` in Postgres (no object storage) | Accepted |
| [0006](0006-laptop-self-host-cloudflare-tunnel.md) | Self-host on a home laptop behind a Cloudflare Tunnel | Accepted (supersedes Plan 6 managed cloud and Plan 8 VPS) |
| [0007](0007-webpack-ts-workspace-bundling.md) | Custom webpack config to bundle `.ts` workspace packages into the API | Accepted |
| [0008](0008-immutable-unaccent-search-index.md) | `immutable_unaccent` wrapper + GIN trigram index for Vietnamese search | Accepted |

## Related documentation

- Architecture overview — [`../architecture/00-index.md`](../architecture/00-index.md)
- Solution strategy (links each choice to its ADR) — [`../architecture/04-solution-strategy.md`](../architecture/04-solution-strategy.md)
- Crosscutting concepts — [`../architecture/08-crosscutting-concepts.md`](../architecture/08-crosscutting-concepts.md)
- Docs map — [`../README.md`](../README.md)
