# Onboarding + Architecture Documentation Set — Design

> **Status:** Approved 2026-06-16. Next step: writing-plans.
> **Problem:** SManga has a `README`, ops/deploy runbooks, ~30 per-feature specs/plans, a graphify graph, and `CLAUDE.md` — but **no cohesive architecture doc, business-logic doc, or new-developer onboarding guide**. A new dev cannot get productive or understand the system from one place.

## Goal

Produce a comprehensive, accurate, **docs-as-code** documentation set (English, Markdown + Mermaid, in-repo) that lets a new developer onboard quickly and understand the architecture, business logic, and conventions — structured per established standards.

## Decisions (locked)

- **Language: English.** Code identifiers already English; Vietnamese only inside domain terms in the glossary where helpful.
- **Comprehensive single pass** — author the full set described below in one plan (not phased).
- **Format: plain Markdown in-repo + Mermaid diagrams.** No doc-site generator, no diagrams-as-images, no auto-API-doc tooling (all out of scope / future).
- **Standards:** **Diátaxis** organizes `docs/` (tutorial / how-to / reference / explanation); **arc42** is the architecture-doc backbone; **C4** for architecture diagrams (Mermaid); **ADRs** (MADR-style) for decisions.
- **Accuracy first:** every doc is derived from the actual code (graphify + reading source) and cites real file paths; a verification pass checks claims against the codebase and that Mermaid renders.

### Standards references
- arc42: <https://arc42.org/overview>, <https://docs.arc42.org/home/>
- C4 model: <https://c4model.com/>
- Diátaxis: <https://diataxis.fr/>
- ADR (MADR): <https://adr.github.io/madr/>

## Deliverables (file tree)

```
ONBOARDING.md                    # Tutorial — Day-1 new-dev path (root entry point)
docs/
  README.md                      # Docs map (Diátaxis landing)
  architecture/                  # arc42 (Explanation)
    00-index.md
    01-introduction-and-goals.md
    02-constraints.md
    03-context-and-scope.md      # C4 L1 System Context (Mermaid)
    04-solution-strategy.md
    05-building-blocks.md        # C4 L2 Containers + L3 Components (Mermaid)
    06-runtime-view.md           # sequence diagrams (Mermaid)
    07-deployment-view.md        # deployment diagram (Mermaid)
    08-crosscutting-concepts.md
    09-quality-and-risks.md
    10-glossary.md
  business-logic/                # Explanation
    domain-model.md              # ER + lifecycle/state diagrams (Mermaid)
    crawling-and-discovery.md
    reading-and-engagement.md
    admin-and-moderation.md
  reference/                     # Reference
    data-model.md
    api.md
    configuration.md
    commands.md
  adr/                           # Decisions (MADR)
    README.md                    # index + template
    0001-..-NN-*.md              # one per decision (see ADR section)
  how-to/                        # How-to
    add-a-new-crawler-source.md
    add-a-database-migration.md
    testing-and-ci.md
```

Plus: update root `README.md` with a "Documentation" section linking `ONBOARDING.md` + `docs/README.md`. Existing `docs/operations.md`, `docs/home-runbook.md`, `docs/deploy.md` are **kept and cross-linked** (they are the local-dev and deploy/rollback how-tos) — not duplicated.

## Per-document content requirements

> Each file derives content from the cited source areas (read them / `graphify query`), cites real file paths, and stays factual. Keep arc42's "empty compartment is fine" principle — thin sections stay short.

### ONBOARDING.md (Tutorial)
Linear Day-1 path: what SManga is (2–3 sentences) → prerequisites (Node/pnpm/Docker, Windows/PowerShell notes) → clone + `pnpm install` → `pnpm dev:db` → migrate + seed → bootstrap admin → `dev:api` + `dev:frontend` → smoke test (open reader + Swagger) → **"your first change"** mini-walkthrough → monorepo tour (1 line per package/app) → "where to go next" links into `docs/`. Source: `README.md`, `docs/operations.md`, `CLAUDE.md`, root `package.json` scripts.

