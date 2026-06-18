# Issue Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Logged-in readers submit categorized issue reports (optionally attached to a story/chapter); admins triage them on `/admin/reports` through a status lifecycle, with an open-count badge on the admin nav.

**Architecture:** New `report` table + 2 enums + migration (Drizzle). New NestJS `reports` module: a login-gated reader `POST /reports` (rate-limited) and admin `GET/PATCH` endpoints. Frontend: a `ReportIssueDialog` reached from the avatar menu + the chapter reader, and an `/admin/reports` admin page with a nav badge. Reuses existing patterns (app-settings module, stories admin list, settings.tsx forms, Pagination, NotificationBell polling).

**Tech Stack:** Drizzle/Postgres, NestJS 11 + class-validator, `@nestjs/throttler`, Vite + React 19 + TanStack Query/Router, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-17-issue-reporting-design.md`

## Global Constraints

- **Reader submit is login-gated** (`JwtAuthGuard`) and **rate-limited**; admin endpoints are `@Roles(['admin'])`-guarded.
- **`message` validated 5–2000 chars**; `category` ∈ enum; `storyId`/`chapterId` optional UUIDs.
- **Status lifecycle:** `open` → `in_progress` → `resolved` | `dismissed`. Terminal transitions stamp `resolved_by_user_id` + `resolved_at`; returning to a non-terminal status clears them.
- **Schema via Drizzle** `.ts` files; cross-schema imports use `.ts` extensions (CLAUDE.md #1); append `'./src/schema/report.ts'` to the `drizzle.config.ts` `schema:` array (#2); generate the migration with `drizzle-kit` (no hand-written SQL unless drizzle can't express it).
- **English-only identifiers/types/filenames**; Vietnamese only in JSX copy + URL slugs.
- **Commit only the files each task lists** (explicit `git add`; never `git add -A`; **never** stage `apps/frontend/vite.config.ts`). Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push without explicit instruction. lefthook pre-commit runs biome + `pnpm -r typecheck`.
- **Local dev:** Postgres + Redis up; API on `PORT=3010`; `$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"` for migrate.

---

## Task 1: Schema + migration (report table + enums)

**Files:**
- Modify: `packages/db/src/schema/enums.ts`
- Create: `packages/db/src/schema/report.ts`
- Modify: `packages/db/drizzle.config.ts`
- Create (generated): `packages/db/src/migrations/00NN_*.sql` (+ journal/snapshot)

**Interfaces — Produces:** `report` table + `reportCategoryEnum`, `reportStatusEnum`; types `Report`, `NewReport`.

- [ ] **Step 1: Add enums in `packages/db/src/schema/enums.ts`**

Append:
```ts
export const reportCategoryEnum = pgEnum('report_category', [
  'content',
  'comment',
  'technical',
  'other',
]);

export const reportStatusEnum = pgEnum('report_status', [
  'open',
  'in_progress',
  'resolved',
  'dismissed',
]);
```

- [ ] **Step 2: Create `packages/db/src/schema/report.ts`**

```ts
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
// Internal cross-schema imports MUST use .ts extensions (CLAUDE.md workaround #1)
import { user } from './auth.ts';
import { chapter } from './chapter.ts';
import { reportCategoryEnum, reportStatusEnum } from './enums.ts';
import { story } from './story.ts';

export const report = pgTable(
  'report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    category: reportCategoryEnum('category').notNull(),
    message: text('message').notNull(),
    storyId: uuid('story_id').references(() => story.id, { onDelete: 'set null' }),
    chapterId: uuid('chapter_id').references(() => chapter.id, { onDelete: 'set null' }),
    status: reportStatusEnum('status').notNull().default('open'),
    adminNote: text('admin_note'),
    resolvedByUserId: text('resolved_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Serves the admin list (status filter + newest-first) and the open-count badge.
    statusCreatedIdx: index('report_status_created_idx').on(t.status, t.createdAt.desc()),
    userIdx: index('report_user_idx').on(t.userId),
  }),
);

export type Report = typeof report.$inferSelect;
export type NewReport = typeof report.$inferInsert;
```

- [ ] **Step 3: Register the schema file in `packages/db/drizzle.config.ts`**

Append `'./src/schema/report.ts',` to the `schema:` array (after `'./src/schema/job-failure.ts'`).

- [ ] **Step 4: Generate the migration**

`pnpm --filter @smanga/db generate` — note the new `00NN_*.sql`. Confirm it creates the two enums + the `report` table + both indexes.

