# Admin Jobs Page Overrides

> **PROJECT:** SManga
> **Generated:** 2026-06-11
> **Page Type:** Dashboard / Queue Operations
> **Route:** `/admin/jobs`

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.
> Inherits the dashboard conventions in `admin.md` (12-col grid, high content density, z-index scale 10/20/30/50).

---

## Page-Specific Rules

### Layout Overrides

- **Sections (top → bottom):** 1. Header (title + global actions: Retry-all-failed, Re-crawl-all, Refresh), 2. Stat cards grid (`grid-cols-2 md:grid-cols-3 lg:grid-cols-7`), 3. "Job gần đây" recent-jobs table, 4. **Needs Attention / Dead Letter** panel.
- The Dead Letter panel is the durable, Postgres-backed view; the stat cards + recent-jobs table reflect transient Bull/Redis state. Keep them visually distinct so operators don't confuse "failed (Bull, trimmed after 24h)" with "needs attention (durable)".

### Color Overrides

- **Classification badge tones:** `transient` → neutral (`bg-bg-subtle text-fg-muted border-border`); `permanent` → destructive (`bg-destructive/15 text-destructive border-destructive/30`). Tone encodes "retrying will help" vs "needs a human/code fix".
- **Status badge tones:** `pending` / `retrying` → neutral or accent (`bg-accent/15 text-accent border-accent/30` for in-flight retrying); `needs_attention` / `dead` → destructive. Reuse the recent-jobs `STATE_TONE` map shape.
- Reuse the existing CSS-variable tokens already on this page (`--accent`, `--fg-muted`, `--bg`, `--bg-subtle`, `--border`, `--destructive`, `--positive`) — do **not** hardcode hex.

### Component Overrides

- **Panel container:** reuse the recent-jobs pattern — `rounded-xl border border-border bg-bg overflow-hidden` with a `px-5 py-3 border-b border-border` header.
- **Per-row actions (required):** Retry now + Dismiss as compact icon buttons (`h-7 w-7`, Lucide `RotateCcw` / `X`), right-aligned. (The `admin.md` "Avoid: single row actions only" rule applies — provide both per-row and the bulk Retry-all.)
- **Kill switch:** an `auto_retry_enabled` checkbox toggle in the panel header (label "Tự động retry"), styled with `accent-[var(--accent)]`; reflects + writes server state via `GET/PATCH /admin/settings/auto-retry`.
- **Bulk action:** "Retry tất cả" button in the header, shown only when rows exist.

### Content / Copy

- Vietnamese display text is expected (reader-facing operator UI): "Cần xử lý", "Đang retry", "Đã bỏ cuộc", "Chờ retry", "Tự động retry". Identifiers/props stay English (project rule).
- "Retry now" latency note: the reconciler tick is every 5 min, so surface that a re-armed row is picked up on the next tick (not instantly) if space allows.

---

## Page-Specific Components

- **DeadLetterPanel** (`apps/frontend/src/components/admin/DeadLetterPanel.tsx`) — status/classification table with per-row Retry-now/Dismiss, bulk Retry-all, and the auto-retry kill switch. Polls every 15s, gated on an admin session.

---

## Recommendations

- States: handle loading / empty ("Không có job nào cần xử lý") / populated distinctly; consider splitting error vs empty rather than conflating them.
- Mutations: prefer per-row pending state so acting on one row doesn't disable every row's buttons.
- Effects: row highlight on hover, smooth status-badge transitions (150–300ms), tabular-nums for generation/counts.
- Responsive: horizontal scroll for the table on narrow viewports (`overflow-x-auto`), matching the recent-jobs table.
- A11y: icon-only row buttons need `title`/`aria-label`; visible focus rings (inherit Master focus-visible).
