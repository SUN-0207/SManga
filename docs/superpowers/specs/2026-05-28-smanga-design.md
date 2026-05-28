# SManga — Design Spec

- **Date:** 2026-05-28
- **Owner:** son.cu@opswat.com
- **Status:** Approved for plan-writing

## 1. Mục tiêu & phạm vi

SManga là web đọc truyện chữ (Vietnamese novel reader). Nguồn dữ liệu lấy bằng crawler từ `https://truyenfull.today/` ở phase 1, có khả năng mở rộng thêm nguồn khác trong tương lai mà không động code core.

- **Audience scale:** hobby project public, mục tiêu 100–1000 user đồng thời.
- **Hai mặt UI:**
  - **Reader site** — public, SEO-friendly, đọc truyện.
  - **Admin site** — auth-gated, quản lý source và trigger crawl job. Nằm chung 1 Next.js app dưới `/admin`, không phải app riêng.
- **Phi mục tiêu phase 1:** mobile app riêng, payment, audio TTS, dịch máy, recommendation engine, multi-language UI.

## 2. Quyết định kiến trúc tổng

- **1 Next.js app** (App Router) phục vụ cả reader và admin, protect `/admin/*` bằng middleware kiểm role.
- **Crawler là service Node.js riêng** (không nằm trong Next.js serverless functions) vì cần long-running + Playwright (khi cần).
- **Postgres làm single source of truth**, vừa lưu app data vừa làm job queue thông qua pg-boss.
- **Deployment phase 1:** Vercel (web) + Neon (Postgres) + Railway/Fly (crawler worker). Phase 2 migrate sang VPS với Docker Compose, code không đổi.
- **Crawl strategy:** hybrid — admin import story để pre-crawl metadata + chapter list; chapter content crawl on-demand bằng button (per-chapter, missing-only, hoặc recrawl-all).

### Sơ đồ

```
┌──────────────────────────────────────────────────────────┐
│  Vercel (Next.js App Router)                             │
│  Reader pages  +  /admin pages  +  /api routes           │
└──────────────┬───────────────────────────┬───────────────┘
               │ SQL                       │ INSERT job
               ▼                           ▼
        ┌──────────────────────────────────────┐
        │  Neon Postgres                       │
        │  app data + pg-boss schema           │
        └──────────────────────────────────────┘
                                  ▲
                                  │ poll jobs / write data
        ┌─────────────────────────┴──────────────┐
        │  Crawler worker (Railway/Fly)          │
        │  Node + pg-boss + cheerio + Playwright │
        │  Source adapters: truyenfull, …        │
        └────────────────────────────────────────┘
```

## 3. Tech stack

| Layer | Choice | Note |
|---|---|---|
| Runtime | Node.js 20 LTS | |
| Package manager | pnpm 9 + workspaces | Monorepo |
| Language | TypeScript 5 (strict) | |
| Web framework | Next.js 15 App Router | SSR + ISR + API routes |
| UI | React 19 + Tailwind CSS 4 + shadcn/ui | shadcn tăng tốc admin tables/forms |
| Auth | Auth.js v5 (NextAuth) + Drizzle adapter | Email/password + Google OAuth |
| ORM | Drizzle ORM + drizzle-kit | Type-safe SQL, migration gọn, không client codegen step |
| DB | Postgres 16 | Extensions: `pg_trgm`, `unaccent` |
| Queue | pg-boss 10 | Cùng Postgres, không cần Redis |
| Crawler HTML | `undici` fetch + `cheerio` | Default fetcher cho source static |
| Crawler JS-render | `playwright-core` (lazy load) | Chỉ dùng khi adapter khai báo `requiresJs=true` |
| Validation | Zod | Form input + adapter output schema |
| Rate limit (app) | `@upstash/ratelimit` (sliding window) hoặc in-memory | Per-IP cho public API |
| Logging | `pino` (JSON structured) | |
| Testing | Vitest + Playwright | Unit + integration + e2e |
| Lint/format | Biome | Thay ESLint + Prettier, một tool |

### Vì sao Drizzle thay vì Prisma

Type-safe SQL builder, không có client codegen nặng, query builder hợp với schema có junction phức tạp (StorySource). Migration tool gọn. Prisma cũng OK, lựa Drizzle vì tổng thể nhẹ hơn.

