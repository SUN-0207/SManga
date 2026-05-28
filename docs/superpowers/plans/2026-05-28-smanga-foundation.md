# SManga Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the monorepo foundation, database schema, crawler engine, and `truyenfull` source adapter such that running `pnpm crawl <truyenfull-story-url>` imports a story (metadata + cover + every chapter) into Postgres.

**Architecture:** pnpm workspace monorepo. `packages/db` owns the Drizzle schema/migrations/client. `packages/shared` holds Zod schemas + adapter types. `packages/crawler` is the engine + source adapters (no UI, no HTTP server). `apps/cli` is a thin CLI that wires engine ↔ db. No web app in this plan — Plan 2 adds it.

**Tech Stack:** Node 20, pnpm 9, TypeScript 5 strict, Drizzle ORM 0.36+, Postgres 16 (via Docker locally), pg-boss 10, undici fetch, cheerio 1, Zod 3, Vitest 2, testcontainers-node, pino, Biome 1.

---

## File structure (locked in before tasks)

```
smanga/
  package.json                      pnpm root; workspaces; scripts
  pnpm-workspace.yaml
  tsconfig.base.json
  biome.json
  vitest.config.ts                  Root config inherited by packages
  docker-compose.dev.yml            postgres-only for dev
  .gitignore
  .env.example
  packages/
    db/
      package.json
      drizzle.config.ts
      src/
        client.ts                   Drizzle client factory (DATABASE_URL)
        schema/
          index.ts                  re-export all tables
          source.ts                 Source table
          story.ts                  Story + StorySource + Genre + StoryGenre
          chapter.ts                Chapter table
          auth.ts                   Auth.js v5 tables + user.role
          user-data.ts              Bookmark + ReadingProgress
          enums.ts                  shared pgEnum definitions
        migrations/                 drizzle-kit generated
        seed.ts                     seeds truyenfull Source
      tests/
        schema.test.ts              testcontainers-driven schema smoke
    shared/
      package.json
      src/
        adapter.ts                  SourceAdapter interface + Zod schemas
        errors.ts                   ParserError, RateLimitError, FetchError
        index.ts                    re-exports
    crawler/
      package.json
      src/
        engine.ts                   importStory, fetchChapter, fetchAllChapters
        rate-limit.ts               Token bucket per source
        fetcher.ts                  cheerio fetcher (default); Playwright lazy stub
        registry.ts                 register/resolve adapters
        cover.ts                    downloadCover helper
        sources/
          truyenfull/
            index.ts                Adapter export
            parsers.ts              Pure functions: HTML string → parsed data
            __fixtures__/
              story.html            (captured during execution)
              chapter.html          (captured during execution)
              chapter-list.html     (captured during execution)
        index.ts                    re-export engine + registry
      tests/
        rate-limit.test.ts
        truyenfull-parsers.test.ts  Fixture-driven
  apps/
    cli/
      package.json
      src/
        crawl.ts                    `pnpm crawl <url>` entry point
```

**Why this split:** `db` owns persistence; `shared` owns the cross-package interface (no Drizzle imports — keeps adapters from accidentally touching DB); `crawler` depends on `shared` + `db`. `apps/cli` is the only entry point in this plan. The web app (Plan 2) and worker service (Plan 2) will be separate workspaces that depend on `db` + `crawler`.

---

### Task 1: Bootstrap pnpm monorepo

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `biome.json`
- Create: `.gitignore`
- Create: `.editorconfig`

- [ ] **Step 1: Confirm pnpm is available**

Run: `pnpm --version`
Expected: Prints `9.x` (any 9.x is fine). If not installed: `npm install -g pnpm@9`.

- [ ] **Step 2: Write root `package.json`**

```json
{
  "name": "smanga",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check .",
    "format": "biome format --write .",
    "db:migrate": "pnpm --filter @smanga/db migrate",
    "db:generate": "pnpm --filter @smanga/db generate",
    "db:seed": "pnpm --filter @smanga/db seed",
    "crawl": "pnpm --filter @smanga/cli crawl",
    "dev:db": "docker compose -f docker-compose.dev.yml up -d postgres"
  },
  "devDependencies": {
    "@biomejs/biome": "1.9.4",
    "typescript": "5.6.3",
    "vitest": "2.1.4",
    "@types/node": "20.17.6"
  }
}
```

- [ ] **Step 3: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "apps/*"
  - "services/*"
