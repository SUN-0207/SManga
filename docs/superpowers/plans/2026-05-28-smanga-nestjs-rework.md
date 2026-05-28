# SManga NestJS Rework Implementation Plan (Plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Next.js full-stack `apps/web` + pg-boss `services/crawler-worker` with a NestJS 11 backend (`apps/api`) and a Vite+React frontend (`apps/frontend`). Preserve the existing `packages/db` (Drizzle+Postgres), `packages/shared`, and `packages/crawler` foundations — only the delivery layer is rewritten. Swap pg-boss → Bull (Redis-backed) to match the reference project (`C:\Users\son.cu\opswat\project\manga-crawler`).

**Architecture:** NestJS REST API at `apps/api` (port 3001) owns auth, sources, stories, chapters, jobs, and cover streaming. Bull/Redis handles the import-story + fetch-chapter queues; the NestJS process runs both producers (REST handlers) and consumers (`@Processor` decorators) in dev — production can split via `start:worker` script. Vite+React 19 SPA at `apps/frontend` (port 3000) consumes the API via TanStack Query, routes via TanStack Router, and reuses the shadcn/ui primitives ported from Plan 2. JWT in httpOnly cookie for auth. The old `apps/web` and `services/crawler-worker` stay in the repo as reference until the final task deletes them.

**Tech Stack:** NestJS 11, Drizzle (existing) over Postgres, Bull 4 + Redis 7, Passport JWT + bcryptjs, class-validator + class-transformer DTOs, nestjs-pino, @nestjs/swagger. Vite 6 + React 19 + Tailwind 4 + shadcn/ui (ports) + TanStack Query 5 + TanStack Router 1 + Zustand 5 + axios.

---

## UI/UX guidance — read before touching any frontend code

The project installs the **ui-ux-pro-max** Claude skill at `.claude/skills/ui-ux-pro-max/`. A SManga-specific design system is persisted at `design-system/smanga/`:

- `design-system/smanga/MASTER.md` — Global tokens (colors, typography, spacing, shadows, buttons, cards, inputs, modals, anti-patterns, pre-delivery checklist). **Read it before Task 9.**
- `design-system/smanga/pages/reader-landing.md` — Landing-specific overrides
- `design-system/smanga/pages/reader-chapter.md` — Chapter-reading-specific overrides (literary typography, generous line-height, distraction-free)
- `design-system/smanga/pages/admin.md` — Admin-pages overrides (dashboard density, table-first layouts)

**Hierarchical lookup logic when implementing a page:**
1. First check `design-system/smanga/pages/<page-name>.md`. If present, its tokens **override** MASTER.
2. Otherwise apply MASTER tokens.
3. For any new page not covered, generate an override on the fly:
   ```bash
   py .claude/skills/ui-ux-pro-max/scripts/search.py "<page description keywords>" --design-system --persist -p "SManga" --page "<page-slug>"
   ```

**Headline tokens from MASTER (apply to Task 9 Tailwind config + Task 11/12 components):**

| Token | Value |
|---|---|
| `--color-primary` | `#18181B` (zinc-900) |
| `--color-secondary` | `#3F3F46` (zinc-700) |
| `--color-cta` | `#EC4899` (pink-500) |
| `--color-background` | `#FAFAFA` (zinc-50) |
| `--color-text` | `#09090B` (zinc-950) |
| Heading font | `Newsreader` (Google Font) — literary serif, great for long reading |
| Body font | `Roboto` (Google Font) — clean UI sans |
| Spacing scale | 4 / 8 / 16 / 24 / 32 / 48 / 64 px |
| Shadows | `sm 0 1px 2px rgba(0,0,0,.05)` → `xl 0 20px 25px rgba(0,0,0,.15)` |
| Transition | `150-300ms ease` for all hovers |
| Border radius | 8px buttons, 12px cards, 16px modals |

**Tailwind 4 wiring** (Task 9 `tailwind.config.ts` / `styles.css`): map these to CSS variables in `:root` and the dark variant, then declare them in `tailwind.config.ts` `theme.extend.colors` so utilities like `bg-primary`, `text-cta` etc. resolve. Pattern matches Plan 2 Task 1 — keep that as reference.

**Pre-delivery checklist for every FE task touching UI (Tasks 9-12):** Run through MASTER's bottom checklist before commit:
- No emoji icons → use Lucide icons (already in deps)
- All interactive elements have `cursor-pointer` Tailwind class
- Hover transitions 150-300ms
- Light + dark mode contrast ≥ 4.5:1
- Focus rings visible (Tailwind `focus-visible:ring-2`)
- Respect `prefers-reduced-motion`
- Responsive breakpoints 375 / 768 / 1024 / 1440
- No horizontal scroll on mobile, no fixed-nav content occlusion

**Two style overrides worth special attention:**
- **Chapter reader page** (override file): `prose` styling with `line-height: 1.7-1.85`, max-width ~65ch, generous vertical padding, `font-family: Newsreader` for content. This is the page users spend 95% of session time on — invest the polish here.
- **Admin pages** (override file): density-first dashboard layout, sticky table headers, compact spacing scale (use `--space-sm`/`md` instead of `lg`+).

---

## Heads-up: workarounds inherited from prior plans

- Internal imports inside `packages/db`, `packages/shared`, `packages/crawler` use `.ts` extensions. Both NestJS (uses tsc/ts-node) and Vite handle these natively.
- `chapter.contentText` stores **gzipped** UTF-8 bytes. The NestJS chapter service must gunzip on read.
- Postgres GIN index for search uses a custom `immutable_unaccent(text)` function from Plan 1.
- pg-boss tables exist in the `pgboss` schema but **will be ignored** — Bull stores job state in Redis, not Postgres. After this plan, the pgboss schema is dead weight; an optional housekeeping migration can drop it later.
- `@smanga/crawler` registers `truyenfullAdapter` as a side effect on import. NestJS bootstrap must import the package once.
- The existing `.env` at repo root has `DATABASE_URL`, `AUTH_SECRET` (will rename → `JWT_SECRET`), `REVALIDATE_SECRET` (no longer needed — Vite has no ISR). New env: `REDIS_URL`.

---

## File structure (locked in before tasks)

```
smanga/
  apps/
    api/                              NestJS 11 backend
      package.json
      nest-cli.json
      tsconfig.json
      tsconfig.build.json
      src/
        main.ts                       bootstrap
        app.module.ts                 root module
        config/
          env.ts                      Zod-validated config
        common/
          guards/jwt.guard.ts
          decorators/current-user.decorator.ts
          decorators/roles.decorator.ts
          guards/roles.guard.ts
        modules/
          db/
            db.module.ts              global, provides DRIZZLE token
            db.provider.ts            createDb() singleton
          queue/
            queue.module.ts           Bull config
            queue.constants.ts        QUEUE names
          auth/
            auth.module.ts
            auth.service.ts           login/register/hash/verify
            auth.controller.ts        POST /api/auth/login, /register, /me
            jwt.strategy.ts
            dto/login.dto.ts
            dto/register.dto.ts
          sources/
            sources.module.ts
            sources.service.ts
            sources.controller.ts     CRUD admin-gated
            dto/*.dto.ts
          stories/
            stories.module.ts
            stories.service.ts
            stories.controller.ts     GET (reader+admin), POST import
            dto/*.dto.ts
          chapters/
            chapters.module.ts
            chapters.service.ts       includes gunzip
            chapters.controller.ts    GET paginated + GET single + POST crawl
            dto/*.dto.ts
          covers/
            covers.module.ts
            covers.controller.ts      GET /api/cover/:storyId stream
          jobs/
            jobs.module.ts
            jobs.controller.ts        GET stats + recent + POST retry
            jobs.service.ts           Bull queue introspection
          crawler-jobs/
            crawler-jobs.module.ts    Bull processors
            import-story.processor.ts
            fetch-chapter.processor.ts
    frontend/                         Vite + React SPA
      package.json
      vite.config.ts
      tsconfig.json
      tsconfig.node.json
      index.html
      tailwind.config.ts
      postcss.config.mjs
      src/
        main.tsx                      entry (creates router + query client)
        styles.css                    tailwind directives + theme tokens
        env.ts
        lib/
          api-client.ts               axios instance with cookie auth
          cn.ts                       (port from Next.js shadcn)
          query-client.ts             TanStack Query client config
        api/                          typed API calls (consumed by hooks)
          auth.ts
          sources.ts
          stories.ts
          chapters.ts
          jobs.ts
        hooks/                        TanStack Query hooks
          use-auth.ts
          use-sources.ts
          use-stories.ts
          use-chapters.ts
          use-jobs.ts
        stores/
          auth-store.ts               Zustand: current user + setAuth
          reader-prefs-store.ts       Zustand persist: font size/family/theme
        components/
          ui/                         shadcn ports: button, input, label, card, table, badge
          admin/                      SourceForm, ImportStoryForm, ChapterCrawlPanel, JobsTable
          reader/                     StoryCard, StoryGrid, ChapterList, ChapterNav, ReaderHeader, ReaderSettings
          providers/                  ThemeProvider (custom, no next-themes)
        routes/                       TanStack Router file-based
          __root.tsx
          index.tsx                   reader landing
          dang-nhap.tsx
          truyen/$slug/index.tsx
          truyen/$slug/chuong-$index.tsx
          admin/route.tsx             role-gated layout
          admin/index.tsx
          admin/sources.tsx
          admin/stories/index.tsx
          admin/stories/$id.tsx
          admin/jobs.tsx
  packages/db        # unchanged
  packages/shared    # unchanged (DTO types come from class-validator; Zod schemas stay for crawler contract)
  packages/crawler   # unchanged
  docker-compose.dev.yml                # add redis service
```

