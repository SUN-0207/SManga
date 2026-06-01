# SManga Comments — Spec E

**Date:** 2026-06-01
**Depends on:** Plan A (tokens), Plan D (engagement signal precedent + login gate pattern)
**Spec type:** Feature add (single DB migration: 0010)

## Why this exists

Engagement (Plan D: views + ratings) gave readers passive ways to weigh in. Comments give them an active voice — the conversation around a story or chapter is what turns a reader site into a community. This was discussed during Plan D brainstorming as "Spec E (Comments full)" and explicitly deferred so views + rating could ship cleanly. Now both are live and the framework (auth gate, optimistic mutation pattern, throttle wiring, soft-delete tombstone idiom) is proven.

The operator asked for the "Comments (Spec E)" option after a state-of-the-app review on 2026-06-01.

## Decisions (locked from brainstorming)

| Topic | Decision |
|---|---|
| Scope | **Both per-story and per-chapter** (polymorphic single table via `target_type` + `target_id`) |
| Threading depth | **3 levels** — cấp 1 root, cấp 2 reply, cấp 3 reply-to-reply. Reply on cấp 3 stays at cấp 3 with `@user` prefix; no cấp 4. |
| Reactions | **Like only** in MVP (`comment_reaction.type` column future-proofs for `love`/`haha`) |
| Edit window | **5 minutes** after `created_at`. After that PATCH returns 403. Edit sets `edited_at`. |
| Deletion | **Soft delete** via `deleted_at`. Tombstone "Bình luận đã bị xoá" preserves thread structure; body remains in DB for moderation audit. Admin and owner can delete; admin path leaves `deleted_at` set on others' comments. |
| Notifications | **In-app dropdown only** (no email, no browser push). Polling every 30 s while tab focused. |
| Mention | `@username` autocomplete from **current thread participants only** (no global user search — privacy). Self-mention parses but skips notification. |
| Anonymous | Read OK, login required for all mutations + reactions |
| Rate limits | POST 10/hour, PATCH 20/hour, react 30/hour per user (existing `@nestjs/throttler`) |
| Sort | Newest-first chronological (no hot/top in MVP) |
| Body | Plain text, ≤ 2000 chars, BE sanitizes HTML entities, FE renders as text (no `dangerouslySetInnerHTML`) |
| Admin moderation | Admin can soft-delete any comment via the same DELETE endpoint (Roles guard). No report-queue UI in MVP. |
| Pagination | Root-level only (parent_id IS NULL), 20 roots per page. Replies under each root load full. |

## Data model

Migration `packages/db/src/migrations/0010_comments.sql`:

```sql
CREATE TYPE comment_target_type AS ENUM ('story', 'chapter');

CREATE TABLE "comment" (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  target_type  comment_target_type NOT NULL,
  target_id    uuid NOT NULL,
  parent_id    uuid REFERENCES "comment"(id) ON DELETE CASCADE,
  depth        smallint NOT NULL DEFAULT 1 CHECK (depth BETWEEN 1 AND 3),
  body         text NOT NULL,
  edited_at    timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX comment_target_idx ON "comment" (target_type, target_id, created_at DESC);
CREATE INDEX comment_parent_idx ON "comment" (parent_id);
CREATE INDEX comment_user_idx   ON "comment" (user_id, created_at DESC);

CREATE TABLE comment_reaction (
  comment_id uuid NOT NULL REFERENCES "comment"(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type       text NOT NULL DEFAULT 'like',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id, type)
);

CREATE TABLE notification (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type              text NOT NULL,
  source_comment_id uuid REFERENCES "comment"(id) ON DELETE CASCADE,
  actor_user_id     text REFERENCES "user"(id) ON DELETE SET NULL,
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notification_user_unread_idx ON notification (user_id, created_at DESC)
  WHERE read_at IS NULL;
```

