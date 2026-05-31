# SManga Rankings — Spec

**Date:** 2026-05-31
**Depends on:** Plan A (tokens), Plan D (engagement: views + ratings — supplies the metric data)
**Spec type:** Feature add (no schema migration)

## Why this exists

After Plan D shipped engagement signals (view counts + 1–5 star ratings), the data exists but is not surfaced as a discovery aid. Power readers want a top-list view: "What's hot this week? Highest rated? Already complete so I can binge?" A dedicated rankings page (plus a compact teaser on the home page) makes the signal actionable for discovery without forcing users into search.

Scope is intentionally story-only (no user leaderboard) to keep the surface small. User leaderboard / activity ranks could come later in a separate spec.

## Decisions (locked from brainstorming)

| Topic | Decision |
|---|---|
| Rank target | **Stories only** (no user leaderboard) |
| Dimensions | **Hot tuần này**, **Lượt xem (all-time)**, **Điểm đánh giá cao**, **Mới hoàn thành** — 4 tabs |
| Time windows | Hot = last 7 days; others all-time |
| Min rating count for "Rating" tab | `rating_count >= 3` (filter out single-vote skew) |
| Display surfaces | Dedicated `/bang-xep-hang` (top 50, paginated where applicable) **AND** home Top-10 section with tab switcher |
| Caching | FE React Query `staleTime: 5 * 60_000`; no BE Redis layer in MVP |
| Auth | Public — no login required to view rankings |
| Schema | **No new tables / migration** — all queries from existing `story`, `reading_progress`, `rating` data |
| Sort tie-break | Metric DESC, `updated_at` DESC, `id` ASC (deterministic) |
| Top 3 visual treatment | Rank number renders in pink gradient (`bg-clip-text`) |

## Data layer (queries)

All queries live in a new `apps/api/src/modules/rankings/` module. No DB changes.

### 1. Hot tuần này

```sql
SELECT
  s.id, s.slug, s.title, s.author, s.status, s.total_chapters, s.view_count,
  (s.cover IS NOT NULL) AS has_cover, s.updated_at,
  COUNT(DISTINCT rp.user_id) AS weekly_readers
FROM story s
INNER JOIN reading_progress rp ON rp.story_id = s.id
WHERE rp.updated_at > now() - INTERVAL '7 days'
GROUP BY s.id
ORDER BY weekly_readers DESC, s.updated_at DESC, s.id ASC
LIMIT 50
```

Returns `metric = weeklyReaders` (number). Empty result when nothing read in last 7 days → FE shows EmptyState.

### 2. Lượt xem (all-time)

```sql
SELECT s.id, ..., s.view_count AS metric
FROM story s
LEFT JOIN (
  SELECT story_id, avg(value)::numeric(3,2) AS avg, count(*)::int AS cnt
  FROM rating GROUP BY story_id
) r ON r.story_id = s.id
ORDER BY s.view_count DESC, s.updated_at DESC, s.id ASC
LIMIT $limit OFFSET ($page - 1) * $limit
```

Returns `metric = viewCount`. Includes rating aggregate for the badge.

### 3. Điểm đánh giá cao

```sql
SELECT s.id, ..., r.avg AS metric, r.cnt AS rating_count
FROM story s
INNER JOIN (
  SELECT story_id, avg(value)::numeric(3,2) AS avg, count(*)::int AS cnt
  FROM rating
  GROUP BY story_id
  HAVING count(*) >= 3
) r ON r.story_id = s.id
ORDER BY r.avg DESC, r.cnt DESC, s.id ASC
LIMIT $limit OFFSET ($page - 1) * $limit
```

Returns `metric = ratingAvg` (number 1–5). Tie-break on `cnt` so a 4.9-with-100 ranks above a 4.9-with-3.

### 4. Mới hoàn thành

```sql
SELECT s.id, ..., s.total_chapters AS metric
FROM story s
LEFT JOIN (rating aggregate as above) r ON r.story_id = s.id
WHERE s.status = 'completed'
ORDER BY s.updated_at DESC, s.id ASC
LIMIT $limit OFFSET ($page - 1) * $limit
```

