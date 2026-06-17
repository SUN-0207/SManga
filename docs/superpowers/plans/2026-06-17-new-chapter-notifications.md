# New-Chapter Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a story a user has bookmarked gets new readable chapters, deliver a coalesced in-app notification ("Truyện X — N chương mới") through the existing notification bell, deep-linking to the reader's next unread chapter.

**Architecture:** A Bull repeatable job (mirroring `RetryReconcilerService`) sweeps every 10 min for stories whose latest *crawled* chapter advanced past a per-story watermark, then fans out one coalesced notification per follower via a partial-unique-index upsert. Reuses the existing `notification` table, `/me/notifications` API, and `NotificationBell` — only a `type='new_chapter'` and a few nullable columns are added. No external services.

**Tech Stack:** Drizzle ORM + Postgres, NestJS 11 + `@nestjs/bull` (Bull/Redis), Vite + React 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-17-new-chapter-notifications-design.md`

## Global Constraints

- **Readable chapter = `chapter.status = 'crawled'`** (enum is `['pending','crawled','failed']`). `pending`/`failed` never notify.
- **Follow = the existing `bookmark (user_id, story_id)` table.** No new follow concept.
- **Coalesce per (user, story) while unread** — never one-notification-per-chapter.
- **Schema via Drizzle .ts files**, then `drizzle-kit generate`. Raw SQL is allowed **only** inside the generated migration for the two things Drizzle can't express: the partial unique index predicate and the existing-row watermark backfill (documented escape hatch — same as migration `0001`'s `immutable_unaccent` and `app_setting`'s CHECK). Never hand-write app queries.
- **Cross-schema imports inside `packages/db/src/schema/*.ts` use `.ts` extensions** (CLAUDE.md workaround #1). `drizzle.config.ts` already lists `story.ts`, `app-setting.ts`, `comment.ts` — no array change needed.
- **English-only identifiers / filenames / types.** Vietnamese only in JSX text + URL slugs.
- **Commit only the files each task lists** (explicit `git add <path>`; never `git add -A`). `apps/frontend/vite.config.ts` carries a permanent uncommitted local proxy edit → **never commit it**.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Do NOT push or amend** without explicit user instruction. lefthook pre-commit runs `biome check` + `pnpm -r typecheck`.
- **Local dev env:** API runs on `PORT=3010` (OPSWAT holds 3001). DB/Redis envs for migrate/dev:
  `$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"`, `$env:REDIS_URL = "redis://localhost:6379"`.

---

## Task 1: Schema + migration (notification columns, story watermark, kill-switch)

**Files:**
- Modify: `packages/db/src/schema/comment.ts` (the `notification` table)
- Modify: `packages/db/src/schema/story.ts`
- Modify: `packages/db/src/schema/app-setting.ts`
- Create (generated, then hand-edited): `packages/db/src/migrations/00XX_*.sql` (+ journal entry)

**Interfaces:**
- Produces: `notification.storyId` (uuid, null), `notification.chapterIndex` (numeric(10,2), null), `notification.newCount` (int, default 1), partial unique index `notification_new_chapter_unread_uniq` on `(user_id, story_id) WHERE type='new_chapter' AND read_at IS NULL`; `story.lastNotifiedChapterIndex` (numeric(10,2), null); `appSetting.newChapterNotifyEnabled` (bool, default true).

- [ ] **Step 1: Extend the `notification` table in `packages/db/src/schema/comment.ts`**

Update the imports line (add `integer`, `numeric`, `uniqueIndex`) and add a `story` import, then replace the `notification` definition:

```ts
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
// Internal cross-schema imports MUST use .ts extensions (CLAUDE.md workaround #1)
import { user } from './auth.ts';
import { commentTargetTypeEnum } from './enums.ts';
import { story } from './story.ts';
```

Replace the `export const notification = pgTable('notification', { ... });` block with:

```ts
export const notification = pgTable(
  'notification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    sourceCommentId: uuid('source_comment_id').references(() => comment.id, {
      onDelete: 'cascade',
    }),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    // new_chapter notifications: which story updated + the latest crawled index +
    // how many new chapters this (coalesced) row represents. NULL for comment rows.
    storyId: uuid('story_id').references(() => story.id, { onDelete: 'cascade' }),
    chapterIndex: numeric('chapter_index', { precision: 10, scale: 2 }),
    newCount: integer('new_count').notNull().default(1),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // At most ONE unread new_chapter notification per (user, story) — the target
    // of the coalescing ON CONFLICT upsert in the sweep. Once read, a new advance
    // creates a fresh row (the predicate only constrains unread rows).
    newChapterUnreadUniq: uniqueIndex('notification_new_chapter_unread_uniq')
      .on(t.userId, t.storyId)
      .where(sql`type = 'new_chapter' AND read_at IS NULL`),
  }),
);
```

- [ ] **Step 2: Add the watermark to `packages/db/src/schema/story.ts`**

Add `numeric` to the `drizzle-orm/pg-core` import list, then add this column to the `story` table definition (e.g. right after `viewCount`):

```ts
    /** High-water mark of the last CRAWLED chapter index we've sent new-chapter
     *  notifications for. NULL = not yet baselined (the sweep baselines without
     *  notifying, so a fresh import never blasts its backlog). */
    lastNotifiedChapterIndex: numeric('last_notified_chapter_index', { precision: 10, scale: 2 }),
