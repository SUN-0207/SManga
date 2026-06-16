# 6. Runtime View

> arc42 §6 — how the building blocks (§[05](05-building-blocks.md)) collaborate at
> runtime for the scenarios that matter most. SManga runs as a single NestJS
> process (`apps/api`) that is *both* the HTTP server and the Bull worker, plus a
> Vite/React SPA (`apps/frontend`). The flows below are derived from the cited
> source files — every method, job name, column, and endpoint named here was read
> from the code.

The scenarios:

1. [Crawl a chapter](#61-crawl-a-chapter) — content fetch → gzip → persist.
2. [2-step discovery](#62-2-step-discovery-browse--metadata--chapters--crawl) — browse a source feed → import metadata → discover chapters → enqueue crawls.
3. [Reader read path](#63-reader-read-path) — story page → chapter reader → server-side gunzip.
4. [Authentication](#64-authentication) — login → JWT cookie → `/auth/me`.
5. [Smart auto-crawl drainer](#65-smart-auto-crawl-backlog-drainer) — repeatable feeder tops the queue from the backlog.

A note on the queue that recurs throughout: there is **one Bull queue**, named
`crawler` (`QUEUE_CRAWLER`, `apps/api/src/modules/queue/queue.constants.ts`).
All crawl-related work flows through it as jobs of different *names* and
*priorities*. Bull priority is **lower number = higher priority**; the constants
are in `JOB_PRIORITY`:

| Job name (`queue.constants.ts`) | Priority | Meaning |
| --- | --- | --- |
| `fetch-chapter` | 1 (`FETCH_CHAPTER`) | Crawl one chapter's content — the only job that grows the visible library. |
| `retry-reconciler` | 2 (`RETRY_RECONCILER`) | Dead-letter retry sweep / feeder tick. |
| `discover-chapters` | 5 (`DISCOVER_CHAPTERS`) | Discover a story's chapter list. |
| `discover-all-source` | 8 (`DISCOVER_ALL_SOURCE`) | Fan a whole source feed out into imports. |
| `import-story` | 10 (`IMPORT_STORY`) | Import story metadata. |
| `refresh-all-stories` | 20 (`REFRESH_ALL_STORIES`) | Scheduled refresh cron. |
| `autocrawl-feed` enqueues `fetch-chapter` at 30 (`AUTOCRAWL_FETCH`) | 30 | Background backlog drain — lowest priority so manual work always preempts. |

---

## 6.1 Crawl a chapter

**Trigger:** a `fetch-chapter` Bull job (enqueued by discovery chaining, the admin
"crawl" action in `ChaptersService.crawl`, or the auto-crawl feeder). The job
carries only `{ chapterId }` (`FetchChapterJobData`).

**Code:** `FetchChapterProcessor.handle`
(`apps/api/src/modules/crawler-jobs/fetch-chapter.processor.ts`) →
`fetchChapterById(db, chapterId)`
(`packages/crawler/src/engine.ts`) → `fetchHtml`
(`packages/crawler/src/fetcher.ts`), the per-source `TokenBucket`
(`packages/crawler/src/rate-limit.ts`), and the truyenfull adapter's
`fetchChapterContent` → `parseChapterContentHtml`
(`packages/crawler/src/sources/truyenfull/parsers.ts`).

![06-runtime-view — diagram 1](../diagrams/architecture-06-runtime-view-1.svg)

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
sequenceDiagram
    autonumber
    participant Bull as Bull queue (crawler)
    participant Proc as FetchChapterProcessor
    participant Eng as engine.fetchChapterById
    participant DB as Postgres (chapter)
    participant Reg as registry.getAdapter
    participant Bucket as TokenBucket (per sourceId)
    participant Fetch as fetcher.fetchHtml
    participant Site as truyenfull.today
    participant Parse as adapter.fetchChapterContent

    Bull->>Proc: fetch-chapter { chapterId }
    Proc->>Eng: fetchChapterById(db, chapterId)
    Eng->>DB: SELECT id, sourceId, externalUrl WHERE id = chapterId
    DB-->>Eng: row (or throw "chapter not found")
    Eng->>Reg: getAdapter(row.sourceId)
    Reg-->>Eng: SourceAdapter (rateLimit.rps)
    Eng->>Bucket: acquire() (FIFO, 1 token)
    Bucket-->>Eng: token granted (≈ 1 rps)
    Eng->>Fetch: fetchHtml(externalUrl)
    Fetch->>Site: GET (browser UA, 15s timeout)
    Site-->>Fetch: HTML (or 429/503 → RateLimitError, ≥400 → FetchError)
    Fetch-->>Eng: html string
    Eng->>Parse: fetchChapterContent(html)
    Parse-->>Eng: { title, text } (ParserError if content empty)
    Eng->>Eng: gzip(Buffer.from(text)) on libuv threadpool
    Eng->>DB: UPDATE chapter SET contentText=gzip bytes, contentByteSize=raw len,<br/>status='crawled', crawledAt=now, lastError=null
    Note over Eng,DB: on any throw - UPDATE status='failed', lastError=message, then re-throw
```

</details>

**Key facts (verified against `engine.fetchChapterById`):**

- The SELECT is deliberately lean — only `id`, `sourceId`, `externalUrl`. The
  gzipped `contentText` bytea is *not* dragged into memory on a re-fetch.
- Rate limiting is a per-`sourceId` `TokenBucket`, default **1 rps** (the burst
  equals the rate). `acquire()` is FIFO-serialized so concurrent callers cannot
  stampede the same deadline (see the `chain` promise in `rate-limit.ts`).
- `chapter.contentText` is stored **gzipped** (`bytea`). `contentByteSize`
  stores the **uncompressed** byte length (used for storage stats). The gzip
  runs via `promisify(zlib.gzip)` so compression happens off the event loop.
- On success: `status='crawled'`, `crawledAt` set, `lastError` cleared. On
  failure: `status='failed'`, `lastError` = the error message, and the error is
  re-thrown so Bull marks the job failed.

**Failure handling / dead-letter:** when Bull exhausts a job's in-process
attempts, `JobFailureListener.onFailed`
(`apps/api/src/modules/jobs/job-failure.listener.ts`) classifies the error
(`classifyCrawlerError` from `@smanga/shared`) and upserts a `job_failure` row:
`permanent` → `needs_attention`; transient → `pending` with a backoff
`nextRetryAt`; beyond `MAX_RETRY_GENERATIONS` → `dead`. `OnQueueCompleted`
resolves the dead-letter row (`status='resolved'`, generation reset to 0). See
[crawling-and-discovery](../business-logic/crawling-and-discovery.md) for the
ParserError taxonomy.

**Cover download** is *not* part of the chapter flow — it happens once during
metadata import (§6.2): `engine.importStoryMetadata` calls `downloadCover`
(`packages/crawler/src/cover.ts`), which fetches the image (also metered through
the per-source bucket), validates the MIME against the allowlist
(`image/jpeg|png|webp|gif`; the non-standard `image/jpg` is normalised to
`image/jpeg`), rejects > 2 MB, and stores the bytes + MIME on the `story` row
(`story.cover` bytea, `story.coverMimeType`). It is served later by the covers
module — see [api reference](../reference/api.md) and
[crosscutting concepts](08-crosscutting-concepts.md) for the caching/ETag story.

---

## 6.2 2-step discovery: browse → metadata → chapters → crawl

The catalog discovery flow separates **metadata import** (Phase A) from
**chapter-list discovery** (Phase B) so a bulk import does not block on
paginating every story's chapter list. An operator can kick this off two ways:

- **Whole feed:** `POST /api/v1/sources/:id/discover-all`
  (`sources.controller.ts` → `SourcesService.enqueueDiscoverAll`) enqueues a
  single `discover-all-source` job (idempotent jobId
  `discover-all:{sourceId}:{feedId}` → 409 if already `waiting`/`active`/`delayed`).
- **Selected URLs:** `POST /api/v1/stories/import-bulk`
  (`stories.controller.ts`) enqueues one `import-story` job per URL.

The full-auto chain is driven by the `autoCrawl` flag carried through the job
payloads (`ImportStoryJobData.autoCrawl` → `DiscoverChaptersJobData.autoCrawl`).

![06-runtime-view — diagram 2](../diagrams/architecture-06-runtime-view-2.svg)

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
sequenceDiagram
    autonumber
    participant Admin as Admin (discover UI)
    participant API as SourcesService
    participant Bull as Bull queue (crawler)
    participant DAS as DiscoverAllSourceProcessor
    participant Eng as crawler engine
    participant ISP as ImportStoryProcessor
    participant DCP as DiscoverChaptersProcessor
    participant DB as Postgres

    Admin->>API: POST /sources/:id/discover-all { feed, autoCrawl }
    API->>Bull: add discover-all-source (prio 8, idempotent jobId)
    Bull->>DAS: discover-all-source { sourceId, feedId, autoCrawl }
    loop each catalog page (sleep 1s between pages)
        DAS->>Eng: browseCatalog(sourceId, feedId, page)
        Eng->>DB: annotate items w/ existingStoryId / discoveryStatus
        loop each story item
            DAS->>API: stories.enqueueImport(url, requestedBy, autoCrawl)
            API->>Bull: add import-story (prio 10, skipDiscovery)
        end
    end

    Bull->>ISP: import-story { url, skipDiscovery, autoCrawl }
    Note over ISP,Eng: Phase A - metadata import
    ISP->>Eng: importStoryMetadata(db, url)
    Eng->>DB: dedup on sourceId+externalId, insert story + storySource<br/>+ genres + cover, discoveryStatus='pending'
    alt autoCrawl AND queue not at capacity
        ISP->>Bull: add discover-chapters (prio 5, jobId discover-chapters:{storyId})
    end

    Bull->>DCP: discover-chapters { storyId, autoCrawl }
    Note over DCP,Eng: Phase B - chapter discovery
    DCP->>Eng: discoverChapters(db, storyId)
    Eng->>DB: discoveryStatus running, paginate listChapters,<br/>INSERT pending chapter rows, discoveryStatus='complete'
    alt autoCrawl AND queue not at capacity
        DCP->>DB: SELECT pending/failed chapter ids ORDER BY index
        DCP->>Bull: add fetch-chapter per chapter (prio 1, jobId fetch-chapter:{id})
    end
    Note over DCP,Bull: fetch-chapter jobs then run the §6.1 flow
```

</details>

**Key facts:**

- **Phase A — `importStoryMetadata`** (`engine.ts`): fetches the story page,
  dedups by `(storySource.sourceId, storySource.externalId)` before any
  expensive work, then inserts the `story` row, the `story_source` link
  (`isPrimary=true`), genres (`genre` + `story_genre`), and the cover. The new
  story starts at `discoveryStatus='pending'`. Re-importing an existing story is
  idempotent (returns the existing `storyId`); a NULL cover is healed on
  re-import.
- **Phase B — `discoverChapters`** (`engine.ts`): sets `discoveryStatus='running'`,
  paginates `adapter.buildListChaptersUrl` + `adapter.listChapters` (capped at 200
  pages), inserts `chapter` rows with `status='pending'`
  (`ON CONFLICT DO NOTHING`), then sets `totalChapters`, `discoveredAt`, and
  `discoveryStatus='complete'`. On error it writes `discoveryStatus='failed'` +
  `discoveryError` and re-throws.
- **Capacity guard:** both chaining steps call `isQueueAtCapacity`
  (`apps/api/src/modules/queue/queue-capacity.ts`) before fanning out. If the wait
  queue is saturated the chain is **skipped** — story/chapter rows persist and an
  operator can re-trigger (`discover` or crawl-missing) later. This degradation
  mode exists because of the 2026-06-09 incident where 48k `import-story` jobs
  starved `fetch-chapter`.
- `DiscoverAllSourceProcessor` skips a URL on `ConflictException`/
  `BadRequestException` (e.g. unregistered hostname) instead of failing the whole
  job; any other error fails the job (visible at `/admin/jobs`).

See [crawling-and-discovery](../business-logic/crawling-and-discovery.md) for the
business rules and [api reference](../reference/api.md) for the exact endpoints.

---

## 6.3 Reader read path

The public reader is the Vite/React SPA. It reads via the cacheable, unauthenticated
`/api/v1` story + chapter endpoints. There are **two pages**: the story detail
route `/truyen/$slug` and the chapter reader route `/truyen/$slug/chuong/$index`
(`apps/frontend/src/routes/truyen/$slug/index.tsx` and
`apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx`).

![06-runtime-view — diagram 3](../diagrams/architecture-06-runtime-view-3.svg)

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
sequenceDiagram
    autonumber
    participant Reader as Reader (browser SPA)
    participant CF as Cloudflare edge
    participant API as NestJS api
    participant DB as Postgres

    Note over Reader: navigate to /truyen/$slug
    Reader->>CF: GET /api/v1/stories/by-slug/{slug}
    CF-->>Reader: edge cache HIT s-maxage=300, else forward
    CF->>API: StoriesController.getBySlug
    API->>DB: SELECT story by slug, plus genres, rating, viewCount
    API-->>CF: story detail, Cache-Control public s-maxage=300 SWR=600
    Reader->>CF: GET /api/v1/stories/by-slug/{slug}/chapters/all
    CF->>API: StoriesController.allChaptersBySlug
    API-->>Reader: list of index, title, status, s-maxage=300

    Note over Reader: open a chapter at /truyen/$slug/chuong/$index
    Reader->>CF: GET /api/v1/chapters/by-slug/{slug}/{index}
    CF-->>Reader: edge cache HIT s-maxage=86400, else forward
    CF->>API: ChaptersController.get then getChapterContent
    API->>DB: SELECT chapter joined story on slug + index,<br/>plus prev and next chapter
    DB-->>API: gzipped contentText bytea
    API->>API: gunzip contentText to utf-8 text, server-side
    API-->>CF: story, chapter content + isCrawled + viewCount, prev, next
    CF-->>Reader: chapter JSON, Cache-Control public s-maxage=86400 SWR=3600
    Note over Reader: views tracked client-side: story once per day, chapter after 3s
```

</details>

**Key facts (verified against the controllers/service):**

- Story detail = `GET /api/v1/stories/by-slug/:slug`
  (`StoriesController.getBySlug`). The chapter list the reader uses is
  `GET /api/v1/stories/by-slug/:slug/chapters/all`
  (`allChaptersBySlug`) — the SPA derives the "latest readable chapter" and the
  table of contents from this. Both carry
  `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`.
- Chapter content = `GET /api/v1/chapters/by-slug/:slug/:index`
  (`ChaptersController.get` → `ChaptersService.getChapterContent`). **gunzip
  happens server-side**: the service reads the gzipped `chapter.contentText`
  bytea and `gunzip`s it to UTF-8 before returning (`chapters.service.ts`); the
  client receives plain text. This endpoint carries
  `Cache-Control: public, s-maxage=86400, stale-while-revalidate=3600` (long edge
  TTL — chapter content is effectively immutable once crawled).
- The chapter response also returns `prev`/`next` (queried by `lt`/`gt` on
  `chapter.index`) and `isCrawled` (`status === 'crawled' && text !== null`),
  which the reader uses for navigation and the "chưa được crawl" placeholder.
- View counting is fired from the SPA hooks (`useTrackStoryView` once per
  calendar day; `useTrackChapterView` after 3 s) against the engagement module —
  see [reading-and-engagement](../business-logic/reading-and-engagement.md).

> **Do not** ungzip chapter content client-side — the server route owns it
> (`CLAUDE.md` hard-won workaround #11).

---

## 6.4 Authentication

Auth is **passport-jwt over an httpOnly cookie**. There is no Edge-runtime split
(that was the retired Next.js stack); the NestJS process verifies the JWT on every
guarded request. Code: `apps/api/src/modules/auth/{auth.controller,auth.service,jwt.strategy}.ts`
and the guards in `apps/api/src/common/guards/`.

![06-runtime-view — diagram 4](../diagrams/architecture-06-runtime-view-4.svg)

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
sequenceDiagram
    autonumber
    participant User as Browser SPA
    participant API as AuthController
    participant Svc as AuthService
    participant DB as Postgres (user)

    User->>API: POST /api/v1/auth/login { email, password }
    Note over API: RealIpThrottlerGuard — 5 attempts / 60s
    API->>Svc: login(dto)
    Svc->>DB: SELECT user WHERE email
    Svc->>Svc: bcrypt.compare(password, passwordHash)
    Svc->>Svc: jwt.sign({ sub, email, role })
    Svc-->>API: { token, user }
    API-->>User: Set-Cookie jwt=<token><br/>(httpOnly, sameSite=lax, secure in prod, maxAge 14d)<br/>+ { user }

    Note over User: subsequent request to a guarded route
    User->>API: GET /api/v1/auth/me (Cookie: jwt=...)
    Note over API: JwtAuthGuard → JwtStrategy.validate
    API->>Svc: getById(payload.sub)
    Svc->>DB: SELECT id,email,name,image,role
    Svc-->>User: current user (or 401 if token missing/invalid)
```

</details>

**Key facts:**

- `POST /auth/login` (`AuthController.login`) verifies the password with
  `bcryptjs` (`AuthService.login`), signs a JWT (`{ sub, email, role }`,
  `JwtPayload`), and sets it as a cookie named **`jwt`**: `httpOnly`,
  `sameSite: 'lax'`, `secure` only in production, `maxAge` 14 days. Login is rate
  limited to 5 attempts / 60 s by `RealIpThrottlerGuard` + `@Throttle`.
- `JwtStrategy` (`jwt.strategy.ts`) extracts the token from the **`jwt` cookie
  first**, then falls back to the `Authorization: Bearer` header. The secret is
  `JWT_SECRET` (read via `loadEnv()`). `validate` returns
  `{ id, email, role }` → `req.user`.
- `GET /auth/me`, `PATCH /auth/me`, `POST /auth/change-password` are guarded by
  `JwtAuthGuard` (throws on missing/invalid token). Admin-only endpoints add
  `@Roles(['admin'])` enforced by `RolesGuard`, which 403s if `req.user.role` is
  not in the required list. There is also an `OptionalJwtGuard` that populates
  `req.user` if present but never rejects (used for anonymous-friendly routes).
- `POST /auth/logout` simply clears the `jwt` cookie (204).
- **Google OAuth** (optional, `isGoogleEnabled()`): `GET /auth/google` →
  `GET /auth/google/callback`, where `AuthService.findOrCreateOAuthUser` links or
  creates a user, `signTokenFor` issues the same `jwt` cookie, and the user is
  redirected to a validated same-origin path (default `/tu-sach`). See
  [configuration](../reference/configuration.md) for the Google env vars.

---

## 6.5 Smart auto-crawl backlog drainer

A **Bull repeatable job** keeps the wait queue topped up with the
newest-first `pending` chapters at the *lowest* priority, so the existing 1-rps
worker drains the backlog without ever flooding the queue or preempting manual
work. Code: `AutoCrawlFeederProcessor`
(`apps/api/src/modules/app-settings/auto-crawl-feeder.processor.ts`); runtime
toggle in `app_setting` (`packages/db/src/schema/app-setting.ts`), edited via
`PATCH /api/v1/admin/settings/auto-crawl` (`auto-crawl.controller.ts`).

![06-runtime-view — diagram 5](../diagrams/architecture-06-runtime-view-5.svg)

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
sequenceDiagram
    autonumber
    participant Cron as Bull repeatable (cron */1, tz Asia/Ho_Chi_Minh)
    participant Feed as AutoCrawlFeederProcessor.handle
    participant DB as Postgres
    participant Q as Bull queue (crawler)

    Cron->>Feed: autocrawl-feed (prio 2 — runs promptly)
    Feed->>DB: SELECT autoCrawlEnabled, autoCrawlWatermark FROM app_setting WHERE id=1
    alt autoCrawlEnabled = false
        Feed-->>Cron: { enqueued: 0, reason: 'disabled' }
    else enabled
        Feed->>Q: getWaitingCount()
        alt waiting >= watermark
            Feed-->>Cron: { enqueued: 0, reason: 'watermark' }
        else headroom = watermark - waiting
            Feed->>DB: two-step frontier:<br/>1) newest ≤headroom stories (discovery_status='complete')<br/>   with a pending chapter (EXISTS)<br/>2) their pending chapters ORDER BY updated_at DESC, index ASC LIMIT headroom
            DB-->>Feed: chapter ids (or none → reason 'idle')
            Feed->>Q: enqueueChunked fetch-chapter per id<br/>(prio 30 AUTOCRAWL_FETCH, attempts 3, exp backoff 30s)
            Feed-->>Cron: { enqueued, reason: null }
        end
    end
```

</details>

**Key facts (verified against `auto-crawl-feeder.processor.ts` + the schema):**

- The repeatable is installed on module init with cron **`*/1 * * * *`** (every
  minute, tz `Asia/Ho_Chi_Minh`), jobId `autocrawl-feeder-cron`. The *tick* runs
  at `RETRY_RECONCILER` priority (2) so the queue is refilled before it drains;
  the `fetch-chapter` jobs the tick **enqueues** are `AUTOCRAWL_FETCH` priority
  (30 — the lowest), so any manual crawl/discover/reconciler work preempts them.
- The **kill switch is `app_setting.autoCrawlEnabled`** (default **OFF** /
  opt-in). The repeatable stays installed and simply no-ops (`reason: 'disabled'`)
  when off, so an operator flips it on at `/admin/settings` without a redeploy.
- **`autoCrawlWatermark`** (default **500**, clamped `[50, 2000]` in
  `AppSettingsService.setAutoCrawl`) bounds how many `fetch-chapter` jobs the
  feeder keeps queued. Headroom = `watermark - waiting`; under-filling a tick is
  fine because the next tick continues.
- The **two-step story-frontier** query keeps the outer scan bounded so the
  planner cannot full-sort the large `pending` backlog: step 1 selects the newest
  ≤`headroom` stories (`discovery_status='complete'`) that still have a `pending`
  chapter (early-stops on the story-updated-at index, probes the partial
  needs-crawl index for the `EXISTS`); step 2 takes those stories' `pending`
  chapters ordered by story recency then chapter index, up to `headroom`.
- The whole tick body is wrapped in try/catch and returns
  `{ enqueued: 0, reason: 'error' }` on a transient DB/Redis failure rather than
  crashing the process or leaving a failed feed job in Bull.

See [crawling-and-discovery](../business-logic/crawling-and-discovery.md) and
[admin-and-moderation](../business-logic/admin-and-moderation.md) for the operator
view, and [configuration](../reference/configuration.md) for the `app_setting`
runtime flags.

---

**Related:** building blocks → [05-building-blocks.md](05-building-blocks.md) ·
deployment → [07-deployment-view.md](07-deployment-view.md) · crosscutting
(queue, caching, gzip, auth) → [08-crosscutting-concepts.md](08-crosscutting-concepts.md).
