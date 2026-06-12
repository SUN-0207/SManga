# Smart Auto-Crawl (Backlog Drainer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standing background feeder that continuously drains the `pending`-chapter backlog (~34,917 "Cần crawl" stories) newest-first, bounded + kill-switchable, yielding to all manual/discover work and idling when empty.

**Architecture:** A Bull repeatable (`JOB_AUTOCRAWL_FEED`, cron `*/1`) installed on boot like the retry-reconciler; each tick gates on a kill switch + a queue watermark, selects the next newest-first `pending` chapter ids, and `enqueueChunked`s them as low-priority (`AUTOCRAWL_FETCH=30`) fetch-chapter jobs. The existing 1-rps worker drains them; failures fall to the existing dead-letter path and are never re-picked. Reuses `enqueueChunked` / `withRedisReadyRetry` / capacity gate / the auto-retry settings pattern.

**Tech Stack:** NestJS 11 + `@nestjs/bull` 4 (Redis), Drizzle/postgres.js, Vitest, Vite/React 19.

**Spec:** `docs/superpowers/specs/2026-06-12-smart-auto-crawl-design.md` — read it first.

---

## Running tests / builds (authoritative)

| Action | Command |
|---|---|
| api unit test | `pnpm --filter @smanga/api exec vitest run src/modules/<...>/<file>` |
| api typecheck / build | `pnpm --filter @smanga/api typecheck` / `pnpm --filter @smanga/api build` |
| frontend typecheck / build | `pnpm --filter @smanga/frontend typecheck` / `pnpm --filter @smanga/frontend build` |
| db generate (migration) | `pnpm db:generate` (drizzle-kit; check root `package.json` if the script name differs) |
| full suite | `pnpm test` |

**Pre-commit hook** (lefthook): `biome check` on staged files + full-monorepo `pnpm typecheck`. Before each commit: `pnpm exec biome check --write <changed files>`, re-stage. Never `--no-verify`, never `git add -A`, never push. Work on `main` (user-authorized this session). Local dev API on `PORT=3010` (OPSWAT holds :3001); to drive the FE locally, temporarily point the Vite proxy at :3010 and revert before commit.

---

## File structure

| File | Change |
|---|---|
| `packages/db/src/schema/app-setting.ts` | +`autoCrawlEnabled`, +`autoCrawlWatermark` columns |
| `packages/db/src/migrations/0014_*.sql` (+ snapshot + journal) | the 2 ALTER ADD COLUMN |
| `apps/api/src/modules/queue/queue.constants.ts` | +`JOB_AUTOCRAWL_FEED`, +`JOB_PRIORITY.AUTOCRAWL_FETCH = 30` |
| `apps/api/src/modules/app-settings/app-settings.service.ts` | +`getAutoCrawl()`, +`setAutoCrawl(enabled, watermark)` |
| `apps/api/src/modules/app-settings/auto-crawl-feeder.processor.ts` | **new** — repeatable feeder (install + tick) |
| `apps/api/src/modules/app-settings/auto-crawl-feeder.processor.spec.ts` | **new** — unit tests |
| `apps/api/src/modules/app-settings/dto/update-auto-crawl.dto.ts` | **new** — DTO |
| `apps/api/src/modules/app-settings/auto-crawl.controller.ts` | **new** — `GET/PATCH /admin/settings/auto-crawl` |
| `apps/api/src/modules/app-settings/app-settings.module.ts` | register controller + feeder provider |
| `apps/frontend/src/api/settings.ts` | +`AutoCrawlSetting` type + `getAutoCrawl`/`updateAutoCrawl` |
| `apps/frontend/src/routes/admin/settings.tsx` | +`AutoCrawlCard` |

---

## Task 1: Schema columns + migration

**Files:**
- Modify: `packages/db/src/schema/app-setting.ts`
- Create: `packages/db/src/migrations/0014_*.sql` (+ meta snapshot + `_journal.json` entry)

- [ ] **Step 1: Add the two columns**

In `packages/db/src/schema/app-setting.ts`, add after the `autoRetryEnabled` line (line ~19):

```typescript
  /** Smart auto-crawl backlog drainer. OFF by default (opt-in). */
  autoCrawlEnabled: boolean('auto_crawl_enabled').notNull().default(false),
  /** Max fetch-chapter jobs the feeder keeps queued (the bound that makes it
   * non-disruptive). Clamped [50,2000] in the DTO. */
  autoCrawlWatermark: integer('auto_crawl_watermark').notNull().default(500),
```

