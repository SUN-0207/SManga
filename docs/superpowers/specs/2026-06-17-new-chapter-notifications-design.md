# New-Chapter Notifications for Followed Stories — Design

> **Status:** APPROVED 2026-06-17 — ready for an implementation plan.
> **Problem:** The smart auto-crawl drainer continuously pulls new chapters for ongoing stories, but that event reaches no reader. A user who bookmarks ("follows") an ongoing novel has no way to learn it updated except by manually revisiting. This is the biggest retention gap: the crawl→read loop has no "come back" signal.

## Goal

When a story a user has **bookmarked** gets one or more **new readable chapters**, deliver a **coalesced in-app notification** ("Truyện X — N chương mới") through the **existing** notification bell, deep-linking to the reader's next unread chapter. Build on the notification system already in the codebase; add no external services (email/push are explicitly out of scope — see below).

## Decisions (locked)

- **Delivery = in-app bell only** (approach A). Reuse the existing `notification` table, `NotificationsService`, `NotificationBell`, and `/me/notifications` API. No email, no web push, no SMTP — fits the residential-IP self-host and adds no new dependency. The `notification` table this populates becomes the event log a future email/push layer could read from, so this choice doesn't block that later.
- **Follow = bookmark.** The existing `bookmark (user_id, story_id)` table *is* the follow relationship. No new "follow" concept.
- **Readable chapter = `chapter.status = 'crawled'`.** A discovered stub (`status='pending'`) or a failed fetch (`status='failed'`) is NOT readable and must NOT notify. Notifications fire only when content actually lands.
- **Trigger = a scheduled sweep, not a crawler hook.** A Bull repeatable job (mirroring the existing auto-crawl feeder + dead-letter reconciler pattern) coalesces all chapters added since the last sweep into one notification per story, and keeps the crawler write path untouched.
- **Coalesce per (user, story) while unread** — never one-notification-per-chapter (the drainer can add dozens at once).
- **Scope = a single implementation plan**: one migration + one sweep service/processor + small `NotificationsService`/frontend extensions. Estimated ~1–2 days.

## Architecture

```
auto-crawl drainer ──persists──> chapter rows (status: pending → crawled)
                                          │
        Bull repeatable job  ────sweeps every N min────┐
        "notify:new-chapters"                          ▼
   per story where maxReadableIdx > watermark:
       ├─ watermark NULL? → set baseline, send nothing   (no retroactive blast)
       └─ else → upsert one coalesced notification per bookmarker, advance watermark
                                          │
                          existing notification table + bell UI
                                          │
                       reader sees badge → clicks → next unread chapter
```

The sweep is the only new moving part on the backend; everything downstream (bell, badge, list, mark-read) already exists.

## Data model (one migration)

**`notification`** — add three nullable columns + a partial unique index. Existing `source_comment_id` / `actor_user_id` remain and are simply `NULL` for `new_chapter` rows.

| Column | Type | Notes |
|---|---|---|
| `story_id` | `uuid` NULL, FK→`story(id)` `ON DELETE CASCADE` | which story updated |
| `chapter_index` | `numeric(10,2)` NULL | latest readable index at notify time (matches `chapter.index` type — supports fractional chapters) |
| `new_count` | `integer NOT NULL DEFAULT 1` | how many new chapters this notification represents ("N chương mới") |

Partial unique index (enables the atomic coalescing upsert — at most one *unread* new-chapter notification per user per story):
```sql
CREATE UNIQUE INDEX notification_new_chapter_unread_uniq
  ON notification (user_id, story_id)
  WHERE type = 'new_chapter' AND read_at IS NULL;
```

**`story`** — add the per-story watermark:

| Column | Type | Notes |
|---|---|---|
| `last_notified_chapter_index` | `numeric(10,2)` NULL | high-water mark of the last *readable* chapter we notified about. `NULL` = never baselined. |

**`app_setting`** (singleton) — add the operator kill-switch, mirroring `auto_retry_enabled`:

| Column | Type | Notes |
|---|---|---|
| `new_chapter_notify_enabled` | `boolean NOT NULL DEFAULT true` | flip OFF to pause the sweep during an incident |

The sweep cron is a code constant (like the other repeatable jobs), not a setting — default `*/10 * * * *`.

> **Migration note (per CLAUDE.md):** schema files in `packages/db/src/schema/` use `.ts` cross-imports; append any new schema file to the explicit `drizzle.config.ts` `schema:` array. Here we only modify existing files (`comment.ts` for `notification`, `story.ts`, `app-setting.ts`), so no array change. Generate the migration with `drizzle-kit`; never hand-write SQL except the partial-index + CHECK that drizzle can't express, applied as raw SQL in the generated migration.

## The sweep job (`notify:new-chapters`)

A Bull repeatable job registered alongside the existing repeatable jobs. On each tick:

1. **Guard:** if `app_setting.new_chapter_notify_enabled` is false → no-op return.
2. **Find candidates** — stories whose latest readable chapter exceeds the watermark:
   ```sql
   SELECT s.id, s.last_notified_chapter_index AS watermark,
          mx.max_idx, mx.new_count
   FROM story s
   JOIN LATERAL (
     SELECT max(c.index) AS max_idx,
            count(*) FILTER (
              WHERE c.index > coalesce(s.last_notified_chapter_index, -1)
            ) AS new_count
     FROM chapter c
     WHERE c.story_id = s.id AND c.status = 'crawled'
   ) mx ON true
   WHERE mx.max_idx > coalesce(s.last_notified_chapter_index, -1);
   ```
   (Indexing/`EXPLAIN` to be validated in the plan; `chapter_story_index_uniq` on `(story_id, index)` already supports the per-story max.)
