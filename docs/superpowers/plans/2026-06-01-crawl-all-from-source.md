# Crawl-All-From-Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Single button on `/admin/sources/$id/discover` queues an entire feed for import via a new Bull job — resolving the operator pain point of selecting stories one-by-one across dozens of catalog pages.

**Architecture:** A new `JOB_DISCOVER_ALL_SOURCE` Bull job iterates every catalog page of a given feed (using the existing `browseCatalog` engine helper) and calls `enqueueImport` per story. A dedicated NestJS processor handles the loop with 1s inter-page sleep and idempotent per-story dedup. The endpoint uses an idempotent Bull jobId (`discover-all:{sourceId}:{feedId}`) so a second click while running returns 409 Conflict.

**Tech Stack:** NestJS 11 (Bull processor + service method + controller endpoint + DTO) · Vite+React (confirm modal + API client method + page wiring) · Tailwind tokens from design system MASTER · TanStack Router + TanStack Query

**Depends on:** Plan 7 (catalog discovery — `browseCatalog`, `getAdapter`, `DiscoverActionBar` all exist). Schema unchanged — no migration required.

---

## Phase P1 — Backend (Tasks 1–5)

---

### Task 1 — Add `JOB_DISCOVER_ALL_SOURCE` constant + `DiscoverAllSourceJobData` type

**Files:** Modify `apps/api/src/modules/queue/queue.constants.ts`

**Why:** All job names and payload types live here. Adding the new constant here keeps the queue module as the single source of truth and makes the constant importable by both the processor and service without circular dependencies.

**Steps:**

Append after the existing `JOB_REFRESH_ALL_STORIES` line and the existing interfaces:

```typescript
// apps/api/src/modules/queue/queue.constants.ts

export const QUEUE_CRAWLER = 'crawler';

export const JOB_IMPORT_STORY = 'import-story';
export const JOB_DISCOVER_CHAPTERS = 'discover-chapters';
export const JOB_FETCH_CHAPTER = 'fetch-chapter';
export const JOB_REFRESH_ALL_STORIES = 'refresh-all-stories';
export const JOB_DISCOVER_ALL_SOURCE = 'discover-all-source';   // NEW

export interface ImportStoryJobData {
  url: string;
  requestedBy: string | null;
  skipDiscovery?: boolean;
  autoCrawl?: boolean;
}

export interface DiscoverChaptersJobData {
  storyId: string;
  requestedBy: string | null;
  autoCrawl?: boolean;
}

export interface FetchChapterJobData {
  chapterId: string;
}

// NEW
export interface DiscoverAllSourceJobData {
  sourceId: string;
  feedId: string;
  autoCrawl: boolean;
  requestedBy: string | null;
}
```

**Verify:**
```powershell
pnpm --filter @smanga/api typecheck
```
Expected: 0 errors (only the constant file changed, no consumers yet).

**Commit:**
```
feat(crawler): add JOB_DISCOVER_ALL_SOURCE constant + DiscoverAllSourceJobData type
```

---

### Task 2 — Create `DiscoverAllSourceProcessor`

**Files:** Create `apps/api/src/modules/crawler-jobs/discover-all-source.processor.ts`

**Why:** The processor encapsulates the page-iteration loop, per-story enqueue, progress reporting, and error handling — following the same structural pattern as `ImportStoryProcessor` and `DiscoverChaptersProcessor`. It injects `StoriesService` (not the queue directly) to reuse the `enqueueImport` business logic including adapter validation.

**Steps:**

Create the file with the following complete content:

