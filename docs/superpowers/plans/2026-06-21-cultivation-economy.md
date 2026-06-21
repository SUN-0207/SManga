# Cultivation & Economy ("Tu luyện") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give logged-in readers a cultivation identity (tu vi → 9 cảnh giới × 9 tầng) that grows by reading, a soft currency (linh thạch) earned from reading + daily check-in + level-ups, a premium wallet (tiên ngọc, paid-only), and an account-page display — server-authoritative, kill-switched, no farming.

**Architecture:** A new `cultivation` NestJS module owns the economy. Reading rewards are credited **synchronously inside the existing `ReadingProgressService.addSession`** (dwell-gated, once-per-chapter, in one DB transaction); daily check-in via an idempotent `POST /me/checkin`; reads via `GET /me/cultivation`. The pure level/curve/reward math lives in `@smanga/shared` (used by both api + frontend). A `gamification_enabled` kill-switch in `app_setting` gates all credits.

**Tech Stack:** NestJS 11, Drizzle + Postgres 17, `@smanga/shared` (pure TS), Vite/React 19 + TanStack Router/Query, vitest, drizzle-kit, `@testcontainers/postgresql` (db package).

## Global Constraints

- Display numbers are the **×100** values verbatim from the spec: `XP_PER_CHAPTER = 1000`, `LINH_THACH_PER_CHAPTER = 500`, `xpPerTang(r) = round(14000 × 1.7^r)`, `TANG_UP_LINH_THACH = 2000`, `BREAKTHROUGH_LINH_THACH = [10000,20000,40000,80000,150000,300000,600000,1200000,2500000]`, `CHECKIN_LINH_THACH = [1000,1500,2000,2500,3000,4000,10000]` (day 1→7), `WELCOME_TIEN_NGOC = 20`, `READ_DWELL_MIN_SECONDS = 30`. **Tiên ngọc is NOT scaled** and has no in-app earn path (welcome grant only).
- Balances are **bigint** (`xp`, `linh_thach`, `tien_ngoc`). Tu vi caps at Độ Kiếp tầng 9 (~21.17M total).
- **Server-authoritative**: never trust client amounts; all credits computed server-side in a transaction. Reward once per `(user, story, chapterIndexInt)` via `chapter_read_award` + a `rewarded_at` marker, gated by ≥30s accumulated dwell. **No daily cap.**
- `gamification_enabled` (app_setting, default **false**) gates every credit. Asia/Ho_Chi_Minh timezone for the check-in "day" (matches the existing `computeStreak`).
- Commit only the files each task lists (explicit `git add`; never `git add -A`); **never** stage `apps/frontend/vite.config.ts`. Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Do NOT push without explicit user instruction.** Trunk-based: commit to `main`.
- English-only identifiers/filenames; Vietnamese only in JSX copy + the domain-term constants (cảnh-giới names). New schema file → add to `drizzle.config.ts` array AND `schema/index.ts` barrel. Generate migrations with `pnpm --filter @smanga/db generate` (never hand-write SQL). Internal cross-schema imports use `.ts`.
- Local dev: API `PORT=3010`; db cmds need `$env:DATABASE_URL="postgres://smanga:smanga_dev@localhost:5432/smanga"`. lefthook runs biome+typecheck on commit; if biome flags a file, `pnpm exec biome check --write <file>` and re-stage. Never `--no-verify`.

**Spec:** `docs/superpowers/specs/2026-06-21-cultivation-economy-design.md`

**Out of scope (future specs):** item shop / spending, user-to-user marketplace ("mua bán"), the tiên-ngọc top-up/payment flow, leaderboards.

---

## Task 1: Pure cultivation math in `@smanga/shared`

**Files:**
- Create: `packages/shared/src/cultivation.ts`
- Create: `packages/shared/tests/cultivation.test.ts`
- Modify: `packages/shared/src/index.ts` (export the module)

**Interfaces — Produces:** `REALMS`, the economy constants above, `xpPerTang(r)`, `levelFromXp(xp): CultivationLevel`, `levelUpRewards(oldXp, newXp): { linhThach: number; breakthroughs: { realm: number; realmName: string }[]; tangUps: number }`, `checkinReward(prevStreak, continued): { newStreak; streakDay; amount }`.

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/tests/cultivation.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  REALMS, xpPerTang, levelFromXp, levelUpRewards, checkinReward,
  XP_PER_CHAPTER, BREAKTHROUGH_LINH_THACH, CHECKIN_LINH_THACH, TANG_UP_LINH_THACH,
} from '../src/cultivation.js';

describe('xpPerTang', () => {
  it('matches the locked curve 14000 × 1.7^r', () => {
    expect(xpPerTang(0)).toBe(14000);
    expect(xpPerTang(1)).toBe(23800);
    expect(xpPerTang(8)).toBe(976606);
  });
});

describe('levelFromXp', () => {
  it('xp 0 = Phàm Nhân (ordinal 0)', () => {
    const l = levelFromXp(0);
    expect(l.realmName).toBe('Phàm Nhân');
    expect(l.ordinal).toBe(0);
    expect(l.xpForNextTang).toBe(14000);
  });
  it('crosses into Luyện Khí tầng 1 at exactly 14000', () => {
    const l = levelFromXp(14000);
    expect(l.realmName).toBe('Luyện Khí');
    expect(l.tang).toBe(1);
    expect(l.ordinal).toBe(1);
    expect(l.xpIntoTang).toBe(0);
  });
  it('partway through Luyện Khí tầng 1', () => {
    const l = levelFromXp(14000 + 5000);
    expect(l.realmName).toBe('Luyện Khí');
    expect(l.tang).toBe(1);
    expect(l.xpIntoTang).toBe(5000);
    expect(l.xpForNextTang).toBe(14000);
  });
  it('Luyện Khí tầng 9 → Trúc Cơ tầng 1 boundary uses the new realm rate', () => {
    const luyenKhiTotal = 9 * 14000; // 126000 reaches Trúc Cơ tầng 1
    const l = levelFromXp(luyenKhiTotal);
    expect(l.realmName).toBe('Trúc Cơ');
    expect(l.tang).toBe(1);
    expect(l.xpForNextTang).toBe(23800);
  });
  it('caps at Độ Kiếp tầng 9', () => {
    const l = levelFromXp(999_999_999);
    expect(l.realmName).toBe('Độ Kiếp');
    expect(l.tang).toBe(9);
    expect(l.ordinal).toBe(81);
    expect(l.isMax).toBe(true);
    expect(l.xpForNextTang).toBe(0);
  });
});

