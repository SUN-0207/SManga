# Onboarding + Architecture Documentation Set — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author a comprehensive, accurate docs-as-code set (English, Markdown + Mermaid) — ONBOARDING + arc42 architecture + business-logic + reference + ADRs + how-to — so a new dev can onboard and understand the system.

**Architecture:** Diátaxis organizes `docs/`; arc42 is the architecture backbone; C4 (Mermaid) for diagrams; MADR ADRs for decisions. Every doc is **derived from the real code** (graphify + reading the cited source) and cites file paths. Tasks are independent authoring units (parallelizable) + a final verification pass.

**Tech Stack documented:** NestJS 11 · Vite/React 19 · Drizzle/Postgres 17 · Bull/Redis 7 · cheerio crawler · Docker Compose + Cloudflare Tunnel.

**Spec:** `docs/superpowers/specs/2026-06-16-onboarding-architecture-docs-design.md`

---

## ⚠️ Authoring & verification model (read first)

This is **documentation, not code** — there are **no unit tests** and no TDD. For a doc task, the "implementation" is: (1) gather facts from the cited sources (`graphify query "<…>"` / `graphify explain "<…>"` + read the listed files), (2) write the file(s) per the outline, (3) **self-check**: every cited path exists, every stated name (table/column/endpoint/env-var/module) matches the code, every Mermaid block is syntactically valid, (4) commit.

**Accuracy is the acceptance bar.** Do NOT invent endpoints, columns, env vars, or flows — if unsure, `graphify query` or read the file. Cross-links use the fixed paths from the file tree below (deterministic), so links resolve without coordination.

