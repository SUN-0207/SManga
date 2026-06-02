# Story Recommendations — Spec

**Date:** 2026-06-02
**Depends on:** Plan A (tokens), Plan D (engagement: rating + view + bookmark + reading_progress already exist), Rankings (precedent for stat-style queries), Featured (precedent for boolean flag pattern)
**Spec type:** Discovery feature (no DB schema change)

## Why this exists

The catalog now has 56+ stories, engagement signals (rating, views, bookmarks, reading_progress, session_seconds), and personalization data. Readers reach a story detail page or the home page with no in-context hint of what to read next. Rankings give them platform-wide popularity; this spec gives them **per-context discovery**:

- **Story detail** — "Truyện tương tự" using genre overlap with the story they're already on
- **Home** — "Dành cho anh" using their own bookmark + reading-progress history

Both surfaces deepen engagement without making the operator curate by hand.

## Decisions (locked from brainstorming 2026-06-02)

| Topic | Decision |
|---|---|
| Surface | **Both story detail + home** |
| Algorithm | **Content-based** (genre overlap + rating + view as tie-break). No collaborative filtering. |
| Anonymous support | Story-detail "Similar": yes. Home "For you": no (hide section). |
| Reason field | **1-line per card** ("Cùng thể loại Tiên hiệp" / "Vì anh đã đọc Phù Dung Trang") |
| Item count per surface | **8** |
| Pagination / "Xem tất cả" | Defer |
| DB | **No migration** — uses existing `story`, `story_genre`, `bookmark`, `reading_progress` |
| Exclusions | Similar: anchor story. For you: stories already in user's bookmark ∪ reading_progress. |
| Empty handling | Similar: fallback to popular ("Đang được yêu thích"). For you: hide section silently. |
| Cache | React Query `staleTime: 10 * 60_000` (10 min). No invalidation hooks. |

## Data + algorithm

No DB schema change. All queries from existing tables.

### `GET /api/v1/recommendations/similar?storyId=:uuid&limit=8`

Public (no auth). Content-based by shared genre.

```sql
WITH anchor_genres AS (
  SELECT genre_id FROM story_genre WHERE story_id = $1
),
ranked AS (
  SELECT
    s.id, s.slug, s.title, s.author, s.status, s.total_chapters,
    (s.cover IS NOT NULL) AS has_cover, s.updated_at,
    s.view_count,
    COUNT(sg.genre_id)::int AS shared_count,
    -- one shared genre name for the reason
    (
      SELECT g.name
      FROM genre g
      JOIN story_genre sg2 ON sg2.genre_id = g.id
      WHERE sg2.story_id = s.id
        AND g.id IN (SELECT genre_id FROM anchor_genres)
      LIMIT 1
    ) AS top_shared_genre,
    r.avg AS rating_avg,
    COALESCE(r.cnt, 0) AS rating_count
  FROM story s
  JOIN story_genre sg ON sg.story_id = s.id
  LEFT JOIN (
    SELECT story_id,
           avg(value)::numeric(3,2) AS avg,
           count(*)::int            AS cnt
    FROM rating GROUP BY story_id
  ) r ON r.story_id = s.id
  WHERE sg.genre_id IN (SELECT genre_id FROM anchor_genres)
    AND s.id != $1
  GROUP BY s.id, r.avg, r.cnt
)
SELECT * FROM ranked
ORDER BY shared_count DESC,
         COALESCE(rating_avg, 0) DESC,
         view_count DESC,
         updated_at DESC,
         id ASC
LIMIT $2
```

**Reason format**: `"Cùng thể loại {top_shared_genre}"`.

**Fallback** when anchor has 0 genres OR query returns 0 rows:
```sql
SELECT s.*, r.avg AS rating_avg, r.cnt AS rating_count
FROM story s
LEFT JOIN (rating aggregate as above) r ON r.story_id = s.id
WHERE s.id != $1
ORDER BY COALESCE(r.avg, 0) DESC, s.view_count DESC, s.updated_at DESC, s.id ASC
LIMIT $2
```
Reason becomes `"Đang được yêu thích"`.

### `GET /api/v1/me/recommendations?limit=8`

Auth required (`@UseGuards(JwtAuthGuard)`). Content-based on user history.

