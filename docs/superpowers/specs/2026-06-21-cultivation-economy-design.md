# Cultivation & Economy ("Tu luyện") — Design Spec

> **Status:** APPROVED 2026-06-21 — ready for an implementation plan.
> **Origin:** product idea to gamify reading on SManga with a Vietnamese xianxia ("tu tiên") progression + economy, to drive daily retention and reading volume.

## Problem

SManga rewards reading with nothing. Readers have no progression, no daily-return hook, and no reason to come back beyond new chapters. For a Vietnamese web-novel audience steeped in cultivation tropes, a **tu luyện** (cultivation) progression + a soft economy is a natural, on-theme engagement loop.

## Goal

Give every logged-in reader a cultivation identity that grows by reading, a daily check-in habit loop, and an earned soft currency to spend later — **without** trusting the client, without enabling farming, and fitting the existing single-laptop NestJS + Postgres + Vite/React stack. **v1 earns & holds; spending (shop) is a separate future spec.**

## Decisions (locked, from brainstorming)

- **Three resources:**
  - **Tu vi (XP)** — earned *only* by reading; drives cultivation level. Not spendable.
  - **Linh thạch** (soft currency) — earned by reading + daily check-in + level-ups; spent in a future shop.
  - **Tiên ngọc** (premium currency) — **purely paid** (future top-up / nạp tiền). v1 = wallet exists + displays, **no in-app earn path**, with a one-time welcome grant (default **20**, tunable) so the wallet is not dead. NOT scaled (see below).
- **Cultivation ladder:** 9 cảnh giới × 9 tầng = **81 levels** above the mortal start. Phàm Nhân → Luyện Khí → Trúc Cơ → Kết Đan → Nguyên Anh → Hóa Thần → Luyện Hư → Hợp Thể → Đại Thừa → Độ Kiếp. Crossing into a new cảnh giới = "đột phá" (a big milestone reward + notification).
- **Reading reward unit:** per *new* chapter, rewarded **once per `(user, story, chapterIndex)`** (re-reads pay nothing), under a **daily cap** to stop click-through farming.
- **Daily check-in:** **automatic** on the first authenticated activity of the day (Asia/Ho_Chi_Minh), escalating 7-day streak that resets on a missed day; credits Linh thạch only.
- **Display-scale ×100:** all **Tu vi + Linh thạch** numbers are multiplied by 100 vs the original balance purely for "wow" — ratios (chapters/level, linh thạch/item) are identical, so the economy is unchanged. **Tiên ngọc is NOT scaled** (premium, maps to real money — kept at gem-like tens/hundreds).
- **Server-authoritative + kill-switch:** every credit is computed server-side in a transaction; a `app_setting.gamification_enabled` flag (default OFF until launch) gates the whole system.
- **Scope = earn + level + wallet + display.** OUT of v1 (separate future specs): the item shop / spending, user-to-user "mua bán" marketplace, the tiên-ngọc top-up/payment flow, and any cultivator leaderboard.

## Architecture

A new `cultivation` module in `apps/api` owns the economy. Rewards are credited **synchronously inside the existing per-user write paths** (no Bull queue, no cron) so progression feels immediate and stays consistent in one DB transaction:

- **Reading reward** hooks the existing `PUT /me/reading-progress { storyId, chapterIndex }` (authed, fires when a reader advances to a chapter). The `upsert` path additionally runs the reward logic.
- **Daily check-in** runs via a new idempotent `POST /me/checkin`, which the reader app fires once on load; the server credits at most once per VN-day.
- **Reads** are served by `GET /me/cultivation` (current realm/tier, tu vi progress, balances, check-in streak) for the profile UI.

All amounts/curves live as named constants in the module (tunable), gated by the `gamification_enabled` flag.

## Data model (new Drizzle schema: `packages/db/src/schema/cultivation.ts`)

Add the file to `drizzle.config.ts`'s explicit array **and** the `schema/index.ts` barrel (it is a NEW schema file). Internal cross-schema imports use `.ts`.

- **`user_cultivation`** (one row per user; PK `user_id` → `user.id` ON DELETE CASCADE):
  - `xp` **bigint** notNull default 0 — lifetime tu vi (drives level).
  - `linh_thach` **bigint** notNull default 0 — soft balance.
  - `tien_ngoc` **bigint** notNull default 0 — premium balance.
  - `checkin_streak` integer notNull default 0 — current consecutive check-in days (0 = never).
  - `last_checkin_date` date (nullable) — last VN-date credited.
  - `created_at`, `updated_at` timestamptz.
  - (Level/realm/tier are **derived** from `xp` — not stored, computed by a pure function — to avoid drift. A future read-model cache is out of scope.)
