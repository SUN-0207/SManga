# Engagement: Views + Rating — Implementation Plan D

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add per-story and per-chapter view counters plus 1-5 star ratings, surfaced across story detail, card grids, and the chapter reader.

**Architecture:** DB layer adds `view_count` integer columns to `story` and `chapter`, plus a new composite-PK `rating` table (migration 0008). API layer adds a new `EngagementModule` with five endpoints (`POST /views/story/:id`, `POST /views/chapter/:id`, `GET/PUT/DELETE /ratings/story/:id`) and extends `StoriesService.getBySlug()` and `list()` to LEFT JOIN the rating aggregate subquery so every story response includes `viewCount`, `ratingAvg`, `ratingCount`. FE layer adds an `api/engagement.ts` client, three components (`ViewCount`, `RatingStars`, `RatingControl`), one hook (`use-track-view`), and wires them into the story-detail hero, chapter-reader eyebrow, and card grids.

**Tech Stack:** Drizzle ORM + `db.execute(sql\`…\`)` with `rowsOf<T>` helper; NestJS 11 with `@nestjs/throttler` (already globally wired); `@UseGuards(JwtAuthGuard)` for required auth; `OptionalJwtGuard` already registered as `APP_GUARD` (no decorator needed on view endpoints); TanStack Query `useQuery`/`useMutation`; Zustand `useAuthStore`; Tailwind Plan A tokens; Lucide icons.

**Depends on:** Plans A (tokens), B (auth/account chrome), C (slot patterns) — all merged on `main` (commits a69435d..258b15c).

---

## Key audit findings (read before implementing)