- [ ] **Step 5: Apply + verify**

```powershell
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm --filter @smanga/db migrate
pnpm --filter @smanga/db typecheck
docker exec smanga-postgres psql -U smanga -d smanga -c "\d report"
```
If the dev DB's `drizzle.__drizzle_migrations` is behind the journal and `migrate` errors with "already exists", sync it by inserting the missing migration hashes (local-only fix — the committed migration is the deliverable). `\d report` must show all columns + the two indexes. Paste the output into the report.

- [ ] **Step 6: Commit**

```powershell
git add packages/db/src/schema/enums.ts packages/db/src/schema/report.ts packages/db/drizzle.config.ts packages/db/src/migrations
git commit -m "feat(db): report table + category/status enums

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Reports API module (reader submit + admin triage)

**Files:**
- Create: `apps/api/src/modules/reports/dto/create-report.dto.ts`
- Create: `apps/api/src/modules/reports/dto/list-reports.dto.ts`
- Create: `apps/api/src/modules/reports/dto/update-report.dto.ts`
- Create: `apps/api/src/modules/reports/reports.service.ts`
- Create: `apps/api/src/modules/reports/reports.controller.ts` (reader `POST /reports`)
- Create: `apps/api/src/modules/reports/admin-reports.controller.ts` (admin GET/PATCH)
- Create: `apps/api/src/modules/reports/reports.module.ts`
- Create: `apps/api/src/modules/reports/reports.service.spec.ts`
- Modify: `apps/api/src/app.module.ts` (register `ReportsModule`)

**Interfaces — Produces:**
- `ReportsService.create(userId: string, dto: CreateReportDto): Promise<{ id: string }>`
- `ReportsService.listForAdmin(dto: ListReportsDto): Promise<{ items: AdminReportItem[]; total: number; page: number; limit: number }>`
- `ReportsService.getOpenCount(): Promise<{ openCount: number }>`
- `ReportsService.updateStatus(id: string, dto: UpdateReportDto, adminUserId: string): Promise<Report>`
- Routes: `POST /api/v1/reports`; `GET /api/v1/admin/reports`; `GET /api/v1/admin/reports/open-count`; `PATCH /api/v1/admin/reports/:id`.

- [ ] **Step 1: DTOs**

`create-report.dto.ts`:
```ts
import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export const REPORT_CATEGORIES = ['content', 'comment', 'technical', 'other'] as const;

export class CreateReportDto {
  @IsEnum(REPORT_CATEGORIES)
  category!: (typeof REPORT_CATEGORIES)[number];

  @IsString()
  @Length(5, 2000)
  message!: string;

  @IsOptional()
  @IsUUID()
  storyId?: string;

  @IsOptional()
  @IsUUID()
  chapterId?: string;
}
```

`update-report.dto.ts`:
```ts
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export const REPORT_STATUSES = ['open', 'in_progress', 'resolved', 'dismissed'] as const;

export class UpdateReportDto {
  @IsOptional()
  @IsEnum(REPORT_STATUSES)
  status?: (typeof REPORT_STATUSES)[number];

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  adminNote?: string;
}
```

`list-reports.dto.ts`:
```ts
import { IsEnum, IsOptional } from 'class-validator';
import { REPORT_CATEGORIES } from './create-report.dto';
import { REPORT_STATUSES } from './update-report.dto';

export class ListReportsDto {
  @IsOptional()
  @IsEnum(REPORT_STATUSES)
  status?: (typeof REPORT_STATUSES)[number];

  @IsOptional()
  @IsEnum(REPORT_CATEGORIES)
  category?: (typeof REPORT_CATEGORIES)[number];

  // page/limit parsed/clamped in the controller (mirror the stories admin list).
}
```

- [ ] **Step 2: Service `reports.service.ts`**

Mirror the DI + style of `app-settings.service.ts` (constructor `@Inject(DRIZZLE) private readonly db: Database`). Use the Drizzle query builder for the admin list (leftJoin user/story/chapter). Match the paginated response SHAPE used by the stories admin list — **read `apps/api/src/modules/stories/stories.service.ts` for the exact `{ items, total, page, limit }` (or equivalent) shape and reuse it**. Core logic:

```ts
import { DRIZZLE } from '@/modules/db/db.provider';
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { chapter, report, story, user } from '@smanga/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { CreateReportDto } from './dto/create-report.dto';
import type { ListReportsDto } from './dto/list-reports.dto';
import type { UpdateReportDto } from './dto/update-report.dto';

