# Chapter Text Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-06-08-chapter-text-layout-design.md](../specs/2026-06-08-chapter-text-layout-design.md)

**Goal:** Fix paragraph fusion in crawled chapter text (`\n` → `\n\n` block separator) and add an admin button at `/admin/jobs` to re-crawl all existing chapters so the 10.555 already-crawled chapters benefit from the fix.

**Architecture:** One-line parser change in the truyenfull adapter, plus a new admin-only `POST /jobs/refetch-all-chapters` endpoint that enqueues one `JOB_FETCH_CHAPTER` per chapter (idempotent via `jobId`). The existing engine + 0.5 rps token bucket drains the queue over ~6h. FE adds a confirm-modal button next to the existing bulk-retry one.

**Tech Stack:** NestJS 11 + Drizzle + Bull/Redis · Vite + React 19 · `@dr.pogodin/react-helmet` (for SEO unaffected) · vitest.

**User constraints (NON-NEGOTIABLE):**

- **Commit-only by default.** User pushes manually OR explicitly authorizes push (e.g. monitor-CI-loop tasks).
- **Playwright MCP available** for the verification step.
- Use the existing dev port choice (PORT=3010 if :3001 occupied by OPSWAT) — see prior tasks.

---

## File map

### Created
```
(none — only modifications)
```

### Modified
```
packages/crawler/src/sources/truyenfull/
  parsers.ts                       L250-252  '\n' → '\n\n'

apps/api/src/modules/jobs/
  jobs.service.ts                  + refetchAllChapters() method + DRIZZLE inject
  jobs.service.spec.ts             + 2 tests (enqueue count, empty DB)
  jobs.controller.ts               + @Post('refetch-all-chapters')

apps/api/test/
  jobs.e2e-spec.ts                 NEW — 3 e2e tests for the new endpoint
                                   (or extend an existing spec if one exists)

apps/frontend/src/api/
  jobs.ts                          + refetchAllChapters method

apps/frontend/src/routes/admin/
  jobs.tsx                         + button + modal + useMutation

packages/crawler/src/sources/truyenfull/
  parsers.spec.ts                  + 1 test asserting '\n\n' between paragraphs
                                   (extend the existing parser spec)
```

---

## Task 1: Crawler parser — emit `\n\n` between block elements

**Why first:** Smallest change; everything downstream (re-crawl tool) is only useful if the parser actually produces correct text. TDD-friendly.

**Files:**
- Modify: `packages/crawler/src/sources/truyenfull/parsers.ts:250-252`
- Modify: `packages/crawler/src/sources/truyenfull/parsers.spec.ts` (find the actual file via `glob 'packages/crawler/**/*.spec.ts'` — it may live at `packages/crawler/src/sources/truyenfull/__tests__/parsers.spec.ts` or similar; mirror existing location)

- [ ] **Step 1: Locate the parser test file**

```bash
cd c:/Users/son.cu/opswat/project/smanga
find packages/crawler -name 'parsers.spec.ts' -o -name 'parsers.test.ts' 2>/dev/null
```

If a spec file exists, you'll extend it. If none does, create `packages/crawler/src/sources/truyenfull/parsers.spec.ts` following the patterns of other crawler tests (look at neighbor `*.spec.ts` to see how they import + structure).

- [ ] **Step 2: Add a failing test for paragraph separators**

Append to the parser spec (or create it). The test uses inline HTML — no fixture dependency:

```ts
import { describe, expect, it } from 'vitest';
import { parseChapterContentHtml } from './parsers.ts';

describe('parseChapterContentHtml — paragraph separation', () => {
  it('emits \\n\\n between adjacent <p> blocks so FE split("\\n\\n") produces real paragraphs', () => {
    const html = `
      <h2><a class="chapter-title">Chương 1: Test</a></h2>
      <div id="chapter-c" class="chapter-c">
        <p>Hello world.</p>
        <p>Second paragraph.</p>
        <p>Third one.</p>
      </div>
    `;
    const result = parseChapterContentHtml(html);
    expect(result.text).toBe('Hello world.\n\nSecond paragraph.\n\nThird one.');
    // Reverse-check: when the FE does split('\n\n'), we get 3 paragraphs.
    expect(result.text.split('\n\n')).toHaveLength(3);
  });
});
```