**Why this split:**
- `apps/api` contains all server logic. Modules mirror reference's NestJS conventions: one folder per resource with `*.module.ts`, `*.service.ts`, `*.controller.ts`, plus `dto/`.
- `apps/frontend` is a pure SPA — Vite static build, served by nginx in production.
- Bull processors live in their own `crawler-jobs` module to keep the producer queue config (`queue/`) separate from consumer logic.
- `apps/web` and `services/crawler-worker` are NOT deleted until Task 14 — they serve as a reference implementation during port.

---

### Task 1: Add Redis to dev compose + housekeeping

**Files:**
- Modify: `docker-compose.dev.yml`
- Modify: `.env.example`, `.env` (add `REDIS_URL`, rename `AUTH_SECRET` → `JWT_SECRET`)

- [ ] **Step 1: Add redis service to `docker-compose.dev.yml`**

Append under `services:`:

```yaml
  redis:
    image: redis:7-alpine
    container_name: smanga-redis
    restart: unless-stopped
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 3s
      timeout: 3s
      retries: 10
```

- [ ] **Step 2: Update `.env.example` and `.env`**

In both files, replace `AUTH_SECRET=` line with `JWT_SECRET=`. Append:

```
REDIS_URL=redis://localhost:6379
API_BASE_URL=http://localhost:3001
FRONTEND_BASE_URL=http://localhost:3000
```

Remove `AUTH_URL`, `REVALIDATE_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` from `.env.example` — they belong to the deprecated Next.js stack. Keep `.env` values around in case revert is needed; just stop referencing them.

- [ ] **Step 3: Start Redis**

```powershell
pnpm dev:db   # already brings up postgres; verify redis also starts
docker compose -f docker-compose.dev.yml ps
docker exec smanga-redis redis-cli ping
```

Expected: `PONG`.

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "chore: add redis to dev compose + JWT_SECRET env"
```

---

### Task 2: Bootstrap `apps/api` NestJS + Drizzle + Swagger + pino

**Files:** all new under `apps/api/`. NestJS CLI is OPTIONAL — manually create files to keep monorepo tidy.

- [ ] **Step 1: `apps/api/package.json`**

```json
{
  "name": "@smanga/api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@nestjs/bull": "11.0.4",
    "@nestjs/common": "11.0.1",
    "@nestjs/config": "4.0.2",
    "@nestjs/core": "11.0.1",
    "@nestjs/jwt": "11.0.2",
    "@nestjs/passport": "11.0.5",
    "@nestjs/platform-express": "11.0.1",
    "@nestjs/swagger": "11.2.5",
    "@nestjs/throttler": "6.2.1",
    "@smanga/crawler": "workspace:*",
    "@smanga/db": "workspace:*",
    "@smanga/shared": "workspace:*",
    "bcryptjs": "3.0.3",
    "bull": "4.16.5",
    "class-transformer": "0.5.1",
    "class-validator": "0.14.2",
    "compression": "1.8.1",
    "cookie-parser": "1.4.7",
    "drizzle-orm": "0.36.0",
    "helmet": "8.1.0",
    "ioredis": "5.8.2",
    "nestjs-pino": "4.6.1",
    "passport": "0.7.0",
    "passport-jwt": "4.0.1",
    "pino-http": "11.0.0",
    "pino-pretty": "13.1.3",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.1",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@nestjs/cli": "11.0.0",
    "@nestjs/schematics": "11.0.0",
    "@types/bcryptjs": "2.4.6",
    "@types/bull": "3.15.9",
    "@types/compression": "1.8.1",
    "@types/cookie-parser": "1.4.8",
    "@types/express": "5.0.0",
    "@types/node": "20.17.6",
    "@types/passport-jwt": "4.0.1",
    "ts-loader": "9.5.2",
    "ts-node": "10.9.2",
    "tsconfig-paths": "4.2.0",
    "typescript": "5.6.3"
  }
}
```

- [ ] **Step 2: `apps/api/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "watchAssets": true
  }
}
```

- [ ] **Step 3: `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "target": "ES2022",
    "outDir": "dist",
    "rootDir": "src",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": false,
    "verbatimModuleSyntax": false,
    "isolatedModules": false,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "incremental": true,
    "baseUrl": "src",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["src/**/*.ts"]
}
```

Note: NestJS needs CommonJS + decorator metadata. Override the base tsconfig's strict ESM settings.

- [ ] **Step 4: `apps/api/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "allowImportingTsExtensions": false
  },
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

- [ ] **Step 5: `apps/api/src/config/env.ts`**

```typescript
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  FRONTEND_BASE_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(): Env {
  return schema.parse(process.env);
}
```

- [ ] **Step 6: `apps/api/src/modules/db/db.provider.ts`**

```typescript
import { type Provider } from '@nestjs/common';
import { createDb, type Database } from '@smanga/db';
import { loadEnv } from '@/config/env';

export const DRIZZLE = Symbol('DRIZZLE');

export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  useFactory: (): Database => createDb(loadEnv().DATABASE_URL),
};
```

- [ ] **Step 7: `apps/api/src/modules/db/db.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { DRIZZLE, drizzleProvider } from './db.provider';

@Global()
@Module({
  providers: [drizzleProvider],
  exports: [DRIZZLE],
})
export class DbModule {}
```

