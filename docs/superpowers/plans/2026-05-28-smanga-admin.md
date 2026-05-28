# SManga Admin Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js admin operability layer — auth-gated `/admin/*` pages that let an operator add sources, import stories from a URL, and trigger / monitor / retry crawl jobs — plus a `services/crawler-worker` process that consumes pg-boss jobs by calling the existing `@smanga/crawler` engine.

**Architecture:** Single Next.js 15 App Router app at `apps/web` serving both `/admin/*` (auth-gated) and a placeholder public root (Plan 3 fleshes that out). API routes in the same app enqueue pg-boss jobs into the existing Postgres database (no Redis). A separate Node process at `services/crawler-worker` polls the same pg-boss queue and calls `importStory` / `fetchChapterById` from `@smanga/crawler`. Auth.js v5 with Drizzle adapter (email/password Credentials + Google OAuth) using the auth tables already migrated in Plan 1. Worker triggers Next.js cache revalidation via a shared-secret webhook so Plan 3's ISR reader can update on new chapters.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS 4, shadcn/ui (Radix-based), Auth.js v5 (`next-auth@5.0.0-beta`) + `@auth/drizzle-adapter`, pg-boss 10, bcrypt for password hashing, Zod for form/payload validation, Playwright for one e2e smoke. Reuses `@smanga/db`, `@smanga/shared`, `@smanga/crawler` from Plan 1.

---

## File structure (locked in before tasks)

```
apps/
  web/
    package.json
    next.config.mjs
    tailwind.config.ts
    postcss.config.mjs
    tsconfig.json
    components.json                  shadcn CLI config
    src/
      app/
        layout.tsx                   root layout
        page.tsx                     placeholder landing (Plan 3 owns)
        globals.css                  tailwind directives
        api/
          auth/
            [...nextauth]/route.ts   Auth.js handlers
          register/route.ts          POST: create user (email/password) [optional in Plan 2; required for admin self-onboard]
          admin/
            sources/route.ts         GET (list) + POST (create)
            sources/[id]/route.ts    PATCH + DELETE
            stories/import/route.ts  POST: enqueue 'import-story'
            stories/[id]/crawl/route.ts  POST: enqueue chapter crawl (modes: missing | one | all)
            jobs/route.ts            GET: queue stats
            jobs/[id]/retry/route.ts POST: requeue failed job
          cover/[storyId]/route.ts   GET cover bytea with cache headers
          revalidate/route.ts        POST: worker → revalidatePath via shared secret
        dang-nhap/page.tsx           sign-in (email/password + Google)
        admin/
          layout.tsx                 enforces session.role === 'admin'
          page.tsx                   dashboard (counts + recent jobs)
          sources/page.tsx
          stories/page.tsx           list + import form
          stories/[id]/page.tsx      detail + chapter table + crawl buttons
          jobs/page.tsx
      server/
        auth.ts                      Auth.js config (NextAuth({ ... }))
        db.ts                        memoised createDb(process.env.DATABASE_URL!)
        queue.ts                     getBoss() + typed enqueue helpers
        revalidate.ts                shared-secret check helper for worker webhook
      lib/
        env.ts                       Zod-validated process.env schema
        format.ts                    bytes/date formatters used by admin tables
      middleware.ts                  redirect non-admin from /admin/*
      components/
        ui/                          shadcn-generated primitives (button, input, card, table, badge, dialog, toast)
        admin/
          SourceForm.tsx             create source form (client)
          SourceList.tsx             server component fetching sources
          ImportStoryForm.tsx        client form posting to /api/admin/stories/import
          StoryTable.tsx             server component listing stories
          ChapterCrawlPanel.tsx      client buttons (crawl missing / recrawl all) + per-chapter retry
          JobStatusBadge.tsx         pure component
          JobsTable.tsx              server component
services/
  crawler-worker/
    package.json
    tsconfig.json
    src/
      index.ts                       bootstrap: getBoss() + worker.work(...)
      jobs/
        import-story.ts              { url } → engine.importStory + revalidate webhook
        fetch-chapter.ts             { chapterId } → engine.fetchChapterById + revalidate
      revalidate-client.ts           POST to web /api/revalidate with secret
packages/
  shared/
    src/
      jobs.ts                        Zod payload schemas for pg-boss jobs (NEW)
      index.ts                       re-export jobs.ts
```

**Why this split:** `apps/web/src/server/*` holds server-only concerns (db, auth, queue) imported by route handlers and server components. `components/admin/*` is the admin-only UI, separate from `components/ui/*` (shadcn primitives that the future reader UI will reuse). `services/crawler-worker` deliberately lives outside `apps/web` so it can be deployed as a separate process without bundling Next.js. Job payload schemas live in `@smanga/shared` so producer (web API route) and consumer (worker) typecheck against the same source.

---

## Heads-up: workarounds inherited from Plan 1

These bit the foundation plan; future tasks must respect them:

- Cross-schema imports inside `packages/db/src/schema/*.ts` use `.ts` extensions (drizzle-kit CJS limitation). The barrel `packages/db/src/schema/index.ts` uses `.js`. When importing from `@smanga/db` in Next.js or the worker, **always import from `@smanga/db` or `@smanga/db/schema`** (the package boundary), never reach into `packages/db/src/schema/*.ts` directly.
- Consumer tsconfigs need `allowImportingTsExtensions: true, noEmit: true` to typecheck cleanly through the db package. `apps/web` and `services/crawler-worker` must set these.
- `@smanga/crawler` registers `truyenfullAdapter` as a side effect on import. Both web (for adapter resolution at enqueue time, optional) and worker (for actually running the crawl) must import the package once at startup.
- Cover bytea served via Next.js route must set `Cache-Control: public, max-age=31536000, immutable` + ETag.

---

### Task 1: `apps/web` Next.js scaffold + Tailwind

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Write `apps/web/package.json`**

```json
{
  "name": "@smanga/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --turbo --port 3000",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "next lint"
  },
  "dependencies": {
    "@smanga/crawler": "workspace:*",
    "@smanga/db": "workspace:*",
    "@smanga/shared": "workspace:*",
    "next": "15.0.3",
    "next-auth": "5.0.0-beta.25",
    "@auth/drizzle-adapter": "1.7.2",
    "pg-boss": "10.1.5",
    "bcrypt": "5.1.1",
    "react": "19.0.0-rc-66855b96-20241106",
    "react-dom": "19.0.0-rc-66855b96-20241106",
    "zod": "3.23.8",
    "drizzle-orm": "0.36.0",
    "@radix-ui/react-dialog": "1.1.2",
    "@radix-ui/react-slot": "1.1.0",
    "@radix-ui/react-label": "2.1.0",
    "class-variance-authority": "0.7.0",
    "clsx": "2.1.1",
    "tailwind-merge": "2.5.4",
    "lucide-react": "0.454.0"
  },
  "devDependencies": {
    "@types/bcrypt": "5.0.2",
    "@types/node": "20.17.6",
    "@types/react": "18.3.12",
    "@types/react-dom": "18.3.1",
    "autoprefixer": "10.4.20",
    "postcss": "8.4.49",
    "tailwindcss": "3.4.14",
    "typescript": "5.6.3"
  }
}
```

