# Admin & Moderation

> **Explanation** — the operator-facing flows: managing sources, importing and
> crawling stories, the crawl-state filters, bulk actions, the dead-letter
> panel, comment moderation, and the runtime app-settings toggles. Backend code
> is in `apps/api/src/modules/{sources,stories,jobs,comments,app-settings}/*`;
> the UI lives under `apps/frontend/src/routes/admin/*`. All admin endpoints are
> guarded by `JwtAuthGuard` + `@Roles(['admin'])`. For the full endpoint list
> see [`../reference/api.md`](../reference/api.md).

SManga has a single operator (the owner). Everything below requires the `admin`
role on the `user` row; bootstrap is in `CLAUDE.md`
("Bootstrap admin user") and in [`../../ONBOARDING.md`](../../ONBOARDING.md).

## Sources

`SourcesController` (`sources.controller.ts`, route `sources`, admin-only) is the
CRUD + browse surface over the `source` table and the registered adapters:

- `GET /sources`, `POST`, `PATCH /:id`, `DELETE /:id` — manage source rows
  (name, base URL, `rate_limit_rps`, `is_active`).
- `GET /:id/feeds` — list the adapter's catalog feeds (for truyenfull: `newest`,
  `hot`, `completed`).
- `GET /:id/discover?feed&page&q` — browse a catalog feed (or search via `q`);
  each returned stub is annotated with `existingStoryId` /
  `existingDiscoveryStatus` so the UI shows "already imported" badges
  (`browseCatalog`/`searchCatalog` in the engine). UI: `admin/sources/$id.discover.tsx`.
- `POST /:id/discover-all` — fan out a full-feed import (returns **202**, or
  **409** if the same `(sourceId, feedId)` job is already active).

## Stories: import, discover, crawl

`StoriesController` (`stories.controller.ts`, route `stories`) mixes public read
endpoints with admin write endpoints. The admin write surface:

- `POST /import` — single-URL import; `POST /import-bulk` — up to 50 URLs,
  optional `autoCrawl`.
- `POST /:id/discover` — trigger chapter-list discovery for a metadata stub
  (idempotent per-story Bull jobId).
- `POST /bulk-action` — apply one action to up to 100 selected story rows.
- `PATCH /:id/auto-refresh` — per-story opt-out from scheduled refresh
  (`story.auto_refresh`).
- `PATCH /:id/featured` — toggle homepage featuring (`story.featured`).

These map onto the two-step discovery + autoCrawl chain documented in
[`crawling-and-discovery.md`](./crawling-and-discovery.md). UI:
`admin/stories/index.tsx` (list + filters + bulk bar) and
`admin/stories/$id.tsx` (detail).

### Crawl-state filters: needs-crawl vs has-errors

The story list (`GET /stories?...&crawlState=` and the count endpoints) splits
"work remaining" into two **mutually exclusive** buckets, both implemented in
`StoriesService` (`stories.service.ts`) and both probing the partial index
`chapter_needs_crawl_idx`:

- **`needs-crawl`** — `discovery_status = 'complete'` AND has ≥1 `pending`
  chapter AND **no** `failed` chapter (errors deliberately excluded).
- **`has-errors`** ("Lỗi crawl") — `discovery_status = 'complete'` AND has ≥1
  `failed` chapter.

Splitting these lets the operator separate "just hasn't been crawled yet" from
"crawled and broke", and `StoriesService.counts` returns all the filter-pill
totals (`all`, `full`, `stub`, `needsCrawl`, `hasErrors`) in a single pass per
keystroke.

### Bulk actions

`BulkActionDto` (`stories/dto/bulk-action.dto.ts`) accepts one of four actions
over the selected story ids:

| Action | Effect |
|---|---|
| `discover` | Enqueue chapter-list discovery for each story |
| `crawl-missing` | Enqueue `fetch-chapter` for every `pending` **and** `failed` chapter |
| `crawl-failed` | Enqueue `fetch-chapter` for **only** `failed` chapters — re-crawl just the errors (pairs with the "has-errors" filter / "Chỉ crawl lỗi") |
| `discover-and-crawl` | Discover then crawl |