- [ ] **Step 3: Run test and confirm it fails**

```bash
pnpm --filter @smanga/crawler test -- parsers.spec
```

Expected: FAIL with `expected 'Hello world.\nSecond paragraph.\nThird one.'` (single-newline output from the current code).

- [ ] **Step 4: Apply the parser fix**

In `packages/crawler/src/sources/truyenfull/parsers.ts`, locate the block around line 250-252 (inside `parseChapterContentHtml`):

```ts
contentEl.find('p, div, h1, h2, h3, h4, h5, h6, li, br').each((_, el) => {
  $(el).append('\n');
});
```

Change to:

```ts
contentEl.find('p, div, h1, h2, h3, h4, h5, h6, li, br').each((_, el) => {
  $(el).append('\n\n');
});
```

The existing `.replace(/\n{3,}/g, '\n\n')` step downstream clamps runs of newlines to exactly 2, so adjacent blocks produce exactly `\n\n` regardless of any source-side whitespace.

- [ ] **Step 5: Re-run test to confirm it passes**

```bash
pnpm --filter @smanga/crawler test -- parsers.spec
```

Expected: PASS (all parser tests, including the new one).

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @smanga/crawler typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/crawler/src/sources/truyenfull/parsers.ts packages/crawler/src/sources/truyenfull/parsers.spec.ts
git commit -m "fix(crawler/truyenfull): use \\n\\n block separator so FE split('\\n\\n') produces paragraphs"
```

Do NOT push.

---

## Task 2: Backend service — `refetchAllChapters()` + DRIZZLE injection

**Files:**
- Modify: `apps/api/src/modules/jobs/jobs.service.ts`
- Modify: `apps/api/src/modules/jobs/jobs.service.spec.ts` (or create it — check for existing file via glob)

- [ ] **Step 1: Inspect existing imports + the DRIZZLE injection pattern**

```bash
grep -E "DRIZZLE|@Inject" apps/api/src/modules/jobs/jobs.service.ts
grep -nE "DRIZZLE|Database" apps/api/src/modules/stories/stories.service.ts | head -5
```

`DRIZZLE` is exported from `@/modules/db/db.provider`. `Database` type is from `@smanga/db`. `DbModule` is `@Global()` so no module import is needed — just constructor injection.

- [ ] **Step 2: Write the failing service tests**

Append to `apps/api/src/modules/jobs/jobs.service.spec.ts` (or create it; mirror the structure of `apps/api/src/modules/seo/seo.service.spec.ts` which uses `new JobsService({} as never, fakeQueue)` for queue-only tests).

```ts
import { describe, expect, it, vi } from 'vitest';
import { JobsService } from './jobs.service';
import { JOB_FETCH_CHAPTER } from '@/modules/queue/queue.constants';