const TERMINAL = new Set(['resolved', 'dismissed']);

@Injectable()
export class ReportsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async create(userId: string, dto: CreateReportDto): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(report)
      .values({
        userId,
        category: dto.category,
        message: dto.message,
        storyId: dto.storyId ?? null,
        chapterId: dto.chapterId ?? null,
      })
      .returning({ id: report.id });
    return { id: row!.id };
  }

  async getOpenCount(): Promise<{ openCount: number }> {
    const [r] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(report)
      .where(eq(report.status, 'open'));
    return { openCount: r?.c ?? 0 };
  }

  async listForAdmin(dto: ListReportsDto & { page: number; limit: number }) {
    const conds = [];
    if (dto.status) conds.push(eq(report.status, dto.status));
    if (dto.category) conds.push(eq(report.category, dto.category));
    const where = conds.length ? and(...conds) : undefined;

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(report)
      .where(where);

    const items = await this.db
      .select({
        id: report.id,
        category: report.category,
        message: report.message,
        status: report.status,
        adminNote: report.adminNote,
        createdAt: report.createdAt,
        resolvedAt: report.resolvedAt,
        reporterName: user.name,
        reporterEmail: user.email,
        storySlug: story.slug,
        storyTitle: story.title,
        chapterIndex: chapter.index,
      })
      .from(report)
      .leftJoin(user, eq(user.id, report.userId))
      .leftJoin(story, eq(story.id, report.storyId))
      .leftJoin(chapter, eq(chapter.id, report.chapterId))
      .where(where)
      .orderBy(desc(report.createdAt))
      .limit(dto.limit)
      .offset((dto.page - 1) * dto.limit);

    return { items, total, page: dto.page, limit: dto.limit };
  }

  async updateStatus(id: string, dto: UpdateReportDto, adminUserId: string) {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.adminNote !== undefined) patch.adminNote = dto.adminNote;
    if (dto.status !== undefined) {
      patch.status = dto.status;
      if (TERMINAL.has(dto.status)) {
        patch.resolvedByUserId = adminUserId;
        patch.resolvedAt = new Date();
      } else {
        patch.resolvedByUserId = null;
        patch.resolvedAt = null;
      }
    }
    const [updated] = await this.db
      .update(report)
      .set(patch)
      .where(eq(report.id, id))
      .returning();
    return updated;
  }
}
```
(Export an `AdminReportItem` type = the `items` element shape for the controller/frontend.)

- [ ] **Step 3: Reader controller `reports.controller.ts`**

`POST /reports`, login-gated + rate-limited. Mirror `notifications.controller.ts` for the `@CurrentUser()` + guard usage; apply a tighter throttle (`@Throttle({ default: { limit: 5, ttl: 60_000 } })` from `@nestjs/throttler`) — confirm the throttler guard is active (see `RealIpThrottlerGuard` / `app.module.ts`):
```ts
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller({ path: 'reports', version: '1' })
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateReportDto) {
    return this.svc.create(user.id, dto);
  }
}
```

- [ ] **Step 4: Admin controller `admin-reports.controller.ts`**

Mirror `auto-retry.controller.ts` (JwtAuthGuard + `@Roles(['admin'])`). Parse/clamp page+limit like the stories admin controller:
```ts
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ListReportsDto } from './dto/list-reports.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { ReportsService } from './reports.service';

@ApiTags('admin/reports')
@Controller({ path: 'admin/reports', version: '1' })
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
export class AdminReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('open-count')
  openCount() {
    return this.svc.getOpenCount();
  }

  @Get()
  list(@Query() dto: ListReportsDto, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.svc.listForAdmin({
      ...dto,
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(100, Math.max(1, Number(limit) || 20)),
    });
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateReportDto,
  ) {
    return this.svc.updateStatus(id, dto, user.id);
  }
}
```
(Order matters: declare `open-count` before nothing conflicts; `:id` is on PATCH only, so no clash with the GET `open-count`.)

- [ ] **Step 5: Module `reports.module.ts` + register in `app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AdminReportsController } from './admin-reports.controller';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
```
Add `import { ReportsModule } from './modules/reports/reports.module';` and append `ReportsModule,` to the `imports` array in `app.module.ts`.

- [ ] **Step 6: Unit tests `reports.service.spec.ts`**

Mirror `auto-retry.spec.ts` mock style. Cover: `create` inserts with the right values + returns id; `getOpenCount` reads the count; `updateStatus` to `'resolved'` sets `resolvedByUserId` + `resolvedAt`; `updateStatus` to `'in_progress'` clears them. (The joined `listForAdmin` query is exercised in the Task 5 e2e proof — same precedent as `listNotifications`.) Example shape:
```ts
import { describe, expect, it, vi } from 'vitest';
import { ReportsService } from './reports.service';

