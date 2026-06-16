# SManga Documentation

This directory is organized following the [Diátaxis](https://diataxis.fr/) framework: four modes of documentation for four different needs.

---

## Tutorial — learning-oriented

For someone new to the project who wants to get it running and understand the basics.

- **[ONBOARDING.md](../ONBOARDING.md)** — Day-1 guide: prerequisites, local setup, first change, monorepo tour.

---

## How-to — task-oriented

Step-by-step recipes for specific development tasks. For the operational runbooks see the cross-links at the bottom of each guide.

- **[how-to/add-a-new-crawler-source.md](how-to/add-a-new-crawler-source.md)** — Implement a new `SourceAdapter`, write fixture-driven parser tests, register in the source registry.
- **[how-to/add-a-database-migration.md](how-to/add-a-database-migration.md)** — Drizzle workflow (`db:generate` → `db:migrate`), the `.ts`-import rule, and the `drizzle.config.ts` explicit-array requirement.
- **[how-to/testing-and-ci.md](how-to/testing-and-ci.md)** — vitest layout, typecheck, lefthook pre-commit, CI pipeline, and Watchtower auto-deploy.

Operational runbooks (kept where they are to avoid duplication):

- **[operations.md](operations.md)** — Full local-dev runbook (4-terminal setup, admin bootstrap, common queries, smoke checklist).
- **[home-runbook.md](home-runbook.md)** — Production ops on the laptop deploy (container management, backup verification, Caddy reload, incident response).
- **[deploy.md](deploy.md)** — Deployment overview (CI → GHCR → Watchtower flow, Cloudflare Tunnel, Caddy).

---

## Reference — information-oriented

Precise, authoritative descriptions of the system's parts.

- **[reference/data-model.md](reference/data-model.md)** — Every Drizzle table: columns, types, nullability, indexes, enums, and import conventions.
- **[reference/api.md](reference/api.md)** — REST surface grouped by module (method, path, auth, purpose) + pointer to live Swagger at `/api/docs`.
- **[reference/configuration.md](reference/configuration.md)** — Every environment variable and `app_setting` runtime flag with purpose, default, and where it is read.
- **[reference/commands.md](reference/commands.md)** — pnpm scripts, CLI commands, and common psql/ops queries.

---

## Explanation — understanding-oriented

Background knowledge: architecture, design decisions, domain rules.

### Architecture (arc42)

- **[architecture/00-index.md](architecture/00-index.md)** — How to read arc42, C4 legend, section index.
- **[architecture/01-introduction-and-goals.md](architecture/01-introduction-and-goals.md)** — Product purpose, quality goals, stakeholders.
- **[architecture/02-constraints.md](architecture/02-constraints.md)** — Technical, organisational, and cost constraints.
- **[architecture/03-context-and-scope.md](architecture/03-context-and-scope.md)** — C4 Level 1 System Context diagram.
- **[architecture/04-solution-strategy.md](architecture/04-solution-strategy.md)** — Key technology choices and their rationale.
- **[architecture/05-building-blocks.md](architecture/05-building-blocks.md)** — C4 Level 2 Container + Level 3 Component diagrams.
- **[architecture/06-runtime-view.md](architecture/06-runtime-view.md)** — Sequence diagrams for the key runtime flows (crawl, read, auth, auto-crawl).
- **[architecture/07-deployment-view.md](architecture/07-deployment-view.md)** — Deployment diagram: laptop, Docker Compose, Cloudflare Tunnel, CI/CD.
- **[architecture/08-crosscutting-concepts.md](architecture/08-crosscutting-concepts.md)** — Auth, queuing, caching, chapter content, Vietnamese search, error model, logging.
- **[architecture/09-quality-and-risks.md](architecture/09-quality-and-risks.md)** — Quality goals met, performance budget, known risks and tech debt.
- **[architecture/10-glossary.md](architecture/10-glossary.md)** — Domain and technical terms.

### Business logic

- **[business-logic/domain-model.md](business-logic/domain-model.md)** — ER diagram, per-entity field summary, chapter/story status machines.
- **[business-logic/crawling-and-discovery.md](business-logic/crawling-and-discovery.md)** — SourceAdapter contract, rate limiting, 2-step discovery, smart auto-crawl, dead-letter/retry.
- **[business-logic/reading-and-engagement.md](business-logic/reading-and-engagement.md)** — Reading progress, bookmarks, ratings, view counting, recommendations, comments.
- **[business-logic/admin-and-moderation.md](business-logic/admin-and-moderation.md)** — Operator flows: source management, crawl-state filters, bulk actions, dead-letter panel, app settings.

### Architecture Decision Records

- **[adr/README.md](adr/README.md)** — ADR purpose, MADR template, index of all decisions.
- **[adr/0001-postgres-drizzle.md](adr/0001-postgres-drizzle.md)** — Why Postgres + Drizzle over MongoDB/Prisma.
- **[adr/0002-nestjs-vite-split.md](adr/0002-nestjs-vite-split.md)** — Why NestJS + Vite/React instead of Next.js full-stack.
- **[adr/0003-bull-redis-over-pgboss.md](adr/0003-bull-redis-over-pgboss.md)** — Why Bull/Redis replaced pg-boss.
- **[adr/0004-cheerio-first-crawler.md](adr/0004-cheerio-first-crawler.md)** — Why cheerio over Playwright for crawling.
- **[adr/0005-cover-bytea-in-postgres.md](adr/0005-cover-bytea-in-postgres.md)** — Why cover images are stored as bytea in Postgres.
- **[adr/0006-laptop-self-host-cloudflare-tunnel.md](adr/0006-laptop-self-host-cloudflare-tunnel.md)** — Why laptop self-host over managed cloud.
- **[adr/0007-webpack-ts-workspace-bundling.md](adr/0007-webpack-ts-workspace-bundling.md)** — Why the NestJS app uses a custom webpack config.
- **[adr/0008-immutable-unaccent-search-index.md](adr/0008-immutable-unaccent-search-index.md)** — Why `immutable_unaccent()` wrapper function for Vietnamese search.