describe('JobsService.refetchAllChapters', () => {
  it('enqueues one fetch-chapter job per crawled chapter with idempotent jobId', async () => {
    const rows = [
      { id: 'c1', story_id: 's1', source_id: 'truyenfull', external_url: 'https://truyenfull.today/c1' },
      { id: 'c2', story_id: 's2', source_id: 'truyenfull', external_url: 'https://truyenfull.today/c2' },
    ];
    const db = { execute: vi.fn().mockResolvedValue({ rows }) };
    const addBulk = vi.fn().mockResolvedValue([]);
    const queue = { addBulk } as never;
    const svc = new JobsService(db as never, queue);

    const result = await svc.refetchAllChapters();

    expect(result).toEqual({ enqueued: 2 });
    expect(addBulk).toHaveBeenCalledTimes(1);
    const jobs = addBulk.mock.calls[0][0];
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      name: JOB_FETCH_CHAPTER,
      data: { chapterId: 'c1' },
      opts: expect.objectContaining({
        jobId: 'fetch-chapter-c1',
        attempts: 3,
      }),
    });
    expect(jobs[1].opts.jobId).toBe('fetch-chapter-c2');
  });

  it('returns { enqueued: 0 } and does not call addBulk when DB has no crawled chapters', async () => {
    const db = { execute: vi.fn().mockResolvedValue({ rows: [] }) };
    const addBulk = vi.fn();
    const queue = { addBulk } as never;
    const svc = new JobsService(db as never, queue);

    const result = await svc.refetchAllChapters();
    expect(result).toEqual({ enqueued: 0 });
    expect(addBulk).not.toHaveBeenCalled();
  });
});
```

**Note on constructor signature:** the current `JobsService` constructor takes only `@InjectQueue(QUEUE_CRAWLER) queue`. After Task 2, it will take `@Inject(DRIZZLE) db, @InjectQueue(QUEUE_CRAWLER) queue` (or the other way — match the order you put in the actual class). The test invocations `new JobsService(db, queue)` MUST match that order.

- [ ] **Step 3: Run + confirm fail**

```bash
pnpm --filter @smanga/api test -- jobs.service
```

Expected: FAIL — `svc.refetchAllChapters` is not a function, OR constructor arity mismatch.

- [ ] **Step 4: Update `JobsService` — add DB injection + new method**

Replace the top of `apps/api/src/modules/jobs/jobs.service.ts` so the imports + constructor look like this:

```ts
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  type FetchChapterJobData,
  JOB_FETCH_CHAPTER,
  QUEUE_CRAWLER,
} from '@/modules/queue/queue.constants';
import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@smanga/db';
import type { JobStatus, Queue } from 'bull';
import { sql } from 'drizzle-orm';

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

@Injectable()
export class JobsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  // existing stats() / list() / retry() / retryAllFailed() stay unchanged
  // ...
}
```

(Keep ALL existing methods intact — `stats`, `list`, `retry`, `retryAllFailed`. Only the imports + constructor change.)

Then ADD the new method at the end of the class:

```ts
  /**
   * Enqueue a `fetch-chapter` job for every chapter currently in `crawled`
   * status, so the new parser logic (commit applying \\n\\n between blocks)
   * regenerates the stored prose. Idempotent via `jobId` — calling twice
   * is harmless because Bull skips duplicate-id enqueues in the waiting
   * state. The engine's 0.5 rps token bucket keeps source friendly.
   */
  async refetchAllChapters(): Promise<{ enqueued: number }> {
    const r = await this.db.execute<{ id: string }>(sql`
      SELECT id FROM chapter
      WHERE status = 'crawled'
      ORDER BY updated_at ASC
    `);
    const rows = rowsOf<{ id: string }>(r);
    if (rows.length === 0) return { enqueued: 0 };

    const jobs = rows.map((c) => ({
      name: JOB_FETCH_CHAPTER,
      data: { chapterId: c.id } satisfies FetchChapterJobData,
      opts: {
        jobId: `fetch-chapter-${c.id}`,
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 30_000 },
      },
    }));

    await this.queue.addBulk(jobs);
    return { enqueued: jobs.length };
  }
```

**Important:** `FetchChapterJobData` is defined in `@/modules/queue/queue.constants` as just `{ chapterId: string }` — verify by reading that file once before saving. The processor already loads `story_id`, `source_id`, `external_url` from DB given the chapter id, so we only need to pass `chapterId`.

- [ ] **Step 5: Run service tests to confirm pass**

```bash
pnpm --filter @smanga/api test -- jobs.service
```

Expected: PASS (both new tests + any existing ones).

- [ ] **Step 6: Typecheck full monorepo**

```bash
pnpm typecheck
```

Expected: PASS. (Other consumers of `JobsService` — e.g. the controller below — should not break since we only ADDED a method and a constructor parameter; the parameter is DI-injected so call sites stay identical.)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/jobs/jobs.service.ts apps/api/src/modules/jobs/jobs.service.spec.ts
git commit -m "feat(jobs): refetchAllChapters() — enqueue idempotent fetch-chapter per crawled chapter"
```