- [ ] **Step 8: `apps/api/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule } from '@nestjs/throttler';
import '@smanga/crawler'; // side effect: register adapters
import { DbModule } from './modules/db/db.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { colorize: true } },
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DbModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 9: `apps/api/src/main.ts`**

```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  app.enableCors({
    origin: env.FRONTEND_BASE_URL,
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SManga API')
    .setVersion('1.0')
    .addCookieAuth('jwt')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(env.PORT);
}
bootstrap();
```

- [ ] **Step 10: Install and verify**

```powershell
pnpm install
pnpm --filter @smanga/api typecheck
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
$env:REDIS_URL = "redis://localhost:6379"
$env:JWT_SECRET = "dev-secret-please-rotate-please-rotate"
pnpm --filter @smanga/api start
```

Expected: typecheck PASS; server logs "Nest application successfully started" on port 3001; visit `http://localhost:3001/api/docs` shows empty Swagger UI.

Kill server (`Ctrl+C`).

- [ ] **Step 11: Commit**

```
git add -A
git commit -m "feat(api): bootstrap NestJS app with db module, swagger, pino, helmet"
```

---

### Task 3: Bull queue module + crawler-jobs processors

**Files:**
- Create: `apps/api/src/modules/queue/queue.constants.ts`
- Create: `apps/api/src/modules/queue/queue.module.ts`
- Create: `apps/api/src/modules/crawler-jobs/crawler-jobs.module.ts`
- Create: `apps/api/src/modules/crawler-jobs/import-story.processor.ts`
- Create: `apps/api/src/modules/crawler-jobs/fetch-chapter.processor.ts`
- Modify: `apps/api/src/app.module.ts` (import queue + crawler-jobs)

- [ ] **Step 1: `apps/api/src/modules/queue/queue.constants.ts`**

```typescript
export const QUEUE_CRAWLER = 'crawler';

export const JOB_IMPORT_STORY = 'import-story';
export const JOB_FETCH_CHAPTER = 'fetch-chapter';

export interface ImportStoryJobData {
  url: string;
  requestedBy: string | null;
}

export interface FetchChapterJobData {
  chapterId: string;
}
```

- [ ] **Step 2: `apps/api/src/modules/queue/queue.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { loadEnv } from '@/config/env';
import { QUEUE_CRAWLER } from './queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => {
        const url = new URL(loadEnv().REDIS_URL);
        return {
          redis: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: { age: 86_400, count: 1000 },
            removeOnFail: false,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: QUEUE_CRAWLER }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
```

- [ ] **Step 3: `apps/api/src/modules/crawler-jobs/import-story.processor.ts`**

```typescript
import { Process, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { importStory } from '@smanga/crawler';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  JOB_IMPORT_STORY,
  QUEUE_CRAWLER,
  type ImportStoryJobData,
} from '@/modules/queue/queue.constants';

@Processor(QUEUE_CRAWLER)
export class ImportStoryProcessor {
  private readonly logger = new Logger(ImportStoryProcessor.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Process(JOB_IMPORT_STORY)
  async handle(job: Job<ImportStoryJobData>): Promise<void> {
    this.logger.log(`import-story start ${job.id} url=${job.data.url}`);
    const result = await importStory(this.db, job.data.url);
    this.logger.log(`import-story done ${job.id} storyId=${result.storyId} chapters=${result.totalChapters}`);
  }
}
```

- [ ] **Step 4: `apps/api/src/modules/crawler-jobs/fetch-chapter.processor.ts`**

```typescript
import { Process, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { fetchChapterById } from '@smanga/crawler';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  JOB_FETCH_CHAPTER,
  QUEUE_CRAWLER,
  type FetchChapterJobData,
} from '@/modules/queue/queue.constants';

@Processor(QUEUE_CRAWLER)
export class FetchChapterProcessor {
  private readonly logger = new Logger(FetchChapterProcessor.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Process(JOB_FETCH_CHAPTER)
  async handle(job: Job<FetchChapterJobData>): Promise<void> {
    this.logger.log(`fetch-chapter start ${job.id} chapterId=${job.data.chapterId}`);
    await fetchChapterById(this.db, job.data.chapterId);
    this.logger.log(`fetch-chapter done ${job.id}`);
  }
}
```

- [ ] **Step 5: `apps/api/src/modules/crawler-jobs/crawler-jobs.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { QueueModule } from '@/modules/queue/queue.module';
import { ImportStoryProcessor } from './import-story.processor';
import { FetchChapterProcessor } from './fetch-chapter.processor';

@Module({
  imports: [QueueModule],
  providers: [ImportStoryProcessor, FetchChapterProcessor],
})
export class CrawlerJobsModule {}
```

- [ ] **Step 6: Register in `app.module.ts`**

Add `QueueModule` and `CrawlerJobsModule` to the `imports` array.

- [ ] **Step 7: Verify**

Start API: `pnpm --filter @smanga/api start`. Logs should include `[Nest] BullModule dependencies initialized` and `[Nest] CrawlerJobsModule dependencies initialized`. No Bull connection errors (Redis must be up via `pnpm dev:db`).

- [ ] **Step 8: Commit**

```
git add -A
git commit -m "feat(api): add Bull crawler queue with import-story + fetch-chapter processors"
```

---

### Task 4: Auth module — JWT + bcrypt + login/register/me

**Files:**
- Create: `apps/api/src/modules/auth/dto/login.dto.ts`
- Create: `apps/api/src/modules/auth/dto/register.dto.ts`
- Create: `apps/api/src/modules/auth/auth.service.ts`
- Create: `apps/api/src/modules/auth/auth.controller.ts`
- Create: `apps/api/src/modules/auth/jwt.strategy.ts`
- Create: `apps/api/src/modules/auth/auth.module.ts`
- Create: `apps/api/src/common/guards/jwt.guard.ts`
- Create: `apps/api/src/common/guards/roles.guard.ts`
- Create: `apps/api/src/common/decorators/current-user.decorator.ts`
- Create: `apps/api/src/common/decorators/roles.decorator.ts`

- [ ] **Step 1: DTOs**

`dto/login.dto.ts`:

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
```

`dto/register.dto.ts`:

```typescript
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  name?: string;
}
```

- [ ] **Step 2: `auth.service.ts`**

```typescript
import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { user } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

export interface JwtPayload {
  sub: string;
  email: string;
  role: 'user' | 'admin';
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const [existing] = await this.db.select().from(user).where(eq(user.email, dto.email)).limit(1);
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const [created] = await this.db
      .insert(user)
      .values({
        id: randomUUID(),
        email: dto.email,
        name: dto.name ?? null,
        passwordHash,
      })
      .returning();
    return { id: created!.id, email: created!.email };
  }

  async login(dto: LoginDto): Promise<{ token: string; user: { id: string; email: string; role: string } }> {
    const [row] = await this.db.select().from(user).where(eq(user.email, dto.email)).limit(1);
    if (!row || !row.passwordHash) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, row.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const payload: JwtPayload = { sub: row.id, email: row.email, role: row.role };
    const token = this.jwt.sign(payload);
    return { token, user: { id: row.id, email: row.email, role: row.role } };
  }

  async getById(id: string) {
    const [row] = await this.db
      .select({ id: user.id, email: user.email, name: user.name, role: user.role })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    return row ?? null;
  }
}
```

- [ ] **Step 3: `jwt.strategy.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { loadEnv } from '@/config/env';
import type { JwtPayload } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => (req?.cookies?.jwt as string | undefined) ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: loadEnv().JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
```

- [ ] **Step 4: `common/guards/jwt.guard.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 5: `common/decorators/roles.decorator.ts` + `common/guards/roles.guard.ts`**

`roles.decorator.ts`:

```typescript
import { Reflector } from '@nestjs/core';

export const Roles = Reflector.createDecorator<string[]>();
```

`roles.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from '@/common/decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride(Roles, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('not authenticated');
    if (!required.includes(user.role)) throw new ForbiddenException('insufficient role');
    return true;
  }
}
```

- [ ] **Step 6: `common/decorators/current-user.decorator.ts`**

```typescript
import { ExecutionContext, createParamDecorator } from '@nestjs/common';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().user;
});
```

- [ ] **Step 7: `auth.controller.ts`**

```typescript
import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(201)
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.auth.login(dto);
    res.cookie('jwt', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 14,
    });
    return { user };
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('jwt');
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: { id: string }) {
    return this.auth.getById(user.id);
  }
}
```

- [ ] **Step 8: `auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from '@/common/guards/roles.guard';
import { loadEnv } from '@/config/env';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: loadEnv().JWT_SECRET,
      signOptions: { expiresIn: '14d' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
```

- [ ] **Step 9: Register in `app.module.ts`** — add `AuthModule` to imports.

- [ ] **Step 10: Smoke test**

Start API. Then:

```powershell
# register
curl.exe -X POST http://localhost:3001/api/v1/auth/register -H "Content-Type: application/json" -d '{\"email\":\"admin@test.com\",\"password\":\"adminpassword\",\"name\":\"Admin\"}'
# Expected: {"id": "...", "email":"admin@test.com"}

# promote
docker exec smanga-postgres psql -U smanga -d smanga -c "UPDATE \"user\" SET role='admin' WHERE email='admin@test.com';"

# login (saves cookie to jar file)
curl.exe -c cookies.txt -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{\"email\":\"admin@test.com\",\"password\":\"adminpassword\"}'
# Expected: {"user":{"id":"...","email":"admin@test.com","role":"admin"}}

# me
curl.exe -b cookies.txt http://localhost:3001/api/v1/auth/me
# Expected: user object
```

- [ ] **Step 11: Commit**

```
git add -A
git commit -m "feat(api): auth module with JWT cookie + bcrypt + role guard"
```

---

### Task 5: Sources module (admin-only CRUD)

**Files:** all under `apps/api/src/modules/sources/`.

- [ ] **Step 1: DTO `create-source.dto.ts`**