**Mermaid:** use fenced ` ```mermaid ` blocks (`flowchart`, `sequenceDiagram`, `erDiagram`, `stateDiagram-v2`). They must parse/render in GitHub-flavored Markdown.

**Commit hygiene (all tasks):** commit ONLY the listed files (explicit `git add <path>`; never `git add -A`). `apps/frontend/vite.config.ts` stays uncommitted (local dev proxy). Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push or amend. (Docs don't touch code, so the lefthook lint/typecheck steps skip — fine.)

## Source map (authoritative inputs — cite these)

- **Domain/schema:** `packages/db/src/schema/{source,story,chapter,auth,user-data,engagement,comment,job-failure,app-setting,enums}.ts` + `index.ts`; migrations under `packages/db/`.
- **API:** `apps/api/src/modules/*` (auth, sources, stories, chapters, covers, jobs, comments, engagement, recommendations, app-settings), `apps/api/src/common/*`, `apps/api/src/config/env.ts`, `apps/api/src/main.ts`.
- **Crawler:** `packages/crawler/src/{engine,fetcher,cover,rate-limit,registry,logger,index}.ts`, `packages/crawler/src/sources/truyenfull/{index,parsers}.ts`.
- **Shared:** `packages/shared/src/*` (Zod schemas, SourceAdapter contract, errors, job payloads).
- **Deploy:** `deploy/home/{docker-compose.prod.yml,Caddyfile,.env.example,init-db.sh}`, `deploy/home/cloudflared/config.yml.example`, `deploy/home/scripts/backup.sh`, `deploy/home/systemd/*`; `.github/workflows/{ci,build-images,crawler-health-probe}.yml`.
- **Existing docs:** `README.md`, `CLAUDE.md`, `docs/operations.md`, `docs/home-runbook.md`, `docs/deploy.md`, `docs/superpowers/specs/*` (esp. `2026-05-28-smanga-design.md`, `2026-06-05-plan-9-laptop-self-host-design.md`, `2026-06-11-performance-remediation-design.md`, `2026-06-12-smart-auto-crawl-design.md`), `graphify-out/GRAPH_REPORT.md`.

## File tree (deliverables)

```
ONBOARDING.md
docs/README.md
docs/architecture/{00-index,01-introduction-and-goals,02-constraints,03-context-and-scope,
                  04-solution-strategy,05-building-blocks,06-runtime-view,07-deployment-view,
                  08-crosscutting-concepts,09-quality-and-risks,10-glossary}.md
docs/business-logic/{domain-model,crawling-and-discovery,reading-and-engagement,admin-and-moderation}.md
docs/reference/{data-model,api,configuration,commands}.md
docs/adr/README.md + docs/adr/0001..0008-*.md
docs/how-to/{add-a-new-crawler-source,add-a-database-migration,testing-and-ci}.md
README.md  (add a "Documentation" section)
```

---

## Task 1: Entry point + docs map + README link

**Files:** Create `ONBOARDING.md`, `docs/README.md`; Modify `README.md`.

- [ ] **Step 1: `ONBOARDING.md`** — Day-1 tutorial. Sections: *What is SManga* (2–3 sentences) → *Prerequisites* (Node 20, pnpm, Docker Desktop; Windows/PowerShell + `PORT=3010` note since OPSWAT holds 3001) → *Get it running* (`pnpm install` → `pnpm dev:db` → set env → `pnpm db:migrate` → `pnpm db:seed` → bootstrap admin via the `CLAUDE.md` curl+psql snippet → `pnpm dev:api` + `pnpm dev:frontend`) → *Smoke test* (open `:3000`, Swagger `:3001/api/docs`) → *Your first change* (a tiny FE tweak + how it hot-reloads) → *Monorepo tour* (1 line per `packages/*` + `apps/*`) → *Where to go next* (links into `docs/`). Sources: `README.md`, `docs/operations.md`, `CLAUDE.md`, root `package.json`.
- [ ] **Step 2: `docs/README.md`** — Diátaxis landing: a short intro + 4 sections (Tutorial → ONBOARDING; How-to → `docs/how-to/*` + ops/deploy runbooks; Reference → `docs/reference/*`; Explanation → `docs/architecture/*` + `docs/business-logic/*` + `docs/adr/*`), each a bullet list of links with one-line descriptions.
- [ ] **Step 3: `README.md`** — add a `## Documentation` section after "Quick start" linking `ONBOARDING.md` and `docs/README.md` (1 line each). Leave the rest of the README intact.
- [ ] **Step 4: Self-check** — all links resolve to files this plan creates; run `npx --yes markdown-link-check ONBOARDING.md` is optional, else manual.
- [ ] **Step 5: Commit** — `git add ONBOARDING.md docs/README.md README.md` → `docs: onboarding guide + docs map + README link`.

---

## Task 2: arc42 — narrative sections (00, 01, 02, 04)

**Files:** Create `docs/architecture/{00-index,01-introduction-and-goals,02-constraints,04-solution-strategy}.md`.

- [ ] **Step 1: `00-index.md`** — how to read arc42, the C4 legend (Context/Container/Component), a table linking §01–§10.
- [ ] **Step 2: `01-introduction-and-goals.md`** — product purpose (Vietnamese novel reader, readers + admin operator), the top 3–5 quality goals (read performance, SEO, low cost, simplicity), stakeholders (owner/operator, readers). Source: spec `2026-05-28-smanga-design.md`, `CLAUDE.md`.
- [ ] **Step 3: `02-constraints.md`** — constraints: single-author hobby; laptop self-host on residential ISP; Windows dev (PowerShell, `$slug` Biome skip, `PORT=3010`); ~$3/mo cost target; single environment (no staging). Source: `CLAUDE.md`.
- [ ] **Step 4: `04-solution-strategy.md`** — table of the key tech choices (NestJS+Vite split, Postgres/Drizzle, Bull/Redis, cheerio-first crawler, cover-as-bytea, laptop self-host) each with a one-line rationale and a link to its ADR in `docs/adr/`.
- [ ] **Step 5: Self-check + Commit** — `git add docs/architecture/00-index.md docs/architecture/01-introduction-and-goals.md docs/architecture/02-constraints.md docs/architecture/04-solution-strategy.md` → `docs(arch): arc42 intro, constraints, solution strategy`.

---

## Task 3: arc42 — C4 context + building blocks (03, 05)

**Files:** Create `docs/architecture/{03-context-and-scope,05-building-blocks}.md`.

- [ ] **Step 1: `03-context-and-scope.md`** — **C4 L1 System Context** as a Mermaid `flowchart`: SManga system in the middle; external actors/systems = Reader (browser), Admin operator, `truyenfull.today` (crawl source), Cloudflare (tunnel/CDN), Google OAuth, Google Drive (backup). Note each external interface (what flows). Source: `apps/api` controllers, `packages/crawler`, `CLAUDE.md`.
- [ ] **Step 2: `05-building-blocks.md`** — **C4 L2 Container** Mermaid `flowchart` (frontend SPA, api, postgres, redis; cli + crawler as a library used by api/cli) with protocols. Then **C4 L3 Component** for the API: a `flowchart` of the modules (auth, sources, stories, chapters, covers, jobs/queue+processors, comments, engagement, recommendations, app-settings) and a short table (module → responsibility → key files). Plus a component view of the crawler engine (fetcher → rate-limit → adapter parse → cover → persist). Source: enumerate `apps/api/src/modules/*` (via `graphify query "api modules"` or glob), `packages/crawler/src/*`.
- [ ] **Step 3: Self-check (Mermaid parses; module list matches the codebase) + Commit** — `git add docs/architecture/03-context-and-scope.md docs/architecture/05-building-blocks.md` → `docs(arch): C4 context + building-block views`.

---

## Task 4: arc42 — runtime view (06)

**Files:** Create `docs/architecture/06-runtime-view.md`.

- [ ] **Step 1:** Mermaid `sequenceDiagram`s + prose for the key flows:
  1. **Crawl a chapter**: engine → fetcher (rate-limited) → adapter.parseChapter → gzip → persist (`chapter.contentText` bytea, `contentByteSize`) → cover download. Source: `packages/crawler/src/{engine,fetcher,rate-limit,cover}.ts`, `sources/truyenfull/parsers.ts`.
  2. **2-step discovery**: browse → metadata stub → chapter discover → enqueue crawl. Source: spec `2026-05-30-smanga-catalog-discovery.md`, jobs module.
  3. **Reader read path**: `/truyen/$slug` → `getStoryBySlug` + `chapters/all` → chapter reader → `GET /chapter` gunzip server-side. Source: `apps/api/src/modules/{stories,chapters}`, frontend routes.
  4. **Auth**: login → passport-jwt cookie → `/auth/me`. Source: `apps/api/src/modules/auth`, `common/guards`.
  5. **Smart auto-crawl drainer**: Bull repeatable feeder (cron */1) → watermark check → two-step frontier picker → enqueue lowest-priority. Source: spec `2026-06-12-smart-auto-crawl-design.md`, `apps/api/src/modules/app-settings/*`.