Returns `metric = totalChapters` (so the badge can read "1600 chương"). The "newest completed" semantics come from sorting by `updated_at`.

## API surface

All endpoints under `/api/v1/rankings/`. Public, no auth.

| Method | Path | Query | Response |
|---|---|---|---|
| `GET` | `/rankings/hot` | `limit?` (default 50, max 50) | `{ items, page: 1, limit, total }` (no pagination — top 50 fixed) |
| `GET` | `/rankings/views` | `page?` (default 1), `limit?` (default 50) | `{ items, page, limit, total }` |
| `GET` | `/rankings/rating` | `page?`, `limit?` | `{ items, page, limit, total }` |
| `GET` | `/rankings/completed` | `page?`, `limit?` | `{ items, page, limit, total }` |

`total` for `views` and `completed` = `COUNT(*) FROM story [WHERE status='completed']` — cheap. `total` for `rating` = `COUNT(*) FROM (subquery with HAVING count >= 3)`. `total` for `hot` = items.length (top 50 cap).

### `RankItem` response shape

```ts
type RankItem = {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  status: 'ongoing' | 'completed' | 'dropped' | 'unknown';
  totalChapters: number;
  hasCover: boolean;
  updatedAt: string;
  viewCount: number;
  ratingAvg: number | null;
  ratingCount: number;
  // ranking-specific:
  rank: number;          // 1-based position in this response (1..50)
  metric: number;        // the sorted value: weeklyReaders / viewCount / ratingAvg / totalChapters
};
```

BE assigns `rank` server-side as `1 + offset + index` so the FE never has to guess.

### Caching

- **FE**: TanStack Query `staleTime: 5 * 60_000`. Stale-while-revalidate so tab switches feel instant.
- **BE**: No Redis cache MVP. Postgres handles all 4 queries in < 50 ms at hobby scale (< 10k stories, < 1M reading_progress rows). Add a Redis wrapper if scale demands.

## Frontend integration

### New files

```
apps/frontend/src/
  api/rankings.ts                         # FE client: 4 typed functions matching BE endpoints
  components/rankings/
    RankList.tsx                          # The 1..50 list. Props: items, metricFormatter, isLoading
    RankRow.tsx                           # Single row: rank # + cover + title + author + metric badge
    RankTabs.tsx                          # 4-tab nav synced to URL ?tab=
    HomeRankingsSection.tsx               # Compact top-10 for home page (uses same RankRow)
  routes/
    bang-xep-hang.tsx                     # Dedicated full-page route
```

### Surface 1 — `/bang-xep-hang` (full page)

```
DUYỆT
Bảng xếp hạng                                                  [info icon, tooltip "cập nhật mỗi 5 phút"]

[Hot tuần] [Lượt xem] [Rating] [Mới hoàn thành]     ← pink-gradient underline on active

#1   [cover]  Hành Trình Nhận Cáo Mệnh...            Tam Dương Thái Lai
              1.6k chương · Đang ra                  [24 người đọc tuần này]
#2   ...
...
#50  ...

[Trang trước]  Trang 1 / N  [Trang sau]   ← Pagination component (only for views/rating/completed)
```

Tokens:
- Rank #: `text-display-sm tabular-nums text-fg-subtle font-prose` (mảnh, không cạnh tranh title); width ~48 px column
- Top 3 ranks: same size but `bg-accent-gradient bg-clip-text text-transparent` (signature touch)
- Row: `border-b border-border/60 hover:bg-bg-subtle/60 cursor-pointer`; row is a `<Link to="/truyen/$slug">`
- Cover thumbnail: 56×80 px desktop, 48×64 px mobile, `rounded-md border border-border`
- Title: `font-prose font-semibold line-clamp-2 text-fg`
- Author + status meta: `text-body-sm text-fg-muted`
- Metric badge: `text-body-sm font-semibold text-fg` with leading Lucide icon (Flame / Eye / Star / BookOpen)

URL state:
- `?tab=hot|views|rating|completed` (default `hot`); `validateSearch` clamps invalid values
- `?page=N` (default 1); only honored for views/rating/completed
- Tab Hot ignores `?page=` (fixed top 50)