```typescript
// apps/api/src/modules/crawler-jobs/discover-all-source.processor.ts

import { Process, Processor } from '@nestjs/bull';
import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { browseCatalog, getAdapter } from '@smanga/crawler';
import { Inject } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  JOB_DISCOVER_ALL_SOURCE,
  QUEUE_CRAWLER,
  type DiscoverAllSourceJobData,
} from '@/modules/queue/queue.constants';
import { StoriesService } from '@/modules/stories/stories.service';

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

@Processor(QUEUE_CRAWLER)
export class DiscoverAllSourceProcessor {
  private readonly logger = new Logger(DiscoverAllSourceProcessor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly stories: StoriesService,
  ) {}

  @Process(JOB_DISCOVER_ALL_SOURCE)
  async handle(job: Job<DiscoverAllSourceJobData>): Promise<{ totalQueued: number; pagesCrawled: number }> {
    const { sourceId, feedId, autoCrawl, requestedBy } = job.data;
    this.logger.log(
      `discover-all-source start ${job.id} source=${sourceId} feed=${feedId} autoCrawl=${autoCrawl}`,
    );

    // Validate adapter still resolves (cheap — synchronous registry lookup)
    getAdapter(sourceId);

    let page = 1;
    let totalQueued = 0;

    while (true) {
      const browse = await browseCatalog(this.db, sourceId, feedId, page);

      for (const item of browse.items) {
        try {
          await this.stories.enqueueImport(item.url, requestedBy);
          totalQueued++;
        } catch (err) {
          // Note on dedup: slug-uniqueness is enforced at the DB layer inside
          // `importStory` (Drizzle unique constraint), not via NestJS ConflictException.
          // The `enqueueImport` call itself does not throw ConflictException for
          // duplicates — it simply enqueues a Bull job, and the importStory processor
          // handles existing stories internally (idempotent). So the ConflictException
          // branch below is defensive and may never trigger via the dedup path.
          //
          // BadRequestException = hostname not registered in adapter registry — skip this
          // story URL silently rather than failing the whole job.
          if (err instanceof ConflictException || err instanceof BadRequestException) {
            this.logger.log(`discover-all-source skip url=${item.url} reason=${(err as Error).message}`);
            continue;
          }
          // Any other error (DB down, network failure, etc.) surfaces as job failure.
          this.logger.error(
            `discover-all-source enqueueImport failed url=${item.url}: ${(err as Error).message}`,
          );
          throw err;
        }
      }

      await job.progress({ page, totalQueued, hasNextPage: browse.hasNextPage });
      this.logger.log(
        `discover-all-source page=${page} queued=${totalQueued} hasNextPage=${browse.hasNextPage}`,
      );

      if (!browse.hasNextPage) break;
      page++;
      await sleep(1000);
    }

    this.logger.log(
      `discover-all-source done ${job.id} source=${sourceId} feed=${feedId} totalQueued=${totalQueued} pagesCrawled=${page}`,
    );
    return { totalQueued, pagesCrawled: page };
  }
}
```

**Why `autoCrawl` is not passed to `enqueueImport`:** The existing `enqueueImport` signature is `(url: string, requestedBy: string | null): Promise<{ jobId: string }>` — it does NOT accept an `autoCrawl` parameter (that flag only exists on `enqueueImportBulk`). The `autoCrawl` field on `DiscoverAllSourceJobData` is stored in the job payload but **silently dropped** at the processor level — it has no effect on how stories are imported. The autoCrawl checkbox in the modal (AC-9) therefore has no backend effect in this implementation. This is an intentional deferral, not an oversight.

> **Note on autoCrawl future work:** If a later spec requires autoCrawl to chain chapter fetches, extend `enqueueImport` in `stories.service.ts` to accept an optional third parameter `autoCrawl?: boolean` (mirroring `enqueueImportBulk`) and pass it through `ImportStoryJobData`. Then update this processor to forward `autoCrawl` from the job data. Do NOT do this in this task — it changes the existing API surface and should be a separate plan. Until then, the autoCrawl checkbox is present in the UI for forward-compatibility but has no effect.

**Verify:**
```powershell
pnpm --filter @smanga/api typecheck
```
Expected: 0 errors. The `StoriesService` import will resolve once the module wiring is done in Task 3.

**Commit:**
```
feat(crawler): DiscoverAllSourceProcessor — page-loop + idempotent enqueue per story
```

---

### Task 3 — Wire `DiscoverAllSourceProcessor` into `CrawlerJobsModule` + import `StoriesModule`

**Files:**
- Modify `apps/api/src/modules/crawler-jobs/crawler-jobs.module.ts`
- Modify `apps/api/src/modules/stories/stories.module.ts` (add `exports`)

**Why:** NestJS DI requires the processor to be listed in `providers` of the module that owns it. `StoriesService` must be exported from `StoriesModule` so it can be injected into `DiscoverAllSourceProcessor` inside `CrawlerJobsModule`. `CrawlerJobsModule` already imports `QueueModule`; we add `StoriesModule` to its imports.

**Steps:**

**3a. Export `StoriesService` from `StoriesModule`:**

```typescript
// apps/api/src/modules/stories/stories.module.ts

import { Module } from '@nestjs/common';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';
import { QueueModule } from '@/modules/queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [StoriesController],
  providers: [StoriesService],
  exports: [StoriesService],   // NEW — allows CrawlerJobsModule to inject it
})
export class StoriesModule {}
```

**3b. Update `CrawlerJobsModule` to import `StoriesModule` and register the new processor:**

