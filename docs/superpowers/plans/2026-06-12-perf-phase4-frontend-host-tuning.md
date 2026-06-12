# Perf Phase 4 — Frontend + Host Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink the 683 kB single JS chunk via route/vendor code-splitting, make the chapter reader scroll smooth (isolate the 60 fps progress-bar re-render + memoize content parsing), self-host fonts (kill the render-blocking Google Fonts CDN link), and ship the laptop container-tuning as an operator-applied compose change — the final phase of the performance program.

**Architecture:** Three independent frontend changes (Vite config, one reader route + a new component + a pure helper, font self-hosting) + one small backend pool-size env wiring + one operator compose runbook. No behavior changes the reader can see except faster loads/smoother scroll and a one-time font self-host (same typefaces). The compose task lands in git and the operator applies it on the laptop with `git pull && docker compose up -d`.

**Tech Stack:** Vite 6 + React 19 + TanStack Router 1.170 / router-vite-plugin 1.167 + TanStack Query 5, `@fontsource`, Drizzle/postgres.js, Docker Compose (Postgres 17 + Redis 7).

**Spec:** `docs/superpowers/specs/2026-06-11-performance-remediation-design.md` §6 — read it first. This is the last phase; §8 verification + §1 prod-probe re-run close out the program.

---

## Running tests / builds (authoritative)

| Action | Command |
|---|---|
| frontend unit test | `pnpm --filter @smanga/frontend exec vitest run src/<path>` (jsdom + `@/` alias) |
| frontend build (chunk listing) | `pnpm --filter @smanga/frontend build` |
| frontend typecheck | `pnpm --filter @smanga/frontend typecheck` (runs `tsr generate && tsc --noEmit`) |
| api typecheck | `pnpm --filter @smanga/api typecheck` |
| full suite | `pnpm test` |
| full typecheck | `pnpm typecheck` |

**Pre-commit hook** (lefthook): `biome check` on staged files + full-monorepo `pnpm typecheck`. Before each commit run `pnpm exec biome check --write <changed files>` and re-stage. Never `--no-verify`, never `git add -A` (commit only the listed paths), never push. Work on `main` (no branch — user-authorized this session).

**Visual changes are reader-facing** (Tasks 1–3): per house rule, the CONTROLLER takes a Playwright MCP screenshot proof of the reader (fonts render, scroll bar tracks, code-split navigation works) before any push — the implementer subagents only do code + build + unit tests. The operator compose task (Task 5) is applied by the user on the laptop, not deployed by push.

---

## Baseline (measured 2026-06-12)

- Frontend build: **one** chunk `dist/assets/index-*.js` = **683.65 kB raw / 196.43 kB gzip** + `index-*.css` 46.68 kB. No code-splitting. Vite warns ">500 kB".
- Reader route re-renders the whole `ChapterReader` (paragraph split + drop-cap regex over the entire chapter) on **every scroll event** because `setScrollProgress` lives in a window scroll listener in the route component.
- Fonts: render-blocking `<link>` to `fonts.googleapis.com` loading Inter + Newsreader + JetBrains Mono (third-party DNS + connection + render-block).
- `index.html` ships a dead `content="REPLACE_AFTER_GSC_SETUP"` verification meta (GSC ownership is already verified via DNS-TXT this program).
- DB pool `max` hardcoded to 10 in `packages/db`; no `DB_POOL_MAX`. Prod compose has no Postgres/Redis tuning, no `mem_limit`, no `stop_grace_period`.

---

## File structure

| File | Change |
|---|---|
| `apps/frontend/vite.config.ts` | `autoCodeSplitting: true` + `manualChunks` vendor split |
| `apps/frontend/src/lib/reader-progress.ts` | **new** pure helpers `countWords`, `scrollPercent` |
| `apps/frontend/src/lib/reader-progress.test.ts` | **new** unit tests |
| `apps/frontend/src/components/reader/ReadingProgressBar.tsx` | **new** rAF-throttled, self-contained progress bar |
| `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx` | drop scrollProgress state; render `<ReadingProgressBar/>`; `useMemo` paragraphs + wordCount |
| `apps/frontend/package.json` | add `@fontsource/inter` + `@fontsource/newsreader` |
| `apps/frontend/src/main.tsx` | import self-hosted font weights |
| `apps/frontend/index.html` | remove Google Fonts `<link>` + preconnects + dead GSC meta |
| `apps/frontend/tailwind.config.ts` | `mono` → system stack (drop JetBrains Mono) |
| `packages/db/src/client.ts` | `createDb(connectionString, max = 10)` |
| `apps/api/src/config/env.ts` | add `DB_POOL_MAX` |
| `apps/api/src/modules/db/db.provider.ts` | pass `env.DB_POOL_MAX` to `createDb` |
| `deploy/home/docker-compose.prod.yml` | Postgres/Redis tuning, `mem_limit`, `NODE_OPTIONS`, `DB_POOL_MAX`, `stop_grace_period` |