(`boolean` and `integer` are already imported at the top of the file.)

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `packages/db/src/migrations/0014_*.sql`, a `meta/0014_*.json` snapshot, and a `_journal.json` entry.

- [ ] **Step 3: Verify + trim the migration SQL**

Open the generated `0014_*.sql`. It MUST contain exactly these two statements (and nothing else — drizzle-kit can re-emit drifted statements for earlier migrations; if so, delete everything except these two, matching the 0012/0013 handling):

```sql
ALTER TABLE "app_setting" ADD COLUMN "auto_crawl_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_setting" ADD COLUMN "auto_crawl_watermark" integer DEFAULT 500 NOT NULL;
```

KEEP the generated `meta/0014_*.json` snapshot and the `_journal.json` entry (they repair any snapshot drift for future `generate`). Confirm `_journal.json` now has an `idx: 14` entry tagged `0014_*`.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm --filter @smanga/db typecheck` → PASS.
```bash
git add packages/db/src/schema/app-setting.ts packages/db/src/migrations/0014_*.sql packages/db/src/migrations/meta/0014_*.json packages/db/src/migrations/meta/_journal.json
git commit -m "feat(db): app_setting auto_crawl_enabled + auto_crawl_watermark"
```

---

## Task 2: Queue constants (job name + priority tier)

**Files:**
- Modify: `apps/api/src/modules/queue/queue.constants.ts`

- [ ] **Step 1: Add the job name**

After line 8 (`export const JOB_RETRY_RECONCILER = 'retry-reconciler';`) add:

```typescript
export const JOB_AUTOCRAWL_FEED = 'autocrawl-feed';
```

- [ ] **Step 2: Add the priority tier**

In the `JOB_PRIORITY` object, add `AUTOCRAWL_FETCH: 30` as the last entry (lowest priority — every other job preempts the background drain), and extend the doc comment:

```typescript
export const JOB_PRIORITY = {
  FETCH_CHAPTER: 1,
  RETRY_RECONCILER: 2,
  DISCOVER_CHAPTERS: 5,
  DISCOVER_ALL_SOURCE: 8,
  IMPORT_STORY: 10,
  REFRESH_ALL_STORIES: 20,
  // 30) Background auto-crawl backlog drain — lowest priority so manual
  //     crawl-missing / "Chỉ crawl lỗi" / discover / reconciler always preempt.
  AUTOCRAWL_FETCH: 30,
} as const;
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @smanga/api typecheck` → PASS.
```bash
git add apps/api/src/modules/queue/queue.constants.ts
git commit -m "feat(queue): JOB_AUTOCRAWL_FEED + AUTOCRAWL_FETCH priority (lowest)"
```

---

## Task 3: Settings service methods

**Files:**
- Modify: `apps/api/src/modules/app-settings/app-settings.service.ts`

- [ ] **Step 1: Add get/set methods**

In `AppSettingsService`, add these methods next to `getAutoRetry`/`setAutoRetry` (the `getOrSeed`, `appSetting`, `eq`, `BadRequestException` they use are already imported/defined in the file):

```typescript
  async getAutoCrawl(): Promise<{ autoCrawlEnabled: boolean; autoCrawlWatermark: number }> {
    const s = await this.getOrSeed();
    return { autoCrawlEnabled: s.autoCrawlEnabled, autoCrawlWatermark: s.autoCrawlWatermark };
  }

  async setAutoCrawl(
    enabled: boolean,
    watermark: number,
  ): Promise<{ autoCrawlEnabled: boolean; autoCrawlWatermark: number }> {
    // Clamp defensively even though the DTO validates — the bound is the
    // load-bearing safety knob; never let it be 0 or absurdly large.
    const clamped = Math.min(2000, Math.max(50, Math.floor(watermark)));
    const [updated] = await this.db
      .update(appSetting)
      .set({ autoCrawlEnabled: enabled, autoCrawlWatermark: clamped, updatedAt: new Date() })
      .where(eq(appSetting.id, 1))
      .returning();
    if (!updated) throw new BadRequestException('app_setting row missing — re-run migrations');
    return {
      autoCrawlEnabled: updated.autoCrawlEnabled,
      autoCrawlWatermark: updated.autoCrawlWatermark,
    };
  }
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @smanga/api typecheck` → PASS.
```bash
git add apps/api/src/modules/app-settings/app-settings.service.ts
git commit -m "feat(api): getAutoCrawl/setAutoCrawl settings methods"
```

---

## Task 4: The feeder processor (TDD)

**Files:**
- Create: `apps/api/src/modules/app-settings/auto-crawl-feeder.processor.ts`
- Test: `apps/api/src/modules/app-settings/auto-crawl-feeder.processor.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/app-settings/auto-crawl-feeder.processor.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { AutoCrawlFeederProcessor } from './auto-crawl-feeder.processor';