function insertReturning(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const values = vi.fn(() => ({ returning }));
  return { insert: vi.fn(() => ({ values })), values };
}
function updateReturning(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  return { update: vi.fn(() => ({ set })), set };
}

describe('ReportsService', () => {
  it('create inserts and returns the id', async () => {
    const { insert, values } = insertReturning([{ id: 'r1' }]);
    const svc = new ReportsService({ insert } as never);
    const res = await svc.create('u1', { category: 'content', message: 'hello there' } as never);
    expect(res).toEqual({ id: 'r1' });
    expect((values.mock.calls[0]![0] as Record<string, unknown>)).toMatchObject({
      userId: 'u1', category: 'content', message: 'hello there', storyId: null, chapterId: null,
    });
  });

  it('updateStatus to resolved stamps resolvedBy + resolvedAt', async () => {
    const { update, set } = updateReturning([{ id: 'r1', status: 'resolved' }]);
    const svc = new ReportsService({ update } as never);
    await svc.updateStatus('r1', { status: 'resolved' } as never, 'admin1');
    const patch = set.mock.calls[0]![0] as Record<string, unknown>;
    expect(patch.status).toBe('resolved');
    expect(patch.resolvedByUserId).toBe('admin1');
    expect(patch.resolvedAt).toBeInstanceOf(Date);
  });

  it('updateStatus to in_progress clears resolvedBy + resolvedAt', async () => {
    const { update, set } = updateReturning([{ id: 'r1', status: 'in_progress' }]);
    const svc = new ReportsService({ update } as never);
    await svc.updateStatus('r1', { status: 'in_progress' } as never, 'admin1');
    const patch = set.mock.calls[0]![0] as Record<string, unknown>;
    expect(patch.resolvedByUserId).toBeNull();
    expect(patch.resolvedAt).toBeNull();
  });
});
```
(For `getOpenCount`, mock `db.select` chain returning `[{ c: 3 }]` and assert `{ openCount: 3 }`.)

- [ ] **Step 7: Verify + commit**

`pnpm --filter @smanga/api test -- reports` (expect green) and `pnpm --filter @smanga/api typecheck`. Commit the 8 new files + `app.module.ts`:
```powershell
git add apps/api/src/modules/reports apps/api/src/app.module.ts
git commit -m "feat(api): reports module — reader submit + admin triage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Frontend — reader report dialog + entry points

**Files:**
- Create: `apps/frontend/src/api/reports.ts`
- Create: `apps/frontend/src/components/reports/ReportIssueDialog.tsx`
- Modify: `apps/frontend/src/components/reader/AvatarMenu.tsx` (general "Báo lỗi" entry)
- Modify: `apps/frontend/src/components/reader/ReaderHeader.tsx` (chapter-context "Báo lỗi chương này" entry)

**Interfaces — Consumes:** `POST /reports` from Task 2. **Produces:** `submitReport(body)` client; `<ReportIssueDialog>` (controlled `open`/`onOpenChange`, optional `defaultCategory`, `storyId`, `chapterId`, context label).

- [ ] **Step 1: API client `apps/frontend/src/api/reports.ts`**
```ts
import { api } from '@/lib/api-client';

export type ReportCategory = 'content' | 'comment' | 'technical' | 'other';

export interface CreateReportBody {
  category: ReportCategory;
  message: string;
  storyId?: string;
  chapterId?: string;
}

export async function submitReport(body: CreateReportBody): Promise<{ id: string }> {
  const { data } = await api.post<{ id: string }>('/reports', body);
  return data;
}
```

- [ ] **Step 2: `ReportIssueDialog.tsx`**