describe('levelUpRewards', () => {
  it('no level change → no reward', () => {
    expect(levelUpRewards(15000, 15500)).toEqual({ linhThach: 0, breakthroughs: [], tangUps: 0 });
  });
  it('a tầng-up (within Luyện Khí) pays TANG_UP_LINH_THACH', () => {
    // 13000 (Phàm Nhân) → 14000 is a breakthrough; use within-realm: 14500 → 28500 crosses tầng1→tầng2
    const r = levelUpRewards(14500, 28500);
    expect(r.tangUps).toBe(1);
    expect(r.breakthroughs).toEqual([]);
    expect(r.linhThach).toBe(TANG_UP_LINH_THACH);
  });
  it('crossing Phàm Nhân → Luyện Khí is a breakthrough into realm 0', () => {
    const r = levelUpRewards(13000, 14000);
    expect(r.breakthroughs).toEqual([{ realm: 0, realmName: 'Luyện Khí' }]);
    expect(r.linhThach).toBe(BREAKTHROUGH_LINH_THACH[0]);
  });
});

describe('checkinReward', () => {
  it('first ever check-in = day 1', () => {
    expect(checkinReward(0, false)).toEqual({ newStreak: 1, streakDay: 1, amount: CHECKIN_LINH_THACH[0] });
  });
  it('continued streak increments and escalates to the day-7 jackpot', () => {
    expect(checkinReward(6, true)).toEqual({ newStreak: 7, streakDay: 7, amount: 10000 });
  });
  it('day 8 loops back to day-1 amount but streak keeps counting', () => {
    expect(checkinReward(7, true)).toEqual({ newStreak: 8, streakDay: 1, amount: CHECKIN_LINH_THACH[0] });
  });
  it('a missed day resets the streak to 1', () => {
    expect(checkinReward(5, false)).toEqual({ newStreak: 1, streakDay: 1, amount: CHECKIN_LINH_THACH[0] });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @smanga/shared test cultivation`
Expected: FAIL — `Cannot find module '../src/cultivation.js'`.

- [ ] **Step 3: Implement `packages/shared/src/cultivation.ts`**

```ts
/** Tu-tiên cultivation curve + economy constants. Pure — shared by api (credit)
 * and frontend (display). Display numbers are the ×100 values (ratios unchanged). */
export const REALMS = [
  'Luyện Khí', 'Trúc Cơ', 'Kết Đan', 'Nguyên Anh', 'Hóa Thần',
  'Luyện Hư', 'Hợp Thể', 'Đại Thừa', 'Độ Kiếp',
] as const;
export const TANG_PER_REALM = 9;
export const MAX_ORDINAL = REALMS.length * TANG_PER_REALM; // 81

export const XP_PER_CHAPTER = 1000;
export const LINH_THACH_PER_CHAPTER = 500;
export const READ_DWELL_MIN_SECONDS = 30;
export const TANG_UP_LINH_THACH = 2000;
export const WELCOME_TIEN_NGOC = 20;
/** Linh thạch per check-in streak day (index 0 = day 1 … index 6 = day 7). */
export const CHECKIN_LINH_THACH = [1000, 1500, 2000, 2500, 3000, 4000, 10000] as const;
/** Linh thạch for đột phá INTO realm r (index 0 = entering Luyện Khí). */
export const BREAKTHROUGH_LINH_THACH = [
  10000, 20000, 40000, 80000, 150000, 300000, 600000, 1200000, 2500000,
] as const;

export function xpPerTang(realm: number): number {
  return Math.round(14000 * 1.7 ** realm);
}

// Cost to advance from ordinal k → k+1 (k = 0..80) = the per-tầng rate of the
// realm being ENTERED, i.e. floor(k / 9). ordinal 0 = Phàm Nhân.
function stepCost(k: number): number {
  return xpPerTang(Math.floor(k / TANG_PER_REALM));
}

// Precompute cumulative xp threshold to REACH each ordinal 0..81.
const THRESHOLDS: number[] = (() => {
  const t = [0];
  for (let k = 0; k < MAX_ORDINAL; k++) t.push(t[k]! + stepCost(k));
  return t;
})();

export interface CultivationLevel {
  realm: number; // 0..8, -1 for Phàm Nhân
  realmName: string;
  tang: number; // 1..9, 0 for Phàm Nhân
  ordinal: number; // 0..81
  xpIntoTang: number;
  xpForNextTang: number; // 0 when maxed
  isMax: boolean;
}

function describe(ordinal: number, xp: number): CultivationLevel {
  if (ordinal <= 0) {
    return {
      realm: -1, realmName: 'Phàm Nhân', tang: 0, ordinal: 0,
      xpIntoTang: xp, xpForNextTang: THRESHOLDS[1]!, isMax: false,
    };
  }
  const realm = Math.floor((ordinal - 1) / TANG_PER_REALM);
  const tang = ((ordinal - 1) % TANG_PER_REALM) + 1;
  const isMax = ordinal >= MAX_ORDINAL;
  return {
    realm, realmName: REALMS[realm]!, tang, ordinal,
    xpIntoTang: xp - THRESHOLDS[ordinal]!,
    xpForNextTang: isMax ? 0 : THRESHOLDS[ordinal + 1]! - THRESHOLDS[ordinal]!,
    isMax,
  };
}

export function levelFromXp(xp: number): CultivationLevel {
  const safe = Math.max(0, Math.floor(xp));
  let ordinal = 0;
  while (ordinal < MAX_ORDINAL && THRESHOLDS[ordinal + 1]! <= safe) ordinal++;
  return describe(ordinal, safe);
}

function ordinalFromXp(xp: number): number {
  return levelFromXp(xp).ordinal;
}
function isRealmEntry(ordinal: number): boolean {
  return ordinal >= 1 && (ordinal - 1) % TANG_PER_REALM === 0;
}

export interface LevelUpRewards {
  linhThach: number;
  breakthroughs: { realm: number; realmName: string }[];
  tangUps: number;
}

export function levelUpRewards(oldXp: number, newXp: number): LevelUpRewards {
  const from = ordinalFromXp(oldXp);
  const to = ordinalFromXp(newXp);
  const out: LevelUpRewards = { linhThach: 0, breakthroughs: [], tangUps: 0 };
  for (let o = from + 1; o <= to; o++) {
    if (isRealmEntry(o)) {
      const realm = Math.floor((o - 1) / TANG_PER_REALM);
      out.linhThach += BREAKTHROUGH_LINH_THACH[realm]!;
      out.breakthroughs.push({ realm, realmName: REALMS[realm]! });
    } else {
      out.linhThach += TANG_UP_LINH_THACH;
      out.tangUps += 1;
    }
  }
  return out;
}

export interface CheckinReward { newStreak: number; streakDay: number; amount: number }

/** `continued` = the user checked in yesterday (VN). Caller guarantees they have
 * not already checked in today. */
export function checkinReward(prevStreak: number, continued: boolean): CheckinReward {
  const newStreak = continued ? prevStreak + 1 : 1;
  const streakDay = ((newStreak - 1) % 7) + 1;
  return { newStreak, streakDay, amount: CHECKIN_LINH_THACH[streakDay - 1]! };
}
```

- [ ] **Step 4: Export from the barrel + run tests**

In `packages/shared/src/index.ts` add `export * from './cultivation.ts';` (follow the existing `.ts` export style in that file — check the surrounding lines and match).
Run: `pnpm --filter @smanga/shared test cultivation` → PASS (all cases). Then `pnpm --filter @smanga/shared typecheck` → clean.

- [ ] **Step 5: Commit**
```powershell
git add packages/shared/src/cultivation.ts packages/shared/tests/cultivation.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): cultivation curve + economy constants (pure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: DB schema + migration (cultivation tables + kill-switch)

**Files:**
- Create: `packages/db/src/schema/cultivation.ts`
- Modify: `packages/db/src/schema/index.ts` (barrel), `packages/db/drizzle.config.ts` (schema array)
- Modify: `packages/db/src/schema/app-setting.ts` (add `gamification_enabled`)
- Create: migration `packages/db/src/migrations/00NN_*.sql` (generated)

**Interfaces — Produces:** tables `user_cultivation`, `chapter_read_award`, `reward_ledger`; `appSetting.gamificationEnabled` (boolean, default false).

- [ ] **Step 1: Write the schema**

Create `packages/db/src/schema/cultivation.ts`:
```ts
import { bigint, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.ts';

export const userCultivation = pgTable('user_cultivation', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  xp: bigint('xp', { mode: 'number' }).notNull().default(0),
  linhThach: bigint('linh_thach', { mode: 'number' }).notNull().default(0),
  tienNgoc: bigint('tien_ngoc', { mode: 'number' }).notNull().default(0),
  checkinStreak: integer('checkin_streak').notNull().default(0),
  lastCheckinDate: text('last_checkin_date'), // 'YYYY-MM-DD' in Asia/Ho_Chi_Minh
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chapterReadAward = pgTable(
  'chapter_read_award',
  {
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    storyId: uuid('story_id').notNull(),
    chapterIndexInt: integer('chapter_index_int').notNull(),
    dwellSeconds: integer('dwell_seconds').notNull().default(0),
    rewardedAt: timestamp('rewarded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.storyId, t.chapterIndexInt] }) }),
);

export const rewardLedger = pgTable(
  'reward_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    source: text('source').notNull(), // 'read' | 'checkin' | 'tang' | 'breakthrough' | 'welcome'
    currency: text('currency').notNull(), // 'tu_vi' | 'linh_thach' | 'tien_ngoc'
    amount: bigint('amount', { mode: 'number' }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userCreatedIdx: index('reward_ledger_user_created_idx').on(t.userId, t.createdAt.desc()) }),
);

export type UserCultivation = typeof userCultivation.$inferSelect;
```

- [ ] **Step 2: Add the kill-switch column**

In `packages/db/src/schema/app-setting.ts`, add after `newChapterNotifyEnabled`:
```ts
  /** Master kill-switch for the cultivation/economy system. Default OFF until launch. */
  gamificationEnabled: boolean('gamification_enabled').notNull().default(false),
```

- [ ] **Step 3: Register the new schema file**

In `packages/db/drizzle.config.ts` append `'./src/schema/cultivation.ts',` to the `schema:` array. In `packages/db/src/schema/index.ts` add `export * from './cultivation.js';` (the barrel uses `.js` — match the existing lines).

- [ ] **Step 4: Generate the migration + verify on PG17**
```powershell
pnpm --filter @smanga/db generate
pnpm --filter @smanga/db test
```
Expected: a new `00NN_*.sql` creating the 3 tables + the `app_setting.gamification_enabled` column, plus journal/snapshot. Open the `.sql` and confirm it only creates the 3 cultivation tables + adds the one `app_setting` column (no other tables touched — if it does, STOP, schema drift). The db testcontainer applies all migrations on `postgres:17-alpine` and passes.

- [ ] **Step 5: Commit**
```powershell
git add packages/db/src/schema/cultivation.ts packages/db/src/schema/index.ts packages/db/src/schema/app-setting.ts packages/db/drizzle.config.ts packages/db/src/migrations
git commit -m "feat(db): cultivation tables + app_setting.gamification_enabled

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `CultivationService` — getOrCreate + read reward (dwell-gated)

**Files:**
- Create: `apps/api/src/modules/cultivation/cultivation.service.ts`
- Create: `apps/api/src/modules/cultivation/cultivation.service.spec.ts`

**Interfaces — Consumes:** `@smanga/shared` (`levelFromXp`, `levelUpRewards`, `XP_PER_CHAPTER`, `LINH_THACH_PER_CHAPTER`, `READ_DWELL_MIN_SECONDS`, `WELCOME_TIEN_NGOC`); `AppSettingsService` (kill-switch). **Produces:**
- `getOrCreate(userId): Promise<UserCultivation>` (creates the row + welcome tiên ngọc + ledger on first touch).
- `creditReadingDwell(userId, storyId, chapterIndexInt, addedSeconds): Promise<void>` — accumulates dwell; on crossing ≥30s for an unrewarded chapter, credits +1000 tu vi/+500 linh thạch + any tầng/đột-phá rewards, writes ledger, returns the breakthroughs (for Task 6's notification). Returns `{ breakthroughs }`.
- `getState(userId)` (read model — Task 5 uses it).

- [ ] **Step 1: Write failing branch tests** (mock the db + AppSettingsService, following `app-settings.crawl-rps.spec.ts` style)

Create `apps/api/src/modules/cultivation/cultivation.service.spec.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { CultivationService } from './cultivation.service';

function svcWith(opts: {
  enabled?: boolean;
  award?: { dwell_seconds: number; rewarded_at: string | null };
  xpRow?: { xp: number; linh_thach: number; tien_ngoc: number };
}) {
  const tx = {
    execute: vi.fn().mockResolvedValue([]),
    // .select().from().where().limit() chains used inside the tx
  };
  const db = {
    transaction: vi.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    execute: vi.fn().mockResolvedValue([]),
  };
  const settings = { getGamificationEnabled: vi.fn().mockResolvedValue(opts.enabled ?? true) };
  return { svc: new CultivationService(db as never, settings as never), db, settings, tx };
}

describe('CultivationService.creditReadingDwell', () => {
  it('no-op when gamification disabled', async () => {
    const { svc, settings, db } = svcWith({ enabled: false });
    await svc.creditReadingDwell('u1', 's1', 3, 40);
    expect(settings.getGamificationEnabled).toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
```
(The full reward-once / dwell-threshold / level-up behavior is covered end-to-end by the controller-e2e in Task 7 against a real DB; the unit test here pins the kill-switch short-circuit, which is the cheap, deterministic guard. Keep the unit test to that — do NOT mock-simulate the SQL transaction internals.)

- [ ] **Step 2: Run → FAIL** (`Cannot find module './cultivation.service'`).
Run: `pnpm --filter @smanga/api test cultivation.service`

- [ ] **Step 3: Implement the service**

Create `apps/api/src/modules/cultivation/cultivation.service.ts`. Use raw SQL via `db.execute` + `db.transaction` (the repo's pattern for multi-step writes; `rowsOf` helper as in `stats.service.ts`). Core `creditReadingDwell`:
```ts
import { DRIZZLE } from '@/modules/db/db.provider';
import { AppSettingsService } from '@/modules/app-settings/app-settings.service';
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@smanga/db';
import {
  LINH_THACH_PER_CHAPTER, READ_DWELL_MIN_SECONDS, WELCOME_TIEN_NGOC, XP_PER_CHAPTER,
  levelFromXp, levelUpRewards,
} from '@smanga/shared';
import { sql } from 'drizzle-orm';

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

@Injectable()
export class CultivationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly settings: AppSettingsService,
  ) {}

  async getOrCreate(userId: string): Promise<{ xp: number; linhThach: number; tienNgoc: number; checkinStreak: number; lastCheckinDate: string | null }> {
    const existing = rowsOf<{ xp: number; linh_thach: number; tien_ngoc: number; checkin_streak: number; last_checkin_date: string | null }>(
      await this.db.execute(sql`SELECT xp, linh_thach, tien_ngoc, checkin_streak, last_checkin_date FROM user_cultivation WHERE user_id = ${userId} LIMIT 1`),
    );
    if (existing[0]) return mapRow(existing[0]);
    // create + welcome grant + ledger, idempotent on the PK
    await this.db.transaction(async (tx) => {
      const ins = rowsOf<{ tien_ngoc: number }>(await tx.execute(sql`
        INSERT INTO user_cultivation (user_id, tien_ngoc) VALUES (${userId}, ${WELCOME_TIEN_NGOC})
        ON CONFLICT (user_id) DO NOTHING RETURNING tien_ngoc`));
      if (ins[0]) {
        await tx.execute(sql`INSERT INTO reward_ledger (user_id, source, currency, amount, balance_after)
          VALUES (${userId}, 'welcome', 'tien_ngoc', ${WELCOME_TIEN_NGOC}, ${WELCOME_TIEN_NGOC})`);
      }
    });
    const row = rowsOf<{ xp: number; linh_thach: number; tien_ngoc: number; checkin_streak: number; last_checkin_date: string | null }>(
      await this.db.execute(sql`SELECT xp, linh_thach, tien_ngoc, checkin_streak, last_checkin_date FROM user_cultivation WHERE user_id = ${userId} LIMIT 1`),
    );
    return mapRow(row[0]!);
  }

  async creditReadingDwell(
    userId: string, storyId: string, chapterIndexInt: number, addedSeconds: number,
  ): Promise<{ breakthroughs: { realm: number; realmName: string }[] }> {
    if (!(await this.settings.getGamificationEnabled())) return { breakthroughs: [] };
    await this.getOrCreate(userId);
    return this.db.transaction(async (tx) => {
      // accumulate dwell; lock the award row
      const award = rowsOf<{ dwell_seconds: number; rewarded_at: string | null }>(await tx.execute(sql`
        INSERT INTO chapter_read_award (user_id, story_id, chapter_index_int, dwell_seconds)
        VALUES (${userId}, ${storyId}, ${chapterIndexInt}, ${addedSeconds})
        ON CONFLICT (user_id, story_id, chapter_index_int)
        DO UPDATE SET dwell_seconds = chapter_read_award.dwell_seconds + ${addedSeconds}
        RETURNING dwell_seconds, rewarded_at`));
      const row = award[0]!;
      if (row.rewarded_at || row.dwell_seconds < READ_DWELL_MIN_SECONDS) return { breakthroughs: [] };

      // mark rewarded (re-check to stay idempotent under concurrency)
      const marked = rowsOf<{ user_id: string }>(await tx.execute(sql`
        UPDATE chapter_read_award SET rewarded_at = now()
        WHERE user_id = ${userId} AND story_id = ${storyId} AND chapter_index_int = ${chapterIndexInt}
          AND rewarded_at IS NULL
        RETURNING user_id`));
      if (marked.length === 0) return { breakthroughs: [] };

      const cur = rowsOf<{ xp: number; linh_thach: number }>(await tx.execute(sql`
        SELECT xp, linh_thach FROM user_cultivation WHERE user_id = ${userId} FOR UPDATE`))[0]!;
      const oldXp = Number(cur.xp);
      const newXp = oldXp + XP_PER_CHAPTER;
      const lv = levelUpRewards(oldXp, newXp);
      const linhDelta = LINH_THACH_PER_CHAPTER + lv.linhThach;
      const newLinh = Number(cur.linh_thach) + linhDelta;
      await tx.execute(sql`
        UPDATE user_cultivation SET xp = ${newXp}, linh_thach = ${newLinh}, updated_at = now()
        WHERE user_id = ${userId}`);
      await tx.execute(sql`INSERT INTO reward_ledger (user_id, source, currency, amount, balance_after, meta)
        VALUES (${userId}, 'read', 'tu_vi', ${XP_PER_CHAPTER}, ${newXp}, ${sql.raw(`'${JSON.stringify({ storyId, chapterIndexInt }).replace(/'/g, "''")}'::jsonb`)})`);
      await tx.execute(sql`INSERT INTO reward_ledger (user_id, source, currency, amount, balance_after)
        VALUES (${userId}, ${lv.tangUps + lv.breakthroughs.length > 0 ? 'breakthrough' : 'read'}, 'linh_thach', ${linhDelta}, ${newLinh})`);
      return { breakthroughs: lv.breakthroughs };
    });
  }
}

function mapRow(r: { xp: number; linh_thach: number; tien_ngoc: number; checkin_streak: number; last_checkin_date: string | null }) {
  return { xp: Number(r.xp), linhThach: Number(r.linh_thach), tienNgoc: Number(r.tien_ngoc), checkinStreak: r.checkin_streak, lastCheckinDate: r.last_checkin_date };
}
```
(Note for the implementer: verify the exact `db.transaction` signature against the project's postgres-js drizzle setup; if `transaction` is unavailable on the wrapper, fall back to a single `WITH`/CTE statement or sequential `db.execute` in the documented order. Keep all writes server-side; never accept a client amount.)

- [ ] **Step 4: Add `getGamificationEnabled` to `AppSettingsService`**

In `apps/api/src/modules/app-settings/app-settings.service.ts`, add (mirroring `getAutoCrawl`):
```ts
  async getGamificationEnabled(): Promise<boolean> {
    const s = await this.getOrSeed();
    return s.gamificationEnabled;
  }
```

- [ ] **Step 5: Run the unit test + typecheck**
Run: `pnpm --filter @smanga/api test cultivation.service` → PASS (kill-switch short-circuit). `pnpm --filter @smanga/api typecheck` → clean.

- [ ] **Step 6: Commit**
```powershell
git add apps/api/src/modules/cultivation/cultivation.service.ts apps/api/src/modules/cultivation/cultivation.service.spec.ts apps/api/src/modules/app-settings/app-settings.service.ts
git commit -m "feat(api): CultivationService — getOrCreate + dwell-gated read reward

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Check-in service + `GET /me/cultivation` + `POST /me/checkin`

**Files:**
- Modify: `apps/api/src/modules/cultivation/cultivation.service.ts` (add `getState`, `checkin`)
- Create: `apps/api/src/modules/cultivation/cultivation.controller.ts`
- Create: `apps/api/src/modules/cultivation/cultivation.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `CultivationModule`)
- Create: `apps/api/test/cultivation.controller.e2e-spec.ts`

**Interfaces — Produces:** `GET /me/cultivation` → `{ realm, realmName, tang, ordinal, xp, xpIntoTang, xpForNextTang, isMax, linhThach, tienNgoc, checkinStreak }`; `POST /me/checkin` → `{ credited: boolean, streakDay: number, amount: number, newStreak: number }`.

- [ ] **Step 1: Implement `getState` + `checkin` in the service**

Add to `CultivationService`:
```ts
  async getState(userId: string) {
    const c = await this.getOrCreate(userId);
    const lv = levelFromXp(c.xp);
    return { ...lv, xp: c.xp, linhThach: c.linhThach, tienNgoc: c.tienNgoc, checkinStreak: c.checkinStreak };
  }

  async checkin(userId: string): Promise<{ credited: boolean; streakDay: number; amount: number; newStreak: number }> {
    if (!(await this.settings.getGamificationEnabled())) return { credited: false, streakDay: 0, amount: 0, newStreak: 0 };
    await this.getOrCreate(userId);
    return this.db.transaction(async (tx) => {
      const row = rowsOf<{ last_checkin_date: string | null; checkin_streak: number; linh_thach: number; today: string; yesterday: string }>(await tx.execute(sql`
        SELECT last_checkin_date, checkin_streak, linh_thach,
          to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') AS today,
          to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1, 'YYYY-MM-DD') AS yesterday
        FROM user_cultivation WHERE user_id = ${userId} FOR UPDATE`))[0]!;
      if (row.last_checkin_date === row.today) {
        return { credited: false, streakDay: ((row.checkin_streak - 1) % 7) + 1, amount: 0, newStreak: row.checkin_streak };
      }
      const { newStreak, streakDay, amount } = checkinReward(row.checkin_streak, row.last_checkin_date === row.yesterday);
      const newLinh = Number(row.linh_thach) + amount;
      await tx.execute(sql`UPDATE user_cultivation SET linh_thach = ${newLinh}, checkin_streak = ${newStreak}, last_checkin_date = ${row.today}, updated_at = now() WHERE user_id = ${userId}`);
      await tx.execute(sql`INSERT INTO reward_ledger (user_id, source, currency, amount, balance_after) VALUES (${userId}, 'checkin', 'linh_thach', ${amount}, ${newLinh})`);
      return { credited: true, streakDay, amount, newStreak };
    });
  }
```
Add `checkinReward, levelFromXp` to the `@smanga/shared` import.

- [ ] **Step 2: Controller + module**

`apps/api/src/modules/cultivation/cultivation.controller.ts`:
```ts
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CultivationService } from './cultivation.service';

@ApiTags('cultivation')
@Controller({ path: 'me', version: '1' })
@UseGuards(JwtAuthGuard)
export class CultivationController {
  constructor(private readonly svc: CultivationService) {}

  @Get('cultivation')
  getCultivation(@CurrentUser() u: { id: string }) {
    return this.svc.getState(u.id);
  }

  @Post('checkin')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  checkin(@CurrentUser() u: { id: string }) {
    return this.svc.checkin(u.id);
  }
}
```
`cultivation.module.ts`:
```ts
import { AppSettingsModule } from '@/modules/app-settings/app-settings.module';
import { Module } from '@nestjs/common';
import { CultivationController } from './cultivation.controller';
import { CultivationService } from './cultivation.service';

@Module({
  imports: [AppSettingsModule],
  controllers: [CultivationController],
  providers: [CultivationService],
  exports: [CultivationService],
})
export class CultivationModule {}
```
Ensure `AppSettingsModule` exports `AppSettingsService` (it does). Register `CultivationModule` in `apps/api/src/app.module.ts` imports.

- [ ] **Step 3: Controller-e2e through the global pipe** (the reports-400 lesson — see `apps/api/test/auto-crawl.controller.e2e-spec.ts` for the exact harness: SWC plugin, `ValidationPipe({ whitelist, transform, forbidNonWhitelisted })`, `setGlobalPrefix('api')` + `enableVersioning`, override `JwtAuthGuard`).

Create `apps/api/test/cultivation.controller.e2e-spec.ts` mocking `CultivationService`:
```ts
// mirror auto-crawl.controller.e2e-spec.ts harness exactly
it('GET /api/v1/me/cultivation returns state', async () => {
  service.getState.mockResolvedValue({ realmName: 'Luyện Khí', tang: 1, ordinal: 1, xp: 14000, linhThach: 500, tienNgoc: 20, checkinStreak: 1 });
  await request(app.getHttpServer()).get('/api/v1/me/cultivation').expect(200);
});
it('POST /api/v1/me/checkin returns credit result', async () => {
  service.checkin.mockResolvedValue({ credited: true, streakDay: 1, amount: 1000, newStreak: 1 });
  await request(app.getHttpServer()).post('/api/v1/me/checkin').expect(200);
  expect(service.checkin).toHaveBeenCalled();
});
```

- [ ] **Step 4: Run + typecheck**
Run: `pnpm --filter @smanga/api test cultivation` → PASS. `pnpm --filter @smanga/api typecheck` → clean.

- [ ] **Step 5: Commit**
```powershell
git add apps/api/src/modules/cultivation/cultivation.service.ts apps/api/src/modules/cultivation/cultivation.controller.ts apps/api/src/modules/cultivation/cultivation.module.ts apps/api/src/app.module.ts apps/api/test/cultivation.controller.e2e-spec.ts
git commit -m "feat(api): cultivation endpoints — GET /me/cultivation + POST /me/checkin (auto streak)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Wire the read reward into `addSession`

**Files:**
- Modify: `apps/api/src/modules/user-data/reading-progress.service.ts`
- Modify: `apps/api/src/modules/user-data/user-data.module.ts`
- Modify: `apps/api/src/modules/cultivation/cultivation.module.ts` (already exports `CultivationService`)

**Interfaces — Consumes:** `CultivationService.creditReadingDwell(userId, storyId, chapterIndexInt, addedSeconds)`.

- [ ] **Step 1: Inject + call from `addSession`**

In `reading-progress.service.ts`, inject `CultivationService` and, after the existing `reading_progress` upsert in `addSession`, call the reward (floor the index, fire-and-await inside the same request but tolerate failure so reward bugs never break progress-saving):
```ts
import { CultivationService } from '@/modules/cultivation/cultivation.service';
// constructor: add `private readonly cultivation: CultivationService`
// at the end of addSession, before `return { ok: true }`:
try {
  await this.cultivation.creditReadingDwell(userId, dto.storyId, Math.floor(dto.chapterIndex), dto.seconds);
} catch {
  // reward must never break progress tracking; the kill-switch + ledger are the source of truth
}
return { ok: true };
```

- [ ] **Step 2: Make `CultivationService` injectable into `UserDataModule`**

In `apps/api/src/modules/user-data/user-data.module.ts`, add `imports: [CultivationModule]` (import from `@/modules/cultivation/cultivation.module`). `CultivationModule` already `exports: [CultivationService]`.

- [ ] **Step 3: Verify no circular module dep**

`UserDataModule → CultivationModule → AppSettingsModule`. AppSettingsModule does not import UserDataModule, so no cycle. Run `pnpm --filter @smanga/api typecheck` and `pnpm --filter @smanga/api test` (existing reading-progress/user-data tests still green).

- [ ] **Step 4: Commit**
```powershell
git add apps/api/src/modules/user-data/reading-progress.service.ts apps/api/src/modules/user-data/user-data.module.ts
git commit -m "feat(api): credit cultivation reward from reading-progress session (dwell-gated)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Đột-phá bell notification

**Files:**
- Modify: `apps/api/src/modules/cultivation/cultivation.service.ts` (insert notification on breakthrough)
- Modify: `apps/api/src/modules/comments/notifications.service.ts` (union + query + mapping)
- Modify: `apps/frontend/src/api/notifications.ts` (type), `apps/frontend/src/components/notifications/NotificationItem.tsx` (render case)

**Interfaces — Produces:** a `breakthrough` notification carrying the realm ordinal in the existing `notification.chapter_index` numeric column (no schema change).

- [ ] **Step 1: Insert the notification inside `creditReadingDwell`**

After computing `lv.breakthroughs` (still inside the transaction, before returning), for each breakthrough insert a notification (store realm ordinal in `chapter_index`):
```ts
for (const b of lv.breakthroughs) {
  await tx.execute(sql`INSERT INTO notification (user_id, type, chapter_index)
    VALUES (${userId}, 'breakthrough', ${b.realm})`);
}
```

- [ ] **Step 2: Surface `breakthrough` in the notifications list service**

In `apps/api/src/modules/comments/notifications.service.ts`: add `'breakthrough'` to the `NotificationItem['type']` union; add a `breakthrough: { realmName: string } | null` field; in the SELECT add `,CASE WHEN n.type = 'breakthrough' THEN n.chapter_index::int END AS bt_realm`; in the row type add `bt_realm: number | null`; in the mapping add:
```ts
breakthrough: r.type === 'breakthrough' && r.bt_realm != null
  ? { realmName: REALMS[r.bt_realm] ?? 'Luyện Khí' } : null,
```
Import `REALMS` from `@smanga/shared`. (Add `breakthrough: null` to the other branches of the mapped object so the shape is consistent.)

- [ ] **Step 3: Render it in the bell + extend the frontend type**

In `apps/frontend/src/api/notifications.ts`, add `'breakthrough'` to the `Notification['type']` union and add `breakthrough: { realmName: string } | null`. In `NotificationItem.tsx`, add a branch at the top:
```tsx
if (n.type === 'breakthrough' && n.breakthrough) {
  return (
    <div className={`flex flex-col gap-1 px-4 py-3 ${!n.readAt ? 'bg-accent/5' : ''}`}>
      <p className="text-body-sm text-fg leading-snug flex items-start gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" aria-hidden />
        <span>Chúc mừng! Bạn đã đột phá <span className="font-medium">{n.breakthrough.realmName}</span>.</span>
      </p>
      <p className="text-[11px] text-fg-subtle">{formatRelativeTime(n.createdAt)}</p>
    </div>
  );
}
```
Import `Sparkles` from `lucide-react`.

- [ ] **Step 4: Verify + commit**
Run: `pnpm --filter @smanga/api test notifications` (existing notification tests still green), `pnpm --filter @smanga/api typecheck`, `pnpm --filter @smanga/frontend typecheck`. Then `pnpm exec biome check --write` on the changed frontend files.
```powershell
git add apps/api/src/modules/cultivation/cultivation.service.ts apps/api/src/modules/comments/notifications.service.ts apps/frontend/src/api/notifications.ts apps/frontend/src/components/notifications/NotificationItem.tsx
git commit -m "feat: đột-phá bell notification for cultivation breakthroughs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Frontend — cultivation API client, account card, auto check-in

**Files:**
- Create: `apps/frontend/src/api/cultivation.ts`
- Create: `apps/frontend/src/components/reader/CultivationCard.tsx`
- Create: `apps/frontend/src/hooks/use-daily-checkin.ts`
- Modify: `apps/frontend/src/routes/tai-khoan.tsx` (mount the card), `apps/frontend/src/routes/__root.tsx` (auto check-in on load)

**Interfaces — Consumes:** `GET /me/cultivation`, `POST /me/checkin`; `@smanga/shared` `REALMS` for display.

- [ ] **Step 1: API client**

Create `apps/frontend/src/api/cultivation.ts`:
```ts
import { api } from '@/lib/api-client';

export interface Cultivation {
  realm: number; realmName: string; tang: number; ordinal: number; isMax: boolean;
  xp: number; xpIntoTang: number; xpForNextTang: number;
  linhThach: number; tienNgoc: number; checkinStreak: number;
}
export interface CheckinResult { credited: boolean; streakDay: number; amount: number; newStreak: number }

export const cultivationApi = {
  get: () => api.get<Cultivation>('/me/cultivation').then((r) => r.data),
  checkin: () => api.post<CheckinResult>('/me/checkin').then((r) => r.data),
};
```

- [ ] **Step 2: Account card** (model spacing/markup on the existing `ReadingStatsCard` + the `Card` in `tai-khoan.tsx`)

Create `apps/frontend/src/components/reader/CultivationCard.tsx`: a `useQuery(['me','cultivation'], cultivationApi.get)` card showing: cảnh giới + tầng (e.g. "Trúc Cơ · Tầng 3"), a tu-vi progress bar (`xpIntoTang / xpForNextTang`, or "Viên mãn" when `isMax`), **Linh thạch** + **Tiên ngọc** balances (formatted with `toLocaleString('vi-VN')`), and the 7-day check-in streak (highlight day `((checkinStreak-1)%7)+1`). Render nothing (or a hidden state) on 404/disabled. Use the existing token classes (`bg-bg-elevated`, `border-border`, `text-fg`, `text-accent`).

- [ ] **Step 3: Auto check-in hook + inline banner**

Create `apps/frontend/src/hooks/use-daily-checkin.ts`: on mount (once per app load, for a logged-in user), call `cultivationApi.checkin()`; if `credited`, expose the result for a transient banner. Model the transient UI on the **existing `useInlineToast` pattern in `apps/frontend/src/components/engagement/RatingControl.tsx`** (no new dependency). Wire it in `__root.tsx` so a credited check-in shows "Điểm danh ngày {streakDay}: +{amount} linh thạch" briefly, and invalidates `['me','cultivation']`. Guard: only fire when `useAuthStore` has a user.

- [ ] **Step 4: Mount the card**

In `apps/frontend/src/routes/tai-khoan.tsx`, render `<CultivationCard />` directly above `<ReadingStatsCard />` (import it). 

- [ ] **Step 5: Typecheck + build + lint + commit**
Run: `pnpm --filter @smanga/frontend typecheck` → clean; `pnpm --filter @smanga/frontend build` → succeeds; `pnpm exec biome check --write` on the new/changed frontend files.
```powershell
git add apps/frontend/src/api/cultivation.ts apps/frontend/src/components/reader/CultivationCard.tsx apps/frontend/src/hooks/use-daily-checkin.ts apps/frontend/src/routes/tai-khoan.tsx apps/frontend/src/routes/__root.tsx
git commit -m "feat(frontend): cultivation card + auto daily check-in on /tai-khoan

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Full-suite gate + manual proof (push gated on user)

**Files:** none (verification).

- [ ] **Step 1: Whole-repo gate**
```powershell
$env:DATABASE_URL="postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm test
pnpm -r typecheck
```
Expected: all suites green (existing ~203 + the new shared cultivation, api cultivation service + e2e, notification tests) and typecheck clean. The db migration applies on the PG17 testcontainer.

- [ ] **Step 2: Local live proof** (API on `PORT=3010`, frontend on 3000, admin `pwadmin@test.com`)
  - Flip `app_setting.gamification_enabled = true` (admin DB or a temporary SQL update).
  - Open a chapter, stay ≥30s → `GET /me/cultivation` shows +1,000 tu vi / +500 linh thạch; re-opening the same chapter adds nothing; a <30s visit adds nothing.
  - Reload the app → check-in banner credits the streak-day linh thạch once; a second reload same day does not.
  - Playwright screenshot of the `/tai-khoan` cultivation card (per the project's "proof before push" rule).

- [ ] **Step 3: `graphify update .`** (code changed).

- [ ] **Step 4: Push (only after explicit user instruction)** — then watch CI (gated image build), confirm Watchtower deploy, and that prod stays healthy. **`gamification_enabled` stays OFF in prod until the operator flips it.**

---

## Self-Review

**Spec coverage:** 3 resources (tu vi/linh thạch/tiên ngọc) → Task 2 schema + Task 1 constants ✓; 81-level curve 14000×1.7^r → Task 1 ✓; reading reward once-per-chapter, dwell ≥30s, no cap → Task 3 + Task 5 ✓; auto 7-day check-in streak → Task 4 + Task 7 ✓; tầng/đột-phá rewards → Task 1 `levelUpRewards` + Task 3 ✓; tiên ngọc paid-only + welcome 20 → Task 3 `getOrCreate` ✓; kill-switch → Task 2 column + Task 3/4 guard ✓; server-authoritative + ledger → Task 3/4 ✓; account-page display → Task 7 ✓; đột-phá notification → Task 6 ✓.

**Flagged spec deviations (confirm on review):** (1) The spec's *live "toast on tầng-up / on reading"* is reduced to: đột-phá → **bell notification** (Task 6) + the account card reflects tầng/realm; **check-in → inline banner** (Task 7). Reason: the session-reward path returns 204 (no body to drive a live reading toast) and the app has no global toast shell — surfacing via the bell + card + check-in banner uses existing patterns and avoids building a toast system. If you want a live "+tu vi / đột phá" toast on the reader page, that's a small add-on task (poll `GET /me/cultivation` + diff level). (2) `getState`/reward use raw `db.execute`/`transaction` (the repo's multi-write pattern) rather than the Drizzle query builder, to keep the transactional reward atomic.

**Placeholder scan:** none — full code for schema, curve, reward, check-in, notification reuse, and client; exact files/patterns (e2e harness, inline-toast, ReadingStatsCard) named for the mechanical parts. The `00NN` migration name is drizzle-kit-assigned; the exact SQL to verify is stated.

**Type consistency:** `creditReadingDwell(userId, storyId, chapterIndexInt, addedSeconds)` matches between Task 3 (def), Task 5 (call), and the spec; `levelUpRewards`/`levelFromXp`/`checkinReward` signatures match Task 1 ↔ Tasks 3/4; the cultivation read shape (`realm/realmName/tang/ordinal/xp/xpIntoTang/xpForNextTang/isMax/linhThach/tienNgoc/checkinStreak`) is identical across Task 4 (`getState`), Task 4 e2e, and Task 7 (`Cultivation` client type); `breakthrough` notification field name matches Task 6 backend ↔ frontend.
