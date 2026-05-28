# SManga Search + User Features Implementation Plan (Plan 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Prerequisites:** Plan 4 (NestJS + Vite/React rework) MUST be complete. This plan assumes the architecture at `apps/api` + `apps/frontend`.

**Goal:** Add full-text search via `pg_trgm + immutable_unaccent` (matches `naruto` → `Narutō`, `tien hiep` → `tiên hiệp`), plus authenticated reader features: bookmark, reading progress ("đọc tiếp"). The `/tu-sach` page lets a signed-in reader browse their bookmarks and resume reading where they left off.

**Architecture:** Backend gets two new modules (`search`, `user-data`). Frontend gets a `/tim-kiem` route, a "bookmark toggle" button on story detail, a "đọc tiếp" CTA on the landing for signed-in users, and a `/tu-sach` shelf. Reading progress posts are debounced 5s and only fire from the chapter reader. No new tables — Plan 1 already migrated `bookmark` and `reading_progress`. The GIN index on `immutable_unaccent(lower(story.title || ' ' || coalesce(story.author, '')))` is also already in place from Plan 1.

**Tech Stack:** Plan 4 stack — NestJS 11, Drizzle, TanStack Query + TanStack Router + Zustand on the frontend. No new dependencies.

---

## File structure (locked in before tasks)

```
apps/api/src/modules/
  search/
    search.module.ts
    search.service.ts                 query builders for stories + genres
    search.controller.ts              GET /api/v1/search?q=...&genre=...&status=...
    dto/search-query.dto.ts
  user-data/
    user-data.module.ts
    bookmarks.service.ts              CRUD + list
    bookmarks.controller.ts           GET/POST/DELETE /api/v1/me/bookmarks
    reading-progress.service.ts       UPSERT + list
    reading-progress.controller.ts    PUT /api/v1/me/reading-progress
    dto/*.dto.ts

apps/frontend/src/
  api/
    search.ts
    bookmarks.ts
    reading-progress.ts
  hooks/
    use-search.ts
    use-bookmarks.ts
    use-reading-progress.ts
  routes/
    tim-kiem.tsx                      Search results page
    tu-sach.tsx                       Authenticated reader shelf
  components/reader/
    BookmarkToggle.tsx                Heart button on story detail
    ContinueReadingCta.tsx            "Tiếp tục Chương N" pill on cards
    ReadingProgressTracker.tsx        Debounced PUT from chapter reader
```

---

### Task 1: Backend search module

**Files:** under `apps/api/src/modules/search/`.

- [ ] **Step 1: `dto/search-query.dto.ts`**

```typescript
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  q!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  genre?: string;

  @IsOptional()
  @IsIn(['ongoing', 'completed', 'dropped', 'unknown'])
  status?: 'ongoing' | 'completed' | 'dropped' | 'unknown';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 24;
}
```

- [ ] **Step 2: `search.service.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { genre, story, storyGenre } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import type { SearchQueryDto } from './dto/search-query.dto';

@Injectable()
export class SearchService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async search(q: SearchQueryDto) {
    const term = q.q.trim();
    const conditions = [
      sql`immutable_unaccent(lower(${story.title} || ' ' || coalesce(${story.author}, '')))
          ILIKE '%' || immutable_unaccent(lower(${term})) || '%'`,
    ];
    if (q.status) conditions.push(eq(story.status, q.status));

    let qb = this.db
      .select({
        id: story.id,
        slug: story.slug,
        title: story.title,
        author: story.author,
        status: story.status,
        totalChapters: story.totalChapters,
        hasCover: sql<boolean>`${story.cover} IS NOT NULL`,
        rank: sql<number>`similarity(immutable_unaccent(lower(${story.title})), immutable_unaccent(lower(${term})))`,
      })
      .from(story);

    if (q.genre) {
      qb = qb
        .innerJoin(storyGenre, eq(storyGenre.storyId, story.id))
        .innerJoin(genre, and(eq(genre.id, storyGenre.genreId), eq(genre.slug, q.genre))) as unknown as typeof qb;
    }

    const limit = q.limit ?? 24;
    const page = q.page ?? 1;
    const rows = await qb
      .where(and(...conditions))
      .orderBy(desc(sql`rank`), desc(story.updatedAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return { items: rows, page, limit };
  }
}
```

