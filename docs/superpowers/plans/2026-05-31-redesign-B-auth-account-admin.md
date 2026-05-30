# Redesign Plan B — Auth, Account, Admin Retoken

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Apply Spec A's new token layer to Auth (`/dang-nhap`, `/dang-ky`), Account (`/tai-khoan`), Reader Settings drawer, and all Admin surfaces with a focused retoken pass plus a small UX upgrade (segmented controls + live preview in Reader Settings).

**Architecture:** Token-only refresh across three phases — B1 Auth (split-screen dark gradient + pink CTA), B2 Account + Settings drawer (cards + segmented controls + live preview), B3 Admin (sidebar gradient active state + top bar + tables + dashboard + action bars + delete modal). NO structural changes, NO new routes, NO behavior changes. Reuse existing tokens from Plan A: `bg`, `bg-elevated`, `bg-subtle`, `fg`, `fg-muted`, `fg-subtle`, `accent`, `accent-strong`, `border`, `border-strong`, plus typography (`text-display-md/sm`, `text-heading-lg/md`, `text-body`, `text-body-sm`, `text-label`), `bg-accent-gradient`, `shadow-glow-pink-soft`, `font-sans`, `font-prose`, `duration-fast`.

**Tech Stack:** React 19 + TanStack Router + Tailwind CSS 3 (selector dark mode via `[data-theme="dark"]`) + Lucide icons. Zustand stores already present (`useReaderPrefs`, `useDiscoverImportStore`). React Query for admin data fetches.

**Depends on:** Plan A (shipped 2026-05-30, commits a69435d..37270d0) — token layer + design system foundation.

**Workflow directive:** Commit-only. NEVER `git push`. Every task ends with a local commit.

---

## Task 0 — Pre-flight context (alignment notes for the implementer)

Read this before touching any file. These notes resolve known mismatches between the spec, Plan A's shipped state, and the actual code.

- **Light-first theme is the default (Plan A shipped 2026-05-30).** Spec B was written assuming dark-default; Plan A flipped it to light via the reader-prefs v3 migration. The Completion checklist below has been adjusted: smoke in **LIGHT theme first**, then toggle to dark via the Cài đặt drawer. Replace any "dark theme by default" assumption you encounter with "light by default."
- **Reader prefs store contract (read `apps/frontend/src/stores/reader-prefs-store.ts` once):**
  - Import path is `@/stores/reader-prefs-store` (NOT `@/stores/useReaderPrefs`).
  - Types: `ReaderTheme = 'light' | 'dark' | 'system'`, `ReaderFontSize = '15' | '18' | '20' | '24'` (STRINGS), `ReaderFontFamily = 'sans' | 'serif' | 'mono'`.
  - The store does **not** expose a `reset` action. Either (a) add one with a small refactor task before Task 5 (`reset: () => set({ theme: 'light', fontSize: '18', fontFamily: 'serif' })` plus interface entry), or (b) implement a local `resetDefaults()` helper inside `ReaderSettings.tsx` that calls the three setters in sequence. Pick (b) for the smallest blast radius unless you also need it elsewhere.
- **Discover import store (`apps/frontend/src/stores/discover-import-store.ts`):**
  - Import path is `@/stores/discover-import-store` (NOT `@/stores/useDiscoverImportStore`).
  - The store exports `selected`, `importing`, `toggle`, `clearSelection`, `selectAll`, `markImporting`, `markDone`. There is **no** `clear`, no `autoCrawl`, and no `setAutoCrawl` on the store — `autoCrawl`/`setAutoCrawl` are LOCAL `useState` in the existing DiscoverActionBar. Keep them local in Task 13.
- **Auth routes already use a shared `<GoogleButton>` component** (`apps/frontend/src/components/auth/GoogleButton.tsx`). There is no `providers` object in scope on `dang-nhap.tsx`/`dang-ky.tsx`. Tasks 2 and 3 reuse `<GoogleButton redirect={redirect} label="…" />` rather than inlining a Google button + GoogleGlyph. Do NOT add a `providers.google` gate or inline a `GoogleGlyph` helper. The existing GoogleButton stays.
- **Auth route existing identifiers (do not rename in Plan B — spec says no behavior changes):**
  - `dang-nhap.tsx`: `email`, `password`, `showPwd`, `error` (NOT `errorMessage`), `busy` (NOT `loginMutation.isPending`), `submit` (NOT `handleSubmit`). No `canSubmit` — derive locally with `const canSubmit = email.length > 0 && password.length > 0 && !busy;` when needed for the disabled prop.
  - `dang-ky.tsx`: `name`, `email`, `password`, `showPwd`, `error`, `busy`, `submit`, plus an existing `canSubmit` and `pwdTooShort` you can reuse.