### docs/README.md (Diátaxis map)
Short landing: the four quadrants, what lives where, when to read which. Links every doc.

### docs/architecture/ (arc42)
- **00-index.md** — how to read arc42, the C4 legend, section map.
- **01-introduction-and-goals.md** — product purpose, top quality goals, stakeholders. Source: spec `2026-05-28-smanga-design.md`, `CLAUDE.md`.
- **02-constraints.md** — technical/organizational constraints (single-author hobby, laptop self-host, residential ISP, Windows dev, free-tier cost target). Source: `CLAUDE.md`.
- **03-context-and-scope.md** — **C4 L1 System Context** (Mermaid): SManga ↔ readers, admin, `truyenfull.today` source, Cloudflare, Google OAuth, Google Drive backup. External interfaces + scope.
- **04-solution-strategy.md** — key tech choices in brief (NestJS + Vite split, Postgres/Drizzle, Bull/Redis, cheerio crawler, self-host) with links to the relevant ADRs.
- **05-building-blocks.md** — **C4 L2 Container** (Mermaid: frontend, api, postgres, redis, crawler, cli) + **C4 L3 Component** for the API (modules: auth, stories, chapters, covers, jobs/queue, comments, engagement, recommendations, app-settings) and the crawler engine/adapter. Source: `apps/api/src/modules/*`, `packages/crawler`, graphify.
- **06-runtime-view.md** — Mermaid **sequence diagrams** for: (1) crawl-a-chapter pipeline (fetch→parse→gzip→persist→cover), (2) 2-step discovery, (3) reader read-path (slug→story→chapters/all→chapter content gunzip), (4) auth (passport-jwt cookie), (5) smart auto-crawl drainer (Bull repeatable feeder → watermark → frontier picker). Source: `packages/crawler`, `apps/api` modules, the relevant specs.
- **07-deployment-view.md** — Mermaid deployment diagram: laptop (Ubuntu) → cloudflared tunnel → Caddy → 5-container compose (postgres17/redis7/api/frontend/watchtower) + nightly pg_dump → HDD + Google Drive; CI→GHCR→Watchtower flow. Source: `deploy/home/*`, `docs/home-runbook.md`, `CLAUDE.md`, `.github/workflows`.
- **08-crosscutting-concepts.md** — auth/JWT cookie, Bull queue + job model, caching (Cloudflare edge + `Cache-Control`/ETag, cover immutability), gzip bytea for chapter content, Vietnamese search (`pg_trgm` + `immutable_unaccent`), theming/design tokens, error classes, logging (pino), env loading. Source: cross-cutting code + `CLAUDE.md` workarounds.
- **09-quality-and-risks.md** — quality goals (performance budget from the perf program, a11y, SEO) + risks/technical-debt (residential ISP SPOF, single env/no staging, parked loose ends). Source: perf spec, `CLAUDE.md`.
- **10-glossary.md** — domain terms (truyện/chương/thể loại, crawl/discovery/stub, dead-letter, watermark) + technical terms.

### docs/business-logic/ (Explanation)
- **domain-model.md** — Mermaid **ER diagram** + per-entity lifecycle/state (e.g. chapter status pending→crawled/failed; story discoveryStatus; job states). Entities: Story, Chapter, Source, Genre, User, Comment, Rating, Bookmark, ReadingProgress, Job, AppSetting. Source: `packages/db/src/schema/*`.
- **crawling-and-discovery.md** — business rules: SourceAdapter contract, rate-limit (1 rps token bucket), dedup, gzip + `contentByteSize`, 2-step browse→stub→discover→crawl, smart auto-crawl (watermark, newest-first frontier, priority), dead-letter + retry. Source: `packages/crawler`, `apps/api` jobs/app-settings, specs.
- **reading-and-engagement.md** — reading progress (furthest-read), bookmarks, ratings (avg/count, optimistic), view counting (per-day), recommendations, rankings, comments (tree, pagination, mentions). Source: relevant api modules + frontend.
- **admin-and-moderation.md** — operator flows: sources/discover, crawl-state filters (needs-crawl vs has-errors), featured curation, bulk actions, dead-letter panel, comment moderation, app settings (auto-crawl toggle). Source: admin modules + routes.

