# Playwright‑MCP White‑box + Black‑box Test Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB‑SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a single live exploratory test pass of SManga on local dev via the Playwright MCP browser — black‑box role journeys plus white‑box API/DB inspection — and produce one dated findings report. No application code changes; no committed automated test suite.

**Architecture:** Four phases. Phase 0 provisions a known‑good seeded local environment (infra, users, one crawled story, baseline API map). Phase 1 drives three role journeys through the MCP browser, capturing grey‑box signals (console/network/`localStorage`) inline. Phase 2 probes the API directly (contract/validation/auth‑guard/error) and cross‑checks Postgres. Phase 3 synthesizes findings into a report and commits it with its evidence.

**Tech Stack:** Playwright MCP browser tools; NestJS 11 API (`:3001`, Swagger `/api/docs`); Vite + React 19 frontend (`:3000`); Postgres 17 + Redis 7 via docker compose; Bull queue; `curl.exe` + `docker exec … psql` for white‑box probes; pnpm workspace scripts.

**Reference spec:** `docs/superpowers/specs/2026-06-08-playwright-mcp-testing-design.md`

---

## Conventions used by every task

- **Report file:** `tests-e2e/REPORT-2026-06-08.md` (do NOT overwrite the existing `tests-e2e/REPORT.md`).
- **Evidence dirs:** screenshots → `tests-e2e/screenshots/`, accessibility snapshots → `tests-e2e/snapshots/`. Screenshot filenames follow the existing `NN-name-desktop.png` convention.
- **Finding record format** (used when logging anything into the report's scratch list):
  `severity | category | surface-or-endpoint | detail | evidence(path/trace/sql) | suggested-fix-location`
  - severity ∈ blocker / high / medium / low / nit
  - category ∈ bug / ux / a11y / visual / perf / consistency / security / contract
- **MCP browser tools** are deferred. Before the first browser step, load them with `tool_search` (query e.g. "playwright browser navigate snapshot screenshot console network"). The tools needed: navigate, snapshot, take_screenshot, console_messages, network_requests, evaluate, click, type, fill_form, press_key, wait_for.
- **Two terminals:** keep API (`pnpm dev:api`) and frontend (`pnpm dev:frontend`) running in their own async terminals; run `curl.exe`/`psql` probes in a third sync terminal.
- **Env var for DB‑touching pnpm scripts:** `$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"`.

---

## Phase 0 — Provision & preconditions

### Task 1: Bring up infrastructure and verify health

**Files:**
- None created. Working terminals only.

- [ ] **Step 1: Start Postgres + Redis**

Run:
```powershell
pnpm dev:db
```
Expected: `docker compose` reports `smanga-postgres` and `smanga-redis` (or the compose project's container names) running. Confirm with:
```powershell
docker ps --format "{{.Names}}: {{.Status}}"
```
Expected: a postgres container and a redis container both `Up`.

- [ ] **Step 2: Run migrations + seed**

Run:
```powershell
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm db:migrate
pnpm db:seed
```
Expected: migrate prints applied migrations (or "No migrations to apply"); seed prints `seed complete`. (Seed only inserts the `truyenfull` source — no stories yet.)

- [ ] **Step 3: Start the API (async terminal)**

Run in an async terminal:
```powershell
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"; $env:REDIS_URL = "redis://localhost:6379"; $env:JWT_SECRET = "dev-secret-for-testing-only-change-me"; pnpm dev:api
```
Expected: Nest boots; log shows routes mapped and `Nest application successfully started`. (If `.env` already defines `JWT_SECRET`, prefer that value.)

- [ ] **Step 4: Start the frontend (async terminal)**

Run in a second async terminal:
```powershell
pnpm dev:frontend
```
Expected: Vite serves on `http://localhost:3000`.

- [ ] **Step 5: Verify health**

Run:
```powershell
curl.exe -s http://localhost:3001/api/v1/health
```
Expected: HTTP 200 JSON with a status flag and a `db` boolean = true. Record the raw body for the report's environment section.

### Task 2: Bootstrap admin + plain reader users, capture tokens

**Files:**
- None created. Capture credentials/tokens in the scratch notes you keep for the report.

- [ ] **Step 1: Register the admin user**

Run:
```powershell
curl.exe -s -X POST http://localhost:3001/api/v1/auth/register -H "Content-Type: application/json" -d '{\"email\":\"admin@test.com\",\"password\":\"adminpassword\",\"name\":\"Admin\"}'
```
Expected: 201/200 with a user object + token. (Email must have a real TLD — Zod `.email()` rejects bare `admin@test`.)

- [ ] **Step 2: Promote the admin user**

Run:
```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "UPDATE \"user\" SET role='admin' WHERE email='admin@test.com';"
```
Expected: `UPDATE 1`.

- [ ] **Step 3: Register a plain reader user**

Run:
```powershell
curl.exe -s -X POST http://localhost:3001/api/v1/auth/register -H "Content-Type: application/json" -d '{\"email\":\"reader@test.com\",\"password\":\"readerpassword\",\"name\":\"Reader\"}'
```
Expected: 201/200 with a user object + token. This account stays role=`user`.

- [ ] **Step 4: Capture fresh tokens via login**

Run:
```powershell
curl.exe -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{\"email\":\"admin@test.com\",\"password\":\"adminpassword\"}'
curl.exe -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{\"email\":\"reader@test.com\",\"password\":\"readerpassword\"}'
```
Expected: both return a JWT access token. Save them as `$ADMIN_TOKEN` and `$READER_TOKEN` in the probe terminal:
```powershell
$ADMIN_TOKEN = "<paste admin token>"
$READER_TOKEN = "<paste reader token>"
```

### Task 3: Provision at least one fully crawled story (exercises the queue — first white‑box check)

**Files:**
- None created. Record the resulting `storyId` + slug for later tasks.

- [ ] **Step 1: Get a real story URL from the source (no hardcoded slug)**

Run:
```powershell
curl.exe -s "http://localhost:3001/api/v1/sources/truyenfull/discover" -H "Authorization: Bearer $ADMIN_TOKEN"
```
Expected: a list of discovered story URLs from `truyenfull.today`. Pick the first URL → call it `$STORY_URL`. If this endpoint shape differs, fall back to `GET /api/v1/sources/truyenfull/feeds`.

- [ ] **Step 2: Enqueue an import (admin/job path → Bull/Redis)**

Run:
```powershell
curl.exe -s -X POST http://localhost:3001/api/v1/stories/import -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d "{\`"url\`":\`"$STORY_URL\`"}"
```
Expected: a job/enqueue acknowledgement. Note any returned job id or story id.

- [ ] **Step 3: Wait for the import, then discover + crawl chapters**

Poll jobs until the import completes:
```powershell
curl.exe -s "http://localhost:3001/api/v1/jobs?limit=20" -H "Authorization: Bearer $ADMIN_TOKEN"
```
Find the new story id:
```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT id, slug, title, status FROM story ORDER BY created_at DESC LIMIT 3;"
```
Save it as `$STORY_ID` + `$STORY_SLUG`. Trigger chapter discovery and a content crawl:
```powershell
curl.exe -s -X POST "http://localhost:3001/api/v1/stories/$STORY_ID/discover" -H "Authorization: Bearer $ADMIN_TOKEN"
curl.exe -s -X POST "http://localhost:3001/api/v1/chapters/crawl/$STORY_ID" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{\"limit\":3}'
```
Expected: discovery enqueues a chapter list; crawl enqueues content fetch for up to 3 chapters (keeps the run small + respects 1 rps). If the queue path stalls for more than a couple minutes, use the standalone CLI fallback: `pnpm crawl $STORY_URL` (note in the report that the queue path was bypassed).

- [ ] **Step 4: Verify chapters landed with content**

Run:
```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT s.slug, count(c.*) AS chapters, count(c.content_text) AS with_content FROM story s LEFT JOIN chapter c ON c.story_id = s.id WHERE s.id = '$STORY_ID' GROUP BY s.slug;"
```
Expected: `chapters` ≥ 1 and `with_content` ≥ 1. This is the precondition for reader + engagement journeys.

### Task 4: Capture baseline API map and create the report skeleton

**Files:**
- Create: `tests-e2e/REPORT-2026-06-08.md`

- [ ] **Step 1: Snapshot the route inventory**

The route inventory is already enumerated in the spec's Phase 2 module list. Confirm Swagger is reachable for the report:
```powershell
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3001/api/docs
```
Expected: `200`.

- [ ] **Step 2: Write the report skeleton**

Create `tests-e2e/REPORT-2026-06-08.md` with this exact scaffold (findings get filled in during later tasks):
```markdown
# SManga White‑box + Black‑box Test Report

**Generated:** 2026-06-08
**Method:** Playwright‑MCP live pass on local dev (`:3000`/`:3001`) — 3 black‑box role journeys with inline grey‑box capture + direct API/DB white‑box phase.
**Spec:** docs/superpowers/specs/2026-06-08-playwright-mcp-testing-design.md

## Environment
- API health: <paste body from Task 1 Step 5>
- Seeded story: <slug> (<n> chapters, <m> with content)
- Users: admin@test.com (admin), reader@test.com (user)

## Overall verdict
<filled in Task 13>

## Section A — Black‑box journey findings
### Journey 1 — Guest reader
### Journey 2 — Registered reader
### Journey 3 — Admin operator

## Section B — White‑box API + DB findings
### API contract / validation / auth‑guard / errors
### DB cross‑checks
### Cross‑cutting (console / network / SEO / security‑lite)

## Known issues — re‑verified
- favicon.ico 404
- /tim-kiem genre diacritic‑fold hint vs title+author‑only search
- post‑logout /api/v1/auth/me 401 polling
- post‑logout /admin/jobs /api/v1/jobs/stats 403 on unmount
- jobs list server‑capped at 100

## Prioritized fix list
<filled in Task 13>
```

- [ ] **Step 3: Commit the skeleton**

Run:
```powershell
git add tests-e2e/REPORT-2026-06-08.md
git commit -m "test(e2e): scaffold 2026-06-08 white/black-box report"
```
Expected: one commit; lefthook skips typecheck/lint (no staged code).

---

## Phase 1 — Black‑box role journeys (grey‑box captured inline)

> Load the Playwright MCP browser tools (`tool_search`) before Task 5 Step 1. For EVERY page in this phase: after interacting, capture (a) an accessibility snapshot, (b) a screenshot, (c) the console messages, (d) the network requests. Log any console error, any 4xx/5xx, any broken cover image, any wrong payload, or any UX/visual/a11y issue as a finding into Section A of the report.

### Task 5: Journey 1 — Guest reader

**Files:**
- Modify: `tests-e2e/REPORT-2026-06-08.md` (append Journey 1 findings)
- Evidence: `tests-e2e/screenshots/j1-*.png`, `tests-e2e/snapshots/j1-*.yml`

- [ ] **Step 1: Landing**

Navigate to `http://localhost:3000/`. Snapshot → `tests-e2e/snapshots/j1-01-landing.yml`; screenshot → `tests-e2e/screenshots/j1-01-landing-desktop.png`. Verify: hero, featured slot, library grid, header. Check the known `#thu-vien` anchor + hero‑stats‑order issues. Read console + network. Log findings.

- [ ] **Step 2: Discover + rankings**

Navigate to `/kham-pha`, then `/bang-xep-hang`. Screenshot each (`j1-02-kham-pha-desktop.png`, `j1-03-rankings-desktop.png`). Verify the four rankings tabs (hot/views/rating/completed) load data via `GET /api/v1/rankings/*`. Log findings.

- [ ] **Step 3: Search — four states**

Navigate to `/tim-kiem`. Exercise: (a) empty submit, (b) no‑match query `zzzznomatch`, (c) a matching substring of the seeded title, (d) a diacritic‑folded query (type the seeded title without diacritics). Screenshot each (`j1-04a..d-*.png`). Confirm `GET /api/v1/search` payloads. Re‑verify the genre‑hint known issue. Log findings (incl. the search‑specific zero‑state vs library‑empty copy).

- [ ] **Step 4: Story detail**

Navigate to `/truyen/$STORY_SLUG`. Snapshot → `j1-05-story-detail.yml`; screenshot. Verify synopsis renders with spacing (re‑check the fused‑words known bug), genre chips, chapter list, cover image loads (no broken `GET /api/v1/cover/:id`). Log findings.

- [ ] **Step 5: Chapter reader**

Open chapter 1 from the list. Screenshot top (`j1-06a-chapter-top-desktop.png`). Scroll mid‑way; confirm the scroll‑progress bar advances and the FAB appears; screenshot (`j1-06b-chapter-mid.png`). Use prev/next nav. Verify content via `GET /api/v1/chapters/by-slug/:slug/:index`. Log findings.

- [ ] **Step 6: Reader settings persistence**

Open the settings panel; change theme + font size + family. Reload the page. Confirm settings persist by reading `localStorage` key `smanga:reader` (browser evaluate). Screenshot before/after (`j1-07a-settings.png`, `j1-07b-after-reload.png`). Log findings.

- [ ] **Step 7: Guest gating**

While logged out: attempt to bookmark and to rate (expect a login prompt/redirect). Navigate directly to `/tu-sach` and `/tai-khoan` (expect redirect/guard). Screenshot (`j1-08-guest-gating.png`). Log findings.

- [ ] **Step 8: Append Journey 1 findings + commit**

Write all Journey 1 findings under Section A → Journey 1 in the report. Run:
```powershell
git add tests-e2e/REPORT-2026-06-08.md tests-e2e/screenshots/j1-*.png tests-e2e/snapshots/j1-*.yml
git commit -m "test(e2e): journey 1 (guest reader) findings + evidence"
```

### Task 6: Journey 2 — Registered reader

**Files:**
- Modify: `tests-e2e/REPORT-2026-06-08.md` (append Journey 2 findings)
- Evidence: `tests-e2e/screenshots/j2-*.png`, `tests-e2e/snapshots/j2-*.yml`

- [ ] **Step 1: Register — validation**

Navigate to `/dang-ky`. Submit invalid input (bad email, short password) and confirm inline validation; screenshot (`j2-01-register-validation.png`). Then register a throwaway UI account OR proceed to login with the existing `reader@test.com`. Log findings.

- [ ] **Step 2: Login — success + failure**

Navigate to `/dang-nhap`. First submit wrong credentials (expect error, screenshot `j2-02a-login-fail.png`). Then log in as `reader@test.com`. Confirm the token is stored (browser evaluate on `localStorage`/cookie) and `GET /api/v1/auth/me` returns the user. Screenshot logged‑in header (`j2-02b-logged-in.png`). Log findings.

- [ ] **Step 2.5: Submit a view, then bookmark**

On `/truyen/$STORY_SLUG`, confirm a view is registered (`POST /api/v1/views/story/:storyId`) in the network panel. Click bookmark; confirm `POST /api/v1/me/bookmarks`. Log findings.

- [ ] **Step 3: Verify bookmark in library**

Navigate to `/tu-sach`. Confirm the bookmarked story appears (`GET /api/v1/me/bookmarks`). Screenshot (`j2-03-tu-sach.png`). Note the known "same story duplicated across Đang đọc + Bookmark" issue if present. Log findings.

- [ ] **Step 4: Reading progress + continue‑reading**

Open a chapter, scroll, navigate to the next chapter (drives `PUT /api/v1/me/reading-progress` and/or `POST /api/v1/me/reading-progress/session`). Return to `/tu-sach` or home; confirm "continue reading" reflects progress (`GET /api/v1/me/reading-progress/continue-reading`). Screenshot (`j2-04-continue-reading.png`). Log findings.

- [ ] **Step 5: Rating**

On the story detail page, submit a rating (`PUT /api/v1/ratings/story/:storyId`). Reload; confirm it sticks and the aggregate (`GET /api/v1/ratings/story/:storyId`) updates. Screenshot (`j2-05-rating.png`). Log findings.

- [ ] **Step 6: Comment**

Post a comment (`POST /api/v1/comments`); confirm it renders and ordering is correct (`GET /api/v1/comments`). Optionally react (`POST /api/v1/comments/:id/react`). Screenshot (`j2-06-comment.png`). Log findings.

- [ ] **Step 7: Account + logout**

Navigate to `/tai-khoan`; screenshot (`j2-07-account.png`). Log out. Confirm auth state clears, and **re‑check the known post‑logout `401` polling** on `/api/v1/auth/me` in the network panel. Log findings.

- [ ] **Step 8: Append Journey 2 findings + commit**

Run:
```powershell
git add tests-e2e/REPORT-2026-06-08.md tests-e2e/screenshots/j2-*.png tests-e2e/snapshots/j2-*.yml
git commit -m "test(e2e): journey 2 (registered reader) findings + evidence"
```

### Task 7: Journey 3 — Admin operator

**Files:**
- Modify: `tests-e2e/REPORT-2026-06-08.md` (append Journey 3 findings)
- Evidence: `tests-e2e/screenshots/j3-*.png`, `tests-e2e/snapshots/j3-*.yml`

- [ ] **Step 1: Admin login + dashboard**

Log in as `admin@test.com`; navigate to `/admin`. Snapshot → `j3-01-admin-dashboard.yml`; screenshot. Verify stat cards (re‑check the dark‑shell‑vs‑design‑system and stat‑card‑affordance known issues). Log findings.

- [ ] **Step 2: Sources**

Navigate to `/admin/sources`. List loads (`GET /api/v1/sources`). Add a source then edit it (`POST`/`PATCH /api/v1/sources`). Screenshot (`j3-02-admin-sources.png`). Log findings.

- [ ] **Step 3: Stories list + detail**

Navigate to `/admin/stories`, then the seeded story's detail. Screenshot both (`j3-03-admin-stories.png`, `j3-04-admin-story-detail.png`). Verify chapter index rendering + the recrawl affordance (do NOT click "recrawl all"). Log findings.

- [ ] **Step 4: Jobs + lifecycle**

Navigate to `/admin/jobs`. Confirm the list paginates (`GET /api/v1/jobs`) and `GET /api/v1/jobs/stats`. Trigger a small crawl from the admin UI (single story, ≤3 chapters) and watch a job move queued → active → completed. Screenshot page 1 + a job mid‑lifecycle (`j3-05-admin-jobs.png`, `j3-06-job-lifecycle.png`). Re‑check the 100‑cap + indistinguishable‑rows known issues. Log findings.

- [ ] **Step 5: Admin guard**

In a fresh context (logged out, then as `reader@test.com`), navigate to `/admin`. Confirm the guard blocks/redirects non‑admins. Screenshot (`j3-07-admin-guard.png`). Log findings.

- [ ] **Step 6: Append Journey 3 findings + commit**

Run:
```powershell
git add tests-e2e/REPORT-2026-06-08.md tests-e2e/screenshots/j3-*.png tests-e2e/snapshots/j3-*.yml
git commit -m "test(e2e): journey 3 (admin operator) findings + evidence"
```

---

## Phase 2 — White‑box API + DB

> Use the `$ADMIN_TOKEN` / `$READER_TOKEN` from Task 2. Probe `:3001` directly with `curl.exe`. For each probe, record the actual status + a note when it diverges from the expected status into Section B of the report.

### Task 8: API probing — public/reader contract, validation & errors

**Files:**
- Modify: `tests-e2e/REPORT-2026-06-08.md` (Section B → API)

- [ ] **Step 1: Contract — happy paths**

Run and confirm each returns 200 with a shape matching its schema:
```powershell
curl.exe -s -o NUL -w "stories %{http_code}\n" "http://localhost:3001/api/v1/stories?limit=5"
curl.exe -s -o NUL -w "story-by-slug %{http_code}\n" "http://localhost:3001/api/v1/stories/by-slug/$STORY_SLUG"
curl.exe -s -o NUL -w "chapters %{http_code}\n" "http://localhost:3001/api/v1/stories/by-slug/$STORY_SLUG/chapters"
curl.exe -s -o NUL -w "search %{http_code}\n" "http://localhost:3001/api/v1/search?q=$STORY_SLUG"
curl.exe -s -o NUL -w "genres %{http_code}\n" "http://localhost:3001/api/v1/genres"
curl.exe -s -o NUL -w "rankings %{http_code}\n" "http://localhost:3001/api/v1/rankings/hot"
curl.exe -s -o NUL -w "recommend %{http_code}\n" "http://localhost:3001/api/v1/recommendations/similar?storyId=$STORY_ID"
curl.exe -s -o NUL -w "ratings %{http_code}\n" "http://localhost:3001/api/v1/ratings/story/$STORY_ID"
curl.exe -s -o NUL -w "comments %{http_code}\n" "http://localhost:3001/api/v1/comments?storyId=$STORY_ID"
```
Expected: all `200`. Inspect one full body per group (drop `-o NUL`) to confirm the schema shape; log mismatches as `contract` findings.

- [ ] **Step 2: Validation — malformed params**

Run and confirm each returns `400` (or `404` for a well‑formed but missing id):
```powershell
curl.exe -s -o NUL -w "bad-search %{http_code}\n" "http://localhost:3001/api/v1/search"
curl.exe -s -o NUL -w "bad-story %{http_code}\n" "http://localhost:3001/api/v1/stories/not-a-uuid"
curl.exe -s -o NUL -w "missing-slug %{http_code}\n" "http://localhost:3001/api/v1/stories/by-slug/zzz-no-such-slug"
```
Expected: `search` without `q` → 400 (or documented default); `not-a-uuid` → 400; missing slug → 404. Log divergences as `validation`/`contract`.

- [ ] **Step 3: Cover cache headers**

Run:
```powershell
curl.exe -s -D - -o NUL "http://localhost:3001/api/v1/cover/$STORY_ID"
```
Expected: `200` with `Cache-Control: public, max-age=31536000, immutable` + an `ETag`. Log if missing.

- [ ] **Step 4: Record results**

Append the status table + any divergences to Section B → API. (Commit happens at the end of Task 12.)

### Task 9: API probing — authenticated (`me/*`) + 401 guards

**Files:**
- Modify: `tests-e2e/REPORT-2026-06-08.md` (Section B → API)

- [ ] **Step 1: 401 — missing token**

Run and confirm each returns `401`:
```powershell
curl.exe -s -o NUL -w "me %{http_code}\n" "http://localhost:3001/api/v1/auth/me"
curl.exe -s -o NUL -w "bookmarks %{http_code}\n" "http://localhost:3001/api/v1/me/bookmarks"
curl.exe -s -o NUL -w "progress %{http_code}\n" "http://localhost:3001/api/v1/me/reading-progress"
curl.exe -s -o NUL -w "stats %{http_code}\n" "http://localhost:3001/api/v1/me/stats"
curl.exe -s -o NUL -w "notifs %{http_code}\n" "http://localhost:3001/api/v1/me/notifications"
curl.exe -s -o NUL -w "me-recommend %{http_code}\n" "http://localhost:3001/api/v1/me/recommendations"
```
Expected: all `401`.

- [ ] **Step 2: 200 — with reader token**

Run the same set with `-H "Authorization: Bearer $READER_TOKEN"`. Expected: all `200`. Inspect `GET /api/v1/me/stats` + `GET /api/v1/me/reading-progress/continue-reading` bodies for shape. Log contract issues.

- [ ] **Step 3: 401 — invalid token**

Run:
```powershell
curl.exe -s -o NUL -w "%{http_code}\n" "http://localhost:3001/api/v1/auth/me" -H "Authorization: Bearer not.a.real.token"
```
Expected: `401`.

- [ ] **Step 4: Record results** into Section B → API.

### Task 10: API probing — admin endpoints + 403 authz guards

**Files:**
- Modify: `tests-e2e/REPORT-2026-06-08.md` (Section B → API)

- [ ] **Step 1: 403 — reader token on admin routes**

Run with `-H "Authorization: Bearer $READER_TOKEN"` and confirm each returns `403`:
```powershell
curl.exe -s -o NUL -w "jobs %{http_code}\n" "http://localhost:3001/api/v1/jobs" -H "Authorization: Bearer $READER_TOKEN"
curl.exe -s -o NUL -w "jobs-stats %{http_code}\n" "http://localhost:3001/api/v1/jobs/stats" -H "Authorization: Bearer $READER_TOKEN"
curl.exe -s -o NUL -w "admin-users %{http_code}\n" "http://localhost:3001/api/v1/admin/users" -H "Authorization: Bearer $READER_TOKEN"
curl.exe -s -o NUL -w "settings %{http_code}\n" "http://localhost:3001/api/v1/admin/settings/auto-refresh" -H "Authorization: Bearer $READER_TOKEN"
curl.exe -s -X POST -o NUL -w "import %{http_code}\n" "http://localhost:3001/api/v1/stories/import" -H "Authorization: Bearer $READER_TOKEN" -H "Content-Type: application/json" -d '{\"url\":\"https://truyenfull.today/x\"}'
```
Expected: all `403`.

- [ ] **Step 2: 200 — admin token**

Run the GET set above with `$ADMIN_TOKEN`. Expected: `200`. Inspect `GET /api/v1/jobs/stats` + `GET /api/v1/admin/users` bodies for shape. Log contract issues.

- [ ] **Step 3: Pagination cap**

Run:
```powershell
curl.exe -s "http://localhost:3001/api/v1/jobs?limit=500" -H "Authorization: Bearer $ADMIN_TOKEN"
```
Expected: server caps the returned rows (re‑verify the documented 100 cap). Log the observed cap.

- [ ] **Step 4: Record results** into Section B → API.

### Task 11: DB cross‑checks

**Files:**
- Modify: `tests-e2e/REPORT-2026-06-08.md` (Section B → DB)

- [ ] **Step 1: Gzip bytea + uncompressed size**

Run:
```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT index, octet_length(content_text) AS stored_bytes, content_byte_size AS uncompressed FROM chapter WHERE story_id = '$STORY_ID' AND content_text IS NOT NULL ORDER BY index LIMIT 3;"
```
Expected: `stored_bytes` (gzipped) < `uncompressed` for real content. Log anomalies (e.g. uncompressed ≤ stored).

- [ ] **Step 2: Vietnamese diacritic‑fold search index**

Run (replace `mtien` with a diacritic‑free fragment of the seeded title):
```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT title FROM story WHERE immutable_unaccent(lower(title || ' ' || author)) ILIKE '%' || immutable_unaccent(lower('mtien')) || '%' LIMIT 5;"
```
Expected: folded query matches the accented row. Log if it misses.

- [ ] **Step 3: Engagement aggregates match row counts**

Run:
```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT (SELECT count(*) FROM rating WHERE story_id = '$STORY_ID') AS rating_rows, (SELECT count(*) FROM bookmark WHERE story_id = '$STORY_ID') AS bookmark_rows;"
```
Expected: counts reflect the ratings/bookmarks created in Phase 1 (≥1 each). Cross‑check against the `GET /api/v1/ratings/story/:storyId` aggregate. Log mismatches. (If table names differ, list them first with `\dt`.)

- [ ] **Step 4: Job rows mirror the crawl lifecycle**

Run:
```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT type, state, count(*) FROM crawler_job GROUP BY type, state ORDER BY 1,2;"
```
Expected: import/discover/fetch‑chapter rows in completed (and possibly failed) states consistent with Phase 0/Journey 3. (If the persisted job table name differs, discover it with `\dt` first.) Log anomalies.

- [ ] **Step 5: Record results** into Section B → DB.

### Task 12: Cross‑cutting audits (console / network / SEO / security‑lite)

**Files:**
- Modify: `tests-e2e/REPORT-2026-06-08.md` (Section B → Cross‑cutting)
- Evidence: `tests-e2e/screenshots/xc-*.png`

- [ ] **Step 1: SEO endpoints**

Run:
```powershell
curl.exe -s -o NUL -w "sitemap %{http_code}\n" "http://localhost:3001/sitemap.xml"
curl.exe -s -o NUL -w "sitemap-stories %{http_code}\n" "http://localhost:3001/sitemap-stories.xml"
curl.exe -s -o NUL -w "sitemap-chapters %{http_code}\n" "http://localhost:3001/sitemap-chapters.xml"
curl.exe -s -o NUL -w "robots %{http_code}\n" "http://localhost:3001/robots.txt"
```
Expected: all `200` with correct content types. Also confirm `GET /api/v1/sitemap.xml` is NOT served (404 guard). In the browser, confirm JSON‑LD is present on the story + chapter pages (evaluate `document.querySelectorAll('script[type="application/ld+json"]')`). Log findings.

- [ ] **Step 2: Security‑lite — IDOR on `me/*`**

Both tokens belong to different users. Confirm the reader cannot read another user's data through id‑bearing routes. Probe the bookmark/progress read paths with the reader token but reference the admin's data where the route allows an id; confirm the API scopes to the caller (returns only the caller's rows, never another user's):
```powershell
curl.exe -s "http://localhost:3001/api/v1/me/bookmarks" -H "Authorization: Bearer $READER_TOKEN"
curl.exe -s "http://localhost:3001/api/v1/me/bookmarks/$STORY_ID" -H "Authorization: Bearer $READER_TOKEN"
```
Expected: responses are scoped to the reader only. Log any leakage of another user's rows as a `security` finding.

- [ ] **Step 3: Security‑lite — search injection safety**

Run:
```powershell
curl.exe -s -o NUL -w "%{http_code}\n" "http://localhost:3001/api/v1/search?q=%27%29%3B--"
```
Expected: `200`/`400` with no server error and no SQL leakage (Drizzle parameterizes). Log if a 500 or DB error surfaces.

- [ ] **Step 4: Console + network sweep summary**

Aggregate the console errors and 4xx/5xx collected across Phases 1–2 into a single cross‑cutting summary (favicon 404, post‑logout 401/403 polling, any broken covers). Screenshot the network panel of a representative page (`xc-01-network.png`). Log findings.

- [ ] **Step 5: Commit Phase 2 evidence + report progress**

Run:
```powershell
git add tests-e2e/REPORT-2026-06-08.md tests-e2e/screenshots/xc-*.png
git commit -m "test(e2e): white-box API/DB + cross-cutting findings"
```

---

## Phase 3 — Synthesis & report

### Task 13: Finalize the report

**Files:**
- Modify: `tests-e2e/REPORT-2026-06-08.md`

- [ ] **Step 1: Verdict + prioritized fix list**

Fill in the `## Overall verdict` line (PASS / PASS‑WITH‑CAVEATS / FAIL with one‑paragraph rationale) and the `## Prioritized fix list` (order findings blocker → high → medium → low → nit; each item links to the suggested fix location). Confirm the "Known issues — re‑verified" section records the observed status of each carried item.

- [ ] **Step 2: Self‑check the report**

Verify: every finding has severity + category + surface/endpoint + evidence path; no `TBD`/placeholder remains; the environment section has real values; the existing `tests-e2e/REPORT.md` is untouched. Fix inline.

- [ ] **Step 3: Final commit**

Run:
```powershell
git add tests-e2e/REPORT-2026-06-08.md
git commit -m "test(e2e): finalize 2026-06-08 white/black-box report"
```
Expected: one commit. No application source files and no automated test code are staged at any point in this plan.

---

## Self‑review (plan vs spec)

- **Spec coverage:** Phase 0 → Task 1‑4 (infra, users, crawled story, baseline + report skeleton). Phase 1 black‑box journeys → Task 5 (guest), Task 6 (registered), Task 7 (admin), each with inline grey‑box. Phase 2 white‑box → Task 8 (public contract/validation + cover headers), Task 9 (`me/*` + 401), Task 10 (admin + 403 + pagination cap), Task 11 (DB cross‑checks), Task 12 (SEO + security‑lite + console/network sweep). Phase 3 report → Task 13. All five coverage areas + the "A+B+DB" white‑box definition are represented.
- **Safety:** crawl capped at one story / ≤3 chapters; no "recrawl all"; report‑only; only the report + evidence are committed — no app or test code.
- **Known issues:** all five carried items have an explicit re‑verify touchpoint (favicon → Task 12 Step 4; genre hint → Task 5 Step 3; logout 401 → Task 6 Step 7; jobs 403 → covered by logout/admin context; 100 cap → Task 10 Step 3).
- **Consistency:** token vars `$ADMIN_TOKEN`/`$READER_TOKEN`, `$STORY_ID`/`$STORY_SLUG`/`$STORY_URL` are defined in Phase 0 and reused verbatim throughout. Report path `tests-e2e/REPORT-2026-06-08.md` is identical in every task.