### Surface 2 — Home `HomeRankingsSection` (top-10 teaser)

Mounted in `apps/frontend/src/routes/index.tsx` between `LoggedInHero` and `UpdatedSection`.

```
NỔI BẬT
Bảng xếp hạng                                                  Xem tất cả →

[Hot tuần] [Lượt xem] [Rating] [Mới hoàn thành]

┌────────────────────────────┐ ┌────────────────────────────┐
│ #1 [cover] Title           │ │ #2 [cover] Title           │
│            metric · status │ │            metric · status │
└────────────────────────────┘ └────────────────────────────┘
... (5 rows × 2 cols = 10 items desktop; 1 col × 10 mobile)
```

- Grid: `grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3`
- "Xem tất cả →" link preserves current `tab` so the full page opens on the same metric
- Reuses `RankRow` with `compact: true` prop (smaller cover, single-line title)

### Metric formatters (per-tab)

```ts
const formatters: Record<RankTab, (item: RankItem) => { icon: LucideIcon; text: string }> = {
  hot:       (i) => ({ icon: Flame,    text: `${i.metric.toLocaleString('vi-VN')} người đọc tuần này` }),
  views:     (i) => ({ icon: Eye,      text: `${formatCompact(i.metric)} lượt xem` }),
  rating:    (i) => ({ icon: Star,     text: `${i.metric.toFixed(1)} · ${i.ratingCount} đánh giá` }),
  completed: (i) => ({ icon: BookOpen, text: `${i.metric.toLocaleString('vi-VN')} chương` }),
};
```

`formatCompact` is the existing helper in `ViewCount.tsx` (k/tr).

### Tab component

`RankTabs` reads `?tab=` from URL search params via `Route.useSearch()`. Renders 4 buttons; active button gets `bg-fg text-bg` + pink-gradient underline (mirror `/tu-sach` `ShelfTab` styling). Click → `Route.useNavigate({ search: { ...prev, tab: clicked, page: 1 } })`.

For the home `HomeRankingsSection`, the tab state lives in component local `useState` (not URL) because home has many sections and we don't want URL clutter. Clicking "Xem tất cả →" passes the current local tab via `to="/bang-xep-hang"` + `search={{ tab: localActive, page: 1 }}`.

## Edge cases