```typescript
// apps/api/src/modules/crawler-jobs/crawler-jobs.module.ts

import { Module } from '@nestjs/common';
import { QueueModule } from '@/modules/queue/queue.module';
import { StoriesModule } from '@/modules/stories/stories.module';
import { ImportStoryProcessor } from './import-story.processor';
import { DiscoverChaptersProcessor } from './discover-chapters.processor';
import { FetchChapterProcessor } from './fetch-chapter.processor';
import { DiscoverAllSourceProcessor } from './discover-all-source.processor';

@Module({
  imports: [QueueModule, StoriesModule],
  providers: [
    ImportStoryProcessor,
    DiscoverChaptersProcessor,
    FetchChapterProcessor,
    DiscoverAllSourceProcessor,   // NEW
  ],
})
export class CrawlerJobsModule {}
```

**3c. Verify `SourcesModule` does not already import `StoriesModule`** (audit confirmed it does not — the `enqueueDiscoverAll` service method added in Task 4 uses the queue directly, not `StoriesService`, so no change to `SourcesModule` is needed).

**Verify:**
```powershell
pnpm --filter @smanga/api typecheck
```
Expected: 0 errors.

**Commit:**
```
feat(crawler): register DiscoverAllSourceProcessor in CrawlerJobsModule
```

---

### Task 4 — Add `DiscoverAllSourceDto` + `enqueueDiscoverAll()` service method

**Files:**
- Modify `apps/api/src/modules/sources/dto/create-source.dto.ts` (append new DTO class)
- Modify `apps/api/src/modules/sources/sources.service.ts` (inject queue + add method)
- Modify `apps/api/src/modules/sources/sources.module.ts` (import `QueueModule`)

**Why:** The service validates that the adapter exists and the feedId is in `adapter.catalogFeeds`, then adds the Bull job with a deterministic `jobId` for 409 dedup. The DTO uses `class-validator` decorators matching the existing DTO style.

**Steps:**

**4a. Append `DiscoverAllSourceDto` to the existing DTO file:**

> **IMPORTANT:** The block below shows ONLY the lines to **append** at the bottom of `create-source.dto.ts`. Do NOT replace the full file — `CreateSourceDto` and `UpdateSourceDto` already exist. Adding duplicate class declarations or re-adding existing imports will cause a compile error.

```typescript
// APPEND ONLY — add at the bottom of apps/api/src/modules/sources/dto/create-source.dto.ts

// NEW — Plan crawl-all
export class DiscoverAllSourceDto {
  @IsString()
  feed!: string;

  @IsBoolean()
  @IsOptional()
  autoCrawl?: boolean;
}
```

`IsBoolean`, `IsOptional`, and `IsString` are already imported at the top of the file. No new imports are needed.

**4b. Update `SourcesService` — inject queue + add `enqueueDiscoverAll`:**

> **IMPORTANT:** The block below is a **full-file replacement** of `sources.service.ts`. It includes all existing methods plus the new `enqueueDiscoverAll`. New additions are the `InjectQueue`/`Queue` import, the `queue` constructor param, and the `enqueueDiscoverAll` method. If other changes have been made to this file since the plan was written, merge them manually rather than doing a blind replacement.