- **`chapter_read_award`** (idempotency ledger; PK `(user_id, story_id, chapter_index_int)`):
  - `user_id` (→ cascade), `story_id` uuid, `chapter_index_int` integer (floored chapter index), `created_at` timestamptz default now.
  - Index on `(user_id, created_at)` to count "today's rewarded chapters" for the daily cap.
- **`reward_ledger`** (append-only audit/history; `id` uuid pk):
  - `user_id` (→ cascade), `source` text enum-like (`read` | `checkin` | `tang` | `breakthrough` | `welcome`), `currency` (`tu_vi` | `linh_thach` | `tien_ngoc`), `amount` bigint, `balance_after` bigint, `meta` jsonb (e.g. `{storyId, chapterIndex}` or `{realm, tang}`), `created_at` timestamptz default now. Index `(user_id, created_at desc)`.

Migration generated via `pnpm --filter @smanga/db generate`; verified on the PG17 testcontainer.

## Cultivation curve (the 81-level ladder)

Realms `r = 0..8`: Luyện Khí, Trúc Cơ, Kết Đan, Nguyên Anh, Hóa Thần, Luyện Hư, Hợp Thể, Đại Thừa, Độ Kiếp. Each has tầng `1..9`.

- **Tu vi to advance one tầng inside realm `r`** = `round(10_000 × 1.6^r)`:

  | Realm | r | Tu vi / tầng |
  |---|---|---|
  | Luyện Khí | 0 | 10,000 |
  | Trúc Cơ | 1 | 16,000 |
  | Kết Đan | 2 | 25,600 |
  | Nguyên Anh | 3 | 40,960 |
  | Hóa Thần | 4 | 65,536 |
  | Luyện Hư | 5 | 104,858 |
  | Hợp Thể | 6 | 167,772 |
  | Đại Thừa | 7 | 268,435 |
  | Độ Kiếp | 8 | 429,497 |

- **Start state = Phàm Nhân** (xp 0). The first 10,000 tu vi đột-phá into **Luyện Khí tầng 1**. Total tu vi to reach **Độ Kiếp tầng 9** (cap) ≈ `9 × 10_000 × (1.6^9−1)/0.6` ≈ **10,157,850** (~10.16M).
- **Pace check:** ~20 new chapters/day × +1,000 tu vi = 20,000 tu vi/day → Luyện Khí (90k total) in ~4–5 days; full cap ≈ ~1.4 years. Early realms fast (satisfying), late realms long-tail.
- **Level mapping** is a pure function `levelFromXp(xp) → { realm: 0..8 | 'phàm nhân', tang: 1..9, xpIntoTang, xpForThisTang, totalLevelOrdinal }`, with the inverse threshold table precomputed. Phàm Nhân is the pre-Luyện-Khí state (xp < 10,000).

## Earning rules (display-scaled ×100)

- **Reading** — on `PUT /me/reading-progress` advancing to a chapter whose floored index has no `chapter_read_award` row for this `(user, story)`:
  - Insert the ledger row `ON CONFLICT DO NOTHING`. If newly inserted **and** the user's rewarded-chapter count today `< DAILY_READ_CAP (50)`:
    - credit **+1,000 tu vi** and **+500 linh thạch**; recompute level; if the new level crossed one or more tầng/cảnh-giới boundaries, also credit the level-up rewards below + emit notification(s).
  - Re-reads, or reads beyond the daily cap, insert no reward (progress still saves as today). All in one transaction.
- **Daily check-in** — on `POST /me/checkin`, if `last_checkin_date < today(VN)`:
  - `checkin_streak` = (`last_checkin_date == yesterday(VN)` ? `streak+1` : `1`); the **streak day used for the reward** is `((streak − 1) mod 7) + 1`.
  - Credit Linh thạch by streak-day: **1,000 / 1,500 / 2,000 / 2,500 / 3,000 / 4,000 / 10,000** (day 1→7, then loops). Set `last_checkin_date = today`. Idempotent: a second call same day is a no-op. Check-in gives **no tu vi**.
- **Level-up rewards** (Linh thạch), credited when reading pushes the level past a boundary:
  - **Tầng-up** (any of the 8 tầng steps within a realm): **+2,000 linh thạch** each.
  - **Đột phá** (entering a new cảnh giới — the 9 realm transitions, including Phàm Nhân→Luyện Khí): escalating **10,000 / 20,000 / 40,000 / 80,000 / 150,000 / 300,000 / 600,000 / 1,200,000 / 2,500,000** linh thạch, plus a notification ("Đã đột phá **Trúc Cơ**!") via the existing notification system.
