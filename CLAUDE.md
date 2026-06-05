# SManga — Project Context for Claude

Vietnamese novel reader. Crawls from `truyenfull.today` (multi-source-capable via `SourceAdapter` interface), persists in Postgres, serves to readers + an admin operator. Owned by `son.cu@opswat.com`.

## State of play (last updated 2026-06-05)

- **Plans 1-3 complete** on `main`. Working end-to-end with Next.js full-stack `apps/web` + pg-boss `services/crawler-worker`.
- **Plan 4 (NestJS rework) complete.** `apps/api` (NestJS 11) + `apps/frontend` (Vite+React) replace the legacy `apps/web` + `services/crawler-worker` (both deleted in Task 13).
- All plans live in `docs/superpowers/plans/`. Read the relevant plan file in full before touching code in its scope.
- Test count: 23 unit tests pass (5 db + 16 crawler + 2 shared). E2E specs written but last verified manually by user.
- **Plan 9 (Laptop self-host) — Phase A+H scaffolded 2026-06-05.** Repo files for laptop deploy ready: `deploy/home/` (compose + Caddy + cloudflared template + backup script + systemd units), `apps/frontend/Dockerfile` + `nginx.conf`, `.github/workflows/build-images.yml`, `docs/home-runbook.md`. Phase B-G require user's laptop hardware + Cloudflare dashboard access; NOT executed.

## Monorepo layout

```
packages/db          Drizzle ORM schema + migrations + client (Postgres)
packages/shared      Zod schemas, SourceAdapter contract, error classes, JobPayload types
packages/crawler     Crawler engine + truyenfull adapter (cheerio-based)
apps/cli             pnpm crawl <url> — standalone CLI (kept after Plan 4)
apps/api             NestJS 11 — BUILT (Plan 4 complete). Auth, sources, stories, chapters, covers, jobs, Bull queue + crawler processors.
apps/frontend        Vite+React — BUILT (Plan 4 complete). Reader + admin pages.
                     (Legacy apps/web + services/crawler-worker deleted in Plan 4 Task 13)
design-system/smanga/     UI tokens (MASTER + page overrides), persisted via ui-ux-pro-max skill
docs/superpowers/specs/   Design spec (single source of truth for product)
docs/superpowers/plans/   Implementation plans
.claude/skills/ui-ux-pro-max/   Locally-installed UI design intelligence skill
```

## Hard-won workarounds — respect these or you WILL break things

1. **Internal imports inside `packages/db/src/schema/*.ts` use `.ts` extensions, not `.js`.** drizzle-kit's CJS bundler cannot resolve `.js` ESM imports back to TS source files. The `schema/index.ts` barrel and consumer packages still use `.js` extensions; only cross-schema imports inside `packages/db/src/schema/` use `.ts`.
2. **`packages/db/drizzle.config.ts` `schema:` field is an explicit array** — `['./src/schema/enums.ts', './src/schema/source.ts', ...]` — NOT a glob and NOT the index barrel. When adding a new schema file, append it to that array.
3. **Postgres `unaccent()` is STABLE, not IMMUTABLE.** GIN trigram index can't use it directly. Migration `0001` creates `immutable_unaccent(text)` wrapper. The story search index uses the wrapper.
4. ~~**`@auth/drizzle-adapter` snake_case mismatch**~~ — OBSOLETE. Legacy Next.js Auth.js adapter deleted with `apps/web`.
5. **NestJS app (`apps/api`) needs a custom `webpack.config.js`** to bundle `@smanga/*` workspace packages with `.ts` imports. The default tsc builder fails. See `apps/api/webpack.config.js` for the explicit aliases + ts-loader patches. When adding a new workspace package, update the alias list.
6. ~~**Next.js `transpilePackages` resolution**~~ — OBSOLETE. `apps/web` deleted.
7. **Consumer tsconfigs need `"allowImportingTsExtensions": true, "noEmit": true`** to typecheck through the db package's `.ts` schema imports.
8. **bcrypt** — `apps/api` uses `bcryptjs` (pure JS, no native module issues). No `serverExternalPackages` needed. webpack alias not required for bcryptjs.
9. ~~**Auth.js v5 middleware split**~~ — OBSOLETE. `apps/web` deleted. NestJS uses passport-jwt (no Edge runtime constraints).
10. ~~**pg-boss v10 column naming**~~ — OBSOLETE. pg-boss replaced by Bull/Redis in Plan 4. `services/crawler-worker` deleted.
11. **`chapter.contentText` is gzipped bytea.** Always `gunzipSync` on read. Crawler `engine.fetchChapterById` gzips on write. `contentByteSize` stores the UNCOMPRESSED length for stats.
12. **TanStack Router `routeTree.gen.ts`** (when Plan 4 Task 9 lands) is auto-generated. Add to `.gitignore`.
13. **Vietnamese-friendly search** — use the existing GIN index over `immutable_unaccent(lower(title || ' ' || author))` with `pg_trgm`. Query with `ILIKE '%' || immutable_unaccent(lower(:q)) || '%'`.
14. **NestJS dev watch needs `RunScriptWebpackPlugin`** — `nest start --watch` rebuilds the bundle on source change but does NOT restart the Node process under our custom webpack config. The plugin is wired in `apps/api/webpack.config.js` when `--watch` is detected. If you ever switch off webpack mode in nest-cli.json, this block can go away.

## Crawler conventions

