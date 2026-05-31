# SManga Engagement — Spec D: Views + Rating

**Date:** 2026-05-31
**Part:** D (sibling: Spec E — Comments full, drafted separately after D ships)
**Depends on:** Plan A (tokens), Plan B (auth/account chrome), Plan C (slot patterns) — all on `main`

## Why this exists

Reader's-Companion DNA so far gives the user a beautiful reading experience but is silent on **social signal** — how popular a story is and what other readers think. This spec adds two lightweight signals:

1. **Lượt xem** — per-story and per-chapter view counters, denormalized for read-cheap display.
2. **Rating** — 1-to-5-star per-user-per-story rating with aggregate avg + count.

Comments (the heavier social feature with threading, reactions, notifications, moderation) is **out of scope** and will be a separate spec (E). Splitting protects this spec from scope creep — D ships in one workflow, E in another.

## Decisions (locked from brainstorming)

| Topic | Decision |
|---|---|
| View placement | **Both story + chapter** — denormalized counter on each |
| Anti-spam | **Client-side debounce** via `localStorage` keyed by `${id}:${YYYY-MM-DD}` |
| Anonymous view tracking | **Yes** — anonymous loads count too |
| Rating shape | **1-5 stars, login-only to rate, anyone can read avg** |
| Re-rating | Allowed any time (upsert); clicking the currently-selected star clears the rating |
| Rate-limit | Optional MVP — log as tech-debt if `nestjs-throttler` not wired |
| Display surfaces | Story detail hero (full), Story card grid (micro), Chapter reader eyebrow (view only) |
| Module placement | New `apps/api/src/modules/engagement/` (controllers + services for both features) |

## Data model

New migration `0008_engagement.sql`:

```sql
-- View counters denormalized onto existing tables
ALTER TABLE story ADD COLUMN view_count integer NOT NULL DEFAULT 0;
ALTER TABLE chapter ADD COLUMN view_count integer NOT NULL DEFAULT 0;

-- Rating: 1 user × 1 story = at most 1 row
CREATE TABLE rating (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES story(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, story_id)
);
CREATE INDEX rating_story_idx ON rating (story_id);
```

Drizzle schema (`packages/db/src/schema/engagement.ts`):

```ts
import { check, index, pgTable, primaryKey, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.ts';
import { story } from './story.ts';

export const rating = pgTable(
  'rating',
  {
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    storyId: uuid('story_id').notNull().references(() => story.id, { onDelete: 'cascade' }),
    value: smallint('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.storyId] }),
    storyIdx: index('rating_story_idx').on(t.storyId),
    valueCheck: check('rating_value_range', sql`${t.value} BETWEEN 1 AND 5`),
  }),
);

export type Rating = typeof rating.$inferSelect;
export type NewRating = typeof rating.$inferInsert;
```

`view_count` columns are added to existing `story.ts` and `chapter.ts` schemas (append to the existing column lists).