- [ ] **Step 2: Self-check + Commit** — `git add docs/architecture/06-runtime-view.md` → `docs(arch): runtime view (sequence diagrams)`.

---

## Task 5: arc42 — deployment view (07)

**Files:** Create `docs/architecture/07-deployment-view.md`.

- [ ] **Step 1:** Mermaid `flowchart` deployment diagram: internet → Cloudflare (tunnel + edge cache) → `cloudflared` on the laptop → Caddy → 5-container compose (`postgres17`, `redis7`, `api`, `frontend`, `watchtower`); nightly `pg_dump` → HDD + Google Drive (`gdrive:smanga-backups`); CI → GHCR images → Watchtower pull. Prose: hostnames/ports, migration-on-boot, backup retention. Source: `deploy/home/{docker-compose.prod.yml,Caddyfile}`, `deploy/home/cloudflared/config.yml.example`, `deploy/home/scripts/backup.sh`, `deploy/home/systemd/*`, `.github/workflows/{ci,build-images}.yml`, `docs/home-runbook.md`.
- [ ] **Step 2: Self-check + Commit** — `git add docs/architecture/07-deployment-view.md` → `docs(arch): deployment view`.

---

## Task 6: arc42 — crosscutting, quality/risks, glossary (08, 09, 10)

**Files:** Create `docs/architecture/{08-crosscutting-concepts,09-quality-and-risks,10-glossary}.md`.

- [ ] **Step 1: `08-crosscutting-concepts.md`** — one subsection each: auth (JWT cookie), queue (Bull jobs + processors + priorities + dead-letter/retry), caching (Cloudflare edge + `Cache-Control`/`s-maxage`/ETag, cover immutability), chapter content (gzip bytea, gunzip on read), Vietnamese search (`pg_trgm` + `immutable_unaccent` wrapper), config/env loading (`apps/api/src/config/env.ts` + `main.ts` dotenv preload), theming/design tokens, error model (`@smanga/shared` error classes), logging (pino). Source: cited code + `CLAUDE.md` "Hard-won workarounds".
- [ ] **Step 2: `09-quality-and-risks.md`** — quality goals + how met (perf budget from `2026-06-11-performance-remediation-design.md`, edge cache HIT, code-split; SEO; a11y) + risks/tech-debt (residential ISP SPOF, single env/no staging, parked loose ends from the handoff). Source: perf spec, `CLAUDE.md`.
- [ ] **Step 3: `10-glossary.md`** — alphabetized terms: domain (truyện, chương, thể loại, tác giả, stub, discovery, dead-letter, watermark, frontier) + technical (adapter, token bucket, repeatable job, edge cache).
- [ ] **Step 4: Self-check + Commit** — `git add docs/architecture/08-crosscutting-concepts.md docs/architecture/09-quality-and-risks.md docs/architecture/10-glossary.md` → `docs(arch): crosscutting, quality/risks, glossary`.