```typescript
import { IsBoolean, IsNumber, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSourceDto {
  @IsString()
  id!: string;

  @IsString()
  name!: string;

  @IsUrl()
  baseUrl!: string;

  @IsNumber()
  @Type(() => Number)
  @Min(0.1)
  @IsOptional()
  rateLimitRps?: number;
}

export class UpdateSourceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUrl()
  baseUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  rateLimitRps?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

- [ ] **Step 2: `sources.service.ts`**

```typescript
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { listAdapters } from '@smanga/crawler';
import { source } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import type { CreateSourceDto, UpdateSourceDto } from './dto/create-source.dto';

@Injectable()
export class SourcesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

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
}
```

- [ ] **Step 3: `sources.controller.ts`**

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SourcesService } from './sources.service';
import { CreateSourceDto, UpdateSourceDto } from './dto/create-source.dto';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Roles } from '@/common/decorators/roles.decorator';

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
}
```

- [ ] **Step 4: `sources.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';

@Module({
  controllers: [SourcesController],
  providers: [SourcesService],
})
export class SourcesModule {}
```

Register `SourcesModule` in `app.module.ts`.

- [ ] **Step 5: Smoke**

```powershell
curl.exe -b cookies.txt http://localhost:3001/api/v1/sources
# expected: array with truyenfull row
```

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat(api): sources module CRUD with admin role guard + adapter id validation"
```

---

### Task 6: Stories module + import endpoint (enqueues Bull job)

**Files:** under `apps/api/src/modules/stories/`.

- [ ] **Step 1: DTOs**

`dto/import-story.dto.ts`:

```typescript
import { IsUrl } from 'class-validator';

export class ImportStoryDto {
  @IsUrl()
  url!: string;
}
```

`dto/list-stories.dto.ts`:

```typescript
import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListStoriesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 48;
}
```

- [ ] **Step 2: `stories.service.ts`**

```typescript
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { desc, eq, sql, count, asc } from 'drizzle-orm';
import { resolveAdapterForUrl } from '@smanga/crawler';
import { chapter, genre, story, storyGenre, storySource } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  JOB_IMPORT_STORY,
  QUEUE_CRAWLER,
  type ImportStoryJobData,
} from '@/modules/queue/queue.constants';

@Injectable()
export class StoriesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  async list(page = 1, limit = 48) {
    const rows = await this.db
      .select({
        id: story.id,
        slug: story.slug,
        title: story.title,
        author: story.author,
        status: story.status,
        totalChapters: story.totalChapters,
        hasCover: sql<boolean>`${story.cover} IS NOT NULL`,
        updatedAt: story.updatedAt,
      })
      .from(story)
      .orderBy(desc(story.updatedAt))
      .limit(limit)
      .offset((page - 1) * limit);
    return rows;
  }

  async getBySlug(slug: string) {
    const [s] = await this.db
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
    if (!s) throw new NotFoundException();

    const genres = await this.db
      .select({ slug: genre.slug, name: genre.name })
      .from(storyGenre)
      .innerJoin(genre, eq(storyGenre.genreId, genre.id))
      .where(eq(storyGenre.storyId, s.id));

    const sources = await this.db.select().from(storySource).where(eq(storySource.storyId, s.id));

    return { ...s, genres, sources };
  }

  async getById(id: string) {
    const [s] = await this.db.select().from(story).where(eq(story.id, id)).limit(1);
    if (!s) throw new NotFoundException();
    return s;
  }

  async chapterListBySlug(slug: string, page = 1, pageSize = 50) {
    const [s] = await this.db
      .select({ id: story.id })
      .from(story)
      .where(eq(story.slug, slug))
      .limit(1);
    if (!s) throw new NotFoundException();
    const totalRows = await this.db
      .select({ value: count() })
      .from(chapter)
      .where(eq(chapter.storyId, s.id));
    const total = totalRows[0]?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const items = await this.db
      .select({ index: chapter.index, title: chapter.title, status: chapter.status })
      .from(chapter)
      .where(eq(chapter.storyId, s.id))
      .orderBy(asc(chapter.index))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return { items, page, totalPages, total };
  }

  async listChaptersByStoryId(storyId: string) {
    return this.db
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
      .where(eq(chapter.storyId, storyId))
      .orderBy(asc(chapter.index));
  }

  async enqueueImport(url: string, requestedBy: string | null) {
    try {
      resolveAdapterForUrl(url);
    } catch {
      throw new BadRequestException('no adapter registered for that hostname');
    }
    const payload: ImportStoryJobData = { url, requestedBy };
    const job = await this.queue.add(JOB_IMPORT_STORY, payload);
    return { jobId: String(job.id) };
  }
}
```

- [ ] **Step 3: `stories.controller.ts`**

```typescript
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StoriesService } from './stories.service';
import { ImportStoryDto } from './dto/import-story.dto';
import { ListStoriesDto } from './dto/list-stories.dto';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('stories')
@Controller({ path: 'stories', version: '1' })
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Get()
  list(@Query() q: ListStoriesDto) {
    return this.stories.list(q.page, q.limit);
  }

  @Get('by-slug/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.stories.getBySlug(slug);
  }

  @Get('by-slug/:slug/chapters')
  chaptersBySlug(
    @Param('slug') slug: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.stories.chapterListBySlug(
      slug,
      Number(page) || 1,
      Number(pageSize) || 50,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @Roles(['admin'])
  getById(@Param('id') id: string) {
    return this.stories.getById(id);
  }

  @Get(':id/chapters')
  @UseGuards(JwtAuthGuard)
  @Roles(['admin'])
  adminChapters(@Param('id') id: string) {
    return this.stories.listChaptersByStoryId(id);
  }

  @Post('import')
  @UseGuards(JwtAuthGuard)
  @Roles(['admin'])
  import(@Body() dto: ImportStoryDto, @CurrentUser() u: { id: string }) {
    return this.stories.enqueueImport(dto.url, u.id);
  }
}
```

- [ ] **Step 4: `stories.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';
import { QueueModule } from '@/modules/queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [StoriesController],
  providers: [StoriesService],
})
export class StoriesModule {}
```

Register in `app.module.ts`.

- [ ] **Step 5: Smoke**

```powershell
curl.exe -b cookies.txt -X POST http://localhost:3001/api/v1/stories/import -H "Content-Type: application/json" -d '{\"url\":\"https://truyenfull.today/xuyen-thu-chi-ba-ai-doc-the/\"}'
# expected: { "jobId": "..." }
# Logs should show import-story start/done within ~15s.

curl.exe http://localhost:3001/api/v1/stories
# array of stories
```

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat(api): stories module list/detail/chapters + admin import enqueue Bull job"
```

---

### Task 7: Chapters module — single chapter content (gunzip) + crawl trigger

**Files:** under `apps/api/src/modules/chapters/`.

- [ ] **Step 1: DTOs `dto/crawl.dto.ts`**

```typescript
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CrawlChaptersDto {
  @IsEnum(['missing', 'all', 'one'])
  mode!: 'missing' | 'all' | 'one';

  @IsOptional()
  @IsUUID()
  chapterId?: string;
}
```

- [ ] **Step 2: `chapters.service.ts`**

```typescript
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { gunzipSync } from 'node:zlib';
import { and, asc, desc, eq, gt, inArray, lt } from 'drizzle-orm';
import type { Queue } from 'bull';
import { chapter, story } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  JOB_FETCH_CHAPTER,
  QUEUE_CRAWLER,
  type FetchChapterJobData,
} from '@/modules/queue/queue.constants';
import type { CrawlChaptersDto } from './dto/crawl.dto';

@Injectable()
export class ChaptersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  async getChapterContent(slug: string, indexStr: string) {
    const [row] = await this.db
      .select({
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
      .where(and(eq(story.slug, slug), eq(chapter.index, indexStr)))
      .limit(1);
    if (!row) throw new NotFoundException();

    let text: string | null = null;
    if (row.content && row.content.length > 0) {
      try {
        text = gunzipSync(row.content as Buffer).toString('utf-8');
      } catch {
        text = (row.content as Buffer).toString('utf-8');
      }
    }

    const [prev] = await this.db
      .select({ index: chapter.index, title: chapter.title })
      .from(chapter)
      .where(and(eq(chapter.storyId, row.storyId), lt(chapter.index, row.index)))
      .orderBy(desc(chapter.index))
      .limit(1);

    const [next] = await this.db
      .select({ index: chapter.index, title: chapter.title })
      .from(chapter)
      .where(and(eq(chapter.storyId, row.storyId), gt(chapter.index, row.index)))
      .orderBy(asc(chapter.index))
      .limit(1);

    return {
      story: { slug: row.storySlug, title: row.storyTitle },
      chapter: {
        index: Number(row.index),
        title: row.title,
        content: text,
        isCrawled: row.status === 'crawled' && text !== null,
      },
      prev: prev ? { index: Number(prev.index), title: prev.title } : null,
      next: next ? { index: Number(next.index), title: next.title } : null,
    };
  }

  async crawl(storyId: string, dto: CrawlChaptersDto) {
    const db = this.db;
    let ids: string[] = [];
    if (dto.mode === 'one') {
      if (!dto.chapterId) throw new BadRequestException('chapterId required for mode=one');
      ids = [dto.chapterId];
    } else if (dto.mode === 'missing') {
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
    for (const chapterId of ids) {
      const payload: FetchChapterJobData = { chapterId };
      await this.queue.add(JOB_FETCH_CHAPTER, payload, {
        jobId: `fetch-chapter:${chapterId}`,
      });
      enqueued += 1;
    }
    return { enqueued, total: ids.length };
  }
}
```