| Case | Handling |
|---|---|
| Hot 0 hoạt động trong 7 ngày | EmptyState "Tuần này chưa có hoạt động — hãy là người đầu tiên đọc!" + CTA → /kham-pha |
| Rating: < 3 truyện đủ điều kiện | Render those rows + footer hint "Chỉ hiển thị truyện có ≥ 3 đánh giá" |
| Tied metric values | Tie-break per query: metric DESC, `updated_at` DESC, `id` ASC (deterministic) |
| Story deleted mid-fetch | Next refetch drops the row; FE shows cached items until staleTime then re-queries |
| Invalid `?tab=foo` | `validateSearch` clamps to `'hot'` default |
| `?page=N` exceeds totalPages | BE returns empty items + correct total; FE clamps display to last valid page or shows "Đã hết kết quả" |
| Anonymous user | All endpoints public — render normally, no login gate |
| Mobile portrait (< 640 px) | 1-col list, smaller cover (48×64), metric on its own line, rank # column 36 px |
| Top 3 gradient contrast on dark theme | AC-7 verifies both themes; fallback to `text-accent` solid if gradient is invisible |
| Bot crawler | Public data — accepted; rate-limit `@Throttle({default:{limit:60, ttl:60_000}})` on /rankings/* to prevent abuse |
| Page-load delay on Hot due to large reading_progress | Acceptable up to 100 ms p95; if it grows, add covering index `(story_id, updated_at)` on reading_progress |

## Acceptance criteria

1. `GET /api/v1/rankings/hot` returns top 50 stories ordered by `COUNT(DISTINCT user_id)` from `reading_progress` rows with `updated_at > now() - 7 days`; each item has `rank: 1..50` and `metric: weeklyReaders`.
2. `GET /api/v1/rankings/views` returns top 50 (paginated) ordered by `story.view_count DESC` with tie-break; each item has `metric: viewCount`.
3. `GET /api/v1/rankings/rating` returns top 50 (paginated) ordered by `rating_avg DESC` with `HAVING count(*) >= 3`; each item has `metric: ratingAvg` (number 1.00–5.00) and `ratingCount: number`.
4. `GET /api/v1/rankings/completed` returns top 50 (paginated) ordered by `s.updated_at DESC` filtered to `status='completed'`; each item has `metric: totalChapters`.
5. All 4 responses have shape `{ items: RankItem[], page, limit, total }`; `total` is correct for each tab's filter.
6. `/bang-xep-hang?tab=views&page=2` route opens with Views tab active showing items 51..100 (when total ≥ 51).
7. RankRow renders rank # in `text-display-sm`; top 3 ranks use `bg-accent-gradient bg-clip-text` gradient.
8. Click any RankRow navigates to `/truyen/$slug`.
9. Tab switch on dedicated page updates URL `?tab=` AND re-fetches data; cache hit on previously-loaded tab is instant (< 50 ms).
10. Home `HomeRankingsSection` shows top 10 of currently-selected local tab; "Xem tất cả →" link opens `/bang-xep-hang?tab={local}&page=1`.
11. Pagination component renders only on views/rating/completed tabs; Hot tab does not paginate.
12. Hot tab with 0 results shows EmptyState with the spec copy and a CTA to `/kham-pha`.
13. Rating tab with < 3 qualifying stories shows footer hint about the threshold.
14. Mobile viewport (< 640 px) renders 1-col list with reduced cover size; rank number scales down.
15. Both `pnpm --filter @smanga/api typecheck` and `pnpm --filter @smanga/frontend typecheck` pass.
16. Each endpoint returns in < 100 ms p95 on local dev DB with 55+ stories and 100+ reading_progress rows.
17. Top 3 gradient ranks have sufficient contrast in both light and dark themes (visual smoke check, not automated).

## Out of scope

- Time window selector (week/month/all-time) on Hot or Views — only fixed defaults in MVP
- User leaderboard / personal activity rankings — defer to separate spec
- Yearly retrospective / "your year in reading" — defer
- Notification when a bookmarked story enters top 10 — needs notification infra
- Server-side Redis caching of rankings — defer until measurable load
- Weighted decay or anti-spam ranking algorithm — out of scope; raw counts
- Genre-filtered rankings ("top huyền huyễn this week") — defer
- "By author" rankings — out of scope
- RSS feed of rankings — out of scope

## Risks + mitigations

- **Risk**: Hot endpoint scans `reading_progress` on every cache miss. **Mitigation**: PK index on `(user_id, story_id)` plus the time filter; query is bounded by 7-day rows at hobby scale. Re-check with `EXPLAIN ANALYZE` if rows > 1M.
- **Risk**: Rating tab favors lucky early stories (5.0 with exactly 3 votes). **Mitigation**: min threshold + `rating_count` shown in badge so users self-judge confidence. Threshold tunable later.
- **Risk**: Top-3 pink-gradient text washes out on dark theme. **Mitigation**: AC-17 verifies both themes; fallback in component code: `dark:bg-none dark:text-accent` if visual fails.
- **Risk**: Concurrent ranking + writes during heavy crawler load. **Mitigation**: queries are read-only and short; row-level isolation default fine. No write contention.
- **Risk**: User confusion if home tab state ≠ dedicated page tab. **Mitigation**: "Xem tất cả →" link explicitly forwards local tab to URL `?tab=` so context preserves.

## Migration phases (within this spec)

1. **Phase R1** — BE: `rankings.module` + `rankings.service` (4 query methods) + `rankings.controller` (4 endpoints) + DTOs. Register in `app.module.ts`. No DB migration.
2. **Phase R2** — FE primitives: `api/rankings.ts` client + `RankRow.tsx` + `RankList.tsx` + `RankTabs.tsx`.
3. **Phase R3** — Routes + integration: `/bang-xep-hang` page wires tabs + list + pagination; `HomeRankingsSection` mounted into `routes/index.tsx`.

Each phase = own commit set + local verify (typecheck + curl/browser smoke). **Push only when user explicitly says push.**