**Append the new file to `packages/db/drizzle.config.ts` schema array** (per CLAUDE.md hard-won workaround #2 — drizzle-kit cannot glob, must list explicitly).

## API surface

Base path `/api/v1/`. All endpoints in new module `apps/api/src/modules/engagement/`.

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| `POST` | `/views/story/:storyId` | optional | — | `204 No Content` |
| `POST` | `/views/chapter/:chapterId` | optional | — | `204 No Content` |
| `GET` | `/ratings/story/:storyId` | optional | — | `{ avg: number\|null, count: number, mine: 1-5\|null }` |
| `PUT` | `/ratings/story/:storyId` | required | `{ value: 1-5 }` | `{ avg, count, mine }` |
| `DELETE` | `/ratings/story/:storyId` | required | — | `{ avg, count, mine: null }` |

**Optional auth** = use the existing `@OptionalJwtAuth()` decorator (or `@UseGuards(OptionalJwtAuthGuard)` if naming differs in this codebase). If absent, request proceeds with `request.user = null`.

**Required auth** = existing `JwtAuthGuard`.

**View endpoints body**: idempotent counter increment — `UPDATE story SET view_count = view_count + 1 WHERE id = $1`. No `mine` tracking on BE for views (client owns dedup).

**Rating GET response**: `avg` is `null` when `count = 0`. `mine` is `null` when anonymous OR logged-in-but-never-rated. Fresh aggregate computed via `SELECT avg(value)::numeric(3,2), count(*) FROM rating WHERE story_id = $1` plus a separate point lookup for `mine` when `request.user` exists.

**Rating PUT**: validate `value ∈ [1,5]` via Zod-equivalent class-validator `IsInt`, `Min(1)`, `Max(5)`. Upsert via Drizzle `onConflictDoUpdate` with `set: { value, updatedAt: now() }`.

**Rating DELETE**: `DELETE FROM rating WHERE user_id = $1 AND story_id = $2`. Idempotent — no error if row not present (returns aggregate post-delete).

## Story-detail integration

Extend the response of `GET /stories/:slug` (existing endpoint) to add three fields:

```diff
 {
   id, slug, title, author, status, totalChapters, hasCover, description, genres,
+  viewCount: number,
+  ratingAvg: number | null,
+  ratingCount: number,
 }
```

Implementation in `stories.service.ts`: extend the existing `getBySlug` query to `LEFT JOIN (SELECT story_id, avg(value)::numeric(3,2) AS avg, count(*)::int AS cnt FROM rating GROUP BY story_id) r ON r.story_id = s.id`, project `r.avg AS ratingAvg, coalesce(r.cnt, 0) AS ratingCount, s.view_count AS viewCount`.

**No round-trip cost for anonymous user** — story detail already does this single query.

**`mine` rating** for logged-in user requires a separate `GET /ratings/story/:storyId` call (cheap point lookup). FE fires only when `user` is truthy. Not bundled with story query to keep that endpoint cacheable for anonymous.

## Frontend integration

### Components

`apps/frontend/src/components/engagement/`:

- **`ViewCount.tsx`** — props `{ count: number, label?: string }`; renders `<Eye class="h-3.5 w-3.5"/> {formatCompact(count)}` with optional label suffix. Compact format: `0–999` → exact, `1000–999_999` → `1.2k`, `≥1_000_000` → `1.2M`. Vietnamese locale uses `'k'` and `'tr'` (triệu) for ≥1M.
- **`RatingStars.tsx`** — props `{ value: number\|null, mine?: 1-5\|null, onChange?: (v: 1-5\|null) => void, size?: 'sm'\|'md'\|'lg' }`. Read-only when `onChange` is undefined. Interactive when provided: hover state previews the value, click commits, click on currently-set value calls `onChange(null)` (clear). Pink accent fill via `text-accent` token, empty via `text-fg-subtle`. Keyboard: `←/→` adjust focus, `Enter` commits.
- **`RatingControl.tsx`** — wrapper that runs `useQuery(['rating', storyId])` + `useMutation`s for PUT/DELETE, optimistic update, error toast on 401 ("Vui lòng đăng nhập lại").

### Surfaces

1. **Story detail hero** (`/truyen/$slug`)
   - Below the meta line `{author} · {totalChapters} chương · {status}`:
     - Row: `<RatingControl storyId={s.id} />` + `<ViewCount count={s.viewCount} label="lượt xem" />`
   - Rating row shows `<RatingStars value={ratingAvg} />` + `"({ratingCount} đánh giá)"` muted.
   - Logged-in: stars become interactive with `mine` preselected. Hover shows preview value above stars.
   - Anonymous: stars read-only, click triggers a one-shot toast `"Đăng nhập để đánh giá"` with link to `/dang-nhap?redirect=/truyen/{slug}`.

2. **Story card** (`HomeStoryCard`, `StoryCard`, `LibraryCard`)
   - Below `author` line, add: `{ratingCount > 0 && <RatingStars value={ratingAvg} size="sm" />} {viewCount > 0 && <ViewCount count={viewCount} />}`
   - If both zero (e.g., new story), render nothing — no empty `0` displays.
   - The micro `RatingStars` is read-only and visually compact (12px stars + numeric `4.2` text aside).

3. **Chapter reader eyebrow** (`/truyen/$slug/chuong/$index`)
   - Existing eyebrow `CHƯƠNG N · M PHÚT ĐỌC` → append ` · {viewCount} LƯỢT XEM` when `viewCount > 0`.

### View tracking hooks

`apps/frontend/src/hooks/use-track-view.ts`:

```ts
export function useTrackStoryView(storyId: string | undefined) {
  useEffect(() => {
    if (!storyId) return;
    const key = `smanga:viewed:story:${storyId}:${new Date().toISOString().slice(0, 10)}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    void fetch(`/api/v1/views/story/${storyId}`, { method: 'POST', credentials: 'include' });
  }, [storyId]);
}

