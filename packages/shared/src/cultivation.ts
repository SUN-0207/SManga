/** Tu-tiên cultivation curve + economy constants. Pure — shared by api (credit)
 * and frontend (display). Display numbers are the ×100 values (ratios unchanged). */
export const REALMS = [
  'Luyện Khí',
  'Trúc Cơ',
  'Kết Đan',
  'Nguyên Anh',
  'Hóa Thần',
  'Luyện Hư',
  'Hợp Thể',
  'Đại Thừa',
  'Độ Kiếp',
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

// Cost to advance ordinal k → k+1 (k = 0..80) = the per-tầng rate of the realm
// being ENTERED, floor(k/9). The đột-phá step into a new realm's tầng 1 costs
// that new realm's rate — realm transitions are NOT free. Total to max =
// 9 × Σ xpPerTang(r) = 21,165,858.
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
      realm: -1,
      realmName: 'Phàm Nhân',
      tang: 0,
      ordinal: 0,
      xpIntoTang: xp,
      xpForNextTang: THRESHOLDS[1]!,
      isMax: false,
    };
  }
  const realm = Math.floor((ordinal - 1) / TANG_PER_REALM);
  const tang = ((ordinal - 1) % TANG_PER_REALM) + 1;
  const isMax = ordinal >= MAX_ORDINAL;
  return {
    realm,
    realmName: REALMS[realm]!,
    tang,
    ordinal,
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

export interface CheckinReward {
  newStreak: number;
  streakDay: number;
  amount: number;
}

/** `continued` = the user checked in yesterday (VN). Caller guarantees they have
 * not already checked in today. */
export function checkinReward(prevStreak: number, continued: boolean): CheckinReward {
  const newStreak = continued ? prevStreak + 1 : 1;
  const streakDay = ((newStreak - 1) % 7) + 1;
  return { newStreak, streakDay, amount: CHECKIN_LINH_THACH[streakDay - 1]! };
}