Note: React 19 RC + Next 15 is the official combo. We pin React 18 types because Next ships React 19 typings via `@types/react@18.3.12` aliased internally; if the typecheck complains about React 19/18 type mismatch, set `"@types/react": "npm:types-react@19.0.0-rc.1"` and run pnpm install again.

- [ ] **Step 2: Write `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": ".next",
    "rootDir": ".",
    "jsx": "preserve",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `apps/web/next.config.mjs`**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { typedRoutes: false },
  transpilePackages: ['@smanga/db', '@smanga/shared', '@smanga/crawler'],
};
export default nextConfig;
```

- [ ] **Step 4: Write `apps/web/postcss.config.mjs`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Write `apps/web/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 6: Write `apps/web/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --border: 240 5.9% 90%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --border: 240 3.7% 15.9%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
  }
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

- [ ] **Step 7: Write `apps/web/src/app/layout.tsx`**

```tsx
import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'SManga',
  description: 'Đọc truyện chữ',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Write `apps/web/src/app/page.tsx`** (placeholder; Plan 3 will replace)

```tsx
export default function HomePage() {
  return (
    <main className="container py-12">
      <h1 className="text-3xl font-bold">SManga</h1>
      <p className="text-muted-foreground mt-2">Reader UI is shipped in Plan 3.</p>
      <p className="mt-4">
        Admin: <a className="underline" href="/admin">/admin</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 9: Install and verify**

Run: `pnpm install`
Expected: pulls in next, react, tailwind, auth, etc.

Run: `pnpm --filter @smanga/web typecheck`
Expected: PASS (it's allowed if Next emits `next-env.d.ts` lazily — re-run after `next dev` if needed).

Run: `pnpm --filter @smanga/web dev` for ~10 seconds, hit `http://localhost:3000`, confirm "SManga" heading renders. Kill it.

- [ ] **Step 10: Commit**

```
git add -A
git commit -m "feat(web): scaffold Next.js 15 app with tailwind"
```

---

### Task 2: shadcn/ui primitives (button, input, card, table, badge, label, dialog, toast)

**Files:**
- Create: `apps/web/components.json`
- Create: `apps/web/src/lib/cn.ts`
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/input.tsx`
- Create: `apps/web/src/components/ui/label.tsx`
- Create: `apps/web/src/components/ui/card.tsx`
- Create: `apps/web/src/components/ui/table.tsx`
- Create: `apps/web/src/components/ui/badge.tsx`

(Dialog/toast are nice-to-have; skip for Plan 2 — keep YAGNI.)

- [ ] **Step 1: Write `apps/web/components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/cn",
    "ui": "@/components/ui"
  }
}
```

- [ ] **Step 2: Write `apps/web/src/lib/cn.ts`**

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Write `apps/web/src/components/ui/button.tsx`**

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-border bg-background hover:bg-muted hover:text-foreground',
        ghost: 'hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3 text-sm',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';
export { buttonVariants };
```

- [ ] **Step 4: Write `apps/web/src/components/ui/input.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/cn';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
```

- [ ] **Step 5: Write `apps/web/src/components/ui/label.tsx`**

```tsx
'use client';
import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/cn';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)}
    {...props}
  />
));
Label.displayName = 'Label';
```

- [ ] **Step 6: Write `apps/web/src/components/ui/card.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/cn';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-lg border border-border bg-background shadow-sm', className)} {...props} />
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />,
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />,
);
CardContent.displayName = 'CardContent';
```

- [ ] **Step 7: Write `apps/web/src/components/ui/table.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/cn';

export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  ),
);
Table.displayName = 'Table';

export const Thead = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />,
);
Thead.displayName = 'Thead';

export const Tbody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />,
);
Tbody.displayName = 'Tbody';

export const Tr = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('border-b transition-colors hover:bg-muted/50', className)} {...props} />
  ),
);
Tr.displayName = 'Tr';

export const Th = React.forwardRef<HTMLTableCellElement, React.HTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn('h-10 px-4 text-left align-middle font-medium text-muted-foreground', className)} {...props} />
  ),
);
Th.displayName = 'Th';

export const Td = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => <td ref={ref} className={cn('p-4 align-middle', className)} {...props} />,
);
Td.displayName = 'Td';
```

- [ ] **Step 8: Write `apps/web/src/components/ui/badge.tsx`**

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const badgeVariants = cva('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-primary/10 text-primary',
      secondary: 'bg-muted text-muted-foreground',
      destructive: 'bg-destructive/10 text-destructive',
      success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

- [ ] **Step 9: Verify**

Run: `pnpm --filter @smanga/web typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```
git add -A
git commit -m "feat(web): add shadcn/ui primitives (button, input, label, card, table, badge)"
```

---

### Task 3: Env schema + server db client + memoised pg-boss singleton

**Files:**
- Create: `apps/web/src/lib/env.ts`
- Create: `apps/web/src/server/db.ts`
- Create: `apps/web/src/server/queue.ts`
- Create: `packages/shared/src/jobs.ts`
- Modify: `packages/shared/src/index.ts` (append `export * from './jobs.js';`)

- [ ] **Step 1: Write `packages/shared/src/jobs.ts`**

```typescript
import { z } from 'zod';

export const importStoryPayloadSchema = z.object({
  url: z.string().url(),
  requestedBy: z.string().min(1).nullable(),
});
export type ImportStoryPayload = z.infer<typeof importStoryPayloadSchema>;

export const fetchChapterPayloadSchema = z.object({
  chapterId: z.string().uuid(),
});
export type FetchChapterPayload = z.infer<typeof fetchChapterPayloadSchema>;

export const JOB_NAMES = {
  importStory: 'import-story',
  fetchChapter: 'fetch-chapter',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
```

- [ ] **Step 2: Append to `packages/shared/src/index.ts`**

```typescript
export * from './adapter.js';
export * from './errors.js';
export * from './jobs.js';
```

- [ ] **Step 3: Write `apps/web/src/lib/env.ts`**

```typescript
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 chars'),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  REVALIDATE_SECRET: z.string().min(16, 'REVALIDATE_SECRET must be at least 16 chars'),
  NEXT_PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
});

export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
  AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
  REVALIDATE_SECRET: process.env.REVALIDATE_SECRET,
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
});
```

- [ ] **Step 4: Update `.env.example` at repo root**

Append to `c:\Users\son.cu\opswat\project\smanga\.env.example`:

```
AUTH_SECRET=please-change-me-to-32+random-chars
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
REVALIDATE_SECRET=please-change-me-to-32+random-chars
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

Then update local `.env` similarly. Generate secrets:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use one for AUTH_SECRET, another for REVALIDATE_SECRET.

- [ ] **Step 5: Write `apps/web/src/server/db.ts`**

```typescript
import { createDb, type Database } from '@smanga/db';
import { env } from '@/lib/env';

let cached: Database | null = null;

export function getDb(): Database {
  if (!cached) {
    cached = createDb(env.DATABASE_URL);
  }
  return cached;
}
```

- [ ] **Step 6: Write `apps/web/src/server/queue.ts`**

