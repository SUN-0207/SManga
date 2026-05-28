# SManga Reader Implementation Plan (Plan 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public-facing reader site — landing page (recent stories), story detail with paginated chapter list, chapter content reader with prev/next navigation and persistent reading preferences (theme, font size, font family), plus SEO essentials (meta tags, sitemap.xml, robots.txt). Reader pages render server-side with ISR; the worker's existing revalidate webhook (Plan 2) refreshes cached pages when new chapters land.

**Architecture:** Reader routes are unauthenticated server components under `apps/web/src/app/(reader)/`. They query Postgres directly via `getDb()` (no API layer needed). Chapter content is gzipped in the `chapter.content_text` bytea column; a small server-only helper decompresses on read. Reader preferences (theme/font size/family) are client-side in `localStorage`, hydrated via a `ThemeProvider` that wraps reader pages. The dashboard + sources/stories/jobs at `/admin/*` stay untouched; only the public site gets fleshed out.

**Tech Stack:** Same as Plan 2 — Next.js 15 App Router (ISR + on-demand revalidation), React 19, Tailwind, shadcn/ui, Drizzle queries. Adds `next-themes` for theme switching. No new server dependencies. No new tests beyond a Playwright reader smoke.

---

## Heads-up: workarounds inherited from Plans 1 and 2

These were already learned and must be respected:

- Internal imports within `packages/*` use `.ts` extensions (not `.js`). Cross-package imports from `apps/web` go through the package barrel (`@smanga/db`, `@smanga/db/schema`, `@smanga/shared`, `@smanga/crawler`).
- The `chapter.contentText` column stores gzipped UTF-8 bytes. `contentByteSize` is the uncompressed size.
- The reader URL pattern is `/truyen/<slug>/chuong-<index>` where `<index>` is the numeric chapter index (allows `47.5`); `slug` is `story.slug`.
- Worker calls `/api/revalidate` with `paths: ['/', '/truyen/<slug>']` after a story import and `paths: ['/truyen/<slug>', '/truyen/<slug>/chuong-<index>']` after a chapter crawl. Reader pages must use those exact path shapes and `export const revalidate = ...` for ISR.

---

## File structure

```
apps/web/src/
  app/
    (reader)/                       Route group — does NOT add to URL
      layout.tsx                    Reader-only layout (theme provider, header)
      page.tsx                      Landing: recent stories grid
      tim-kiem/page.tsx             (Plan 4 owns — placeholder noted)
      truyen/
        [slug]/
          page.tsx                  Story detail
          chuong-[index]/page.tsx   Chapter reader
    sitemap.ts                      Dynamic sitemap (Next.js convention)
    robots.ts                       Robots.txt (Next.js convention)
  components/
    reader/
      StoryCard.tsx                 Server component used in grid
      StoryGrid.tsx                 Server component listing cards
      ChapterList.tsx               Server component, paginated list
      ChapterNav.tsx                Client component: prev/next + select
      ReaderSettings.tsx            Client component: theme + font controls
      ReaderHeader.tsx              Client component: brand + settings toggle
    providers/
      ThemeProvider.tsx             Client provider wrapping next-themes
  server/
    chapter-content.ts              Server-only helper: gunzip bytea → string
  lib/
    reader-preferences.ts           Client-only types + localStorage keys
```