### Vì sao pg-boss thay vì BullMQ/Inngest

- Không cần Redis ⇒ ít 1 service.
- Transactional với app data (enqueue cùng transaction với business write).
- Đủ throughput cho scale 100–1000 user. BullMQ chỉ cần khi >10k job/giờ.
- Inngest tốt nhưng vendor-lock, và Playwright không chạy được trong Inngest serverless.

### Vì sao crawler tách service

- Playwright cần Chromium binary ~300MB, không chạy được tử tế trên Vercel serverless (cold start tệ, timeout ngắn).
- Long-running job + retry/backoff không hợp serverless.
- Service riêng cho phép scale crawler độc lập (nhiều worker khi cần).

## 4. Monorepo layout

```
smanga/
  apps/
    web/                          Next.js (reader + admin + API routes)
      src/app/(reader)/           Reader routes
      src/app/admin/              Admin routes (middleware-gated)
      src/app/api/                Route handlers
      src/server/                 Server-only logic (db queries, auth helpers)
  packages/
    db/                           Drizzle schema + migrations + client
      src/schema/
      src/migrations/
    crawler/                      Engine + source adapters
      src/engine.ts               Rate limit, retry, fetcher dispatch, persist
      src/registry.ts             Adapter lookup by id/hostname
      src/sources/truyenfull/     Adapter implementation
      src/sources/_template/      Skeleton cho source mới
    shared/                       Zod schemas + types dùng chung
  services/
    crawler-worker/               Node entry: pg-boss poll + dispatch jobs
      src/index.ts
  docker-compose.yml              Phase 2 VPS: postgres + web + worker
  pnpm-workspace.yaml
```

## 5. Data model (Drizzle schema, mức conceptual)

### Source
- `id` (text PK) — ví dụ `'truyenfull'`. Phải match adapter folder.
- `name`, `baseUrl`
- `isActive` boolean
- `rateLimitRps` numeric default 1
- `createdAt`, `updatedAt`

### Story
- `id` (uuid PK)
- `slug` (text unique) — SEO URL `/truyen/<slug>`
- `title`, `author`, `description`
- `cover` (bytea, nullable) — image bytes
- `coverMimeType` (text, nullable)
- `status` enum: `ongoing | completed | dropped | unknown`
- `totalChapters` int (denormalized counter)
- `lastChapterAt` timestamptz (cho sorting "mới update")
- `createdAt`, `updatedAt`
- Search được handle bằng expression GIN index trên `unaccent(lower(title || ' ' || author))` (xem Section 8), không cần column `searchVector` riêng.

### StorySource (junction multi-source)
- `(storyId, sourceId)` PK composite
- `externalId` text — id truyện ở source (slug truyenfull)
- `externalUrl` text — URL gốc
- `isPrimary` boolean — 1 story có đúng 1 primary; phụ là fallback
- `status` enum: `active | unavailable` — set `unavailable` khi source 404 story
- `createdAt`

### Genre
- `id` uuid PK, `slug` unique, `name`

### StoryGenre
- `(storyId, genreId)` PK composite

### Chapter
- `id` uuid PK
- `storyId` FK
- `index` numeric — cho phép `47.5`
- `title`
- `contentText` (bytea, nullable) — gzipped UTF-8; NULL = chưa crawl
- `contentByteSize` int — uncompressed size, cho stats
- `sourceId` text FK — source nào cung cấp chapter này
- `externalUrl` text
- `crawledAt` timestamptz nullable
- `status` enum: `pending | crawled | failed`
- `lastError` text nullable
- `publishedAt` timestamptz nullable
- Unique `(storyId, index)`

### User (Auth.js managed tables)
- Auth.js v5 schema (User, Account, Session, VerificationToken)
- Thêm column `role` enum `user | admin` default `user`

### Bookmark
- `(userId, storyId)` PK composite
- `createdAt`

### ReadingProgress
- `(userId, storyId)` PK composite
- `chapterIndex` numeric
- `updatedAt`

### Comment (phase sau, scope phase 1 cẩn thận)
- `id`, `userId`, `storyId`, `parentId` nullable (1-level reply), `body`, `createdAt`, `deletedAt` nullable
- `Rating` table riêng: `(userId, storyId)` PK, `score` int 1–5