| Finding | Impact |
|---|---|
| `OptionalJwtGuard` already registered as `APP_GUARD` in `auth.module.ts` | View endpoints need NO `@UseGuards()` decorator — `req.user` is populated from JWT when present, `null` when absent |
| `ThrottlerModule` already globally wired at 120/60s in `app.module.ts` | Per-route `@Throttle()` works immediately |
| `user.id` is `text` (not `uuid`) in `auth.ts` | `rating.userId` must be `text('user_id')` — NOT uuid |
| `chapter.id` is uuid; view POST uses the uuid, not the chapter index number | `useTrackChapterView` receives `chapter.id` (uuid string) |
| `ChapterContent.chapter` in `api/chapters.ts` has no `id` or `viewCount` | Task D1-3 adds both to the BE select; Task D2-1 adds to the FE type |
| `drizzle.config.ts` schema is an explicit array (7 entries) | MUST append `./src/schema/engagement.ts` — no globs (CLAUDE.md #2) |
| Internal imports inside `packages/db/src/schema/*.ts` use `.ts` extensions | `engagement.ts` imports `./auth.ts` and `./story.ts` with `.ts` — correct |
| Cross-package imports from `apps/api` use the barrel import | `import { rating } from '@smanga/db/schema'` (the webpack alias maps `@smanga/db/schema` to the barrel index — per-file subpath like `@smanga/db/schema/engagement.js` has no alias and will fail at bundle time) |
| `StorySummary` in `api/stories.ts` has no engagement fields | Add as required fields (BE always returns them after D1-3) |
| `HomeStoryCard` is defined inline in `apps/frontend/src/routes/index.tsx` (line 289) | Edit that file; no new component file needed |
| `LibraryCard` in `tu-sach.tsx` sourced from `bookmarksApi` (no engagement fields) | Defer; add TODO comment only |
| `StoryCard` has explicit `StoryCardProps` interface | Extend with optional `ratingAvg?`, `ratingCount?`, `viewCount?` for backward compat |

---

## Rollback DDL

If migration 0008 needs to be reverted:

```sql
DROP TABLE IF EXISTS rating;
ALTER TABLE chapter DROP COLUMN IF EXISTS view_count;
ALTER TABLE story DROP COLUMN IF EXISTS view_count;
```

---

## Phase D1 — Backend

### Task D1-1: Migration 0008 + Drizzle schema engagement.ts + story/chapter view_count columns

**Files:**
- Create: `packages/db/src/migrations/0008_engagement.sql`
- Create: `packages/db/src/schema/engagement.ts`
- Modify: `packages/db/src/schema/story.ts`
- Modify: `packages/db/src/schema/chapter.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/drizzle.config.ts`

**Why this task:** Lay the DB foundation — view counters on existing tables plus a dedicated rating table — so all subsequent API tasks have columns to read and write.

- [ ] **Step 1: Read context**
  Read `packages/db/src/schema/story.ts`, `packages/db/src/schema/chapter.ts`, `packages/db/src/schema/index.ts`, and `packages/db/drizzle.config.ts` to confirm column layout and current schema array.

- [ ] **Step 2: Create `packages/db/src/migrations/0008_engagement.sql`**

  ```sql
  -- Phase D: view counters + rating table
  -- Rollback: DROP TABLE rating; ALTER TABLE chapter DROP COLUMN view_count; ALTER TABLE story DROP COLUMN view_count;

  ALTER TABLE story ADD COLUMN view_count integer NOT NULL DEFAULT 0;
  ALTER TABLE chapter ADD COLUMN view_count integer NOT NULL DEFAULT 0;

  CREATE TABLE rating (
    user_id   text     NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    story_id  uuid     NOT NULL REFERENCES story(id)  ON DELETE CASCADE,
    value     smallint NOT NULL CHECK (value BETWEEN 1 AND 5),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, story_id)
  );

  CREATE INDEX rating_story_idx ON rating (story_id);
  ```

- [ ] **Step 3: Append `viewCount` to `packages/db/src/schema/story.ts`**

  Inside the `pgTable` column map, after `updatedAt`:

  ```ts
  viewCount: integer('view_count').notNull().default(0),
  ```

  (`integer` is already imported from `drizzle-orm/pg-core` in this file.)

- [ ] **Step 4: Append `viewCount` to `packages/db/src/schema/chapter.ts`**

  Inside the `pgTable` column map, after `publishedAt`:

  ```ts
  viewCount: integer('view_count').notNull().default(0),
  ```

- [ ] **Step 5: Create `packages/db/src/schema/engagement.ts`**

  ```ts
  import { check, index, pgTable, primaryKey, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
  import { sql } from 'drizzle-orm';
  // Internal cross-schema imports MUST use .ts extensions (CLAUDE.md workaround #1)
  import { user } from './auth.ts';
  import { story } from './story.ts';

  export const rating = pgTable(
    'rating',
    {
      userId:    text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
      storyId:   uuid('story_id').notNull().references(() => story.id, { onDelete: 'cascade' }),
      value:     smallint('value').notNull(),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
      pk:         primaryKey({ columns: [t.userId, t.storyId] }),
      storyIdx:   index('rating_story_idx').on(t.storyId),
      // DB-level safety floor — class-validator is the API-facing guard
      valueCheck: check('rating_value_range', sql`${t.value} BETWEEN 1 AND 5`),
    }),
  );

  export type Rating    = typeof rating.$inferSelect;
  export type NewRating = typeof rating.$inferInsert;
  ```

- [ ] **Step 6: Re-export from `packages/db/src/schema/index.ts`**

  Append as the 8th star-export:

  ```ts
  export * from './engagement.ts';
  ```

- [ ] **Step 7: Append to `packages/db/drizzle.config.ts` schema array**

  The schema field must remain an explicit array (CLAUDE.md workaround #2 — drizzle-kit cannot glob):

  ```ts
  schema: [
    './src/schema/enums.ts',
    './src/schema/source.ts',
    './src/schema/story.ts',
    './src/schema/chapter.ts',
    './src/schema/auth.ts',
    './src/schema/user-data.ts',
    './src/schema/app-setting.ts',
    './src/schema/engagement.ts',   // Plan D: rating table
  ],
  ```

- [ ] **Step 8: Run migration against dev DB**

  ```powershell
  $env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
  pnpm --filter @smanga/db db:migrate
  ```

  Expected: migration runs with no errors; `view_count` columns and `rating` table visible in psql.

- [ ] **Step 9: Typecheck**

  ```powershell
  pnpm --filter @smanga/db typecheck
  ```

  Expected: passes with 0 errors.

- [ ] **Step 10: Commit**

  ```bash
  git add packages/db/src/migrations/0008_engagement.sql \
          packages/db/src/schema/engagement.ts \
          packages/db/src/schema/story.ts \
          packages/db/src/schema/chapter.ts \
          packages/db/src/schema/index.ts \
          packages/db/drizzle.config.ts
  git commit -m "feat(db): migration 0008 — view_count columns + rating table"
  ```

---

### Task D1-2: EngagementModule (ViewsController + RatingsController + EngagementService)

**Files:**
- Create: `apps/api/src/modules/engagement/dto/rate-story.dto.ts`
- Create: `apps/api/src/modules/engagement/engagement.service.ts`
- Create: `apps/api/src/modules/engagement/views.controller.ts`
- Create: `apps/api/src/modules/engagement/ratings.controller.ts`
- Create: `apps/api/src/modules/engagement/engagement.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Why this task:** Expose all five engagement endpoints. View endpoints ride the global `OptionalJwtGuard` (no decorator needed); rating PUT/DELETE use `@UseGuards(JwtAuthGuard)` to enforce login.

- [ ] **Step 1: Read context**
  Read `apps/api/src/common/guards/jwt.guard.ts` to confirm `OptionalJwtGuard` and `JwtAuthGuard` exports.
  Read `apps/api/src/modules/user-data/stats.service.ts` for the `rowsOf<T>` helper pattern.
  Read `apps/api/src/common/decorators/current-user.decorator.ts` for `@CurrentUser()` usage.

- [ ] **Step 2: Create `apps/api/src/modules/engagement/dto/rate-story.dto.ts`**

  ```ts
  import { IsInt, Max, Min } from 'class-validator';

  export class RateStoryDto {
    @IsInt()
    @Min(1)
    @Max(5)
    value!: number;
  }
  ```

- [ ] **Step 3: Create `apps/api/src/modules/engagement/engagement.service.ts`**

  ```ts
  import { Inject, Injectable } from '@nestjs/common';
  import { eq, and, sql } from 'drizzle-orm';
  // NOTE: import from the barrel '@smanga/db/schema', NOT from a per-file subpath
  // (e.g. NOT '@smanga/db/schema/engagement.js'). The webpack alias in apps/api/webpack.config.js
  // maps '@smanga/db/schema' to the barrel index only — subpath imports have no alias and
  // will fail at bundle time with module-not-found.
  import { rating } from '@smanga/db/schema';
  import type { Database } from '@smanga/db';
  import { DRIZZLE } from '@/modules/db/db.provider';

  /**
   * postgres-js db.execute() returns the row array directly (postgres.RowList).
   * node-postgres wraps it in { rows: T[] }. This helper normalises both.
   */
  const rowsOf = <T>(r: unknown): T[] =>
    Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

  export interface RatingAggregate {
    avg:   number | null;
    count: number;
    mine:  number | null;
  }

  @Injectable()
  export class EngagementService {
    constructor(@Inject(DRIZZLE) private readonly db: Database) {}

    // ---------------------------------------------------------------------------
    // View counter increments — fire-and-forget, no return value
    // ---------------------------------------------------------------------------

    async incrementStoryView(storyId: string): Promise<void> {
      await this.db.execute(sql`
        UPDATE story SET view_count = view_count + 1 WHERE id = ${storyId}
      `);
    }

    async incrementChapterView(chapterId: string): Promise<void> {
      await this.db.execute(sql`
        UPDATE chapter SET view_count = view_count + 1 WHERE id = ${chapterId}
      `);
    }

    // ---------------------------------------------------------------------------
    // Rating aggregate
    // ---------------------------------------------------------------------------

    async getRatingAggregate(storyId: string, userId: string | null): Promise<RatingAggregate> {
      const aggRaw = await this.db.execute<{ avg: string | null; cnt: string }>(sql`
        SELECT avg(value)::numeric(3,2) AS avg, count(*)::int AS cnt
        FROM rating
        WHERE story_id = ${storyId}
      `);
      const agg   = rowsOf<{ avg: string | null; cnt: string }>(aggRaw)[0];
      const avg   = agg?.avg != null ? Number(agg.avg) : null;
      const count = Number(agg?.cnt ?? 0);

      let mine: number | null = null;
      if (userId) {
        const mineRaw = await this.db.execute<{ value: number }>(sql`
          SELECT value FROM rating
          WHERE user_id = ${userId} AND story_id = ${storyId}
        `);
        const mineRow = rowsOf<{ value: number }>(mineRaw)[0];
        mine = mineRow != null ? Number(mineRow.value) : null;
      }

      return { avg, count, mine };
    }

    // ---------------------------------------------------------------------------
    // Upsert (create or update) a rating — returns fresh aggregate
    // ---------------------------------------------------------------------------

    async upsertRating(storyId: string, userId: string, value: number): Promise<RatingAggregate> {
      await this.db
        .insert(rating)
        .values({ userId, storyId, value })
        .onConflictDoUpdate({
          // Array of column refs is the correct Drizzle syntax for composite conflict targets.
          // Note: Drizzle's and() applies only to .where() boolean conditions, not to conflict targets.
          target: [rating.userId, rating.storyId],
          set: { value, updatedAt: new Date() },
        });
      return this.getRatingAggregate(storyId, userId);
    }

    // ---------------------------------------------------------------------------
    // Delete a rating — idempotent (no 404 if row absent)
    // ---------------------------------------------------------------------------

    async deleteRating(storyId: string, userId: string): Promise<RatingAggregate> {
      await this.db.execute(sql`
        DELETE FROM rating WHERE user_id = ${userId} AND story_id = ${storyId}
      `);
      // mine is always null after delete
      return this.getRatingAggregate(storyId, userId);
    }
  }
  ```

- [ ] **Step 4: Create `apps/api/src/modules/engagement/views.controller.ts`**

  > **Note:** View endpoints need NO `@UseGuards()` decorator because `OptionalJwtGuard` is already registered as the global `APP_GUARD` in `auth.module.ts`. Adding `@UseGuards(OptionalJwtGuard)` again would be redundant but harmless; omitting it is correct and clean.

  ```ts
  import { Controller, HttpCode, Param, Post } from '@nestjs/common';
  import { ApiTags } from '@nestjs/swagger';
  import { Throttle } from '@nestjs/throttler';
  import { EngagementService } from './engagement.service';

  // ThrottlerModule is globally wired at 120/min in app.module.ts.
  // View endpoints are tightened to 30/min per IP to bound F5 spam.
  @ApiTags('views')
  @Controller({ path: 'views', version: '1' })
  export class ViewsController {
    constructor(private readonly svc: EngagementService) {}

    @Post('story/:storyId')
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    @HttpCode(204)
    incrementStoryView(@Param('storyId') storyId: string): Promise<void> {
      return this.svc.incrementStoryView(storyId);
    }

    @Post('chapter/:chapterId')
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    @HttpCode(204)
    incrementChapterView(@Param('chapterId') chapterId: string): Promise<void> {
      return this.svc.incrementChapterView(chapterId);
    }
  }
  ```

- [ ] **Step 5: Create `apps/api/src/modules/engagement/ratings.controller.ts`**

  ```ts
  import { Body, Controller, Delete, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
  import { ApiTags } from '@nestjs/swagger';
  import { Throttle } from '@nestjs/throttler';
  import { EngagementService } from './engagement.service';
  import { RateStoryDto } from './dto/rate-story.dto';
  import { JwtAuthGuard } from '@/common/guards/jwt.guard';
  import { CurrentUser } from '@/common/decorators/current-user.decorator';

  // GET /ratings/* rides the global OptionalJwtGuard — no @UseGuards needed.
  // PUT/DELETE /ratings/* require a valid JWT — @UseGuards(JwtAuthGuard) overrides
  // the global optional guard for those routes.
  @ApiTags('ratings')
  @Controller({ path: 'ratings', version: '1' })
  export class RatingsController {
    constructor(private readonly svc: EngagementService) {}

    // Anonymous-friendly: mine is null when req.user is absent.
    // Use @CurrentUser() (consistent with rest of codebase) instead of @Request()
    // to avoid hand-typed inline type annotations that may diverge from the JWT payload shape.
    @Get('story/:storyId')
    getRating(
      @Param('storyId') storyId: string,
      @CurrentUser() user: { id: string } | null,
    ) {
      return this.svc.getRatingAggregate(storyId, user?.id ?? null);
    }

    @Put('story/:storyId')
    @UseGuards(JwtAuthGuard)
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    upsertRating(
      @Param('storyId') storyId: string,
      @CurrentUser() user: { id: string },
      @Body() dto: RateStoryDto,
    ) {
      return this.svc.upsertRating(storyId, user.id, dto.value);
    }

    @Delete('story/:storyId')
    @UseGuards(JwtAuthGuard)
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @HttpCode(200)
    deleteRating(
      @Param('storyId') storyId: string,
      @CurrentUser() user: { id: string },
    ) {
      return this.svc.deleteRating(storyId, user.id);
    }
  }
  ```

- [ ] **Step 6: Create `apps/api/src/modules/engagement/engagement.module.ts`**

  ```ts
  import { Module } from '@nestjs/common';
  import { EngagementService } from './engagement.service';
  import { ViewsController } from './views.controller';
  import { RatingsController } from './ratings.controller';

  @Module({
    controllers: [ViewsController, RatingsController],
    providers:   [EngagementService],
  })
  export class EngagementModule {}
  ```

- [ ] **Step 7: Register `EngagementModule` in `apps/api/src/app.module.ts`**

  Add the import line:

  ```ts
  import { EngagementModule } from './modules/engagement/engagement.module';
  ```

  Add `EngagementModule` to the `imports` array after `AppSettingsModule`:

  ```ts
  // inside @Module({ imports: [ ... ] })
  AppSettingsModule,
  EngagementModule,
  HealthModule,
  ```

- [ ] **Step 8: Verify locally**

  Start the API (`pnpm dev:api`) and smoke-test:

  > **Port note:** `apps/frontend/vite.config.ts` proxies `/api` → `http://localhost:3010`, which is the actual NestJS port in this project. Use that port for direct BE smoke tests (CLAUDE.md local-dev section shows 3001 but vite.config.ts is the ground truth — use whichever port the `pnpm dev:api` startup log reports).

  ```bash
  # Should 204 — anonymous view increment (replace 3010 with your actual API port)
  curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3010/api/v1/views/story/<any-story-uuid>

  # Should return { avg: null, count: 0, mine: null } for a story with no ratings
  curl http://localhost:3010/api/v1/ratings/story/<any-story-uuid>
  ```

- [ ] **Step 9: Typecheck**

  ```powershell
  pnpm --filter @smanga/api typecheck
  ```

  Expected: passes with 0 errors.

- [ ] **Step 10: Commit**

  ```bash
  git add apps/api/src/modules/engagement/ apps/api/src/app.module.ts
  git commit -m "feat(api): engagement module — POST /views, GET/PUT/DELETE /ratings/story"
  ```

---

### Task D1-3: Extend StoriesService (getBySlug + list) and ChaptersService (getChapterContent)

**Files:**
- Modify: `apps/api/src/modules/stories/stories.service.ts`
- Modify: `apps/api/src/modules/chapters/chapters.service.ts`

**Why this task:** Story detail and story list responses must include `viewCount`, `ratingAvg`, `ratingCount` so the FE can display them without extra round-trips. Chapter content must expose `chapter.id` (UUID) so the FE can POST view increments, and `chapter.viewCount` so the eyebrow can display it.

- [ ] **Step 1: Read context**
  Read `apps/api/src/modules/stories/stories.service.ts` in full to see the current `getBySlug` and `list` implementations.
  Read `apps/api/src/modules/chapters/chapters.service.ts` in full to see the current `getChapterContent` select shape.

- [ ] **Step 2: Replace `getBySlug` in `stories.service.ts`**

  The existing `.select()` cannot inline a `GROUP BY` subquery cleanly, so switch to `db.execute(sql\`…\`)` for the main row, then keep the existing typed `.select()` calls for genres and sources. Add a local `rowsOf` helper (same pattern as `stats.service.ts`):

  ```ts
  // Add at top of file, after imports:
  const rowsOf = <T>(r: unknown): T[] =>
    Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);
  ```

  Replace the `getBySlug` method body:

  ```ts
  async getBySlug(slug: string) {
    const rawRows = await this.db.execute<{
      id: string; slug: string; title: string; author: string | null;
      description: string; status: string; total_chapters: number;
      has_cover: boolean; discovery_status: string; discovery_error: string | null;
      discovered_at: string | null; view_count: number;
      rating_avg: string | null; rating_count: string;
    }>(sql`
      SELECT
        s.id, s.slug, s.title, s.author, s.description, s.status,
        s.total_chapters, s.view_count,
        (s.cover IS NOT NULL)  AS has_cover,
        s.discovery_status, s.discovery_error, s.discovered_at,
        r.avg                  AS rating_avg,
        COALESCE(r.cnt, 0)     AS rating_count
      FROM story s
      LEFT JOIN (
        SELECT story_id,
               avg(value)::numeric(3,2) AS avg,
               count(*)::int            AS cnt
        FROM rating
        GROUP BY story_id
      ) r ON r.story_id = s.id
      WHERE s.slug = ${slug}
      LIMIT 1
    `);

    const arr = rowsOf<{
      id: string; slug: string; title: string; author: string | null;
      description: string; status: string; total_chapters: number;
      has_cover: boolean; discovery_status: string; discovery_error: string | null;
      discovered_at: string | null; view_count: number;
      rating_avg: string | null; rating_count: string;
    }>(rawRows);
    if (arr.length === 0) throw new NotFoundException();
    const row = arr[0];

    const s = {
      id:             row.id,
      slug:           row.slug,
      title:          row.title,
      author:         row.author ?? null,
      description:    row.description,
      status:         row.status,
      totalChapters:  Number(row.total_chapters),
      hasCover:       Boolean(row.has_cover),
      discoveryStatus: row.discovery_status,
      discoveryError: row.discovery_error ?? null,
      discoveredAt:   row.discovered_at ?? null,
      viewCount:      Number(row.view_count ?? 0),
      ratingAvg:      row.rating_avg != null ? Number(row.rating_avg) : null,
      ratingCount:    Number(row.rating_count ?? 0),
    };

    // Genres + sources — keep existing typed selects
    const genres = await this.db
      .select({ slug: genre.slug, name: genre.name })
      .from(storyGenre)
      .innerJoin(genre, eq(storyGenre.genreId, genre.id))
      .where(eq(storyGenre.storyId, s.id));

    const sources = await this.db
      .select()
      .from(storySource)
      .where(eq(storySource.storyId, s.id));

    return { ...s, genres, sources };
  }
  ```

  > If `NotFoundException` is not yet imported, add `import { NotFoundException } from '@nestjs/common';` at the top.
  > **Ensure `sql` is imported from drizzle-orm.** If not already present in stories.service.ts, update the drizzle-orm import line to: `import { eq, sql } from 'drizzle-orm';`
  > The `FROM rating` in the raw SQL does not require a Drizzle import in `stories.service.ts` — it is a raw SQL string. **No import of `rating` is needed in `stories.service.ts`** — it uses raw SQL strings only. In `engagement.service.ts`, the Drizzle `rating` table IS imported (from `@smanga/db/schema`) for the `insert().onConflictDoUpdate()` call in `upsertRating`.
  > `storageStats()` at lines 27-53 already uses an inline cast pattern for rowsOf — leave it as-is or refactor to use the new helper. Both compile correctly.

- [ ] **Step 3: Replace `list` in `stories.service.ts`**

  ```ts
  async list(page = 1, limit = 48) {
    const rawRows = await this.db.execute<{
      id: string; slug: string; title: string; author: string | null;
      status: string; total_chapters: number; has_cover: boolean;
      discovery_status: string; discovery_error: string | null;
      discovered_at: string | null; updated_at: string;
      view_count: number; rating_avg: string | null; rating_count: string;
    }>(sql`
      SELECT
        s.id, s.slug, s.title, s.author, s.status,
        s.total_chapters, s.view_count, s.updated_at,
        (s.cover IS NOT NULL)  AS has_cover,
        s.discovery_status, s.discovery_error, s.discovered_at,
        r.avg                  AS rating_avg,
        COALESCE(r.cnt, 0)     AS rating_count
      FROM story s
      LEFT JOIN (
        SELECT story_id,
               avg(value)::numeric(3,2) AS avg,
               count(*)::int            AS cnt
        FROM rating
        GROUP BY story_id
      ) r ON r.story_id = s.id
      ORDER BY s.updated_at DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `);

    const arr = rowsOf<{
      id: string; slug: string; title: string; author: string | null;
      status: string; total_chapters: number; has_cover: boolean;
      discovery_status: string; discovery_error: string | null;
      discovered_at: string | null; updated_at: string;
      view_count: number; rating_avg: string | null; rating_count: string;
    }>(rawRows);

    return arr.map((row) => ({
      id:             row.id,
      slug:           row.slug,
      title:          row.title,
      author:         row.author ?? null,
      status:         row.status,
      totalChapters:  Number(row.total_chapters),
      hasCover:       Boolean(row.has_cover),
      discoveryStatus: row.discovery_status,
      discoveryError: row.discovery_error ?? null,
      discoveredAt:   row.discovered_at ?? null,
      updatedAt:      row.updated_at,
      viewCount:      Number(row.view_count ?? 0),
      ratingAvg:      row.rating_avg != null ? Number(row.rating_avg) : null,
      ratingCount:    Number(row.rating_count ?? 0),
    }));
  }
  ```

- [ ] **Step 4: Extend `getChapterContent` in `chapters.service.ts`**

  > **Prerequisite:** `chapter.viewCount` is available only after D1-1 completes (Task D1-1 must precede D1-3 — the column is added to the Drizzle schema in D1-1 Step 4).

  Read the file first to see the exact `.select({…})` map and return shape.

  In the `.select({…})` map, add two aliased keys:

  ```ts
  chapterId:        chapter.id,
  chapterViewCount: chapter.viewCount,
  ```

  In the returned `chapter` object (wherever `row.title`, `row.index`, etc. are mapped), add:

  ```ts
  chapter: {
    id:        row.chapterId,          // UUID string — used by useTrackChapterView
    index:     Number(row.index),
    title:     row.title,
    content:   text,                   // existing gunzip result
    isCrawled: row.status === 'crawled' && text !== null,
    viewCount: Number(row.chapterViewCount ?? 0),
  },
  ```

- [ ] **Step 5: Typecheck**

  ```powershell
  pnpm --filter @smanga/api typecheck
  ```

  Expected: passes with 0 errors.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/api/src/modules/stories/stories.service.ts \
          apps/api/src/modules/chapters/chapters.service.ts
  git commit -m "feat(api): getBySlug + list return viewCount/ratingAvg/ratingCount; chapter content exposes id + viewCount"
  ```

---

## Phase D2 — Frontend Primitives

### Task D2-1: Extend TS types + create engagement API client

**Files:**
- Modify: `apps/frontend/src/api/stories.ts`
- Modify: `apps/frontend/src/api/chapters.ts`
- Create: `apps/frontend/src/api/engagement.ts`

**Why this task:** The FE TS types must match the extended BE responses before any component can consume the new fields. The engagement API module centralises all five BE calls in one place.

- [ ] **Step 1: Read context**
  Read `apps/frontend/src/api/stories.ts` in full to see `StorySummary`, `StoryDetail`, and `DiscoveryStatus`.
  Read `apps/frontend/src/api/chapters.ts` in full to see `ChapterContent`.
  Read `apps/frontend/src/lib/api-client.ts` (or equivalent) to confirm the `api` axios instance import path.

- [ ] **Step 2: Extend `StorySummary` in `apps/frontend/src/api/stories.ts`**

  Add three required fields to `StorySummary` (required, not optional, because the BE always returns them after D1-3):

  ```ts
  export interface StorySummary {
    id:              string;
    slug:            string;
    title:           string;
    author:          string | null;
    status:          'ongoing' | 'completed' | 'dropped' | 'unknown';
    totalChapters:   number;
    hasCover:        boolean;
    updatedAt:       string;
    discoveryStatus: DiscoveryStatus;
    discoveryError:  string | null;
    discoveredAt:    string | null;
    /** Plan D: engagement counters. 0 on new stories with no activity yet. */
    viewCount:       number;
    ratingAvg:       number | null;
    ratingCount:     number;
  }
  ```

  `StoryDetail` extends `StorySummary` so it inherits the three fields automatically.

- [ ] **Step 3: Extend `ChapterContent` in `apps/frontend/src/api/chapters.ts`**

  ```ts
  export interface ChapterContent {
    story: { id: string; slug: string; title: string; totalChapters: number };
    chapter: {
      id:        string;   // Plan D: UUID for POST /views/chapter/:chapterId
      index:     number;
      title:     string;
      content:   string | null;
      isCrawled: boolean;
      viewCount: number;   // Plan D: display in eyebrow when > 0
    };
    prev: { index: number; title: string } | null;
    next: { index: number; title: string } | null;
  }
  ```

- [ ] **Step 4: Create `apps/frontend/src/api/engagement.ts`**

  ```ts
  import { api } from '@/lib/api-client';

  export interface RatingAggregate {
    avg:   number | null;
    count: number;
    mine:  1 | 2 | 3 | 4 | 5 | null;
  }

  export const engagementApi = {
    /** GET /ratings/story/:storyId — mine is null for anonymous callers */
    getRating: (storyId: string): Promise<RatingAggregate> =>
      api.get<RatingAggregate>(`/ratings/story/${storyId}`).then((r) => r.data),

    /** PUT /ratings/story/:storyId { value } — requires auth; upserts */
    upsertRating: (storyId: string, value: 1 | 2 | 3 | 4 | 5): Promise<RatingAggregate> =>
      api.put<RatingAggregate>(`/ratings/story/${storyId}`, { value }).then((r) => r.data),

    /** DELETE /ratings/story/:storyId — requires auth; idempotent */
    deleteRating: (storyId: string): Promise<RatingAggregate> =>
      api.delete<RatingAggregate>(`/ratings/story/${storyId}`).then((r) => r.data),
  };
  ```

- [ ] **Step 5: Typecheck**

  ```powershell
  pnpm --filter @smanga/frontend typecheck
  ```

  Expected: passes with 0 errors. Known call sites of `listStories()` / `StorySummary` to verify: `apps/frontend/src/routes/index.tsx` (HomeStoryCard), `apps/frontend/src/routes/kham-pha.tsx` (not audited elsewhere in this plan — check it explicitly). `StoryCardProps` gains three optional fields in Task D3-3, so callers that spread `StorySummary` into `StoryCard` will compile correctly because the new fields are optional there. The three new `StorySummary` fields are **required** on the interface, so if any caller constructs a `StorySummary` literal manually it must include them.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/frontend/src/api/stories.ts \
          apps/frontend/src/api/chapters.ts \
          apps/frontend/src/api/engagement.ts
  git commit -m "feat(frontend): extend StorySummary + ChapterContent types; add engagement.ts API module"
  ```

---

### Task D2-2: ViewCount component + formatCompact helper

**Files:**
- Create: `apps/frontend/src/components/engagement/ViewCount.tsx`

**Why this task:** Reusable read-only view-count pill used in the story detail hero, card grids, and chapter eyebrow. Vietnamese locale uses `'k'` for thousands and `'tr'` for millions (triệu).

- [ ] **Step 1: Create `apps/frontend/src/components/engagement/ViewCount.tsx`**

  ```tsx
  import { Eye } from 'lucide-react';

  interface ViewCountProps {
    count: number;
    /** Optional suffix label, e.g. "lượt xem" */
    label?: string;
  }

  /**
   * Compact number format — Vietnamese locale.
   * 0-999       → exact ("42")
   * 1000-999999 → "1.2k"
   * ≥1 000 000  → "1.2tr"  (triệu)
   */
  export function formatCompact(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}tr`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
    return String(n);
  }

  export function ViewCount({ count, label }: ViewCountProps) {
    return (
      <span className="inline-flex items-center gap-1 text-body-sm text-fg-muted">
        <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{formatCompact(count)}</span>
        {label && <span>{label}</span>}
      </span>
    );
  }
  ```

- [ ] **Step 2: Typecheck**

  ```powershell
  pnpm --filter @smanga/frontend typecheck
  ```

- [ ] **Step 3: Commit** (can be batched with Task D2-3 and D2-4 into one commit)

---

### Task D2-3: RatingStars component

**Files:**
- Create: `apps/frontend/src/components/engagement/RatingStars.tsx`

**Why this task:** Shared star-display and star-input widget. Read-only when `onChange` is omitted; interactive with hover preview and keyboard nav when provided.

- [ ] **Step 1: Create `apps/frontend/src/components/engagement/RatingStars.tsx`**

  ```tsx
  import { useState } from 'react';
  import { Star } from 'lucide-react';

  type StarValue = 1 | 2 | 3 | 4 | 5;

  interface RatingStarsProps {
    /**
     * Aggregate avg for read-only display (rounded to nearest integer for fill).
     * Pass `mine` for interactive mode — it drives the committed selection.
     */
    value:     number | null;
    /** User's own committed rating — preselects fill in interactive mode. */
    mine?:     StarValue | null;
    /**
     * When provided the component becomes interactive.
     * Clicking a filled star that equals `mine` calls onChange(null) (clear).
     */
    onChange?: (v: StarValue | null) => void;
    size?:     'sm' | 'md' | 'lg';
  }

  const SIZE_CLASS: Record<'sm' | 'md' | 'lg', string> = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  export function RatingStars({ value, mine, onChange, size = 'md' }: RatingStarsProps) {
    const [hovered, setHovered] = useState<StarValue | null>(null);
    const interactive = !!onChange;
    const iconClass   = SIZE_CLASS[size];

    // Interactive: hover preview takes priority; fall back to mine then 0.
    // Read-only: round the aggregate avg for display.
    const displayValue = interactive
      ? (hovered ?? mine ?? 0)
      : Math.round(value ?? 0);

    return (
      <span
        className="inline-flex items-center gap-0.5"
        role={interactive ? 'group' : undefined}
        aria-label={interactive ? 'Chọn đánh giá' : `${value ?? 0} sao`}
      >
        {([1, 2, 3, 4, 5] as StarValue[]).map((i) => {
          const filled = i <= displayValue;
          if (interactive) {
            return (
              <button
                key={i}
                type="button"
                aria-label={`Đánh giá ${i} sao`}
                className={[
                  'cursor-pointer transition-colors duration-fast',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded',
                  filled ? 'text-accent' : 'text-fg-subtle',
                ].join(' ')}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onChange(i === mine ? null : i)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    onChange(Math.min(5, i + 1) as StarValue);
                  }
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    onChange(Math.max(1, i - 1) as StarValue);
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onChange(i === mine ? null : i);
                  }
                }}
              >
                <Star className={iconClass} fill={filled ? 'currentColor' : 'none'} aria-hidden />
              </button>
            );
          }
          return (
            <Star
              key={i}
              className={`${iconClass} ${filled ? 'text-accent' : 'text-fg-subtle'}`}
              fill={filled ? 'currentColor' : 'none'}
              aria-hidden
            />
          );
        })}
      </span>
    );
  }
  ```

  > **Keyboard accessibility note:** The current implementation calls `onChange()` on ArrowLeft/ArrowRight but does NOT move DOM focus to the adjacent star button. The spec says `←/→ adjust focus` (W3C APG star widget pattern). A screen reader user would hear the aria-label change but focus stays on the current button. For full compliance, use a `ref` array and call `.focus()` on the target star after arrow-key adjustments. The implementation above is functional for sighted keyboard users but is a known divergence from the APG pattern — upgrade in a follow-up if screen-reader support is required.
  > `prefers-reduced-motion` is respected automatically — hover transitions use `duration-fast` (150ms) which is still within accessible limits; no animation-only feedback relies on motion.

- [ ] **Step 2: Typecheck**

  ```powershell
  pnpm --filter @smanga/frontend typecheck
  ```

---

### Task D2-4: RatingControl component

**Files:**
- Create: `apps/frontend/src/components/engagement/RatingControl.tsx`

**Why this task:** Stateful wrapper around `RatingStars` that manages the `useQuery` + `useMutation` lifecycle, optimistic updates, auth gate, and error toasts. Pattern mirrors `BookmarkToggle.tsx`.

- [ ] **Step 1: Read context**
  Read `apps/frontend/src/components/reader/BookmarkToggle.tsx` to understand the `useAuthStore` + `useQuery` + `useMutation` pattern used throughout the app.
  Read `apps/frontend/src/stores/auth-store.ts` to confirm `useAuthStore(s => s.user)` selector.

- [ ] **Step 2: Create `apps/frontend/src/components/engagement/RatingControl.tsx`**

  ```tsx
  import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
  import { useAuthStore } from '@/stores/auth-store';
  import { engagementApi } from '@/api/engagement';
  import { RatingStars } from './RatingStars';

  type StarValue = 1 | 2 | 3 | 4 | 5;

  interface RatingControlProps {
    storyId:     string;
    /** TanStack Query key for the story query — invalidated on successful mutation. */
    slug:        string;
    /** Initial avg from story query — displayed before the dedicated rating query resolves. */
    ratingAvg:   number | null;
    ratingCount: number;
  }

  export function RatingControl({ storyId, slug, ratingAvg, ratingCount }: RatingControlProps) {
    const user = useAuthStore((s) => s.user);
    const qc   = useQueryClient();

    // Only fire the rating point-lookup when the user is logged in.
    // This keeps GET /stories/by-slug/:slug cacheable for anonymous users.
    const ratingQ = useQuery({
      queryKey: ['rating', storyId],
      queryFn:  () => engagementApi.getRating(storyId),
      enabled:  !!user,
    });

    const mine  = (ratingQ.data?.mine ?? null) as StarValue | null;
    const avg   = ratingQ.data?.avg   ?? ratingAvg;
    const count = ratingQ.data?.count ?? ratingCount;

    const invalidate = () => {
      void qc.invalidateQueries({ queryKey: ['rating', storyId] });
      void qc.invalidateQueries({ queryKey: ['story',  slug] });
    };

    const upsert = useMutation({
      mutationFn: (v: StarValue) => engagementApi.upsertRating(storyId, v),
      // Optimistic: set local cache immediately, server confirms within ~200ms
      onMutate: async (v) => {
        await qc.cancelQueries({ queryKey: ['rating', storyId] });
        const prev = qc.getQueryData(['rating', storyId]);
        qc.setQueryData(['rating', storyId], (old: typeof ratingQ.data) =>
          old ? { ...old, mine: v } : old,
        );
        return { prev };
      },
      onError: (_err, _v, ctx) => {
        qc.setQueryData(['rating', storyId], ctx?.prev);
        // TODO: replace console.error with a proper toast once a toast system is wired in the app shell.
        // There is currently no 'smanga:toast' CustomEvent listener anywhere in the FE codebase —
        // dispatching that event would be silently ignored. Using console.error as MVP fallback.
        console.error('Rating mutation failed — optimistic update rolled back');
      },
      onSuccess: invalidate,
    });

    const del = useMutation({
      mutationFn: () => engagementApi.deleteRating(storyId),
      onMutate: async () => {
        await qc.cancelQueries({ queryKey: ['rating', storyId] });
        const prev = qc.getQueryData(['rating', storyId]);
        qc.setQueryData(['rating', storyId], (old: typeof ratingQ.data) =>
          old ? { ...old, mine: null } : old,
        );
        return { prev };
      },
      onError: (_err, _v, ctx) => {
        qc.setQueryData(['rating', storyId], ctx?.prev);
        // TODO: replace console.error with a proper toast once a toast system is wired in the app shell.
        console.error('Rating delete failed — optimistic update rolled back');
      },
      onSuccess: invalidate,
    });

    // Spec requirement: anonymous click on stars must fire a one-shot toast
    // ('Đăng nhập để đánh giá') — NOT silently ignore the click.
    // Pass handleChange to RatingStars even for anonymous users so the stars
    // remain interactive and can trigger the toast on click.
    function handleChange(v: StarValue | null) {
      if (!user) {
        // Anonymous: show login prompt as a native alert (MVP — no toast infra yet).
        // TODO: replace with a proper toast once a smanga:toast listener is wired in the app shell.
        window.alert('Đăng nhập để đánh giá');
        return;
      }
      if (v === null) del.mutate();
      else upsert.mutate(v);
    }

    const isPending = upsert.isPending || del.isPending;

    return (
      <div className="flex flex-col gap-1">
        <div
          className={`flex items-center gap-2 ${isPending ? 'opacity-60 pointer-events-none' : ''}`}
        >
          {/* Always pass onChange so stars are interactive for anonymous users (spec: click fires toast) */}
          <RatingStars
            value={avg}
            mine={mine}
            onChange={handleChange}
            size="md"
          />
          {count > 0 ? (
            <span className="text-body-sm text-fg-muted">({count} đánh giá)</span>
          ) : (
            <span className="text-body-sm text-fg-muted">Chưa có đánh giá</span>
          )}
        </div>
        {/* Anonymous hint — supplemental UX (link below stars); primary UX is the click toast above */}
        {!user && (
          <p className="text-body-sm text-fg-subtle">
            <a
              href={`/dang-nhap?redirect=/truyen/${slug}`}
              className="text-accent hover:underline cursor-pointer"
            >
              Đăng nhập
            </a>{' '}
            để đánh giá
          </p>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 3: Typecheck**

  ```powershell
  pnpm --filter @smanga/frontend typecheck
  ```

---

### Task D2-5: use-track-view hook

**Files:**
- Create: `apps/frontend/src/hooks/use-track-view.ts`

**Why this task:** Client-side dedup via `localStorage` prevents F5 spam from inflating counters. Chapter views fire after a 3s delay so skipped chapters don't count. Both hooks handle the `localStorage` being unavailable in private-mode browsers.

- [ ] **Step 1: Create `apps/frontend/src/hooks/use-track-view.ts`**

  ```ts
  import { useEffect } from 'react';

  /**
   * Safe accessor for localStorage.
   * Returns null instead of throwing in private-mode browsers where
   * localStorage access raises a SecurityError.
   */
  function safeLocalStorage(): Storage | null {
    try {
      return window.localStorage;
    } catch {
      // Private mode or security policy — skip dedup; allow counter inflation.
      // Documented behaviour: acceptable for hobby scale.
      return null;
    }
  }

  /**
   * Fires POST /api/v1/views/story/:storyId once per story per calendar day.
   * Dedup key: smanga:viewed:story:{id}:{YYYY-MM-DD}
   *
   * @param storyId - UUID string from story detail query; pass undefined while data is loading.
   */
  export function useTrackStoryView(storyId: string | undefined): void {
    useEffect(() => {
      if (!storyId) return;
      const ls  = safeLocalStorage();
      const key = `smanga:viewed:story:${storyId}:${new Date().toISOString().slice(0, 10)}`;
      if (ls?.getItem(key)) return; // already counted today
      ls?.setItem(key, '1');
      // NOTE: fetch() bypasses the axios api-client, so VITE_API_BASE_URL overrides
      // (used by axios) do NOT apply here. In dev, /api/v1 is proxied by vite.config.ts
      // to localhost:3010. In production, Vercel rewrites handle /api/* → Railway.
      // Known limitation: non-default VITE_API_BASE_URL deployments must also update
      // this path or extract: const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
      void fetch(`/api/v1/views/story/${storyId}`, {
        method:      'POST',
        credentials: 'include', // send cookie for auth (not required, but future-safe)
      });
    }, [storyId]);
  }

  /**
   * Fires POST /api/v1/views/chapter/:chapterId after a 3-second delay.
   * Dedup key: smanga:viewed:chapter:{id}:{YYYY-MM-DD}
   * Timer is cleared on unmount (navigating away before 3s = no count).
   *
   * @param chapterId - UUID string from chapter content query; pass undefined while loading.
   */
  export function useTrackChapterView(chapterId: string | undefined): void {
    useEffect(() => {
      if (!chapterId) return;
      const ls  = safeLocalStorage();
      const key = `smanga:viewed:chapter:${chapterId}:${new Date().toISOString().slice(0, 10)}`;
      if (ls?.getItem(key)) return; // already counted today

      const t = setTimeout(() => {
        ls?.setItem(key, '1');
        // Same VITE_API_BASE_URL caveat as useTrackStoryView — see comment above.
        void fetch(`/api/v1/views/chapter/${chapterId}`, {
          method:      'POST',
          credentials: 'include',
        });
      }, 3_000);

      return () => clearTimeout(t); // user navigated away — cancel
    }, [chapterId]);
  }
  ```

- [ ] **Step 2: Typecheck**

  ```powershell
  pnpm --filter @smanga/frontend typecheck
  ```

- [ ] **Step 3: Commit (all D2 tasks together)**

  ```bash
  git add apps/frontend/src/components/engagement/ \
          apps/frontend/src/hooks/use-track-view.ts
  git commit -m "feat(frontend): ViewCount + RatingStars + RatingControl components; useTrackStoryView/Chapter hooks"
  ```

---

## Phase D3 — Frontend Integrations

### Task D3-1: Story detail hero

**Files:**
- Modify: `apps/frontend/src/routes/truyen/$slug/index.tsx`

**Why this task:** The story detail page is the primary engagement surface. `RatingControl` gives logged-in users interactive stars; `ViewCount` shows the lifetime view counter; `useTrackStoryView` fires the anonymous-friendly increment once per day.

- [ ] **Step 1: Read context**
  Re-read `apps/frontend/src/routes/truyen/$slug/index.tsx` in full before making any edits — do NOT rely on stale line numbers from the plan audit. The file may have changed since the plan was written.
  The engagement row goes **after the closing `</p>` of the author · chapters · status paragraph** and **before the genres `<div>`** (the `{s.genres && …}` conditional block). Use these structural anchors rather than line numbers to locate the insertion point.

- [ ] **Step 2: Add imports to the file**

  After the existing imports, add:

  ```tsx
  import { useTrackStoryView } from '@/hooks/use-track-view';
  import { RatingControl }     from '@/components/engagement/RatingControl';
  import { ViewCount }         from '@/components/engagement/ViewCount';
  ```

- [ ] **Step 3: Call `useTrackStoryView` inside `StoryDetail()`**

  After both `useQuery` calls (after the closing `}` of the `chaptersQ` useQuery call — this must be placed before any early-return guard so React hooks rules are satisfied), add:

  ```tsx
  // Plan D: fire view increment once per calendar day (anonymous-friendly)
  useTrackStoryView(storyQ.data?.id);
  ```

- [ ] **Step 4: Insert engagement row in the hero info column**

  After the closing `</p>` of the `<p className="mt-3 text-body text-fg-muted">` block (the author · chapters · status line), and **before** the genres `<div>` (see Step 1 structural anchor), insert:

  > **Spacing note:** The engagement `<div>` uses `mt-4` and the genres `<div>` likely also has its own top margin. Verify there is no double-spacing after insertion — if the genres block already has `mt-4`, consider reducing one of the two to `mt-2` to maintain visual rhythm.

  ```tsx
  {/* Plan D: rating stars + view counter */}
  <div className="mt-4 flex flex-wrap items-center gap-4">
    <RatingControl
      storyId={s.id}
      slug={s.slug}
      ratingAvg={s.ratingAvg ?? null}
      ratingCount={s.ratingCount}
    />
    {s.viewCount > 0 && (
      <ViewCount count={s.viewCount} label="lượt xem" />
    )}
  </div>
  ```

- [ ] **Step 5: Verify locally**

  Run `pnpm dev:frontend` and open `http://localhost:3000/truyen/<any-slug>`:
  - Expect: rating stars appear below the author/status line.
  - For anonymous: stars are **interactive** (clicking triggers an alert "Đăng nhập để đánh giá"), and the supplemental "Đăng nhập để đánh giá" link is also shown below.
  - For logged-in: stars are interactive, hover highlights.
  - F5 the page — `view_count` should NOT increment again (localStorage dedup).

- [ ] **Step 6: Typecheck**

  ```powershell
  pnpm --filter @smanga/frontend typecheck
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add apps/frontend/src/routes/truyen/\$slug/index.tsx
  git commit -m "feat(frontend): story detail hero — RatingControl + ViewCount + story view tracking"
  ```

---

### Task D3-2: Chapter reader eyebrow + chapter view tracking

**Files:**
- Modify: `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx`

**Why this task:** The chapter reader eyebrow gets a live view count and the 3-second-delayed view increment so skimmed chapters don't count.

- [ ] **Step 1: Read context**
  Read `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx` lines 1-30 and lines 200-215 (the eyebrow `<p>` at line 206-208).
  The file is already read above — eyebrow is at line 206: `CHƯƠNG {chapter.index} · {readingMinutes} PHÚT ĐỌC`.

- [ ] **Step 2: Add import**

  After existing imports, add:

  ```tsx
  import { useTrackChapterView } from '@/hooks/use-track-view';
  ```

- [ ] **Step 3: Call `useTrackChapterView` inside `ChapterReader()`**

  After the `useQuery` call (line 27-30), add:

  ```tsx
  // Plan D: fire view increment after 3s on page (chapter UUID, not index number).
  // data?.chapter.id uses optional chaining because this hook is called BEFORE the
  // isLoading guard — data is undefined during loading. The hook handles undefined internally
  // (returns early when chapterId is falsy), so this is safe.
  useTrackChapterView(data?.chapter.id);
  ```

- [ ] **Step 4: Extend the eyebrow `<p>` (line 206-208)**

  Replace:

  ```tsx
  <p className="text-label text-fg-subtle mb-9">
    CHƯƠNG {chapter.index} · {readingMinutes} PHÚT ĐỌC
  </p>
  ```

  With:

  ```tsx
  <p className="text-label text-fg-subtle mb-9">
    CHƯƠNG {chapter.index} · {readingMinutes} PHÚT ĐỌC
    {chapter.viewCount > 0 && ` · ${chapter.viewCount.toLocaleString('vi-VN')} LƯỢT XEM`}
  </p>
  ```

- [ ] **Step 5: Typecheck**

  ```powershell
  pnpm --filter @smanga/frontend typecheck
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add "apps/frontend/src/routes/truyen/\$slug/chuong/\$index.tsx"
  git commit -m "feat(frontend): chapter reader eyebrow — view count display + chapter view tracking"
  ```

---

### Task D3-3: Card grid micro engagement (HomeStoryCard + StoryCard + LibraryCard TODO)

**Files:**
- Modify: `apps/frontend/src/routes/index.tsx`
- Modify: `apps/frontend/src/components/reader/StoryCard.tsx`
- Modify: `apps/frontend/src/routes/tu-sach.tsx`

**Why this task:** Surface engagement signals on browse grids so users see popularity at a glance without opening each story. Render nothing when both signals are zero — no `0 ⭐ · 0 👁` noise on new stories.

- [ ] **Step 1: Read context**
  Read `apps/frontend/src/routes/index.tsx` lines 289-311 (`HomeStoryCard` function).
  Read `apps/frontend/src/components/reader/StoryCard.tsx` in full.
  Skim `apps/frontend/src/routes/tu-sach.tsx` to locate the `LibraryCard` function or comment site.

- [ ] **Step 2: Add imports to `apps/frontend/src/routes/index.tsx`**

  After existing imports, add:

  ```tsx
  import { RatingStars } from '@/components/engagement/RatingStars';
  import { ViewCount }   from '@/components/engagement/ViewCount';
  ```

  > The `StorySummary` type is already imported at line 6 of the file (`import { listStories, type StorySummary } from '@/api/stories'`) — no change needed for that type.

- [ ] **Step 3: Replace `HomeStoryCard` in `apps/frontend/src/routes/index.tsx`**

  Current `HomeStoryCard` is at lines 289-311. Replace with:

  ```tsx
  function HomeStoryCard({ story }: { story: StorySummary }) {
    return (
      <Link
        to="/truyen/$slug"
        params={{ slug: story.slug }}
        search={{ page: 1 }}
        className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
      >
        <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-bg-subtle">
          {story.hasCover && (
            <img
              src={`/api/v1/cover/${story.id}`}
              alt=""
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          )}
        </div>
        <h3 className="mt-3 text-heading-md line-clamp-2">{story.title}</h3>
        <p className="mt-1 text-body-sm text-fg-muted truncate">{story.author ?? 'Khuyết danh'}</p>
        {/* Plan D: micro engagement — render only when at least one signal is non-zero */}
        {(story.ratingCount > 0 || story.viewCount > 0) && (
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {story.ratingCount > 0 && (
              <RatingStars value={story.ratingAvg} size="sm" />
            )}
            {story.viewCount > 0 && (
              <ViewCount count={story.viewCount} />
            )}
          </div>
        )}
      </Link>
    );
  }
  ```

- [ ] **Step 4: Extend `StoryCardProps` in `apps/frontend/src/components/reader/StoryCard.tsx`**

  Current `StoryCardProps` ends at `hasCover`. Add optional engagement fields:

  ```ts
  export interface StoryCardProps {
    id:            string;
    slug:          string;
    title:         string;
    author:        string | null;
    status:        'ongoing' | 'completed' | 'dropped' | 'unknown';
    totalChapters: number;
    hasCover:      boolean;
    /** Plan D: optional — zero/absent on cards passed from callers not yet updated */
    ratingAvg?:    number | null;
    ratingCount?:  number;
    viewCount?:    number;
  }
  ```

- [ ] **Step 5: Add imports to `apps/frontend/src/components/reader/StoryCard.tsx`**

  After the existing `import { Link } from '@tanstack/react-router';`:

  ```tsx
  import { RatingStars } from '@/components/engagement/RatingStars';
  import { ViewCount }   from '@/components/engagement/ViewCount';
  ```

- [ ] **Step 6: Add micro engagement block inside `StoryCard` render**

  Inside the `<div className="flex flex-col gap-1 px-0.5">` (currently containing title, author, totalChapters), after the `{props.totalChapters} chương` paragraph:

  ```tsx
  {/* Plan D: micro engagement — render only when at least one signal is non-zero */}
  {((props.ratingCount ?? 0) > 0 || (props.viewCount ?? 0) > 0) && (
    <div className="flex items-center gap-2 flex-wrap">
      {(props.ratingCount ?? 0) > 0 && (
        <RatingStars value={props.ratingAvg ?? null} size="sm" />
      )}
      {(props.viewCount ?? 0) > 0 && (
        <ViewCount count={props.viewCount!} />
      )}
    </div>
  )}
  ```

- [ ] **Step 7: Add TODO comment in `apps/frontend/src/routes/tu-sach.tsx`**

  Locate the `LibraryCard` function definition (e.g. `function LibraryCard({ item }: { item: ShelfItem }) {`). Add the following comment on the line **immediately before** the existing function declaration — do NOT modify the function signature:

  ```tsx
  // TODO(plan-D+1): LibraryCard engagement — show RatingStars + ViewCount once
  // bookmarksApi.list() / readingProgressApi.list() return viewCount + ratingAvg.
  // Avoid per-card queries (N+1); extend the bookmarks list endpoint instead.
  ```

  > **Note:** The spec Surface 2 section lists LibraryCard as a required engagement surface. This TODO defers it because the bookmarks endpoint does not yet return engagement fields. If LibraryCard engagement must ship in Plan D, extend `/me/bookmarks` to return `viewCount + ratingAvg/Count` and implement the display here (same pattern as HomeStoryCard in Step 3).

- [ ] **Step 8: Typecheck**

  ```powershell
  pnpm --filter @smanga/frontend typecheck
  ```

- [ ] **Step 9: Verify locally**

  Open `http://localhost:3000` and check the card grid:
  - New stories (0 views, 0 ratings): no engagement row rendered.
  - Stories with views or ratings: compact `RatingStars` + `ViewCount` visible below author name.

- [ ] **Step 10: Commit**

  ```bash
  git add apps/frontend/src/routes/index.tsx \
          apps/frontend/src/components/reader/StoryCard.tsx \
          apps/frontend/src/routes/tu-sach.tsx
  git commit -m "feat(frontend): HomeStoryCard + StoryCard micro engagement — RatingStars (sm) + ViewCount"
  ```

---

## Acceptance Checklist

> Run all checks before declaring Plan D complete.

- [ ] **AC-1** `0008_engagement.sql` runs clean against dev DB; rollback DDL documented above.
- [ ] **AC-2** `story.viewCount` and `chapter.viewCount` columns present in Drizzle schema; `rating` table compiled; `engagement.ts` in `drizzle.config.ts` schema array.
- [ ] **AC-3** `GET /api/v1/stories/by-slug/:slug` returns `viewCount`, `ratingAvg`, `ratingCount`; `ratingAvg` is `null` when no ratings.
- [ ] **AC-4** `POST /api/v1/views/story/:id` and `POST /api/v1/views/chapter/:id` respond `204` for both anonymous and authenticated callers.
- [ ] **AC-5** `GET /api/v1/ratings/story/:id` returns `{ avg, count, mine }`; `mine` is `null` for anonymous and for never-rated logged-in users.
- [ ] **AC-6** `PUT /api/v1/ratings/story/:id` with `{ value: 4 }` creates or updates the row; response shows new aggregate.
- [ ] **AC-7** `DELETE /api/v1/ratings/story/:id` removes row; response shows new aggregate with `mine: null`.
- [ ] **AC-8** Story detail hero renders rating stars + view count badge in light and dark theme with no contrast regression (minimum 4.5:1). **Verification:** toggle the app to dark mode in browser devtools, open a story detail page, and visually confirm filled stars (`text-accent` = pink-500 `#EC4899`) and empty stars (`text-fg-subtle`) meet 4.5:1 against their background. If the design-system dark-mode token for `text-fg-subtle` is lighter than the light-mode value, re-check that empty stars still pass contrast.
- [ ] **AC-9** Click star 4 on hero (logged-in) → optimistic UI updates < 200ms → server confirms.
- [ ] **AC-10** Click currently-selected star → DELETE fires → stars return to empty state.
- [ ] **AC-11** F5 on story detail same calendar day does NOT increment `view_count` (localStorage dedup active).
- [ ] **AC-12** Anonymous visit to story detail DOES increment `view_count` (no client login gate on view tracking).
- [ ] **AC-13** Card grids show `<RatingStars size="sm"/>` + `<ViewCount/>` only when `ratingCount > 0` OR `viewCount > 0`; both-zero shows nothing.
- [ ] **AC-14** Chapter reader eyebrow appends ` · N LƯỢT XEM` when `viewCount > 0`.
- [ ] **AC-15** Chapter view tracked after 3s on page; F5 same calendar day does not re-increment.
- [ ] **AC-16** `pnpm --filter @smanga/api typecheck` passes with 0 errors.
- [ ] **AC-17** `pnpm --filter @smanga/frontend typecheck` passes with 0 errors.
- [ ] **AC-18 (final gate)** Before declaring Plan D complete, run **both** typechecks together in sequence to catch any regressions introduced across phases.

  ```powershell
  pnpm --filter @smanga/api typecheck
  pnpm --filter @smanga/frontend typecheck
  ```

  Both must pass with 0 errors.

---

## Out of scope

- Rating distribution histogram (5★: 60%, 4★: 25%, ...) — deferred to Spec E or follow-up.
- "Top rated" / "Most viewed" sort endpoints on `/kham-pha` — needs separate query infrastructure.
- Notification when a bookmarked story gets new ratings — needs notification system (Spec E).
- Review text alongside rating — overlaps with Comments scope (Spec E).
- Per-user view history / "Recently viewed" — not requested.
- Anti-fraud on rating (one-IP-many-accounts) — bounded by login gate; acceptable for hobby scale.
- View counter rollups, time-windowed views ("views this week") — counter is lifetime-only in MVP.
- `LibraryCard` engagement display — blocked on `bookmarksApi.list()` not returning engagement fields; see TODO comment added in Task D3-3.

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Counter UPDATE on hot story creates write contention | At 100-1000 users with localStorage dedup, expected POST rate is single-digit/minute — Postgres handles trivially. Future escape: swap to `INSERT INTO view_event` + cron rollup. |
| Rating value validation bypass | SQL `CHECK (value BETWEEN 1 AND 5)` is the DB floor; class-validator `@IsInt + @Min(1) + @Max(5)` is the API-facing guard. |
| `localStorage` quota exceeded | Keys are date-suffixed; years of daily viewing = thousands of keys — well under 5MB quota. No cleanup needed. |
| `getStoryBySlug` query slowdown from LEFT JOIN | `rating_story_idx` on `story_id` keeps the GROUP BY fast; expected < 5ms on hobby scale. Run `EXPLAIN ANALYZE` if concerned. |
| Anonymous view inflation from bots | Accept for MVP. If real spam appears: add User-Agent filter on the BE view endpoints to skip known bot UAs. |
| Private-mode browsers block `localStorage` | `safeLocalStorage()` catches `SecurityError` and returns `null`; hooks skip dedup gracefully (counter may inflate by F5 count — documented in code comment). |

---

## Push policy

**No `git push` until user explicitly asks.** Every task ends with a local `git commit`. Never `git commit --amend` — always new commits for fixes.