```

- [ ] **Step 3: Add the kill-switch to `packages/db/src/schema/app-setting.ts`**

Add this column to the `appSetting` table (e.g. right after `autoCrawlWatermark`):

```ts
  /** Kill switch for the new-chapter notification sweep. Default ON — purely
   *  additive + safe; flip OFF to pause notifications during an incident. */
  newChapterNotifyEnabled: boolean('new_chapter_notify_enabled').notNull().default(true),
```

- [ ] **Step 4: Generate the migration**

Run:
```powershell
pnpm --filter @smanga/db generate
```
Expected: a new `packages/db/src/migrations/00XX_*.sql` file is created and `meta/_journal.json` updated. Note the `00XX` number.

- [ ] **Step 5: Verify the partial-index predicate landed; hand-add it if missing**

Open the generated `00XX_*.sql`. Confirm it contains the partial unique index **with the WHERE predicate**, e.g.:
```sql
CREATE UNIQUE INDEX "notification_new_chapter_unread_uniq"
  ON "notification" ("user_id","story_id") WHERE type = 'new_chapter' AND read_at IS NULL;
```
If drizzle-kit emitted the index **without** the `WHERE` clause (older kit versions drop predicates), edit the generated SQL to add ` WHERE type = 'new_chapter' AND read_at IS NULL` before the trailing `;`. The predicate is load-bearing — without it the unique index would forbid a second (read) notification per story.

- [ ] **Step 6: Hand-add the existing-row watermark backfill**

Append this backfill to the END of the generated `00XX_*.sql` so existing stories baseline at deploy (the runtime baseline-guard still covers future imports — defense in depth):

```sql
--> statement-breakpoint
UPDATE "story" s SET "last_notified_chapter_index" = sub.max_idx
FROM (
  SELECT story_id, max(index) AS max_idx
  FROM "chapter" WHERE status = 'crawled' GROUP BY story_id
) sub
WHERE s.id = sub.story_id;
```

- [ ] **Step 7: Apply the migration locally and typecheck**

Ensure Postgres is up (`pnpm dev:db`), then:
```powershell
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm --filter @smanga/db migrate
pnpm --filter @smanga/db typecheck
```
Expected: migration applies with no error; typecheck clean. Sanity-check the index exists:
```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "\d notification"
```
Expected: lists `story_id`, `chapter_index`, `new_count` columns and the `notification_new_chapter_unread_uniq` partial unique index.

- [ ] **Step 8: Commit**

```powershell
git add packages/db/src/schema/comment.ts packages/db/src/schema/story.ts packages/db/src/schema/app-setting.ts packages/db/src/migrations
git commit -m "feat(db): notification new_chapter columns + story notify watermark + kill-switch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: The notify sweep (Bull repeatable job) + queue constants

**Files:**
- Modify: `apps/api/src/modules/queue/queue.constants.ts`
- Create: `apps/api/src/modules/jobs/notify-new-chapters.service.ts`
- Create: `apps/api/src/modules/jobs/notify-new-chapters.service.spec.ts`
- Modify: `apps/api/src/modules/jobs/jobs.module.ts`

**Interfaces:**
- Consumes: `notification`/`story`/`bookmark`/`appSetting` schema from Task 1; `QUEUE_CRAWLER`, `JOB_PRIORITY`, `withRedisReadyRetry`, `DRIZZLE`.
- Produces: `NotifyNewChaptersService` with `handle(job): Promise<{ notified: number; baselined: number; skipped: boolean }>`; constants `JOB_NOTIFY_NEW_CHAPTERS`, `JOB_PRIORITY.NOTIFY_NEW_CHAPTERS`.

- [ ] **Step 1: Add the job name + priority in `apps/api/src/modules/queue/queue.constants.ts`**

After the `JOB_AUTOCRAWL_FEED` line add:
```ts
export const JOB_NOTIFY_NEW_CHAPTERS = 'notify-new-chapters';
```
Inside the `JOB_PRIORITY` object, after `RETRY_RECONCILER: 2,` add:
```ts
  // Notify sweep — light DB work; deferrable behind all crawl jobs but ahead of
  // the background backlog drain so it ticks promptly.
  NOTIFY_NEW_CHAPTERS: 22,
```