---

## Task 1: Frontend code-splitting

Turn the single 683 kB chunk into a cached vendor chunk + per-route lazy chunks (admin routes load only in admin). Target: the reader's loaded JS (entry + vendor + reader-route chunk) is meaningfully smaller, entry < 300 kB raw.

**Files:**
- Modify: `apps/frontend/vite.config.ts`

- [ ] **Step 1: Record the baseline build**

Run: `pnpm --filter @smanga/frontend build`
Expected: one `dist/assets/index-*.js` ≈ 683 kB raw / 196 kB gzip + the ">500 kB" warning. Note the numbers.

- [ ] **Step 2: Enable autoCodeSplitting + vendor manualChunks**

Replace the whole `apps/frontend/vite.config.ts` with:

```typescript
import path from 'node:path';
import { TanStackRouterVite } from '@tanstack/router-vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // autoCodeSplitting: each route's component/loader is emitted as its own
  // lazy chunk, so admin routes (and every non-landing reader route) load only
  // when navigated to — they no longer sit in the entry bundle.
  plugins: [TanStackRouterVite({ autoCodeSplitting: true }), react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        // Long-lived framework deps in one cacheable vendor chunk so they're
        // not re-downloaded when app code changes.
        manualChunks: {
          vendor: ['react', 'react-dom', '@tanstack/react-router', '@tanstack/react-query'],
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/sitemap.xml': { target: 'http://localhost:3001', changeOrigin: true },
      '/sitemap-stories.xml': { target: 'http://localhost:3001', changeOrigin: true },
      '/sitemap-chapters.xml': { target: 'http://localhost:3001', changeOrigin: true },
      '/robots.txt': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
```

- [ ] **Step 3: Rebuild and verify the split**