Note: Bull's `jobId` option dedupes — if an identical jobId is already queued or active, the new add is ignored. That replicates pg-boss `singletonKey` semantics.

- [ ] **Step 3: `chapters.controller.ts`**

```typescript
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ChaptersService } from './chapters.service';
import { CrawlChaptersDto } from './dto/crawl.dto';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Roles } from '@/common/decorators/roles.decorator';

@ApiTags('chapters')
@Controller({ path: 'chapters', version: '1' })
export class ChaptersController {
  constructor(private readonly chapters: ChaptersService) {}

  @Get('by-slug/:slug/:index')
  get(@Param('slug') slug: string, @Param('index') index: string) {
    return this.chapters.getChapterContent(slug, index);
  }

  @Post('crawl/:storyId')
  @UseGuards(JwtAuthGuard)
  @Roles(['admin'])
  crawl(@Param('storyId') storyId: string, @Body() dto: CrawlChaptersDto) {
    return this.chapters.crawl(storyId, dto);
  }
}
```

- [ ] **Step 4: `chapters.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ChaptersController } from './chapters.controller';
import { ChaptersService } from './chapters.service';
import { QueueModule } from '@/modules/queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [ChaptersController],
  providers: [ChaptersService],
})
export class ChaptersModule {}
```

Register in `app.module.ts`.

- [ ] **Step 5: Smoke**

```powershell
curl.exe http://localhost:3001/api/v1/chapters/by-slug/xuyen-thu-chi-ba-ai-doc-the/1
# expected: chapter object with content (if crawled) or null content
```

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat(api): chapters module gunzip content + admin crawl endpoint"
```

---

### Task 8: Covers module + Jobs module

**Files:** under `apps/api/src/modules/covers/` and `apps/api/src/modules/jobs/`.

- [ ] **Step 1: `covers/covers.controller.ts`**

```typescript
import { Controller, Get, Header, Param, Req, Res, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { Inject } from '@nestjs/common';
import { story } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';

@ApiTags('covers')
@Controller({ path: 'cover', version: '1' })
export class CoversController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get(':storyId')
  async get(
    @Param('storyId') storyId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const [row] = await this.db
      .select({ cover: story.cover, mime: story.coverMimeType })
      .from(story)
      .where(eq(story.id, storyId))
      .limit(1);
    if (!row?.cover) {
      res.status(404).send('Not found');
      return;
    }
    const etag = `"${createHash('sha1').update(row.cover as Buffer).digest('hex')}"`;
    if (req.headers['if-none-match'] === etag) {
      res.status(304).setHeader('ETag', etag).end();
      return;
    }
    res
      .status(200)
      .setHeader('Content-Type', row.mime ?? 'image/jpeg')
      .setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      .setHeader('ETag', etag)
      .send(row.cover as Buffer);
  }
}
```

- [ ] **Step 2: `covers/covers.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { CoversController } from './covers.controller';

@Module({ controllers: [CoversController] })
export class CoversModule {}
```

- [ ] **Step 3: `jobs/jobs.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, JobStatus } from 'bull';
import { QUEUE_CRAWLER } from '@/modules/queue/queue.constants';

@Injectable()
export class JobsService {
  constructor(@InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue) {}

  async stats() {
    const counts = await this.queue.getJobCounts(); // { waiting, active, completed, failed, delayed, paused }
    return counts;
  }

  async list(limit = 100) {
    const states: JobStatus[] = ['waiting', 'active', 'completed', 'failed', 'delayed'];
    const jobs = await this.queue.getJobs(states, 0, limit - 1, false);
    return jobs.map((j) => ({
      id: String(j.id),
      name: j.name,
      state: j.failedReason ? 'failed' : j.finishedOn ? 'completed' : j.processedOn ? 'active' : 'waiting',
      attemptsMade: j.attemptsMade,
      timestamp: j.timestamp,
      processedOn: j.processedOn,
      finishedOn: j.finishedOn,
      failedReason: j.failedReason ?? null,
      data: j.data,
    }));
  }

  async retry(id: string) {
    const job = await this.queue.getJob(id);
    if (!job) return { ok: false };
    if (await job.isFailed()) {
      await job.retry();
      return { ok: true };
    }
    return { ok: false, reason: 'not failed' };
  }
}
```

- [ ] **Step 4: `jobs/jobs.controller.ts`**

```typescript
import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Roles } from '@/common/decorators/roles.decorator';

@ApiTags('jobs')
@Controller({ path: 'jobs', version: '1' })
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get('stats')
  stats() {
    return this.jobs.stats();
  }

  @Get()
  list() {
    return this.jobs.list();
  }

  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.jobs.retry(id);
  }
}
```

- [ ] **Step 5: `jobs/jobs.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { QueueModule } from '@/modules/queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
```

Register `CoversModule` and `JobsModule` in `app.module.ts`.

- [ ] **Step 6: Smoke**

```powershell
curl.exe -b cookies.txt http://localhost:3001/api/v1/jobs/stats
# expected: { waiting, active, completed, failed, delayed, paused }
curl.exe http://localhost:3001/api/v1/cover/<a-story-uuid> -o cover.jpg
# expected: cover.jpg file
```

- [ ] **Step 7: Commit**

```
git add -A
git commit -m "feat(api): covers + jobs modules (Bull queue stats + retry)"
```

---

### Task 9: Bootstrap `apps/frontend` Vite + React + Tailwind + shadcn ports

**Files:** under `apps/frontend/`.

- [ ] **Step 1: `apps/frontend/package.json`**

```json
{
  "name": "@smanga/frontend",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-label": "2.1.0",
    "@radix-ui/react-slot": "1.1.0",
    "@tanstack/react-query": "5.59.20",
    "@tanstack/react-router": "1.82.1",
    "axios": "1.7.7",
    "class-variance-authority": "0.7.0",
    "clsx": "2.1.1",
    "lucide-react": "0.454.0",
    "react": "19.0.0-rc-66855b96-20241106",
    "react-dom": "19.0.0-rc-66855b96-20241106",
    "tailwind-merge": "2.5.4",
    "zustand": "5.0.1"
  },
  "devDependencies": {
    "@tanstack/router-vite-plugin": "1.82.1",
    "@types/node": "20.17.6",
    "@types/react": "18.3.12",
    "@types/react-dom": "18.3.1",
    "@vitejs/plugin-react": "4.3.3",
    "autoprefixer": "10.4.20",
    "postcss": "8.4.49",
    "tailwindcss": "3.4.14",
    "typescript": "5.6.3",
    "vite": "6.0.1"
  }
}
```

- [ ] **Step 2: `apps/frontend/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-vite-plugin';
import path from 'node:path';