Do NOT push.

---

## Task 3: Backend controller endpoint + e2e

**Files:**
- Modify: `apps/api/src/modules/jobs/jobs.controller.ts`
- Modify or create: `apps/api/test/jobs.e2e-spec.ts` (look for an existing one first via `ls apps/api/test/`)

- [ ] **Step 1: Add the controller endpoint**

In `apps/api/src/modules/jobs/jobs.controller.ts`, extend the imports + add the new method below the existing `retryAllFailed`:

```ts
import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
// ... (existing imports unchanged)

@ApiTags('jobs')
@Controller({ path: 'jobs', version: '1' })
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  // ... existing handlers (stats / list / retry / retryAllFailed) unchanged ...

  /**
   * One-click re-crawl of every chapter currently in 'crawled' status.
   * Returns 202 Accepted because the work is asynchronous — the queue
   * drains over hours, not within this request.
   */
  @Post('refetch-all-chapters')
  @HttpCode(202)
  refetchAllChapters() {
    return this.jobs.refetchAllChapters();
  }
}
```

`@UseGuards(JwtAuthGuard)` + `@Roles(['admin'])` are inherited from the class-level decorators — the new method picks them up automatically.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @smanga/api typecheck
```

Expected: PASS.

- [ ] **Step 3: Find or create the e2e file**

```bash
ls apps/api/test/ 2>/dev/null
```

If `jobs.e2e-spec.ts` exists, extend it. If not, create it following the shape of `apps/api/test/seo.e2e-spec.ts` (which already wires up the AppModule + supertest harness from prior work).

- [ ] **Step 4: Add the 3 e2e tests**

Add (or create file with) these tests. Adjust the harness boilerplate to match the existing e2e config:

```ts
import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Jobs refetch-all-chapters (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const m: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = m.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: ['sitemap.xml', 'sitemap-stories.xml', 'sitemap-chapters.xml', 'robots.txt'],
    });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated callers with 401', () => {
    return request(app.getHttpServer())
      .post('/api/v1/jobs/refetch-all-chapters')
      .expect(401);
  });

  // The reader / admin tests need a way to obtain a token. If the e2e
  // harness already has a helper for that (see seo.e2e-spec.ts setup or
  // any auth e2e), use it. Otherwise, gate these two as `it.skip` with
  // a comment explaining the harness work needed, AND still cover them
  // manually in the smoke step (Task 6). Don't invent half-baked auth.

  it.skip('rejects reader role with 403 (needs token helper)', () => {});
  it.skip('accepts admin role with 202 (needs token helper)', () => {});
});
```

If the existing e2e harness DOES support obtaining a reader/admin token (look at neighbor specs to confirm), un-skip the two skipped tests and use the helper.

- [ ] **Step 5: Run e2e + confirm pass (or skip-with-note)**

```bash
pnpm --filter @smanga/api test:e2e -- jobs.e2e
```

Expected: 1 PASS (401 case), 2 SKIPPED. If you wired the token helper, all 3 should PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/jobs/jobs.controller.ts apps/api/test/jobs.e2e-spec.ts
git commit -m "feat(jobs/controller): POST /jobs/refetch-all-chapters (admin-only, 202)"
```

Do NOT push.

---

## Task 4: Frontend API client method

**Files:**
- Modify: `apps/frontend/src/api/jobs.ts`

- [ ] **Step 1: Read the existing file to find the export shape**

```bash
cat apps/frontend/src/api/jobs.ts
```

