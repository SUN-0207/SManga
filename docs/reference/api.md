# API Reference

All REST endpoints exposed by `apps/api`. The global prefix is `/api` and all versioned routes use `/api/v1/`. A handful of SEO routes are version-neutral (no prefix).

Live interactive documentation: **`http://localhost:3001/api/docs`** (Swagger UI, available in all environments).

Auth legend:
- **Public** — no token required
- **Optional JWT** — returns richer data when a JWT cookie is present, but does not reject unauthenticated requests
- **JWT** — valid `jwt` httpOnly cookie required
- **Admin** — JWT + `role = admin`

---

## Auth (`/api/v1/auth`)

Source: `apps/api/src/modules/auth/auth.controller.ts`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Public | Register a new user account |
| `POST` | `/api/v1/auth/login` | Public | Authenticate with email + password; sets `jwt` httpOnly cookie (14-day). Rate-limited: 5 requests / 60 s per IP. |
| `POST` | `/api/v1/auth/logout` | Public | Clear the `jwt` cookie |
| `GET` | `/api/v1/auth/me` | JWT | Return the authenticated user's profile |
| `PATCH` | `/api/v1/auth/me` | JWT | Update name / display settings |
| `POST` | `/api/v1/auth/change-password` | JWT | Change password (requires current password) |
| `GET` | `/api/v1/auth/providers` | Public | List enabled OAuth providers (e.g. `{ google: true }`) |
| `GET` | `/api/v1/auth/google` | Public | Begin Google OAuth flow |
| `GET` | `/api/v1/auth/google/callback` | Public | Google OAuth callback; sets cookie and redirects to frontend |

---

## Stories (`/api/v1/stories`)

Source: `apps/api/src/modules/stories/stories.controller.ts`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/stories` | Public | Paginated story list. Query params: `page`, `limit` (default 48, max 100), `genre`, `featured`, `discoveryStatus` (`complete` or `stub`), `author`, `q` (search), `crawlState` (`needs-crawl` or `has-errors`). Cache: `public, s-maxage=300, stale-while-revalidate=600`. |
| `GET` | `/api/v1/stories/count` | Public | Count matching stories. Accepts only `genre`, `discoveryStatus` (`complete` or `stub`), `q`, `crawlState` (not `page`/`limit`/`featured`/`author`). |
| `GET` | `/api/v1/stories/counts` | Public | Aggregate counts (`{ all, full, stub, needsCrawl, hasErrors }`, admin dashboard). Accepts an optional `q` filter. |
| `GET` | `/api/v1/stories/storage-stats` | Public | Storage breakdown (bytea sizes) |
| `GET` | `/api/v1/stories/by-slug/:slug` | Public | Story detail by URL slug. Cache: `public, s-maxage=300, stale-while-revalidate=600`. |
| `GET` | `/api/v1/stories/by-slug/:slug/chapters/all` | Public | All chapters for a story (flat list). Cache: `public, s-maxage=300, stale-while-revalidate=600`. |
| `GET` | `/api/v1/stories/by-slug/:slug/chapters` | Public | Paginated chapter list. Query: `page`, `pageSize` (default 50). Cache: `public, s-maxage=300, stale-while-revalidate=600`. |
| `GET` | `/api/v1/stories/:id` | Admin | Story detail by UUID (admin view) |
| `GET` | `/api/v1/stories/:id/chapters` | Admin | Paginated chapters for a story by UUID |
| `POST` | `/api/v1/stories/import` | Admin | Enqueue import of a single story URL |
| `POST` | `/api/v1/stories/import-bulk` | Admin | Enqueue bulk metadata import (up to 50 URLs). Body: `{ urls, autoCrawl? }` |
| `POST` | `/api/v1/stories/:id/discover` | Admin | Trigger chapter-list discovery for a stub story |
| `POST` | `/api/v1/stories/bulk-action` | Admin | Bulk discover/crawl for up to 100 story IDs. Body: `{ ids, action }` |
| `PATCH` | `/api/v1/stories/:id/auto-refresh` | Admin | Toggle per-story scheduled refresh. Body: `{ autoRefresh: boolean }` |
| `PATCH` | `/api/v1/stories/:id/featured` | Admin | Toggle featured flag. Body: `{ featured: boolean }` |

---

## Chapters (`/api/v1/chapters`)

Source: `apps/api/src/modules/chapters/chapters.controller.ts`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/chapters/by-slug/:slug/:index` | Public | Chapter content by story slug + chapter index. Server-side gunzips `content_text`. Cache: `public, s-maxage=86400, stale-while-revalidate=3600`. |
| `POST` | `/api/v1/chapters/crawl/:storyId` | Admin | Enqueue chapter crawl jobs for a story |

---

## Covers (`/api/v1/cover`)