3. **Per candidate story:**
   - **Baseline (watermark `IS NULL`):** `UPDATE story SET last_notified_chapter_index = :max_idx` and send nothing. This silently baselines every existing story on the first sweep after deploy and every brand-new import on its first sweep — so we never blast a backlog.
   - **Real advance:** fan out with one set-based upsert, then advance the watermark:
     ```sql
     INSERT INTO notification (user_id, type, story_id, chapter_index, new_count)
     SELECT b.user_id, 'new_chapter', :story_id, :max_idx, :new_count
     FROM bookmark b
     WHERE b.story_id = :story_id
     ON CONFLICT (user_id, story_id) WHERE type = 'new_chapter' AND read_at IS NULL
     DO UPDATE SET chapter_index = EXCLUDED.chapter_index,
                   new_count     = notification.new_count + EXCLUDED.new_count,
                   created_at    = now();

     UPDATE story SET last_notified_chapter_index = :max_idx WHERE id = :story_id;
     ```
4. Record `last_run_at` / `last_run_count` (stories processed) on `app_setting` for observability (reuses the existing columns; if contended with auto-refresh, the plan may add dedicated columns — decided at plan time).

Fan-out is set-based (one `INSERT…SELECT` per advanced story), not a per-user loop — fine at the project's 100–1000-user scale.

## API + frontend

- **`NotificationsService.listNotifications`** — add a `LEFT JOIN story st ON st.id = n.story_id` and select `st.slug`. For `new_chapter` rows, also resolve the deep-link target chapter = the reader's next unread on that story: `floor(reading_progress.chapter_index) + 1` (LEFT JOIN `reading_progress` on `(user_id, story_id)`), clamped to `chapter_index` (the latest); fallback to `1` when no progress, fallback to the story-detail page when even chapter 1 can't be resolved.
- **`NotificationItem` interface (`api/notifications.ts`)** — becomes a discriminated union on `type`:
  - `comment_reply` / `comment_mention` → existing `sourceComment` shape (unchanged).
  - `new_chapter` → `{ story: { slug, title }, latestChapterIndex, newCount, targetChapterIndex }`, `actor: null`.
- **`NotificationItem.tsx`** — render the `new_chapter` branch: a Lucide book/bell-plus glyph (system notification, no avatar), copy like **"{storyTitle} — {newCount} chương mới"**, relative time, `href` to `/truyen/{slug}/chuong/{targetChapterIndex}`. Unread styling (`bg-accent/5`) unchanged.
- **`NotificationBell`** — unchanged. Its unread badge counts all unread notifications, so `new_chapter` rows are included automatically.
- **Swagger** — the `new_chapter` variant documented on the existing `/me/notifications` response.

## Edge cases

- **Backlog flood** → coalescing (one unread row per user/story; `new_count` summed) means a 50-chapter drain = one "50 chương mới" notification, not 50 rows.
- **Retroactive blast at launch / fresh import** → the baseline guard (watermark `NULL` → set, don't send) covers both.
- **Bookmark-after-the-fact** → a user who follows a story whose watermark has already advanced inherits that watermark and receives only *future* updates. This is the intended "follow from now on" semantics (we don't notify about chapters that existed before they followed).
- **Fractional chapters** (e.g. `10.5`) → handled by using `numeric(10,2)` for the watermark, identical to `chapter.index`.
- **Story deleted** → notifications cascade (`ON DELETE CASCADE`).
- **Already read** → `markRead` (unchanged) clears the row; the *next* advance creates a fresh unread row (the partial unique index only constrains *unread* rows).
- **Chapter re-crawl / index correction** → because the watermark only moves forward and counts `index > watermark`, a re-crawl of an already-notified chapter does not re-notify.
- **Kill-switch OFF** → sweep no-ops; watermarks freeze; flipping back ON resumes from the frozen watermark (no missed-window blast beyond normal coalescing).

## Accessibility & UX

- The notification item is a real link with discernible text ("{title} — {N} chương mới"); the Lucide glyph is decorative (`aria-hidden`).
- Respects the existing bell dropdown's keyboard/focus behavior (no change).
- Vietnamese copy in JSX text only; all identifiers/types English (per project rule).

## Testing

- **Unit** (Vitest, matching the existing db/crawler/shared style — no fabricated frameworks):
  1. Baseline sweep on a story with crawled chapters + bookmarkers → **0** notifications created, watermark set to max index.
  2. After adding crawled chapters, sweep → **one** notification per bookmarker with correct `new_count` and `chapter_index`; watermark advanced.
  3. Second advance while the first is still unread → **still one** row per user, `new_count` summed, `chapter_index` updated.
  4. After `markRead`, a further advance → a **fresh** unread row.
  5. `pending`/`failed` chapters do **not** count toward `max`/`new_count`.
  6. Kill-switch OFF → sweep creates nothing.
- **Playwright MCP proof (controller):** as a seeded test user, bookmark a story; insert/crawl a new chapter and run the sweep; confirm the bell badge increments, the item renders the Vietnamese copy, and the link lands on the next unread chapter.
- Per-task gate: `pnpm -r typecheck` clean; the 30 existing unit tests stay green.

## Out of scope (YAGNI)

- Email digests / web push (approach C) — revisit later; this design leaves the door open.
- Passive "có chương mới" markers on `/tu-sach` (approach B) — can be added later off the same data.
- Per-user notification preferences / mute-per-story — only a global operator kill-switch now.
- Notifications for non-bookmarked stories, rating/comment-like events, or admin events.