```typescript
// apps/api/src/modules/sources/sources.service.ts (full replacement)

import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { asc, eq } from 'drizzle-orm';
import { browseCatalog, getAdapter, listAdapters, searchCatalog } from '@smanga/crawler';
import { source } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  JOB_DISCOVER_ALL_SOURCE,
  QUEUE_CRAWLER,
  type DiscoverAllSourceJobData,
} from '@/modules/queue/queue.constants';
import type { CreateSourceDto, UpdateSourceDto } from './dto/create-source.dto';

@Injectable()
export class SourcesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  list() {
    return this.db.select().from(source).orderBy(asc(source.id));
  }

  async create(dto: CreateSourceDto) {
    const valid = new Set(listAdapters().map((a) => a.id));
    if (!valid.has(dto.id)) {
      throw new BadRequestException(`No adapter registered for id=${dto.id}. Valid: ${[...valid].join(', ')}`);
    }
    const [existing] = await this.db.select().from(source).where(eq(source.id, dto.id)).limit(1);
    if (existing) throw new ConflictException(`source ${dto.id} already exists`);
    await this.db.insert(source).values({
      id: dto.id,
      name: dto.name,
      baseUrl: dto.baseUrl,
      rateLimitRps: String(dto.rateLimitRps ?? 1),
    });
    return { ok: true };
  }

  async update(id: string, dto: UpdateSourceDto) {
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.name) update.name = dto.name;
    if (dto.baseUrl) update.baseUrl = dto.baseUrl;
    if (dto.rateLimitRps) update.rateLimitRps = String(dto.rateLimitRps);
    if (dto.isActive !== undefined) update.isActive = dto.isActive;
    const result = await this.db.update(source).set(update).where(eq(source.id, id)).returning();
    if (result.length === 0) throw new NotFoundException();
    return { ok: true };
  }

  async remove(id: string) {
    try {
      const result = await this.db.delete(source).where(eq(source.id, id)).returning();
      if (result.length === 0) throw new NotFoundException();
      return { ok: true };
    } catch (err) {
      throw new ConflictException(`cannot delete: ${(err as Error).message}`);
    }
  }

  feeds(sourceId: string) {
    let adapter;
    try {
      adapter = getAdapter(sourceId);
    } catch {
      throw new NotFoundException(`no adapter for source ${sourceId}`);
    }
    return {
      sourceId: adapter.id,
      sourceName: adapter.name,
      baseUrl: adapter.baseUrl,
      feeds: adapter.catalogFeeds,
      supportsSearch: Boolean(adapter.buildSearchUrl && adapter.parseSearchPage),
    };
  }

  async discover(sourceId: string, feedId: string | undefined, page: number, query: string | undefined) {
    try {
      getAdapter(sourceId);
    } catch {
      throw new NotFoundException(`no adapter for source ${sourceId}`);
    }
    if (query && query.trim().length > 0) {
      return searchCatalog(this.db, sourceId, query.trim(), page);
    }
    if (!feedId) {
      throw new BadRequestException('either feed or q is required');
    }
    return browseCatalog(this.db, sourceId, feedId, page);
  }

  /**
   * Plan crawl-all: enqueue a discover-all-source job for the given feed.
   * Idempotent: jobId = `discover-all:{sourceId}:{feedId}` so Bull rejects a
   * second call while the first is still active (409 Conflict).
   */
  async enqueueDiscoverAll(
    sourceId: string,
    feedId: string,
    autoCrawl: boolean,
    requestedBy: string | null,
  ): Promise<{ jobId: string }> {
    // 1. Validate adapter exists
    let adapter;
    try {
      adapter = getAdapter(sourceId);
    } catch {
      throw new NotFoundException(`no adapter for source ${sourceId}`);
    }

    // 2. Validate feedId is declared by the adapter
    const validFeedIds = adapter.catalogFeeds.map((f) => f.id);
    if (!validFeedIds.includes(feedId)) {
      throw new BadRequestException(
        `feed "${feedId}" not found. Valid feeds: ${validFeedIds.join(', ')}`,
      );
    }

    // 3. Enqueue with idempotent jobId — Bull throws if same jobId is already
    //    active/waiting, which NestJS maps to a rejected promise that we catch.
    const jobId = `discover-all:${sourceId}:${feedId}`;
    const payload: DiscoverAllSourceJobData = { sourceId, feedId, autoCrawl, requestedBy };

    // 3b. Explicit dedup check before enqueuing.
    //
    // NOTE: Relying solely on Bull's duplicate-jobId error is fragile — the exact
    // error message ("Job with id already exists") is not part of Bull's stable
    // public API and may change between versions. Additionally, Bull only rejects
    // duplicate jobIds for `waiting`/`delayed` states, not for `active` jobs in
    // some versions. Use an explicit getJob + getState check (same pattern as
    // `enqueueDiscoverChapters`) for reliable 409 dedup:
    const existingJob = await this.queue.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (['waiting', 'active', 'delayed'].includes(state)) {
        throw new ConflictException(
          `A discover-all job for source "${sourceId}" feed "${feedId}" is already ${state}. ` +
            `Monitor progress at /admin/jobs (jobId: ${jobId}).`,
        );
      }
    }

    try {
      const job = await this.queue.add(JOB_DISCOVER_ALL_SOURCE, payload, {
        jobId,
        removeOnComplete: true,
        removeOnFail: false,
      });
      return { jobId: String(job.id) };
    } catch (err) {
      // Fallback catch for any unexpected Bull errors during add
      throw err;
    }
  }
}
```

**4c. Update `SourcesModule` to import `QueueModule` (needed for `@InjectQueue`):**

```typescript
// apps/api/src/modules/sources/sources.module.ts

import { Module } from '@nestjs/common';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';
import { QueueModule } from '@/modules/queue/queue.module';

@Module({
  imports: [QueueModule],   // NEW — SourcesService now injects the Bull queue
  controllers: [SourcesController],
  providers: [SourcesService],
})
export class SourcesModule {}
```

