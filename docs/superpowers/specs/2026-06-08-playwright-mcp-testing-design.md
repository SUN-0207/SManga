# Playwright‑MCP White‑box + Black‑box Test Pass — Design

**Date:** 2026-06-08
**Owner:** son.cu@opswat.com
**Status:** Approved (brainstorming complete) → ready for implementation plan

## Goal

Run a single **live, AI‑driven exploratory test pass** of SManga using the Playwright
MCP browser, combining **black‑box** UI journeys with **white‑box** inspection
(network/console/state + direct API probing + DB cross‑checks). The pass produces a
**findings report**. It does **not** modify application code and does **not** commit any
automated test suite.

## Decisions (locked during brainstorming)

| Question | Decision |
| --- | --- |
| Deliverable | Live exploratory pass → findings report. **No committed test code** (no `@playwright/test` suite). |
| What "white‑box" means here | Grey‑box browser inspection (network/console/`localStorage`) **+** direct API endpoint probing **+** DB cross‑checks. |
| Coverage | All five areas: reader (guest), reader (authenticated), auth flows, admin, direct API. |
| Environment | **Local dev** only — frontend `:3000`, API `:3001`, Postgres/Redis via docker. Not production. |
| Local state | Tester checks current state and **provisions any missing pieces** (db up, migrate, seed, bootstrap admin, crawl one story). |
| Fix scope | **Report‑only.** No app‑code fixes in this pass. |
| Pass structure | **Approach C** — journey‑driven black‑box with inline grey‑box, plus a dedicated white‑box API/DB phase. |

## Non‑goals / out of scope

- Production (`smanga.shop`) testing.
- Authoring or committing an automated Playwright (`@playwright/test`) suite or any test code.
- Fixing application bugs discovered during the pass (a separate follow‑up decides that).
- Load / performance benchmarking, cross‑browser matrix, full automated accessibility audit
  (axe). Light a11y observations only.

## Architecture — four phases

```
Phase 0  Provision & preconditions  ── make local env testable
   │
Phase 1  Black‑box role journeys    ── drive UI; capture grey‑box signals inline
   │
Phase 2  White‑box API + DB phase   ── direct endpoint probing + DB cross‑checks
   │
Phase 3  Synthesis → report         ── classify findings, write dated report
```

Each phase has one clear purpose and a well‑defined output that the next phase consumes:
Phase 0 yields a known‑good seeded environment + credentials; Phase 1 yields journey
findings + evidence; Phase 2 yields API/DB findings + evidence; Phase 3 consumes both
finding sets and emits the report.

## Phase 0 — Provision & preconditions

Establish a known‑good, seeded local environment before any testing.

- Verify/start Postgres + Redis: `pnpm dev:db`.
- Run `pnpm db:migrate` + `pnpm db:seed` (idempotent via drizzle journal).
- Start API (`:3001`, Swagger at `/api/docs`) and frontend (`:3000`).
- **Bootstrap admin** (`admin@test.com`) via `POST /api/v1/auth/register` then SQL
  `UPDATE "user" SET role='admin'`. Email must carry a real TLD (Zod `.email()`).
- **Create a second plain reader user** for authenticated‑reader journeys.
- **Ensure ≥1 story with crawled chapters:** trigger one real crawl of a single
  `truyenfull.today` URL through the admin/job path and wait for completion. This doubles
  as the first white‑box verification of the crawler → Bull/Redis → jobs → persistence
  pipeline.
- Capture baseline: health endpoint, route inventory, Swagger map.

**Preconditions output:** running app at `:3000`/`:3001`, admin + reader credentials, at
least one fully crawled story, baseline API map.

## Phase 1 — Black‑box journeys (grey‑box captured inline)

Three role journeys driven through the Playwright‑MCP browser. Grey‑box signals are
captured **inline** during each journey (one browser pass).

### Journey 1 — Guest reader
Landing (`/`) → discover (`/kham-pha`) → rankings (`/bang-xep-hang`) → search
(`/tim-kiem`: empty / no‑match / match / diacritic‑fold / genre query) → story detail
(`/truyen/[slug]`) → chapter reader (content render, prev/next nav, scroll progress, FAB)
→ reader settings (theme/font/family, persistence across reload via `localStorage`) →
guest gating (bookmark/rating prompt login; `/tu-sach`, `/tai-khoan` redirect).

### Journey 2 — Registered reader
Register (`/dang-ky`, validation) → login (`/dang-nhap`, success + wrong creds + token
storage) → bookmark a story → verify in `/tu-sach` → reading progress + "continue
reading" → submit a rating (sticks + aggregates) → post a comment (render + ordering) →
view‑count engagement increments → account (`/tai-khoan`) → logout (state cleared;
re‑check the known post‑logout `401/403` polling issue).