- [ ] **Step 2: Write the failing unit test `apps/api/src/modules/jobs/notify-new-chapters.service.spec.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { NotifyNewChaptersService } from './notify-new-chapters.service';

/** Mock db.select().from().where().limit() → the kill-switch read. */
function selectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return () => chain;
}

/** Mock db.execute() returning a canned result array per call, in order. */
function makeExecute(results: unknown[][]) {
  let call = 0;
  return vi.fn(() => Promise.resolve(results[call++] ?? []));
}

describe('NotifyNewChaptersService.handle', () => {
  it('no-ops when new_chapter_notify is disabled', async () => {
    const execute = vi.fn();
    const db = { select: vi.fn(selectChain([{ enabled: false }])), execute } as never;
    const svc = new NotifyNewChaptersService(db, {} as never);
    const res = await svc.handle({} as never);
    expect(res).toEqual({ notified: 0, baselined: 0, skipped: true });
    expect(execute).not.toHaveBeenCalled();
  });

  it('baselines a story with a NULL watermark WITHOUT notifying', async () => {
    const execute = makeExecute([
      [{ id: 's1', watermark: null, max_idx: '10', new_count: 5 }], // candidates
      [], // watermark UPDATE
    ]);
    const db = { select: vi.fn(selectChain([{ enabled: true }])), execute } as never;
    const svc = new NotifyNewChaptersService(db, {} as never);
    const res = await svc.handle({} as never);
    expect(res).toEqual({ notified: 0, baselined: 1, skipped: false });
    expect(execute).toHaveBeenCalledTimes(2); // candidates + baseline UPDATE, NO insert
  });

  it('fans out one notification per bookmarker on a real advance', async () => {
    const execute = makeExecute([
      [{ id: 's1', watermark: '5', max_idx: '10', new_count: 5 }], // candidates
      [{ user_id: 'u1' }, { user_id: 'u2' }], // upsert RETURNING
      [], // watermark UPDATE
    ]);
    const db = { select: vi.fn(selectChain([{ enabled: true }])), execute } as never;
    const svc = new NotifyNewChaptersService(db, {} as never);
    const res = await svc.handle({} as never);
    expect(res).toEqual({ notified: 2, baselined: 0, skipped: false });
    expect(execute).toHaveBeenCalledTimes(3); // candidates + upsert + watermark UPDATE
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @smanga/api test -- notify-new-chapters`
Expected: FAIL — `Cannot find module './notify-new-chapters.service'`.

- [ ] **Step 4: Implement `apps/api/src/modules/jobs/notify-new-chapters.service.ts`**

```ts
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  JOB_NOTIFY_NEW_CHAPTERS,
  JOB_PRIORITY,
  QUEUE_CRAWLER,
} from '@/modules/queue/queue.constants';
import { withRedisReadyRetry } from '@/modules/queue/redis-ready';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Inject, Logger, type OnModuleInit } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { appSetting } from '@smanga/db/schema';
import type { Job, Queue } from 'bull';
import { eq, sql } from 'drizzle-orm';

const NOTIFY_REPEATABLE_KEY = 'notify-new-chapters-cron';
const NOTIFY_CRON = '*/10 * * * *'; // every 10 minutes
const NOTIFY_BATCH_CAP = 2000; // backstop on candidate stories per tick

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

interface Candidate {
  id: string;
  watermark: string | null;
  max_idx: string;
  new_count: number;
}

@Processor(QUEUE_CRAWLER)
export class NotifyNewChaptersService implements OnModuleInit {
  private readonly logger = new Logger(NotifyNewChaptersService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  /** Install the repeatable once at boot. The kill switch is checked inside
   *  handle(), so toggling off never touches the registry — the tick no-ops. */
  async onModuleInit(): Promise<void> {
    try {
      const repeatables = await this.queue.getRepeatableJobs();
      for (const r of repeatables) {
        if (r.id === NOTIFY_REPEATABLE_KEY) {
          await this.queue.removeRepeatableByKey(r.key);
        }
      }
    } catch (err) {
      this.logger.warn(`notify repeatable cleanup failed: ${(err as Error).message}`);
    }
    // Retry while Redis is still LOADING after a co-restart (see redis-ready.ts) —
    // an unhandled throw here would crash-loop the API at boot.
    await withRedisReadyRetry(
      () =>
        this.queue.add(
          JOB_NOTIFY_NEW_CHAPTERS,
          {},
          {
            repeat: { cron: NOTIFY_CRON, tz: 'Asia/Ho_Chi_Minh' },
            jobId: NOTIFY_REPEATABLE_KEY,
            priority: JOB_PRIORITY.NOTIFY_NEW_CHAPTERS,
            removeOnComplete: true,
            removeOnFail: 50,
          },
        ),
      { logger: this.logger, label: 'notify-new-chapters repeatable install' },
    );
    this.logger.log(`notify-new-chapters repeatable installed cron="${NOTIFY_CRON}"`);
  }

  @Process(JOB_NOTIFY_NEW_CHAPTERS)
  async handle(_job: Job): Promise<{ notified: number; baselined: number; skipped: boolean }> {
    const [config] = await this.db
      .select({ enabled: appSetting.newChapterNotifyEnabled })
      .from(appSetting)
      .where(eq(appSetting.id, 1))
      .limit(1);
    if (!config?.enabled) {
      this.logger.log('notify-new-chapters skipped — disabled');
      return { notified: 0, baselined: 0, skipped: true };
    }

    // Stories whose latest CRAWLED chapter index exceeds the watermark.
    const candidates = rowsOf<Candidate>(
      await this.db.execute(sql`
        SELECT s.id::text AS id,
               s.last_notified_chapter_index::text AS watermark,
               mx.max_idx::text AS max_idx,
               mx.new_count
        FROM story s
        JOIN LATERAL (
          SELECT max(c.index) AS max_idx,
                 count(*) FILTER (
                   WHERE c.index > coalesce(s.last_notified_chapter_index, -1)
                 )::int AS new_count
          FROM chapter c
          WHERE c.story_id = s.id AND c.status = 'crawled'
        ) mx ON true
        WHERE mx.max_idx IS NOT NULL
          AND mx.max_idx > coalesce(s.last_notified_chapter_index, -1)
        LIMIT ${NOTIFY_BATCH_CAP}
      `),
    );

    let notified = 0;
    let baselined = 0;
    for (const c of candidates) {
      if (c.watermark === null) {
        // Baseline: record the high-water mark without notifying.
        await this.db.execute(sql`
          UPDATE story SET last_notified_chapter_index = ${c.max_idx}::numeric
          WHERE id = ${c.id}::uuid
        `);
        baselined += 1;
        continue;
      }
      // Real advance: coalesced fan-out to every bookmarker, then advance watermark.
      const inserted = rowsOf<{ user_id: string }>(
        await this.db.execute(sql`
          INSERT INTO notification (user_id, type, story_id, chapter_index, new_count)
          SELECT b.user_id, 'new_chapter', ${c.id}::uuid, ${c.max_idx}::numeric, ${c.new_count}
          FROM bookmark b
          WHERE b.story_id = ${c.id}::uuid
          ON CONFLICT (user_id, story_id) WHERE type = 'new_chapter' AND read_at IS NULL
          DO UPDATE SET chapter_index = EXCLUDED.chapter_index,
                        new_count     = notification.new_count + EXCLUDED.new_count,
                        created_at    = now()
          RETURNING user_id
        `),
      );
      await this.db.execute(sql`
        UPDATE story SET last_notified_chapter_index = ${c.max_idx}::numeric
        WHERE id = ${c.id}::uuid
      `);
      notified += inserted.length;
    }

    if (candidates.length === NOTIFY_BATCH_CAP) {
      this.logger.warn(`notify-new-chapters hit batch cap (${NOTIFY_BATCH_CAP}); more next tick`);
    }
    this.logger.log(
      `notify-new-chapters: ${candidates.length} stories, ${baselined} baselined, ${notified} notifications`,
    );
    return { notified, baselined, skipped: false };
  }
}
```

