import { api } from '@/lib/api-client';

export interface Cultivation {
  realm: number;
  realmName: string;
  tang: number;
  ordinal: number;
  isMax: boolean;
  xp: number;
  xpIntoTang: number;
  xpForNextTang: number;
  linhThach: number;
  tienNgoc: number;
  checkinStreak: number;
}

export interface CheckinResult {
  credited: boolean;
  streakDay: number;
  amount: number;
  newStreak: number;
}

export const cultivationApi = {
  get: () => api.get<Cultivation>('/me/cultivation').then((r) => r.data),
  checkin: () => api.post<CheckinResult>('/me/checkin').then((r) => r.data),
};
