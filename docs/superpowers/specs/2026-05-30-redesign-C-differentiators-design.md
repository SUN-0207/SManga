# SManga Redesign — Spec C: Differentiator Features

**Date:** 2026-05-30
**Part:** C of 3 (sibling specs: [A-tokens-shells-reader](./2026-05-30-redesign-A-tokens-shells-reader-design.md), [B-auth-account-admin](./2026-05-30-redesign-B-auth-account-admin-design.md))
**Depends on:** Spec A (component shells must exist), Spec B (Account card slot must exist)

## Why this exists

Tokens + structure (Spec A + B) make SManga *consistent and pretty*. What makes it *different from truyenfull / truyenyy / etc.* is the **Reader's Companion DNA** — features that treat reading as a first-class activity worth tracking, celebrating, and resuming effortlessly. This spec defines and implements those signature touches:

1. **"Đọc tiếp" persistent CTA** — never lose your spot
2. **Reading stats card** — see your reading life (streak, weekly chapters, library count)
3. **Beautiful empty states** — illustrations + warm copy + clear next-step
4. **Drop-cap typography** — first letter of every chapter feels editorial

Together these are what a reader notices and tells a friend about ("hey, this site actually remembers where I left off and shows me my streak").

## Decisions (locked from Spec A brainstorming)

Inherits from Spec A. Plus per-feature decisions below.

## Feature 1 — "Đọc tiếp" persistent CTA

### Component

`apps/frontend/src/components/reader/ContinueReadingBar.tsx`

**Visual** (Spec A defines shell, this spec adds data + behavior):
- Sticky directly below the top header (above all page content)
- Background: `linear-gradient(90deg, rgba(236,72,153,0.12), rgba(244,114,182,0.04))` with `border-b border-accent/18`
- Layout: `[cover thumb 28×36 gradient placeholder | text block flex-1 truncate | "Tiếp tục →" CTA]`
- Text block: eyebrow "ĐỌC TIẾP · CHƯƠNG N / TOTAL" + story title (truncate on mobile)
- CTA: white pill on desktop, just arrow icon on mobile
- Whole bar is clickable (entire `<button>` or `<Link>`)

### Data

New API endpoint:

```
GET /api/v1/me/continue-reading

Response 200:
{
  "storyId": "uuid",
  "storySlug": "xuyen-thu-chi-ba-ai-doc-the",
  "storyTitle": "Xuyên Thư Chi Bá Ái Độc Thê",
  "hasCover": true,
  "chapterIndex": "47.00",
  "totalChapters": 671,
  "updatedAt": "2026-05-30T11:24:00Z"
}

Response 204: (no progress yet, or no chapters read)
```

Server selects: most recently `updated_at` row in `reading_progress` joined with `story` for that user. Limit 1.

### Behavior