A controlled modal. Mirror an existing modal/overlay in the codebase for structure + the semantic Tailwind tokens (search for an existing dialog, e.g. reader-settings drawer or any `role="dialog"`); reuse `useMutation` for submit. Requirements:
- Props: `{ open: boolean; onOpenChange: (v: boolean) => void; defaultCategory?: ReportCategory; storyId?: string; chapterId?: string; contextLabel?: string }`.
- Category `<select>` (options: Lỗi nội dung chương / Bình luận xấu / Lỗi kỹ thuật / Khác → `content|comment|technical|other`), defaulting to `defaultCategory ?? 'other'`.
- `<textarea>` for `message` with a live char counter; submit disabled unless `message.trim().length` is 5–2000 and not pending.
- When `contextLabel` is set, show a read-only "Liên quan: {contextLabel}" line.
- On submit → `submitReport({ category, message, storyId, chapterId })`; on success show a "Đã gửi" state then close; on error show the message (mirror the error-extraction pattern in `settings.tsx`).
- Vietnamese copy; English identifiers; `cursor-pointer`, focus rings, `prefers-reduced-motion`-safe transitions; no `border-<token>/<opacity>` (solid tokens).

- [ ] **Step 3: Avatar-menu entry (general)**

In `AvatarMenu.tsx`, add a "Báo lỗi" menu item (logged-in only) that opens `<ReportIssueDialog>` with no story/chapter context (general). Manage `open` state locally; render the dialog within the menu component. Match the existing menu-item styling.

- [ ] **Step 4: Reader entry (chapter context)**

In `ReaderHeader.tsx`, add a "Báo lỗi chương này" action (button or settings-drawer item) that opens `<ReportIssueDialog>` with `defaultCategory='content'`, the current `storyId` + `chapterId`, and `contextLabel` = the story title + chapter (the data the reader already has). Read the file first to use the props/context already available there.

- [ ] **Step 5: Verify + commit**
```powershell
pnpm --filter @smanga/frontend typecheck
pnpm exec biome check --write apps/frontend/src/api/reports.ts apps/frontend/src/components/reports/ReportIssueDialog.tsx apps/frontend/src/components/reader/AvatarMenu.tsx apps/frontend/src/components/reader/ReaderHeader.tsx
git add apps/frontend/src/api/reports.ts apps/frontend/src/components/reports/ReportIssueDialog.tsx apps/frontend/src/components/reader/AvatarMenu.tsx apps/frontend/src/components/reader/ReaderHeader.tsx
git commit -m "feat(frontend): report-issue dialog + reader entry points

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Frontend — admin reports page + nav badge

**Files:**
- Modify: `apps/frontend/src/api/reports.ts` (add admin client fns)
- Create: `apps/frontend/src/routes/admin/reports.tsx`
- Modify: `apps/frontend/src/routes/admin/route.tsx` (nav link + open-count badge)

**Interfaces — Consumes:** `GET /admin/reports`, `GET /admin/reports/open-count`, `PATCH /admin/reports/:id`.

- [ ] **Step 1: Admin API client (append to `apps/frontend/src/api/reports.ts`)**
```ts
export type ReportStatus = 'open' | 'in_progress' | 'resolved' | 'dismissed';

export interface AdminReport {
  id: string;
  category: ReportCategory;
  message: string;
  status: ReportStatus;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  storySlug: string | null;
  storyTitle: string | null;
  chapterIndex: string | null;
}

export interface AdminReportsPage {
  items: AdminReport[];
  total: number;
  page: number;
  limit: number;
}

export async function getAdminReports(params: {
  status?: ReportStatus;
  category?: ReportCategory;
  page?: number;
  limit?: number;
}): Promise<AdminReportsPage> {
  const { data } = await api.get<AdminReportsPage>('/admin/reports', { params });
  return data;
}

export async function getReportsOpenCount(): Promise<{ openCount: number }> {
  const { data } = await api.get<{ openCount: number }>('/admin/reports/open-count');
  return data;
}