### docs/reference/ (Reference)
- **data-model.md** — table-by-table: columns, types, indexes (incl. GIN trigram + composite uniques), enums, the `.ts`-import schema convention. Source: `packages/db/src/schema/*`, migrations.
- **api.md** — REST surface grouped by module, auth requirements, and a pointer to live Swagger at `/api/docs`; document the non-`/api/v1` SEO routes. Source: `apps/api` controllers.
- **configuration.md** — every env var (DATABASE_URL, REDIS_URL, JWT_SECRET, PORT, DB_POOL_MAX, OAuth, AUTOCRAWL_*, etc.) with purpose/default, and `app_setting` runtime flags. Source: `apps/api/src/config`, compose files, `CLAUDE.md`.
- **commands.md** — pnpm scripts (dev/build/test/typecheck/db), the CLI (`pnpm crawl`, health-probe), common psql/ops queries. Source: `package.json`s, `docs/operations.md`, `reference_smanga_prod_ops`.

### docs/adr/ (Decisions — MADR)
`README.md` = index + the MADR template. One ADR per significant decision, **back-filled** from `CLAUDE.md` "Architectural decisions" + "Hard-won workarounds" + retired plans. Minimum set (number sequentially; status Accepted, or Superseded where retired):
1. Postgres + Drizzle (not MongoDB/Prisma)
2. NestJS + Vite/React split (not Next.js full-stack) — supersedes Plans 1–3
3. Bull + Redis (not pg-boss)
4. Cheerio-first crawler (Playwright fallback flag)
5. Cover stored as `bytea` in Postgres (not object storage)
6. Laptop self-host via Cloudflare Tunnel (Plan 9) — supersedes Vercel/Railway (Plan 6) and VPS (Plan 8)
7. Webpack bundling for `apps/api` with `.ts` workspace imports (drizzle-kit CJS constraint)
8. `immutable_unaccent` wrapper for the GIN trigram search index
Each ADR: Context → Decision → Consequences (+ alternatives considered). Cite the source spec/plan.

### docs/how-to/ (How-to)
- **add-a-new-crawler-source.md** — implement `SourceAdapter` under `packages/crawler/src/sources/<id>/`, fixture-driven parser tests, register, rate-limit. Source: existing truyenfull adapter.
- **add-a-database-migration.md** — Drizzle workflow + the `.ts` schema-import gotcha + `drizzle.config.ts` explicit array + `immutable_unaccent`; never hand-write SQL. Source: `packages/db`, `CLAUDE.md`.
- **testing-and-ci.md** — vitest layout, `pnpm --filter … test`, the lefthook pre-commit (+ the `$slug` Biome skip caveat), CI → GHCR → Watchtower. Source: `.github/workflows`, lefthook config, `CLAUDE.md`.

## Diagrams (Mermaid)
- C4 L1 Context, L2 Container, L3 Component → `flowchart`/`C4` Mermaid in architecture §03/§05.
- Runtime flows → `sequenceDiagram` in §06.
- Deployment → `flowchart` in §07.
- Domain → `erDiagram` + `stateDiagram-v2` in business-logic/domain-model.md.
All diagrams must render in GitHub-flavored Markdown (verified in the verification pass).

## Verification (no unit tests — it's documentation)
- **Accuracy pass:** each doc's claims (paths, table/column/endpoint/env-var names, flows) are checked against the actual code; fix drift. Cited file paths must exist.
- **Mermaid render check:** every diagram parses/renders (e.g. via a Mermaid validation or visual check).
- **Link check:** internal doc links + the root-README/ONBOARDING links resolve.
- No code is changed except `README.md` (the new Documentation section) and the new docs — so `pnpm typecheck`/tests are unaffected (sanity-run once).

## Notes
- `CLAUDE.md` remains the AI-agent operating context; ADRs/architecture docs absorb and cross-link its rationale rather than duplicate it.
- After ONBOARDING.md is finalized, it can be shared with teammates via the onboarding-guide share tool.