**Verify:**
```powershell
pnpm --filter @smanga/api typecheck
```
Expected: 0 errors.

**Commit:**
```
feat(sources/api): enqueueDiscoverAll service method + DiscoverAllSourceDto
```

---

### Task 5 — Add `POST /sources/:id/discover-all` endpoint

**Files:** Modify `apps/api/src/modules/sources/sources.controller.ts`

**Why:** The controller wires HTTP → service, applies `@HttpCode(202)` per the spec, injects `@CurrentUser()` for `requestedBy`, and validates the body via the new DTO. Guards and roles are already applied at class level so no per-method guard is needed.

**Steps:**

```typescript
// apps/api/src/modules/sources/sources.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SourcesService } from './sources.service';
import { CreateSourceDto, DiscoverAllSourceDto, UpdateSourceDto } from './dto/create-source.dto';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('sources')
@Controller({ path: 'sources', version: '1' })
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Get()
  list() {
    return this.sources.list();
  }

  @Post()
  create(@Body() dto: CreateSourceDto) {
    return this.sources.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSourceDto) {
    return this.sources.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sources.remove(id);
  }

  @Get(':id/feeds')
  feeds(@Param('id') id: string) {
    return this.sources.feeds(id);
  }

  @Get(':id/discover')
  discover(
    @Param('id') id: string,
    @Query('feed') feed?: string,
    @Query('page') page?: string,
    @Query('q') q?: string,
  ) {
    const pageNum = Math.max(1, Number(page) || 1);
    return this.sources.discover(id, feed, pageNum, q);
  }

  /**
   * Plan crawl-all — queue a full-feed import for the given source.
   * Returns 202 Accepted with { jobId }.
   * Returns 409 if the same (sourceId, feedId) job is already active.
   */
  @Post(':id/discover-all')
  @HttpCode(HttpStatus.ACCEPTED)
  discoverAll(
    @Param('id') id: string,
    @Body() dto: DiscoverAllSourceDto,
    @CurrentUser() u: { id: string },
  ) {
    return this.sources.enqueueDiscoverAll(id, dto.feed, dto.autoCrawl ?? false, u.id);
  }
}
```

**Verify:**
```powershell
pnpm --filter @smanga/api typecheck
```
Expected: 0 errors. Full backend type check clean.

**Commit:**
```
feat(sources/api): POST /sources/:id/discover-all endpoint — 202 + jobId response
```

---

## Phase P2 — Frontend (Tasks 6–8)

---

### Task 6 — Add `discoverAll()` to `apps/frontend/src/api/sources.ts`

**Files:** Modify `apps/frontend/src/api/sources.ts`

**Why:** The frontend API client wraps all `axios` calls behind the `sourcesApi` object. Adding `discoverAll` here keeps the HTTP call in one place and matches the existing `list`/`create`/`remove` style.

**Steps:**

```typescript
// apps/frontend/src/api/sources.ts

import { api } from '@/lib/api-client';

export interface Source {
  id: string;
  name: string;
  baseUrl: string;
  isActive: boolean;
  rateLimitRps: string;
}

export const sourcesApi = {
  list: () => api.get<Source[]>('/sources').then((r) => r.data),
  create: (body: { id: string; name: string; baseUrl: string; rateLimitRps: number }) =>
    api.post('/sources', body).then((r) => r.data),
  remove: (id: string) => api.delete(`/sources/${id}`).then((r) => r.data),

  /** Plan crawl-all — queue an entire feed for import. Returns 202 { jobId }. */
  discoverAll: (sourceId: string, feed: string, autoCrawl: boolean): Promise<{ jobId: string }> =>
    api
      .post<{ jobId: string }>(`/sources/${sourceId}/discover-all`, { feed, autoCrawl })
      .then((r) => r.data),
};
```

**Verify:**
```powershell
pnpm --filter @smanga/frontend typecheck
```
Expected: 0 errors.

**Commit:**
```
feat(sources/fe): add discoverAll() to sourcesApi client
```

---

### Task 7 — Add `CrawlAllModal` sub-component

**Files:** Modify `apps/frontend/src/routes/admin/sources/$id.discover.tsx`

**Why:** The modal lives as a local sub-component inside the route file (same pattern as `DeleteConfirm` in `users.tsx`). It mirrors the `DeleteConfirm` structure — fixed backdrop, `role=dialog aria-modal=true`, `bg-bg-elevated` card, ghost cancel button, pink-gradient confirm button — but without the typed-value guard (the action is reversible via /admin/jobs cancel) and with an autoCrawl checkbox.

**Steps:**

