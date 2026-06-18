# Issue Reporting (user → admin) — Design Spec

> **Status:** DRAFT 2026-06-17 — awaiting user review before an implementation plan.
> **Format note:** Authored via the `agent-skills:spec-driven-development` flow. It covers the skill's six areas (objective, commands, project structure, code style, testing, boundaries) but is placed in `docs/superpowers/specs/` (this project's convention) instead of a root `SPEC.md`, and reuses CLAUDE.md as the standing project spec.

## Objective

Let a **logged-in reader** submit a categorized **issue report** to the operator, optionally attached to the story/chapter they're viewing, and give the **admin** a `/admin/reports` page to triage reports through a status lifecycle — with an **open-count badge** on the admin nav so new reports are noticed. This closes the only missing feedback channel: today a reader who hits a broken chapter, an abusive comment, or a bug has no in-product way to tell the operator.

**Target users:** readers (submit) + the single admin operator (triage). Scale ~100–1000 users.

## Decisions (locked, from brainstorming)

- **Unified report + category.** One flow; category ∈ {`content` (lỗi nội dung chương), `comment` (bình luận xấu), `technical` (lỗi kỹ thuật), `other` (khác)}. The reporter may attach the current story and/or chapter as context.
- **Logged-in users only** (reuse `JwtAuthGuard`; ties report to `user_id`; rate-limited).
- **Admin `/admin/reports` page** with a status lifecycle: `open` → `in_progress` → `resolved` | `dismissed`, filterable by status + category.
- **Alerting = open-count badge** on the admin nav (pull-based; no email, no notification-bell changes).
- **Out of scope (YAGNI):** guest submissions; email/push alerts; linking a specific `commentId` (the reporter describes the comment in the message + attaches the chapter); a reader-facing "my reports" list (reporter is not notified of resolution in v1).

## Data model (Drizzle — new schema file `packages/db/src/schema/report.ts`)

New enums (in `enums.ts`):
- `report_category` = `['content', 'comment', 'technical', 'other']`
- `report_status` = `['open', 'in_progress', 'resolved', 'dismissed']`

`report` table:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default random | |
| `user_id` | text NOT NULL, FK→`user(id)` ON DELETE CASCADE | reporter |
| `category` | `report_category` NOT NULL | |
| `message` | text NOT NULL | the report body; validated 5–2000 chars at the API |
| `story_id` | uuid NULL, FK→`story(id)` ON DELETE SET NULL | optional context |
| `chapter_id` | uuid NULL, FK→`chapter(id)` ON DELETE SET NULL | optional context (precise) |
| `status` | `report_status` NOT NULL default `'open'` | |
| `admin_note` | text NULL | operator's resolution note |
| `resolved_by_user_id` | text NULL, FK→`user(id)` ON DELETE SET NULL | who closed it |
| `resolved_at` | timestamptz NULL | set when status becomes terminal |
| `created_at` | timestamptz NOT NULL default now | |
| `updated_at` | timestamptz NOT NULL default now | |

Indexes:
- `(status, created_at DESC)` — serves the admin list filter + the open-count badge (`WHERE status='open'`).
- `(user_id)` — a user's own reports (and per-user rate-limit lookups if needed).

Per CLAUDE.md workaround #2: append `'./src/schema/report.ts'` to the `drizzle.config.ts` `schema:` array. Cross-schema imports inside the file use `.ts` extensions (#1). Migration generated via `drizzle-kit generate` (no hand-written SQL except anything drizzle can't express).

## API (NestJS — new module `apps/api/src/modules/reports/`)

Reader (guarded by `JwtAuthGuard`, rate-limited via the existing throttler guard):
- `POST /api/v1/reports` — body `{ category, message, storyId?, chapterId? }` (class-validator DTO: `category` ∈ enum, `message` `@IsString @Length(5,2000)`, `storyId`/`chapterId` `@IsUUID @IsOptional`). Creates a report with `status='open'`, `user_id` = current user. Returns the created report id. Throttled to a small per-user/IP rate (reuse `real-ip-throttler.guard`) to deter spam.

Admin (guarded by `JwtAuthGuard` + `@Roles(['admin'])`):
- `GET /api/v1/admin/reports?status=&category=&page=&limit=` — paginated list, newest first, joined with reporter (`name`/`email`) and story (`slug`/`title`) + chapter (`index`) for deep-linkable context. Filters optional.
- `GET /api/v1/admin/reports/open-count` — `{ openCount: number }` for the nav badge (mirrors the notification `unreadCount` shape).
- `PATCH /api/v1/admin/reports/:id` — body `{ status?, adminNote? }`. On transition to a terminal status (`resolved`/`dismissed`) set `resolved_by_user_id` = current admin + `resolved_at` = now; clearing back to non-terminal clears them. Returns the updated row.

