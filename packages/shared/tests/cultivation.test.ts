import { describe, expect, it } from 'vitest';
import {
  BREAKTHROUGH_LINH_THACH,
  CHECKIN_LINH_THACH,
  REALMS,
  TANG_UP_LINH_THACH,
  XP_PER_CHAPTER,
  checkinReward,
  levelFromXp,
  levelUpRewards,
  xpPerTang,
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
  it('Luyện Khí tầng 9 is reached at 9×14000 = 126000', () => {
    const l = levelFromXp(9 * 14000); // 126000
    expect(l.realmName).toBe('Luyện Khí');
    expect(l.tang).toBe(9);
    expect(l.ordinal).toBe(9);
    expect(l.xpForNextTang).toBe(23800); // đột phá into Trúc Cơ costs the new realm's rate
  });
  it('đột phá into Trúc Cơ tầng 1 at 126000 + 23800 = 149800', () => {
    const l = levelFromXp(126000 + 23800); // 149800
    expect(l.realmName).toBe('Trúc Cơ');
    expect(l.tang).toBe(1);
    expect(l.ordinal).toBe(10);
    expect(l.xpIntoTang).toBe(0);
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
    expect(checkinReward(0, false)).toEqual({
      newStreak: 1,
      streakDay: 1,
      amount: CHECKIN_LINH_THACH[0],
    });
  });
  it('continued streak increments and escalates to the day-7 jackpot', () => {
    expect(checkinReward(6, true)).toEqual({ newStreak: 7, streakDay: 7, amount: 10000 });
  });
  it('day 8 loops back to day-1 amount but streak keeps counting', () => {
    expect(checkinReward(7, true)).toEqual({
      newStreak: 8,
      streakDay: 1,
      amount: CHECKIN_LINH_THACH[0],
    });
  });
  it('a missed day resets the streak to 1', () => {
    expect(checkinReward(5, false)).toEqual({
      newStreak: 1,
      streakDay: 1,
      amount: CHECKIN_LINH_THACH[0],
    });
  });
});