- [ ] **Step 5: Register the service in `apps/api/src/modules/jobs/jobs.module.ts`**

Add the import and append to `providers`:
```ts
import { NotifyNewChaptersService } from './notify-new-chapters.service';
```
```ts
  providers: [JobsService, JobFailureListener, RetryReconcilerService, NotifyNewChaptersService],
```

- [ ] **Step 6: Run the test to verify it passes + typecheck**

Run: `pnpm --filter @smanga/api test -- notify-new-chapters`
Expected: 3 passing.
Run: `pnpm --filter @smanga/api typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/src/modules/queue/queue.constants.ts apps/api/src/modules/jobs/notify-new-chapters.service.ts apps/api/src/modules/jobs/notify-new-chapters.service.spec.ts apps/api/src/modules/jobs/jobs.module.ts
git commit -m "feat(api): new-chapter notification sweep (coalesced fan-out to bookmarkers)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Backend — render the `new_chapter` variant in listNotifications

**Files:**
- Modify: `apps/api/src/modules/comments/notifications.service.ts`

**Interfaces:**
- Consumes: `notification.story_id` / `chapter_index` / `new_count` from Task 1; `bookmark`, `reading_progress`, `story` tables.
- Produces: `NotificationItem.type` now includes `'new_chapter'`; `NotificationItem.newChapter: { storySlug: string; storyTitle: string; newCount: number; targetChapterIndex: string } | null`.

- [ ] **Step 1: Extend the `NotificationItem` interface**

In `apps/api/src/modules/comments/notifications.service.ts`, change the `type` union and add the `newChapter` field:
```ts
export interface NotificationItem {
  id: string;
  type: 'comment_reply' | 'comment_mention' | 'new_chapter';
  actor: { id: string; name: string; image: string | null } | null;
  sourceComment: {
    id: string;
    targetType: 'story' | 'chapter';
    targetId: string;
    body: string | null;
    parentId: string | null;
    storySlug: string | null;
    chapterIndex: string | null;
  } | null;
  newChapter: {
    storySlug: string;
    storyTitle: string;
    newCount: number;
    targetChapterIndex: string;
  } | null;
  readAt: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Extend the SELECT in `listNotifications`**

Add these columns to the row type and the SELECT, plus two LEFT JOINs. Add to the `rowsOf<{...}>` generic:
```ts
      nc_slug: string | null;
      nc_title: string | null;
      nc_new_count: number | null;
      nc_target_index: string | null;
```
In the SQL `SELECT` list (after the `chapter_index` CASE block, before `FROM notification n`), add:
```sql
          ,st.slug  AS nc_slug
          ,st.title AS nc_title
          ,n.new_count AS nc_new_count
          ,CASE WHEN n.type = 'new_chapter' THEN
             greatest(
               least(floor(coalesce(rp.chapter_index, 0))::int + 1, floor(n.chapter_index)::int),
               1
             )::text
           END AS nc_target_index
```
And after the existing `LEFT JOIN "comment" sc ON sc.id = n.source_comment_id` line, add:
```sql
        LEFT JOIN story st ON st.id = n.story_id
        LEFT JOIN reading_progress rp ON rp.user_id = n.user_id AND rp.story_id = n.story_id
```

- [ ] **Step 3: Populate `newChapter` in the `.map()`**

In the `items` map, add the `newChapter` field:
```ts
      newChapter:
        r.type === 'new_chapter' && r.nc_slug
          ? {
              storySlug: r.nc_slug,
              storyTitle: r.nc_title ?? '',
              newCount: Number(r.nc_new_count ?? 1),
              targetChapterIndex: r.nc_target_index ?? '1',
            }
          : null,
```
And widen the existing `type:` cast: `type: r.type as NotificationItem['type'],`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @smanga/api typecheck`
Expected: clean. (Behavior is verified end-to-end in Task 6; this is a raw-SQL query extension with no isolated unit test, matching the existing untested `notifications.service`.)

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/comments/notifications.service.ts
git commit -m "feat(api): surface new_chapter notifications in /me/notifications

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Frontend — render new-chapter notifications

**Files:**
- Modify: `apps/frontend/src/api/notifications.ts`
- Modify: `apps/frontend/src/components/notifications/NotificationItem.tsx`

**Interfaces:**
- Consumes: the `newChapter` shape from Task 3.
- Produces: `Notification.type` includes `'new_chapter'`; `Notification.newChapter` field; `NotificationItem.tsx` renders the new branch.

- [ ] **Step 1: Extend the frontend type in `apps/frontend/src/api/notifications.ts`**

Add a `NotificationNewChapter` interface and extend `Notification`:
```ts
export interface NotificationNewChapter {
  storySlug: string;
  storyTitle: string;
  newCount: number;
  targetChapterIndex: string;
}

export interface Notification {
  id: string;
  type: 'comment_reply' | 'comment_mention' | 'new_chapter';
  actor: { id: string; name: string; image: string | null } | null;
  sourceComment: NotificationSourceComment | null;
  newChapter: NotificationNewChapter | null;
  readAt: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Add the `new_chapter` branch in `apps/frontend/src/components/notifications/NotificationItem.tsx`**

Add the import:
```tsx
import { BookOpen } from 'lucide-react';
```
At the TOP of the component body (before the existing comment-message logic), add an early return for new-chapter notifications:
```tsx
  if (n.type === 'new_chapter' && n.newChapter) {
    const nc = n.newChapter;
    const ncHref = `/truyen/${nc.storySlug}/chuong/${nc.targetChapterIndex}`;
    return (
      <a
        href={ncHref}
        onClick={onClick}
        className={`flex flex-col gap-1 px-4 py-3 text-left transition-colors duration-fast hover:bg-bg-subtle cursor-pointer ${
          !n.readAt ? 'bg-accent/5' : ''
        }`}
      >
        <p className="text-body-sm text-fg leading-snug flex items-start gap-1.5">
          <BookOpen className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" aria-hidden />
          <span>
            <span className="font-medium">{nc.storyTitle}</span> — {nc.newCount} chương mới
          </span>
        </p>
        <p className="text-[11px] text-fg-subtle">{formatRelativeTime(n.createdAt)}</p>
      </a>
    );
  }
```

- [ ] **Step 3: Typecheck + lint**

Run:
```powershell
pnpm --filter @smanga/frontend typecheck
pnpm exec biome check --write apps/frontend/src/api/notifications.ts apps/frontend/src/components/notifications/NotificationItem.tsx
```
Expected: typecheck clean; biome reports no remaining errors.

- [ ] **Step 4: Commit**

```powershell
git add apps/frontend/src/api/notifications.ts apps/frontend/src/components/notifications/NotificationItem.tsx
git commit -m "feat(frontend): render new-chapter notifications in the bell

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Operator kill-switch (admin settings toggle)

**Files:**
- Create: `apps/api/src/modules/app-settings/dto/update-new-chapter-notify.dto.ts`
- Create: `apps/api/src/modules/app-settings/new-chapter-notify.controller.ts`
- Modify: `apps/api/src/modules/app-settings/app-settings.service.ts`
- Modify: `apps/api/src/modules/app-settings/app-settings.module.ts`
- Modify: `apps/api/src/modules/app-settings/auto-retry.spec.ts` (add the new toggle's unit tests)
- Modify: `apps/frontend/src/api/settings.ts`
- Modify: `apps/frontend/src/routes/admin/settings.tsx`

**Interfaces:**
- Consumes: `appSetting.newChapterNotifyEnabled` from Task 1.
- Produces: `GET/PATCH /api/v1/admin/settings/new-chapter-notify`; service `getNewChapterNotify()/setNewChapterNotify(enabled)`; frontend `getNewChapterNotify()/updateNewChapterNotify()`.

- [ ] **Step 1: Create the DTO `apps/api/src/modules/app-settings/dto/update-new-chapter-notify.dto.ts`**

(Mirror `update-auto-retry.dto.ts`.)
```ts
import { IsBoolean } from 'class-validator';

export class UpdateNewChapterNotifyDto {
  @IsBoolean()
  enabled!: boolean;
}
```

- [ ] **Step 2: Add service methods in `apps/api/src/modules/app-settings/app-settings.service.ts`**

After `setAutoCrawl(...)`, add (mirrors `getAutoRetry`/`setAutoRetry`):
```ts
  async getNewChapterNotify(): Promise<{ newChapterNotifyEnabled: boolean }> {
    const s = await this.getOrSeed();
    return { newChapterNotifyEnabled: s.newChapterNotifyEnabled };
  }

