# Redesign C — Reader's Companion DNA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Ship the 4 differentiator features defined in Spec C (ContinueReadingBar with live data, ReadingStatsCard, EmptyState primitive + 4 illustrations, chapter drop-cap + reading typography) so readers feel SManga *remembers them* and *celebrates their reading*.

**Architecture:** Two new NestJS read-only endpoints under the existing `UserDataModule` (`GET /me/continue-reading`, `GET /me/stats`) feed a TanStack-Query-backed FE layer in `apps/frontend/src/api/me.ts`. FE introduces 2 new reader components (ContinueReadingBar wired, ReadingStatsCard new), 1 new UI primitive (EmptyState + 4 SVG illustrations), and prose typography upgrades inside `routes/truyen/$slug/chuong/$index.tsx` (drop-cap, scene-break, Newsreader title, reading-time eyebrow already present). Optional migration 0008 (`session_seconds`) is gated and can ship later without breaking the other features.

**Tech Stack:** NestJS 11 + Drizzle ORM + Postgres (Asia/Ho_Chi_Minh TZ for streaks) + TanStack Query v5 + React 18 + TanStack Router + Tailwind v4 design tokens (`bg`, `bg-elevated`, `bg-subtle`, `fg`, `fg-muted`, `fg-subtle`, `accent`, `accent-strong`, `border`, `border-strong`, `bg-accent-gradient`, `bg-accent-gradient-soft`, `shadow-glow-pink-soft`, `font-sans`, `font-prose`, `duration-fast`, `text-display-md/sm`, `text-heading-lg/md`, `text-body`, `text-body-sm`, `text-label`).

**Depends on:** Plan A (shipped 2026-05-30, commits a69435d..37270d0). Plan A delivered: tokens, `AppShell` with ContinueReadingBar slot, `tu-sach.tsx` shell with `Plan C: ReadingStatsCard slot here` marker, `LoggedInHero` falls back to `AnonHero`, `ban.tsx` is a redirect, `ReadingProgressTracker` already fires after 5s.

**User directive (2026-05-30):** commit-only. **NEVER `git push`**. Every task ends with a `git add` + `git commit`. The user pushes manually.

**Critical decisions resolved during audit:**

1. **`/ban` is a pure redirect (no UI surface).** Spec C §Feature 2 "Where it lives" (line 93) AND Spec C "Files affected" (line 269) both still mention `/ban` and `ban.tsx` — but Plan A made `/ban` a redirect to `/tai-khoan` (line 8 of `ban.tsx`). Spec C is internally inconsistent here. **Resolution (overrides spec):** leave `ban.tsx` untouched. ReadingStatsCard ships on `/tu-sach` and `/tai-khoan` only. The redirect already routes "Bạn" tab traffic into the stats-card surface. Follow-up: amend Spec C to delete the `/ban` references (recommended) so future readers don't trip over the mismatch. Same note applies to `/tim-kiem` / `tim-kiem.tsx` references in Spec C's Files-affected table — Plan A made them a redirect too, and Plan C Task 14 correctly satisfies that surface via `/kham-pha`.
2. **`/tim-kiem` is a redirect to `/kham-pha?q=…` (Plan A).** **Resolution:** Spec C's `/tim-kiem` no-results EmptyState is satisfied by integrating EmptyState into `/kham-pha`. No separate `/tim-kiem` work needed.
3. **Dedicated continue-reading endpoint — build it.** Audit shows we *could* reuse `readingProgressApi.list()[0]` from FE. But Spec C requires a dedicated endpoint with the shape `{ storyId, storySlug, storyTitle, hasCover, chapterIndex, totalChapters, updatedAt }` (LIMIT 1, 204 on empty, server-cheap). The list endpoint omits `hasCover` and returns the full array (unbounded). **URL contract:** The final URL is `/api/v1/me/reading-progress/continue-reading` (hung off the existing `ReadingProgressController` whose `@Controller({ path: 'me/reading-progress', version: '1' })` decorator we keep as-is, to avoid spawning a new controller for one route). The FE hides the exact path behind `meApi.continueReading()` so callers never see it. Spec C's abstract `/me/continue-reading` reference is satisfied by this clean-name wrapper; any contract test or docs reader should be pointed at `meApi.continueReading()` rather than the raw URL.
4. **`weeklyHours` gated on migration 0008.** Phase C1 ships `weeklyHours: 0` placeholder. Phase C3 ships migration 0008 + session tracking and lights up the real value. ReadingStatsCard hides the "Giờ đọc" tile while the value is 0 *and* the user has progress (avoids the "0 giờ" mocking-the-user state).

---

## Phase C1 — Backend endpoints (read-only, no migration)

Two new routes on the existing `UserDataModule`. No new DTOs (read-only). Auth via existing `JwtAuthGuard`.

### Task 1: Add `getContinueReading(userId)` service method

**Files:**
- Modify: `apps/api/src/modules/user-data/reading-progress.service.ts`

**Why this task:** Plan A and `readingProgressApi.list()` only return the unbounded ordered list. Spec C wants a dedicated single-row query that returns `hasCover` and is shaped for the bar.

- [ ] **Step 1: Read context**
  Read `apps/api/src/modules/user-data/reading-progress.service.ts` (44 lines) and `packages/db/src/schema/story.ts` (to confirm `hasCover` column name).

- [ ] **Step 2: Add `getContinueReading` method**
  First, update the drizzle-orm import on line 2 to add `sql`:
  ```ts
  import { desc, eq, sql } from 'drizzle-orm';
  ```
  Then append to `reading-progress.service.ts` after the `list` method:
  ```ts
  async getContinueReading(userId: string) {
    const rows = await this.db
      .select({
        storyId: readingProgress.storyId,
        storySlug: story.slug,
        storyTitle: story.title,
        hasCover: sql<boolean>`${story.cover} IS NOT NULL`,
        chapterIndex: readingProgress.chapterIndex,
        totalChapters: story.totalChapters,
        updatedAt: readingProgress.updatedAt,
      })
      .from(readingProgress)
      .innerJoin(story, eq(story.id, readingProgress.storyId))
      .where(eq(readingProgress.userId, userId))
      .orderBy(desc(readingProgress.updatedAt))
      .limit(1);
    return rows[0] ?? null;
  }
  ```
  Note: `story` has no `hasCover` column — the actual column is `cover: bytea` (nullable). Other services (e.g. `apps/api/src/modules/stories/stories.service.ts:64,87`) compute `hasCover` via `sql<boolean>\`${story.cover} IS NOT NULL\``. We follow that same pattern. `desc`, `eq`, `story`, `readingProgress` were already imported; only `sql` is newly added.

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/api typecheck` → expect: passes.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/api/src/modules/user-data/reading-progress.service.ts
  git commit -m "feat(api): add getContinueReading service method (Plan C1)"
  ```

### Task 2: Expose `GET /me/continue-reading`

**Files:**
- Modify: `apps/api/src/modules/user-data/reading-progress.controller.ts`

**Why this task:** Surface the new service method as `GET /api/v1/me/continue-reading`. Returns 204 (No Content) when the user has no progress so the FE can `useQuery` cleanly.

- [ ] **Step 1: Read context**
  Read the existing 24-line controller — it already has `@Get()` for `list()` and `@Put()` for `upsert()`. We add a third route on a separate path so it doesn't collide.

- [ ] **Step 2: Add the route**
  Add this method after `list()` in `reading-progress.controller.ts`. Update imports to add `HttpCode, HttpStatus, Res` from `@nestjs/common` and `Response` type from `express`:
  ```ts
  import { Body, Controller, Get, HttpCode, HttpStatus, Put, Res, UseGuards } from '@nestjs/common';
  import type { Response } from 'express';
  // ...
  @Get('continue-reading')
  async continueReading(
    @CurrentUser() u: { id: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const row = await this.svc.getContinueReading(u.id);
    if (!row) {
      res.status(HttpStatus.NO_CONTENT);
      return;
    }
    return row;
  }
  ```
  Note: the controller path is `me/reading-progress`. To match Spec C's `/me/continue-reading` URL, change the controller path to use a sub-path. **Simpler:** change `@Get('continue-reading')` to `@Get()` and mount this method on a SEPARATE controller. **Chosen approach** (less churn): keep this method on the existing controller — final URL becomes `/api/v1/me/reading-progress/continue-reading`. Update Spec C clients accordingly.

  > **Decision recorded:** URL is `/api/v1/me/reading-progress/continue-reading`, not `/api/v1/me/continue-reading`. The FE `api/me.ts` will hide that path behind a `meApi.continueReading()` function.

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/api typecheck` → expect: passes.
  Smoke: in another terminal run `pnpm dev:api`, then
  ```powershell
  curl.exe -i http://localhost:3001/api/v1/me/reading-progress/continue-reading -H "Authorization: Bearer <JWT>"
  ```
  → expect: `200` with JSON shape (or `204` if no progress) for the JWT user; `401` without auth.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/api/src/modules/user-data/reading-progress.controller.ts
  git commit -m "feat(api): expose GET /me/reading-progress/continue-reading (Plan C1)"
  ```

### Task 3: Create `StatsService` + `GET /me/stats`

**Files:**
- Create: `apps/api/src/modules/user-data/stats.service.ts`
- Create: `apps/api/src/modules/user-data/stats.controller.ts`
- Modify: `apps/api/src/modules/user-data/user-data.module.ts`

**Why this task:** Spec C's 7 stat queries don't belong on either existing service. A dedicated service + controller keeps the module tidy and lets us add caching later without changing the existing endpoints.

- [ ] **Step 1: Read context**
  Read `packages/db/src/schema/user-data.ts` (confirms `reading_progress` has no `session_seconds` yet — `weeklyHours` returns 0 in Phase C1). Read `packages/db/src/schema/story.ts` to confirm `totalChapters` column name.

