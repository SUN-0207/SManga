import { AppSettingsService } from '@/modules/app-settings/app-settings.service';
import { DRIZZLE } from '@/modules/db/db.provider';
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@smanga/db';
import {
  LINH_THACH_PER_CHAPTER,
  READ_DWELL_MIN_SECONDS,
  WELCOME_TIEN_NGOC,
  XP_PER_CHAPTER,
  checkinReward,
  levelFromXp,
  levelUpRewards,
} from '@smanga/shared';
import { sql } from 'drizzle-orm';

// Minimal shape of the transaction object expose by drizzle postgres-js.
type TxClient = { execute: Database['execute'] };

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

type CultivationRow = {
  xp: number;
  linh_thach: number;
  tien_ngoc: number;
  checkin_streak: number;
  last_checkin_date: string | null;
};

export interface CultivationState {
  xp: number;
  linhThach: number;
  tienNgoc: number;
  checkinStreak: number;
  lastCheckinDate: string | null;
}

function mapRow(r: CultivationRow): CultivationState {
  return {
    xp: Number(r.xp),
    linhThach: Number(r.linh_thach),
    tienNgoc: Number(r.tien_ngoc),
    checkinStreak: r.checkin_streak,
    lastCheckinDate: r.last_checkin_date,
  };
}