- [ ] **Step 3: `search.controller.ts`**

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';

@ApiTags('search')
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  query(@Query() q: SearchQueryDto) {
    return this.search.search(q);
  }
}
```

- [ ] **Step 4: `search.module.ts`** + register in `app.module.ts`.

```typescript
import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
```

- [ ] **Step 5: Smoke**

```powershell
curl.exe "http://localhost:3001/api/v1/search?q=tien+hiep"
# expected: items array, ranked by similarity to "tien hiep" (matches "Tiên Hiệp" via unaccent)
```

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat(api/search): pg_trgm + unaccent search endpoint with genre/status filter"
```

---

### Task 2: Backend bookmarks module

**Files:** under `apps/api/src/modules/user-data/`.

- [ ] **Step 1: DTOs**

`dto/bookmark.dto.ts`:

```typescript
import { IsUUID } from 'class-validator';

export class BookmarkDto {
  @IsUUID()
  storyId!: string;
}
```

- [ ] **Step 2: `bookmarks.service.ts`**

```typescript
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { bookmark, story } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';

@Injectable()
export class BookmarksService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(userId: string) {
    return this.db
      .select({
        storyId: bookmark.storyId,
        createdAt: bookmark.createdAt,
        slug: story.slug,
        title: story.title,
        author: story.author,
        status: story.status,
        totalChapters: story.totalChapters,
      })
      .from(bookmark)
      .innerJoin(story, eq(story.id, bookmark.storyId))
      .where(eq(bookmark.userId, userId))
      .orderBy(desc(bookmark.createdAt));
  }

  async add(userId: string, storyId: string) {
    await this.db
      .insert(bookmark)
      .values({ userId, storyId })
      .onConflictDoNothing();
    return { ok: true };
  }

  async remove(userId: string, storyId: string) {
    await this.db.delete(bookmark).where(and(eq(bookmark.userId, userId), eq(bookmark.storyId, storyId)));
    return { ok: true };
  }

  async has(userId: string, storyId: string) {
    const [row] = await this.db
      .select({ storyId: bookmark.storyId })
      .from(bookmark)
      .where(and(eq(bookmark.userId, userId), eq(bookmark.storyId, storyId)))
      .limit(1);
    return { bookmarked: !!row };
  }
}
```

- [ ] **Step 3: `bookmarks.controller.ts`**

```typescript
import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BookmarksService } from './bookmarks.service';
import { BookmarkDto } from './dto/bookmark.dto';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('bookmarks')
@Controller({ path: 'me/bookmarks', version: '1' })
@UseGuards(JwtAuthGuard)
export class BookmarksController {
  constructor(private readonly svc: BookmarksService) {}

  @Get()
  list(@CurrentUser() u: { id: string }) {
    return this.svc.list(u.id);
  }

  @Get(':storyId')
  has(@CurrentUser() u: { id: string }, @Param('storyId') storyId: string) {
    return this.svc.has(u.id, storyId);
  }

  @Post()
  add(@CurrentUser() u: { id: string }, @Body() dto: BookmarkDto) {
    return this.svc.add(u.id, dto.storyId);
  }

  @Delete(':storyId')
  remove(@CurrentUser() u: { id: string }, @Param('storyId') storyId: string) {
    return this.svc.remove(u.id, storyId);
  }
}
```

- [ ] **Step 4: Commit (Tasks 2+3 share a module — commit after Task 3)**

---

### Task 3: Backend reading-progress module

- [ ] **Step 1: DTO `dto/reading-progress.dto.ts`**

```typescript
import { IsNumber, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReadingProgressDto {
  @IsUUID()
  storyId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  chapterIndex!: number;
}
```