```typescript
import PgBoss from 'pg-boss';
import {
  JOB_NAMES,
  type FetchChapterPayload,
  type ImportStoryPayload,
} from '@smanga/shared';
import { env } from '@/lib/env';

let cached: PgBoss | null = null;
let startPromise: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (cached) return cached;
  if (!startPromise) {
    const boss = new PgBoss(env.DATABASE_URL);
    startPromise = boss.start().then(() => {
      cached = boss;
      return boss;
    });
  }
  return startPromise;
}

export async function enqueueImportStory(payload: ImportStoryPayload): Promise<string> {
  const boss = await getBoss();
  const jobId = await boss.send(JOB_NAMES.importStory, payload, {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
  });
  if (!jobId) throw new Error('failed to enqueue import-story');
  return jobId;
}

export async function enqueueFetchChapter(payload: FetchChapterPayload): Promise<string> {
  const boss = await getBoss();
  const jobId = await boss.send(JOB_NAMES.fetchChapter, payload, {
    singletonKey: `fetch-chapter:${payload.chapterId}`,
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
  });
  if (!jobId) {
    // singletonKey collision — a job is already queued/running for this chapter
    return 'duplicate';
  }
  return jobId;
}
```

- [ ] **Step 7: Verify**

Run: `pnpm install`
Run: `pnpm --filter @smanga/shared typecheck`
Run: `pnpm --filter @smanga/web typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```
git add -A
git commit -m "feat(web,shared): add env schema, db singleton, pg-boss queue, job payload schemas"
```

---

### Task 4: Auth.js v5 — config, registration API, sign-in page

**Files:**
- Create: `apps/web/src/server/auth.ts`
- Create: `apps/web/src/app/api/auth/[...nextauth]/route.ts`
- Create: `apps/web/src/app/api/register/route.ts`
- Create: `apps/web/src/app/dang-nhap/page.tsx`

- [ ] **Step 1: Write `apps/web/src/server/auth.ts`**

```typescript
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { account, session, user, verificationToken } from '@smanga/db/schema';
import { getDb } from './db';
import { env } from '@/lib/env';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const authConfig: NextAuthConfig = {
  secret: env.AUTH_SECRET,
  adapter: DrizzleAdapter(getDb(), {
    usersTable: user,
    accountsTable: account,
    sessionsTable: session,
    verificationTokensTable: verificationToken,
  }),
  session: { strategy: 'jwt' },
  pages: { signIn: '/dang-nhap' },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const db = getDb();
        const [row] = await db.select().from(user).where(eq(user.email, parsed.data.email)).limit(1);
        if (!row || !row.passwordHash) return null;
        const ok = await bcrypt.compare(parsed.data.password, row.passwordHash);
        if (!ok) return null;
        return { id: row.id, email: row.email, name: row.name ?? null, role: row.role };
      },
    }),
    ...(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET
      ? [Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET })]
      : []),
  ],
  callbacks: {
    async jwt({ token, user: u }) {
      if (u) {
        token.role = (u as { role?: string }).role ?? 'user';
        token.uid = (u as { id?: string }).id ?? token.sub;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = (token.uid as string | undefined) ?? token.sub;
        (session.user as { role?: string }).role = (token.role as string | undefined) ?? 'user';
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
```

- [ ] **Step 2: Write `apps/web/src/app/api/auth/[...nextauth]/route.ts`**

```typescript
import { handlers } from '@/server/auth';

export const { GET, POST } = handlers;
```

- [ ] **Step 3: Write `apps/web/src/app/api/register/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { user } from '@smanga/db/schema';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input', issues: parsed.error.issues }, { status: 400 });
  }
  const db = getDb();
  const [existing] = await db.select().from(user).where(eq(user.email, parsed.data.email)).limit(1);
  if (existing) {
    return NextResponse.json({ error: 'email already registered' }, { status: 409 });
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const [created] = await db
    .insert(user)
    .values({
      id: randomUUID(),
      email: parsed.data.email,
      name: parsed.data.name ?? null,
      passwordHash,
    })
    .returning();
  return NextResponse.json({ id: created!.id, email: created!.email });
}
```

- [ ] **Step 4: Write `apps/web/src/app/dang-nhap/page.tsx`**

```tsx
'use client';
import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SignInPage() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await signIn('credentials', { email, password, redirect: false, callbackUrl });
    setBusy(false);
    if (res?.error) {
      setError('Sai email hoặc mật khẩu');
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className="container max-w-md py-16">
      <Card>
        <CardHeader>
          <CardTitle>Đăng nhập</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

Note: `next-auth/react` is the client helper. Ensure `next-auth` package version matches.

- [ ] **Step 5: Add `next-auth/react` provider — not needed in v5 (no SessionProvider) unless using `useSession`**

Skip — `signIn` from `next-auth/react` works without SessionProvider when redirect: false.

- [ ] **Step 6: Add NEXTAUTH_URL env (Auth.js v5 reads AUTH_URL but accepts NEXTAUTH_URL)**

Append to `.env`:

```
AUTH_URL=http://localhost:3000
```

(Production sets this to the real URL.)

- [ ] **Step 7: Promote a test user to admin manually**

Reset DB and register a test user, then promote:

```powershell
# (Postgres is up from earlier)
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm db:migrate
pnpm db:seed

# Start dev server in another shell:
pnpm --filter @smanga/web dev

# In a third shell:
curl -X POST http://localhost:3000/api/register -H "Content-Type: application/json" -d '{"email":"admin@test","password":"adminpassword","name":"Admin"}'

# Promote:
docker exec smanga-postgres psql -U smanga -d smanga -c "UPDATE \"user\" SET role='admin' WHERE email='admin@test';"
```

Visit `http://localhost:3000/dang-nhap`, sign in with admin@test / adminpassword. Should redirect to `/admin` (404 for now since admin layout isn't built — that's Task 5).

- [ ] **Step 8: Commit**

```
git add -A
git commit -m "feat(web): wire Auth.js v5 with credentials + Google OAuth + Drizzle adapter"
```

---

### Task 5: Admin layout + middleware (role gate)

**Files:**
- Create: `apps/web/src/middleware.ts`
- Create: `apps/web/src/app/admin/layout.tsx`
- Create: `apps/web/src/app/admin/page.tsx` (dashboard placeholder)

- [ ] **Step 1: Write `apps/web/src/middleware.ts`**

```typescript
import { NextResponse } from 'next/server';
import { auth } from '@/server/auth';

export default auth((req) => {
  const isAdminRoute = req.nextUrl.pathname.startsWith('/admin');
  const isAdminApi = req.nextUrl.pathname.startsWith('/api/admin');
  if (!isAdminRoute && !isAdminApi) return NextResponse.next();

  const session = req.auth;
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session) {
    const signInUrl = new URL('/dang-nhap', req.nextUrl);
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }
  if (role !== 'admin') {
    if (isAdminApi) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/', req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
```

- [ ] **Step 2: Write `apps/web/src/app/admin/layout.tsx`**

```tsx
import type { ReactNode } from 'react';
import Link from 'next/link';
import { auth, signOut } from '@/server/auth';
import { Button } from '@/components/ui/button';

const NAV = [
  { href: '/admin', label: 'Tổng quan' },
  { href: '/admin/sources', label: 'Sources' },
  { href: '/admin/stories', label: 'Truyện' },
  { href: '/admin/jobs', label: 'Jobs' },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const email = (session?.user?.email as string | undefined) ?? '';
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-border bg-muted/30 p-4 space-y-1">
        <Link href="/admin" className="block font-semibold text-lg mb-4">SManga Admin</Link>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="block rounded px-3 py-2 hover:bg-muted text-sm">
            {n.label}
          </Link>
        ))}
      </aside>
      <main className="flex-1 p-6">
        <div className="flex items-center justify-end gap-4 mb-6 text-sm">
          <span className="text-muted-foreground">{email}</span>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <Button variant="outline" size="sm" type="submit">Đăng xuất</Button>
          </form>
        </div>
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Write `apps/web/src/app/admin/page.tsx`**

```tsx
import { count, eq } from 'drizzle-orm';
import { chapter, source, story } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const db = getDb();
  const [{ value: storyCount }] = await db.select({ value: count() }).from(story);
  const [{ value: sourceCount }] = await db.select({ value: count() }).from(source);
  const [{ value: chapterCount }] = await db.select({ value: count() }).from(chapter);
  const [{ value: crawledCount }] = await db
    .select({ value: count() })
    .from(chapter)
    .where(eq(chapter.status, 'crawled'));

  const cards = [
    { label: 'Sources', value: sourceCount },
    { label: 'Truyện', value: storyCount },
    { label: 'Chapter', value: chapterCount },
    { label: 'Chapter đã crawl', value: crawledCount },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Tổng quan</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @smanga/web dev`. Sign in as admin@test, navigate to `/admin`. Expect 4 count cards (all probably non-zero from earlier crawl). Sign out and try `/admin` again — expect redirect to `/dang-nhap`. Try with non-admin user — expect redirect to `/`.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(web): add admin layout, middleware gating, dashboard counts"
```

---

### Task 6: Admin sources page — list + create + delete API

**Files:**
- Create: `apps/web/src/app/api/admin/sources/route.ts`
- Create: `apps/web/src/app/api/admin/sources/[id]/route.ts`
- Create: `apps/web/src/components/admin/SourceForm.tsx`
- Create: `apps/web/src/app/admin/sources/page.tsx`

- [ ] **Step 1: Write `apps/web/src/app/api/admin/sources/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listAdapters } from '@smanga/crawler';
import { source } from '@smanga/db/schema';
import { getDb } from '@/server/db';

const createSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  baseUrl: z.string().url(),
  rateLimitRps: z.coerce.number().positive().default(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input', issues: parsed.error.issues }, { status: 400 });
  }
  const validIds = new Set(listAdapters().map((a) => a.id));
  if (!validIds.has(parsed.data.id)) {
    return NextResponse.json(
      { error: `no adapter registered for id=${parsed.data.id}. Valid: ${[...validIds].join(', ')}` },
      { status: 400 },
    );
  }
  const db = getDb();
  await db
    .insert(source)
    .values({
      id: parsed.data.id,
      name: parsed.data.name,
      baseUrl: parsed.data.baseUrl,
      rateLimitRps: String(parsed.data.rateLimitRps),
    })
    .onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write `apps/web/src/app/api/admin/sources/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { source } from '@smanga/db/schema';
import { getDb } from '@/server/db';

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  rateLimitRps: z.coerce.number().positive().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name) update.name = parsed.data.name;
  if (parsed.data.baseUrl) update.baseUrl = parsed.data.baseUrl;
  if (parsed.data.rateLimitRps) update.rateLimitRps = String(parsed.data.rateLimitRps);
  if (parsed.data.isActive !== undefined) update.isActive = parsed.data.isActive;
  await getDb().update(source).set(update).where(eq(source.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await getDb().delete(source).where(eq(source.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: `cannot delete source — likely referenced by stories: ${(err as Error).message}` },
      { status: 409 },
    );
  }
}
```

- [ ] **Step 3: Write `apps/web/src/components/admin/SourceForm.tsx`**

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SourceForm() {
  const router = useRouter();
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [rps, setRps] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch('/api/admin/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, baseUrl, rateLimitRps: Number(rps) }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(typeof body.error === 'string' ? body.error : 'Lỗi');
      return;
    }
    setId(''); setName(''); setBaseUrl(''); setRps('1');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end mb-6">
      <div className="space-y-1">
        <Label htmlFor="src-id">ID adapter</Label>
        <Input id="src-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="truyenfull" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="src-name">Tên</Label>
        <Input id="src-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-1 md:col-span-2">
        <Label htmlFor="src-url">Base URL</Label>
        <Input id="src-url" type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="src-rps">RPS</Label>
        <Input id="src-rps" type="number" step="0.1" min="0.1" value={rps} onChange={(e) => setRps(e.target.value)} required />
      </div>
      {error && <p className="md:col-span-5 text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy} className="md:col-span-5">
        {busy ? 'Đang thêm...' : 'Thêm source'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Write `apps/web/src/app/admin/sources/page.tsx`**

```tsx
import { source } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SourceForm } from '@/components/admin/SourceForm';

export const dynamic = 'force-dynamic';

export default async function AdminSourcesPage() {
  const rows = await getDb().select().from(source).orderBy(source.id);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Sources</h1>
      <SourceForm />
      <Table>
        <Thead>
          <Tr>
            <Th>ID</Th><Th>Tên</Th><Th>Base URL</Th><Th>RPS</Th><Th>Trạng thái</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td className="font-mono text-xs">{r.id}</Td>
              <Td>{r.name}</Td>
              <Td className="text-xs">{r.baseUrl}</Td>
              <Td>{r.rateLimitRps}</Td>
              <Td>
                <Badge variant={r.isActive ? 'success' : 'secondary'}>
                  {r.isActive ? 'active' : 'inactive'}
                </Badge>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run dev. Sign in as admin. Go to `/admin/sources` — see `truyenfull` row from earlier seed. Try adding a source with adapter id that does not exist (e.g., `foobar`) — expect error message about no adapter registered.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat(web/admin): sources list page + create form + adapter-id validation"
```

---

### Task 7: Admin stories page — list + import form (enqueues job)

**Files:**
- Create: `apps/web/src/app/api/admin/stories/import/route.ts`
- Create: `apps/web/src/components/admin/ImportStoryForm.tsx`
- Create: `apps/web/src/app/admin/stories/page.tsx`

- [ ] **Step 1: Write `apps/web/src/app/api/admin/stories/import/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAdapterForUrl } from '@smanga/crawler';
import { auth } from '@/server/auth';
import { enqueueImportStory } from '@/server/queue';

const schema = z.object({ url: z.string().url() });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid url' }, { status: 400 });

  try {
    resolveAdapterForUrl(parsed.data.url);
  } catch {
    return NextResponse.json({ error: 'no adapter registered for that hostname' }, { status: 400 });
  }

  const session = await auth();
  const requestedBy = (session?.user as { id?: string } | undefined)?.id ?? null;
  const jobId = await enqueueImportStory({ url: parsed.data.url, requestedBy });
  return NextResponse.json({ jobId });
}
```

- [ ] **Step 2: Write `apps/web/src/components/admin/ImportStoryForm.tsx`**

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ImportStoryForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setBusy(true);
    const res = await fetch('/api/admin/stories/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof body.error === 'string' ? body.error : 'Lỗi');
      return;
    }
    setInfo(`Đã thêm job ${body.jobId}. Theo dõi ở mục Jobs.`);
    setUrl('');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col md:flex-row gap-3 items-start md:items-end mb-6">
      <div className="flex-1 space-y-1">
        <Label htmlFor="story-url">URL truyện</Label>
        <Input
          id="story-url"
          type="url"
          placeholder="https://truyenfull.today/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={busy}>{busy ? 'Đang gửi...' : 'Import truyện'}</Button>
      {error && <p className="basis-full text-sm text-destructive">{error}</p>}
      {info && <p className="basis-full text-sm text-emerald-600">{info}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Write `apps/web/src/app/admin/stories/page.tsx`**

```tsx
import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { story } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ImportStoryForm } from '@/components/admin/ImportStoryForm';

