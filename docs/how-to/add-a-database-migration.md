# How to add a database migration

This guide covers the end-to-end Drizzle ORM workflow for evolving the Postgres schema:
editing the schema source, generating a migration, running it locally, and avoiding
the common pitfalls specific to this codebase.

Related docs:
- Reference: [`docs/reference/data-model.md`](../reference/data-model.md)
- Architecture: [`docs/architecture/08-crosscutting-concepts.md`](../architecture/08-crosscutting-concepts.md)
- Local dev: [`docs/operations.md`](../operations.md)

---

## 1. Edit the schema source

All schema lives under `packages/db/src/schema/`.  Each file defines one logical
group of tables.

| File | Contents |
|---|---|
| `enums.ts` | All `pgEnum` definitions (`story_status`, `chapter_status`, `story_discovery_status`, …) |
| `source.ts` | `source` table |
| `story.ts` | `story`, `story_source`, `genre`, `story_genre` |
| `chapter.ts` | `chapter` |
| `auth.ts` | `user`, `session`, `account`, `verification_token` |
| `user-data.ts` | `bookmark`, `reading_progress` |
| `app-setting.ts` | `app_setting` |
| `engagement.ts` | `rating` (there is no `story_view` table — view counts are `view_count` integer columns on `story` and `chapter`) |
| `comment.ts` | `comment` |
| `job-failure.ts` | `job_failure` |

Edit the relevant file.  Example — adding a nullable column to `story`:

```ts
// packages/db/src/schema/story.ts
export const story = pgTable('story', {
  // … existing columns …
  syncedAt: timestamp('synced_at', { withTimezone: true }),   // ← new column
});
```

### Critical import rule

**Inside `packages/db/src/schema/`**, cross-file imports must use `.ts` extensions:

```ts
// packages/db/src/schema/chapter.ts
import { story } from './story.ts';    // ✓ .ts extension required
import { story } from './story.js';    // ✗ drizzle-kit cannot resolve .js back to source
```

The `schema/index.ts` barrel and all consumer packages (`apps/api`, `apps/frontend`,
`packages/crawler`) use `.js` extensions (standard ESM); only intra-schema imports
are special.  See `CLAUDE.md` §1 for the full explanation.

---

## 2. Update `drizzle.config.ts` when adding a new schema file

`packages/db/drizzle.config.ts` lists schema files as an **explicit array**, not a
glob:

```ts
export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './src/schema/enums.ts',
    './src/schema/source.ts',
    './src/schema/story.ts',
    './src/schema/chapter.ts',
    './src/schema/auth.ts',
    './src/schema/user-data.ts',
    './src/schema/app-setting.ts',
    './src/schema/engagement.ts',
    './src/schema/comment.ts',
    './src/schema/job-failure.ts',
  ],
  out: './src/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://smanga:smanga_dev@localhost:5432/smanga' },
  casing: 'snake_case',
});
```

If you create a **new schema file**, append it to the `schema:` array.  A glob or
the barrel index (`./src/schema/index.ts`) will not work with drizzle-kit's CJS
bundler.  See `CLAUDE.md` §2.

Also export the new file from `packages/db/src/schema/index.ts`:

```ts
export * from './your-new-schema.ts';
```

---

## 3. Generate the migration SQL

With the local Postgres running (`pnpm dev:db`) and `DATABASE_URL` set:

```powershell
# PowerShell — set env var for the current session
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"

pnpm db:generate
```

This runs `drizzle-kit generate` (alias defined in `packages/db/package.json`),
which diffs the schema against `packages/db/src/migrations/meta/_journal.json` and
writes a new SQL file to `packages/db/src/migrations/`:

```
packages/db/src/migrations/
├── 0014_acoustic_mockingbird.sql   ← latest existing migration (at time of writing)
├── 0015_<auto-name>.sql            ← new file produced by generate
└── meta/
    ├── _journal.json               ← tracks applied migrations
    └── 0015_snapshot.json
```

**Review the generated SQL before proceeding.**  Drizzle's diff is reliable but
always confirm the DDL looks right (especially for destructive changes like
`DROP COLUMN`).

---

## 4. Never hand-write SQL migrations

Do not create or edit `.sql` files in `packages/db/src/migrations/` by hand.  The
drizzle journal (`meta/_journal.json` and `meta/*_snapshot.json`) must stay in sync
with the SQL.  Manual edits corrupt the journal and cause the migrator to apply
duplicate or incorrect DDL.

Exception: if you need a one-off data-fix or a Postgres feature drizzle-kit cannot
generate (e.g. the `immutable_unaccent` wrapper function introduced in migration
`0001_pale_salo.sql`), append the DDL **within** the generated migration file
immediately after drizzle-kit generates it, before applying.

---

## 5. Apply the migration locally

```powershell
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm db:migrate
```

This runs `tsx src/migrate.ts` which calls `drizzle-orm/postgres-js/migrator` and
logs diagnostic output showing which Postgres host/db it connected to and the last
15 applied migrations.  Check the output to confirm your new migration hash appears.

---

## 6. The `immutable_unaccent` search wrapper

Migration `0001_pale_salo.sql` creates an `immutable_unaccent(text)` wrapper around
Postgres's `unaccent()` function.  `unaccent()` is `STABLE`, not `IMMUTABLE`, so it
cannot be used directly inside a GIN trigram index expression.  The `story` table's
search index depends on this wrapper:

```ts
// packages/db/src/schema/story.ts
searchIdx: index('story_search_idx').using(
  'gin',
  sql`immutable_unaccent(lower(${t.title} || ' ' || coalesce(${t.author}, ''))) gin_trgm_ops`,
),
```

If you create a fresh database (e.g. for a new environment), ensure migration
`0001` runs before any migration that creates or queries this index.  Running
`pnpm db:migrate` in order handles this automatically.

---

## 7. Caution: schema drift

Drizzle tracks applied migrations in the `drizzle.__drizzle_migrations` table.  If
a migration file is deleted or renamed after being applied, the migrator will
re-apply it (or error).  Never delete applied migration SQL files from the
`packages/db/src/migrations/` directory.

The `src/migrate.ts` script includes post-migration schema checks (for `story.featured`,
the `comment` table, and `reading_progress.session_seconds`) to catch drift early.
Add similar checks when you introduce a column that is critical to application startup.

---

## 8. Production deployment

Migrations run automatically on every API container boot via the **docker-compose
`command` override** in `deploy/home/docker-compose.prod.yml` (the `api` service):

```yaml
command: ["sh", "-c", "pnpm --filter @smanga/db migrate && node apps/api/dist/main.js"]
```

This is *not* done in `apps/api/Dockerfile` — that image's `CMD` is just
`node apps/api/dist/main.js` with no migration step. Migrations are idempotent through
the drizzle journal table, so restarting the container is safe.

For the production laptop deployment: push to `main` → GitHub Actions builds a new
image → Watchtower pulls it → new container starts → migration runs.  See
[`docs/home-runbook.md`](../home-runbook.md) for manual override steps.

---

## 9. Checklist

- [ ] Schema file edited (`.ts` extension for intra-schema imports)
- [ ] New file (if any) added to `drizzle.config.ts` `schema:` array and to `schema/index.ts`
- [ ] `pnpm db:generate` — migration SQL generated and reviewed
- [ ] `pnpm db:migrate` — migration applied locally, diagnostic output clean
- [ ] `pnpm typecheck` — no TS errors
- [ ] `pnpm --filter @smanga/db test` — db tests pass