- **Welcome grant** — on first `user_cultivation` row creation: **+20 tiên ngọc** (one-time; `reward_ledger` source `welcome`). No other tiên-ngọc earn path in v1.

A single read that crosses multiple boundaries (e.g. a large `chapterIndex` jump) credits each crossed tầng/đột phá once, in order.

## Daily check-in semantics

"Đăng nhập mỗi ngày" = the first authenticated activity of the VN day, not a literal login (users persist via JWT cookie). The client auto-calls `POST /me/checkin` on app mount; the server is the source of truth and idempotent per VN-date (same tz as the existing `computeStreak`). The profile shows the 7-day streak calendar **read-only** (no manual button). A toast surfaces the credit ("Điểm danh ngày 3: +2,000 linh thạch").

## Anti-abuse

- **Once per chapter** via the `chapter_read_award` unique PK — re-reading never re-pays.
- **Daily read cap** (50 rewarded chapters/user/day) bounds click-through farming.
- **Server-authoritative**: the client never sends amounts; all credits are computed and written server-side in a transaction. Endpoints keep the existing throttler.
- **Idempotent check-in** per VN-date.
- *(Deferred to v2 if needed:)* a minimum dwell-time gate (using the existing `sessionSeconds` tracker) before a chapter counts.

## Surface / UI (v1)

- **`/tai-khoan` (account page):** cultivation card — current **cảnh giới + tầng**, a tu-vi progress bar to the next tầng, **Linh thạch** + **Tiên ngọc** balances, and the 7-day check-in streak calendar (read-only).
- **Toasts** on check-in credit, tầng-up, and đột phá; đột phá also drops a notification in the existing bell.
- *(Optional v1, else v2:)* a compact cảnh-giới badge + Linh-thạch balance in the header.
- New API client functions in `apps/frontend/src/api/` for `GET /me/cultivation` and `POST /me/checkin`.

## Testing / Verification

- **Unit (pure):** `levelFromXp` boundaries (Phàm Nhân↔Luyện Khí at 10,000; tầng 9→next realm; cap at Độ Kiếp tầng 9; xpIntoTang math); the đột-phá-vs-tầng reward selector; check-in streak transitions (consecutive +1, missed-day reset to 1, day-7 jackpot, loop to day-1); daily-cap counting.
- **Service/integration:** "đọc lại không cộng lần 2" (idempotency ledger); a single big-jump read crediting multiple boundaries once each; cap blocks the 51st chapter same day; `gamification_enabled = false` → no credits anywhere.
- **Controller-e2e through the global ValidationPipe** (the reports-400 lesson) for `POST /me/checkin` and the reading-progress reward path.
- DB migration applies cleanly on the PG17 testcontainer (0000…new).

## Boundaries

- **Always:** commit only the files each task lists (explicit `git add`); never stage `apps/frontend/vite.config.ts`; commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; English-only identifiers/filenames (Vietnamese only in JSX copy + the domain term constants like cảnh-giới names); do NOT push without explicit instruction. New schema file → add to `drizzle.config.ts` array AND `schema/index.ts` barrel; generate migrations with drizzle-kit (never hand-write SQL); migrations run idempotently on api boot.
- **Ask first:** any change to the shop/spending model, the tiên-ngọc top-up flow, the marketplace, or a leaderboard (all separate future specs); changing the locked curve/numbers; touching prod compose/Caddy.
- **Never:** trust client-supplied amounts; award tiên ngọc through gameplay in v1; re-pay a chapter; weaken the daily cap or the kill-switch.

## Acceptance criteria

1. A logged-in reader who advances to a new chapter (under the daily cap) gains +1,000 tu vi and +500 linh thạch exactly once for that chapter; re-reading it adds nothing; the 51st rewarded chapter in a VN-day adds nothing.
2. Crossing a tầng adds +2,000 linh thạch; crossing into a new cảnh giới adds the escalating đột-phá reward + a notification; `levelFromXp` maps xp to the correct cảnh giới/tầng with displayed numbers ×100.
3. The first authenticated activity of a VN-day auto-credits the correct streak-day linh thạch; a second activity same day adds nothing; a missed day resets the streak to day 1; day 7 pays 10,000 then loops.
4. New users receive a one-time 20 tiên ngọc welcome grant; tiên ngọc has no other earn path in v1; its balance displays in the wallet.
5. Every credit is server-computed and recorded in `reward_ledger`; `gamification_enabled = false` disables all credits; the migration applies cleanly on PG17.
6. The account page shows cảnh giới + tầng, tu-vi progress, both balances, and the read-only 7-day streak; check-in and level-up surface toasts. No spending/shop/marketplace/top-up is built.