- [ ] **Step 2: `reading-progress.service.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { chapter, readingProgress, story } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';

@Injectable()
export class ReadingProgressService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async upsert(userId: string, storyId: string, chapterIndex: number) {
    await this.db
      .insert(readingProgress)
      .values({ userId, storyId, chapterIndex: String(chapterIndex), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [readingProgress.userId, readingProgress.storyId],
        set: { chapterIndex: String(chapterIndex), updatedAt: new Date() },
      });
    return { ok: true };
  }

  async list(userId: string) {
    return this.db
      .select({
        storyId: readingProgress.storyId,
        chapterIndex: readingProgress.chapterIndex,
        updatedAt: readingProgress.updatedAt,
        slug: story.slug,
        title: story.title,
        author: story.author,
        totalChapters: story.totalChapters,
      })
      .from(readingProgress)
      .innerJoin(story, eq(story.id, readingProgress.storyId))
      .where(eq(readingProgress.userId, userId))
      .orderBy(desc(readingProgress.updatedAt));
  }
}
```

- [ ] **Step 3: `reading-progress.controller.ts`**

```typescript
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReadingProgressService } from './reading-progress.service';
import { ReadingProgressDto } from './dto/reading-progress.dto';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('reading-progress')
@Controller({ path: 'me/reading-progress', version: '1' })
@UseGuards(JwtAuthGuard)
export class ReadingProgressController {
  constructor(private readonly svc: ReadingProgressService) {}

  @Get()
  list(@CurrentUser() u: { id: string }) {
    return this.svc.list(u.id);
  }

  @Put()
  upsert(@CurrentUser() u: { id: string }, @Body() dto: ReadingProgressDto) {
    return this.svc.upsert(u.id, dto.storyId, dto.chapterIndex);
  }
}
```

- [ ] **Step 4: `user-data.module.ts`** + register in `app.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { BookmarksController } from './bookmarks.controller';
import { BookmarksService } from './bookmarks.service';
import { ReadingProgressController } from './reading-progress.controller';
import { ReadingProgressService } from './reading-progress.service';

@Module({
  controllers: [BookmarksController, ReadingProgressController],
  providers: [BookmarksService, ReadingProgressService],
})
export class UserDataModule {}
```

- [ ] **Step 5: Smoke**

```powershell
# (logged in as admin@test.com per CLAUDE.md)
curl.exe -b cookies.txt http://localhost:3001/api/v1/me/bookmarks
# expected: []
curl.exe -b cookies.txt -X POST http://localhost:3001/api/v1/me/bookmarks -H "Content-Type: application/json" -d "{\"storyId\":\"<a-real-story-uuid>\"}"
curl.exe -b cookies.txt http://localhost:3001/api/v1/me/bookmarks
# expected: 1 row
curl.exe -b cookies.txt -X PUT http://localhost:3001/api/v1/me/reading-progress -H "Content-Type: application/json" -d "{\"storyId\":\"<uuid>\",\"chapterIndex\":5}"
curl.exe -b cookies.txt http://localhost:3001/api/v1/me/reading-progress
```

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat(api/user-data): bookmarks + reading progress endpoints"
```

---

### Task 4: Frontend search route + components

**Files:** under `apps/frontend/src/`.

- [ ] **Step 1: `api/search.ts`**

```typescript
import { api } from '@/lib/api-client';
import type { StorySummary } from './stories';

export interface SearchResponse {
  items: (StorySummary & { rank?: number })[];
  page: number;
  limit: number;
}

export async function searchStories(q: string, page = 1, genre?: string, status?: string): Promise<SearchResponse> {
  const res = await api.get<SearchResponse>('/search', { params: { q, page, genre, status } });
  return res.data;
}
```

- [ ] **Step 2: `routes/tim-kiem.tsx`**

```tsx
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { searchStories } from '@/api/search';
import { StoryGrid } from '@/components/reader/StoryGrid';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/tim-kiem')({
  component: SearchPage,
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === 'string' ? s.q : '',
    page: Number(s.page) || 1,
  }),
});

function SearchPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [input, setInput] = useState(search.q);

  const { data, isLoading } = useQuery({
    queryKey: ['search', search.q, search.page],
    queryFn: () => searchStories(search.q, search.page),
    enabled: search.q.length > 0,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    navigate({ search: { q: input, page: 1 } });
  }

  return (
    <div className="container py-8 space-y-6">
      <h1 className="text-2xl font-bold font-[Newsreader]">Tìm kiếm</h1>
      <form onSubmit={submit} className="flex gap-2 max-w-2xl">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Nhập tên truyện hoặc tác giả..." />
        <Button type="submit">Tìm</Button>
      </form>
      {search.q && (
        <div>
          <p className="text-muted-foreground text-sm mb-4">
            {isLoading ? 'Đang tìm...' : `Kết quả cho "${search.q}": ${data?.items.length ?? 0} truyện`}
          </p>
          <StoryGrid stories={(data?.items ?? []).map((s) => ({ ...s }))} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add a search input to `ReaderHeader.tsx`**

Append next to the nav: an `<Input>` that on submit navigates to `/tim-kiem?q=...`.

- [ ] **Step 4: Smoke** — open `/tim-kiem?q=tien+hiep`, see results.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(frontend/search): tim-kiem route + header search input"
```

---

### Task 5: Bookmark toggle on story detail

**Files:** under `apps/frontend/src/`.

- [ ] **Step 1: `api/bookmarks.ts`**

```typescript
import { api } from '@/lib/api-client';

export interface BookmarkRow {
  storyId: string;
  slug: string;
  title: string;
  author: string | null;
  status: string;
  totalChapters: number;
  createdAt: string;
}

export const bookmarksApi = {
  list: () => api.get<BookmarkRow[]>('/me/bookmarks').then((r) => r.data),
  has: (storyId: string) => api.get<{ bookmarked: boolean }>(`/me/bookmarks/${storyId}`).then((r) => r.data),
  add: (storyId: string) => api.post('/me/bookmarks', { storyId }).then((r) => r.data),
  remove: (storyId: string) => api.delete(`/me/bookmarks/${storyId}`).then((r) => r.data),
};
```

- [ ] **Step 2: `components/reader/BookmarkToggle.tsx`**

```tsx
'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { bookmarksApi } from '@/api/bookmarks';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';

export function BookmarkToggle({ storyId }: { storyId: string }) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['bookmark', storyId],
    queryFn: () => bookmarksApi.has(storyId),
    enabled: !!user,
  });

  const toggle = useMutation({
    mutationFn: async () => {
      if (data?.bookmarked) await bookmarksApi.remove(storyId);
      else await bookmarksApi.add(storyId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookmark', storyId] });
      qc.invalidateQueries({ queryKey: ['bookmarks'] });
    },
  });

  if (!user) return null;
  const active = data?.bookmarked ?? false;
  return (
    <Button
      variant={active ? 'default' : 'outline'}
      onClick={() => toggle.mutate()}
      disabled={isLoading || toggle.isPending}
      className="gap-2"
    >
      <Heart className="h-4 w-4" fill={active ? 'currentColor' : 'none'} />
      {active ? 'Đã lưu' : 'Lưu truyện'}
    </Button>
  );
}
```

- [ ] **Step 3: Place `<BookmarkToggle storyId={s.id} />` in `routes/truyen.$slug.index.tsx`** next to the "Đọc từ đầu" button.

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat(frontend/bookmarks): BookmarkToggle on story detail"
```

---

### Task 6: Reading progress tracker on chapter page

**Files:** under `apps/frontend/src/`.

- [ ] **Step 1: `api/reading-progress.ts`**

```typescript
import { api } from '@/lib/api-client';

export interface ReadingProgressRow {
  storyId: string;
  chapterIndex: string;
  updatedAt: string;
  slug: string;
  title: string;
  author: string | null;
  totalChapters: number;
}

export const readingProgressApi = {
  list: () => api.get<ReadingProgressRow[]>('/me/reading-progress').then((r) => r.data),
  upsert: (storyId: string, chapterIndex: number) =>
    api.put('/me/reading-progress', { storyId, chapterIndex }).then((r) => r.data),
};
```

- [ ] **Step 2: `components/reader/ReadingProgressTracker.tsx`**

```tsx
'use client';
import { useEffect, useRef } from 'react';
import { readingProgressApi } from '@/api/reading-progress';
import { useAuthStore } from '@/stores/auth-store';

export function ReadingProgressTracker({ storyId, chapterIndex }: { storyId: string; chapterIndex: number }) {
  const user = useAuthStore((s) => s.user);
  const fired = useRef(false);

  useEffect(() => {
    if (!user || fired.current) return;
    const timer = window.setTimeout(() => {
      readingProgressApi.upsert(storyId, chapterIndex).catch(() => {});
      fired.current = true;
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [storyId, chapterIndex, user]);

  return null;
}
```

Debounced: only fires after 5 seconds on the page (assumes reader is actually engaged). Cancel on unmount or chapter change.

- [ ] **Step 3: Wire it into the chapter reader route**

In `routes/truyen.$slug.chuong-$index.tsx`, render `<ReadingProgressTracker storyId={data.story.id} chapterIndex={data.chapter.index} />` near the top of the article. Backend `getChapterContent` already returns `story.id`? Currently it only returns `slug` + `title` per Plan 4 Task 7. **Add `id: string` to the returned `story` object in `apps/api/src/modules/chapters/chapters.service.ts`** — append `storyId: story.id` to the SELECT and surface it. Update the FE typing.

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat(frontend/reading-progress): debounced tracker on chapter view + storyId in chapter API"
```

---

### Task 7: `/tu-sach` shelf (bookmarks + continue reading)

**Files:**
- Create: `apps/frontend/src/routes/tu-sach.tsx`
- Create: `apps/frontend/src/components/reader/ContinueReadingCta.tsx`

- [ ] **Step 1: `routes/tu-sach.tsx`**

```tsx
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { bookmarksApi } from '@/api/bookmarks';
import { readingProgressApi } from '@/api/reading-progress';
import { me } from '@/api/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/tu-sach')({
  beforeLoad: async () => {
    const user = await me();
    if (!user) throw redirect({ to: '/dang-nhap', search: { redirect: '/tu-sach' } });
  },
  component: Shelf,
});

function Shelf() {
  const bookmarks = useQuery({ queryKey: ['bookmarks'], queryFn: bookmarksApi.list });
  const progress = useQuery({ queryKey: ['reading-progress'], queryFn: readingProgressApi.list });

  return (
    <div className="container py-8 space-y-10">
      <section>
        <h1 className="text-2xl font-bold font-[Newsreader] mb-4">Đang đọc</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(progress.data ?? []).map((p) => (
            <Card key={p.storyId} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-base">
                  <Link to={`/truyen/${p.slug}/chuong-${p.chapterIndex}` as never} className="hover:underline">
                    {p.title}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Tiếp tục Chương {p.chapterIndex} / {p.totalChapters}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Cập nhật {new Date(p.updatedAt).toLocaleString('vi-VN')}
                </p>
              </CardContent>
            </Card>
          ))}
          {(progress.data?.length ?? 0) === 0 && (
            <p className="text-muted-foreground text-sm">Chưa có truyện nào đang đọc.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold font-[Newsreader] mb-4">Truyện đã lưu</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(bookmarks.data ?? []).map((b) => (
            <Card key={b.storyId} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-base">
                  <Link to={`/truyen/${b.slug}` as never} className="hover:underline">{b.title}</Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{b.author ?? 'Khuyết danh'} · {b.totalChapters} chương</p>
              </CardContent>
            </Card>
          ))}
          {(bookmarks.data?.length ?? 0) === 0 && (
            <p className="text-muted-foreground text-sm">Chưa lưu truyện nào.</p>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Add a "Tủ sách" nav link to `ReaderHeader.tsx`** (shown only when `useAuthStore.user` is non-null).

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "feat(frontend/shelf): /tu-sach with continue-reading + bookmarks list"
```

---

### Task 8: e2e smoke

**Files:**
- Create: `apps/frontend/tests/e2e/user-features.spec.ts` (or extend existing reader smoke)

- [ ] **Step 1: Add tests**

```typescript
import { expect, test } from '@playwright/test';

// Prereq: signed-in user with at least one story present in DB.

test('search returns results for accented Vietnamese term via unaccent', async ({ page }) => {
  await page.goto('/tim-kiem?q=tien+hiep');
  await expect(page.getByRole('heading', { name: /Tìm kiếm/i })).toBeVisible();
  await expect(page.locator('a[href^="/truyen/"]').first()).toBeVisible({ timeout: 15_000 });
});

test('bookmark toggle persists across reload', async ({ page }) => {
  // Sign in first (replicate Plan 2 admin smoke pattern)
  await page.goto('/dang-nhap');
  await page.getByLabel('Email').fill('admin@test.com');
  await page.getByLabel('Mật khẩu').fill('adminpassword');
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await page.waitForURL(/\/admin/);

  await page.goto('/');
  await page.locator('a[href^="/truyen/"]').first().click();
  const toggle = page.getByRole('button', { name: /(Lưu truyện|Đã lưu)/i });
  const initial = (await toggle.textContent()) ?? '';
  await toggle.click();
  await page.reload();
  const after = (await page.getByRole('button', { name: /(Lưu truyện|Đã lưu)/i }).textContent()) ?? '';
  expect(after).not.toBe(initial);
});

test('reading progress shows up on tu-sach after 5s on chapter', async ({ page }) => {
  await page.goto('/');
  await page.locator('a[href^="/truyen/"]').first().click();
  await page.getByRole('link', { name: /Đọc từ đầu/i }).click();
  await page.waitForTimeout(6_000); // tracker fires at 5s
  await page.goto('/tu-sach');
  await expect(page.getByRole('heading', { name: /Đang đọc/i })).toBeVisible();
  await expect(page.locator('a[href*="/chuong-"]').first()).toBeVisible();
});
```

- [ ] **Step 2: Run**

```powershell
pnpm --filter @smanga/frontend e2e
```

Expected: 3 new tests pass.

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "test(frontend): e2e for search + bookmark + reading-progress"
```

---

## Self-review

**Spec coverage** (spec §9 + §10):
- ✅ Search route `/tim-kiem` — Task 4
- ✅ pg_trgm + unaccent search — Task 1 (uses existing index from Plan 1)
- ✅ Genre filter — Task 1 dto + service
- ✅ Bookmark — Tasks 2, 5
- ✅ Reading progress + "đọc tiếp" — Tasks 3, 6, 7
- ✅ /tu-sach shelf — Task 7

**Not covered (deferred):**
- Comment + rating (spec §5 phase 2)
- Genre filter page `/the-loai/<slug>` (spec §9) — could be Task 9 if needed; simple SELECT.
- Auto-suggest in search box (debounced) — nice-to-have, skip Plan 5

**Type consistency:**
- `BookmarkRow`, `ReadingProgressRow`, `SearchResponse` defined in `apps/frontend/src/api/*`; mirror backend DTOs.
- `BookmarkToggle` reads from auth store — won't render if not logged in.
- `ReadingProgressTracker` only fires when `user !== null`.

**Risks:**
- `similarity()` function comes from `pg_trgm` extension — already installed in Plan 1. Verify with `\dx` if migration ran cleanly.
- The chapter API needs `id` added to the returned story object (Task 6 Step 3). The backend change must land BEFORE the FE tracker tries to read it, or TypeScript will error.
- `readingProgress.chapterIndex` is `numeric` in DB → string in TS. Service converts via `String(chapterIndex)` on UPSERT.

**Estimated effort:** 8 tasks, ~half the size of Plan 4. Subagent-driven likely 1-2 hours wall-clock.