export const dynamic = 'force-dynamic';

export default async function AdminStoriesPage() {
  const rows = await getDb()
    .select({
      id: story.id,
      slug: story.slug,
      title: story.title,
      author: story.author,
      status: story.status,
      totalChapters: story.totalChapters,
      updatedAt: story.updatedAt,
    })
    .from(story)
    .orderBy(desc(story.updatedAt))
    .limit(100);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Truyện</h1>
      <ImportStoryForm />
      <Table>
        <Thead>
          <Tr>
            <Th>Tiêu đề</Th><Th>Tác giả</Th><Th>Trạng thái</Th><Th>Chapter</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td>
                <Link href={`/admin/stories/${r.id}`} className="underline">{r.title}</Link>
              </Td>
              <Td>{r.author ?? '—'}</Td>
              <Td><Badge variant="secondary">{r.status}</Badge></Td>
              <Td>{r.totalChapters}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

(Worker isn't running yet, so import won't progress — but the enqueue itself should succeed.)

Sign in to admin, go to `/admin/stories`, paste a truyenfull URL. Expect a green "Đã thêm job <id>" message. Verify in psql:

```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT id, name FROM pgboss.job ORDER BY createdon DESC LIMIT 3;"
```

Expected: A job row with `name = 'import-story'`.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(web/admin): stories list + import form enqueueing pg-boss job"
```

---

### Task 8: Revalidate webhook (worker → web)

**Files:**
- Create: `apps/web/src/app/api/revalidate/route.ts`

- [ ] **Step 1: Write `apps/web/src/app/api/revalidate/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { env } from '@/lib/env';

const schema = z.object({
  paths: z.array(z.string().startsWith('/')).min(1).max(50),
});

export async function POST(req: Request) {
  const secret = req.headers.get('x-revalidate-secret');
  if (secret !== env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  for (const path of parsed.data.paths) {
    revalidatePath(path);
  }
  return NextResponse.json({ ok: true, revalidated: parsed.data.paths.length });
}
```

- [ ] **Step 2: Verify**

```powershell
$secret = (Get-Content .env | Select-String "REVALIDATE_SECRET=").ToString().Split('=')[1]
curl -X POST http://localhost:3000/api/revalidate -H "x-revalidate-secret: $secret" -H "Content-Type: application/json" -d '{"paths":["/truyen/test"]}'
```

Expected: `{"ok":true,"revalidated":1}`.

Without secret → 403. Without paths → 400.

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "feat(web): add revalidate webhook for worker → next cache"
```

---

### Task 9: `services/crawler-worker` package + bootstrap

**Files:**
- Create: `services/crawler-worker/package.json`
- Create: `services/crawler-worker/tsconfig.json`
- Create: `services/crawler-worker/src/revalidate-client.ts`
- Create: `services/crawler-worker/src/jobs/import-story.ts`
- Create: `services/crawler-worker/src/jobs/fetch-chapter.ts`
- Create: `services/crawler-worker/src/index.ts`

- [ ] **Step 1: Write `services/crawler-worker/package.json`**

```json
{
  "name": "@smanga/crawler-worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@smanga/crawler": "workspace:*",
    "@smanga/db": "workspace:*",
    "@smanga/shared": "workspace:*",
    "pg-boss": "10.1.5",
    "pino": "9.5.0",
    "undici": "6.21.0",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "tsx": "4.19.2",
    "typescript": "5.6.3"
  }
}
```

- [ ] **Step 2: Write `services/crawler-worker/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"],
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write `services/crawler-worker/src/revalidate-client.ts`**

```typescript
import { request } from 'undici';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://localhost:3000';
const secret = process.env.REVALIDATE_SECRET ?? '';

export async function revalidatePaths(paths: string[]): Promise<void> {
  if (!secret) return; // silently skip in dev if not configured
  try {
    await request(`${baseUrl}/api/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ paths }),
    });
  } catch {
    // best-effort; do not fail the job
  }
}
```

- [ ] **Step 4: Write `services/crawler-worker/src/jobs/import-story.ts`**

```typescript
import { eq } from 'drizzle-orm';
import { type ImportStoryPayload, importStoryPayloadSchema } from '@smanga/shared';
import { importStory } from '@smanga/crawler';
import { story } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { revalidatePaths } from '../revalidate-client.js';

export async function handleImportStory(db: Database, raw: unknown): Promise<void> {
  const payload: ImportStoryPayload = importStoryPayloadSchema.parse(raw);
  const result = await importStory(db, payload.url);
  const [row] = await db.select({ slug: story.slug }).from(story).where(eq(story.id, result.storyId)).limit(1);
  if (row?.slug) {
    await revalidatePaths(['/', `/truyen/${row.slug}`]);
  }
}
```

- [ ] **Step 5: Write `services/crawler-worker/src/jobs/fetch-chapter.ts`**

```typescript
import { eq } from 'drizzle-orm';
import { type FetchChapterPayload, fetchChapterPayloadSchema } from '@smanga/shared';
import { fetchChapterById } from '@smanga/crawler';
import { chapter, story } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { revalidatePaths } from '../revalidate-client.js';

export async function handleFetchChapter(db: Database, raw: unknown): Promise<void> {
  const payload: FetchChapterPayload = fetchChapterPayloadSchema.parse(raw);
  await fetchChapterById(db, payload.chapterId);
  const [row] = await db
    .select({ slug: story.slug, index: chapter.index })
    .from(chapter)
    .innerJoin(story, eq(chapter.storyId, story.id))
    .where(eq(chapter.id, payload.chapterId))
    .limit(1);
  if (row?.slug) {
    await revalidatePaths([`/truyen/${row.slug}`, `/truyen/${row.slug}/chuong-${row.index}`]);
  }
}
```

- [ ] **Step 6: Write `services/crawler-worker/src/index.ts`**

```typescript
import process from 'node:process';
import PgBoss from 'pg-boss';
import pino from 'pino';
import { JOB_NAMES } from '@smanga/shared';
import { createDb } from '@smanga/db';
import '@smanga/crawler'; // side effect: registers truyenfull adapter
import { handleImportStory } from './jobs/import-story.js';
import { handleFetchChapter } from './jobs/fetch-chapter.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', base: { service: 'crawler-worker' } });

const url = process.env.DATABASE_URL;
if (!url) {
  logger.fatal('DATABASE_URL is required');
  process.exit(1);
}

const db = createDb(url);
const boss = new PgBoss(url);

boss.on('error', (err) => logger.error({ err }, 'boss error'));

async function main() {
  await boss.start();
  logger.info('worker started');

  await boss.work(JOB_NAMES.importStory, async (jobs) => {
    for (const j of jobs) {
      logger.info({ jobId: j.id }, 'import-story start');
      try {
        await handleImportStory(db, j.data);
        logger.info({ jobId: j.id }, 'import-story done');
      } catch (err) {
        logger.error({ jobId: j.id, err: (err as Error).message }, 'import-story failed');
        throw err;
      }
    }
  });

  await boss.work(JOB_NAMES.fetchChapter, { batchSize: 1 }, async (jobs) => {
    for (const j of jobs) {
      logger.info({ jobId: j.id }, 'fetch-chapter start');
      try {
        await handleFetchChapter(db, j.data);
        logger.info({ jobId: j.id }, 'fetch-chapter done');
      } catch (err) {
        logger.error({ jobId: j.id, err: (err as Error).message }, 'fetch-chapter failed');
        throw err;
      }
    }
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'worker crashed');
  process.exit(1);
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down');
  await boss.stop({ graceful: true, timeout: 10_000 });
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
```

- [ ] **Step 7: Add root-level run script**

Append to root `package.json` scripts:

```json
"dev:worker": "pnpm --filter @smanga/crawler-worker dev",
"dev:all": "pnpm dev:db && (pnpm --filter @smanga/web dev & pnpm --filter @smanga/crawler-worker dev)"
```

(The `dev:all` is Bash-style fire-and-fork — Windows users will run web and worker in separate terminals; that's fine.)

- [ ] **Step 8: Verify worker locally**

```powershell
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
$env:WEB_BASE_URL = "http://localhost:3000"
$env:REVALIDATE_SECRET = "<same value as .env>"
pnpm dev:worker
```

Expected: `worker started` log. Should idle waiting for jobs.

In another shell, sign in to admin (`pnpm --filter @smanga/web dev` separately), import a story. Within ~5 seconds the worker log should show `import-story start` then `import-story done` (within ~20s depending on story size). Confirm via psql:

```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT COUNT(*) FROM story;"
```

- [ ] **Step 9: Commit**

```
git add -A
git commit -m "feat(crawler-worker): pg-boss worker dispatching import-story + fetch-chapter"
```

---

### Task 10: Admin story detail page + chapter crawl buttons

**Files:**
- Create: `apps/web/src/app/api/admin/stories/[id]/crawl/route.ts`
- Create: `apps/web/src/components/admin/ChapterCrawlPanel.tsx`
- Create: `apps/web/src/app/admin/stories/[id]/page.tsx`

- [ ] **Step 1: Write `apps/web/src/app/api/admin/stories/[id]/crawl/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { and, eq, inArray, asc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { chapter } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { enqueueFetchChapter } from '@/server/queue';

const schema = z.object({
  mode: z.enum(['missing', 'all', 'one']),
  chapterId: z.string().uuid().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: storyId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });

  const db = getDb();
  let ids: string[] = [];

  if (parsed.data.mode === 'one') {
    if (!parsed.data.chapterId) {
      return NextResponse.json({ error: 'chapterId required for mode=one' }, { status: 400 });
    }
    ids = [parsed.data.chapterId];
  } else if (parsed.data.mode === 'missing') {
    const rows = await db
      .select({ id: chapter.id })
      .from(chapter)
      .where(and(eq(chapter.storyId, storyId), inArray(chapter.status, ['pending', 'failed'])))
      .orderBy(asc(chapter.index));
    ids = rows.map((r) => r.id);
  } else {
    const rows = await db
      .select({ id: chapter.id })
      .from(chapter)
      .where(eq(chapter.storyId, storyId))
      .orderBy(asc(chapter.index));
    ids = rows.map((r) => r.id);
  }

  let enqueued = 0;
  let duplicates = 0;
  for (const chapterId of ids) {
    const result = await enqueueFetchChapter({ chapterId });
    if (result === 'duplicate') duplicates += 1;
    else enqueued += 1;
  }
  return NextResponse.json({ enqueued, duplicates, total: ids.length });
}
```

- [ ] **Step 2: Write `apps/web/src/components/admin/ChapterCrawlPanel.tsx`**

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function ChapterCrawlPanel({ storyId }: { storyId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function trigger(mode: 'missing' | 'all') {
    setBusy(mode); setInfo(null); setError(null);
    const res = await fetch(`/api/admin/stories/${storyId}/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    setBusy(null);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof body.error === 'string' ? body.error : 'Lỗi');
      return;
    }
    setInfo(`Đã enqueue ${body.enqueued} (trùng ${body.duplicates}, tổng ${body.total})`);
    router.refresh();
  }

  return (
    <div className="flex gap-3 items-center mb-4">
      <Button onClick={() => trigger('missing')} disabled={busy !== null} variant="default">
        {busy === 'missing' ? 'Đang enqueue...' : 'Crawl missing'}
      </Button>
      <Button onClick={() => trigger('all')} disabled={busy !== null} variant="outline">
        {busy === 'all' ? 'Đang enqueue...' : 'Recrawl all'}
      </Button>
      {info && <span className="text-sm text-emerald-600">{info}</span>}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 3: Write `apps/web/src/app/admin/stories/[id]/page.tsx`**

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { chapter, story, storySource } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChapterCrawlPanel } from '@/components/admin/ChapterCrawlPanel';

export const dynamic = 'force-dynamic';

export default async function AdminStoryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [s] = await db.select().from(story).where(eq(story.id, id)).limit(1);
  if (!s) notFound();

  const sources = await db.select().from(storySource).where(eq(storySource.storyId, id));
  const chapters = await db
    .select({
      id: chapter.id,
      index: chapter.index,
      title: chapter.title,
      status: chapter.status,
      lastError: chapter.lastError,
      crawledAt: chapter.crawledAt,
      size: chapter.contentByteSize,
    })
    .from(chapter)
    .where(eq(chapter.storyId, id))
    .orderBy(asc(chapter.index));

  const statusVariant: Record<string, 'default' | 'success' | 'destructive' | 'secondary'> = {
    pending: 'secondary',
    crawled: 'success',
    failed: 'destructive',
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/stories" className="text-sm underline text-muted-foreground">← Truyện</Link>
        <h1 className="text-2xl font-bold mt-2">{s.title}</h1>
        <p className="text-muted-foreground">{s.author ?? '—'} · {s.totalChapters} chapter</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Sources</CardTitle></CardHeader>
        <CardContent>
          {sources.map((src) => (
            <div key={src.sourceId} className="text-sm flex gap-4 items-center">
              <Badge variant={src.isPrimary ? 'default' : 'secondary'}>
                {src.sourceId}{src.isPrimary ? ' (primary)' : ''}
              </Badge>
              <a href={src.externalUrl} target="_blank" rel="noreferrer" className="underline text-xs">
                {src.externalUrl}
              </a>
            </div>
          ))}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-2">Chapter</h2>
        <ChapterCrawlPanel storyId={id} />
        <Table>
          <Thead>
            <Tr>
              <Th className="w-16">#</Th><Th>Tiêu đề</Th><Th className="w-32">Trạng thái</Th>
              <Th className="w-24">Bytes</Th><Th>Lỗi</Th>
            </Tr>
          </Thead>
          <Tbody>
            {chapters.map((c) => (
              <Tr key={c.id}>
                <Td className="font-mono">{c.index}</Td>
                <Td>{c.title}</Td>
                <Td><Badge variant={statusVariant[c.status]}>{c.status}</Badge></Td>
                <Td className="text-xs text-muted-foreground">{c.size ?? '—'}</Td>
                <Td className="text-xs text-destructive">{c.lastError ?? ''}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Sign in to admin, open `/admin/stories`, click the story imported earlier. See sources panel + chapter table. Click "Crawl missing" — expect "Đã enqueue N (trùng 0, tổng N)". Worker logs should show fetch-chapter activity. Refresh the page — chapters that have been crawled show green "crawled" badge with byte size.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(web/admin): story detail page with sources panel + crawl trigger buttons"
```

---

### Task 11: Admin jobs page + retry endpoint

**Files:**
- Create: `apps/web/src/app/api/admin/jobs/route.ts`
- Create: `apps/web/src/app/api/admin/jobs/[id]/retry/route.ts`
- Create: `apps/web/src/components/admin/JobsTable.tsx`
- Create: `apps/web/src/app/admin/jobs/page.tsx`

pg-boss stores jobs in its own schema `pgboss`. We read directly via SQL (drizzle raw) since we don't have a Drizzle model for pg-boss tables.

- [ ] **Step 1: Write `apps/web/src/app/api/admin/jobs/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db';

export async function GET() {
  const db = getDb();
  const stateCounts = await db.execute<{ state: string; count: number }>(sql`
    SELECT state, COUNT(*)::int AS count FROM pgboss.job GROUP BY state ORDER BY state;
  `);
  return NextResponse.json({ states: stateCounts.rows });
}
```

(Note: drizzle-orm postgres-js may use `.execute` returning an object with `.rows` or a direct array. Adjust if Task 11 verification reveals it differs.)

- [ ] **Step 2: Write `apps/web/src/app/api/admin/jobs/[id]/retry/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const result = await db.execute(sql`
    UPDATE pgboss.job
    SET state = 'created', retrycount = 0, startedon = NULL, completedon = NULL
    WHERE id = ${id} AND state IN ('failed', 'cancelled')
    RETURNING id;
  `);
  const affected = Array.isArray(result) ? result.length : (result as { rowCount?: number }).rowCount ?? 0;
  if (affected === 0) return NextResponse.json({ error: 'not found or not retryable' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Write `apps/web/src/components/admin/JobsTable.tsx`**

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table';

export interface JobRow {
  id: string;
  name: string;
  state: string;
  retrycount: number;
  createdon: string;
  output: unknown;
}

export function JobsTable({ jobs }: { jobs: JobRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function retry(id: string) {
    setBusy(id);
    await fetch(`/api/admin/jobs/${id}/retry`, { method: 'POST' });
    setBusy(null);
    router.refresh();
  }

  const variant: Record<string, 'default' | 'success' | 'destructive' | 'secondary'> = {
    completed: 'success',
    created: 'secondary',
    active: 'default',
    failed: 'destructive',
    cancelled: 'secondary',
  };

  return (
    <Table>
      <Thead>
        <Tr>
          <Th className="w-40">Job</Th><Th>State</Th><Th>Retries</Th><Th>Tạo</Th>
          <Th>Output / error</Th><Th></Th>
        </Tr>
      </Thead>
      <Tbody>
        {jobs.map((j) => (
          <Tr key={j.id}>
            <Td className="font-mono text-xs">{j.name}</Td>
            <Td><Badge variant={variant[j.state] ?? 'secondary'}>{j.state}</Badge></Td>
            <Td>{j.retrycount}</Td>
            <Td className="text-xs">{new Date(j.createdon).toLocaleString('vi-VN')}</Td>
            <Td className="text-xs max-w-md truncate">{j.output ? JSON.stringify(j.output) : ''}</Td>
            <Td>
              {(j.state === 'failed' || j.state === 'cancelled') && (
                <Button size="sm" variant="outline" onClick={() => retry(j.id)} disabled={busy === j.id}>
                  Retry
                </Button>
              )}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
```

- [ ] **Step 4: Write `apps/web/src/app/admin/jobs/page.tsx`**

```tsx
import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { JobsTable, type JobRow } from '@/components/admin/JobsTable';

export const dynamic = 'force-dynamic';

export default async function AdminJobsPage() {
  const db = getDb();
  const stateResult = await db.execute<{ state: string; count: number }>(sql`
    SELECT state, COUNT(*)::int AS count FROM pgboss.job GROUP BY state ORDER BY state;
  `);
  const stateRows = (stateResult as { rows?: { state: string; count: number }[] }).rows
    ?? (stateResult as unknown as { state: string; count: number }[]);

  const jobsResult = await db.execute<{
    id: string; name: string; state: string; retrycount: number; createdon: string; output: unknown;
  }>(sql`
    SELECT id::text AS id, name, state, retrycount, createdon, output
    FROM pgboss.job
    ORDER BY createdon DESC
    LIMIT 100;
  `);
  const jobs = ((jobsResult as { rows?: JobRow[] }).rows ?? (jobsResult as unknown as JobRow[])) as JobRow[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Jobs</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stateRows.map((s) => (
          <Card key={s.state}>
            <CardHeader><CardTitle className="text-xs text-muted-foreground">{s.state}</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{s.count}</div></CardContent>
          </Card>
        ))}
      </div>

      <JobsTable jobs={jobs} />
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Sign in, go to `/admin/jobs`. Expect to see state counts (completed/created/active/failed) and a table of recent jobs from the import + crawl runs. Failed jobs should show a Retry button — clicking it should bump them back to `created` and the worker should pick them up again.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat(web/admin): jobs page with state counts + retry endpoint"
```

---

### Task 12: Cover image route

**Files:**
- Create: `apps/web/src/app/api/cover/[storyId]/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { story } from '@smanga/db/schema';
import { getDb } from '@/server/db';

export async function GET(req: Request, { params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  const [row] = await getDb()
    .select({ cover: story.cover, mime: story.coverMimeType })
    .from(story)
    .where(eq(story.id, storyId))
    .limit(1);

  if (!row?.cover) {
    return new Response('Not found', { status: 404 });
  }

  const etag = `"${createHash('sha1').update(row.cover).digest('hex')}"`;
  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return new Response(row.cover as unknown as ArrayBuffer, {
    headers: {
      'Content-Type': row.mime ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: etag,
    },
  });
}
```

- [ ] **Step 2: Verify**

```powershell
# Get a story id with cover:
$id = docker exec smanga-postgres psql -U smanga -d smanga -tA -c "SELECT id FROM story WHERE cover IS NOT NULL LIMIT 1;"
$id = $id.Trim()
# Fetch:
curl -I http://localhost:3000/api/cover/$id
```

Expected: `HTTP/1.1 200`, `Content-Type: image/jpeg` (or webp), `Cache-Control: public, max-age=31536000, immutable`, `ETag: "..."`. Run curl again with `-H "If-None-Match: <etag>"` → 304.

Hook it into the admin story detail page (optional polish): in `apps/web/src/app/admin/stories/[id]/page.tsx`, add inside the header `<img src={`/api/cover/${id}`} className="w-32 h-44 object-cover rounded" alt="" />`.

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "feat(web): add /api/cover/[storyId] with cache headers and etag"
```

---

### Task 13: One Playwright e2e smoke

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/tests/e2e/admin-smoke.spec.ts`
- Modify: `apps/web/package.json` (add devDep + script)

- [ ] **Step 1: Add Playwright**

Append to `apps/web/package.json` `devDependencies`:

```json
"@playwright/test": "1.48.2"
```

Append script:

```json
"e2e": "playwright test"
```

Run: `pnpm install`
Run: `pnpm --filter @smanga/web exec playwright install chromium`

- [ ] **Step 2: Write `apps/web/playwright.config.ts`**

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3000', headless: true },
  reporter: 'list',
});
```

- [ ] **Step 3: Write `apps/web/tests/e2e/admin-smoke.spec.ts`**

```typescript
import { expect, test } from '@playwright/test';

// Prereq: postgres up, web dev server up, admin@test promoted to admin role.

test('admin can sign in and reach dashboard', async ({ page }) => {
  await page.goto('/dang-nhap');
  await page.getByLabel('Email').fill('admin@test');
  await page.getByLabel('Mật khẩu').fill('adminpassword');
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
});

test('admin sources page lists truyenfull', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/dang-nhap');
  await page.getByLabel('Email').fill('admin@test');
  await page.getByLabel('Mật khẩu').fill('adminpassword');
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await page.goto('/admin/sources');
  await expect(page.getByText('truyenfull')).toBeVisible();
});

test('unauthenticated user redirected from /admin', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: undefined });
  const page = await ctx.newPage();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/dang-nhap/);
});
```

- [ ] **Step 4: Run smoke**

Ensure: `pnpm dev:db`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm --filter @smanga/web dev` (in separate shell), admin@test exists and is promoted.

Run: `pnpm --filter @smanga/web e2e`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "test(web): playwright e2e smoke for admin sign-in + sources list + redirect"
```

---

### Task 14: README operational notes

**Files:**
- Create: `docs/operations.md`

Capture how to run the system locally so a future engineer (or future-you) can recover quickly without re-reading the plan.

- [ ] **Step 1: Write `docs/operations.md`**

```markdown
# SManga local ops

## Run everything (3 terminals)

```powershell
# Terminal 1: postgres
pnpm dev:db

# Terminal 2: migrations + seed + web
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm db:migrate
pnpm db:seed
pnpm --filter @smanga/web dev

# Terminal 3: worker
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
$env:WEB_BASE_URL = "http://localhost:3000"
$env:REVALIDATE_SECRET = "<value from .env>"
pnpm dev:worker
```

## Bootstrap an admin user

```powershell
# After web is up:
curl -X POST http://localhost:3000/api/register -H "Content-Type: application/json" `
  -d '{"email":"admin@test","password":"adminpassword","name":"Admin"}'

docker exec smanga-postgres psql -U smanga -d smanga -c "UPDATE \"user\" SET role='admin' WHERE email='admin@test';"
```

## Common queries

```powershell
# Story counts:
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT COUNT(*) FROM story;"

# Pending chapters per story:
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT story_id, COUNT(*) FROM chapter WHERE status='pending' GROUP BY story_id;"

# Job queue:
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT state, COUNT(*) FROM pgboss.job GROUP BY state;"

# Reset everything:
docker compose -f docker-compose.dev.yml down -v
```

## Smoke checklist before deploy

- [ ] `pnpm test` passes (db, shared, crawler)
- [ ] `pnpm --filter @smanga/web typecheck` passes
- [ ] `pnpm --filter @smanga/crawler-worker typecheck` passes
- [ ] `pnpm --filter @smanga/web e2e` passes (requires running web + admin user seeded)
- [ ] Manual: sign in to /admin, import a story, click "Crawl missing", refresh page, see chapters crawl in real time
```

- [ ] **Step 2: Commit**

```
git add -A
git commit -m "docs: add local operations runbook"
```

---

## Self-review

**Spec coverage** (per design doc `docs/superpowers/specs/2026-05-28-smanga-design.md`):

| Spec section | Covered by |
|---|---|
| §3 Tech stack: Next.js 15 App Router | Task 1 |
| §3 shadcn/ui | Task 2 |
| §3 Auth.js v5 + Drizzle adapter | Task 4 |
| §3 pg-boss queue | Task 3 (client) + Task 9 (worker) |
| §7 F1 admin add source | Task 6 |
| §7 F2 admin import story (enqueue) | Task 7 |
| §7 F2 worker handles import-story job | Task 9 |
| §7 F3 admin crawl-missing / recrawl-all buttons | Task 10 |
| §7 F3 worker handles fetch-chapter job | Task 9 |
| §7 F3 revalidate webhook | Task 8 (web) + Task 9 (worker side) |
| §7 F5 cover route with cache headers + etag | Task 12 |
| §9 routes /admin/*, /dang-nhap, /api/admin/* | Tasks 4, 5, 6, 7, 10, 11, 12 |
| §10 auth: jwt session, role gate via middleware | Tasks 4, 5 |
| §11 retry policy via pg-boss | Task 3 (enqueue options) + Task 11 (manual retry UI) |
| §12 testing: Playwright e2e | Task 13 |

**Not covered** (deferred to later plans, by design):
- §9 reader pages (/, /truyen/<slug>, /chuong-<n>, /tim-kiem) → Plan 3
- §8 search via pg_trgm queries → Plan 4
- §10 Google OAuth full flow (config is in place but not tested e2e) → polish in Plan 4 when needed
- §12 nightly canary GitHub Actions → out of scope; mention in Plan 5

**Placeholder check:** No "TBD", no "fill in later", every step has actual code or actual commands.

**Type consistency:**
- `Database` from `@smanga/db` used consistently
- `ImportStoryPayload` / `FetchChapterPayload` used by both `enqueue*` (Task 3) and worker handlers (Task 9)
- `JobsTable.JobRow` type defined in Task 11 component, consumed in Task 11 page
- `enqueueFetchChapter` returns `'duplicate' | string` — handled in Task 10 route

**Risks worth flagging:**
- Auth.js v5 is still beta; check release notes at execution time and pin if a stable comes out.
- pg-boss column names in raw SQL (`retrycount`, `createdon`) are lowercase by pg-boss convention. Drizzle's `db.execute` shape may differ from prior assumption — Task 11 has a fallback in `apps/web/src/app/admin/jobs/page.tsx` for both `result.rows` and `result` array forms. If both shapes are wrong at runtime, switch to `import postgres from 'postgres'` directly for those two queries.
- The middleware runs Auth.js JWT verification on every `/admin/*` and `/api/admin/*` request. Cold-start cost is small but observable; if dashboards feel sluggish during dev, profile before optimising.