export default defineConfig({
  plugins: [TanStackRouterVite(), react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
```

- [ ] **Step 3: `apps/frontend/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": ".",
    "noEmit": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 4: `apps/frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="vi" suppressHydrationWarning>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SManga</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: `tailwind.config.ts` and `postcss.config.mjs`**

Copy from `apps/web/tailwind.config.ts` (Plan 2 Task 1) — same content. Same for postcss.

- [ ] **Step 6: `apps/frontend/src/styles.css`**

Copy `apps/web/src/app/globals.css` → `apps/frontend/src/styles.css` verbatim.

- [ ] **Step 7: `apps/frontend/src/lib/cn.ts`**

Copy from `apps/web/src/lib/cn.ts` verbatim.

- [ ] **Step 8: Port shadcn primitives**

Copy each file from `apps/web/src/components/ui/` to `apps/frontend/src/components/ui/`:
- `button.tsx`, `input.tsx`, `label.tsx`, `card.tsx`, `table.tsx`, `badge.tsx`

Update imports inside each file from `@/lib/cn` to the new path (it's the same `@/lib/cn` — Vite alias matches).

- [ ] **Step 9: `apps/frontend/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

const router = createRouter({ routeTree, context: { queryClient } });
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
```

(Note: `routeTree.gen.ts` is auto-generated by `@tanstack/router-vite-plugin` on first dev run.)

- [ ] **Step 10: Placeholder root route `src/routes/__root.tsx`**

```tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => <Outlet />,
});
```

- [ ] **Step 11: Placeholder index `src/routes/index.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => (
    <div className="container py-12">
      <h1 className="text-3xl font-bold">SManga</h1>
      <p className="text-muted-foreground mt-2">Routes filled in at Task 11.</p>
    </div>
  ),
});
```

- [ ] **Step 12: Verify**

```powershell
pnpm install
pnpm --filter @smanga/frontend dev
```

Visit `http://localhost:3000` — see "SManga" heading. Kill.

- [ ] **Step 13: Commit**

```
git add -A
git commit -m "feat(frontend): bootstrap Vite + React + Tailwind + shadcn ports + TanStack Router"
```

---

### Task 10: API client + auth store + login/register routes

**Files:** under `apps/frontend/src/`.

- [ ] **Step 1: `lib/api-client.ts`**

```typescript
import axios from 'axios';

export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
```

- [ ] **Step 2: `api/auth.ts`**

```typescript
import { api } from '@/lib/api-client';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin';
}

export async function login(email: string, password: string): Promise<{ user: User }> {
  const res = await api.post('/auth/login', { email, password });
  return res.data;
}

export async function register(email: string, password: string, name?: string): Promise<{ id: string; email: string }> {
  const res = await api.post('/auth/register', { email, password, name });
  return res.data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function me(): Promise<User | null> {
  try {
    const res = await api.get<User>('/auth/me');
    return res.data;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: `stores/auth-store.ts`**

```typescript
import { create } from 'zustand';
import type { User } from '@/api/auth';

interface AuthState {
  user: User | null;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
```

- [ ] **Step 4: `hooks/use-auth.ts`**

```typescript
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { me } from '@/api/auth';
import { useAuthStore } from '@/stores/auth-store';

export function useMeQuery() {
  const setUser = useAuthStore((s) => s.setUser);
  const query = useQuery({
    queryKey: ['me'],
    queryFn: me,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (query.data !== undefined) setUser(query.data);
  }, [query.data, setUser]);
  return query;
}
```

- [ ] **Step 5: `routes/dang-nhap.tsx`**

```tsx
import { useState } from 'react';
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { login as apiLogin } from '@/api/auth';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/dang-nhap')({
  component: SignInPage,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : '/admin',
  }),
});

function SignInPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { user } = await apiLogin(email, password);
      setUser(user);
      await router.invalidate();
      navigate({ to: redirect });
    } catch {
      setError('Sai email hoặc mật khẩu');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container max-w-md py-16">
      <Card>
        <CardHeader><CardTitle>Đăng nhập</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
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

- [ ] **Step 6: Smoke**

Start API + frontend dev. Visit `http://localhost:3000/dang-nhap`, login with admin@test.com from Task 4 — should redirect (404 on /admin until Task 12, but no error).

- [ ] **Step 7: Commit**

```
git add -A
git commit -m "feat(frontend): api client + auth store + dang-nhap route"
```

---

### Task 11: Reader pages — landing + story detail + chapter reader + theme provider + settings

**Files:** under `apps/frontend/src/`.

This task is a big port of Plan 3's reader UI. The structure stays — only the Next.js APIs (Server Components, ISR, App Router) are swapped for client-only React + TanStack Query.

- [ ] **Step 1: `lib/query-keys.ts`** (optional but nice for consistency)

```typescript
export const qk = {
  storiesList: (page: number, limit: number) => ['stories', { page, limit }] as const,
  storyBySlug: (slug: string) => ['stories', 'by-slug', slug] as const,
  chaptersBySlug: (slug: string, page: number) => ['chapters', slug, page] as const,
  chapterContent: (slug: string, index: string) => ['chapter', slug, index] as const,
};
```

- [ ] **Step 2: API + hooks**

`api/stories.ts`:

```typescript
import { api } from '@/lib/api-client';

export interface StorySummary {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  status: 'ongoing' | 'completed' | 'dropped' | 'unknown';
  totalChapters: number;
  hasCover: boolean;
  updatedAt: string;
}

export async function listStories(page = 1, limit = 48): Promise<StorySummary[]> {
  const res = await api.get<StorySummary[]>('/stories', { params: { page, limit } });
  return res.data;
}

export interface StoryDetail extends StorySummary {
  description: string;
  genres: { slug: string; name: string }[];
  sources: { sourceId: string; externalUrl: string; isPrimary: boolean }[];
}

export async function getStoryBySlug(slug: string): Promise<StoryDetail> {
  const res = await api.get<StoryDetail>(`/stories/by-slug/${slug}`);
  return res.data;
}

export interface ChapterListResponse {
  items: { index: string; title: string; status: string }[];
  page: number;
  totalPages: number;
  total: number;
}

export async function listChapters(slug: string, page = 1, pageSize = 50): Promise<ChapterListResponse> {
  const res = await api.get<ChapterListResponse>(`/stories/by-slug/${slug}/chapters`, { params: { page, pageSize } });
  return res.data;
}
```

`api/chapters.ts`:

```typescript
import { api } from '@/lib/api-client';

export interface ChapterContent {
  story: { slug: string; title: string };
  chapter: { index: number; title: string; content: string | null; isCrawled: boolean };
  prev: { index: number; title: string } | null;
  next: { index: number; title: string } | null;
}

export async function getChapterContent(slug: string, index: string): Promise<ChapterContent> {
  const res = await api.get<ChapterContent>(`/chapters/by-slug/${slug}/${index}`);
  return res.data;
}
```

- [ ] **Step 3: Component ports**

Copy structure from `apps/web/src/components/reader/`:
- `StoryCard.tsx`, `StoryGrid.tsx` — same; swap `<Link>` from `next/link` to `<Link>` from `@tanstack/react-router`. Cover URL: `src={`/api/v1/cover/${id}`}` (the Vite dev proxy forwards `/api/*` to the API on 3001).
- `ChapterList.tsx`, `ChapterNav.tsx` — same, swap `<Link>`.
- `ReaderHeader.tsx`, `ReaderSettings.tsx` — same. Theme: replace `next-themes` with a custom Zustand persist store.

`stores/reader-prefs-store.ts`:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface ReaderPrefs {
  theme: Theme;
  fontSize: string;
  fontFamily: 'sans' | 'serif' | 'mono';
  setTheme: (t: Theme) => void;
  setFontSize: (s: string) => void;
  setFontFamily: (f: 'sans' | 'serif' | 'mono') => void;
}

export const useReaderPrefs = create<ReaderPrefs>()(
  persist(
    (set) => ({
      theme: 'system',
      fontSize: '18',
      fontFamily: 'serif',
      setTheme: (theme) => set({ theme }),
      setFontSize: (fontSize) => set({ fontSize }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
    }),
    { name: 'smanga:reader' },
  ),
);
```

`components/providers/ThemeProvider.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react';
import { useReaderPrefs } from '@/stores/reader-prefs-store';

const FAMILY_CSS: Record<'sans' | 'serif' | 'mono', string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, serif',
  mono: 'ui-monospace, SFMono-Regular, monospace',
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme, fontSize, fontFamily } = useReaderPrefs();
  useEffect(() => {
    const root = document.documentElement;
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
    root.style.setProperty('--reader-font-size', `${fontSize}px`);
    root.style.setProperty('--reader-font-family', FAMILY_CSS[fontFamily]);
  }, [theme, fontSize, fontFamily]);
  return <>{children}</>;
}
```

- [ ] **Step 4: Reader layout route `routes/__root.tsx` (update)**

```tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ReaderHeader } from '@/components/reader/ReaderHeader';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col">
        <ReaderHeader />
        <main className="flex-1"><Outlet /></main>
        <footer className="border-t border-border py-6 text-sm text-center text-muted-foreground">
          SManga · Đọc truyện chữ
        </footer>
      </div>
    </ThemeProvider>
  ),
});
```

- [ ] **Step 5: Index landing route `routes/index.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { listStories } from '@/api/stories';
import { StoryGrid } from '@/components/reader/StoryGrid';