### pg-boss tables
- Tạo bởi `boss.start()`, schema `pgboss`. Không tự định nghĩa.

## 6. Source adapter contract

```typescript
interface SourceAdapter {
  id: string;                                // 'truyenfull' (match Source.id)
  name: string;
  baseUrl: string;
  hostnames: string[];                       // dùng để resolve adapter từ URL
  requiresJs: boolean;                       // false → cheerio, true → playwright
  rateLimit: { rps: number };                // engine enforce

  parseStoryFromUrl(url: string): Promise<StoryMetadata>;
  listChapters(storyUrl: string, page?: number): Promise<{ chapters: ChapterRef[]; hasNextPage: boolean }>;
  fetchChapterContent(chapterUrl: string): Promise<ChapterContent>;
  search?(keyword: string): Promise<StorySearchResult[]>;  // optional
}

type StoryMetadata = {
  externalId: string;
  title: string;
  author: string | null;
  description: string;
  coverUrl: string | null;
  genres: string[];                          // tên genre, engine map qua slug
  status: 'ongoing' | 'completed' | 'dropped' | 'unknown';
};

type ChapterRef = {
  index: number;                             // hỗ trợ 47.5
  title: string;
  externalUrl: string;
  externalId: string;
};

type ChapterContent = {
  title: string;
  text: string;                              // plain text đã làm sạch
};
```

**Adapter KHÔNG lo:** rate limit, retry, persistence, fetch driver chọn lựa, cover download. **Engine** lo những thứ đó. Adapter chỉ là parser thuần.

**Adapter output validate qua Zod schema** trước khi engine persist — phát hiện parser drift sớm (source đổi HTML → một field thành null/undefined → schema fail → job fail rõ ràng).

## 7. Crawl flow

### F1. Admin add source

```
POST /api/admin/sources { id, name, baseUrl, rateLimitRps }
  → check adapter id tồn tại trong registry
  → INSERT Source
```

Seed mặc định khi setup: `truyenfull`.

### F2. Admin import story

```
POST /api/admin/stories/import { url }
  → resolve adapter từ hostname; nếu không có → 400
  → boss.send('import-story', { url, sourceId, requestedBy: userId })
  → return { jobId }

Worker job 'import-story':
  1. adapter.parseStoryFromUrl(url) → StoryMetadata (Zod-validated)
  2. download cover (fetch coverUrl, timeout 10s) → bytea
     fail → bỏ qua, cover = NULL
  3. INSERT Story (slug = slugify(title), unique conflict → append random suffix)
  4. INSERT StorySource (isPrimary=true)
  5. upsert Genre rows + StoryGenre junction
  6. loop adapter.listChapters(url, page) cho đến hasNextPage=false:
       INSERT Chapter rows với contentText=NULL, status='pending'
  7. update Story.totalChapters
  8. complete job
```

### F3. Admin crawl chapter content

Admin UI per-story có 3 buttons + per-chapter:

| Action | Hành vi |
|---|---|
| `Crawl this` (per chapter) | enqueue 1 `fetch-chapter` job |
| `Crawl missing` | enqueue N job cho chapter `status IN ('pending','failed')` |
| `Recrawl all` | enqueue N job cho mọi chapter (overwrite contentText) |

```
Worker job 'fetch-chapter' { chapterId }:
  1. Load Chapter + resolve adapter từ Chapter.sourceId
  2. engine.rateLimitFor(sourceId).consume()
  3. adapter.fetchChapterContent(externalUrl) → ChapterContent
  4. gzip text
  5. UPDATE Chapter SET contentText=$bytea, status='crawled', crawledAt=now()
  6. POST tới Next.js webhook /api/revalidate (auth bằng shared secret env var)
     payload { paths: ['/truyen/<slug>', '/truyen/<slug>/chuong-<index>'] }
     Webhook gọi revalidatePath cho từng path. Worker không import Next.js trực tiếp.
  Retry: pg-boss retryLimit=3, retryDelay=30s, retryBackoff=true
  Fail terminal → Chapter.status='failed', lastError=msg
```

### F4. Fallback giữa nhiều source