Run: `pnpm --filter @smanga/frontend build`
Expected: MULTIPLE `dist/assets/*.js` chunks — a `vendor-*.js`, an `index-*.js` (entry, now much smaller), and separate per-route chunks (admin routes in their own files). Paste the full chunk listing into your report. **Acceptance:** the entry `index-*.js` is meaningfully smaller than the 683 kB baseline and < 300 kB raw; admin route code is in separate chunk(s), not the entry. (The `vendor` chunk may still exceed Vite's 500 kB warning — that's expected and fine; it's cached and loaded once. Do NOT bump `chunkSizeWarningLimit` to hide it.)

If the entry is still ≥ 300 kB, report it as DONE_WITH_CONCERNS with the chunk listing — do not invent extra splitting beyond the spec.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: PASS (autoCodeSplitting regenerates `routeTree.gen.ts`, which is gitignored).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/vite.config.ts
git commit -m "perf(frontend): code-split routes + vendor chunk"
```

---

## Task 2: Reader scroll smoothness

The route component re-renders on every scroll frame because `setScrollProgress` lives in its own window-scroll listener — re-running the paragraph split + drop-cap regex over the whole chapter each frame. Extract the progress bar into a self-contained, rAF-throttled component (isolating the 60 fps state to a tiny subtree) and memoize the paragraph array + word count.

**Files:**
- Create: `apps/frontend/src/lib/reader-progress.ts`
- Test: `apps/frontend/src/lib/reader-progress.test.ts`
- Create: `apps/frontend/src/components/reader/ReadingProgressBar.tsx`
- Modify: `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx`

- [ ] **Step 1: Write the failing test for the pure helpers**

Create `apps/frontend/src/lib/reader-progress.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { countWords, scrollPercent } from './reader-progress';

describe('countWords', () => {
  it('counts whitespace-separated tokens', () => {
    expect(countWords('mot hai ba')).toBe(3);
    expect(countWords('  spaced   out \n words ')).toBe(3);
  });
  it('returns 0 for empty / undefined', () => {
    expect(countWords('')).toBe(0);
    expect(countWords(undefined)).toBe(0);
  });
});

describe('scrollPercent', () => {
  it('is 0 at top and 100 at bottom', () => {
    expect(scrollPercent(0, 2000, 800)).toBe(0); // max = 1200
    expect(scrollPercent(1200, 2000, 800)).toBe(100);
  });
  it('clamps to 100 and never divides by zero', () => {
    expect(scrollPercent(5000, 2000, 800)).toBe(100);
    expect(scrollPercent(100, 800, 800)).toBe(0); // max = 0 → 0, no NaN
    expect(scrollPercent(100, 700, 800)).toBe(0); // negative max → 0
  });
  it('interpolates linearly', () => {
    expect(scrollPercent(600, 2000, 800)).toBe(50); // 600 / 1200
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @smanga/frontend exec vitest run src/lib/reader-progress.test.ts`
Expected: FAIL — module `./reader-progress` not found.

- [ ] **Step 3: Write the pure helpers**

Create `apps/frontend/src/lib/reader-progress.ts`:

```typescript
/** Word count for reading-time estimate — whitespace-separated tokens. */
export function countWords(text: string | undefined | null): number {
  return (text?.match(/\S+/g) ?? []).length;
}

/** Scroll position as a 0–100 percentage, clamped, divide-by-zero safe. */
export function scrollPercent(scrollY: number, scrollHeight: number, innerHeight: number): number {
  const max = scrollHeight - innerHeight;
  if (max <= 0) return 0;
  return Math.min(100, (scrollY / max) * 100);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @smanga/frontend exec vitest run src/lib/reader-progress.test.ts`
Expected: PASS (3 + 2 cases).

- [ ] **Step 5: Create the self-contained progress bar**

Create `apps/frontend/src/components/reader/ReadingProgressBar.tsx`:

```tsx
import { scrollPercent } from '@/lib/reader-progress';
import { useEffect, useState } from 'react';

/**
 * Fixed top scroll-progress bar. Owns its own rAF-throttled scroll listener and
 * progress state, so the high-frequency (60 fps) progress updates re-render ONLY
 * this tiny subtree — not the whole ChapterReader (which would otherwise re-run
 * the paragraph split + drop-cap regex over the full chapter on every frame).
 */
export function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    let raf = 0;
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(() => {
        const doc = document.documentElement;
        setProgress(scrollPercent(window.scrollY, doc.scrollHeight, window.innerHeight));
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // initialize for short pages / restored scroll position
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      role="progressbar"
      tabIndex={-1}
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Tiến độ đọc"
      className="fixed top-0 left-0 right-0 h-0.5 bg-bg-subtle z-50"
    >
      <div
        className="h-full bg-accent-gradient shadow-glow-pink-soft"
        style={{ width: `${progress}%`, transition: reduceMotion ? 'none' : 'width 100ms linear' }}
      />
    </div>
  );
}
```

- [ ] **Step 6: Wire it into the reader route**

In `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx`:

(a) Update the imports: add `useMemo` to the React import (line 13) and add the helper + component imports. Change line 13 `import { useEffect, useState } from 'react';` to:
```tsx
import { useEffect, useMemo, useState } from 'react';
```
Add these two import lines alongside the existing `@/components/...` imports near the top:
```tsx
import { ReadingProgressBar } from '@/components/reader/ReadingProgressBar';
import { countWords } from '@/lib/reader-progress';
```

(b) Remove the `scrollProgress` state. Delete line 29:
```tsx
  const [scrollProgress, setScrollProgress] = useState(0);
```

(c) Add memoized derivations right after the `useQuery` block (after line 39, before the view-tracking hooks) — these are hooks so they MUST be above the `if (isLoading || !data)` early return:
```tsx
  // Memoize the per-chapter parse so scroll re-renders never recompute it.
  const content = data?.chapter.content;
  const paragraphs = useMemo(() => (content ? content.split('\n\n') : []), [content]);
  const wordCount = useMemo(() => countWords(content), [content]);
```

(d) In the chrome-hide effect, delete the `setScrollProgress` line (the old line 63):
```tsx
      setScrollProgress(max > 0 ? Math.min(100, (y / max) * 100) : 0);
```
The surrounding `const doc`/`const max` lines were only used for that calc — remove them too. The effect's `onScroll` should become:
```tsx
    function onScroll() {
      const y = window.scrollY;
      const goingDown = y > lastY;
      lastY = y;
      if (goingDown && y > 200) {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setChromeVisible(false), 600);
      } else if (!goingDown) {
        clearTimeout(hideTimer);
        setChromeVisible(true);
      }
    }
```

(e) Delete the old word-count line (line 115) since `wordCount` is now the memoized value above:
```tsx
  const wordCount = (chapter.content?.match(/\S+/g) ?? []).length;
```
(Keep `const readingMinutes = Math.max(1, Math.ceil(wordCount / 250));` — it now reads the memoized `wordCount`.)

(f) Replace the inline progress-bar JSX (the whole `<div role="progressbar" …>…</div>` block, old lines 187–208 including its comment) with:
```tsx
      <ReadingProgressBar />
```

(g) Replace the paragraph render (old line 271) — change:
```tsx
            {chapter.content.split('\n\n').map(renderParagraph)}
```
to:
```tsx
            {paragraphs.map(renderParagraph)}
```

- [ ] **Step 7: Typecheck + test + build**

Run: `pnpm --filter @smanga/frontend exec vitest run src/lib/reader-progress.test.ts` → PASS.
Run: `pnpm --filter @smanga/frontend typecheck` → PASS (no unused `useState`/`reduceMotion` errors — `reduceMotion` is still used by the chrome `<header>` className; `useState` still used by `chromeVisible`).
Run: `pnpm --filter @smanga/frontend build` → success.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/lib/reader-progress.ts apps/frontend/src/lib/reader-progress.test.ts apps/frontend/src/components/reader/ReadingProgressBar.tsx apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx
git commit -m "perf(frontend): isolate reader scroll progress + memoize chapter parse"
```

---

## Task 3: Self-host fonts + remove dead GSC meta

Replace the render-blocking Google Fonts CDN `<link>` (third-party DNS + connection + render-block) with same-origin self-hosted `@fontsource` (Cloudflare-edge-cached, `font-display: swap`). Keep the exact typefaces and family names (Inter + Newsreader) so there is no visual regression. Drop JetBrains Mono entirely (admin-only monospace → system mono, matching what `ThemeProvider` already does). Remove the dead `REPLACE_AFTER_GSC_SETUP` meta.

**Files:**
- Modify: `apps/frontend/package.json` (deps)
- Modify: `apps/frontend/src/main.tsx`
- Modify: `apps/frontend/index.html`
- Modify: `apps/frontend/tailwind.config.ts`

- [ ] **Step 1: Install the font packages**

Run: `pnpm --filter @smanga/frontend add @fontsource/inter @fontsource/newsreader`
Expected: both added to `apps/frontend/package.json` dependencies; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Import the used weights in the entry**

In `apps/frontend/src/main.tsx`, add these imports at the very top (above the existing imports), then the existing `import './styles.css';` stays last so app CSS wins cascade ties:

```tsx
// Self-hosted fonts (same-origin, font-display: swap). Weights match the former
// Google Fonts request: Inter 400/500/600/700/800, Newsreader 400/600/700 + 400 italic.
// @fontsource registers @font-face for ALL subsets incl. `vietnamese` with
// unicode-range, so Vietnamese glyphs are covered and fetched on demand.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/600.css';
import '@fontsource/newsreader/700.css';
import '@fontsource/newsreader/400-italic.css';
```

(If any of those exact CSS subpaths fail to resolve at build time, `ls node_modules/@fontsource/inter/` / `…/newsreader/` and use the present filenames — the weight `.css` files are the standard @fontsource layout, but verify rather than guess.)

- [ ] **Step 3: Remove the Google Fonts link + preconnects + dead GSC meta**

In `apps/frontend/index.html`, delete these lines: the GSC verification comment + meta (the `<!-- Google Search Console … -->` comment block AND the `<meta name="google-site-verification" content="REPLACE_AFTER_GSC_SETUP" />` line), the two `<link rel="preconnect" …>` lines, and the Google Fonts `<link href="https://fonts.googleapis.com/css2?…" rel="stylesheet" />`. The resulting `<head>` should be:

```html
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" sizes="any" href="/favicon.ico" />
    <title>SManga — Đọc truyện chữ Việt online miễn phí</title>
  </head>
```

(GSC ownership is already verified via DNS-TXT, so the placeholder meta did nothing. If HTML-tag verification is ever wanted, re-add a meta with the real content value.)

- [ ] **Step 4: Drop JetBrains Mono from the Tailwind theme**

In `apps/frontend/tailwind.config.ts`, change the `mono` line in `fontFamily` (it currently lists `'JetBrains Mono'` first) to a system stack — matching `ThemeProvider.FAMILY_CSS.mono` which already uses system mono:

```typescript
        mono:    ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
```

(JetBrains Mono is only used by `font-mono` in admin tables/IDs + the reader's optional user-selected mono body — system monospace renders these fine and removes a whole typeface download. No `@fontsource` for it.)

- [ ] **Step 5: Build + typecheck**

Run: `pnpm --filter @smanga/frontend build` → success; the chunk listing now includes hashed `dist/assets/*.woff2` font files (Inter + Newsreader subsets), and NO request to `fonts.googleapis.com` remains in `dist/index.html`.
Run: `pnpm --filter @smanga/frontend typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/package.json pnpm-lock.yaml apps/frontend/src/main.tsx apps/frontend/index.html apps/frontend/tailwind.config.ts
git commit -m "perf(frontend): self-host fonts via @fontsource; drop JetBrains Mono + dead GSC meta"
```

**Note (preload deferred):** spec §6.3 mentions woff2 preload. `@fontsource` woff2 files are bundled with Vite-hashed names, so a static `<link rel=preload>` in `index.html` can't reference them, and JS-injected preload runs too late to help. Same-origin + Cloudflare edge cache + `font-display: swap` already deliver the perceived-perf win (no third-party connection, no invisible text). Manual preload would need a Vite preload plugin — out of scope for this phase; recorded as a follow-up.

---

## Task 4: DB pool size via `DB_POOL_MAX`

Make the connection pool size configurable so prod can run a larger pool (25) than the dev default (10).

**Files:**
- Modify: `packages/db/src/client.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/modules/db/db.provider.ts`

- [ ] **Step 1: Parameterize `createDb`**

Replace `packages/db/src/client.ts` with:

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.ts';

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString: string, max = 10) {
  const queryClient = postgres(connectionString, { max });
  return drizzle(queryClient, { schema });
}
```

(The CLI caller `apps/cli/src/crawl.ts` keeps calling `createDb(connection)` → default 10, unchanged.)

- [ ] **Step 2: Add `DB_POOL_MAX` to the api env schema**

In `apps/api/src/config/env.ts`, add this field inside the `z.object({ … })` (e.g. after `REDIS_URL`):

```typescript
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
```

- [ ] **Step 3: Pass it through the Drizzle provider**

Replace `apps/api/src/modules/db/db.provider.ts` line 7–10 with:

```typescript
export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  useFactory: (): Database => {
    const env = loadEnv();
    return createDb(env.DATABASE_URL, env.DB_POOL_MAX);
  },
};
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @smanga/api typecheck` → PASS.
Run: `pnpm --filter @smanga/db typecheck` → PASS.
Run: `pnpm --filter @smanga/api build` → webpack success.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/client.ts apps/api/src/config/env.ts apps/api/src/modules/db/db.provider.ts
git commit -m "feat(db): configurable pool size via DB_POOL_MAX (default 10)"
```

---

## Task 5: Operator compose tuning (lands in git, applied on the laptop)

Add Postgres/Redis tuning, memory limits, `NODE_OPTIONS`, `DB_POOL_MAX=25`, and `stop_grace_period` (the latter also closes the Phase 3 follow-up — graceful Bull shutdown needs Docker to wait past the 10 s default before SIGKILL). This file lands in git; the user applies it on the laptop with `git pull && docker compose up -d`.

**Files:**
- Modify: `deploy/home/docker-compose.prod.yml`

- [ ] **Step 1: Apply the tuning**

Edit `deploy/home/docker-compose.prod.yml` so the services read as below (only the additive changes shown — keep all existing `image`/`environment`/`volumes`/`healthcheck`/`labels`/`depends_on` keys):

`postgres` — add `command:` (tuning flags), `mem_limit`, `stop_grace_period`:
```yaml
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    command:
      - postgres
      - -c
      - shared_buffers=1GB
      - -c
      - effective_cache_size=3GB
      - -c
      - work_mem=32MB
      - -c
      - maintenance_work_mem=256MB
      - -c
      - random_page_cost=1.1
    mem_limit: 2g
    stop_grace_period: 30s
    environment:
      POSTGRES_DB: smanga
      POSTGRES_USER: smanga
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init-db.sh:/docker-entrypoint-initdb.d/init.sh:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U smanga -d smanga"]
      interval: 10s
      timeout: 5s
      retries: 5
```

`redis` — add `--maxmemory`/`--maxmemory-policy` to the command, `mem_limit`, `stop_grace_period` (Bull REQUIRES `noeviction` — never let Redis evict job keys):
```yaml
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--save", "60", "1", "--appendonly", "yes", "--maxmemory", "768mb", "--maxmemory-policy", "noeviction"]
    mem_limit: 1g
    stop_grace_period: 30s
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
```

`api` — add `NODE_OPTIONS` + `DB_POOL_MAX` to `environment`, plus `mem_limit` and `stop_grace_period: 90s` (long enough for `enableShutdownHooks` to close Bull + finish a long cheerio job — Phase 3 follow-up):
```yaml
  api:
    image: ghcr.io/${GHCR_OWNER}/smanga-api:latest
    restart: unless-stopped
    mem_limit: 1.5g
    stop_grace_period: 90s
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    environment:
      NODE_ENV: production
      PORT: "3001"
      NODE_OPTIONS: "--max-old-space-size=1024"
      DB_POOL_MAX: "25"
      DATABASE_URL: postgres://smanga:${POSTGRES_PASSWORD}@postgres:5432/smanga
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      FRONTEND_BASE_URL: https://smanga.shop
      AUTH_GOOGLE_ID: ${AUTH_GOOGLE_ID}
      AUTH_GOOGLE_SECRET: ${AUTH_GOOGLE_SECRET}
      AUTH_GOOGLE_CALLBACK_URL: https://smanga.shop/api/v1/auth/google/callback
    command: ["sh", "-c", "pnpm --filter @smanga/db migrate && node apps/api/dist/main.js"]
    labels:
      com.centurylinklabs.watchtower.enable: "true"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3001/api/v1/health || exit 1"]
      interval: 30s
      timeout: 5s
      start_period: 60s
```

`frontend` — add `stop_grace_period`:
```yaml
  frontend:
    image: ghcr.io/${GHCR_OWNER}/smanga-frontend:latest
    restart: unless-stopped
    stop_grace_period: 15s
    labels:
      com.centurylinklabs.watchtower.enable: "true"
```

(`caddy` and `watchtower` services unchanged.)

- [ ] **Step 2: Validate YAML**

Run: `docker compose -f deploy/home/docker-compose.prod.yml config --no-interpolate > /dev/null && echo OK`
Expected: `OK` (YAML parses; `--no-interpolate` skips the `${…}` env vars not present in this checkout). If `docker` is unavailable in the worker env, instead confirm valid YAML with any YAML parser / report DONE_WITH_CONCERNS noting it couldn't be validated locally.

- [ ] **Step 3: Add the operator runbook**

Append an OPERATOR section to `deploy/CLOUDFLARE-CACHE-RULES.md`? No — create `deploy/PHASE4-HOST-TUNING.md` with the apply steps:

```markdown
# Phase 4 — Laptop host tuning (operator apply)

The compose tuning (Postgres/Redis flags, mem_limits, NODE_OPTIONS, DB_POOL_MAX=25,
stop_grace_period) is committed in `deploy/home/docker-compose.prod.yml`. Apply on
the laptop (`sunny-server`):

1. **Pre-check RAM** — values assume ≥ 8 GB:
   ```bash
   free -h
   ```
   If total RAM < 8 GB, HALVE the Postgres/Redis values first (edit the compose on
   the laptop or via a follow-up commit): `shared_buffers=512MB`,
   `effective_cache_size=1536MB`, `maintenance_work_mem=128MB`, postgres `mem_limit: 1g`,
   redis `--maxmemory 384mb`, api `--max-old-space-size=768` + `mem_limit: 1g`.

2. **Apply:**
   ```bash
   cd ~/smanga   # the deploy dir on the laptop
   git pull
   docker compose -f deploy/home/docker-compose.prod.yml up -d
   ```
   `up -d` recreates only the services whose config changed (postgres, redis, api,
   frontend). Postgres keeps its `postgres-data` volume; Redis keeps `redis-data`.

3. **Verify after restart:**
   ```bash
   docker compose -f deploy/home/docker-compose.prod.yml ps          # all healthy
   docker exec <postgres> psql -U smanga -d smanga -c 'SHOW shared_buffers;'   # 1GB
   docker exec <redis> redis-cli CONFIG GET maxmemory-policy                   # noeviction
   curl -sI https://smanga.shop/api/v1/health                                  # 200
   ```

4. **Rollback:** `git revert` the compose commit + `docker compose up -d` (volumes
   are untouched, so this is safe).
```

- [ ] **Step 4: Commit**

```bash
git add deploy/home/docker-compose.prod.yml deploy/PHASE4-HOST-TUNING.md
git commit -m "ops: Postgres/Redis tuning + mem limits + NODE_OPTIONS + DB_POOL_MAX + stop_grace_period"
```

---

## Task 6: Verify + finish (controller)

- [ ] **Step 1: Full suite + typecheck + frontend build**

Run: `pnpm test` → all green (adds the 2 reader-progress test groups).
Run: `pnpm typecheck` → all 6 packages PASS.
Run: `pnpm --filter @smanga/frontend build` → success; record the final chunk listing (entry < 300 kB raw; vendor + per-route chunks present).

- [ ] **Step 2: Local dev + Playwright proof (controller-run; needs the dev stack)**

Start `pnpm dev:frontend` (+ a local api on PORT=3010, Vite proxy pointed at it) and Playwright-screenshot a chapter reader page: confirm (a) fonts render (Inter UI / Newsreader prose, no fallback-stuck text), (b) the scroll-progress bar tracks scrolling, (c) navigating reader→admin and back works (code-split chunks load without error in the console). Save the proof. This is the house-rule gate before any push of the FE changes.

- [ ] **Step 3: Finish**

Use `superpowers:finishing-a-development-branch` substance: confirm clean tree, commit-only (do NOT push without the user's explicit ask — push auto-deploys api+frontend via CI→Watchtower). After the user pushes + Watchtower deploys, and after the user applies the Task 5 compose on the laptop, **re-run the §1 prod-probe table** (browse TTFB, counts, cover/JSON edge HIT, a chapter-URL transfer-size/Lighthouse spot check) and record the numbers — this is the performance program's overall success metric.

---

## Self-review (author's checklist — completed)

**Spec §6 coverage:** §6.1 code-split → Task 1 (autoCodeSplitting + manualChunks; acceptance entry < 300 kB). §6.2 reader smoothness → Task 2 (rAF-throttled `ReadingProgressBar` owning the listener/state + `useMemo` paragraphs + wordCount). §6.3 fonts → Task 3 (self-host Inter+Newsreader via @fontsource, drop JetBrains Mono, remove the `REPLACE_AFTER_GSC_SETUP` meta) — **preload explicitly deferred** with rationale (bundled-hash + JS-late-injection); flagged, not silently dropped. §6.4 host tuning → Task 4 (`DB_POOL_MAX` wiring) + Task 5 (compose: Postgres flags, Redis maxmemory/noeviction, mem_limits, `NODE_OPTIONS`, `DB_POOL_MAX=25`, `stop_grace_period`). §6 verification → Task 6 (chunk listing + Lighthouse/transfer-size + §1 prod-probe re-run). Phase-3 `stop_grace_period` follow-up folded into Task 5. Scope note: the "Fraunces+Outfit" design-direction memory is NOT implemented and is OUT of this perf phase (a separate design decision); fonts keep the in-use Inter+Newsreader.

**Placeholder scan:** every code step has complete code; `@fontsource` weight subpaths carry a verify-against-installed-package instruction (concrete expected values, not a TBD).

**Type consistency:** `countWords(text)` + `scrollPercent(scrollY, scrollHeight, innerHeight)` defined in Task 2 Step 3 are imported/called with those exact signatures in the test (Step 1), `ReadingProgressBar` (Step 5), and the reader route (Step 6). `createDb(connectionString, max = 10)` (Task 4 Step 1) is called `createDb(env.DATABASE_URL, env.DB_POOL_MAX)` (Step 3) and `createDb(connection)` (CLI, unchanged) — both valid against the default. `env.DB_POOL_MAX` (Step 2) matches the provider usage (Step 3). The reader route's `wordCount`/`paragraphs`/`<ReadingProgressBar/>` references all resolve to the Task 2 additions.