export function useTrackChapterView(chapterId: string | undefined) {
  useEffect(() => {
    if (!chapterId) return;
    const key = `smanga:viewed:chapter:${chapterId}:${new Date().toISOString().slice(0, 10)}`;
    if (localStorage.getItem(key)) return;
    const t = setTimeout(() => {
      localStorage.setItem(key, '1');
      void fetch(`/api/v1/views/chapter/${chapterId}`, { method: 'POST', credentials: 'include' });
    }, 3000);
    return () => clearTimeout(t);
  }, [chapterId]);
}
```

Story detail page calls `useTrackStoryView(storyQ.data?.id)`. Chapter reader page calls `useTrackChapterView(chapter.id)`.

**Private-mode / localStorage disabled**: `localStorage` throws when disabled — wrap in try/catch; on throw, skip dedup (counter inflates by F5 count). Acceptable for edge case.

### State invalidation

- Successful `PUT /ratings/story/:id` mutation invalidates `['rating', storyId]` and `['story', slug]` (to refresh avg + count in hero).
- View POST is fire-and-forget — no invalidation needed (FE shows the latest counter on next `['story', slug]` fetch which happens naturally on navigation).

## Rate limiting

If `nestjs-throttler` is already wired in `apps/api`:
- `@Throttle({ default: { limit: 30, ttl: 60_000 } })` on view endpoints (30/min per IP)
- `@Throttle({ default: { limit: 10, ttl: 60_000 } })` on rating PUT/DELETE (10/min per user)

If not wired: ship without rate limit, add a `// TODO(spec-D): wire throttler when other surfaces need it` comment at controller class level. At 100-1000 users, spam risk is bounded by client localStorage debounce anyway.

## Edge cases

| Case | Handling |
|---|---|
| User rates 3, refresh, rates 5 | Upsert overwrites; avg recomputes |
| User clicks currently-selected star | DELETE row; UI returns to unrated state |
| Anonymous click on stars | No-op + toast "Đăng nhập để đánh giá" |
| Logged-in user invalidated mid-rate (token expired) | Mutation 401 → toast "Vui lòng đăng nhập lại"; FE revert optimistic |
| Story has 0 ratings | `avg: null, count: 0`; hero displays empty stars + "Chưa có đánh giá" |
| Story deleted by admin | CASCADE drops ratings; view_count gone with row |
| User deleted | CASCADE drops user's ratings; story view_count unchanged (counter denormalized) |
| Two-tab race rating | Last-write-wins via `updated_at = now()`; no lock — acceptable |
| F5 spam | Client localStorage dedup; private mode allows inflation (documented) |
| Card with `ratingCount: 0` and `viewCount: 0` | Render nothing — no `0 ⭐ · 0 👁` ugliness |
| Card with only one of the two | Render only the non-zero one |

## Acceptance criteria