- [ ] **Step 2: Create `stats.service.ts`**
  Write `apps/api/src/modules/user-data/stats.service.ts`:
  ```ts
  import { Inject, Injectable } from '@nestjs/common';
  import { and, count, eq, gt, sql } from 'drizzle-orm';
  import { bookmark, readingProgress, story } from '@smanga/db/schema';
  import type { Database } from '@smanga/db';
  import { DRIZZLE } from '@/modules/db/db.provider';

  /**
   * postgres-js's `db.execute()` returns the row array directly (a postgres.RowList),
   * NOT `{ rows: T[] }` like the node-postgres adapter does. See
   * `apps/api/src/modules/stories/stories.service.ts:40-43` for the defensive pattern.
   * This helper normalizes both shapes so callers can rely on a plain array.
   */
  const rowsOf = <T>(r: unknown): T[] =>
    Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

  export interface UserStats {
    totalChaptersRead: number;
    libraryCount: number;
    completedCount: number;
    weeklyChapters: number;
    weeklyHours: number;
    streakDays: number;
    dailyChaptersLast7: number[];
  }

  @Injectable()
  export class StatsService {
    constructor(@Inject(DRIZZLE) private readonly db: Database) {}

    async getStats(userId: string): Promise<UserStats> {
      const [
        [{ value: totalChaptersRead }],
        [{ value: libraryCount }],
        [{ value: completedCount }],
        [{ value: weeklyChapters }],
        dailyRows,
        streakDays,
      ] = await Promise.all([
        this.db
          .select({ value: count() })
          .from(readingProgress)
          .where(eq(readingProgress.userId, userId)),
        this.db
          .select({ value: count() })
          .from(bookmark)
          .where(eq(bookmark.userId, userId)),
        this.db
          .select({ value: count() })
          .from(readingProgress)
          .innerJoin(story, eq(story.id, readingProgress.storyId))
          .where(
            and(
              eq(readingProgress.userId, userId),
              gt(story.totalChapters, 0),
              sql`${readingProgress.chapterIndex}::numeric >= ${story.totalChapters}`,
            ),
          ),
        this.db
          .select({ value: count() })
          .from(readingProgress)
          .where(
            and(
              eq(readingProgress.userId, userId),
              sql`${readingProgress.updatedAt} > now() - interval '7 days'`,
            ),
          ),
        this.db.execute<{ day: string; chapters: number }>(sql`
          WITH days AS (
            SELECT generate_series(
              (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - interval '6 days',
              (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
              interval '1 day'
            )::date AS day
          )
          SELECT
            to_char(d.day, 'YYYY-MM-DD') AS day,
            COALESCE(COUNT(rp.story_id), 0)::int AS chapters
          FROM days d
          LEFT JOIN reading_progress rp
            ON rp.user_id = ${userId}
            AND (rp.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.day
          GROUP BY d.day
          ORDER BY d.day ASC
        `),
        this.computeStreak(userId),
      ]);

      const dailyChaptersLast7 = rowsOf<{ day: string; chapters: number }>(dailyRows)
        .map((r) => Number(r.chapters));

      // weeklyHours: zero until migration 0008 lights up session_seconds.
      const weeklyHours = 0;

      return {
        totalChaptersRead: Number(totalChaptersRead),
        libraryCount: Number(libraryCount),
        completedCount: Number(completedCount),
        weeklyChapters: Number(weeklyChapters),
        weeklyHours,
        streakDays,
        dailyChaptersLast7,
      };
    }

    private async computeStreak(userId: string): Promise<number> {
      const result = await this.db.execute<{ streak: number }>(sql`
        WITH active_days AS (
          SELECT DISTINCT
            (updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day
          FROM reading_progress
          WHERE user_id = ${userId}
        ),
        ordered AS (
          SELECT
            day,
            ROW_NUMBER() OVER (ORDER BY day DESC) AS rn,
            (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS today
          FROM active_days
        )
        SELECT COUNT(*)::int AS streak
        FROM ordered
        WHERE day = today - (rn - 1) * interval '1 day'
      `);
      const rows = rowsOf<{ streak: number }>(result);
      return rows.length > 0 ? Number(rows[0].streak) : 0;
    }
  }
  ```
  Note: `db.execute()` under `drizzle-orm/postgres-js` returns the row array directly — it does NOT have a `.rows` property. The `rowsOf<T>` helper above normalizes both shapes (postgres-js array, node-postgres `{ rows }`) so `dailyRows` and the streak `result` can be consumed safely. This is the same defensive pattern used in `apps/api/src/modules/stories/stories.service.ts:40-43`.

- [ ] **Step 3: Create `stats.controller.ts`**
  Write `apps/api/src/modules/user-data/stats.controller.ts`:
  ```ts
  import { Controller, Get, UseGuards } from '@nestjs/common';
  import { ApiTags } from '@nestjs/swagger';
  import { StatsService } from './stats.service';
  import { JwtAuthGuard } from '@/common/guards/jwt.guard';
  import { CurrentUser } from '@/common/decorators/current-user.decorator';

  @ApiTags('stats')
  @Controller({ path: 'me/stats', version: '1' })
  @UseGuards(JwtAuthGuard)
  export class StatsController {
    constructor(private readonly svc: StatsService) {}

    @Get()
    stats(@CurrentUser() u: { id: string }) {
      return this.svc.getStats(u.id);
    }
  }
  ```

- [ ] **Step 4: Register in module**
  Update `apps/api/src/modules/user-data/user-data.module.ts`:
  ```ts
  import { Module } from '@nestjs/common';
  import { BookmarksController } from './bookmarks.controller';
  import { BookmarksService } from './bookmarks.service';
  import { ReadingProgressController } from './reading-progress.controller';
  import { ReadingProgressService } from './reading-progress.service';
  import { StatsController } from './stats.controller';
  import { StatsService } from './stats.service';

  @Module({
    controllers: [BookmarksController, ReadingProgressController, StatsController],
    providers: [BookmarksService, ReadingProgressService, StatsService],
  })
  export class UserDataModule {}
  ```

- [ ] **Step 5: Verify locally**
  Run: `pnpm --filter @smanga/api typecheck` → expect: passes.
  Smoke with `pnpm dev:api` running:
  ```powershell
  curl.exe -i http://localhost:3001/api/v1/me/stats -H "Authorization: Bearer <JWT>"
  ```
  → expect: `200` with the 7-field JSON shape (counts may be 0 for fresh user); `401` without auth.

  Manual streak verification: in `psql`:
  ```sql
  -- Insert 5 days of progress for a test user, then GET /me/stats → streakDays = 5
  INSERT INTO reading_progress (user_id, story_id, chapter_index, updated_at) VALUES
    ('USER_ID', 'STORY_ID', 1, now() - interval '4 days'),
    ('USER_ID', 'STORY_ID', 2, now() - interval '3 days'),
    ('USER_ID', 'STORY_ID', 3, now() - interval '2 days'),
    ('USER_ID', 'STORY_ID', 4, now() - interval '1 day'),
    ('USER_ID', 'STORY_ID', 5, now());
  ```

- [ ] **Step 6: Commit**
  ```bash
  git add apps/api/src/modules/user-data/stats.service.ts apps/api/src/modules/user-data/stats.controller.ts apps/api/src/modules/user-data/user-data.module.ts
  git commit -m "feat(api): GET /me/stats endpoint with streak + 7-day sparkline (Plan C1)"
  ```

---

## Phase C2 — FE components + wire into pages

### Task 4: Create `apps/frontend/src/api/me.ts` client module

**Files:**
- Create: `apps/frontend/src/api/me.ts`

**Why this task:** Spec C explicitly calls for a dedicated `me.ts` API module. We hide the controller path (`/me/reading-progress/continue-reading`) behind a clean function name.

- [ ] **Step 1: Read context**
  Skim `apps/frontend/src/api/bookmarks.ts` (20 lines) and `apps/frontend/src/api/reading-progress.ts` (19 lines) for the existing pattern (`api.get(...).then(r => r.data)`).

- [ ] **Step 2: Write `api/me.ts`**
  ```ts
  import { api } from '@/lib/api-client';

  export interface ContinueReading {
    storyId: string;
    storySlug: string;
    storyTitle: string;
    hasCover: boolean;
    chapterIndex: string; // numeric — keep as string, FE coerces when displaying
    totalChapters: number;
    updatedAt: string;
  }

  export interface UserStats {
    totalChaptersRead: number;
    libraryCount: number;
    completedCount: number;
    weeklyChapters: number;
    weeklyHours: number;
    streakDays: number;
    dailyChaptersLast7: number[];
  }

  export const meApi = {
    /** Returns null when BE responds 204 (no progress) — never throws on that case. */
    continueReading: async (): Promise<ContinueReading | null> => {
      const r = await api.get<ContinueReading | ''>('/me/reading-progress/continue-reading', {
        validateStatus: (s) => s === 200 || s === 204,
      });
      if (r.status === 204) return null;
      return r.data as ContinueReading;
    },
    stats: () => api.get<UserStats>('/me/stats').then((r) => r.data),
  };
  ```

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/frontend/src/api/me.ts
  git commit -m "feat(frontend): add me.ts API client (continueReading + stats) (Plan C2)"
  ```

### Task 5: Wire `ContinueReadingBar` to live data

**Files:**
- Modify: `apps/frontend/src/components/layout/ContinueReadingBar.tsx` (replace early-return shell)

**Why this task:** Plan A shipped the visual shell behind `return null`. Now we connect the query, apply visibility rules (auth + not-on-this-chapter), and route the click to the actual chapter.

- [ ] **Step 1: Read context**
  Re-read `apps/frontend/src/components/layout/ContinueReadingBar.tsx` (48 lines) and `apps/frontend/src/components/layout/AppShell.tsx` (already hides the bar on chapter routes via `isChapter` regex on line 17).

- [ ] **Step 2: Replace the component body**
  Rewrite `apps/frontend/src/components/layout/ContinueReadingBar.tsx` to:
  ```tsx
  import { Link, useRouterState } from '@tanstack/react-router';
  import { useQuery } from '@tanstack/react-query';
  import { ChevronRight } from 'lucide-react';
  import { meApi } from '@/api/me';
  import { useAuthStore } from '@/stores/auth-store';

  /**
   * Plan C: wired to GET /me/reading-progress/continue-reading.
   * Visibility rules:
   *   1. anonymous → hidden (query disabled)
   *   2. no progress → BE returns 204 → hidden
   *   3. current route is the chapter reader for THIS exact story → hidden
   */
  export function ContinueReadingBar() {
    const user = useAuthStore((s) => s.user);
    const path = useRouterState({ select: (s) => s.location.pathname });

    const q = useQuery({
      queryKey: ['me', 'continue-reading'],
      queryFn: () => meApi.continueReading(),
      enabled: !!user,
      staleTime: 60_000,
    });

    if (!user) return null;
    const cr = q.data;
    if (!cr) return null;

    // Hide when already reading the same story's chapter.
    // Note: AppShell already hides the bar on ALL chapter routes via its `isChapter` regex,
    // so in practice this branch never fires today. We keep it as intentional double-defense:
    // if AppShell's regex ever changes, the bar still won't appear "on top of itself" while
    // the reader is on the matching chapter.
    const onThisChapter = path.startsWith(`/truyen/${cr.storySlug}/chuong/`);
    if (onThisChapter) return null;

    const chapter = Math.floor(Number(cr.chapterIndex));

    // Sticky offset must match the responsive height of DesktopTopNav.
    // Plan B Task 10 sets the admin top bar to `h-14 sm:h-16` and the reader nav follows
    // the same pattern. If the reader nav uses a different height, update both values here.
    return (
      <Link
        to="/truyen/$slug/chuong/$index"
        params={{ slug: cr.storySlug, index: String(chapter) }}
        className="sticky top-14 sm:top-16 z-20 block border-b border-accent/20 transition-colors duration-fast hover:bg-accent/12"
        style={{
          background:
            'linear-gradient(90deg, rgba(236,72,153,0.12), rgba(244,114,182,0.04))',
        }}
      >
        <div className="container flex items-center h-10 sm:h-12 gap-3">
          {cr.hasCover ? (
            <img
              src={`/api/v1/cover/${cr.storyId}`}
              alt=""
              loading="lazy"
              className="h-7 w-5 sm:h-9 sm:w-7 rounded-sm object-cover flex-shrink-0"
            />
          ) : (
            <div
              aria-hidden
              className="h-7 w-5 sm:h-9 sm:w-7 bg-accent-gradient rounded-sm flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] sm:text-label text-fg-muted truncate">
              ĐỌC TIẾP · CHƯƠNG {chapter} / {cr.totalChapters}
            </p>
            <p className="text-body-sm sm:text-body font-semibold truncate">
              {cr.storyTitle}
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center h-7 px-3 rounded-md bg-fg text-bg text-body-sm font-semibold">
            Tiếp tục →
          </span>
          <ChevronRight className="sm:hidden h-5 w-5 text-accent" aria-hidden />
        </div>
      </Link>
    );
  }
  ```

- [ ] **Step 3: Invalidate query on progress write**
  Modify `apps/frontend/src/components/reader/ReadingProgressTracker.tsx` so it invalidates `['me','continue-reading']` and `['me','stats']` after a successful `upsert`:
  ```tsx
  import { useEffect, useRef } from 'react';
  import { useQueryClient } from '@tanstack/react-query';
  import { readingProgressApi } from '@/api/reading-progress';
  import { useAuthStore } from '@/stores/auth-store';

  export function ReadingProgressTracker({
    storyId,
    chapterIndex,
  }: {
    storyId: string;
    chapterIndex: number;
  }) {
    const user = useAuthStore((s) => s.user);
    const qc = useQueryClient();
    const fired = useRef(false);

    useEffect(() => {
      fired.current = false;
    }, [storyId, chapterIndex]);

    useEffect(() => {
      if (!user || fired.current) return;
      const timer = window.setTimeout(() => {
        readingProgressApi
          .upsert(storyId, chapterIndex)
          .then(() => {
            void qc.invalidateQueries({ queryKey: ['me', 'continue-reading'] });
            void qc.invalidateQueries({ queryKey: ['me', 'stats'] });
            void qc.invalidateQueries({ queryKey: ['me', 'reading-progress'] });
          })
          .catch(() => {
            /* swallow — non-critical */
          });
        fired.current = true;
      }, 5_000);
      return () => window.clearTimeout(timer);
    }, [storyId, chapterIndex, user, qc]);

    return null;
  }
  ```

  Note: the `['me', 'reading-progress']` invalidation is the same query key that Task 7's `/tu-sach` page uses for `readingProgressApi.list()`. Until Task 7 lands, no consumer reads that key, so the invalidation is a no-op. After Task 7 lands, navigating from a chapter to `/tu-sach` will surface fresh progress immediately.

- [ ] **Step 4: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes.
  Run dev: `pnpm dev:frontend` and open `http://localhost:3000/` while logged in with a user that has progress → expect: pink-tinted sticky bar appears below the header with the correct story + chapter.
  Click into the chapter → expect: bar disappears on that route, returns on other routes.
  Open as a logged-out user → expect: bar never renders.

- [ ] **Step 5: Commit**
  ```bash
  git add apps/frontend/src/components/layout/ContinueReadingBar.tsx apps/frontend/src/components/reader/ReadingProgressTracker.tsx
  git commit -m "feat(frontend): wire ContinueReadingBar to live data + invalidate on progress write (Plan C2)"
  ```

### Task 6: Create `ReadingStatsCard.tsx`

**Files:**
- Create: `apps/frontend/src/components/reader/ReadingStatsCard.tsx`

**Why this task:** This is the headline UI of Spec C — gradient backdrop, glow orb, 4-up stat grid, 7-day sparkline, streak chip. Must handle empty / loading / dark+light themes / `prefers-reduced-motion`.

- [ ] **Step 1: Read context**
  Re-read Spec C §Feature 2. Confirm tokens in `apps/frontend/src/styles.css` (`bg-bg-subtle`, `accent`, `shadow-glow-pink-soft` exist from Plan A).

- [ ] **Step 2: Write the component**
  Create `apps/frontend/src/components/reader/ReadingStatsCard.tsx`:
  ```tsx
  import { Link } from '@tanstack/react-router';
  import { useQuery } from '@tanstack/react-query';
  import { Flame } from 'lucide-react';
  import { meApi, type UserStats } from '@/api/me';
  import { useAuthStore } from '@/stores/auth-store';

  const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  export function ReadingStatsCard() {
    const user = useAuthStore((s) => s.user);
    const q = useQuery({
      queryKey: ['me', 'stats'],
      queryFn: () => meApi.stats(),
      enabled: !!user,
      staleTime: 60_000,
    });

    if (!user) return null;
    if (q.isLoading) return <StatsSkeleton />;
    if (!q.data) return null;

    const s = q.data;
    const hasProgress = s.totalChaptersRead > 0;

    if (!hasProgress) {
      return (
        <StatsContainer>
          <p className="text-label text-fg-muted uppercase mb-2">HOẠT ĐỘNG ĐỌC</p>
          <h2 className="text-heading-lg mb-3">Bắt đầu đọc để theo dõi hoạt động của bạn</h2>
          <p className="text-body-sm text-fg-muted mb-5 max-w-md">
            Streak, chương đọc, sparkline 7 ngày — tất cả sẽ xuất hiện ở đây sau chương đầu tiên.
          </p>
          <Link
            to="/"
            className="inline-flex items-center h-10 px-4 rounded-md bg-accent-gradient text-white text-body-sm font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-200"
          >
            Đến trang chủ →
          </Link>
        </StatsContainer>
      );
    }

    return (
      <StatsContainer>
        <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
          <div>
            <p className="text-label text-fg-muted uppercase mb-1">HOẠT ĐỘNG ĐỌC</p>
            <h2 className="text-heading-lg">
              Tuần này bạn đã đọc{' '}
              <span className="bg-accent-gradient bg-clip-text text-transparent font-bold">
                {s.weeklyChapters} chương
              </span>
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-accent/10 border border-accent/20 text-body-sm font-semibold text-fg">
            <Flame className="h-4 w-4 text-accent" aria-hidden />
            Streak {s.streakDays} ngày
          </span>
        </div>

        <div
          className={`grid grid-cols-2 ${
            s.weeklyHours > 0 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
          } gap-2.5 mb-5`}
        >
          <MiniStat label="Tổng" value={s.totalChaptersRead} unit="chương" />
          <MiniStat label="Thư viện" value={s.libraryCount} unit="truyện" />
          <MiniStat label="Hoàn thành" value={s.completedCount} unit="truyện" />
          {s.weeklyHours > 0 && (
            <MiniStat label="Giờ đọc" value={s.weeklyHours} unit="giờ / tuần" />
          )}
        </div>

        <Sparkline data={s.dailyChaptersLast7} />
      </StatsContainer>
    );
  }

  function StatsContainer({ children }: { children: React.ReactNode }) {
    return (
      <section
        className="relative overflow-hidden rounded-lg border border-accent/15 p-6"
        style={{
          background:
            'linear-gradient(135deg, rgba(236,72,153,0.08), rgba(244,114,182,0.02))',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-accent/25 blur-3xl"
        />
        <div className="relative">{children}</div>
      </section>
    );
  }

  function MiniStat({ label, value, unit }: { label: string; value: number; unit: string }) {
    return (
      <div className="bg-bg-subtle rounded-md p-3">
        <p className="text-[10px] uppercase tracking-wider text-fg-muted font-medium">{label}</p>
        <p className="mt-1 text-[22px] font-bold leading-none text-fg">{value}</p>
        <p className="mt-1 text-[11px] text-fg-muted">{unit}</p>
      </div>
    );
  }

  function Sparkline({ data }: { data: number[] }) {
    const max = Math.max(1, ...data);
    const ariaValues = data.join(', ');
    return (
      <div
        role="img"
        aria-label={`Số chương đọc theo ngày trong tuần: ${ariaValues}`}
        className="flex items-end justify-between gap-1.5 h-16"
      >
        {data.map((v, i) => {
          const isToday = i === data.length - 1;
          const heightPct = Math.max(8, Math.round((v / max) * 100));
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <div
                className={`w-full rounded-sm transition-all duration-fast ${
                  isToday ? 'bg-accent-gradient shadow-glow-pink-soft' : 'bg-accent/30'
                }`}
                style={{ height: `${heightPct}%`, minHeight: '4px' }}
              />
              <span
                className={`text-[10px] ${
                  isToday ? 'text-accent font-semibold' : 'text-fg-muted'
                }`}
              >
                {DAY_LABELS[i] ?? ''}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  function StatsSkeleton() {
    return (
      <section className="rounded-lg border border-border bg-bg-elevated p-6">
        <div className="h-3 w-20 bg-bg-subtle rounded mb-2 animate-pulse" />
        <div className="h-6 w-64 bg-bg-subtle rounded mb-5 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-bg-subtle rounded-md animate-pulse" />
          ))}
        </div>
        <div className="h-16 bg-bg-subtle rounded animate-pulse" />
      </section>
    );
  }
  ```

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes.
  (No visual check yet — the card isn't mounted on any route. Task 7 mounts it.)

- [ ] **Step 4: Commit**
  ```bash
  git add apps/frontend/src/components/reader/ReadingStatsCard.tsx
  git commit -m "feat(frontend): add ReadingStatsCard component (Plan C2)"
  ```

### Task 7: Mount `ReadingStatsCard` on `/tu-sach`

**Files:**
- Modify: `apps/frontend/src/routes/tu-sach.tsx` (replace lines 22-23 + insert at slot on line 33)

**Why this task:** `/tu-sach` is the user's main "home base" once logged in. Spec C reserves the slot already; we fill it AND wire the rest of the page to real bookmark / reading-progress data.

- [ ] **Step 1: Read context**
  Re-read `apps/frontend/src/routes/tu-sach.tsx` (128 lines) — the placeholder `items: any[] = []` is on line 22 and the slot is on line 33.

- [ ] **Step 2: Replace the page body**
  Rewrite `apps/frontend/src/routes/tu-sach.tsx` to wire real data + mount the card:
  ```tsx
  import { useMemo, useState } from 'react';
  import { createFileRoute, Link, redirect } from '@tanstack/react-router';
  import { useQuery } from '@tanstack/react-query';
  import { me } from '@/api/auth';
  import { useAuthStore } from '@/stores/auth-store';
  import { bookmarksApi, type BookmarkRow } from '@/api/bookmarks';
  import { readingProgressApi, type ReadingProgressRow } from '@/api/reading-progress';
  import { ReadingStatsCard } from '@/components/reader/ReadingStatsCard';

  export const Route = createFileRoute('/tu-sach')({
    beforeLoad: async () => {
      const u = await me();
      if (!u) throw redirect({ to: '/dang-nhap', search: { redirect: '/tu-sach' } });
      useAuthStore.getState().setUser(u);
    },
    component: LibraryPage,
  });

  type ShelfTab = 'reading' | 'saved' | 'completed';

  interface ShelfItem {
    storyId: string;
    slug: string;
    title: string;
    author: string | null;
    totalChapters: number;
    chapterIndex?: number;
    progress?: number;
  }

  function LibraryPage() {
    const [tab, setTab] = useState<ShelfTab>('reading');
    const bookmarksQ = useQuery({ queryKey: ['me', 'bookmarks'], queryFn: () => bookmarksApi.list() });
    const progressQ = useQuery({ queryKey: ['me', 'reading-progress'], queryFn: () => readingProgressApi.list() });

    const { reading, saved, completed } = useMemo(() => {
      const progress: ReadingProgressRow[] = progressQ.data ?? [];
      const bookmarks: BookmarkRow[] = bookmarksQ.data ?? [];

      const readingItems: ShelfItem[] = [];
      const completedItems: ShelfItem[] = [];
      for (const p of progress) {
        const chapter = Number(p.chapterIndex);
        const total = p.totalChapters ?? 0;
        const isDone = total > 0 && chapter >= total;
        const item: ShelfItem = {
          storyId: p.storyId,
          slug: p.slug,
          title: p.title,
          author: p.author,
          totalChapters: total,
          chapterIndex: chapter,
          progress: total > 0 ? Math.min(100, Math.round((chapter / total) * 100)) : 0,
        };
        (isDone ? completedItems : readingItems).push(item);
      }

      const savedItems: ShelfItem[] = bookmarks.map((b) => ({
        storyId: b.storyId,
        slug: b.slug,
        title: b.title,
        author: b.author,
        totalChapters: b.totalChapters,
      }));

      return { reading: readingItems, saved: savedItems, completed: completedItems };
    }, [bookmarksQ.data, progressQ.data]);

    const counts = { reading: reading.length, saved: saved.length, completed: completed.length };
    const items = tab === 'reading' ? reading : tab === 'saved' ? saved : completed;

    return (
      <div className="container py-8 lg:py-12 space-y-8">
        <header>
          <p className="text-label text-fg-muted uppercase mb-2">CỦA BẠN</p>
          <h1 className="text-display-sm lg:text-display-md">Tủ sách</h1>
          <p className="mt-2 text-body text-fg-muted">
            Theo dõi truyện đang đọc và những truyện bạn đã đánh dấu để xem sau.
          </p>
        </header>

        <ReadingStatsCard />

        <div className="flex gap-1 border-b border-border">
          <TabButton active={tab === 'reading'} onClick={() => setTab('reading')}>
            Đang đọc <span className="ml-1 text-fg-subtle">({counts.reading})</span>
          </TabButton>
          <TabButton active={tab === 'saved'} onClick={() => setTab('saved')}>
            Đã lưu <span className="ml-1 text-fg-subtle">({counts.saved})</span>
          </TabButton>
          <TabButton active={tab === 'completed'} onClick={() => setTab('completed')}>
            Đã hoàn thành <span className="ml-1 text-fg-subtle">({counts.completed})</span>
          </TabButton>
        </div>

        {items.length === 0 ? (
          <EmptyShelf tab={tab} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((it) => (
              <LibraryCard key={it.storyId} item={it} />
            ))}
          </div>
        )}
      </div>
    );
  }

  function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button
        type="button"
        onClick={onClick}
        role="tab"
        aria-selected={active}
        className={`relative px-4 py-3 text-body font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded cursor-pointer ${
          active ? 'text-fg' : 'text-fg-muted hover:text-fg'
        }`}
      >
        {children}
        {active && (
          <span aria-hidden className="absolute -bottom-px left-2 right-2 h-0.5 bg-accent-gradient rounded-full" />
        )}
      </button>
    );
  }

  function LibraryCard({ item }: { item: ShelfItem }) {
    return (
      <Link
        to="/truyen/$slug"
        params={{ slug: item.slug }}
        search={{ page: 1 }}
        className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
      >
        <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-bg-subtle">
          <img
            src={`/api/v1/cover/${item.storyId}`}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          {item.progress && item.progress > 0 ? (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-bg/40">
              <div className="h-full bg-accent-gradient" style={{ width: `${item.progress}%` }} />
            </div>
          ) : null}
        </div>
        <h3 className="mt-3 text-heading-md line-clamp-2">{item.title}</h3>
        <p className="mt-1 text-body-sm text-fg-muted truncate">{item.author ?? 'Khuyết danh'}</p>
      </Link>
    );
  }

  // EmptyShelf is intentionally kept simple here. Phase C4 (Task 12) replaces
  // this with the <EmptyState /> primitive + illustrations.
  function EmptyShelf({ tab }: { tab: ShelfTab }) {
    const config = {
      reading: {
        title: 'Chưa có truyện đang đọc',
        desc: 'Mở 1 chương bất kỳ và đọc 5 giây — chúng tôi sẽ tự ghi nhớ.',
        cta: { label: 'Khám phá truyện', to: '/kham-pha' as const },
      },
      saved: {
        title: 'Tủ sách còn trống',
        desc: 'Đánh dấu truyện anh thích để dễ tìm lại. Bắt đầu khám phá nào.',
        cta: { label: 'Khám phá truyện', to: '/kham-pha' as const },
      },
      completed: {
        title: 'Chưa truyện nào hoàn tất',
        desc: 'Đọc đến chương cuối là tự động xuất hiện ở đây.',
        cta: null,
      },
    }[tab];
    return (
      <div className="flex flex-col items-center text-center py-16 px-4">
        <h3 className="text-heading-md">{config.title}</h3>
        <p className="mt-2 max-w-sm text-body-sm text-fg-muted">{config.desc}</p>
        {config.cta && (
          <Link
            to={config.cta.to}
            search={{ q: '', page: 1 }}
            className="mt-6 inline-flex items-center gap-2 h-10 px-4 rounded-md bg-accent-gradient text-white text-body-sm font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-200"
          >
            {config.cta.label} →
          </Link>
        )}
      </div>
    );
  }
  ```

  Note: line `to="/kham-pha"` matches the Plan A route. If `/kham-pha` route doesn't accept a `search` param of `{ q, page }`, the typechecker will catch it — relax `search` accordingly. Audit confirms `/kham-pha` accepts `{ q, page, genre }`.

  Note: the new `LibraryCard` keys rows by `item.storyId` (not the legacy `item.id`) and uses `/api/v1/cover/${item.storyId}` for the cover URL. The rewrite purges the prior `id`-based shape entirely — any leftover `it.id` references from the pre-Plan-C version are dropped along with the placeholder `items: any[] = []`.

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes.
  Run dev: open `http://localhost:3000/tu-sach` while logged in → expect: ReadingStatsCard renders above the tab bar; "Đang đọc" tab shows real progress rows; "Đã lưu" shows real bookmarks; "Đã hoàn thành" shows rows where chapter ≥ totalChapters.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/frontend/src/routes/tu-sach.tsx
  git commit -m "feat(frontend): wire /tu-sach to live data + mount ReadingStatsCard (Plan C2)"
  ```

### Task 8: Mount `ReadingStatsCard` on `/tai-khoan`

**Files:**
- Modify: `apps/frontend/src/routes/tai-khoan.tsx`

**Why this task:** Spec C reserves the slot at the top of the account page. The actual insertion target depends on whether Plan B Task 4 has shipped yet (see below).

**Depends on:** Plan B Task 4 (account page restructure). Plan B Task 4 wraps the account cards in a `<div className="space-y-6">` and inserts a placeholder comment `{/* <ReadingStatsCard /> — added in Plan C (Spec C differentiators) */}` at the exact mount point. Plan C Task 8 replaces that placeholder with the real component. If Plan C Task 8 ships BEFORE Plan B Task 4, fall back to the legacy mount path documented at the bottom of this task.

- [ ] **Step 1: Read context**
  Read `apps/frontend/src/routes/tai-khoan.tsx`. Confirm which structure is currently in place:
  - **Plan B Task 4 has shipped:** the file contains a `<div className="space-y-6">` wrapper around the cards and a comment line `{/* <ReadingStatsCard /> — added in Plan C (Spec C differentiators) */}`. Use Step 2A.
  - **Plan B Task 4 has NOT shipped:** the original layout still has `</header>` followed directly by `<AvatarCard user={user} />`. Use Step 2B.

- [ ] **Step 2A: Replace the Plan B placeholder (preferred path)**
  Add the import at the top:
  ```tsx
  import { ReadingStatsCard } from '@/components/reader/ReadingStatsCard';
  ```
  Replace the placeholder comment line `{/* <ReadingStatsCard /> — added in Plan C (Spec C differentiators) */}` with:
  ```tsx
        <ReadingStatsCard />
  ```
  The component then sits inside the `<div className="space-y-6">` wrapper, gaining the gap-6 spacing for free. Do NOT delete the wrapper.

- [ ] **Step 2B: Insert above `<AvatarCard>` (fallback only — if Plan B Task 4 has not shipped)**
  Add the import:
  ```tsx
  import { ReadingStatsCard } from '@/components/reader/ReadingStatsCard';
  ```
  Insert `<ReadingStatsCard />` between `</header>` and `<AvatarCard user={user} />`:
  ```tsx
        </header>

        <ReadingStatsCard />

        <AvatarCard user={user} />
  ```
  When Plan B Task 4 later lands, it will detect this real `<ReadingStatsCard />` and SKIP inserting its placeholder comment (Plan B Task 4 step 2 already handles this case — it only inserts the comment when the real component is absent).

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes.
  Open `http://localhost:3000/tai-khoan` → expect: stats card renders between the header and the avatar card. No layout shift (skeleton in place during load).

- [ ] **Step 4: Commit**
  ```bash
  git add apps/frontend/src/routes/tai-khoan.tsx
  git commit -m "feat(frontend): mount ReadingStatsCard on /tai-khoan (Plan C2)"
  ```

### Task 9: Wire `LoggedInHero` on `/` to live continue-reading data

**Files:**
- Modify: `apps/frontend/src/routes/index.tsx` (replace lines 57-62)

**Why this task:** Plan A's `LoggedInHero` falls back to `AnonHero`. Spec C wants a real "Đọc tiếp" hero card so the home page rewards returning readers.

- [ ] **Step 1: Read context**
  Re-read lines 9-22 + 57-62 of `apps/frontend/src/routes/index.tsx`.

- [ ] **Step 2: Replace `LoggedInHero`**
  Update the imports at the top of `apps/frontend/src/routes/index.tsx`:
  - `ArrowRight` is already imported on line 3 — ADD `BookOpen` to that same `lucide-react` import. After editing, line 3 reads: `import { ArrowRight, BookOpen } from 'lucide-react';`.
  - `useQuery` is already imported on line 2 (`import { useQuery } from '@tanstack/react-query';`) — no change needed.
  - Add a new line: `import { meApi } from '@/api/me';`.

  Then replace the `LoggedInHero` function (lines 57-62) with:
  ```tsx
  function LoggedInHero() {
    const q = useQuery({
      queryKey: ['me', 'continue-reading'],
      queryFn: () => meApi.continueReading(),
      staleTime: 60_000,
    });
    const cr = q.data;
    if (q.isLoading) {
      return (
        <section className="relative overflow-hidden rounded-xl border border-border bg-bg-elevated p-8 lg:p-12">
          <div className="h-3 w-20 bg-bg-subtle rounded mb-3 animate-pulse" />
          <div className="h-10 w-3/4 bg-bg-subtle rounded mb-3 animate-pulse" />
          <div className="h-4 w-1/2 bg-bg-subtle rounded animate-pulse" />
        </section>
      );
    }
    if (!cr) return <AnonHero />;
    const chapter = Math.floor(Number(cr.chapterIndex));
    return (
      <section className="relative overflow-hidden rounded-xl border border-accent/20 bg-bg-elevated p-8 lg:p-12">
        <div aria-hidden className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row gap-6 sm:items-center">
          {cr.hasCover && (
            <img
              src={`/api/v1/cover/${cr.storyId}`}
              alt=""
              loading="lazy"
              className="hidden sm:block h-32 w-24 rounded-md object-cover border border-border flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-label text-accent uppercase mb-2 flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" aria-hidden />
              ĐỌC TIẾP · CHƯƠNG {chapter} / {cr.totalChapters}
            </p>
            <h1 className="text-display-sm sm:text-display-md font-prose font-semibold truncate">
              {cr.storyTitle}
            </h1>
            <p className="mt-3 text-body text-fg-muted">
              Bạn đang đọc dở chương {chapter}. Tiếp tục ngay nào.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/truyen/$slug/chuong/$index"
                params={{ slug: cr.storySlug, index: String(chapter) }}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-accent-gradient text-white text-body font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                Tiếp tục đọc <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                to="/truyen/$slug"
                params={{ slug: cr.storySlug }}
                search={{ page: 1 }}
                className="inline-flex items-center h-11 px-5 rounded-md border border-border-strong hover:bg-bg-subtle text-body font-semibold transition-colors duration-fast"
              >
                Xem truyện
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }
  ```

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes.
  Open `http://localhost:3000/` while logged in with a user that has progress → expect: pink-glow hero card with cover, chapter number, story title, "Tiếp tục đọc" CTA. Logged-out users still see `AnonHero`. Users with zero progress also see `AnonHero` (fallback).

- [ ] **Step 4: Commit**
  ```bash
  git add apps/frontend/src/routes/index.tsx
  git commit -m "feat(frontend): wire LoggedInHero to continue-reading (Plan C2)"
  ```

---

## Phase C3 — Drop-cap + reading typography + (optional) session tracking

Drop-cap, Newsreader 600 title, reading-time eyebrow, and scene-break ship without DB migration. Session tracking + `weeklyHours` is gated separately at Task 11 and can be deferred.

### Task 10: Drop-cap + scene-break + Newsreader chapter title

**Files:**
- Modify: `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx` (lines 165-187 — chapter title + prose render block)
- Modify: `apps/frontend/src/styles.css` (append `.drop-cap` rules)

**Why this task:** Drop-cap + serif title + scene-break are the editorial touches that differentiate SManga's reading experience from a forum dump.

- [ ] **Step 1: Read context**
  Re-read `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx` lines 86-92 (`fontSize` map) + lines 165-187 (article render). The chapter title already uses `font-prose font-semibold` (line 167), but Spec C wants 600 weight — confirm `font-semibold` in Tailwind v4 is 600 (yes, default). The reading-time eyebrow is already on line 171 (`{estMinutes} PHÚT ĐỌC`) — keep it.

- [ ] **Step 2: Append `.drop-cap` CSS**
  Open `apps/frontend/src/styles.css`. Append (no replace of existing rules):
  ```css
  /* Plan C3: drop-cap for chapter first paragraph */
  .drop-cap {
    font-family: 'Newsreader', Georgia, 'Times New Roman', serif;
    font-weight: 700;
    font-size: 3.5em;
    line-height: 0.85;
    float: left;
    margin: 6px 12px 0 0;
    background: linear-gradient(135deg, var(--accent), var(--accent-strong));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
  }

  @media (prefers-reduced-motion: reduce) {
    .drop-cap {
      background: none;
      -webkit-text-fill-color: currentColor;
      color: var(--fg);
    }
  }

  /* Plan C3: scene break "* * *" → centered dots */
  .scene-break {
    display: block;
    text-align: center;
    margin: 2.5em 0;
    font-family: 'Newsreader', Georgia, 'Times New Roman', serif;
    font-size: 1.5em;
    letter-spacing: 0.4em;
    color: var(--fg-muted);
    user-select: none;
  }
  ```

- [ ] **Step 3: Replace the prose render block**
  In `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx`, replace the block currently at lines 174-180:
  ```tsx
          {chapter.isCrawled && chapter.content ? (
            <div className={`${fontFamilyClass} ${fontSizeClass} text-fg/95 [&_p]:mb-5`}>
              {chapter.content.split('\n\n').map((para, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <p key={i}>{para}</p>
              ))}
            </div>
          ) : (
  ```
  With the drop-cap + scene-break aware renderer. Above the `return` (after `estMinutes` declaration ~line 102) add:
  ```tsx
    // Drop-cap eligibility — suppress on smallest font size or when no letter in first 20 chars.
    // The store ships fontSize as the string union '15' | '18' | '20' | '24' (per Plan B Task 5,
    // which preserves the existing reader-prefs contract). Suppress at '15' per Spec C.
    const wordCount = (chapter.content?.match(/\S+/g) ?? []).length;
    const readingMinutes = Math.max(1, Math.ceil(wordCount / 250));
    const dropCapAllowed = fontSize !== '15';

    function renderParagraph(para: string, i: number) {
      // Scene break detector
      const trimmed = para.trim();
      if (trimmed === '* * *' || trimmed === '***' || /^[*·•・]{3,}$/.test(trimmed)) {
        return (
          <p key={i} aria-hidden className="scene-break">
            · · ·
          </p>
        );
      }
      if (i === 0 && dropCapAllowed) {
        // Find first letter (skip leading non-letters) — Unicode-aware
        const match = para.match(/^([^\p{L}]{0,20})(\p{L})(.*)$/su);
        if (match) {
          const [, prefix, letter, rest] = match;
          return (
            <p key={i}>
              {prefix}
              <span className="drop-cap" aria-hidden>
                {letter}
              </span>
              <span className="sr-only">{letter}</span>
              {rest}
            </p>
          );
        }
      }
      return <p key={i}>{para}</p>;
    }
  ```
  Then replace the render block:
  ```tsx
          {chapter.isCrawled && chapter.content ? (
            <div className={`${fontFamilyClass} ${fontSizeClass} text-fg/95 [&_p]:mb-5`}>
              {chapter.content.split('\n\n').map(renderParagraph)}
            </div>
          ) : (
  ```
  Also update line 171 to use `readingMinutes` instead of `estMinutes` for accuracy (Spec C says word-based, not char-based):
  ```tsx
        <p className="text-label text-fg-subtle mb-9">
          CHƯƠNG {chapter.index} · {readingMinutes} PHÚT ĐỌC
        </p>
  ```
  **Delete the now-unused `const estMinutes = …` declaration on line 102.** `readingMinutes` (word-based, more accurate) replaces it; leaving `estMinutes` produces a TS6133 "declared but never used" warning.

  Notes on accessibility:
  - The `aria-hidden` `<span class="drop-cap">` is purely decorative — the actual letter is also rendered inside an `<span class="sr-only">` so screen readers read the full word ("Thẩm") without the visual drop-cap glyph being announced. Tailwind v4 provides `.sr-only` out of the box.
  - The `prefers-reduced-motion` media query in `styles.css` strips the gradient (the gradient *can* shimmer under some accessibility tools).

- [ ] **Step 4: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes.
  Open any chapter route (e.g. `http://localhost:3000/truyen/<some-slug>/chuong/1`) → expect:
  - First paragraph: pink-gradient drop-cap on the first letter, body text flowing around it.
  - "N PHÚT ĐỌC" eyebrow under the title (word-based now).
  - If a paragraph contains `* * *`, it renders as centered `· · ·` decoration.
  - In reader settings, switching to font size "Nhỏ" (15) → drop-cap disappears, paragraph renders normally. Switching back to "Vừa" (18) or larger → drop-cap returns.
  - macOS / DevTools `Emulate CSS prefers-reduced-motion: reduce` → drop-cap renders solid `var(--fg)` color (no gradient).

- [ ] **Step 5: Commit**
  ```bash
  git add apps/frontend/src/styles.css apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx
  git commit -m "feat(frontend): drop-cap + scene-break + word-based reading time (Plan C3)"
  ```

### Task 11: (OPTIONAL) Session tracking + migration 0008 + `weeklyHours`

**Status:** GATED. Ship Tasks 1-10 + 12-15 first. Come back here if the user wants the `weeklyHours` stat live.

**Files:**
- Create: `packages/db/src/migrations/0008_session_seconds.sql`
- Modify: `packages/db/src/schema/user-data.ts`
- Modify: `packages/db/drizzle.config.ts` (no change — the `schema:` array already includes `user-data.ts`)
- Modify: `apps/api/src/modules/user-data/dto/reading-progress.dto.ts`
- Modify: `apps/api/src/modules/user-data/reading-progress.service.ts`
- Modify: `apps/api/src/modules/user-data/stats.service.ts`
- Create: `apps/frontend/src/hooks/use-session-tracker.ts`
- Modify: `apps/frontend/src/api/reading-progress.ts`
- Modify: `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx`

**Why this task:** Currently `weeklyHours` is hardcoded to `0` in `stats.service.ts`. Unlocking it requires (a) schema column, (b) FE timer that respects Page Visibility, (c) batched write on unmount/pagehide/60s.

- [ ] **Step 1: Write migration 0008**
  Create `packages/db/src/migrations/0008_session_seconds.sql`:
  ```sql
  ALTER TABLE "reading_progress"
    ADD COLUMN "session_seconds" integer NOT NULL DEFAULT 0;
  ```
  Run: `pnpm db:migrate` → expect: migration applied cleanly to dev DB.

- [ ] **Step 2: Update schema**
  Modify `packages/db/src/schema/user-data.ts`:
  ```ts
  import { integer, numeric, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
  // ...
  export const readingProgress = pgTable(
    'reading_progress',
    {
      userId: text('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
      storyId: uuid('story_id').notNull(),
      chapterIndex: numeric('chapter_index', { precision: 10, scale: 2 }).notNull(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
      sessionSeconds: integer('session_seconds').notNull().default(0),
    },
    (t) => ({ pk: primaryKey({ columns: [t.userId, t.storyId] }) }),
  );
  ```

- [ ] **Step 3: Extend DTO + service to accept seconds delta**
  Update `apps/api/src/modules/user-data/dto/reading-progress.dto.ts`:
  ```ts
  import { ApiProperty } from '@nestjs/swagger';
  import { IsInt, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

  export class ReadingProgressDto {
    @ApiProperty() @IsUUID() storyId!: string;
    @ApiProperty() @IsNumber() @Min(0) chapterIndex!: number;
    @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) seconds?: number;
  }
  ```
  Update `apps/api/src/modules/user-data/reading-progress.service.ts` `upsert` signature:
  ```ts
  async upsert(userId: string, storyId: string, chapterIndex: number, seconds: number = 0) {
    await this.db
      .insert(readingProgress)
      .values({
        userId,
        storyId,
        chapterIndex: String(chapterIndex),
        updatedAt: new Date(),
        sessionSeconds: seconds,
      })
      .onConflictDoUpdate({
        target: [readingProgress.userId, readingProgress.storyId],
        set: {
          chapterIndex: String(chapterIndex),
          updatedAt: new Date(),
          sessionSeconds: sql`${readingProgress.sessionSeconds} + ${seconds}`,
        },
      });
    return { ok: true };
  }
  ```
  Update controller:
  ```ts
  @Put()
  upsert(@CurrentUser() u: { id: string }, @Body() dto: ReadingProgressDto) {
    return this.svc.upsert(u.id, dto.storyId, dto.chapterIndex, dto.seconds ?? 0);
  }
  ```

- [ ] **Step 4: Light up `weeklyHours` in `stats.service.ts`**
  Replace `const weeklyHours = 0;` with:
  ```ts
  const weeklyResult = await this.db.execute<{ secs: number }>(sql`
    SELECT COALESCE(SUM(session_seconds), 0)::int AS secs
    FROM reading_progress
    WHERE user_id = ${userId}
      AND updated_at > now() - interval '7 days'
  `);
  const weeklySecs = Number((weeklyResult.rows as Array<{ secs: number }>)[0]?.secs ?? 0);
  const weeklyHours = Math.round(weeklySecs / 3600);
  ```

- [ ] **Step 5: FE session tracker hook**
  Create `apps/frontend/src/hooks/use-session-tracker.ts`:
  ```ts
  import { useEffect, useRef } from 'react';
  import { readingProgressApi } from '@/api/reading-progress';
  import { useAuthStore } from '@/stores/auth-store';

  /**
   * Counts seconds while the page is visible. Flushes the accumulated delta:
   *   - every 60 seconds while visible
   *   - on unmount (chapter change / route nav)
   *   - on pagehide (tab close / backgrounded for some browsers)
   * Anonymous users no-op.
   */
  export function useSessionTracker(storyId: string, chapterIndex: number) {
    const user = useAuthStore((s) => s.user);
    const deltaRef = useRef(0);

    useEffect(() => {
      if (!user) return;
      let lastTick = Date.now();
      let visible = !document.hidden;

      function flush() {
        const seconds = deltaRef.current;
        if (seconds < 1) return;
        deltaRef.current = 0;
        readingProgressApi.upsert(storyId, chapterIndex, seconds).catch(() => {});
      }

      function tick() {
        if (!visible) {
          lastTick = Date.now();
          return;
        }
        const now = Date.now();
        deltaRef.current += Math.floor((now - lastTick) / 1000);
        lastTick = now;
        if (deltaRef.current >= 60) flush();
      }

      function onVisibility() {
        visible = !document.hidden;
        lastTick = Date.now();
      }

      function onPageHide() {
        tick();
        flush();
      }

      const interval = window.setInterval(tick, 1000);
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', onPageHide);

      return () => {
        window.clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', onPageHide);
        tick();
        flush();
      };
    }, [storyId, chapterIndex, user]);
  }
  ```

- [ ] **Step 6: Update FE API + chapter reader**
  Update `apps/frontend/src/api/reading-progress.ts`:
  ```ts
  upsert: (storyId: string, chapterIndex: number, seconds?: number) =>
    api.put('/me/reading-progress', { storyId, chapterIndex, ...(seconds !== undefined && { seconds }) }).then((r) => r.data),
  ```
  In `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx`, add hook call inside `ChapterReader` after the existing `ReadingProgressTracker`:
  ```tsx
    useSessionTracker(story.id, Number(chapter.index));
  ```
  (Add import: `import { useSessionTracker } from '@/hooks/use-session-tracker';`).

- [ ] **Step 7: Verify locally**
  Run: `pnpm --filter @smanga/api typecheck` and `pnpm --filter @smanga/frontend typecheck` → expect: passes.
  Open a chapter, leave the tab in foreground for 70 seconds → expect: at the 60s mark, a `PUT /me/reading-progress` with `seconds: 60` fires (DevTools Network tab). Navigate away → expect: a second PUT with the remaining delta.
  `psql`: `SELECT session_seconds FROM reading_progress WHERE user_id = '<id>' AND story_id = '<id>'` → expect: matches accumulated time.
  Reload `/tu-sach` → expect: stats card now shows "Giờ đọc" tile (provided weeklySecs / 3600 ≥ 1).

- [ ] **Step 8: Commit (single commit for the migration + wiring)**
  ```bash
  git add packages/db/src/migrations/0008_session_seconds.sql packages/db/src/schema/user-data.ts apps/api/src/modules/user-data/dto/reading-progress.dto.ts apps/api/src/modules/user-data/reading-progress.service.ts apps/api/src/modules/user-data/reading-progress.controller.ts apps/api/src/modules/user-data/stats.service.ts apps/frontend/src/hooks/use-session-tracker.ts apps/frontend/src/api/reading-progress.ts apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx
  git commit -m "feat: session tracking + weeklyHours stat (Plan C3 optional)"
  ```

---

## Phase C4 — EmptyState primitive + per-surface integration

EmptyState is the unifying primitive across 8 surfaces. We build it once, then thread it through.

**Sequencing note:** Phase C4 (Tasks 12-15) MUST ship AFTER Plan B Tasks 11 + 14, which retoken admin tables/badges/filter chips (`apps/frontend/src/routes/admin/users.tsx`, `apps/frontend/src/routes/admin/stories/index.tsx`) and the delete modal in `users.tsx`. Plan C Task 15 then drops the unified `EmptyState` into those already-retoken'd surfaces. If Phase C4 lands first, the `EmptyState` markup will still render correctly (it uses Plan A tokens), but the surrounding table/badge styles will look mismatched until Plan B catches up. Also: Plan B Task 11 retokens `JobsTable.tsx` but does NOT touch `apps/frontend/src/routes/admin/jobs.tsx` directly — Plan C Task 15 edits the route file and is therefore independent of Plan B's JobsTable work.

### Task 12: Create `EmptyState` primitive + 4 SVG illustrations

**Files:**
- Create: `apps/frontend/src/components/ui/EmptyState.tsx`
- Create: `apps/frontend/src/components/ui/illustrations/EmptyBookshelf.tsx`
- Create: `apps/frontend/src/components/ui/illustrations/EmptySearch.tsx`
- Create: `apps/frontend/src/components/ui/illustrations/EmptyQueue.tsx`
- Create: `apps/frontend/src/components/ui/illustrations/EmptyFolder.tsx`

**Why this task:** One primitive + 4 illustrations replaces 8 scattered ad-hoc empty states. All future empties use this.

- [ ] **Step 1: Read context**
  Skim Spec C §Feature 3 (the table mapping surfaces to title/desc/CTA).

- [ ] **Step 2: Create `EmptyState.tsx`**
  Write `apps/frontend/src/components/ui/EmptyState.tsx`:
  ```tsx
  import { Link } from '@tanstack/react-router';
  import type { ReactNode } from 'react';

  /**
   * EmptyState — unified empty-surface primitive for Spec C.
   *
   * Typing trade-off: `to` is typed as `string` (and `search`/`params` as plain records)
   * rather than indexing `LinkProps['to']`. TanStack Router's `LinkProps['to']` is a
   * heavily-generic mapped type that collapses to a loose form once erased through this
   * boundary; the previous attempt used `as never` casts that erased the safety anyway.
   * Accepting an explicit `string` keeps the primitive simple and avoids forcing every
   * call site to satisfy the router's full conditional types. The trade-off: a caller
   * passing `to="/truyen/$slug"` without `params` will navigate to a literal
   * `'/truyen/$slug'`. Callers must pass `params` when the route has dynamic segments.
   */
  export interface EmptyStateProps {
    illustration: ReactNode;
    title: string;
    description: string;
    cta?:
      | { label: string; to: string; search?: Record<string, unknown>; params?: Record<string, string> }
      | { label: string; onClick: () => void };
  }

  export function EmptyState({ illustration, title, description, cta }: EmptyStateProps) {
    return (
      <div className="flex flex-col items-center text-center py-16 px-4">
        <div className="mb-6 w-32 h-32 sm:w-40 sm:h-40">{illustration}</div>
        <h3 className="text-heading-md sm:text-heading-lg">{title}</h3>
        <p className="mt-2 max-w-md text-body-sm sm:text-body text-fg-muted">{description}</p>
        {cta && 'to' in cta && (
          <Link
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            to={cta.to as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            search={cta.search as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            params={cta.params as any}
            className="mt-6 inline-flex items-center gap-2 h-10 px-5 rounded-md bg-accent-gradient text-white text-body-sm font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            {cta.label} →
          </Link>
        )}
        {cta && 'onClick' in cta && (
          <button
            type="button"
            onClick={cta.onClick}
            className="mt-6 inline-flex items-center gap-2 h-10 px-5 rounded-md bg-accent-gradient text-white text-body-sm font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg cursor-pointer"
          >
            {cta.label}
          </button>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 3: Create `EmptyBookshelf.tsx`**
  ```tsx
  export function EmptyBookshelf() {
    return (
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className="w-full h-full">
        <defs>
          <linearGradient id="bs-accent" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-strong)" />
          </linearGradient>
        </defs>
        {/* Shelf base */}
        <rect x="20" y="120" width="120" height="6" rx="2" fill="var(--border-strong)" />
        {/* Ghost book 1 (left) */}
        <rect x="30" y="50" width="22" height="70" rx="3" fill="none" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="4 4" />
        {/* Accent book (middle, pink gradient) */}
        <rect x="60" y="40" width="26" height="80" rx="3" fill="url(#bs-accent)" />
        <rect x="64" y="50" width="18" height="2" rx="1" fill="white" opacity="0.6" />
        <rect x="64" y="56" width="14" height="2" rx="1" fill="white" opacity="0.4" />
        {/* Ghost book 2 (right) */}
        <rect x="94" y="55" width="22" height="65" rx="3" fill="none" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="4 4" />
        {/* Sparkle */}
        <circle cx="120" cy="40" r="3" fill="url(#bs-accent)" />
        <circle cx="40" cy="35" r="2" fill="url(#bs-accent)" opacity="0.5" />
      </svg>
    );
  }
  ```

- [ ] **Step 4: Create `EmptySearch.tsx`**
  ```tsx
  export function EmptySearch() {
    return (
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className="w-full h-full">
        <defs>
          <linearGradient id="es-accent" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-strong)" />
          </linearGradient>
        </defs>
        <circle cx="68" cy="68" r="34" fill="none" stroke="var(--border-strong)" strokeWidth="3" />
        <line x1="94" y1="94" x2="124" y2="124" stroke="url(#es-accent)" strokeWidth="5" strokeLinecap="round" />
        <text
          x="68"
          y="80"
          textAnchor="middle"
          fill="url(#es-accent)"
          fontFamily="Newsreader, serif"
          fontWeight="700"
          fontSize="38"
        >
          ?
        </text>
      </svg>
    );
  }
  ```

- [ ] **Step 5: Create `EmptyQueue.tsx`**
  ```tsx
  export function EmptyQueue() {
    return (
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className="w-full h-full">
        <defs>
          <linearGradient id="eq-accent" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-strong)" />
          </linearGradient>
        </defs>
        <circle cx="80" cy="80" r="48" fill="none" stroke="var(--border-strong)" strokeWidth="3" />
        <line x1="80" y1="80" x2="80" y2="48" stroke="url(#eq-accent)" strokeWidth="4" strokeLinecap="round" />
        <line x1="80" y1="80" x2="104" y2="92" stroke="var(--border-strong)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="80" cy="80" r="4" fill="url(#eq-accent)" />
        <circle cx="80" cy="32" r="2" fill="var(--border-strong)" />
        <circle cx="128" cy="80" r="2" fill="var(--border-strong)" />
        <circle cx="80" cy="128" r="2" fill="var(--border-strong)" />
        <circle cx="32" cy="80" r="2" fill="var(--border-strong)" />
      </svg>
    );
  }
  ```

- [ ] **Step 6: Create `EmptyFolder.tsx`**
  ```tsx
  export function EmptyFolder() {
    return (
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className="w-full h-full">
        <defs>
          <linearGradient id="ef-accent" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-strong)" />
          </linearGradient>
        </defs>
        <path
          d="M30 55 L30 120 Q30 130 40 130 L120 130 Q130 130 130 120 L130 70 Q130 60 120 60 L75 60 L65 50 L40 50 Q30 50 30 55 Z"
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {/* Pink corner accent */}
        <path
          d="M120 60 L130 70 L130 80 Z"
          fill="url(#ef-accent)"
        />
        <circle cx="80" cy="95" r="3" fill="var(--border-strong)" />
        <circle cx="68" cy="95" r="3" fill="var(--border-strong)" />
        <circle cx="92" cy="95" r="3" fill="var(--border-strong)" />
      </svg>
    );
  }
  ```

- [ ] **Step 7: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes.

- [ ] **Step 8: Commit**
  ```bash
  git add apps/frontend/src/components/ui/EmptyState.tsx apps/frontend/src/components/ui/illustrations/
  git commit -m "feat(frontend): EmptyState primitive + 4 SVG illustrations (Plan C4)"
  ```

### Task 13: Apply `EmptyState` to `/tu-sach` 3 tabs

**Files:**
- Modify: `apps/frontend/src/routes/tu-sach.tsx` (replace `EmptyShelf` function from Task 7)

**Why this task:** The 3-tab shelf is the most-touched empty surface. Each tab gets the correct illustration + copy + CTA per spec table.

- [ ] **Step 1: Read context**
  Re-read the `EmptyShelf` function in `tu-sach.tsx` (Task 7 version).

- [ ] **Step 2: Replace `EmptyShelf`**
  Add imports at the top of `apps/frontend/src/routes/tu-sach.tsx`:
  ```tsx
  import { EmptyState } from '@/components/ui/EmptyState';
  import { EmptyBookshelf } from '@/components/ui/illustrations/EmptyBookshelf';
  import { EmptyFolder } from '@/components/ui/illustrations/EmptyFolder';
  ```
  Replace the entire `EmptyShelf` function with:
  ```tsx
  function EmptyShelf({ tab }: { tab: ShelfTab }) {
    if (tab === 'reading') {
      return (
        <EmptyState
          illustration={<EmptyBookshelf />}
          title="Chưa có truyện đang đọc"
          description="Mở 1 chương bất kỳ và đọc 5 giây — chúng tôi sẽ tự ghi nhớ."
          cta={{ label: 'Khám phá truyện', to: '/kham-pha', search: { q: '', page: 1 } }}
        />
      );
    }
    if (tab === 'saved') {
      return (
        <EmptyState
          illustration={<EmptyBookshelf />}
          title="Tủ sách còn trống"
          description="Đánh dấu truyện anh thích để dễ tìm lại. Bắt đầu khám phá nào."
          cta={{ label: 'Khám phá truyện', to: '/kham-pha', search: { q: '', page: 1 } }}
        />
      );
    }
    return (
      <EmptyState
        illustration={<EmptyFolder />}
        title="Chưa truyện nào hoàn tất"
        description="Đọc đến chương cuối là tự động xuất hiện ở đây."
      />
    );
  }
  ```

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes.
  Open `/tu-sach` on a fresh user → expect: each of the 3 tabs shows the correct illustration + title + description + CTA per Spec C table. The Completed tab has no CTA.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/frontend/src/routes/tu-sach.tsx
  git commit -m "feat(frontend): apply EmptyState to /tu-sach tabs (Plan C4)"
  ```

### Task 14: Apply `EmptyState` to `/kham-pha` (and the `/tim-kiem` redirect surface)

**Files:**
- Modify: `apps/frontend/src/routes/kham-pha.tsx`

**Why this task:** `/kham-pha` is the public search/browse surface. `/tim-kiem` is already a redirect into it (Plan A), so this single edit satisfies both Spec C surfaces.

- [ ] **Step 1: Read context**
  Read all of `apps/frontend/src/routes/kham-pha.tsx`. Confirm the current state: there is a local `function EmptyState()` at line 130 (used at line 124 via `<EmptyState />`) and the file imports `Search` from `lucide-react` (line 4) for use inside that local function and the search-input glyph at line 52.

- [ ] **Step 2: Replace the no-results block**

  Step 2a — DELETE the existing local empty primitive (it collides with the new import):
  - Remove the existing `function EmptyState() { … }` declaration on lines 130-146 of `kham-pha.tsx`. After deletion, the call site `<EmptyState />` on line 124 will resolve to the imported primitive added below.
  - DO NOT remove the `Search` Lucide import from line 4 — it is still used on line 52 (the search input glyph). Only the second usage inside the deleted local `EmptyState` goes away.

  Step 2b — Add the imports at the top of the file:
  ```tsx
  import { useNavigate } from '@tanstack/react-router';
  import { EmptyState } from '@/components/ui/EmptyState';
  import { EmptySearch } from '@/components/ui/illustrations/EmptySearch';
  ```
  (Merge the `useNavigate` import into the existing `@tanstack/react-router` import line if you prefer — `import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';`.)

  Step 2c — Update the call site (line 124) to pass the new props. Replace the bare `<EmptyState />` with:
  ```tsx
  <EmptyState
    illustration={<EmptySearch />}
    title="Không tìm thấy truyện nào khớp"
    description="Thử từ khoá khác, hoặc xoá bộ lọc để xem tất cả."
    cta={{
      label: 'Xoá bộ lọc',
      onClick: () => navigate({ to: '/kham-pha', search: { q: '', page: 1, genre: undefined } }),
    }}
  />
  ```
  Inside the page component, declare `const navigate = useNavigate();` near the top (before the JSX). This avoids the smooth-scroll-to-nowhere problem: `/kham-pha` does not currently have a "Mới cập nhật" section, so the CTA instead clears the active filters and returns the user to the unfiltered browse view. Same Spec C intent ("escape route from the empty state"), but the action actually resolves.

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes (no duplicate-identifier error for `EmptyState`).
  Open `http://localhost:3000/kham-pha?q=zzz_no_match` → expect: search illustration + title "Không tìm thấy truyện nào khớp" + "Xoá bộ lọc" button. Clicking the button navigates to `/kham-pha` with `q=''` and clears the active genre, returning the full browse view.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/frontend/src/routes/kham-pha.tsx
  git commit -m "feat(frontend): apply EmptyState to /kham-pha no-results (Plan C4)"
  ```

### Task 15: Apply `EmptyState` to admin surfaces (`/admin/users`, `/admin/jobs`, `/admin/stories`)

**Files:**
- Modify: `apps/frontend/src/routes/admin/users.tsx`
- Modify: `apps/frontend/src/routes/admin/jobs.tsx`
- Modify: `apps/frontend/src/routes/admin/stories/index.tsx`

**Why this task:** Replace ad-hoc admin empty placeholders with the unified `EmptyState`. Per-surface copy per spec table.

- [ ] **Step 1: Read context**
  Open each of the three files, locate the existing empty-state placeholder (search for "Không tìm thấy" / "trống" / "chưa có"). They typically render plain text or a Lucide icon + text.

- [ ] **Step 2: `/admin/users` — wire EmptyState**
  Add imports:
  ```tsx
  import { EmptyState } from '@/components/ui/EmptyState';
  import { EmptySearch } from '@/components/ui/illustrations/EmptySearch';
  ```
  Confirmed from `apps/frontend/src/routes/admin/users.tsx`: the search query is held in two places — the typed-input local state `searchInput` (declared on line 27 as `const [searchInput, setSearchInput] = useState(q);`) and the URL search param `q` (cleared via `navigate({ search: { q: '', page: 1 } })`). The page already has a `clearSearch` handler on line 54 that does both. Reuse that handler. Replace the search-no-results path:
  ```tsx
  <EmptyState
    illustration={<EmptySearch />}
    title="Không tìm thấy tài khoản nào"
    description="Thử từ khoá khác."
    cta={{ label: 'Xoá tìm kiếm', onClick: clearSearch }}
  />
  ```
  If `clearSearch` is not yet defined as a callable (i.e. it's an inline event handler on the form), extract it into a named function in the component scope first:
  ```tsx
  const clearSearch = () => {
    setSearchInput('');
    void navigate({ search: { q: '', page: 1 } });
  };
  ```
  Then both the form's "clear" button and the EmptyState CTA can call it.

- [ ] **Step 3: `/admin/jobs` — wire EmptyState**
  Add imports:
  ```tsx
  import { EmptyState } from '@/components/ui/EmptyState';
  import { EmptyQueue } from '@/components/ui/illustrations/EmptyQueue';
  ```
  Replace the no-jobs empty path:
  ```tsx
  <EmptyState
    illustration={<EmptyQueue />}
    title="Hàng đợi đang trống"
    description="Crawl một truyện để thấy job xuất hiện ở đây."
    cta={{ label: 'Đi đến Truyện', to: '/admin/stories' }}
  />
  ```

- [ ] **Step 4: `/admin/stories/index.tsx` — wire EmptyState**
  Add imports:
  ```tsx
  import { EmptyState } from '@/components/ui/EmptyState';
  import { EmptyFolder } from '@/components/ui/illustrations/EmptyFolder';
  ```
  Replace the no-stories empty path:
  ```tsx
  <EmptyState
    illustration={<EmptyFolder />}
    title="Chưa có truyện nào"
    description="Bắt đầu từ catalog của một nguồn để import metadata."
    cta={{ label: 'Chọn nguồn', to: '/admin/sources' }}
  />
  ```

- [ ] **Step 5: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes.
  Visit each admin route (`/admin/users` with a search that matches nothing; `/admin/jobs` on a fresh DB; `/admin/stories` on a fresh DB) → expect: each renders the correct EmptyState with title, description, CTA. The `/admin/users` "Xoá tìm kiếm" button clears the search input and re-renders the full table.

- [ ] **Step 6: Commit**
  ```bash
  git add apps/frontend/src/routes/admin/users.tsx apps/frontend/src/routes/admin/jobs.tsx apps/frontend/src/routes/admin/stories/index.tsx
  git commit -m "feat(frontend): apply EmptyState to admin pages (Plan C4)"
  ```

---

## Cross-cutting acceptance (sweep before declaring DONE)

After all tasks land, sweep the following in one session:

- [ ] **ContinueReadingBar** renders on every non-chapter route when the user has progress; hides on `/truyen/<that-slug>/chuong/<index>`; never shows for anonymous.
- [ ] **ReadingStatsCard** renders on `/tu-sach` and `/tai-khoan` (NOT on `/ban` — by design, since `/ban` is a redirect). Not on `/` (Home has its own LoggedInHero).
- [ ] **Stats update** within ~60s of a chapter read (cache TTL) or instantly on the next route navigation (TanStack Query invalidation in `ReadingProgressTracker`).
- [ ] **Streak verification** with seeded data: insert 5 consecutive days of progress → `streakDays = 5`. Insert with a 1-day gap → `streakDays = 1` (only today). Insert today only → `streakDays = 1`.
- [ ] **EmptyState** renders on all 8 surfaces with the correct copy + CTA per Spec C table (3 × tu-sach tabs + kham-pha + tim-kiem-via-redirect + admin/users + admin/jobs + admin/stories).
- [ ] **Drop-cap** renders pink gradient on the first letter of the first paragraph of every crawled chapter. Suppressed at font size "Nhỏ" ('15') and under `prefers-reduced-motion: reduce`. Falls back to non-gradient when the first 20 chars have no letter.
- [ ] **Screen reader** test: `VoiceOver` / NVDA reading the first paragraph reads the full word (e.g. "Thẩm"), not "T... Thẩm". (Test by routing through the page with screen reader on.)
- [ ] **Reading time** correct on a 1000-word chapter (~4 minutes via `ceil(wordCount / 250)`).
- [ ] **Scene break** `* * *` renders as centered `· · ·` decoration. Plain text paragraphs render normally.
- [ ] **Light + dark themes**: stats card + drop-cap gradient + illustrations look correct in both. Switch via `data-theme="dark"` on `<html>`.
- [ ] **`pnpm --filter @smanga/frontend typecheck`** passes. `pnpm --filter @smanga/api typecheck` passes.
- [ ] **No `git push`** performed.

---

## Out of scope (deferred)

- Tokens, shells, page structure → **Spec A** (shipped).
- Auth, Account base styling, Admin tokens → **Spec B** (separate plan).
- Year-in-review, share quote cards, social features → defer.
- Streaks-as-game (badges, milestones, push notifications) → defer.
- Cover-color extraction for backdrops → defer.

## Risks + mitigations (carried from Spec)

- **`/me/stats` slow at scale.** Mitigation: queries are bounded (`updated_at > now() - 7 days` for sparkline / weekly), `streak_days` CTE limits scan to distinct days. Add covering index `(user_id, updated_at DESC)` on `reading_progress` if EXPLAIN shows seq scan. At hobby scale (<10k users, <1M progress rows) plain queries are fine.
- **Streak calculation across DST/TZ.** Mitigation: server pins `Asia/Ho_Chi_Minh` in both daily-sparkline and streak CTEs. Documented in service file.
- **`session_seconds` inflates DB writes.** Mitigation: FE batches — flush only every 60s, on `pagehide`, or on unmount. Single UPDATE per flush, not per second.
- **Drop-cap on mid-sentence/punctuation.** Mitigation: Unicode regex `^([^\p{L}]{0,20})(\p{L})(.*)$` skips up to 20 leading non-letters; if no letter found, no drop-cap.
- **SVG illustration bundle bloat.** Mitigation: each illustration <2 KB minified (verified by `pnpm build --filter @smanga/frontend && ls -la dist/assets/...`). All 4 fit easily under 10 KB combined — no lazy-import needed.
- **`/ban` redirect ambiguity.** Resolved: drop ReadingStatsCard from `/ban`, place only on `/tu-sach` + `/tai-khoan` (redirect already lands there).

## Migration phases (this plan)

| Phase | Tasks | Migration? | Independent? |
|---|---|---|---|
| C1 — BE endpoints | 1, 2, 3 | no | foundation for C2 |
| C2 — FE wire | 4, 5, 6, 7, 8, 9 | no | depends on C1 |
| C3 — Drop-cap + (optional) session tracking | 10, 11 | yes (optional 0008) | Task 10 independent of all; Task 11 gated |
| C4 — EmptyState | 12, 13, 14, 15 | no | independent of C1-C3, ship anytime |

Each task = own commit. Phases C1-C2 ship in order; C3 Task 10 + C4 can be reordered freely; C3 Task 11 is the only gated step.

**Push only when the user explicitly says "push"** (per user directive 2026-05-30).