Likely an object literal `export const jobsApi = { stats, list, retry, retryAllFailed, ... }`. Mirror the existing methods' style.

- [ ] **Step 2: Add the new method**

Add `refetchAllChapters` to the exported object:

```ts
// existing methods unchanged
export const jobsApi = {
  // ...stats, list, retry, retryAllFailed,
  refetchAllChapters: () =>
    api.post<{ enqueued: number }>('/jobs/refetch-all-chapters').then((r) => r.data),
};
```

Exact spelling of `api` import + the path prefix (`/jobs/...` vs `/api/v1/jobs/...`) must match what the existing `retryAllFailed` uses. The Vite proxy + `api.post` baseURL already handles the `/api/v1` prefix.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @smanga/frontend typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/api/jobs.ts
git commit -m "feat(frontend/api/jobs): add refetchAllChapters client"
```

Do NOT push.

---

## Task 5: Frontend button + confirm modal at `/admin/jobs`

**Files:**
- Modify: `apps/frontend/src/routes/admin/jobs.tsx`

- [ ] **Step 1: Inspect the existing bulk-retry button + modal**

Read the file. The bulk-retry button + its confirm modal (commit `e6673e6`) are the template — mirror their shape exactly so the two controls look like siblings.

```bash
grep -nE 'retryAll|confirmOpen|setConfirmOpen|Retry tất cả' apps/frontend/src/routes/admin/jobs.tsx | head -20
```

- [ ] **Step 2: Add state + mutation**

Inside the `AdminJobsPage` component, next to the existing `retryAll` mutation, add:

```tsx
const [refetchOpen, setRefetchOpen] = useState(false);
const refetchAll = useMutation({
  mutationFn: jobsApi.refetchAllChapters,
  onSuccess: (data) => {
    setRefetchOpen(false);
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
    window.alert(
      `Đã enqueue ${data.enqueued.toLocaleString('vi-VN')} chapter để re-crawl. Theo dõi ở tab này.`,
    );
  },
  onError: () => {
    window.alert('Re-crawl thất bại. Xem log api để biết chi tiết.');
  },
});
```

- [ ] **Step 3: Add the button next to "Retry tất cả thất bại"**

Find the existing retry-all button. Add a new button right after it. Use `RefreshCw` from `lucide-react` (already imported in this file from earlier work):

```tsx
<button
  type="button"
  disabled={refetchAll.isPending}
  onClick={() => setRefetchOpen(true)}
  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm border border-border hover:border-fg/40 hover:bg-bg-subtle/60 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
>
  {refetchAll.isPending ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <RefreshCw className="h-4 w-4" />
  )}
  Re-crawl tất cả chapter