---

## Task 7: Business logic (4 files)

**Files:** Create `docs/business-logic/{domain-model,crawling-and-discovery,reading-and-engagement,admin-and-moderation}.md`.

- [ ] **Step 1: `domain-model.md`** — Mermaid `erDiagram` of entities + relationships (Story, Chapter, Source, StorySource, Genre/StoryGenre, User/Session/Account, Comment, Rating, View, Bookmark, ReadingProgress, JobFailure, AppSetting) derived from `packages/db/src/schema/*.ts`; per-entity field summary; `stateDiagram-v2` for chapter status (pending → crawled/failed) and story discoveryStatus (pending/stub → running → complete/failed). Cite exact schema files/columns.
- [ ] **Step 2: `crawling-and-discovery.md`** — business rules: SourceAdapter contract (HTML-in, not URLs), 1 rps token bucket per source, dedup, gzip + uncompressed `contentByteSize`, truyenfull selector quirks, 2-step discovery, smart auto-crawl (watermark/newest-first/priority/`app_setting` toggle), dead-letter + retry, ParserError taxonomy (network vs content-empty/VIP). Source: `packages/crawler`, jobs + app-settings modules, specs.
- [ ] **Step 3: `reading-and-engagement.md`** — reading progress (one furthest-read row/story), bookmarks, ratings (avg/count, optimistic, one-per-user), view counting (per calendar day), recommendations (forYou/similar), rankings (hot/…), comments (tree, pagination, @mentions, moderation). Source: `apps/api/src/modules/{engagement,recommendations,comments}`, `user-data` schema, frontend.
- [ ] **Step 4: `admin-and-moderation.md`** — operator flows: sources + discover, crawl-state filters (needs-crawl vs has-errors), featured curation, bulk actions (incl. failed-only), dead-letter panel, comment moderation, app settings (auto-crawl). Source: admin api modules + `apps/frontend/src/routes/admin/*`.
- [ ] **Step 5: Self-check (entity/column names match schema) + Commit** — `git add docs/business-logic/` → `docs(domain): business-logic explanations`.

---

## Task 8: Reference (4 files)

**Files:** Create `docs/reference/{data-model,api,configuration,commands}.md`.

- [ ] **Step 1: `data-model.md`** — table-by-table reference (columns, types, nullability, indexes incl. GIN trigram + composite uniques, enums) for every schema file; document the `.ts`-import convention + `drizzle.config.ts` explicit array. Source: `packages/db/src/schema/*.ts` + migrations.
- [ ] **Step 2: `api.md`** — REST surface grouped by module (method + path + auth + one-line purpose), the non-`/api/v1` SEO routes (`/sitemap*.xml`, `/robots.txt`), and a pointer to live Swagger `/api/docs`. Source: `apps/api/src/modules/*/*.controller.ts`.
- [ ] **Step 3: `configuration.md`** — every env var (DATABASE_URL, REDIS_URL, JWT_SECRET, PORT, DB_POOL_MAX, Google OAuth, AUTOCRAWL_*, NODE_OPTIONS, etc.) with purpose + default + where read; plus `app_setting` runtime flags (autoCrawlEnabled, autoCrawlWatermark, …). Source: `apps/api/src/config/env.ts`, `deploy/home/.env.example`, `docker-compose.prod.yml`, `app-setting` schema.
- [ ] **Step 4: `commands.md`** — pnpm scripts (dev/build/test/typecheck/db:migrate/db:seed), CLI (`pnpm crawl <url>`, health-probe), common psql/ops queries (from `reference_smanga_prod_ops`/`docs/operations.md`). Source: root + per-package `package.json`, `docs/operations.md`.
- [ ] **Step 5: Self-check (every env var/endpoint/column verified against code) + Commit** — `git add docs/reference/` → `docs(reference): data model, API, config, commands`.

---

## Task 9: ADRs (index + 8 records)

**Files:** Create `docs/adr/README.md` + `docs/adr/0001-…` through `0008-…md`.