/** db.select().from().where().limit() → [configRow] */
function selectConfig(configRow: unknown) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(configRow ? [configRow] : []),
  };
  return () => chain;
}

describe('AutoCrawlFeederProcessor.handle', () => {
  it('no-op when disabled', async () => {
    const db = { select: vi.fn(selectConfig({ autoCrawlEnabled: false, autoCrawlWatermark: 500 })) };
    const queue = { getWaitingCount: vi.fn(), addBulk: vi.fn() };
    const svc = new AutoCrawlFeederProcessor(db as never, queue as never);
    const res = await svc.handle();
    expect(res).toEqual({ enqueued: 0, reason: 'disabled' });
    expect(queue.getWaitingCount).not.toHaveBeenCalled();
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('no-op when waiting >= watermark', async () => {
    const db = {
      select: vi.fn(selectConfig({ autoCrawlEnabled: true, autoCrawlWatermark: 500 })),
      execute: vi.fn(),
    };
    const queue = { getWaitingCount: vi.fn().mockResolvedValue(500), addBulk: vi.fn() };
    const svc = new AutoCrawlFeederProcessor(db as never, queue as never);
    const res = await svc.handle();
    expect(res).toEqual({ enqueued: 0, reason: 'watermark' });
    expect(db.execute).not.toHaveBeenCalled();
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('idle when no pending chapters', async () => {
    const db = {
      select: vi.fn(selectConfig({ autoCrawlEnabled: true, autoCrawlWatermark: 500 })),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const queue = { getWaitingCount: vi.fn().mockResolvedValue(0), addBulk: vi.fn() };
    const svc = new AutoCrawlFeederProcessor(db as never, queue as never);
    const res = await svc.handle();
    expect(res).toEqual({ enqueued: 0, reason: 'idle' });
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('enqueues pending chapter ids as low-priority fetch-chapter jobs', async () => {
    const db = {
      select: vi.fn(selectConfig({ autoCrawlEnabled: true, autoCrawlWatermark: 500 })),
      execute: vi.fn().mockResolvedValue({ rows: [{ id: 'c1' }, { id: 'c2' }] }),
    };
    const addBulk = vi.fn().mockResolvedValue([]);
    const queue = { getWaitingCount: vi.fn().mockResolvedValue(0), addBulk };
    const svc = new AutoCrawlFeederProcessor(db as never, queue as never);
    const res = await svc.handle();
    expect(res).toEqual({ enqueued: 2, reason: null });
    const chunk = addBulk.mock.calls[0][0] as Array<{ name: string; data: unknown; opts: { jobId: string; priority: number } }>;
    expect(chunk).toHaveLength(2);
    expect(chunk[0]).toMatchObject({
      name: 'fetch-chapter',
      data: { chapterId: 'c1' },
      opts: { jobId: 'fetch-chapter:c1', priority: 30 },
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @smanga/api exec vitest run src/modules/app-settings/auto-crawl-feeder.processor.spec.ts`
Expected: FAIL — module `./auto-crawl-feeder.processor` does not exist.

- [ ] **Step 3: Write the processor**

Create `apps/api/src/modules/app-settings/auto-crawl-feeder.processor.ts`:

```typescript
import { DRIZZLE } from '@/modules/db/db.provider';
import { enqueueChunked } from '@/modules/queue/enqueue.util';
import { withRedisReadyRetry } from '@/modules/queue/redis-ready';
import {
  type FetchChapterJobData,
  JOB_AUTOCRAWL_FEED,
  JOB_FETCH_CHAPTER,
  JOB_PRIORITY,
  QUEUE_CRAWLER,
} from '@/modules/queue/queue.constants';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Inject, Logger, type OnModuleInit } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { appSetting } from '@smanga/db/schema';
import type { Job, Queue } from 'bull';
import { eq, sql } from 'drizzle-orm';

const FEEDER_REPEATABLE_KEY = 'autocrawl-feeder-cron';
const FEEDER_CRON = '*/1 * * * *'; // every minute

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

/**
 * Background backlog drainer. Each tick keeps the queue topped (up to the
 * watermark) with the next newest-first `pending` chapters at the LOWEST
 * priority, so the existing 1-rps worker drains them without ever flooding the
 * queue or preempting manual/discover work. Idles when the backlog is empty.
 */
@Processor(QUEUE_CRAWLER)
export class AutoCrawlFeederProcessor implements OnModuleInit {
  private readonly logger = new Logger(AutoCrawlFeederProcessor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const repeatables = await this.queue.getRepeatableJobs();
      for (const r of repeatables) {
        if (r.id === FEEDER_REPEATABLE_KEY) await this.queue.removeRepeatableByKey(r.key);
      }
    } catch (err) {
      this.logger.warn(`auto-crawl feeder cleanup failed: ${(err as Error).message}`);
    }
    // Retry through Redis LOADING on a co-restart (see redis-ready.ts) so a
    // boot-time install can't crash the API. The kill switch is checked inside
    // handle(), so the repeatable stays installed and just no-ops when disabled.
    await withRedisReadyRetry(
      () =>
        this.queue.add(
          JOB_AUTOCRAWL_FEED,
          {},
          {
            repeat: { cron: FEEDER_CRON, tz: 'Asia/Ho_Chi_Minh' },
            jobId: FEEDER_REPEATABLE_KEY,
            // The tick itself is a cheap DB+enqueue — run it promptly (high
            // priority) so the queue is refilled before it drains below the
            // watermark. The fetch-chapter jobs it ENQUEUES are low priority.
            priority: JOB_PRIORITY.RETRY_RECONCILER,
            removeOnComplete: true,
            removeOnFail: 50,
          },
        ),
      { logger: this.logger, label: 'auto-crawl feeder install' },
    );
    this.logger.log(`auto-crawl feeder installed cron="${FEEDER_CRON}"`);
  }

  @Process(JOB_AUTOCRAWL_FEED)
  async handle(_job?: Job): Promise<{ enqueued: number; reason: string | null }> {
    const [config] = await this.db
      .select({
        autoCrawlEnabled: appSetting.autoCrawlEnabled,
        autoCrawlWatermark: appSetting.autoCrawlWatermark,
      })
      .from(appSetting)
      .where(eq(appSetting.id, 1))
      .limit(1);
    if (!config?.autoCrawlEnabled) return { enqueued: 0, reason: 'disabled' };

    const waiting = await this.queue.getWaitingCount();
    if (waiting >= config.autoCrawlWatermark) return { enqueued: 0, reason: 'watermark' };
    const headroom = config.autoCrawlWatermark - waiting;

    // Newest-story-first pending chapters. Index-ordered (story_updated_at_idx
    // DESC + partial chapter_needs_crawl_idx) with LIMIT so it stops early — no
    // Seq Scan over the ~1.7M pending rows. EXPLAIN-verified (Task 7).
    const r = await this.db.execute<{ id: string }>(sql`
      SELECT ch.id
      FROM chapter ch
      JOIN story s ON s.id = ch.story_id
      WHERE s.discovery_status = 'complete' AND ch.status = 'pending'
      ORDER BY s.updated_at DESC, ch.index ASC
      LIMIT ${headroom}
    `);
    const rows = rowsOf<{ id: string }>(r);
    if (rows.length === 0) return { enqueued: 0, reason: 'idle' };

    const jobs = rows.map((c) => ({
      name: JOB_FETCH_CHAPTER,
      data: { chapterId: c.id } satisfies FetchChapterJobData,
      opts: {
        jobId: `fetch-chapter:${c.id}`,
        priority: JOB_PRIORITY.AUTOCRAWL_FETCH,
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 30_000 },
      },
    }));
    const { enqueued } = await enqueueChunked(this.queue, jobs);
    this.logger.log(`auto-crawl feed: enqueued=${enqueued} waiting=${waiting} headroom=${headroom}`);
    return { enqueued, reason: null };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @smanga/api exec vitest run src/modules/app-settings/auto-crawl-feeder.processor.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/app-settings/auto-crawl-feeder.processor.ts apps/api/src/modules/app-settings/auto-crawl-feeder.processor.spec.ts
git commit -m "feat(api): auto-crawl feeder processor (bounded newest-first backlog drainer)"
```

---

## Task 5: Controller + DTO + module wiring

**Files:**
- Create: `apps/api/src/modules/app-settings/dto/update-auto-crawl.dto.ts`
- Create: `apps/api/src/modules/app-settings/auto-crawl.controller.ts`
- Modify: `apps/api/src/modules/app-settings/app-settings.module.ts`

- [ ] **Step 1: DTO**

Create `apps/api/src/modules/app-settings/dto/update-auto-crawl.dto.ts`:

```typescript
import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class UpdateAutoCrawlDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(50)
  @Max(2000)
  watermark!: number;
}
```

- [ ] **Step 2: Controller**

Create `apps/api/src/modules/app-settings/auto-crawl.controller.ts`:

```typescript
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppSettingsService } from './app-settings.service';
import { UpdateAutoCrawlDto } from './dto/update-auto-crawl.dto';

@ApiTags('admin/settings')
@Controller({ path: 'admin/settings/auto-crawl', version: '1' })
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
export class AutoCrawlController {
  constructor(private readonly settings: AppSettingsService) {}

  @Get()
  get() {
    return this.settings.getAutoCrawl();
  }

  @Patch()
  update(@Body() dto: UpdateAutoCrawlDto) {
    return this.settings.setAutoCrawl(dto.enabled, dto.watermark);
  }
}
```

- [ ] **Step 3: Register in the module**

Replace `apps/api/src/modules/app-settings/app-settings.module.ts` with:

```typescript
import { QUEUE_CRAWLER } from '@/modules/queue/queue.constants';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { AppSettingsController } from './app-settings.controller';
import { AppSettingsService } from './app-settings.service';
import { AutoCrawlController } from './auto-crawl.controller';
import { AutoCrawlFeederProcessor } from './auto-crawl-feeder.processor';
import { AutoRetryController } from './auto-retry.controller';
import { RefreshAllStoriesProcessor } from './refresh-all-stories.processor';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_CRAWLER })],
  controllers: [AppSettingsController, AutoRetryController, AutoCrawlController],
  providers: [AppSettingsService, RefreshAllStoriesProcessor, AutoCrawlFeederProcessor],
  exports: [AppSettingsService],
})
export class AppSettingsModule {}
```

- [ ] **Step 4: Typecheck + build + commit**

Run: `pnpm --filter @smanga/api typecheck` → PASS.
Run: `pnpm --filter @smanga/api build` → webpack success.
```bash
git add apps/api/src/modules/app-settings/dto/update-auto-crawl.dto.ts apps/api/src/modules/app-settings/auto-crawl.controller.ts apps/api/src/modules/app-settings/app-settings.module.ts
git commit -m "feat(api): /admin/settings/auto-crawl endpoint + feeder DI"
```

---

## Task 6: Frontend settings UI

**Files:**
- Modify: `apps/frontend/src/api/settings.ts`
- Modify: `apps/frontend/src/routes/admin/settings.tsx`

- [ ] **Step 1: API client**

Append to `apps/frontend/src/api/settings.ts`:

```typescript
export interface AutoCrawlSetting {
  autoCrawlEnabled: boolean;
  autoCrawlWatermark: number;
}

export async function getAutoCrawl(): Promise<AutoCrawlSetting> {
  const res = await api.get<AutoCrawlSetting>('/admin/settings/auto-crawl');
  return res.data;
}

export async function updateAutoCrawl(patch: AutoCrawlSetting): Promise<AutoCrawlSetting> {
  const res = await api.patch<AutoCrawlSetting>('/admin/settings/auto-crawl', patch);
  return res.data;
}
```

- [ ] **Step 2: Add the AutoCrawlCard + render it**

In `apps/frontend/src/routes/admin/settings.tsx`:

(a) Extend the imports from `@/api/settings`:
```typescript
import {
  type AutoCrawlSetting,
  type AutoRefreshSetting,
  getAutoCrawl,
  getAutoRefresh,
  runAutoRefreshNow,
  updateAutoCrawl,
  updateAutoRefresh,
} from '@/api/settings';
```

(b) In `AdminSettingsPage`, add a second query + render the card after the `AutoRefreshCard` block (inside the outer `<div className="space-y-8 max-w-3xl">`):
```typescript
  const autoCrawlQ = useQuery({
    queryKey: ['admin', 'settings', 'auto-crawl'],
    queryFn: getAutoCrawl,
  });
```
```tsx
      {autoCrawlQ.data && (
        <AutoCrawlCard
          setting={autoCrawlQ.data}
          onUpdated={() => qc.invalidateQueries({ queryKey: ['admin', 'settings', 'auto-crawl'] })}
        />
      )}
```

(c) Add the component at the end of the file:
```tsx
function AutoCrawlCard({
  setting,
  onUpdated,
}: {
  setting: AutoCrawlSetting;
  onUpdated: () => void;
}) {
  const [enabled, setEnabled] = useState(setting.autoCrawlEnabled);
  const [watermark, setWatermark] = useState(setting.autoCrawlWatermark);
  const [okFlash, setOkFlash] = useState(false);

  useEffect(() => {
    setEnabled(setting.autoCrawlEnabled);
    setWatermark(setting.autoCrawlWatermark);
  }, [setting.autoCrawlEnabled, setting.autoCrawlWatermark]);

  const saveM = useMutation({
    mutationFn: () => updateAutoCrawl({ autoCrawlEnabled: enabled, autoCrawlWatermark: watermark }),
    onSuccess: () => {
      setOkFlash(true);
      setTimeout(() => setOkFlash(false), 2500);
      onUpdated();
    },
  });

  const dirty = enabled !== setting.autoCrawlEnabled || watermark !== setting.autoCrawlWatermark;
  const errMsg = saveM.error as { response?: { data?: { message?: string } } } | null;
  const errorText = errMsg?.response?.data?.message ?? null;

  return (
    <section className="rounded-xl border border-border bg-bg overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-border/60 flex items-start gap-3">
        <SettingsIcon className="h-5 w-5 text-fg-muted mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0">
          <h2 className="font-sans font-semibold text-lg">Tự động crawl backlog</h2>
          <p className="text-sm text-fg-muted mt-1">
            Tự động crawl dần các chương "Cần crawl" (mới nhất trước), 1 chương/giây, ưu tiên thấp
            nhất nên không ảnh hưởng thao tác tay hay người đọc. Hết backlog thì tự dừng.
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
            <span className="block text-sm font-medium">Bật auto-crawl</span>
            <span className="block text-xs text-fg-muted mt-0.5">
              Khi tắt, feeder ngừng châm job ngay (job đang chạy vẫn hoàn tất).
            </span>
          </span>
        </label>

        <label className="space-y-1.5 block max-w-xs">
          <span className="text-[11px] font-medium text-fg/80 uppercase tracking-[0.18em]">
            Watermark (số job tối đa trong hàng đợi)
          </span>
          <input
            type="number"
            min={50}
            max={2000}
            value={watermark}
            onChange={(e) => setWatermark(Number(e.target.value))}
            className="w-full h-10 px-3 rounded-md border border-border bg-bg text-sm tabular-nums focus:outline-none focus:border-fg/40 focus:ring-2 focus:ring-accent/20 transition-all duration-200"
          />
          <span className="block text-xs text-fg-muted">
            Càng thấp càng nhẹ. Mặc định 500 (giới hạn 50–2000).
          </span>
        </label>

        {errorText && <p className="text-sm text-destructive">{errorText}</p>}

        <div className="pt-2 border-t border-border/60 flex items-center justify-end gap-2">
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

(`SettingsIcon`, `Loader2`, `Check`, `useState`, `useEffect`, `useMutation`, `useQuery` are already imported in this file.)

- [ ] **Step 3: Typecheck + build + commit**

Run: `pnpm --filter @smanga/frontend typecheck` → PASS.
Run: `pnpm --filter @smanga/frontend build` → success.
```bash
git add apps/frontend/src/api/settings.ts apps/frontend/src/routes/admin/settings.tsx
git commit -m "feat(admin): auto-crawl settings card (toggle + watermark)"
```

---

## Task 7: Verify + finish (controller)

- [ ] **Step 1: Full suite + typecheck + builds**

Run: `pnpm test` → all green (adds the 4 feeder tests).
Run: `pnpm typecheck` → 6 packages PASS.
Run: `pnpm --filter @smanga/api build` + `pnpm --filter @smanga/frontend build` → success.

- [ ] **Step 2: Migration applies + EXPLAIN (controller, local Postgres)**

Apply the migration to the local dev DB (`pnpm db:migrate` with the dev `DATABASE_URL`). Then EXPLAIN the picker against the local data and confirm index usage (no Seq Scan / no full sort), e.g.:
```sql
EXPLAIN SELECT ch.id FROM chapter ch JOIN story s ON s.id = ch.story_id
WHERE s.discovery_status='complete' AND ch.status='pending'
ORDER BY s.updated_at DESC, ch.index ASC LIMIT 500;
```
Expected: index scan on `story_updated_at_idx` + the partial `chapter_needs_crawl_idx`, with the LIMIT stopping early. If the planner does a full sort/Seq Scan on prod-scale data, switch to the two-step story-frontier form (spec §5 option b) and re-EXPLAIN.

- [ ] **Step 3: Boot smoke (PORT=3010, local Postgres+Redis)**

Boot the api; confirm: DI clean, `auto-crawl feeder installed cron="*/1 * * * *"` logged, no crash. Enable via `curl -X PATCH /api/v1/auth`-authed `/admin/settings/auto-crawl` (or the UI), seed a few `pending` chapters, watch the feeder log `enqueued=N` and the queue trickle; confirm the reader endpoints stay responsive; flip it off → feeder logs no-op. Revert any seeded data.

- [ ] **Step 4: Playwright proof (house rule, before push)**

Drive the dev FE (proxy → :3010): `/admin/settings` shows the "Tự động crawl backlog" card; toggling + saving persists (re-fetch shows the new state); with it enabled + pending seeded, `/admin/stories` "Cần crawl (N)" decreases over time. Screenshot as proof.

- [ ] **Step 5: Finish**

`superpowers:finishing-a-development-branch` substance: clean tree, commit-only (no push without explicit user ask — push auto-deploys via CI→Watchtower). Ship with `autoCrawlEnabled` default OFF (no behavior change on deploy); enable + monitor per spec §10.

---

## Self-review (author's checklist — completed)

**Spec coverage:** §3 repeatable feeder → Task 4 (`onModuleInit` install via `withRedisReadyRetry`, cron `*/1`). §4 components → Tasks 2 (constants), 4 (processor), 5 (controller/DTO/module), 1 (schema). §5 tick algorithm (kill switch → watermark gate → newest-first picker → enqueueChunked low-priority) → Task 4 `handle()`; index-friendly query + EXPLAIN → Task 4 query + Task 7 Step 2. §6 safety gates → Task 4 (kill switch, watermark, AUTOCRAWL_FETCH priority, pending-only) + reused capacity/1-rps. §7 settings/observability → Tasks 1/3/5/6 + the per-tick log + "Cần crawl" pill. §8 error handling → `withRedisReadyRetry` install + (note) the `@Process` handler's throw is caught by Bull's job lifecycle (failed job, removeOnFail:50) so a bad tick never crashes the process; failed chapters → existing dead-letter path. §9 testing → Task 4 unit tests + Task 7 EXPLAIN/boot/Playwright. §10 rollout (default OFF) → Task 7 Step 5. §11 params (cron `*/1`, AUTOCRAWL_FETCH 30, default OFF, watermark 500/[50,2000], newest-first, pending-only) → all reflected.

**Placeholder scan:** every code step is complete; the only deferred decision (single-query vs two-step picker) is explicit with an EXPLAIN gate + the concrete primary query given.

**Type consistency:** `getAutoCrawl`/`setAutoCrawl(enabled, watermark)` (Task 3) match the controller calls (Task 5) and the `{autoCrawlEnabled, autoCrawlWatermark}` shape consumed by the FE client + card (Task 6). `JOB_AUTOCRAWL_FEED` + `JOB_PRIORITY.AUTOCRAWL_FETCH` (Task 2) are imported/used in the processor (Task 4). `AutoCrawlFeederProcessor` constructor `(db, queue)` matches the spec's mock-based tests + the DI registration (Task 5). `appSetting.autoCrawlEnabled/autoCrawlWatermark` (Task 1) read in Task 3 + Task 4.