1. Migration `0008_engagement.sql` runs clean; rollback (`DROP COLUMN view_count` on both tables + `DROP TABLE rating`) is documented in the PR description but not automated.
2. `view_count` column appears in both `story` and `chapter` Drizzle schemas; `rating` Drizzle table compiles and is registered in `drizzle.config.ts`.
3. `GET /stories/:slug` returns `viewCount`, `ratingAvg`, `ratingCount` fields; `ratingAvg` is `null` when there are no ratings.
4. `POST /views/story/:id` and `POST /views/chapter/:id` increment counters and respond `204` whether or not the caller is authenticated.
5. `GET /ratings/story/:id` returns `{ avg, count, mine }` shape; `mine` is `null` for anonymous and for logged-in-never-rated users.
6. `PUT /ratings/story/:id` with `{ value: 4 }` creates or updates the row; response shows the new aggregate.
7. `DELETE /ratings/story/:id` removes the row; response shows the new aggregate with `mine: null`.
8. Story detail hero shows the rating stars + view count badge in light theme and dark theme without contrast regression.
9. Click sao 4 trên hero (logged-in) → optimistic UI cập nhật < 200ms → server response confirms.
10. Click sao đang chọn → rating bị xoá → stars trở về empty.
11. F5 trang story detail không tăng `view_count` (localStorage dedup hoạt động).
12. Anonymous mở story detail vẫn tăng `view_count` (no client login gate on view tracking).
13. Story card grid hiển thị `<RatingStars size="sm"/>` + `<ViewCount/>` chỉ khi `ratingCount > 0` HOẶC `viewCount > 0`.
14. Chapter reader eyebrow append `· {viewCount} LƯỢT XEM` khi `viewCount > 0`.
15. Chapter view tracked sau 3s thời gian ở trên trang; F5 trong cùng ngày không tăng lại.
16. Typecheck pass: `pnpm --filter @smanga/api typecheck` + `pnpm --filter @smanga/frontend typecheck`.

## Out of scope

- Rating distribution histogram (5★: 60%, 4★: 25%, ...) — defer to Spec E or follow-up
- "Top rated" / "Most viewed" sort endpoints on `/kham-pha` — needs separate query infrastructure
- Notification when a bookmarked story gets new ratings — needs notification system (part of Spec E)
- Review text alongside rating — overlaps with Comments scope (Spec E)
- Per-user view history / "Recently viewed" — not requested
- Anti-fraud on rating (one-IP-many-accounts) — bound by login gate; reasonable for hobby scale
- View counter rollups, time-windowed views ("views this week") — counter is lifetime-only in MVP

## Risks + mitigations

- **Risk**: counter UPDATE on hot story creates write contention. **Mitigation**: at 100-1000 users with localStorage dedup, expected POST rate is single-digit/minute even on busiest day — Postgres handles it trivially. If contention later becomes real, swap to `INSERT INTO view_event` + cron rollup (Approach B in brainstorm).
- **Risk**: rating value validation bypass on BE. **Mitigation**: SQL `CHECK (value BETWEEN 1 AND 5)` is the floor; class-validator `IsInt + Min + Max` is the FE-facing guard.
- **Risk**: `localStorage` quota exceeded on browsers that store many keys. **Mitigation**: keys are date-suffixed; even years of viewing every story = a few thousand keys, well under 5MB quota. No cleanup job needed.
- **Risk**: `getStoryBySlug` query slowdown from added JOIN. **Mitigation**: `rating_story_idx` keeps the GROUP BY cheap; expected < 5ms per query on hobby scale. Measure with `EXPLAIN ANALYZE` before merging if concerned.
- **Risk**: anonymous view inflation from web crawlers + bots. **Mitigation**: accept for MVP; if real spam appears, add `User-Agent` filter on the BE endpoint (skip well-known bot UAs).

## Migration / ship order

1. **Phase D1** — BE: migration 0008 + Drizzle schema + engagement module + extended `GET /stories/:slug` response
2. **Phase D2** — FE primitives: `ViewCount`, `RatingStars`, `RatingControl` components + view-tracking hooks
3. **Phase D3** — FE integrations: story detail hero + chapter reader eyebrow + card grids (HomeStoryCard, StoryCard, LibraryCard)

Each phase = own commit set + local verify. **Push only when user explicitly says push** (per the standing directive on 2026-05-30).