**Why this split:**
- `(reader)` route group keeps reader files separate from admin without changing the URL. Lets us scope the theme provider only to reader pages (admin already works in light mode and we don't want to risk regressions).
- `chapter-content.ts` is server-only (uses `node:zlib`) — kept out of `lib/` to make the boundary obvious.
- Components under `reader/` mirror `admin/` convention from Plan 2.

---

### Task 1: Theme provider + next-themes wiring

**Files:**
- Modify: `apps/web/package.json` (add `next-themes`)
- Create: `apps/web/src/components/providers/ThemeProvider.tsx`
- Create: `apps/web/src/lib/reader-preferences.ts`

- [ ] **Step 1: Add `next-themes`**

Append to `apps/web/package.json` dependencies:

```json
"next-themes": "0.4.3"
```

Run `pnpm install`.

- [ ] **Step 2: Write `apps/web/src/lib/reader-preferences.ts`**

```typescript
// Client-only constants for reader UI preferences stored in localStorage.

export const READER_PREF_KEYS = {
  fontSize: 'smanga:reader:font-size',
  fontFamily: 'smanga:reader:font-family',
} as const;

export const FONT_SIZES = [
  { value: '14', label: '14' },
  { value: '16', label: '16' },
  { value: '18', label: '18' },
  { value: '20', label: '20' },
  { value: '22', label: '22' },
  { value: '24', label: '24' },
] as const;

export const FONT_FAMILIES = [
  { value: 'sans', label: 'Sans-serif', css: 'ui-sans-serif, system-ui, sans-serif' },
  { value: 'serif', label: 'Serif', css: 'ui-serif, Georgia, Cambria, serif' },
  { value: 'mono', label: 'Monospace', css: 'ui-monospace, SFMono-Regular, monospace' },
] as const;

export type FontSize = (typeof FONT_SIZES)[number]['value'];
export type FontFamily = (typeof FONT_FAMILIES)[number]['value'];

export const DEFAULT_FONT_SIZE: FontSize = '18';
export const DEFAULT_FONT_FAMILY: FontFamily = 'serif';
```

- [ ] **Step 3: Write `apps/web/src/components/providers/ThemeProvider.tsx`**

```tsx
'use client';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @smanga/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(web): add next-themes provider + reader preferences module"
```

---

### Task 2: Reader layout, header, settings UI

**Files:**
- Create: `apps/web/src/app/(reader)/layout.tsx`
- Create: `apps/web/src/components/reader/ReaderHeader.tsx`
- Create: `apps/web/src/components/reader/ReaderSettings.tsx`

- [ ] **Step 1: Write `apps/web/src/app/(reader)/layout.tsx`**

```tsx
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ReaderHeader } from '@/components/reader/ReaderHeader';

export default function ReaderLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col">
        <ReaderHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border py-6 text-sm text-center text-muted-foreground">
          SManga · Đọc truyện chữ
        </footer>
      </div>
    </ThemeProvider>
  );
}
```

- [ ] **Step 2: Write `apps/web/src/components/reader/ReaderHeader.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ReaderSettings } from './ReaderSettings';

export function ReaderHeader() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="border-b border-border">
      <div className="container flex items-center justify-between py-4">
        <Link href="/" className="text-xl font-bold">
          SManga
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/" className="text-sm hover:underline">Trang chủ</Link>
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen((v) => !v)} aria-expanded={settingsOpen}>
            Cài đặt
          </Button>
        </div>
      </div>
      {settingsOpen && (
        <div className="border-t border-border bg-muted/30">
          <div className="container py-4">
            <ReaderSettings />
          </div>
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 3: Write `apps/web/src/components/reader/ReaderSettings.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  FONT_FAMILIES,
  FONT_SIZES,
  READER_PREF_KEYS,
  type FontFamily,
  type FontSize,
} from '@/lib/reader-preferences';