### Journey 3 — Admin operator
Login as admin → dashboard stats → sources (list / add / edit) → stories (list / detail /
recrawl) → jobs (list, pagination, payload, filter by state) → trigger a crawl and watch
the job lifecycle (queued → active → completed) in the UI → admin guard (guest /
non‑admin blocked from admin routes).

### Inline grey‑box (every journey)
Console errors; 4xx/5xx in the network panel; broken cover images; request‑payload
correctness; `localStorage` state.

## Phase 2 — White‑box API + DB

### Direct API probing matrix
Swagger (`/api/docs`) is the map; hit `:3001` directly. For each module group, probe
**contract / validation / auth‑guard / error‑handling**:

- **Modules:** auth, users, sources, stories, chapters, search, covers, jobs +
  crawler‑jobs, comments, engagement, rankings, recommendations, user‑data, app‑settings,
  seo, health.
- **Contract:** response shape matches the Zod / DTO schema.
- **Validation:** malformed / missing params → `400` with a sensible message.
- **Auth guards:** protected routes reject missing / invalid JWT (`401`); admin‑only
  routes reject a plain reader token (`403`).
- **Errors / limits:** not‑found → `404`, conflicts → `409`, pagination caps
  (e.g. jobs‑list 100 cap).

### DB cross‑checks (`docker exec smanga-postgres psql`)
- Chapter content is gzipped `bytea`; `contentByteSize` stores the **uncompressed** length.
- Vietnamese search uses the `immutable_unaccent` GIN index — verify diacritic‑folded
  queries match the expected rows.
- Ratings / engagement aggregates equal underlying row counts; bookmark / progress rows
  written correctly; job rows mirror the crawl lifecycle.

### Cross‑cutting audits
- Console‑error sweep across all pages.
- Network: 4xx/5xx, slow requests, and cover cache headers (`Cache-Control: immutable` +
  ETag on `/api/v1/cover/:id`).
- SEO: `/sitemap.xml`, `/robots.txt`, JSON‑LD on story/chapter.
- **OWASP‑lite security probes:** IDOR on `user-data` (read another user's
  bookmarks/progress by id), auth bypass, missing authorization, search‑param injection
  (expect Drizzle‑parameterized safety).

## Phase 3 — Findings model & report

- **Severity:** blocker / high / medium / low / nit (matches the existing
  `tests-e2e/REPORT.md`).
- **Category:** bug / ux / a11y / visual / perf / consistency / security / contract.
- **Each finding:** severity, category, surface‑or‑endpoint, detail, **evidence**
  (screenshot path / network trace / SQL output), suggested fix location.
- **Report layout:** two result sections — (1) Black‑box journey findings, (2) White‑box
  API/DB findings — plus a re‑verified known‑issues list, a
  pass / pass‑with‑caveats / fail verdict, and a prioritized fix list.
- **Output location:** new dated report `tests-e2e/REPORT-2026-06-08.md` (preserve the
  existing `REPORT.md`); screenshots → `tests-e2e/screenshots/`, snapshots →
  `tests-e2e/snapshots/`.

## Error handling & safety

- Crawl **one** small story only; respect the 1 rps limit to `truyenfull.today`; never
  trigger "recrawl all" or bulk destructive actions.
- Local data is reseedable, so accidental data changes are recoverable via
  migrate + seed.
- Report‑only: no application code changes; no committed test code.
- Browser instability: if the MCP browser flakes or loses state, re‑establish from the
  Phase 0 preconditions.

## Known issues to re‑verify (carried from previous pass)

- `favicon.ico` 404.
- `/tim-kiem` hint promises genre diacritic‑folding; BE only searches title + author.
- Post‑logout `/api/v1/auth/me` repeated `401` polling.
- Post‑logout on `/admin/jobs`, `/api/v1/jobs/stats` `403` during unmount.
- Jobs list server‑capped at 100 even when the dashboard shows a higher completed total.

## Success criteria

- Local environment provisioned and reproducibly seeded with admin + reader users and at
  least one fully crawled story.
- All three black‑box journeys walked end‑to‑end with inline grey‑box capture.
- API probing matrix exercised across the listed modules with contract / validation /
  auth‑guard / error checks.
- DB cross‑checks and cross‑cutting audits (console, network, SEO, security‑lite)
  completed.
- A dated findings report written with classified, evidence‑backed findings and a
  prioritized fix list — and **no** application or test code committed.