  async setNewChapterNotify(enabled: boolean): Promise<{ newChapterNotifyEnabled: boolean }> {
    const [updated] = await this.db
      .update(appSetting)
      .set({ newChapterNotifyEnabled: enabled, updatedAt: new Date() })
      .where(eq(appSetting.id, 1))
      .returning();
    if (!updated) throw new BadRequestException('app_setting row missing — re-run migrations');
    return { newChapterNotifyEnabled: updated.newChapterNotifyEnabled };
  }
```

- [ ] **Step 3: Create the controller `apps/api/src/modules/app-settings/new-chapter-notify.controller.ts`**

(Mirror `auto-retry.controller.ts`.)
```ts
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppSettingsService } from './app-settings.service';
import { UpdateNewChapterNotifyDto } from './dto/update-new-chapter-notify.dto';

@ApiTags('admin/settings')
@Controller({ path: 'admin/settings/new-chapter-notify', version: '1' })
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
export class NewChapterNotifyController {
  constructor(private readonly settings: AppSettingsService) {}

  @Get()
  get() {
    return this.settings.getNewChapterNotify();
  }

  @Patch()
  update(@Body() dto: UpdateNewChapterNotifyDto) {
    return this.settings.setNewChapterNotify(dto.enabled);
  }
}
```

- [ ] **Step 4: Register the controller in `apps/api/src/modules/app-settings/app-settings.module.ts`**

Add the import and append to the `controllers` array:
```ts
import { NewChapterNotifyController } from './new-chapter-notify.controller';
```
```ts
  controllers: [
    AppSettingsController,
    AutoRetryController,
    AutoCrawlController,
    NewChapterNotifyController,
  ],
```

- [ ] **Step 5: Add the failing service unit tests to `apps/api/src/modules/app-settings/auto-retry.spec.ts`**

Append a new `describe` (reuses the file's `selectChain`/`updateReturning` helpers):
```ts
describe('AppSettingsService new-chapter-notify toggle', () => {
  it('getNewChapterNotify reads the persisted flag', async () => {
    const db = { select: vi.fn(selectChain([{ newChapterNotifyEnabled: true }])) } as never;
    const svc = new AppSettingsService(db, {} as never);
    expect(await svc.getNewChapterNotify()).toEqual({ newChapterNotifyEnabled: true });
  });

  it('setNewChapterNotify persists the flag and echoes it back', async () => {
    const { update, set } = updateReturning([{ newChapterNotifyEnabled: false }]);
    const db = { update } as never;
    const svc = new AppSettingsService(db, {} as never);
    const res = await svc.setNewChapterNotify(false);
    expect(res).toEqual({ newChapterNotifyEnabled: false });
    expect((set.mock.calls as unknown[][])[0]?.[0]).toMatchObject({
      newChapterNotifyEnabled: false,
    });
  });
});
```

- [ ] **Step 6: Run the API tests + typecheck**

Run: `pnpm --filter @smanga/api test -- auto-retry`
Expected: the new 2 tests pass alongside the existing auto-retry tests.
Run: `pnpm --filter @smanga/api typecheck`
Expected: clean.

- [ ] **Step 7: Add the frontend API client in `apps/frontend/src/api/settings.ts`**

Append:
```ts
export interface NewChapterNotifySetting {
  newChapterNotifyEnabled: boolean;
}

export async function getNewChapterNotify(): Promise<NewChapterNotifySetting> {
  const res = await api.get<NewChapterNotifySetting>('/admin/settings/new-chapter-notify');
  return res.data;
}

export async function updateNewChapterNotify(enabled: boolean): Promise<NewChapterNotifySetting> {
  const res = await api.patch<NewChapterNotifySetting>('/admin/settings/new-chapter-notify', {
    enabled,
  });
  return res.data;
}
```

- [ ] **Step 8: Add the toggle card to `apps/frontend/src/routes/admin/settings.tsx`**

Update the import from `@/api/settings` to also pull `getNewChapterNotify`, `updateNewChapterNotify`, and the type `NewChapterNotifySetting`. Add a query in `AdminSettingsPage` next to `autoCrawlQ`:
```tsx
  const notifyQ = useQuery({
    queryKey: ['admin', 'settings', 'new-chapter-notify'],
    queryFn: getNewChapterNotify,
  });
```
Render it after the `AutoCrawlCard` block:
```tsx
      {notifyQ.data && (
        <NewChapterNotifyCard
          setting={notifyQ.data}
          onUpdated={() =>
            qc.invalidateQueries({ queryKey: ['admin', 'settings', 'new-chapter-notify'] })
          }
        />
      )}
```
Add this component at the end of the file (mirrors `AutoCrawlCard`):
```tsx
function NewChapterNotifyCard({
  setting,
  onUpdated,
}: {
  setting: NewChapterNotifySetting;
  onUpdated: () => void;
}) {
  const [enabled, setEnabled] = useState(setting.newChapterNotifyEnabled);
  const [okFlash, setOkFlash] = useState(false);

  useEffect(() => {
    setEnabled(setting.newChapterNotifyEnabled);
  }, [setting.newChapterNotifyEnabled]);

  const saveM = useMutation({
    mutationFn: () => updateNewChapterNotify(enabled),
    onSuccess: () => {
      setOkFlash(true);
      setTimeout(() => setOkFlash(false), 2500);
      onUpdated();
    },
  });

  const dirty = enabled !== setting.newChapterNotifyEnabled;
  const errMsg = saveM.error as { response?: { data?: { message?: string } } } | null;
  const errorText = errMsg?.response?.data?.message ?? null;

  return (
    <section className="rounded-xl border border-border bg-bg overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-border flex items-start gap-3">
        <SettingsIcon className="h-5 w-5 text-fg-muted mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0">
          <h2 className="font-sans font-semibold text-lg">Thông báo chương mới</h2>
          <p className="text-sm text-fg-muted mt-1">
            Định kỳ gửi thông báo "có chương mới" cho người đã lưu truyện. Gộp nhiều chương thành
            một thông báo, không gửi lại với chương đã crawl trước đó.
          </p>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-[var(--accent)] cursor-pointer"
          />
          <span>
            <span className="block text-sm font-medium">Bật thông báo chương mới</span>
            <span className="block text-xs text-fg-muted mt-0.5">
              Khi tắt, vòng quét tạm dừng (mốc theo dõi được giữ nguyên).
            </span>
          </span>
        </label>

        {errorText && <p className="text-sm text-destructive">{errorText}</p>}

        <div className="pt-2 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => saveM.mutate()}
            disabled={!dirty || saveM.isPending}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-sm font-medium bg-fg text-bg hover:opacity-90 transition-opacity duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveM.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Lưu thay đổi
          </button>
          {okFlash && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
              <Check className="h-4 w-4" /> Đã lưu
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 9: Typecheck + lint the frontend**

Run:
```powershell
pnpm --filter @smanga/frontend typecheck
pnpm exec biome check --write apps/frontend/src/api/settings.ts apps/frontend/src/routes/admin/settings.tsx
```
Expected: typecheck clean; biome no errors.

- [ ] **Step 10: Commit**

```powershell
git add apps/api/src/modules/app-settings/dto/update-new-chapter-notify.dto.ts apps/api/src/modules/app-settings/new-chapter-notify.controller.ts apps/api/src/modules/app-settings/app-settings.service.ts apps/api/src/modules/app-settings/app-settings.module.ts apps/api/src/modules/app-settings/auto-retry.spec.ts apps/frontend/src/api/settings.ts apps/frontend/src/routes/admin/settings.tsx
git commit -m "feat: admin toggle for new-chapter notifications

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: End-to-end verification (Playwright MCP proof)

**Context:** Controller-only — needs the running dev stack (frontend :3000, API :3010, Postgres, Redis) + Playwright MCP. This validates the **real SQL** (coalescing upsert, baseline guard) that the unit tests mock.

- [ ] **Step 1: Boot the stack**

In separate terminals (per CLAUDE.md "Local dev"): `pnpm dev:db`, then the API with `PORT=3010` + `DATABASE_URL` + `REDIS_URL` + `JWT_SECRET`, then `pnpm dev:frontend`. Confirm the migration from Task 1 is applied.

- [ ] **Step 2: Seed a follow + a baseline**

Using the proof admin account (`pwadmin@test.com` / `playwrightpass123`) or a seeded reader, in the browser: log in, open a story with crawled chapters (e.g. `/truyen/dau-pha-thuong-khung`), and click **Lưu truyện** to bookmark it. Then trigger one sweep so the story baselines (watermark set, no notification): either wait for the */10 tick, or from psql confirm the backfill already set `story.last_notified_chapter_index` for this story:
```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT slug, last_notified_chapter_index FROM story WHERE slug='dau-pha-thuong-khung';"
```
Expected: a non-NULL watermark (from the Task 1 backfill).

- [ ] **Step 3: Simulate a new readable chapter + advance**

Insert one crawled chapter above the watermark (test-only DB edit), then run the sweep. To run the sweep immediately without waiting for cron, temporarily lower `NOTIFY_CRON` to `* * * * *` in dev, or enqueue once via a REPL/psql is not possible — simplest: set the watermark back by one and wait one tick, OR add a tiny temporary admin "run now" is out of scope. Practical path for the proof: insert a crawled chapter with an index just above the current max, set the story watermark to the previous max, and wait for the next */10 tick (or restart the API with a `* * * * *` cron for the proof, then revert). Example seed:
```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "INSERT INTO chapter (story_id, index, title, source_id, external_url, status, crawled_at) SELECT id, (SELECT max(index)+1 FROM chapter WHERE story_id=s.id AND status='crawled'), 'Chương test', 'truyenfull', 'http://test', 'crawled', now() FROM story s WHERE slug='dau-pha-thuong-khung';"
```

- [ ] **Step 4: Confirm the notification appears**

After the sweep tick, in the browser reload and open the **bell**. Confirm: the unread badge incremented, the item reads "**Đấu Phá Thương Khung** — 1 chương mới" with the BookOpen glyph, and clicking it navigates to `/truyen/dau-pha-thuong-khung/chuong/<next-unread>`. Take a screenshot (`notify-bell-proof.png`).

- [ ] **Step 5: Confirm coalescing + read-then-fresh (DB-level)**

Insert a second crawled chapter + run the sweep again; confirm the SAME notification row updated (`new_count = 2`, not a second row) while still unread:
```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT type, story_id, chapter_index, new_count, read_at FROM notification WHERE type='new_chapter' ORDER BY created_at DESC LIMIT 5;"
```
Expected: one unread `new_chapter` row with `new_count = 2`. Then open the bell (marks read), insert another chapter + sweep, and confirm a NEW unread row is created (the read one stays read).

- [ ] **Step 6: Revert test data + cron, refresh graph**

Delete the test chapters, restore `NOTIFY_CRON` to `*/10 * * * *` if you changed it, and run `graphify update .`. Summarize the proof (screenshot + the coalescing query output). Do NOT push without explicit user instruction.

---

## Self-Review

**Spec coverage:**
- In-app bell, reuse notification table/API/bell → Tasks 1,3,4 ✓
- Follow = bookmark → fan-out reads `bookmark` (Task 2) ✓
- Readable = `status='crawled'` → candidate query + backfill (Tasks 1,2) ✓
- Scheduled sweep, not crawler hook → Task 2 repeatable job ✓
- Coalesce per (user, story) while unread → partial unique index (Task 1) + ON CONFLICT upsert (Task 2) ✓
- Data model: notification cols + partial index, story watermark, app_setting toggle → Task 1 ✓
- Baseline guard (no backlog blast) → Task 2 `handle()` + Task 1 backfill ✓
- Deep-link to next unread → Task 3 `nc_target_index` + Task 4 href ✓
- Discriminated union FE/BE → Tasks 3,4 ✓
- Operator kill-switch → Tasks 1,2 (respected),5 (UI) ✓
- Bookmark-after-the-fact / fractional / delete-cascade / read-then-fresh edge cases → covered by watermark semantics, `numeric(10,2)`, FK cascade, partial-unread index (Tasks 1,2); verified Task 6 ✓
- Testing: unit (Task 2 sweep, Task 5 toggle) + Playwright proof (Task 6) ✓
- Out of scope (email/push, /tu-sach passive feed, per-user prefs) → not implemented ✓

**Placeholder scan:** No TBD/TODO. Every code step shows complete code; the `00XX` migration number is the only intentional fill-in (drizzle-kit assigns it at generate time — Step 4 instructs noting it). Task 3 has a typecheck gate rather than a unit test, explicitly justified (raw-SQL extension of an already-untested service, behavior covered by Task 6).

**Type consistency:** `newChapter` shape `{ storySlug, storyTitle, newCount, targetChapterIndex }` is identical across Task 3 (backend interface + map), Task 4 (frontend type + render). `type` union `'comment_reply' | 'comment_mention' | 'new_chapter'` matches in both. `handle()` return `{ notified, baselined, skipped }` matches between the service (Task 2 Step 4) and its tests (Step 2). Service methods `getNewChapterNotify`/`setNewChapterNotify` and routes `/admin/settings/new-chapter-notify` match across Task 5 backend + frontend. Column names (`new_chapter_notify_enabled` → `newChapterNotifyEnabled`, `last_notified_chapter_index` → `lastNotifiedChapterIndex`) match Task 1 schema ↔ Task 2/5 usage.