Drizzle schema `packages/db/src/schema/comments.ts` declares matching tables. Append to `drizzle.config.ts` schema array per the standing workaround (CLAUDE.md #2).

**`target_id` is NOT a FK** by design: polymorphic association across `story` and `chapter`. Service-level validation checks existence before insert; a CASCADE on story/chapter would be ideal but unsupported by Postgres without a trigger. MVP accepts orphan risk (admin deletes story → comments stay; cleanup script can run later if needed).

## API surface

All under `/api/v1/`. Anon read, login mutate. New module `apps/api/src/modules/comments/` plus piggyback notifications under `user-data/notifications.*` (similar to how `me/stats` and `me/reading-progress` live together).

### Comments

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| `GET` | `/comments?targetType=story\|chapter&targetId=:uuid&page=1&limit=20` | optional | — | `{ items: CommentTree[], total: number, page, limit }` |
| `POST` | `/comments` | required | `{ targetType, targetId, parentId?: uuid, body: string }` | `201` + `CommentTree` (without `replies`) |
| `PATCH` | `/comments/:id` | required (own + ≤ 5 min) | `{ body: string }` | `CommentTree` with `editedAt` set |
| `DELETE` | `/comments/:id` | required (own or admin) | — | `204` (soft delete) |
| `POST` | `/comments/:id/react` | required | — | `{ likeCount: number, likedByMe: boolean }` (toggle) |

`CommentTree` shape:

```ts
type CommentTree = {
  id: string;
  userId: string;
  user: { id: string; name: string; image: string | null };
  targetType: 'story' | 'chapter';
  targetId: string;
  parentId: string | null;
  depth: 1 | 2 | 3;
  body: string | null;        // null when deletedAt is set
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;          // false for anonymous
  replies: CommentTree[];      // full nested for non-root; empty array for cấp 3
};
```

**GET implementation**: 2-pass build in service. Fetch flat comment list ordered `(parent_id NULLS FIRST, created_at DESC)`, build tree in JS by grouping replies under parents. Aggregate `likeCount` via subquery JOIN `comment_reaction`. `likedByMe` checked once when `request.user` exists.

**POST validation**:
- `targetId` exists in the corresponding table (`story` or `chapter` based on `targetType`)
- If `parentId` provided: parent exists, parent's `targetType+targetId` matches, parent's `depth < 3` OR (parent.depth === 3 → new comment depth = 3 with `@user` prefix client-side conventions; server stores `parentId = parent.id` regardless)
- `body.trim().length >= 1 && body.length <= 2000`
- Sanitize HTML entities (`<`, `>`, `&`) — store as plaintext

**PATCH guard**: `created_at > now() - interval '5 minutes'` AND `user_id = request.user.id` AND `deleted_at IS NULL`. Returns 403 otherwise.

**Notifications dispatch** (inside POST transaction):
- If `parentId` set and parent owner ≠ current user → INSERT `notification` type=`'comment_reply'` for parent.user_id with `source_comment_id = new.id`, `actor_user_id = current.user.id`
- Regex extract `@(\w+)` from body; for each match, lookup user by `name` (case-insensitive); for each found user (skip self) → INSERT `notification` type=`'comment_mention'`

### Notifications

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| `GET` | `/me/notifications?unreadOnly=false&limit=30` | required | — | `{ items: Notification[], unreadCount: number }` |
| `POST` | `/me/notifications/read` | required | `{ ids?: string[] }` (omit = mark all) | `204` |

`Notification` shape:

```ts
type Notification = {
  id: string;
  type: 'comment_reply' | 'comment_mention';
  actor: { id: string; name: string; image: string | null } | null;  // null if actor deleted
  sourceComment: {
    id: string;
    targetType: 'story' | 'chapter';
    targetId: string;
    body: string | null;         // null if deleted
    parentId: string | null;
    storySlug: string | null;    // resolved server-side for click-through deep link
    chapterIndex: string | null; // when target_type='chapter'
  } | null;
  readAt: string | null;
  createdAt: string;
};
```

Click-through: FE builds URL based on `sourceComment.targetType`:
- story: `/truyen/${slug}#comment-${id}`
- chapter: `/truyen/${slug}/chuong/${chapterIndex}#comment-${id}`

Anchor scroll handled by `CommentSection` mounting effect (find `#comment-${id}` after data load, `scrollIntoView`).

### Admin

The existing user-admin pages don't need new routes. Admin uses the same `DELETE /comments/:id` — server checks `request.user.role === 'admin'` and bypasses owner check.

## Frontend integration

New files:

```
apps/frontend/src/
  api/comments.ts                          # 5 typed methods
  api/notifications.ts                     # 2 typed methods
  components/comments/
    CommentSection.tsx                     # form + list + pagination wrapper
    CommentForm.tsx                        # textarea + @mention autocomplete + submit
    CommentTree.tsx                        # recursive renderer (depth-aware)
    CommentItem.tsx                        # single comment + actions
    DeletedCommentItem.tsx                 # tombstone "[Bình luận đã bị xoá]"
  components/notifications/
    NotificationBell.tsx                   # badge + dropdown trigger
    NotificationItem.tsx                   # row inside dropdown
  hooks/use-mention-autocomplete.ts        # detect @ + suggest from thread participants
```

### Surfaces

1. **Story detail `/truyen/$slug`** — mount `<CommentSection targetType="story" targetId={s.id} />` after the existing ChapterList section. Reuses Pagination primitive.

2. **Chapter reader `/truyen/$slug/chuong/$index`** — mount `<CommentSection targetType="chapter" targetId={chapter.id} />` at end of content, before existing floating nav pill. Auto-hide chrome should NOT obscure comments (comments scroll naturally with content; only the chrome bar fades).

3. **NotificationBell** — added to both `DesktopTopNav` (between search icon and Avatar) and `ReaderHeader` mobile mini. Hidden when `useAuthStore.user === null`.

### Visual tokens (Plan A consistent)

- Avatar: 32×32, `rounded-full bg-bg-subtle border-border`
- Username: `font-semibold text-fg`
- Timestamp: `text-body-sm text-fg-muted` ("2 giờ trước" via Intl.RelativeTimeFormat 'vi')
- Body: `font-prose text-body whitespace-pre-wrap`
- Mention: `text-accent` + `<Link>` to `/ban` (anonymous user-ish profile route, MVP)
- Like icon: Lucide `Heart`; active = `fill-accent text-accent`; inactive = `text-fg-muted hover:text-fg`
- Reply button: Lucide `MessageCircle` + label "Trả lời"
- Edit/delete menu: Lucide `MoreHorizontal` button → dropdown with `Pencil` + `Trash2` items (own); admin extra `Trash2` "Xoá (admin)" item
- Tombstone: `bg-bg-subtle text-fg-muted italic px-4 py-2 rounded-md`
- Indent for cấp 2: `pl-10` (40 px); cấp 3: `pl-16` (64 px). Mobile: cấp 2 = `pl-6`, cấp 3 = `pl-10`.
- Notification badge: `absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-bg text-[10px]`
- Dropdown: `w-80 max-h-96 overflow-y-auto bg-bg-elevated border-border shadow-elev rounded-lg`

### @mention autocomplete

- Detect `@` in textarea; capture word after `@` (until space)
- Open popup positioned below caret (CSS `position: absolute; top: caret-y + line-height`)
- List top 5 participants from current thread (deduped from `replies` flat list) whose `name` starts with the typed prefix (case-insensitive)
- Arrow Up/Down to navigate, Enter or Tab to select (replaces partial word with `@${name} `), Escape to dismiss
- No global user search — keeps privacy + simple

### Polling

`useEffect` in `NotificationBell` mounts a `setInterval(refetch, 30_000)` plus `visibilitychange` listener: pauses polling when `document.hidden === true`, resumes on focus. Initial fetch on mount.

### State invalidation

- POST comment success → `queryClient.invalidateQueries(['comments', targetType, targetId])`
- PATCH / DELETE → same key
- React → optimistic update via `onMutate` (toggle `likedByMe` + `likeCount±1`), reconcile with server response in `onSuccess`
- Notification dropdown open → fetch fresh + POST `/me/notifications/read` with visible IDs to mark them read

## Edge cases

| Case | Handling |
|---|---|
| Reply at depth 3 | New comment stored depth=3, parent_id=clicked comment; FE auto-prepends `@user ` to body. UI renders at depth 3 indent (no cấp 4). |
| Owner deletes root with replies | Tombstone preserves slot; replies render normally. |
| Admin deletes any comment | Same soft-delete path; tombstone label "Bình luận đã bị xoá bởi admin" if `deleted_at_by !== user_id` (computed via `actor` field stored in audit log — defer to follow-up if needed; MVP just shows generic "đã bị xoá"). |
| User self-deletes account | CASCADE drops user's comments + reactions + notifications; replies under those comments survive (parent_id stays via the parent's CASCADE chain — replies still cascade-delete via parent's cascade, BUT we want soft-delete semantics; in MVP, hard-cascade is acceptable since user deletion is rare). |
| Edit past 5 min | API 403; FE disables Edit menu item visually after 5-min mark via setTimeout from `created_at`. |
| Empty body | FE submit disabled when `body.trim().length === 0`; BE validates same. 400 if hit directly. |
| Body > 2000 chars | FE shows counter at `>1500/2000` and blocks input at 2000; BE rejects 400. |
| Self-mention | Mention regex still matches; notification dispatch skips when target user = current user. |
| Non-existent mention | Lookup miss → no notification; text stays in body. |
| Comment on missing target | 404 BadRequest at POST. |
| Rate limit hit | 429 with `Retry-After`; FE toast "Bạn bình luận quá nhanh — thử lại sau N phút". |
| Concurrent edit by 2 tabs | Last write wins (PATCH overwrites `body` + bumps `edited_at`). |
| Notification for deleted actor | `actor_user_id` SET NULL via cascade; FE renders "[Người dùng đã xoá]". |
| Anonymous click "Trả lời" | Inline `<p>` message "Đăng nhập để bình luận" + `<Link>` to `/dang-nhap?redirect={current}`. |
| Anonymous click like | Same prompt. |
| Notification polling 401 | Catch in query `onError`; pause polling; drop badge; component still mounted but inert. |
| Long thread > 200 root | Pagination 20/page via existing `<Pagination>` component; URL `?commentsPage=N`. |
| Mobile chrome hides on chapter reader scroll | Comments live below content; no interference. |
| Anchor scroll on `#comment-{id}` | After data load `useEffect`: locate element + `scrollIntoView({ behavior: 'smooth', block: 'center' })`. |
| Story/chapter has 0 comments | `<CommentSection>` renders form + "Chưa có bình luận. Hãy là người đầu tiên!" message. |

## Acceptance criteria

1. Migration `0010_comments.sql` runs clean: `comment`, `comment_reaction`, `notification` tables + enum + indexes created.
2. `GET /api/v1/comments?targetType=story&targetId={uuid}` returns paginated tree with root comments (parent_id IS NULL) for that story; replies nested up to depth 3.
3. `GET /api/v1/comments?targetType=chapter&targetId={uuid}` returns the same shape, filtered to chapter target.
4. `POST /api/v1/comments` with `{targetType, targetId, body}` creates a depth-1 comment; response 201.
5. `POST /api/v1/comments` with `parentId` creates a reply; `depth = parent.depth + 1` (or 3 if parent.depth === 3).
6. `PATCH /api/v1/comments/:id` within 5 minutes of `created_at` updates `body` and sets `edited_at`. After 5 minutes returns 403.
7. `DELETE /api/v1/comments/:id` by owner soft-deletes (`deleted_at` set). Body stays in DB for moderation audit.
8. `DELETE /api/v1/comments/:id` by admin (different user) also succeeds.
9. `POST /api/v1/comments/:id/react` toggles like for current user; returns `{likeCount, likedByMe}`. Idempotent.
10. Mention `@username` in body inserts a `notification` row of type `comment_mention` for that user (skipping self-mention).
11. Replies insert a `notification` row of type `comment_reply` for the parent's owner (skipping self-reply).
12. `GET /api/v1/me/notifications` returns `{items, unreadCount}`; `?unreadOnly=true` filters to `read_at IS NULL`.
13. `POST /api/v1/me/notifications/read` with no body marks all as read; with `{ids: [...]}` marks the subset.
14. Story detail page shows `<CommentSection>` after ChapterList with the correct tree.
15. Chapter reader page shows `<CommentSection>` before the floating nav pill with the correct chapter-scoped tree.
16. NotificationBell mounted into DesktopTopNav + ReaderHeader; badge shows unreadCount > 0 in `bg-destructive`; dropdown lists items; polling every 30 s while tab focused.
17. @mention autocomplete pops up below the textarea caret, shows top 5 matching thread participants, supports Arrow/Enter/Tab/Escape.
18. Anonymous user clicking "Trả lời" or like shows inline login prompt with `/dang-nhap?redirect={current}` link.
19. Rate limit hit returns 429 with `Retry-After`; FE shows toast/inline message.
20. `pnpm --filter @smanga/api typecheck` and `pnpm --filter @smanga/frontend typecheck` both pass.

## Out of scope (defer to follow-up specs)

- Report-to-admin button + admin review queue
- Reactions beyond `like` (love, haha, sad, etc.)
- Comment search / filter
- Markdown or rich text (only plaintext + URL auto-link client-side rendering in MVP)
- Email notification
- Browser push (PWA / service worker)
- Global @mention search across all users
- Quote-and-reply on chapter passages
- Pinned comments
- Sort by hot/top/most-liked
- Real-time updates (WebSocket / SSE) — polling only
- Comment-level subscription (mute thread)
- @everyone or role mentions

## Risks + mitigations

- **Risk**: Tree-build pass slow for stories with thousands of comments. **Mitigation**: root-level pagination (20/page) bounds per-request load; even a viral root with 200 replies builds in < 50 ms with current indexes. If we hit 10k+ replies on a root, switch to lazy-load child branches.
- **Risk**: Spam — automated comment posting. **Mitigation**: 10/hour throttle per user + auth required; admin can mass-delete via DB if catastrophic. Captcha defer.
- **Risk**: XSS via `<script>` in body. **Mitigation**: BE sanitizes HTML entities; FE renders text only (no `dangerouslySetInnerHTML`); URL auto-link uses `<a>` with `rel="noopener noreferrer nofollow"`.
- **Risk**: Notification polling at 30 s × N users → BE load. **Mitigation**: pause when tab hidden; hobby scale 100-1000 users → < 50 RPS even peak. Postgres handles it via `notification_user_unread_idx` partial index.
- **Risk**: Mention regex collides with @ in story names. **Mitigation**: regex matches only `@\w+` (word chars); story names with non-word chars not vulnerable. Worst case = harmless false positive (no user found, no notification).
- **Risk**: Recursive tree displays cyclic if data corrupted. **Mitigation**: depth column enforces 1-3 cap server-side; build pass groups by parent_id with depth-clamp on render.
- **Risk**: User edits content past 5 min through API directly. **Mitigation**: server-side guard is authoritative; FE disable is UX only.

## Migration phases

1. **Phase E1 — BE: data + endpoints** (5 tasks)
   - T1: Migration 0010 + Drizzle schema (`comment`, `comment_reaction`, `notification`) + drizzle.config.ts + barrel
   - T2: CommentsService (CRUD + tree build + react toggle + mention/reply notification dispatch)
   - T3: CommentsController (5 endpoints + DTOs + throttle)
   - T4: NotificationsController + NotificationsService (list + markRead)
   - T5: Register `CommentsModule` + `NotificationsModule` in `AppModule`

2. **Phase E2 — FE: primitives** (6 tasks)
   - T6: api/comments.ts + api/notifications.ts clients
   - T7: CommentForm + use-mention-autocomplete hook
   - T8: CommentItem + DeletedCommentItem + edit/delete menu
   - T9: CommentTree recursive renderer (depth-aware)
   - T10: CommentSection wrapper (form + list + pagination)
   - T11: NotificationBell + NotificationItem dropdown

3. **Phase E3 — Integrations** (3 tasks)
   - T12: Mount CommentSection into story detail page
   - T13: Mount CommentSection into chapter reader page
   - T14: Mount NotificationBell into DesktopTopNav + ReaderHeader

Each phase = own commit set + local verify. **Push only when user explicitly says push.**
