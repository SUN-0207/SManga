# Admin Stories — Crawl-State Visibility & Filter — Design Spec

- **Date:** 2026-06-11
- **Status:** Approved (design), pending implementation plan
- **Owner:** son.cu@opswat.com
- **Scope:** `apps/api` stories list + count endpoints, `apps/frontend` `/admin/stories` list page

## 1. Problem

On the admin **Truyện** list (`/admin/stories`), the `CHAPTER` column shows `story.totalChapters` — the *discovered/target* count. It says nothing about how many chapters are actually **crawled** (content fetched) vs still **pending** vs **failed**. So an operator scanning the list cannot tell which stories are fully crawled, which are missing chapters, or which have errors — they must open each story's detail page (`/admin/stories/$id`, which computes the breakdown client-side from the full chapter list). With ~38k stories this is prohibitively slow.

### What already exists (do not rebuild)

- **Filter tabs** (single-select chips): `Tất cả` / `Đã có chapter` (`discoveryStatus='complete'`) / `Chỉ metadata` (`discoveryStatus<>'complete'`). Each has a real DB count pill via `getStoriesCount(genre?, discoveryStatus?, q?)`.
- **Row selection + bulk actions:** checkboxes per row + a floating `BulkActionBar` with **Quét chương** (`discover`), **Crawl missing** (`crawl-missing`), **Quét + Crawl** (`discover-and-crawl`), calling `discoverApi.bulkAction(ids, action)` (cap 100). **Crawl missing re-crawls both `pending` and `failed` chapters** — so the "fix" action for incomplete stories is already built.
- The list query already LEFT JOINs a chapter subquery (aliased `c`) to compute `latestChapterIndex = MAX(chapter.index) WHERE status='crawled'`.

### Data facts

- `chapterStatusEnum = ['pending', 'crawled', 'failed']` (`packages/db/src/schema/enums.ts`).
- `chapter` has `storyId` (FK, indexed via `uniqueIndex('chapter_story_index_uniq').on(storyId, index)`), `status`.
- `story.totalChapters` is a **denormalized** integer (can drift from actual chapter rows).
- `story.discoveryStatus ∈ {pending, running, complete, failed}`.

## 2. Goals / Non-goals

**Goals**
- Show each story's crawl state at a glance on the list (progress + a single status badge).
- Add a filter to surface only stories that **need crawling** (discovered but incomplete or errored), with a count pill.
- Make the existing **Crawl missing** bulk action the one-click fix from that filtered view.

**Non-goals**
- No new bulk action (Crawl missing already exists).
- No denormalized count columns on `story` (computed on the fly — see §6).
- No change to the story detail page or the crawler/discovery write path.
- No rename of the existing `Đã có chapter` / `Chỉ metadata` chips.

## 3. Chosen approach

Compute per-story chapter-status counts **on the fly** by extending the list query's existing chapter subquery, and add an orthogonal `crawlState` filter param. The list is paginated (50/page), so each list response aggregates only ~50 stories' chapters. The new "Cần crawl" count pill uses a bounded `EXISTS` query. No schema change, no write-path changes, no drift risk.

Rejected: **denormalizing** `crawledCount`/`pendingCount`/`failedCount` onto `story` (maintained on every chapter status change). O(1) reads + trivial filter/count, but adds write-path complexity, a migration + backfill, and a fresh drift surface — not justified for a paginated admin page. Revisit only if on-the-fly proves slow at scale.

## 4. Data model & API changes

No DB schema change.

### 4.1 List endpoint (`GET /stories`, `StoriesService.list`)

Extend the existing `c` chapter subquery with status aggregates:

```sql
COUNT(*) FILTER (WHERE status = 'crawled') AS crawled_count,
COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
COUNT(*) FILTER (WHERE status = 'failed')  AS failed_count
```

Add to each response row:

```ts
crawledChapters: number;   // 0 when no chapter rows
pendingChapters: number;
failedChapters: number;
```

(`COALESCE(..., 0)` for stories with no chapter rows — i.e. metadata-only.)

### 4.2 New filter param `crawlState`

Add `crawlState?: 'needs-crawl'` to `ListStoriesDto` (and the count DTO). Semantics:

> `crawlState='needs-crawl'` ⇒ `story.discovery_status = 'complete' AND (c.pending_count + c.failed_count) > 0`

- Applied in the list query as an outer `WHERE` on the joined subquery aggregates.
- **Excludes metadata-only stories** (no chapter rows / discovery not complete) — those need *Quét chương* first, covered by the existing `Chỉ metadata` chip + `Quét + Crawl`.
- `crawlState` is orthogonal to `discoveryStatus`; when the frontend sends `crawlState=needs-crawl` it omits `discoveryStatus` (the filter forces `complete` itself).

### 4.3 Count endpoint (`getStoriesCount`)

Accept `crawlState`. For `needs-crawl`, count via a bounded `EXISTS`:

```sql
SELECT COUNT(*) FROM story s
WHERE s.discovery_status = 'complete'
  AND EXISTS (SELECT 1 FROM chapter ch
              WHERE ch.story_id = s.id AND ch.status IN ('pending','failed'))
  AND <existing q filter>
```

(`q` free-text filter still applies, consistent with the other count pills.)

## 5. UI changes (`apps/frontend/src/routes/admin/stories/index.tsx`)

### 5.1 `CHAPTER` column → progress

