# SManga Redesign — Plan A (Tokens, Shells, Reader Pages) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Spec:** [docs/superpowers/specs/2026-05-30-redesign-A-tokens-shells-reader-design.md](../specs/2026-05-30-redesign-A-tokens-shells-reader-design.md)
> **User directive (2026-05-30):** Commit locally after each task. **DO NOT push to remote.** User will push when ready.

**Goal:** Apply Modern Tech-Editorial direction (dark default + light opt-in) to the SManga reader: new design tokens, AppShell with desktop top-nav + mobile bottom tab bar + "Đọc tiếp" persistent CTA, and redesigned reader pages (Home / Story / Chapter / Library / Discover / Bạn).

**Architecture:** Three phases — A1 token layer (CSS vars + Tailwind config + theme switcher), A2 layout shells (AppShell + BottomTabBar + ContinueReadingBar component shell), A3 page refactors (six reader pages incl. two new routes `/kham-pha` and `/ban`). Each phase commits per-task locally; no remote push.

**Tech Stack:** Vite + React 18 + TanStack Router (file-based), Tailwind CSS 3, zustand (theme/auth/reader-prefs stores), shadcn primitives, Lucide icons. No new runtime deps for Plan A.

---

## File structure

New files (Plan A):

```
apps/frontend/src/
  components/
    layout/
      AppShell.tsx              Root reader layout (top header + slot + bottom tab bar)
      DesktopTopNav.tsx         Desktop ≥lg horizontal nav (Đọc/Khám phá/Tủ sách + avatar)
      BottomTabBar.tsx          Mobile <lg sticky bottom 4-tab nav
      ContinueReadingBar.tsx    Shell only (placeholder data; Plan C wires API)
      ReaderHeader.tsx          REFRESH — strip inline nav, keep avatar dropdown + drawer
  routes/
    kham-pha.tsx                NEW — Khám phá tab (search + browse)
    ban.tsx                     NEW — Bạn tab (redirect to /tai-khoan if logged in)
    tim-kiem.tsx                MODIFY — redirect to /kham-pha?q=… (preserve old URLs)
    truyen/$slug/
      index.tsx                 MODIFY — Story detail retoken + new CTAs
      chuong/$index.tsx         MODIFY — Chapter reader auto-hide chrome + floating nav pill
    tu-sach.tsx                 MODIFY — 3 sub-tabs, library cards, ReadingStatsCard slot
    index.tsx (or src/routes/index.tsx) MODIFY — Home with Đọc tiếp hero variant
  styles/
    globals.css                 MODIFY — replace token block with new CSS vars
  index.html                    MODIFY — add Inter + Newsreader + JetBrains Mono font links
  tailwind.config.ts            MODIFY — extend theme with new tokens + type scale
```

---

## Phase A1 — Token Layer

### Task 1: Replace CSS variables in globals.css

**Files:**
- Modify: `apps/frontend/src/styles/globals.css`

- [ ] **Step 1: Read current globals.css to locate token block**

```powershell
Get-Content apps\frontend\src\styles\globals.css | Select-Object -First 100
```
Expected: existing `:root` block with shadcn HSL tokens.

- [ ] **Step 2: Replace token block with new dark + light tokens**

Replace the entire `:root` and `.dark` (or `[data-theme="dark"]`) blocks with:

```css
:root,
:root[data-theme="dark"] {
  /* Surfaces */
  --bg:            #0A0A0A;
  --bg-elevated:   #18181B;
  --bg-subtle:     rgba(255, 255, 255, 0.04);

  /* Foreground */
  --fg:            #FAFAFA;
  --fg-muted:      rgba(255, 255, 255, 0.60);
  --fg-subtle:     rgba(255, 255, 255, 0.40);

  /* Brand */
  --accent:        #EC4899;
  --accent-strong: #F472B6;

  /* Borders */
  --border:        rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.16);

  /* Status */
  --destructive:   #F43F5E;
  --positive:      #34D399;

  /* Shadows (signature) */
  --glow-pink:        0 0 24px rgba(236, 72, 153, 0.40), 0 0 64px rgba(236, 72, 153, 0.15);
  --glow-pink-soft:   0 0 16px rgba(236, 72, 153, 0.20);
  --shadow-elev:      0 8px 24px rgba(0, 0, 0, 0.40);

  color-scheme: dark;
}

:root[data-theme="light"] {
  --bg:            #FAFAFA;
  --bg-elevated:   #FFFFFF;
  --bg-subtle:     #F4F4F5;

  --fg:            #18181B;
  --fg-muted:      #52525B;
  --fg-subtle:     #A1A1AA;

  --accent:        #EC4899;
  --accent-strong: #F472B6;

  --border:        #E4E4E7;
  --border-strong: #D4D4D8;

  --destructive:   #E11D48;
  --positive:      #059669;

  --glow-pink:        0 0 24px rgba(236, 72, 153, 0.30), 0 0 64px rgba(236, 72, 153, 0.10);
  --glow-pink-soft:   0 0 16px rgba(236, 72, 153, 0.15);
  --shadow-elev:      0 8px 24px rgba(0, 0, 0, 0.08);

  color-scheme: light;
}

body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

Keep any existing utility classes below the token block (e.g. `.container` definitions). If shadcn-style HSL vars (`--background`, `--foreground`, `--primary`, etc.) exist below, alias them to the new tokens to preserve backwards compatibility for any unmigrated component:

```css
:root,
:root[data-theme="dark"],
:root[data-theme="light"] {
  --background: var(--bg);
  --foreground: var(--fg);
  --primary: var(--accent);
  --primary-foreground: #FFFFFF;
  --muted: var(--bg-subtle);
  --muted-foreground: var(--fg-muted);
  --border: var(--border);
  --input: var(--border-strong);
  --ring: var(--accent);
  --destructive: var(--destructive);
  --destructive-foreground: #FFFFFF;
  --radius: 0.625rem;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/styles/globals.css
git commit -m "refactor(tokens): replace shadcn HSL with brand tokens (dark+light)"
```

---

### Task 2: Wire `data-theme` + dark default in ThemeProvider

**Files:**
- Modify: `apps/frontend/src/components/providers/ThemeProvider.tsx` (or whatever component manages the existing dark class)
- Modify: `apps/frontend/src/stores/reader-prefs-store.ts` (if it owns the theme state)

- [ ] **Step 1: Find current theme application logic**

```powershell
Select-String -Path apps\frontend\src\**\*.tsx,apps\frontend\src\**\*.ts -Pattern "classList.toggle.*dark|document.documentElement|data-theme" | Select-Object -First 10
```

Identify the file that writes `document.documentElement.classList.add('dark')` (or similar).

- [ ] **Step 2: Replace `.dark` class toggle with `data-theme` attribute**

In the identified file (likely `ThemeProvider.tsx`), find the effect that applies theme and replace:

```tsx
// Before
document.documentElement.classList.toggle('dark', resolved === 'dark');

// After
document.documentElement.setAttribute('data-theme', resolved);
```

If the resolution logic reads from the reader-prefs store with three options (`light` | `dark` | `system`), keep that — `resolved` should already be either `'light'` or `'dark'`.

- [ ] **Step 3: Change default theme from `system` to `dark`**

In `apps/frontend/src/stores/reader-prefs-store.ts`, find the initial state of the theme:

```tsx
// Before
const DEFAULT_THEME: ReaderTheme = 'system';

// After
const DEFAULT_THEME: ReaderTheme = 'dark';
```

If the store uses `zustand persist`, also bump the persist version so existing users' `system` choice migrates to `dark`:

```tsx
persist(
  (set) => ({ /* ... */ }),
  {
    name: 'reader-prefs',
    version: 2, // bumped from 1
    migrate: (persistedState: unknown, version) => {
      if (version < 2 && persistedState && typeof persistedState === 'object') {
        const s = persistedState as { theme?: string };
        if (s.theme === 'system') s.theme = 'dark';
      }
      return persistedState as ReaderPrefsState;
    },
  },
)
```

- [ ] **Step 4: Verify locally — open browser, page background should be #0A0A0A**

Start dev server (FE already up on :3000 per session). Open `http://localhost:3000` and confirm:
- `<html data-theme="dark">` in DevTools
- Page background is near-black
- Toggle to light via avatar dropdown → Cài đặt → switches to `data-theme="light"`, white bg

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/providers/ThemeProvider.tsx apps/frontend/src/stores/reader-prefs-store.ts
git commit -m "refactor(theme): data-theme attribute + dark default + v2 persist migration"
```

---

### Task 3: Font imports + type scale Tailwind utilities

**Files:**
- Modify: `apps/frontend/index.html`
- Modify: `apps/frontend/tailwind.config.ts`

- [ ] **Step 1: Add font preconnect + import to index.html**

In `apps/frontend/index.html`, inside `<head>` (above the existing Google Fonts link if any), replace any Newsreader/Roboto links with:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;0,6..72,700;1,6..72,400&family=JetBrains+Mono:wght@400;500&display=swap"
  rel="stylesheet"
/>
```

- [ ] **Step 2: Update Tailwind config — fonts + extended type scale**

In `apps/frontend/tailwind.config.ts`, replace `theme.extend` with:

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' },
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-elevated': 'var(--bg-elevated)',
        'bg-subtle': 'var(--bg-subtle)',
        fg: 'var(--fg)',
        'fg-muted': 'var(--fg-muted)',
        'fg-subtle': 'var(--fg-subtle)',
        accent: 'var(--accent)',
        'accent-strong': 'var(--accent-strong)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        destructive: 'var(--destructive)',
        positive: 'var(--positive)',
        // shadcn aliases preserved
        background: 'var(--bg)',
        foreground: 'var(--fg)',
        primary: { DEFAULT: 'var(--accent)', foreground: '#FFFFFF' },
        muted: { DEFAULT: 'var(--bg-subtle)', foreground: 'var(--fg-muted)' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        prose: ['Newsreader', 'Source Serif Pro', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
        heading: ['Inter', 'system-ui', 'sans-serif'], // alias kept for legacy uses
      },
      fontSize: {
        'display-xl': ['64px', { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '800' }],
        'display-lg': ['48px', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '800' }],
        'display-md': ['36px', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '800' }],
        'display-sm': ['28px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '800' }],
        'heading-lg': ['22px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'heading-md': ['18px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '700' }],
        body: ['14px', { lineHeight: '1.5' }],
        'body-sm': ['13px', { lineHeight: '1.5' }],
        label: ['11px', { lineHeight: '1', letterSpacing: '0.18em', fontWeight: '600' }],
        prose: ['18px', { lineHeight: '1.75' }],
      },
      boxShadow: {
        'glow-pink': 'var(--glow-pink)',
        'glow-pink-soft': 'var(--glow-pink-soft)',
        elev: 'var(--shadow-elev)',
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
        xl: '24px',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        fast: '150ms',
        DEFAULT: '200ms',
        slow: '300ms',
      },
      backgroundImage: {
        'accent-gradient': 'linear-gradient(135deg, var(--accent), var(--accent-strong))',
        'accent-gradient-soft':
          'linear-gradient(90deg, rgba(236,72,153,0.12), rgba(244,114,182,0.04))',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Verify Tailwind picks up new utilities**

In any component, temporarily add `<div class="text-display-md bg-accent-gradient text-fg">Test</div>` and confirm browser renders 36px gradient pink bg. Remove the test.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/index.html apps/frontend/tailwind.config.ts
git commit -m "feat(tokens): fonts + type scale + accent gradient + glow utilities"
```

---

## Phase A2 — Layout Shells

### Task 4: Extract AppShell component (root reader layout)

**Files:**
- Create: `apps/frontend/src/components/layout/AppShell.tsx`
- Modify: `apps/frontend/src/routes/__root.tsx`

- [ ] **Step 1: Create AppShell**

```tsx
// apps/frontend/src/components/layout/AppShell.tsx
import { useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { BottomTabBar } from './BottomTabBar';
import { DesktopTopNav } from './DesktopTopNav';
import { ReaderHeader } from '@/components/reader/ReaderHeader';
import { ContinueReadingBar } from './ContinueReadingBar';

/**
 * Reader root layout. Renders:
 *   Desktop (≥1024px):  DesktopTopNav (sticky) → ContinueReadingBar → main → footer
 *   Mobile (<1024px):   ReaderHeader (mini) → ContinueReadingBar → main → BottomTabBar
 *
 * Bottom tab bar hides on chapter reader routes (full-screen reading).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isChapter = /^\/truyen\/[^/]+\/chuong\/[^/]+/.test(path);

  return (
    <div className="min-h-screen flex flex-col bg-bg text-fg">
      <div className="hidden lg:block">
        <DesktopTopNav />
      </div>
      <div className="lg:hidden">
        <ReaderHeader />
      </div>
      {!isChapter && <ContinueReadingBar />}
      <main className="flex-1">{children}</main>
      {!isChapter && (
        <div className="lg:hidden">
          <BottomTabBar />
        </div>
      )}
      <footer className="hidden lg:block border-t border-border py-6 text-body-sm text-fg-muted text-center">
        SManga · Đọc truyện chữ
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Update `__root.tsx` to use AppShell**

In `apps/frontend/src/routes/__root.tsx`, replace the existing `isApp` branching:

```tsx
import { createRootRouteWithContext, Outlet, useRouterState } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { AppShell } from '@/components/layout/AppShell';
import { useMeQuery } from '@/hooks/use-auth';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

function RootLayout() {
  useMeQuery();
  const path = useRouterState({ select: (s) => s.location.pathname });
  // Routes that own their own shell (no reader chrome):
  //   /admin/* — admin uses its own AdminLayout
  //   /dang-nhap, /dang-ky — auth uses AuthShell
  const ownsShell =
    path.startsWith('/admin') ||
    path === '/dang-nhap' ||
    path === '/dang-ky';
  return (
    <ThemeProvider>
      {ownsShell ? <Outlet /> : <AppShell><Outlet /></AppShell>}
    </ThemeProvider>
  );
}
```

- [ ] **Step 3: Verify**

Reload `http://localhost:3000` — page still renders. Existing ReaderHeader visible. (BottomTabBar + DesktopTopNav + ContinueReadingBar don't exist yet → those imports will fail.)

Stub them temporarily to unblock:

```tsx
// In AppShell.tsx temporarily, add at top:
const DesktopTopNav = () => <div className="h-14 border-b border-border px-6 flex items-center"><span className="font-sans font-extrabold text-heading-lg">SManga</span></div>;
const BottomTabBar = () => <div className="h-16 border-t border-border bg-bg" />;
const ContinueReadingBar = () => null;
```

Remove these stubs after Tasks 5–7. For now, comment out the imports too.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/layout/AppShell.tsx apps/frontend/src/routes/__root.tsx
git commit -m "feat(layout): extract AppShell root layout (stubs for children)"
```

---

### Task 5: BottomTabBar component

**Files:**
- Create: `apps/frontend/src/components/layout/BottomTabBar.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/frontend/src/components/layout/BottomTabBar.tsx
import { Link, useRouterState } from '@tanstack/react-router';
import { BookOpen, Compass, Library, User } from 'lucide-react';

const TABS = [
  { to: '/' as const, label: 'Đọc', icon: BookOpen, match: (p: string) => p === '/' },
  { to: '/kham-pha' as const, label: 'Khám phá', icon: Compass, match: (p: string) => p.startsWith('/kham-pha') || p.startsWith('/tim-kiem') },
  { to: '/tu-sach' as const, label: 'Tủ sách', icon: Library, match: (p: string) => p.startsWith('/tu-sach') },
  { to: '/ban' as const, label: 'Bạn', icon: User, match: (p: string) => p.startsWith('/ban') || p.startsWith('/tai-khoan') },
];

export function BottomTabBar() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Điều hướng chính"
      className="sticky bottom-0 z-40 bg-bg/95 backdrop-blur-md border-t border-border px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2"
    >
      <ul className="grid grid-cols-4 gap-0.5" role="tablist">
        {TABS.map((tab) => {
          const active = tab.match(path);
          const Icon = tab.icon;
          return (
            <li key={tab.to}>
              <Link
                to={tab.to}
                role="tab"
                aria-selected={active}
                className={`flex flex-col items-center gap-1 py-2 rounded-md transition-colors duration-fast min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active ? 'text-accent' : 'text-fg-subtle hover:text-fg-muted'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="text-[10px] font-semibold leading-none">{tab.label}</span>
                {active && (
                  <span aria-hidden className="absolute -top-px h-0.5 w-8 bg-accent rounded-full" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Replace the stub import in AppShell**

In `apps/frontend/src/components/layout/AppShell.tsx`, remove the BottomTabBar stub and uncomment the import.

- [ ] **Step 3: Verify on mobile width**

Resize browser to <1024px (DevTools device mode). Bottom tab bar appears with 4 tabs. Tap "Tủ sách" → navigates (or 404 if route not done yet; that's fine for now).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/layout/BottomTabBar.tsx apps/frontend/src/components/layout/AppShell.tsx
git commit -m "feat(layout): BottomTabBar mobile nav (4 tabs)"
```

---

### Task 6: DesktopTopNav component

**Files:**
- Create: `apps/frontend/src/components/layout/DesktopTopNav.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/frontend/src/components/layout/DesktopTopNav.tsx
import { Link, useRouterState } from '@tanstack/react-router';
import { Search as SearchIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { AvatarMenu } from '@/components/reader/AvatarMenu';

const NAV = [
  { to: '/' as const, label: 'Đọc', match: (p: string) => p === '/' },
  { to: '/kham-pha' as const, label: 'Khám phá', match: (p: string) => p.startsWith('/kham-pha') || p.startsWith('/tim-kiem') },
  { to: '/tu-sach' as const, label: 'Tủ sách', match: (p: string) => p.startsWith('/tu-sach') },
];

export function DesktopTopNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const user = useAuthStore((s) => s.user);

  return (
    <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md border-b border-border/60">
      <div className="container flex items-center h-14 gap-8">
        <Link to="/" className="font-sans font-extrabold text-heading-lg tracking-tight">
          SManga
        </Link>
        <nav className="flex items-center gap-6 flex-1" aria-label="Điều hướng chính">
          {NAV.map((n) => {
            const active = n.match(path);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`relative text-body font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded ${
                  active ? 'text-fg' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {n.label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute -bottom-[18px] left-0 right-0 h-0.5 bg-accent-gradient rounded-full"
                  />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/kham-pha"
            search={{ q: '', page: 1 }}
            aria-label="Tìm kiếm"
            className="inline-flex items-center justify-center h-9 w-9 rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <SearchIcon className="h-4 w-4" />
          </Link>
          {user ? <AvatarMenu user={user} /> : (
            <Link
              to="/dang-nhap"
              search={{ redirect: '/' }}
              className="inline-flex items-center h-9 px-4 rounded-md text-body font-semibold bg-fg text-bg hover:opacity-90 transition-opacity duration-fast"
            >
              Đăng nhập
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Extract AvatarMenu from existing ReaderHeader**

Create `apps/frontend/src/components/reader/AvatarMenu.tsx` — copy the avatar button + dropdown menu code from current `ReaderHeader.tsx` (the entire `{user && (<div ref={menuRef} className="relative">…</div>)}` block including the close-on-outside-click effect and `handleLogout`). Export as `<AvatarMenu user={user} />`. The settings drawer trigger stays inside this component.

```tsx
// apps/frontend/src/components/reader/AvatarMenu.tsx
import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Library, LogOut, Settings as SettingsIcon, Shield, User } from 'lucide-react';
import { logout as logoutApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth-store';
import type { User as UserType } from '@/api/auth';
import { useReaderPrefs } from '@/stores/reader-prefs-store';

export function AvatarMenu({ user }: { user: UserType }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const setSettingsOpen = useReaderPrefs((s) => s.setSettingsOpen);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function handleLogout() {
    try { await logoutApi(); } catch { /* force-reset below */ }
    useAuthStore.getState().setUser(null);
    setOpen(false);
    window.location.href = '/';
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tài khoản ${user.email}`}
        className="inline-flex items-center gap-2 h-9 px-1.5 rounded-md hover:bg-bg-subtle transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {user.image ? (
          <img src={user.image} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-accent-gradient text-white text-body-sm font-bold uppercase">
            {(user.name?.[0] ?? user.email[0] ?? 'U').toUpperCase()}
          </span>
        )}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1.5 w-60 rounded-lg border border-border bg-bg-elevated shadow-elev p-1.5 z-40">
          <div className="px-3 py-2 border-b border-border/60 mb-1">
            <p className="text-body-sm text-fg-muted">Đăng nhập với</p>
            <p className="text-body font-medium truncate" title={user.email}>{user.email}</p>
          </div>
          <Link to="/tu-sach" onClick={() => setOpen(false)} role="menuitem" className="flex items-center gap-2 h-9 px-3 rounded-md text-body hover:bg-bg-subtle transition-colors duration-fast">
            <Library className="h-4 w-4" aria-hidden /> Tủ sách của bạn
          </Link>
          <Link to="/tai-khoan" onClick={() => setOpen(false)} role="menuitem" className="flex items-center gap-2 h-9 px-3 rounded-md text-body hover:bg-bg-subtle transition-colors duration-fast">
            <User className="h-4 w-4" aria-hidden /> Tài khoản
          </Link>
          {user.role === 'admin' && (
            <a href="/admin" role="menuitem" className="flex items-center gap-2 h-9 px-3 rounded-md text-body hover:bg-bg-subtle transition-colors duration-fast">
              <Shield className="h-4 w-4" aria-hidden /> Quản trị
            </a>
          )}
          <button
            type="button"
            onClick={() => { setSettingsOpen(true); setOpen(false); }}
            role="menuitem"
            className="w-full flex items-center gap-2 h-9 px-3 rounded-md text-body hover:bg-bg-subtle transition-colors duration-fast"
          >
            <SettingsIcon className="h-4 w-4" aria-hidden /> Cài đặt
          </button>
          <div className="my-1 border-t border-border/60" />
          <button
            type="button"
            onClick={handleLogout}
            role="menuitem"
            className="w-full flex items-center gap-2 h-9 px-3 rounded-md text-body text-destructive hover:bg-destructive/10 transition-colors duration-fast"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}
```

Note: this assumes `useReaderPrefs` has a `settingsOpen` / `setSettingsOpen` slice. If it doesn't, add it now (small store update) — the existing settings drawer lives inside `ReaderHeader` and is opened via local state. With AppShell, we lift that state to the store so any component can open it.

Add to `apps/frontend/src/stores/reader-prefs-store.ts`:

```ts
interface ReaderPrefsState {
  // existing fields...
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
}
// in create():
settingsOpen: false,
setSettingsOpen: (v) => set({ settingsOpen: v }),
```

- [ ] **Step 3: Verify desktop top nav**

At ≥1024px width, the new top nav appears with 3 nav links + search icon + avatar. Active item underline gradient pink. Click "Đọc" → navigates to /.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/layout/DesktopTopNav.tsx apps/frontend/src/components/reader/AvatarMenu.tsx apps/frontend/src/stores/reader-prefs-store.ts
git commit -m "feat(layout): DesktopTopNav + extracted AvatarMenu + lifted settings drawer state"
```

---

### Task 7: ContinueReadingBar shell (placeholder, Plan C wires data)

**Files:**
- Create: `apps/frontend/src/components/layout/ContinueReadingBar.tsx`

- [ ] **Step 1: Write the component shell**

```tsx
// apps/frontend/src/components/layout/ContinueReadingBar.tsx
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Plan A: visible shell with placeholder. Plan C will replace the
 * placeholder data with `GET /me/continue-reading` query.
 *
 * Renders only when user is authenticated. Hidden by AppShell when on
 * chapter reader route.
 */
export function ContinueReadingBar() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  // Plan C: replace with useQuery(['me','continue-reading']). For now
  // return null so we don't render fake data in front of users. The
  // visual shell is committed; activation happens in Plan C.
  return null;

  /* eslint-disable @typescript-eslint/no-unreachable -- shell preserved for Plan C */
  return (
    <Link
      to="/"
      className="sticky top-14 z-20 block bg-accent-gradient-soft border-b border-accent/20 hover:bg-accent/12 transition-colors duration-fast"
    >
      <div className="container flex items-center h-10 sm:h-12 gap-3">
        <div
          aria-hidden
          className="h-7 w-5 sm:h-9 sm:w-7 bg-accent-gradient rounded-sm flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] sm:text-label text-fg-muted truncate">
            ĐỌC TIẾP · CHƯƠNG 47 / 671
          </p>
          <p className="text-body-sm sm:text-body font-semibold truncate">
            Xuyên Thư Chi Bá Ái Độc Thê
          </p>
        </div>
        <span className="hidden sm:inline-flex items-center h-7 px-3 rounded-md bg-fg text-bg text-body-sm font-semibold">
          Tiếp tục →
        </span>
        <ChevronRight className="sm:hidden h-5 w-5 text-accent" aria-hidden />
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Verify import in AppShell works (no console errors)**

Reload `http://localhost:3000`. Bar should not render (component returns null until Plan C). No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/layout/ContinueReadingBar.tsx
git commit -m "feat(layout): ContinueReadingBar shell (Plan C wires data)"
```

---

### Task 8: ReaderHeader refresh — strip inline nav, keep avatar + drawer

**Files:**
- Modify: `apps/frontend/src/components/reader/ReaderHeader.tsx`

- [ ] **Step 1: Read current file**

```powershell
Get-Content apps\frontend\src\components\reader\ReaderHeader.tsx | Measure-Object -Line
```

- [ ] **Step 2: Replace with mini-header (mobile-only, used by AppShell)**

```tsx
// apps/frontend/src/components/reader/ReaderHeader.tsx
import { Link } from '@tanstack/react-router';
import { Search as SearchIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { AvatarMenu } from './AvatarMenu';
import { ReaderSettingsDrawer } from './ReaderSettingsDrawer';

/**
 * Mobile-only mini header (rendered <lg by AppShell).
 * Desktop uses DesktopTopNav instead.
 */
export function ReaderHeader() {
  const user = useAuthStore((s) => s.user);
  return (
    <>
      <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md border-b border-border/60">
        <div className="container flex items-center justify-between h-12 gap-2">
          <Link to="/" className="font-sans font-extrabold text-heading-lg tracking-tight">
            SManga
          </Link>
          <div className="flex items-center gap-1">
            <Link
              to="/kham-pha"
              search={{ q: '', page: 1 }}
              aria-label="Tìm kiếm"
              className="inline-flex items-center justify-center h-9 w-9 rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-fast"
            >
              <SearchIcon className="h-4 w-4" />
            </Link>
            {user ? <AvatarMenu user={user} /> : (
              <Link
                to="/dang-nhap"
                search={{ redirect: '/' }}
                className="inline-flex items-center h-9 px-3 rounded-md text-body-sm font-semibold bg-fg text-bg hover:opacity-90 transition-opacity duration-fast"
              >
                Đăng nhập
              </Link>
            )}
          </div>
        </div>
      </header>
      <ReaderSettingsDrawer />
    </>
  );
}
```

- [ ] **Step 3: Extract ReaderSettingsDrawer (move existing drawer code out of old ReaderHeader)**

Create `apps/frontend/src/components/reader/ReaderSettingsDrawer.tsx` and move the entire `<aside role="dialog">…</aside>` block + backdrop + Esc handler from the old ReaderHeader. Read `settingsOpen` + `setSettingsOpen` from the reader-prefs store (added in Task 6).

```tsx
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { ReaderSettings } from './ReaderSettings';
import { useReaderPrefs } from '@/stores/reader-prefs-store';

export function ReaderSettingsDrawer() {
  const open = useReaderPrefs((s) => s.settingsOpen);
  const setOpen = useReaderPrefs((s) => s.setSettingsOpen);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  return (
    <>
      {open && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Đóng cài đặt"
          className="fixed inset-0 z-40 bg-fg/40 backdrop-blur-sm"
        />
      )}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Cài đặt đọc"
        aria-hidden={!open}
        className={`fixed top-0 right-0 bottom-0 z-50 w-80 sm:w-96 bg-bg-elevated border-l border-border shadow-elev flex flex-col transform transition-transform duration-base ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-14 sm:h-16 px-4 sm:px-5 flex items-center justify-between border-b border-border/60 shrink-0">
          <h2 className="font-sans font-semibold text-heading-md">Cài đặt đọc</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Đóng cài đặt"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-bg-subtle transition-colors duration-fast"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <ReaderSettings />
        </div>
      </aside>
    </>
  );
}
```

Also add `<ReaderSettingsDrawer />` to `DesktopTopNav.tsx` (so the drawer renders on desktop too when triggered):

```tsx
// at top of DesktopTopNav.tsx
import { ReaderSettingsDrawer } from '@/components/reader/ReaderSettingsDrawer';
// in JSX, wrap return in fragment:
return (
  <>
    <header className="...">...</header>
    <ReaderSettingsDrawer />
  </>
);
```

- [ ] **Step 4: Verify mobile mini-header + drawer toggle**

Resize to mobile width. Header is h-12, no inline nav. Avatar dropdown → Cài đặt opens drawer from right. Drawer Esc closes. Same on desktop.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/reader/ReaderHeader.tsx apps/frontend/src/components/reader/ReaderSettingsDrawer.tsx apps/frontend/src/components/layout/DesktopTopNav.tsx
git commit -m "refactor(reader): split ReaderHeader into mini mobile header + ReaderSettingsDrawer"
```

---

## Phase A3 — Page Refactors

### Task 9: Home (/) — Đọc tab

**Files:**
- Modify: `apps/frontend/src/routes/index.tsx`

- [ ] **Step 1: Read current home route**

```powershell
Get-Content apps\frontend\src\routes\index.tsx
```

Identify queries used (`listStories`, etc.) and existing structure.

- [ ] **Step 2: Refactor with logged-in vs anon variants**

Replace the page component:

```tsx
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { listStories } from '@/api/stories';
import { useAuthStore } from '@/stores/auth-store';

export const Route = createFileRoute('/')({ component: HomePage });

function HomePage() {
  const user = useAuthStore((s) => s.user);
  const storiesQ = useQuery({
    queryKey: ['stories', { page: 1, limit: 12 }],
    queryFn: () => listStories(1, 12),
  });

  return (
    <div className="container py-8 lg:py-12 space-y-12 lg:space-y-16">
      {user ? <LoggedInHero /> : <AnonHero />}
      <UpdatedSection stories={storiesQ.data ?? []} isLoading={storiesQ.isLoading} />
      <GenreSection />
    </div>
  );
}

function AnonHero() {
  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-bg-elevated p-8 lg:p-16">
      <div aria-hidden className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-accent/20 blur-3xl" />
      <p className="text-label text-fg-muted uppercase mb-3">TẠP CHÍ TRUYỆN CHỮ VIỆT</p>
      <h1 className="text-display-sm sm:text-display-md lg:text-display-lg">
        Đọc truyện chữ.<br />
        <span className="bg-accent-gradient bg-clip-text text-transparent">Như nó nên là.</span>
      </h1>
      <p className="mt-6 max-w-xl text-body lg:text-base text-fg-muted">
        Tuyển chọn tiểu thuyết tiếng Việt với trải nghiệm đọc tối giản — không quảng cáo chen ngang, không pop-up.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/kham-pha"
          className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-accent-gradient text-white text-body font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Khám phá truyện <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <Link
          to="/dang-nhap"
          search={{ redirect: '/tu-sach' }}
          className="inline-flex items-center h-11 px-5 rounded-md border border-border-strong hover:bg-bg-subtle text-body font-semibold transition-colors duration-fast"
        >
          Đăng nhập
        </Link>
      </div>
    </section>
  );
}

function LoggedInHero() {
  // Plan C: query /me/continue-reading and render real card. For now,
  // fall back to AnonHero so users still see a hero.
  return <AnonHero />;
}

function UpdatedSection({ stories, isLoading }: { stories: ReturnType<typeof useQuery>['data'] extends infer T ? (T extends Array<infer U> ? U[] : never) : never[]; isLoading: boolean }) {
  return (
    <section>
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-label text-fg-muted uppercase mb-2">THƯ VIỆN</p>
          <h2 className="text-heading-lg">Mới cập nhật</h2>
        </div>
        <Link to="/kham-pha" className="text-body-sm text-fg-muted hover:text-fg transition-colors duration-fast">
          Xem tất cả →
        </Link>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-md bg-bg-subtle animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {stories?.map((s: any) => <StoryCard key={s.id} story={s} />)}
        </div>
      )}
    </section>
  );
}

function StoryCard({ story }: { story: any }) {
  return (
    <Link
      to="/truyen/$slug"
      params={{ slug: story.slug }}
      search={{ page: 1 }}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-bg-subtle">
        {story.hasCover && (
          <img
            src={`/api/v1/cover/${story.id}`}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-base group-hover:scale-105"
          />
        )}
      </div>
      <h3 className="mt-3 text-heading-md line-clamp-2">{story.title}</h3>
      <p className="mt-1 text-body-sm text-fg-muted truncate">{story.author ?? 'Khuyết danh'}</p>
    </Link>
  );
}

function GenreSection() {
  const genres = ['Đam mỹ', 'Xuyên không', 'Tiên hiệp', 'Kiếm hiệp', 'Ngôn tình', 'Huyền huyễn', 'Trọng sinh', 'Sủng'];
  return (
    <section>
      <div className="mb-6">
        <p className="text-label text-fg-muted uppercase mb-2">KHÁM PHÁ</p>
        <h2 className="text-heading-lg">Theo thể loại</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {genres.map((g) => (
          <Link
            key={g}
            to="/kham-pha"
            search={{ genre: g }}
            className="inline-flex items-center h-9 px-4 rounded-pill border border-border hover:border-border-strong hover:bg-bg-subtle text-body-sm transition-colors duration-fast"
          >
            {g}
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verify**

Reload `/`. Hero renders with gradient orb, "Đọc truyện chữ. Như nó nên là." display heading with gradient on second line. Mới cập nhật grid shows stories. Genre chips wrap. Mobile: 2-col grid.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/routes/index.tsx
git commit -m "feat(home): redesigned Đọc tab — hero + Mới cập nhật + genres"
```

---

### Task 10: Story detail — `/truyen/$slug`

**Files:**
- Modify: `apps/frontend/src/routes/truyen/$slug/index.tsx`

- [ ] **Step 1: Read current story detail route**

```powershell
Get-Content apps\frontend\src\routes\truyen\$slug\index.tsx | Select-Object -First 60
```

- [ ] **Step 2: Update hero + CTAs section**

Replace the hero block (top of the page, before ChapterList):

```tsx
{/* Hero */}
<section className="relative overflow-hidden border-b border-border">
  {s.hasCover && (
    <div aria-hidden className="absolute inset-0 -z-10">
      <img
        src={`/api/v1/cover/${s.id}`}
        alt=""
        className="w-full h-full object-cover blur-3xl scale-110 opacity-30"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/60 via-bg/90 to-bg" />
    </div>
  )}
  <div className="container py-10 lg:py-16 grid lg:grid-cols-[240px_1fr] gap-8 items-start">
    {/* Cover */}
    <div className="relative aspect-[3/4] w-full max-w-[240px] rounded-lg overflow-hidden border border-border-strong shadow-elev">
      {s.hasCover ? (
        <img src={`/api/v1/cover/${s.id}`} alt={`Bìa ${s.title}`} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-accent-gradient" />
      )}
    </div>
    {/* Info */}
    <div>
      <p className="text-label text-fg-muted uppercase mb-3">TRUYỆN NỔI BẬT</p>
      <h1 className="text-display-sm lg:text-display-md font-prose font-semibold tracking-tight">{s.title}</h1>
      <p className="mt-3 text-body text-fg-muted">
        {s.author ?? 'Khuyết danh'} · {s.totalChapters} chương · {STATUS_LABEL[s.status] ?? s.status}
      </p>
      {s.genres && s.genres.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {s.genres.map((g) => (
            <span key={g.slug} className="inline-flex items-center h-7 px-3 rounded-pill text-body-sm bg-bg-subtle border border-border">
              {g.name}
            </span>
          ))}
        </div>
      )}
      <p className="mt-6 text-body text-fg-muted line-clamp-4">{s.description}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/truyen/$slug/chuong/$index"
          params={{ slug: s.slug, index: '1' }}
          className="inline-flex items-center gap-2 h-11 px-5 rounded-md border border-border-strong hover:bg-bg-subtle text-body font-semibold transition-colors duration-fast"
        >
          Đọc từ đầu
        </Link>
        {/* "Đọc tiếp Chương N" pink CTA — wired by Plan C when reading_progress exists */}
      </div>
    </div>
  </div>
</section>
```

Keep the existing ChapterList component invocation below the hero (already retokens via global classes).

- [ ] **Step 3: Verify**

Open `/truyen/<any-slug>`. Hero shows cover left (or gradient if no cover) + info right. Genre pills wrap. CTAs visible.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/routes/truyen/$slug/index.tsx
git commit -m "feat(story-detail): redesigned hero with cover + info + tokens"
```

---

### Task 11: Chapter reader — `/truyen/$slug/chuong/$index` (centerpiece)

**Files:**
- Modify: `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx`

- [ ] **Step 1: Read current chapter reader**

```powershell
Get-Content apps\frontend\src\routes\truyen\$slug\chuong\$index.tsx | Select-Object -First 80
```

- [ ] **Step 2: Add auto-hide chrome + floating nav pill + top progress bar**

Replace the page body return statement:

```tsx
import { useEffect, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, List, Settings as SettingsIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useReaderPrefs } from '@/stores/reader-prefs-store';
import { getChapterContent } from '@/api/chapters';

export const Route = createFileRoute('/truyen/$slug/chuong/$index')({ component: ChapterReader });

function ChapterReader() {
  const { slug, index } = Route.useParams();
  const navigate = useNavigate();
  const setSettingsOpen = useReaderPrefs((s) => s.setSettingsOpen);
  const fontSize = useReaderPrefs((s) => s.fontSize);
  const fontFamily = useReaderPrefs((s) => s.fontFamily);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(0);

  const dataQ = useQuery({
    queryKey: ['chapter', slug, index],
    queryFn: () => getChapterContent(slug, index),
  });

  // Auto-hide chrome on scroll down, show on scroll up
  useEffect(() => {
    let lastY = window.scrollY;
    let hideTimer: ReturnType<typeof setTimeout>;
    function onScroll() {
      const y = window.scrollY;
      const goingDown = y > lastY;
      lastY = y;
      // Progress bar
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      setScrollProgress(max > 0 ? Math.min(100, (y / max) * 100) : 0);
      // Chrome
      if (goingDown && y > 200) {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setChromeVisible(false), 600);
      } else if (!goingDown) {
        setChromeVisible(true);
      }
    }
    function onInteract() {
      setChromeVisible(true);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('mousemove', onInteract);
    window.addEventListener('touchstart', onInteract);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('mousemove', onInteract);
      window.removeEventListener('touchstart', onInteract);
      clearTimeout(hideTimer);
    };
  }, []);

  const reduceMotion = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (dataQ.isLoading) {
    return <div className="container py-20 text-center text-fg-muted">Đang tải...</div>;
  }
  if (!dataQ.data) {
    return <div className="container py-20 text-center text-destructive">Không tìm thấy chương.</div>;
  }

  const { chapter, story, prev, next } = dataQ.data;
  const fontSizeClass = {
    '15': 'text-[15px] leading-[1.7]',
    '18': 'text-[17px] sm:text-[18px] leading-[1.75]',
    '20': 'text-[18px] sm:text-[20px] leading-[1.75]',
    '24': 'text-[20px] sm:text-[24px] leading-[1.7]',
  }[fontSize] ?? 'text-[18px] leading-[1.75]';

  const fontFamilyClass = fontFamily === 'sans' ? 'font-sans'
    : fontFamily === 'mono' ? 'font-mono'
    : 'font-prose';

  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* Scroll progress bar */}
      <div aria-hidden className="fixed top-0 left-0 right-0 h-0.5 bg-bg-subtle z-50">
        <div
          className="h-full bg-accent-gradient shadow-glow-pink-soft"
          style={{ width: `${scrollProgress}%`, transition: reduceMotion ? 'none' : 'width 100ms linear' }}
        />
      </div>

      {/* Top chrome (auto-hide) */}
      <header
        className={`fixed top-0 left-0 right-0 z-40 bg-bg/70 backdrop-blur-md border-b border-border transition-transform duration-base ${
          chromeVisible || reduceMotion ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="container flex items-center justify-between h-12 sm:h-14 gap-3">
          <button
            type="button"
            onClick={() => navigate({ to: '/truyen/$slug', params: { slug }, search: { page: 1 } })}
            aria-label="Quay lại trang truyện"
            className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-bg-subtle transition-colors duration-fast"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-fg-subtle uppercase tracking-wider truncate">CHƯƠNG {chapter.index} / {story.totalChapters}</p>
            <p className="text-body-sm text-fg-muted truncate">{story.title}</p>
          </div>
          <div className="flex gap-1">
            <Link
              to="/truyen/$slug"
              params={{ slug }}
              search={{ page: Math.max(1, Math.ceil(chapter.index / 50)) }}
              aria-label="Mục lục chương"
              className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-bg-subtle transition-colors duration-fast"
            >
              <List className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Cài đặt đọc"
              className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-bg-subtle transition-colors duration-fast"
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Prose */}
      <article className="container max-w-[65ch] py-14 sm:py-20 lg:py-24">
        <h1 className="font-prose font-semibold text-display-sm lg:text-display-md mb-2">{chapter.title}</h1>
        <p className="text-label text-fg-subtle mb-9">
          CHƯƠNG {chapter.index} · {Math.max(1, Math.ceil((chapter.content?.length ?? 0) / 1250))} PHÚT ĐỌC
        </p>
        <div className={`${fontFamilyClass} ${fontSizeClass} text-fg/95 [&_p]:mb-5`}>
          {/* Plan C: drop-cap on first paragraph. For now, render as-is */}
          {chapter.content?.split('\n\n').map((para, i) => (
            <p key={i}>{para}</p>
          )) ?? <p className="text-destructive">Chưa có nội dung.</p>}
        </div>
      </article>

      {/* Floating prev/next pill */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex gap-2 bg-bg/80 backdrop-blur-md p-1.5 rounded-pill border border-border">
        {prev ? (
          <Link
            to="/truyen/$slug/chuong/$index"
            params={{ slug, index: String(prev.index) }}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-pill bg-bg-subtle text-body-sm text-fg-muted hover:text-fg transition-colors duration-fast"
          >
            ← Ch.{prev.index}
          </Link>
        ) : (
          <span className="inline-flex items-center h-9 px-4 rounded-pill text-body-sm text-fg-subtle opacity-50">← Ch.{Number(chapter.index) - 1}</span>
        )}
        {next ? (
          <Link
            to="/truyen/$slug/chuong/$index"
            params={{ slug, index: String(next.index) }}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-pill bg-accent-gradient text-white text-body-sm font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-base"
          >
            Ch.{next.index} →
          </Link>
        ) : (
          <span className="inline-flex items-center h-9 px-4 rounded-pill text-body-sm text-fg-subtle opacity-50">Hết</span>
        )}
      </div>
    </div>
  );
}
```

Keep any existing `getChapterContent` API call signature; if it returns a different shape, adapt the destructure.

- [ ] **Step 3: Verify chapter reader interactions**

Open any crawled chapter URL. Verify:
- Top progress bar fills as you scroll
- Top chrome fades out 600ms after scroll down stops; reappears on scroll up / mouse move / tap
- Floating pill at bottom always visible with Ch.N-1 outline + Ch.N+1 pink with glow
- Click Cài đặt icon → reader settings drawer opens
- Click List icon → navigates back to story's chapter list at correct page
- Mobile: same behavior, chrome respects safe-area

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx
git commit -m "feat(chapter-reader): auto-hide chrome + floating nav pill + scroll progress"
```

---

### Task 12: Tủ sách — `/tu-sach`

**Files:**
- Modify: `apps/frontend/src/routes/tu-sach.tsx`

- [ ] **Step 1: Read current route**

```powershell
Get-Content apps\frontend\src\routes\tu-sach.tsx | Select-Object -First 80
```

Note: Plan 5 (Search + user features) wasn't fully executed — `tu-sach.tsx` may be a stub with empty sections. Check what exists.

- [ ] **Step 2: Add tabbed shelf with library card grid**

Replace the page component:

```tsx
import { useState } from 'react';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { BookmarkX, Clock, CheckCircle2 } from 'lucide-react';
import { me } from '@/api/auth';
import { useAuthStore } from '@/stores/auth-store';

export const Route = createFileRoute('/tu-sach')({
  beforeLoad: async () => {
    const u = await me();
    if (!u) throw redirect({ to: '/dang-nhap', search: { redirect: '/tu-sach' } });
    useAuthStore.getState().setUser(u);
  },
  component: LibraryPage,
});

type ShelfTab = 'reading' | 'saved' | 'completed';

function LibraryPage() {
  const [tab, setTab] = useState<ShelfTab>('reading');

  // Plan C: replace with real queries. For now empty arrays so UI shells render.
  const items: any[] = [];
  const counts = { reading: 0, saved: 0, completed: 0 };

  return (
    <div className="container py-8 lg:py-12 space-y-8">
      <header>
        <p className="text-label text-fg-muted uppercase mb-2">CỦA BẠN</p>
        <h1 className="text-display-sm lg:text-display-md">Tủ sách</h1>
        <p className="mt-2 text-body text-fg-muted">Theo dõi truyện đang đọc và những truyện bạn đã đánh dấu để xem sau.</p>
      </header>

      {/* Plan C: ReadingStatsCard slot here */}

      <div className="flex gap-1 border-b border-border">
        <TabButton active={tab === 'reading'} onClick={() => setTab('reading')}>
          Đang đọc <span className="ml-1 text-fg-subtle">({counts.reading})</span>
        </TabButton>
        <TabButton active={tab === 'saved'} onClick={() => setTab('saved')}>
          Đã lưu <span className="ml-1 text-fg-subtle">({counts.saved})</span>
        </TabButton>
        <TabButton active={tab === 'completed'} onClick={() => setTab('completed')}>
          Đã hoàn thành <span className="ml-1 text-fg-subtle">({counts.completed})</span>
        </TabButton>
      </div>

      {items.length === 0 ? (
        <EmptyShelf tab={tab} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((it) => <LibraryCard key={it.id} item={it} />)}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`relative px-4 py-3 text-body font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded ${
        active ? 'text-fg' : 'text-fg-muted hover:text-fg'
      }`}
    >
      {children}
      {active && <span aria-hidden className="absolute -bottom-px left-2 right-2 h-0.5 bg-accent-gradient rounded-full" />}
    </button>
  );
}

function LibraryCard({ item }: { item: any }) {
  return (
    <Link
      to="/truyen/$slug"
      params={{ slug: item.slug }}
      search={{ page: 1 }}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-bg-subtle">
        {item.hasCover && (
          <img
            src={`/api/v1/cover/${item.storyId}`}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {item.progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-bg/40">
            <div className="h-full bg-accent-gradient" style={{ width: `${item.progress}%` }} />
          </div>
        )}
      </div>
      <h3 className="mt-3 text-heading-md line-clamp-2">{item.title}</h3>
      <p className="mt-1 text-body-sm text-fg-muted truncate">{item.author ?? 'Khuyết danh'}</p>
    </Link>
  );
}

function EmptyShelf({ tab }: { tab: ShelfTab }) {
  // Plan C: replace with <EmptyState /> primitive + illustration
  const config = {
    reading: { icon: Clock, title: 'Chưa có truyện đang đọc', desc: 'Mở 1 chương bất kỳ và đọc 5 giây — chúng tôi sẽ tự ghi nhớ.' },
    saved: { icon: BookmarkX, title: 'Tủ sách còn trống', desc: 'Đánh dấu truyện anh thích để dễ tìm lại. Bắt đầu khám phá nào.' },
    completed: { icon: CheckCircle2, title: 'Chưa truyện nào hoàn tất', desc: 'Đọc đến chương cuối là tự động xuất hiện ở đây.' },
  }[tab];
  const Icon = config.icon;
  return (
    <div className="flex flex-col items-center text-center py-16 px-4">
      <div className="h-16 w-16 rounded-full bg-bg-subtle flex items-center justify-center mb-4">
        <Icon className="h-8 w-8 text-fg-subtle" aria-hidden />
      </div>
      <h3 className="text-heading-md">{config.title}</h3>
      <p className="mt-2 max-w-sm text-body-sm text-fg-muted">{config.desc}</p>
      <Link
        to="/kham-pha"
        className="mt-6 inline-flex items-center gap-2 h-10 px-4 rounded-md bg-accent-gradient text-white text-body-sm font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-base"
      >
        Khám phá truyện →
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Open `/tu-sach` (must be logged in; if not, you'll be redirected to login). Three tabs render. Empty state shows per tab. CTA "Khám phá truyện" links to `/kham-pha`.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/routes/tu-sach.tsx
git commit -m "feat(library): redesigned Tủ sách with 3 tabs + empty states + LibraryCard"
```

---

### Task 13: Khám phá — new `/kham-pha` route

**Files:**
- Create: `apps/frontend/src/routes/kham-pha.tsx`

- [ ] **Step 1: Write the route**

```tsx
import { useState, type FormEvent } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { listStories } from '@/api/stories';
import { api } from '@/lib/api-client';

export const Route = createFileRoute('/kham-pha')({
  component: DiscoverPage,
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : '',
    page: typeof search.page === 'number' ? search.page : 1,
    genre: typeof search.genre === 'string' ? search.genre : undefined,
  }),
});

function DiscoverPage() {
  const { q, genre } = Route.useSearch();
  const navigate = useNavigate();
  const [input, setInput] = useState(q);

  const storiesQ = useQuery({
    queryKey: ['stories', { q, genre, page: 1, limit: 24 }],
    queryFn: () => listStories(1, 24),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    void navigate({ search: { q: input.trim(), page: 1, genre } });
  }

  const genres = ['Đam mỹ', 'Xuyên không', 'Tiên hiệp', 'Kiếm hiệp', 'Ngôn tình', 'Huyền huyễn', 'Trọng sinh', 'Sủng'];

  return (
    <div className="container py-8 lg:py-12 space-y-8">
      <header>
        <p className="text-label text-fg-muted uppercase mb-2">DUYỆT</p>
        <h1 className="text-display-sm lg:text-display-md">Khám phá truyện</h1>
      </header>

      <form onSubmit={submit} role="search" className="relative max-w-2xl">
        <Search aria-hidden className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle pointer-events-none" />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tìm truyện, tác giả..."
          className="w-full h-12 pl-11 pr-24 rounded-pill bg-bg-elevated border border-border focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none text-body transition-colors duration-fast"
        />
        <button
          type="submit"
          className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center h-10 px-5 rounded-pill bg-accent-gradient text-white text-body-sm font-semibold shadow-glow-pink-soft"
        >
          Tìm
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Link
          to="/kham-pha"
          search={{ q, page: 1 }}
          className={`inline-flex items-center h-8 px-3 rounded-pill text-body-sm transition-colors duration-fast ${
            !genre ? 'bg-fg text-bg' : 'border border-border hover:bg-bg-subtle'
          }`}
        >
          Tất cả
        </Link>
        {genres.map((g) => (
          <Link
            key={g}
            to="/kham-pha"
            search={{ q, page: 1, genre: g }}
            className={`inline-flex items-center h-8 px-3 rounded-pill text-body-sm transition-colors duration-fast ${
              genre === g ? 'bg-fg text-bg' : 'border border-border hover:bg-bg-subtle'
            }`}
          >
            {g}
          </Link>
        ))}
      </div>

      {storiesQ.isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-md bg-bg-subtle animate-pulse" />
          ))}
        </div>
      ) : storiesQ.data && storiesQ.data.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {storiesQ.data.map((s: any) => (
            <Link
              key={s.id}
              to="/truyen/$slug"
              params={{ slug: s.slug }}
              search={{ page: 1 }}
              className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
            >
              <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-bg-subtle">
                {s.hasCover && (
                  <img src={`/api/v1/cover/${s.id}`} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-base group-hover:scale-105" />
                )}
              </div>
              <h3 className="mt-3 text-heading-md line-clamp-2">{s.title}</h3>
              <p className="mt-1 text-body-sm text-fg-muted truncate">{s.author ?? 'Khuyết danh'}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center text-center py-16">
          <h3 className="text-heading-md">Không tìm thấy truyện</h3>
          <p className="mt-2 text-body-sm text-fg-muted">Thử từ khoá khác hoặc xem mới cập nhật.</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Open `/kham-pha`. Search input renders + genre chips + grid of stories. Click a genre → URL updates with `?genre=`. Submit search → URL gets `?q=`.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/routes/kham-pha.tsx
git commit -m "feat(discover): new /kham-pha route — search + genre filter + grid"
```

---

### Task 14: Bạn — new `/ban` route (redirect-only)

**Files:**
- Create: `apps/frontend/src/routes/ban.tsx`

- [ ] **Step 1: Write the redirect route**

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { me } from '@/api/auth';

export const Route = createFileRoute('/ban')({
  beforeLoad: async () => {
    const u = await me();
    if (u) throw redirect({ to: '/tai-khoan' });
    throw redirect({ to: '/dang-nhap', search: { redirect: '/tai-khoan' } });
  },
});
```

- [ ] **Step 2: Verify**

Click "Bạn" tab in bottom tab bar → routes to `/tai-khoan` if logged in, else `/dang-nhap`.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/routes/ban.tsx
git commit -m "feat(ban): /ban tab route — redirect to /tai-khoan or /dang-nhap"
```

---

### Task 15: `/tim-kiem` redirect to `/kham-pha`

**Files:**
- Modify: `apps/frontend/src/routes/tim-kiem.tsx`

- [ ] **Step 1: Replace with redirect**

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/tim-kiem')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : '',
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/kham-pha', search: { q: search.q ?? '', page: 1 } });
  },
});
```

- [ ] **Step 2: Verify**

Open `/tim-kiem?q=test` directly. Should 302 to `/kham-pha?q=test&page=1`.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/routes/tim-kiem.tsx
git commit -m "refactor(tim-kiem): redirect to /kham-pha preserving query"
```

---

## Final verification + handoff

- [ ] **Step 1: Type-check the workspace**

```powershell
pnpm -r typecheck
```

Expected: all packages pass.

- [ ] **Step 2: Visual smoke test (manual)**

Open `http://localhost:3000` and walk through:
1. Home (`/`) — hero + Mới cập nhật + genres
2. Khám phá (`/kham-pha`) — search + chips + grid
3. Story detail (`/truyen/<slug>`) — cover hero + info + chapter list
4. Chapter reader (`/truyen/<slug>/chuong/1`) — auto-hide chrome + floating pill + scroll progress
5. Tủ sách (`/tu-sach`) — 3 tabs + empty state + CTA
6. Bạn tab → redirects to `/tai-khoan` (still using old chrome — Plan B retokens this)

Resize to mobile (<768px) and re-verify each. Bottom tab bar appears + works.

Toggle light theme via avatar dropdown → Cài đặt → confirm tokens swap correctly everywhere.

- [ ] **Step 3: Confirm local commit log**

```powershell
git log --oneline -20
```

Expect ~15 commits from this plan. **None pushed.**

- [ ] **Step 4: Stop. Tell the user the plan is complete locally.**

Do not `git push`. Report:
> "Plan A complete — N commits ready locally. Ready when you want to push, or move on to Plan B."

---

## Out of scope (for Plan B / Plan C)

- Auth/Account/Admin retoken → Plan B
- ContinueReadingBar data wiring + ReadingStatsCard + drop-cap typography + EmptyState primitive + 4 SVG illustrations → Plan C
- BE endpoints `/me/continue-reading`, `/me/stats` → Plan C
- Session_seconds migration → Plan C (optional)
- Cover-color extraction backdrop → defer
- PWA / offline → defer

---

## Self-review notes

- All 15 tasks have full code blocks (no "implement later" placeholders)
- Type names consistent: `ShelfTab`, `LibraryCard`, `BottomTabBar`, `AppShell`, etc. cross-reference correctly
- File paths exact in every Files block
- Each task ends with a single conventional commit message
- TDD inapplicable for visual refactors (no automated tests added) — replaced with manual visual verification steps before each commit
- "Plan C will wire this" placeholders are explicit and bounded (ContinueReadingBar returns null; LoggedInHero falls back to AnonHero; LibraryPage uses empty array)