- New source = new folder under `packages/crawler/src/sources/<id>/` implementing `SourceAdapter` from `@smanga/shared`.
- Adapter methods take **HTML strings**, not URLs. The crawler engine handles fetching, rate-limiting, retries, persistence, cover download.
- Parser tests are **fixture-driven**: HTML committed under `__fixtures__/`. Re-capture when the live site breaks tests.
- Rate limit defaults to 1 rps per source. Engine enforces via token bucket per `sourceId`.
- truyenfull-specific selectors that diverged from common patterns (already coded):
  - Chapter index extracted from URL slug (`/chuong-N/`), NOT from title text
  - `hasNextPage` detected via `.glyphicon-menu-right` icon, NOT `/trang-N/` substring (that matches prev-page links too)
  - Chapter title selector is `a.chapter-title`, not `.chapter-title`

## Design system — Plan 4 onwards

Before any frontend code, read:

- `design-system/smanga/MASTER.md` — global tokens
- `design-system/smanga/pages/<page>.md` — page-specific overrides (when present)

Headline tokens:

- Primary `#18181B` (zinc-900), CTA `#EC4899` (pink-500), Background `#FAFAFA`
- Heading font `Newsreader`, body font `Roboto` — literary editorial vibe
- 150-300ms transitions, 8/12/16px radii, 4.5:1 contrast minimum
- No emoji icons (use Lucide), cursor-pointer everywhere, focus rings visible, prefers-reduced-motion respected

When implementing a new page, generate an override first:

```powershell
py .claude/skills/ui-ux-pro-max/scripts/search.py "<page description>" --design-system --persist -p "SManga" --page "<slug>"
```

## Local dev

```powershell
# Terminal 1: postgres + redis
pnpm dev:db

# Terminal 2: migrations + seed (one-time per fresh DB)
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm db:migrate
pnpm db:seed

# Terminal 3: NestJS API (http://localhost:3001, Swagger at /api/docs)
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
$env:REDIS_URL = "redis://localhost:6379"
$env:JWT_SECRET = "<value from .env>"
pnpm dev:api

# Terminal 4: Vite frontend (http://localhost:3000)
pnpm dev:frontend
```

See `docs/operations.md` for full runbook including admin bootstrap, common queries, and smoke checklist.

## Bootstrap admin user

```powershell
curl.exe -X POST http://localhost:3001/api/v1/auth/register -H "Content-Type: application/json" -d '{\"email\":\"admin@test.com\",\"password\":\"adminpassword\",\"name\":\"Admin\"}'
docker exec smanga-postgres psql -U smanga -d smanga -c "UPDATE \"user\" SET role='admin' WHERE email='admin@test.com';"
```

Email must contain a real TLD — Zod `.email()` rejects bare `admin@test`.

## Architectural decisions (the why)

- **Postgres + Drizzle** (not MongoDB+Prisma): join-heavy relational domain (story-chapter-source-genre), full-text search for Vietnamese via `pg_trgm + immutable_unaccent`, hobby budget fits Neon free tier.
- **Bull + Redis** (Plan 4 onwards, replacing pg-boss): matches the `manga-crawler` reference project and is the canonical NestJS queue. Trade-off: +1 service.
- **NestJS + Vite/React split** (Plan 4) vs Next.js full-stack (Plans 1-3): user chose BE/FE separation for clarity, independent scaling, and NestJS conventions. Cost: rework ~50% of Plan 2-3 UI work.
- **shadcn/ui + Tailwind**: portable across Next.js → Vite, MIT-licensed code-in-tree (not a runtime dep).
- **Cheerio-first crawler with Playwright fallback option**: truyenfull serves static HTML, so cheerio (50ms/request) beats Playwright (2s/request, 300MB Chromium). The `SourceAdapter.requiresJs` flag exists for future sources that need JS rendering.
- **Cover stored as bytea in Postgres** (not R2): chose simplicity over CDN. ~50KB × 500 stories = 25MB, negligible. `/api/cover/[id]` route serves with `Cache-Control: public, max-age=31536000, immutable` + ETag — Vercel/CDN edge cache absorbs the load.

## What NOT to do

- Don't rewrite drizzle schema imports back to `.js` — they MUST be `.ts` inside `packages/db/src/schema/`.
- Don't add `apps/web/src/app/page.tsx` AND `apps/web/src/app/(reader)/page.tsx` simultaneously — Next.js will error on route conflict (route groups are URL-transparent).
- Don't ungzip chapter content client-side — the server route handles it.
- Don't put `bcrypt` or any native module in code that the Auth.js Edge middleware will pull in. Use `auth.config.ts` for Edge-safe config.
- Don't skip the design system MASTER.md before writing new UI — page overrides only override what they explicitly set; everything else inherits.
- Don't run `npx playwright` directly when you mean `pnpm --filter @smanga/web exec playwright` — workspace isolation matters.
- Don't `git push` or `git push --force` without the user explicitly asking. Don't amend pushed commits. Use new commits for fixes.

## Where to start when picking up a task

1. Read `MEMORY.md` (auto-loaded by Claude Code).
2. Read the plan file for the task in scope (`docs/superpowers/plans/*.md`).
3. If touching UI: read `design-system/smanga/MASTER.md` + relevant page override.
4. If touching crawler: read `packages/crawler/src/sources/truyenfull/parsers.ts` + the fixtures.
5. If touching DB: read `packages/db/src/schema/*.ts`. NEVER write SQL by hand — use Drizzle.