```

- [ ] **Step 4: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 5: Write `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignore": ["dist", "build", "node_modules", "**/migrations/**", "**/__fixtures__/**"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": { "noNonNullAssertion": "warn", "useImportType": "error" },
      "suspicious": { "noExplicitAny": "warn" }
    }
  },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "always", "trailingCommas": "all" } }
}
```

- [ ] **Step 6: Write `.gitignore`**

```
node_modules/
dist/
build/
.next/
.turbo/
*.log
.env
.env.local
.DS_Store
coverage/
.vitest/
*.tsbuildinfo
```

- [ ] **Step 7: Write `.editorconfig`**

```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 8: Install and verify**

Run: `pnpm install`
Expected: Installs root devDeps without error. Creates `pnpm-lock.yaml`.

Run: `pnpm lint`
Expected: Biome reports "checked 0 files" (no source yet) without crashing.

- [ ] **Step 9: Commit**

```
git add -A
git commit -m "chore: bootstrap pnpm monorepo with biome + typescript + vitest"
```

---

### Task 2: Postgres via Docker Compose (dev)

**Files:**
- Create: `docker-compose.dev.yml`
- Create: `.env.example`

- [ ] **Step 1: Write `docker-compose.dev.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: smanga-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: smanga
      POSTGRES_PASSWORD: smanga_dev
      POSTGRES_DB: smanga
    ports:
      - "5432:5432"
    volumes:
      - smanga_pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U smanga -d smanga"]
      interval: 3s
      timeout: 3s
      retries: 10

volumes:
  smanga_pg_data:
```

- [ ] **Step 2: Write `.env.example`**

```
DATABASE_URL=postgres://smanga:smanga_dev@localhost:5432/smanga
LOG_LEVEL=info
```

- [ ] **Step 3: Start Postgres and verify**

Run: `pnpm dev:db`
Expected: Container starts. `docker ps` shows `smanga-postgres` healthy after ~5s.

Run: `docker exec smanga-postgres pg_isready -U smanga`
Expected: `accepting connections`.

- [ ] **Step 4: Create `.env` for local use (gitignored)**

Run (PowerShell): `Copy-Item .env.example .env`
Expected: `.env` exists. Confirm `.gitignore` already excludes it.

- [ ] **Step 5: Commit**

```
git add docker-compose.dev.yml .env.example
git commit -m "chore: add postgres dev compose + env template"
```

---

### Task 3: `packages/db` skeleton + Drizzle client

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/schema/index.ts` (empty re-export)

- [ ] **Step 1: Write `packages/db/package.json`**

```json
{
  "name": "@smanga/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts",
    "./client": "./src/client.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "generate": "drizzle-kit generate",
    "migrate": "tsx src/migrate.ts",
    "seed": "tsx src/seed.ts"
  },
  "dependencies": {
    "drizzle-orm": "0.36.0",
    "postgres": "3.4.5"
  },
  "devDependencies": {
    "drizzle-kit": "0.28.0",
    "tsx": "4.19.2",
    "typescript": "5.6.3",
    "@smanga/shared": "workspace:*"
  }
}
```

(Note: `@smanga/shared` is forward-declared; will exist by Task 11. pnpm install once we create it.)

- [ ] **Step 2: Write `packages/db/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write `packages/db/src/client.ts`**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const queryClient = postgres(connectionString, { max: 10 });
  return drizzle(queryClient, { schema });
}

export { schema };
```

- [ ] **Step 4: Write `packages/db/src/schema/index.ts`**

```typescript
// Re-export all schema files. Filled in as we add tables.
export {};
```

- [ ] **Step 5: Write `packages/db/src/index.ts`**

```typescript
export * from './client.js';
export * as schema from './schema/index.js';
```

- [ ] **Step 6: Write `packages/db/drizzle.config.ts`**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './src/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://smanga:smanga_dev@localhost:5432/smanga',
  },
  casing: 'snake_case',
});
```

- [ ] **Step 7: Install workspace deps**

Run: `pnpm install`
Expected: Resolves `drizzle-orm`, `postgres`, `drizzle-kit`, `tsx` into `packages/db/node_modules`.

Run: `pnpm --filter @smanga/db typecheck`
Expected: No errors.

- [ ] **Step 8: Commit**

```
git add -A
git commit -m "feat(db): scaffold @smanga/db package with drizzle client"
```

---

### Task 4: Migration runner + first migration smoke

**Files:**
- Create: `packages/db/src/migrate.ts`

- [ ] **Step 1: Write `packages/db/src/migrate.ts`**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

await migrate(db, { migrationsFolder: './src/migrations' });
await sql.end();
console.log('migrations applied');
```

- [ ] **Step 2: Generate empty migration baseline**

Run: `pnpm db:generate`
Expected: drizzle-kit prints "No schema changes, nothing to migrate" (since schema is empty). That's fine.

- [ ] **Step 3: Commit scaffolding**

```
git add -A
git commit -m "feat(db): add migration runner"
```

---

### Task 5: Schema — `enums.ts` (shared pgEnum)

**Files:**
- Create: `packages/db/src/schema/enums.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Write `packages/db/src/schema/enums.ts`**

```typescript
import { pgEnum } from 'drizzle-orm/pg-core';

export const storyStatusEnum = pgEnum('story_status', [
  'ongoing',
  'completed',
  'dropped',
  'unknown',
]);

export const storySourceStatusEnum = pgEnum('story_source_status', [
  'active',
  'unavailable',
]);

export const chapterStatusEnum = pgEnum('chapter_status', [
  'pending',
  'crawled',
  'failed',
]);

export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);
```

- [ ] **Step 2: Update `packages/db/src/schema/index.ts`**

```typescript
export * from './enums.js';
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @smanga/db typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat(db): define shared pgEnum types"
```

---

### Task 6: Schema — `source` table + test

**Files:**
- Create: `packages/db/src/schema/source.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/tests/setup.ts`
- Create: `packages/db/tests/source.test.ts`

- [ ] **Step 1: Write `packages/db/src/schema/source.ts`**

```typescript
import { boolean, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const source = pgTable('source', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  rateLimitRps: numeric('rate_limit_rps', { precision: 6, scale: 2 }).notNull().default('1'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Source = typeof source.$inferSelect;
export type NewSource = typeof source.$inferInsert;
```

- [ ] **Step 2: Re-export in `packages/db/src/schema/index.ts`**

```typescript
export * from './enums.js';
export * from './source.js';
```

- [ ] **Step 3: Add test dev dependencies**

Edit `packages/db/package.json` `devDependencies` to add:

```json
"@testcontainers/postgresql": "10.13.2",
"vitest": "2.1.4"
```

Run: `pnpm install`
Expected: installs new deps.

- [ ] **Step 4: Write `packages/db/tests/setup.ts`**

```typescript
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll } from 'vitest';

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;

export let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  sql = postgres(container.getConnectionUri(), { max: 1 });
  db = drizzle(sql);
  await migrate(db, { migrationsFolder: './src/migrations' });
}, 60_000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});
```

- [ ] **Step 5: Write `packages/db/tests/source.test.ts`**

```typescript
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { source } from '../src/schema/index.js';
import { db } from './setup.js';

describe('source schema', () => {
  it('inserts and reads a source row', async () => {
    await db.insert(source).values({
      id: 'truyenfull',
      name: 'TruyenFull',
      baseUrl: 'https://truyenfull.today',
    });

    const rows = await db.select().from(source).where(eq(source.id, 'truyenfull'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('TruyenFull');
    expect(rows[0]?.isActive).toBe(true);
    expect(rows[0]?.rateLimitRps).toBe('1.00');
  });
});
```

- [ ] **Step 6: Generate migration**

Run: `pnpm db:generate`
Expected: Creates `packages/db/src/migrations/0000_*.sql` containing `CREATE TYPE "story_status"`, `CREATE TYPE "user_role"`, etc., and `CREATE TABLE "source"`.

Inspect file briefly to confirm enums + source table appear. If migration is empty, schema index probably isn't re-exporting — fix and regenerate.

- [ ] **Step 7: Run test (verify it passes against a fresh container)**

Add to `packages/db/package.json` scripts:

```json
"test": "vitest run"
```

Configure vitest at root level. Create `vitest.config.ts` at repo root:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
```

Run: `pnpm --filter @smanga/db test`
Expected: testcontainer starts (~10s), migration applies, source test passes.

If Docker isn't running for testcontainers: start Docker Desktop and rerun.

- [ ] **Step 8: Commit**

```
git add -A
git commit -m "feat(db): add source table with testcontainers-backed test"
```

---

### Task 7: Schema — `story` + `story_source` + `genre` + `story_genre`

**Files:**
- Create: `packages/db/src/schema/story.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/tests/story.test.ts`

- [ ] **Step 1: Write `packages/db/src/schema/story.ts`**

```typescript
import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { source } from './source.js';
import { storySourceStatusEnum, storyStatusEnum } from './enums.js';

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return 'bytea';
  },
});

export const story = pgTable(
  'story',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    author: text('author'),
    description: text('description').notNull().default(''),
    cover: bytea('cover'),
    coverMimeType: text('cover_mime_type'),
    status: storyStatusEnum('status').notNull().default('unknown'),
    totalChapters: integer('total_chapters').notNull().default(0),
    lastChapterAt: timestamp('last_chapter_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    searchIdx: index('story_search_idx').using(
      'gin',
      sql`unaccent(lower(${t.title} || ' ' || coalesce(${t.author}, ''))) gin_trgm_ops`,
    ),
    lastChapterIdx: index('story_last_chapter_idx').on(t.lastChapterAt),
  }),
);

export const storySource = pgTable(
  'story_source',
  {
    storyId: uuid('story_id')
      .notNull()
      .references(() => story.id, { onDelete: 'cascade' }),
    sourceId: text('source_id')
      .notNull()
      .references(() => source.id, { onDelete: 'restrict' }),
    externalId: text('external_id').notNull(),
    externalUrl: text('external_url').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    status: storySourceStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.storyId, t.sourceId] }),
    externalIdx: uniqueIndex('story_source_external_idx').on(t.sourceId, t.externalId),
  }),
);

export const genre = pgTable('genre', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
});

export const storyGenre = pgTable(
  'story_genre',
  {
    storyId: uuid('story_id')
      .notNull()
      .references(() => story.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genre.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.storyId, t.genreId] }) }),
);

export type Story = typeof story.$inferSelect;
export type NewStory = typeof story.$inferInsert;
export type StorySource = typeof storySource.$inferSelect;
export type NewStorySource = typeof storySource.$inferInsert;
export type Genre = typeof genre.$inferSelect;
```

- [ ] **Step 2: Re-export**

Modify `packages/db/src/schema/index.ts`:

```typescript
export * from './enums.js';
export * from './source.js';
export * from './story.js';
```

- [ ] **Step 3: Add Postgres extensions to migration**

The GIN index requires `pg_trgm` + `unaccent`. Generate migration first:

Run: `pnpm db:generate`
Expected: New migration file `0001_*.sql` with new tables.

Open the latest migration file in `packages/db/src/migrations/`. **Prepend** these two lines at the very top:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
```

Save the file.

- [ ] **Step 4: Write `packages/db/tests/story.test.ts`**

```typescript
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { source, story, storySource } from '../src/schema/index.js';
import { db } from './setup.js';

describe('story schema', () => {
  it('inserts a story with a primary source mapping', async () => {
    await db
      .insert(source)
      .values({ id: 'truyenfull-2', name: 'TF2', baseUrl: 'https://x.test' })
      .onConflictDoNothing();

    const [inserted] = await db
      .insert(story)
      .values({
        slug: 'tieu-thuyet-test-1',
        title: 'Tiểu thuyết test',
        author: 'Tác giả X',
      })
      .returning();

    expect(inserted?.id).toBeDefined();

    await db.insert(storySource).values({
      storyId: inserted!.id,
      sourceId: 'truyenfull-2',
      externalId: 'tieu-thuyet-test',
      externalUrl: 'https://x.test/tieu-thuyet-test',
      isPrimary: true,
    });

    const rows = await db.select().from(storySource).where(eq(storySource.storyId, inserted!.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isPrimary).toBe(true);
  });

  it('enforces unique (sourceId, externalId)', async () => {
    await db
      .insert(source)
      .values({ id: 'src-dup', name: 'Dup', baseUrl: 'https://x.test' })
      .onConflictDoNothing();

    const [s1] = await db
      .insert(story)
      .values({ slug: 'dup-1', title: 'Dup 1' })
      .returning();
    const [s2] = await db
      .insert(story)
      .values({ slug: 'dup-2', title: 'Dup 2' })
      .returning();

    await db.insert(storySource).values({
      storyId: s1!.id,
      sourceId: 'src-dup',
      externalId: 'same-external',
      externalUrl: 'https://x.test/a',
    });

    await expect(
      db.insert(storySource).values({
        storyId: s2!.id,
        sourceId: 'src-dup',
        externalId: 'same-external',
        externalUrl: 'https://x.test/b',
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @smanga/db test`
Expected: Both `source.test.ts` and `story.test.ts` pass. Migration includes `CREATE EXTENSION` and runs cleanly.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat(db): add story/story_source/genre tables with pg_trgm gin index"
```

---

### Task 8: Schema — `chapter` table

**Files:**
- Create: `packages/db/src/schema/chapter.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/tests/chapter.test.ts`

- [ ] **Step 1: Write `packages/db/src/schema/chapter.ts`**

```typescript
import { customType, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { chapterStatusEnum } from './enums.js';
import { source } from './source.js';
import { story } from './story.js';

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return 'bytea';
  },
});

export const chapter = pgTable(
  'chapter',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyId: uuid('story_id')
      .notNull()
      .references(() => story.id, { onDelete: 'cascade' }),
    index: numeric('index', { precision: 10, scale: 2 }).notNull(),
    title: text('title').notNull(),
    contentText: bytea('content_text'),
    contentByteSize: integer('content_byte_size'),
    sourceId: text('source_id')
      .notNull()
      .references(() => source.id, { onDelete: 'restrict' }),
    externalUrl: text('external_url').notNull(),
    crawledAt: timestamp('crawled_at', { withTimezone: true }),
    status: chapterStatusEnum('status').notNull().default('pending'),
    lastError: text('last_error'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => ({
    uniqStoryIndex: uniqueIndex('chapter_story_index_uniq').on(t.storyId, t.index),
  }),
);

export type Chapter = typeof chapter.$inferSelect;
export type NewChapter = typeof chapter.$inferInsert;
```

- [ ] **Step 2: Re-export**

Modify `packages/db/src/schema/index.ts`:

```typescript
export * from './enums.js';
export * from './source.js';
export * from './story.js';
export * from './chapter.js';
```

- [ ] **Step 3: Generate migration**

Run: `pnpm db:generate`
Expected: New migration with `chapter` table and unique index.

- [ ] **Step 4: Write `packages/db/tests/chapter.test.ts`**

```typescript
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { chapter, source, story } from '../src/schema/index.js';
import { db } from './setup.js';

describe('chapter schema', () => {
  it('inserts a chapter with bytea content', async () => {
    await db
      .insert(source)
      .values({ id: 'tf-ch', name: 'TF', baseUrl: 'https://x.test' })
      .onConflictDoNothing();
    const [s] = await db.insert(story).values({ slug: 'ch-s-1', title: 'Ch S 1' }).returning();

    const payload = Buffer.from('Hello, gzipped text would go here');
    await db.insert(chapter).values({
      storyId: s!.id,
      index: '1',
      title: 'Chương 1',
      sourceId: 'tf-ch',
      externalUrl: 'https://x.test/ch1',
      contentText: payload,
      contentByteSize: payload.length,
      status: 'crawled',
    });

    const rows = await db.select().from(chapter).where(eq(chapter.storyId, s!.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.contentText?.toString()).toContain('Hello');
  });

  it('rejects duplicate (storyId, index)', async () => {
    await db
      .insert(source)
      .values({ id: 'tf-dup', name: 'TF', baseUrl: 'https://x.test' })
      .onConflictDoNothing();
    const [s] = await db.insert(story).values({ slug: 'ch-s-2', title: 'Ch S 2' }).returning();

    await db.insert(chapter).values({
      storyId: s!.id,
      index: '1',
      title: 'Chương 1',
      sourceId: 'tf-dup',
      externalUrl: 'https://x.test/a',
    });

    await expect(
      db.insert(chapter).values({
        storyId: s!.id,
        index: '1',
        title: 'Chương 1 dup',
        sourceId: 'tf-dup',
        externalUrl: 'https://x.test/b',
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @smanga/db test`
Expected: All passing.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat(db): add chapter table with unique (story_id, index) index"
```

---

### Task 9: Schema — Auth.js v5 tables + role column

**Files:**
- Create: `packages/db/src/schema/auth.ts`
- Modify: `packages/db/src/schema/index.ts`

This plan adds the tables Auth.js expects so Plan 2 can drop in the Drizzle adapter without schema edits. No tests here — Plan 2 owns auth tests.

- [ ] **Step 1: Write `packages/db/src/schema/auth.ts`**

```typescript
import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { userRoleEnum } from './enums.js';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  image: text('image'),
  passwordHash: text('password_hash'),
  role: userRoleEnum('role').notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable(
  'account',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    expiresAt: integer('expires_at'),
    tokenType: text('token_type'),
    scope: text('scope'),
    idToken: text('id_token'),
    sessionState: text('session_state'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.provider, t.providerAccountId] }) }),
);

export const session = pgTable('session', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

export const verificationToken = pgTable(
  'verification_token',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.identifier, t.token] }) }),
);

export type User = typeof user.$inferSelect;
```

- [ ] **Step 2: Re-export**

Modify `packages/db/src/schema/index.ts`:

```typescript
export * from './enums.js';
export * from './source.js';
export * from './story.js';
export * from './chapter.js';
export * from './auth.js';
```

- [ ] **Step 3: Generate migration**

Run: `pnpm db:generate`
Expected: Migration adds `user`, `account`, `session`, `verification_token`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @smanga/db test`
Expected: All existing tests still pass; new tables created without conflict.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(db): add auth.js v5 tables and user.role column"
```

---

### Task 10: Schema — `bookmark` + `reading_progress`

**Files:**
- Create: `packages/db/src/schema/user-data.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Write `packages/db/src/schema/user-data.ts`**

```typescript
import { numeric, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { story } from './story.js';

export const bookmark = pgTable(
  'bookmark',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    storyId: text('story_id') // matches story.id (uuid stringified)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.storyId] }) }),
);

export const readingProgress = pgTable(
  'reading_progress',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    storyId: text('story_id').notNull(),
    chapterIndex: numeric('chapter_index', { precision: 10, scale: 2 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.storyId] }) }),
);
```

Note: `storyId` here is `text` (not `uuid`) to avoid a hard FK constraint pre-bookmark deletion semantics. Plan 4 will add proper FK references when wiring up the bookmark UI; for now keep it loose to keep this plan focused. (Hard-link via app code, not DB.)

- [ ] **Step 2: Re-export**

Append to `packages/db/src/schema/index.ts`:

```typescript
export * from './user-data.js';
```

Final file:

```typescript
export * from './enums.js';
export * from './source.js';
export * from './story.js';
export * from './chapter.js';
export * from './auth.js';
export * from './user-data.js';
```

- [ ] **Step 3: Generate migration + run tests**

Run: `pnpm db:generate`
Run: `pnpm --filter @smanga/db test`
Expected: PASS.

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat(db): add bookmark + reading_progress tables"
```

---

### Task 11: Seed script for `truyenfull` source

**Files:**
- Create: `packages/db/src/seed.ts`

- [ ] **Step 1: Write `packages/db/src/seed.ts`**

```typescript
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { source } from './schema/index.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

await db
  .insert(source)
  .values({
    id: 'truyenfull',
    name: 'TruyenFull',
    baseUrl: 'https://truyenfull.today',
    rateLimitRps: '1',
  })
  .onConflictDoNothing();

await sql.end();
console.log('seed complete');
```

- [ ] **Step 2: Apply migrations + seed against local DB**

Run: `pnpm dev:db` (ensure Postgres is up)
Run: `DATABASE_URL=postgres://smanga:smanga_dev@localhost:5432/smanga pnpm db:migrate`
Expected: `migrations applied`.

Run: `DATABASE_URL=postgres://smanga:smanga_dev@localhost:5432/smanga pnpm db:seed`
Expected: `seed complete`.

Verify with psql:

Run: `docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT id, name FROM source;"`
Expected: One row `truyenfull | TruyenFull`.

For PowerShell users the env var prefix syntax differs:

```powershell
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm db:migrate
pnpm db:seed
```

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "feat(db): add seed script that registers truyenfull source"
```

---

### Task 12: `packages/shared` — Adapter contract + Zod schemas

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/errors.ts`
- Create: `packages/shared/src/adapter.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/tests/adapter.test.ts`

- [ ] **Step 1: Write `packages/shared/package.json`**

```json
{
  "name": "@smanga/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "3.23.8"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "vitest": "2.1.4"
  }
}
```

- [ ] **Step 2: Write `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write `packages/shared/src/errors.ts`**

```typescript
export class CrawlerError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class FetchError extends CrawlerError {}
export class RateLimitError extends CrawlerError {}
export class ParserError extends CrawlerError {}
export class AdapterNotFoundError extends CrawlerError {}
```

- [ ] **Step 4: Write `packages/shared/src/adapter.ts`**

```typescript
import { z } from 'zod';

export const storyStatusSchema = z.enum(['ongoing', 'completed', 'dropped', 'unknown']);

export const storyMetadataSchema = z.object({
  externalId: z.string().min(1),
  title: z.string().min(1),
  author: z.string().nullable(),
  description: z.string(),
  coverUrl: z.string().url().nullable(),
  genres: z.array(z.string()),
  status: storyStatusSchema,
});
export type StoryMetadata = z.infer<typeof storyMetadataSchema>;

export const chapterRefSchema = z.object({
  index: z.number(),
  title: z.string().min(1),
  externalId: z.string().min(1),
  externalUrl: z.string().url(),
});
export type ChapterRef = z.infer<typeof chapterRefSchema>;

export const chapterContentSchema = z.object({
  title: z.string(),
  text: z.string().min(1),
});
export type ChapterContent = z.infer<typeof chapterContentSchema>;

export const storySearchResultSchema = z.object({
  externalUrl: z.string().url(),
  title: z.string(),
  author: z.string().nullable(),
  coverUrl: z.string().url().nullable(),
});
export type StorySearchResult = z.infer<typeof storySearchResultSchema>;

export interface SourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly hostnames: string[];
  readonly requiresJs: boolean;
  readonly rateLimit: { rps: number };

  parseStoryFromUrl(url: string, html: string): Promise<StoryMetadata>;
  listChapters(html: string): Promise<{ chapters: ChapterRef[]; hasNextPage: boolean }>;
  fetchChapterContent(html: string): Promise<ChapterContent>;
  buildListChaptersUrl(storyUrl: string, page: number): string;
}
```

Note: adapter methods take **HTML strings** (not URLs) — the engine fetches, adapter parses. This keeps adapters trivially testable from fixtures and lets the engine own retry/throttle/Playwright-vs-cheerio choice.

- [ ] **Step 5: Write `packages/shared/src/index.ts`**

```typescript
export * from './adapter.js';
export * from './errors.js';
```

- [ ] **Step 6: Write `packages/shared/tests/adapter.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { storyMetadataSchema } from '../src/adapter.js';

describe('storyMetadataSchema', () => {
  it('accepts a complete metadata payload', () => {
    expect(() =>
      storyMetadataSchema.parse({
        externalId: 'tieu-thuyet-test',
        title: 'Tiểu thuyết test',
        author: 'Tác giả X',
        description: 'mô tả',
        coverUrl: 'https://x.test/cover.jpg',
        genres: ['Tiên Hiệp', 'Huyền Huyễn'],
        status: 'ongoing',
      }),
    ).not.toThrow();
  });

  it('rejects missing title', () => {
    expect(() =>
      storyMetadataSchema.parse({
        externalId: 'x',
        title: '',
        author: null,
        description: '',
        coverUrl: null,
        genres: [],
        status: 'unknown',
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 7: Install + test**

Run: `pnpm install`
Run: `pnpm --filter @smanga/shared typecheck`
Run: `pnpm --filter @smanga/shared test`
Expected: typecheck clean, 2 tests pass.

- [ ] **Step 8: Commit**

```
git add -A
git commit -m "feat(shared): define SourceAdapter contract + Zod schemas"
```

---

### Task 13: `packages/crawler` — Skeleton + rate limiter

**Files:**
- Create: `packages/crawler/package.json`
- Create: `packages/crawler/tsconfig.json`
- Create: `packages/crawler/src/rate-limit.ts`
- Create: `packages/crawler/tests/rate-limit.test.ts`

- [ ] **Step 1: Write `packages/crawler/package.json`**

```json
{
  "name": "@smanga/crawler",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@smanga/db": "workspace:*",
    "@smanga/shared": "workspace:*",
    "cheerio": "1.0.0",
    "drizzle-orm": "0.36.0",
    "pino": "9.5.0",
    "undici": "6.21.0",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "vitest": "2.1.4"
  }
}
```

- [ ] **Step 2: Write `packages/crawler/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": ".", "types": ["node"] },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Write the failing test `packages/crawler/tests/rate-limit.test.ts`**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { TokenBucket } from '../src/rate-limit.js';

describe('TokenBucket', () => {
  it('allows immediate acquire when tokens available', async () => {
    const bucket = new TokenBucket({ ratePerSecond: 5, burst: 5 });
    const start = Date.now();
    await bucket.acquire();
    expect(Date.now() - start).toBeLessThan(20);
  });

  it('delays acquisition when bucket is empty', async () => {
    vi.useFakeTimers();
    try {
      const bucket = new TokenBucket({ ratePerSecond: 2, burst: 1 });
      await bucket.acquire(); // consumes the one token
      const pending = bucket.acquire();
      let resolved = false;
      pending.then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(400);
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(200); // total 600ms; refill is 500ms for 1 token at 2 rps
      await pending;
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 4: Run test, see it fail**

Run: `pnpm install`
Run: `pnpm --filter @smanga/crawler test`
Expected: FAIL with "Cannot find module ../src/rate-limit".

- [ ] **Step 5: Implement `packages/crawler/src/rate-limit.ts`**

```typescript
export interface RateLimitConfig {
  ratePerSecond: number;
  burst?: number;
}

export class TokenBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private lastRefillMs: number;

  constructor(cfg: RateLimitConfig) {
    if (cfg.ratePerSecond <= 0) throw new Error('ratePerSecond must be > 0');
    this.capacity = cfg.burst ?? cfg.ratePerSecond;
    this.tokens = this.capacity;
    this.refillPerMs = cfg.ratePerSecond / 1000;
    this.lastRefillMs = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillMs;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefillMs = now;
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const deficit = 1 - this.tokens;
    const waitMs = Math.ceil(deficit / this.refillPerMs);
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }
}
```

- [ ] **Step 6: Run test, see it pass**

Run: `pnpm --filter @smanga/crawler test`
Expected: PASS both tests.

- [ ] **Step 7: Commit**

```
git add -A
git commit -m "feat(crawler): add token-bucket rate limiter with tests"
```

---

### Task 14: `packages/crawler` — Fetcher (cheerio path) + adapter registry

**Files:**
- Create: `packages/crawler/src/fetcher.ts`
- Create: `packages/crawler/src/registry.ts`
- Create: `packages/crawler/src/logger.ts`

- [ ] **Step 1: Write `packages/crawler/src/logger.ts`**

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'crawler' },
});
```

- [ ] **Step 2: Write `packages/crawler/src/fetcher.ts`**

```typescript
import { request } from 'undici';
import { FetchError, RateLimitError } from '@smanga/shared';
import { logger } from './logger.js';

export interface FetchOptions {
  userAgent?: string;
  timeoutMs?: number;
}

const DEFAULT_UA =
  'Mozilla/5.0 (compatible; SMangaBot/0.1; +https://github.com/smanga)';

export async function fetchHtml(url: string, opts: FetchOptions = {}): Promise<string> {
  const ua = opts.userAgent ?? DEFAULT_UA;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  logger.debug({ url }, 'fetching html');

  let res;
  try {
    res = await request(url, {
      method: 'GET',
      headers: { 'user-agent': ua, accept: 'text/html,application/xhtml+xml' },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
  } catch (err) {
    throw new FetchError(`network error fetching ${url}`, err);
  }

  if (res.statusCode === 429 || res.statusCode === 503) {
    throw new RateLimitError(`rate limited (${res.statusCode}) fetching ${url}`);
  }
  if (res.statusCode >= 400) {
    throw new FetchError(`http ${res.statusCode} fetching ${url}`);
  }
  return await res.body.text();
}

export async function fetchBytes(url: string, opts: FetchOptions = {}): Promise<{ bytes: Buffer; contentType: string }> {
  const ua = opts.userAgent ?? DEFAULT_UA;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  let res;
  try {
    res = await request(url, {
      method: 'GET',
      headers: { 'user-agent': ua },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
  } catch (err) {
    throw new FetchError(`network error fetching ${url}`, err);
  }
  if (res.statusCode >= 400) {
    throw new FetchError(`http ${res.statusCode} fetching ${url}`);
  }
  const buf = Buffer.from(await res.body.arrayBuffer());
  const contentType = String(res.headers['content-type'] ?? 'application/octet-stream');
  return { bytes: buf, contentType };
}
```

- [ ] **Step 3: Write `packages/crawler/src/registry.ts`**

```typescript
import { AdapterNotFoundError, type SourceAdapter } from '@smanga/shared';

const adapters = new Map<string, SourceAdapter>();
const hostnameIndex = new Map<string, string>();

export function registerAdapter(adapter: SourceAdapter): void {
  adapters.set(adapter.id, adapter);
  for (const host of adapter.hostnames) {
    hostnameIndex.set(host.toLowerCase(), adapter.id);
  }
}

export function getAdapter(id: string): SourceAdapter {
  const a = adapters.get(id);
  if (!a) throw new AdapterNotFoundError(`no adapter registered for id=${id}`);
  return a;
}

export function resolveAdapterForUrl(url: string): SourceAdapter {
  const host = new URL(url).hostname.toLowerCase();
  const id = hostnameIndex.get(host);
  if (!id) throw new AdapterNotFoundError(`no adapter registered for hostname=${host}`);
  return getAdapter(id);
}

export function listAdapters(): SourceAdapter[] {
  return Array.from(adapters.values());
}

export function _resetForTests(): void {
  adapters.clear();
  hostnameIndex.clear();
}
```

- [ ] **Step 4: Add registry test `packages/crawler/tests/registry.test.ts`**

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import type { SourceAdapter } from '@smanga/shared';
import { AdapterNotFoundError } from '@smanga/shared';
import { _resetForTests, getAdapter, registerAdapter, resolveAdapterForUrl } from '../src/registry.js';

const stub: SourceAdapter = {
  id: 'stub',
  name: 'Stub',
  baseUrl: 'https://stub.test',
  hostnames: ['stub.test', 'www.stub.test'],
  requiresJs: false,
  rateLimit: { rps: 1 },
  parseStoryFromUrl: async () => ({
    externalId: 'x', title: 'x', author: null, description: '', coverUrl: null, genres: [], status: 'unknown',
  }),
  listChapters: async () => ({ chapters: [], hasNextPage: false }),
  fetchChapterContent: async () => ({ title: '', text: 'x' }),
  buildListChaptersUrl: (u) => u,
};

describe('registry', () => {
  beforeEach(() => _resetForTests());

  it('returns adapter by id', () => {
    registerAdapter(stub);
    expect(getAdapter('stub').id).toBe('stub');
  });

  it('throws when adapter id unknown', () => {
    expect(() => getAdapter('missing')).toThrow(AdapterNotFoundError);
  });

  it('resolves adapter by URL hostname', () => {
    registerAdapter(stub);
    expect(resolveAdapterForUrl('https://www.stub.test/abc').id).toBe('stub');
  });

  it('throws when hostname unknown', () => {
    registerAdapter(stub);
    expect(() => resolveAdapterForUrl('https://other.test')).toThrow(AdapterNotFoundError);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @smanga/crawler test`
Expected: 6 tests pass (2 rate-limit + 4 registry).

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat(crawler): add fetcher (undici) + adapter registry"
```

---

### Task 15: Capture truyenfull HTML fixtures

This is a **manual, one-time step**. The adapter selectors in Task 16 are based on common patterns; verifying against real HTML now prevents Task 16 from being authored against guesses.

**Files:**
- Create: `packages/crawler/src/sources/truyenfull/__fixtures__/README.md`
- Create: `packages/crawler/src/sources/truyenfull/__fixtures__/story.html`
- Create: `packages/crawler/src/sources/truyenfull/__fixtures__/chapter-list.html`
- Create: `packages/crawler/src/sources/truyenfull/__fixtures__/chapter.html`

- [ ] **Step 1: Pick a stable target story**

Open `https://truyenfull.today/` in a browser. Pick a story that is:
- Completed (so chapter list is stable)
- Has at least 100 chapters
- Has a cover image
- Has genres listed

Record:
- Story URL (e.g. `https://truyenfull.today/<slug>/`)
- First chapter URL
- If the chapter list paginates: URL pattern for page 2

- [ ] **Step 2: Save the story landing page HTML**

In PowerShell:

```powershell
$story = "<story-url-here>"
Invoke-WebRequest -UserAgent "Mozilla/5.0 SMangaFixtureCapture" -Uri $story -OutFile packages/crawler/src/sources/truyenfull/__fixtures__/story.html
```

Or `curl`:

```bash
curl -A 'Mozilla/5.0 SMangaFixtureCapture' '<story-url>' -o packages/crawler/src/sources/truyenfull/__fixtures__/story.html
```

**If you get a Cloudflare challenge / 403 / HTML containing "Just a moment...":** capture via browser instead. Open DevTools → Network tab → reload page → click the top document request → right-click → "Copy" → "Copy response". Paste the body into `story.html`. Repeat the same fallback for steps 3 and 4.

- [ ] **Step 3: Save a chapter list page**

Many TruyenFull-style sites paginate chapter listing as `<story-url>/trang-N/` or `?page=N`.

Open browser devtools → Network tab → click "Trang sau" (next page) on the story page → note the URL pattern. Save the HTML of page 2 (or whichever shows the structure) to `chapter-list.html` the same way.

If the entire chapter list fits on the story landing page, just copy `story.html` to `chapter-list.html` for now.

- [ ] **Step 4: Save a chapter content page**

Pick chapter 1's URL from the story page. Save its HTML to `chapter.html` the same way.

- [ ] **Step 5: Write fixture README documenting what was captured**

`packages/crawler/src/sources/truyenfull/__fixtures__/README.md`:

```markdown
# truyenfull fixtures

Captured: YYYY-MM-DD (the date you captured them).

| File | Source URL |
| ---- | ---------- |
| story.html | <full URL> |
| chapter-list.html | <full URL> |
| chapter.html | <full URL> |

Re-capture when the live HTML structure changes (parser tests will fail).
Re-capture command (PowerShell): `Invoke-WebRequest -UserAgent "Mozilla/5.0 SMangaFixtureCapture" -Uri <url> -OutFile <file>`.
```

- [ ] **Step 6: Inspect HTML to confirm selectors before Task 16**

Open `story.html` in an editor. Find the elements containing:
- Title (likely `<h3 class="title">` or `<h1>`)
- Author (look for `itemprop="author"` or a link near "Tác giả")
- Description (`<div class="desc-text">` or similar)
- Cover image (`<img>` near top of info block)
- Genres (links inside genre/category block)
- Status (text like "Đang ra", "Full", "Hoàn thành")

Write down the actual selectors you observed. Use them in Task 16. If they differ from the defaults in Task 16, adjust the parser code accordingly — the test fixtures are the source of truth.

- [ ] **Step 7: Commit fixtures**

```
git add packages/crawler/src/sources/truyenfull/__fixtures__
git commit -m "test(crawler): capture truyenfull HTML fixtures for parser tests"
```

---

### Task 16: truyenfull adapter — `parseStoryFromUrl` (parser + test)

**Files:**
- Create: `packages/crawler/src/sources/truyenfull/parsers.ts`
- Create: `packages/crawler/tests/truyenfull-parsers.test.ts`

These selectors are based on common Vietnamese novel-site patterns (TruyenFull family). **Verify against your fixture from Task 15, Step 6 and adjust if needed.**

- [ ] **Step 1: Write the failing test first**

`packages/crawler/tests/truyenfull-parsers.test.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStoryHtml } from '../src/sources/truyenfull/parsers.js';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'sources',
  'truyenfull',
  '__fixtures__',
);

const storyHtml = readFileSync(join(fixturesDir, 'story.html'), 'utf-8');

describe('truyenfull parseStoryHtml', () => {
  it('extracts non-empty title', () => {
    const md = parseStoryHtml(storyHtml, 'https://truyenfull.today/example/');
    expect(md.title.length).toBeGreaterThan(0);
  });

  it('extracts externalId from the URL slug', () => {
    const md = parseStoryHtml(storyHtml, 'https://truyenfull.today/example-slug/');
    expect(md.externalId).toBe('example-slug');
  });

  it('extracts at least one genre', () => {
    const md = parseStoryHtml(storyHtml, 'https://truyenfull.today/example/');
    expect(md.genres.length).toBeGreaterThan(0);
  });

  it('extracts cover URL when present', () => {
    const md = parseStoryHtml(storyHtml, 'https://truyenfull.today/example/');
    if (md.coverUrl !== null) {
      expect(md.coverUrl).toMatch(/^https?:\/\//);
    }
  });

  it('returns a recognised status value', () => {
    const md = parseStoryHtml(storyHtml, 'https://truyenfull.today/example/');
    expect(['ongoing', 'completed', 'dropped', 'unknown']).toContain(md.status);
  });
});
```

- [ ] **Step 2: Run test, see it fail**

Run: `pnpm --filter @smanga/crawler test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement parser**

`packages/crawler/src/sources/truyenfull/parsers.ts`:

```typescript
import * as cheerio from 'cheerio';
import { ParserError, type ChapterContent, type ChapterRef, type StoryMetadata } from '@smanga/shared';

function extractSlug(url: string): string {
  const u = new URL(url);
  const parts = u.pathname.split('/').filter(Boolean);
  const slug = parts[0];
  if (!slug) throw new ParserError(`cannot extract slug from ${url}`);
  return slug;
}

function normaliseStatus(raw: string): StoryMetadata['status'] {
  const s = raw.toLowerCase();
  if (s.includes('full') || s.includes('hoàn') || s.includes('hoan')) return 'completed';
  if (s.includes('đang ra') || s.includes('dang ra') || s.includes('ongoing')) return 'ongoing';
  if (s.includes('drop')) return 'dropped';
  return 'unknown';
}

export function parseStoryHtml(html: string, url: string): StoryMetadata {
  const $ = cheerio.load(html);

  const title =
    $('h3.title').first().text().trim() ||
    $('h1.title').first().text().trim() ||
    $('h1').first().text().trim();
  if (!title) throw new ParserError('could not locate story title');

  const author =
    $('a[itemprop="author"]').first().text().trim() ||
    $('.info a[href*="/tac-gia/"]').first().text().trim() ||
    null;

  const description =
    $('.desc-text').first().text().trim() ||
    $('div[itemprop="description"]').first().text().trim() ||
    '';

  let coverUrl: string | null = null;
  const imgEl = $('.book img, .books img, .info img').first();
  const src = imgEl.attr('src') ?? imgEl.attr('data-src') ?? null;
  if (src) coverUrl = new URL(src, url).toString();

  const genres: string[] = [];
  $('.info a[href*="/the-loai/"], a[itemprop="genre"]').each((_, el) => {
    const name = $(el).text().trim();
    if (name) genres.push(name);
  });

  const statusRaw =
    $('.info span.text-success').first().text().trim() ||
    $('.info span.text-primary').first().text().trim() ||
    $('.info').find('span').last().text().trim();
  const status = normaliseStatus(statusRaw);

  return {
    externalId: extractSlug(url),
    title,
    author,
    description,
    coverUrl,
    genres,
    status,
  };
}

export function parseChapterListHtml(
  html: string,
  storyUrl: string,
): { chapters: ChapterRef[]; hasNextPage: boolean } {
  const $ = cheerio.load(html);
  const chapters: ChapterRef[] = [];
  const indexRe = /chương\s*(\d+(?:\.\d+)?)/i;

  $('ul.list-chapter a, .list-chapter a, ul.list_chapter a').each((_, el) => {
    const a = $(el);
    const href = a.attr('href');
    const title = a.text().trim();
    if (!href || !title) return;

    const fullUrl = new URL(href, storyUrl).toString();
    const m = title.match(indexRe);
    if (!m) return;
    const idx = Number(m[1]);
    if (Number.isNaN(idx)) return;

    const slug = new URL(fullUrl).pathname.split('/').filter(Boolean).pop() ?? fullUrl;

    chapters.push({
      index: idx,
      title,
      externalId: slug,
      externalUrl: fullUrl,
    });
  });

  let hasNextPage = false;
  $('.pagination a, ul.pagination a').each((_, el) => {
    const t = $(el).text().trim().toLowerCase();
    if (t.includes('sau') || t.includes('next') || t === '»') hasNextPage = true;
  });
  // active page = last numeric; if there is a numeric page > active, there is also a next link, captured above.
  return { chapters, hasNextPage };
}

export function parseChapterContentHtml(html: string): ChapterContent {
  const $ = cheerio.load(html);

  const title =
    $('.chapter-title').first().text().trim() ||
    $('h2.chapter').first().text().trim() ||
    $('h2').first().text().trim() ||
    '';

  const contentEl = $('#chapter-c, .chapter-c, .chapter-content').first();
  if (contentEl.length === 0) throw new ParserError('could not locate chapter content element');

  contentEl.find('script, style, ins, iframe').remove();
  const text = contentEl
    .text()
    .replace(/ /g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) throw new ParserError('chapter content empty after parse');
  return { title, text };
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @smanga/crawler test`
Expected: 5 parseStoryHtml tests pass against fixture. If a selector miss causes a fail:
- Open the fixture, find the actual selector
- Adjust the corresponding line in `parsers.ts`
- Re-run

This iteration cycle (test → adjust selectors → test) is expected — the fixture is the source of truth.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(crawler/truyenfull): implement parseStoryHtml against fixture"
```

---

### Task 17: truyenfull adapter — `parseChapterListHtml` test

**Files:**
- Modify: `packages/crawler/tests/truyenfull-parsers.test.ts`

- [ ] **Step 1: Append chapter-list tests**

Add to the existing test file:

```typescript
import { parseChapterListHtml, parseChapterContentHtml } from '../src/sources/truyenfull/parsers.js';

const chapterListHtml = readFileSync(join(fixturesDir, 'chapter-list.html'), 'utf-8');

describe('truyenfull parseChapterListHtml', () => {
  it('extracts at least one chapter with monotonically meaningful indices', () => {
    const { chapters } = parseChapterListHtml(chapterListHtml, 'https://truyenfull.today/example/');
    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters.every((c) => Number.isFinite(c.index))).toBe(true);
    expect(chapters.every((c) => c.externalUrl.startsWith('http'))).toBe(true);
  });

  it('returns hasNextPage as a boolean', () => {
    const { hasNextPage } = parseChapterListHtml(chapterListHtml, 'https://truyenfull.today/example/');
    expect(typeof hasNextPage).toBe('boolean');
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter @smanga/crawler test`
Expected: PASS. If chapter list selector is wrong (0 chapters parsed), inspect fixture and adjust `parseChapterListHtml`'s `ul.list-chapter a` selectors.

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "test(crawler/truyenfull): cover parseChapterListHtml"
```

---

### Task 18: truyenfull adapter — `parseChapterContentHtml` test

**Files:**
- Modify: `packages/crawler/tests/truyenfull-parsers.test.ts`

- [ ] **Step 1: Append chapter-content tests**

```typescript
const chapterHtml = readFileSync(join(fixturesDir, 'chapter.html'), 'utf-8');

describe('truyenfull parseChapterContentHtml', () => {
  it('extracts non-empty text', () => {
    const c = parseChapterContentHtml(chapterHtml);
    expect(c.text.length).toBeGreaterThan(100);
  });

  it('does not include script tags in text', () => {
    const c = parseChapterContentHtml(chapterHtml);
    expect(c.text).not.toMatch(/<script/i);
  });

  it('extracts a non-empty title', () => {
    const c = parseChapterContentHtml(chapterHtml);
    expect(c.title.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter @smanga/crawler test`
Expected: PASS. If content selector misses, adjust `#chapter-c, .chapter-c, .chapter-content` line.

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "test(crawler/truyenfull): cover parseChapterContentHtml"
```

---

### Task 19: truyenfull adapter — assemble + register

**Files:**
- Create: `packages/crawler/src/sources/truyenfull/index.ts`
- Create: `packages/crawler/src/index.ts`

- [ ] **Step 1: Write adapter file**

`packages/crawler/src/sources/truyenfull/index.ts`:

```typescript
import type { SourceAdapter } from '@smanga/shared';
import {
  parseChapterContentHtml,
  parseChapterListHtml,
  parseStoryHtml,
} from './parsers.js';

export const truyenfullAdapter: SourceAdapter = {
  id: 'truyenfull',
  name: 'TruyenFull',
  baseUrl: 'https://truyenfull.today',
  hostnames: ['truyenfull.today', 'www.truyenfull.today'],
  requiresJs: false,
  rateLimit: { rps: 1 },

  async parseStoryFromUrl(url, html) {
    return parseStoryHtml(html, url);
  },
  async listChapters(html) {
    return parseChapterListHtml(html, 'https://truyenfull.today/');
  },
  async fetchChapterContent(html) {
    return parseChapterContentHtml(html);
  },
  buildListChaptersUrl(storyUrl, page) {
    if (page <= 1) return storyUrl;
    const u = new URL(storyUrl);
    const trimmed = u.pathname.replace(/\/$/, '');
    u.pathname = `${trimmed}/trang-${page}/`;
    return u.toString();
  },
};
```

- [ ] **Step 2: Write `packages/crawler/src/index.ts`**

```typescript
import { registerAdapter } from './registry.js';
import { truyenfullAdapter } from './sources/truyenfull/index.js';

registerAdapter(truyenfullAdapter);

export * from './registry.js';
export * from './fetcher.js';
export * from './engine.js';
export { truyenfullAdapter };
```

(Note: `./engine.js` doesn't exist yet — that's Task 20. The import will fail typecheck temporarily; we will write engine in the next task. Skip the engine export for now.)

Adjust to:

```typescript
import { registerAdapter } from './registry.js';
import { truyenfullAdapter } from './sources/truyenfull/index.js';

registerAdapter(truyenfullAdapter);

export * from './registry.js';
export * from './fetcher.js';
export { truyenfullAdapter };
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @smanga/crawler typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat(crawler/truyenfull): assemble adapter and register on import"
```

---

### Task 20: Engine — `importStory` + cover download

**Files:**
- Create: `packages/crawler/src/cover.ts`
- Create: `packages/crawler/src/engine.ts`
- Modify: `packages/crawler/src/index.ts`

- [ ] **Step 1: Write `packages/crawler/src/cover.ts`**

```typescript
import { fetchBytes } from './fetcher.js';
import { logger } from './logger.js';

const MAX_COVER_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function downloadCover(url: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
  try {
    const { bytes, contentType } = await fetchBytes(url);
    const mimeType = contentType.split(';')[0]?.trim() ?? 'application/octet-stream';
    if (!ALLOWED.has(mimeType)) {
      logger.warn({ url, mimeType }, 'cover mime not allowed, skipping');
      return null;
    }
    if (bytes.length > MAX_COVER_BYTES) {
      logger.warn({ url, size: bytes.length }, 'cover too large, skipping');
      return null;
    }
    return { bytes, mimeType };
  } catch (err) {
    logger.warn({ url, err: (err as Error).message }, 'failed to download cover');
    return null;
  }
}
```

- [ ] **Step 2: Write `packages/crawler/src/engine.ts`**

```typescript
import { gzipSync } from 'node:zlib';
import { eq, sql } from 'drizzle-orm';
import { storyMetadataSchema, type StoryMetadata } from '@smanga/shared';
import {
  chapter,
  genre,
  source as sourceTable,
  story,
  storyGenre,
  storySource,
} from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { downloadCover } from './cover.js';
import { fetchHtml } from './fetcher.js';
import { logger } from './logger.js';
import { getAdapter, resolveAdapterForUrl } from './registry.js';
import { TokenBucket } from './rate-limit.js';

const buckets = new Map<string, TokenBucket>();
function bucketFor(sourceId: string, rps: number): TokenBucket {
  let b = buckets.get(sourceId);
  if (!b) {
    b = new TokenBucket({ ratePerSecond: rps, burst: rps });
    buckets.set(sourceId, b);
  }
  return b;
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export interface ImportResult {
  storyId: string;
  totalChapters: number;
}

export async function importStory(db: Database, url: string): Promise<ImportResult> {
  const adapter = resolveAdapterForUrl(url);
  const bucket = bucketFor(adapter.id, adapter.rateLimit.rps);
  logger.info({ url, source: adapter.id }, 'importing story');

  await bucket.acquire();
  const html = await fetchHtml(url);
  const rawMetadata = await adapter.parseStoryFromUrl(url, html);
  const metadata: StoryMetadata = storyMetadataSchema.parse(rawMetadata);

  const cover = metadata.coverUrl ? await downloadCover(metadata.coverUrl) : null;

  const baseSlug = slugify(metadata.title) || slugify(metadata.externalId) || 'story';
  const slug = await uniqueSlug(db, baseSlug);

  // Upsert source row defensively (in case it was not seeded — engine still works)
  await db
    .insert(sourceTable)
    .values({ id: adapter.id, name: adapter.name, baseUrl: adapter.baseUrl })
    .onConflictDoNothing();

  const [storyRow] = await db
    .insert(story)
    .values({
      slug,
      title: metadata.title,
      author: metadata.author,
      description: metadata.description,
      status: metadata.status,
      cover: cover?.bytes,
      coverMimeType: cover?.mimeType,
    })
    .returning();
  if (!storyRow) throw new Error('story insert returned no row');

  await db
    .insert(storySource)
    .values({
      storyId: storyRow.id,
      sourceId: adapter.id,
      externalId: metadata.externalId,
      externalUrl: url,
      isPrimary: true,
    })
    .onConflictDoNothing();

  for (const name of metadata.genres) {
    const gSlug = slugify(name);
    if (!gSlug) continue;
    const [g] = await db
      .insert(genre)
      .values({ slug: gSlug, name })
      .onConflictDoUpdate({ target: genre.slug, set: { name } })
      .returning();
    if (!g) continue;
    await db
      .insert(storyGenre)
      .values({ storyId: storyRow.id, genreId: g.id })
      .onConflictDoNothing();
  }

  let total = 0;
  let page = 1;
  while (true) {
    const listUrl = adapter.buildListChaptersUrl(url, page);
    await bucket.acquire();
    const listHtml = await fetchHtml(listUrl);
    const { chapters, hasNextPage } = await adapter.listChapters(listHtml);
    if (chapters.length === 0) break;

    const rows = chapters.map((c) => ({
      storyId: storyRow.id,
      index: String(c.index),
      title: c.title,
      sourceId: adapter.id,
      externalUrl: c.externalUrl,
      status: 'pending' as const,
    }));
    await db.insert(chapter).values(rows).onConflictDoNothing();
    total += rows.length;

    if (!hasNextPage) break;
    page += 1;
    if (page > 200) {
      logger.warn({ url }, 'chapter list pagination exceeded 200 pages; aborting');
      break;
    }
  }

  await db
    .update(story)
    .set({ totalChapters: total, updatedAt: new Date() })
    .where(eq(story.id, storyRow.id));

  logger.info({ storyId: storyRow.id, total }, 'story imported');
  return { storyId: storyRow.id, totalChapters: total };
}

async function uniqueSlug(db: Database, base: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const existing = await db
      .select({ id: story.id })
      .from(story)
      .where(eq(story.slug, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
  }
  throw new Error(`could not generate unique slug for base=${base}`);
}

export async function fetchChapterById(db: Database, chapterId: string): Promise<void> {
  const [row] = await db.select().from(chapter).where(eq(chapter.id, chapterId)).limit(1);
  if (!row) throw new Error(`chapter not found: ${chapterId}`);
  const [src] = await db.select().from(sourceTable).where(eq(sourceTable.id, row.sourceId)).limit(1);
  if (!src) throw new Error(`source not found: ${row.sourceId}`);

  const adapter = getAdapter(row.sourceId);
  const bucket = bucketFor(adapter.id, Number(src.rateLimitRps));
  await bucket.acquire();

  try {
    const html = await fetchHtml(row.externalUrl);
    const content = await adapter.fetchChapterContent(html);
    const raw = Buffer.from(content.text, 'utf-8');
    const compressed = gzipSync(raw);
    await db
      .update(chapter)
      .set({
        contentText: compressed,
        contentByteSize: raw.length, // uncompressed size for stats
        status: 'crawled',
        crawledAt: new Date(),
        lastError: null,
      })
      .where(eq(chapter.id, chapterId));
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    await db
      .update(chapter)
      .set({ status: 'failed', lastError: msg })
      .where(eq(chapter.id, chapterId));
    throw err;
  }
}

export async function fetchAllPendingChapters(db: Database, storyId: string): Promise<{ done: number; failed: number }> {
  const pending = await db
    .select({ id: chapter.id })
    .from(chapter)
    .where(sql`${chapter.storyId} = ${storyId} AND ${chapter.status} IN ('pending', 'failed')`);

  let done = 0;
  let failed = 0;
  for (const row of pending) {
    try {
      await fetchChapterById(db, row.id);
      done += 1;
    } catch {
      failed += 1;
    }
  }
  return { done, failed };
}
```

- [ ] **Step 3: Update `packages/crawler/src/index.ts`**

```typescript
import { registerAdapter } from './registry.js';
import { truyenfullAdapter } from './sources/truyenfull/index.js';

registerAdapter(truyenfullAdapter);

export * from './registry.js';
export * from './fetcher.js';
export * from './engine.js';
export { truyenfullAdapter };
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @smanga/crawler typecheck`
Expected: PASS. If errors:
- `@smanga/db/schema` not resolving → check `packages/db/package.json` exports map includes `./schema`.
- `bytea` custom type complaints → ensure `Buffer` from `node:buffer` is implicitly available (TypeScript `lib: ES2022` + `@types/node`).

- [ ] **Step 5: Run existing tests (no engine tests yet — those are CLI smoke in Task 22)**

Run: `pnpm --filter @smanga/crawler test`
Expected: PASS (rate-limit, registry, truyenfull parsers).

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat(crawler): add engine.importStory + fetchChapterById + cover download"
```

---

### Task 21: `apps/cli` — `pnpm crawl <url>` entry point

**Files:**
- Create: `apps/cli/package.json`
- Create: `apps/cli/tsconfig.json`
- Create: `apps/cli/src/crawl.ts`

- [ ] **Step 1: Write `apps/cli/package.json`**

```json
{
  "name": "@smanga/cli",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "crawl": "tsx src/crawl.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@smanga/crawler": "workspace:*",
    "@smanga/db": "workspace:*",
    "@smanga/shared": "workspace:*"
  },
  "devDependencies": {
    "tsx": "4.19.2",
    "typescript": "5.6.3"
  }
}
```

- [ ] **Step 2: Write `apps/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src", "types": ["node"] },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write `apps/cli/src/crawl.ts`**

```typescript
import process from 'node:process';
import { createDb } from '@smanga/db';
import { fetchAllPendingChapters, importStory } from '@smanga/crawler';

function parseArgs(argv: string[]): { url: string; chapters: boolean } {
  const args = argv.slice(2);
  let url: string | undefined;
  let chapters = false;
  for (const a of args) {
    if (a === '--chapters' || a === '--all-chapters') chapters = true;
    else if (!a.startsWith('-')) url = a;
  }
  if (!url) {
    console.error('usage: pnpm crawl <story-url> [--chapters]');
    process.exit(1);
  }
  return { url, chapters };
}

const { url, chapters } = parseArgs(process.argv);
const connection = process.env.DATABASE_URL;
if (!connection) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const db = createDb(connection);

const result = await importStory(db, url);
console.log(`imported story ${result.storyId} with ${result.totalChapters} chapters`);

if (chapters) {
  console.log('fetching chapter content...');
  const { done, failed } = await fetchAllPendingChapters(db, result.storyId);
  console.log(`chapters: ${done} crawled, ${failed} failed`);
}

process.exit(0);
```

- [ ] **Step 4: Install + typecheck**

Run: `pnpm install`
Run: `pnpm --filter @smanga/cli typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(cli): add pnpm crawl <url> entry point"
```

---

### Task 22: End-to-end smoke against real truyenfull

This task does not write code — it validates the foundation works end-to-end against the real source. Any defects discovered here loop back to fix the parser / engine.

- [ ] **Step 1: Reset local DB**

```powershell
docker compose -f docker-compose.dev.yml down -v
pnpm dev:db
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm db:migrate
pnpm db:seed
```

Expected: Container fresh; migrations applied; truyenfull source seeded.

- [ ] **Step 2: Crawl story metadata only**

Pick the story URL you used for fixture capture in Task 15.

```powershell
pnpm crawl <story-url>
```

Expected output:
```
imported story <uuid> with N chapters
```

Verify in DB:

```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT id, slug, title, total_chapters, cover IS NOT NULL AS has_cover FROM story;"
```

Expected: One row. `has_cover = t`. `total_chapters > 0`.

```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT count(*) FROM chapter WHERE status = 'pending';"
```

Expected: Matches `total_chapters`.

If any of the above is wrong:
- 0 chapters → re-inspect `parseChapterListHtml` against the fixture; selectors are likely off
- no cover → check `metadata.coverUrl` path; cover URL parsing in `parseStoryHtml` may need work
- title/author empty → adjust selectors in `parseStoryHtml`

Fix, re-run from Step 1.

- [ ] **Step 3: Crawl chapters (subset)**

To avoid hammering truyenfull during testing, crawl just the first 3 chapters:

```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT id, title FROM chapter ORDER BY index LIMIT 3;"
```

Then run a manual loop in node REPL (or temporarily edit `apps/cli/src/crawl.ts` to add `--limit N` arg if desired — optional QoL not in this plan).

Simpler: just run `pnpm crawl <url> --chapters` if you are comfortable letting it crawl all chapters (at 1 rps that's ~17 minutes per 1000 chapters). For smoke, ctrl-C after ~30s and inspect.

Verify:

```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT count(*) FROM chapter WHERE status = 'crawled' AND content_text IS NOT NULL;"
```

Expected: > 0 rows.

```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT length(content_text) FROM chapter WHERE status = 'crawled' LIMIT 1;"
```

Expected: > 1000 bytes typically.

- [ ] **Step 4: Document any selector fixes back into fixtures**

If you adjusted selectors during this task, re-run `pnpm --filter @smanga/crawler test` to confirm fixture tests still pass. If they don't, the fixture is now stale relative to the new selectors — that's a sign the live HTML differs from the fixture; re-capture fixtures (Task 15).

- [ ] **Step 5: Final commit**

```
git add -A
git commit -m "chore: foundation smoke validated against truyenfull.today"
```

(If no code changes were needed, no commit. If selector fixes were made, commit them.)

---

## Self-review

Coverage against Plan 1 scope:
- ✅ Monorepo bootstrap — Task 1
- ✅ Docker Postgres dev env — Task 2
- ✅ `@smanga/db` skeleton + migrations + client — Tasks 3, 4
- ✅ DB schema: enums, source, story+storySource+genre+storyGenre, chapter, auth, user-data — Tasks 5–10
- ✅ Seed truyenfull source — Task 11
- ✅ `@smanga/shared` adapter contract + Zod + errors — Task 12
- ✅ `@smanga/crawler` rate-limit, fetcher, registry, logger — Tasks 13, 14
- ✅ Capture HTML fixtures — Task 15
- ✅ truyenfull parsers (story / chapter list / chapter) with fixture tests — Tasks 16–18
- ✅ truyenfull adapter assembly + registration — Task 19
- ✅ Engine: importStory, fetchChapterById, fetchAllPendingChapters, cover download — Task 20
- ✅ `apps/cli` `pnpm crawl <url>` — Task 21
- ✅ End-to-end smoke — Task 22

Out of scope (deferred to Plan 2+):
- Web app, admin UI, reader UI
- Auth.js wiring (schema is in place, runtime is not)
- pg-boss queue + worker service
- Search (pg_trgm + unaccent extensions are installed; query layer is Plan 4)
- Bookmark, reading progress (tables in place; UI/API is Plan 4)
- Playwright integration (engine deliberately calls only `fetchHtml`; adding a `requiresJs`-aware fetcher is a 1-task addition in a future plan)