All queries via Drizzle query builder / parameterized `sql` (never hand-concatenated). Reuse the existing pagination convention used by `/admin` list endpoints.

## Frontend

**Report entry (reader):**
- A reusable `ReportIssueDialog` (modal) with: category select, message textarea (counter, 5–2000), and a read-only "context" line when a story/chapter is attached. Submits via a new `api/reports.ts` client; shows success/error; disables submit while pending.
- Entry points: (1) a "Báo lỗi" item in the user `AvatarMenu` (general, no context); (2) a "Báo lỗi chương này" action on the chapter reader (`ReaderHeader` or the settings drawer) that opens the dialog pre-set to `category='content'` with the current `storyId`/`chapterId`. Guests see the login-gated path (consistent with bookmarks/comments).

**Admin (`apps/frontend/src/routes/admin/reports.tsx`):**
- A table: created time, reporter, category chip, message preview, story/chapter link (when present), status badge, and a row action to change status + add an admin note (drawer or inline select + note field, saved via PATCH).
- Status + category filter controls; pagination via the existing `Pagination` component.
- Admin nav: add a "Báo lỗi" link with an **open-count badge** (fetched from `/admin/reports/open-count`, polled or refetched on the admin layout) — styled like other admin nav entries.

Styling via the existing semantic Tailwind tokens; English identifiers; Vietnamese only in JSX copy + any slug. No `border-<token>/<opacity>` (use solid tokens — the default-border fallback is theme-aware).

## Status workflow

`open` (on submit) → admin moves to `in_progress` (optional) → `resolved` or `dismissed` (terminal; stamps `resolved_by_user_id` + `resolved_at`). The open-count badge counts `status='open'` only.

## Six-area coverage (agent-skills spec)

- **Objective:** above.
- **Commands:** unchanged — `pnpm dev:db | dev:api | dev:frontend`, `pnpm --filter @smanga/db generate|migrate`, `pnpm -r test`, `pnpm --filter <pkg> typecheck` (see CLAUDE.md "Local dev").
- **Project structure:** new files — `packages/db/src/schema/report.ts` (+ `enums.ts` additions, `drizzle.config.ts` array), `apps/api/src/modules/reports/` (module, controller(s), service, DTOs), `apps/frontend/src/api/reports.ts`, `apps/frontend/src/components/reports/ReportIssueDialog.tsx`, `apps/frontend/src/routes/admin/reports.tsx`. Follows the established module/route patterns.
- **Code style:** existing — Biome, English identifiers (CLAUDE.md rule), semantic Tailwind tokens, Drizzle-only schema, no by-hand SQL for app queries.
- **Testing strategy:** Vitest unit tests for `reports.service` (create, list+filter, status-update terminal-stamping) with mocked `db` (matching `auto-retry.spec.ts` / `retry-reconciler.service.spec.ts` style); `pnpm -r typecheck` clean; the db package's testcontainer run validates the migration; Playwright MCP proof of submit → admin list → status change + badge.
- **Boundaries:** below.

## Boundaries

- **Always:** login-gate submits (`JwtAuthGuard`); rate-limit `POST /reports`; validate + length-bound `message` (5–2000); admin endpoints `@Roles(['admin'])`-guarded; schema via Drizzle (+ add `report.ts` to the drizzle.config array); English identifiers; commit only feature files (never `apps/frontend/vite.config.ts`).
- **Ask first:** any change to the notification system, the comment system, or `app_setting`; adding email/push; linking specific comments; exposing reports to non-admins.
- **Never:** let a non-admin read others' reports; allow guest submit (v1); store unbounded/unvalidated input; hand-write SQL for app queries; push without explicit instruction.

## Acceptance criteria

1. A logged-in user can open the report dialog (general + from a chapter), pick a category, type a message, and submit; a chapter-context report stores `story_id` + `chapter_id`.
2. Submitting unauthenticated is rejected (401/redirect to login); empty/too-short/too-long messages are rejected with a clear error; submissions are rate-limited.
3. `/admin/reports` (admin only) lists reports newest-first, filterable by status + category, with reporter + story/chapter context and working deep-links.
4. An admin can move a report through `open → in_progress → resolved|dismissed`; terminal transitions stamp `resolved_by` + `resolved_at`; an admin note can be saved.
5. The admin nav shows an open-count badge equal to `count(status='open')`, updating after triage.
6. Non-admins get 403 on the admin endpoints. `pnpm -r typecheck` + the unit tests are green; the migration applies on a fresh testcontainer.