- **Tailwind radius scale (actual `tailwind.config.ts`):** `md = 10px`, `lg = 16px`, `xl = 24px` (Spec A's "8/12/16" wording is aspirational; the shipped config differs). Plan B uses `rounded-md` / `rounded-lg` / `rounded-xl` / `rounded-2xl` and they render at 10/16/24/32. Decide separately whether to align the config to 8/12/16 (out of scope for Plan B).
- **AuthShell font choice (Inter, not Newsreader):** Spec B intentionally uses `font-sans` (Inter) for the auth hero blockquote — auth is chrome, not prose. The `font-heading` alias in tailwind.config.ts already points at Inter, so `font-sans text-display-md` and `font-heading text-display-md` resolve identically. No code change; just don't "fix" it to Newsreader.

> **Implementer Step 0 for every Task that edits an existing file:** open the target file, scan for the existing state-variable names + handler names + prop shapes, and map them to the snippets below before pasting. The snippets show the new className strings and the structural shape — they intentionally retain the existing identifiers wherever spec says "no behavior changes."

---

## Phase B1 — Auth retoken

Smallest blast radius. Three files: `AuthShell.tsx`, `dang-nhap.tsx`, `dang-ky.tsx`. Phase commits incrementally so each surface can be verified visually before moving on.

---

### Task 1: Retoken `AuthShell.tsx` (split-screen layout)

**Files:**
- Modify: `apps/frontend/src/components/auth/AuthShell.tsx`

**Why this task:** AuthShell wraps both `/dang-nhap` and `/dang-ky`. Spec B requires the LEFT pane to flip from a pink-50/rose-50 gradient to a dark gradient with a top-right pink glow orb, plus display-md Inter blockquote (NOT Newsreader, because auth is chrome not prose). This unlocks the rest of B1.

- [ ] **Step 1: Read context**
  Read Spec B section "1. Auth — `/dang-nhap` + `/dang-ky`" in `docs/superpowers/specs/2026-05-30-redesign-B-auth-account-admin-design.md` (lines 19-31) and the AuthShell audit entry above.

  **Step 1b: Verify call sites.** Run `grep -rn '<AuthShell' apps/frontend/src/routes/` — expect ONLY `<AuthShell>` (no props) from `dang-nhap.tsx` and `dang-ky.tsx`. If any call site passes props today, capture them; the new prop signature below accepts them as optional. Note: `font-sans text-display-md` on the blockquote is INTENTIONAL — Spec B uses Inter for the auth hero (auth is chrome, not prose). `font-heading` is also Inter so the two are equivalent; don't "fix" to Newsreader.

- [ ] **Step 2: Replace `AuthShell.tsx` content**

  ```tsx
  // apps/frontend/src/components/auth/AuthShell.tsx
  import { Link } from "@tanstack/react-router";
  import { ArrowLeft } from "lucide-react";
  import { type ReactNode } from "react";

  type AuthShellProps = {
    children: ReactNode;
    eyebrow?: string;
    title?: string;
    subtitle?: string;
  };

  export function AuthShell({
    children,
    eyebrow = "TẠP CHÍ TRUYỆN CHỮ VIỆT",
    title = "Đọc chậm. Đọc kỹ. Đọc lại.",
    subtitle = "Một thư viện truyện chữ Việt biên tập như một tạp chí — không quảng cáo, không pop-up.",
  }: AuthShellProps) {
    return (
      <div className="min-h-screen w-full bg-bg text-fg lg:grid lg:grid-cols-2">
        {/* LEFT — hero pane (lg+) */}
        <aside
          className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12"
          style={{
            background:
              "linear-gradient(135deg, #0A0A0A 0%, rgba(236,72,153,0.12) 100%)",
          }}
        >
          {/* Top-right pink glow orb */}
          <div
            aria-hidden
            className="pointer-events-none absolute right-[-120px] top-[-120px] h-[420px] w-[420px] rounded-full"
            style={{
              background:
                "radial-gradient(circle at center, rgba(236,72,153,0.25) 0%, rgba(236,72,153,0) 70%)",
            }}
          />

          <div className="relative z-10">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-white/90 transition-opacity duration-fast hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            >
              <span className="font-sans text-2xl font-semibold tracking-tight">
                SManga
              </span>
            </Link>
          </div>

          <div className="relative z-10 space-y-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
              {eyebrow}
            </p>
            <blockquote className="font-sans text-display-md leading-tight text-white">
              {title}
            </blockquote>
            <p className="text-body italic text-white/60">{subtitle}</p>
          </div>

          <div className="relative z-10 flex items-center gap-3 text-white/40">
            <span className="h-px w-10 bg-white/20" />
            <span className="text-[11px] uppercase tracking-[0.18em]">
              SManga · 2026
            </span>
          </div>
        </aside>

        {/* RIGHT — form pane */}
        <main className="flex min-h-screen flex-col bg-bg">
          {/* Mobile header (lg- only) */}
          <header className="flex items-center justify-between border-b border-border px-6 py-5 lg:hidden">
            <Link
              to="/"
              className="font-sans text-xl font-semibold tracking-tight text-fg transition-opacity duration-fast hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              SManga
            </Link>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-fg-muted">
              {eyebrow}
            </p>
          </header>

          <div className="flex flex-1 items-center justify-center px-6 py-10 lg:px-12">
            <div className="w-full max-w-sm">{children}</div>
          </div>

          <footer className="border-t border-border px-6 py-5 lg:hidden">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-body-sm text-fg-muted transition-colors duration-fast hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ArrowLeft className="h-4 w-4" />
              Quay lại trang chủ
            </Link>
          </footer>
        </main>
      </div>
    );
  }
  ```

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes
  Run: `pnpm dev:frontend` (in another terminal)
  Open http://localhost:3000/dang-nhap → expect: LEFT pane is near-black with a soft pink glow in top-right; "TẠP CHÍ TRUYỆN CHỮ VIỆT" eyebrow in dim white; "Đọc chậm. Đọc kỹ. Đọc lại." in large Inter (NOT Newsreader); italic tagline in muted white. RIGHT pane has pure `bg` background.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/frontend/src/components/auth/AuthShell.tsx
  git commit -m "feat(auth): retoken AuthShell — dark gradient hero + pink glow orb"
  ```

---

### Task 2: Retoken `/dang-nhap` (login route)

**Files:**
- Modify: `apps/frontend/src/routes/dang-nhap.tsx`

**Why this task:** Login form inputs/buttons still use stale `bg-background`/`text-muted-foreground`/`hsl(var(--color-cta))` aliases. Spec B requires h-11 `bg-elevated` inputs, pink-gradient CTA with glow, optional Google button above with "HOẶC" divider.

- [ ] **Step 1: Read context**
  Read the audit entry for `dang-nhap.tsx` above and the relevant spec lines 25-30.

- [ ] **Step 2: Replace form body**

  Locate the existing form JSX in `dang-nhap.tsx` and replace the entire returned tree (inside `<AuthShell>`) with the structure below. **Keep all existing hooks and identifiers unchanged**:
  - state: `email`, `password`, `showPwd`, `error`, `busy`
  - handler: `submit` (NOT `handleSubmit`)
  - Google CTA: reuse the existing `<GoogleButton redirect={redirect} label="Tiếp tục với Google" />` import. Do NOT inline a GoogleGlyph helper, do NOT add a `providers.google` gate.
  - Derive `const canSubmit = email.length > 0 && password.length > 0 && !busy;` near the top of the component body (it does not exist yet in this file).

  Step 0: Open `apps/frontend/src/routes/dang-nhap.tsx` and confirm the above names. If they differ, substitute in the snippet rather than renaming the file's state.

  ```tsx
  // dang-nhap.tsx — form markup inside <AuthShell>
  // Imports already include: useState, useNavigate, useRouter, Link, Eye, EyeOff, Loader2,
  // apiLogin, useAuthStore, AuthShell, GoogleButton. No new imports needed for retoken.

  // ... existing hook logic above (email/password/showPwd/error/busy/submit) ...
  // Add this near the bottom of the hook block:
  const canSubmit = email.length > 0 && password.length > 0 && !busy;

  return (
    <AuthShell>
      <div className="space-y-8">
        <header className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-fg-muted">
            CHÀO MỪNG TRỞ LẠI
          </p>
          <h1 className="font-sans text-heading-lg text-fg">Đăng nhập</h1>
          <p className="text-body-sm text-fg-muted">
            Tiếp tục đọc nơi bạn đã dừng lại.
          </p>
        </header>

        <GoogleButton redirect={redirect} label="Tiếp tục với Google" />

        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          <span className="h-px flex-1 bg-border" />
          HOẶC
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="block text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block h-11 w-full rounded-md border border-border bg-bg-elevated px-3.5 text-body text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:shadow-glow-pink-soft"
              placeholder="ban@example.com"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted"
            >
              Mật khẩu
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPwd ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block h-11 w-full rounded-md border border-border bg-bg-elevated px-3.5 pr-11 text-body text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:shadow-glow-pink-soft"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={showPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error ? (
            <p className="text-body-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent-gradient px-4 text-[14px] font-bold text-white shadow-glow-pink-soft transition-opacity duration-fast hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>

        <p className="border-t border-border pt-6 text-center text-body-sm text-fg-muted">
          Chưa có tài khoản?{" "}
          <Link
            to="/dang-ky"
            search={{ redirect }}
            className="font-medium text-accent transition-opacity duration-fast hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Tạo tài khoản mới
          </Link>
        </p>
      </div>
    </AuthShell>
  );
  ```

  > **Google button:** the existing `<GoogleButton>` component handles its own provider-discovery via `getAuthProviders()` and self-hides when Google is not configured. Do NOT inline a Google button or a GoogleGlyph helper. Do NOT delete `apps/frontend/src/components/auth/GoogleButton.tsx`.

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes
  Open http://localhost:3000/dang-nhap → expect: form sits on pure `bg`, inputs are `bg-elevated` with `border`, focus produces a pink glow ring, primary CTA is gradient pink → fuchsia with shadow glow, "Tạo tài khoản mới" link at the bottom is `text-accent`.
  Submit a wrong password → expect: error in `text-destructive`.
  Submit a correct credential → expect: redirect still works to `?redirect` or `/tu-sach`.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/frontend/src/routes/dang-nhap.tsx
  git commit -m "feat(auth): retoken /dang-nhap — pink gradient CTA + bg-elevated inputs"
  ```

---

### Task 3: Retoken `/dang-ky` (register route)

**Files:**
- Modify: `apps/frontend/src/routes/dang-ky.tsx`

**Why this task:** Same patterns as `/dang-nhap` but with name field, password-length hint, and "Tạo tài khoản" CTA. Keep mutation logic intact; replace markup only.

- [ ] **Step 1: Read context**
  Read the audit entry for `dang-ky.tsx` above. Note password hint at lines 134-140 already uses `text-destructive` correctly — just swap the alternative `text-muted-foreground` to `text-fg-muted`.

- [ ] **Step 2: Replace form body**

  Mirror Task 2's structure. Header eyebrow becomes "TÀI KHOẢN MỚI", H1 becomes "Tạo tài khoản". Add an optional name field (top), keep email + password order, keep the live "Mật khẩu phải có ít nhất 8 ký tự" hint, change CTA label to "Tạo tài khoản", change footer link to point at `/dang-nhap`.

  **Keep existing identifiers** (verified in `dang-ky.tsx`):
  - state: `name`, `email`, `password`, `showPwd`, `error`, `busy`
  - handler: `submit` (NOT `handleSubmit`)
  - already-derived: `canSubmit`, `pwdTooShort` — reuse rather than re-deriving.
  - Google CTA: reuse existing `<GoogleButton redirect={redirect} label="Đăng ký với Google" />`. No inline Google button, no GoogleGlyph helper, no `providers.google` gate.

  Step 0: Open `apps/frontend/src/routes/dang-ky.tsx` and confirm the above names.

  ```tsx
  // dang-ky.tsx — form markup inside <AuthShell>
  // Imports already include Eye, EyeOff, Loader2, GoogleButton, AuthShell — no new ones needed.

  // ... existing hook logic above (name/email/password/showPwd/error/busy/submit/canSubmit/pwdTooShort) ...

  return (
    <AuthShell>
      <div className="space-y-8">
        <header className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-fg-muted">
            TÀI KHOẢN MỚI
          </p>
          <h1 className="font-sans text-heading-lg text-fg">Tạo tài khoản</h1>
          <p className="text-body-sm text-fg-muted">
            Lưu truyện yêu thích, theo dõi tiến độ đọc, đồng bộ giữa các thiết bị.
          </p>
        </header>

        <GoogleButton redirect={redirect} label="Đăng ký với Google" />

        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          <span className="h-px flex-1 bg-border" />
          HOẶC
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="name"
              className="block text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted"
            >
              Tên hiển thị <span className="normal-case tracking-normal text-fg-subtle">(tuỳ chọn)</span>
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block h-11 w-full rounded-md border border-border bg-bg-elevated px-3.5 text-body text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:shadow-glow-pink-soft"
              placeholder="Bạn đọc"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="email"
              className="block text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block h-11 w-full rounded-md border border-border bg-bg-elevated px-3.5 text-body text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:shadow-glow-pink-soft"
              placeholder="ban@example.com"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted"
            >
              Mật khẩu
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPwd ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block h-11 w-full rounded-md border border-border bg-bg-elevated px-3.5 pr-11 text-body text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:shadow-glow-pink-soft"
                placeholder="Tối thiểu 8 ký tự"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={showPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p
              className={
                password.length === 0
                  ? "text-body-sm text-fg-muted"
                  : password.length >= 8
                    ? "text-body-sm text-positive"
                    : "text-body-sm text-destructive"
              }
            >
              {password.length === 0
                ? "Mật khẩu phải có ít nhất 8 ký tự."
                : password.length >= 8
                  ? "✓ Mật khẩu đủ dài."
                  : `Cần thêm ${8 - password.length} ký tự nữa.`}
            </p>
          </div>

          {error ? (
            <p className="text-body-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent-gradient px-4 text-[14px] font-bold text-white shadow-glow-pink-soft transition-opacity duration-fast hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
          </button>
        </form>

        <p className="border-t border-border pt-6 text-center text-body-sm text-fg-muted">
          Đã có tài khoản?{" "}
          <Link
            to="/dang-nhap"
            search={{ redirect }}
            className="font-medium text-accent transition-opacity duration-fast hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Đăng nhập
          </Link>
        </p>
      </div>
    </AuthShell>
  );
  ```

  > **No GoogleGlyph helper:** reuse the existing `<GoogleButton>` component — same as Task 2. No code duplication across `dang-nhap.tsx` and `dang-ky.tsx`.

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes
  Open http://localhost:3000/dang-ky → expect: same visual treatment as `/dang-nhap` (dark hero + pink CTA + bg-elevated inputs); password hint flips from muted → destructive → positive as you type.
  Submit a new account with `<8` chars → expect: hint shows "Cần thêm N ký tự nữa." in `text-destructive`.
  Submit a valid new account → expect: redirect via auto-login (existing apiLogin behavior).

- [ ] **Step 4: Commit**
  ```bash
  git add apps/frontend/src/routes/dang-ky.tsx
  git commit -m "feat(auth): retoken /dang-ky — same pink gradient + bg-elevated treatment"
  ```

---

## Phase B2 — Account + Reader Settings upgrade

5 tasks. Account page is the largest single surface (419 lines). Reader Settings gets the segmented-control + live-preview UX upgrade.

---

### Task 4: Retoken `/tai-khoan` — page header + 3 cards

**Files:**
- Modify: `apps/frontend/src/routes/tai-khoan.tsx`

**Why this task:** Account page has 3 cards (Avatar / Profile / Password) that all use stale `bg-background`/`text-muted-foreground`/`bg-foreground text-background` aliases plus raw emerald-500/600 success colors. Spec B requires `bg-elevated` cards, `text-positive` flashes, and an explicit slot for Plan C's `ReadingStatsCard` at the top.

- [ ] **Step 1: Read context**
  Read the audit entry for `tai-khoan.tsx` above and Spec B section "2. Account — `/tai-khoan`" (lines 33-46).

  **Step 1b: Identifier map.** Open `apps/frontend/src/routes/tai-khoan.tsx` and list the real names for each card. Likely candidates the audit referenced (verify and substitute in the snippets below):
  - Avatar card: `avatarUrl` / `fallbackInitial` (or `preview`/`initial`) — file-input handler (`handleFileChange` or `onFile`), remove handler (`handleRemove` or `onRemove`).
  - Profile card: form `isDirty` flag, mutation (`profileMutation` or `saveProfileM`), success flash (`showSaved` or `saved`/`flash`).
  - Password card: `newPassword` state used for the "Đủ điều kiện" chip; the file already has a `PwdField` helper. Reuse its existing prop signature.

  Substitute the real names into the snippets below before pasting. The snippets show new classNames + new structural shape (header + page wrapper + Plan C slot); they do NOT redesign the data layer.

- [ ] **Step 2: Replace page wrapper + local Card primitive**

  Open `apps/frontend/src/routes/tai-khoan.tsx`. Find the local `Card` component (around line 41-51 per audit) and replace it with the version below. Then find the page-level `<main>`/`<div>` wrapping the content and prepend the page header + Plan C slot.

  ```tsx
  // tai-khoan.tsx — local Card primitive (replace existing definition)
  function Card({
    title,
    description,
    children,
  }: {
    title: string;
    description?: string;
    children: React.ReactNode;
  }) {
    return (
      <section className="rounded-lg border border-border bg-bg-elevated p-5 sm:p-6">
        <header className="space-y-1 border-b border-border/60 pb-4">
          <h2 className="font-sans text-heading-md text-fg">{title}</h2>
          {description ? (
            <p className="text-body-sm text-fg-muted">{description}</p>
          ) : null}
        </header>
        <div className="pt-5">{children}</div>
      </section>
    );
  }
  ```

  Then locate the page's top-level return (the `<main className="...">` or similar). Concretely:

  **Before** (sketch — the existing file currently has 3 `<Card>` invocations as direct children of `<main>` or a similar wrapper):

  ```tsx
  return (
    <main className="mx-auto ...">
      <Card title="Ảnh đại diện">…</Card>
      <Card title="Hồ sơ">…</Card>
      <Card title="Mật khẩu">…</Card>
    </main>
  );
  ```

  **After** — replace the opening `<main>`, prepend the page header + Plan C slot, and **wrap the existing 3 `<Card>` invocations in a single `<div className="space-y-6">`**:

  ```tsx
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8 space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-fg-muted">
          TÀI KHOẢN
        </p>
        <h1 className="font-sans text-display-md text-fg">Hồ sơ của bạn</h1>
        <p className="text-body-sm text-fg-muted">
          Quản lý ảnh đại diện, tên hiển thị và mật khẩu.
        </p>
      </header>

      {/* Plan C inserts <ReadingStatsCard /> here, REPLACING this comment block. */}
      {/* <ReadingStatsCard /> — added in Plan C (Spec C differentiators) */}

      <div className="space-y-6">
        {/* Move the existing 3 <Card> invocations INTO this div, in order:
            Avatar → Profile → Password. Do not duplicate them; relocate. */}
        <Card title="Ảnh đại diện">…</Card>
        <Card title="Hồ sơ">…</Card>
        <Card title="Mật khẩu">…</Card>
      </div>
    </main>
  );
  ```

  > **Plan C coupling:** Plan C Task 8 (ReadingStatsCard) is written to REPLACE the comment placeholder above with the real `<ReadingStatsCard />`. Plan C depends on Plan B Task 4 having shipped first. Do not delete the comment — Plan C looks for it.

- [ ] **Step 3: Retoken Avatar card body**

  Find the AvatarCard block. Replace the avatar preview + upload/remove button block with:

  ```tsx
  <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
    <div className="relative h-20 w-20 overflow-hidden rounded-full border border-border bg-bg-subtle">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-heading-md text-fg-muted">
          {fallbackInitial}
        </span>
      )}
    </div>

    <div className="flex flex-col gap-3 sm:flex-row">
      <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-bg-elevated px-4 text-body-sm font-medium text-fg transition-colors duration-fast hover:bg-bg-subtle focus-within:ring-2 focus-within:ring-accent">
        <Camera className="h-4 w-4" />
        Tải ảnh lên
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFileChange}
        />
      </label>

      {avatarUrl ? (
        <button
          type="button"
          onClick={handleRemove}
          className="inline-flex h-10 items-center gap-2 rounded-md px-4 text-body-sm font-medium text-fg-muted transition-colors duration-fast hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Xoá ảnh
        </button>
      ) : null}
    </div>
  </div>
  ```

  Add `Camera, Trash2` to the lucide-react import.

- [ ] **Step 4: Retoken Profile card body**

  Find the ProfileCard block. The form fields use stale tokens. Replace each `<input>` className and the "Lưu thay đổi" button:

  ```tsx
  // each input
  <input
    /* ...existing props... */
    className="block h-11 w-full rounded-md border border-border bg-bg-elevated px-3.5 text-body text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:shadow-glow-pink-soft disabled:bg-bg-subtle disabled:text-fg-muted"
  />

  // submit button
  <button
    type="submit"
    disabled={!isDirty || profileMutation.isPending}
    className="inline-flex h-10 items-center justify-center rounded-md bg-fg px-5 text-body-sm font-semibold text-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
  >
    {profileMutation.isPending ? "Đang lưu…" : "Lưu thay đổi"}
  </button>

  // success flash
  {showSaved ? (
    <p className="inline-flex items-center gap-1.5 text-body-sm text-positive">
      <Check className="h-4 w-4" />
      Đã lưu
    </p>
  ) : null}
  ```

  Add `Check` to the lucide import.

- [ ] **Step 5: Retoken Password card + PwdField helper**

  Find `PwdField` (around lines 357-418 per audit). Replace its className strings:

  ```tsx
  function PwdField({
    id,
    label,
    value,
    onChange,
    autoComplete,
  }: PwdFieldProps) {
    const [show, setShow] = useState(false);
    return (
      <div className="space-y-2">
        <label
          htmlFor={id}
          className="block text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted"
        >
          {label}
        </label>
        <div className="relative">
          <input
            id={id}
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete={autoComplete}
            className="block h-11 w-full rounded-md border border-border bg-bg-elevated px-3.5 pr-11 text-body text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:shadow-glow-pink-soft"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
    );
  }
  ```

  Replace the PasswordCard submit button with the same `bg-fg text-bg` pattern from Step 4. Replace the optional "criteria met" hint chip:

  ```tsx
  {newPassword.length >= 8 ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
      <Check className="h-3 w-3" />
      Đủ điều kiện
    </span>
  ) : null}
  ```

  Replace the password change success flash (line 347) with the same positive flash from Step 4. Replace "Mật khẩu hiện tại không đúng." error keeping `text-destructive`.

- [ ] **Step 6: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes
  Open http://localhost:3000/tai-khoan (logged-in, LIGHT theme — Plan A default) → expect: TÀI KHOẢN eyebrow + display-md "Hồ sơ của bạn" header; 3 cards on `bg-elevated` with `border-border` and `rounded-lg`; avatar circle has `border-border` ring; "Tải ảnh lên" outlined; "Xoá ảnh" turns destructive on hover; "Lưu thay đổi" is `bg-fg text-bg` (dark slab with light text in LIGHT theme, light slab with dark text in DARK theme); "Đã lưu" flash is `text-positive` with Check icon; the Plan C placeholder comment `{/* <ReadingStatsCard /> — added in Plan C (Spec C differentiators) */}` is present in source above the 3 cards.
  Toggle to DARK theme via the Cài đặt drawer (reader) → re-open `/tai-khoan` → expect: the "Lưu thay đổi" button INVERTS correctly (light bg + dark text) and remains readable. If the button appears invisible or low-contrast in either theme, the `bg-bg` / `text-bg` tokens are not resolving — fix the tailwind config before continuing.
  Upload a 1MB jpg → expect: still produces a 256×256 webp (no logic change).
  Submit wrong current password → expect: "Mật khẩu hiện tại không đúng." in `text-destructive`.

- [ ] **Step 7: Commit**
  ```bash
  git add apps/frontend/src/routes/tai-khoan.tsx
  git commit -m "feat(account): retoken /tai-khoan cards + reserve Plan C stats slot"
  ```

---

### Task 5: Upgrade `ReaderSettings.tsx` RadioGroups → SegmentedControl

**Files:**
- Modify: `apps/frontend/src/components/reader/ReaderSettings.tsx`

**Why this task:** Spec B explicitly upgrades the 3 RadioGroups (Giao diện / Cỡ chữ / Phông chữ) to segmented controls with a sliding active background. Browser-compat note from spec: use CSS transform via React layout effect measuring offset, NOT View Transitions API.

- [ ] **Step 1: Read context**
  Read the audit entry for `ReaderSettings.tsx` above and Spec B section "3. Reader Settings drawer" (lines 48-61).

  **Store contract (read first):** `apps/frontend/src/stores/reader-prefs-store.ts` defines `ReaderFontSize = '15' | '18' | '20' | '24'` (STRINGS), `ReaderTheme = 'light' | 'dark' | 'system'`, `ReaderFontFamily = 'sans' | 'serif' | 'mono'`. The store does NOT export a `reset` action. We use the existing string union (do NOT migrate to numbers — that would silently re-map every persisted user pref and require a v4 migration which is out of scope).

  **Animation technique — explicit deviation from Spec B:** Spec B lists "View Transitions API with CSS transform fallback". Per the spec's own risk-mitigation paragraph (Firefox compat, complexity), we implement **CSS-only**: a `useLayoutEffect` measures the active button rect and animates a positioned pill with `transition-[left,width] duration-200 ease-out`. We do NOT call `document.startViewTransition()`. Document this in code comments so future readers don't add it back.

- [ ] **Step 2: Replace `RadioGroup` with `SegmentedControl`**

  Replace the entire contents of `ReaderSettings.tsx` with:

  ```tsx
  // apps/frontend/src/components/reader/ReaderSettings.tsx
  import { useEffect, useLayoutEffect, useRef, useState } from "react";
  import { RotateCcw } from "lucide-react";
  import {
    useReaderPrefs,
    type ReaderTheme,
    type ReaderFontSize,
    type ReaderFontFamily,
  } from "@/stores/reader-prefs-store";

  // Animation: per Spec B risk-mitigation, we use CSS-only sliding pill
  // (NOT View Transitions API) for Firefox compat + simplicity. See plan Task 5.

  const THEMES = [
    { value: "light", label: "Sáng" },
    { value: "dark", label: "Tối" },
    { value: "system", label: "Hệ thống" },
  ] as const satisfies readonly { value: ReaderTheme; label: string }[];

  const FONT_SIZES = [
    { value: "15", label: "Nhỏ" },
    { value: "18", label: "Vừa" },
    { value: "20", label: "To" },
    { value: "24", label: "Rất to" },
  ] as const satisfies readonly { value: ReaderFontSize; label: string }[];

  const FONT_FAMILIES = [
    { value: "serif", label: "Serif" },
    { value: "sans", label: "Sans" },
    { value: "mono", label: "Mono" },
  ] as const satisfies readonly { value: ReaderFontFamily; label: string }[];

  const DEFAULT_THEME: ReaderTheme = "light";
  const DEFAULT_SIZE: ReaderFontSize = "18";
  const DEFAULT_FAMILY: ReaderFontFamily = "serif";

  export function ReaderSettings() {
    const { theme, fontSize, fontFamily, setTheme, setFontSize, setFontFamily } =
      useReaderPrefs();

    // Local reset helper — the store does NOT export a `reset` action.
    // Could be promoted to the store later if needed elsewhere (out of scope here).
    function resetDefaults() {
      setTheme(DEFAULT_THEME);
      setFontSize(DEFAULT_SIZE);
      setFontFamily(DEFAULT_FAMILY);
    }

    const isDefault =
      theme === DEFAULT_THEME && fontSize === DEFAULT_SIZE && fontFamily === DEFAULT_FAMILY;

    return (
      <div className="space-y-7">
        <Field label="Giao diện">
          <SegmentedControl
            value={theme}
            options={THEMES}
            onChange={(v) => setTheme(v)}
          />
        </Field>

        <Field label="Cỡ chữ">
          <SegmentedControl
            value={fontSize}
            options={FONT_SIZES}
            onChange={(v) => setFontSize(v)}
          />
        </Field>

        <Field label="Phông chữ">
          <SegmentedControl
            value={fontFamily}
            options={FONT_FAMILIES}
            onChange={(v) => setFontFamily(v)}
          />
        </Field>

        {/* Live preview — Task 6 inserts <LivePreview /> here */}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={resetDefaults}
            disabled={isDefault}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-body-sm text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Khôi phục mặc định
          </button>
        </div>
      </div>
    );
  }

  function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted">
          {label}
        </p>
        {children}
      </div>
    );
  }

  type SegmentOption<V extends string> = { value: V; label: string };

  function SegmentedControl<V extends string>({
    value,
    options,
    onChange,
  }: {
    value: V;
    options: readonly SegmentOption<V>[];
    onChange: (v: V) => void;
  }) {
    const trackRef = useRef<HTMLDivElement>(null);
    const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
    const [pillStyle, setPillStyle] = useState<{ left: number; width: number } | null>(null);

    useLayoutEffect(() => {
      const activeIdx = options.findIndex((o) => o.value === value);
      const btn = buttonsRef.current[activeIdx];
      const track = trackRef.current;
      if (!btn || !track) return;
      const trackRect = track.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      setPillStyle({
        left: btnRect.left - trackRect.left,
        width: btnRect.width,
      });
    }, [value, options]);

    // Re-measure on resize (drawer width changes between sm/md)
    useEffect(() => {
      const handler = () => {
        const activeIdx = options.findIndex((o) => o.value === value);
        const btn = buttonsRef.current[activeIdx];
        const track = trackRef.current;
        if (!btn || !track) return;
        const trackRect = track.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        setPillStyle({
          left: btnRect.left - trackRect.left,
          width: btnRect.width,
        });
      };
      window.addEventListener("resize", handler);
      return () => window.removeEventListener("resize", handler);
    }, [value, options]);

    return (
      <div
        ref={trackRef}
        role="radiogroup"
        className="relative inline-flex w-full items-center gap-0 rounded-full bg-bg-subtle p-1"
      >
        {pillStyle ? (
          <div
            aria-hidden
            // Active pill — per Spec B, use bg-fg/text-bg high-contrast in light theme,
            // bg-bg-elevated in dark. Border + shadow add definition either way.
            className="pointer-events-none absolute top-1 bottom-1 rounded-full border border-border bg-bg-elevated shadow-sm transition-[left,width] duration-200 ease-out dark:border-transparent"
            style={{ left: pillStyle.left, width: pillStyle.width }}
          />
        ) : null}

        {options.map((opt, i) => {
          const active = opt.value === value;
          return (
            <button
              key={String(opt.value)}
              ref={(el) => {
                buttonsRef.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={`relative z-10 flex-1 rounded-full px-3 py-1.5 text-body-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                active ? "text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }
  ```

  > **Verify in both themes:** Spec B line 54 calls for `bg-fg text-bg` in light + `bg-bg-elevated` in dark. The snippet above ships `bg-bg-elevated border-border shadow-sm` for both themes (border + shadow give definition against `bg-bg-subtle` track in light theme). If during Step 3 visual verify the active pill is invisible in light theme, switch to the spec-literal pattern: `bg-fg text-bg dark:bg-bg-elevated dark:text-fg` on the pill div AND drop the conditional text-color on the buttons.

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes
  Open http://localhost:3000/truyen/<some-slug>/chuong-1 → click avatar → Cài đặt → expect: drawer opens with 3 segmented tracks (rounded-full pill on `bg-subtle`), the active option has a white `bg-bg-elevated` pill behind it that slides between options with a 200ms ease-out animation when clicked.
  Resize window across the sm breakpoint → expect: pill repositions correctly.
  Click "Khôi phục mặc định" while non-default → expect: state resets and pill animates back to default position.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/frontend/src/components/reader/ReaderSettings.tsx
  git commit -m "feat(reader): SegmentedControl with sliding pill replaces RadioGroups"
  ```

---

### Task 6: Add live preview to `ReaderSettings.tsx`

**Files:**
- Modify: `apps/frontend/src/components/reader/ReaderSettings.tsx`

**Why this task:** Spec B requires a "Bản xem trước" section below the 3 segmented controls showing 3 lines of fake Vietnamese chapter text rendered with current font-size + font-family choices so users see what the result will look like before closing the drawer.

- [ ] **Step 1: Read context**
  Re-read Spec B section "3. Reader Settings drawer" lines 58-60.

- [ ] **Step 2: Add `LivePreview` component + insert into render tree**

  In `ReaderSettings.tsx`, add the component below the existing `SegmentedControl` definition and insert it in the return tree where the comment `{/* Live preview — Task 6 inserts <LivePreview /> here */}` is.

  Note: `fontSize` is a STRING ('15' | '18' | '20' | '24') per Task 5. The template literal `` `${fontSize}px` `` works for both strings and numbers, so the snippet below is correct given Task 5's string union.

  ```tsx
  function LivePreview() {
    const { fontSize, fontFamily } = useReaderPrefs();
    const fontClass =
      fontFamily === "serif" ? "font-prose" : fontFamily === "sans" ? "font-sans" : "font-mono";

    return (
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted">
          Bản xem trước
        </p>
        <div className="rounded-lg border border-border bg-bg p-4">
          <p
            className={`${fontClass} leading-relaxed text-fg`}
            style={{ fontSize: `${fontSize}px` }}
          >
            Nàng đặt cuốn sách xuống, nhìn ra ngoài cửa sổ.
            <br />
            Phố Hà Nội mùa thu, lá vàng rơi trên những con đường cũ.
            <br />
            Câu chuyện trong sách dường như vẫn đang tiếp diễn.
          </p>
        </div>
      </div>
    );
  }
  ```

  And in the main `ReaderSettings` return, replace the placeholder comment with:

  ```tsx
  <LivePreview />
  ```

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes
  Open http://localhost:3000/truyen/<slug>/chuong-1 → open Cài đặt drawer → expect: "Bản xem trước" section sits below the 3 segmented controls with a fixed 3-line Vietnamese sample.
  Click Cỡ chữ → To (value '20') → expect: preview font-size jumps to 20px instantly. Click Rất to (value '24') → 24px.
  Click Phông chữ → Sans → expect: preview re-renders in Inter.
  Click Mono → expect: preview re-renders in monospace.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/frontend/src/components/reader/ReaderSettings.tsx
  git commit -m "feat(reader): live preview in settings drawer (Bản xem trước)"
  ```

---

### Task 7: Retoken `ReaderSettingsDrawer.tsx` chrome

**Files:**
- Modify: `apps/frontend/src/components/reader/ReaderSettingsDrawer.tsx`

**Why this task:** Per audit, this file is "ALREADY MIGRATED" — uses `bg-fg/40`, `bg-bg-elevated`, `border-border`, `shadow-elev`, `font-sans`, `text-heading-md`. Spec B specifies header height h-14 and the heading label "Cài đặt đọc" with `text-heading-lg`. Do a quick conformance pass.

- [ ] **Step 1: Read context**
  Read the current ReaderSettingsDrawer.tsx in full (only 56 lines).

- [ ] **Step 2: Verify and adjust header**

  Confirm the header uses `h-14 sm:h-16` (matches admin top bar at md+) and the title uses `text-heading-lg`. Per Spec B line 61 the spec wording says "h-14" but the existing code uses `h-14 sm:h-16` for visual alignment with the rest of the app — **preserve the responsive bump**. If the audit's "already migrated" note is correct, only the heading-size token may need bumping from `text-heading-md` to `text-heading-lg`.

  This file is small (~56 lines). Read it once, then change only the header block (and X import if missing). Leave the rest of the file (`<aside>` chrome, slide-in transitions, backdrop, body content slot, footer if any) untouched.

  ```tsx
  {/* drawer header (inside the <aside> after slide-in container) */}
  <header className="flex h-14 items-center justify-between border-b border-border px-5 sm:h-16">
    <h2 className="font-sans text-heading-lg text-fg">Cài đặt đọc</h2>
    <button
      type="button"
      onClick={() => setSettingsOpen(false)}
      aria-label="Đóng cài đặt"
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <X className="h-4 w-4" />
    </button>
  </header>
  ```

  If `X` from lucide-react isn't imported, add it. Ensure the panel itself uses `bg-bg-elevated border-l border-border shadow-elev` (the audit said this is already in place — do not duplicate).

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes
  Open the drawer → expect: header is h-14, title "Cài đặt đọc" in Inter heading-lg, X button bg-subtle on hover, panel bg-elevated with left border + shadow-elev.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/frontend/src/components/reader/ReaderSettingsDrawer.tsx
  git commit -m "fix(reader): drawer header h-14 + heading-lg conformance"
  ```

---

### Task 8: Fix `--color-cta` carry-ins (BookmarkToggle, StoryCard)

**Files:**
- Modify: `apps/frontend/src/components/reader/BookmarkToggle.tsx`
- Modify: `apps/frontend/src/components/reader/StoryCard.tsx`

**Why this task:** Plan A reviewer explicitly flagged `bg-[hsl(var(--color-cta))]` references as Plan B carry-in. Both files still reference `--color-cta` instead of the new `accent` token.

- [ ] **Step 1: Read context**
  Read the audit entries for `BookmarkToggle.tsx` and `StoryCard.tsx` above.

- [ ] **Step 2: Patch `BookmarkToggle.tsx`**

  Open the file. Replace the active-state and inactive-state className strings:

  ```tsx
  const activeClass =
    "inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-body-sm font-medium text-white shadow-glow-pink-soft transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

  const inactiveClass =
    "inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-4 py-1.5 text-body-sm font-medium text-fg transition-colors duration-fast hover:border-border-strong hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg";
  ```

- [ ] **Step 3: Patch `StoryCard.tsx`**

  Open the file. Replace the STATUS_TONE map and the cover wrapper:

  ```tsx
  const STATUS_TONE: Record<string, string> = {
    completed: "bg-fg text-bg",
    ongoing: "bg-accent text-white",
    dropped: "bg-bg-subtle text-fg-muted",
    unknown: "bg-bg-subtle text-fg-muted",
  };
  ```

  Replace cover wrapper className:

  ```tsx
  <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-bg-subtle shadow-elev transition-shadow duration-fast group-hover:shadow-glow-pink-soft">
  ```

  Replace title + meta lines:

  ```tsx
  <h3 className="font-prose text-body font-semibold text-fg transition-colors duration-fast group-hover:text-accent">
    {title}
  </h3>
  <p className="text-body-sm text-fg-muted">{author}</p>
  <p className="text-body-sm text-fg-subtle">{chapterCount} chương</p>
  ```

  Replace any other `text-muted-foreground` / `font-heading` / `bg-muted` occurrences in the file with the corresponding new tokens (`text-fg-muted`, `font-prose`, `bg-bg-subtle`).

- [ ] **Step 4: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes
  Open http://localhost:3000/tu-sach → expect: BookmarkToggle active state is pink (`bg-accent`) with glow, inactive is bordered ghost.
  Open http://localhost:3000/ → expect: StoryCard status badges use the new tones; "ongoing" is pink, "completed" is high-contrast fg/bg.

- [ ] **Step 5: Commit**
  ```bash
  git add apps/frontend/src/components/reader/BookmarkToggle.tsx apps/frontend/src/components/reader/StoryCard.tsx
  git commit -m "fix(reader): replace --color-cta with accent token in bookmark + card"
  ```

---

## Phase B3 — Admin retoken

6 tasks covering sidebar, top bar, tables, dashboard stats, action bars, delete modal.

---

### Task 9: Sidebar — gradient pink active state (signature touch)

**Files:**
- Modify: `apps/frontend/src/routes/admin/route.tsx`

**Why this task:** Per Spec B, the signature visual moment of the admin retoken is the active sidebar item: `bg-gradient-to-r from-accent to-accent-strong text-white shadow-glow-pink-soft`. The audit confirms the current active state uses raw `bg-foreground text-background` (true black slab).

- [ ] **Step 1: Read context**
  Read the audit entry for `admin/route.tsx` above. Re-read Spec B section "4. Admin — `/admin/*` retoken" → Sidebar (lines 67-71).

  **Step 1b: Capture existing names.** Open `apps/frontend/src/routes/admin/route.tsx` and record:
  - The NAV array constant name (e.g., `NAV`, `NAV_ITEMS`) and the per-item shape: `to` or `href`? `label`, `icon`, `exact?` flag?
  - The active-state pattern. Per audit: the file uses `path.startsWith(n.href)` (or `to`) to compute `active` manually; it does NOT use TanStack Router's `activeProps`/`activeOptions`. Preserve the manual ternary — do not introduce `activeProps`.
  - The mobile-drawer state setter name (likely `mobileOpen`/`setMobileOpen` — confirm or capture the real names).
  - The user object name on the top bar (likely `user`/`me`/`currentUser`) and the logout handler (likely `handleLogout` or `logoutMutation.mutate`).

  Substitute the real names into the snippets below.

- [ ] **Step 2: Patch nav item classes**

  Open `apps/frontend/src/routes/admin/route.tsx`. Find the `<Link>` rendering inside the `SidebarNav` block. **Preserve the existing manual `active` ternary** — only swap the className strings. The shape is roughly:

  ```tsx
  // Conceptual — the existing file uses something like:
  // const active = n.exact ? path === n.href : path.startsWith(n.href);
  <Link
    key={n.href}
    to={n.href}
    className={
      active
        ? "group flex h-9 items-center gap-2.5 rounded-md bg-gradient-to-r from-accent to-accent-strong px-3 text-body-sm font-medium text-white shadow-glow-pink-soft transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        : "group flex h-9 items-center gap-2.5 rounded-md px-3 text-body-sm font-medium text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    }
  >
    <n.icon className="h-4 w-4" />
    {n.label}
  </Link>
  ```

  > The crux: inactive uses `text-fg-muted hover:bg-bg-subtle`, active uses gradient `from-accent to-accent-strong` + `shadow-glow-pink-soft` + `text-white`. Do NOT switch to TanStack Router's `activeProps`/`activeOptions` — the existing manual ternary stays.

  Find the sidebar root wrapper. **Preserve `sticky top-0 self-start`** (the desktop aside pins while the main column scrolls) — only swap the bg/border tokens:

  ```tsx
  <aside className="sticky top-0 hidden h-screen w-60 flex-col self-start border-r border-border bg-bg md:flex">
  ```

  Find the brand area at the top and ensure border:

  ```tsx
  <div className="flex h-16 items-center border-b border-border/60 px-5">
    <Link to="/admin" className="inline-flex items-center gap-2 font-sans text-lg font-semibold tracking-tight text-fg">
      SManga
      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-fg-muted">ADMIN</span>
    </Link>
  </div>
  ```

  Find the footer "Xem trang đọc" link and match the nav-item ghost shape:

  ```tsx
  <Link
    to="/"
    className="group flex h-9 items-center gap-2.5 rounded-md px-3 text-body-sm font-medium text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
  >
    <ExternalLink className="h-4 w-4" />
    Xem trang đọc
  </Link>
  ```

  **Mobile drawer nav items — paste the same active/inactive className pattern** in the second NAV render (inside the drawer `<aside className="fixed inset-y-0 ...">`):

  ```tsx
  {/* inside the mobile drawer */}
  {NAV.map((n) => {
    const active = n.exact ? path === n.href : path.startsWith(n.href);
    return (
      <Link
        key={n.href}
        to={n.href}
        onClick={() => setMobileOpen(false)}
        className={
          active
            ? "group flex h-9 items-center gap-2.5 rounded-md bg-gradient-to-r from-accent to-accent-strong px-3 text-body-sm font-medium text-white shadow-glow-pink-soft"
            : "group flex h-9 items-center gap-2.5 rounded-md px-3 text-body-sm font-medium text-fg-muted hover:bg-bg-subtle hover:text-fg"
        }
      >
        <n.icon className="h-4 w-4" />
        {n.label}
      </Link>
    );
  })}
  ```

  > **The mobile drawer aside** keeps its existing `fixed inset-y-0` positioning — no `sticky` change there.

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes
  Open http://localhost:3000/admin (logged in as admin) → expect: sidebar background `bg`; active nav item has pink gradient (from-accent to-accent-strong) with soft glow shadow + white text; inactive items are `text-fg-muted` and turn `bg-bg-subtle` on hover.
  Click Sources → expect: gradient slides to the Sources row.
  Resize to mobile, open hamburger → expect: same active-state treatment inside the drawer.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/frontend/src/routes/admin/route.tsx
  git commit -m "feat(admin): sidebar gradient pink active state with glow (signature)"
  ```

---

### Task 10: Top bar — sticky bg/95 backdrop-blur + outlined Đăng xuất

**Files:**
- Modify: `apps/frontend/src/routes/admin/route.tsx`

**Why this task:** Spec B requires the top bar to be sticky h-14 sm:h-16 with `bg/95% backdrop-blur-md` and `border-b border` so it carries the new tokens. Đăng xuất stays always visible per past feedback.

- [ ] **Step 1: Read context**
  Re-read the Top bar section in Spec B (lines 73-76) and the audit entry for `admin/route.tsx`.

  **Step 1b: Capture identifiers.** From Task 9 Step 1b you should already have: (a) the mobile-open setter name (`setMobileOpen` is the assumed name in the snippet below — substitute if different), (b) the user object name (`user?.email` is assumed — substitute, e.g. `me?.email`), (c) the logout handler name (`handleLogout` is assumed — substitute, e.g. `logoutMutation.mutate`). Verify these before pasting. If logout is a mutation, use `onClick={() => logoutMutation.mutate()}`.

- [ ] **Step 2: Patch top bar**

  In the same `admin/route.tsx`, find the `<header>` that wraps the email + logout. Replace with:

  ```tsx
  <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/95 px-4 backdrop-blur-md sm:h-16 sm:px-6">
    {/* Mobile hamburger (left) */}
    <button
      type="button"
      onClick={() => setMobileOpen(true)}
      aria-label="Mở menu"
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:hidden"
    >
      <Menu className="h-5 w-5" />
    </button>

    {/* Mobile label */}
    <p className="font-sans text-body-sm font-semibold text-fg md:hidden">SManga Admin</p>

    {/* Right cluster */}
    <div className="ml-auto flex items-center gap-3">
      <p className="hidden text-body-sm text-fg-muted md:block">{user?.email}</p>
      <button
        type="button"
        onClick={handleLogout}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong bg-bg px-3 text-body-sm font-medium text-fg transition-colors duration-fast hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <LogOut className="h-4 w-4" />
        Đăng xuất
      </button>
    </div>
  </header>
  ```

  Ensure `Menu`, `LogOut` are imported from lucide-react.

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes
  Open http://localhost:3000/admin → scroll any list page → expect: top bar stays sticky with translucent `bg/95` backdrop-blur; Đăng xuất button visible on both desktop and mobile.
  Toggle to light theme via reader settings → expect: backdrop transparency carries (no flicker).

- [ ] **Step 4: Commit**
  ```bash
  git add apps/frontend/src/routes/admin/route.tsx
  git commit -m "feat(admin): sticky top bar with backdrop-blur + outlined logout"
  ```

---

### Task 11: Admin tables — sticky header + hover + selected row + status badges

**Files:**
- Modify: `apps/frontend/src/components/admin/JobsTable.tsx`
- Modify: `apps/frontend/src/components/admin/DiscoverTable.tsx`
- Modify: `apps/frontend/src/components/admin/StubBadge.tsx`
- Modify: `apps/frontend/src/routes/admin/users.tsx`
- Modify: `apps/frontend/src/routes/admin/stories/index.tsx`
- Modify: `apps/frontend/src/routes/admin/sources/index.tsx`

**Why this task:** Per Spec B, all admin tables need consistent sticky headers with `bg/95 backdrop-blur`, body rows with `border-b border-border/60` + `hover:bg-bg-subtle/60`, selected rows with pink `border-l-2 border-accent`, and status badges using the new `positive`/`destructive`/`accent` tokens.

> **Sub-task breakdown (commit per group to keep diffs reviewable):**
> - **Task 11a** — Steps 2-4: `StubBadge.tsx`, `JobsTable.tsx`, `DiscoverTable.tsx` (shared admin table components). Commit message: `feat(admin): retoken JobsTable + DiscoverTable + StubBadge`.
> - **Task 11b** — Step 5: `users.tsx` table + role select + IconButton + pagination. Commit message: `feat(admin): retoken users table + role select + delete icon`.
> - **Task 11c** — Steps 6-7: `stories/index.tsx` (FilterChip, table, status), `sources/index.tsx` (StatusDot, table). Commit message: `feat(admin): retoken stories + sources tables`.
> Step 9 retains a single combined commit option only if the diffs end up small.

- [ ] **Step 1: Read context**
  Read audit entries for JobsTable, DiscoverTable, StubBadge, users, stories/index, sources/index above.

  **State-set coverage check:** Plan covers `completed | active | waiting | delayed | paused | failed` for JobsTable. The existing STATE_TONE on `JobsTable.tsx` is typed `Record<string, string>` (audit lines 8-15) so any state string the API emits gets a fallback at runtime. Spec B line 82 lists `"Hoàn thành" / "Thất bại" / "Mới"` as illustrative tones — the literal "Mới" badge does NOT appear in the audited surfaces (no Stories/Users "newly created" badge was flagged); treat "Mới" as illustrative-only. If you discover a real "Mới" badge during implementation, add it to the appropriate STATUS_TONE map with the `bg-accent/15 text-accent border-accent/30` tone.

- [ ] **Step 2: Update `StubBadge.tsx` tone map**

  ```tsx
  // apps/frontend/src/components/admin/StubBadge.tsx
  import { Clock, Loader2, CheckCircle2, XCircle } from "lucide-react";

  const TONE = {
    pending: {
      cls: "bg-bg-subtle text-fg-muted border-border",
      label: "Đang chờ",
      Icon: Clock,
    },
    running: {
      cls: "bg-accent/15 text-accent border-accent/30",
      label: "Đang quét",
      Icon: Loader2,
    },
    complete: {
      cls: "bg-positive/15 text-positive border-positive/30",
      label: "Hoàn thành",
      Icon: CheckCircle2,
    },
    failed: {
      cls: "bg-destructive/15 text-destructive border-destructive/30",
      label: "Thất bại",
      Icon: XCircle,
    },
  } as const;

  export function StubBadge({ status }: { status: keyof typeof TONE }) {
    const t = TONE[status];
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${t.cls}`}
      >
        <t.Icon className={`h-3 w-3 ${status === "running" ? "animate-spin" : ""}`} />
        {t.label}
      </span>
    );
  }
  ```

- [ ] **Step 3: Update `JobsTable.tsx`**

  Replace the STATE_TONE map and the table chrome:

  ```tsx
  const STATE_TONE: Record<string, string> = {
    completed: "bg-positive/15 text-positive border-positive/30",
    active: "bg-accent/15 text-accent border-accent/30",
    waiting: "bg-bg-subtle text-fg-muted border-border",
    delayed: "bg-bg-subtle text-fg-muted border-border",
    paused: "bg-bg-subtle text-fg-muted border-border",
    failed: "bg-destructive/15 text-destructive border-destructive/30",
  };
  ```

  Replace `<table>` chrome:

  ```tsx
  <div className="overflow-hidden rounded-lg border border-border bg-bg-elevated">
    <table className="w-full text-left text-body-sm">
      <thead className="sticky top-0 z-10 bg-bg/95 backdrop-blur">
        <tr className="border-b border-border">
          {/* th cells use text-[11px] uppercase tracking-wider text-fg-muted */}
        </tr>
      </thead>
      <tbody>
        {rows.map((job) => (
          <tr
            key={job.id}
            className="border-b border-border/60 last:border-0 transition-colors duration-fast hover:bg-bg-subtle/60"
          >
            {/* td cells use text-fg or text-fg-muted */}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  ```

  Replace pagination footer + Retry button with outlined ghost:

  ```tsx
  <button
    type="button"
    onClick={() => retryMutation.mutate(job.id)}
    className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-bg-subtle px-2.5 text-[11px] font-medium text-fg transition-colors duration-fast hover:bg-bg-subtle/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
  >
    Thử lại
  </button>
  ```

- [ ] **Step 4: Update `DiscoverTable.tsx`**

  Replace STATUS_TONE map:

  ```tsx
  const STATUS_TONE: Record<string, string> = {
    completed: "bg-positive/15 text-positive border-positive/30",
    ongoing: "bg-accent/15 text-accent border-accent/30",
    dropped: "bg-bg-subtle text-fg-muted border-border",
    unknown: "bg-bg-subtle text-fg-muted border-border",
  };
  ```

  Replace the importing-overlay tone:

  ```tsx
  <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
    <Loader2 className="h-3 w-3 animate-spin" />
    Đang import
  </span>
  ```

  Replace table chrome — sticky header + body row pattern same as JobsTable. Add selected-row treatment:

  ```tsx
  <tr
    className={`border-b border-border/60 transition-colors duration-fast last:border-0 ${
      isSelected
        ? "border-l-2 border-l-accent bg-bg-subtle"
        : "hover:bg-bg-subtle/60"
    }`}
  >
  ```

- [ ] **Step 5: Update `users.tsx` table + role select + delete IconButton**

  In users.tsx find the table, search form, and per-row controls. Use the exact classNames below. The `setDeleting`/`user` identifiers shown are placeholders — substitute the file's real names (likely `setConfirmDelete`/`u` or similar — verify before pasting).

  **(a) Search input + submit pill:**

  ```tsx
  <input
    type="search"
    placeholder="Tìm theo email hoặc tên…"
    className="block h-11 w-full max-w-md rounded-md border border-border bg-bg-elevated px-3.5 text-body text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40"
  />
  <button
    type="submit"
    className="inline-flex h-10 items-center rounded-md bg-fg px-5 text-body-sm font-semibold text-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
  >
    Tìm
  </button>
  ```

  **(b) Avatar fallback (in the user-cell):**

  ```tsx
  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-bg-subtle text-body-sm font-semibold text-fg-muted">
    {initial}
  </span>
  ```

  **(c) Role `<select>`:**

  ```tsx
  <select
    value={role}
    onChange={(e) => updateRole(user.id, e.target.value)}
    className="h-9 rounded-md border border-border bg-bg-elevated px-3 text-body-sm text-fg transition-colors duration-fast hover:border-border-strong focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
  >
    <option value="reader">Reader</option>
    <option value="admin">Admin</option>
  </select>
  ```

  **(d) Table sticky header (same as JobsTable in Step 3):**

  ```tsx
  <div className="overflow-hidden rounded-lg border border-border bg-bg-elevated">
    <table className="w-full text-left text-body-sm">
      <thead className="sticky top-0 z-10 bg-bg/95 backdrop-blur">
        <tr className="border-b border-border">
          <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-fg-muted">…</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-border/60 last:border-0 transition-colors duration-fast hover:bg-bg-subtle/60">
          {/* td: text-fg / text-fg-muted */}
        </tr>
      </tbody>
    </table>
  </div>
  ```

  **(e) Delete IconButton:**

  ```tsx
  <button
    type="button"
    onClick={() => setDeleting(user)}
    aria-label="Xoá người dùng"
    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
  >
    <Trash2 className="h-4 w-4" />
  </button>
  ```

  **(f) Pagination Prev/Next:**

  ```tsx
  <button
    type="button"
    disabled={page === 1}
    onClick={() => setPage((p) => p - 1)}
    className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-bg px-3 text-body-sm font-medium text-fg transition-colors duration-fast hover:border-border-strong hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
  >
    <ChevronLeft className="h-4 w-4" />
    Trước
  </button>
  {/* Same shape for Next with ChevronRight */}
  ```

- [ ] **Step 6: Update `stories/index.tsx` table + FilterChip + STATUS_TONE**

  Replace STATUS_TONE:

  ```tsx
  const STATUS_TONE: Record<string, string> = {
    completed: "bg-positive/15 text-positive border-positive/30",
    ongoing: "bg-accent/15 text-accent border-accent/30",
    dropped: "bg-bg-subtle text-fg-muted border-border",
    unknown: "bg-bg-subtle text-fg-muted border-border",
  };
  ```

  Replace FilterChip active/inactive. **Rationale for the contrasting active treatment:** the sidebar nav (Task 9) uses gradient pink + glow as the *signature* admin focal point — there should be only ONE such moment per surface. Filter chips stay utilitarian (`bg-fg text-bg`) so the eye is not pulled away from the sidebar's active item.

  ```tsx
  function FilterChip({
    active,
    onClick,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex h-8 items-center rounded-full px-3 text-body-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          active
            ? "bg-fg text-bg"
            : "border border-border text-fg-muted hover:border-border-strong hover:bg-bg-subtle hover:text-fg"
        }`}
      >
        {children}
      </button>
    );
  }
  ```

  Table sticky header same as JobsTable. Row hover + selected (when bulk checkbox is on):

  ```tsx
  <tr
    className={`border-b border-border/60 transition-colors duration-fast last:border-0 ${
      isSelected ? "border-l-2 border-l-accent bg-bg-subtle" : "hover:bg-bg-subtle/60"
    }`}
  >
  ```

- [ ] **Step 7: Update `sources/index.tsx` table + StatusDot**

  Replace StatusDot:

  ```tsx
  function StatusDot({ enabled }: { enabled: boolean }) {
    return (
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          enabled ? "bg-positive" : "bg-bg-subtle"
        }`}
        aria-label={enabled ? "Đang bật" : "Đã tắt"}
      />
    );
  }
  ```

  Table sticky header + row hover same pattern. Delete button hover `bg-destructive/10 text-destructive`. Discover icon-link hover `bg-bg-subtle text-fg`.

- [ ] **Step 8: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes
  Open /admin/jobs → expect: STATE pills are themed (completed=positive, active=accent, failed=destructive), table sticky header sits below top bar with backdrop-blur, body rows hover bg-subtle/60.
  Open /admin/sources/<id>/discover → select a row → expect: pink left border + solid bg-bg-subtle.
  Open /admin/users → search → expect: pill input + outlined Đăng xuất-style buttons.
  Open /admin/stories → expect: FilterChip active is bg-fg text-bg, inactive ghost.
  Open /admin/sources → expect: StatusDot green/muted, no emerald-500.

- [ ] **Step 9: Commit**
  ```bash
  git add apps/frontend/src/components/admin/JobsTable.tsx apps/frontend/src/components/admin/DiscoverTable.tsx apps/frontend/src/components/admin/StubBadge.tsx apps/frontend/src/routes/admin/users.tsx apps/frontend/src/routes/admin/stories/index.tsx apps/frontend/src/routes/admin/sources/index.tsx
  git commit -m "feat(admin): retoken tables — sticky headers, themed badges, selected row accent"
  ```

---

### Task 12: Dashboard stat cards — gradient bg-clip-text for positive accents

**Files:**
- Modify: `apps/frontend/src/routes/admin/index.tsx`

**Why this task:** Per Spec B, stat cards use the same shape as Account cards (`bg-elevated` + `border` + `rounded-lg` + `p-6`), value uses `text-display-sm tabular-nums tracking-tight`, and when the value is a positive accent (e.g., "Đã crawl" > 0) the value text gets a gradient bg-clip-text treatment.

- [ ] **Step 1: Read context**
  Read the audit entry for `admin/index.tsx` and Spec B section on Dashboard (lines 85-89).

  **Step 1b: Capture existing StatCard signature.** The existing `StatCard` accepts `{icon, label, value, textValue, subValue, tone, href}` and is invoked at 8 call sites (Sources, Truyện, Chapter tổng, Dung lượng, Chapter đã crawl, Job hoàn thành, Đang chạy+chờ, Thất bại). Notable existing semantics:
  - `textValue` is used by the "Dung lượng" tile to render a formatted string (e.g., `"12.4 MB"`) instead of a number.
  - `tone='positive'` is set on the "Chapter đã crawl" tile when the count > 0.
  - `tone='warning'` is set on the "Thất bại" tile when failed jobs > 0.

  We **keep** all existing props (no rename) and add `accentValue` semantics as an alias for `tone === 'positive' && resolvedValue > 0`. Do NOT rename `href` → `to` or drop `textValue` — that would break the 8 call sites.

- [ ] **Step 2: Replace `StatCard` component**

  Open `apps/frontend/src/routes/admin/index.tsx`. Find the local `StatCard` definition. Replace with the version below — **same prop signature as today**, only the inner markup is retoken'd:

  ```tsx
  type StatTone = "default" | "positive" | "warning" | "accent";

  type StatCardProps = {
    href: string;
    icon: typeof BookOpen; // any lucide-react icon
    label: string;
    value?: number;        // numeric value (used when textValue is absent)
    textValue?: string;    // pre-formatted string (e.g., "12.4 MB"); takes precedence
    subValue?: string;
    tone?: StatTone;
  };

  function StatCard({ href, icon: Icon, label, value, textValue, subValue, tone = "default" }: StatCardProps) {
    const displayValue = textValue ?? (value ?? 0).toLocaleString("vi-VN");
    // Gradient bg-clip-text only when the value is a positive accent (Spec B line 86-88).
    const numericValue = typeof value === "number" ? value : Number(textValue?.replace(/[^\d]/g, "") ?? 0);
    const accentValue = tone === "positive" && numericValue > 0;

    return (
      <Link
        to={href}
        className="group flex flex-col gap-3 rounded-lg border border-border bg-bg-elevated p-6 transition-all duration-fast hover:border-border-strong hover:shadow-elev focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <div className="flex items-center gap-2 text-fg-muted">
          <Icon className="h-4 w-4" />
          <span className="text-[11px] font-medium uppercase tracking-[0.18em]">{label}</span>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <span
            className={`text-display-sm tabular-nums tracking-tight ${
              accentValue
                ? "bg-accent-gradient bg-clip-text text-transparent"
                : tone === "warning"
                  ? "text-destructive"
                  : "text-fg"
            }`}
          >
            {displayValue}
          </span>
          <ArrowRight className="h-4 w-4 text-fg-muted transition-transform duration-fast group-hover:translate-x-0.5" />
        </div>

        {subValue ? (
          <p className="text-body-sm text-fg-muted">{subValue}</p>
        ) : null}
      </Link>
    );
  }
  ```

  **Call-site touch list (all 8 — verify against existing code):**

  | # | Tile | Existing prop set (preserve) | Expected accent behavior |
  |---|------|-----------------------------|--------------------------|
  | 1 | Sources | `value={sourcesQuery.data?.length ?? 0}`, `tone='default'` | none |
  | 2 | Truyện | `value={storiesQuery.data?.total ?? 0}`, `tone='default'` | none |
  | 3 | Chapter tổng | `value={storiesQuery.data?.totalChapters ?? 0}`, `tone='default'` | none |
  | 4 | Dung lượng | `textValue={formatBytes(storageQuery.data?.bytes ?? 0)}`, `tone='default'` | none (string value) |
  | 5 | Chapter đã crawl | `value={storiesQuery.data?.crawledChapters ?? 0}`, `tone='positive'` | **gradient bg-clip-text when > 0** |
  | 6 | Job hoàn thành | `value={jobsStatsQuery.data?.completed ?? 0}`, `tone='positive'` | gradient bg-clip-text when > 0 |
  | 7 | Đang chạy + chờ | `value={(jobsStatsQuery.data?.active ?? 0) + (jobsStatsQuery.data?.waiting ?? 0)}`, `tone='default'` | none |
  | 8 | Thất bại | `value={jobsStatsQuery.data?.failed ?? 0}`, `tone='warning'` | text-destructive (not gradient) |

  > **Source-of-truth note:** the exact data-path keys (`crawledChapters`, `completed`, etc.) may differ from the table above. Open the current `admin/index.tsx` and substitute the real `*.data?.<field>` reads — DO NOT invent a `crawledCount` variable. Audit confirmed 4 react-query reads on the page: sources, stories, jobs.stats, storage; pull from those.

- [ ] **Step 3: Update Section headers**

  Find the two `<section>` blocks (Thư viện, Hàng đợi). Replace section header markup:

  ```tsx
  <section className="space-y-4">
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-fg-muted">
        {sectionEyebrow /* e.g., "THƯ VIỆN" */}
      </p>
      <h2 className="font-sans text-heading-md text-fg">{sectionTitle}</h2>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* StatCards */}
    </div>
  </section>
  ```

  Also retoken the top-of-page header to match Account:

  ```tsx
  <header className="mb-8 space-y-2">
    <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-fg-muted">
      TỔNG QUAN
    </p>
    <h1 className="font-sans text-display-md text-fg">Bảng điều khiển</h1>
    <p className="text-body-sm text-fg-muted">Số liệu nhanh về thư viện và hàng đợi crawler.</p>
  </header>
  ```

- [ ] **Step 4: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes
  Open /admin → expect: TỔNG QUAN eyebrow + display-md header; 8 stat cards (4 per section) on `bg-elevated` with `rounded-lg` and `border-border`; "Đã crawl" value (if > 0) shows pink gradient on the digits via bg-clip-text; other values are solid `text-fg`.

- [ ] **Step 5: Commit**
  ```bash
  git add apps/frontend/src/routes/admin/index.tsx
  git commit -m "feat(admin): dashboard stat cards + gradient bg-clip-text for accent value"
  ```

---

### Task 13: Action bars — Discover + Stories floating pills

**Files:**
- Modify: `apps/frontend/src/components/admin/DiscoverActionBar.tsx`
- Modify: `apps/frontend/src/routes/admin/stories/index.tsx` (the in-route BulkActionBar)

**Why this task:** Spec B requires the floating bottom pill bar to use `bg-elevated rounded-2xl border-border-strong shadow-elev`, count chip with gradient pink + white text, primary action with gradient + glow, secondary outlined. Audit confirmed both files share near-identical chrome with hardcoded mega-shadow and raw HSL pink.

- [ ] **Step 1: Read context**
  Read audit entries for `DiscoverActionBar.tsx` and the BulkActionBar block inside `stories/index.tsx`.

  **Store contract:** `apps/frontend/src/stores/discover-import-store.ts` (import path `@/stores/discover-import-store` — NOT `@/stores/useDiscoverImportStore`) exports `selected` (Set<string>), `importing`, `toggle`, `clearSelection` (NOT `clear`), `selectAll`, `markImporting`, `markDone`. There is no `autoCrawl` / `setAutoCrawl` on the store — those are LOCAL `useState` in the existing component. Keep them local.

  **Behavior preservation (Spec says no behavior changes):** the existing component has `async function submit()` calling `discoverApi.importBulk(urls, autoCrawl)` plus local `submitting` / `info` / `error` and an `onImported` callback prop. We retain that plumbing; only chrome + classNames swap. Do NOT introduce React Query in this retoken.

- [ ] **Step 2: Replace `DiscoverActionBar.tsx` chrome (keep existing logic)**

  ```tsx
  // apps/frontend/src/components/admin/DiscoverActionBar.tsx
  import { useState } from "react";
  import { X, Loader2 } from "lucide-react";
  import { useDiscoverImportStore } from "@/stores/discover-import-store";
  // existing imports: discoverApi, types, etc.

  type DiscoverActionBarProps = {
    onImported?: (urls: string[]) => void;
    // ... other existing props ...
  };

  export function DiscoverActionBar({ onImported }: DiscoverActionBarProps) {
    // Read from store (selectors keep this stable):
    const selected = useDiscoverImportStore((s) => s.selected);
    const clearSelection = useDiscoverImportStore((s) => s.clearSelection);
    const markImporting = useDiscoverImportStore((s) => s.markImporting);
    const markDone = useDiscoverImportStore((s) => s.markDone);

    // Local UI state (NOT in store):
    const [autoCrawl, setAutoCrawl] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [info, setInfo] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    if (selected.size === 0) return null;
    const count = selected.size;
    const overLimit = count > 50;

    async function submit() {
      const urls = Array.from(selected);
      setSubmitting(true);
      setError(null);
      setInfo(null);
      try {
        markImporting(urls);
        await discoverApi.importBulk(urls, autoCrawl);
        setInfo(`Đã đưa ${urls.length} vào hàng đợi.`);
        onImported?.(urls);
        markDone(urls);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi không xác định");
        markDone(urls);
      } finally {
        setSubmitting(false);
      }
    }

    return (
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 w-[min(95vw,720px)] -translate-x-1/2">
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border-strong bg-bg-elevated px-4 py-3 shadow-elev">
          <span className="inline-flex h-7 items-center rounded-full bg-accent-gradient px-3 text-[12px] font-semibold text-white">
            {count}
          </span>
          <span className="text-body-sm text-fg-muted">
            đã chọn
            {overLimit ? <span className="ml-2 text-destructive">(tối đa 50)</span> : null}
          </span>

          <label className="ml-auto inline-flex items-center gap-2 text-body-sm text-fg-muted">
            <input
              type="checkbox"
              checked={autoCrawl}
              onChange={(e) => setAutoCrawl(e.target.checked)}
              className="h-4 w-4 rounded border-border-strong bg-bg-elevated text-accent focus:ring-2 focus:ring-accent"
            />
            Crawl ngay
          </label>

          <button
            type="button"
            onClick={() => {
              clearSelection();
              setInfo(null);
              setError(null);
            }}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-border-strong bg-bg-subtle px-3 text-body-sm font-medium text-fg-muted transition-colors duration-fast hover:bg-bg-subtle/80 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-4 w-4" />
            Bỏ chọn
          </button>

          <button
            type="button"
            onClick={submit}
            disabled={submitting || overLimit}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent-gradient px-4 text-body-sm font-bold text-white shadow-glow-pink-soft transition-opacity duration-fast hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang import…
              </>
            ) : autoCrawl ? (
              "Import + crawl"
            ) : (
              "Chỉ import metadata"
            )}
          </button>
        </div>

        {/* Existing info/error message rendering — keep as-is, just retoken classNames:
            info → text-positive, error → text-destructive */}
      </div>
    );
  }
  ```

- [ ] **Step 3: Replace `BulkActionBar` in `stories/index.tsx`**

  Find the in-route `BulkActionBar` block. Replace with the same chrome shape — keep the 3 actions (Quét chương / Crawl missing / Quét + Crawl):

  ```tsx
  function BulkActionBar({
    selected,
    onClear,
    onScan,
    onCrawl,
    onScanCrawl,
    pending,
  }: BulkActionBarProps) {
    if (selected.size === 0) return null;
    const count = selected.size;

    return (
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 w-[min(95vw,820px)] -translate-x-1/2">
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border-strong bg-bg-elevated px-4 py-3 shadow-elev">
          <span className="inline-flex h-7 items-center rounded-full bg-accent-gradient px-3 text-[12px] font-semibold text-white">
            {count}
          </span>
          <span className="text-body-sm text-fg-muted">truyện đã chọn</span>

          <button
            type="button"
            onClick={onClear}
            className="ml-auto inline-flex h-9 items-center gap-1 rounded-md border border-border-strong bg-bg-subtle px-3 text-body-sm font-medium text-fg-muted transition-colors duration-fast hover:bg-bg-subtle/80 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-4 w-4" />
            Bỏ chọn
          </button>

          <ActionButton variant="outline" disabled={pending} onClick={onScan}>
            Quét chương
          </ActionButton>
          <ActionButton variant="outline" disabled={pending} onClick={onCrawl}>
            Crawl missing
          </ActionButton>
          <ActionButton variant="cta" disabled={pending} onClick={onScanCrawl}>
            Quét + Crawl
          </ActionButton>
        </div>
      </div>
    );
  }

  function ActionButton({
    variant,
    disabled,
    onClick,
    children,
  }: {
    variant: "cta" | "outline";
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) {
    if (variant === "cta") {
      return (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="inline-flex h-9 items-center rounded-md bg-accent-gradient px-4 text-body-sm font-bold text-white shadow-glow-pink-soft transition-opacity duration-fast hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {children}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex h-9 items-center rounded-md border border-border-strong bg-bg-subtle px-3.5 text-body-sm font-medium text-fg transition-colors duration-fast hover:bg-bg-subtle/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {children}
      </button>
    );
  }
  ```

- [ ] **Step 4: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes
  Open /admin/sources/<id>/discover → select 3 rows → expect: floating pill bar appears with `bg-elevated`, `border-border-strong`, soft elev shadow; count chip is pink gradient with white text; primary "Import + crawl" button is gradient with glow.
  Open /admin/stories → select 2 rows → expect: same bar shape with 3 outlined buttons + 1 gradient "Quét + Crawl".

- [ ] **Step 5: Commit**
  ```bash
  git add apps/frontend/src/components/admin/DiscoverActionBar.tsx apps/frontend/src/routes/admin/stories/index.tsx
  git commit -m "feat(admin): retoken floating action bars — gradient chip + glow CTA"
  ```

---

### Task 14: Delete user modal — bg-elevated panel + bg-destructive confirm

**Files:**
- Modify: `apps/frontend/src/routes/admin/users.tsx`

**Why this task:** Per Spec B, the delete confirm modal backdrop is `bg-fg/40 backdrop-blur-sm`, panel is `bg-elevated rounded-xl border-border shadow-elev`, and the final confirm button is `bg-destructive text-white`. Email-typed confirmation behavior is preserved.

- [ ] **Step 1: Read context**
  Re-read audit entry for `users.tsx` — the file has a SEPARATE `function DeleteConfirm({ user, busy, error, onCancel, onConfirm })` component (around lines 243-325) that is rendered as `{confirmDelete && <DeleteConfirm user={confirmDelete} busy={deleteM.isPending} error={deleteErr} onCancel={...} onConfirm={...} />}` from the parent. Internal email-typed state (`typed` + `matches`) lives inside DeleteConfirm.

  **Do not collapse to inline JSX** — keep the existing prop signature so the parent doesn't need to change. Edit the body of `DeleteConfirm` in place: swap classNames + container shape only.

- [ ] **Step 2: Retoken `DeleteConfirm` body**

  In `users.tsx`, find `function DeleteConfirm({ user, busy, error, onCancel, onConfirm })` and replace its returned JSX with the version below — same props, same internal `typed`/`matches` state:

  ```tsx
  function DeleteConfirm({
    user,
    busy,
    error,
    onCancel,
    onConfirm,
  }: {
    user: User;
    busy: boolean;
    error: string | null;
    onCancel: () => void;
    onConfirm: () => void;
  }) {
    const [typed, setTyped] = useState("");
    const matches = typed === user.email;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 px-4 backdrop-blur-sm">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-user-title"
          className="w-full max-w-md rounded-xl border border-border bg-bg-elevated p-6 shadow-elev"
        >
          <h2 id="delete-user-title" className="font-sans text-heading-md text-fg">
            Xoá người dùng
          </h2>
          <p className="mt-2 text-body-sm text-fg-muted">
            Hành động này không thể hoàn tác. Để xác nhận, nhập email{" "}
            <span className="font-mono text-fg">{user.email}</span> bên dưới.
          </p>

          <input
            type="email"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={user.email}
            className="mt-4 block h-11 w-full rounded-md border border-border bg-bg px-3.5 text-body text-fg placeholder:text-fg-subtle focus:border-destructive/40 focus:outline-none focus:ring-2 focus:ring-destructive/40"
          />

          {error ? (
            <p className="mt-2 text-body-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-10 items-center rounded-md px-4 text-body-sm font-medium text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!matches || busy}
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-destructive px-4 text-body-sm font-semibold text-white transition-opacity duration-fast hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {busy ? "Đang xoá…" : "Xoá vĩnh viễn"}
            </button>
          </div>
        </div>
      </div>
    );
  }
  ```

  > **Parent stays unchanged.** The call site `{confirmDelete && <DeleteConfirm user={confirmDelete} busy={deleteM.isPending} error={deleteErr} onCancel={() => setConfirmDelete(null)} onConfirm={() => deleteM.mutate(confirmDelete.id)} />}` (or whatever real names are in use) does not need to change. If your real parent names differ from `confirmDelete` / `deleteM` / `deleteErr`, leave them as they are.

- [ ] **Step 3: Verify locally**
  Run: `pnpm --filter @smanga/frontend typecheck` → expect: passes
  Open /admin/users → click trash icon on a non-admin row → expect: backdrop is `bg-fg/40 backdrop-blur-sm`, panel `bg-elevated rounded-xl border-border shadow-elev`; confirm button disabled until you type the exact email; once enabled, button is `bg-destructive text-white` with destructive focus ring.
  Type wrong email → expect: button stays disabled.
  Type correct email + click → expect: mutation runs and modal closes on success.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/frontend/src/routes/admin/users.tsx
  git commit -m "feat(admin): delete-user modal — bg-elevated panel + destructive confirm"
  ```

---

## Completion checklist

After all 14 tasks are done and committed:

- [ ] Run `pnpm --filter @smanga/frontend typecheck` once more → expect: passes
- [ ] Run `pnpm --filter @smanga/frontend build` → expect: succeeds
- [ ] Manual smoke (LIGHT theme — Plan A default since the v3 migration; Spec B was written for dark-default but the codebase now ships light-first):
  - [ ] `/dang-nhap` and `/dang-ky` render with dark hero (LEFT pane gradient is always dark — that's intentional, hero is a fixed-mood chrome surface) + pink CTA + bg-elevated inputs on the RIGHT pane; submit + redirect flows still work
  - [ ] `/tai-khoan` — 3 cards on bg-elevated, "Lưu thay đổi" is `bg-fg text-bg` (renders as dark slab in LIGHT theme), "Đã lưu" flash is positive, the Plan C placeholder comment `{/* <ReadingStatsCard /> — added in Plan C (Spec C differentiators) */}` is present in source above the 3 cards
  - [ ] Reader Settings drawer — 3 segmented controls slide animate (CSS transform, NOT View Transitions API per Spec B risk mitigation), live preview reflects choices instantly, fontSize options are 15/18/20/24 (strings)
  - [ ] BookmarkToggle + StoryCard no longer reference `--color-cta`
  - [ ] Admin sidebar — active item is pink gradient with glow; desktop aside is `sticky top-0 self-start` (preserved from existing code)
  - [ ] Admin top bar — sticky bg/95 backdrop-blur, Đăng xuất always visible
  - [ ] Admin tables — sticky headers, status badges use new tokens, selected rows have pink left border
  - [ ] Admin dashboard — `tone='positive'` tile (Chapter đã crawl) uses gradient bg-clip-text when value > 0; existing `textValue` strings (e.g., "Dung lượng") still render correctly
  - [ ] Action bars — gradient pink count chip + glow primary CTA; submit() function still wired (no React Query introduced)
  - [ ] Delete user modal — bg-destructive confirm, email-typed gate works; existing DeleteConfirm component prop signature preserved
- [ ] Toggle to DARK theme via Cài đặt drawer → repeat key checks (auth, account "Lưu thay đổi" inverts correctly, admin sidebar gradient still pops, tables still legible, SegmentedControl active pill still visible) → expect: no theme-breaking raw colors and the bg-fg/text-bg inversion is symmetric
- [ ] All commits present on local branch — DO NOT push. Inform user when Phase B is verified locally.

## Out of scope (do not touch in Plan B)

- Reader pages, layout shells, navigation IA → Plan A territory
- Reading stats endpoint + ReadingStatsCard content → Plan C
- Drop-cap, empty states, continue-reading bar logic → Plan C
- New admin features (no scope creep)
- New routes added or removed
- Settings.tsx and stories/$id.tsx (out of scope per audit notes)
- DiscoverCard/DiscoverGrid dead-code removal (Plan C cleanup)