```sql
WITH my_history AS (
  SELECT story_id FROM bookmark         WHERE user_id = $1
  UNION
  SELECT story_id FROM reading_progress WHERE user_id = $1
),
my_genres AS (
  SELECT sg.genre_id,
         COUNT(*)::int AS weight,
         MAX(s.title)  AS sample_title    -- one story title that contributed this genre
  FROM story_genre sg
  JOIN story s ON s.id = sg.story_id
  WHERE sg.story_id IN (SELECT story_id FROM my_history)
  GROUP BY sg.genre_id
),
ranked AS (
  SELECT
    s.id, s.slug, s.title, s.author, s.status, s.total_chapters,
    (s.cover IS NOT NULL) AS has_cover, s.updated_at, s.view_count,
    SUM(mg.weight)::int AS score,
    (
      SELECT mg2.sample_title
      FROM story_genre sg2
      JOIN my_genres mg2 ON mg2.genre_id = sg2.genre_id
      WHERE sg2.story_id = s.id
      ORDER BY mg2.weight DESC
      LIMIT 1
    ) AS reason_anchor,
    r.avg AS rating_avg, COALESCE(r.cnt, 0) AS rating_count
  FROM story s
  JOIN story_genre sg ON sg.story_id = s.id
  JOIN my_genres mg ON mg.genre_id = sg.genre_id
  LEFT JOIN (rating aggregate) r ON r.story_id = s.id
  WHERE s.id NOT IN (SELECT story_id FROM my_history)
  GROUP BY s.id, r.avg, r.cnt
)
SELECT * FROM ranked
ORDER BY score DESC,
         COALESCE(rating_avg, 0) DESC,
         view_count DESC,
         updated_at DESC,
         id ASC
LIMIT $2
```

**Reason format**: `"Vì anh đã đọc {reason_anchor}"`.

**Empty handling**: user with 0 bookmark + 0 reading_progress → my_genres is empty → ranked is empty → endpoint returns `{ items: [] }`. FE hides the section. (No popular fallback for forYou — keeps "Dành cho anh" honest.)

### Response shape (both endpoints)

```ts
type RecommendationItem = {
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
  reason: string;     // non-null; falls back to "Cùng phong cách" if sub-select is NULL
};

type RecommendationsResponse = { items: RecommendationItem[] };
```

### Performance notes

- `story_genre.story_id` and `story_genre.genre_id` already indexed (added by Plan 1).
- At hobby scale (~50–500 stories, ~28 genres) both queries return < 50 ms p95. Add covering index later only if measured > 100 ms.
- Subquery for `top_shared_genre` / `reason_anchor` runs once per row in the candidate set (≤ 8 results). Acceptable.

## Frontend integration

New files:

```
apps/frontend/src/
  api/recommendations.ts                          # 2 typed methods
  components/recommendations/
    RecommendationSection.tsx                     # header + grid + loading + empty handling
    RecommendationCard.tsx                        # cover + title + author + ✦ reason
```

### `RecommendationSection.tsx`

```ts
type Props =
  | { kind: 'similar'; storyId: string }
  | { kind: 'forYou' };
```

Single `useQuery` per `kind`. Header:

```
ĐỀ XUẤT
{title}
```

Title per kind:
- `similar` → `"Truyện tương tự"`
- `forYou` → `"Dành cho anh"`

Eyebrow: `text-label uppercase text-fg-muted mb-2`. Title: `text-heading-lg`.

Grid: `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8` (mirror UpdatedSection).