</button>
```

If `RefreshCw` isn't yet in the import line, add it. `Loader2` likely already is from the existing retry-all button.

- [ ] **Step 4: Add the confirm modal**

Right after the existing `{confirmOpen && (...)}` block (the bulk-retry modal), add a sibling for `refetchOpen`:

```tsx
{refetchOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-md rounded-xl bg-bg border border-border p-6 shadow-elev">
      <h3 className="font-sans font-semibold text-lg">Re-crawl tất cả chapter?</h3>
      <p className="mt-2 text-sm text-fg-muted">
        Toàn bộ chapter status=crawled sẽ được fetch lại từ source để áp dụng parser
        mới (paragraph spacing). Rate limit 0.5 rps, nội dung cũ sẽ được ghi đè.
        Ước tính ~6 giờ background cho ~10k chapter. Các operation crawl khác có
        thể chậm trong thời gian này.
      </p>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={refetchAll.isPending}
          onClick={() => setRefetchOpen(false)}
          className="inline-flex items-center h-9 px-3 rounded-md text-sm border border-border hover:bg-bg-subtle/60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Hủy
        </button>
        <button
          type="button"
          disabled={refetchAll.isPending}
          onClick={() => refetchAll.mutate()}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {refetchAll.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Xác nhận re-crawl
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @smanga/frontend typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/routes/admin/jobs.tsx
git commit -m "feat(admin/jobs): button + modal to re-crawl all chapters"
```

Do NOT push.

---

## Task 6: Local Playwright MCP verification

**Files:** None modified — verification only.

- [ ] **Step 1: Ensure dev DB + Redis + API + FE are up**

```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E 'smanga-(postgres|redis)'
```

Both should be `Up ... (healthy)`. If not: `pnpm dev:db`.

```bash
curl -sf -o /dev/null -w "API = %{http_code}\n" http://localhost:3010/api/v1/sources
curl -sf -o /dev/null -w "FE  = %{http_code}\n" http://localhost:3000/
```

If API not running, start with PORT=3010 (port 3001 may be OPSWAT-held on dev workstation):

```bash
DATABASE_URL='postgres://smanga:smanga_dev@localhost:5432/smanga' \
REDIS_URL='redis://localhost:6379' \
JWT_SECRET="$(grep JWT_SECRET .env | cut -d= -f2)" \
PORT=3010 pnpm dev:api &
```

If FE not running: `pnpm dev:frontend &`.

- [ ] **Step 2: Parser smoke — verify a crawl produces paragraph-separated text**

This is optional if you trust the unit test from Task 1. If you want a live smoke: use the existing `pnpm crawl <url>` CLI on a single chapter URL and inspect the resulting `chapter.content_text` field after gunzip:

```bash
# pick a known chapter URL from truyenfull (any will do)
pnpm crawl https://truyenfull.today/dau-pha-thuong-khung/chuong-1/
# then query DB:
docker exec smanga-postgres psql -U smanga -d smanga -c \
  "SELECT octet_length(content_text) AS gz_bytes, content_byte_size FROM chapter ORDER BY crawled_at DESC LIMIT 1;"
```

Verify `content_byte_size` is non-trivial AND open the FE chapter page in the browser — paragraphs should be visibly separated now.

- [ ] **Step 3: Playwright MCP — admin button → confirm → enqueue**

Use the Playwright MCP tools:

1. `mcp__playwright__browser_navigate` → `http://localhost:3000/dang-nhap?redirect=/admin/jobs`
2. `mcp__playwright__browser_fill_form` → email `admin@test.com`, password `adminpassword`
3. `mcp__playwright__browser_click` → submit
4. After redirect to `/admin/jobs`, snapshot to find the new "Re-crawl tất cả chapter" button.
5. `mcp__playwright__browser_click` → the new button.
6. Verify the modal appears (snapshot).
7. `mcp__playwright__browser_click` → "Xác nhận re-crawl".
8. `mcp__playwright__browser_evaluate` with expression `() => document.body.innerText` to scrape the alert text confirmation (alerts may not appear in the snapshot — use `browser_handle_dialog` if needed; load schema via ToolSearch first).
9. After the alert, take a screenshot and verify the stat card "Đang chạy + Chờ" jumps to the chapter count.

- [ ] **Step 4: Verify a chapter page renders paragraphs after re-crawl**

After the queue starts draining (a minute or two), open one of the previously fused chapters in the browser. Visually confirm paragraphs are separated.

```bash
# Find a known chapter slug:
docker exec smanga-postgres psql -U smanga -d smanga -c \
  "SELECT s.slug FROM story s JOIN chapter c ON c.story_id = s.id WHERE c.status='crawled' LIMIT 1;"
```

`mcp__playwright__browser_navigate` to `http://localhost:3000/truyen/<slug>/chuong/1` and screenshot.

- [ ] **Step 5: Save screenshots for evidence**

The Playwright screenshots go to `<repo>/*.png` by default (gitignored). Keep them locally as proof.

- [ ] **Step 6: No commit — verification only**

---

## Task 7: Push + monitor CI

This is a controller-driven task (not a subagent). The user authorized push + monitor-loop for this work — same pattern as the report-fix push earlier.

- [ ] **Step 1: Push all commits**

```bash
cd c:/Users/son.cu/opswat/project/smanga
git log --oneline origin/main..HEAD
git push 2>&1 | tail -5
```

- [ ] **Step 2: Poll CI**

Background loop:

```bash
SHA=$(git rev-parse --short HEAD)
node -e "
  const t = require('c:/Users/son.cu/opswat/project/smanga/.mcp.json').mcpServers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  process.env.GH_TOKEN = t;
  const { execSync } = require('child_process');
  const start = Date.now();
  while (Date.now() - start < 360_000) {
    try {
      const out = execSync('gh run list --repo SUN-0207/SManga --branch main --limit 4 --json databaseId,name,status,conclusion,headSha', { env: process.env }).toString();
      const runs = JSON.parse(out).filter(r => r.headSha.startsWith('$SHA') && r.name === 'CI');
      if (runs.length && runs[0].status === 'completed') {
        console.log('CI:', runs[0].conclusion, 'run', runs[0].databaseId);
        process.exit(0);
      } else if (runs.length) {
        console.log('still', runs[0].status);
      }
    } catch (e) { console.log('err', e.message.slice(0, 100)); }
    require('child_process').execSync('sleep 15');
  }
"
```

- [ ] **Step 3: If CI fails, diagnose + fix + push + repeat**

Same loop as the previous CI iteration that hit biome lint / format issues — pull failed logs via `gh run view --log-failed`, fix in repo, commit, push, monitor again. Continue until conclusion is `success`.

- [ ] **Step 4: After CI green, no commit needed**

CI green is the terminal state for this plan.

---

## Self-review checklist (verified before saving)

**Spec coverage:**
- ✅ Parser `\n\n` fix → Task 1
- ✅ Admin button + modal → Task 5
- ✅ Backend endpoint + idempotency → Tasks 2 + 3
- ✅ DB query filter `status='crawled'` → Task 2 Step 4 SQL
- ✅ `jobId: fetch-chapter-<id>` idempotency → Task 2 Step 4
- ✅ Unit tests (parser, service) → Tasks 1, 2
- ✅ E2E test (endpoint guard) → Task 3
- ✅ Manual verification (Playwright) → Task 6
- ✅ Push + monitor CI → Task 7

**Placeholder scan:** No "TBD/TODO/handle edge cases/implement later" — every step has concrete code or commands.

**Type consistency:**
- `FetchChapterJobData = { chapterId: string }` — used consistently in Task 2 (data shape) and consumed unchanged by the existing processor.
- `JobsService` constructor: `(db: Database, queue: Queue)` — Task 2 Step 4 establishes the order; Task 2 Step 2 test invocations match it.
- Endpoint path `/jobs/refetch-all-chapters` (no leading `/api/v1` because that's a global prefix) — Task 3 controller, Task 4 FE client, Task 6 Playwright all use the right form for their layer.

**Risk acknowledgments:**

1. **`FetchChapterJobData` shape** — spec drafted it with `{ chapterId, storyId, sourceId, externalUrl }`. Reading the actual `queue.constants.ts` revealed it's only `{ chapterId }` — processor loads the rest from DB. Plan reflects the real shape.

2. **`addBulk` jobId collision with FAILED-state jobs** — Bull may skip duplicate ids in failed state. Task 2 code doesn't handle that; Task 6 verification will surface it if it happens (the count in the modal alert vs the actual Bull queue counter would differ noticeably). Spec Risk #4 already names this; if it bites in production, follow-up commit can `await queue.removeJobs(...)` before `addBulk`.

3. **E2E auth-token helper** — Task 3 ships with two `.skip`'d tests because the existing e2e harness (`seo.e2e-spec.ts`) uses a `FakeDbModule` mock and doesn't appear to wire a real auth flow. The 401 test still gives a guard signal; the role tests are best verified manually in Task 6.