- FE component uses `useQuery(['me', 'continue-reading'])`, `staleTime: 60_000` (re-fetch on focus is fine)
- Render bar only if:
  1. response is 200 (data exists)
  2. current route ≠ `/truyen/$slug/chuong/$index` matching the story (don't show bar while reading that very chapter)
- Click → navigate to `/truyen/{slug}/chuong/{chapterIndex}`
- Invalidate query after `/api/v1/me/progress` writes complete (existing API)

### Edge cases

- Multiple stories in progress → API returns most recent. User sees that one. Full list available in Tủ sách tab.
- Story crawl removed it mid-session → API returns 204 next fetch, bar disappears.
- Anonymous user → query disabled, bar never renders.

## Feature 2 — Reading stats card

### Component

`apps/frontend/src/components/reader/ReadingStatsCard.tsx`

**Visual**:
- Container: gradient backdrop `linear-gradient(135deg, rgba(236,72,153,0.08), rgba(244,114,182,0.02))` border `accent/15` radius lg padding p-6
- Decorative glow orb top-right (radial pink/25%, blur)
- Header row: eyebrow "HOẠT ĐỘNG ĐỌC" + dynamic headline "Tuần này anh đã đọc **N chương**" (N gradient text) + streak chip "🔥 Streak N ngày" right-side (only flame from emoji — accepted because of universal meaning + no icon font has it polished; alt: Lucide Flame)
- 4-up mini-stats grid: Tổng / Thư viện / Hoàn thành / Giờ đọc — each card `bg-bg-subtle` rounded-md p-3, with label uppercase tiny + value 22px bold + unit tiny muted
- 7-day mini sparkline: vertical bars row, color intensity ∝ chapters that day, today highlighted brighter + glow

**Mobile**: same layout but stats grid 2-col instead of 4-col; sparkline kept full-width.

### Where it lives

- `/tu-sach` (Tủ sách tab) — top of page, above the sub-tabs
- `/tai-khoan` (Account page) — top of page, above the existing cards (slot reserved by Spec B)
- `/ban` (Bạn tab) — top of page if logged in
- Not on `/` (Home) — Home has its own "Đọc tiếp" hero, no double-up

### Data

New API endpoint:

```
GET /api/v1/me/stats

Response 200:
{
  "totalChaptersRead": 147,
  "libraryCount": 8,
  "completedCount": 2,
  "weeklyChapters": 23,
  "weeklyHours": 12,
  "streakDays": 5,
  "dailyChaptersLast7": [4, 7, 0, 6, 9, 5, 11]   // T2..CN, today is last
}

Response 401: unauthenticated
```

Server-side computation (single query per field, indexed):
- `totalChaptersRead`: `COUNT(*) FROM reading_progress WHERE user_id = $1`
- `libraryCount`: `COUNT(*) FROM bookmark WHERE user_id = $1`
- `completedCount`: `COUNT(*) FROM reading_progress rp JOIN story s ON rp.story_id = s.id WHERE rp.user_id = $1 AND rp.chapter_index::numeric = s.total_chapters AND s.total_chapters > 0`
- `weeklyChapters`: `COUNT(*) FROM reading_progress WHERE user_id = $1 AND updated_at > now() - interval '7 days'`
- `streakDays`: window function counting consecutive days back from today with ≥1 row in `reading_progress` for that user (in user's TZ — server uses Asia/Ho_Chi_Minh)
- `dailyChaptersLast7`: `GROUP BY date_trunc('day', updated_at)` for last 7 days, fill zeros
- `weeklyHours`: SUM of `session_seconds` from last 7 days (requires session tracking — see below)

### Session tracking (optional sub-feature)

To compute `weeklyHours`, need to track time-on-chapter:

**Migration 0008**:
```sql
ALTER TABLE reading_progress ADD COLUMN session_seconds integer NOT NULL DEFAULT 0;
```

**FE**: chapter reader page starts a `setInterval(1s)` while visible (Page Visibility API to pause when tab backgrounded). On unmount or chapter change, POST `/me/progress` with accumulated `seconds` field; BE adds to existing `session_seconds`.

**If session tracking is deferred** (scope tight): `weeklyHours` returns 0 and stats card hides that stat. Total/Library/Completed/Streak still work without migration.

### Acceptance

- Card renders correctly in dark + light themes
- Numbers update after the user reads a chapter (cache invalidation on `/me/progress` write)
- Empty state (user has 0 progress): card shows "Bắt đầu đọc để theo dõi hoạt động của bạn" with mini CTA "Đến trang chủ"
- Loading state: skeleton bars, no layout shift
- Sparkline accessible: aria-label "Số chương đọc theo ngày trong tuần: 4, 7, 0, 6, 9, 5, 11"

## Feature 3 — Beautiful empty states

### Component

`apps/frontend/src/components/ui/EmptyState.tsx` (generic primitive)

```tsx
<EmptyState
  illustration={<EmptyBookshelf />}
  title="Tủ sách còn trống"
  description="Đánh dấu truyện anh thích để dễ tìm lại. Bắt đầu khám phá nào."
  cta={{ label: "Khám phá truyện", to: "/kham-pha" }}
/>
```

### Per-surface specifications

| Surface | Title | Description | CTA |
|---|---|---|---|
| `/tu-sach` Đã lưu (empty) | Tủ sách còn trống | Đánh dấu truyện anh thích để dễ tìm lại. Bắt đầu khám phá nào. | Khám phá truyện → /kham-pha |
| `/tu-sach` Đang đọc (empty) | Chưa có truyện đang đọc | Mở 1 chương bất kỳ và đọc 5 giây — chúng tôi sẽ tự ghi nhớ. | Khám phá truyện → /kham-pha |
| `/tu-sach` Đã hoàn thành (empty) | Chưa truyện nào hoàn tất | Đọc đến chương cuối là tự động xuất hiện ở đây. | (no CTA, just text) |
| `/kham-pha` (no results) | Không tìm thấy truyện nào khớp | Thử từ khoá khác, hoặc xoá bộ lọc để xem tất cả. | Xoá bộ lọc (onClick resets q/page/genre) |
| `/tim-kiem?q=...` (no results) | (same as above — /tim-kiem redirects to /kham-pha) | (same) | (same) |
| `/admin/users` (search no results) | Không tìm thấy tài khoản nào | Thử từ khoá khác. | Xoá tìm kiếm |
| `/admin/jobs` (no jobs) | Hàng đợi đang trống | Crawl một truyện để thấy job xuất hiện ở đây. | Đi đến Truyện → /admin/stories |
| `/admin/stories` (no stories) | Chưa có truyện nào | Bắt đầu từ catalog của một nguồn để import metadata. | Chọn nguồn → /admin/sources |

### Illustrations

Hand-crafted SVG illustrations (single file each, simple geometric, follow accent color):

- `EmptyBookshelf` — 3 stylized book spines (1 placeholder + 2 ghost), gradient pink on accent book
- `EmptySearch` — magnifying glass with "?" inside, all line-icons in `border-strong`
- `EmptyQueue` — clock-style icon with empty interior
- `EmptyFolder` — folder shape with subtle pink corner accent

All SVGs are React components in `apps/frontend/src/components/ui/illustrations/`. ~100 lines each. No external dependency.

### Acceptance

- Each surface shows correct title + description + CTA per table above
- Illustrations use accent gradient consistent across light + dark themes
- CTA buttons follow Spec A pink CTA pattern (gradient + glow)

## Feature 4 — Drop-cap + reading typography

### Implementation

In `ChapterReader.tsx`, wrap the first paragraph's first character:

```tsx
<p>
  <span className="drop-cap" aria-hidden>{firstChar}</span>
  {restOfParagraph}
</p>
```

CSS:

```css
.drop-cap {
  font-family: 'Newsreader', serif;
  font-weight: 700;
  font-size: 3.5em;
  line-height: 0.85;
  float: left;
  margin: 6px 12px 0 0;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  color: transparent;
}
```

### Rules

- Drop-cap applies only to the **first paragraph** of the chapter
- If the first paragraph starts with punctuation (e.g., `"Gì..."`), the drop-cap is the first **letter** found, skipping leading non-letter chars
- The accompanying span has `aria-hidden="true"`; the full word is still in the DOM (`<span aria-hidden>T</span>hẩm Húc Nghiêu`) so screen readers don't read "T... Thẩm"
- Hidden when `prefers-reduced-motion: reduce` (the gradient text effect can shimmer for some users — fall back to bold serif first letter, no gradient)
- Hidden if user picks `serif` font-size = "Nhỏ" (15px) — drop-cap looks awkward at small sizes
- Light theme: same gradient (still pink) — works on white bg too

### Typography supporting upgrades

- Chapter title: rendered in Newsreader 600 (not Inter) to introduce serif before prose body
- Estimated reading time: `Math.ceil(wordCount / 250)` minutes, shown as "N PHÚT ĐỌC" eyebrow under title
- Word count comes from existing decompressed `contentText` (no API change; compute client-side once on mount)
- Mid-chapter scene break: if source content contains `"\n\n* * *\n\n"` pattern, render as decorative centered `· · ·` (Newsreader serif, muted) instead of plain text

### Acceptance

- First paragraph of every crawled chapter shows pink-gradient drop-cap
- Screen reader reads chapter normally (no "T... Thẩm" stutter)
- Drop-cap suppressed when prose font-size = small
- Drop-cap suppressed when `prefers-reduced-motion: reduce`
- Reading time displayed correctly (manual check on 1000-word chapter ≈ 4 minutes)

## Files affected

```
apps/frontend/src/
  components/
    reader/
      ContinueReadingBar.tsx       NEW (Feature 1)
      ReadingStatsCard.tsx          NEW (Feature 2)
      ChapterReader.tsx (or section in $index.tsx)
        ADD: drop-cap render + reading-time eyebrow + scene-break parser (Feature 4)
    ui/
      EmptyState.tsx                NEW (Feature 3 primitive)
      illustrations/
        EmptyBookshelf.tsx          NEW
        EmptySearch.tsx             NEW
        EmptyQueue.tsx              NEW
        EmptyFolder.tsx             NEW
  api/
    me.ts                           NEW — getContinueReading, getStats
  routes/
    tu-sach.tsx                     ADD: ReadingStatsCard at top + use EmptyState for empty tabs
    tai-khoan.tsx                   ADD: ReadingStatsCard above Avatar card
    ban.tsx (new from Spec A)       ADD: ReadingStatsCard if logged in
    truyen/$slug/chuong/$index.tsx  ADD: drop-cap rendering + reading time + session tracking
    tim-kiem.tsx                    ADD: EmptyState for no-results
    kham-pha.tsx (new from Spec A)  ADD: EmptyState for no-results
    admin/jobs.tsx                  REPLACE: existing empty placeholder with EmptyState
    admin/users.tsx                 REPLACE: existing empty placeholder with EmptyState
    admin/stories/index.tsx         REPLACE: existing empty placeholder with EmptyState

apps/api/src/modules/
  user-data/                        EXISTING module — extend with continue-reading + stats
    user-data.controller.ts         ADD: GET /me/continue-reading, GET /me/stats
    user-data.service.ts            ADD: getContinueReading(userId), getStats(userId)
  user-data/dto/                    n/a (read-only endpoints, no DTOs needed)

packages/db/src/
  schema/user-data.ts               OPTIONAL: add session_seconds column to reading_progress (Feature 2 weeklyHours)
  migrations/
    0008_session_seconds.sql        OPTIONAL — only if Feature 2 weeklyHours ships in MVP
```

## Acceptance criteria (overall)

- "Đọc tiếp" bar shows correct story when user has progress; hides on chapter reader of that exact story; hides for anonymous users
- Reading stats card renders on /tu-sach, /tai-khoan, /ban (if logged in) with live data
- Stats numbers update after reading a chapter (within ~60s without manual refresh, or instantly on next route navigation)
- Streak count is correct (verified with seeded data: 5 consecutive days = streak 5; gap day breaks streak to 0; today only = streak 1)
- Empty states render on all 8 surfaces listed above with correct copy + CTA
- Drop-cap renders pink gradient on first letter of first paragraph in every crawled chapter
- Screen reader test: chapter reads correctly without drop-cap stutter
- `prefers-reduced-motion: reduce`: drop-cap suppressed; "Đọc tiếp" bar appears without slide animation; stats card sparkline renders static (no fade-in)

## Out of scope

- Tokens, shells, page structure → **Spec A**
- Auth, Account base styling, Admin tokens → **Spec B**
- Year-in-review wrap, share quote cards, social features (Approach 3 "Reading Lab" stuff) → defer
- Streaks-as-game (badges, milestones, push notifications) → defer
- Cover-color extraction for backdrops → defer

## Risks + mitigations

- **Risk**: `/me/stats` query is slow at scale (many `reading_progress` rows). **Mitigation**: indexes on `(user_id, updated_at)` already exist for sort; add covering index `(user_id, updated_at DESC)` if necessary. At hobby scale (<10k users, <1M progress rows) plain GROUP BY is fine.
- **Risk**: Streak calculation across DST or timezone changes wrong. **Mitigation**: server enforces `Asia/Ho_Chi_Minh` consistently; document this; user can't set TZ in MVP.
- **Risk**: Session_seconds tracking inflates DB writes (every minute on chapter reader). **Mitigation**: batch updates — only POST when user navigates away or after 60s elapsed; FE keeps a delta in zustand and commits on `pagehide` / unmount.
- **Risk**: Drop-cap interferes with content that starts mid-sentence or with punctuation. **Mitigation**: regex skips leading non-letter chars; if no letter in first 20 chars, suppress drop-cap entirely.
- **Risk**: SVG illustrations bloat bundle. **Mitigation**: each <2 KB minified; lazy-import per route if total >10 KB.

## Migration phases (within this spec)

1. **Phase C1**: BE — add `/me/continue-reading` + `/me/stats` endpoints (read-only, no migration). Feature flag `session_seconds` to skip if Phase C3 not shipped.
2. **Phase C2**: FE — ContinueReadingBar + ReadingStatsCard + integrate into shells/pages
3. **Phase C3**: FE — Drop-cap + reading time + scene-break + (optional) session tracking + migration 0008 if doing weeklyHours
4. **Phase C4**: EmptyState primitive + per-surface integration (replaces existing text placeholders)

Each phase = own commit set + local verify. **Push only when user explicitly says push** (per user directive on 2026-05-30).