- Khi `fetch-chapter` fail terminal trên primary source và Story có StorySource phụ:
  - Engine có thể (config) tự thử source phụ — tra cứu external chapter mapping (giai đoạn đầu skip, admin thủ công attach source thứ 2 và recrawl từ source đó).

### F5. Cover route

```
GET /api/cover/:storyId
  → SELECT cover, coverMimeType FROM story WHERE id=$1
  → stream với header:
      Content-Type: <mimeType>
      Cache-Control: public, max-age=31536000, immutable
      ETag: <hash(cover)>
```

Vercel edge + browser cache giảm hit DB. ETag cho conditional 304.

## 8. Search

- Sử dụng `pg_trgm` + `unaccent` extensions (Neon support cả 2).
- Tạo expression index:
  ```sql
  CREATE INDEX story_search_idx ON story
    USING gin (unaccent(lower(title || ' ' || coalesce(author,''))) gin_trgm_ops);
  ```
- Query: `WHERE unaccent(lower(title || ' ' || author)) ILIKE '%' || unaccent(lower($q)) || '%'`
  với similarity rank để sort.
- Match `naruto` → `Narutō`, `tien hiep` → `tiên hiệp`.

Filter theo genre/status: WHERE join thông thường.

Phase 2 nếu cần fuzzy/relevance ngon hơn → plug Meilisearch (1 service mới).

## 9. Routes (high level)

### Reader (public)
| Path | Render | Note |
|---|---|---|
| `/` | ISR 5m | List mới update, hot |
| `/tim-kiem?q=...` | SSR | Search + filter |
| `/the-loai/<slug>` | ISR 10m | Theo genre |
| `/truyen/<slug>` | ISR 5m + on-demand revalidate | Story detail + chapter list (paginate 50/page) |
| `/truyen/<slug>/chuong-<index>` | ISR 1h + on-demand revalidate | Chapter content |
| `/api/cover/:storyId` | dynamic | Stream bytea (cache headers) |
| `/sitemap.xml` | dynamic | Generated từ Story + Chapter |
| `/robots.txt` | static | |

### Auth
| `/dang-nhap`, `/dang-ky`, `/dang-xuat` | Auth.js routes |

### User (logged in)
| `/tu-sach` | Bookmark + continue-reading |
| `/api/reading-progress` PUT | Debounced từ chapter view |
| `/api/bookmark` POST/DELETE | Toggle |

### Admin (role=admin only)
| `/admin` | Dashboard: counts, recent jobs |
| `/admin/sources` | CRUD source |
| `/admin/stories` | List + import story by URL |
| `/admin/stories/:id` | Detail + chapter table + crawl buttons |
| `/admin/jobs` | Queue depth, in-flight, failed jobs, retry button |
| `/admin/users` | Promote/demote, phase sau |
| `/admin/comments` | Moderation, phase sau |

Middleware `apps/web/src/middleware.ts`: nếu path bắt đầu `/admin` và session.role !== 'admin' → redirect `/dang-nhap`.

## 10. Auth

- Auth.js v5 (NextAuth) với 2 provider: Credentials (email/password) + Google.
- Session strategy: JWT trong cookie httpOnly, sameSite lax.
- Admin role được set thủ công qua SQL lần đầu (`UPDATE "user" SET role='admin' WHERE email=...`). Không có UI tự promote phase 1.
- Email verification: optional phase 1 (logging email console nếu chưa setup SMTP), bắt buộc phase 2.

## 11. Error handling & resilience

### Rate limiting (engine, per source)

Token bucket trong-memory tại worker, key by `sourceId`, refill rate từ `Source.rateLimitRps`. Adapter call đi qua `engine.fetch(sourceId, url, opts)` luôn — adapter không tự fetch.

### Retry (pg-boss)

- `retryLimit: 3`, `retryDelay: 30`, `retryBackoff: true` (30s → 60s → 120s).
- Hết retry → job state `failed`, app code mark Chapter.status='failed'.
- Admin UI hiển thị failed → button "Retry" enqueue lại với reset retry count.

### Adapter parser drift