Render `crawled/total` where **total = crawledChapters + pendingChapters + failedChapters** (actual rows, self-consistent with the badge). Metadata-only rows (`discoveryStatus !== 'complete'`) keep `—`.

### 5.2 New `CRAWL` column — single priority-ordered badge

Extract a pure helper `crawlBadge(row): { label, tone, icon } | null` so the logic is unit-testable. Priority (first match wins):

| Condition | Badge | Tone |
|---|---|---|
| `discoveryStatus !== 'complete'` | `—` | (none / muted) |
| `failedChapters > 0` | `✕ Lỗi {failed}` | destructive |
| `crawledChapters === 0` | `○ Chưa crawl` | muted |
| `pendingChapters > 0` | `⚠ Thiếu {pending}` | accent/amber |
| otherwise | `✓ Đủ` | positive |

Reuse existing badge classes (the `STATUS_TONE` pattern: `bg-positive/15 text-positive border-positive/30`, `bg-destructive/15 …`, `bg-accent/15 …`, `bg-bg-subtle text-fg-muted …`). Icons from Lucide (no emoji — the `✓✕○⚠` above are illustrative; use `CheckCircle2` / `XCircle` / `Circle` / `AlertTriangle`).

### 5.3 New filter chip

Extend the `Filter` union to `'all' | 'full' | 'stub' | 'needs-crawl'`. Add a 4th `FilterChip`: **`⚠ Cần crawl (N)`** with its own count query (`getStoriesCount(undefined, undefined, qParam, 'needs-crawl')` → drives `crawlState`). Selecting it sets `crawlState='needs-crawl'` (and leaves `discoveryStatus` unset). Add a matching empty-state message in `StoriesEmptyState`.

### 5.4 Workflow (unchanged plumbing)

Click **Cần crawl** → "Chọn tất cả" → **Crawl missing** (existing BulkActionBar). No new button.

## 6. Edge cases & decisions

- **Total denominator** = sum of actual chapter rows by status, not `story.totalChapters` (avoids showing `9/14` when only 12 chapter rows exist due to denorm drift).
- **Both pending and failed present** → badge shows `Lỗi {failed}` (most urgent wins); the `crawled/total` count still conveys overall incompleteness.
- **`needs-crawl` excludes metadata-only** by design.
- **Failed chapters** are now also auto-recovered by the dead-letter reconciler (transient ones); the `Lỗi N` badge still surfaces permanent failures (e.g. ParserError → `needs_attention`) that won't self-heal.
- Stories with `discoveryStatus='complete'` but **zero chapter rows** (edge) → `crawled/total` = `0/0`, badge `✓ Đủ` (nothing to crawl) — acceptable; rare.

## 7. Components / files

| File | Change |
|---|---|
| `apps/api/src/modules/stories/stories.service.ts` | `list`: add FILTER count aggregates to the `c` subquery + map to row; add `crawlState` WHERE. `getStoriesCount` (or count method): handle `crawlState='needs-crawl'` via EXISTS. |
| `apps/api/src/modules/stories/dto/list-stories.dto.ts` (+ count DTO) | add `crawlState?: 'needs-crawl'` (class-validator `@IsIn(['needs-crawl'])`, optional). |
| `apps/api/src/modules/stories/stories.controller.ts` | pass `crawlState` through on list + count. |
| `apps/frontend/src/api/stories.ts` | `listStories` + `getStoriesCount` gain a `crawlState?` arg; row type gains `crawledChapters`/`pendingChapters`/`failedChapters`. |
| `apps/frontend/src/routes/admin/stories/index.tsx` | `Filter` union +`'needs-crawl'`; 4th FilterChip + count query; `CHAPTER` cell → progress; new `CRAWL` column; `crawlBadge` helper; empty-state copy. |
| `apps/frontend/src/.../crawlBadge.ts` (or inline + exported) | pure badge helper, unit-tested. |

**Naming:** English-only identifiers; Vietnamese only in JSX display text.

## 8. Testing

- **`crawlBadge` helper** (frontend vitest, jsdom not required): every branch + priority order — failed-wins-over-pending, `crawled===0`→Chưa, all-crawled→Đủ, stub→null, both-pending-and-failed→Lỗi.
- **API filter** (`needs-crawl`): a story with a pending/failed chapter is included; a fully-crawled story and a metadata-only story are excluded. (Follow the existing stories.service test style; if list uses raw `db.execute` SQL, cover via the count EXISTS path or an integration check.)
- **Manual / Playwright:** seed stories in each state, verify the column, badge, the `Cần crawl` pill count, and that filtering → select-all → Crawl missing enqueues.

## 9. Defaults chosen (change at will)

- Filter value: `crawlState=needs-crawl` (single value for now; could grow to `failed-only` later).
- `needs-crawl` = `discovery complete AND (pending+failed > 0)`.
- Badge priority: Lỗi → Chưa → Thiếu → Đủ.
- Counts computed on the fly (no denormalization).

## 10. Risks & mitigations

- **List aggregation cost** → bounded by pagination (≤50 stories/page); the `c` subquery already exists, we only add FILTER counts. **Count pill cost** → `EXISTS` short-circuits on `chapter.story_id` index. If slow at 38k scale, add a partial index `chapter(story_id) WHERE status IN ('pending','failed')` or denormalize (deferred, YAGNI).
- **`totalChapters` vs actual rows divergence** → sidestepped by using actual row sums as the denominator.