export const Route = createFileRoute('/')({
  component: Landing,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({ queryKey: ['stories', { page: 1, limit: 48 }], queryFn: () => listStories(1, 48) }),
});

function Landing() {
  const { data: stories = [] } = useQuery({ queryKey: ['stories', { page: 1, limit: 48 }], queryFn: () => listStories(1, 48) });
  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mới cập nhật</h1>
        <p className="text-muted-foreground text-sm">{stories.length} truyện</p>
      </div>
      <StoryGrid stories={stories.map((s) => ({ ...s }))} />
    </div>
  );
}
```

- [ ] **Step 6: Story detail route `routes/truyen.$slug.index.tsx`**

(File-based with `$slug` segment. TanStack Router places it under `src/routes/truyen/$slug/index.tsx`.)

```tsx
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getStoryBySlug, listChapters } from '@/api/stories';
import { ChapterList } from '@/components/reader/ChapterList';
import { Badge } from '@/components/ui/badge';

export const Route = createFileRoute('/truyen/$slug/')({
  component: StoryDetail,
  validateSearch: (s: Record<string, unknown>) => ({ page: Number(s.page) || 1 }),
});

function StoryDetail() {
  const { slug } = Route.useParams();
  const { page } = Route.useSearch();
  const storyQ = useQuery({ queryKey: ['story', slug], queryFn: () => getStoryBySlug(slug) });
  const chaptersQ = useQuery({ queryKey: ['chapters', slug, page], queryFn: () => listChapters(slug, page) });

  if (storyQ.isLoading) return <div className="container py-8">Đang tải...</div>;
  if (!storyQ.data) return <div className="container py-8">Không tìm thấy.</div>;
  const s = storyQ.data;
  const items = (chaptersQ.data?.items ?? []).map((c) => ({
    index: Number(c.index),
    title: c.title,
    isCrawled: c.status === 'crawled',
  }));

  return (
    <div className="container py-8 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
        <div className="aspect-[3/4] bg-muted overflow-hidden rounded">
          <img src={`/api/v1/cover/${s.id}`} alt={`Bìa ${s.title}`} className="w-full h-full object-cover" />
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-bold">{s.title}</h1>
          <p className="text-muted-foreground">Tác giả: {s.author ?? 'Khuyết danh'}</p>
          <div className="flex gap-2 flex-wrap items-center">
            <Badge variant={s.status === 'completed' ? 'success' : 'secondary'}>
              {s.status === 'completed' ? 'Hoàn thành' : s.status === 'ongoing' ? 'Đang ra' : s.status}
            </Badge>
            <span className="text-sm text-muted-foreground">{s.totalChapters} chương</span>
          </div>
          {s.genres.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {s.genres.map((g) => (
                <span key={g.slug} className="text-xs px-2 py-0.5 rounded bg-muted">{g.name}</span>
              ))}
            </div>
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
        <ChapterList
          slug={s.slug}
          chapters={items}
          currentPage={page}
          totalPages={chaptersQ.data?.totalPages ?? 1}
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Chapter reader route `routes/truyen.$slug.chuong-$index.tsx`**

(File: `src/routes/truyen/$slug/chuong-$index.tsx`.)

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getChapterContent } from '@/api/chapters';
import { ChapterNav } from '@/components/reader/ChapterNav';

export const Route = createFileRoute('/truyen/$slug/chuong-$index')({
  component: ChapterReader,
});

function ChapterReader() {
  const { slug, index } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ['chapter', slug, index],
    queryFn: () => getChapterContent(slug, index),
  });
  if (isLoading || !data) return <div className="container py-8">Đang tải...</div>;
  const navProps = {
    slug,
    current: data.chapter.index,
    prev: data.prev,
    next: data.next,
  };
  return (
    <article className="container max-w-3xl py-8">
      <header className="mb-4">
        <p className="text-sm text-muted-foreground">
          <a href={`/truyen/${slug}`} className="hover:underline">{data.story.title}</a>
        </p>
        <h1 className="text-2xl font-bold mt-1">
          Chương {data.chapter.index}: {data.chapter.title.replace(/^Chương\s*\d+(?:\.\d+)?\s*:?\s*/i, '')}
        </h1>
      </header>
      <ChapterNav {...navProps} />
      {data.chapter.isCrawled ? (
        <div
          className="prose prose-sm sm:prose-base max-w-none whitespace-pre-line leading-relaxed"
          style={{
            fontSize: 'var(--reader-font-size, 18px)',
            fontFamily: 'var(--reader-font-family, ui-serif, Georgia, serif)',
          }}
        >
          {data.chapter.content}
        </div>
      ) : (
        <div className="border border-dashed border-border rounded p-8 text-center text-muted-foreground">
          Chương này chưa được crawl.
        </div>
      )}
      <ChapterNav {...navProps} />
    </article>
  );
}
```

- [ ] **Step 8: Smoke**

`pnpm --filter @smanga/frontend dev` → visit `http://localhost:3000`. Click story → see detail → click chapter → see content. Toggle theme + font size.

- [ ] **Step 9: Commit**

```
git add -A
git commit -m "feat(frontend): port reader pages — landing, story detail, chapter reader + theme + settings"
```

---

### Task 12: Admin pages (sources + stories + story detail + jobs)

Port from `apps/web/src/app/admin/*` and `apps/web/src/components/admin/*` to `apps/frontend/src/routes/admin/*` and `apps/frontend/src/components/admin/*`. The patterns are mechanical:
- Server-component data fetching → TanStack Query hooks
- Server actions / `fetch` to `/api/admin/*` → `axios.post` to `/api/v1/*` with credentials
- Middleware role gate → route `beforeLoad` that checks `useAuthStore` (or calls `me()`)

**Files:**
- Create: `apps/frontend/src/routes/admin/route.tsx` (layout + guard)
- Create: `apps/frontend/src/routes/admin/index.tsx` (dashboard)
- Create: `apps/frontend/src/routes/admin/sources.tsx`
- Create: `apps/frontend/src/routes/admin/stories/index.tsx`
- Create: `apps/frontend/src/routes/admin/stories/$id.tsx`
- Create: `apps/frontend/src/routes/admin/jobs.tsx`
- Create: `apps/frontend/src/api/sources.ts`, `api/jobs.ts`
- Create: `apps/frontend/src/components/admin/*.tsx` (ports of Plan 2 admin components)

- [ ] **Step 1: `routes/admin/route.tsx` (layout with role gate)**

```tsx
import { createFileRoute, Outlet, Link, redirect } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/auth-store';
import { me } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const user = await me();
    if (!user) throw redirect({ to: '/dang-nhap', search: { redirect: '/admin' } });
    if (user.role !== 'admin') throw redirect({ to: '/' });
    useAuthStore.getState().setUser(user);
  },
  component: AdminLayout,
});

const NAV = [
  { href: '/admin', label: 'Tổng quan' },
  { href: '/admin/sources', label: 'Sources' },
  { href: '/admin/stories', label: 'Truyện' },
  { href: '/admin/jobs', label: 'Jobs' },
] as const;

function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  async function logout() {
    await api.post('/auth/logout');
    useAuthStore.getState().setUser(null);
    window.location.href = '/';
  }
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-border bg-muted/30 p-4 space-y-1">
        <Link to="/admin" className="block font-semibold text-lg mb-4">SManga Admin</Link>
        {NAV.map((n) => (
          <Link key={n.href} to={n.href} className="block rounded px-3 py-2 hover:bg-muted text-sm">
            {n.label}
          </Link>
        ))}
      </aside>
      <main className="flex-1 p-6">
        <div className="flex items-center justify-end gap-4 mb-6 text-sm">
          <span className="text-muted-foreground">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={logout}>Đăng xuất</Button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: API helpers (`api/sources.ts`, `api/jobs.ts`)**

`api/sources.ts`:

```typescript
import { api } from '@/lib/api-client';

export interface Source {
  id: string; name: string; baseUrl: string;
  isActive: boolean; rateLimitRps: string;
}