export async function updateReport(
  id: string,
  patch: { status?: ReportStatus; adminNote?: string },
): Promise<AdminReport> {
  const { data } = await api.patch<AdminReport>(`/admin/reports/${id}`, patch);
  return data;
}
```
(Match the field shape to Task 2's `AdminReportItem`; if the backend returns the shape, mirror exactly.)

- [ ] **Step 2: `routes/admin/reports.tsx`**

Mirror `routes/admin/stories/index.tsx` (or `users.tsx`) for the table + the existing `Pagination` component, and `settings.tsx` for the mutation/error patterns. Requirements:
- `useQuery(['admin','reports',{status,category,page}], () => getAdminReports(...))`.
- Status filter + category filter controls (chips or selects); a Pagination control.
- Table columns: created time (`toLocaleString('vi-VN')`), reporter (name/email), category chip, message (line-clamped preview), context (link to `/truyen/{storySlug}` or `/truyen/{storySlug}/chuong/{chapterIndex}` when present), status badge.
- Row action: a select to change status + a small note field, saved via `updateReport` (`useMutation`, invalidate the list + the open-count query on success). Status badge colors per status.
- Vietnamese copy; English identifiers; solid border tokens.
- Route is already admin-guarded by the `admin/route.tsx` layout (mirror how `users.tsx`/`settings.tsx` declare their `createFileRoute`).

- [ ] **Step 3: Nav link + open-count badge in `routes/admin/route.tsx`**

Read `route.tsx` first to see how the existing admin nav items (Stories, Jobs, Settings, Users…) are declared. Add a **"Báo lỗi"** link to `/admin/reports`, with a badge showing the open count from `getReportsOpenCount()` (a `useQuery(['admin','reports','open-count'])`, refetch on an interval or on navigation — mirror the `NotificationBell` polling cadence if a live count is wanted, else fetch on mount). Badge hidden when count is 0.

- [ ] **Step 4: Verify + commit**
```powershell
pnpm --filter @smanga/frontend typecheck
pnpm exec biome check --write apps/frontend/src/api/reports.ts apps/frontend/src/routes/admin/reports.tsx apps/frontend/src/routes/admin/route.tsx
git add apps/frontend/src/api/reports.ts apps/frontend/src/routes/admin/reports.tsx apps/frontend/src/routes/admin/route.tsx
git commit -m "feat(frontend): admin reports page + open-count nav badge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
(Note: `routeTree.gen.ts` is auto-generated by the dev server / build — do not hand-edit; if it regenerates as part of typecheck, that's expected and should NOT be committed unless the project already tracks it. Confirm against `.gitignore`.)

---

## Task 5: End-to-end verification (controller-run, Playwright MCP)

**Context:** Controller-only — needs the running stack (frontend :3000, API :3010, Postgres, Redis) + Playwright MCP. Validates the real flow + the SQL.

- [ ] **Step 1:** Confirm the API (:3010) restarted with the new module — `curl http://localhost:3010/api/v1/admin/reports/open-count` returns 403 (guarded, exists) not 404; `POST /api/v1/reports` unauthenticated returns 401/403.
- [ ] **Step 2:** Transactional psql proof (rolled back): insert a `report` for a real user+story+chapter, run the admin `listForAdmin` SELECT (verify joins resolve reporter/story/chapter), run the open-count query, run the `updateStatus`→'resolved' UPDATE and verify `resolved_at`/`resolved_by_user_id` set. ROLLBACK; confirm no residue.
- [ ] **Step 3:** Browser (if stack up): log in as a reader, open the report dialog from the avatar menu + the "Báo lỗi chương này" action, submit one report; log in as admin, open `/admin/reports`, confirm it appears with context, change its status, confirm the nav badge decrements. Screenshot.
- [ ] **Step 4:** `graphify update .`. Summarize evidence. Do NOT push without explicit instruction.

---

## Self-Review

**Spec coverage:** unified report + category → Task 1 enums + Task 2 DTO ✓; login-only + rate-limited → Task 2 Step 3 ✓; story/chapter context → Task 1 columns + Task 2 create + Task 3 dialog ✓; admin list + filters + status lifecycle → Task 2 service/controller + Task 4 page ✓; terminal stamping → Task 2 `updateStatus` ✓; open-count badge → Task 2 `getOpenCount` + Task 4 nav ✓; boundaries (admin-guarded, validation, Drizzle, English ids) → Global Constraints + per-task ✓; acceptance criteria 1–6 → Tasks 2–5 ✓.

**Placeholder scan:** none — backend code complete; frontend tasks give shape + key snippets + exact mirror-targets (no "TODO"). The `00NN` migration number is drizzle-assigned (Step 4 notes it).

**Type consistency:** `AdminReportItem`/`AdminReport` fields match between Task 2 service select, Task 4 client, and the table; `ReportCategory`/`ReportStatus` unions match the enums + DTOs; `updateStatus` terminal set = {resolved, dismissed} consistent across service + acceptance criteria; route paths (`/reports`, `/admin/reports`, `/admin/reports/open-count`, `/admin/reports/:id`) consistent across controller + client.