States:
- **Loading**: 8 skeleton cards (3:4 aspect, `bg-bg-subtle animate-pulse`).
- **Empty data**: return `null` (hide entire section).
- **Error**: log to console, return `null` (don't show user-facing error for a discovery widget).

### `RecommendationCard.tsx`

```
<Link to="/truyen/$slug" params={{slug}} search={{page:1,commentsPage:1}}
      class="group block focus-visible:ring-2 focus-visible:ring-accent rounded-md">
  <div class="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-bg-subtle">
    {hasCover && <img class="...group-hover:scale-105 transition-transform duration-200" />}
  </div>
  <h3 class="mt-3 text-heading-md line-clamp-2">{title}</h3>
  <p class="mt-1 text-body-sm text-fg-muted truncate">{author ?? 'Khuyết danh'}</p>
  <p class="mt-1 text-body-sm text-accent inline-flex items-center gap-1 truncate">
    <Sparkles class="h-3.5 w-3.5" aria-hidden />
    {reason}
  </p>
</Link>
```

Reason text is truncated to one line on overflow. No rating/view micro on this card (keep it differentiated from `StoryCard` — reason is the new payload).

### Surfaces

1. **Story detail `/truyen/$slug/index.tsx`**
   - Mount `<RecommendationSection kind="similar" storyId={s.id} />` AFTER `<ChapterList>` and BEFORE `<CommentSection>`
   - Always visible (anonymous gets content-based recs)

2. **Home `/routes/index.tsx`**
   - Mount `<RecommendationSection kind="forYou" />` BETWEEN `<HomeRankingsSection>` and `<UpdatedSection>`
   - Component internally returns `null` when `useAuthStore.user === null` OR when items.length === 0 after load
   - No flash: useQuery `enabled: !!user` so we never fetch for anon

### Caching

- React Query `staleTime: 10 * 60_000` (10 min) for both queries
- queryKey:
  - similar: `['recommendations', 'similar', storyId]`
  - forYou: `['recommendations', 'forYou', user?.id]`
- No mutation/invalidation. As user reads more, the next 10-min refetch picks up new history naturally.

## Edge cases

| Case | Handling |
|---|---|
| Anchor story has 0 genres | similar query returns 0 → fallback `ORDER BY rating, views`; reason = "Đang được yêu thích" |
| User has 0 bookmark + 0 reading_progress | forYou returns `{ items: [] }`; section hidden |
| User has read only 1 story | my_genres = genres of that 1 story → forYou ≈ similar of that story. Acceptable. |
| Story shares genre with itself (loop) | `WHERE s.id != $1` excludes |
| Story already in user history showing in forYou | `WHERE s.id NOT IN my_history` excludes |
| One genre tags most stories (e.g., "Khác") | Tie-break on `rating_avg DESC, view_count DESC` keeps result useful |
| `top_shared_genre` subselect returns NULL (rare race) | Service maps NULL → `"Cùng phong cách"` before responding |
| Anonymous on story detail | similar endpoint is public → renders normally |
| Anonymous on home | `useQuery` disabled via `enabled: !!user`; component returns null |
| Reason text overflows mobile width | `truncate` CSS clips at 1 line |
| User logs out while home is open | useQuery becomes disabled; component re-renders null on next state read |
| Slow query | At hobby scale unlikely; if measured, add `(story_id, genre_id)` covering index |
| Cache stale: user reads new chapter, opens home in same 10 min | forYou shows old recs. Acceptable; refresh on next staleTime cycle. |

## Acceptance criteria

1. `GET /api/v1/recommendations/similar?storyId={uuid}&limit=8` returns `{ items: RecommendationItem[] }` with up to 8 entries, anchor excluded, ordered by shared_count DESC then rating then views.
2. Every item has non-null `reason` field; primary reason format is `"Cùng thể loại {name}"`.
3. Anchor story with 0 genres returns fallback results with reason `"Đang được yêu thích"`.
4. Similar endpoint works for both anonymous and authenticated requests (200 either way).
5. `GET /api/v1/me/recommendations?limit=8` requires JWT, returns `{ items }` filtered to NOT in user's bookmark ∪ reading_progress, ordered by genre-overlap score then rating then views.
6. User with no history returns `{ items: [] }` (HTTP 200, empty).
7. Reason for forYou items uses format `"Vì anh đã đọc {sample_title}"`.
8. New `RecommendationSection` component supports props `kind: 'similar' | 'forYou'` and renders correct title/data.
9. Story detail page mounts `<RecommendationSection kind="similar" storyId={s.id} />` after ChapterList and before CommentSection.
10. Home page mounts `<RecommendationSection kind="forYou" />` between `<HomeRankingsSection>` and `<UpdatedSection>`.
11. forYou section returns `null` (hidden entirely) for anonymous OR empty-data states — no flash, no empty state message.
12. RecommendationCard shows cover + title + author + `✦` Sparkles icon + reason in text-accent.
13. Click on card navigates to `/truyen/$slug?page=1&commentsPage=1`.
14. Loading shows 8 pulse skeletons; no layout shift when data arrives.
15. React Query `staleTime` is 10 minutes; no mutation/invalidation wired.
16. `pnpm --filter @smanga/api typecheck` and `pnpm --filter @smanga/frontend typecheck` both pass.

## Out of scope

- "Không quan tâm / Ẩn truyện này" feedback button (would need new `recommendation_hide` table)
- Collaborative filtering ("users who read X also read Y") — requires critical mass, defer
- Reranking based on time-of-day / device / session length
- "Xem tất cả →" pagination for recommendations
- Author-based recs ("more by Tam Dương Thái Lai") — possibly later
- Cold-start onboarding (pick 3 genres on signup)
- A/B test framework / variants
- Email digest of weekly recs
- Push notification when "you might like" matches a new story

## Risks + mitigations

- **Risk**: `top_shared_genre` subquery runs N times per result (N = candidate set), creating N+1-ish access. **Mitigation**: candidate set is small (≤ 8), each subquery uses indexed joins. Measured cost expected < 5 ms. If real-world > 50 ms, hoist into a CTE or LATERAL JOIN.
- **Risk**: forYou my_genres CTE grows with user history (100+ stories). **Mitigation**: still bounded by `count(genre) ≤ 28`. GROUP BY is cheap.
- **Risk**: Cold-start platform (few stories) shows thin recs. **Mitigation**: empty fallback to popular; FE hides section if still empty.
- **Risk**: forYou returns the exact same stories as similar on story detail (overlap). **Mitigation**: accepted — two surfaces with different framings; user not harmed.
- **Risk**: `MAX(s.title)` in my_genres picks a possibly stale or odd story per genre. **Mitigation**: it's a reason string, not a guarantee — acceptable nondeterminism. If frequent issue, switch to `MIN(updated_at)` for stability.
- **Risk**: Polymorphic-ish reason field type — string + nullable in DB but FE expects non-null. **Mitigation**: server coalesces to `"Cùng phong cách"` before responding (single line in service).

## Migration phases

1. **Phase R1 — BE**: recommendations module (service + controller + 2 endpoints + DTOs + AppModule registration). No DB migration.
2. **Phase R2 — FE**: api client + RecommendationCard + RecommendationSection + mount on 2 surfaces.

Each phase = own commit set + local verify (typecheck + curl/browser smoke). **Push only when user explicitly says push.**