The `crawl-failed` action is the failed-only counterpart of the `has-errors`
crawl-state filter — select the broken stories, re-crawl only what failed.

## Jobs & dead-letter panel

`JobsController` (`jobs.controller.ts`, route `jobs`, admin-only) surfaces the
Bull queue and the Postgres dead-letter table:

- `GET /jobs/stats?fresh` — queue/state counters (30s server cache; `?fresh=true`
  bypasses it for the "Làm mới" button).
- `GET /jobs` — recent jobs; `POST /jobs/:id/retry`, `POST /jobs/retry-failed` —
  retry one / all failed Bull jobs.
- `POST /jobs/refetch-all-chapters` — one-click re-crawl of every `crawled`
  chapter (**202**, drains over hours).
- `POST /jobs/backfill-covers` — fan out an import per stub with a NULL cover so
  the engine's heal path re-downloads it (**202**).
- **Dead-letter** (over `job_failure`): `GET /jobs/dead-letter` (paginated),
  `POST /jobs/dead-letter/retry-all` (re-arm all, **202**),
  `POST /jobs/dead-letter/:id/retry-now`, `POST /jobs/dead-letter/:id/dismiss`.

The dead-letter panel is the operator window into the retry brain described in
[`crawling-and-discovery.md`](./crawling-and-discovery.md): rows in
`needs_attention` (permanent failures — changed DOM, VIP-locked, 4xx) and `dead`
(exhausted 5 retry generations) are the ones that want a human. "Retry now"
re-enqueues immediately; "dismiss" resolves the row without re-crawling. UI:
`admin/jobs.tsx`.

## Comment moderation

Operators moderate within the same comment system readers use
(`CommentsController`, see [`reading-and-engagement.md`](./reading-and-engagement.md)).
The moderation lever is in `CommentsService.deleteComment`: an `admin` may
soft-delete **any** comment (regular users only their own). Soft delete sets
`deleted_at` and hides the body while keeping the thread structure intact.

## App settings (runtime toggles)

Three operator-tunable policies live in the single-row `app_setting` table and
are changed live (no redeploy) from `/admin/settings`
(`apps/frontend/src/routes/admin/settings.tsx`):

| Policy | Endpoint(s) | Fields | Default |
|---|---|---|---|
| **Scheduled refresh** | `admin/settings/auto-refresh` (GET/PATCH/run-now) | `auto_refresh_enabled`, `auto_refresh_cron`, `auto_refresh_scope` (`ongoing`/`all`), `auto_refresh_concurrency` | OFF, `0 2 * * *`, `ongoing`, 5 |
| **Auto-retry reconciler** | `admin/settings/auto-retry` (GET/PATCH; PATCH body `{ enabled }`) | `auto_retry_enabled` — kill switch for the dead-letter retry reconciler | **ON** |
| **Smart auto-crawl drainer** | `admin/settings/auto-crawl` (GET/PATCH) | `auto_crawl_enabled`, `auto_crawl_watermark` (clamped `[50, 2000]`) | OFF, 500 |

- The **auto-crawl** toggle drives the backlog drainer
  ([`crawling-and-discovery.md`](./crawling-and-discovery.md)); it is **OFF by
  default** and the operator must flip it on to start draining. `setAutoCrawl`
  takes `{ enabled, watermark }`.
- The **auto-retry** kill switch lets an operator instantly halt automatic
  re-enqueuing during an incident without touching the Bull registry — the
  reconciler tick simply no-ops while it's off.
- `run-now` (auto-refresh) kicks an immediate scheduled-refresh run (**202**).

These map to the configuration reference at
[`../reference/configuration.md`](../reference/configuration.md) ("`app_setting`
runtime flags").