- [ ] **Step 1: `README.md`** — ADR purpose, the MADR template (Context / Decision / Status / Consequences / Alternatives), and an index table.
- [ ] **Step 2: Author 8 ADRs** (MADR format, Status Accepted unless noted), each citing the source spec/`CLAUDE.md` section:
  - `0001-postgres-drizzle.md`, `0002-nestjs-vite-split.md` (supersedes Plans 1–3), `0003-bull-redis-over-pgboss.md`, `0004-cheerio-first-crawler.md`, `0005-cover-bytea-in-postgres.md`, `0006-laptop-self-host-cloudflare-tunnel.md` (supersedes Plan 6 Vercel/Railway + Plan 8 VPS), `0007-webpack-ts-workspace-bundling.md`, `0008-immutable-unaccent-search-index.md`.
- [ ] **Step 3: Self-check + Commit** — `git add docs/adr/` → `docs(adr): back-fill architecture decision records`.

---

## Task 10: How-to guides (3 files)

**Files:** Create `docs/how-to/{add-a-new-crawler-source,add-a-database-migration,testing-and-ci}.md`.

- [ ] **Step 1: `add-a-new-crawler-source.md`** — steps to implement `SourceAdapter` under `packages/crawler/src/sources/<id>/`, fixture-driven parser tests (`__fixtures__/`), register in the registry, rate-limit default, `requiresJs` flag. Source: `packages/crawler/src/sources/truyenfull/*`, `registry.ts`, `@smanga/shared` SourceAdapter.
- [ ] **Step 2: `add-a-database-migration.md`** — Drizzle workflow (`pnpm db:generate`/`db:migrate`), the `.ts` schema-import rule, `drizzle.config.ts` explicit array, `immutable_unaccent`, never hand-write SQL, the drift caution. Source: `packages/db/*`, `CLAUDE.md`.
- [ ] **Step 3: `testing-and-ci.md`** — vitest layout + `pnpm --filter … test`, typecheck, the lefthook pre-commit (incl. the `$slug` Biome-skip caveat → run `pnpm exec biome check --write '<$slug path>'` manually), CI → GHCR → Watchtower deploy. Source: `.github/workflows/{ci,build-images}.yml`, lefthook config, `CLAUDE.md`.
- [ ] **Step 4: Cross-link** local-dev → `docs/operations.md` and deploy/rollback → `docs/home-runbook.md`/`docs/deploy.md` (no duplication).
- [ ] **Step 5: Self-check + Commit** — `git add docs/how-to/` → `docs(how-to): add-source, migration, testing/CI guides`.

---

## Task 11: Verification pass (controller)

**Context:** Run after all docs exist. Controller-run (uses graphify + code reads + optional tooling).

- [ ] **Step 1: Accuracy audit** — for each doc, spot-check the stated facts (table/column names, endpoints, env vars, file paths, flows) against the code (`graphify query`/read). Fix any drift in place.
- [ ] **Step 2: Mermaid render check** — verify every ` ```mermaid ` block parses (e.g. `npx --yes @mermaid-js/mermaid-cli` on extracted blocks, or visual check). Fix syntax.
- [ ] **Step 3: Link check** — every internal doc link + the `README.md`/`ONBOARDING.md` links resolve to real files.
- [ ] **Step 4: Sanity** — `pnpm --filter @smanga/frontend typecheck` still clean (no code changed beyond README text). `git status` shows only docs + README (+ the untracked local `vite.config.ts`).
- [ ] **Step 5: Refresh the graph** — `graphify update .`; commit any fixes from Steps 1–3 → `docs: accuracy + mermaid + link fixes`.
- [ ] **Step 6: Report** — summarize the doc set; offer to share `ONBOARDING.md` via the onboarding-guide tool. Do NOT push without explicit user instruction.

---

## Self-Review

**Spec coverage:** ONBOARDING (T1) ✓; docs/README map (T1) ✓; arc42 §01–§10 (T2–T6) ✓; C4 L1/L2/L3 (T3) ✓; runtime/deployment diagrams (T4/T5) ✓; business-logic ×4 (T7) ✓; reference ×4 (T8) ✓; ADRs index+8 (T9) ✓; how-to ×3 + cross-links (T10) ✓; root README link (T1) ✓; accuracy + Mermaid + link verification (T11) ✓; leverage graphify (authoring/verification model) ✓; keep+cross-link existing runbooks (T1/T10) ✓.

**Placeholder scan:** No TBD/TODO. Each task lists exact files, exact source paths, and a concrete per-file outline (the correct granularity for documentation — the author produces prose grounded in the cited sources; acceptance = accuracy). Diagram types are specified per file.

**Consistency:** File paths are identical across the tree, the per-task Files lists, and cross-links. ADR filenames match the solution-strategy links (T2 §04 → `docs/adr/000X-*.md`). Entity/module lists reference the source globs gathered for this plan.