Add the `CrawlAllModal` component definition at the bottom of the file (after the `DiscoverPage` function). It is a local function, not exported. See Task 8 for the full file listing that incorporates both this component and the wiring.

```typescript
// Local sub-component appended to $id.discover.tsx

function CrawlAllModal({
  feedLabel,
  busy,
  error,
  autoCrawl,
  onAutoCrawlChange,
  onCancel,
  onConfirm,
}: {
  feedLabel: string;
  busy: boolean;
  error: string | null;
  autoCrawl: boolean;
  onAutoCrawlChange: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crawl-all-title"
        className="w-full max-w-md rounded-xl border border-border bg-bg-elevated p-6 shadow-elev"
      >
        <h2 id="crawl-all-title" className="font-sans text-heading-md text-fg">
          Import tất cả truyện trong feed này?
        </h2>
        <p className="mt-2 text-body-sm text-fg-muted">
          Hệ thống sẽ quét toàn bộ trang của feed{' '}
          <span className="font-mono text-fg">"{feedLabel}"</span> và queue một job import cho
          mỗi truyện. Quá trình có thể mất nhiều phút tới vài giờ tuỳ kích thước catalog.
        </p>

        <label className="mt-4 flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoCrawl}
            onChange={(e) => onAutoCrawlChange(e.target.checked)}
            disabled={busy}
            className="mt-0.5 h-4 w-4 rounded border-border-strong bg-bg-elevated text-accent focus:ring-2 focus:ring-accent cursor-pointer"
          />
          <span className="text-body-sm text-fg-muted">
            Tự động crawl chapter content{' '}
            <span className="text-fg-subtle">(tính năng sẽ có hiệu lực sau khi enqueueImport được mở rộng)</span>
          </span>
        </label>

        {error ? (
          <p className="mt-3 text-body-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-10 items-center rounded-md px-4 text-body-sm font-medium text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent-gradient px-4 text-body-sm font-semibold text-white shadow-glow-pink-soft transition-opacity duration-fast hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Đang queue…
              </>
            ) : (
              'Import tất cả →'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
```

> **IMPORTANT — Tasks 7 and 8 are merged into a single file rewrite in Task 8.** Do NOT run a standalone typecheck or commit after adding just the `CrawlAllModal` component — it uses `Loader2` from `lucide-react`, which is imported in the Task 8 full-file rewrite. A Task 7-only partial edit will produce a TypeScript compile error. Execute Task 8 immediately after Task 7 and commit both together using the Task 8 commit message.

---

### Task 8 — Wire button + modal + API call into `$id.discover.tsx`

**Files:** Modify `apps/frontend/src/routes/admin/sources/$id.discover.tsx`

**Why:** This task completes the feature by adding the trigger button to the page header (next to the feed tabs row), wiring modal open/close state, calling `sourcesApi.discoverAll`, handling 202/409/error responses with inline messages, and navigating to `/admin/jobs` on success.

**Steps:**

Replace the full contents of `$id.discover.tsx` with the following:

```typescript
// apps/frontend/src/routes/admin/sources/$id.discover.tsx

import { useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, ListChecks } from 'lucide-react';
import { discoverApi } from '@/api/discover';
import { sourcesApi } from '@/api/sources';
import { DiscoverActionBar } from '@/components/admin/DiscoverActionBar';
import { DiscoverFilters } from '@/components/admin/DiscoverFilters';
import { DiscoverPagination } from '@/components/admin/DiscoverPagination';
import { DiscoverTable } from '@/components/admin/DiscoverTable';
import { useDiscoverImportStore } from '@/stores/discover-import-store';
import { useEffect } from 'react';

export const Route = createFileRoute('/admin/sources/$id/discover')({
  component: DiscoverPage,
  validateSearch: (s: Record<string, unknown>) => ({
    feed: typeof s.feed === 'string' ? s.feed : undefined,
    page: Number(s.page) || 1,
    q: typeof s.q === 'string' ? s.q : '',
  }),
});

function DiscoverPage() {
  const { id: sourceId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const navigateGlobal = useNavigate();
  const clearSelection = useDiscoverImportStore((s) => s.clearSelection);

  // Crawl-all modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAutoCrawl, setModalAutoCrawl] = useState(false);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const feedsQ = useQuery({
    queryKey: ['source-feeds', sourceId],
    queryFn: () => discoverApi.feeds(sourceId),
    staleTime: 5 * 60_000,
  });

  // Default feed = first one from the source's declared feeds (typically 'newest').
  const activeFeed = search.feed ?? feedsQ.data?.feeds[0]?.id ?? null;
  const searching = search.q.length > 0;

  const browseQ = useQuery({
    queryKey: ['discover', sourceId, searching ? `q:${search.q}` : `feed:${activeFeed}`, search.page],
    queryFn: () =>
      discoverApi.browse(sourceId, {
        feed: searching ? undefined : activeFeed ?? undefined,
        page: search.page,
        q: searching ? search.q : undefined,
      }),
    enabled: Boolean(searching || activeFeed),
    placeholderData: (prev) => prev,
  });

  // Reset selection when feed/query/page changes
  useEffect(() => {
    clearSelection();
  }, [activeFeed, search.q, search.page, clearSelection]);

  function setFeed(feedId: string) {
    navigate({ search: { feed: feedId, page: 1, q: '' } });
  }

  function setQuery(q: string) {
    navigate({ search: { feed: undefined, page: 1, q } });
  }

  function setPage(p: number) {
    navigate({ search: { ...search, page: p } });
  }

  function openCrawlAllModal() {
    setModalError(null);
    setInfo(null);
    setModalOpen(true);
  }

  function closeCrawlAllModal() {
    if (modalBusy) return;
    setModalOpen(false);
    setModalError(null);
  }

  async function submitCrawlAll() {
    if (!activeFeed) return;
    setModalBusy(true);
    setModalError(null);
    try {
      await sourcesApi.discoverAll(sourceId, activeFeed, modalAutoCrawl);
      setModalOpen(false);
      setInfo('Đã queue. Đang chuyển tới Jobs…');
      // Navigate after a short delay so the user sees the info message
      setTimeout(() => {
        void navigateGlobal({ to: '/admin/jobs' });
      }, 800);
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        (err as Error).message ??
        'Lỗi không xác định';
      if (status === 409) {
        setModalError('Job đang chạy. Mở trang Jobs để xem tiến độ.');
      } else {
        setModalError(typeof msg === 'string' ? msg : 'Lỗi khi queue crawl-all');
      }
    } finally {
      setModalBusy(false);
    }
  }

  if (feedsQ.isLoading || !feedsQ.data) {
    return <p className="text-sm text-muted-foreground p-8">Đang tải feeds...</p>;
  }
  if (feedsQ.error) {
    return (
      <p className="text-sm text-destructive p-8">
        Không tải được feeds. Source <code>{sourceId}</code> chưa được đăng ký adapter?
      </p>
    );
  }

  const { sourceName, baseUrl, feeds, supportsSearch } = feedsQ.data;

  // Label for the active feed (used in modal title)
  const activeFeedLabel =
    feeds.find((f) => f.id === activeFeed)?.label ?? activeFeed ?? 'feed hiện tại';

  return (
    <div className="space-y-6 pb-24">
      <div>
        <Link
          to="/admin/sources"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Sources
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight">
              Khám phá {sourceName}
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              Chọn truyện từ catalog của <code>{baseUrl}</code> để import metadata. Việc quét chapter
              và crawl nội dung sẽ chạy theo lệnh sau khi anh duyệt từng truyện.
            </p>
          </div>

          {/* Crawl-all trigger button */}
          {activeFeed && !searching && (
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={openCrawlAllModal}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-accent-gradient px-4 text-body-sm font-semibold text-white shadow-glow-pink-soft transition-opacity duration-fast hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg cursor-pointer"
              >
                <ListChecks className="h-4 w-4" aria-hidden />
                Import tất cả truyện trong feed này
              </button>
              {info && (
                <p className="text-[11px] text-positive">{info}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <DiscoverFilters
        feeds={feeds}
        activeFeed={activeFeed}
        query={search.q}
        supportsSearch={supportsSearch}
        onFeedChange={setFeed}
        onQueryChange={setQuery}
      />

      <DiscoverTable items={browseQ.data?.items ?? []} isLoading={browseQ.isLoading} />

      {browseQ.data && (
        <DiscoverPagination
          page={browseQ.data.page}
          hasNextPage={browseQ.data.hasNextPage}
          isLoading={browseQ.isFetching}
          onChange={setPage}
        />
      )}

      <DiscoverActionBar onImported={() => browseQ.refetch()} />

      {modalOpen && (
        <CrawlAllModal
          feedLabel={activeFeedLabel}
          busy={modalBusy}
          error={modalError}
          autoCrawl={modalAutoCrawl}
          onAutoCrawlChange={setModalAutoCrawl}
          onCancel={closeCrawlAllModal}
          onConfirm={() => void submitCrawlAll()}
        />
      )}
    </div>
  );
}

function CrawlAllModal({
  feedLabel,
  busy,
  error,
  autoCrawl,
  onAutoCrawlChange,
  onCancel,
  onConfirm,
}: {
  feedLabel: string;
  busy: boolean;
  error: string | null;
  autoCrawl: boolean;
  onAutoCrawlChange: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crawl-all-title"
        className="w-full max-w-md rounded-xl border border-border bg-bg-elevated p-6 shadow-elev"
      >
        <h2 id="crawl-all-title" className="font-sans text-heading-md text-fg">
          Import tất cả truyện trong feed này?
        </h2>
        <p className="mt-2 text-body-sm text-fg-muted">
          Hệ thống sẽ quét toàn bộ trang của feed{' '}
          <span className="font-mono text-fg">"{feedLabel}"</span> và queue một job import cho
          mỗi truyện. Quá trình có thể mất nhiều phút tới vài giờ tuỳ kích thước catalog.
        </p>

        <label className="mt-4 flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoCrawl}
            onChange={(e) => onAutoCrawlChange(e.target.checked)}
            disabled={busy}
            className="mt-0.5 h-4 w-4 rounded border-border-strong bg-bg-elevated text-accent focus:ring-2 focus:ring-accent cursor-pointer"
          />
          <span className="text-body-sm text-fg-muted">
            Tự động crawl chapter content{' '}
            <span className="text-fg-subtle">(tính năng sẽ có hiệu lực sau khi enqueueImport được mở rộng)</span>
          </span>
        </label>

        {error ? (
          <p className="mt-3 text-body-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-10 items-center rounded-md px-4 text-body-sm font-medium text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent-gradient px-4 text-body-sm font-semibold text-white shadow-glow-pink-soft transition-opacity duration-fast hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Đang queue…
              </>
            ) : (
              'Import tất cả →'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Verify:**
```powershell
pnpm --filter @smanga/frontend typecheck
```
Expected: 0 errors. Both `pnpm --filter @smanga/api typecheck` and `pnpm --filter @smanga/frontend typecheck` pass clean.

**Commit:**
```
feat(admin): wire crawl-all button + modal + navigation into discover page
```

---

## Acceptance criteria mapping

| AC | Task |
|----|------|
| AC-1: POST returns 202 + `{ jobId }` | T5 |
| AC-2: Second call returns 409 | T4 (idempotent jobId dedup) |
| AC-3: Invalid feed returns 400 listing valid feeds | T4 |
| AC-4: Job iterates pages + sleeps 1s between pages | T2 |
| AC-5: Each story enqueued; duplicates skipped silently (via idempotent importStory engine — ConflictException/BadRequestException caught per-item); **note:** autoCrawl checkbox has no backend effect until enqueueImport is extended | T2 |
| AC-6: `job.progress()` reports `{ page, totalQueued, hasNextPage }` | T2 |
| AC-7: Job returns `{ totalQueued, pagesCrawled }` | T2 |
| AC-8: Button renders with `bg-accent-gradient` + `shadow-glow-pink-soft` | T8 |
| AC-9: Click opens confirm modal with feed name + autoCrawl checkbox (checkbox is UI-only; no backend effect until enqueueImport is extended) | T7, T8 |
| AC-10: Confirm disables button + shows spinner while POSTing | T8 |
| AC-11: 202 success → inline message "Đã queue. Đang chuyển tới Jobs…" appears AND user is navigated to `/admin/jobs` after ~800ms (no external toast library — uses local `setInfo` state rendered as `<p>`) | T8 |
| AC-12: 409 → inline error message appears in modal (`setModalError` rendered as `<p role="alert">`), no navigation (no external toast library used) | T8 |
| AC-13: Both typechecks pass | T5 (BE), T8 (FE) |

---

## Execution checklist

Run in order. Each task ends with a commit. Do not push.

- [ ] T1: queue.constants.ts — add constant + interface
- [ ] T2: discover-all-source.processor.ts — create file
- [ ] T3: crawler-jobs.module.ts + stories.module.ts — module wiring (sources.module.ts is modified in T4, not T3)
- [ ] T4: create-source.dto.ts + sources.service.ts + sources.module.ts — DTO + service method
- [ ] T5: sources.controller.ts — POST endpoint
- [ ] T6: api/sources.ts — discoverAll client method
- [ ] T7: (included in T8) CrawlAllModal component
- [ ] T8: $id.discover.tsx — full file rewrite with button + modal + wiring

Final verification:
```powershell
pnpm --filter @smanga/api typecheck
pnpm --filter @smanga/frontend typecheck
```