- Output adapter validate bằng Zod schema. Drift → ZodError → job fail với message rõ ràng.
- **Fixture tests**: HTML thật commit vào `packages/crawler/src/sources/truyenfull/__fixtures__/`. Unit test feed fixture vào parser → expected snapshot.
- **Nightly canary** (GitHub Actions cron): chạy adapter thật với 1-2 URL canary; fail thì gửi noti (issue/email). Không chạy trong PR CI (flaky + lịch sự).

### Edge cases

| Case | Xử lý |
|---|---|
| Source 404 story | Mark `StorySource.status='unavailable'`. Admin banner. |
| Source 429/503 / Cloudflare challenge | `RateLimitError` → pg-boss retry với backoff dài (×5). Liên tục → auto-pause source N phút. |
| Cover tải fail | `cover = NULL`, story import tiếp. Admin "Retry cover" button. |
| Chapter index trùng / fractional | `index numeric` cho phép 47.5. Unique `(storyId, index)`. |
| Crawl chồng | pg-boss `singletonKey` per `(jobName, chapterId)` dedupe. |
| Worker chết giữa job | `expireInSeconds` của pg-boss tự release job. |
| Scraping app spam reader API | Per-IP rate limit. |
| Comment spam (phase 2) | Login required + rate limit + report flow. |

### Logging

- Structured JSON via pino → stdout → Railway/Vercel log viewer.
- pg-boss giữ job history 7 ngày.
- Phase 2 plug Sentry khi cần.

## 12. Testing strategy

| Layer | Tool | Cover |
|---|---|---|
| Unit | Vitest | slugify, gzip, Zod schemas, rate limit bucket, date helpers |
| Adapter parser (fixture) | Vitest + HTML fixtures | Parse từ HTML đã commit, expected output snapshot |
| Adapter live (canary) | Vitest, nightly only | Chạy parser với URL thật, detect drift |
| DB integration | Vitest + testcontainers-postgres | Drizzle queries, migrations idempotent, search relevance |
| E2E UI | Playwright | Critical paths: search → đọc chapter; đăng ký → bookmark; admin import (crawler mocked) |
| Manual smoke pre-deploy | Checklist | First chapter renders, search works, login |

Pre-commit: Biome + Vitest unit (~5–10s). PR CI: + fixture parser + DB integration. Nightly: + live canary.

## 13. Deployment plan

| Phase | Component | Where |
|---|---|---|
| Dev local | web + worker + postgres | `pnpm dev`, `pnpm dev:worker`, Docker postgres |
| Phase 1 (test public) | web | Vercel |
| Phase 1 | postgres | Neon free tier (3GB) |
| Phase 1 | worker | Railway Hobby (~$5/mo) hoặc Fly.io free allowance |
| Phase 2 (VPS) | tất cả | Hetzner CX22 (~€4/mo) — `docker compose up`. Migrate Neon → self-host Postgres bằng `pg_dump`. |

Env vars cốt lõi: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `WORKER_NAME` (cho pg-boss).

## 14. Capacity & budget guardrails

- Neon free 3GB. Chapter text gzip ~1.5KB/chapter avg. 500 truyện × 2000 chapter ≈ 1.5GB → ổn phase 1.
- Cover bytea 25–50KB × 500 = ~25MB. Negligible.
- Theo dõi qua admin dashboard: tổng size DB, jobs/24h, error rate. Khi >70% Neon quota → migrate phase 2.

## 15. Implementation milestones (preview, sẽ chi tiết hoá ở implementation plan)

1. Repo + monorepo + Drizzle schema + migrations + Docker postgres dev
2. Crawler engine + truyenfull adapter + fixture tests
3. Auth.js + admin layout + middleware
4. Admin: sources, story import flow + job UI
5. Reader: list, detail, chapter view, basic SEO + sitemap
6. Search (pg_trgm + unaccent)
7. User accounts: register/login, bookmark, ReadingProgress
8. Comment + rating (có thể defer phase 2)
9. Polish, observability, deploy phase 1
10. (Phase 2) VPS migration via docker compose

## 16. Open items / future work (out of scope phase 1)

- Auto sync chapter mới định kỳ (cron job per story)
- Multi-source automatic fallback (matching chapter giữa source A và B)
- Reading streaks, badges, recommendations
- Mobile app (PWA cũng đủ phase 1)
- Audio TTS
- Admin promote/demote UI
- Comment moderation queue UI