Source: `apps/api/src/modules/covers/covers.controller.ts`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/cover/:storyId` | Public | Serve story cover image from `story.cover` bytea. Returns ETag + `Cache-Control: public, max-age=31536000, immutable`. Supports `If-None-Match` (304). |

---

## Sources (`/api/v1/sources`)

Source: `apps/api/src/modules/sources/sources.controller.ts`

All endpoints require Admin auth.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/sources` | List all crawl sources |
| `POST` | `/api/v1/sources` | Create a new source |
| `PATCH` | `/api/v1/sources/:id` | Update a source |
| `DELETE` | `/api/v1/sources/:id` | Remove a source |
| `GET` | `/api/v1/sources/:id/feeds` | List available feeds for a source |
| `GET` | `/api/v1/sources/:id/discover` | Browse/search source catalog. Query: `feed`, `page`, `q` |
| `POST` | `/api/v1/sources/:id/discover-all` | Enqueue full-feed import. Returns 202 with `{ jobId }`. Body: `{ feed, autoCrawl? }` |

---

## Genres (`/api/v1/genres`)

Source: `apps/api/src/modules/genres/genres.controller.ts`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/genres` | Public | List all genres |

---

## Search (`/api/v1/search`)

Source: `apps/api/src/modules/search/search.controller.ts`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/search` | Public | Full-text search using `pg_trgm` + `immutable_unaccent`. Query params via `SearchQueryDto`. |

---

## Jobs (`/api/v1/jobs`)

Source: `apps/api/src/modules/jobs/jobs.controller.ts`

All endpoints require Admin auth.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/jobs/stats` | Bull queue stats. `?fresh=true` bypasses 30 s server cache. |
| `GET` | `/api/v1/jobs` | List active/recent jobs |
| `POST` | `/api/v1/jobs/:id/retry` | Retry a specific Bull job by ID |
| `POST` | `/api/v1/jobs/retry-failed` | Retry all failed Bull jobs |
| `POST` | `/api/v1/jobs/refetch-all-chapters` | Re-enqueue crawl for all `crawled` chapters (202 Accepted) |
| `POST` | `/api/v1/jobs/backfill-covers` | Enqueue cover re-download for stub stories (202 Accepted) |
| `GET` | `/api/v1/jobs/dead-letter` | List dead-letter queue entries. Query: `page`, `pageSize`. |
| `POST` | `/api/v1/jobs/dead-letter/retry-all` | Re-enqueue all retryable dead-letter rows (202 Accepted) |
| `POST` | `/api/v1/jobs/dead-letter/:id/retry-now` | Immediately re-enqueue one dead-letter entry |
| `POST` | `/api/v1/jobs/dead-letter/:id/dismiss` | Mark a dead-letter entry as dismissed |

---

## Comments (`/api/v1/comments`)

Source: `apps/api/src/modules/comments/comments.controller.ts`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/comments` | Optional JWT | List comments. Query: `targetType`, `targetId`, `page`, `limit` (max 50). |
| `POST` | `/api/v1/comments` | JWT | Create a comment. Body: `{ targetType, targetId, parentId?, body }`. Rate-limited: 10 / hour. |
| `PATCH` | `/api/v1/comments/:id` | JWT | Edit a comment body. Rate-limited: 20 / hour. |
| `DELETE` | `/api/v1/comments/:id` | JWT | Soft-delete a comment (sets `deleted_at`). Admins can delete any comment. |
| `POST` | `/api/v1/comments/:id/react` | JWT | Toggle like reaction. Rate-limited: 30 / hour. |

---

## Ratings (`/api/v1/ratings`)

Source: `apps/api/src/modules/engagement/ratings.controller.ts`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/ratings/story/:storyId` | Optional JWT | Get rating aggregate + current user's rating |
| `PUT` | `/api/v1/ratings/story/:storyId` | JWT | Upsert rating (1–5). Body: `{ value }`. |
| `DELETE` | `/api/v1/ratings/story/:storyId` | JWT | Remove user's rating |

---

## Views (`/api/v1/views`)

Source: `apps/api/src/modules/engagement/views.controller.ts`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/views/story/:storyId` | Public | Increment story view count (204). Rate-limited: 30 / min. |
| `POST` | `/api/v1/views/chapter/:chapterId` | Public | Increment chapter view count (204). Rate-limited: 30 / min. |

---

## Rankings (`/api/v1/rankings`)

Source: `apps/api/src/modules/rankings/rankings.controller.ts`

All public. Rate-limited: 60 / min.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/rankings/hot` | Top 50 by weekly unique readers. Query: `limit` (max 50). |
| `GET` | `/api/v1/rankings/views` | Paginated by all-time `view_count` DESC. Query: `page`, `limit`. |
| `GET` | `/api/v1/rankings/rating` | Paginated by average rating DESC (min 3 ratings). Query: `page`, `limit`. |
| `GET` | `/api/v1/rankings/completed` | Paginated completed stories by `updated_at` DESC. Query: `page`, `limit`. |

---

## Recommendations (`/api/v1/recommendations`, `/api/v1/me/recommendations`)

Source: `apps/api/src/modules/recommendations/recommendations.controller.ts`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/recommendations/similar` | Public | Stories similar to a given story. Query: `storyId`, `limit` (default 8). |
| `GET` | `/api/v1/me/recommendations` | JWT | Personalized "For You" recommendations. Query: `limit` (default 8). |