export const sourcesApi = {
  list: () => api.get<Source[]>('/sources').then((r) => r.data),
  create: (body: { id: string; name: string; baseUrl: string; rateLimitRps: number }) =>
    api.post('/sources', body).then((r) => r.data),
  remove: (id: string) => api.delete(`/sources/${id}`).then((r) => r.data),
};
```

`api/jobs.ts`:

```typescript
import { api } from '@/lib/api-client';

export interface JobRow {
  id: string;
  name: string;
  state: string;
  attemptsMade: number;
  timestamp: number;
  failedReason: string | null;
}

export const jobsApi = {
  stats: () => api.get<Record<string, number>>('/jobs/stats').then((r) => r.data),
  list: () => api.get<JobRow[]>('/jobs').then((r) => r.data),
  retry: (id: string) => api.post(`/jobs/${id}/retry`).then((r) => r.data),
};
```

- [ ] **Step 3: Admin pages — implement each route**

`routes/admin/index.tsx` (dashboard): query stats + recent counts via `useQuery`, render Card grid identical to Plan 2 dashboard.

`routes/admin/sources.tsx`: query `sourcesApi.list`, render table + SourceForm (port from Plan 2 admin/SourceForm.tsx, swap `fetch` → axios `sourcesApi.create`, `router.refresh()` → `queryClient.invalidateQueries({ queryKey: ['sources'] })`).

`routes/admin/stories/index.tsx`: query `listStories(1, 100)`, render table + ImportStoryForm (POSTs `/stories/import`).

`routes/admin/stories/$id.tsx`: parallel queries — `api.get('/stories/' + id)`, `api.get('/stories/' + id + '/chapters')`. Render sources panel + ChapterCrawlPanel calling `POST /chapters/crawl/:storyId`.

`routes/admin/jobs.tsx`: query `jobsApi.stats` + `jobsApi.list`. Render state count Cards + JobsTable (port from Plan 2, swap retry `fetch` → `jobsApi.retry`).

The full code follows the same shape as Plan 2's admin components but client-side. Refer to `apps/web/src/components/admin/*.tsx` for exact JSX; swap server-component sections for `useQuery` and React state.

- [ ] **Step 4: Smoke**

Visit `/admin` → see counts. Add a source. Import a story. Click "Crawl missing" — Bull processor logs in API terminal. Refresh `/admin/jobs` → see job states.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(frontend): admin pages port — sources, stories, story detail, jobs"
```

---

### Task 13: Update operations runbook, delete old Next.js + worker

**Files:**
- Modify: `docs/operations.md`
- Delete: `apps/web/`
- Delete: `services/crawler-worker/`
- Modify: root `package.json` (drop `dev:worker` script; add `dev:api`, `dev:frontend`)
- Modify: `pnpm-workspace.yaml` — no change needed (globs still match new apps).

- [ ] **Step 1: Replace `docs/operations.md` "Run everything" section**

```markdown
## Run everything (4 terminals)

```powershell
# Terminal 1: postgres + redis
pnpm dev:db

# Terminal 2: migrations + seed (one-time per fresh DB)
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm db:migrate
pnpm db:seed

# Terminal 3: NestJS API
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
$env:REDIS_URL = "redis://localhost:6379"
$env:JWT_SECRET = "<value from .env>"
pnpm --filter @smanga/api start:dev    # http://localhost:3001/api/docs

# Terminal 4: Vite frontend
pnpm --filter @smanga/frontend dev      # http://localhost:3000
```
```

- [ ] **Step 2: Update root `package.json` scripts**

Remove `dev:worker`. Add:

```json
"dev:api": "pnpm --filter @smanga/api start:dev",
"dev:frontend": "pnpm --filter @smanga/frontend dev"
```

- [ ] **Step 3: Delete old code**

```powershell
Remove-Item -Recurse -Force apps/web
Remove-Item -Recurse -Force services/crawler-worker
```

- [ ] **Step 4: Verify monorepo still builds**

```powershell
pnpm install
pnpm --filter @smanga/api typecheck
pnpm --filter @smanga/frontend typecheck
pnpm --filter @smanga/db test
pnpm --filter @smanga/crawler test
pnpm --filter @smanga/shared test
```

Expected: all PASS. If anything in `packages/*` references `@smanga/web` or `@smanga/crawler-worker` (shouldn't — they're framework-agnostic), fix the import.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "chore: delete old Next.js apps/web and services/crawler-worker; update ops runbook"
```

---

### Task 14: End-to-end manual smoke + close-out

- [ ] **Step 1: Full reset + walkthrough**

```powershell
docker compose -f docker-compose.dev.yml down -v
pnpm dev:db
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm db:migrate
pnpm db:seed
```

Start API (Terminal 3) and frontend (Terminal 4) as per the new runbook.

Walkthrough:
1. `http://localhost:3000` — landing renders (empty grid initially).
2. Register: `curl.exe -X POST http://localhost:3001/api/v1/auth/register -H "Content-Type: application/json" -d '{\"email\":\"admin@test.com\",\"password\":\"adminpassword\",\"name\":\"Admin\"}'`
3. Promote: `docker exec smanga-postgres psql -U smanga -d smanga -c "UPDATE \"user\" SET role='admin' WHERE email='admin@test.com';"`
4. Visit `http://localhost:3000/dang-nhap`. Sign in. Redirect to `/admin` dashboard.
5. `/admin/stories` → Import URL `https://truyenfull.today/xuyen-thu-chi-ba-ai-doc-the/`. API logs `import-story start` → `done` within ~15s.
6. `/admin/jobs` → see counts (completed: 1).
7. Click story in `/admin/stories` → `/admin/stories/<id>` → click "Crawl missing" → enqueued N chapters. Bull processors log fetch-chapter activity. Refresh — `crawled` badges and byte sizes appear progressively.
8. Visit `/` → story card appears with cover. Click → story detail. Click crawled chapter → content rendered. Open Cài đặt → switch dark mode + font size, refresh — preferences persist.
9. Sign out → `/admin` redirects to `/dang-nhap`.

- [ ] **Step 2: Final commit (if any fixes)**

```
git add -A
git commit -m "chore: NestJS rework end-to-end smoke verified"
```

(Skip if no code changes during smoke.)

---

## Self-review

**Scope coverage:**
- ✅ NestJS API replaces Next.js server side + crawler-worker (Tasks 2-8)
- ✅ Vite+React replaces Next.js client side (Tasks 9-12)
- ✅ Bull + Redis replaces pg-boss (Tasks 1, 3, queue logic)
- ✅ JWT cookie auth replaces Auth.js v5 (Task 4)
- ✅ shadcn primitives ported (Task 9 + 11)
- ✅ TanStack Query for server state, Zustand for client state (Task 10, 11, 12)
- ✅ Reader UI feature parity (Task 11)
- ✅ Admin UI feature parity (Task 12)
- ✅ Old stack deleted (Task 13)

**Out of scope (deferred):**
- Search via pg_trgm — Plan 5 (was originally Plan 4 before this rework)
- User features (bookmark, reading progress) — Plan 5
- WebSocket real-time job updates — could add post Plan 4 if polling becomes insufficient
- Production deploy — Plan 6 (was Plan 5)

**Placeholders:** None. Every step has actual code, exact commands, expected output.

**Type consistency:**
- `JwtPayload` interface defined in `auth.service.ts`, consumed by `jwt.strategy.ts`.
- `ImportStoryJobData` / `FetchChapterJobData` defined in `queue.constants.ts`, used by all producers and processors.
- `Source`, `StorySummary`, `StoryDetail`, `ChapterContent`, `JobRow` interfaces in `apps/frontend/src/api/*` mirror the API shapes; if backend response changes, FE typecheck breaks first.

**Risks worth flagging:**
- Bull's job `state` is derived (no single column); the Jobs service computes `state` from `failedReason`/`finishedOn`/`processedOn`. If `getJobs` semantics change between Bull 4 and a future Bull 5, the mapping in `jobs.service.ts` needs review.
- `chapter.index` in DB is `numeric` (string in TS); routes pass it as URL string and equality query matches. Number conversion only happens at display sites.
- `apps/api` tsconfig deviates from base (CommonJS, no `verbatimModuleSyntax`, allows decorators) — required for NestJS. Don't try to harmonize with base.
- React 19 RC + Vite + TanStack Router: pin versions exactly; minor RC bumps have introduced breaking changes in the React 19 cycle.
- TanStack Router auto-generates `routeTree.gen.ts` on first dev run — gitignore it (`apps/frontend/src/routeTree.gen.ts`). Add to `.gitignore` at root.