@Injectable()
export class CultivationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly settings: AppSettingsService,
  ) {}

  async getOrCreate(userId: string): Promise<CultivationState> {
    const existing = rowsOf<CultivationRow>(
      await this.db.execute(
        sql`SELECT xp, linh_thach, tien_ngoc, checkin_streak, last_checkin_date
            FROM user_cultivation WHERE user_id = ${userId} LIMIT 1`,
      ),
    );
    if (existing[0]) return mapRow(existing[0]);

    // Create + welcome grant + ledger, idempotent on the PK via ON CONFLICT DO NOTHING.
    await this.db.transaction(async (tx) => {
      const ins = rowsOf<{ tien_ngoc: number }>(
        await (tx as TxClient).execute(sql`
          INSERT INTO user_cultivation (user_id, tien_ngoc)
          VALUES (${userId}, ${WELCOME_TIEN_NGOC})
          ON CONFLICT (user_id) DO NOTHING
          RETURNING tien_ngoc`),
      );
      if (ins[0]) {
        await (tx as TxClient).execute(sql`
          INSERT INTO reward_ledger (user_id, source, currency, amount, balance_after)
          VALUES (${userId}, 'welcome', 'tien_ngoc', ${WELCOME_TIEN_NGOC}, ${WELCOME_TIEN_NGOC})`);
      }
    });

    const row = rowsOf<CultivationRow>(
      await this.db.execute(
        sql`SELECT xp, linh_thach, tien_ngoc, checkin_streak, last_checkin_date
            FROM user_cultivation WHERE user_id = ${userId} LIMIT 1`,
      ),
    );
    return mapRow(row[0]!);
  }

  async creditReadingDwell(
    userId: string,
    storyId: string,
    chapterIndexInt: number,
    addedSeconds: number,
  ): Promise<{ breakthroughs: { realm: number; realmName: string }[] }> {
    if (!(await this.settings.getGamificationEnabled())) return { breakthroughs: [] };

    await this.getOrCreate(userId);

    return this.db.transaction(async (tx) => {
      const txExec = (tx as TxClient).execute.bind(tx);

      // Accumulate dwell; upsert the award row (lock via DO UPDATE).
      const award = rowsOf<{ dwell_seconds: number; rewarded_at: string | null }>(
        await txExec(sql`
          INSERT INTO chapter_read_award (user_id, story_id, chapter_index_int, dwell_seconds)
          VALUES (${userId}, ${storyId}, ${chapterIndexInt}, ${addedSeconds})
          ON CONFLICT (user_id, story_id, chapter_index_int)
          DO UPDATE SET dwell_seconds = chapter_read_award.dwell_seconds + ${addedSeconds}
          RETURNING dwell_seconds, rewarded_at`),
      );

      const row = award[0]!;
      if (row.rewarded_at || row.dwell_seconds < READ_DWELL_MIN_SECONDS) {
        return { breakthroughs: [] };
      }

      // Mark rewarded — guarded WHERE rewarded_at IS NULL stays idempotent under concurrency.
      const marked = rowsOf<{ user_id: string }>(
        await txExec(sql`
          UPDATE chapter_read_award
          SET rewarded_at = now()
          WHERE user_id = ${userId}
            AND story_id = ${storyId}
            AND chapter_index_int = ${chapterIndexInt}
            AND rewarded_at IS NULL
          RETURNING user_id`),
      );
      if (marked.length === 0) return { breakthroughs: [] };

      // Fetch and lock the cultivation row to compute new balances.
      const cur = rowsOf<{ xp: number; linh_thach: number }>(
        await txExec(
          sql`SELECT xp, linh_thach FROM user_cultivation WHERE user_id = ${userId} FOR UPDATE`,
        ),
      )[0]!;

      const oldXp = Number(cur.xp);
      const newXp = oldXp + XP_PER_CHAPTER;
      const lv = levelUpRewards(oldXp, newXp);
      const linhDelta = LINH_THACH_PER_CHAPTER + lv.linhThach;
      const newLinh = Number(cur.linh_thach) + linhDelta;

      await txExec(sql`
        UPDATE user_cultivation
        SET xp = ${newXp}, linh_thach = ${newLinh}, updated_at = now()
        WHERE user_id = ${userId}`);

      const metaJson = JSON.stringify({ storyId, chapterIndexInt });
      await txExec(sql`
        INSERT INTO reward_ledger (user_id, source, currency, amount, balance_after, meta)
        VALUES (${userId}, 'read', 'tu_vi', ${XP_PER_CHAPTER}, ${newXp}, ${metaJson}::jsonb)`);

      await txExec(sql`
        INSERT INTO reward_ledger (user_id, source, currency, amount, balance_after)
        VALUES (
          ${userId},
          ${lv.tangUps + lv.breakthroughs.length > 0 ? 'breakthrough' : 'read'},
          'linh_thach',
          ${linhDelta},
          ${newLinh}
        )`);

      for (const b of lv.breakthroughs) {
        await txExec(sql`INSERT INTO notification (user_id, type, chapter_index)
          VALUES (${userId}, 'breakthrough', ${b.realm})`);
      }

      return { breakthroughs: lv.breakthroughs };
    }) as Promise<{ breakthroughs: { realm: number; realmName: string }[] }>;
  }

  async getState(userId: string): Promise<
    | ({
        xp: number;
        linhThach: number;
        tienNgoc: number;
        checkinStreak: number;
      } & ReturnType<typeof levelFromXp>)
    | null
  > {
    if (!(await this.settings.getGamificationEnabled())) return null;
    const c = await this.getOrCreate(userId);
    const lv = levelFromXp(c.xp);
    return {
      ...lv,
      xp: c.xp,
      linhThach: c.linhThach,
      tienNgoc: c.tienNgoc,
      checkinStreak: c.checkinStreak,
    };
  }

  async checkin(
    userId: string,
  ): Promise<{ credited: boolean; streakDay: number; amount: number; newStreak: number }> {
    if (!(await this.settings.getGamificationEnabled()))
      return { credited: false, streakDay: 0, amount: 0, newStreak: 0 };
    await this.getOrCreate(userId);
    return this.db.transaction(async (tx) => {
      const row = rowsOf<{
        last_checkin_date: string | null;
        checkin_streak: number;
        linh_thach: number;
        today: string;
        yesterday: string;
      }>(
        await (tx as TxClient).execute(sql`
        SELECT last_checkin_date, checkin_streak, linh_thach,
          to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') AS today,
          to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1, 'YYYY-MM-DD') AS yesterday
        FROM user_cultivation WHERE user_id = ${userId} FOR UPDATE`),
      )[0]!;
      if (row.last_checkin_date === row.today) {
        return {
          credited: false,
          streakDay: ((row.checkin_streak - 1) % 7) + 1,
          amount: 0,
          newStreak: row.checkin_streak,
        };
      }
      const { newStreak, streakDay, amount } = checkinReward(
        row.checkin_streak,
        row.last_checkin_date === row.yesterday,
      );
      const newLinh = Number(row.linh_thach) + amount;
      await (tx as TxClient).execute(
        sql`UPDATE user_cultivation SET linh_thach = ${newLinh}, checkin_streak = ${newStreak}, last_checkin_date = ${row.today}, updated_at = now() WHERE user_id = ${userId}`,
      );
      await (tx as TxClient).execute(
        sql`INSERT INTO reward_ledger (user_id, source, currency, amount, balance_after) VALUES (${userId}, 'checkin', 'linh_thach', ${amount}, ${newLinh})`,
      );
      return { credited: true, streakDay, amount, newStreak };
    }) as Promise<{ credited: boolean; streakDay: number; amount: number; newStreak: number }>;
  }
}