---

## User data (`/api/v1/me/...`)

### Bookmarks

Source: `apps/api/src/modules/user-data/bookmarks.controller.ts`

All require JWT.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/me/bookmarks` | List bookmarked stories |
| `GET` | `/api/v1/me/bookmarks/:storyId` | Check if story is bookmarked |
| `POST` | `/api/v1/me/bookmarks` | Add bookmark. Body: `{ storyId }`. |
| `DELETE` | `/api/v1/me/bookmarks/:storyId` | Remove bookmark |

### Reading Progress

Source: `apps/api/src/modules/user-data/reading-progress.controller.ts`

All require JWT.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/me/reading-progress` | List reading progress for all in-progress stories |
| `GET` | `/api/v1/me/reading-progress/continue-reading` | Most recent in-progress story (204 if none) |
| `PUT` | `/api/v1/me/reading-progress` | Upsert progress. Body: `{ storyId, chapterIndex }`. |
| `POST` | `/api/v1/me/reading-progress/session` | Accumulate reading session time (204). Rate-limited: 120 / min. |

### Reading Stats

Source: `apps/api/src/modules/user-data/stats.controller.ts`

All require JWT.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/me/stats` | Reading statistics for the authenticated user |
| `GET` | `/api/v1/me/stats/reading-speed` | Estimated words per minute (heuristic) |
| `GET` | `/api/v1/me/stats/reading-eta` | Estimated minutes to finish a story. Query: `storyId`. |

---

## Notifications (`/api/v1/me/notifications`)

Source: `apps/api/src/modules/comments/notifications.controller.ts`

All require JWT.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/me/notifications` | List notifications. Query: `unreadOnly` (default `false`), `limit` (max 100, default 30). |
| `POST` | `/api/v1/me/notifications/read` | Mark notifications as read. Body: `{ ids?: string[] }` (omit to mark all). |

---

## Admin: Users (`/api/v1/admin/users`)

Source: `apps/api/src/modules/users/users.controller.ts`

All require Admin auth.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/admin/users` | Paginated user list. Query: `page`, `limit`, `q`. |
| `GET` | `/api/v1/admin/users/:id` | User detail |
| `PATCH` | `/api/v1/admin/users/:id/role` | Update user role. Body: `{ role }`. |
| `DELETE` | `/api/v1/admin/users/:id` | Delete user |

---

## Admin: Settings (`/api/v1/admin/settings/...`)

### Auto-refresh

Source: `apps/api/src/modules/app-settings/app-settings.controller.ts`

All require Admin auth.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/admin/settings/auto-refresh` | Get auto-refresh configuration |
| `PATCH` | `/api/v1/admin/settings/auto-refresh` | Update auto-refresh settings |
| `POST` | `/api/v1/admin/settings/auto-refresh/run-now` | Trigger an immediate auto-refresh run (202 Accepted) |

### Auto-crawl

Source: `apps/api/src/modules/app-settings/auto-crawl.controller.ts`

All require Admin auth.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/admin/settings/auto-crawl` | Get smart backlog drainer config |
| `PATCH` | `/api/v1/admin/settings/auto-crawl` | Enable/disable drainer and set watermark. Body: `{ enabled, watermark }`. |

### Auto-retry

Source: `apps/api/src/modules/app-settings/auto-retry.controller.ts`

All require Admin auth.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/admin/settings/auto-retry` | Get dead-letter reconciler config |
| `PATCH` | `/api/v1/admin/settings/auto-retry` | Enable/disable reconciler. Body: `{ enabled }`. |

---

## Health (`/api/v1/health`)

Source: `apps/api/src/modules/health/health.controller.ts`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | DB ping + uptime. Returns `{ status: 'ok'|'degraded', db: boolean, uptime, timestamp }`. |

---

## SEO routes (version-neutral, no `/api/v1/` prefix)

Source: `apps/api/src/modules/seo/seo.controller.ts`

These routes are excluded from the global `/api` prefix so crawlers find them at the expected paths.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/sitemap.xml` | Public | Sitemap index. Cache: `public, max-age=86400, stale-while-revalidate=3600`. |
| `GET` | `/sitemap-stories.xml` | Public | Stories sitemap shard |
| `GET` | `/sitemap-chapters-:n.xml` | Public | Chapter sitemap shard N (sharded; N ≥ 1) |
| `GET` | `/sitemap-chapters.xml` | Public | Legacy alias → redirects to `sitemap-chapters-1.xml` |
| `GET` | `/robots.txt` | Public | Robots directives. Cache: `public, max-age=86400, stale-while-revalidate=3600`. |