export function ReaderSettings() {
  const { theme, setTheme } = useTheme();
  const [fontSize, setFontSize] = useState<FontSize>(DEFAULT_FONT_SIZE);
  const [fontFamily, setFontFamily] = useState<FontFamily>(DEFAULT_FONT_FAMILY);

  useEffect(() => {
    const size = (window.localStorage.getItem(READER_PREF_KEYS.fontSize) as FontSize | null) ?? DEFAULT_FONT_SIZE;
    const family = (window.localStorage.getItem(READER_PREF_KEYS.fontFamily) as FontFamily | null) ?? DEFAULT_FONT_FAMILY;
    setFontSize(size);
    setFontFamily(family);
    applyToBody(size, family);
  }, []);

  function update(size: FontSize, family: FontFamily) {
    setFontSize(size);
    setFontFamily(family);
    window.localStorage.setItem(READER_PREF_KEYS.fontSize, size);
    window.localStorage.setItem(READER_PREF_KEYS.fontFamily, family);
    applyToBody(size, family);
  }

  function applyToBody(size: FontSize, family: FontFamily) {
    const css = FONT_FAMILIES.find((f) => f.value === family)?.css ?? FONT_FAMILIES[0].css;
    document.documentElement.style.setProperty('--reader-font-size', `${size}px`);
    document.documentElement.style.setProperty('--reader-font-family', css);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
      <div>
        <Label className="mb-2 block">Giao diện</Label>
        <div className="flex gap-2">
          <Button size="sm" variant={theme === 'light' ? 'default' : 'outline'} onClick={() => setTheme('light')}>Sáng</Button>
          <Button size="sm" variant={theme === 'dark' ? 'default' : 'outline'} onClick={() => setTheme('dark')}>Tối</Button>
          <Button size="sm" variant={theme === 'system' ? 'default' : 'outline'} onClick={() => setTheme('system')}>Hệ thống</Button>
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Cỡ chữ</Label>
        <div className="flex gap-1 flex-wrap">
          {FONT_SIZES.map((s) => (
            <Button
              key={s.value}
              size="sm"
              variant={fontSize === s.value ? 'default' : 'outline'}
              onClick={() => update(s.value, fontFamily)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Phông chữ</Label>
        <div className="flex gap-1 flex-wrap">
          {FONT_FAMILIES.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={fontFamily === f.value ? 'default' : 'outline'}
              onClick={() => update(fontSize, f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update `apps/web/src/app/page.tsx`**

Replace the placeholder created in Plan 2 — it currently shows "Reader UI is shipped in Plan 3." which is no longer accurate once Task 3 lands. **Skip this step here** — Task 3 replaces `page.tsx` entirely with the recent stories grid. Just leave the placeholder for now; this task only adds the layout group, header, and settings UI.

Note: Because we placed the layout in the `(reader)` group, `apps/web/src/app/page.tsx` (the existing placeholder) is OUTSIDE the reader group and will not pick up `ReaderHeader`. To fix this, MOVE the existing `apps/web/src/app/page.tsx` to `apps/web/src/app/(reader)/page.tsx` and update its contents to a temporary placeholder until Task 3 fleshes it out:

```tsx
export default function HomePage() {
  return (
    <div className="container py-12">
      <h1 className="text-3xl font-bold">SManga</h1>
      <p className="text-muted-foreground mt-2">Reader landing fills in at Task 3.</p>
    </div>
  );
}
```

After the move there must NOT be both `apps/web/src/app/page.tsx` and `apps/web/src/app/(reader)/page.tsx` — Next.js treats route groups as transparent for URL resolution and will throw a conflict. Delete the old `apps/web/src/app/page.tsx`.

- [ ] **Step 5: Verify**

Run `pnpm --filter @smanga/web typecheck` → PASS.

Optional smoke (skip if dev server gymnastics are annoying — Task 8 has full e2e): start dev server, visit `http://localhost:3000`, click "Cài đặt", toggle dark mode — body should switch backgrounds. Refresh page — theme persists via next-themes.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat(web/reader): add reader layout group with header and settings UI"
```

---

### Task 3: Landing page — recent stories grid + StoryCard

**Files:**
- Create: `apps/web/src/components/reader/StoryCard.tsx`
- Create: `apps/web/src/components/reader/StoryGrid.tsx`
- Modify: `apps/web/src/app/(reader)/page.tsx`

- [ ] **Step 1: Write `apps/web/src/components/reader/StoryCard.tsx`**

```tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

export interface StoryCardProps {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  status: 'ongoing' | 'completed' | 'dropped' | 'unknown';
  totalChapters: number;
  hasCover: boolean;
}

export function StoryCard(props: StoryCardProps) {
  return (
    <Link
      href={`/truyen/${props.slug}`}
      className="group flex flex-col rounded-lg border border-border bg-background overflow-hidden hover:border-primary/50 transition-colors"
    >
      <div className="aspect-[3/4] bg-muted overflow-hidden">
        {props.hasCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/cover/${props.id}`}
            alt={`Bìa ${props.title}`}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            Không có bìa
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1">
        <h3 className="font-medium text-sm line-clamp-2 leading-snug">{props.title}</h3>
        <p className="text-xs text-muted-foreground line-clamp-1">{props.author ?? 'Khuyết danh'}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-[10px]">
            {props.status === 'completed' ? 'Full' : props.status === 'ongoing' ? 'Đang ra' : props.status}
          </Badge>
          <span>{props.totalChapters} chương</span>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Write `apps/web/src/components/reader/StoryGrid.tsx`**

```tsx
import { StoryCard, type StoryCardProps } from './StoryCard';

export function StoryGrid({ stories }: { stories: StoryCardProps[] }) {
  if (stories.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12">
        Chưa có truyện nào. Vào trang admin để import truyện đầu tiên.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {stories.map((s) => (
        <StoryCard key={s.id} {...s} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write `apps/web/src/app/(reader)/page.tsx`**

```tsx
import { desc, sql } from 'drizzle-orm';
import { story } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { StoryGrid } from '@/components/reader/StoryGrid';

export const revalidate = 300; // 5 minutes ISR

export default async function ReaderLanding() {
  const rows = await getDb()
    .select({
      id: story.id,
      slug: story.slug,
      title: story.title,
      author: story.author,
      status: story.status,
      totalChapters: story.totalChapters,
      hasCover: sql<boolean>`${story.cover} IS NOT NULL`,
    })
    .from(story)
    .orderBy(desc(story.updatedAt))
    .limit(48);

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mới cập nhật</h1>
        <p className="text-muted-foreground text-sm">{rows.length} truyện</p>
      </div>
      <StoryGrid stories={rows} />
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run `pnpm --filter @smanga/web typecheck` → PASS.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(web/reader): landing page with recent stories grid + StoryCard"
```

---

### Task 4: Server-side chapter content decompression helper

**Files:**
- Create: `apps/web/src/server/chapter-content.ts`

- [ ] **Step 1: Write `apps/web/src/server/chapter-content.ts`**

```typescript
import { gunzipSync } from 'node:zlib';

/**
 * The crawler stores chapter content as gzipped UTF-8 bytes in `chapter.content_text`.
 * This helper is server-only — keep it out of any client component import graph.
 */
export function decompressChapterContent(bytes: Buffer | null): string | null {
  if (!bytes || bytes.length === 0) return null;
  try {
    return gunzipSync(bytes).toString('utf-8');
  } catch {
    // If a row was somehow written without gzip (shouldn't happen post-Plan-1), fall back.
    return bytes.toString('utf-8');
  }
}
```

- [ ] **Step 2: Verify**

Typecheck PASS.

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "feat(web): add server-only helper to gunzip chapter content"
```

---

### Task 5: Story detail page `/truyen/[slug]`

**Files:**
- Create: `apps/web/src/components/reader/ChapterList.tsx`
- Create: `apps/web/src/app/(reader)/truyen/[slug]/page.tsx`

- [ ] **Step 1: Write `apps/web/src/components/reader/ChapterList.tsx`**

```tsx
import Link from 'next/link';

export interface ChapterListItem {
  index: number;
  title: string;
  isCrawled: boolean;
}

export interface ChapterListProps {
  slug: string;
  chapters: ChapterListItem[];
  currentPage: number;
  totalPages: number;
}

export function ChapterList({ slug, chapters, currentPage, totalPages }: ChapterListProps) {
  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
        {chapters.map((c) => (
          <li key={c.index} className="text-sm">
            {c.isCrawled ? (
              <Link
                href={`/truyen/${slug}/chuong-${c.index}`}
                className="hover:underline text-foreground"
              >
                Chương {c.index}: {c.title.replace(/^Chương\s*\d+(?:\.\d+)?\s*:?\s*/i, '')}
              </Link>
            ) : (
              <span className="text-muted-foreground/60 line-through" title="Chưa crawl">
                Chương {c.index}: {c.title}
              </span>
            )}
          </li>
        ))}
      </ul>
      {totalPages > 1 && <Pagination slug={slug} currentPage={currentPage} totalPages={totalPages} />}
    </div>
  );
}

function Pagination({ slug, currentPage, totalPages }: { slug: string; currentPage: number; totalPages: number }) {
  const windowSize = 5;
  const start = Math.max(1, currentPage - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  const pages: number[] = [];
  for (let p = start; p <= end; p += 1) pages.push(p);
  return (
    <nav className="flex items-center gap-1 mt-4 text-sm">
      {currentPage > 1 && (
        <Link href={pageUrl(slug, currentPage - 1)} className="px-3 py-1 rounded border border-border hover:bg-muted">
          ‹
        </Link>
      )}
      {pages.map((p) => (
        <Link
          key={p}
          href={pageUrl(slug, p)}
          className={`px-3 py-1 rounded border ${p === currentPage ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}
        >
          {p}
        </Link>
      ))}
      {currentPage < totalPages && (
        <Link href={pageUrl(slug, currentPage + 1)} className="px-3 py-1 rounded border border-border hover:bg-muted">
          ›
        </Link>
      )}
    </nav>
  );
}

function pageUrl(slug: string, page: number): string {
  return page === 1 ? `/truyen/${slug}` : `/truyen/${slug}?page=${page}`;
}
```

- [ ] **Step 2: Write `apps/web/src/app/(reader)/truyen/[slug]/page.tsx`**

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, count, eq, ne } from 'drizzle-orm';
import { chapter, genre, story, storyGenre } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { ChapterList, type ChapterListItem } from '@/components/reader/ChapterList';
import { Badge } from '@/components/ui/badge';

export const revalidate = 300;

const PAGE_SIZE = 50;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [s] = await getDb()
    .select({ title: story.title, description: story.description, author: story.author })
    .from(story)
    .where(eq(story.slug, slug))
    .limit(1);
  if (!s) return { title: 'SManga' };
  const desc = (s.description ?? '').slice(0, 160) || `Đọc truyện ${s.title}.`;
  return {
    title: `${s.title} — SManga`,
    description: desc,
    openGraph: { title: s.title, description: desc, type: 'book' },
  };
}

export default async function StoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const db = getDb();

  const [s] = await db
    .select({
      id: story.id,
      slug: story.slug,
      title: story.title,
      author: story.author,
      description: story.description,
      status: story.status,
      totalChapters: story.totalChapters,
    })
    .from(story)
    .where(eq(story.slug, slug))
    .limit(1);
  if (!s) notFound();

  const [{ value: totalRows }] = await db
    .select({ value: count() })
    .from(chapter)
    .where(eq(chapter.storyId, s.id));
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const chapters = await db
    .select({
      index: chapter.index,
      title: chapter.title,
      status: chapter.status,
    })
    .from(chapter)
    .where(eq(chapter.storyId, s.id))
    .orderBy(asc(chapter.index))
    .limit(PAGE_SIZE)
    .offset((safePage - 1) * PAGE_SIZE);

  const genres = await db
    .select({ slug: genre.slug, name: genre.name })
    .from(storyGenre)
    .innerJoin(genre, eq(storyGenre.genreId, genre.id))
    .where(eq(storyGenre.storyId, s.id));

  const items: ChapterListItem[] = chapters.map((c) => ({
    index: Number(c.index),
    title: c.title,
    isCrawled: c.status === 'crawled',
  }));

  const firstCrawled = await db
    .select({ index: chapter.index })
    .from(chapter)
    .where(and(eq(chapter.storyId, s.id), eq(chapter.status, 'crawled')))
    .orderBy(asc(chapter.index))
    .limit(1);

  return (
    <div className="container py-8 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
        <div className="aspect-[3/4] bg-muted overflow-hidden rounded">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/cover/${s.id}`} alt={`Bìa ${s.title}`} className="w-full h-full object-cover" />
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-bold">{s.title}</h1>
          <p className="text-muted-foreground">
            Tác giả: {s.author ?? 'Khuyết danh'}
          </p>
          <div className="flex gap-2 flex-wrap items-center">
            <Badge variant={s.status === 'completed' ? 'success' : 'secondary'}>
              {s.status === 'completed' ? 'Hoàn thành' : s.status === 'ongoing' ? 'Đang ra' : s.status}
            </Badge>
            <span className="text-sm text-muted-foreground">{s.totalChapters} chương</span>
          </div>
          {genres.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {genres.map((g) => (
                <span key={g.slug} className="text-xs px-2 py-0.5 rounded bg-muted">
                  {g.name}
                </span>
              ))}
            </div>
          )}
          {firstCrawled[0] && (
            <Link
              href={`/truyen/${s.slug}/chuong-${firstCrawled[0].index}`}
              className="inline-block mt-2 px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 text-sm"
            >
              Đọc từ đầu
            </Link>
          )}
        </div>
      </div>

      {s.description && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Giới thiệu</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed">{s.description}</p>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Danh sách chương</h2>
        <ChapterList slug={s.slug} chapters={items} currentPage={safePage} totalPages={totalPages} />
      </section>
    </div>
  );
}
```

Note: the import `ne` is unused — drop it from the import line if Biome complains.

- [ ] **Step 3: Verify**

Run `pnpm --filter @smanga/web typecheck`. If lint complains about unused `ne` import, remove it.

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat(web/reader): add story detail page with paginated chapter list + metadata"
```

---

### Task 6: Chapter reader page `/truyen/[slug]/chuong-[index]`

**Files:**
- Create: `apps/web/src/components/reader/ChapterNav.tsx`
- Create: `apps/web/src/app/(reader)/truyen/[slug]/chuong-[index]/page.tsx`

- [ ] **Step 1: Write `apps/web/src/components/reader/ChapterNav.tsx`**

```tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export interface ChapterNavProps {
  slug: string;
  prev: { index: number; title: string } | null;
  next: { index: number; title: string } | null;
  current: number;
}

export function ChapterNav({ slug, prev, next, current }: ChapterNavProps) {
  return (
    <nav className="flex items-center justify-between gap-3 py-4">
      <div className="flex-1">
        {prev && (
          <Link
            href={`/truyen/${slug}/chuong-${prev.index}`}
            className="inline-flex items-center gap-1 text-sm hover:underline"
          >
            ‹ Chương {prev.index}
          </Link>
        )}
      </div>
      <Link href={`/truyen/${slug}`} className="text-sm text-muted-foreground hover:underline">
        Mục lục (đang ở chương {current})
      </Link>
      <div className="flex-1 text-right">
        {next && (
          <Link
            href={`/truyen/${slug}/chuong-${next.index}`}
            className="inline-flex items-center gap-1 text-sm hover:underline"
          >
            Chương {next.index} ›
          </Link>
        )}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Write `apps/web/src/app/(reader)/truyen/[slug]/chuong-[index]/page.tsx`**

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, gt, lt } from 'drizzle-orm';
import { chapter, story } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { decompressChapterContent } from '@/server/chapter-content';
import { ChapterNav } from '@/components/reader/ChapterNav';

export const revalidate = 3600; // 1h ISR; worker also revalidates on crawl

interface RouteParams {
  slug: string;
  index: string;
}

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { slug, index } = await params;
  const [row] = await getDb()
    .select({ title: chapter.title, storyTitle: story.title })
    .from(chapter)
    .innerJoin(story, eq(chapter.storyId, story.id))
    .where(and(eq(story.slug, slug), eq(chapter.index, index)))
    .limit(1);
  if (!row) return { title: 'SManga' };
  return {
    title: `${row.title} — ${row.storyTitle} — SManga`,
    description: `${row.storyTitle}: ${row.title}`,
  };
}

export default async function ChapterPage({ params }: { params: Promise<RouteParams> }) {
  const { slug, index } = await params;
  const db = getDb();

  const [row] = await db
    .select({
      id: chapter.id,
      index: chapter.index,
      title: chapter.title,
      content: chapter.contentText,
      status: chapter.status,
      storyId: story.id,
      storySlug: story.slug,
      storyTitle: story.title,
    })
    .from(chapter)
    .innerJoin(story, eq(chapter.storyId, story.id))
    .where(and(eq(story.slug, slug), eq(chapter.index, index)))
    .limit(1);

  if (!row) notFound();

  const text = decompressChapterContent(row.content as unknown as Buffer | null);
  const isCrawled = row.status === 'crawled' && text !== null;

  const [prev] = await db
    .select({ index: chapter.index, title: chapter.title })
    .from(chapter)
    .where(and(eq(chapter.storyId, row.storyId), lt(chapter.index, row.index)))
    .orderBy(desc(chapter.index))
    .limit(1);

  const [next] = await db
    .select({ index: chapter.index, title: chapter.title })
    .from(chapter)
    .where(and(eq(chapter.storyId, row.storyId), gt(chapter.index, row.index)))
    .orderBy(asc(chapter.index))
    .limit(1);

  const navProps = {
    slug,
    current: Number(row.index),
    prev: prev ? { index: Number(prev.index), title: prev.title } : null,
    next: next ? { index: Number(next.index), title: next.title } : null,
  };

  return (
    <article className="container max-w-3xl py-8">
      <header className="mb-4">
        <p className="text-sm text-muted-foreground">
          <a href={`/truyen/${slug}`} className="hover:underline">{row.storyTitle}</a>
        </p>
        <h1 className="text-2xl font-bold mt-1">
          Chương {row.index}: {row.title.replace(/^Chương\s*\d+(?:\.\d+)?\s*:?\s*/i, '')}
        </h1>
      </header>

      <ChapterNav {...navProps} />

      {isCrawled ? (
        <div
          className="prose prose-sm sm:prose-base max-w-none whitespace-pre-line leading-relaxed"
          style={{
            fontSize: 'var(--reader-font-size, 18px)',
            fontFamily: 'var(--reader-font-family, ui-serif, Georgia, serif)',
          }}
        >
          {text}
        </div>
      ) : (
        <div className="border border-dashed border-border rounded p-8 text-center text-muted-foreground">
          Chương này chưa được crawl. Quay lại sau hoặc liên hệ quản trị.
        </div>
      )}

      <ChapterNav {...navProps} />
    </article>
  );
}
```

- [ ] **Step 3: Verify**

Run `pnpm --filter @smanga/web typecheck` → PASS.

If chapter.index column type is `numeric` (string in TS), `eq(chapter.index, index)` may complain — pass `index` as-is since both are strings here ("1", "47.5"). If it does complain, wrap: `eq(chapter.index, index as unknown as string)`.

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat(web/reader): add chapter reader page with prev/next nav and decompressed content"
```

---

### Task 7: Sitemap + robots.txt

**Files:**
- Create: `apps/web/src/app/sitemap.ts`
- Create: `apps/web/src/app/robots.ts`

- [ ] **Step 1: Write `apps/web/src/app/sitemap.ts`**

```typescript
import type { MetadataRoute } from 'next';
import { eq, sql } from 'drizzle-orm';
import { chapter, story } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { env } from '@/lib/env';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '');
  const db = getDb();

  const stories = await db
    .select({ slug: story.slug, updatedAt: story.updatedAt })
    .from(story);

  const chapterRefs = await db
    .select({
      slug: story.slug,
      index: chapter.index,
      crawledAt: chapter.crawledAt,
    })
    .from(chapter)
    .innerJoin(story, eq(chapter.storyId, story.id))
    .where(eq(chapter.status, 'crawled'));

  const entries: MetadataRoute.Sitemap = [];

  entries.push({ url: `${base}/`, lastModified: new Date(), changeFrequency: 'hourly', priority: 1 });

  for (const s of stories) {
    entries.push({
      url: `${base}/truyen/${s.slug}`,
      lastModified: s.updatedAt ?? new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    });
  }

  for (const c of chapterRefs) {
    entries.push({
      url: `${base}/truyen/${c.slug}/chuong-${c.index}`,
      lastModified: c.crawledAt ?? new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }

  return entries;
}
```

- [ ] **Step 2: Write `apps/web/src/app/robots.ts`**

```typescript
import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const base = env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '');
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/dang-nhap'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
```

- [ ] **Step 3: Verify**

Typecheck PASS. After Task 8 e2e setup, you can curl `http://localhost:3000/sitemap.xml` and `http://localhost:3000/robots.txt` to confirm output.

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat(web/reader): add dynamic sitemap + robots.txt"
```

---

### Task 8: Playwright reader smoke

**Files:**
- Create: `apps/web/tests/e2e/reader-smoke.spec.ts`

- [ ] **Step 1: Write the smoke**

```typescript
import { expect, test } from '@playwright/test';

// Prereq: postgres up, web dev server running on :3000, at least one story
// imported with crawled chapters (Plan 1 smoke leaves "xuyen-thu-chi-ba-ai-doc-the"
// in the DB by default).
//
// If the DB has been wiped since then, re-import a story first:
//   pnpm crawl https://truyenfull.today/xuyen-thu-chi-ba-ai-doc-the/ --chapters

test('landing shows at least one story', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mới cập nhật' })).toBeVisible();
  // At least one StoryCard link should be present.
  await expect(page.locator('a[href^="/truyen/"]').first()).toBeVisible();
});

test('story detail page renders title and chapter list', async ({ page }) => {
  await page.goto('/');
  const firstStoryLink = page.locator('a[href^="/truyen/"]').first();
  await firstStoryLink.click();
  await expect(page).toHaveURL(/\/truyen\/[^/]+/);
  await expect(page.getByRole('heading', { name: 'Danh sách chương' })).toBeVisible();
});

test('reader settings toggle persists font size in localStorage', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await page.getByRole('button', { name: '22', exact: true }).click();
  const stored = await page.evaluate(() => window.localStorage.getItem('smanga:reader:font-size'));
  expect(stored).toBe('22');
});

test('robots.txt is served', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.ok()).toBe(true);
  const body = await res.text();
  expect(body).toContain('Disallow: /admin/');
});
```

- [ ] **Step 2: Run e2e**

Same setup as Plan 2 Task 13 — ensure postgres + web dev are running, admin user not needed for reader tests but seed data is. If the DB is empty:

```powershell
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm crawl https://truyenfull.today/xuyen-thu-chi-ba-ai-doc-the/ --chapters
```

Run e2e:

```powershell
pnpm --filter @smanga/web e2e
```

Expected: all reader + admin tests pass. If only running reader specs: `pnpm --filter @smanga/web exec playwright test reader-smoke.spec.ts`.

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "test(web/reader): playwright smoke for landing, story detail, reader settings, robots"
```

---

### Task 9: Update operations runbook

**Files:**
- Modify: `docs/operations.md`

- [ ] **Step 1: Append a "Reader smoke" section to `docs/operations.md`**

Add after the existing "Smoke checklist before deploy" section:

```markdown

## Reader sanity check

```powershell
# After web is up and DB has at least one story with crawled chapters:
curl http://localhost:3000/                                # landing renders
curl http://localhost:3000/sitemap.xml | Select-String "<url>" | Measure-Object | Select-Object Count
curl http://localhost:3000/robots.txt
```

Manual:
- Open `http://localhost:3000` — see story grid with cover images
- Click a story — see info + chapter list with pagination if > 50 chapters
- Click a chapter — see content rendered; click "Cài đặt" → switch dark mode + font size; refresh — preferences persist
- Visit a not-yet-crawled chapter — see "chưa được crawl" placeholder, no crash
```

- [ ] **Step 2: Commit**

```
git add docs/operations.md
git commit -m "docs: add reader sanity checklist to ops runbook"
```

---

## Self-review

**Spec coverage** (per design doc Section 5 + 9):
- ✅ Reader landing `/` — Task 3
- ✅ Story detail `/truyen/<slug>` — Task 5
- ✅ Chapter reader `/truyen/<slug>/chuong-<index>` — Task 6
- ✅ Reading settings (theme + font size + font family) localStorage — Tasks 1, 2
- ✅ ISR with `export const revalidate` — Tasks 3, 5, 6 (worker's revalidate webhook from Plan 2 already calls these paths)
- ✅ Sitemap.xml + robots.txt — Task 7
- ✅ SEO meta tags (title, description, openGraph) — Task 5 (story), Task 6 (chapter)
- ✅ Chapter content decompression — Task 4

**Not covered, deferred:**
- Search `/tim-kiem` page → Plan 4 (per spec; Task 8 leaves a placeholder note)
- Genre filter page `/the-loai/<slug>` → Plan 4
- "Đọc tiếp" (resume reading) — needs user accounts → Plan 4
- Bookmark indicator on story cards — Plan 4

**Placeholders:** None. All steps have actual code or actual commands. No "TBD".

**Type consistency:**
- `StoryCardProps` defined in Task 3 component, consumed by `StoryGrid` (same task) and `(reader)/page.tsx` query in Task 3. Property shape matches the SELECT projection.
- `ChapterListItem` defined in Task 5 component, consumed by Task 5 page. `index: number` (page converts from numeric DB column).
- `ChapterNavProps` defined in Task 6 component, consumed by Task 6 page.
- `decompressChapterContent(bytes: Buffer | null): string | null` — Task 4 defines, Task 6 page consumes via `row.content as unknown as Buffer | null`.

**Risks worth flagging:**
- Drizzle's `chapter.index` is `numeric` → returned as string from DB. Routes use `chapter-${index}` from URL (string) and equality with DB string. JS `Number()` conversion only happens for display. Verify in Task 5/6 that `Number()` is applied at display sites, not in equality queries.
- Reader `<img>` tags directly hit `/api/cover/<storyId>` — that route was built in Plan 2 with 1-year immutable cache + ETag, so 200+ thumbnails on a busy landing page will be cached after first hit. If image responsiveness becomes a bottleneck later, swap to `next/image` (out of scope here; would require Next image domain config and Cover route rework).
- `whitespace-pre-line` on chapter body preserves newlines from `gunzip`. If the crawler concatenated paragraphs without `\n\n`, paragraphs will run together. If that happens in smoke, adjust the parser in `packages/crawler/src/sources/truyenfull/parsers.ts` to insert `\n\n` between paragraphs.
- Reader pages don't enforce any path normalization (trailing slash, lowercase). If two stories somehow share a slug, the unique constraint on `story.slug` already prevents that at DB level. URLs use `[slug]` directly; no encoding gymnastics needed since slugify produces ASCII.
